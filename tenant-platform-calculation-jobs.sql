-- =====================================================
-- TENANT/PLATFORM METRICS CALCULATION FUNCTIONS
-- Daily automated jobs to calculate tenant participation in platform
-- NO MOCK DATA - Only real database queries
-- =====================================================

-- =====================================================
-- 1. MAIN CALCULATION FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_tenant_platform_metrics(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30
) RETURNS TABLE (
    processed_tenants INTEGER,
    total_revenue DECIMAL(12,2),
    total_appointments INTEGER,
    execution_time_ms INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    period_start_date DATE;
    log_id UUID;
    tenant_record RECORD;
    platform_totals RECORD;
    processed_count INTEGER := 0;
BEGIN
    start_time := clock_timestamp();
    period_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    -- Log calculation start
    INSERT INTO metric_calculation_log (
        calculation_type, started_at, status
    ) VALUES (
        'tenant_platform_metrics', start_time, 'running'
    ) RETURNING id INTO log_id;
    
    -- Step 1: Calculate platform totals for the period
    SELECT 
        COALESCE(SUM(sp.amount), 0) as total_revenue,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT a.user_id) as total_customers,
        COUNT(DISTINCT ch.id) as total_ai_interactions,
        COUNT(DISTINCT t.id) as total_active_tenants
    INTO platform_totals
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date 
        AND a.created_at <= p_calculation_date + INTERVAL '1 day'
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date 
        AND ch.created_at <= p_calculation_date + INTERVAL '1 day'
    WHERE t.status = 'active';
    
    -- Step 2: Insert/Update platform daily aggregates
    INSERT INTO platform_daily_aggregates (
        aggregate_date,
        total_revenue,
        total_appointments,
        total_customers,
        total_ai_interactions,
        total_active_tenants,
        avg_appointments_per_tenant,
        avg_revenue_per_tenant,
        avg_customers_per_tenant,
        calculation_period_days
    ) VALUES (
        p_calculation_date,
        platform_totals.total_revenue,
        platform_totals.total_appointments,
        platform_totals.total_customers,
        platform_totals.total_ai_interactions,
        platform_totals.total_active_tenants,
        CASE 
            WHEN platform_totals.total_active_tenants > 0 
            THEN platform_totals.total_appointments::DECIMAL / platform_totals.total_active_tenants 
            ELSE 0 
        END,
        CASE 
            WHEN platform_totals.total_active_tenants > 0 
            THEN platform_totals.total_revenue / platform_totals.total_active_tenants 
            ELSE 0 
        END,
        CASE 
            WHEN platform_totals.total_active_tenants > 0 
            THEN platform_totals.total_customers::DECIMAL / platform_totals.total_active_tenants 
            ELSE 0 
        END,
        p_period_days
    ) ON CONFLICT (aggregate_date) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_appointments = EXCLUDED.total_appointments,
        total_customers = EXCLUDED.total_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        total_active_tenants = EXCLUDED.total_active_tenants,
        avg_appointments_per_tenant = EXCLUDED.avg_appointments_per_tenant,
        avg_revenue_per_tenant = EXCLUDED.avg_revenue_per_tenant,
        avg_customers_per_tenant = EXCLUDED.avg_customers_per_tenant,
        calculated_at = NOW();
    
    -- Step 3: Calculate metrics for each active tenant
    FOR tenant_record IN 
        SELECT id, business_name FROM tenants WHERE status = 'active'
    LOOP
        PERFORM calculate_single_tenant_metrics(
            tenant_record.id, 
            p_calculation_date, 
            p_period_days,
            platform_totals
        );
        processed_count := processed_count + 1;
    END LOOP;
    
    -- Step 4: Calculate rankings based on revenue participation
    PERFORM update_tenant_rankings(p_calculation_date);
    
    -- Log completion
    end_time := clock_timestamp();
    UPDATE metric_calculation_log 
    SET 
        completed_at = end_time,
        status = 'completed',
        records_processed = processed_count,
        execution_time_ms = EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER
    WHERE id = log_id;
    
    RETURN QUERY SELECT 
        processed_count,
        platform_totals.total_revenue,
        platform_totals.total_appointments,
        EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
        
EXCEPTION
    WHEN OTHERS THEN
        -- Log error
        UPDATE metric_calculation_log 
        SET 
            completed_at = clock_timestamp(),
            status = 'failed',
            error_message = SQLERRM,
            records_processed = processed_count
        WHERE id = log_id;
        
        RAISE;
END;
$$;

-- =====================================================
-- 2. SINGLE TENANT CALCULATION FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_single_tenant_metrics(
    p_tenant_id UUID,
    p_calculation_date DATE,
    p_period_days INTEGER,
    p_platform_totals RECORD
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    tenant_metrics RECORD;
    period_start_date DATE;
BEGIN
    period_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    -- Calculate tenant-specific metrics for the period
    SELECT 
        -- Revenue metrics
        COALESCE(SUM(sp.amount), 0) as tenant_revenue,
        
        -- Appointment metrics
        COUNT(DISTINCT a.id) as tenant_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END) as cancelled_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END) as rescheduled_appointments,
        
        -- Customer metrics
        COUNT(DISTINCT a.user_id) as tenant_customers,
        
        -- AI metrics
        COUNT(DISTINCT ch.id) as tenant_ai_interactions,
        AVG(EXTRACT(EPOCH FROM (ch.ended_at - ch.created_at))/60) as avg_chat_minutes,
        
        -- Phone quality (users with valid phone numbers)
        COUNT(DISTINCT CASE 
            WHEN u.phone IS NOT NULL 
            AND LENGTH(REGEXP_REPLACE(u.phone, '[^0-9]', '', 'g')) >= 10 
            THEN u.id 
        END) as valid_phone_users,
        COUNT(DISTINCT u.id) as total_users_with_phone
        
    INTO tenant_metrics
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date 
        AND a.created_at <= p_calculation_date + INTERVAL '1 day'
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date 
        AND ch.created_at <= p_calculation_date + INTERVAL '1 day'
        AND ch.ended_at IS NOT NULL
    LEFT JOIN users u ON a.user_id = u.id
    WHERE t.id = p_tenant_id;
    
    -- Insert/Update tenant platform metrics
    INSERT INTO tenant_platform_metrics (
        tenant_id,
        metric_date,
        revenue_participation_pct,
        revenue_participation_value,
        platform_total_revenue,
        appointments_participation_pct,
        tenant_appointments_count,
        platform_total_appointments,
        customers_participation_pct,
        tenant_customers_count,
        platform_total_customers,
        ai_participation_pct,
        tenant_ai_interactions,
        platform_total_ai_interactions,
        cancellation_rate_pct,
        cancelled_appointments_count,
        rescheduling_rate_pct,
        rescheduled_appointments_count,
        efficiency_score,
        avg_chat_time_minutes,
        phone_quality_score,
        conversion_rate_pct,
        risk_score,
        risk_status,
        calculation_period_days
    ) VALUES (
        p_tenant_id,
        p_calculation_date,
        
        -- Revenue participation percentage
        CASE 
            WHEN p_platform_totals.total_revenue > 0 
            THEN (tenant_metrics.tenant_revenue / p_platform_totals.total_revenue * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.tenant_revenue,
        p_platform_totals.total_revenue,
        
        -- Appointments participation percentage
        CASE 
            WHEN p_platform_totals.total_appointments > 0 
            THEN (tenant_metrics.tenant_appointments::DECIMAL / p_platform_totals.total_appointments * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.tenant_appointments,
        p_platform_totals.total_appointments,
        
        -- Customers participation percentage
        CASE 
            WHEN p_platform_totals.total_customers > 0 
            THEN (tenant_metrics.tenant_customers::DECIMAL / p_platform_totals.total_customers * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.tenant_customers,
        p_platform_totals.total_customers,
        
        -- AI participation percentage
        CASE 
            WHEN p_platform_totals.total_ai_interactions > 0 
            THEN (tenant_metrics.tenant_ai_interactions::DECIMAL / p_platform_totals.total_ai_interactions * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.tenant_ai_interactions,
        p_platform_totals.total_ai_interactions,
        
        -- Cancellation rate
        CASE 
            WHEN tenant_metrics.tenant_appointments > 0 
            THEN (tenant_metrics.cancelled_appointments::DECIMAL / tenant_metrics.tenant_appointments * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.cancelled_appointments,
        
        -- Rescheduling rate
        CASE 
            WHEN tenant_metrics.tenant_appointments > 0 
            THEN (tenant_metrics.rescheduled_appointments::DECIMAL / tenant_metrics.tenant_appointments * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        tenant_metrics.rescheduled_appointments,
        
        -- Efficiency score (payment % / usage %)
        CASE 
            WHEN p_platform_totals.total_revenue > 0 AND p_platform_totals.total_customers > 0
            THEN 
                CASE 
                    WHEN tenant_metrics.tenant_customers > 0 
                    THEN ((tenant_metrics.tenant_revenue / p_platform_totals.total_revenue * 100) / 
                          (tenant_metrics.tenant_customers::DECIMAL / p_platform_totals.total_customers * 100) * 100)::DECIMAL(8,2)
                    ELSE 0 
                END
            ELSE 0 
        END,
        
        -- Average chat time
        COALESCE(tenant_metrics.avg_chat_minutes, 0)::DECIMAL(6,2),
        
        -- Phone quality score
        CASE 
            WHEN tenant_metrics.total_users_with_phone > 0 
            THEN (tenant_metrics.valid_phone_users::DECIMAL / tenant_metrics.total_users_with_phone * 100)::DECIMAL(5,2)
            ELSE 0 
        END,
        
        -- Conversion rate (special handling for cases where appointments = 0)
        CASE 
            WHEN tenant_metrics.tenant_ai_interactions > 0 AND tenant_metrics.tenant_appointments > 0
            THEN (tenant_metrics.tenant_appointments::DECIMAL / tenant_metrics.tenant_ai_interactions * 100)::DECIMAL(8,2)
            WHEN tenant_metrics.tenant_ai_interactions > 0 AND tenant_metrics.tenant_appointments = 0
            THEN 0 -- No conversion when no appointments
            ELSE 0 
        END,
        
        -- Risk score (simplified calculation)
        CASE 
            WHEN tenant_metrics.tenant_appointments = 0 AND tenant_metrics.tenant_revenue > 0 THEN 25 -- Low risk: paying but no activity
            WHEN tenant_metrics.tenant_appointments = 0 AND tenant_metrics.tenant_revenue = 0 THEN 85 -- High risk: no activity, no payment
            WHEN tenant_metrics.cancelled_appointments::DECIMAL / GREATEST(tenant_metrics.tenant_appointments, 1) > 0.3 THEN 70 -- High cancellation rate
            ELSE 15 -- Low risk: normal activity
        END,
        
        -- Risk status
        CASE 
            WHEN tenant_metrics.tenant_appointments = 0 AND tenant_metrics.tenant_revenue > 0 THEN 'Low Risk'
            WHEN tenant_metrics.tenant_appointments = 0 AND tenant_metrics.tenant_revenue = 0 THEN 'High Risk'
            WHEN tenant_metrics.cancelled_appointments::DECIMAL / GREATEST(tenant_metrics.tenant_appointments, 1) > 0.3 THEN 'Medium Risk'
            ELSE 'Low Risk'
        END,
        
        p_period_days
    ) ON CONFLICT (tenant_id, metric_date) DO UPDATE SET
        revenue_participation_pct = EXCLUDED.revenue_participation_pct,
        revenue_participation_value = EXCLUDED.revenue_participation_value,
        platform_total_revenue = EXCLUDED.platform_total_revenue,
        appointments_participation_pct = EXCLUDED.appointments_participation_pct,
        tenant_appointments_count = EXCLUDED.tenant_appointments_count,
        platform_total_appointments = EXCLUDED.platform_total_appointments,
        customers_participation_pct = EXCLUDED.customers_participation_pct,
        tenant_customers_count = EXCLUDED.tenant_customers_count,
        platform_total_customers = EXCLUDED.platform_total_customers,
        ai_participation_pct = EXCLUDED.ai_participation_pct,
        tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
        platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
        cancellation_rate_pct = EXCLUDED.cancellation_rate_pct,
        cancelled_appointments_count = EXCLUDED.cancelled_appointments_count,
        rescheduling_rate_pct = EXCLUDED.rescheduling_rate_pct,
        rescheduled_appointments_count = EXCLUDED.rescheduled_appointments_count,
        efficiency_score = EXCLUDED.efficiency_score,
        avg_chat_time_minutes = EXCLUDED.avg_chat_time_minutes,
        phone_quality_score = EXCLUDED.phone_quality_score,
        conversion_rate_pct = EXCLUDED.conversion_rate_pct,
        risk_score = EXCLUDED.risk_score,
        risk_status = EXCLUDED.risk_status,
        calculated_at = NOW(),
        updated_at = NOW();
END;
$$;

-- =====================================================
-- 3. RANKING CALCULATION FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_tenant_rankings(
    p_calculation_date DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update ranking positions based on revenue participation
    WITH ranked_tenants AS (
        SELECT 
            tenant_id,
            ROW_NUMBER() OVER (ORDER BY revenue_participation_value DESC, tenant_id) as new_position,
            COUNT(*) OVER () as total_tenants
        FROM tenant_platform_metrics 
        WHERE metric_date = p_calculation_date
    )
    UPDATE tenant_platform_metrics 
    SET 
        ranking_position = rt.new_position,
        total_tenants_in_ranking = rt.total_tenants,
        ranking_percentile = ((rt.total_tenants - rt.new_position)::DECIMAL / rt.total_tenants * 100)::DECIMAL(5,2),
        ranking_category = CASE 
            WHEN ((rt.total_tenants - rt.new_position)::DECIMAL / rt.total_tenants * 100) >= 90 THEN 'Top 10%'
            WHEN ((rt.total_tenants - rt.new_position)::DECIMAL / rt.total_tenants * 100) >= 75 THEN 'Top 25%'
            WHEN ((rt.total_tenants - rt.new_position)::DECIMAL / rt.total_tenants * 100) >= 50 THEN 'Top 50%'
            ELSE 'Other'
        END,
        updated_at = NOW()
    FROM ranked_tenants rt
    WHERE tenant_platform_metrics.tenant_id = rt.tenant_id 
    AND tenant_platform_metrics.metric_date = p_calculation_date;
END;
$$;

-- =====================================================
-- 4. TIME SERIES CALCULATION FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_tenant_time_series(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    current_date DATE;
    daily_revenue DECIMAL(12,2);
    daily_appointments INTEGER;
    daily_customers INTEGER;
    cumulative_revenue DECIMAL(12,2) := 0;
    cumulative_appointments INTEGER := 0;
    cumulative_customers INTEGER := 0;
BEGIN
    -- Delete existing time series data for the period
    DELETE FROM tenant_time_series 
    WHERE tenant_id = p_tenant_id 
    AND series_date BETWEEN p_start_date AND p_end_date;
    
    -- Calculate daily metrics for each date in the range
    current_date := p_start_date;
    WHILE current_date <= p_end_date LOOP
        -- Get daily values
        SELECT 
            COALESCE(SUM(sp.amount), 0),
            COUNT(DISTINCT a.id),
            COUNT(DISTINCT a.user_id)
        INTO daily_revenue, daily_appointments, daily_customers
        FROM tenants t
        LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
            AND sp.payment_date = current_date
            AND sp.status = 'completed'
        LEFT JOIN appointments a ON t.id = a.tenant_id 
            AND DATE(a.created_at) = current_date
        WHERE t.id = p_tenant_id;
        
        -- Update cumulative values
        cumulative_revenue := cumulative_revenue + daily_revenue;
        cumulative_appointments := cumulative_appointments + daily_appointments;
        cumulative_customers := GREATEST(cumulative_customers, daily_customers);
        
        -- Insert time series records
        INSERT INTO tenant_time_series (tenant_id, series_date, metric_type, daily_value, cumulative_value) VALUES
        (p_tenant_id, current_date, 'revenue', daily_revenue, cumulative_revenue),
        (p_tenant_id, current_date, 'appointments', daily_appointments, cumulative_appointments),
        (p_tenant_id, current_date, 'customers', daily_customers, cumulative_customers);
        
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
END;
$$;

-- =====================================================
-- 5. SCHEDULED JOB EXECUTION EXAMPLE
-- =====================================================

-- Manual execution for testing
-- SELECT * FROM calculate_tenant_platform_metrics();

-- Cron job schedule (runs daily at 3:00 AM UTC)
-- This would be configured in your cron system (n8n, system cron, or Supabase Edge Functions)
/*
# Cron job entry (for system cron):
0 3 * * * psql -d your_database -c "SELECT calculate_tenant_platform_metrics();"

# Or for n8n workflow:
{
  "nodes": [
    {
      "name": "Schedule",
      "type": "n8n-nodes-base.cron",
      "parameters": {
        "rule": {
          "interval": "0 3 * * *"
        }
      }
    },
    {
      "name": "Calculate Metrics",
      "type": "n8n-nodes-base.postgres", 
      "parameters": {
        "query": "SELECT * FROM calculate_tenant_platform_metrics();"
      }
    }
  ]
}
*/

-- =====================================================
-- 6. VALIDATION AND TESTING QUERIES
-- =====================================================

-- Test the main calculation function
SELECT * FROM calculate_tenant_platform_metrics(CURRENT_DATE, 30);

-- Verify results for specific tenant
SELECT 
    tenant_id,
    metric_date,
    revenue_participation_pct,
    revenue_participation_value,
    appointments_participation_pct,
    customers_participation_pct,
    ranking_position,
    ranking_percentile,
    efficiency_score,
    risk_score,
    risk_status
FROM tenant_platform_metrics 
WHERE tenant_id = '9c4d4d05-b99e-4fb9-9c4f-c8c56a7e7e7e'::UUID
ORDER BY metric_date DESC;

-- Check calculation logs
SELECT 
    calculation_type,
    status,
    records_processed,
    execution_time_ms,
    started_at,
    completed_at,
    error_message
FROM metric_calculation_log 
ORDER BY created_at DESC 
LIMIT 10;