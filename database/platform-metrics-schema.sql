-- ==========================================
-- SCHEMA PARA MÉTRICAS DA PLATAFORMA
-- ==========================================

-- 1. Tabela para armazenar métricas agregadas da plataforma
CREATE TABLE IF NOT EXISTS platform_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL UNIQUE,
    total_mrr DECIMAL(10,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    avg_completion_rate DECIMAL(5,2) DEFAULT 0,
    total_cancellations INTEGER DEFAULT 0,
    total_reschedules INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_platform_metrics_date ON platform_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_created_at ON platform_metrics(created_at);

-- 3. Função para calcular métricas da plataforma
CREATE OR REPLACE FUNCTION calculate_platform_metrics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_mrr_val DECIMAL(10,2) := 0;
    total_appointments_val INTEGER := 0;
    total_customers_val INTEGER := 0;
    total_revenue_val DECIMAL(10,2) := 0;
    total_tenants_val INTEGER := 0;
    active_tenants_val INTEGER := 0;
    avg_completion_val DECIMAL(5,2) := 0;
    total_cancellations_val INTEGER := 0;
    total_reschedules_val INTEGER := 0;
BEGIN
    -- Calcular MRR total (receita mensal recorrente dos planos)
    SELECT COALESCE(SUM(
        CASE 
            WHEN subscription_plan = 'basic' THEN 29.90
            WHEN subscription_plan = 'pro' THEN 59.90
            WHEN subscription_plan = 'premium' THEN 99.90
            WHEN subscription_plan = 'enterprise' THEN 199.90
            ELSE 0
        END
    ), 0) INTO total_mrr_val
    FROM tenants 
    WHERE status = 'active';

    -- Contar total de tenants
    SELECT COUNT(*) INTO total_tenants_val FROM tenants;
    
    -- Contar tenants ativos
    SELECT COUNT(*) INTO active_tenants_val FROM tenants WHERE status = 'active';

    -- Calcular total de agendamentos (últimos 30 dias)
    SELECT COALESCE(SUM(total_appointments), 0) INTO total_appointments_val
    FROM analytics_tenant_metrics 
    WHERE metric_date >= target_date - INTERVAL '30 days'
    AND metric_date <= target_date
    AND period_type = 'daily';

    -- Calcular total de clientes únicos
    SELECT COUNT(DISTINCT user_id) INTO total_customers_val
    FROM user_tenants ut
    JOIN tenants t ON ut.tenant_id = t.id
    WHERE t.status = 'active';

    -- Calcular receita total (últimos 30 dias)
    SELECT COALESCE(SUM(total_revenue), 0) INTO total_revenue_val
    FROM analytics_tenant_metrics 
    WHERE metric_date >= target_date - INTERVAL '30 days'
    AND metric_date <= target_date
    AND period_type = 'daily';

    -- Calcular taxa média de conclusão
    SELECT COALESCE(AVG(completion_rate), 0) INTO avg_completion_val
    FROM analytics_tenant_metrics 
    WHERE metric_date >= target_date - INTERVAL '30 days'
    AND metric_date <= target_date
    AND period_type = 'daily'
    AND total_appointments > 0;

    -- Estimar cancelamentos (baseado na taxa de conclusão baixa)
    SELECT COALESCE(SUM(
        CASE 
            WHEN completion_rate < 25 THEN ROUND(total_appointments * (25 - completion_rate) / 100)
            ELSE 0
        END
    ), 0) INTO total_cancellations_val
    FROM analytics_tenant_metrics 
    WHERE metric_date >= target_date - INTERVAL '30 days'
    AND metric_date <= target_date
    AND period_type = 'daily';

    -- Estimar remarcações (tipicamente 10% dos agendamentos)
    total_reschedules_val := ROUND(total_appointments_val * 0.10);

    -- Construir resultado JSON
    result := json_build_object(
        'total_mrr', total_mrr_val,
        'total_appointments', total_appointments_val,
        'total_customers', total_customers_val,
        'total_revenue', total_revenue_val,
        'total_tenants', total_tenants_val,
        'active_tenants', active_tenants_val,
        'avg_completion_rate', avg_completion_val,
        'total_cancellations', total_cancellations_val,
        'total_reschedules', total_reschedules_val,
        'calculated_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para atualizar métricas da plataforma
CREATE OR REPLACE FUNCTION update_platform_metrics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
    metrics_data JSON;
    result JSON;
BEGIN
    -- Calcular métricas
    SELECT calculate_platform_metrics(target_date) INTO metrics_data;

    -- Inserir ou atualizar na tabela
    INSERT INTO platform_metrics (
        metric_date,
        total_mrr,
        total_appointments,
        total_customers,
        total_revenue,
        total_tenants,
        active_tenants,
        avg_completion_rate,
        total_cancellations,
        total_reschedules,
        updated_at
    ) VALUES (
        target_date,
        (metrics_data->>'total_mrr')::DECIMAL,
        (metrics_data->>'total_appointments')::INTEGER,
        (metrics_data->>'total_customers')::INTEGER,
        (metrics_data->>'total_revenue')::DECIMAL,
        (metrics_data->>'total_tenants')::INTEGER,
        (metrics_data->>'active_tenants')::INTEGER,
        (metrics_data->>'avg_completion_rate')::DECIMAL,
        (metrics_data->>'total_cancellations')::INTEGER,
        (metrics_data->>'total_reschedules')::INTEGER,
        NOW()
    )
    ON CONFLICT (metric_date) 
    DO UPDATE SET
        total_mrr = EXCLUDED.total_mrr,
        total_appointments = EXCLUDED.total_appointments,
        total_customers = EXCLUDED.total_customers,
        total_revenue = EXCLUDED.total_revenue,
        total_tenants = EXCLUDED.total_tenants,
        active_tenants = EXCLUDED.active_tenants,
        avg_completion_rate = EXCLUDED.avg_completion_rate,
        total_cancellations = EXCLUDED.total_cancellations,
        total_reschedules = EXCLUDED.total_reschedules,
        updated_at = NOW();

    -- Retornar resultado
    result := json_build_object(
        'success', true,
        'date', target_date,
        'metrics', metrics_data,
        'updated_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Função para buscar métricas da plataforma com comparações
CREATE OR REPLACE FUNCTION get_platform_metrics_with_comparisons(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
    platform_data JSON;
    result JSON;
BEGIN
    -- Buscar métricas da plataforma
    SELECT row_to_json(pm) INTO platform_data
    FROM platform_metrics pm
    WHERE metric_date = target_date;

    -- Se não existir para a data, calcular
    IF platform_data IS NULL THEN
        SELECT update_platform_metrics(target_date) INTO result;
        
        SELECT row_to_json(pm) INTO platform_data
        FROM platform_metrics pm
        WHERE metric_date = target_date;
    END IF;

    -- Retornar dados da plataforma
    result := json_build_object(
        'platform_metrics', platform_data,
        'last_updated', (platform_data->>'updated_at'),
        'data_available', platform_data IS NOT NULL
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. Executar cálculo inicial para hoje
SELECT update_platform_metrics(CURRENT_DATE);

-- 7. Comentários para documentação
COMMENT ON TABLE platform_metrics IS 'Métricas agregadas da plataforma calculadas diariamente via cron jobs';
COMMENT ON FUNCTION calculate_platform_metrics IS 'Calcula métricas agregadas da plataforma para uma data específica';
COMMENT ON FUNCTION update_platform_metrics IS 'Atualiza a tabela platform_metrics com dados calculados';
COMMENT ON FUNCTION get_platform_metrics_with_comparisons IS 'Busca métricas da plataforma com comparações para APIs'; 