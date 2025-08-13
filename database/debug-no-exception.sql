-- =====================================================
-- NO EXCEPTION DEBUG - See raw PostgreSQL errors
-- =====================================================

DROP FUNCTION IF EXISTS calculate_tenant_metrics_no_exception_debug(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_no_exception_debug(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_period_days INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_revenue DECIMAL(15,2) := 0;
    v_tenant_appointments INTEGER := 0;
    v_tenant_customers INTEGER := 0;
    v_comprehensive_metrics JSONB;
    
BEGIN
    RAISE NOTICE '🔍 NO EXCEPTION DEBUG: Starting for tenant %', p_tenant_id;
    
    SELECT id, business_name INTO v_tenant_record
    FROM tenants 
    WHERE id = p_tenant_id AND status = 'active';
    
    -- Test just ONE period (30d) to isolate the issue
    v_period_days := 30;
    v_start_date := p_calculation_date - (v_period_days - 1);
    v_end_date := p_calculation_date;
    
    RAISE NOTICE '📅 Processing period %d: % to %', v_period_days, v_start_date, v_end_date;
    
    -- Get basic data 
    SELECT 
        COALESCE(SUM(COALESCE(quoted_price, final_price, 0)), 0),
        COUNT(*),
        COUNT(DISTINCT customer_id)
    INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers
    FROM appointments 
    WHERE tenant_id = v_tenant_record.id
      AND start_time >= v_start_date::timestamptz
      AND start_time < (v_end_date + 1)::timestamptz;
    
    RAISE NOTICE '💰 Basic data: Revenue=%, Appointments=%, Customers=%', 
        v_tenant_revenue, v_tenant_appointments, v_tenant_customers;
    
    -- Build simple metrics (not all 73)
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
        'metadata', jsonb_build_object(
            'calculation_date', p_calculation_date,
            'period_days', v_period_days,
            'version', 'NO_EXCEPTION_DEBUG'
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
    
    RETURN json_build_object(
        'success', true,
        'message', 'NO_EXCEPTION_DEBUG completed',
        'tenant_id', v_tenant_record.id,
        'metrics_attempted', 1
    );
    
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_no_exception_debug(date, uuid) TO authenticated;