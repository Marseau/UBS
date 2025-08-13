-- Migration: Implementação do Modelo de Cobrança por Conversa
-- Data: 26/07/2024
-- Descrição: Migra de maxMessages/maxNumbers para maxConversations e cria sistema de billing

-- 1. Atualizar tabela tenants para novo modelo
ALTER TABLE tenants 
DROP COLUMN IF EXISTS max_messages,
DROP COLUMN IF EXISTS max_numbers,
ADD COLUMN IF NOT EXISTS conversation_plan VARCHAR(20) DEFAULT 'basico',
ADD COLUMN IF NOT EXISTS max_conversations INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255);

-- 2. Criar tabela conversation_billing para tracking mensal
CREATE TABLE IF NOT EXISTS conversation_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    conversations_included INTEGER NOT NULL,    -- Limite do plano (200, 400, 1250)
    conversations_used INTEGER DEFAULT 0,       -- Conversas utilizadas no período
    conversations_overage INTEGER DEFAULT 0,    -- Excedentes cobrados
    base_amount_brl DECIMAL(10,2) NOT NULL,     -- Valor base do plano (R$ 58, 116, 290)
    overage_amount_brl DECIMAL(10,2) DEFAULT 0, -- Valor dos excedentes
    total_amount_brl DECIMAL(10,2) NOT NULL,    -- Total da fatura
    stripe_usage_record_id VARCHAR(255),        -- ID do usage record no Stripe
    processed_at TIMESTAMP,                     -- Quando foi processado
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraint para evitar duplicatas
    UNIQUE(tenant_id, billing_period_start)
);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_conversation_billing_tenant_period 
ON conversation_billing(tenant_id, billing_period_start);

CREATE INDEX IF NOT EXISTS idx_conversation_billing_processed 
ON conversation_billing(processed_at) WHERE processed_at IS NOT NULL;

-- 4. Atualizar tenants existentes para o novo modelo
UPDATE tenants 
SET 
    conversation_plan = CASE 
        WHEN subscription_plan = 'starter' THEN 'basico'
        WHEN subscription_plan = 'professional' THEN 'profissional'  
        WHEN subscription_plan = 'enterprise' THEN 'enterprise'
        ELSE 'basico'
    END,
    max_conversations = CASE
        WHEN subscription_plan = 'starter' THEN 200
        WHEN subscription_plan = 'professional' THEN 400
        WHEN subscription_plan = 'enterprise' THEN 1250
        ELSE 200
    END,
    updated_at = NOW()
WHERE conversation_plan IS NULL;

-- 5. Criar função para contar conversas mensais por tenant
CREATE OR REPLACE FUNCTION count_monthly_conversations(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    conversation_count INTEGER;
    period_start DATE;
    period_end DATE;
BEGIN
    -- Se não fornecidas as datas, usar mês atual
    IF p_start_date IS NULL THEN
        period_start := DATE_TRUNC('month', CURRENT_DATE);
    ELSE
        period_start := p_start_date;
    END IF;
    
    IF p_end_date IS NULL THEN
        period_end := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day';
    ELSE
        period_end := p_end_date;
    END IF;
    
    -- Contar conversas recebidas (is_from_user = true) no período
    SELECT COUNT(*)
    INTO conversation_count
    FROM conversation_history 
    WHERE tenant_id = p_tenant_id
      AND is_from_user = true
      AND created_at >= period_start
      AND created_at <= (period_end + INTERVAL '23 hours 59 minutes 59 seconds');
    
    RETURN COALESCE(conversation_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 6. Criar função para calcular billing mensal
CREATE OR REPLACE FUNCTION calculate_monthly_billing(
    p_tenant_id UUID,
    p_billing_month DATE DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    tenant_record RECORD;
    billing_month DATE;
    period_start DATE;
    period_end DATE;
    conversations_used INTEGER;
    conversations_included INTEGER;
    conversations_overage INTEGER;
    base_amount DECIMAL(10,2);
    overage_amount DECIMAL(10,2);
    total_amount DECIMAL(10,2);
    result JSON;
BEGIN
    -- Definir período de billing
    IF p_billing_month IS NULL THEN
        billing_month := DATE_TRUNC('month', CURRENT_DATE);
    ELSE
        billing_month := DATE_TRUNC('month', p_billing_month);
    END IF;
    
    period_start := billing_month;
    period_end := billing_month + INTERVAL '1 month' - INTERVAL '1 day';
    
    -- Buscar dados do tenant
    SELECT conversation_plan, max_conversations
    INTO tenant_record
    FROM tenants 
    WHERE id = p_tenant_id;
    
    IF NOT FOUND THEN
        RETURN '{"error": "Tenant not found"}'::JSON;
    END IF;
    
    -- Contar conversas do período
    conversations_used := count_monthly_conversations(p_tenant_id, period_start, period_end);
    conversations_included := tenant_record.max_conversations;
    conversations_overage := GREATEST(0, conversations_used - conversations_included);
    
    -- Calcular valores baseados no plano
    base_amount := CASE tenant_record.conversation_plan
        WHEN 'basico' THEN 58.00
        WHEN 'profissional' THEN 116.00  
        WHEN 'enterprise' THEN 290.00
        ELSE 58.00
    END;
    
    -- Apenas Enterprise cobra excedentes
    overage_amount := CASE 
        WHEN tenant_record.conversation_plan = 'enterprise' THEN conversations_overage * 0.25
        ELSE 0.00
    END;
    
    total_amount := base_amount + overage_amount;
    
    -- Montar resultado
    result := JSON_BUILD_OBJECT(
        'tenant_id', p_tenant_id,
        'billing_period_start', period_start,
        'billing_period_end', period_end,
        'current_plan', tenant_record.conversation_plan,
        'conversations_included', conversations_included,
        'conversations_used', conversations_used,
        'conversations_overage', conversations_overage,
        'base_amount_brl', base_amount,
        'overage_amount_brl', overage_amount,
        'total_amount_brl', total_amount,
        'needs_upgrade', CASE 
            WHEN tenant_record.conversation_plan = 'basico' AND conversations_overage > 0 THEN 'profissional'
            WHEN tenant_record.conversation_plan = 'profissional' AND conversations_overage > 0 THEN 'enterprise'
            ELSE NULL
        END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS Policies para conversation_billing
ALTER TABLE conversation_billing ENABLE ROW LEVEL SECURITY;

-- Policy para SELECT: usuários podem ver apenas seu próprio billing
CREATE POLICY "Users can view own billing records" ON conversation_billing
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );

-- Policy para INSERT: apenas sistema pode inserir
CREATE POLICY "System can insert billing records" ON conversation_billing
    FOR INSERT WITH CHECK (true);

-- Policy para UPDATE: apenas sistema pode atualizar
CREATE POLICY "System can update billing records" ON conversation_billing
    FOR UPDATE USING (true);

-- 8. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_conversation_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_billing_updated_at
    BEFORE UPDATE ON conversation_billing
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_billing_updated_at();

-- 9. Comentários nas tabelas e colunas
COMMENT ON TABLE conversation_billing IS 'Billing records para modelo de cobrança por conversa';
COMMENT ON COLUMN conversation_billing.conversations_included IS 'Limite de conversas incluídas no plano';
COMMENT ON COLUMN conversation_billing.conversations_used IS 'Total de conversas utilizadas no período';
COMMENT ON COLUMN conversation_billing.conversations_overage IS 'Conversas excedentes (cobradas extra)';
COMMENT ON COLUMN conversation_billing.base_amount_brl IS 'Valor base do plano em Reais';
COMMENT ON COLUMN conversation_billing.overage_amount_brl IS 'Valor cobrado por excedentes em Reais';

COMMENT ON COLUMN tenants.conversation_plan IS 'Plano de conversas: basico, profissional, enterprise';
COMMENT ON COLUMN tenants.max_conversations IS 'Limite mensal de conversas do plano atual';
COMMENT ON COLUMN tenants.stripe_subscription_item_id IS 'ID do subscription item no Stripe para usage reporting';

-- 10. Grant permissions
GRANT SELECT, INSERT, UPDATE ON conversation_billing TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION count_monthly_conversations(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_monthly_billing(UUID, DATE) TO authenticated;