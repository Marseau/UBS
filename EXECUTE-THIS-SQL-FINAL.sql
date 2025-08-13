-- ==========================================
-- FINAL CORRECTED FUNCTION - EXECUTE IN SUPABASE SQL EDITOR
-- ==========================================
-- This fixes the RECORD field issue in calculate_ubs_metrics_system
-- ==========================================

-- DROP AND RECREATE FUNCTION WITH CORRECT RECORD HANDLING
DROP FUNCTION IF EXISTS calculate_ubs_metrics_system(DATE, INTEGER, UUID);

CREATE OR REPLACE FUNCTION calculate_ubs_metrics_system(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_record RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result JSON;
    -- Platform totals as individual variables
    v_platform_revenue DECIMAL(12,2) := 0;
    v_platform_appointments INTEGER := 0;
    v_platform_customers INTEGER := 0;
    v_platform_ai_interactions INTEGER := 0;
    v_platform_mrr DECIMAL(12,2) := 0;
BEGIN
    -- Calculate period dates
    v_end_date := p_calculation_date;
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    RAISE NOTICE 'Calculating UBS metrics for period % to % (% days)', v_start_date, v_end_date, p_period_days;
    
    -- 1. CALCULATE PLATFORM TOTALS FIRST
    SELECT 
        COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0),
        COUNT(*),
        COUNT(DISTINCT user_id)
    INTO v_platform_revenue, v_platform_appointments, v_platform_customers
    FROM appointments 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Calculate AI interactions
    SELECT COUNT(*) INTO v_platform_ai_interactions
    FROM conversation_history 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date
      AND is_from_user = false
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Calculate platform MRR
    SELECT (COUNT(DISTINCT tenant_id) * 79.90) INTO v_platform_mrr
    FROM appointments 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date;
    
    RAISE NOTICE 'Platform totals: Revenue=%, Appointments=%, Customers=%, AI=%, MRR=%', 
        v_platform_revenue, v_platform_appointments, v_platform_customers, v_platform_ai_interactions, v_platform_mrr;
    
    -- 2. PROCESS EACH TENANT
    FOR v_tenant_record IN 
        SELECT t.id, t.business_name 
        FROM tenants t
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        ORDER BY t.business_name
    LOOP
        DECLARE
            v_tenant_revenue DECIMAL(12,2) := 0;
            v_tenant_appointments INTEGER := 0;
            v_tenant_customers INTEGER := 0;
            v_tenant_confirmed INTEGER := 0;
            v_tenant_cancelled INTEGER := 0;
            v_tenant_completed INTEGER := 0;
            v_tenant_rescheduled INTEGER := 0;
            v_tenant_ai_interactions INTEGER := 0;
            v_revenue_participation DECIMAL(5,2) := 0;
            v_appointments_participation DECIMAL(5,2) := 0;
            v_customers_participation DECIMAL(5,2) := 0;
            v_ai_participation DECIMAL(5,2) := 0;
            v_health_score INTEGER := 0;
            v_risk_level VARCHAR(20) := 'Unknown';
        BEGIN
            -- Calculate tenant metrics
            SELECT 
                COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0),
                COUNT(*),
                COUNT(DISTINCT user_id),
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
                COUNT(CASE WHEN status = 'completed' THEN 1 END),
                COUNT(CASE WHEN status = 'rescheduled' THEN 1 END)
            INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers, 
                 v_tenant_confirmed, v_tenant_cancelled, v_tenant_completed, v_tenant_rescheduled
            FROM appointments 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date;
            
            -- Calculate AI interactions for tenant
            SELECT COUNT(*) INTO v_tenant_ai_interactions
            FROM conversation_history 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date
              AND is_from_user = false;
            
            -- Calculate participation percentages
            v_revenue_participation := 
                CASE WHEN v_platform_revenue > 0 
                     THEN (v_tenant_revenue / v_platform_revenue) * 100 
                     ELSE 0 END;
                     
            v_appointments_participation := 
                CASE WHEN v_platform_appointments > 0 
                     THEN (v_tenant_appointments::DECIMAL / v_platform_appointments) * 100 
                     ELSE 0 END;
                     
            v_customers_participation := 
                CASE WHEN v_platform_customers > 0 
                     THEN (v_tenant_customers::DECIMAL / v_platform_customers) * 100 
                     ELSE 0 END;
                     
            v_ai_participation := 
                CASE WHEN v_platform_ai_interactions > 0 
                     THEN (v_tenant_ai_interactions::DECIMAL / v_platform_ai_interactions) * 100 
                     ELSE 0 END;
            
            -- Calculate health score
            v_health_score := ROUND(
                (v_revenue_participation * 0.4) + 
                (v_appointments_participation * 0.3) + 
                (v_customers_participation * 0.2) + 
                (v_ai_participation * 0.1)
            );
            
            -- Determine risk level
            v_risk_level := 
                CASE WHEN v_health_score >= 70 THEN 'Low'
                     WHEN v_health_score >= 40 THEN 'Medium'
                     ELSE 'High' END;
            
            -- Insert/update using CORRECT column names
            INSERT INTO ubs_metric_system (
                tenant_id,
                calculation_date,
                period_days,
                period_start_date,
                period_end_date,
                
                -- Revenue metrics
                tenant_revenue_value,
                tenant_revenue_participation_pct,
                tenant_revenue_trend,
                platform_total_revenue,
                
                -- Appointments metrics
                tenant_appointments_count,
                tenant_appointments_participation_pct,
                tenant_appointments_confirmed,
                tenant_appointments_cancelled,
                tenant_appointments_completed,
                tenant_appointments_rescheduled,
                platform_total_appointments,
                
                -- Customers metrics
                tenant_customers_count,
                tenant_customers_participation_pct,
                platform_total_customers,
                
                -- AI metrics
                tenant_ai_interactions,
                tenant_ai_participation_pct,
                platform_total_ai_interactions,
                
                -- Platform metrics
                platform_mrr,
                platform_active_tenants,
                
                -- Business Intelligence
                tenant_health_score,
                tenant_risk_level,
                
                -- Metadata
                data_source,
                notes
            ) VALUES (
                v_tenant_record.id,
                p_calculation_date,
                p_period_days,
                v_start_date,
                v_end_date,
                
                -- Revenue
                v_tenant_revenue,
                v_revenue_participation,
                CASE WHEN v_revenue_participation > 5 THEN 'growing'
                     WHEN v_revenue_participation < 2 THEN 'declining'
                     ELSE 'stable' END,
                v_platform_revenue,
                
                -- Appointments
                v_tenant_appointments,
                v_appointments_participation,
                v_tenant_confirmed,
                v_tenant_cancelled,
                v_tenant_completed,
                v_tenant_rescheduled,
                v_platform_appointments,
                
                -- Customers
                v_tenant_customers,
                v_customers_participation,
                v_platform_customers,
                
                -- AI
                v_tenant_ai_interactions,
                v_ai_participation,
                v_platform_ai_interactions,
                
                -- Platform
                v_platform_mrr,
                (SELECT COUNT(DISTINCT tenant_id) FROM appointments 
                 WHERE created_at >= v_start_date AND created_at <= v_end_date),
                
                -- Business Intelligence
                v_health_score,
                v_risk_level,
                
                -- Metadata
                'final_fixed_function',
                format('Final fixed function executed on %s for %s days period', 
                       clock_timestamp(), p_period_days)
            )
            ON CONFLICT (tenant_id, calculation_date, period_days) 
            DO UPDATE SET
                tenant_revenue_value = EXCLUDED.tenant_revenue_value,
                tenant_revenue_participation_pct = EXCLUDED.tenant_revenue_participation_pct,
                tenant_appointments_count = EXCLUDED.tenant_appointments_count,
                tenant_appointments_participation_pct = EXCLUDED.tenant_appointments_participation_pct,
                tenant_customers_count = EXCLUDED.tenant_customers_count,
                tenant_customers_participation_pct = EXCLUDED.tenant_customers_participation_pct,
                tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
                tenant_ai_participation_pct = EXCLUDED.tenant_ai_participation_pct,
                platform_total_revenue = EXCLUDED.platform_total_revenue,
                platform_total_appointments = EXCLUDED.platform_total_appointments,
                platform_total_customers = EXCLUDED.platform_total_customers,
                platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
                platform_mrr = EXCLUDED.platform_mrr,
                tenant_health_score = EXCLUDED.tenant_health_score,
                tenant_risk_level = EXCLUDED.tenant_risk_level,
                data_source = EXCLUDED.data_source,
                notes = EXCLUDED.notes,
                updated_at = NOW();
            
            v_processed_count := v_processed_count + 1;
            
            RAISE NOTICE 'Processed tenant %: % (Revenue: %, Appointments: %)', 
                v_tenant_record.business_name, 
                v_tenant_record.id,
                v_tenant_revenue,
                v_tenant_appointments;
        END;
    END LOOP;
    
    -- 3. RETURN RESULT
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'calculation_date', p_calculation_date,
        'period_days', p_period_days,
        'platform_totals', json_build_object(
            'total_revenue', v_platform_revenue,
            'total_appointments', v_platform_appointments,
            'total_customers', v_platform_customers,
            'total_ai_interactions', v_platform_ai_interactions,
            'platform_mrr', v_platform_mrr
        ),
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'Calculation completed: % tenants processed in %ms', 
        v_processed_count, 
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR in metrics calculation: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$;

-- Test the function after creation
SELECT calculate_ubs_metrics_system(CURRENT_DATE, 30, NULL);