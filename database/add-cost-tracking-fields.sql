-- =====================================================
-- FASE 1: ADICIONAR CAMPOS PARA COST TRACKING
-- =====================================================
-- Implementa estrutura completa para rastreamento de custos vs receita
-- Resolve problema de tenants em prejuízo
-- =====================================================

-- =====================================================
-- 1. ADICIONAR CAMPOS EM conversation_history
-- =====================================================

-- Campos para rastreamento de custos de IA
ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    tokens_used INTEGER DEFAULT 0;

ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    api_cost_usd DECIMAL(10,6) DEFAULT 0;

ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    model_used VARCHAR(50) DEFAULT 'gpt-3.5-turbo';

ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    message_source VARCHAR(20) DEFAULT 'whatsapp';

ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    processing_cost_usd DECIMAL(10,6) DEFAULT 0;

-- Comentários dos novos campos
COMMENT ON COLUMN conversation_history.tokens_used IS 'Número de tokens usados na requisição OpenAI';
COMMENT ON COLUMN conversation_history.api_cost_usd IS 'Custo da requisição OpenAI em USD';
COMMENT ON COLUMN conversation_history.model_used IS 'Modelo de IA utilizado (gpt-3.5-turbo, gpt-4, etc)';
COMMENT ON COLUMN conversation_history.message_source IS 'Origem da mensagem (whatsapp, web, api)';
COMMENT ON COLUMN conversation_history.processing_cost_usd IS 'Custo adicional de processamento';

-- =====================================================
-- 2. ADICIONAR CAMPOS EM tenants
-- =====================================================

-- Campos para rastreamento de receita e planos
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    monthly_subscription_fee DECIMAL(10,2) DEFAULT 79.90;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    plan_type VARCHAR(20) DEFAULT 'standard';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    billing_cycle_day INTEGER DEFAULT 1;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    subscription_status VARCHAR(20) DEFAULT 'active';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    subscription_start_date DATE DEFAULT CURRENT_DATE;

-- Comentários dos novos campos
COMMENT ON COLUMN tenants.monthly_subscription_fee IS 'Taxa de assinatura mensal em USD';
COMMENT ON COLUMN tenants.plan_type IS 'Tipo do plano (basic, standard, premium)';
COMMENT ON COLUMN tenants.billing_cycle_day IS 'Dia do mês para cobrança (1-28)';
COMMENT ON COLUMN tenants.subscription_status IS 'Status da assinatura (active, paused, cancelled)';
COMMENT ON COLUMN tenants.subscription_start_date IS 'Data de início da assinatura';

-- =====================================================
-- 3. CRIAR TABELA usage_costs
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cost_date DATE NOT NULL,
    
    -- Custos de IA por dia
    ai_requests_count INTEGER DEFAULT 0,
    ai_tokens_used INTEGER DEFAULT 0,
    ai_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Custos de WhatsApp por dia
    whatsapp_messages_sent INTEGER DEFAULT 0,
    whatsapp_messages_received INTEGER DEFAULT 0,
    whatsapp_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Custos de infraestrutura por dia
    storage_gb_used DECIMAL(8,3) DEFAULT 0,
    storage_cost_usd DECIMAL(10,6) DEFAULT 0,
    bandwidth_gb_used DECIMAL(8,3) DEFAULT 0,
    bandwidth_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Total consolidado
    total_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Métricas calculadas
    cost_per_conversation DECIMAL(10,6) DEFAULT 0,
    conversations_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint para evitar duplicatas
    UNIQUE(tenant_id, cost_date)
);

-- Comentários da tabela
COMMENT ON TABLE usage_costs IS 'Rastreamento diário de custos por tenant para análise de sustentabilidade';
COMMENT ON COLUMN usage_costs.cost_per_conversation IS 'Custo médio por conversa neste dia';
COMMENT ON COLUMN usage_costs.total_cost_usd IS 'Custo total do dia (soma de todos os custos)';

-- =====================================================
-- 4. ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices para conversation_history
CREATE INDEX IF NOT EXISTS idx_conversation_history_cost_tracking 
    ON conversation_history(tenant_id, created_at, api_cost_usd);

CREATE INDEX IF NOT EXISTS idx_conversation_history_tokens 
    ON conversation_history(tokens_used, model_used) WHERE tokens_used > 0;

-- Índices para usage_costs
CREATE INDEX IF NOT EXISTS idx_usage_costs_tenant_date 
    ON usage_costs(tenant_id, cost_date DESC);

CREATE INDEX IF NOT EXISTS idx_usage_costs_date_range 
    ON usage_costs(cost_date) WHERE total_cost_usd > 0;

CREATE INDEX IF NOT EXISTS idx_usage_costs_high_cost 
    ON usage_costs(total_cost_usd DESC) WHERE total_cost_usd > 1.0;

-- Índices para tenants
CREATE INDEX IF NOT EXISTS idx_tenants_subscription 
    ON tenants(subscription_status, monthly_subscription_fee);

-- =====================================================
-- 5. TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA
-- =====================================================

-- Trigger para atualizar updated_at em usage_costs
CREATE OR REPLACE FUNCTION update_usage_costs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Recalcular total_cost_usd automaticamente
    NEW.total_cost_usd = COALESCE(NEW.ai_cost_usd, 0) + 
                         COALESCE(NEW.whatsapp_cost_usd, 0) + 
                         COALESCE(NEW.storage_cost_usd, 0) + 
                         COALESCE(NEW.bandwidth_cost_usd, 0);
    
    -- Recalcular cost_per_conversation
    IF NEW.conversations_count > 0 THEN
        NEW.cost_per_conversation = NEW.total_cost_usd / NEW.conversations_count;
    ELSE
        NEW.cost_per_conversation = 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usage_costs_update_timestamp
    BEFORE UPDATE ON usage_costs
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_costs_timestamp();

-- =====================================================
-- 6. FUNÇÃO PARA CALCULAR MARGEM POR TENANT
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_margins(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    revenue_usd DECIMAL(10,2),
    total_cost_usd DECIMAL(10,6),
    margin_usd DECIMAL(10,2),
    margin_percentage DECIMAL(5,2),
    is_profitable BOOLEAN,
    cost_per_conversation DECIMAL(10,6),
    ai_cost_usd DECIMAL(10,6),
    whatsapp_cost_usd DECIMAL(10,6),
    conversations_count INTEGER,
    risk_level VARCHAR(10)
) 
LANGUAGE plpgsql AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    v_end_date := p_calculation_date;
    
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name as tenant_name,
        
        -- Receita (proporcional ao período)
        (t.monthly_subscription_fee * p_period_days / 30.0) as revenue_usd,
        
        -- Custos do período
        COALESCE(SUM(uc.total_cost_usd), 0) as total_cost_usd,
        
        -- Margem
        ((t.monthly_subscription_fee * p_period_days / 30.0) - COALESCE(SUM(uc.total_cost_usd), 0)) as margin_usd,
        
        -- Margem percentual
        CASE 
            WHEN t.monthly_subscription_fee > 0 THEN
                (((t.monthly_subscription_fee * p_period_days / 30.0) - COALESCE(SUM(uc.total_cost_usd), 0)) / (t.monthly_subscription_fee * p_period_days / 30.0) * 100)
            ELSE 0
        END as margin_percentage,
        
        -- É lucrativo?
        ((t.monthly_subscription_fee * p_period_days / 30.0) > COALESCE(SUM(uc.total_cost_usd), 0)) as is_profitable,
        
        -- Custo por conversa
        CASE 
            WHEN SUM(uc.conversations_count) > 0 THEN 
                COALESCE(SUM(uc.total_cost_usd), 0) / SUM(uc.conversations_count)
            ELSE 0
        END as cost_per_conversation,
        
        -- Custos detalhados
        COALESCE(SUM(uc.ai_cost_usd), 0) as ai_cost_usd,
        COALESCE(SUM(uc.whatsapp_cost_usd), 0) as whatsapp_cost_usd,
        
        -- Contadores
        COALESCE(SUM(uc.conversations_count), 0)::INTEGER as conversations_count,
        
        -- Nível de risco
        CASE 
            WHEN ((t.monthly_subscription_fee * p_period_days / 30.0) - COALESCE(SUM(uc.total_cost_usd), 0)) / (t.monthly_subscription_fee * p_period_days / 30.0) > 0.4 THEN 'Baixo'
            WHEN ((t.monthly_subscription_fee * p_period_days / 30.0) - COALESCE(SUM(uc.total_cost_usd), 0)) / (t.monthly_subscription_fee * p_period_days / 30.0) > 0.1 THEN 'Médio'
            ELSE 'Alto'
        END as risk_level
        
    FROM tenants t
    LEFT JOIN usage_costs uc ON t.id = uc.tenant_id 
        AND uc.cost_date >= v_start_date
        AND uc.cost_date <= v_end_date
    WHERE t.subscription_status = 'active'
    GROUP BY t.id, t.business_name, t.monthly_subscription_fee
    ORDER BY margin_percentage ASC; -- Piores margens primeiro
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION calculate_tenant_margins IS 
'Calcula margem e sustentabilidade por tenant para identificar tenants em prejuízo';

-- =====================================================
-- 7. FUNÇÃO PARA ATUALIZAR CUSTOS DIÁRIOS
-- =====================================================

CREATE OR REPLACE FUNCTION update_daily_usage_costs(
    p_tenant_id UUID,
    p_cost_date DATE DEFAULT CURRENT_DATE,
    p_ai_cost DECIMAL(10,6) DEFAULT 0,
    p_ai_tokens INTEGER DEFAULT 0,
    p_whatsapp_cost DECIMAL(10,6) DEFAULT 0,
    p_conversations_increment INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO usage_costs (
        tenant_id,
        cost_date,
        ai_cost_usd,
        ai_tokens_used,
        whatsapp_cost_usd,
        conversations_count,
        ai_requests_count,
        whatsapp_messages_sent
    ) VALUES (
        p_tenant_id,
        p_cost_date,
        p_ai_cost,
        p_ai_tokens,
        p_whatsapp_cost,
        p_conversations_increment,
        CASE WHEN p_ai_cost > 0 THEN 1 ELSE 0 END,
        CASE WHEN p_whatsapp_cost > 0 THEN 1 ELSE 0 END
    )
    ON CONFLICT (tenant_id, cost_date) 
    DO UPDATE SET
        ai_cost_usd = usage_costs.ai_cost_usd + EXCLUDED.ai_cost_usd,
        ai_tokens_used = usage_costs.ai_tokens_used + EXCLUDED.ai_tokens_used,
        whatsapp_cost_usd = usage_costs.whatsapp_cost_usd + EXCLUDED.whatsapp_cost_usd,
        conversations_count = usage_costs.conversations_count + EXCLUDED.conversations_count,
        ai_requests_count = usage_costs.ai_requests_count + EXCLUDED.ai_requests_count,
        whatsapp_messages_sent = usage_costs.whatsapp_messages_sent + EXCLUDED.whatsapp_messages_sent,
        updated_at = CURRENT_TIMESTAMP;
        
    RETURN TRUE;
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION update_daily_usage_costs IS 
'Atualiza custos diários de um tenant (incrementa valores existentes)';

-- =====================================================
-- 8. GRANTS E PERMISSÕES
-- =====================================================

-- Garantir acesso para o serviço
GRANT ALL PRIVILEGES ON usage_costs TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Acesso de leitura para usuários autenticados
GRANT SELECT ON usage_costs TO authenticated;

-- =====================================================
-- 9. ROW LEVEL SECURITY
-- =====================================================

-- Habilitar RLS na nova tabela
ALTER TABLE usage_costs ENABLE ROW LEVEL SECURITY;

-- Policy: usuarios só veem custos do seu tenant
CREATE POLICY usage_costs_tenant_isolation ON usage_costs
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM user_tenants ut 
            WHERE ut.tenant_id = usage_costs.tenant_id
        )
        OR 
        auth.jwt() ->> 'role' = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.email = auth.jwt() ->> 'email' 
            AND au.role IN ('super_admin', 'admin')
        )
    );

-- =====================================================
-- 10. VERIFICAÇÃO DA IMPLEMENTAÇÃO
-- =====================================================

-- Verificar se as alterações foram aplicadas
DO $$
DECLARE
    v_conversation_fields INTEGER;
    v_tenant_fields INTEGER;
    v_usage_costs_exists BOOLEAN;
BEGIN
    -- Verificar campos em conversation_history
    SELECT COUNT(*) INTO v_conversation_fields
    FROM information_schema.columns 
    WHERE table_name = 'conversation_history' 
    AND column_name IN ('tokens_used', 'api_cost_usd', 'model_used', 'message_source');
    
    -- Verificar campos em tenants
    SELECT COUNT(*) INTO v_tenant_fields
    FROM information_schema.columns 
    WHERE table_name = 'tenants' 
    AND column_name IN ('monthly_subscription_fee', 'plan_type', 'subscription_status');
    
    -- Verificar se usage_costs existe
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'usage_costs'
    ) INTO v_usage_costs_exists;
    
    -- Relatório
    RAISE NOTICE '🔍 VERIFICAÇÃO DA IMPLEMENTAÇÃO:';
    RAISE NOTICE '   📊 Campos em conversation_history: %/4', v_conversation_fields;
    RAISE NOTICE '   🏢 Campos em tenants: %/3', v_tenant_fields;
    RAISE NOTICE '   💰 Tabela usage_costs: %', CASE WHEN v_usage_costs_exists THEN 'CRIADA' ELSE 'FALHOU' END;
    
    IF v_conversation_fields = 4 AND v_tenant_fields = 3 AND v_usage_costs_exists THEN
        RAISE NOTICE '✅ IMPLEMENTAÇÃO COMPLETA - Cost tracking ativo!';
        RAISE NOTICE '🚀 Próximo passo: Implementar logging nos serviços';
    ELSE
        RAISE NOTICE '❌ IMPLEMENTAÇÃO INCOMPLETA - Verifique erros acima';
    END IF;
END $$;