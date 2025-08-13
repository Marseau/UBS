-- =====================================================
-- WhatsApp Salon - 4 Basic Metrics PostgreSQL Functions (CORRECTED)
-- =====================================================
-- CORRECTED based on validated JavaScript implementations:
-- 1. Uses created_at for date filtering (not start_time) - matches JS scripts
-- 2. "Confirmed appointments" = completed + confirmed statuses - matches test-success-rate-transparent.js  
-- 3. Exact logic from test-metric-*.js files
--
-- Critical fixes:
-- - Date filtering: created_at field (lines 71, 79, 84 in JS scripts)
-- - Success logic: confirmed + completed (line 109 in test-success-rate-transparent.js)
-- =====================================================

-- =====================================================
-- METRIC 1: MONTHLY REVENUE FUNCTION (CORRECTED)
-- =====================================================
-- Based on: test-metric-1-monthly-revenue.js
-- Formula: SUM(final_price || quoted_price) WHERE status = 'completed'
-- Uses created_at for date filtering (lines 71, 79, 84 in JS)

CREATE OR REPLACE FUNCTION calculate_monthly_revenue(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    current_revenue DECIMAL(10,2),
    previous_revenue DECIMAL(10,2),
    change_percentage DECIMAL(5,2),
    total_appointments_current INTEGER,
    total_appointments_previous INTEGER,
    completed_appointments_current INTEGER,
    completed_appointments_previous INTEGER,
    period_days INTEGER,
    calculated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_period_days INTEGER;
    v_previous_start_date DATE;
    v_previous_end_date DATE;
    v_current_revenue DECIMAL(10,2) := 0;
    v_previous_revenue DECIMAL(10,2) := 0;
    v_change_percent DECIMAL(5,2) := 0;
    v_total_current INTEGER := 0;
    v_total_previous INTEGER := 0;
    v_completed_current INTEGER := 0;
    v_completed_previous INTEGER := 0;
BEGIN
    -- Validate inputs
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'start_date must be before or equal to end_date';
    END IF;
    
    -- Verify tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        RAISE EXCEPTION 'Tenant does not exist or is not active: %', p_tenant_id;
    END IF;
    
    -- Calculate period duration
    v_period_days := p_end_date - p_start_date + 1;
    
    -- Calculate previous period dates
    v_previous_start_date := p_start_date - v_period_days;
    v_previous_end_date := p_start_date - 1;
    
    -- Get current period data (CORRECTED: using created_at)
    SELECT 
        COALESCE(SUM(CASE 
            WHEN status = 'completed' THEN COALESCE(final_price, quoted_price, 0)
            ELSE 0
        END), 0),
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END)
    INTO v_current_revenue, v_total_current, v_completed_current
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= p_start_date
      AND created_at::date <= p_end_date;
    
    -- Get previous period data (CORRECTED: using created_at)
    SELECT 
        COALESCE(SUM(CASE 
            WHEN status = 'completed' THEN COALESCE(final_price, quoted_price, 0)
            ELSE 0
        END), 0),
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END)
    INTO v_previous_revenue, v_total_previous, v_completed_previous
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= v_previous_start_date
      AND created_at::date <= v_previous_end_date;
    
    -- Calculate percentage change
    v_change_percent := CASE 
        WHEN v_previous_revenue > 0 THEN 
            ROUND(((v_current_revenue - v_previous_revenue) / v_previous_revenue) * 100, 2)
        WHEN v_current_revenue > 0 THEN 100
        ELSE 0
    END;
    
    -- Return results
    RETURN QUERY
    SELECT 
        v_current_revenue,
        v_previous_revenue,
        v_change_percent,
        v_total_current,
        v_total_previous,
        v_completed_current,
        v_completed_previous,
        v_period_days,
        NOW();

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating monthly revenue for tenant %: %', p_tenant_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- METRIC 2: NEW CUSTOMERS FUNCTION (CORRECTED)
-- =====================================================
-- Based on: test-metric-2-new-customers.js  
-- Formula: COUNT(DISTINCT user_id) WHERE user_id not in historical periods
-- Uses created_at for date filtering (lines 79, 92, 104 in JS)

CREATE OR REPLACE FUNCTION calculate_new_customers(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    new_customers_current INTEGER,
    new_customers_previous INTEGER,
    change_percentage DECIMAL(5,2),
    total_customers_current INTEGER,
    total_customers_previous INTEGER,
    service_breakdown JSONB,
    professional_breakdown JSONB,
    period_days INTEGER,
    calculated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_period_days INTEGER;
    v_previous_start_date DATE;
    v_previous_end_date DATE;
    v_new_current INTEGER := 0;
    v_new_previous INTEGER := 0;
    v_total_current INTEGER := 0;
    v_total_previous INTEGER := 0;
    v_change_percent DECIMAL(5,2) := 0;
    v_service_breakdown JSONB;
    v_professional_breakdown JSONB;
BEGIN
    -- Validate inputs
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'start_date must be before or equal to end_date';
    END IF;
    
    -- Verify tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        RAISE EXCEPTION 'Tenant does not exist or is not active: %', p_tenant_id;
    END IF;
    
    -- Calculate period duration
    v_period_days := p_end_date - p_start_date + 1;
    
    -- Calculate previous period dates
    v_previous_start_date := p_start_date - v_period_days;
    v_previous_end_date := p_start_date - 1;
    
    -- Get unique customers in current period (CORRECTED: using created_at)
    SELECT COUNT(DISTINCT user_id) 
    INTO v_total_current
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= p_start_date
      AND created_at::date <= p_end_date;
    
    -- Get unique customers in previous period (CORRECTED: using created_at)
    SELECT COUNT(DISTINCT user_id) 
    INTO v_total_previous
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= v_previous_start_date
      AND created_at::date <= v_previous_end_date;
    
    -- Calculate NEW customers (never appeared before current period) (CORRECTED: using created_at)
    SELECT COUNT(DISTINCT a_current.user_id)
    INTO v_new_current
    FROM appointments a_current
    WHERE a_current.tenant_id = p_tenant_id
      AND a_current.created_at::date >= p_start_date
      AND a_current.created_at::date <= p_end_date
      AND NOT EXISTS (
          SELECT 1 FROM appointments a_historical
          WHERE a_historical.tenant_id = p_tenant_id
            AND a_historical.user_id = a_current.user_id
            AND a_historical.created_at::date < p_start_date
      );
    
    -- Calculate NEW customers for previous period (CORRECTED: using created_at)
    SELECT COUNT(DISTINCT a_previous.user_id)
    INTO v_new_previous
    FROM appointments a_previous
    WHERE a_previous.tenant_id = p_tenant_id
      AND a_previous.created_at::date >= v_previous_start_date
      AND a_previous.created_at::date <= v_previous_end_date
      AND NOT EXISTS (
          SELECT 1 FROM appointments a_historical
          WHERE a_historical.tenant_id = p_tenant_id
            AND a_historical.user_id = a_previous.user_id
            AND a_historical.created_at::date < v_previous_start_date
      );
    
    -- Calculate percentage change
    v_change_percent := CASE 
        WHEN v_new_previous > 0 THEN 
            ROUND(((v_new_current - v_new_previous)::DECIMAL / v_new_previous) * 100, 2)
        WHEN v_new_current > 0 THEN 100
        ELSE 0
    END;
    
    -- Get service breakdown for NEW customers (CORRECTED: using created_at)
    SELECT COALESCE(jsonb_object_agg(service_name, customer_count), '{}')
    INTO v_service_breakdown
    FROM (
        SELECT 
            COALESCE(s.name, 'No Service') as service_name,
            COUNT(DISTINCT a_new.user_id) as customer_count
        FROM appointments a_new
        LEFT JOIN services s ON a_new.service_id = s.id
        WHERE a_new.tenant_id = p_tenant_id
          AND a_new.created_at::date >= p_start_date
          AND a_new.created_at::date <= p_end_date
          AND NOT EXISTS (
              SELECT 1 FROM appointments a_historical
              WHERE a_historical.tenant_id = p_tenant_id
                AND a_historical.user_id = a_new.user_id
                AND a_historical.created_at::date < p_start_date
          )
        GROUP BY s.name
        ORDER BY customer_count DESC
    ) service_stats;
    
    -- Get professional breakdown for NEW customers (CORRECTED: using created_at)
    SELECT COALESCE(jsonb_object_agg(professional_name, customer_count), '{}')
    INTO v_professional_breakdown
    FROM (
        SELECT 
            COALESCE(p.name, 'No Professional') as professional_name,
            COUNT(DISTINCT a_new.user_id) as customer_count
        FROM appointments a_new
        LEFT JOIN professionals p ON a_new.professional_id = p.id
        WHERE a_new.tenant_id = p_tenant_id
          AND a_new.created_at::date >= p_start_date
          AND a_new.created_at::date <= p_end_date
          AND NOT EXISTS (
              SELECT 1 FROM appointments a_historical
              WHERE a_historical.tenant_id = p_tenant_id
                AND a_historical.user_id = a_new.user_id
                AND a_historical.created_at::date < p_start_date
          )
        GROUP BY p.name
        ORDER BY customer_count DESC
    ) professional_stats;
    
    -- Return results
    RETURN QUERY
    SELECT 
        v_new_current,
        v_new_previous,
        v_change_percent,
        v_total_current,
        v_total_previous,
        v_service_breakdown,
        v_professional_breakdown,
        v_period_days,
        NOW();

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating new customers for tenant %: %', p_tenant_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- METRIC 3: APPOINTMENT SUCCESS RATE FUNCTION (CORRECTED)
-- =====================================================
-- Based on: test-metric-3-appointment-success-rate.js and test-success-rate-transparent.js
-- CORRECTED: Success = completed + confirmed (line 109 in transparent test)
-- Uses created_at for date filtering (lines 87, etc. in JS)

CREATE OR REPLACE FUNCTION calculate_appointment_success_rate(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    success_rate_current DECIMAL(5,2),
    success_rate_previous DECIMAL(5,2),
    change_percentage DECIMAL(5,2),
    total_appointments_current INTEGER,
    total_appointments_previous INTEGER,
    successful_appointments_current INTEGER,  -- CORRECTED: completed + confirmed
    successful_appointments_previous INTEGER, -- CORRECTED: completed + confirmed
    completed_appointments_current INTEGER,
    completed_appointments_previous INTEGER,
    confirmed_appointments_current INTEGER,
    confirmed_appointments_previous INTEGER,
    status_breakdown JSONB,
    service_breakdown JSONB,
    professional_breakdown JSONB,
    period_days INTEGER,
    calculated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_period_days INTEGER;
    v_previous_start_date DATE;
    v_previous_end_date DATE;
    v_success_current DECIMAL(5,2) := 0;
    v_success_previous DECIMAL(5,2) := 0;
    v_total_current INTEGER := 0;
    v_total_previous INTEGER := 0;
    v_successful_current INTEGER := 0;  -- completed + confirmed
    v_successful_previous INTEGER := 0; -- completed + confirmed
    v_completed_current INTEGER := 0;
    v_completed_previous INTEGER := 0;
    v_confirmed_current INTEGER := 0;
    v_confirmed_previous INTEGER := 0;
    v_change_percent DECIMAL(5,2) := 0;
    v_status_breakdown JSONB;
    v_service_breakdown JSONB;
    v_professional_breakdown JSONB;
BEGIN
    -- Validate inputs
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'start_date must be before or equal to end_date';
    END IF;
    
    -- Verify tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        RAISE EXCEPTION 'Tenant does not exist or is not active: %', p_tenant_id;
    END IF;
    
    -- Calculate period duration
    v_period_days := p_end_date - p_start_date + 1;
    
    -- Calculate previous period dates
    v_previous_start_date := p_start_date - v_period_days;
    v_previous_end_date := p_start_date - 1;
    
    -- Get current period data (CORRECTED: using created_at, success = completed + confirmed)
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END),
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
        COUNT(CASE WHEN status IN ('completed', 'confirmed') THEN 1 END)
    INTO v_total_current, v_completed_current, v_confirmed_current, v_successful_current
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= p_start_date
      AND created_at::date <= p_end_date;
    
    -- Get previous period data (CORRECTED: using created_at, success = completed + confirmed)
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END),
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
        COUNT(CASE WHEN status IN ('completed', 'confirmed') THEN 1 END)
    INTO v_total_previous, v_completed_previous, v_confirmed_previous, v_successful_previous
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND created_at::date >= v_previous_start_date
      AND created_at::date <= v_previous_end_date;
    
    -- Calculate success rates (CORRECTED: based on successful = completed + confirmed)
    v_success_current := CASE 
        WHEN v_total_current > 0 THEN 
            ROUND((v_successful_current::DECIMAL / v_total_current) * 100, 2)
        ELSE 0
    END;
    
    v_success_previous := CASE 
        WHEN v_total_previous > 0 THEN 
            ROUND((v_successful_previous::DECIMAL / v_total_previous) * 100, 2)
        ELSE 0
    END;
    
    -- Calculate percentage change
    v_change_percent := CASE 
        WHEN v_success_previous > 0 THEN 
            ROUND(((v_success_current - v_success_previous) / v_success_previous) * 100, 2)
        WHEN v_success_current > 0 THEN 100
        ELSE 0
    END;
    
    -- Get status breakdown (CORRECTED: using created_at)
    SELECT COALESCE(jsonb_object_agg(status, status_count), '{}')
    INTO v_status_breakdown
    FROM (
        SELECT 
            status,
            COUNT(*) as status_count
        FROM appointments
        WHERE tenant_id = p_tenant_id
          AND created_at::date >= p_start_date
          AND created_at::date <= p_end_date
        GROUP BY status
        ORDER BY status_count DESC
    ) status_stats;
    
    -- Get service breakdown (CORRECTED: successful = completed + confirmed, using created_at)
    SELECT COALESCE(jsonb_object_agg(service_name, appointment_count), '{}')
    INTO v_service_breakdown
    FROM (
        SELECT 
            COALESCE(s.name, 'No Service') as service_name,
            COUNT(*) as appointment_count
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.tenant_id = p_tenant_id
          AND a.created_at::date >= p_start_date
          AND a.created_at::date <= p_end_date
          AND a.status IN ('completed', 'confirmed')
        GROUP BY s.name
        ORDER BY appointment_count DESC
    ) service_stats;
    
    -- Get professional breakdown (CORRECTED: successful = completed + confirmed, using created_at)
    SELECT COALESCE(jsonb_object_agg(professional_name, appointment_count), '{}')
    INTO v_professional_breakdown
    FROM (
        SELECT 
            COALESCE(p.name, 'No Professional') as professional_name,
            COUNT(*) as appointment_count
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        WHERE a.tenant_id = p_tenant_id
          AND a.created_at::date >= p_start_date
          AND a.created_at::date <= p_end_date
          AND a.status IN ('completed', 'confirmed')
        GROUP BY p.name
        ORDER BY appointment_count DESC
    ) professional_stats;
    
    -- Return results
    RETURN QUERY
    SELECT 
        v_success_current,
        v_success_previous,
        v_change_percent,
        v_total_current,
        v_total_previous,
        v_successful_current,   -- completed + confirmed
        v_successful_previous,  -- completed + confirmed  
        v_completed_current,
        v_completed_previous,
        v_confirmed_current,
        v_confirmed_previous,
        v_status_breakdown,
        v_service_breakdown,
        v_professional_breakdown,
        v_period_days,
        NOW();

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating appointment success rate for tenant %: %', p_tenant_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- METRIC 4: NO-SHOW IMPACT FUNCTION (CORRECTED) 
-- =====================================================
-- Based on: test-no-show-impact-metric.js
-- CORRECTED: Uses start_time for no-show analysis (line 43 in JS shows start_time for no-shows)
-- Formula: (no_show_count / total_appointments) * 100

CREATE OR REPLACE FUNCTION calculate_no_show_impact(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    impact_percentage DECIMAL(5,2),
    previous_impact_percentage DECIMAL(5,2),
    change_percentage DECIMAL(5,2),
    no_show_count_current INTEGER,
    no_show_count_previous INTEGER,
    total_appointments_current INTEGER,
    total_appointments_previous INTEGER,
    lost_revenue_current DECIMAL(10,2),
    lost_revenue_previous DECIMAL(10,2),
    status_breakdown JSONB,
    period_days INTEGER,
    calculated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_period_days INTEGER;
    v_previous_start_date DATE;
    v_previous_end_date DATE;
    v_impact_current DECIMAL(5,2) := 0;
    v_impact_previous DECIMAL(5,2) := 0;
    v_no_show_current INTEGER := 0;
    v_no_show_previous INTEGER := 0;
    v_total_current INTEGER := 0;
    v_total_previous INTEGER := 0;
    v_lost_revenue_current DECIMAL(10,2) := 0;
    v_lost_revenue_previous DECIMAL(10,2) := 0;
    v_change_percent DECIMAL(5,2) := 0;
    v_status_breakdown JSONB;
BEGIN
    -- Validate inputs
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'start_date must be before or equal to end_date';
    END IF;
    
    -- Verify tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        RAISE EXCEPTION 'Tenant does not exist or is not active: %', p_tenant_id;
    END IF;
    
    -- Calculate period duration
    v_period_days := p_end_date - p_start_date + 1;
    
    -- Calculate previous period dates
    v_previous_start_date := p_start_date - v_period_days;
    v_previous_end_date := p_start_date - 1;
    
    -- Get current period data (CORRECTED: using start_time for no-show analysis per JS line 43)
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'no_show' THEN 1 END),
        COALESCE(SUM(CASE 
            WHEN status = 'no_show' THEN COALESCE(final_price, quoted_price, 0)
            ELSE 0
        END), 0)
    INTO v_total_current, v_no_show_current, v_lost_revenue_current
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND start_time::date >= p_start_date
      AND start_time::date <= p_end_date;
    
    -- Get previous period data (CORRECTED: using start_time for no-show analysis)
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'no_show' THEN 1 END),
        COALESCE(SUM(CASE 
            WHEN status = 'no_show' THEN COALESCE(final_price, quoted_price, 0)
            ELSE 0
        END), 0)
    INTO v_total_previous, v_no_show_previous, v_lost_revenue_previous
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND start_time::date >= v_previous_start_date
      AND start_time::date <= v_previous_end_date;
    
    -- Calculate impact percentages (CORRECTED LOGIC: count-based, not revenue-based)
    v_impact_current := CASE 
        WHEN v_total_current > 0 THEN 
            ROUND((v_no_show_current::DECIMAL / v_total_current) * 100, 2)
        ELSE 0
    END;
    
    v_impact_previous := CASE 
        WHEN v_total_previous > 0 THEN 
            ROUND((v_no_show_previous::DECIMAL / v_total_previous) * 100, 2)
        ELSE 0
    END;
    
    -- Calculate percentage change in impact
    v_change_percent := CASE 
        WHEN v_impact_previous > 0 THEN 
            ROUND(((v_impact_current - v_impact_previous) / v_impact_previous) * 100, 2)
        WHEN v_impact_current > 0 THEN 100
        ELSE 0
    END;
    
    -- Get status breakdown for current period (CORRECTED: using start_time)
    SELECT COALESCE(jsonb_object_agg(status, status_info), '{}')
    INTO v_status_breakdown
    FROM (
        SELECT 
            status,
            jsonb_build_object(
                'count', COUNT(*),
                'percentage', ROUND((COUNT(*)::DECIMAL / v_total_current) * 100, 2),
                'revenue', COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0)
            ) as status_info
        FROM appointments
        WHERE tenant_id = p_tenant_id
          AND start_time::date >= p_start_date
          AND start_time::date <= p_end_date
        GROUP BY status
        ORDER BY COUNT(*) DESC
    ) status_stats;
    
    -- Return results
    RETURN QUERY
    SELECT 
        v_impact_current,
        v_impact_previous,
        v_change_percent,
        v_no_show_current,
        v_no_show_previous,
        v_total_current,
        v_total_previous,
        v_lost_revenue_current,
        v_lost_revenue_previous,
        v_status_breakdown,
        v_period_days,
        NOW();

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating no-show impact for tenant %: %', p_tenant_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Helper function to calculate all 4 basic metrics for a tenant in one call
CREATE OR REPLACE FUNCTION calculate_all_basic_metrics_corrected(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_monthly_revenue RECORD;
    v_new_customers RECORD;
    v_success_rate RECORD;
    v_no_show_impact RECORD;
    v_result JSONB;
BEGIN
    -- Calculate monthly revenue
    SELECT * INTO v_monthly_revenue 
    FROM calculate_monthly_revenue(p_tenant_id, p_start_date, p_end_date) 
    LIMIT 1;
    
    -- Calculate new customers
    SELECT * INTO v_new_customers 
    FROM calculate_new_customers(p_tenant_id, p_start_date, p_end_date) 
    LIMIT 1;
    
    -- Calculate success rate
    SELECT * INTO v_success_rate 
    FROM calculate_appointment_success_rate(p_tenant_id, p_start_date, p_end_date) 
    LIMIT 1;
    
    -- Calculate no-show impact
    SELECT * INTO v_no_show_impact 
    FROM calculate_no_show_impact(p_tenant_id, p_start_date, p_end_date) 
    LIMIT 1;
    
    -- Build result JSON
    v_result := jsonb_build_object(
        'tenant_id', p_tenant_id,
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'days', p_end_date - p_start_date + 1
        ),
        'monthly_revenue', row_to_json(v_monthly_revenue),
        'new_customers', row_to_json(v_new_customers),
        'appointment_success_rate', row_to_json(v_success_rate),
        'no_show_impact', row_to_json(v_no_show_impact),
        'calculated_at', NOW()
    );
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating all basic metrics for tenant %: %', p_tenant_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PERMISSIONS AND SECURITY
-- =====================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION calculate_monthly_revenue(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_new_customers(UUID, DATE, DATE) TO authenticated;  
GRANT EXECUTE ON FUNCTION calculate_appointment_success_rate(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_no_show_impact(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_all_basic_metrics_corrected(UUID, DATE, DATE) TO authenticated;

-- =====================================================
-- FUNCTION DOCUMENTATION (CORRECTED)
-- =====================================================

COMMENT ON FUNCTION calculate_monthly_revenue(UUID, DATE, DATE) IS 
'CORRECTED: Calculates monthly revenue metric using created_at for date filtering.
Formula: SUM(final_price || quoted_price) WHERE status = completed.
Based on test-metric-1-monthly-revenue.js (lines 71, 79, 84 use created_at).';

COMMENT ON FUNCTION calculate_new_customers(UUID, DATE, DATE) IS 
'CORRECTED: Calculates new customers using created_at for date filtering.
Formula: COUNT(DISTINCT user_id) WHERE user_id not in historical periods.
Based on test-metric-2-new-customers.js (lines 79, 92, 104 use created_at).';

COMMENT ON FUNCTION calculate_appointment_success_rate(UUID, DATE, DATE) IS 
'CORRECTED: Success = completed + confirmed statuses, using created_at for filtering.
Formula: (completed + confirmed) / total * 100.
Based on test-success-rate-transparent.js (line 109: success = confirmed + completed).';

COMMENT ON FUNCTION calculate_no_show_impact(UUID, DATE, DATE) IS 
'CORRECTED: Uses start_time for no-show analysis, count-based calculation.
Formula: (no_show_count / total_appointments) * 100.
Based on test-no-show-impact-metric.js (line 43 uses start_time for no-shows).';

COMMENT ON FUNCTION calculate_all_basic_metrics_corrected(UUID, DATE, DATE) IS 
'CORRECTED: Utility function with all corrections applied.
Uses proper date fields and logic as validated in JavaScript implementations.';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'WhatsApp Salon - 4 Basic Metrics Functions (CORRECTED)';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'CORRECTIONS APPLIED:';
    RAISE NOTICE '1. Revenue/New Customers/Success Rate: Use created_at (not start_time)';
    RAISE NOTICE '2. Success Rate: confirmed + completed statuses (not just completed)';  
    RAISE NOTICE '3. No-show Impact: Uses start_time, count-based (not revenue-based)';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '1. calculate_monthly_revenue(tenant_id, start_date, end_date)';
    RAISE NOTICE '2. calculate_new_customers(tenant_id, start_date, end_date)';
    RAISE NOTICE '3. calculate_appointment_success_rate(tenant_id, start_date, end_date)';
    RAISE NOTICE '4. calculate_no_show_impact(tenant_id, start_date, end_date)';
    RAISE NOTICE '5. calculate_all_basic_metrics_corrected(tenant_id, start_date, end_date)';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'All functions now match the exact logic from validated JS scripts.';
    RAISE NOTICE '=====================================================';
END $$;