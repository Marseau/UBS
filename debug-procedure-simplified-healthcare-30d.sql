-- =====================================================
-- DEBUG PROCEDURE SIMPLIFICADA - HEALTHCARE 30D
-- Objetivo: Identificar exatamente onde a procedure v5.0 falha
-- para Centro Terapêutico e Clínica Mente Sã no período 30d
-- =====================================================

DROP FUNCTION IF EXISTS debug_healthcare_30d_simple();

CREATE OR REPLACE FUNCTION debug_healthcare_30d_simple() RETURNS json AS $$
DECLARE
    v_centro_id uuid := 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8';
    v_clinica_id uuid := 'fe2fa876-05da-49b5-b266-8141bcd090fa';
    v_period_days INTEGER := 30;
    v_start_date DATE := CURRENT_DATE - 29;
    v_end_date DATE := CURRENT_DATE;
    v_success_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_detailed_log JSONB := '[]'::jsonb;
    
    -- Variables for Centro Terapêutico
    v_centro_revenue DECIMAL(15,2) := 0;
    v_centro_appointments INTEGER := 0;
    v_centro_customers INTEGER := 0;
    v_centro_conversations INTEGER := 0;
    v_centro_ai_interactions INTEGER := 0;
    v_centro_subscription_cost DECIMAL(15,2) := 0;
    v_centro_services_total INTEGER := 0;
    v_centro_comprehensive_metrics JSONB;
    
    -- Variables for Clínica Mente Sã
    v_clinica_revenue DECIMAL(15,2) := 0;
    v_clinica_appointments INTEGER := 0;
    v_clinica_customers INTEGER := 0;
    v_clinica_conversations INTEGER := 0;
    v_clinica_ai_interactions INTEGER := 0;
    v_clinica_subscription_cost DECIMAL(15,2) := 0;
    v_clinica_services_total INTEGER := 0;
    v_clinica_comprehensive_metrics JSONB;
    
    v_execution_start TIMESTAMP := clock_timestamp();
    
BEGIN
    RAISE NOTICE 'DEBUG: Starting simplified healthcare 30d procedure';
    RAISE NOTICE 'DEBUG: Period % to %', v_start_date, v_end_date;
    
    -- =====================================================
    -- STEP 1: CENTRO TERAPÊUTICO DATA COLLECTION
    -- =====================================================
    BEGIN
        RAISE NOTICE 'DEBUG: Processing Centro Terapêutico...';
        
        -- Basic appointment metrics
        SELECT 
            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                    ELSE COALESCE(final_price, 0)
                END
            ), 0),
            COUNT(*),
            COUNT(DISTINCT user_id)
        INTO v_centro_revenue, v_centro_appointments, v_centro_customers
        FROM appointments 
        WHERE tenant_id = v_centro_id
          AND start_time >= v_start_date::timestamptz
          AND start_time < (v_end_date + 1)::timestamptz;
          
        RAISE NOTICE 'DEBUG: Centro - Revenue: %, Appointments: %, Customers: %', 
            v_centro_revenue, v_centro_appointments, v_centro_customers;
        
        -- Conversation metrics
        SELECT 
            COUNT(CASE WHEN is_from_user = false THEN 1 END),
            COUNT(DISTINCT conversation_context->>'session_id')
        INTO v_centro_ai_interactions, v_centro_conversations
        FROM conversation_history 
        WHERE tenant_id = v_centro_id
          AND created_at >= v_start_date::timestamptz
          AND created_at < (v_end_date + 1)::timestamptz
          AND conversation_context IS NOT NULL
          AND conversation_context ? 'session_id';
          
        RAISE NOTICE 'DEBUG: Centro - AI Interactions: %, Conversations: %', 
            v_centro_ai_interactions, v_centro_conversations;
        
        -- Subscription cost
        SELECT COALESCE(SUM(amount), 0)
        INTO v_centro_subscription_cost
        FROM subscription_payments 
        WHERE tenant_id = v_centro_id
          AND payment_date >= v_start_date
          AND payment_date < (v_end_date + 1)
          AND payment_status = 'completed';
          
        RAISE NOTICE 'DEBUG: Centro - Subscription cost: %', v_centro_subscription_cost;
        
        -- Services count
        SELECT COUNT(*)
        INTO v_centro_services_total
        FROM services 
        WHERE tenant_id = v_centro_id;
        
        RAISE NOTICE 'DEBUG: Centro - Services total: %', v_centro_services_total;
        
        -- Build comprehensive metrics
        v_centro_comprehensive_metrics := jsonb_build_object(
            'tenant_name', 'Centro Terapêutico Equilíbrio',
            'period', '30d',
            'revenue', v_centro_revenue,
            'appointments', v_centro_appointments,
            'customers', v_centro_customers,
            'conversations', v_centro_conversations,
            'ai_interactions', v_centro_ai_interactions,
            'subscription_cost', v_centro_subscription_cost,
            'services_total', v_centro_services_total,
            'debug_step', 'data_collection_completed',
            'timestamp', clock_timestamp()
        );
        
        RAISE NOTICE 'DEBUG: Centro - Comprehensive metrics built successfully';
        
        -- Try to store
        RAISE NOTICE 'DEBUG: Centro - Attempting to store metrics...';
        
        PERFORM store_tenant_metric(
            v_centro_id,
            'comprehensive',
            v_centro_comprehensive_metrics,
            '30d'
        );
        
        -- Verify storage
        IF EXISTS (
            SELECT 1 FROM tenant_metrics 
            WHERE tenant_id = v_centro_id 
            AND metric_type = 'comprehensive'
            AND period = '30d'
            AND created_at >= v_execution_start
        ) THEN
            v_success_count := v_success_count + 1;
            RAISE NOTICE 'DEBUG: Centro - ✅ SUCCESS: Metrics stored successfully';
            
            v_detailed_log := v_detailed_log || jsonb_build_object(
                'tenant', 'Centro Terapêutico',
                'status', 'SUCCESS',
                'step', 'complete_flow',
                'timestamp', clock_timestamp()
            );
        ELSE
            v_error_count := v_error_count + 1;
            RAISE WARNING 'DEBUG: Centro - ❌ FAILED: Storage verification failed';
            
            v_detailed_log := v_detailed_log || jsonb_build_object(
                'tenant', 'Centro Terapêutico',
                'status', 'FAILED',
                'step', 'storage_verification',
                'error', 'Record not found after storage',
                'timestamp', clock_timestamp()
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'DEBUG: Centro - ❌ EXCEPTION: %', SQLERRM;
        
        v_detailed_log := v_detailed_log || jsonb_build_object(
            'tenant', 'Centro Terapêutico',
            'status', 'EXCEPTION',
            'step', 'data_processing',
            'error', SQLERRM,
            'sqlstate', SQLSTATE,
            'timestamp', clock_timestamp()
        );
    END;
    
    -- =====================================================
    -- STEP 2: CLÍNICA MENTE SÃ DATA COLLECTION
    -- =====================================================
    BEGIN
        RAISE NOTICE 'DEBUG: Processing Clínica Mente Sã...';
        
        -- Basic appointment metrics
        SELECT 
            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(quoted_price, 0) > 0 THEN quoted_price
                    ELSE COALESCE(final_price, 0)
                END
            ), 0),
            COUNT(*),
            COUNT(DISTINCT user_id)
        INTO v_clinica_revenue, v_clinica_appointments, v_clinica_customers
        FROM appointments 
        WHERE tenant_id = v_clinica_id
          AND start_time >= v_start_date::timestamptz
          AND start_time < (v_end_date + 1)::timestamptz;
          
        RAISE NOTICE 'DEBUG: Clínica - Revenue: %, Appointments: %, Customers: %', 
            v_clinica_revenue, v_clinica_appointments, v_clinica_customers;
        
        -- Conversation metrics
        SELECT 
            COUNT(CASE WHEN is_from_user = false THEN 1 END),
            COUNT(DISTINCT conversation_context->>'session_id')
        INTO v_clinica_ai_interactions, v_clinica_conversations
        FROM conversation_history 
        WHERE tenant_id = v_clinica_id
          AND created_at >= v_start_date::timestamptz
          AND created_at < (v_end_date + 1)::timestamptz
          AND conversation_context IS NOT NULL
          AND conversation_context ? 'session_id';
          
        RAISE NOTICE 'DEBUG: Clínica - AI Interactions: %, Conversations: %', 
            v_clinica_ai_interactions, v_clinica_conversations;
        
        -- Subscription cost
        SELECT COALESCE(SUM(amount), 0)
        INTO v_clinica_subscription_cost
        FROM subscription_payments 
        WHERE tenant_id = v_clinica_id
          AND payment_date >= v_start_date
          AND payment_date < (v_end_date + 1)
          AND payment_status = 'completed';
          
        RAISE NOTICE 'DEBUG: Clínica - Subscription cost: %', v_clinica_subscription_cost;
        
        -- Services count
        SELECT COUNT(*)
        INTO v_clinica_services_total
        FROM services 
        WHERE tenant_id = v_clinica_id;
        
        RAISE NOTICE 'DEBUG: Clínica - Services total: %', v_clinica_services_total;
        
        -- Build comprehensive metrics
        v_clinica_comprehensive_metrics := jsonb_build_object(
            'tenant_name', 'Clínica Mente Sã',
            'period', '30d',
            'revenue', v_clinica_revenue,
            'appointments', v_clinica_appointments,
            'customers', v_clinica_customers,
            'conversations', v_clinica_conversations,
            'ai_interactions', v_clinica_ai_interactions,
            'subscription_cost', v_clinica_subscription_cost,
            'services_total', v_clinica_services_total,
            'debug_step', 'data_collection_completed',
            'timestamp', clock_timestamp()
        );
        
        RAISE NOTICE 'DEBUG: Clínica - Comprehensive metrics built successfully';
        
        -- Try to store
        RAISE NOTICE 'DEBUG: Clínica - Attempting to store metrics...';
        
        PERFORM store_tenant_metric(
            v_clinica_id,
            'comprehensive',
            v_clinica_comprehensive_metrics,
            '30d'
        );
        
        -- Verify storage
        IF EXISTS (
            SELECT 1 FROM tenant_metrics 
            WHERE tenant_id = v_clinica_id 
            AND metric_type = 'comprehensive'
            AND period = '30d'
            AND created_at >= v_execution_start
        ) THEN
            v_success_count := v_success_count + 1;
            RAISE NOTICE 'DEBUG: Clínica - ✅ SUCCESS: Metrics stored successfully';
            
            v_detailed_log := v_detailed_log || jsonb_build_object(
                'tenant', 'Clínica Mente Sã',
                'status', 'SUCCESS',
                'step', 'complete_flow',
                'timestamp', clock_timestamp()
            );
        ELSE
            v_error_count := v_error_count + 1;
            RAISE WARNING 'DEBUG: Clínica - ❌ FAILED: Storage verification failed';
            
            v_detailed_log := v_detailed_log || jsonb_build_object(
                'tenant', 'Clínica Mente Sã',
                'status', 'FAILED',
                'step', 'storage_verification',
                'error', 'Record not found after storage',
                'timestamp', clock_timestamp()
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'DEBUG: Clínica - ❌ EXCEPTION: %', SQLERRM;
        
        v_detailed_log := v_detailed_log || jsonb_build_object(
            'tenant', 'Clínica Mente Sã',
            'status', 'EXCEPTION',
            'step', 'data_processing',
            'error', SQLERRM,
            'sqlstate', SQLSTATE,
            'timestamp', clock_timestamp()
        );
    END;
    
    -- =====================================================
    -- FINAL RESULT
    -- =====================================================
    
    RAISE NOTICE 'DEBUG: Completed - Success: %, Errors: %', v_success_count, v_error_count;
    
    RETURN json_build_object(
        'success', v_error_count = 0,
        'success_count', v_success_count,
        'error_count', v_error_count,
        'expected_records', 2,
        'detailed_log', v_detailed_log,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start),
        'debug_version', 'simplified_healthcare_30d_v1.0'
    );
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CRITICAL ERROR in debug procedure: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'critical_error', SQLERRM,
        'sqlstate', SQLSTATE,
        'success_count', v_success_count,
        'error_count', v_error_count,
        'detailed_log', v_detailed_log,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION debug_healthcare_30d_simple() TO authenticated;