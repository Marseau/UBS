-- Performance Optimization Indexes for Dashboard
-- These indexes will dramatically improve dashboard loading speed

-- Critical indexes for appointments analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics 
ON appointments (tenant_id, created_at DESC, status) 
INCLUDE (quoted_price, final_price);

-- Index for conversation history analytics  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_analytics
ON conversation_history (tenant_id, created_at DESC, is_from_user)
INCLUDE (confidence_score, intent_detected);

-- Index for user tenants analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_analytics
ON user_tenants (tenant_id, first_interaction DESC)
INCLUDE (total_bookings);

-- Index for services analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_tenant
ON services (tenant_id, is_active)
INCLUDE (name, base_price);

-- JSONB index for appointment data queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_jsonb_gin
ON appointments USING GIN (appointment_data);

-- Composite index for revenue calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_revenue
ON appointments (tenant_id, status, created_at DESC)
WHERE status IN ('completed', 'confirmed');

-- Index for AI metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_ai_metrics
ON conversation_history (tenant_id, created_at DESC)
WHERE confidence_score IS NOT NULL;

-- Index for system-wide analytics (super admin dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status_created
ON tenants (status, created_at DESC, subscription_plan);

-- Partial index for active tenants only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_active
ON tenants (id, business_name, domain, subscription_plan, created_at)
WHERE status = 'active';

-- Index for user tenant relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_user_tenant
ON user_tenants (user_id, tenant_id)
INCLUDE (first_interaction, total_bookings);

-- Analyze tables after creating indexes for optimal query planning
ANALYZE appointments;
ANALYZE conversation_history; 
ANALYZE user_tenants;
ANALYZE services;
ANALYZE tenants;

-- Create materialized view for dashboard metrics (optional but recommended)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_daily_metrics AS
SELECT 
    tenant_id,
    DATE(created_at) as metric_date,
    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_appointments,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_appointments,
    COUNT(*) as total_appointments,
    SUM(COALESCE(final_price, quoted_price, 0)) FILTER (WHERE status IN ('completed', 'confirmed')) as daily_revenue,
    COUNT(DISTINCT user_id) as unique_customers
FROM appointments 
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, DATE(created_at)
ORDER BY tenant_id, metric_date DESC;

-- Index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_daily_metrics
ON mv_tenant_daily_metrics (tenant_id, metric_date DESC);

-- Refresh function for the materialized view
CREATE OR REPLACE FUNCTION refresh_tenant_metrics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_daily_metrics;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON INDEX idx_appointments_analytics IS 'Primary index for tenant appointment analytics queries';
COMMENT ON INDEX idx_conversation_history_analytics IS 'Primary index for AI interaction analytics';
COMMENT ON INDEX idx_user_tenants_analytics IS 'Primary index for customer analytics';
COMMENT ON MATERIALIZED VIEW mv_tenant_daily_metrics IS 'Pre-aggregated daily metrics for faster dashboard loading';