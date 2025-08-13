-- =====================================================
-- FUNÇÕES SQL FINAIS OTIMIZADAS
-- Versão consolidada das melhores funções
-- =====================================================

-- Remover todas as funções duplicadas/obsoletas primeiro
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Remover funções com sufixos de versionamento
    FOR func_record IN 
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_type = 'FUNCTION' 
        AND routine_schema = 'public'
        AND (
            routine_name LIKE '%_fixed' OR 
            routine_name LIKE '%_backup' OR 
            routine_name LIKE '%_old' OR 
            routine_name LIKE '%_temp' OR
            routine_name LIKE '%_test' OR
            routine_name LIKE '%_final'
        )
    LOOP
        RAISE NOTICE 'Removendo função: %', func_record.routine_name;
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.routine_name || ' CASCADE';
    END LOOP;
END $$;

-- =====================================================
-- 1. FUNÇÃO PRINCIPAL: CALCULAR MÉTRICAS TENANT/PLATFORM
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_platform_metrics(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30,
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE (
    processed_tenants INTEGER,
    total_revenue DECIMAL(12,2),
    total_appointments INTEGER,
    execution_time_ms INTEGER,
    success BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    period_start_date DATE;
    platform_totals RECORD;
    processed_count INTEGER := 0;
BEGIN
    start_time := clock_timestamp();
    period_start_date := p_calculation_date - (p_period_days || ' days')::INTERVAL;
    
    -- Calcular totais da plataforma
    SELECT 
        COALESCE(SUM(sp.amount), 0) as total_revenue,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT a.user_id) as total_customers,
        COUNT(DISTINCT ch.id) as total_ai_interactions,
        COUNT(DISTINCT t.id) as total_active_tenants
    INTO platform_totals
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.payment_status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date::timestamp 
        AND a.created_at <= (p_calculation_date + INTERVAL '1 day')
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date::timestamp 
        AND ch.created_at <= (p_calculation_date + INTERVAL '1 day')
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id);
    
    -- Inserir/atualizar métricas por tenant
    INSERT INTO tenant_platform_metrics (
        tenant_id, metric_date, calculation_period_days,
        revenue_participation_value, revenue_participation_pct, platform_total_revenue,
        tenant_appointments_count, appointments_participation_pct, platform_total_appointments,
        tenant_customers_count, customers_participation_pct, platform_total_customers,
        tenant_ai_interactions, ai_participation_pct, platform_total_ai_interactions,
        cancellation_rate_pct, cancelled_appointments_count,
        rescheduling_rate_pct, rescheduled_appointments_count,
        risk_score, risk_status, efficiency_score, conversion_rate_pct
    )
    SELECT 
        t.id as tenant_id,
        p_calculation_date as metric_date,
        p_period_days as calculation_period_days,
        
        -- Revenue
        COALESCE(SUM(sp.amount), 0) as revenue_participation_value,
        CASE WHEN platform_totals.total_revenue > 0 
             THEN (COALESCE(SUM(sp.amount), 0) / platform_totals.total_revenue * 100)::decimal(5,2)
             ELSE 0 END as revenue_participation_pct,
        platform_totals.total_revenue,
        
        -- Appointments
        COUNT(DISTINCT a.id) as tenant_appointments_count,
        CASE WHEN platform_totals.total_appointments > 0 
             THEN (COUNT(DISTINCT a.id)::decimal / platform_totals.total_appointments * 100)::decimal(5,2)
             ELSE 0 END as appointments_participation_pct,
        platform_totals.total_appointments,
        
        -- Customers
        COUNT(DISTINCT a.user_id) as tenant_customers_count,
        CASE WHEN platform_totals.total_customers > 0 
             THEN (COUNT(DISTINCT a.user_id)::decimal / platform_totals.total_customers * 100)::decimal(5,2)
             ELSE 0 END as customers_participation_pct,
        platform_totals.total_customers,
        
        -- AI Interactions
        COUNT(DISTINCT ch.id) as tenant_ai_interactions,
        CASE WHEN platform_totals.total_ai_interactions > 0 
             THEN (COUNT(DISTINCT ch.id)::decimal / platform_totals.total_ai_interactions * 100)::decimal(5,2)
             ELSE 0 END as ai_participation_pct,
        platform_totals.total_ai_interactions,
        
        -- Cancellations
        CASE WHEN COUNT(DISTINCT a.id) > 0 
             THEN (COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)::decimal(5,2)
             ELSE 0 END as cancellation_rate_pct,
        COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END) as cancelled_appointments_count,
        
        -- Rescheduling
        CASE WHEN COUNT(DISTINCT a.id) > 0 
             THEN (COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)::decimal(5,2)
             ELSE 0 END as rescheduling_rate_pct,
        COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END) as rescheduled_appointments_count,
        
        -- Risk Score
        CASE 
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.amount), 0) > 0 THEN 25
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.amount), 0) = 0 THEN 85
            WHEN COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / GREATEST(COUNT(DISTINCT a.id), 1) > 0.3 THEN 70
            ELSE 15
        END as risk_score,
        
        -- Risk Status
        CASE 
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.amount), 0) > 0 THEN 'Low Risk'
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.amount), 0) = 0 THEN 'High Risk'
            WHEN COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / GREATEST(COUNT(DISTINCT a.id), 1) > 0.3 THEN 'Medium Risk'
            ELSE 'Low Risk'
        END as risk_status,
        
        -- Efficiency Score
        CASE WHEN COUNT(DISTINCT a.user_id) > 0 AND platform_totals.total_customers > 0
             THEN ((COALESCE(SUM(sp.amount), 0) / platform_totals.total_revenue * 100) / 
                   (COUNT(DISTINCT a.user_id)::decimal / platform_totals.total_customers * 100) * 100)::decimal(8,2)
             ELSE 0 END as efficiency_score,
        
        -- Conversion Rate
        CASE WHEN COUNT(DISTINCT ch.id) > 0 
             THEN (COUNT(DISTINCT a.id)::decimal / COUNT(DISTINCT ch.id) * 100)::decimal(8,2)
             ELSE 0 END as conversion_rate_pct
             
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.payment_status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date::timestamp 
        AND a.created_at <= (p_calculation_date + INTERVAL '1 day')
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date::timestamp 
        AND ch.created_at <= (p_calculation_date + INTERVAL '1 day')
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
    GROUP BY t.id
    
    ON CONFLICT (tenant_id, metric_date, calculation_period_days) DO UPDATE SET
        revenue_participation_value = EXCLUDED.revenue_participation_value,
        revenue_participation_pct = EXCLUDED.revenue_participation_pct,
        platform_total_revenue = EXCLUDED.platform_total_revenue,
        tenant_appointments_count = EXCLUDED.tenant_appointments_count,
        appointments_participation_pct = EXCLUDED.appointments_participation_pct,
        platform_total_appointments = EXCLUDED.platform_total_appointments,
        tenant_customers_count = EXCLUDED.tenant_customers_count,
        customers_participation_pct = EXCLUDED.customers_participation_pct,
        platform_total_customers = EXCLUDED.platform_total_customers,
        tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
        ai_participation_pct = EXCLUDED.ai_participation_pct,
        platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
        cancellation_rate_pct = EXCLUDED.cancellation_rate_pct,
        cancelled_appointments_count = EXCLUDED.cancelled_appointments_count,
        rescheduling_rate_pct = EXCLUDED.rescheduling_rate_pct,
        rescheduled_appointments_count = EXCLUDED.rescheduled_appointments_count,
        risk_score = EXCLUDED.risk_score,
        risk_status = EXCLUDED.risk_status,
        efficiency_score = EXCLUDED.efficiency_score,
        conversion_rate_pct = EXCLUDED.conversion_rate_pct,
        calculated_at = NOW(),
        updated_at = NOW();
    
    GET DIAGNOSTICS processed_count = ROW_COUNT;
    
    -- Atualizar rankings
    PERFORM update_tenant_rankings(p_calculation_date, p_period_days);
    
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        processed_count,
        platform_totals.total_revenue,
        platform_totals.total_appointments,
        EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER,
        true;
END;
$$;

-- =====================================================
-- 2. FUNÇÃO DE RANKING
-- =====================================================

CREATE OR REPLACE FUNCTION update_tenant_rankings(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    WITH ranked_tenants AS (
        SELECT 
            tenant_id,
            ROW_NUMBER() OVER (ORDER BY revenue_participation_value DESC, tenant_id) as new_position,
            COUNT(*) OVER () as total_tenants
        FROM tenant_platform_metrics 
        WHERE metric_date = p_calculation_date 
        AND calculation_period_days = p_period_days
    )
    UPDATE tenant_platform_metrics 
    SET 
        ranking_position = rt.new_position,
        total_tenants_in_ranking = rt.total_tenants,
        ranking_percentile = ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100)::decimal(5,2),
        ranking_category = CASE 
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 90 THEN 'Top 10%'
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 75 THEN 'Top 25%'
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 50 THEN 'Top 50%'
            ELSE 'Other'
        END,
        updated_at = NOW()
    FROM ranked_tenants rt
    WHERE tenant_platform_metrics.tenant_id = rt.tenant_id 
    AND tenant_platform_metrics.metric_date = p_calculation_date
    AND tenant_platform_metrics.calculation_period_days = p_period_days;
END;
$$;

-- =====================================================
-- 3. FUNÇÕES DE BUSCA PARA APIS
-- =====================================================

-- Obter métricas de um tenant específico
CREATE OR REPLACE FUNCTION get_tenant_metrics(
    p_tenant_id UUID,
    p_period_days INTEGER DEFAULT 30
) RETURNS TABLE (
    tenant_id UUID,
    metric_date DATE,
    revenue_participation_pct DECIMAL(5,2),
    revenue_participation_value DECIMAL(12,2),
    appointments_participation_pct DECIMAL(5,2),
    tenant_appointments_count INTEGER,
    customers_participation_pct DECIMAL(5,2),
    tenant_customers_count INTEGER,
    ai_participation_pct DECIMAL(5,2),
    tenant_ai_interactions INTEGER,
    ranking_position INTEGER,
    ranking_category VARCHAR(20),
    risk_score INTEGER,
    risk_status VARCHAR(20),
    efficiency_score DECIMAL(8,2),
    conversion_rate_pct DECIMAL(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tpm.tenant_id,
        tpm.metric_date,
        tpm.revenue_participation_pct,
        tpm.revenue_participation_value,
        tpm.appointments_participation_pct,
        tpm.tenant_appointments_count,
        tpm.customers_participation_pct,
        tpm.tenant_customers_count,
        tpm.ai_participation_pct,
        tpm.tenant_ai_interactions,
        tpm.ranking_position,
        tpm.ranking_category,
        tpm.risk_score,
        tpm.risk_status,
        tpm.efficiency_score,
        tpm.conversion_rate_pct
    FROM tenant_platform_metrics tpm
    WHERE tpm.tenant_id = p_tenant_id
    AND tpm.calculation_period_days = p_period_days
    ORDER BY tpm.metric_date DESC
    LIMIT 1;
END;
$$;

-- Obter métricas da plataforma
CREATE OR REPLACE FUNCTION get_platform_metrics(
    p_period_days INTEGER DEFAULT 30
) RETURNS TABLE (
    total_revenue DECIMAL(12,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    total_ai_interactions INTEGER,
    total_active_tenants INTEGER,
    avg_revenue_per_tenant DECIMAL(12,2),
    avg_appointments_per_tenant DECIMAL(8,2),
    calculation_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pda.total_revenue,
        pda.total_appointments,
        pda.total_customers,
        pda.total_ai_interactions,
        pda.total_active_tenants,
        CASE WHEN pda.total_active_tenants > 0 
             THEN pda.total_revenue / pda.total_active_tenants 
             ELSE 0 END as avg_revenue_per_tenant,
        CASE WHEN pda.total_active_tenants > 0 
             THEN pda.total_appointments::decimal / pda.total_active_tenants 
             ELSE 0 END as avg_appointments_per_tenant,
        pda.aggregate_date
    FROM platform_daily_aggregates pda
    WHERE pda.calculation_period_days = p_period_days
    ORDER BY pda.aggregate_date DESC
    LIMIT 1;
END;
$$;

-- Obter rankings de tenants
CREATE OR REPLACE FUNCTION get_tenant_rankings(
    p_period_days INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    revenue_participation_value DECIMAL(12,2),
    ranking_position INTEGER,
    ranking_category VARCHAR(20),
    ranking_percentile DECIMAL(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tpm.tenant_id,
        t.business_name,
        tpm.revenue_participation_value,
        tpm.ranking_position,
        tpm.ranking_category,
        tpm.ranking_percentile
    FROM tenant_platform_metrics tpm
    JOIN tenants t ON tpm.tenant_id = t.id
    WHERE tpm.calculation_period_days = p_period_days
    AND tpm.metric_date = (
        SELECT MAX(metric_date) 
        FROM tenant_platform_metrics 
        WHERE calculation_period_days = p_period_days
    )
    ORDER BY tpm.ranking_position
    LIMIT p_limit;
END;
$$;

-- =====================================================
-- 4. GRANTS PARA AUTHENTICATED USERS
-- =====================================================

GRANT EXECUTE ON FUNCTION calculate_tenant_platform_metrics(DATE, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_metrics(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_metrics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_rankings(INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- FUNÇÕES OTIMIZADAS CRIADAS COM SUCESSO!
-- =====================================================