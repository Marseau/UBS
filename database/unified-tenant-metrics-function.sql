-- =====================================================
-- UNIFIED TENANT METRICS FUNCTION
-- Consolidates ALL metrics from existing procedures into JSONB compatible format
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_unified(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_period_days integer DEFAULT 30,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
    
    -- Platform totals (calculated once)
    v_platform_revenue DECIMAL(15,2) := 0;
    v_platform_appointments INTEGER := 0;
    v_platform_customers INTEGER := 0;
    v_platform_ai_interactions INTEGER := 0;
    v_platform_conversations INTEGER := 0;
    v_platform_active_tenants INTEGER := 0;
    
BEGIN
    -- Calculate period dates
    v_end_date := p_calculation_date;
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    RAISE NOTICE 'Calculating UNIFIED metrics for period % to % (% days)', v_start_date, v_end_date, p_period_days;
    
    -- =====================================================
    -- 1. CALCULATE PLATFORM TOTALS FIRST
    -- =====================================================
    
    -- Platform revenue
    SELECT COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0)
    INTO v_platform_revenue
    FROM appointments 
    WHERE created_at >= v_start_date AND created_at <= v_end_date
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Platform appointments
    SELECT COUNT(*)
    INTO v_platform_appointments
    FROM appointments 
    WHERE created_at >= v_start_date AND created_at <= v_end_date
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Platform customers
    SELECT COUNT(DISTINCT user_id)
    INTO v_platform_customers
    FROM appointments 
    WHERE created_at >= v_start_date AND created_at <= v_end_date
    AND user_id IS NOT NULL
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Platform AI interactions
    SELECT COUNT(*)
    INTO v_platform_ai_interactions
    FROM conversation_history 
    WHERE created_at >= v_start_date AND created_at <= v_end_date
    AND is_from_user = false
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Platform conversations
    SELECT COUNT(*)
    INTO v_platform_conversations
    FROM conversation_history 
    WHERE created_at >= v_start_date AND created_at <= v_end_date
    AND is_from_user = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Platform active tenants
    SELECT COUNT(DISTINCT tenant_id)
    INTO v_platform_active_tenants
    FROM appointments 
    WHERE created_at >= v_start_date AND created_at <= v_end_date;
    
    -- =====================================================
    -- 2. PROCESS EACH TENANT
    -- =====================================================
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        DECLARE
            -- Tenant metrics variables
            v_tenant_revenue DECIMAL(15,2) := 0;
            v_tenant_appointments INTEGER := 0;
            v_tenant_confirmed INTEGER := 0;
            v_tenant_cancelled INTEGER := 0;
            v_tenant_completed INTEGER := 0;
            v_tenant_pending INTEGER := 0;
            v_tenant_rescheduled INTEGER := 0;
            v_tenant_customers INTEGER := 0;
            v_tenant_new_customers INTEGER := 0;
            v_tenant_ai_interactions INTEGER := 0;
            v_tenant_conversations INTEGER := 0;
            v_tenant_valid_conversations INTEGER := 0;
            v_tenant_spam_conversations INTEGER := 0;
            v_tenant_services_total INTEGER := 0;
            v_tenant_services_active INTEGER := 0;
            v_most_popular_service VARCHAR := '';
            
            -- Calculated metrics
            v_avg_appointment_value DECIMAL(10,2) := 0;
            v_success_rate DECIMAL(5,2) := 0;
            v_cancellation_rate DECIMAL(5,2) := 0;
            v_ai_success_rate DECIMAL(5,2) := 0;
            v_conversion_rate DECIMAL(5,2) := 0;
            v_service_utilization_rate DECIMAL(5,2) := 0;
            
            -- Participation metrics
            v_revenue_participation DECIMAL(5,2) := 0;
            v_appointments_participation DECIMAL(5,2) := 0;
            v_customers_participation DECIMAL(5,2) := 0;
            v_ai_participation DECIMAL(5,2) := 0;
            
            -- UsageCost metrics
            v_usage_cost DECIMAL(10,6) := 0;
            v_ai_cost DECIMAL(10,6) := 0;
            v_conversation_cost DECIMAL(10,6) := 0;
            v_chat_minutes INTEGER := 0;
            v_minutes_cost DECIMAL(10,6) := 0;
            v_total_margin DECIMAL(10,2) := 0;
            v_margin_percentage DECIMAL(5,2) := 0;
            v_is_profitable BOOLEAN := false;
            
            -- AI Costs metrics (NEW - CRÍTICO)
            v_ai_total_tokens INTEGER := 0;
            v_ai_total_cost_usd DECIMAL(10,6) := 0;
            v_ai_avg_cost_per_conversation DECIMAL(10,6) := 0;
            v_ai_efficiency_score DECIMAL(3,2) := 0;
            
            -- Conversation Outcomes metrics (NEW - MUITO IMPORTANTE)
            v_successful_outcomes INTEGER := 0;
            v_success_rate_pct DECIMAL(5,2) := 0;
            v_avg_satisfaction_score DECIMAL(3,2) := 0;
            v_resolution_rate_pct DECIMAL(5,2) := 0;
            v_business_outcomes_achieved INTEGER := 0;
            v_avg_ai_confidence DECIMAL(3,2) := 0;
            
            -- Business Intelligence
            v_health_score INTEGER := 0;
            v_risk_level VARCHAR(20) := 'Medium';
            
            -- Final JSONB metrics
            v_unified_metrics JSONB;
            
        BEGIN
            -- =====================================================
            -- COLLECT TENANT RAW DATA
            -- =====================================================
            
            -- Appointments breakdown
            SELECT 
                COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0),
                COUNT(*),
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
                COUNT(CASE WHEN status = 'completed' THEN 1 END),
                COUNT(CASE WHEN status = 'pending' THEN 1 END),
                COUNT(CASE WHEN status = 'rescheduled' THEN 1 END),
                COUNT(DISTINCT user_id)
            INTO v_tenant_revenue, v_tenant_appointments, v_tenant_confirmed, 
                 v_tenant_cancelled, v_tenant_completed, v_tenant_pending,
                 v_tenant_rescheduled, v_tenant_customers
            FROM appointments 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date AND created_at <= v_end_date;
            
            -- AI interactions and conversations
            SELECT 
                COUNT(CASE WHEN is_from_user = false THEN 1 END),
                COUNT(CASE WHEN is_from_user = true THEN 1 END),
                COUNT(CASE WHEN is_from_user = true AND confidence_score >= 0.7 THEN 1 END),
                COUNT(CASE WHEN is_from_user = true AND (confidence_score < 0.7 OR confidence_score IS NULL) THEN 1 END)
            INTO v_tenant_ai_interactions, v_tenant_conversations, 
                 v_tenant_valid_conversations, v_tenant_spam_conversations
            FROM conversation_history 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date AND created_at <= v_end_date;
            
            -- Services data
            SELECT 
                COUNT(*),
                COUNT(CASE WHEN is_active = true THEN 1 END)
            INTO v_tenant_services_total, v_tenant_services_active
            FROM services 
            WHERE tenant_id = v_tenant_record.id;
            
            -- Most popular service
            SELECT s.name
            INTO v_most_popular_service
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = v_tenant_record.id
              AND a.created_at >= v_start_date AND a.created_at <= v_end_date
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC
            LIMIT 1;
            
            -- =====================================================
            -- CALCULATE DERIVED METRICS
            -- =====================================================
            
            -- Financial metrics
            v_avg_appointment_value := CASE WHEN v_tenant_appointments > 0 
                THEN v_tenant_revenue / v_tenant_appointments ELSE 0 END;
            
            -- Performance metrics
            v_success_rate := CASE WHEN v_tenant_appointments > 0 
                THEN (v_tenant_completed * 100.0 / v_tenant_appointments) ELSE 0 END;
            v_cancellation_rate := CASE WHEN v_tenant_appointments > 0 
                THEN (v_tenant_cancelled * 100.0 / v_tenant_appointments) ELSE 0 END;
            v_ai_success_rate := CASE WHEN v_tenant_conversations > 0 
                THEN (v_tenant_valid_conversations * 100.0 / v_tenant_conversations) ELSE 0 END;
            v_conversion_rate := CASE WHEN v_tenant_conversations > 0 
                THEN (v_tenant_appointments * 100.0 / v_tenant_conversations) ELSE 0 END;
            v_service_utilization_rate := CASE WHEN v_tenant_services_total > 0 
                THEN ((SELECT COUNT(DISTINCT service_id) FROM appointments 
                       WHERE tenant_id = v_tenant_record.id AND created_at >= v_start_date) * 100.0 / v_tenant_services_total) 
                ELSE 0 END;
            
            -- Participation metrics
            v_revenue_participation := CASE WHEN v_platform_revenue > 0 
                THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END;
            v_appointments_participation := CASE WHEN v_platform_appointments > 0 
                THEN (v_tenant_appointments::DECIMAL / v_platform_appointments * 100) ELSE 0 END;
            v_customers_participation := CASE WHEN v_platform_customers > 0 
                THEN (v_tenant_customers::DECIMAL / v_platform_customers * 100) ELSE 0 END;
            v_ai_participation := CASE WHEN v_platform_ai_interactions > 0 
                THEN (v_tenant_ai_interactions::DECIMAL / v_platform_ai_interactions * 100) ELSE 0 END;
            
            -- UsageCost metrics (from existing successful function)
            v_chat_minutes := v_tenant_conversations * 5; -- 5 min per conversation estimate
            v_ai_cost := v_tenant_ai_interactions * 0.02; -- $0.02 per AI call
            v_conversation_cost := v_tenant_conversations * 0.007; -- $0.007 per conversation
            v_minutes_cost := v_chat_minutes * 0.001; -- $0.001 per minute
            v_usage_cost := v_ai_cost + v_conversation_cost + v_minutes_cost;
            v_total_margin := v_tenant_revenue - v_usage_cost;
            v_margin_percentage := CASE WHEN v_tenant_revenue > 0 
                THEN (v_total_margin / v_tenant_revenue * 100) ELSE 0 END;
            v_is_profitable := (v_total_margin > 0);
            
            -- Business Intelligence
            v_health_score := ROUND((v_revenue_participation * 0.4) + 
                                   (v_appointments_participation * 0.3) + 
                                   (v_customers_participation * 0.2) + 
                                   (v_ai_participation * 0.1));
            v_risk_level := CASE WHEN v_health_score >= 70 THEN 'Low'
                                WHEN v_health_score >= 40 THEN 'Medium'
                                ELSE 'High' END;
            
            -- =====================================================
            -- BUILD UNIFIED JSONB METRICS
            -- =====================================================
            
            v_unified_metrics := jsonb_build_object(
                'financial_metrics', jsonb_build_object(
                    'revenue_monthly', v_tenant_revenue,
                    'revenue_total_period', v_tenant_revenue,
                    'average_appointment_value', v_avg_appointment_value,
                    'usage_cost_usd', v_usage_cost,
                    'total_margin_usd', v_total_margin,
                    'margin_percentage', v_margin_percentage,
                    'is_profitable', v_is_profitable
                ),
                'appointment_metrics', jsonb_build_object(
                    'appointments_total', v_tenant_appointments,
                    'appointments_confirmed', v_tenant_confirmed,
                    'appointments_cancelled', v_tenant_cancelled,
                    'appointments_completed', v_tenant_completed,
                    'appointments_pending', v_tenant_pending,
                    'appointments_rescheduled', v_tenant_rescheduled,
                    'appointment_success_rate', v_success_rate,
                    'cancellation_rate', v_cancellation_rate
                ),
                'customer_metrics', jsonb_build_object(
                    'customers_total', v_tenant_customers,
                    'customers_new', v_tenant_new_customers,
                    'customers_returning', 0, -- TODO: Calculate in next version
                    'customer_retention_rate', 0 -- TODO: Calculate in next version
                ),
                'service_metrics', jsonb_build_object(
                    'services_total', v_tenant_services_total,
                    'services_active', v_tenant_services_active,
                    'most_popular_service', COALESCE(v_most_popular_service, ''),
                    'service_utilization_rate', v_service_utilization_rate,
                    'services_list', (SELECT COALESCE(json_agg(name), '[]'::json) 
                                     FROM services WHERE tenant_id = v_tenant_record.id AND is_active = true)
                ),
                'ai_conversation_metrics', jsonb_build_object(
                    'conversations_total', v_tenant_conversations,
                    'conversations_valid', v_tenant_valid_conversations,
                    'conversations_spam', v_tenant_spam_conversations,
                    'ai_interactions_total', v_tenant_ai_interactions,
                    'ai_success_rate', v_ai_success_rate,
                    'conversion_rate', v_conversion_rate,
                    'avg_response_time', 0 -- TODO: Calculate in next version
                ),
                'platform_participation', jsonb_build_object(
                    'revenue_participation_pct', v_revenue_participation,
                    'appointments_participation_pct', v_appointments_participation,
                    'customers_participation_pct', v_customers_participation,
                    'ai_participation_pct', v_ai_participation,
                    'platform_ranking_position', 1 -- TODO: Calculate ranking in next version
                ),
                'business_intelligence', jsonb_build_object(
                    'health_score', v_health_score,
                    'risk_level', v_risk_level,
                    'efficiency_score', (v_success_rate + v_ai_success_rate + v_conversion_rate) / 3,
                    'growth_trend', 'stable' -- TODO: Calculate trend in next version
                ),
                'usage_cost_breakdown', jsonb_build_object(
                    'ai_cost_usd', v_ai_cost,
                    'conversation_cost_usd', v_conversation_cost,
                    'minutes_cost_usd', v_minutes_cost,
                    'chat_minutes_total', v_chat_minutes
                ),
                'metadata', jsonb_build_object(
                    'calculation_date', p_calculation_date,
                    'period_days', p_period_days,
                    'period_start', v_start_date,
                    'period_end', v_end_date,
                    'data_source', 'unified_function_v1',
                    'platform_totals', jsonb_build_object(
                        'revenue', v_platform_revenue,
                        'appointments', v_platform_appointments,
                        'customers', v_platform_customers,
                        'ai_interactions', v_platform_ai_interactions,
                        'active_tenants', v_platform_active_tenants
                    )
                )
            );
            
            -- =====================================================
            -- STORE UNIFIED METRICS
            -- =====================================================
            
            PERFORM store_tenant_metric(
                v_tenant_record.id,
                'comprehensive',
                v_unified_metrics,
                format('%dd', p_period_days)
            );
            
            -- Store risk assessment as separate metric type
            PERFORM store_tenant_metric(
                v_tenant_record.id,
                'risk_assessment',
                jsonb_build_object(
                    'risk_level', v_risk_level,
                    'health_score', v_health_score,
                    'is_profitable', v_is_profitable,
                    'margin_percentage', v_margin_percentage,
                    'usage_cost', v_usage_cost
                ),
                format('%dd', p_period_days)
            );
            
            -- Store participation as separate metric type
            PERFORM store_tenant_metric(
                v_tenant_record.id,
                'participation',
                jsonb_build_object(
                    'revenue_participation_pct', v_revenue_participation,
                    'appointments_participation_pct', v_appointments_participation,
                    'customers_participation_pct', v_customers_participation,
                    'ai_participation_pct', v_ai_participation
                ),
                format('%dd', p_period_days)
            );
            
            v_processed_count := v_processed_count + 1;
            
            RAISE NOTICE 'Processed tenant %: % (Revenue: %, Health Score: %)', 
                v_tenant_record.business_name, 
                LEFT(v_tenant_record.id::text, 8),
                v_tenant_revenue,
                v_health_score;
                
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing tenant %: %', v_tenant_record.id, SQLERRM;
        END;
    END LOOP;
    
    -- =====================================================
    -- 3. RETURN RESULT
    -- =====================================================
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'calculation_date', p_calculation_date,
        'period_days', p_period_days,
        'platform_totals', json_build_object(
            'total_revenue', v_platform_revenue,
            'total_appointments', v_platform_appointments,
            'total_customers', v_platform_customers,
            'total_ai_interactions', v_platform_ai_interactions,
            'active_tenants', v_platform_active_tenants
        ),
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start),
        'metrics_generated', json_build_object(
            'comprehensive', v_processed_count,
            'risk_assessment', v_processed_count,
            'participation', v_processed_count
        )
    );
    
    RAISE NOTICE 'UNIFIED calculation completed: % tenants processed in %ms', 
        v_processed_count, 
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR in UNIFIED metrics calculation: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_unified(date, integer, uuid) TO authenticated;

-- =====================================================
-- USAGE EXAMPLE
-- =====================================================

/*
-- Calculate for all tenants, last 30 days
SELECT calculate_tenant_metrics_unified();

-- Calculate for specific tenant, last 90 days  
SELECT calculate_tenant_metrics_unified(CURRENT_DATE, 90, 'your-tenant-uuid-here');

-- View results
SELECT 
    tenant_id,
    metric_type,
    metric_data->'financial_metrics'->>'revenue_monthly' as revenue,
    metric_data->'business_intelligence'->>'health_score' as health_score,
    calculated_at
FROM tenant_metrics 
WHERE metric_type = 'comprehensive'
ORDER BY calculated_at DESC;
*/