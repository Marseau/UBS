-- ==========================================
-- CORRECTED FUNCTION - EXECUTE IN SUPABASE SQL EDITOR
-- ==========================================
-- This fixes the column name issues in calculate_ubs_metrics_system
-- ==========================================

-- DROP AND RECREATE FUNCTION WITH CORRECT COLUMN NAMES
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
    v_platform_totals RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result JSON;
BEGIN
    -- Calculate period dates
    v_end_date := p_calculation_date;
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    RAISE NOTICE 'Calculating UBS metrics for period % to % (% days)', v_start_date, v_end_date, p_period_days;
    
    -- 1. CALCULATE PLATFORM TOTALS FIRST
    SELECT 
        COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0) as total_revenue,
        COUNT(*) as total_appointments,
        COUNT(DISTINCT user_id) as total_customers
    INTO v_platform_totals
    FROM appointments 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Calculate AI interactions
    SELECT COUNT(*) INTO v_platform_totals.total_ai_interactions
    FROM conversation_history 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date
      AND is_from_user = false
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Calculate platform MRR
    SELECT (COUNT(DISTINCT tenant_id) * 79.90) INTO v_platform_totals.platform_mrr
    FROM appointments 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date;
    
    RAISE NOTICE 'Platform totals: Revenue=%, Appointments=%, Customers=%, AI=%, MRR=%', 
        v_platform_totals.total_revenue, 
        v_platform_totals.total_appointments,
        v_platform_totals.total_customers,
        v_platform_totals.total_ai_interactions,
        v_platform_totals.platform_mrr;
    
    -- 2. PROCESS EACH TENANT
    FOR v_tenant_record IN 
        SELECT t.id, t.business_name 
        FROM tenants t
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        ORDER BY t.business_name
    LOOP
        DECLARE
            v_tenant_metrics RECORD;
            v_ai_interactions INTEGER := 0;
        BEGIN
            -- Calculate tenant metrics
            SELECT 
                COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0) as revenue,
                COUNT(*) as appointments,
                COUNT(DISTINCT user_id) as customers,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_appointments,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
                COUNT(CASE WHEN status = 'rescheduled' THEN 1 END) as rescheduled_appointments
            INTO v_tenant_metrics
            FROM appointments 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date;
            
            -- Calculate AI interactions for tenant
            SELECT COUNT(*) INTO v_ai_interactions
            FROM conversation_history 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date
              AND is_from_user = false;
            
            -- Calculate participation percentages
            v_tenant_metrics.revenue_participation := 
                CASE WHEN v_platform_totals.total_revenue > 0 
                     THEN (v_tenant_metrics.revenue / v_platform_totals.total_revenue) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.appointments_participation := 
                CASE WHEN v_platform_totals.total_appointments > 0 
                     THEN (v_tenant_metrics.appointments::DECIMAL / v_platform_totals.total_appointments) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.customers_participation := 
                CASE WHEN v_platform_totals.total_customers > 0 
                     THEN (v_tenant_metrics.customers::DECIMAL / v_platform_totals.total_customers) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.ai_participation := 
                CASE WHEN v_platform_totals.total_ai_interactions > 0 
                     THEN (v_ai_interactions::DECIMAL / v_platform_totals.total_ai_interactions) * 100 
                     ELSE 0 END;
            
            -- Calculate health score
            v_tenant_metrics.health_score := ROUND(
                (v_tenant_metrics.revenue_participation * 0.4) + 
                (v_tenant_metrics.appointments_participation * 0.3) + 
                (v_tenant_metrics.customers_participation * 0.2) + 
                (v_tenant_metrics.ai_participation * 0.1)
            );
            
            -- Determine risk level
            v_tenant_metrics.risk_level := 
                CASE WHEN v_tenant_metrics.health_score >= 70 THEN 'Low'
                     WHEN v_tenant_metrics.health_score >= 40 THEN 'Medium'
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
                
                -- AI metrics (using correct column names)
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
                v_tenant_metrics.revenue,
                v_tenant_metrics.revenue_participation,
                CASE WHEN v_tenant_metrics.revenue_participation > 5 THEN 'growing'
                     WHEN v_tenant_metrics.revenue_participation < 2 THEN 'declining'
                     ELSE 'stable' END,
                v_platform_totals.total_revenue,
                
                -- Appointments
                v_tenant_metrics.appointments,
                v_tenant_metrics.appointments_participation,
                v_tenant_metrics.confirmed_appointments,
                v_tenant_metrics.cancelled_appointments,
                v_tenant_metrics.completed_appointments,
                v_tenant_metrics.rescheduled_appointments,
                v_platform_totals.total_appointments,
                
                -- Customers
                v_tenant_metrics.customers,
                v_tenant_metrics.customers_participation,
                v_platform_totals.total_customers,
                
                -- AI (using correct column names)
                v_ai_interactions,
                v_tenant_metrics.ai_participation,
                v_platform_totals.total_ai_interactions,
                
                -- Platform
                v_platform_totals.platform_mrr,
                (SELECT COUNT(DISTINCT tenant_id) FROM appointments 
                 WHERE created_at >= v_start_date AND created_at <= v_end_date),
                
                -- Business Intelligence
                v_tenant_metrics.health_score,
                v_tenant_metrics.risk_level,
                
                -- Metadata
                'fixed_function_v2',
                format('Fixed function executed on %s for %s days period', 
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
                v_tenant_metrics.revenue,
                v_tenant_metrics.appointments;
        END;
    END LOOP;
    
    -- 3. RETURN RESULT
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'calculation_date', p_calculation_date,
        'period_days', p_period_days,
        'platform_totals', json_build_object(
            'total_revenue', v_platform_totals.total_revenue,
            'total_appointments', v_platform_totals.total_appointments,
            'total_customers', v_platform_totals.total_customers,
            'total_ai_interactions', v_platform_totals.total_ai_interactions,
            'platform_mrr', v_platform_totals.platform_mrr
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