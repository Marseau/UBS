require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testBothProcedures() {
  try {
    console.log('🔍 Testing BOTH procedures on failing tenants to find the exact difference...\n');
    
    const failingTenants = ['f34d8c94', 'fe2fa876'];
    
    for (const prefix of failingTenants) {
      console.log('='.repeat(60));
      console.log(`🏢 TESTING TENANT: ${prefix}`);
      console.log('='.repeat(60));
      
      // Get full tenant ID
      const { data: tenant } = await client
        .from('tenants')
        .select('id, business_name')
        .like('id', `${prefix}%`)
        .single();
      
      if (!tenant) {
        console.log(`❌ Tenant ${prefix} not found`);
        continue;
      }
      
      console.log(`Full ID: ${tenant.id}`);
      console.log(`Name: ${tenant.business_name}\n`);
      
      // Clear table first
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('🧹 Table cleared\n');
      
      // TEST 1: Debug version (that works)
      console.log('📝 TEST 1: Running DEBUG version (that works)...');
      const { data: debugResult, error: debugError } = await client.rpc('calculate_tenant_metrics_definitiva_total_debug', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      if (debugError) {
        console.log('❌ Debug error:', debugError);
        continue;
      }
      
      console.log('Debug result:', {
        success: debugResult.success,
        processed_tenants: debugResult.processed_tenants,
        total_metrics_created: debugResult.total_metrics_created,
        version: debugResult.version
      });
      
      // Check what DEBUG stored
      const { data: debugMetrics, count: debugCount } = await client
        .from('tenant_metrics')
        .select('period, metric_type, created_at', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order('period');
        
      console.log(`✅ DEBUG stored: ${debugCount} records`);
      if (debugMetrics) {
        debugMetrics.forEach(m => {
          console.log(`  - ${m.period} (${m.metric_type}) at ${new Date(m.created_at).toLocaleTimeString()}`);
        });
      }
      
      // Clear table for next test
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('\n🧹 Table cleared for next test\n');
      
      // TEST 2: Main v4.0 version (that fails)
      console.log('📝 TEST 2: Running MAIN v4.0 version (that fails)...');
      const { data: mainResult, error: mainError } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      if (mainError) {
        console.log('❌ Main error:', mainError);
        continue;
      }
      
      console.log('Main result:', {
        success: mainResult.success,
        processed_tenants: mainResult.processed_tenants,
        total_metrics_created: mainResult.total_metrics_created,
        version: mainResult.version
      });
      
      // Check what MAIN stored
      const { data: mainMetrics, count: mainCount } = await client
        .from('tenant_metrics')
        .select('period, metric_type, created_at', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order('period');
        
      console.log(`📊 MAIN stored: ${mainCount} records`);
      if (mainMetrics) {
        mainMetrics.forEach(m => {
          console.log(`  - ${m.period} (${m.metric_type}) at ${new Date(m.created_at).toLocaleTimeString()}`);
        });
      }
      
      // COMPARISON
      console.log('\n🔍 COMPARISON:');
      console.log(`Debug: ${debugCount} records | Main: ${mainCount} records`);
      
      if (debugCount !== mainCount) {
        console.log('❌ DIFFERENT COUNTS - This confirms the bug!');
        
        if (debugMetrics && mainMetrics) {
          const debugPeriods = debugMetrics.map(m => m.period).sort();
          const mainPeriods = mainMetrics.map(m => m.period).sort();
          
          console.log(`Debug periods: [${debugPeriods.join(', ')}]`);
          console.log(`Main periods:  [${mainPeriods.join(', ')}]`);
          
          const allPeriods = ['7d', '30d', '90d'];
          const missingFromMain = allPeriods.filter(p => !mainPeriods.includes(p));
          
          if (missingFromMain.length > 0) {
            console.log(`🎯 MAIN is missing: [${missingFromMain.join(', ')}]`);
          }
        }
      } else {
        console.log('✅ Same counts - this tenant actually works for both');
      }
      
      console.log('\n');
    }
    
  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

testBothProcedures();