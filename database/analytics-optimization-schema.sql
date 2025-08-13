-- Analytics Optimization Schema
-- Scalable Data Mart and Materialized Views for Multi-Tenant Analytics

-- ============================================================================
-- ANALYTICS DATA MART TABLES
-- ============================================================================

-- System-wide aggregated metrics table (refreshed via scheduled job)
CREATE TABLE analytics_system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Appointment metrics
    total_appointments INTEGER DEFAULT 0,
    confirmed_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    cancellation_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Revenue metrics  
    total_revenue DECIMAL(12,2) DEFAULT 0,
    completed_revenue DECIMAL(12,2) DEFAULT 0,
    potential_revenue DECIMAL(12,2) DEFAULT 0,
    average_ticket DECIMAL(8,2) DEFAULT 0,
    
    -- Customer metrics
    total_customers INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    active_customers INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    
    -- AI metrics
    total_ai_interactions INTEGER DEFAULT 0,
    ai_responses INTEGER DEFAULT 0,
    ai_bookings INTEGER DEFAULT 0,
    average_confidence DECIMAL(5,2) DEFAULT 0,
    intent_accuracy DECIMAL(5,2) DEFAULT 0,
    
    -- Tenant metrics
    active_tenants INTEGER DEFAULT 0,
    new_tenants INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(metric_date, period_type)
);

-- Tenant-specific aggregated metrics table
CREATE TABLE analytics_tenant_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Appointment metrics
    total_appointments INTEGER DEFAULT 0,
    confirmed_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    cancellation_rate DECIMAL(5,2) DEFAULT 0,
    no_show_appointments INTEGER DEFAULT 0,
    no_show_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Revenue metrics
    total_revenue DECIMAL(12,2) DEFAULT 0,
    completed_revenue DECIMAL(12,2) DEFAULT 0,
    potential_revenue DECIMAL(12,2) DEFAULT 0,
    average_ticket DECIMAL(8,2) DEFAULT 0,
    lost_revenue DECIMAL(12,2) DEFAULT 0,
    
    -- Customer metrics
    total_customers INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    returning_customers INTEGER DEFAULT 0,
    active_customers INTEGER DEFAULT 0,
    retention_rate DECIMAL(5,2) DEFAULT 0,
    
    -- AI metrics
    total_ai_interactions INTEGER DEFAULT 0,
    user_messages INTEGER DEFAULT 0,
    ai_responses INTEGER DEFAULT 0,
    ai_bookings INTEGER DEFAULT 0,
    ai_conversion_rate DECIMAL(5,2) DEFAULT 0,
    average_confidence DECIMAL(5,2) DEFAULT 0,
    intent_accuracy DECIMAL(5,2) DEFAULT 0,
    
    -- Service metrics
    total_services INTEGER DEFAULT 0,
    active_services INTEGER DEFAULT 0,
    most_popular_service_id UUID,
    most_profitable_service_id UUID,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(tenant_id, metric_date, period_type)
);

-- Service performance aggregations
CREATE TABLE analytics_service_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    total_bookings INTEGER DEFAULT 0,
    completed_bookings INTEGER DEFAULT 0,
    cancelled_bookings INTEGER DEFAULT 0,
    no_show_bookings INTEGER DEFAULT 0,
    
    total_revenue DECIMAL(12,2) DEFAULT 0,
    average_price DECIMAL(8,2) DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(tenant_id, service_id, metric_date, period_type)
);

-- Real-time cache table for frequently accessed data
CREATE TABLE analytics_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    tenant_id UUID, -- NULL for system-wide cache
    data_type VARCHAR(50) NOT NULL,
    cached_data JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_analytics_cache_tenant_type (tenant_id, data_type),
    INDEX idx_analytics_cache_expires (expires_at)
);

-- ============================================================================
-- MATERIALIZED VIEWS FOR COMPLEX AGGREGATIONS
-- ============================================================================

-- Daily appointment stats per tenant (materialized view)
CREATE MATERIALIZED VIEW mv_daily_appointment_stats AS
SELECT 
    tenant_id,
    DATE(start_time) as appointment_date,
    COUNT(*) as total_appointments,
    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
    SUM(COALESCE((appointment_data->>'price')::DECIMAL, 0)) as total_revenue,
    AVG(COALESCE((appointment_data->>'price')::DECIMAL, 0)) as avg_price,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 
        2
    ) as completion_rate,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'cancelled') * 100.0 / NULLIF(COUNT(*), 0), 
        2
    ) as cancellation_rate
FROM appointments 
WHERE start_time >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY tenant_id, DATE(start_time);

-- Create indexes on materialized view
CREATE INDEX idx_mv_daily_appointment_stats_tenant_date 
ON mv_daily_appointment_stats (tenant_id, appointment_date);

-- AI interaction summary per tenant
CREATE MATERIALIZED VIEW mv_ai_interaction_stats AS
SELECT 
    tenant_id,
    DATE(created_at) as interaction_date,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE is_from_user = true) as user_messages,
    COUNT(*) FILTER (WHERE is_from_user = false) as ai_responses,
    COUNT(*) FILTER (WHERE intent_detected IS NOT NULL) as messages_with_intent,
    COUNT(*) FILTER (WHERE confidence_score > 0.8) as high_confidence_intents,
    AVG(COALESCE(confidence_score, 0)) as avg_confidence,
    ROUND(
        COUNT(*) FILTER (WHERE confidence_score > 0.8) * 100.0 / 
        NULLIF(COUNT(*) FILTER (WHERE intent_detected IS NOT NULL), 0), 
        2
    ) as intent_accuracy
FROM conversation_history 
WHERE created_at >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY tenant_id, DATE(created_at);

-- Service popularity ranking
CREATE MATERIALIZED VIEW mv_service_popularity AS
SELECT 
    s.tenant_id,
    s.id as service_id,
    s.name as service_name,
    s.base_price,
    COUNT(a.id) as total_bookings,
    COUNT(a.id) FILTER (WHERE a.status = 'completed') as completed_bookings,
    SUM(COALESCE((a.appointment_data->>'price')::DECIMAL, s.base_price)) as total_revenue,
    AVG(COALESCE((a.appointment_data->>'price')::DECIMAL, s.base_price)) as avg_price,
    ROUND(
        COUNT(a.id) FILTER (WHERE a.status = 'completed') * 100.0 / NULLIF(COUNT(a.id), 0), 
        2
    ) as completion_rate,
    ROW_NUMBER() OVER (PARTITION BY s.tenant_id ORDER BY COUNT(a.id) DESC) as popularity_rank,
    ROW_NUMBER() OVER (PARTITION BY s.tenant_id ORDER BY SUM(COALESCE((a.appointment_data->>'price')::DECIMAL, s.base_price)) DESC) as revenue_rank
FROM services s
LEFT JOIN appointments a ON s.id = a.service_id 
    AND a.created_at >= CURRENT_DATE - INTERVAL '90 days'
WHERE s.is_active = true
GROUP BY s.tenant_id, s.id, s.name, s.base_price;

-- ============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Appointment table indexes for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics_tenant_date 
ON appointments (tenant_id, start_time) 
WHERE start_time >= CURRENT_DATE - INTERVAL '2 years';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics_status_date 
ON appointments (status, start_time) 
WHERE start_time >= CURRENT_DATE - INTERVAL '2 years';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics_service_tenant 
ON appointments (service_id, tenant_id, status) 
WHERE created_at >= CURRENT_DATE - INTERVAL '2 years';

-- Conversation history indexes for AI analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_analytics 
ON conversation_history (tenant_id, created_at, is_from_user) 
WHERE created_at >= CURRENT_DATE - INTERVAL '2 years';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_intent 
ON conversation_history (tenant_id, intent_detected, confidence_score) 
WHERE created_at >= CURRENT_DATE - INTERVAL '2 years';

-- User activity indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_analytics_created 
ON users (created_at) 
WHERE created_at >= CURRENT_DATE - INTERVAL '2 years';

-- ============================================================================
-- FUNCTIONS FOR DATA AGGREGATION
-- ============================================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_appointment_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ai_interaction_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_service_popularity;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily metrics for tenants
CREATE OR REPLACE FUNCTION aggregate_tenant_daily_metrics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
    INSERT INTO analytics_tenant_metrics (
        tenant_id, metric_date, period_type,
        total_appointments, confirmed_appointments, completed_appointments, 
        cancelled_appointments, pending_appointments, no_show_appointments,
        completion_rate, cancellation_rate, no_show_rate,
        total_revenue, completed_revenue, potential_revenue, average_ticket,
        total_customers, new_customers, active_customers
    )
    SELECT 
        t.id as tenant_id,
        target_date,
        'daily',
        
        -- Appointment metrics
        COALESCE(apt_stats.total_appointments, 0),
        COALESCE(apt_stats.confirmed, 0),
        COALESCE(apt_stats.completed, 0),
        COALESCE(apt_stats.cancelled, 0),
        COALESCE(apt_stats.pending, 0),
        COALESCE(apt_stats.no_show, 0),
        COALESCE(apt_stats.completion_rate, 0),
        COALESCE(apt_stats.cancellation_rate, 0),
        COALESCE(ROUND(apt_stats.no_show * 100.0 / NULLIF(apt_stats.total_appointments, 0), 2), 0),
        
        -- Revenue metrics
        COALESCE(apt_stats.total_revenue, 0),
        COALESCE(apt_stats.completed_revenue, 0),
        COALESCE(apt_stats.total_revenue, 0), -- potential_revenue
        COALESCE(apt_stats.avg_price, 0),
        
        -- Customer metrics (simplified for daily aggregation)
        COALESCE(cust_stats.total_customers, 0),
        COALESCE(cust_stats.new_customers, 0),
        COALESCE(cust_stats.active_customers, 0)
        
    FROM tenants t
    LEFT JOIN (
        SELECT 
            tenant_id,
            COUNT(*) as total_appointments,
            COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
            SUM(COALESCE((appointment_data->>'price')::DECIMAL, 0)) as total_revenue,
            SUM(CASE WHEN status = 'completed' THEN COALESCE((appointment_data->>'price')::DECIMAL, 0) ELSE 0 END) as completed_revenue,
            AVG(COALESCE((appointment_data->>'price')::DECIMAL, 0)) as avg_price,
            ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 2) as completion_rate,
            ROUND(COUNT(*) FILTER (WHERE status = 'cancelled') * 100.0 / NULLIF(COUNT(*), 0), 2) as cancellation_rate
        FROM appointments 
        WHERE DATE(start_time) = target_date
        GROUP BY tenant_id
    ) apt_stats ON t.id = apt_stats.tenant_id
    LEFT JOIN (
        SELECT 
            ut.tenant_id,
            COUNT(DISTINCT ut.user_id) as total_customers,
            COUNT(DISTINCT ut.user_id) FILTER (WHERE DATE(ut.first_interaction) = target_date) as new_customers,
            COUNT(DISTINCT a.user_id) as active_customers
        FROM user_tenants ut
        LEFT JOIN appointments a ON ut.user_id = a.user_id 
            AND ut.tenant_id = a.tenant_id 
            AND DATE(a.created_at) = target_date
        GROUP BY ut.tenant_id
    ) cust_stats ON t.id = cust_stats.tenant_id
    WHERE t.status = 'active'
    
    ON CONFLICT (tenant_id, metric_date, period_type) 
    DO UPDATE SET
        total_appointments = EXCLUDED.total_appointments,
        confirmed_appointments = EXCLUDED.confirmed_appointments,
        completed_appointments = EXCLUDED.completed_appointments,
        cancelled_appointments = EXCLUDED.cancelled_appointments,
        pending_appointments = EXCLUDED.pending_appointments,
        no_show_appointments = EXCLUDED.no_show_appointments,
        completion_rate = EXCLUDED.completion_rate,
        cancellation_rate = EXCLUDED.cancellation_rate,
        no_show_rate = EXCLUDED.no_show_rate,
        total_revenue = EXCLUDED.total_revenue,
        completed_revenue = EXCLUDED.completed_revenue,
        potential_revenue = EXCLUDED.potential_revenue,
        average_ticket = EXCLUDED.average_ticket,
        total_customers = EXCLUDED.total_customers,
        new_customers = EXCLUDED.new_customers,
        active_customers = EXCLUDED.active_customers,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate system-wide daily metrics
CREATE OR REPLACE FUNCTION aggregate_system_daily_metrics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
    INSERT INTO analytics_system_metrics (
        metric_date, period_type,
        total_appointments, confirmed_appointments, completed_appointments,
        cancelled_appointments, pending_appointments,
        completion_rate, cancellation_rate,
        total_revenue, completed_revenue, potential_revenue, average_ticket,
        total_customers, new_customers, active_customers,
        total_ai_interactions, ai_responses, ai_bookings,
        active_tenants
    )
    SELECT 
        target_date,
        'daily',
        
        -- Aggregate from tenant metrics
        SUM(total_appointments),
        SUM(confirmed_appointments), 
        SUM(completed_appointments),
        SUM(cancelled_appointments),
        SUM(pending_appointments),
        ROUND(AVG(completion_rate), 2),
        ROUND(AVG(cancellation_rate), 2),
        SUM(total_revenue),
        SUM(completed_revenue),
        SUM(potential_revenue),
        ROUND(AVG(average_ticket), 2),
        SUM(total_customers),
        SUM(new_customers),
        SUM(active_customers),
        
        -- AI metrics (calculated separately)
        COALESCE(ai_stats.total_interactions, 0),
        COALESCE(ai_stats.ai_responses, 0),
        COALESCE(ai_stats.ai_bookings, 0),
        
        -- Tenant count
        COUNT(*) as active_tenants
        
    FROM analytics_tenant_metrics tm
    LEFT JOIN (
        SELECT 
            COUNT(*) as total_interactions,
            COUNT(*) FILTER (WHERE is_from_user = false) as ai_responses,
            (SELECT COUNT(*) FROM appointments 
             WHERE DATE(created_at) = target_date 
             AND appointment_data->>'source' = 'ai') as ai_bookings
        FROM conversation_history 
        WHERE DATE(created_at) = target_date
    ) ai_stats ON true
    WHERE tm.metric_date = target_date 
    AND tm.period_type = 'daily'
    
    ON CONFLICT (metric_date, period_type)
    DO UPDATE SET
        total_appointments = EXCLUDED.total_appointments,
        confirmed_appointments = EXCLUDED.confirmed_appointments,
        completed_appointments = EXCLUDED.completed_appointments,
        cancelled_appointments = EXCLUDED.cancelled_appointments,
        pending_appointments = EXCLUDED.pending_appointments,
        completion_rate = EXCLUDED.completion_rate,
        cancellation_rate = EXCLUDED.cancellation_rate,
        total_revenue = EXCLUDED.total_revenue,
        completed_revenue = EXCLUDED.completed_revenue,
        potential_revenue = EXCLUDED.potential_revenue,
        average_ticket = EXCLUDED.average_ticket,
        total_customers = EXCLUDED.total_customers,
        new_customers = EXCLUDED.new_customers,
        active_customers = EXCLUDED.active_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        ai_responses = EXCLUDED.ai_responses,
        ai_bookings = EXCLUDED.ai_bookings,
        active_tenants = EXCLUDED.active_tenants,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CACHE MANAGEMENT FUNCTIONS
-- ============================================================================

-- Function to cache analytics data
CREATE OR REPLACE FUNCTION cache_analytics_data(
    p_cache_key VARCHAR(255),
    p_tenant_id UUID,
    p_data_type VARCHAR(50),
    p_data JSONB,
    p_ttl_minutes INTEGER DEFAULT 60
)
RETURNS void AS $$
BEGIN
    INSERT INTO analytics_cache (cache_key, tenant_id, data_type, cached_data, expires_at)
    VALUES (p_cache_key, p_tenant_id, p_data_type, p_data, NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
    ON CONFLICT (cache_key)
    DO UPDATE SET
        cached_data = EXCLUDED.cached_data,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get cached analytics data
CREATE OR REPLACE FUNCTION get_cached_analytics_data(p_cache_key VARCHAR(255))
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT cached_data INTO result
    FROM analytics_cache
    WHERE cache_key = p_cache_key
    AND expires_at > NOW();
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_analytics_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_cache WHERE expires_at <= NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS AND SECURITY
-- ============================================================================

-- RLS policies for analytics tables
ALTER TABLE analytics_tenant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_service_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;

-- Tenant admins can only see their own tenant's analytics
CREATE POLICY tenant_analytics_isolation ON analytics_tenant_metrics
    FOR ALL TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );

-- Similar policy for service performance
CREATE POLICY tenant_service_analytics_isolation ON analytics_service_performance
    FOR ALL TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );

-- Cache access policy
CREATE POLICY tenant_cache_isolation ON analytics_cache
    FOR ALL TO authenticated
    USING (
        tenant_id IS NULL OR -- System-wide cache
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );

-- Super admins have access to system-wide metrics (no RLS on analytics_system_metrics)

-- ============================================================================
-- SCHEDULED JOBS SETUP (PostgreSQL/pg_cron syntax)
-- ============================================================================

-- Note: These would be set up via pg_cron or external scheduler
-- Daily aggregation job (runs at 1 AM daily)
-- SELECT cron.schedule('aggregate-daily-metrics', '0 1 * * *', 'SELECT aggregate_tenant_daily_metrics(); SELECT aggregate_system_daily_metrics();');

-- Refresh materialized views (runs every 6 hours)
-- SELECT cron.schedule('refresh-analytics-views', '0 */6 * * *', 'SELECT refresh_analytics_materialized_views();');

-- Clean expired cache (runs every hour)
-- SELECT cron.schedule('clean-analytics-cache', '0 * * * *', 'SELECT clean_expired_analytics_cache();');

-- ============================================================================
-- EXAMPLE QUERIES FOR FAST ANALYTICS
-- ============================================================================

-- Fast system-wide metrics (uses pre-aggregated data)
/*
SELECT 
    SUM(total_appointments) as system_appointments,
    AVG(completion_rate) as avg_completion_rate,
    SUM(total_revenue) as system_revenue,
    COUNT(*) as active_tenants
FROM analytics_system_metrics 
WHERE metric_date >= CURRENT_DATE - 30 
AND period_type = 'daily';
*/

-- Fast tenant metrics with growth calculation
/*
SELECT 
    current_period.*,
    COALESCE(
        ROUND(
            (current_period.total_appointments - previous_period.total_appointments) * 100.0 / 
            NULLIF(previous_period.total_appointments, 0), 2
        ), 0
    ) as appointments_growth,
    COALESCE(
        ROUND(
            (current_period.total_revenue - previous_period.total_revenue) * 100.0 / 
            NULLIF(previous_period.total_revenue, 0), 2
        ), 0
    ) as revenue_growth
FROM (
    SELECT * FROM analytics_tenant_metrics 
    WHERE tenant_id = $1 
    AND metric_date >= CURRENT_DATE - 30 
    AND period_type = 'daily'
) current_period
LEFT JOIN (
    SELECT * FROM analytics_tenant_metrics 
    WHERE tenant_id = $1 
    AND metric_date >= CURRENT_DATE - 60 
    AND metric_date < CURRENT_DATE - 30
    AND period_type = 'daily'
) previous_period ON true;
*/