
-- Prevention measures for timezone issues
-- Add this to your schema management

-- Function to ensure UTC dates
CREATE OR REPLACE FUNCTION ensure_utc_date(input_date TIMESTAMP WITH TIME ZONE)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
AS $$
BEGIN
    -- Convert to UTC and return
    RETURN input_date AT TIME ZONE 'UTC';
END;
$$;

-- Trigger to automatically convert dates to UTC
CREATE OR REPLACE FUNCTION platform_metrics_ensure_utc()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Ensure calculation_date is in UTC
    IF NEW.calculation_date IS NOT NULL THEN
        NEW.calculation_date = ensure_utc_date(NEW.calculation_date);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trigger_platform_metrics_ensure_utc ON platform_metrics;
CREATE TRIGGER trigger_platform_metrics_ensure_utc
    BEFORE INSERT OR UPDATE ON platform_metrics
    FOR EACH ROW
    EXECUTE FUNCTION platform_metrics_ensure_utc();

-- Add comment
COMMENT ON COLUMN platform_metrics.calculation_date IS 'Must be in UTC ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)';
