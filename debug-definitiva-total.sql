-- =====================================================
-- DEBUG VERSION: DEFINITIVA TOTAL with detailed logging
-- This will help us track exactly where the 2 missing 30d records are lost
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_debug(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_debug(
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
    RAISE NOTICE '🚀 Starting DEBUG DEFINITIVA TOTAL version';
    
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
                
                -- Test variables for the specific failing tenants
                v_tenant_revenue DECIMAL(15,2) := 0;
                v_tenant_appointments INTEGER := 0;
                v_tenant_conversations INTEGER := 0;
                v_tenant_ai_interactions INTEGER := 0;
                
                -- Comprehensive metrics JSON
                v_comprehensive_metrics JSONB;
                
            BEGIN
                RAISE NOTICE '📅 Period %d: Date window % to % (start < end: %)', 
                    v_period_days, v_start_date, v_end_date, v_start_date < v_end_date;
                
                -- Special focus on failing tenants
                IF LEFT(v_tenant_record.id::text, 8) IN ('f34d8c94', 'fe2fa876') AND v_period_days = 30 THEN
                    RAISE NOTICE '🔍 DEBUGGING FAILING TENANT % for 30d period', LEFT(v_tenant_record.id::text, 8);
                END IF;
                
                -- Test appointments query for this tenant/period
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                            ELSE COALESCE(final_price, 0)
                        END
                    ), 0),
                    COUNT(*)
                INTO v_tenant_revenue, v_tenant_appointments
                FROM appointments 
                WHERE tenant_id = v_tenant_record.id
                  AND start_time >= v_start_date::timestamptz
                  AND start_time < (v_end_date + 1)::timestamptz;
                
                RAISE NOTICE '💰 Revenue: %, Appointments: %', v_tenant_revenue, v_tenant_appointments;
                
                -- Test conversations query
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context->>'session_id')
                INTO v_tenant_ai_interactions, v_tenant_conversations
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date::timestamptz
                  AND created_at < (v_end_date + 1)::timestamptz
                  AND conversation_context ? 'session_id';
                  
                RAISE NOTICE '💬 Conversations: %, AI Interactions: %', v_tenant_conversations, v_tenant_ai_interactions;
                
                -- Build minimal comprehensive metrics for debugging
                v_comprehensive_metrics := jsonb_build_object(
                    'debug_info', jsonb_build_object(
                        'tenant_id', v_tenant_record.id,
                        'period_days', v_period_days,
                        'date_window', jsonb_build_object(
                            'start', v_start_date,
                            'end', v_end_date
                        ),
                        'tenant_revenue', v_tenant_revenue,
                        'tenant_appointments', v_tenant_appointments,
                        'tenant_conversations', v_tenant_conversations,
                        'ai_interactions', v_tenant_ai_interactions
                    ),
                    'financial_metrics', jsonb_build_object(
                        'tenant_revenue', v_tenant_revenue
                    ),
                    'appointment_metrics', jsonb_build_object(
                        'appointments_total', v_tenant_appointments
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'data_source', 'debug_definitiva_total',
                        'version', 'DEBUG_v1.0'
                    )
                );
                
                RAISE NOTICE '📦 About to call store_tenant_metric for tenant % period %d', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- Store metrics (this is where the problem might be)
                BEGIN
                    PERFORM store_tenant_metric(
                        v_tenant_record.id,
                        'comprehensive_debug',
                        v_comprehensive_metrics,
                        v_period_days || 'd'
                    );
                    
                    RAISE NOTICE '✅ Successfully stored metric for tenant % period %d', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days;
                        
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING '❌ ERROR storing metric for tenant % period %d: % - %', 
                        LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
                END;
                    
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '❌ ERROR processing tenant % for %d period: % - %', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', v_processed_count * 3,
        'version', 'DEBUG_DEFINITIVA_TOTAL_v1.0',
        'debug_mode', true,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEBUG DEFINITIVA TOTAL completed: % tenants × 3 periods = % records in %ms', 
        v_processed_count, 
        v_processed_count * 3,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ GLOBAL ERROR in DEBUG DEFINITIVA TOTAL: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'debug_mode', true,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_debug(date, uuid) TO authenticated;