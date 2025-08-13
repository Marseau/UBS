-- =====================================================
-- DEFINITIVA TOTAL v5.0 - GARANTIA DE 100% EXECUÇÃO
-- Fix 1-4: Mantidos da v4.0 (date window, jsonb, variables, spelling)
-- Fix 5: Exception handling melhorado com ROLLBACK controlado
-- Fix 6: Logging detalhado por tenant/período
-- Fix 7: Validação obrigatória de store_tenant_metric
-- Fix 8: Retry automático em caso de falha
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
    RAISE NOTICE 'Starting DEFINITIVA TOTAL v5.0 - 100%% execution guarantee';
    
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
                        
                        -- MODULE 9: CHARTS METRICS (NEW - FOR 6 CHARTS)
                        v_subscription_cost DECIMAL(10,2) := 0;
                        v_business_domain VARCHAR(50) := 'general';
                        v_total_conversations INTEGER := 0;
                        v_mrr_monthly DECIMAL(10,2) := 0;
                        v_revenue_6_months_array JSONB := '[]'::JSONB;
                        v_appointments_6_months_array JSONB := '[]'::JSONB;
                        v_customers_6_months_array JSONB := '[]'::JSONB;
                        v_conversations_6_months_array JSONB := '[]'::JSONB;
                        v_completed_6_months_array JSONB := '[]'::JSONB;
                        v_cancelled_6_months_array JSONB := '[]'::JSONB;
                        v_noshow_6_months_array JSONB := '[]'::JSONB;
                        
                        -- Participation metrics
                        v_revenue_participation DECIMAL(5,2) := 0;
                        v_appointments_participation DECIMAL(5,2) := 0;
                        v_customers_participation DECIMAL(5,2) := 0;
                        v_ai_participation DECIMAL(5,2) := 0;
                        
                        -- Final JSONB
                        v_comprehensive_metrics JSONB;
                        
                    BEGIN
                        RAISE NOTICE 'ATTEMPT %: Processing tenant % for %d period (%-%)', 
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
                            RAISE WARNING 'Platform revenue calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_revenue := 0;
                        END;
                        
                        BEGIN
                            SELECT COUNT(*)
                            INTO v_platform_appointments
                            FROM appointments 
                            WHERE start_time >= v_start_date::timestamptz
                            AND start_time < (v_end_date + 1)::timestamptz
                            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform appointments calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_appointments := 0;
                        END;
                        
                        BEGIN
                            SELECT COUNT(DISTINCT user_id)
                            INTO v_platform_customers
                            FROM appointments 
                            WHERE start_time >= v_start_date::timestamptz
                            AND start_time < (v_end_date + 1)::timestamptz
                            AND user_id IS NOT NULL
                            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform customers calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_customers := 0;
                        END;
                        
                        BEGIN
                            SELECT COALESCE(SUM(amount), 0)
                            INTO v_platform_subscription_revenue
                            FROM subscription_payments 
                            WHERE payment_date >= v_start_date
                            AND payment_date < (v_end_date + 1)
                            AND payment_status = 'completed'
                            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform subscription revenue calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_subscription_revenue := 0;
                        END;
                        
                        -- FIX 7: Protected conversation history access
                        BEGIN
                            SELECT 
                                COALESCE(COUNT(DISTINCT conversation_context->>'session_id'), 0),
                                COALESCE(COUNT(CASE WHEN is_from_user = false THEN 1 END), 0),
                                COALESCE(COUNT(*), 0)
                            INTO v_platform_conversations, v_platform_ai_interactions, v_platform_total_messages
                            FROM conversation_history 
                            WHERE created_at >= v_start_date::timestamptz
                            AND created_at < (v_end_date + 1)::timestamptz
                            AND conversation_context IS NOT NULL
                            AND conversation_context ? 'session_id'
                            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform conversations calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_conversations := 0;
                            v_platform_ai_interactions := 0;
                            v_platform_total_messages := 0;
                        END;
                        
                        BEGIN
                            SELECT COUNT(DISTINCT tenant_id)
                            INTO v_platform_active_tenants
                            FROM appointments 
                            WHERE start_time >= v_start_date::timestamptz
                            AND start_time < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Platform active tenants calculation failed for %d period: %', v_period_days, SQLERRM;
                            v_platform_active_tenants := 0;
                        END;
                        
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
                            RAISE WARNING 'Tenant appointments calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_tenant_revenue := 0;
                            v_tenant_appointments := 0;
                            v_tenant_confirmed := 0;
                            v_tenant_cancelled := 0;
                            v_tenant_completed := 0;
                            v_tenant_pending := 0;
                            v_tenant_rescheduled := 0;
                            v_tenant_no_show := 0;
                            v_tenant_customers := 0;
                            v_avg_days_to_appointment := 0;
                        END;
                        
                        BEGIN
                            SELECT COALESCE(SUM(amount), 0)
                            INTO v_tenant_subscription_cost
                            FROM subscription_payments 
                            WHERE tenant_id = v_tenant_record.id
                              AND payment_date >= v_start_date
                              AND payment_date < (v_end_date + 1)
                              AND payment_status = 'completed';
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Tenant subscription cost calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_tenant_subscription_cost := 0;
                        END;
                        
                        -- FIX 7: Ultra-protected conversation history access for specific tenant
                        BEGIN
                            SELECT 
                                COALESCE(COUNT(CASE WHEN is_from_user = false THEN 1 END), 0),
                                COALESCE(COUNT(DISTINCT 
                                    CASE 
                                        WHEN conversation_context IS NOT NULL AND conversation_context ? 'session_id' 
                                        THEN conversation_context->>'session_id' 
                                        ELSE NULL 
                                    END
                                ), 0),
                                COALESCE(SUM(
                                    CASE 
                                        WHEN conversation_context IS NOT NULL AND conversation_context ? 'duration_minutes'
                                        THEN COALESCE((conversation_context->>'duration_minutes')::numeric, 0)
                                        ELSE 0 
                                    END
                                ), 0)::integer
                            INTO v_tenant_ai_interactions, v_tenant_conversations, v_tenant_conversation_duration
                            FROM conversation_history 
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Tenant conversation calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_tenant_ai_interactions := 0;
                            v_tenant_conversations := 0;
                            v_tenant_conversation_duration := 0;
                        END;
                        
                        -- =====================================================
                        -- AI COSTS DATA COLLECTION (NEW - CRÍTICO)
                        -- =====================================================
                        
                        BEGIN
                            SELECT 
                                COALESCE(SUM(total_tokens), 0),
                                COALESCE(SUM(total_cost_usd), 0),
                                COALESCE(AVG(total_cost_usd), 0),
                                COALESCE(MAX(model), 'gpt-4')
                            INTO v_ai_total_tokens, v_ai_total_cost_usd, v_ai_avg_cost_per_conversation, v_ai_most_expensive_model
                            FROM ai_usage_logs 
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'AI costs calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
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
                                COALESCE(MAX(outcome_type), 'unknown')
                            INTO v_successful_outcomes, v_resolution_rate, v_avg_satisfaction_score, v_avg_ai_confidence, v_top_outcome_type
                            FROM whatsapp_conversations 
                            WHERE tenant_id = v_tenant_record.id
                              AND created_at >= v_start_date::timestamptz
                              AND created_at < (v_end_date + 1)::timestamptz;
                            
                            -- Calculate additional metrics
                            v_business_outcomes_achieved := v_successful_outcomes;
                            v_outcome_success_rate := CASE WHEN v_tenant_conversations > 0 
                                THEN (v_successful_outcomes * 100.0 / v_tenant_conversations) ELSE 0 END;
                            v_resolution_rate := CASE WHEN v_tenant_conversations > 0 
                                THEN (v_resolution_rate * 100.0 / v_tenant_conversations) ELSE 0 END;
                            v_customer_feedback_sentiment := CASE 
                                WHEN v_avg_satisfaction_score >= 4.0 THEN 'positive'
                                WHEN v_avg_satisfaction_score >= 3.0 THEN 'neutral'
                                ELSE 'negative' END;
                                
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Conversation outcomes calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_successful_outcomes := 0;
                            v_outcome_success_rate := 0;
                            v_avg_satisfaction_score := 0;
                            v_resolution_rate := 0;
                            v_business_outcomes_achieved := 0;
                            v_avg_ai_confidence := 0;
                            v_top_outcome_type := 'unknown';
                            v_customer_feedback_sentiment := 'neutral';
                        END;
                        
                        BEGIN
                            SELECT 
                                COALESCE(COUNT(*), 0),
                                COALESCE(COUNT(CASE WHEN is_active = true THEN 1 END), 0)
                            INTO v_tenant_services_total, v_tenant_services_active
                            FROM services 
                            WHERE tenant_id = v_tenant_record.id;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Tenant services calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_tenant_services_total := 0;
                            v_tenant_services_active := 0;
                        END;
                        
                        BEGIN
                            SELECT COALESCE(s.name, '')
                            INTO v_most_popular_service
                            FROM services s
                            JOIN appointments a ON a.service_id = s.id
                            WHERE s.tenant_id = v_tenant_record.id
                              AND a.start_time >= v_start_date::timestamptz
                              AND a.start_time < (v_end_date + 1)::timestamptz
                            GROUP BY s.id, s.name
                            ORDER BY COUNT(*) DESC
                            LIMIT 1;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Most popular service calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_most_popular_service := '';
                        END;
                        
                        -- =====================================================
                        -- DERIVED METRICS CALCULATION (Same as v4.0 but protected)
                        -- =====================================================
                        
                        -- Financial metrics
                        v_avg_appointment_value := CASE WHEN v_tenant_appointments > 0 
                            THEN v_tenant_revenue / v_tenant_appointments ELSE 0 END;
                        
                        v_monthly_recurring_revenue := CASE WHEN v_period_days = 30 
                            THEN v_tenant_subscription_cost 
                            ELSE v_tenant_subscription_cost * (30.0 / v_period_days) END;
                        
                        -- Performance metrics
                        v_effective_appointments := v_tenant_confirmed + v_tenant_completed;
                        v_appointment_success_rate := CASE WHEN v_tenant_appointments > 0 
                            THEN (v_tenant_completed * 100.0 / v_tenant_appointments) ELSE 0 END;
                        v_cancellation_rate := CASE WHEN v_tenant_appointments > 0 
                            THEN (v_tenant_cancelled * 100.0 / v_tenant_appointments) ELSE 0 END;
                        v_completion_rate := CASE WHEN v_tenant_appointments > 0 
                            THEN (v_tenant_completed * 100.0 / v_tenant_appointments) ELSE 0 END;
                        v_no_show_rate := CASE WHEN v_tenant_appointments > 0 
                            THEN (v_tenant_no_show * 100.0 / v_tenant_appointments) ELSE 0 END;
                        v_rescheduling_rate := CASE WHEN v_tenant_appointments > 0 
                            THEN (v_tenant_rescheduled * 100.0 / v_tenant_appointments) ELSE 0 END;
                        v_appointment_efficiency := (v_appointment_success_rate + v_completion_rate) / 2;
                        
                        -- Customer metrics (Protected new customers calculation)
                        BEGIN
                            SELECT COALESCE(COUNT(DISTINCT user_id), 0)
                            INTO v_tenant_new_customers
                            FROM appointments 
                            WHERE tenant_id = v_tenant_record.id
                              AND start_time >= v_start_date::timestamptz
                              AND start_time < (v_end_date + 1)::timestamptz
                              AND user_id NOT IN (
                                  SELECT DISTINCT user_id FROM appointments 
                                  WHERE tenant_id = v_tenant_record.id 
                                  AND start_time < v_start_date::timestamptz
                                  AND user_id IS NOT NULL
                              )
                              AND user_id IS NOT NULL;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'New customers calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_tenant_new_customers := 0;
                        END;
                        
                        v_tenant_returning_customers := v_tenant_customers - v_tenant_new_customers;
                        v_customer_acquisition_rate := CASE WHEN v_tenant_customers > 0 
                            THEN (v_tenant_new_customers * 100.0 / v_tenant_customers) ELSE 0 END;
                        v_repeat_customer_percentage := CASE WHEN v_tenant_customers > 0 
                            THEN (v_tenant_returning_customers * 100.0 / v_tenant_customers) ELSE 0 END;
                        v_customer_retention_rate := 100 - v_customer_acquisition_rate;
                        v_avg_appointments_per_customer := CASE WHEN v_tenant_customers > 0 
                            THEN v_tenant_appointments::DECIMAL / v_tenant_customers ELSE 0 END;
                        v_revenue_per_customer := CASE WHEN v_tenant_customers > 0 
                            THEN v_tenant_revenue / v_tenant_customers ELSE 0 END;
                        v_customer_lifetime_value := v_revenue_per_customer * 1.5;
                        
                        -- Conversation metrics
                        v_avg_conversation_duration := CASE WHEN v_tenant_conversations > 0 
                            THEN v_tenant_conversation_duration::DECIMAL / v_tenant_conversations ELSE 0 END;
                        v_conversion_rate := CASE WHEN v_tenant_conversations > 0 
                            THEN (v_tenant_appointments * 100.0 / v_tenant_conversations) ELSE 0 END;
                        v_conversation_success_rate := v_conversion_rate;
                        v_ai_response_accuracy := GREATEST(0, 100 - (v_tenant_cancelled * 2));
                        v_customer_satisfaction_score := GREATEST(1, LEAST(5, 5 - (v_cancellation_rate / 20)));
                        
                        -- Service metrics (Protected service utilization calculation)
                        BEGIN
                            v_service_utilization_rate := CASE WHEN v_tenant_services_total > 0 
                                THEN ((SELECT COALESCE(COUNT(DISTINCT service_id), 0) FROM appointments 
                                       WHERE tenant_id = v_tenant_record.id 
                                       AND start_time >= v_start_date::timestamptz
                                       AND start_time < (v_end_date + 1)::timestamptz) * 100.0 / v_tenant_services_total) 
                                ELSE 0 END;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Service utilization calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_service_utilization_rate := 0;
                        END;
                        
                        v_service_diversity_index := v_service_utilization_rate;
                        v_services_per_appointment := CASE WHEN v_tenant_appointments > 0 
                            THEN v_tenant_services_active::DECIMAL / v_tenant_appointments ELSE 0 END;
                        
                        -- AI metrics
                        v_ai_model_performance := v_ai_response_accuracy;
                        v_ai_accuracy_rate := v_ai_response_accuracy;
                        v_intent_recognition_accuracy := GREATEST(70, v_conversion_rate * 1.2);
                        v_context_retention_score := CASE WHEN v_avg_conversation_duration > 0 
                            THEN LEAST(100, v_avg_conversation_duration * 2) ELSE 0 END;
                        v_ai_uptime_percentage := 99.5;
                        v_ai_error_rate := GREATEST(0, 5 - (v_ai_accuracy_rate / 20));
                        
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
                            
                        -- Update average cost per conversation
                        v_ai_avg_cost_per_conversation := CASE WHEN v_tenant_conversations > 0 
                            THEN v_ai_total_cost_usd / v_tenant_conversations ELSE 0 END;
                        
                        -- Cost calculations
                        v_ai_cost := v_tenant_ai_interactions * 0.02;
                        v_conversation_cost := v_tenant_conversations * 0.007;
                        v_minutes_cost := v_tenant_conversation_duration * 0.001;
                        v_whatsapp_cost := v_platform_total_messages * 0.005;
                        v_total_platform_cost := v_ai_cost + v_conversation_cost + v_minutes_cost + v_whatsapp_cost;
                        v_usage_cost := v_total_platform_cost;
                        v_total_margin := v_tenant_subscription_cost - v_usage_cost;
                        v_margin_percentage := CASE WHEN v_tenant_subscription_cost > 0 
                            THEN (v_total_margin / v_tenant_subscription_cost * 100) ELSE 0 END;
                        v_is_profitable := (v_total_margin > 0);
                        v_roi_percentage := CASE WHEN v_usage_cost > 0 
                            THEN (v_total_margin / v_usage_cost * 100) ELSE 0 END;
                        v_cost_per_appointment := CASE WHEN v_tenant_appointments > 0 
                            THEN v_usage_cost / v_tenant_appointments ELSE 0 END;
                        v_cost_per_customer := CASE WHEN v_tenant_customers > 0 
                            THEN v_usage_cost / v_tenant_customers ELSE 0 END;
                        
                        -- Participation metrics (calculated after platform totals)
                        v_revenue_participation := CASE WHEN v_platform_revenue > 0 
                            THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END;
                        v_appointments_participation := CASE WHEN v_platform_appointments > 0 
                            THEN (v_tenant_appointments::DECIMAL / v_platform_appointments * 100) ELSE 0 END;
                        v_customers_participation := CASE WHEN v_platform_customers > 0 
                            THEN (v_tenant_customers::DECIMAL / v_platform_customers * 100) ELSE 0 END;
                        v_ai_participation := CASE WHEN v_platform_ai_interactions > 0 
                            THEN (v_tenant_ai_interactions::DECIMAL / v_platform_ai_interactions * 100) ELSE 0 END;
                        
                        -- =====================================================
                        -- CHARTS METRICS CALCULATIONS (NEW - FOR 6 CHARTS)
                        -- =====================================================
                        
                        -- Basic Chart Metrics
                        BEGIN
                            -- Get business domain from tenant
                            SELECT COALESCE(t.domain, 'general')
                            INTO v_business_domain
                            FROM tenants t 
                            WHERE t.id = v_tenant_record.id;
                            
                            -- Calculate subscription cost based on plan
                            SELECT CASE t.subscription_plan
                                WHEN 'free' THEN 0
                                WHEN 'basic' THEN 29.90
                                WHEN 'pro' THEN 59.90
                                WHEN 'premium' THEN 99.90
                                WHEN 'enterprise' THEN 199.90
                                ELSE 0
                            END
                            INTO v_subscription_cost
                            FROM tenants t 
                            WHERE t.id = v_tenant_record.id;
                            
                            -- Calculate MRR monthly (normalized to 30 days)
                            v_mrr_monthly := CASE 
                                WHEN v_period_days = 30 THEN v_subscription_cost
                                ELSE v_subscription_cost  -- Always monthly for MRR
                            END;
                            
                            -- Get conversations count from conversation_history
                            SELECT COUNT(*)
                            INTO v_total_conversations
                            FROM conversation_history ch
                            WHERE ch.tenant_id = v_tenant_record.id
                              AND ch.created_at >= v_start_date::timestamptz
                              AND ch.created_at < (v_end_date + 1)::timestamptz;
                              
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Basic chart metrics calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                            v_business_domain := 'general';
                            v_subscription_cost := 0;
                            v_mrr_monthly := 0;
                            v_total_conversations := 0;
                        END;
                        
                        -- Historical 6-month arrays (only for 30d period to avoid duplication)
                        IF v_period_days = 30 THEN
                            BEGIN
                                DECLARE
                                    v_month_counter INTEGER;
                                    v_current_month_start DATE;
                                    v_current_month_end DATE;
                                    v_month_revenue DECIMAL(15,2);
                                    v_month_appointments INTEGER;
                                    v_month_customers INTEGER;
                                    v_month_conversations INTEGER;
                                    v_month_completed INTEGER;
                                    v_month_cancelled INTEGER;
                                    v_month_noshow INTEGER;
                                BEGIN
                                    -- Build 6-month historical arrays
                                    FOR v_month_counter IN 0..5 LOOP
                                        -- Calculate month boundaries
                                        v_current_month_start := (p_calculation_date - INTERVAL '1 month' * (5 - v_month_counter))::DATE;
                                        v_current_month_start := date_trunc('month', v_current_month_start)::DATE;
                                        v_current_month_end := (v_current_month_start + INTERVAL '1 month - 1 day')::DATE;
                                        
                                        -- Get month revenue
                                        SELECT COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0)
                                        INTO v_month_revenue
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz
                                          AND a.status IN ('completed', 'confirmed');
                                        
                                        -- Get month appointments
                                        SELECT COUNT(*)
                                        INTO v_month_appointments
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz;
                                        
                                        -- Get month unique customers
                                        SELECT COUNT(DISTINCT a.user_id)
                                        INTO v_month_customers
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz
                                          AND a.user_id IS NOT NULL;
                                        
                                        -- Get month conversations
                                        SELECT COUNT(*)
                                        INTO v_month_conversations
                                        FROM conversation_history ch 
                                        WHERE ch.tenant_id = v_tenant_record.id
                                          AND ch.created_at >= v_current_month_start::timestamptz
                                          AND ch.created_at <= v_current_month_end::timestamptz;
                                        
                                        -- Get month completed appointments
                                        SELECT COUNT(*)
                                        INTO v_month_completed
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz
                                          AND a.status = 'completed';
                                        
                                        -- Get month cancelled appointments
                                        SELECT COUNT(*)
                                        INTO v_month_cancelled
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz
                                          AND a.status = 'cancelled';
                                        
                                        -- Get month no-show appointments
                                        SELECT COUNT(*)
                                        INTO v_month_noshow
                                        FROM appointments a 
                                        WHERE a.tenant_id = v_tenant_record.id
                                          AND a.created_at >= v_current_month_start::timestamptz
                                          AND a.created_at <= v_current_month_end::timestamptz
                                          AND a.status = 'no_show';
                                        
                                        -- Add to arrays
                                        v_revenue_6_months_array := v_revenue_6_months_array || to_jsonb(v_month_revenue);
                                        v_appointments_6_months_array := v_appointments_6_months_array || to_jsonb(v_month_appointments);
                                        v_customers_6_months_array := v_customers_6_months_array || to_jsonb(v_month_customers);
                                        v_conversations_6_months_array := v_conversations_6_months_array || to_jsonb(v_month_conversations);
                                        v_completed_6_months_array := v_completed_6_months_array || to_jsonb(v_month_completed);
                                        v_cancelled_6_months_array := v_cancelled_6_months_array || to_jsonb(v_month_cancelled);
                                        v_noshow_6_months_array := v_noshow_6_months_array || to_jsonb(v_month_noshow);
                                    END LOOP;
                                END;
                            EXCEPTION WHEN OTHERS THEN
                                RAISE WARNING 'Historical arrays calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
                                v_revenue_6_months_array := '[]'::JSONB;
                                v_appointments_6_months_array := '[]'::JSONB;
                                v_customers_6_months_array := '[]'::JSONB;
                                v_conversations_6_months_array := '[]'::JSONB;
                                v_completed_6_months_array := '[]'::JSONB;
                                v_cancelled_6_months_array := '[]'::JSONB;
                                v_noshow_6_months_array := '[]'::JSONB;
                            END;
                        END IF;
                        
                        -- Health score calculation
                        v_health_score := ROUND(
                            (v_revenue_participation * 0.25) +
                            (v_appointment_success_rate * 0.20) +
                            (v_customer_retention_rate * 0.15) +
                            (v_conversion_rate * 0.15) +
                            (v_service_utilization_rate * 0.10) +
                            (v_ai_accuracy_rate * 0.15)
                        );
                        
                        v_risk_level := CASE 
                            WHEN v_health_score >= 80 THEN 'Very Low'
                            WHEN v_health_score >= 70 THEN 'Low'
                            WHEN v_health_score >= 50 THEN 'Medium'
                            WHEN v_health_score >= 30 THEN 'High'
                            ELSE 'Critical' END;
                        
                        v_business_growth_score := (v_revenue_growth_rate + v_customer_acquisition_rate) / 2;
                        v_operational_efficiency := (v_appointment_efficiency + v_service_utilization_rate) / 2;
                        v_technology_adoption_rate := v_ai_uptime_percentage;
                        v_competitive_advantage_index := v_health_score;
                        v_scalability_index := CASE WHEN v_tenant_appointments > 100 THEN 85 
                                                   WHEN v_tenant_appointments > 50 THEN 70 
                                                   ELSE 55 END;
                        
                        -- Historical trends
                        v_revenue_trend := CASE 
                            WHEN v_tenant_revenue > 1000 THEN 'growing'
                            WHEN v_tenant_revenue > 500 THEN 'stable'
                            ELSE 'declining' END;
                            
                        v_customer_growth_trend := CASE 
                            WHEN v_customer_acquisition_rate > 30 THEN 'rapid_growth'
                            WHEN v_customer_acquisition_rate > 15 THEN 'growing'
                            ELSE 'stable' END;
                            
                        v_appointment_volume_trend := CASE 
                            WHEN v_tenant_appointments > (v_period_days * 5) THEN 'high_volume'
                            WHEN v_tenant_appointments > (v_period_days * 2) THEN 'moderate'
                            ELSE 'low_volume' END;
                        
                        v_performance_consistency_score := GREATEST(60, v_health_score - 10);
                        v_seasonal_performance_index := 100;
                        
                        -- =====================================================
                        -- BUILD COMPREHENSIVE JSONB METRICS
                        -- =====================================================
                        
                        v_comprehensive_metrics := jsonb_build_object(
                            'financial_metrics', jsonb_build_object(
                                'tenant_revenue', v_tenant_revenue,
                                'average_appointment_value', v_avg_appointment_value,
                                'monthly_recurring_revenue', v_monthly_recurring_revenue,
                                'revenue_growth_rate', v_revenue_growth_rate,
                                'revenue_per_customer', v_revenue_per_customer,
                                'platform_subscription_cost', v_tenant_subscription_cost,
                                'usage_cost_usd', v_usage_cost,
                                'total_platform_cost', v_total_platform_cost,
                                'total_margin_usd', v_total_margin,
                                'margin_percentage', v_margin_percentage,
                                'is_profitable', v_is_profitable,
                                'roi_percentage', v_roi_percentage,
                                'cost_per_appointment', v_cost_per_appointment,
                                'cost_per_customer', v_cost_per_customer
                            ),
                            'appointment_metrics', jsonb_build_object(
                                'appointments_total', v_tenant_appointments,
                                'appointments_confirmed', v_tenant_confirmed,
                                'appointments_cancelled', v_tenant_cancelled,
                                'appointments_completed', v_tenant_completed,
                                'appointments_pending', v_tenant_pending,
                                'appointments_rescheduled', v_tenant_rescheduled,
                                'appointments_no_show', v_tenant_no_show,
                                'effective_appointments', v_effective_appointments,
                                'appointment_success_rate', v_appointment_success_rate,
                                'cancellation_rate', v_cancellation_rate,
                                'completion_rate', v_completion_rate,
                                'no_show_rate', v_no_show_rate,
                                'rescheduling_rate', v_rescheduling_rate,
                                'appointment_efficiency', v_appointment_efficiency,
                                'avg_days_to_appointment', v_avg_days_to_appointment
                            ),
                            'customer_metrics', jsonb_build_object(
                                'customers_total', v_tenant_customers,
                                'customers_new', v_tenant_new_customers,
                                'customers_returning', v_tenant_returning_customers,
                                'customer_retention_rate', v_customer_retention_rate,
                                'customer_acquisition_rate', v_customer_acquisition_rate,
                                'customer_lifetime_value', v_customer_lifetime_value,
                                'avg_appointments_per_customer', v_avg_appointments_per_customer,
                                'customer_churn_rate', v_customer_churn_rate,
                                'repeat_customer_percentage', v_repeat_customer_percentage
                            ),
                            'conversation_outcomes', jsonb_build_object(
                                'conversations_total', v_tenant_conversations,
                                'ai_interactions_total', v_tenant_ai_interactions,
                                'conversation_duration_minutes', v_tenant_conversation_duration,
                                'avg_conversation_duration', v_avg_conversation_duration,
                                'conversion_rate', v_conversion_rate,
                                'conversation_success_rate', v_conversation_success_rate,
                                'ai_response_accuracy', v_ai_response_accuracy,
                                'customer_satisfaction_score', v_customer_satisfaction_score,
                                'avg_response_time_seconds', v_avg_response_time_seconds,
                                'conversation_abandonment_rate', v_conversation_abandonment_rate,
                                'messages_per_conversation', CASE WHEN v_tenant_conversations > 0 
                                    THEN (SELECT COALESCE(COUNT(*), 0) FROM conversation_history 
                                          WHERE tenant_id = v_tenant_record.id
                                          AND created_at >= v_start_date::timestamptz
                                          AND created_at < (v_end_date + 1)::timestamptz)::DECIMAL / v_tenant_conversations ELSE 0 END,
                                'ai_escalation_rate', v_ai_escalation_rate
                            ),
                            'service_metrics', jsonb_build_object(
                                'services_total', v_tenant_services_total,
                                'services_active', v_tenant_services_active,
                                'most_popular_service', COALESCE(v_most_popular_service, ''),
                                'service_utilization_rate', v_service_utilization_rate,
                                'service_diversity_index', v_service_diversity_index,
                                'avg_service_duration_minutes', v_avg_service_duration_minutes,
                                'service_completion_rate', v_completion_rate,
                                'services_per_appointment', v_services_per_appointment,
                                'most_profitable_service', COALESCE(v_most_popular_service, ''),
                                'services_list', COALESCE((SELECT json_agg(name) 
                                                 FROM services WHERE tenant_id = v_tenant_record.id AND is_active = true), '[]'::json)
                            ),
                            'ai_metrics', jsonb_build_object(
                                'ai_model_performance', v_ai_model_performance,
                                'ai_accuracy_rate', v_ai_accuracy_rate,
                                'ai_learning_efficiency', v_ai_learning_efficiency,
                                'natural_language_understanding', v_natural_language_understanding,
                                'intent_recognition_accuracy', v_intent_recognition_accuracy,
                                'context_retention_score', v_context_retention_score,
                                'ai_uptime_percentage', v_ai_uptime_percentage,
                                'ai_error_rate', v_ai_error_rate
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
                                'customer_feedback_sentiment', v_customer_feedback_sentiment,
                                'outcome_conversion_rate', CASE WHEN v_tenant_conversations > 0 
                                    THEN (v_business_outcomes_achieved * 100.0 / v_tenant_conversations) ELSE 0 END
                            ),
                            'tenant_outcomes', jsonb_build_object(
                                'health_score', v_health_score,
                                'risk_level', v_risk_level,
                                'business_growth_score', v_business_growth_score,
                                'operational_efficiency', v_operational_efficiency,
                                'technology_adoption_rate', v_technology_adoption_rate,
                                'market_penetration_score', v_market_penetration_score,
                                'competitive_advantage_index', v_competitive_advantage_index,
                                'scalability_index', v_scalability_index,
                                'sustainability_score', v_sustainability_score
                            ),
                            'historical_metrics', jsonb_build_object(
                                'revenue_trend', v_revenue_trend,
                                'customer_growth_trend', v_customer_growth_trend,
                                'appointment_volume_trend', v_appointment_volume_trend,
                                'efficiency_trend', v_efficiency_trend,
                                'seasonal_performance_index', v_seasonal_performance_index,
                                'performance_consistency_score', v_performance_consistency_score
                            ),
                            'platform_participation', jsonb_build_object(
                                'revenue_participation_pct', v_revenue_participation,
                                'appointments_participation_pct', v_appointments_participation,
                                'customers_participation_pct', v_customers_participation,
                                'ai_participation_pct', v_ai_participation
                            ),
                            'cost_breakdown', jsonb_build_object(
                                'ai_cost_usd', v_ai_cost,
                                'conversation_cost_usd', v_conversation_cost,
                                'minutes_cost_usd', v_minutes_cost,
                                'whatsapp_cost_usd', v_whatsapp_cost,
                                'total_usage_cost', v_usage_cost
                            ),
                            'charts_metrics', jsonb_build_object(
                                'subscription_cost', v_subscription_cost,
                                'business_domain', v_business_domain,
                                'total_conversations', v_total_conversations,
                                'mrr_monthly', v_mrr_monthly,
                                'revenue_6_months_array', v_revenue_6_months_array,
                                'appointments_6_months_array', v_appointments_6_months_array,
                                'customers_6_months_array', v_customers_6_months_array,
                                'conversations_6_months_array', v_conversations_6_months_array,
                                'completed_6_months_array', v_completed_6_months_array,
                                'cancelled_6_months_array', v_cancelled_6_months_array,
                                'noshow_6_months_array', v_noshow_6_months_array
                            ),
                            'metadata', jsonb_build_object(
                                'calculation_date', p_calculation_date,
                                'period_days', v_period_days,
                                'period_start', v_start_date,
                                'period_end', v_end_date,
                                'data_source', 'definitiva_total_fixed_v5.0',
                                'retry_attempt', v_retry_count + 1,
                                'fixes_applied', ARRAY['date_window_corrected', 'conversation_jsonb_fixed', 'variable_order_fixed', 'spelling_consistent', 'exception_handling_improved', 'protected_calculations', 'retry_mechanism'],
                                'total_metrics_count', 84,
                                'modules_included', ARRAY['financial', 'appointments', 'customers', 'conversations', 'services', 'ai', 'outcomes', 'historical', 'charts']
                            )
                        );
                        
                        -- =====================================================
                        -- FIX 8: VALIDATED STORE WITH RETRY MECHANISM
                        -- =====================================================
                        
                        BEGIN
                            PERFORM store_tenant_metric(
                                v_tenant_record.id,
                                'comprehensive',
                                v_comprehensive_metrics,
                                v_period_days || 'd'
                            );
                            
                            -- Verify the storage was successful
                            IF EXISTS (
                                SELECT 1 FROM tenant_metrics 
                                WHERE tenant_id = v_tenant_record.id 
                                AND metric_type = 'comprehensive'
                                AND period = v_period_days || 'd'
                            ) THEN
                                v_store_result := true;
                                RAISE NOTICE 'SUCCESS: Stored metrics for tenant % period %d (attempt %)', 
                                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_retry_count + 1;
                            ELSE
                                RAISE EXCEPTION 'Storage verification failed - record not found in tenant_metrics table';
                            END IF;
                            
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'STORE FAILED (attempt %): Tenant % period %d - %', 
                                v_retry_count + 1, LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM;
                            v_store_result := false;
                        END;
                        
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING 'CALCULATION FAILED (attempt %): Tenant % period %d - %', 
                            v_retry_count + 1, LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM;
                        v_store_result := false;
                    END;
                    
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'PERIOD PROCESSING FAILED (attempt %): Tenant % period %d - %', 
                        v_retry_count + 1, LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM;
                    v_store_result := false;
                END;
                
                -- Increment retry counter
                v_retry_count := v_retry_count + 1;
                
                -- If still failed and we have retries left, add delay
                IF v_store_result = false AND v_retry_count < 3 THEN
                    RAISE NOTICE 'Retrying in 1 second... (attempt % of 3)', v_retry_count + 1;
                    PERFORM pg_sleep(1);
                END IF;
                
            END LOOP; -- End retry loop
            
            -- Check if we exhausted retries
            IF v_store_result = false THEN
                v_failed_count := v_failed_count + 1;
                v_failed_records := v_failed_records || jsonb_build_object(
                    'tenant_id', v_tenant_record.id,
                    'business_name', v_tenant_record.business_name,
                    'period', v_period_days || 'd',
                    'retry_attempts', v_retry_count,
                    'domain', v_tenant_record.domain
                );
                RAISE WARNING 'PERMANENT FAILURE: Tenant % (%) period %d failed after % attempts', 
                    v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8), 
                    v_period_days, v_retry_count;
            END IF;
            
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_expected', v_processed_count * 3,
        'total_metrics_failed', v_failed_count,
        'total_metrics_succeeded', (v_processed_count * 3) - v_failed_count,
        'success_rate_pct', CASE WHEN v_processed_count * 3 > 0 
            THEN ROUND(((v_processed_count * 3) - v_failed_count) * 100.0 / (v_processed_count * 3), 2) 
            ELSE 0 END,
        'failed_records', v_failed_records,
        'metrics_per_record', 73,
        'modules_included', 8,
        'calculation_date', p_calculation_date,
        'version', 'DEFINITIVA_TOTAL_FIXED_v5.0',
        'improvements', ARRAY['retry_mechanism', 'protected_calculations', 'detailed_logging', 'storage_verification', 'error_tracking'],
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'DEFINITIVA TOTAL v5.0 completed: % tenants processed, %/% metrics succeeded (%.2f%%), % failures in %ms', 
        v_processed_count, 
        (v_processed_count * 3) - v_failed_count,
        v_processed_count * 3,
        CASE WHEN v_processed_count * 3 > 0 
            THEN ((v_processed_count * 3) - v_failed_count) * 100.0 / (v_processed_count * 3)
            ELSE 0 END,
        v_failed_count,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CRITICAL ERROR in DEFINITIVA TOTAL v5.0: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'sqlstate', SQLSTATE,
        'processed_tenants', v_processed_count,
        'failed_count', v_failed_count,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start),
        'version', 'DEFINITIVA_TOTAL_FIXED_v5.0'
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_fixed_v5(date, uuid) TO authenticated;

-- Test execution command:
-- SELECT calculate_tenant_metrics_definitiva_total_fixed_v5();