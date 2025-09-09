-- System Alerts Table for Intent Cascade Monitoring
-- Creates table for tracking system alerts from the intent detection monitoring system
-- Supports multi-tenant alert management with proper isolation and indexing

-- Create enum for alert types
CREATE TYPE alert_type AS ENUM (
    'intent_cascade_failure',
    'system_performance',
    'security_alert',
    'data_integrity',
    'external_service_failure'
);

-- Create enum for severity levels
CREATE TYPE severity_level AS ENUM (
    'low',
    'medium', 
    'high',
    'critical'
);

-- Create enum for alert status
CREATE TYPE alert_status AS ENUM (
    'active',
    'acknowledged',
    'resolved',
    'dismissed'
);

-- Create system alerts table
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Alert classification
    alert_type alert_type NOT NULL DEFAULT 'system_performance',
    severity_level severity_level NOT NULL DEFAULT 'low',
    
    -- Alert content
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Performance metrics and metadata
    metrics JSONB DEFAULT '{}',
    
    -- Alert lifecycle
    status alert_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    
    -- Audit fields
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_resolution_consistency CHECK (
        (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL) OR
        (status NOT IN ('resolved', 'dismissed') AND resolved_at IS NULL)
    ),
    CONSTRAINT valid_title_length CHECK (length(title) >= 5 AND length(title) <= 200),
    CONSTRAINT valid_description_length CHECK (length(description) >= 10),
    CONSTRAINT valid_resolution_notes CHECK (
        (resolved_by IS NOT NULL AND resolution_notes IS NOT NULL AND resolved_at IS NOT NULL) OR
        (resolved_by IS NULL AND resolution_notes IS NULL)
    )
);

-- Create indexes for performance
CREATE INDEX idx_system_alerts_tenant_id ON system_alerts(tenant_id);
CREATE INDEX idx_system_alerts_alert_type ON system_alerts(alert_type);
CREATE INDEX idx_system_alerts_severity_level ON system_alerts(severity_level);
CREATE INDEX idx_system_alerts_status ON system_alerts(status);
CREATE INDEX idx_system_alerts_created_at ON system_alerts(created_at);
CREATE INDEX idx_system_alerts_resolved_at ON system_alerts(resolved_at);

-- Composite indexes for common queries
CREATE INDEX idx_system_alerts_tenant_status ON system_alerts(tenant_id, status);
CREATE INDEX idx_system_alerts_tenant_type_status ON system_alerts(tenant_id, alert_type, status);
CREATE INDEX idx_system_alerts_severity_created ON system_alerts(severity_level, created_at DESC);
CREATE INDEX idx_system_alerts_type_created ON system_alerts(alert_type, created_at DESC);

-- GIN index for JSONB metrics queries
CREATE INDEX idx_system_alerts_metrics_gin ON system_alerts USING gin(metrics);

-- Enable RLS for multi-tenant isolation
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation_system_alerts ON system_alerts
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_system_alerts_updated_at ON system_alerts;
CREATE TRIGGER trigger_update_system_alerts_updated_at
    BEFORE UPDATE ON system_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_system_alerts_updated_at();

-- Function to resolve an alert
CREATE OR REPLACE FUNCTION resolve_system_alert(
    p_alert_id UUID,
    p_resolved_by TEXT,
    p_resolution_notes TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_updated_rows INTEGER;
BEGIN
    -- Update alert to resolved status
    UPDATE system_alerts
    SET 
        status = 'resolved',
        resolved_at = now(),
        resolved_by = p_resolved_by,
        resolution_notes = p_resolution_notes,
        updated_at = now()
    WHERE 
        id = p_alert_id
        AND status = 'active';
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    
    RETURN v_updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to acknowledge an alert
CREATE OR REPLACE FUNCTION acknowledge_system_alert(
    p_alert_id UUID,
    p_acknowledged_by TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_updated_rows INTEGER;
BEGIN
    -- Update alert to acknowledged status
    UPDATE system_alerts
    SET 
        status = 'acknowledged',
        resolved_by = p_acknowledged_by, -- Reusing resolved_by field for acknowledgment
        updated_at = now()
    WHERE 
        id = p_alert_id
        AND status = 'active';
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    
    RETURN v_updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active alerts for a tenant
CREATE OR REPLACE FUNCTION get_active_alerts_for_tenant(
    p_tenant_id UUID,
    p_severity_filter severity_level DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
    id UUID,
    alert_type alert_type,
    severity_level severity_level,
    title TEXT,
    description TEXT,
    metrics JSONB,
    status alert_status,
    created_at TIMESTAMPTZ,
    age_minutes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sa.id,
        sa.alert_type,
        sa.severity_level,
        sa.title,
        sa.description,
        sa.metrics,
        sa.status,
        sa.created_at,
        EXTRACT(EPOCH FROM (now() - sa.created_at))::INTEGER / 60 as age_minutes
    FROM system_alerts sa
    WHERE 
        sa.tenant_id = p_tenant_id
        AND sa.status IN ('active', 'acknowledged')
        AND (p_severity_filter IS NULL OR sa.severity_level = p_severity_filter)
    ORDER BY 
        CASE sa.severity_level 
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
        END,
        sa.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get alert statistics for a tenant
CREATE OR REPLACE FUNCTION get_tenant_alert_stats(
    p_tenant_id UUID,
    p_days_back INTEGER DEFAULT 7
) RETURNS TABLE (
    total_alerts INTEGER,
    active_alerts INTEGER,
    critical_alerts INTEGER,
    high_alerts INTEGER,
    medium_alerts INTEGER,
    low_alerts INTEGER,
    resolved_alerts INTEGER,
    avg_resolution_time_hours DECIMAL,
    most_common_alert_type alert_type,
    alerts_by_day JSONB
) AS $$
DECLARE
    v_start_date TIMESTAMPTZ := now() - (p_days_back || ' days')::INTERVAL;
BEGIN
    RETURN QUERY
    WITH alert_stats AS (
        SELECT 
            COUNT(*) as total_alerts,
            COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
            COUNT(*) FILTER (WHERE severity_level = 'critical') as critical_alerts,
            COUNT(*) FILTER (WHERE severity_level = 'high') as high_alerts,
            COUNT(*) FILTER (WHERE severity_level = 'medium') as medium_alerts,
            COUNT(*) FILTER (WHERE severity_level = 'low') as low_alerts,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_alerts,
            AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) FILTER (WHERE status = 'resolved') as avg_resolution_time_hours
        FROM system_alerts
        WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
    ),
    most_common_type AS (
        SELECT alert_type
        FROM system_alerts
        WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
        GROUP BY alert_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
    ),
    daily_breakdown AS (
        SELECT jsonb_object_agg(
            alert_date::text,
            daily_count
        ) as alerts_by_day
        FROM (
            SELECT 
                DATE(created_at) as alert_date,
                COUNT(*) as daily_count
            FROM system_alerts
            WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
            GROUP BY DATE(created_at)
            ORDER BY alert_date
        ) daily
    )
    SELECT 
        COALESCE(s.total_alerts, 0)::INTEGER,
        COALESCE(s.active_alerts, 0)::INTEGER,
        COALESCE(s.critical_alerts, 0)::INTEGER,
        COALESCE(s.high_alerts, 0)::INTEGER,
        COALESCE(s.medium_alerts, 0)::INTEGER,
        COALESCE(s.low_alerts, 0)::INTEGER,
        COALESCE(s.resolved_alerts, 0)::INTEGER,
        COALESCE(s.avg_resolution_time_hours, 0)::DECIMAL,
        t.alert_type,
        COALESCE(d.alerts_by_day, '{}'::jsonb)
    FROM alert_stats s
    CROSS JOIN most_common_type t
    CROSS JOIN daily_breakdown d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-resolve old alerts (cleanup)
CREATE OR REPLACE FUNCTION auto_resolve_old_alerts(
    p_days_old INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    v_resolved_count INTEGER;
    v_cutoff_date TIMESTAMPTZ := now() - (p_days_old || ' days')::INTERVAL;
BEGIN
    -- Auto-resolve low severity alerts that are older than specified days
    UPDATE system_alerts
    SET 
        status = 'resolved',
        resolved_at = now(),
        resolved_by = 'system_auto_cleanup',
        resolution_notes = 'Auto-resolved due to age (low severity)',
        updated_at = now()
    WHERE 
        status = 'active'
        AND severity_level = 'low'
        AND created_at < v_cutoff_date;
    
    GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    
    RETURN v_resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create alert summary view for dashboard
CREATE OR REPLACE VIEW system_alerts_summary AS
SELECT 
    t.id as tenant_id,
    t.business_name,
    t.business_domain,
    COUNT(sa.*) as total_alerts,
    COUNT(sa.*) FILTER (WHERE sa.status = 'active') as active_alerts,
    COUNT(sa.*) FILTER (WHERE sa.severity_level = 'critical') as critical_alerts,
    COUNT(sa.*) FILTER (WHERE sa.severity_level = 'high') as high_alerts,
    COUNT(sa.*) FILTER (WHERE sa.severity_level = 'medium') as medium_alerts,
    COUNT(sa.*) FILTER (WHERE sa.severity_level = 'low') as low_alerts,
    COUNT(sa.*) FILTER (WHERE sa.alert_type = 'intent_cascade_failure') as intent_cascade_alerts,
    MAX(sa.created_at) as last_alert_at,
    MAX(sa.created_at) FILTER (WHERE sa.severity_level IN ('critical', 'high')) as last_critical_alert_at,
    AVG(EXTRACT(EPOCH FROM (sa.resolved_at - sa.created_at)) / 3600.0) FILTER (WHERE sa.status = 'resolved') as avg_resolution_time_hours
FROM tenants t
LEFT JOIN system_alerts sa ON t.id = sa.tenant_id AND sa.created_at >= (now() - INTERVAL '30 days')
GROUP BY t.id, t.business_name, t.business_domain;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON system_alerts TO authenticated;
GRANT SELECT ON system_alerts_summary TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_system_alert(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_system_alert(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_alerts_for_tenant(UUID, severity_level, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_alert_stats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_resolve_old_alerts(INTEGER) TO authenticated;

-- Insert alert management settings
INSERT INTO app_settings (key, value, description, created_at) 
VALUES 
    ('alert_auto_resolve_days', '30', 'Days after which low severity alerts are auto-resolved', now()),
    ('alert_critical_notification_enabled', 'true', 'Enable notifications for critical alerts', now()),
    ('alert_cascade_monitoring_enabled', 'true', 'Enable intent cascade failure monitoring', now()),
    ('alert_max_active_per_tenant', '100', 'Maximum active alerts per tenant', now()),
    ('alert_cleanup_enabled', 'true', 'Enable automatic alert cleanup', now())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = now();

-- Create scheduled job example for auto-cleanup (commented out - requires pg_cron extension)
-- SELECT cron.schedule('auto-resolve-old-alerts', '0 2 * * *', 'SELECT auto_resolve_old_alerts(30);');

-- Comments for documentation
COMMENT ON TABLE system_alerts IS 'System alerts table for tracking various system issues including intent cascade failures';
COMMENT ON TYPE alert_type IS 'Types of system alerts that can be generated';
COMMENT ON TYPE severity_level IS 'Severity levels for system alerts (low, medium, high, critical)';
COMMENT ON TYPE alert_status IS 'Status of system alerts (active, acknowledged, resolved, dismissed)';
COMMENT ON FUNCTION resolve_system_alert(UUID, TEXT, TEXT) IS 'Resolves an active system alert with resolution details';
COMMENT ON FUNCTION get_active_alerts_for_tenant(UUID, severity_level, INTEGER) IS 'Gets active alerts for a tenant with optional severity filtering';
COMMENT ON FUNCTION get_tenant_alert_stats(UUID, INTEGER) IS 'Gets comprehensive alert statistics for a tenant over a specified period';
COMMENT ON FUNCTION auto_resolve_old_alerts(INTEGER) IS 'Auto-resolves old low-severity alerts for cleanup purposes';