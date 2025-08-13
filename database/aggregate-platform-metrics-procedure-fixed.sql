-- =====================================================================
-- PROCEDURE: aggregate_platform_metrics_from_tenants (FIXED VERSION)
-- OBJETIVO: Agregar dados de tenant_metrics para platform_metrics
-- SCHEMA: Estrutura idêntica ao tenant_metrics mas com dados agregados
-- =====================================================================

CREATE OR REPLACE FUNCTION aggregate_platform_metrics_from_tenants(
    p_period TEXT DEFAULT '30d'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    tenant_count INTEGER := 0;
    result_message TEXT;
    aggregated_data JSONB;
BEGIN
    -- Log de início
    RAISE NOTICE 'Iniciando agregação de platform_metrics para período: %', p_period;
    
    -- Verificar se existem dados de tenant_metrics para o período
    SELECT COUNT(DISTINCT tenant_id) 
    INTO tenant_count
    FROM tenant_metrics 
    WHERE period = p_period 
    AND metric_type = 'comprehensive'
    AND metric_data IS NOT NULL;
    
    IF tenant_count = 0 THEN
        RETURN 'ERRO: Nenhum dado encontrado em tenant_metrics para período ' || p_period;
    END IF;
    
    RAISE NOTICE 'Encontrados dados de % tenants para agregação', tenant_count;

    -- Construir dados agregados com mesma estrutura do tenant_metrics
    WITH aggregation_data AS (
        SELECT 
            MAX((metric_data->'metadata'->>'period_end')::DATE) as max_period_end,
            MIN((metric_data->'metadata'->>'period_start')::DATE) as min_period_start,
            (SELECT (metric_data->'metadata'->>'period_days')::INTEGER FROM tenant_metrics WHERE period = p_period LIMIT 1) as period_days,
            COUNT(DISTINCT tenant_id) as total_tenants_included,
            
            -- Financial aggregations
            COALESCE(SUM((metric_data->'financial_metrics'->>'total_platform_cost')::NUMERIC), 0) as platform_mrr,
            COALESCE(SUM((metric_data->'financial_metrics'->>'tenant_revenue')::NUMERIC), 0) as total_tenant_revenue,
            COALESCE(AVG((metric_data->'financial_metrics'->>'roi_percentage')::NUMERIC), 0) as avg_roi_percentage,
            COALESCE(AVG((metric_data->'financial_metrics'->>'average_appointment_value')::NUMERIC), 0) as avg_appointment_value,
            COUNT(CASE WHEN (metric_data->'financial_metrics'->>'is_profitable')::BOOLEAN = true THEN 1 END) as profitable_tenants_count,
            
            -- Appointment aggregations  
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_total')::INTEGER), 0) as total_appointments,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'completion_rate')::NUMERIC), 0) as avg_completion_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'no_show_rate')::NUMERIC), 0) as avg_no_show_rate,
            
            -- Customer aggregations
            COALESCE(SUM((metric_data->'customer_metrics'->>'customers_total')::INTEGER), 0) as total_customers,
            COALESCE(AVG((metric_data->'customer_metrics'->>'customer_lifetime_value')::NUMERIC), 0) as avg_customer_lifetime_value,
            
            -- Conversations aggregations
            COALESCE(SUM((metric_data->'conversation_outcomes'->>'conversations_total')::INTEGER), 0) as total_conversations,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversion_rate')::NUMERIC), 0) as avg_conversion_rate,
            
            -- AI metrics aggregations
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_accuracy_rate')::NUMERIC), 0) as avg_ai_accuracy_rate,
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_uptime_percentage')::NUMERIC), 0) as avg_ai_uptime_percentage,
            
            -- Services aggregations
            COALESCE(SUM((metric_data->'service_metrics'->>'services_total')::INTEGER), 0) as total_services_available,
            COALESCE(AVG((metric_data->'service_metrics'->>'service_utilization_rate')::NUMERIC), 0) as avg_service_utilization_rate,
            
            -- Tenant outcomes aggregations
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'health_score')::NUMERIC), 0) as avg_health_score,
            COUNT(CASE WHEN metric_data->'tenant_outcomes'->>'risk_level' = 'High' THEN 1 END) as high_risk_tenants,
            
            -- Cost breakdown aggregations
            COALESCE(SUM((metric_data->'cost_breakdown'->>'total_usage_cost')::NUMERIC), 0) as total_usage_cost_usd,
            
            -- AI costs metrics aggregations
            COALESCE(SUM((metric_data->'ai_costs_metrics'->>'total_cost_usd')::NUMERIC), 0) as total_ai_cost_usd,
            
            -- Historical metrics aggregations
            COUNT(CASE WHEN metric_data->'historical_metrics'->>'revenue_trend' = 'growing' THEN 1 END) as growing_revenue_tenants,
            
            -- Platform participation aggregations
            COALESCE(AVG((metric_data->'platform_participation'->>'revenue_participation_pct')::NUMERIC), 0) as avg_revenue_participation
            
        FROM tenant_metrics 
        WHERE period = p_period 
        AND metric_type = 'comprehensive'
        AND metric_data IS NOT NULL
    )
    SELECT jsonb_build_object(
        'metadata', jsonb_build_object(
            'period_end', agg.max_period_end,
            'data_source', 'platform_aggregation_v1.0',
            'period_days', agg.period_days,
            'period_start', agg.min_period_start,
            'calculation_date', CURRENT_DATE,
            'aggregation_method', 'sum_and_average',
            'total_tenants_included', agg.total_tenants_included,
            'modules_included', ARRAY['financial', 'appointments', 'customers', 'conversations', 'services', 'ai', 'outcomes', 'platform'],
            'total_metrics_count', 84
        ),
        
        'financial_metrics', jsonb_build_object(
            'platform_mrr', agg.platform_mrr,
            'total_tenant_revenue', agg.total_tenant_revenue,
            'avg_roi_percentage', agg.avg_roi_percentage,
            'avg_appointment_value', agg.avg_appointment_value,
            'profitable_tenants_count', agg.profitable_tenants_count,
            'profitable_tenants_percentage', ROUND((agg.profitable_tenants_count::NUMERIC / agg.total_tenants_included) * 100, 2)
        ),
        
        'appointment_metrics', jsonb_build_object(
            'total_appointments', agg.total_appointments,
            'avg_completion_rate', agg.avg_completion_rate,
            'avg_no_show_rate', agg.avg_no_show_rate
        ),
        
        'customer_metrics', jsonb_build_object(
            'total_customers', agg.total_customers,
            'avg_customer_lifetime_value', agg.avg_customer_lifetime_value
        ),
        
        'conversation_outcomes', jsonb_build_object(
            'total_conversations', agg.total_conversations,
            'avg_conversion_rate', agg.avg_conversion_rate
        ),
        
        'ai_metrics', jsonb_build_object(
            'avg_ai_accuracy_rate', agg.avg_ai_accuracy_rate,
            'avg_ai_uptime_percentage', agg.avg_ai_uptime_percentage
        ),
        
        'service_metrics', jsonb_build_object(
            'total_services_available', agg.total_services_available,
            'avg_service_utilization_rate', agg.avg_service_utilization_rate
        ),
        
        'tenant_outcomes', jsonb_build_object(
            'avg_health_score', agg.avg_health_score,
            'high_risk_tenants', agg.high_risk_tenants,
            'low_risk_tenants', agg.total_tenants_included - agg.high_risk_tenants
        ),
        
        'cost_breakdown', jsonb_build_object(
            'total_usage_cost_usd', agg.total_usage_cost_usd
        ),
        
        'ai_costs_metrics', jsonb_build_object(
            'total_ai_cost_usd', agg.total_ai_cost_usd
        ),
        
        'historical_metrics', jsonb_build_object(
            'growing_revenue_tenants', agg.growing_revenue_tenants
        ),
        
        'platform_participation', jsonb_build_object(
            'avg_revenue_participation', agg.avg_revenue_participation
        )
    )
    INTO aggregated_data
    FROM aggregation_data agg;

    -- Inserir dados agregados na platform_metrics
    INSERT INTO platform_metrics (
        platform_id,
        metric_type, 
        period,
        metric_data,
        created_at,
        updated_at
    )
    VALUES (
        'PLATFORM',
        'comprehensive',
        p_period,
        aggregated_data,
        NOW(),
        NOW()
    )
    ON CONFLICT (platform_id, metric_type, period) 
    DO UPDATE SET 
        metric_data = EXCLUDED.metric_data,
        updated_at = NOW();

    result_message := FORMAT('SUCESSO: Agregados dados de %s tenants para platform_metrics período %s', tenant_count, p_period);
    RAISE NOTICE '%', result_message;
    
    RETURN result_message;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERRO na agregação: %', SQLERRM;
        RETURN 'ERRO: ' || SQLERRM;
END;
$$;