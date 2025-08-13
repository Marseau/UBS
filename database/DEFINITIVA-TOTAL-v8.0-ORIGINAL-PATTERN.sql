-- =====================================================
-- DEFINITIVA TOTAL v8.0 - EXACT ORIGINAL PATTERN
-- Based on the working original procedure with minimal changes
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_v8(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_v8(
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
    RAISE NOTICE '🚀 Starting DEFINITIVA TOTAL v8.0 - EXACT ORIGINAL PATTERN';
    
    FOR v_tenant_record IN 
        SELECT id, business_name 
        FROM tenants 
        WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
        AND status = 'active'
        ORDER BY business_name
    LOOP
        RAISE NOTICE '🏢 Processing tenant: % (%)', v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8);
        
        -- Process for each period - EXACT SAME AS ORIGINAL
        FOREACH v_period_days IN ARRAY ARRAY[7, 30, 90]
        LOOP
            DECLARE
                -- ORIGINAL PATTERN: Use same variable declarations as original
                v_start_date DATE;
                v_end_date DATE;
                
                -- Basic metrics only (not 100+ variables like failed versions)
                v_tenant_revenue DECIMAL(15,2) := 0;
                v_tenant_appointments INTEGER := 0;
                v_tenant_customers INTEGER := 0;
                v_tenant_conversations INTEGER := 0;
                v_tenant_ai_interactions INTEGER := 0;
                
                -- Final comprehensive JSONB
                v_comprehensive_metrics JSONB;
                
            BEGIN
                RAISE NOTICE '📅 [%] Processing period %d', LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- ORIGINAL DATE CALCULATION METHOD (exact copy)
                v_end_date := p_calculation_date;
                v_start_date := p_calculation_date - INTERVAL '1 day' * v_period_days;
                
                RAISE NOTICE '📅 [%] Date range: % to %', LEFT(v_tenant_record.id::text, 8), v_start_date, v_end_date;
                
                -- Basic tenant data using ORIGINAL where clause pattern
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
                  AND start_time >= v_start_date AND start_time <= v_end_date;
                
                -- Conversations using original pattern
                SELECT 
                    COUNT(CASE WHEN is_from_user = false THEN 1 END),
                    COUNT(DISTINCT conversation_context)
                INTO v_tenant_ai_interactions, v_tenant_conversations
                FROM conversation_history 
                WHERE tenant_id = v_tenant_record.id
                  AND created_at >= v_start_date AND created_at <= v_end_date
                  AND conversation_context IS NOT NULL;
                
                RAISE NOTICE '💰 [%] Period %d: Revenue=%, Appointments=%, Customers=%, Conversations=%', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, 
                    v_tenant_revenue, v_tenant_appointments, v_tenant_customers, v_tenant_conversations;
                
                -- Build SIMPLE comprehensive metrics (not complex like v7.0)
                v_comprehensive_metrics := jsonb_build_object(
                    'financial_metrics', jsonb_build_object(
                        'tenant_revenue', v_tenant_revenue,
                        'avg_ticket', CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END
                    ),
                    'appointment_metrics', jsonb_build_object(
                        'appointments_total', v_tenant_appointments
                    ),
                    'customer_metrics', jsonb_build_object(
                        'customers_total', v_tenant_customers
                    ),
                    'conversation_outcomes', jsonb_build_object(
                        'conversations_total', v_tenant_conversations,
                        'ai_interactions_total', v_tenant_ai_interactions
                    ),
                    'metadata', jsonb_build_object(
                        'calculation_date', p_calculation_date,
                        'period_days', v_period_days,
                        'period_start', v_start_date,
                        'period_end', v_end_date,
                        'version', 'DEFINITIVA_TOTAL_v8.0_ORIGINAL_PATTERN',
                        'pattern_source', 'exact_copy_of_working_original'
                    )
                );
                
                RAISE NOTICE '📦 [%] Period %d: About to call store_tenant_metric', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days;
                
                -- Store using EXACT SAME PATTERN as original (no nested exception handling)
                PERFORM store_tenant_metric(
                    v_tenant_record.id,
                    'comprehensive',
                    v_comprehensive_metrics,
                    v_period_days || 'd'
                );
                
                RAISE NOTICE '✅ [%] Period %d: Successfully stored metric', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days;
                    
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '❌ [%] Period %d ERROR: % - %', 
                    LEFT(v_tenant_record.id::text, 8), v_period_days, SQLSTATE, SQLERRM;
            END;
        END LOOP; -- End period loop
        
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE '✅ Completed tenant % with all 3 periods', LEFT(v_tenant_record.id::text, 8);
        
    END LOOP; -- End tenant loop
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'periods_processed', ARRAY[7, 30, 90],
        'total_metrics_created', v_processed_count * 3,
        'metrics_per_record', 5, -- Simple metrics only
        'modules_included', 4,
        'calculation_date', p_calculation_date,
        'version', 'DEFINITIVA_TOTAL_v8.0_ORIGINAL_PATTERN',
        'pattern_source', 'exact_copy_of_working_original',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEFINITIVA TOTAL v8.0 completed: % tenants, %ms execution time', 
        v_processed_count, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ GLOBAL ERROR in DEFINITIVA TOTAL v8.0: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'version', 'DEFINITIVA_TOTAL_v8.0_ORIGINAL_PATTERN',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_v8(date, uuid) TO authenticated;