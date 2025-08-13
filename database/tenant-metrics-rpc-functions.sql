-- RPC Functions for tenant metrics to avoid TypeScript issues

-- Function to get a tenant metric
CREATE OR REPLACE FUNCTION get_tenant_metric(
    p_tenant_id UUID,
    p_metric_type VARCHAR,
    p_period VARCHAR
) RETURNS TABLE (
    metric_data JSONB,
    calculated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT tm.metric_data, tm.calculated_at
    FROM tenant_metrics tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.metric_type = p_metric_type
      AND tm.period = p_period
    ORDER BY tm.calculated_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to store a tenant metric
CREATE OR REPLACE FUNCTION store_tenant_metric(
    p_tenant_id UUID,
    p_metric_type VARCHAR,
    p_metric_data JSONB,
    p_period VARCHAR
) RETURNS void AS $$
BEGIN
    INSERT INTO tenant_metrics (tenant_id, metric_type, metric_data, period, calculated_at)
    VALUES (p_tenant_id, p_metric_type, p_metric_data, p_period, NOW())
    ON CONFLICT (tenant_id, metric_type, period)
    DO UPDATE SET 
        metric_data = EXCLUDED.metric_data,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get metrics calculation status
CREATE OR REPLACE FUNCTION get_metrics_calculation_status()
RETURNS TABLE (
    metric_type VARCHAR,
    calculated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.metric_type,
        MAX(tm.calculated_at) as calculated_at
    FROM tenant_metrics tm
    GROUP BY tm.metric_type
    ORDER BY calculated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_tenant_metric(UUID, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION store_tenant_metric(UUID, VARCHAR, JSONB, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_metrics_calculation_status() TO authenticated;