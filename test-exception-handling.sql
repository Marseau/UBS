-- Test procedure with proper exception handling
DROP FUNCTION IF EXISTS test_store_with_exception_handling();

CREATE OR REPLACE FUNCTION test_store_with_exception_handling()
RETURNS json AS $$
DECLARE
    v_test_tenant_id uuid := 'f34d8c94-5e5f-4f8e-8b4a-1b2c3d4e5f6g';
    v_result json;
BEGIN
    RAISE NOTICE '🧪 Testing exception handling around store_tenant_metric...';
    
    -- Test the exact pattern that was failing
    BEGIN
        PERFORM store_tenant_metric(
            v_test_tenant_id,
            'test_comprehensive',
            jsonb_build_object(
                'test_data', 'simple_test',
                'value', 123
            ),
            '30d'
        );
        
        RAISE NOTICE '✅ store_tenant_metric succeeded';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '❌ store_tenant_metric failed: % - %', SQLSTATE, SQLERRM;
        
        -- Try simplified version
        BEGIN
            PERFORM store_tenant_metric(
                v_test_tenant_id,
                'test_fallback',
                jsonb_build_object('simple', true),
                '30d'
            );
            
            RAISE NOTICE '⚡ Fallback succeeded';
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '❌ Even fallback failed: % - %', SQLSTATE, SQLERRM;
        END;
    END;
    
    RETURN json_build_object('test', 'completed');
    
END;
$$ LANGUAGE plpgsql;

-- Test it
SELECT test_store_with_exception_handling();