-- =====================================================
-- DEFINITIVA TOTAL - WITH DETAILED ERROR LOGGING
-- This version will show us EXACTLY what error breaks the period loop
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_logging(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_logging(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
    v_period_days INTEGER;
    
BEGIN
    RAISE NOTICE '🚀 Starting DEFINITIVA TOTAL with DETAILED ERROR LOGGING';
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        RAISE NOTICE '🏢 Processing tenant: % (%)', v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8);
        
        -- Process for each period
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            DECLARE
                -- Date window calculation
                v_start_date DATE := p_calculation_date - (v_period_days - 1);
                v_end_date DATE := p_calculation_date;
                
                -- Test variables
                v_tenant_revenue DECIMAL(15,2) := 0;
                v_tenant_appointments INTEGER := 0;
                v_tenant_customers INTEGER := 0;
                v_tenant_conversations INTEGER := 0;
                v_tenant_ai_interactions INTEGER := 0;
                
                -- Health score (this might be causing issues)
                v_health_score INTEGER := 75;
                
                -- Comprehensive metrics JSON (simplified for testing)
                v_comprehensive_metrics JSONB;
                
            BEGIN
                RAISE NOTICE '📅 [%] Starting period %d processing', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- Basic data queries (replicate main procedure logic exactly)
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0),
                    COUNT(*),
                    COUNT(DISTINCT customer_id)
                INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                RAISE NOTICE '💰 [%] Period %d: Revenue=%, Appointments=%, Customers=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_tenant_revenue, v_tenant_appointments, v_tenant_customers;
                
                -- Conversations query
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id')
                INTO v_tenant_ai_interactions, v_tenant_conversations
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                
                RAISE NOTICE '💬 [%] Period %d: Conversations=%, AI_interactions=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_tenant_conversations, v_tenant_ai_interactions;
                
                -- Build JSONB (this is where errors might happen)
                RAISE NOTICE '📦 [%] Period %d: Building JSONB...', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                v_comprehensive_metrics := jsonb_build_object(
                    'financial_metrics', jsonb_build_object(
                        'tenant_revenue', v_tenant_revenue,
                        'avg_ticket', CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END
                    ),
                    'appointment_metrics', jsonb_build_object(
                        'appointments_total', v_tenant_appointments,
                        'customers_total', v_tenant_customers
                    ),
                    'conversation_metrics', jsonb_build_object(
                        'conversations_total', v_tenant_conversations,
                        'ai_interactions_total', v_tenant_ai_interactions
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'tenant_health_score', v_health_score,
                        'data_source', 'definitiva_total_logging',
                        'version', 'LOGGING_v1.0'
                    )
                );
                
                RAISE NOTICE '📦 [%] Period %d: JSONB built successfully', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- Store metrics (this is where the main procedure might fail)
                RAISE NOTICE '💾 [%] Period %d: Calling store_tenant_metric...', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                PERFORM store_tenant_metric(
                    v_tenant_record.id,
                    'comprehensive_logging',
                    v_comprehensive_metrics,
                    v_period_days || 'd'
                );
                
                RAISE NOTICE '✅ [%] Period %d: Successfully stored metric!', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
            EXCEPTION WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                RAISE WARNING '❌ [%] Period %d ERROR: % - % (SQLSTATE: %)', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, SQLERRM, SQLSTATE, SQLSTATE;
                RAISE WARNING '🔍 [%] Period %d ERROR DETAILS: Date window % to %, Revenue %, Appointments %', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, v_start_date, v_end_date, v_tenant_revenue, v_tenant_appointments;
                    
                -- CRITICAL: Continue to next period instead of breaking
                CONTINUE;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE '✅ Completed tenant % (% errors)', LEFT(v_tenant_record.id::text, 8), v_error_count;
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'total_errors', v_error_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', (v_processed_count * 3) - v_error_count,
        'version', 'DEFINITIVA_TOTAL_LOGGING_v1.0',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEFINITIVA TOTAL LOGGING completed: % tenants, % errors, %ms', 
        v_processed_count, v_error_count, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ GLOBAL ERROR in DEFINITIVA TOTAL LOGGING: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'total_errors', v_error_count,
        'version', 'DEFINITIVA_TOTAL_LOGGING_v1.0',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_logging(date, uuid) TO authenticated;