require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV10NoException() {
  try {
    console.log('🎯 TESTING DEFINITIVA TOTAL v10.0 - NO EXCEPTION HANDLING\n');
    console.log('This will show us the REAL PostgreSQL errors that were being hidden!\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    const tenant = tenants[0];
    console.log(`Testing with: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('🚀 Running DEFINITIVA TOTAL v10.0 (no exception handling)...\n');
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v10', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    if (error) {
      console.log('🎯🎯🎯 CAUGHT THE REAL ERROR! 🎯🎯🎯');
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('Error details:', error.details);
      console.log('Error hint:', error.hint);
      console.log('\n🔍 This is the EXACT error that was being silently caught by exception handlers!');
      
      // Analyze the error
      if (error.message.includes('store_tenant_metric')) {
        console.log('\n🔧 DIAGNOSIS: store_tenant_metric function signature or call is wrong');
      } else if (error.message.includes('does not exist')) {
        console.log('\n🔧 DIAGNOSIS: Missing function or table');  
      } else if (error.message.includes('permission')) {
        console.log('\n🔧 DIAGNOSIS: Permission/RLS policy issue');
      } else if (error.message.includes('format')) {
        console.log('\n🔧 DIAGNOSIS: RAISE NOTICE format issue');
      } else {
        console.log('\n🔧 DIAGNOSIS: Unknown error - needs investigation');
      }
      
    } else {
      console.log('✅ v10.0 result:', result);
      
      // Check if record was stored
      const { count } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      console.log(`Records stored: ${count}`);
      
      if (count === 1) {
        console.log('🎉🎉🎉 SUCCESS! v10.0 WORKS! 🎉🎉🎉');
        console.log('✅ The issue was the exception handling masking errors!');
        console.log('✅ Now we can create a working version without exception handling!');
      } else {
        console.log('❌ Still no records stored despite no error reported');
        console.log('There might be a silent issue in store_tenant_metric function itself');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV10NoException();