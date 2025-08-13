require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDefinitivaFixed() {
  try {
    console.log('🔍 TESTING DEFINITIVA TOTAL FIXED (original working version)\n');
    
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
    const { count: cleared } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log(`Cleared ${cleared || 0} existing records\n`);
    
    // Test original DEFINITIVA TOTAL FIXED on single tenant
    console.log('🚀 Running DEFINITIVA TOTAL FIXED on single tenant...');
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ DEFINITIVA TOTAL FIXED error:', error);
      return;
    }
    
    console.log('📋 DEFINITIVA TOTAL FIXED result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results in table
    const { data: metrics, count: actualCount } = await client
      .from('tenant_metrics')
      .select('period', { count: 'exact' })
      .eq('tenant_id', tenant.id);
    
    console.log('📊 RESULTS VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${actualCount} metrics`);
    console.log(`Expected: 3 metrics (1 tenant × 3 periods)\n`);
    
    if (actualCount === 3) {
      console.log('🎉🎉🎉 SUCCESS! DEFINITIVA TOTAL FIXED WORKS! 🎉🎉🎉');
      console.log('✅ All 3 records stored correctly!');
      console.log('✅ This proves the original procedure works fine!');
      
      if (metrics) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`✅ Periods stored: [${periods.join(', ')}]`);
      }
      
      console.log('\n🔍 ANALYSIS:');
      console.log('- Original DEFINITIVA TOTAL FIXED: WORKS (3 records)');
      console.log('- v6.0/v7.0 procedures: FAIL (0 records)');
      console.log('- The issue is in the modifications made to the original procedure');
      
    } else {
      console.log('❌ DEFINITIVA TOTAL FIXED also fails!');
      console.log('This means there\'s a deeper system issue');
      
      if (metrics && metrics.length > 0) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`Periods found: [${periods.join(', ')}]`);
      }
    }
    
    // Now test on ALL tenants to see the scale
    console.log('\n' + '='.repeat(60));
    console.log('🌍 TESTING DEFINITIVA TOTAL FIXED ON ALL TENANTS');
    console.log('='.repeat(60));
    
    // Clear table
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('🚀 Running DEFINITIVA TOTAL FIXED on ALL tenants...');
    const allStartTime = Date.now();
    
    const { data: allResult, error: allError } = await client.rpc('calculate_tenant_metrics_definitiva_total', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const allDuration = Date.now() - allStartTime;
    
    if (allError) {
      console.log('❌ ALL tenants error:', allError);
      return;
    }
    
    console.log('📋 ALL tenants result:');
    console.log(JSON.stringify(allResult, null, 2));
    console.log(`Execution time: ${allDuration}ms\n`);
    
    // Check actual results
    const { data: allMetrics, count: allActualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period', { count: 'exact' });
    
    console.log('📊 ALL TENANTS VERIFICATION:');
    console.log(`Procedure reports: ${allResult.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${allActualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants × 3 periods)\n`);
    
    if (allActualCount === 30) {
      console.log('🎉🎉🎉 DEFINITIVA TOTAL FIXED WORKS FOR ALL TENANTS! 🎉🎉🎉');
      console.log('✅ This is the procedure that should be used in the cronjob system!');
    } else {
      console.log(`❌ Missing ${30 - allActualCount} records in ALL tenants test`);
      
      // Analyze missing
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      const tenants_found = new Set();
      
      allMetrics.forEach(m => {
        periods[m.period]++;
        tenants_found.add(m.tenant_id);
      });
      
      console.log('Period distribution:', periods);
      console.log(`Unique tenants: ${tenants_found.size}`);
      
      if (periods['30d'] < tenants_found.size) {
        console.log(`⚠️ Still missing ${tenants_found.size - periods['30d']} tenants with 30d period`);
        console.log('Same issue exists in the original DEFINITIVA TOTAL FIXED procedure');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testDefinitivaFixed();