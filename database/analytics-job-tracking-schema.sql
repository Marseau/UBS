-- Analytics Job Tracking Schema
-- Table to monitor analytics cron job executions

-- Job executions tracking table
CREATE TABLE IF NOT EXISTS analytics_job_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'warning')),
    duration_ms INTEGER NOT NULL,
    target_date DATE,
    error_message TEXT,
    metadata JSONB,
    executed_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_analytics_job_executions_job_date (job_name, executed_at),
    INDEX idx_analytics_job_executions_status (status, executed_at)
);

-- Function to get job execution summary
CREATE OR REPLACE FUNCTION get_job_execution_summary(
    p_job_name VARCHAR(100) DEFAULT NULL,
    p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
    job_name VARCHAR(100),
    total_executions BIGINT,
    successful_executions BIGINT,
    failed_executions BIGINT,
    average_duration_ms NUMERIC,
    last_execution TIMESTAMP,
    last_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        je.job_name,
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE je.status = 'success') as successful_executions,
        COUNT(*) FILTER (WHERE je.status = 'error') as failed_executions,
        ROUND(AVG(je.duration_ms), 2) as average_duration_ms,
        MAX(je.executed_at) as last_execution,
        (SELECT status FROM analytics_job_executions 
         WHERE job_name = je.job_name 
         ORDER BY executed_at DESC 
         LIMIT 1) as last_status
    FROM analytics_job_executions je
    WHERE 
        (p_job_name IS NULL OR je.job_name = p_job_name)
        AND je.executed_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
    GROUP BY je.job_name
    ORDER BY je.job_name;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old job execution records (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_job_executions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_job_executions 
    WHERE executed_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample query to check job health
/*
-- Get summary of all jobs in last 24 hours
SELECT * FROM get_job_execution_summary();

-- Get summary for specific job
SELECT * FROM get_job_execution_summary('daily_aggregation', 48);

-- Get recent failures
SELECT job_name, error_message, executed_at 
FROM analytics_job_executions 
WHERE status = 'error' 
AND executed_at >= NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC;
*/