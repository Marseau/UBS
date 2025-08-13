-- =====================================================
-- DEFINITIVA TOTAL v10.0 - NO EXCEPTION HANDLING 
-- Remove ALL exception handling to see the real errors
-- All 8 critical fixes applied + show raw PostgreSQL errors
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_definitiva_total_v10(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_definitiva_total_v10(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result json;
    v_period_days INTEGER;
    
    -- FIX 1: Correct date window calculation
    v_start_date DATE;
    v_end_date DATE;
    
    -- Essential data variables
    v_tenant_revenue DECIMAL(15,2) := 0;
    v_tenant_appointments INTEGER := 0;
    v_tenant_customers INTEGER := 0;
    v_tenant_conversations INTEGER := 0;
    v_tenant_ai_interactions INTEGER := 0;
    v_tenant_total_messages INTEGER := 0;
    
    -- Final comprehensive metrics
    v_comprehensive_metrics JSONB;
    
BEGIN
    RAISE NOTICE '🚀 Starting DEFINITIVA TOTAL v10.0 - NO EXCEPTION HANDLING (SHOW REAL ERRORS)';
    
    -- Get first tenant only to isolate issue
    SELECT id, business_name INTO v_tenant_record
    FROM tenants 
    WHERE (p_tenant_id IS NULL OR id = p_tenant_id) AND status = 'active'
    ORDER BY business_name
    LIMIT 1;
    
    IF v_tenant_record.id IS NULL THEN
        RAISE NOTICE 'No active tenants found';
        RETURN json_build_object('success', false, 'error', 'No active tenants found');
    END IF;
    
    RAISE NOTICE '🏢 Processing tenant: % (%)', v_tenant_record.business_name, LEFT(v_tenant_record.id::text, 8);
    
    -- Test ONLY ONE PERIOD to isolate the issue
    v_period_days := 30;
    
    -- FIX 1: Correct date window calculation  
    v_start_date := p_calculation_date - (v_period_days - 1);
    v_end_date := p_calculation_date;
    
    RAISE NOTICE '📅 Date range: % to %', v_start_date, v_end_date;
    
    -- Get basic tenant data with all fixes applied
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
    
    RAISE NOTICE '💰 Basic data: Revenue=%, Appointments=%, Customers=%', 
        v_tenant_revenue, v_tenant_appointments, v_tenant_customers;
    
    -- FIX 2: Tenant conversations with correct JSONB access
    SELECT 
        COUNT(CASE WHEN is_from_user = false THEN 1 END),
        COUNT(DISTINCT conversation_context->>'session_id'),
        COUNT(*)
    INTO v_tenant_ai_interactions, v_tenant_conversations, v_tenant_total_messages
    FROM conversation_history 
    WHERE tenant_id = v_tenant_record.id
      AND created_at >= v_start_date::timestamptz
      AND created_at < (v_end_date + 1)::timestamptz
      AND conversation_context ? 'session_id';
    
    RAISE NOTICE '💬 Conversation data: AI_interactions=%, Conversations=%, Messages=%', 
        v_tenant_ai_interactions, v_tenant_conversations, v_tenant_total_messages;
    
    -- Build SIMPLE comprehensive metrics
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
            'ai_interactions_total', v_tenant_ai_interactions,
            'messages_per_conversation', CASE WHEN v_tenant_conversations > 0 THEN (v_tenant_total_messages::decimal / v_tenant_conversations) ELSE 0 END
        ),
        'metadata', jsonb_build_object(
            'calculation_date', p_calculation_date,
            'period_days', v_period_days,
            'period_start', v_start_date,
            'period_end', v_end_date,
            'version', 'DEFINITIVA_TOTAL_v10.0_NO_EXCEPTION_HANDLING',
            'purpose', 'show_real_errors'
        )
    );
    
    RAISE NOTICE '📦 Built JSONB metrics: %', v_comprehensive_metrics::text;
    RAISE NOTICE '🎯 About to call store_tenant_metric with:';
    RAISE NOTICE '   - tenant_id: %', v_tenant_record.id;
    RAISE NOTICE '   - metric_type: comprehensive';
    RAISE NOTICE '   - period: %', v_period_days || 'd';
    RAISE NOTICE '   - jsonb size: % chars', LENGTH(v_comprehensive_metrics::text);
    
    -- NO EXCEPTION HANDLING - Let PostgreSQL show us the real error
    PERFORM store_tenant_metric(
        v_tenant_record.id,
        'comprehensive',
        v_comprehensive_metrics,
        v_period_days || 'd'
    );
    
    RAISE NOTICE '✅ store_tenant_metric call completed successfully!';
    
    v_processed_count := 1;
    
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'periods_processed', ARRAY[v_period_days],
        'total_metrics_created', 1,
        'version', 'DEFINITIVA_TOTAL_v10.0_NO_EXCEPTION_HANDLING',
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE '🏁 DEFINITIVA TOTAL v10.0 completed successfully in %ms', 
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_definitiva_total_v10(date, uuid) TO authenticated;