require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV7Final() {
  try {
    console.log('🚀 TESTING DEFINITIVA TOTAL v7.0 NESTED EXCEPTION - FINAL TEST\n');
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    const { count: cleared } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log(`Cleared ${cleared || 0} existing records\n`);
    
    // Test v7.0 on ALL tenants
    console.log('🚀 Running DEFINITIVA TOTAL v7.0 on ALL tenants...');
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v7', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v7.0 procedure error:', error);
      return;
    }
    
    console.log('📋 v7.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results in table
    const { data: metrics, count: actualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period', { count: 'exact' });
    
    console.log('📊 FINAL VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${actualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants × 3 periods)\n`);
    
    if (actualCount === 30) {
      console.log('🎉🎉🎉 SUCCESS! BUG FINALLY FIXED! 🎉🎉🎉');
      console.log('✅ All 30 records stored correctly!');
      console.log('✅ v7.0 NESTED EXCEPTION pattern worked!');
      console.log('✅ No more 28 vs 30 issue!');
    } else {
      console.log('❌ Issue still persists. Analyzing...');
      
      // Detailed analysis
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      const tenants = new Set();
      const tenantPeriods = {};
      
      metrics.forEach(m => {
        periods[m.period]++;
        tenants.add(m.tenant_id);
        
        if (!tenantPeriods[m.tenant_id]) {
          tenantPeriods[m.tenant_id] = [];
        }
        tenantPeriods[m.tenant_id].push(m.period);
      });
      
      console.log('\n📊 Period distribution:', periods);
      console.log(`Unique tenants: ${tenants.size}`);
      
      if (periods['30d'] < tenants.size) {
        console.log(`⚠️ Still missing ${tenants.size - periods['30d']} tenants with 30d period`);
        
        // Find which tenants are still missing 30d
        console.log('\n🔍 Analysis by tenant:');
        Object.keys(tenantPeriods).forEach(tenantId => {
          const tenantPeriodsArray = tenantPeriods[tenantId].sort();
          const prefix = tenantId.substring(0, 8);
          const status = tenantPeriodsArray.length === 3 ? '✅' : '❌';
          
          console.log(`${status} ${prefix}: [${tenantPeriodsArray.join(', ')}] (${tenantPeriodsArray.length}/3)`);
          
          if (tenantPeriodsArray.length < 3) {
            const missing = ['7d', '30d', '90d'].filter(p => !tenantPeriodsArray.includes(p));
            console.log(`     Missing: [${missing.join(', ')}]`);
          }
        });
      }
    }
    
    // Test specifically on the problem tenants
    console.log('\n' + '='.repeat(60));
    console.log('🔍 TESTING PROBLEM TENANTS INDIVIDUALLY');
    console.log('='.repeat(60));
    
    const problemTenants = [
      { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico Equilíbrio' },
      { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' }
    ];
    
    for (const tenant of problemTenants) {
      console.log(`\n🏥 Testing ${tenant.name} (${tenant.id.substring(0, 8)}) individually...`);
      
      // Clear table
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Test v7.0 on this specific tenant
      const { data: tenantResult } = await client.rpc('calculate_tenant_metrics_definitiva_total_v7', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      console.log(`Tenant result:`, tenantResult);
      
      // Check what was stored
      const { data: tenantMetrics, count: tenantCount } = await client
        .from('tenant_metrics')
        .select('period', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`Records stored: ${tenantCount}`);
      if (tenantMetrics) {
        const periods = tenantMetrics.map(m => m.period).sort();
        console.log(`Periods: [${periods.join(', ')}]`);
        
        if (tenantCount === 3) {
          console.log('✅ v7.0 WORKS for this tenant!');
        } else {
          console.log('❌ v7.0 still fails for this tenant');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV7Final();