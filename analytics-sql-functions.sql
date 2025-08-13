-- ============================================================================
-- ANALYTICS OPTIMIZATION SQL FUNCTIONS
-- Complete SQL functions for analytics table management and aggregation
-- ============================================================================

-- ============================================================================
-- 1. CREATE ANALYTICS TABLES
-- ============================================================================

-- System-wide aggregated metrics table
CREATE TABLE IF NOT EXISTS analytics_system_metrics (
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
    
    -- AI metrics
    total_ai_interactions INTEGER DEFAULT 0,
    ai_responses INTEGER DEFAULT 0,
    ai_bookings INTEGER DEFAULT 0,
    average_confidence DECIMAL(5,2) DEFAULT 0,
    intent_accuracy DECIMAL(5,2) DEFAULT 0,
    
    -- SaaS metrics (NEW - for Phase 1.1)
    active_tenants INTEGER DEFAULT 0,
    new_tenants INTEGER DEFAULT 0,
    churn_rate DECIMAL(5,2) DEFAULT 0,
    mrr DECIMAL(12,2) DEFAULT 0,
    arr DECIMAL(12,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(metric_date, period_type)
);

-- Tenant-specific aggregated metrics table
CREATE TABLE IF NOT EXISTS analytics_tenant_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    metric_date DATE NOT NULL,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Appointment metrics
    total_appointments INTEGER DEFAULT 0,
    confirmed_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    no_show_appointments INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    cancellation_rate DECIMAL(5,2) DEFAULT 0,
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
    
    UNIQUE(tenant_id, metric_date, period_type),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Job execution tracking table
CREATE TABLE IF NOT EXISTS analytics_job_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'running')),
    executed_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    metadata JSONB,
    
    INDEX (job_name, executed_at),
    INDEX (status, executed_at)
);

-- Real-time cache table for frequently accessed data
CREATE TABLE IF NOT EXISTS analytics_cache (
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
-- 2. MATERIALIZED VIEWS FOR COMPLEX AGGREGATIONS
-- ============================================================================

-- Daily appointment stats per tenant (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_appointment_stats AS
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

-- Create unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_appointment_stats_unique 
ON mv_daily_appointment_stats (tenant_id, appointment_date);

-- AI interaction summary per tenant
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ai_interaction_stats AS
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

-- Create unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ai_interaction_stats_unique 
ON mv_ai_interaction_stats (tenant_id, interaction_date);

-- Service popularity ranking
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_service_popularity AS
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

-- Create unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_service_popularity_unique 
ON mv_service_popularity (tenant_id, service_id);

-- ============================================================================
-- 3. CORE AGGREGATION FUNCTIONS
-- ============================================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_appointment_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ai_interaction_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_service_popularity;
    
    RAISE NOTICE 'Materialized views refreshed successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily metrics for tenants
CREATE OR REPLACE FUNCTION aggregate_tenant_daily_metrics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
DECLARE
    processed_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting tenant daily aggregation for date: %', target_date;
    
    INSERT INTO analytics_tenant_metrics (
        tenant_id, metric_date, period_type,
        total_appointments, confirmed_appointments, completed_appointments, 
        cancelled_appointments, pending_appointments, no_show_appointments,
        completion_rate, cancellation_rate, no_show_rate,
        total_revenue, completed_revenue, potential_revenue, average_ticket, lost_revenue,
        total_customers, new_customers, returning_customers, active_customers,
        total_ai_interactions, user_messages, ai_responses, ai_bookings, ai_conversion_rate,
        average_confidence, intent_accuracy,
        total_services, active_services
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
        COALESCE(apt_stats.total_revenue - apt_stats.completed_revenue, 0), -- lost_revenue
        
        -- Customer metrics
        COALESCE(cust_stats.total_customers, 0),
        COALESCE(cust_stats.new_customers, 0),
        COALESCE(cust_stats.returning_customers, 0),
        COALESCE(cust_stats.active_customers, 0),
        
        -- AI metrics
        COALESCE(ai_stats.total_interactions, 0),
        COALESCE(ai_stats.user_messages, 0),
        COALESCE(ai_stats.ai_responses, 0),
        COALESCE(ai_stats.ai_bookings, 0),
        COALESCE(ai_stats.ai_conversion_rate, 0),
        COALESCE(ai_stats.avg_confidence, 0),
        COALESCE(ai_stats.intent_accuracy, 0),
        
        -- Service metrics
        COALESCE(service_stats.total_services, 0),
        COALESCE(service_stats.active_services, 0)
        
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
            SUM(COALESCE((appointment_data->>'price')::DECIMAL, 150)) as total_revenue,
            SUM(CASE WHEN status = 'completed' THEN COALESCE((appointment_data->>'price')::DECIMAL, 150) ELSE 0 END) as completed_revenue,
            AVG(COALESCE((appointment_data->>'price')::DECIMAL, 150)) as avg_price,
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
            COUNT(DISTINCT ut.user_id) FILTER (WHERE DATE(ut.first_interaction) < target_date) as returning_customers,
            COUNT(DISTINCT a.user_id) as active_customers
        FROM user_tenants ut
        LEFT JOIN appointments a ON ut.user_id = a.user_id 
            AND ut.tenant_id = a.tenant_id 
            AND DATE(a.created_at) = target_date
        GROUP BY ut.tenant_id
    ) cust_stats ON t.id = cust_stats.tenant_id
    LEFT JOIN (
        SELECT 
            tenant_id,
            COUNT(*) as total_interactions,
            COUNT(*) FILTER (WHERE is_from_user = true) as user_messages,
            COUNT(*) FILTER (WHERE is_from_user = false) as ai_responses,
            COUNT(*) FILTER (WHERE message_content ILIKE '%agendamento%' OR message_content ILIKE '%appointment%') as ai_bookings,
            ROUND(
                COUNT(*) FILTER (WHERE message_content ILIKE '%agendamento%') * 100.0 / 
                NULLIF(COUNT(*) FILTER (WHERE is_from_user = true), 0), 2
            ) as ai_conversion_rate,
            AVG(COALESCE(confidence_score, 0.8)) as avg_confidence,
            ROUND(
                COUNT(*) FILTER (WHERE confidence_score > 0.8) * 100.0 / 
                NULLIF(COUNT(*) FILTER (WHERE confidence_score IS NOT NULL), 0), 2
            ) as intent_accuracy
        FROM conversation_history 
        WHERE DATE(created_at) = target_date
        GROUP BY tenant_id
    ) ai_stats ON t.id = ai_stats.tenant_id
    LEFT JOIN (
        SELECT 
            tenant_id,
            COUNT(*) as total_services,
            COUNT(*) FILTER (WHERE is_active = true) as active_services
        FROM services
        GROUP BY tenant_id
    ) service_stats ON t.id = service_stats.tenant_id
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
        lost_revenue = EXCLUDED.lost_revenue,
        total_customers = EXCLUDED.total_customers,
        new_customers = EXCLUDED.new_customers,
        returning_customers = EXCLUDED.returning_customers,
        active_customers = EXCLUDED.active_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        user_messages = EXCLUDED.user_messages,
        ai_responses = EXCLUDED.ai_responses,
        ai_bookings = EXCLUDED.ai_bookings,
        ai_conversion_rate = EXCLUDED.ai_conversion_rate,
        average_confidence = EXCLUDED.average_confidence,
        intent_accuracy = EXCLUDED.intent_accuracy,
        total_services = EXCLUDED.total_services,
        active_services = EXCLUDED.active_services,
        updated_at = NOW();

    GET DIAGNOSTICS processed_count = ROW_COUNT;
    RAISE NOTICE 'Tenant daily aggregation completed. Processed % rows for date: %', processed_count, target_date;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate system-wide daily metrics (ENHANCED for SaaS metrics)
CREATE OR REPLACE FUNCTION aggregate_system_daily_metrics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
DECLARE
    processed_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting system daily aggregation for date: %', target_date;
    
    INSERT INTO analytics_system_metrics (
        metric_date, period_type,
        total_appointments, confirmed_appointments, completed_appointments,
        cancelled_appointments, pending_appointments,
        completion_rate, cancellation_rate,
        total_revenue, completed_revenue, potential_revenue, average_ticket,
        total_customers, new_customers, active_customers,
        total_ai_interactions, ai_responses, ai_bookings, average_confidence, intent_accuracy,
        active_tenants, new_tenants, churn_rate, mrr, arr
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
        SUM(total_ai_interactions),
        SUM(ai_responses),
        SUM(ai_bookings),
        ROUND(AVG(average_confidence), 2),
        ROUND(AVG(intent_accuracy), 2),
        
        -- SaaS metrics
        COUNT(*) as active_tenants,
        COUNT(*) FILTER (WHERE DATE(tm.created_at) = target_date) as new_tenants,
        0.0 as churn_rate, -- Calculate separately if needed
        SUM(total_revenue) * 30 as mrr, -- Simplified MRR calculation
        SUM(total_revenue) * 365 as arr  -- Simplified ARR calculation
        
    FROM analytics_tenant_metrics tm
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
        average_confidence = EXCLUDED.average_confidence,
        intent_accuracy = EXCLUDED.intent_accuracy,
        active_tenants = EXCLUDED.active_tenants,
        new_tenants = EXCLUDED.new_tenants,
        churn_rate = EXCLUDED.churn_rate,
        mrr = EXCLUDED.mrr,
        arr = EXCLUDED.arr,
        updated_at = NOW();

    GET DIAGNOSTICS processed_count = ROW_COUNT;
    RAISE NOTICE 'System daily aggregation completed. Processed % rows for date: %', processed_count, target_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CACHE MANAGEMENT FUNCTIONS
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
    
    RAISE NOTICE 'Analytics data cached: % (TTL: % minutes)', p_cache_key, p_ttl_minutes;
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
    
    RAISE NOTICE 'Cleaned % expired cache entries', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. HEALTH CHECK AND MONITORING FUNCTIONS
-- ============================================================================

-- Function to check analytics system health
CREATE OR REPLACE FUNCTION check_analytics_system_health()
RETURNS JSONB AS $$
DECLARE
    health_data JSONB;
    system_metrics_count INTEGER;
    tenant_metrics_count INTEGER;
    latest_system_date DATE;
    latest_tenant_date DATE;
    cache_entries_count INTEGER;
    expired_cache_count INTEGER;
BEGIN
    -- Check system metrics
    SELECT COUNT(*), MAX(metric_date) 
    INTO system_metrics_count, latest_system_date
    FROM analytics_system_metrics
    WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days';
    
    -- Check tenant metrics
    SELECT COUNT(*), MAX(metric_date)
    INTO tenant_metrics_count, latest_tenant_date
    FROM analytics_tenant_metrics
    WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days';
    
    -- Check cache
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE expires_at <= NOW())
    INTO cache_entries_count, expired_cache_count
    FROM analytics_cache;
    
    -- Build health report
    health_data = jsonb_build_object(
        'timestamp', NOW(),
        'status', CASE 
            WHEN latest_system_date >= CURRENT_DATE - 1 AND latest_tenant_date >= CURRENT_DATE - 1 THEN 'healthy'
            WHEN latest_system_date >= CURRENT_DATE - 2 AND latest_tenant_date >= CURRENT_DATE - 2 THEN 'warning'
            ELSE 'critical'
        END,
        'system_metrics', jsonb_build_object(
            'count_last_7_days', system_metrics_count,
            'latest_date', latest_system_date,
            'is_current', latest_system_date >= CURRENT_DATE - 1
        ),
        'tenant_metrics', jsonb_build_object(
            'count_last_7_days', tenant_metrics_count,
            'latest_date', latest_tenant_date,
            'is_current', latest_tenant_date >= CURRENT_DATE - 1
        ),
        'cache', jsonb_build_object(
            'total_entries', cache_entries_count,
            'expired_entries', expired_cache_count,
            'cache_hit_ratio', ROUND((cache_entries_count - expired_cache_count) * 100.0 / NULLIF(cache_entries_count, 0), 2)
        )
    );
    
    RETURN health_data;
END;
$$ LANGUAGE plpgsql;

-- Function to record job execution
CREATE OR REPLACE FUNCTION record_job_execution(
    p_job_name VARCHAR(100),
    p_status VARCHAR(20),
    p_duration_ms INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    INSERT INTO analytics_job_executions (
        job_name, status, completed_at, duration_ms, error_message, metadata
    )
    VALUES (
        p_job_name, p_status, NOW(), p_duration_ms, p_error_message, p_metadata
    )
    RETURNING id INTO job_id;
    
    RAISE NOTICE 'Job execution recorded: % (%) - %', p_job_name, p_status, job_id;
    RETURN job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE OPTIMIZATION
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

-- Analytics tables indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_system_metrics_date_period
ON analytics_system_metrics (metric_date DESC, period_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_tenant_metrics_tenant_date
ON analytics_tenant_metrics (tenant_id, metric_date DESC, period_type);

-- ============================================================================
-- 7. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on analytics tables
ALTER TABLE analytics_tenant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;

-- Tenant admins can only see their own tenant's analytics
CREATE POLICY IF NOT EXISTS tenant_analytics_isolation ON analytics_tenant_metrics
    FOR ALL TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );

-- Cache access policy
CREATE POLICY IF NOT EXISTS tenant_cache_isolation ON analytics_cache
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
-- 8. SCHEDULED JOBS SETUP (PostgreSQL/pg_cron syntax)
-- ============================================================================

-- Daily aggregation job (runs at 1 AM daily)
-- SELECT cron.schedule('aggregate-daily-metrics', '0 1 * * *', 
--   'SELECT aggregate_tenant_daily_metrics(); SELECT aggregate_system_daily_metrics();');

-- Refresh materialized views (runs every 6 hours)
-- SELECT cron.schedule('refresh-analytics-views', '0 */6 * * *', 
--   'SELECT refresh_analytics_materialized_views();');

-- Clean expired cache (runs every hour)
-- SELECT cron.schedule('clean-analytics-cache', '0 * * * *', 
--   'SELECT clean_expired_analytics_cache();');

-- Health check job (runs every 30 minutes)
-- SELECT cron.schedule('analytics-health-check', '*/30 * * * *', 
--   'SELECT check_analytics_system_health();');

-- ============================================================================
-- END OF ANALYTICS OPTIMIZATION SQL FUNCTIONS
-- ============================================================================