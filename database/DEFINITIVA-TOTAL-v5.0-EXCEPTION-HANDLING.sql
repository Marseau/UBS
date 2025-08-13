-- =====================================================
-- DEFINITIVA TOTAL v5.0 - WITH PROPER EXCEPTION HANDLING
-- Fix 1: Date window logic (off-by-one + timestamptz)
-- Fix 2: conversation_history JSONB access 
-- Fix 3: Variable calculation order
-- Fix 4: Spelling consistency (cancelled)
-- Fix 5: PROPER EXCEPTION HANDLING - Critical fix for silent failures
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_v5(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_v5(
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
    RAISE NOTICE '🚀 Starting DEFINITIVA TOTAL v5.0 with EXCEPTION HANDLING';
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        RAISE NOTICE '🏢 Processing tenant: %', LEFT(v_tenant_record.id::text, 8);
        
        -- Process for each period
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            DECLARE
                -- FIX 1: Correct date window calculation
                v_start_date DATE := p_calculation_date - (v_period_days - 1);
                v_end_date DATE := p_calculation_date;
                
                -- Platform totals for this period
                v_platform_revenue DECIMAL(15,2) := 0;
                v_platform_appointments INTEGER := 0;
                v_platform_customers INTEGER := 0;
                v_platform_ai_interactions INTEGER := 0;
                v_platform_conversations INTEGER := 0;
                v_platform_subscription_revenue DECIMAL(15,2) := 0;
                v_platform_active_tenants INTEGER := 0;
                v_platform_total_messages INTEGER := 0;
                
                -- MODULE 1: FINANCIAL METRICS
                v_tenant_revenue DECIMAL(15,2) := 0;
                v_mrr DECIMAL(15,2) := 0;
                v_avg_ticket DECIMAL(15,2) := 0;
                v_revenue_per_customer DECIMAL(15,2) := 0;
                v_subscription_revenue DECIMAL(15,2) := 0;
                v_upsell_revenue DECIMAL(15,2) := 0;
                v_recurring_percentage DECIMAL(5,2) := 0;
                v_discount_amount DECIMAL(15,2) := 0;
                
                -- MODULE 2: APPOINTMENT METRICS  
                v_tenant_appointments INTEGER := 0;
                v_confirmed_appointments INTEGER := 0;
                v_completed_appointments INTEGER := 0;
                v_cancelled_appointments INTEGER := 0;
                v_missed_appointments INTEGER := 0;
                v_rescheduled_appointments INTEGER := 0;
                v_appointment_success_rate DECIMAL(5,2) := 0;
                v_avg_appointment_value DECIMAL(15,2) := 0;
                v_avg_booking_lead_time INTEGER := 0;
                
                -- MODULE 3: CUSTOMER METRICS
                v_tenant_customers INTEGER := 0;
                v_new_customers INTEGER := 0;
                v_returning_customers INTEGER := 0;
                v_customer_retention_rate DECIMAL(5,2) := 0;
                v_avg_customer_lifetime_value DECIMAL(15,2) := 0;
                v_customer_acquisition_cost DECIMAL(15,2) := 0;
                v_customers_at_risk INTEGER := 0;
                v_customer_satisfaction_score DECIMAL(3,2) := 0;
                
                -- MODULE 4: CONVERSATION OUTCOMES  
                v_tenant_conversations INTEGER := 0;
                v_successful_bookings INTEGER := 0;
                v_failed_bookings INTEGER := 0;
                v_avg_conversation_duration INTEGER := 0;
                v_conversation_to_booking_rate DECIMAL(5,2) := 0;
                v_avg_response_time INTEGER := 0;
                v_customer_satisfaction_conversations DECIMAL(3,2) := 0;
                v_conversation_resolution_rate DECIMAL(5,2) := 0;
                
                -- MODULE 5: SERVICE METRICS
                v_services_available INTEGER := 0;
                v_services_booked INTEGER := 0;
                v_service_utilization_rate DECIMAL(5,2) := 0;
                v_popular_services TEXT := '';
                v_avg_service_duration INTEGER := 0;
                v_service_cancellation_rate DECIMAL(5,2) := 0;
                v_peak_service_hours TEXT := '';
                v_service_revenue_distribution JSONB := '{}';
                
                -- MODULE 6: AI METRICS
                v_tenant_ai_interactions INTEGER := 0;
                v_successful_ai_resolutions INTEGER := 0;
                v_ai_escalations INTEGER := 0;
                v_ai_success_rate DECIMAL(5,2) := 0;
                v_avg_ai_response_time INTEGER := 0;
                v_ai_learning_score DECIMAL(3,2) := 0;
                v_ai_cost_per_interaction DECIMAL(10,4) := 0;
                v_ai_automation_rate DECIMAL(5,2) := 0;
                
                -- MODULE 7: TENANT OUTCOMES
                v_business_growth_rate DECIMAL(5,2) := 0;
                v_operational_efficiency DECIMAL(5,2) := 0;
                v_customer_engagement_score DECIMAL(3,2) := 0;
                v_tenant_health_score INTEGER := 0;
                v_churn_risk_level TEXT := 'LOW';
                v_recommended_actions JSONB := '[]';
                v_improvement_areas JSONB := '[]';
                v_success_metrics JSONB := '{}';
                
                -- MODULE 8: HISTORICAL METRICS
                v_month_over_month_growth DECIMAL(5,2) := 0;
                v_quarter_over_quarter_growth DECIMAL(5,2) := 0;
                v_year_over_year_growth DECIMAL(5,2) := 0;
                v_trend_analysis JSONB := '{}';
                v_seasonal_patterns JSONB := '{}';
                v_performance_benchmarks JSONB := '{}';
                v_growth_trajectory TEXT := 'STABLE';
                
                -- MODULE 9: PLATFORM PARTICIPATION
                v_platform_revenue_share DECIMAL(5,2) := 0;
                v_platform_customer_share DECIMAL(5,2) := 0;
                v_platform_interaction_share DECIMAL(5,2) := 0;
                v_competitive_positioning INTEGER := 0;
                v_market_share_rank INTEGER := 0;
                v_collaboration_score INTEGER := 0;
                v_platform_integration_level TEXT := 'BASIC';
                
                -- MODULE 10: COST BREAKDOWN
                v_whatsapp_api_costs DECIMAL(15,2) := 0;
                v_openai_api_costs DECIMAL(15,2) := 0;
                v_infrastructure_costs DECIMAL(15,2) := 0;
                v_support_costs DECIMAL(15,2) := 0;
                v_total_operational_costs DECIMAL(15,2) := 0;
                v_cost_per_customer DECIMAL(15,2) := 0;
                v_profit_margin DECIMAL(5,2) := 0;
                
                -- Comprehensive metrics JSON
                v_comprehensive_metrics JSONB;
                
            BEGIN
                RAISE NOTICE '📅 Processing period %d days', v_period_days;
                
                -- Calculate platform totals for percentage calculations
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
                -- FIX: < next day instead of <= end day
                WHERE start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- FIX 2: Fixed JSONB access to conversation_history
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id'),
                    COALESCE(SUM((conversation_context->>'duration_minutes')::numeric), 0)::integer
                INTO v_platform_ai_interactions, v_platform_conversations, v_avg_conversation_duration
                FROM conversation_history 
                WHERE created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                
                -- MODULE 1: FINANCIAL METRICS
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0)
                INTO v_tenant_revenue
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- Calculate MRR (Monthly Recurring Revenue approximation)
                v_mrr := CASE WHEN v_period_days = 30 THEN v_tenant_revenue ELSE (v_tenant_revenue * 30.0 / v_period_days) END;
                
                -- MODULE 2: APPOINTMENT METRICS  
                SELECT 
                    COUNT(*),
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                    COUNT(CASE WHEN status = 'completed' THEN 1 END),
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END),  -- FIX 4: Consistent spelling
                    COUNT(CASE WHEN status = 'missed' THEN 1 END),
                    COUNT(CASE WHEN status = 'rescheduled' THEN 1 END)
                INTO v_tenant_appointments, v_confirmed_appointments, v_completed_appointments, 
                     v_cancelled_appointments, v_missed_appointments, v_rescheduled_appointments
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- Calculate appointment success rate
                v_appointment_success_rate := CASE WHEN v_tenant_appointments > 0 
                    THEN (v_completed_appointments::decimal / v_tenant_appointments * 100) 
                    ELSE 0 END;
                
                -- MODULE 3: CUSTOMER METRICS
                SELECT 
                    COUNT(DISTINCT customer_id)
                INTO v_tenant_customers
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- MODULE 4: CONVERSATION OUTCOMES
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id')
                INTO v_tenant_ai_interactions, v_tenant_conversations
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                
                -- FIX 3: Calculate dependent variables after base calculations
                v_avg_ticket := CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END;
                v_revenue_per_customer := CASE WHEN v_tenant_customers > 0 THEN (v_tenant_revenue / v_tenant_customers) ELSE 0 END;
                
                -- MODULE 5: SERVICE METRICS
                SELECT COUNT(DISTINCT service_id) INTO v_services_available 
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                -- Calculate platform percentages (avoid division by zero)
                v_platform_revenue_share := CASE WHEN v_platform_revenue > 0 THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END;
                v_platform_customer_share := CASE WHEN v_platform_customers > 0 THEN (v_tenant_customers::decimal / v_platform_customers * 100) ELSE 0 END;
                v_platform_interaction_share := CASE WHEN v_platform_ai_interactions > 0 THEN (v_tenant_ai_interactions::decimal / v_platform_ai_interactions * 100) ELSE 0 END;
                
                -- Build comprehensive metrics JSONB
                v_comprehensive_metrics := jsonb_build_object(
                    'financial_metrics', jsonb_build_object(
                        'tenant_revenue', v_tenant_revenue,
                        'mrr', v_mrr,
                        'avg_ticket', v_avg_ticket,
                        'revenue_per_customer', v_revenue_per_customer,
                        'subscription_revenue', v_subscription_revenue,
                        'upsell_revenue', v_upsell_revenue,
                        'recurring_percentage', v_recurring_percentage,
                        'discount_amount', v_discount_amount
                    ),
                    'appointment_metrics', jsonb_build_object(
                        'appointments_total', v_tenant_appointments,
                        'appointments_confirmed', v_confirmed_appointments,
                        'appointments_completed', v_completed_appointments,
                        'appointments_cancelled', v_cancelled_appointments,
                        'appointments_missed', v_missed_appointments,
                        'appointments_rescheduled', v_rescheduled_appointments,
                        'appointment_success_rate', v_appointment_success_rate,
                        'avg_appointment_value', v_avg_ticket,
                        'avg_booking_lead_time', v_avg_booking_lead_time
                    ),
                    'customer_metrics', jsonb_build_object(
                        'customers_total', v_tenant_customers,
                        'customers_new', v_new_customers,
                        'customers_returning', v_returning_customers,
                        'customer_retention_rate', v_customer_retention_rate,
                        'avg_customer_lifetime_value', v_avg_customer_lifetime_value,
                        'customer_acquisition_cost', v_customer_acquisition_cost,
                        'customers_at_risk', v_customers_at_risk,
                        'customer_satisfaction_score', v_customer_satisfaction_score
                    ),
                    'conversation_outcomes', jsonb_build_object(
                        'conversations_total', v_tenant_conversations,
                        'successful_bookings', v_successful_bookings,
                        'failed_bookings', v_failed_bookings,
                        'avg_conversation_duration', v_avg_conversation_duration,
                        'conversation_to_booking_rate', v_conversation_to_booking_rate,
                        'avg_response_time', v_avg_response_time,
                        'customer_satisfaction_conversations', v_customer_satisfaction_conversations,
                        'conversation_resolution_rate', v_conversation_resolution_rate
                    ),
                    'service_metrics', jsonb_build_object(
                        'services_available', v_services_available,
                        'services_booked', v_services_booked,
                        'service_utilization_rate', v_service_utilization_rate,
                        'popular_services', v_popular_services,
                        'avg_service_duration', v_avg_service_duration,
                        'service_cancellation_rate', v_service_cancellation_rate,
                        'peak_service_hours', v_peak_service_hours,
                        'service_revenue_distribution', v_service_revenue_distribution
                    ),
                    'ai_metrics', jsonb_build_object(
                        'ai_interactions_total', v_tenant_ai_interactions,
                        'successful_ai_resolutions', v_successful_ai_resolutions,
                        'ai_escalations', v_ai_escalations,
                        'ai_success_rate', v_ai_success_rate,
                        'avg_ai_response_time', v_avg_ai_response_time,
                        'ai_learning_score', v_ai_learning_score,
                        'ai_cost_per_interaction', v_ai_cost_per_interaction,
                        'ai_automation_rate', v_ai_automation_rate
                    ),
                    'tenant_outcomes', jsonb_build_object(
                        'business_growth_rate', v_business_growth_rate,
                        'operational_efficiency', v_operational_efficiency,
                        'customer_engagement_score', v_customer_engagement_score,
                        'tenant_health_score', v_tenant_health_score,
                        'churn_risk_level', v_churn_risk_level,
                        'recommended_actions', v_recommended_actions,
                        'improvement_areas', v_improvement_areas,
                        'success_metrics', v_success_metrics
                    ),
                    'historical_metrics', jsonb_build_object(
                        'month_over_month_growth', v_month_over_month_growth,
                        'quarter_over_quarter_growth', v_quarter_over_quarter_growth,
                        'year_over_year_growth', v_year_over_year_growth,
                        'trend_analysis', v_trend_analysis,
                        'seasonal_patterns', v_seasonal_patterns,
                        'performance_benchmarks', v_performance_benchmarks,
                        'growth_trajectory', v_growth_trajectory
                    ),
                    'platform_participation', jsonb_build_object(
                        'platform_revenue_share', v_platform_revenue_share,
                        'platform_customer_share', v_platform_customer_share,
                        'platform_interaction_share', v_platform_interaction_share,
                        'competitive_positioning', v_competitive_positioning,
                        'market_share_rank', v_market_share_rank,
                        'collaboration_score', v_collaboration_score,
                        'platform_integration_level', v_platform_integration_level
                    ),
                    'cost_breakdown', jsonb_build_object(
                        'whatsapp_api_costs', v_whatsapp_api_costs,
                        'openai_api_costs', v_openai_api_costs,
                        'infrastructure_costs', v_infrastructure_costs,
                        'support_costs', v_support_costs,
                        'total_operational_costs', v_total_operational_costs,
                        'cost_per_customer', v_cost_per_customer,
                        'profit_margin', v_profit_margin
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'data_source', 'definitiva_total_v5',
                        'version', 'DEFINITIVA_TOTAL_v5.0_EXCEPTION_HANDLING'
                    )
                );
                
                -- FIX 5: CRITICAL - PROPER EXCEPTION HANDLING
                -- This is where the silent failures occurred in v4.0
                BEGIN
                    PERFORM store_tenant_metric(
                        v_tenant_record.id,
                        'comprehensive',
                        v_comprehensive_metrics,
                        v_period_days || 'd'
                    );
                    
                    RAISE NOTICE '✅ Successfully stored metrics for tenant % period %d', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days;
                        
                EXCEPTION WHEN OTHERS THEN
                    v_failed_count := v_failed_count + 1;
                    RAISE WARNING '❌ ERROR storing metric for tenant % period %d: % - %', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
                    
                    -- Try to store a simplified version to avoid complete data loss
                    BEGIN
                        PERFORM store_tenant_metric(
                            v_tenant_record.id,
                            'simplified_fallback',
                            jsonb_build_object(
                                'tenant_revenue', v_tenant_revenue,
                                'appointments_total', v_tenant_appointments,
                                'customers_total', v_tenant_customers,
                                'ai_interactions_total', v_tenant_ai_interactions,
                                'error_info', jsonb_build_object(
                                    'original_error', SQLERRM,
                                    'fallback_reason', 'comprehensive_metrics_too_complex'
                                ),
                                'metadata', jsonb_build_object(
                                    'calculation_date', p_calculation_date,
                                    'period_days', v_period_days,
                                    'version', 'FALLBACK_v5.0'
                                )
                            ),
                            v_period_days || 'd'
                        );
                        
                        RAISE NOTICE '⚡ Stored fallback metrics for tenant % period %d', 
                            LEFT(v_tenant_record.id::text, 8), v_period_days;
                            
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING '❌ CRITICAL: Even fallback failed for tenant % period %d: % - %', 
                            LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
                    END;
                END;
                
            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                RAISE WARNING '❌ ERROR processing tenant % for %d period: % - %', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'failed_operations', v_failed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', (v_processed_count * 3) - v_failed_count,
        'version', 'DEFINITIVA_TOTAL_v5.0_EXCEPTION_HANDLING',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEFINITIVA TOTAL v5.0 completed: % tenants processed, % failed operations, %ms execution time', 
        v_processed_count, v_failed_count, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ GLOBAL ERROR in DEFINITIVA TOTAL v5.0: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'failed_operations', v_failed_count,
        'version', 'DEFINITIVA_TOTAL_v5.0_EXCEPTION_HANDLING',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_v5(date, uuid) TO authenticated;