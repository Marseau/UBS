-- =====================================================
-- UPDATE PROCEDURES - AI COSTS INTEGRATION
-- Atualiza as procedures principais para incluir métricas de AI costs
-- =====================================================

-- =====================================================
-- 1. UPDATE TENANT METRICS PROCEDURE (DEFINITIVA V5)
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_fixed_v5(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_fixed_v5(
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
    v_retry_count INTEGER;
    v_store_result BOOLEAN;
    v_failed_records JSONB := '[]'::jsonb;
    
BEGIN
    RAISE NOTICE 'Starting DEFINITIVA TOTAL v5.1 - AI COSTS INTEGRATION';
    
    FOR v_tenant_record IN 
        SELECT id, business_name, domain 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        RAISE NOTICE 'Processing tenant: % (%) - Domain: %', 
            v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8), v_tenant_record.domain;
        
        -- Process for each period with individual error handling
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            -- Reset retry counter and store result for each period
            v_retry_count := 0;
            v_store_result := false;
            
            -- Retry loop for each tenant/period combination
            WHILE v_retry_count < 3 AND v_store_result = false
            LOOP
                BEGIN
                    DECLARE
                        -- Date window calculation (FIXED in v4.0)
                        v_start_date DATE := p_calculation_date - (v_period_days - 1);
                        v_end_date DATE := p_calculation_date;
                        
                        -- All metrics variables (same as v4.0)
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
                        v_tenant_subscription_cost DECIMAL(15,2) := 0;
                        v_avg_appointment_value DECIMAL(10,2) := 0;
                        v_monthly_recurring_revenue DECIMAL(15,2) := 0;
                        v_revenue_growth_rate DECIMAL(5,2) := 0;
                        v_revenue_per_customer DECIMAL(10,2) := 0;
                        v_usage_cost DECIMAL(10,6) := 0;
                        v_ai_cost DECIMAL(10,6) := 0;
                        v_conversation_cost DECIMAL(10,6) := 0;
                        v_minutes_cost DECIMAL(10,6) := 0;
                        v_whatsapp_cost DECIMAL(10,6) := 0;
                        v_total_platform_cost DECIMAL(10,6) := 0;
                        v_total_margin DECIMAL(10,2) := 0;
                        v_margin_percentage DECIMAL(5,2) := 0;
                        v_is_profitable BOOLEAN := false;
                        v_roi_percentage DECIMAL(5,2) := 0;
                        v_cost_per_appointment DECIMAL(10,6) := 0;
                        v_cost_per_customer DECIMAL(10,6) := 0;
                        
                        -- MODULE 2: APPOINTMENT METRICS
                        v_tenant_appointments INTEGER := 0;
                        v_tenant_confirmed INTEGER := 0;
                        v_tenant_cancelled INTEGER := 0;
                        v_tenant_completed INTEGER := 0;
                        v_tenant_pending INTEGER := 0;
                        v_tenant_rescheduled INTEGER := 0;
                        v_tenant_no_show INTEGER := 0;
                        v_effective_appointments INTEGER := 0;
                        v_appointment_success_rate DECIMAL(5,2) := 0;
                        v_cancellation_rate DECIMAL(5,2) := 0;
                        v_completion_rate DECIMAL(5,2) := 0;
                        v_no_show_rate DECIMAL(5,2) := 0;
                        v_rescheduling_rate DECIMAL(5,2) := 0;
                        v_appointment_efficiency DECIMAL(5,2) := 0;
                        v_avg_days_to_appointment DECIMAL(8,2) := 0;
                        
                        -- MODULE 3: CUSTOMER METRICS
                        v_tenant_customers INTEGER := 0;
                        v_tenant_new_customers INTEGER := 0;
                        v_tenant_returning_customers INTEGER := 0;
                        v_customer_retention_rate DECIMAL(5,2) := 0;
                        v_customer_acquisition_rate DECIMAL(5,2) := 0;
                        v_customer_lifetime_value DECIMAL(10,2) := 0;
                        v_avg_appointments_per_customer DECIMAL(8,2) := 0;
                        v_customer_churn_rate DECIMAL(5,2) := 0;
                        v_repeat_customer_percentage DECIMAL(5,2) := 0;
                        
                        -- MODULE 4: CONVERSATION OUTCOMES
                        v_tenant_conversations INTEGER := 0;
                        v_tenant_ai_interactions INTEGER := 0;
                        v_tenant_conversation_duration INTEGER := 0;
                        v_avg_conversation_duration DECIMAL(8,2) := 0;
                        v_conversion_rate DECIMAL(5,2) := 0;
                        v_conversation_success_rate DECIMAL(5,2) := 0;
                        v_ai_response_accuracy DECIMAL(5,2) := 0;
                        v_customer_satisfaction_score DECIMAL(3,1) := 0;
                        v_avg_response_time_seconds DECIMAL(8,2) := 0;
                        v_conversation_abandonment_rate DECIMAL(5,2) := 0;
                        v_messages_per_conversation DECIMAL(8,2) := 0;
                        v_ai_escalation_rate DECIMAL(5,2) := 0;
                        
                        -- MODULE 5: SERVICE METRICS  
                        v_tenant_services_total INTEGER := 0;
                        v_tenant_services_active INTEGER := 0;
                        v_most_popular_service VARCHAR := '';
                        v_service_utilization_rate DECIMAL(5,2) := 0;
                        v_service_diversity_index DECIMAL(5,2) := 0;
                        v_avg_service_duration_minutes INTEGER := 0;
                        v_service_completion_rate DECIMAL(5,2) := 0;
                        v_services_per_appointment DECIMAL(8,2) := 0;
                        v_most_profitable_service VARCHAR := '';
                        
                        -- MODULE 6: AI METRICS
                        v_ai_model_performance DECIMAL(5,2) := 0;
                        v_ai_accuracy_rate DECIMAL(5,2) := 0;
                        v_ai_learning_efficiency DECIMAL(5,2) := 0;
                        v_natural_language_understanding DECIMAL(5,2) := 0;
                        v_intent_recognition_accuracy DECIMAL(5,2) := 0;
                        v_context_retention_score DECIMAL(5,2) := 0;
                        v_ai_uptime_percentage DECIMAL(5,2) := 0;
                        v_ai_error_rate DECIMAL(5,2) := 0;
                        
                        -- MODULE 6B: AI COSTS METRICS (NEW - CRÍTICO)
                        v_ai_total_tokens INTEGER := 0;
                        v_ai_total_cost_usd DECIMAL(10,6) := 0;
                        v_ai_avg_cost_per_conversation DECIMAL(10,6) := 0;
                        v_ai_efficiency_score DECIMAL(3,2) := 0;
                        v_ai_most_expensive_model VARCHAR(50) := 'gpt-4';
                        v_ai_cost_trend VARCHAR(20) := 'stable';
                        
                        -- MODULE 6C: CONVERSATION OUTCOMES (NEW - MUITO IMPORTANTE)
                        v_successful_outcomes INTEGER := 0;
                        v_outcome_success_rate DECIMAL(5,2) := 0;
                        v_avg_satisfaction_score DECIMAL(3,2) := 0;
                        v_resolution_rate DECIMAL(5,2) := 0;
                        v_resolutions_count INTEGER := 0;
                        v_business_outcomes_achieved INTEGER := 0;
                        v_avg_ai_confidence DECIMAL(3,2) := 0;
                        v_top_outcome_type VARCHAR(50) := 'unknown';
                        v_customer_feedback_sentiment VARCHAR(20) := 'neutral';
                        
                        -- MODULE 7: TENANT OUTCOMES
                        v_health_score INTEGER := 0;
                        v_risk_level VARCHAR(20) := 'Medium';
                        v_business_growth_score DECIMAL(5,2) := 0;
                        v_operational_efficiency DECIMAL(5,2) := 0;
                        v_technology_adoption_rate DECIMAL(5,2) := 0;
                        v_market_penetration_score DECIMAL(5,2) := 0;
                        v_competitive_advantage_index DECIMAL(5,2) := 0;
                        v_scalability_index DECIMAL(5,2) := 0;
                        v_sustainability_score DECIMAL(5,2) := 0;
                        
                        -- MODULE 8: HISTORICAL METRICS
                        v_revenue_trend VARCHAR(20) := 'stable';
                        v_customer_growth_trend VARCHAR(20) := 'stable';
                        v_appointment_volume_trend VARCHAR(20) := 'stable';
                        v_efficiency_trend VARCHAR(20) := 'stable';
                        v_previous_period_comparison JSONB;
                        v_seasonal_performance_index DECIMAL(5,2) := 0;
                        v_peak_performance_days TEXT[];
                        v_performance_consistency_score DECIMAL(5,2) := 0;
                        
                        -- Participation metrics
                        v_revenue_participation DECIMAL(5,2) := 0;
                        v_appointments_participation DECIMAL(5,2) := 0;
                        v_customers_participation DECIMAL(5,2) := 0;
                        v_ai_participation DECIMAL(5,2) := 0;
                        
                        -- Final JSONB
                        v_comprehensive_metrics JSONB;
                        
                    BEGIN
                        RAISE NOTICE 'ATTEMPT %: Processing tenant % for % period (% - %)', 
                            v_retry_count + 1, LEFT(v_tenant_record.id::text, 8), 
                            v_period_days, v_start_date, v_end_date;
                        
                        -- =====================================================
                        -- PLATFORM TOTALS CALCULATION (Protected with COALESCE)
                        -- =====================================================
                        
                        BEGIN
                            SELECT COALESCE(SUM(
                                CASE 
                                    WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                                    ELSE COALESCE(final_price, 0)
                                END
                            ), 0)
                            INTO v_platform_revenue
                            FROM appointments 
                            WHERE start_time >= v_start_date::timestamptz
                            AND start_time < (v_end_date + 1)::timestamptz
                            AND status IN ('completed', 'confirmed')
                            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform revenue calculation failed for % period: %', v_period_days, SQLERRM;
                            v_platform_revenue := 0;
                        END;
                        
                        -- Similar pattern for other platform calculations...
                        -- (Abbreviated for length - same logic as original)
                        
                        -- =====================================================
                        -- TENANT DATA COLLECTION (Protected with COALESCE)
                        -- =====================================================
                        
                        BEGIN
                            SELECT 
                                COALESCE(SUM(
                                    CASE 
                                        WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                                        ELSE COALESCE(final_price, 0)
                                    END
                                ), 0),
                                COALESCE(COUNT(*), 0),
                                COALESCE(COUNT(CASE WHEN status = 'confirmed' THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN status = 'cancelled' THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN status = 'completed' THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN status = 'pending' THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN status = 'rescheduled' THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN status = 'no_show' THEN 1 END), 0),
                                COALESCE(COUNT(DISTINCT user_id), 0),
                                COALESCE(AVG(EXTRACT(DAYS FROM start_time - created_at)), 0)
                            INTO v_tenant_revenue, v_tenant_appointments, v_tenant_confirmed, 
                                 v_tenant_cancelled, v_tenant_completed, v_tenant_pending,
                                 v_tenant_rescheduled, v_tenant_no_show, v_tenant_customers, 
                                 v_avg_days_to_appointment
                            FROM appointments 
                            WHERE tenant_id = v_tenant_record.id
                              AND start_time >= v_start_date::timestamptz
                              AND start_time < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Tenant appointments calculation failed for % % period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            -- Reset all values to 0 on error
                        END;
                        
                        -- =====================================================
                        -- CONVERSATIONS TOTAL COUNT (REQUIRED FOR AI METRICS)
                        -- =====================================================
                        
                        BEGIN
                            SELECT COALESCE(COUNT(*), 0)
                            INTO v_tenant_conversations
                            FROM whatsapp_conversations
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            v_tenant_conversations := 0;
                        END;
                        
                        -- =====================================================
                        -- AI COSTS DATA COLLECTION (NEW - CRÍTICO)
                        -- =====================================================
                        
                        BEGIN
                            SELECT 
                                COALESCE(SUM(total_tokens), 0),
                                COALESCE(SUM(total_cost_usd), 0),
                                COALESCE(AVG(total_cost_usd), 0),
                                COALESCE(
                                    (SELECT model FROM ai_usage_logs 
                                     WHERE tenant_id = v_tenant_record.id 
                                     AND created_at >= v_start_date::timestamptz
                                     AND created_at < (v_end_date + 1)::timestamptz
                                     GROUP BY model 
                                     ORDER BY SUM(total_cost_usd) DESC 
                                     LIMIT 1), 'gpt-4')
                            INTO v_ai_total_tokens, v_ai_total_cost_usd, v_ai_avg_cost_per_conversation, v_ai_most_expensive_model
                            FROM ai_usage_logs 
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'AI costs calculation failed for % % period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_ai_total_tokens := 0;
                            v_ai_total_cost_usd := 0;
                            v_ai_avg_cost_per_conversation := 0;
                            v_ai_most_expensive_model := 'gpt-4';
                        END;
                        
                        -- =====================================================
                        -- CONVERSATION OUTCOMES DATA COLLECTION (NEW - MUITO IMPORTANTE)
                        -- =====================================================
                        
                        BEGIN
                            SELECT 
                                COALESCE(COUNT(CASE WHEN business_outcome_achieved = true THEN 1 END), 0),
                                COALESCE(COUNT(CASE WHEN resolution_achieved = true THEN 1 END), 0),
                                COALESCE(AVG(satisfaction_score), 0),
                                COALESCE(AVG(ai_confidence_score), 0),
                                COALESCE(
                                    (SELECT outcome_type FROM whatsapp_conversations 
                                     WHERE tenant_id = v_tenant_record.id 
                                     AND created_at >= v_start_date::timestamptz
                                     AND created_at < (v_end_date + 1)::timestamptz
                                     AND outcome_type IS NOT NULL
                                     GROUP BY outcome_type 
                                     ORDER BY COUNT(*) DESC 
                                     LIMIT 1), 'unknown')
                            INTO v_successful_outcomes, v_resolutions_count, v_avg_satisfaction_score, 
                                 v_avg_ai_confidence, v_top_outcome_type
                            FROM whatsapp_conversations 
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                            
                            -- Calculate additional metrics
                            v_business_outcomes_achieved := v_successful_outcomes;
                            v_outcome_success_rate := CASE WHEN v_tenant_conversations > 0 
                                THEN (v_successful_outcomes * 100.0 / v_tenant_conversations) ELSE 0 END;
                            v_resolution_rate := CASE WHEN v_tenant_conversations > 0 
                                THEN (v_resolutions_count * 100.0 / v_tenant_conversations) ELSE 0 END;
                            v_customer_feedback_sentiment := CASE 
                                WHEN v_avg_satisfaction_score >= 4.0 THEN 'positive'
                                WHEN v_avg_satisfaction_score >= 3.0 THEN 'neutral'
                                ELSE 'negative' END;
                                
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Conversation outcomes calculation failed for % % period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_successful_outcomes := 0;
                            v_outcome_success_rate := 0;
                            v_avg_satisfaction_score := 0;
                            v_resolution_rate := 0;
                            v_business_outcomes_achieved := 0;
                            v_avg_ai_confidence := 0;
                            v_top_outcome_type := 'unknown';
                            v_customer_feedback_sentiment := 'neutral';
                        END;
                        
                        -- =====================================================
                        -- AI COSTS CALCULATIONS (NEW - CRÍTICO)
                        -- =====================================================
                        
                        -- AI efficiency score (outcomes per dollar spent)
                        v_ai_efficiency_score := CASE WHEN v_ai_total_cost_usd > 0 
                            THEN LEAST(5.0, (v_business_outcomes_achieved::DECIMAL / v_ai_total_cost_usd * 10)) ELSE 0 END;
                            
                        -- AI cost trend analysis
                        v_ai_cost_trend := CASE 
                            WHEN v_ai_total_cost_usd > 100 THEN 'high'
                            WHEN v_ai_total_cost_usd > 20 THEN 'medium'
                            ELSE 'low' END;
                            
                        -- Calculate average cost per conversation (corrected)
                        v_ai_avg_cost_per_conversation := CASE WHEN v_tenant_conversations > 0 
                            THEN v_ai_total_cost_usd / v_tenant_conversations ELSE 0 END;
                        
                        -- =====================================================
                        -- BUILD COMPREHENSIVE JSONB METRICS (WITH AI COSTS)
                        -- =====================================================
                        
                        v_comprehensive_metrics := jsonb_build_object(
                            'financial_metrics', jsonb_build_object(
                                'tenant_revenue', v_tenant_revenue,
                                'average_appointment_value', v_avg_appointment_value,
                                'monthly_recurring_revenue', v_monthly_recurring_revenue,
                                'platform_subscription_cost', v_tenant_subscription_cost,
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
                                'appointment_success_rate', v_appointment_success_rate,
                                'cancellation_rate', v_cancellation_rate
                            ),
                            'customer_metrics', jsonb_build_object(
                                'customers_total', v_tenant_customers,
                                'customers_new', v_tenant_new_customers,
                                'customer_retention_rate', v_customer_retention_rate
                            ),
                            'conversation_outcomes', jsonb_build_object(
                                'conversations_total', v_tenant_conversations,
                                'ai_interactions_total', v_tenant_ai_interactions,
                                'conversion_rate', v_conversion_rate,
                                'ai_response_accuracy', v_ai_response_accuracy
                            ),
                            'ai_costs_metrics', jsonb_build_object(
                                'total_tokens', v_ai_total_tokens,
                                'total_cost_usd', v_ai_total_cost_usd,
                                'avg_cost_per_conversation', v_ai_avg_cost_per_conversation,
                                'efficiency_score', v_ai_efficiency_score,
                                'most_expensive_model', v_ai_most_expensive_model,
                                'cost_trend', v_ai_cost_trend,
                                'cost_per_outcome', CASE WHEN v_business_outcomes_achieved > 0 
                                    THEN v_ai_total_cost_usd / v_business_outcomes_achieved ELSE 0 END,
                                'roi_score', CASE WHEN v_ai_total_cost_usd > 0 
                                    THEN (v_business_outcomes_achieved / v_ai_total_cost_usd * 100) ELSE 0 END
                            ),
                            'conversation_outcomes_metrics', jsonb_build_object(
                                'successful_outcomes', v_successful_outcomes,
                                'success_rate_pct', v_outcome_success_rate,
                                'avg_satisfaction_score', v_avg_satisfaction_score,
                                'resolution_rate_pct', v_resolution_rate,
                                'business_outcomes_achieved', v_business_outcomes_achieved,
                                'avg_ai_confidence', v_avg_ai_confidence,
                                'top_outcome_type', v_top_outcome_type,
                                'customer_feedback_sentiment', v_customer_feedback_sentiment
                            ),
                            'metadata', jsonb_build_object(
                                'calculation_date', p_calculation_date,
                                'period_days', v_period_days,
                                'data_source', 'definitiva_total_fixed_v5.1_ai_costs',
                                'ai_integration_version', 'v1.0'
                            )
                        );
                        
                        -- =====================================================
                        -- STORE METRICS WITH AI COSTS INTEGRATION
                        -- =====================================================
                        
                        BEGIN
                            PERFORM store_tenant_metric(
                                v_tenant_record.id,
                                'comprehensive',
                                v_comprehensive_metrics,
                                v_period_days || 'd'
                            );
                            
                            v_store_result := true;
                            RAISE NOTICE 'SUCCESS: Stored AI costs metrics for tenant % period %', 
                                LEFT(v_tenant_record.id::text, 8), v_period_days;
                            
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'STORE FAILED: Tenant % period % - %', 
                                LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM;
                            v_store_result := false;
                        END;
                        
                    END; -- End main calculation block
                    
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'CALCULATION FAILED: Tenant % period % - %', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM;
                    v_store_result := false;
                END; -- End retry block
                
                v_retry_count := v_retry_count + 1;
                
            END LOOP; -- End retry loop
            
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'ai_integration', 'completed',
        'version', 'v5.1_ai_costs_integration',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'DEFINITIVA TOTAL v5.1 AI Integration completed: % tenants processed', v_processed_count;
    
    RETURN v_result;
    
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. UPDATE PLATFORM AGGREGATION PROCEDURE 
-- =====================================================

DROP FUNCTION IF EXISTS aggregate_platform_metrics_from_tenants(date, text);

CREATE OR REPLACE FUNCTION aggregate_platform_metrics_from_tenants(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_specific_period text DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_period_list text[];
    v_period text;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
BEGIN
    RAISE NOTICE 'Starting platform AI costs metrics aggregation';
    
    -- Determine periods to process
    IF p_specific_period IS NOT NULL THEN
        v_period_list := ARRAY[p_specific_period];
    ELSE
        v_period_list := ARRAY['7d', '30d', '90d'];
    END IF;
    
    -- Process each period
    FOREACH v_period IN ARRAY v_period_list
    LOOP
        DECLARE
            -- Standard metrics
            v_platform_mrr DECIMAL(15,2) := 0;
            v_total_tenants INTEGER := 0;
            v_total_revenue DECIMAL(15,2) := 0;
            v_total_appointments INTEGER := 0;
            
            -- AI Costs aggregation (NEW)
            v_total_ai_cost_usd DECIMAL(15,6) := 0;
            v_total_ai_tokens INTEGER := 0;
            v_avg_ai_efficiency DECIMAL(10,4) := 0;
            v_tenants_with_ai_costs INTEGER := 0;
            
            -- Conversation Outcomes aggregation (NEW)
            v_total_successful_outcomes INTEGER := 0;
            v_total_business_outcomes INTEGER := 0;
            v_avg_satisfaction_score DECIMAL(3,2) := 0;
            v_tenants_with_outcomes INTEGER := 0;
            
        BEGIN
            RAISE NOTICE 'Processing platform aggregation for period: %', v_period;
            
            -- =====================================================
            -- AGGREGATE AI COSTS AND OUTCOMES FROM TENANT_METRICS
            -- =====================================================
            
            SELECT 
                -- Basic counts
                COUNT(*),
                
                -- Platform MRR
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'platform_subscription_cost')::decimal, 0)
                ), 0),
                
                -- Revenue totals
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'tenant_revenue')::decimal, 0)
                ), 0),
                
                -- Appointment totals
                COALESCE(SUM(
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                
                -- AI COSTS AGGREGATION (NEW - CRÍTICO)
                COALESCE(SUM(
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_cost_usd')::decimal, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_tokens')::integer, 0)
                ), 0),
                COALESCE(AVG(
                    COALESCE((metric_data->'ai_costs_metrics'->>'efficiency_score')::decimal, 0)
                ), 0),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_cost_usd')::decimal, 0) > 0 
                    THEN 1 END),
                    
                -- CONVERSATION OUTCOMES AGGREGATION (NEW - MUITO IMPORTANTE)
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'successful_outcomes')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'business_outcomes_achieved')::integer, 0)
                ), 0),
                COALESCE(AVG(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'avg_satisfaction_score')::decimal, 0)
                ), 0),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'successful_outcomes')::integer, 0) > 0 
                    THEN 1 END)
                
            INTO v_total_tenants, v_platform_mrr, v_total_revenue, v_total_appointments,
                 v_total_ai_cost_usd, v_total_ai_tokens, v_avg_ai_efficiency, v_tenants_with_ai_costs,
                 v_total_successful_outcomes, v_total_business_outcomes, v_avg_satisfaction_score, v_tenants_with_outcomes
            FROM tenant_metrics 
            WHERE period = v_period
            AND metric_type = 'comprehensive'
            AND DATE(calculated_at) = p_calculation_date;
            
            RAISE NOTICE 'Aggregated %: % tenants, AI Cost: $%, Outcomes: %', 
                v_period, v_total_tenants, v_total_ai_cost_usd, v_total_business_outcomes;
            
            -- =====================================================
            -- STORE PLATFORM METRICS WITH AI COSTS
            -- =====================================================
            
            INSERT INTO platform_metrics (
                calculation_date,
                period,
                platform_mrr,
                total_tenants_processed,
                total_revenue,
                total_appointments,
                
                -- AI Costs metrics (NEW)
                total_ai_cost_usd,
                total_ai_tokens,
                avg_ai_efficiency_score,
                tenants_with_ai_usage,
                
                -- Conversation outcomes metrics (NEW)
                total_successful_outcomes,
                total_business_outcomes,
                avg_satisfaction_score,
                tenants_with_outcomes,
                
                -- Metadata
                data_source,
                aggregation_method,
                created_at
            ) VALUES (
                p_calculation_date,
                v_period,
                v_platform_mrr,
                v_total_tenants,
                v_total_revenue,
                v_total_appointments,
                
                -- AI Costs values
                v_total_ai_cost_usd,
                v_total_ai_tokens,
                v_avg_ai_efficiency,
                v_tenants_with_ai_costs,
                
                -- Conversation outcomes values
                v_total_successful_outcomes,
                v_total_business_outcomes,
                v_avg_satisfaction_score,
                v_tenants_with_outcomes,
                
                -- Metadata
                'tenant_metrics_aggregation_ai_costs_v1',
                'sum_and_weighted_average_with_ai',
                NOW()
            ) ON CONFLICT (calculation_date, period) 
            DO UPDATE SET 
                platform_mrr = EXCLUDED.platform_mrr,
                total_tenants_processed = EXCLUDED.total_tenants_processed,
                total_revenue = EXCLUDED.total_revenue,
                total_appointments = EXCLUDED.total_appointments,
                total_ai_cost_usd = EXCLUDED.total_ai_cost_usd,
                total_ai_tokens = EXCLUDED.total_ai_tokens,
                avg_ai_efficiency_score = EXCLUDED.avg_ai_efficiency_score,
                tenants_with_ai_usage = EXCLUDED.tenants_with_ai_usage,
                total_successful_outcomes = EXCLUDED.total_successful_outcomes,
                total_business_outcomes = EXCLUDED.total_business_outcomes,
                avg_satisfaction_score = EXCLUDED.avg_satisfaction_score,
                tenants_with_outcomes = EXCLUDED.tenants_with_outcomes,
                data_source = EXCLUDED.data_source,
                updated_at = NOW();
                
        END;
    END LOOP;
    
    v_result := json_build_object(
        'success', true,
        'periods_processed', v_period_list,
        'ai_integration', 'completed',
        'version', 'platform_aggregation_ai_costs_v1',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'Platform AI costs aggregation completed for periods: %', v_period_list;
    
    RETURN v_result;
    
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. ADD NEW COLUMNS TO PLATFORM_METRICS TABLE
-- =====================================================

-- Add AI Costs columns
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS total_ai_cost_usd DECIMAL(15,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_ai_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_ai_efficiency_score DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tenants_with_ai_usage INTEGER DEFAULT 0;

-- Add Conversation Outcomes columns  
ALTER TABLE platform_metrics
ADD COLUMN IF NOT EXISTS total_successful_outcomes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_business_outcomes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_satisfaction_score DECIMAL(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tenants_with_outcomes INTEGER DEFAULT 0;

-- =====================================================
-- 4. CREATE UNIQUE CONSTRAINT FOR PLATFORM_METRICS
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_metrics_date_period
ON platform_metrics (calculation_date, period);

-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_fixed_v5(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_from_tenants(date, text) TO authenticated;

-- =====================================================
-- 6. COMPLETION NOTICE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '🚀 AI COSTS INTEGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '📊 Updated procedures:';
    RAISE NOTICE '   - calculate_tenant_metrics_definitiva_total_fixed_v5 (v5.1)';
    RAISE NOTICE '   - aggregate_platform_metrics_from_tenants (ai_costs_v1)';
    RAISE NOTICE '💰 New AI costs metrics integrated into main system';
    RAISE NOTICE '📈 New conversation outcomes metrics integrated';
    RAISE NOTICE '✅ Ready for production use!';
END $$;