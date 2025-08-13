require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateStoreFunctionChanges() {
  try {
    console.log('🔍 INVESTIGATING: What changed in store_tenant_metric function\n');
    
    // Test 1: Check if function exists and what signature it has
    console.log('📋 Test 1: Checking store_tenant_metric function...');
    
    try {
      // Try calling with different parameter combinations to see what works
      const { data: tenants } = await client
        .from('tenants')
        .select('id')
        .eq('status', 'active')
        .limit(1);
      
      const tenant = tenants[0];
      
      console.log('Testing different store_tenant_metric signatures...\n');
      
      // Clear table first
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Try signature 1: (tenant_id, metric_type, metric_data, period)
      console.log('🧪 Signature 1: store_tenant_metric(tenant_id, metric_type, metric_data, period)');
      try {
        const { data: result1, error: error1 } = await client.rpc('store_tenant_metric', {
          p_tenant_id: tenant.id,
          p_metric_type: 'test_sig1', 
          p_metric_data: { test: 'signature1' },
          p_period: '7d'
        });
        
        if (error1) {
          console.log('❌ Signature 1 error:', error1.message);
        } else {
          console.log('✅ Signature 1 works!');
        }
      } catch (err) {
        console.log('❌ Signature 1 exception:', err.message);
      }
      
      // Check if record was stored
      const { count: count1 } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true });
      console.log(`Records after signature 1 test: ${count1}\n`);
      
      // Try signature 2: Different parameter names
      console.log('🧪 Signature 2: store_tenant_metric(tenant_id, metric_type, payload, period)');
      try {
        const { data: result2, error: error2 } = await client.rpc('store_tenant_metric', {
          tenant_id: tenant.id,
          metric_type: 'test_sig2',
          payload: { test: 'signature2' },
          period: '30d'
        });
        
        if (error2) {
          console.log('❌ Signature 2 error:', error2.message);
        } else {
          console.log('✅ Signature 2 works!');
        }
      } catch (err) {
        console.log('❌ Signature 2 exception:', err.message);
      }
      
      // Check if record was stored
      const { count: count2 } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true });
      console.log(`Records after signature 2 test: ${count2}\n`);
      
      // Try signature 3: Without prefixes
      console.log('🧪 Signature 3: store_tenant_metric without p_ prefixes');
      try {
        const { data: result3, error: error3 } = await client.rpc('store_tenant_metric', {
          tenant_id: tenant.id,
          metric_type: 'test_sig3',
          metric_data: { test: 'signature3' },
          period: '90d'
        });
        
        if (error3) {
          console.log('❌ Signature 3 error:', error3.message);
        } else {
          console.log('✅ Signature 3 works!');
        }
      } catch (err) {
        console.log('❌ Signature 3 exception:', err.message);
      }
      
      // Check final count
      const { count: finalCount } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true });
      console.log(`Final records count: ${finalCount}\n`);
      
      // Test 2: Check what we can actually insert directly
      console.log('📋 Test 2: Direct table insert test...');
      try {
        const directInsert = {
          tenant_id: tenant.id,
          metric_type: 'test_direct',
          metric_data: { test: 'direct_insert', timestamp: new Date().toISOString() },
          period: '7d'
        };
        
        const { data: insertResult, error: insertError } = await client
          .from('tenant_metrics')
          .insert([directInsert])
          .select();
          
        if (insertError) {
          console.log('❌ Direct INSERT error:', insertError.message);
          console.log('Error details:', insertError.details);
          console.log('Error hint:', insertError.hint);
        } else {
          console.log('✅ Direct INSERT works!');
          console.log('Inserted:', insertResult[0]);
        }
      } catch (err) {
        console.log('❌ Direct INSERT exception:', err.message);
      }
      
      // Final count check
      const { count: absoluteFinalCount } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true });
      console.log(`\n📊 FINAL ANALYSIS: ${absoluteFinalCount} records in tenant_metrics table`);
      
      if (absoluteFinalCount === 0) {
        console.log('\n🚨 CRITICAL ISSUE: Neither store_tenant_metric function NOR direct INSERT works');
        console.log('This suggests:');
        console.log('1. RLS policies blocking all writes');
        console.log('2. Table constraints preventing inserts');  
        console.log('3. Permissions issue with service role');
        console.log('4. Table structure mismatch');
      } else {
        console.log(`\n✅ Some inserts work (${absoluteFinalCount} records stored)`);
        console.log('The issue is likely with store_tenant_metric function signature/implementation');
      }
      
    } catch (error) {
      console.log('❌ Investigation error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error.message);
  }
}

investigateStoreFunctionChanges();