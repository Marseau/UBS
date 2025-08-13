-- =====================================================
-- UNIFIED TENANT METRICS FUNCTION - CORRECTED VERSION
-- Fixes: start_time, conversation_context, revenue logic, subscription_payments
-- Supports: 7d, 30d, 90d periods
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_unified_corrected(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
    v_period_days INTEGER;
    
BEGIN
    RAISE NOTICE 'Starting CORRECTED UNIFIED metrics calculation for date: %', p_calculation_date;
    
    -- =====================================================
    -- PROCESS EACH TENANT FOR ALL PERIODS (7d, 30d, 90d)
    -- =====================================================
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        -- Process for each period
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            DECLARE
                v_start_date DATE;
                v_end_date DATE;
                
                -- Platform totals for this period
                v_platform_revenue DECIMAL(15,2) := 0;
                v_platform_appointments INTEGER := 0;
                v_platform_customers INTEGER := 0;
                v_platform_ai_interactions INTEGER := 0;
                v_platform_conversations INTEGER := 0;
                v_platform_subscription_revenue DECIMAL(15,2) := 0;
                v_platform_active_tenants INTEGER := 0;
                
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
                v_tenant_conversation_duration INTEGER := 0;
                v_tenant_services_total INTEGER := 0;
                v_tenant_services_active INTEGER := 0;
                v_most_popular_service VARCHAR := '';
                v_tenant_subscription_cost DECIMAL(15,2) := 0;
                
                -- Calculated metrics
                v_avg_appointment_value DECIMAL(10,2) := 0;
                v_success_rate DECIMAL(5,2) := 0;
                v_cancellation_rate DECIMAL(5,2) := 0;
                v_conversion_rate DECIMAL(5,2) := 0;
                v_service_utilization_rate DECIMAL(5,2) := 0;
                v_avg_conversation_duration DECIMAL(8,2) := 0;
                
                -- Participation metrics
                v_revenue_participation DECIMAL(5,2) := 0;
                v_appointments_participation DECIMAL(5,2) := 0;
                v_customers_participation DECIMAL(5,2) := 0;
                v_ai_participation DECIMAL(5,2) := 0;
                
                -- UsageCost metrics
                v_usage_cost DECIMAL(10,6) := 0;
                v_ai_cost DECIMAL(10,6) := 0;
                v_conversation_cost DECIMAL(10,6) := 0;
                v_minutes_cost DECIMAL(10,6) := 0;
                v_total_margin DECIMAL(10,2) := 0;
                v_margin_percentage DECIMAL(5,2) := 0;
                v_is_profitable BOOLEAN := false;
                
                -- Business Intelligence
                v_health_score INTEGER := 0;
                v_risk_level VARCHAR(20) := 'Medium';
                
                -- Final JSONB metrics
                v_unified_metrics JSONB;
                
            BEGIN
                -- Calculate period dates
                v_end_date := p_calculation_date;
                v_start_date := p_calculation_date - INTERVAL '1 day' * v_period_days;
                
                -- =====================================================
                -- CALCULATE PLATFORM TOTALS FOR THIS PERIOD
                -- =====================================================
                
                -- Platform appointment revenue (CORRECTED: use start_time)
                SELECT COALESCE(SUM(
                    CASE 
                        WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                        ELSE COALESCE(final_price, 0)
                    END
                ), 0)
                INTO v_platform_revenue
                FROM appointments 
                WHERE start_time >= v_start_date AND start_time <= v_end_date
                AND status IN ('completed', 'confirmed')
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform appointments (CORRECTED: use start_time)
                SELECT COUNT(*)
                INTO v_platform_appointments
                FROM appointments 
                WHERE start_time >= v_start_date AND start_time <= v_end_date
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform customers (CORRECTED: use start_time)
                SELECT COUNT(DISTINCT user_id)
                INTO v_platform_customers
                FROM appointments 
                WHERE start_time >= v_start_date AND start_time <= v_end_date
                AND user_id IS NOT NULL
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform subscription revenue (CORRECTED: from subscription_payments)
                SELECT COALESCE(SUM(amount), 0)
                INTO v_platform_subscription_revenue
                FROM subscription_payments 
                WHERE payment_date >= v_start_date AND payment_date <= v_end_date
                AND payment_status = 'completed'
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform conversations (CORRECTED: count distinct conversation_context)
                SELECT COUNT(DISTINCT conversation_context)
                INTO v_platform_conversations
                FROM conversation_history 
                WHERE created_at >= v_start_date AND created_at <= v_end_date
                AND conversation_context IS NOT NULL
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform AI interactions (messages from system)
                SELECT COUNT(*)
                INTO v_platform_ai_interactions
                FROM conversation_history 
                WHERE created_at >= v_start_date AND created_at <= v_end_date
                AND is_from_user = false
                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                
                -- Platform active tenants
                SELECT COUNT(DISTINCT tenant_id)
                INTO v_platform_active_tenants
                FROM appointments 
                WHERE start_time >= v_start_date AND start_time <= v_end_date;
                
                -- =====================================================
                -- COLLECT TENANT RAW DATA (CORRECTED)
                -- =====================================================
                
                -- Appointments breakdown (CORRECTED: use start_time + quoted_price logic)
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0),
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
                  AND start_time >= v_start_date AND start_time <= v_end_date
                  AND status IN ('completed', 'confirmed'); -- Only count revenue from these statuses
                
                -- All appointments for other metrics (not just completed/confirmed)
                SELECT COUNT(*), COUNT(DISTINCT user_id)
                INTO v_tenant_appointments, v_tenant_customers
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date AND start_time <= v_end_date;
                
                -- Tenant subscription cost (CORRECTED: from subscription_payments)
                SELECT COALESCE(SUM(amount), 0)
                INTO v_tenant_subscription_cost
                FROM subscription_payments 
                WHERE tenant_id = v_tenant_record.id
                  AND payment_date >= v_start_date AND payment_date <= v_end_date
                  AND payment_status = 'completed';
                
                -- AI interactions and conversations (CORRECTED: use conversation_context)
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context),
                    COALESCE(SUM(duration_minutes), 0)
                INTO v_tenant_ai_interactions, v_tenant_conversations, v_tenant_conversation_duration
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date AND created_at <= v_end_date
                  AND conversation_context IS NOT NULL;
                
                -- Services data
                SELECT 
                    COUNT(*),
                    COUNT(CASE WHEN is_active = true THEN 1 END)
                INTO v_tenant_services_total, v_tenant_services_active
                FROM services 
                WHERE tenant_id = v_tenant_record.id;
                
                -- Most popular service (CORRECTED: use start_time)
                SELECT s.name
                INTO v_most_popular_service
                FROM services s
                JOIN appointments a ON a.service_id = s.id
                WHERE s.tenant_id = v_tenant_record.id
                  AND a.start_time >= v_start_date AND a.start_time <= v_end_date
                GROUP BY s.id, s.name
                ORDER BY COUNT(*) DESC
                LIMIT 1;
                
                -- =====================================================
                -- CALCULATE DERIVED METRICS (CORRECTED)
                -- =====================================================
                
                -- Financial metrics
                v_avg_appointment_value := CASE WHEN v_tenant_appointments > 0 
                    THEN v_tenant_revenue / v_tenant_appointments ELSE 0 END;
                
                -- Performance metrics
                v_success_rate := CASE WHEN v_tenant_appointments > 0 
                    THEN (v_tenant_completed * 100.0 / v_tenant_appointments) ELSE 0 END;
                v_cancellation_rate := CASE WHEN v_tenant_appointments > 0 
                    THEN (v_tenant_cancelled * 100.0 / v_tenant_appointments) ELSE 0 END;
                v_conversion_rate := CASE WHEN v_tenant_conversations > 0 
                    THEN (v_tenant_appointments * 100.0 / v_tenant_conversations) ELSE 0 END;
                v_service_utilization_rate := CASE WHEN v_tenant_services_total > 0 
                    THEN ((SELECT COUNT(DISTINCT service_id) FROM appointments 
                           WHERE tenant_id = v_tenant_record.id AND start_time >= v_start_date) * 100.0 / v_tenant_services_total) 
                    ELSE 0 END;
                
                -- Conversation metrics (CORRECTED: use duration_minutes)
                v_avg_conversation_duration := CASE WHEN v_tenant_conversations > 0 
                    THEN v_tenant_conversation_duration::DECIMAL / v_tenant_conversations ELSE 0 END;
                
                -- Participation metrics
                v_revenue_participation := CASE WHEN v_platform_revenue > 0 
                    THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END;
                v_appointments_participation := CASE WHEN v_platform_appointments > 0 
                    THEN (v_tenant_appointments::DECIMAL / v_platform_appointments * 100) ELSE 0 END;
                v_customers_participation := CASE WHEN v_platform_customers > 0 
                    THEN (v_tenant_customers::DECIMAL / v_platform_customers * 100) ELSE 0 END;
                v_ai_participation := CASE WHEN v_platform_ai_interactions > 0 
                    THEN (v_tenant_ai_interactions::DECIMAL / v_platform_ai_interactions * 100) ELSE 0 END;
                
                -- UsageCost metrics (using real conversation duration)
                v_ai_cost := v_tenant_ai_interactions * 0.02; -- $0.02 per AI call
                v_conversation_cost := v_tenant_conversations * 0.007; -- $0.007 per conversation
                v_minutes_cost := v_tenant_conversation_duration * 0.001; -- $0.001 per minute (real duration)
                v_usage_cost := v_ai_cost + v_conversation_cost + v_minutes_cost;
                v_total_margin := v_tenant_subscription_cost - v_usage_cost; -- Platform cost vs usage cost
                v_margin_percentage := CASE WHEN v_tenant_subscription_cost > 0 
                    THEN (v_total_margin / v_tenant_subscription_cost * 100) ELSE 0 END;
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
                        'tenant_revenue', v_tenant_revenue,
                        'platform_subscription_cost', v_tenant_subscription_cost,
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
                        'ai_interactions_total', v_tenant_ai_interactions,
                        'conversation_duration_minutes', v_tenant_conversation_duration,
                        'avg_conversation_duration', v_avg_conversation_duration,
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
                        'efficiency_score', (v_success_rate + v_conversion_rate) / 2,
                        'growth_trend', 'stable' -- TODO: Calculate trend in next version
                    ),
                    'usage_cost_breakdown', jsonb_build_object(
                        'ai_cost_usd', v_ai_cost,
                        'conversation_cost_usd', v_conversation_cost,
                        'minutes_cost_usd', v_minutes_cost,
                        'conversation_duration_minutes', v_tenant_conversation_duration
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'data_source', 'unified_function_corrected_v1',
                        'platform_totals', jsonb_build_object(
                            'appointment_revenue', v_platform_revenue,
                            'subscription_revenue', v_platform_subscription_revenue,
                            'appointments', v_platform_appointments,
                            'customers', v_platform_customers,
                            'ai_interactions', v_platform_ai_interactions,
                            'conversations', v_platform_conversations,
                            'active_tenants', v_platform_active_tenants
                        )
                    )
                );
                
                -- =====================================================
                -- STORE UNIFIED METRICS FOR THIS PERIOD
                -- =====================================================
                
                PERFORM store_tenant_metric(
                    v_tenant_record.id,
                    'comprehensive',
                    v_unified_metrics,
                    v_period_days || 'd'
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
                        'usage_cost', v_usage_cost,
                        'subscription_cost', v_tenant_subscription_cost
                    ),
                    v_period_days || 'd'
                );
                
                -- Store participation as separate metric type
                PERFORM store_tenant_metric(
                    v_tenant_record.id,
                    'participation',
                    jsonb_build_object(
                        'revenue_participation_pct', v_revenue_participation,
                        'appointments_participation_pct', v_apartments_participation,
                        'customers_participation_pct', v_customers_participation,
                        'ai_participation_pct', v_ai_participation,
                        'period_days', v_period_days
                    ),
                    v_period_days || 'd'
                );
                
                RAISE NOTICE 'Processed tenant % for %d period: Revenue=%, Health=%, Conversations=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days,
                    v_tenant_revenue, v_health_score, v_tenant_conversations;
                    
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Error processing tenant % for %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        
    END LOOP; -- End tenant loop
    
    -- =====================================================
    -- RETURN RESULT
    -- =====================================================
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', v_processed_count * 3 * 3, -- tenants * periods * metric_types
        'calculation_date', p_calculation_date,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'CORRECTED UNIFIED calculation completed: % tenants × 3 periods × 3 metric types = % total metrics in %ms', 
        v_processed_count, 
        v_processed_count * 3 * 3,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR in CORRECTED UNIFIED metrics calculation: % - %', SQLSTATE, SQLERRM;
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

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_unified_corrected(date, uuid) TO authenticated;

-- =====================================================
-- CRONJOB FUNCTION FOR AUTOMATED EXECUTION
-- =====================================================

CREATE OR REPLACE FUNCTION run_tenant_metrics_cronjob()
RETURNS json AS $$
DECLARE
    v_result json;
    v_start_time TIMESTAMP := clock_timestamp();
BEGIN
    RAISE NOTICE 'Starting automated tenant metrics cronjob at %', v_start_time;
    
    -- Execute for all tenants, all periods
    SELECT calculate_tenant_metrics_unified_corrected(CURRENT_DATE, NULL)
    INTO v_result;
    
    RAISE NOTICE 'Cronjob completed in %ms', 
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time);
    
    RETURN jsonb_build_object(
        'cronjob_started_at', v_start_time,
        'cronjob_completed_at', clock_timestamp(),
        'execution_result', v_result::jsonb
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION run_tenant_metrics_cronjob() TO authenticated;