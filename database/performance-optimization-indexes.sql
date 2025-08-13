-- DATABASE PERFORMANCE OPTIMIZATION INDEXES
-- ==========================================
-- Run these indexes to optimize the slow calculate_enhanced_platform_metrics function
-- Estimated performance improvement: 75-85% faster execution

-- 1. Conversation History Indexes (HIGHEST PRIORITY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_tenant_id 
ON conversation_history(tenant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_created_at 
ON conversation_history(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_tenant_date_type 
ON conversation_history(tenant_id, created_at, message_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_confidence 
ON conversation_history(confidence_score) 
WHERE confidence_score IS NOT NULL;

-- 2. Appointments Indexes (MEDIUM PRIORITY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_tenant_created 
ON appointments(tenant_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_created_at 
ON appointments(created_at);

-- 3. Tenants Indexes (MEDIUM PRIORITY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status 
ON tenants(status) 
WHERE status = 'active';

-- 4. UBS Metrics System Indexes (LOW PRIORITY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ubs_metrics_tenant_date_period 
ON ubs_metric_system(tenant_id, calculation_date, period_days, data_source);

-- 5. Performance Analysis Queries
-- Use these to verify index effectiveness after creation
/*
EXPLAIN ANALYZE SELECT tenant_id, created_at, message_type, confidence_score 
FROM conversation_history 
WHERE tenant_id = '...' 
  AND created_at >= '2024-12-18' 
  AND created_at <= '2025-01-17' 
  AND message_type = 'user';
*/