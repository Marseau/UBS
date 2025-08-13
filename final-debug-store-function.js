require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalDebugStoreFunction() {
  try {
    console.log('🔍 FINAL DEBUG: Testing store_tenant_metric function step by step\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    if (!tenants || tenants.length === 0) {
      console.log('❌ No tenants found');
      return;
    }
    
    const tenant = tenants[0];
    console.log(`Testing with tenant: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Test 1: Check if store_tenant_metric function exists
    console.log('🔍 Test 1: Checking if store_tenant_metric function exists...');
    try {
      const { data: functions, error: funcError } = await client
        .from('pg_proc')
        .select('proname')
        .eq('proname', 'store_tenant_metric');
        
      if (funcError) {
        console.log('⚠️ Could not query pg_proc:', funcError);
      } else if (functions && functions.length > 0) {
        console.log('✅ store_tenant_metric function exists');
      } else {
        console.log('❌ store_tenant_metric function NOT found!');
        console.log('This explains why all calls fail silently!');
        return;
      }
    } catch (err) {
      console.log('⚠️ Could not check function existence:', err.message);
    }
    
    // Test 2: Simple direct call
    console.log('\n🔍 Test 2: Simple direct store_tenant_metric call...');
    try {
      const simpleData = {
        test: 'simple',
        value: 123,
        tenant_id: tenant.id.substring(0, 8)
      };
      
      const { data: result, error } = await client.rpc('store_tenant_metric', {
        p_tenant_id: tenant.id,
        p_metric_type: 'test_simple',
        p_metric_data: simpleData,
        p_period: '7d'
      });
      
      if (error) {
        console.log('❌ Direct call error:', error);
        console.log('Error code:', error.code);
        console.log('Error message:', error.message);
        console.log('Error details:', error.details);
        console.log('Error hint:', error.hint);
      } else {
        console.log('✅ Direct call succeeded, result:', result);
        
        // Check if record was stored
        const { count } = await client
          .from('tenant_metrics')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);
        
        console.log(`Records stored: ${count}`);
      }
    } catch (err) {
      console.log('❌ Direct call exception:', err.message);
    }
    
    // Test 3: Check table structure
    console.log('\n🔍 Test 3: Checking tenant_metrics table structure...');
    try {
      const { data: tableInfo, error: tableError } = await client
        .from('tenant_metrics')
        .select('*')
        .limit(1);
        
      if (tableError) {
        console.log('❌ Table access error:', tableError);
      } else {
        console.log('✅ tenant_metrics table accessible');
      }
    } catch (err) {
      console.log('❌ Table access exception:', err.message);
    }
    
    // Test 4: Try direct INSERT
    console.log('\n🔍 Test 4: Direct INSERT into tenant_metrics...');
    try {
      const directInsert = {
        tenant_id: tenant.id,
        metric_type: 'test_direct',
        metric_data: { test: 'direct_insert', value: 456 },
        period: '7d',
        created_at: new Date().toISOString()
      };
      
      const { data: insertResult, error: insertError } = await client
        .from('tenant_metrics')
        .insert([directInsert])
        .select();
        
      if (insertError) {
        console.log('❌ Direct INSERT error:', insertError);
      } else {
        console.log('✅ Direct INSERT succeeded');
        console.log('Inserted record:', insertResult);
      }
    } catch (err) {
      console.log('❌ Direct INSERT exception:', err.message);
    }
    
    // Check final count
    console.log('\n📊 FINAL COUNT CHECK:');
    const { count: finalCount } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Total records in table: ${finalCount}`);
    
    if (finalCount === 0) {
      console.log('\n🚨 CRITICAL ISSUE IDENTIFIED:');
      console.log('Either:');
      console.log('1. store_tenant_metric function does not exist');
      console.log('2. store_tenant_metric function exists but has wrong signature');
      console.log('3. RLS policies prevent writes to tenant_metrics table');
      console.log('4. Table structure is incompatible');
      
      console.log('\n🔧 INVESTIGATION NEEDED:');
      console.log('1. Check if store_tenant_metric function exists in database');
      console.log('2. Check function signature/parameters');
      console.log('3. Check RLS policies on tenant_metrics table');
      console.log('4. Check table constraints and triggers');
    }
    
  } catch (error) {
    console.error('❌ Final debug error:', error.message);
  }
}

finalDebugStoreFunction();