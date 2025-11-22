-- Migration: Create execute_sql function for dashboard queries
-- Purpose: Allow execution of custom SQL queries from the Hashtag Intelligence Dashboard
-- Security: This function requires service role key and should only be called from backend

-- Drop function if exists
DROP FUNCTION IF EXISTS execute_sql(text);

-- Create function to execute dynamic SQL
CREATE OR REPLACE FUNCTION execute_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Execute the query and return results as JSONB
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;

    -- Return empty array if no results
    IF result IS NULL THEN
        result := '[]'::jsonb;
    END IF;

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- Return error as JSONB
        RETURN jsonb_build_object(
            'error', SQLERRM,
            'state', SQLSTATE,
            'query', query_text
        );
END;
$$;

-- Grant execute permission to authenticated users (service role only in practice)
GRANT EXECUTE ON FUNCTION execute_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_sql(text) TO service_role;

-- Add comment
COMMENT ON FUNCTION execute_sql(text) IS 'Execute dynamic SQL queries and return results as JSONB. Should only be called from backend with service role key.';
