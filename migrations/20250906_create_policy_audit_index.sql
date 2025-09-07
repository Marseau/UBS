-- Migration: Create optimized index for policy applications audit
-- Date: 2025-09-06
-- Description: Creates performance index for policy audit queries by tenant and session

-- Create composite index for policy audit queries
CREATE INDEX IF NOT EXISTS idx_policy_apps_tenant_session
ON policy_applications(tenant_id, session_id_uuid, applied_at DESC);

-- Create index for policy analysis by tenant and intent
CREATE INDEX IF NOT EXISTS idx_policy_apps_tenant_intent
ON policy_applications(tenant_id, intent, applied_at DESC);

-- Create index for user-specific policy history
CREATE INDEX IF NOT EXISTS idx_policy_apps_user_phone
ON policy_applications(user_phone, tenant_id, applied_at DESC);

-- Create index for policy performance analysis
CREATE INDEX IF NOT EXISTS idx_policy_apps_policy_action
ON policy_applications(policy_id, decision_action, applied_at DESC);

-- Comments for documentation
COMMENT ON INDEX idx_policy_apps_tenant_session IS 'Optimized queries for session-based policy audit analysis';
COMMENT ON INDEX idx_policy_apps_tenant_intent IS 'Fast intent-based policy reporting and analysis';
COMMENT ON INDEX idx_policy_apps_user_phone IS 'User journey analysis across policies';
COMMENT ON INDEX idx_policy_apps_policy_action IS 'Policy effectiveness and performance metrics';