const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixStoreFunction() {
  try {
    console.log('🔧 Fixing store_tenant_metric function conflicts...');
    
    // Clear the table first to test properly
    console.log('1️⃣ Clearing table for clean test...');
    const { count: deletedCount } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log(`✅ Cleared ${deletedCount || 0} records`);
    
    // Create a corrected store_tenant_metric function
    console.log('2️⃣ Creating corrected store_tenant_metric function...');
    
    const fixedStoreFunction = `
-- Drop existing store_tenant_metric functions
DROP FUNCTION IF EXISTS store_tenant_metric(uuid, character varying, jsonb, character varying);
DROP FUNCTION IF EXISTS store_tenant_metric(uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS store_tenant_metric;

-- Create single, definitive store_tenant_metric function
CREATE OR REPLACE FUNCTION store_tenant_metric(
    p_tenant_id uuid,
    p_metric_type text,
    p_metric_data jsonb,
    p_period text
) RETURNS void AS $$
BEGIN
    INSERT INTO tenant_metrics (
        tenant_id, 
        metric_type, 
        period, 
        metric_data,
        calculated_at,
        created_at,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_metric_type,
        p_period,
        p_metric_data,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (tenant_id, metric_type, period) 
    DO UPDATE SET
        metric_data = EXCLUDED.metric_data,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = CURRENT_TIMESTAMP;
        
    RAISE NOTICE 'Stored metric for tenant % type % period %', p_tenant_id, p_metric_type, p_period;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION store_tenant_metric(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION store_tenant_metric(uuid, text, jsonb, text) TO anon;
`;

    // Apply the fix - we'll need to do this through Supabase Dashboard
    console.log('📝 SQL to apply in Supabase Dashboard:');
    console.log('=====================================');
    console.log(fixedStoreFunction);
    console.log('=====================================');
    
    console.log('\n⚠️  NEXT STEPS:');
    console.log('1. Copy the SQL above');
    console.log('2. Open Supabase Dashboard → SQL Editor');
    console.log('3. Execute the SQL to fix the function conflict');
    console.log('4. Return here to test the fix');
    console.log('\nThis will resolve the store_tenant_metric overload conflict.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixStoreFunction();