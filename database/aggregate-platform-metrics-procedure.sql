-- =====================================================================
-- PROCEDURE: aggregate_platform_metrics_from_tenants
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
            (metric_data->'metadata'->>'period_days')::INTEGER as period_days,
            COUNT(DISTINCT tenant_id) as total_tenants,
            
            -- Financial aggregations
            COALESCE(SUM((metric_data->'financial_metrics'->>'total_platform_cost')::NUMERIC), 0) as total_platform_mrr,
            COALESCE(SUM((metric_data->'financial_metrics'->>'tenant_revenue')::NUMERIC), 0) as total_tenant_revenue,
            COALESCE(AVG((metric_data->'financial_metrics'->>'roi_percentage')::NUMERIC), 0) as avg_roi_percentage,
            COALESCE(SUM((metric_data->'financial_metrics'->>'usage_cost_usd')::NUMERIC), 0) as total_usage_cost_usd,
            COALESCE(SUM((metric_data->'financial_metrics'->>'total_margin_usd')::NUMERIC), 0) as total_margin_usd,
            COALESCE(AVG((metric_data->'financial_metrics'->>'cost_per_customer')::NUMERIC), 0) as avg_cost_per_customer,
            COALESCE(AVG((metric_data->'financial_metrics'->>'margin_percentage')::NUMERIC), 0) as avg_margin_percentage,
            COALESCE(AVG((metric_data->'financial_metrics'->>'revenue_growth_rate')::NUMERIC), 0) as avg_revenue_growth_rate,
            COALESCE(AVG((metric_data->'financial_metrics'->>'cost_per_appointment')::NUMERIC), 0) as avg_cost_per_appointment,
            COALESCE(AVG((metric_data->'financial_metrics'->>'revenue_per_customer')::NUMERIC), 0) as avg_revenue_per_customer,
            COALESCE(AVG((metric_data->'financial_metrics'->>'average_appointment_value')::NUMERIC), 0) as avg_appointment_value,
            COALESCE(SUM((metric_data->'financial_metrics'->>'monthly_recurring_revenue')::NUMERIC), 0) as total_monthly_recurring_revenue,
            COUNT(CASE WHEN (metric_data->'financial_metrics'->>'is_profitable')::BOOLEAN = true THEN 1 END) as profitable_tenants_count,
            
            -- Appointment aggregations  
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_total')::INTEGER), 0) as total_appointments,
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_completed')::INTEGER), 0) as total_appointments_completed,
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_cancelled')::INTEGER), 0) as total_appointments_cancelled,
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_no_show')::INTEGER), 0) as total_appointments_no_show,
            COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_confirmed')::INTEGER), 0) as total_appointments_confirmed,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'completion_rate')::NUMERIC), 0) as avg_completion_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'cancellation_rate')::NUMERIC), 0) as avg_cancellation_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'no_show_rate')::NUMERIC), 0) as avg_no_show_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'rescheduling_rate')::NUMERIC), 0) as avg_rescheduling_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'appointment_success_rate')::NUMERIC), 0) as avg_appointment_success_rate,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'avg_days_to_appointment')::NUMERIC), 0) as avg_days_to_appointment,
            COALESCE(SUM((metric_data->'appointment_metrics'->>'effective_appointments')::INTEGER), 0) as total_effective_appointments,
            COALESCE(AVG((metric_data->'appointment_metrics'->>'appointment_efficiency')::NUMERIC), 0) as avg_appointment_efficiency,
            
            -- Customer aggregations
            COALESCE(SUM((metric_data->'customer_metrics'->>'customers_total')::INTEGER), 0) as total_customers,
            COALESCE(SUM((metric_data->'customer_metrics'->>'customers_new')::INTEGER), 0) as total_customers_new,
            COALESCE(SUM((metric_data->'customer_metrics'->>'customers_returning')::INTEGER), 0) as total_customers_returning,
            COALESCE(AVG((metric_data->'customer_metrics'->>'customer_lifetime_value')::NUMERIC), 0) as avg_customer_lifetime_value,
            COALESCE(AVG((metric_data->'customer_metrics'->>'customer_retention_rate')::NUMERIC), 0) as avg_customer_retention_rate,
            COALESCE(AVG((metric_data->'customer_metrics'->>'customer_acquisition_rate')::NUMERIC), 0) as avg_customer_acquisition_rate,
            COALESCE(AVG((metric_data->'customer_metrics'->>'customer_churn_rate')::NUMERIC), 0) as avg_customer_churn_rate,
            COALESCE(AVG((metric_data->'customer_metrics'->>'repeat_customer_percentage')::NUMERIC), 0) as avg_repeat_customer_percentage,
            COALESCE(AVG((metric_data->'customer_metrics'->>'avg_appointments_per_customer')::NUMERIC), 0) as avg_appointments_per_customer,
            
            -- Conversations aggregations
            COALESCE(SUM((metric_data->'conversation_outcomes'->>'conversations_total')::INTEGER), 0) as total_conversations,
            COALESCE(SUM((metric_data->'conversation_outcomes'->>'ai_interactions_total')::INTEGER), 0) as total_ai_interactions,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversion_rate')::NUMERIC), 0) as avg_conversion_rate,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversation_success_rate')::NUMERIC), 0) as avg_conversation_success_rate,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'ai_escalation_rate')::NUMERIC), 0) as avg_ai_escalation_rate,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'ai_response_accuracy')::NUMERIC), 0) as avg_ai_response_accuracy,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'avg_conversation_duration')::NUMERIC), 0) as avg_conversation_duration,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'messages_per_conversation')::NUMERIC), 0) as avg_messages_per_conversation,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'customer_satisfaction_score')::NUMERIC), 0) as avg_customer_satisfaction_score,
            COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversation_abandonment_rate')::NUMERIC), 0) as avg_conversation_abandonment_rate,
            COALESCE(SUM((metric_data->'conversation_outcomes'->>'conversation_duration_minutes')::INTEGER), 0) as total_conversation_duration_minutes,
            
            -- AI metrics aggregations
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_accuracy_rate')::NUMERIC), 0) as avg_ai_accuracy_rate,
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_error_rate')::NUMERIC), 0) as avg_ai_error_rate,
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_model_performance')::NUMERIC), 0) as avg_ai_model_performance,
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_uptime_percentage')::NUMERIC), 0) as avg_ai_uptime_percentage,
            COALESCE(AVG((metric_data->'ai_metrics'->>'ai_learning_efficiency')::NUMERIC), 0) as avg_ai_learning_efficiency,
            COALESCE(AVG((metric_data->'ai_metrics'->>'context_retention_score')::NUMERIC), 0) as avg_context_retention_score,
            COALESCE(AVG((metric_data->'ai_metrics'->>'intent_recognition_accuracy')::NUMERIC), 0) as avg_intent_recognition_accuracy,
            COALESCE(AVG((metric_data->'ai_metrics'->>'natural_language_understanding')::NUMERIC), 0) as avg_natural_language_understanding,
            
            -- Services aggregations
            COALESCE(SUM((metric_data->'service_metrics'->>'services_total')::INTEGER), 0) as total_services_available,
            COALESCE(SUM((metric_data->'service_metrics'->>'services_active')::INTEGER), 0) as total_services_active,
            COALESCE(AVG((metric_data->'service_metrics'->>'service_diversity_index')::NUMERIC), 0) as avg_service_diversity_index,
            COALESCE(AVG((metric_data->'service_metrics'->>'service_utilization_rate')::NUMERIC), 0) as avg_service_utilization_rate,
            COALESCE(AVG((metric_data->'service_metrics'->>'services_per_appointment')::NUMERIC), 0) as avg_services_per_appointment,
            COALESCE(AVG((metric_data->'service_metrics'->>'service_completion_rate')::NUMERIC), 0) as avg_service_completion_rate,
            COALESCE(AVG((metric_data->'service_metrics'->>'avg_service_duration_minutes')::NUMERIC), 0) as avg_service_duration_minutes,
            COUNT(CASE WHEN (metric_data->'service_metrics'->>'services_total')::INTEGER > 0 THEN 1 END) as tenants_with_services,
            
            -- Tenant outcomes aggregations
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'health_score')::NUMERIC), 0) as avg_health_score,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'scalability_index')::NUMERIC), 0) as avg_scalability_index,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'sustainability_score')::NUMERIC), 0) as avg_sustainability_score,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'business_growth_score')::NUMERIC), 0) as avg_business_growth_score,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'operational_efficiency')::NUMERIC), 0) as avg_operational_efficiency,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'market_penetration_score')::NUMERIC), 0) as avg_market_penetration_score,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'technology_adoption_rate')::NUMERIC), 0) as avg_technology_adoption_rate,
            COALESCE(AVG((metric_data->'tenant_outcomes'->>'competitive_advantage_index')::NUMERIC), 0) as avg_competitive_advantage_index,
            COUNT(CASE WHEN metric_data->'tenant_outcomes'->>'risk_level' = 'High' THEN 1 END) as high_risk_tenants,
            COUNT(CASE WHEN metric_data->'tenant_outcomes'->>'risk_level' = 'Low' THEN 1 END) as low_risk_tenants,
            
            -- Cost breakdown aggregations
            COALESCE(SUM((metric_data->'cost_breakdown'->>'ai_cost_usd')::NUMERIC), 0) as total_ai_cost_usd,
            COALESCE(SUM((metric_data->'cost_breakdown'->>'whatsapp_cost_usd')::NUMERIC), 0) as total_whatsapp_cost_usd,
            COALESCE(SUM((metric_data->'cost_breakdown'->>'minutes_cost_usd')::NUMERIC), 0) as total_minutes_cost_usd,
            COALESCE(SUM((metric_data->'cost_breakdown'->>'conversation_cost_usd')::NUMERIC), 0) as total_conversation_cost_usd,
            COALESCE(SUM((metric_data->'cost_breakdown'->>'total_usage_cost')::NUMERIC), 0) as total_usage_cost_usd,
            
            -- AI costs metrics aggregations
            COALESCE(SUM((metric_data->'ai_costs_metrics'->>'total_tokens')::INTEGER), 0) as total_tokens,
            COALESCE(SUM((metric_data->'ai_costs_metrics'->>'total_cost_usd')::NUMERIC), 0) as total_ai_cost_usd_detailed,
            COALESCE(AVG((metric_data->'ai_costs_metrics'->>'avg_cost_per_conversation')::NUMERIC), 0) as avg_cost_per_conversation,
            COALESCE(AVG((metric_data->'ai_costs_metrics'->>'efficiency_score')::NUMERIC), 0) as avg_efficiency_score,
            COALESCE(AVG((metric_data->'ai_costs_metrics'->>'roi_score')::NUMERIC), 0) as avg_roi_score,
            
            -- Historical metrics aggregations
            COUNT(CASE WHEN metric_data->'historical_metrics'->>'revenue_trend' = 'growing' THEN 1 END) as growing_revenue_tenants,
            COUNT(CASE WHEN metric_data->'historical_metrics'->>'efficiency_trend' = 'stable' THEN 1 END) as stable_efficiency_tenants,
            COUNT(CASE WHEN metric_data->'historical_metrics'->>'customer_growth_trend' = 'rapid_growth' THEN 1 END) as rapid_growth_tenants,
            COALESCE(AVG((metric_data->'historical_metrics'->>'seasonal_performance_index')::NUMERIC), 0) as avg_seasonal_performance_index,
            COALESCE(AVG((metric_data->'historical_metrics'->>'performance_consistency_score')::NUMERIC), 0) as avg_performance_consistency_score,
            
            -- Platform participation aggregations
            COALESCE(SUM((metric_data->'platform_participation'->>'revenue_participation_pct')::NUMERIC), 0) as total_participation_score,
            COALESCE(AVG((metric_data->'platform_participation'->>'ai_participation_pct')::NUMERIC), 0) as avg_ai_participation,
            COALESCE(AVG((metric_data->'platform_participation'->>'revenue_participation_pct')::NUMERIC), 0) as avg_revenue_participation,
            COALESCE(AVG((metric_data->'platform_participation'->>'customers_participation_pct')::NUMERIC), 0) as avg_customers_participation,
            COALESCE(AVG((metric_data->'platform_participation'->>'appointments_participation_pct')::NUMERIC), 0) as avg_appointments_participation
            
        FROM tenant_metrics 
        WHERE period = p_period 
        AND metric_type = 'comprehensive'
        AND metric_data IS NOT NULL
        GROUP BY (metric_data->'metadata'->>'period_days')::INTEGER
    )
    SELECT jsonb_build_object(
        'metadata', jsonb_build_object(
            'period_end', MAX((metric_data->'metadata'->>'period_end')::DATE),
            'data_source', 'platform_aggregation_v1.0',
            'period_days', (metric_data->'metadata'->>'period_days')::INTEGER,
            'period_start', MIN((metric_data->'metadata'->>'period_start')::DATE),
            'calculation_date', CURRENT_DATE,
            'aggregation_method', 'sum_and_average',
            'total_tenants_included', tenant_count,
            'modules_included', ARRAY['financial', 'appointments', 'customers', 'conversations', 'services', 'ai', 'outcomes', 'platform'],
            'total_metrics_count', 84
        ),
        
        'financial_metrics', jsonb_build_object(
            'platform_mrr', COALESCE(SUM((metric_data->'financial_metrics'->>'total_platform_cost')::NUMERIC), 0),
            'total_tenant_revenue', COALESCE(SUM((metric_data->'financial_metrics'->>'tenant_revenue')::NUMERIC), 0),
            'avg_roi_percentage', COALESCE(AVG((metric_data->'financial_metrics'->>'roi_percentage')::NUMERIC), 0),
            'total_usage_cost_usd', COALESCE(SUM((metric_data->'financial_metrics'->>'usage_cost_usd')::NUMERIC), 0),
            'total_margin_usd', COALESCE(SUM((metric_data->'financial_metrics'->>'total_margin_usd')::NUMERIC), 0),
            'avg_cost_per_customer', COALESCE(AVG((metric_data->'financial_metrics'->>'cost_per_customer')::NUMERIC), 0),
            'avg_margin_percentage', COALESCE(AVG((metric_data->'financial_metrics'->>'margin_percentage')::NUMERIC), 0),
            'avg_revenue_growth_rate', COALESCE(AVG((metric_data->'financial_metrics'->>'revenue_growth_rate')::NUMERIC), 0),
            'avg_cost_per_appointment', COALESCE(AVG((metric_data->'financial_metrics'->>'cost_per_appointment')::NUMERIC), 0),
            'avg_revenue_per_customer', COALESCE(AVG((metric_data->'financial_metrics'->>'revenue_per_customer')::NUMERIC), 0),
            'avg_appointment_value', COALESCE(AVG((metric_data->'financial_metrics'->>'average_appointment_value')::NUMERIC), 0),
            'total_monthly_recurring_revenue', COALESCE(SUM((metric_data->'financial_metrics'->>'monthly_recurring_revenue')::NUMERIC), 0),
            'profitable_tenants_count', COUNT(CASE WHEN (metric_data->'financial_metrics'->>'is_profitable')::BOOLEAN = true THEN 1 END),
            'profitable_tenants_percentage', ROUND((COUNT(CASE WHEN (metric_data->'financial_metrics'->>'is_profitable')::BOOLEAN = true THEN 1 END)::NUMERIC / tenant_count) * 100, 2)
        ),
        
        'appointment_metrics', jsonb_build_object(
            'total_appointments', COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_total')::INTEGER), 0),
            'total_appointments_completed', COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_completed')::INTEGER), 0),
            'total_appointments_cancelled', COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_cancelled')::INTEGER), 0),
            'total_appointments_no_show', COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_no_show')::INTEGER), 0),
            'total_appointments_confirmed', COALESCE(SUM((metric_data->'appointment_metrics'->>'appointments_confirmed')::INTEGER), 0),
            'avg_completion_rate', COALESCE(AVG((metric_data->'appointment_metrics'->>'completion_rate')::NUMERIC), 0),
            'avg_cancellation_rate', COALESCE(AVG((metric_data->'appointment_metrics'->>'cancellation_rate')::NUMERIC), 0),
            'avg_no_show_rate', COALESCE(AVG((metric_data->'appointment_metrics'->>'no_show_rate')::NUMERIC), 0),
            'avg_rescheduling_rate', COALESCE(AVG((metric_data->'appointment_metrics'->>'rescheduling_rate')::NUMERIC), 0),
            'avg_appointment_success_rate', COALESCE(AVG((metric_data->'appointment_metrics'->>'appointment_success_rate')::NUMERIC), 0),
            'avg_days_to_appointment', COALESCE(AVG((metric_data->'appointment_metrics'->>'avg_days_to_appointment')::NUMERIC), 0),
            'total_effective_appointments', COALESCE(SUM((metric_data->'appointment_metrics'->>'effective_appointments')::INTEGER), 0),
            'avg_appointment_efficiency', COALESCE(AVG((metric_data->'appointment_metrics'->>'appointment_efficiency')::NUMERIC), 0)
        ),
        
        'customer_metrics', jsonb_build_object(
            'total_customers', COALESCE(SUM((metric_data->'customer_metrics'->>'customers_total')::INTEGER), 0),
            'total_customers_new', COALESCE(SUM((metric_data->'customer_metrics'->>'customers_new')::INTEGER), 0),
            'total_customers_returning', COALESCE(SUM((metric_data->'customer_metrics'->>'customers_returning')::INTEGER), 0),
            'avg_customer_lifetime_value', COALESCE(AVG((metric_data->'customer_metrics'->>'customer_lifetime_value')::NUMERIC), 0),
            'avg_customer_retention_rate', COALESCE(AVG((metric_data->'customer_metrics'->>'customer_retention_rate')::NUMERIC), 0),
            'avg_customer_acquisition_rate', COALESCE(AVG((metric_data->'customer_metrics'->>'customer_acquisition_rate')::NUMERIC), 0),
            'avg_customer_churn_rate', COALESCE(AVG((metric_data->'customer_metrics'->>'customer_churn_rate')::NUMERIC), 0),
            'avg_repeat_customer_percentage', COALESCE(AVG((metric_data->'customer_metrics'->>'repeat_customer_percentage')::NUMERIC), 0),
            'avg_appointments_per_customer', COALESCE(AVG((metric_data->'customer_metrics'->>'avg_appointments_per_customer')::NUMERIC), 0)
        ),
        
        'conversation_outcomes', jsonb_build_object(
            'total_conversations', COALESCE(SUM((metric_data->'conversation_outcomes'->>'conversations_total')::INTEGER), 0),
            'total_ai_interactions', COALESCE(SUM((metric_data->'conversation_outcomes'->>'ai_interactions_total')::INTEGER), 0),
            'avg_conversion_rate', COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversion_rate')::NUMERIC), 0),
            'avg_conversation_success_rate', COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversation_success_rate')::NUMERIC), 0),
            'avg_ai_escalation_rate', COALESCE(AVG((metric_data->'conversation_outcomes'->>'ai_escalation_rate')::NUMERIC), 0),
            'avg_ai_response_accuracy', COALESCE(AVG((metric_data->'conversation_outcomes'->>'ai_response_accuracy')::NUMERIC), 0),
            'avg_conversation_duration', COALESCE(AVG((metric_data->'conversation_outcomes'->>'avg_conversation_duration')::NUMERIC), 0),
            'avg_messages_per_conversation', COALESCE(AVG((metric_data->'conversation_outcomes'->>'messages_per_conversation')::NUMERIC), 0),
            'avg_customer_satisfaction_score', COALESCE(AVG((metric_data->'conversation_outcomes'->>'customer_satisfaction_score')::NUMERIC), 0),
            'avg_conversation_abandonment_rate', COALESCE(AVG((metric_data->'conversation_outcomes'->>'conversation_abandonment_rate')::NUMERIC), 0),
            'total_conversation_duration_minutes', COALESCE(SUM((metric_data->'conversation_outcomes'->>'conversation_duration_minutes')::INTEGER), 0)
        ),
        
        'ai_metrics', jsonb_build_object(
            'avg_ai_accuracy_rate', COALESCE(AVG((metric_data->'ai_metrics'->>'ai_accuracy_rate')::NUMERIC), 0),
            'avg_ai_error_rate', COALESCE(AVG((metric_data->'ai_metrics'->>'ai_error_rate')::NUMERIC), 0),
            'avg_ai_model_performance', COALESCE(AVG((metric_data->'ai_metrics'->>'ai_model_performance')::NUMERIC), 0),
            'avg_ai_uptime_percentage', COALESCE(AVG((metric_data->'ai_metrics'->>'ai_uptime_percentage')::NUMERIC), 0),
            'avg_ai_learning_efficiency', COALESCE(AVG((metric_data->'ai_metrics'->>'ai_learning_efficiency')::NUMERIC), 0),
            'avg_context_retention_score', COALESCE(AVG((metric_data->'ai_metrics'->>'context_retention_score')::NUMERIC), 0),
            'avg_intent_recognition_accuracy', COALESCE(AVG((metric_data->'ai_metrics'->>'intent_recognition_accuracy')::NUMERIC), 0),
            'avg_natural_language_understanding', COALESCE(AVG((metric_data->'ai_metrics'->>'natural_language_understanding')::NUMERIC), 0)
        ),
        
        'service_metrics', jsonb_build_object(
            'total_services_available', COALESCE(SUM((metric_data->'service_metrics'->>'services_total')::INTEGER), 0),
            'total_services_active', COALESCE(SUM((metric_data->'service_metrics'->>'services_active')::INTEGER), 0),
            'avg_service_diversity_index', COALESCE(AVG((metric_data->'service_metrics'->>'service_diversity_index')::NUMERIC), 0),
            'avg_service_utilization_rate', COALESCE(AVG((metric_data->'service_metrics'->>'service_utilization_rate')::NUMERIC), 0),
            'avg_services_per_appointment', COALESCE(AVG((metric_data->'service_metrics'->>'services_per_appointment')::NUMERIC), 0),
            'avg_service_completion_rate', COALESCE(AVG((metric_data->'service_metrics'->>'service_completion_rate')::NUMERIC), 0),
            'avg_service_duration_minutes', COALESCE(AVG((metric_data->'service_metrics'->>'avg_service_duration_minutes')::NUMERIC), 0),
            'tenants_with_services', COUNT(CASE WHEN (metric_data->'service_metrics'->>'services_total')::INTEGER > 0 THEN 1 END)
        ),
        
        'tenant_outcomes', jsonb_build_object(
            'avg_health_score', COALESCE(AVG((metric_data->'tenant_outcomes'->>'health_score')::NUMERIC), 0),
            'avg_scalability_index', COALESCE(AVG((metric_data->'tenant_outcomes'->>'scalability_index')::NUMERIC), 0),
            'avg_sustainability_score', COALESCE(AVG((metric_data->'tenant_outcomes'->>'sustainability_score')::NUMERIC), 0),
            'avg_business_growth_score', COALESCE(AVG((metric_data->'tenant_outcomes'->>'business_growth_score')::NUMERIC), 0),
            'avg_operational_efficiency', COALESCE(AVG((metric_data->'tenant_outcomes'->>'operational_efficiency')::NUMERIC), 0),
            'avg_market_penetration_score', COALESCE(AVG((metric_data->'tenant_outcomes'->>'market_penetration_score')::NUMERIC), 0),
            'avg_technology_adoption_rate', COALESCE(AVG((metric_data->'tenant_outcomes'->>'technology_adoption_rate')::NUMERIC), 0),
            'avg_competitive_advantage_index', COALESCE(AVG((metric_data->'tenant_outcomes'->>'competitive_advantage_index')::NUMERIC), 0),
            'high_risk_tenants', COUNT(CASE WHEN metric_data->'tenant_outcomes'->>'risk_level' = 'High' THEN 1 END),
            'low_risk_tenants', COUNT(CASE WHEN metric_data->'tenant_outcomes'->>'risk_level' = 'Low' THEN 1 END)
        ),
        
        'cost_breakdown', jsonb_build_object(
            'total_ai_cost_usd', COALESCE(SUM((metric_data->'cost_breakdown'->>'ai_cost_usd')::NUMERIC), 0),
            'total_whatsapp_cost_usd', COALESCE(SUM((metric_data->'cost_breakdown'->>'whatsapp_cost_usd')::NUMERIC), 0),
            'total_minutes_cost_usd', COALESCE(SUM((metric_data->'cost_breakdown'->>'minutes_cost_usd')::NUMERIC), 0),
            'total_conversation_cost_usd', COALESCE(SUM((metric_data->'cost_breakdown'->>'conversation_cost_usd')::NUMERIC), 0),
            'total_usage_cost_usd', COALESCE(SUM((metric_data->'cost_breakdown'->>'total_usage_cost')::NUMERIC), 0)
        ),
        
        'ai_costs_metrics', jsonb_build_object(
            'total_tokens', COALESCE(SUM((metric_data->'ai_costs_metrics'->>'total_tokens')::INTEGER), 0),
            'total_ai_cost_usd', COALESCE(SUM((metric_data->'ai_costs_metrics'->>'total_cost_usd')::NUMERIC), 0),
            'avg_cost_per_conversation', COALESCE(AVG((metric_data->'ai_costs_metrics'->>'avg_cost_per_conversation')::NUMERIC), 0),
            'avg_efficiency_score', COALESCE(AVG((metric_data->'ai_costs_metrics'->>'efficiency_score')::NUMERIC), 0),
            'avg_roi_score', COALESCE(AVG((metric_data->'ai_costs_metrics'->>'roi_score')::NUMERIC), 0)
        ),
        
        'historical_metrics', jsonb_build_object(
            'growing_revenue_tenants', COUNT(CASE WHEN metric_data->'historical_metrics'->>'revenue_trend' = 'growing' THEN 1 END),
            'stable_efficiency_tenants', COUNT(CASE WHEN metric_data->'historical_metrics'->>'efficiency_trend' = 'stable' THEN 1 END),
            'rapid_growth_tenants', COUNT(CASE WHEN metric_data->'historical_metrics'->>'customer_growth_trend' = 'rapid_growth' THEN 1 END),
            'avg_seasonal_performance_index', COALESCE(AVG((metric_data->'historical_metrics'->>'seasonal_performance_index')::NUMERIC), 0),
            'avg_performance_consistency_score', COALESCE(AVG((metric_data->'historical_metrics'->>'performance_consistency_score')::NUMERIC), 0)
        ),
        
        'platform_participation', jsonb_build_object(
            'total_participation_score', COALESCE(SUM((metric_data->'platform_participation'->>'revenue_participation_pct')::NUMERIC), 0),
            'avg_ai_participation', COALESCE(AVG((metric_data->'platform_participation'->>'ai_participation_pct')::NUMERIC), 0),
            'avg_revenue_participation', COALESCE(AVG((metric_data->'platform_participation'->>'revenue_participation_pct')::NUMERIC), 0),
            'avg_customers_participation', COALESCE(AVG((metric_data->'platform_participation'->>'customers_participation_pct')::NUMERIC), 0),
            'avg_appointments_participation', COALESCE(AVG((metric_data->'platform_participation'->>'appointments_participation_pct')::NUMERIC), 0)
        )
    )
    INTO aggregated_data
    FROM tenant_metrics 
    WHERE period = p_period 
    AND metric_type = 'comprehensive'
    AND metric_data IS NOT NULL;

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