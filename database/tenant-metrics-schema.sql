-- Tenant Metrics Pre-calculated Schema
-- This table stores pre-calculated metrics for tenant-platform dashboard
-- Updated by cron jobs for better performance

CREATE TABLE IF NOT EXISTS tenant_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'ranking', 'risk_assessment', 'participation', 'evolution'
    metric_data JSONB NOT NULL,
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d', '1y'
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_tenant_id ON tenant_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_type_period ON tenant_metrics(metric_type, period);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_calculated_at ON tenant_metrics(calculated_at);

-- Unique constraint to prevent duplicate metrics
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_metrics_unique ON tenant_metrics(tenant_id, metric_type, period);

-- RLS Policy for tenant isolation
ALTER TABLE tenant_metrics ENABLE ROW LEVEL SECURITY;

-- Policy for tenant admins (can only see their own metrics)
CREATE POLICY tenant_metrics_tenant_policy ON tenant_metrics
    FOR ALL
    TO authenticated
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for super admins (can see all metrics)
CREATE POLICY tenant_metrics_super_admin_policy ON tenant_metrics
    FOR ALL
    TO authenticated
    USING (current_setting('app.current_user_role') = 'super_admin');

-- Example metric data structures for reference:

-- RANKING METRIC
-- {
--   "position": 3,
--   "totalTenants": 45,
--   "category": "Top 10%",
--   "score": 85.5,
--   "metrics": {
--     "revenue": { "value": 15000, "rank": 2 },
--     "customers": { "value": 450, "rank": 5 },
--     "appointments": { "value": 320, "rank": 3 },
--     "growth": { "value": 12.5, "rank": 1 }
--   }
-- }

-- RISK ASSESSMENT METRIC
-- {
--   "score": 25,
--   "status": "Low Risk",
--   "level": "healthy",
--   "factors": {
--     "payment_history": { "score": 95, "status": "excellent" },
--     "usage_trend": { "score": 88, "status": "good" },
--     "customer_growth": { "score": 92, "status": "excellent" },
--     "support_tickets": { "score": 75, "status": "moderate" }
--   },
--   "recommendations": [
--     "Continue current growth strategy",
--     "Monitor support ticket resolution time"
--   ]
-- }

-- PARTICIPATION METRIC
-- {
--   "revenue": { "percentage": 18.5, "trend": "up" },
--   "customers": { "percentage": 22.3, "trend": "stable" },
--   "appointments": { "percentage": 19.8, "trend": "up" },
--   "aiInteractions": { "percentage": 25.1, "trend": "up" },
--   "marketShare": {
--     "current": 18.5,
--     "previousPeriod": 16.2,
--     "change": 2.3
--   }
-- }

-- EVOLUTION METRIC (MRR Evolution, Customer Growth, etc.)
-- {
--   "mrrEvolution": {
--     "labels": ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"],
--     "tenantData": [850, 920, 1050, 1180, 1250, 1350],
--     "platformData": [4500, 4800, 5200, 5600, 5900, 6200],
--     "participationPercentage": [18.9, 19.2, 20.2, 21.1, 21.2, 21.8]
--   },
--   "customerGrowth": {
--     "labels": ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"],
--     "tenantData": [320, 350, 380, 410, 445, 480],
--     "platformData": [1800, 1950, 2100, 2250, 2400, 2550],
--     "participationPercentage": [17.8, 17.9, 18.1, 18.2, 18.5, 18.8]
--   }
-- }

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_tenant_metrics_updated_at
    BEFORE UPDATE ON tenant_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_metrics_updated_at();

-- Function to clean old metrics (keep only latest 3 calculations per metric)
CREATE OR REPLACE FUNCTION clean_old_tenant_metrics()
RETURNS void AS $$
BEGIN
    DELETE FROM tenant_metrics
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY tenant_id, metric_type, period
                       ORDER BY calculated_at DESC
                   ) as rn
            FROM tenant_metrics
        ) ranked
        WHERE rn <= 3
    );
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE tenant_metrics IS 'Pre-calculated tenant metrics for dashboard performance';
COMMENT ON COLUMN tenant_metrics.metric_type IS 'Type of metric: ranking, risk_assessment, participation, evolution';
COMMENT ON COLUMN tenant_metrics.metric_data IS 'JSON data containing calculated metric values';
COMMENT ON COLUMN tenant_metrics.period IS 'Time period for calculation: 7d, 30d, 90d, 1y';
COMMENT ON COLUMN tenant_metrics.calculated_at IS 'When the metric was calculated by cron job';