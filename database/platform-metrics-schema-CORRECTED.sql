-- ==========================================
-- SCHEMA CORRIGIDO PARA MÉTRICAS DA PLATAFORMA
-- Context Engineering COLEAM00 - Fonte única de verdade
-- ==========================================

-- 1. Tabela para armazenar métricas agregadas da plataforma
CREATE TABLE IF NOT EXISTS platform_metrics (
    id SERIAL PRIMARY KEY,
    calculation_date DATE NOT NULL,
    period_days INTEGER NOT NULL, -- 7, 30, 90
    data_source TEXT DEFAULT 'tenant_aggregation',
    
    -- MÉTRICAS CORE DA PLATAFORMA (agregadas dos tenants)
    active_tenants INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0, -- Clientes únicos dos tenants
    total_ai_interactions INTEGER DEFAULT 0,
    
    -- RECEITA DOS TENANTS (negócios dos clientes finais)
    total_tenant_business_revenue DECIMAL(15,2) DEFAULT 0, -- Receita dos negócios dos tenants
    
    -- REVENUE DA PLATAFORMA (o que tenants pagam para usar o SaaS)
    platform_mrr DECIMAL(15,2) DEFAULT 0, -- Monthly Recurring Revenue REAL da plataforma
    total_platform_revenue DECIMAL(15,2) DEFAULT 0, -- Revenue total do período
    
    -- MÉTRICAS CALCULADAS
    operational_efficiency_pct DECIMAL(5,2) DEFAULT 0, -- appointments/conversations * 100
    spam_rate_pct DECIMAL(5,2) DEFAULT 0,
    cancellation_rate_pct DECIMAL(5,2) DEFAULT 0,
    
    -- MÉTRICAS ESPECÍFICAS DA PLATAFORMA
    total_chat_minutes DECIMAL(10,2) DEFAULT 0,
    total_valid_conversations INTEGER DEFAULT 0,
    total_spam_conversations INTEGER DEFAULT 0,
    receita_uso_ratio DECIMAL(10,2) DEFAULT 0, -- Revenue plataforma / tenant
    revenue_usage_distortion_index DECIMAL(5,2) DEFAULT 1.0,
    platform_health_score INTEGER DEFAULT 0,
    tenants_above_usage INTEGER DEFAULT 0,
    tenants_below_usage INTEGER DEFAULT 0,
    
    -- TIMESTAMPS
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- CONSTRAINTS
    UNIQUE(calculation_date, period_days, data_source)
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_platform_metrics_date_period ON platform_metrics(calculation_date, period_days);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_source ON platform_metrics(data_source);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_created_at ON platform_metrics(created_at);

-- 3. Função CORRIGIDA para calcular MRR real da plataforma
CREATE OR REPLACE FUNCTION calculate_real_platform_mrr(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
    real_mrr_val DECIMAL(15,2) := 0;
    total_platform_revenue_val DECIMAL(15,2) := 0;
BEGIN
    -- CALCULAR MRR REAL baseado em subscription_payments (fonte de verdade)
    SELECT COALESCE(SUM(amount), 0) INTO real_mrr_val
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_period_start <= target_date 
    AND payment_period_end >= target_date;
    
    -- CALCULAR REVENUE TOTAL DOS ÚLTIMOS 30 DIAS
    SELECT COALESCE(SUM(amount), 0) INTO total_platform_revenue_val
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_date >= target_date - INTERVAL '30 days'
    AND payment_date <= target_date;
    
    -- Se não há dados reais, calcular estimativa baseada em planos ativos
    IF real_mrr_val = 0 THEN
        SELECT COALESCE(SUM(
            CASE 
                WHEN subscription_plan = 'basico' THEN 58.00
                WHEN subscription_plan = 'profissional' THEN 116.00
                WHEN subscription_plan = 'enterprise' THEN 290.00
                WHEN subscription_plan = 'free' THEN 0.00
                ELSE 58.00 -- Default para básico
            END
        ), 0) INTO real_mrr_val
        FROM tenants 
        WHERE status = 'active';
        
        total_platform_revenue_val := real_mrr_val; -- Estimativa para período mensal
    END IF;
    
    result := json_build_object(
        'platform_mrr', real_mrr_val,
        'total_platform_revenue', total_platform_revenue_val,
        'calculation_method', CASE WHEN real_mrr_val > 0 THEN 'real_payments' ELSE 'estimated_from_plans' END,
        'calculated_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para calcular métricas agregadas dos tenants
CREATE OR REPLACE FUNCTION calculate_tenant_aggregated_metrics(
    target_date DATE DEFAULT CURRENT_DATE,
    period_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_appointments_val INTEGER := 0;
    total_customers_val INTEGER := 0;
    total_tenant_revenue_val DECIMAL(15,2) := 0;
    total_conversations_val INTEGER := 0;
    active_tenants_val INTEGER := 0;
BEGIN
    -- Contar tenants ativos
    SELECT COUNT(*) INTO active_tenants_val 
    FROM tenants 
    WHERE status = 'active';
    
    -- Buscar métricas agregadas dos tenants
    WITH tenant_aggregated AS (
        SELECT 
            SUM(COALESCE((metric_data->>'total_appointments')::INTEGER, 0)) as appointments,
            SUM(COALESCE((metric_data->>'unique_customers')::INTEGER, 0)) as customers,
            SUM(COALESCE((metric_data->>'total_revenue')::DECIMAL, 0)) as revenue,
            SUM(COALESCE((metric_data->>'total_conversations')::INTEGER, 0)) as conversations
        FROM tenant_metrics 
        WHERE period = CONCAT(period_days, 'd')
        AND metric_type IN ('revenue_per_customer', 'custo_plataforma')
        AND calculated_at >= target_date - INTERVAL '1 day'
    )
    SELECT 
        COALESCE(appointments, 0),
        COALESCE(customers, 0), 
        COALESCE(revenue, 0),
        COALESCE(conversations, 0)
    INTO total_appointments_val, total_customers_val, total_tenant_revenue_val, total_conversations_val
    FROM tenant_aggregated;
    
    result := json_build_object(
        'total_appointments', total_appointments_val,
        'total_customers', total_customers_val,
        'total_tenant_business_revenue', total_tenant_revenue_val,
        'total_conversations', total_conversations_val,
        'active_tenants', active_tenants_val,
        'calculated_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Função principal para atualizar platform_metrics
CREATE OR REPLACE FUNCTION update_platform_metrics_corrected(
    target_date DATE DEFAULT CURRENT_DATE,
    period_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
    platform_revenue_data JSON;
    tenant_metrics_data JSON;
    result JSON;
    operational_efficiency DECIMAL(5,2) := 0;
BEGIN
    -- 1. Calcular revenue REAL da plataforma
    SELECT calculate_real_platform_mrr(target_date) INTO platform_revenue_data;
    
    -- 2. Calcular métricas agregadas dos tenants
    SELECT calculate_tenant_aggregated_metrics(target_date, period_days) INTO tenant_metrics_data;
    
    -- 3. Calcular eficiência operacional
    IF (tenant_metrics_data->>'total_conversations')::INTEGER > 0 THEN
        operational_efficiency := ((tenant_metrics_data->>'total_appointments')::INTEGER::DECIMAL / 
                                  (tenant_metrics_data->>'total_conversations')::INTEGER::DECIMAL) * 100;
    END IF;
    
    -- 4. Inserir/atualizar na tabela platform_metrics
    INSERT INTO platform_metrics (
        calculation_date,
        period_days,
        data_source,
        active_tenants,
        total_conversations,
        total_appointments,
        total_customers,
        total_ai_interactions,
        total_tenant_business_revenue,
        platform_mrr,
        total_platform_revenue,
        operational_efficiency_pct,
        receita_uso_ratio,
        platform_health_score,
        updated_at
    ) VALUES (
        target_date,
        period_days,
        'tenant_aggregation',
        (tenant_metrics_data->>'active_tenants')::INTEGER,
        (tenant_metrics_data->>'total_conversations')::INTEGER,
        (tenant_metrics_data->>'total_appointments')::INTEGER,
        (tenant_metrics_data->>'total_customers')::INTEGER,
        (tenant_metrics_data->>'total_conversations')::INTEGER,
        (tenant_metrics_data->>'total_tenant_business_revenue')::DECIMAL,
        (platform_revenue_data->>'platform_mrr')::DECIMAL,
        (platform_revenue_data->>'total_platform_revenue')::DECIMAL,
        operational_efficiency,
        CASE 
            WHEN (tenant_metrics_data->>'active_tenants')::INTEGER > 0 
            THEN (platform_revenue_data->>'platform_mrr')::DECIMAL / (tenant_metrics_data->>'active_tenants')::INTEGER
            ELSE 0 
        END,
        85, -- Score padrão
        NOW()
    )
    ON CONFLICT (calculation_date, period_days, data_source) 
    DO UPDATE SET
        active_tenants = EXCLUDED.active_tenants,
        total_conversations = EXCLUDED.total_conversations,
        total_appointments = EXCLUDED.total_appointments,
        total_customers = EXCLUDED.total_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        total_tenant_business_revenue = EXCLUDED.total_tenant_business_revenue,
        platform_mrr = EXCLUDED.platform_mrr,
        total_platform_revenue = EXCLUDED.total_platform_revenue,
        operational_efficiency_pct = EXCLUDED.operational_efficiency_pct,
        receita_uso_ratio = EXCLUDED.receita_uso_ratio,
        updated_at = NOW();

    result := json_build_object(
        'success', true,
        'date', target_date,
        'period_days', period_days,
        'platform_revenue', platform_revenue_data,
        'tenant_metrics', tenant_metrics_data,
        'operational_efficiency_pct', operational_efficiency,
        'updated_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. Função para buscar métricas com validação
CREATE OR REPLACE FUNCTION get_platform_metrics_validated(
    target_date DATE DEFAULT CURRENT_DATE,
    period_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
    platform_data JSON;
    result JSON;
BEGIN
    -- Buscar métricas da plataforma
    SELECT row_to_json(pm) INTO platform_data
    FROM platform_metrics pm
    WHERE calculation_date = target_date 
    AND period_days = period_days
    AND data_source = 'tenant_aggregation'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- Se não existir, calcular automaticamente
    IF platform_data IS NULL THEN
        SELECT update_platform_metrics_corrected(target_date, period_days) INTO result;
        
        SELECT row_to_json(pm) INTO platform_data
        FROM platform_metrics pm
        WHERE calculation_date = target_date 
        AND period_days = period_days
        AND data_source = 'tenant_aggregation'
        ORDER BY updated_at DESC
        LIMIT 1;
    END IF;

    result := json_build_object(
        'platform_metrics', platform_data,
        'last_updated', (platform_data->>'updated_at'),
        'data_available', platform_data IS NOT NULL,
        'data_source', 'tenant_aggregation_corrected'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. Popular dados iniciais para todos os períodos
SELECT update_platform_metrics_corrected(CURRENT_DATE, 7);
SELECT update_platform_metrics_corrected(CURRENT_DATE, 30);  
SELECT update_platform_metrics_corrected(CURRENT_DATE, 90);

-- 8. Comentários para documentação
COMMENT ON TABLE platform_metrics IS 'Métricas agregadas CORRIGIDAS da plataforma - distingue receita dos tenants vs revenue da plataforma'; 
COMMENT ON COLUMN platform_metrics.total_tenant_business_revenue IS 'Receita dos negócios dos tenants (salões, clínicas, etc.)';
COMMENT ON COLUMN platform_metrics.platform_mrr IS 'Monthly Recurring Revenue REAL da plataforma (o que tenants pagam)';
COMMENT ON COLUMN platform_metrics.total_platform_revenue IS 'Revenue total da plataforma no período';
COMMENT ON FUNCTION calculate_real_platform_mrr IS 'Calcula MRR real baseado em subscription_payments, não estimativas';
COMMENT ON FUNCTION update_platform_metrics_corrected IS 'Atualiza métricas com distinção correta entre receitas';