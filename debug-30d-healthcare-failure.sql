-- Debug Query: Investigação da Falha 30d para Tenants Healthcare
-- Data: 2025-08-10
-- Foco: Centro Terapêutico e Clínica Mente Sã

-- =================================================================================
-- 1. IDENTIFICAÇÃO DOS TENANTS HEALTHCARE PROBLEMÁTICOS
-- =================================================================================

DO $$ 
DECLARE
    healthcare_tenant_ids INTEGER[] := ARRAY[1754748774142, 1754760259082]; -- Centro Terapêutico, Clínica Mente Sã
    tenant_id INTEGER;
    current_date_debug DATE := CURRENT_DATE;
    date_7d DATE := current_date_debug - INTERVAL '7 days';
    date_30d DATE := current_date_debug - INTERVAL '30 days';
    date_90d DATE := current_date_debug - INTERVAL '90 days';
BEGIN
    RAISE NOTICE '=== DEBUG 30D HEALTHCARE FAILURE ANALYSIS ===';
    RAISE NOTICE 'Current Date: %', current_date_debug;
    RAISE NOTICE '7d Window: % to %', date_7d, current_date_debug;
    RAISE NOTICE '30d Window: % to %', date_30d, current_date_debug;
    RAISE NOTICE '90d Window: % to %', date_90d, current_date_debug;
    RAISE NOTICE '';

    -- Loop através dos tenants healthcare problemáticos
    FOREACH tenant_id IN ARRAY healthcare_tenant_ids
    LOOP
        RAISE NOTICE '======================================';
        RAISE NOTICE 'TENANT ID: %', tenant_id;
        RAISE NOTICE '======================================';
        
        -- =================================================================================
        -- 2. TESTE DE LÓGICA DE DATE WINDOW PARA 30D
        -- =================================================================================
        
        RAISE NOTICE '';
        RAISE NOTICE '--- DATE WINDOW LOGIC TEST FOR 30D ---';
        
        -- Test basic date logic
        PERFORM 1;
        RAISE NOTICE 'Date 30d calculation: CURRENT_DATE - INTERVAL ''30 days'' = %', date_30d;
        RAISE NOTICE 'Date range for 30d: % to %', date_30d, current_date_debug;
        
        -- =================================================================================
        -- 3. VOLUME DE DADOS POR PERÍODO
        -- =================================================================================
        
        RAISE NOTICE '';
        RAISE NOTICE '--- DATA VOLUME COMPARISON ---';
        
        -- Appointments volume
        DECLARE
            count_7d INTEGER;
            count_30d INTEGER;
            count_90d INTEGER;
        BEGIN
            -- 7d appointments
            SELECT COUNT(*) INTO count_7d
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_7d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 30d appointments
            SELECT COUNT(*) INTO count_30d
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 90d appointments
            SELECT COUNT(*) INTO count_90d
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_90d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            RAISE NOTICE 'Appointments Volume - 7d: %, 30d: %, 90d: %', count_7d, count_30d, count_90d;
            
            IF count_30d = 0 THEN
                RAISE NOTICE 'WARNING: No appointments found in 30d period!';
            END IF;
        END;
        
        -- Conversation History volume
        DECLARE
            conv_7d INTEGER;
            conv_30d INTEGER;
            conv_90d INTEGER;
        BEGIN
            -- 7d conversations
            SELECT COUNT(*) INTO conv_7d
            FROM conversation_history 
            WHERE tenant_id = tenant_id
            AND created_at >= date_7d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 30d conversations
            SELECT COUNT(*) INTO conv_30d
            FROM conversation_history 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 90d conversations
            SELECT COUNT(*) INTO conv_90d
            FROM conversation_history 
            WHERE tenant_id = tenant_id
            AND created_at >= date_90d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            RAISE NOTICE 'Conversations Volume - 7d: %, 30d: %, 90d: %', conv_7d, conv_30d, conv_90d;
        END;
        
        -- Services volume
        DECLARE
            serv_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO serv_count
            FROM services 
            WHERE tenant_id = tenant_id;
            
            RAISE NOTICE 'Services Available: %', serv_count;
        END;
        
        -- Subscription payments volume
        DECLARE
            pay_7d INTEGER;
            pay_30d INTEGER;
            pay_90d INTEGER;
        BEGIN
            -- 7d payments
            SELECT COUNT(*) INTO pay_7d
            FROM subscription_payments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_7d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 30d payments
            SELECT COUNT(*) INTO pay_30d
            FROM subscription_payments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            -- 90d payments
            SELECT COUNT(*) INTO pay_90d
            FROM subscription_payments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_90d 
            AND created_at < current_date_debug + INTERVAL '1 day';
            
            RAISE NOTICE 'Payments Volume - 7d: %, 30d: %, 90d: %', pay_7d, pay_30d, pay_90d;
        END;
        
        -- =================================================================================
        -- 4. VERIFICAÇÃO DE DADOS PROBLEMÁTICOS (NULLS, JSONB MALFORMADO)
        -- =================================================================================
        
        RAISE NOTICE '';
        RAISE NOTICE '--- DATA QUALITY CHECK FOR 30D PERIOD ---';
        
        -- Check for NULL values in critical fields (30d period)
        DECLARE
            null_status INTEGER;
            null_service_ids INTEGER;
            null_created_at INTEGER;
            null_customer_phone INTEGER;
        BEGIN
            -- Appointments with NULL status
            SELECT COUNT(*) INTO null_status
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day'
            AND status IS NULL;
            
            -- Appointments with NULL service_ids
            SELECT COUNT(*) INTO null_service_ids
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day'
            AND service_ids IS NULL;
            
            -- Appointments with NULL created_at
            SELECT COUNT(*) INTO null_created_at
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at IS NULL;
            
            -- Appointments with NULL customer_phone
            SELECT COUNT(*) INTO null_customer_phone
            FROM appointments 
            WHERE tenant_id = tenant_id
            AND created_at >= date_30d 
            AND created_at < current_date_debug + INTERVAL '1 day'
            AND customer_phone IS NULL;
            
            RAISE NOTICE 'NULL Values in 30d - Status: %, Service_IDs: %, Created_At: %, Customer_Phone: %', 
                null_status, null_service_ids, null_created_at, null_customer_phone;
            
            IF null_status > 0 OR null_service_ids > 0 OR null_customer_phone > 0 THEN
                RAISE NOTICE 'WARNING: Critical NULL values detected in 30d period!';
            END IF;
        END;
        
        -- Check for malformed JSONB in service_ids (30d period)
        DECLARE
            malformed_jsonb INTEGER := 0;
            test_record RECORD;
        BEGIN
            FOR test_record IN 
                SELECT id, service_ids
                FROM appointments 
                WHERE tenant_id = tenant_id
                AND created_at >= date_30d 
                AND created_at < current_date_debug + INTERVAL '1 day'
                AND service_ids IS NOT NULL
                LIMIT 100  -- Test sample
            LOOP
                BEGIN
                    -- Try to parse JSONB
                    PERFORM test_record.service_ids::jsonb;
                EXCEPTION WHEN OTHERS THEN
                    malformed_jsonb := malformed_jsonb + 1;
                    RAISE NOTICE 'Malformed JSONB detected in appointment ID %: %', test_record.id, test_record.service_ids;
                END;
            END LOOP;
            
            RAISE NOTICE 'Malformed JSONB count in 30d sample: %', malformed_jsonb;
        END;
        
        -- =================================================================================
        -- 5. DETALHES ESPECÍFICOS DOS REGISTROS 30D
        -- =================================================================================
        
        RAISE NOTICE '';
        RAISE NOTICE '--- DETAILED 30D RECORDS ANALYSIS ---';
        
        -- Show sample appointments in 30d period
        DECLARE
            sample_record RECORD;
            sample_count INTEGER := 0;
        BEGIN
            FOR sample_record IN 
                SELECT 
                    id, 
                    status, 
                    created_at, 
                    service_ids,
                    CASE 
                        WHEN service_ids IS NOT NULL THEN 
                            CASE 
                                WHEN service_ids::text = '[]' THEN 'EMPTY_ARRAY'
                                WHEN service_ids::text = '{}' THEN 'EMPTY_OBJECT' 
                                WHEN service_ids::text = 'null' THEN 'NULL_JSONB'
                                ELSE 'HAS_DATA'
                            END
                        ELSE 'NULL'
                    END as service_ids_status
                FROM appointments 
                WHERE tenant_id = tenant_id
                AND created_at >= date_30d 
                AND created_at < current_date_debug + INTERVAL '1 day'
                ORDER BY created_at DESC
                LIMIT 5
            LOOP
                sample_count := sample_count + 1;
                RAISE NOTICE 'Sample %: ID=%, Status=%, Date=%, ServiceIDs=%, ServiceIDsStatus=%', 
                    sample_count, sample_record.id, sample_record.status, sample_record.created_at, 
                    sample_record.service_ids, sample_record.service_ids_status;
            END LOOP;
            
            IF sample_count = 0 THEN
                RAISE NOTICE 'No appointments found in 30d period for detailed analysis';
            END IF;
        END;
        
        -- =================================================================================
        -- 6. TESTE DA PROCEDURE ESPECÍFICA PARA 30D
        -- =================================================================================
        
        RAISE NOTICE '';
        RAISE NOTICE '--- TESTING 30D PROCEDURE LOGIC ---';
        
        -- Test the specific logic that might be failing
        DECLARE
            total_appointments INTEGER;
            confirmed_appointments INTEGER;
            completed_appointments INTEGER;
            cancelled_appointments INTEGER;
            services_available INTEGER;
            avg_conversation_length NUMERIC;
            error_occurred BOOLEAN := FALSE;
        BEGIN
            -- Test each metric calculation for 30d
            
            -- Total appointments
            BEGIN
                SELECT COUNT(*) INTO total_appointments
                FROM appointments a
                WHERE a.tenant_id = tenant_id
                AND a.created_at >= date_30d 
                AND a.created_at < current_date_debug + INTERVAL '1 day';
                
                RAISE NOTICE '30d Total Appointments: %', total_appointments;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating total appointments: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Confirmed appointments
            BEGIN
                SELECT COUNT(*) INTO confirmed_appointments
                FROM appointments a
                WHERE a.tenant_id = tenant_id
                AND a.created_at >= date_30d 
                AND a.created_at < current_date_debug + INTERVAL '1 day'
                AND LOWER(a.status) IN ('confirmed', 'confirmado');
                
                RAISE NOTICE '30d Confirmed Appointments: %', confirmed_appointments;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating confirmed appointments: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Completed appointments
            BEGIN
                SELECT COUNT(*) INTO completed_appointments
                FROM appointments a
                WHERE a.tenant_id = tenant_id
                AND a.created_at >= date_30d 
                AND a.created_at < current_date_debug + INTERVAL '1 day'
                AND LOWER(a.status) IN ('completed', 'concluído', 'concluido', 'finalizado');
                
                RAISE NOTICE '30d Completed Appointments: %', completed_appointments;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating completed appointments: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Cancelled appointments
            BEGIN
                SELECT COUNT(*) INTO cancelled_appointments
                FROM appointments a
                WHERE a.tenant_id = tenant_id
                AND a.created_at >= date_30d 
                AND a.created_at < current_date_debug + INTERVAL '1 day'
                AND LOWER(a.status) IN ('cancelled', 'cancelado', 'cancelado pelo cliente');
                
                RAISE NOTICE '30d Cancelled Appointments: %', cancelled_appointments;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating cancelled appointments: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Services available (complex JSONB query)
            BEGIN
                WITH service_counts AS (
                    SELECT 
                        jsonb_array_length(
                            CASE 
                                WHEN service_ids IS NULL OR service_ids::text = 'null' THEN '[]'::jsonb
                                WHEN jsonb_typeof(service_ids) = 'array' THEN service_ids
                                ELSE '[]'::jsonb
                            END
                        ) as service_count
                    FROM appointments a
                    WHERE a.tenant_id = tenant_id
                    AND a.created_at >= date_30d 
                    AND a.created_at < current_date_debug + INTERVAL '1 day'
                    AND service_ids IS NOT NULL
                )
                SELECT COALESCE(SUM(service_count), 0) INTO services_available
                FROM service_counts;
                
                RAISE NOTICE '30d Services Available: %', services_available;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating services available: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Average conversation length
            BEGIN
                SELECT COALESCE(AVG(LENGTH(message_content)), 0) INTO avg_conversation_length
                FROM conversation_history ch
                WHERE ch.tenant_id = tenant_id
                AND ch.created_at >= date_30d 
                AND ch.created_at < current_date_debug + INTERVAL '1 day';
                
                RAISE NOTICE '30d Avg Conversation Length: %', ROUND(avg_conversation_length, 2);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'ERROR calculating avg conversation length: %', SQLERRM;
                error_occurred := TRUE;
            END;
            
            -- Summary
            IF error_occurred THEN
                RAISE NOTICE 'CRITICAL: Errors detected in 30d calculation for tenant %!', tenant_id;
            ELSE
                RAISE NOTICE 'SUCCESS: All 30d metrics calculated without errors for tenant %', tenant_id;
            END IF;
        END;
        
        RAISE NOTICE '';
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== END DEBUG ANALYSIS ===';
END $$;

-- =================================================================================
-- 7. COMPARAÇÃO DIRETA DE DADOS ENTRE PERÍODOS
-- =================================================================================

WITH period_comparison AS (
    SELECT 
        a.tenant_id,
        CASE 
            WHEN a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN '7d'
            WHEN a.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN '30d'
            WHEN a.created_at >= CURRENT_DATE - INTERVAL '90 days' THEN '90d'
            ELSE 'older'
        END as period,
        COUNT(*) as appointment_count,
        COUNT(CASE WHEN service_ids IS NOT NULL THEN 1 END) as with_service_ids,
        COUNT(CASE WHEN service_ids IS NULL THEN 1 END) as without_service_ids,
        COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status_count,
        COUNT(DISTINCT status) as unique_statuses
    FROM appointments a
    WHERE a.tenant_id IN (1754748774142, 1754760259082)  -- Healthcare tenants
    AND a.created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY a.tenant_id, period
)
SELECT 
    tenant_id,
    period,
    appointment_count,
    with_service_ids,
    without_service_ids,
    null_status_count,
    unique_statuses,
    ROUND(100.0 * with_service_ids / NULLIF(appointment_count, 0), 2) as service_ids_percentage
FROM period_comparison
WHERE period IN ('7d', '30d', '90d')
ORDER BY tenant_id, 
    CASE period 
        WHEN '7d' THEN 1 
        WHEN '30d' THEN 2 
        WHEN '90d' THEN 3 
    END;

-- =================================================================================
-- 8. VERIFICAÇÃO DE ÍNDICES E PERFORMANCE
-- =================================================================================

-- Check if proper indexes exist for 30d queries
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('appointments', 'conversation_history', 'services', 'subscription_payments')
AND indexdef LIKE '%tenant_id%'
ORDER BY tablename, indexname;

-- Check for slow queries that might timeout on 30d
SELECT 
    'appointments' as table_name,
    COUNT(*) as total_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM appointments 
WHERE tenant_id IN (1754748774142, 1754760259082)

UNION ALL

SELECT 
    'conversation_history' as table_name,
    COUNT(*) as total_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM conversation_history 
WHERE tenant_id IN (1754748774142, 1754760259082);