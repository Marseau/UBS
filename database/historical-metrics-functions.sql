-- Database Functions for Historical Metrics
-- These functions will be called by the cron jobs to calculate and store historical metrics

-- Function to get platform totals for a given period
CREATE OR REPLACE FUNCTION get_platform_totals(start_date DATE, end_date DATE)
RETURNS TABLE (
    total_tenants INTEGER,
    active_tenants INTEGER,
    total_revenue DECIMAL(15,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    total_conversations INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT t.id)::INTEGER as total_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END)::INTEGER as active_tenants,
        COALESCE(SUM(CASE 
            WHEN t.subscription_plan = 'free' THEN 0
            WHEN t.subscription_plan = 'pro' THEN 99
            WHEN t.subscription_plan = 'professional' THEN 199
            WHEN t.subscription_plan = 'enterprise' THEN 299
            ELSE 99
        END), 0)::DECIMAL(15,2) as total_revenue,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM appointments a 
            WHERE a.created_at >= start_date::timestamp 
            AND a.created_at <= end_date::timestamp
        ), 0) as total_appointments,
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.first_interaction >= start_date::timestamp 
            AND ut.first_interaction <= end_date::timestamp
        ), 0) as total_customers,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as total_conversations
    FROM tenants t;
END;
$$ LANGUAGE plpgsql;

-- Function to get domain distribution for a given period
CREATE OR REPLACE FUNCTION get_domain_distribution(start_date DATE, end_date DATE)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    domain_record RECORD;
BEGIN
    FOR domain_record IN 
        SELECT 
            COALESCE(t.business_domain::text, 'other') as domain,
            COUNT(*)::INTEGER as count
        FROM tenants t 
        WHERE t.status = 'active'
        GROUP BY t.business_domain
    LOOP
        result := result || jsonb_build_object(domain_record.domain, domain_record.count);
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate platform health score
CREATE OR REPLACE FUNCTION calculate_platform_health_score(period_type VARCHAR(10))
RETURNS INTEGER AS $$
DECLARE
    health_score INTEGER := 0;
    total_tenants INTEGER := 0;
    active_tenants INTEGER := 0;
    avg_tenant_health DECIMAL := 0;
BEGIN
    -- Get total tenant counts
    SELECT COUNT(*) INTO total_tenants FROM tenants;
    SELECT COUNT(*) INTO active_tenants FROM tenants WHERE status = 'active';
    
    -- Base score from activity rate
    IF total_tenants > 0 THEN
        health_score := (active_tenants::DECIMAL / total_tenants * 50)::INTEGER;
    END IF;
    
    -- Add score from growth
    IF total_tenants > 10 THEN
        health_score := health_score + 25;
    ELSIF total_tenants > 5 THEN
        health_score := health_score + 15;
    ELSE
        health_score := health_score + 5;
    END IF;
    
    -- Add score from revenue diversity
    IF EXISTS (SELECT 1 FROM tenants WHERE subscription_plan IN ('professional', 'enterprise')) THEN
        health_score := health_score + 25;
    ELSIF EXISTS (SELECT 1 FROM tenants WHERE subscription_plan = 'pro') THEN
        health_score := health_score + 15;
    ELSE
        health_score := health_score + 5;
    END IF;
    
    RETURN LEAST(health_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Function to get services count for tenant by period
CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
)
RETURNS INTEGER AS $$
DECLARE
    services_count INTEGER := 0;
    start_date DATE;
    end_date DATE := CURRENT_DATE;
BEGIN
    -- Calculate period dates
    CASE p_period_type
        WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
        WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
        WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
        ELSE start_date := end_date - INTERVAL '30 days';
    END CASE;
    
    -- Count services that were active during the period
    SELECT COUNT(*)::INTEGER INTO services_count
    FROM services s
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    AND (
        s.created_at <= end_date::timestamp 
        AND (s.updated_at IS NULL OR s.updated_at >= start_date::timestamp)
    );
    
    RETURN COALESCE(services_count, 0);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get tenant metrics for a specific period
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    tenant_id UUID, 
    start_date DATE, 
    end_date DATE
)
RETURNS TABLE (
    total_appointments INTEGER,
    confirmed_appointments INTEGER,
    cancelled_appointments INTEGER,
    completed_appointments INTEGER,
    pending_appointments INTEGER,
    total_revenue DECIMAL(15,2),
    average_value DECIMAL(15,2),
    total_customers INTEGER,
    new_customers INTEGER,
    total_services INTEGER,
    services_count INTEGER,
    services TEXT[],
    most_popular_service VARCHAR(255),
    service_utilization_rate DECIMAL(5,2),
    total_conversations INTEGER,
    ai_success_rate DECIMAL(5,2),
    avg_response_time DECIMAL(8,2),
    conversion_rate DECIMAL(5,2),
    booking_conversion_rate DECIMAL(5,2)
) AS $$
DECLARE
    start_ts TIMESTAMP := start_date::timestamp;
    end_ts TIMESTAMP := end_date::timestamp;
BEGIN
    RETURN QUERY
    SELECT 
        -- Appointment metrics
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
        ), 0) as total_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'confirmed'
        ), 0) as confirmed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'cancelled'
        ), 0) as cancelled_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'completed'
        ), 0) as completed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status = 'pending'
        ), 0) as pending_appointments,
        
        -- Revenue metrics
        COALESCE((
            SELECT SUM(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as total_revenue,
        
        COALESCE((
            SELECT AVG(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as average_value,
        
        -- Customer metrics
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
        ), 0) as total_customers,
        
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ut.first_interaction >= start_ts 
            AND ut.first_interaction <= end_ts
        ), 0) as new_customers,
        
        
        -- Service metrics
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM services s 
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as total_services,
        
        -- Services count by period (using new dedicated function)
        get_tenant_services_count_by_period(
            get_tenant_metrics_for_period.tenant_id,
            CASE 
                WHEN end_date - start_date <= 7 THEN '7d'
                WHEN end_date - start_date <= 30 THEN '30d'
                WHEN end_date - start_date <= 90 THEN '90d'
                ELSE '30d'
            END
        ) as services_count,
        
        -- Services array for period
        COALESCE(ARRAY(
            SELECT DISTINCT s.name
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND s.is_active = true
            ORDER BY s.name
        ), '{}') as services,
        
        COALESCE((
            SELECT s.name::VARCHAR(255)
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), '') as most_popular_service,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.service_id)::DECIMAL / NULLIF(COUNT(DISTINCT s.id), 0) * 100)::DECIMAL(5,2)
            FROM services s
            LEFT JOIN appointments a ON a.service_id = s.id 
                AND a.tenant_id = get_tenant_metrics_for_period.tenant_id
                AND a.created_at >= start_ts 
                AND a.created_at <= end_ts
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as service_utilization_rate,
        
        -- AI metrics
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as total_conversations,
        
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.intent_detected IS NOT NULL AND ch.confidence_score > 0.75 THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as ai_success_rate,
        
        COALESCE((
            SELECT AVG(COALESCE(ch.response_time, 0))::DECIMAL(8,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as avg_response_time,
        
        -- Conversion metrics
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '7 days'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as conversion_rate,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '1 day'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as booking_conversion_rate;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily metrics for a tenant on a specific date
CREATE OR REPLACE FUNCTION get_daily_metrics(tenant_id UUID, target_date DATE)
RETURNS TABLE (
    revenue DECIMAL(15,2),
    appointments INTEGER,
    customers INTEGER,
    conversations INTEGER,
    service_breakdown JSONB
) AS $$
DECLARE
    start_ts TIMESTAMP := target_date::timestamp;
    end_ts TIMESTAMP := (target_date + INTERVAL '1 day')::timestamp;
    breakdown JSONB := '{}';
    service_record RECORD;
BEGIN
    -- Build service breakdown
    FOR service_record IN
        SELECT 
            s.name,
            COUNT(a.id)::INTEGER as count
        FROM services s
        LEFT JOIN appointments a ON a.service_id = s.id 
            AND a.tenant_id = get_daily_metrics.tenant_id
            AND a.created_at >= start_ts 
            AND a.created_at < end_ts
        WHERE s.tenant_id = get_daily_metrics.tenant_id
        AND s.is_active = true
        GROUP BY s.name
        HAVING COUNT(a.id) > 0
    LOOP
        breakdown := breakdown || jsonb_build_object(service_record.name, service_record.count);
    END LOOP;
    
    RETURN QUERY
    SELECT 
        COALESCE((
            SELECT SUM(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_daily_metrics.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at < end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as revenue,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_daily_metrics.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at < end_ts
        ), 0) as appointments,
        
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_daily_metrics.tenant_id
            AND ut.first_interaction >= start_ts 
            AND ut.first_interaction < end_ts
        ), 0) as customers,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_daily_metrics.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at < end_ts
        ), 0) as conversations,
        
        breakdown as service_breakdown;
END;
$$ LANGUAGE plpgsql;

-- Function to get platform daily metrics for a specific date
CREATE OR REPLACE FUNCTION get_platform_daily_metrics(target_date DATE)
RETURNS TABLE (
    revenue DECIMAL(15,2),
    appointments INTEGER,
    customers INTEGER
) AS $$
DECLARE
    start_ts TIMESTAMP := target_date::timestamp;
    end_ts TIMESTAMP := (target_date + INTERVAL '1 day')::timestamp;
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE((
            SELECT SUM(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.created_at >= start_ts 
            AND a.created_at < end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as revenue,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.created_at >= start_ts 
            AND a.created_at < end_ts
        ), 0) as appointments,
        
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.first_interaction >= start_ts 
            AND ut.first_interaction < end_ts
        ), 0) as customers;
END;
$$ LANGUAGE plpgsql;

-- Function to get tenant services count by period
CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
)
RETURNS INTEGER AS $$
DECLARE
    start_date DATE;
    end_date DATE := CURRENT_DATE;
    services_count INTEGER := 0;
BEGIN
    -- Calculate start date based on period type
    CASE p_period_type
        WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
        WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
        WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
        ELSE start_date := end_date - INTERVAL '30 days'; -- Default to 30 days
    END CASE;
    
    -- Count services that were active during the period
    SELECT COUNT(*)::INTEGER INTO services_count
    FROM services s
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    AND (
        s.created_at <= end_date::timestamp 
        AND (s.updated_at IS NULL OR s.updated_at >= start_date::timestamp)
    );
    
    -- Return the count with null safety
    RETURN COALESCE(services_count, 0);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return 0 on any exception
        RAISE WARNING 'Error in get_tenant_services_count_by_period for tenant %: %', p_tenant_id, SQLERRM;
        RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get metrics calculation status
CREATE OR REPLACE FUNCTION get_metrics_calculation_status()
RETURNS TABLE (
    metric_type VARCHAR(50),
    calculated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- This is a placeholder - in a real implementation, we would track calculation status
    -- For now, return dummy data indicating when different metrics were last calculated
    RETURN QUERY
    SELECT 
        'daily_metrics'::VARCHAR(50) as metric_type,
        NOW() - INTERVAL '2 hours' as calculated_at
    UNION ALL
    SELECT 
        'risk_assessment'::VARCHAR(50) as metric_type,
        NOW() - INTERVAL '6 hours' as calculated_at
    UNION ALL
    SELECT 
        'rankings'::VARCHAR(50) as metric_type,
        NOW() - INTERVAL '4 hours' as calculated_at;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_created_status ON appointments(tenant_id, created_at, status);
CREATE INDEX IF NOT EXISTS idx_conversation_history_tenant_created ON conversation_history(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_interaction ON user_tenants(tenant_id, first_interaction);
CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON services(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_services_tenant_created_updated ON services(tenant_id, created_at, updated_at, is_active);

-- Add helpful comments
COMMENT ON FUNCTION get_platform_totals IS 'Returns platform-wide metrics for a given date range';
COMMENT ON FUNCTION get_domain_distribution IS 'Returns the distribution of tenants across business domains';
COMMENT ON FUNCTION get_tenant_services_count_by_period IS 'Returns count of active services for a tenant filtered by specific period (7d, 30d, 90d)';
COMMENT ON FUNCTION get_tenant_metrics_for_period IS 'Returns comprehensive metrics for a tenant within a specific period';
COMMENT ON FUNCTION get_daily_metrics IS 'Returns daily metrics for a tenant on a specific date';
COMMENT ON FUNCTION get_platform_daily_metrics IS 'Returns platform-wide daily metrics for a specific date';