
-- ===================================
-- DATABASE OPTIMIZATION SCRIPT
-- Generated: 2025-07-07T13:46:55.793Z
-- ===================================

-- Performance Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_tenant_status 
    ON appointments(tenant_id, status);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_start_time 
    ON appointments(start_time DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_user_tenant 
    ON appointments(user_id, tenant_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_service_time 
    ON appointments(service_id, start_time DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at 
    ON users(created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_tenant_role 
    ON user_tenants(tenant_id, role);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_user_tenant 
    ON user_tenants(user_id, tenant_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_tenant_active 
    ON services(tenant_id, is_active);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_created_at 
    ON services(created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_tenant_time 
    ON conversation_history(tenant_id, created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status_plan 
    ON tenants(status, subscription_plan);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_created_at 
    ON tenants(created_at DESC);

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_composite_analytics
    ON appointments(tenant_id, status, start_time DESC, user_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_composite_search
    ON users(created_at DESC, name, email);

-- Analyze tables to update statistics
ANALYZE appointments;
ANALYZE users;
ANALYZE user_tenants;
ANALYZE services;
ANALYZE tenants;
ANALYZE conversation_history;

-- ===================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ===================================

-- Daily appointment statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_appointment_stats AS
SELECT 
    tenant_id,
    DATE(start_time) as appointment_date,
    COUNT(*) as total_appointments,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments,
    SUM(CASE WHEN status = 'completed' THEN COALESCE(final_price, quoted_price, 0) ELSE 0 END) as daily_revenue
FROM appointments 
WHERE start_time >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, DATE(start_time);

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant_date 
    ON daily_appointment_stats(tenant_id, appointment_date DESC);

-- Monthly tenant metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_tenant_metrics AS
SELECT 
    t.id as tenant_id,
    t.business_name,
    t.subscription_plan,
    DATE_TRUNC('month', CURRENT_DATE) as metric_month,
    COUNT(DISTINCT ut.user_id) as active_customers,
    COUNT(a.id) as total_appointments,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
    SUM(CASE WHEN a.status = 'completed' THEN COALESCE(a.final_price, a.quoted_price, 0) ELSE 0 END) as monthly_revenue
FROM tenants t
LEFT JOIN user_tenants ut ON t.id = ut.tenant_id
LEFT JOIN appointments a ON t.id = a.tenant_id AND a.start_time >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.id, t.business_name, t.subscription_plan;

-- Customer lifetime value view
CREATE MATERIALIZED VIEW IF NOT EXISTS customer_ltv_metrics AS
SELECT 
    ut.user_id,
    ut.tenant_id,
    u.name,
    u.email,
    COUNT(a.id) as total_appointments,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
    SUM(CASE WHEN a.status = 'completed' THEN COALESCE(a.final_price, a.quoted_price, 0) ELSE 0 END) as lifetime_value,
    MIN(a.start_time) as first_appointment,
    MAX(a.start_time) as last_appointment,
    EXTRACT(days FROM CURRENT_DATE - MAX(a.start_time::date)) as days_since_last
FROM user_tenants ut
JOIN users u ON ut.user_id = u.id
LEFT JOIN appointments a ON ut.user_id = a.user_id AND ut.tenant_id = a.tenant_id
GROUP BY ut.user_id, ut.tenant_id, u.name, u.email;

-- Refresh materialized views (should be scheduled)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_appointment_stats;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_tenant_metrics;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY customer_ltv_metrics;
