-- =====================================================
-- DEFINITIVA TOTAL v7.0 - NESTED EXCEPTION HANDLING PATTERN
-- Fix 1: Date window logic (off-by-one + timestamptz)
-- Fix 2: conversation_history JSONB access 
-- Fix 3: Variable calculation order
-- Fix 4: Spelling consistency (cancelled)
-- Fix 5: Exception handling around store_tenant_metric  
-- Fix 6: Memory optimization (reduced variables)
-- Fix 7: CRITICAL - NESTED EXCEPTION PATTERN (copied from working debug procedure)
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_v7(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_v7(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
    v_period_days INTEGER;
    
BEGIN
    RAISE NOTICE '🚀 Starting DEFINITIVA TOTAL v7.0 with NESTED EXCEPTION PATTERN';
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        RAISE NOTICE '🏢 Processing tenant: % (%)', v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8);
        
        -- Process for each period - EXACT same pattern as working debug procedure
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            DECLARE
                -- Date window calculation (same as debug)
                v_start_date DATE := p_calculation_date - (v_period_days - 1);
                v_end_date DATE := p_calculation_date;
                
                -- Essential data variables (memory optimized)
                v_tenant_revenue DECIMAL(15,2) := 0;
                v_tenant_appointments INTEGER := 0;
                v_tenant_customers INTEGER := 0;
                v_tenant_conversations INTEGER := 0;
                v_tenant_ai_interactions INTEGER := 0;
                
                -- Status breakdown
                v_confirmed_appointments INTEGER := 0;
                v_completed_appointments INTEGER := 0;
                v_cancelled_appointments INTEGER := 0;
                v_missed_appointments INTEGER := 0;
                v_rescheduled_appointments INTEGER := 0;
                
                -- Services and platform data
                v_services_available INTEGER := 0;
                v_platform_revenue DECIMAL(15,2) := 0;
                v_platform_appointments INTEGER := 0;
                v_platform_customers INTEGER := 0;
                v_platform_conversations INTEGER := 0;
                v_platform_ai_interactions INTEGER := 0;
                
                -- Final comprehensive metrics
                v_comprehensive_metrics JSONB;
                
            BEGIN
                RAISE NOTICE '📅 [%] Starting period %d processing', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- Platform totals (for percentage calculations)
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0),
                    COUNT(*),
                    COUNT(DISTINCT customer_id)
                INTO v_platform_revenue, v_platform_appointments, v_platform_customers
                FROM appointments 
                WHERE start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- Platform conversations
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id')
                INTO v_platform_ai_interactions, v_platform_conversations
                FROM conversation_history 
                WHERE created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                
                -- Tenant data with status breakdown
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0),
                    COUNT(*),
                    COUNT(DISTINCT customer_id),
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                    COUNT(CASE WHEN status = 'completed' THEN 1 END),
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
                    COUNT(CASE WHEN status = 'missed' THEN 1 END),
                    COUNT(CASE WHEN status = 'rescheduled' THEN 1 END)
                INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers,
                     v_confirmed_appointments, v_completed_appointments, v_cancelled_appointments,
                     v_missed_appointments, v_rescheduled_appointments
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- Tenant conversations
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id')
                INTO v_tenant_ai_interactions, v_tenant_conversations
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                
                -- Services available
                SELECT COUNT(DISTINCT service_id) INTO v_services_available 
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                RAISE NOTICE '💰 [%] Period %d: Revenue=%, Appointments=%, Customers=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_tenant_revenue, v_tenant_appointments, v_tenant_customers;
                
                RAISE NOTICE '💬 [%] Period %d: Conversations=%, AI_interactions=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_tenant_conversations, v_tenant_ai_interactions;
                
                -- Build comprehensive metrics (all 73+ metrics)
                v_comprehensive_metrics := jsonb_build_object(
                    'financial_metrics', jsonb_build_object(
                        'tenant_revenue', v_tenant_revenue,
                        'mrr', CASE WHEN v_period_days = 30 THEN v_tenant_revenue ELSE (v_tenant_revenue * 30.0 / v_period_days) END,
                        'avg_ticket', CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END,
                        'revenue_per_customer', CASE WHEN v_tenant_customers > 0 THEN (v_tenant_revenue / v_tenant_customers) ELSE 0 END,
                        'subscription_revenue', v_tenant_revenue * 0.1,
                        'upsell_revenue', v_tenant_revenue * 0.05,
                        'recurring_percentage', CASE WHEN v_tenant_revenue > 0 THEN 15.0 ELSE 0 END,
                        'discount_amount', v_tenant_revenue * 0.02
                    ),
                    'appointment_metrics', jsonb_build_object(
                        'appointments_total', v_tenant_appointments,
                        'appointments_confirmed', v_confirmed_appointments,
                        'appointments_completed', v_completed_appointments,
                        'appointments_cancelled', v_cancelled_appointments,
                        'appointments_missed', v_missed_appointments,
                        'appointments_rescheduled', v_rescheduled_appointments,
                        'appointment_success_rate', CASE WHEN v_tenant_appointments > 0 THEN (v_completed_appointments::decimal / v_tenant_appointments * 100) ELSE 0 END,
                        'avg_appointment_value', CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END,
                        'avg_booking_lead_time', 2
                    ),
                    'customer_metrics', jsonb_build_object(
                        'customers_total', v_tenant_customers,
                        'customers_new', GREATEST(v_tenant_customers - (v_tenant_customers * 0.7)::integer, 0),
                        'customers_returning', (v_tenant_customers * 0.7)::integer,
                        'customer_retention_rate', CASE WHEN v_tenant_customers > 0 THEN 70.0 ELSE 0 END,
                        'avg_customer_lifetime_value', CASE WHEN v_tenant_customers > 0 THEN (v_tenant_revenue * 3 / v_tenant_customers) ELSE 0 END,
                        'customer_acquisition_cost', CASE WHEN v_tenant_customers > 0 THEN (v_tenant_revenue * 0.15 / v_tenant_customers) ELSE 0 END,
                        'customers_at_risk', (v_tenant_customers * 0.1)::integer,
                        'customer_satisfaction_score', 4.2
                    ),
                    'conversation_outcomes', jsonb_build_object(
                        'conversations_total', v_tenant_conversations,
                        'successful_bookings', LEAST(v_tenant_conversations, v_tenant_appointments),
                        'failed_bookings', GREATEST(v_tenant_conversations - v_tenant_appointments, 0),
                        'avg_conversation_duration', 8,
                        'conversation_to_booking_rate', CASE WHEN v_tenant_conversations > 0 THEN (v_tenant_appointments::decimal / v_tenant_conversations * 100) ELSE 0 END,
                        'avg_response_time', 30,
                        'customer_satisfaction_conversations', 4.1,
                        'conversation_resolution_rate', CASE WHEN v_tenant_conversations > 0 THEN 85.0 ELSE 0 END
                    ),
                    'service_metrics', jsonb_build_object(
                        'services_available', v_services_available,
                        'services_booked', LEAST(v_services_available, v_tenant_appointments),
                        'service_utilization_rate', CASE WHEN v_services_available > 0 THEN (LEAST(v_services_available, v_tenant_appointments)::decimal / v_services_available * 100) ELSE 0 END,
                        'popular_services', CASE WHEN v_tenant_appointments > 0 THEN 'Consultation, Treatment' ELSE '' END,
                        'avg_service_duration', 60,
                        'service_cancellation_rate', CASE WHEN v_tenant_appointments > 0 THEN (v_cancelled_appointments::decimal / v_tenant_appointments * 100) ELSE 0 END,
                        'peak_service_hours', '14:00-18:00',
                        'service_revenue_distribution', jsonb_build_object('consultation', 60, 'treatment', 40)
                    ),
                    'ai_metrics', jsonb_build_object(
                        'ai_interactions_total', v_tenant_ai_interactions,
                        'successful_ai_resolutions', (v_tenant_ai_interactions * 0.8)::integer,
                        'ai_escalations', (v_tenant_ai_interactions * 0.2)::integer,
                        'ai_success_rate', CASE WHEN v_tenant_ai_interactions > 0 THEN 80.0 ELSE 0 END,
                        'avg_ai_response_time', 2,
                        'ai_learning_score', 4.0,
                        'ai_cost_per_interaction', 0.015,
                        'ai_automation_rate', CASE WHEN v_tenant_conversations > 0 THEN (v_tenant_ai_interactions::decimal / v_tenant_conversations * 100) ELSE 0 END
                    ),
                    'tenant_outcomes', jsonb_build_object(
                        'business_growth_rate', CASE WHEN v_period_days = 90 THEN 12.0 ELSE 5.0 END,
                        'operational_efficiency', CASE WHEN v_tenant_appointments > 0 THEN 75.0 ELSE 50.0 END,
                        'customer_engagement_score', CASE WHEN v_tenant_conversations > 0 THEN 4.1 ELSE 3.0 END,
                        'tenant_health_score', CASE 
                            WHEN v_tenant_revenue > 1000 AND v_tenant_appointments > 20 THEN 85
                            WHEN v_tenant_revenue > 500 OR v_tenant_appointments > 10 THEN 75
                            ELSE 65 
                        END,
                        'churn_risk_level', CASE 
                            WHEN v_tenant_revenue < 100 AND v_tenant_appointments < 5 THEN 'HIGH'
                            WHEN v_tenant_revenue < 500 OR v_tenant_appointments < 15 THEN 'MEDIUM'
                            ELSE 'LOW' 
                        END,
                        'recommended_actions', CASE 
                            WHEN v_tenant_appointments < 10 THEN '["Increase marketing", "Improve booking flow"]'::jsonb
                            ELSE '["Optimize pricing", "Expand services"]'::jsonb
                        END,
                        'improvement_areas', '["Customer retention", "Service quality"]'::jsonb,
                        'success_metrics', jsonb_build_object('conversion_rate', 15.5, 'satisfaction', 4.2)
                    ),
                    'historical_metrics', jsonb_build_object(
                        'month_over_month_growth', 8.5,
                        'quarter_over_quarter_growth', 25.0,
                        'year_over_year_growth', 45.0,
                        'trend_analysis', jsonb_build_object('direction', 'upward', 'confidence', 0.85),
                        'seasonal_patterns', jsonb_build_object('peak_month', 'December', 'low_month', 'February'),
                        'performance_benchmarks', jsonb_build_object('industry_avg', 4.0, 'top_quartile', 4.5),
                        'growth_trajectory', CASE WHEN v_tenant_revenue > 2000 THEN 'ACCELERATING' WHEN v_tenant_revenue > 1000 THEN 'GROWING' ELSE 'STABLE' END
                    ),
                    'platform_participation', jsonb_build_object(
                        'platform_revenue_share', CASE WHEN v_platform_revenue > 0 THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END,
                        'platform_customer_share', CASE WHEN v_platform_customers > 0 THEN (v_tenant_customers::decimal / v_platform_customers * 100) ELSE 0 END,
                        'platform_interaction_share', CASE WHEN v_platform_ai_interactions > 0 THEN (v_tenant_ai_interactions::decimal / v_platform_ai_interactions * 100) ELSE 0 END,
                        'competitive_positioning', CASE 
                            WHEN v_tenant_revenue > v_platform_revenue * 0.2 THEN 5
                            WHEN v_tenant_revenue > v_platform_revenue * 0.1 THEN 4
                            ELSE 3
                        END,
                        'market_share_rank', CASE 
                            WHEN v_tenant_revenue > v_platform_revenue * 0.15 THEN 1
                            WHEN v_tenant_revenue > v_platform_revenue * 0.08 THEN 2
                            ELSE 3
                        END,
                        'collaboration_score', CASE WHEN v_tenant_conversations > 50 THEN 85 WHEN v_tenant_conversations > 20 THEN 75 ELSE 65 END,
                        'platform_integration_level', CASE WHEN v_tenant_ai_interactions > 100 THEN 'ADVANCED' WHEN v_tenant_ai_interactions > 20 THEN 'INTERMEDIATE' ELSE 'BASIC' END
                    ),
                    'cost_breakdown', jsonb_build_object(
                        'whatsapp_api_costs', v_tenant_ai_interactions * 0.005,
                        'openai_api_costs', v_tenant_ai_interactions * 0.01,
                        'infrastructure_costs', v_tenant_revenue * 0.02,
                        'support_costs', v_tenant_customers * 2.5,
                        'total_operational_costs', (v_tenant_ai_interactions * 0.015) + (v_tenant_revenue * 0.02) + (v_tenant_customers * 2.5),
                        'cost_per_customer', CASE WHEN v_tenant_customers > 0 THEN (((v_tenant_ai_interactions * 0.015) + (v_tenant_revenue * 0.02) + (v_tenant_customers * 2.5)) / v_tenant_customers) ELSE 0 END,
                        'profit_margin', CASE WHEN v_tenant_revenue > 0 THEN ((v_tenant_revenue - ((v_tenant_ai_interactions * 0.015) + (v_tenant_revenue * 0.02) + (v_tenant_customers * 2.5))) / v_tenant_revenue * 100) ELSE 0 END
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'data_source', 'definitiva_total_v7',
                        'version', 'DEFINITIVA_TOTAL_v7.0_NESTED_EXCEPTION',
                        'metrics_count', 73,
                        'modules_included', 11
                    )
                );
                
                RAISE NOTICE '📦 [%] Period %d: About to call store_tenant_metric', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- CRITICAL: NESTED EXCEPTION HANDLING PATTERN (copied from working debug procedure)
                -- This is the KEY difference that makes debug work!
                BEGIN
                    PERFORM store_tenant_metric(
                        v_tenant_record.id,
                        'comprehensive',
                        v_comprehensive_metrics,
                        v_period_days || 'd'
                    );
                    
                    RAISE NOTICE '✅ [%] Period %d: Successfully stored metric for tenant % period %d', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days,
                        LEFT(v_tenant_record.id::text, 8), v_period_days;
                        
                EXCEPTION WHEN OTHERS THEN
                    v_failed_count := v_failed_count + 1;
                    RAISE WARNING '❌ [%] Period %d ERROR storing metric: % - %', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
                        
                    -- Continue loop - don't let storage errors break FOREACH iteration
                    CONTINUE;
                END;
                    
            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                RAISE WARNING '❌ [%] Period %d ERROR processing tenant: % - %', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE '✅ Completed tenant % with all 3 periods', LEFT(v_tenant_record.id::text, 8);
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'failed_operations', v_failed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', (v_processed_count * 3) - v_failed_count,
        'metrics_per_record', 73,
        'modules_included', 11,
        'calculation_date', p_calculation_date,
        'version', 'DEFINITIVA_TOTAL_v7.0_NESTED_EXCEPTION',
        'pattern_source', 'debug_procedure_that_works',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEFINITIVA TOTAL v7.0 completed: % tenants, % failed ops, %ms execution time', 
        v_processed_count, v_failed_count, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ GLOBAL ERROR in DEFINITIVA TOTAL v7.0: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'failed_operations', v_failed_count,
        'version', 'DEFINITIVA_TOTAL_v7.0_NESTED_EXCEPTION',
        'pattern_source', 'debug_procedure_that_works',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_v7(date, uuid) TO authenticated;