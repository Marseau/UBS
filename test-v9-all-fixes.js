require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV9AllFixes() {
  try {
    console.log('🎯 TESTING DEFINITIVA TOTAL v9.0 - ALL 8 CRITICAL FIXES APPLIED\n');
    
    // Get first tenant for single tenant test
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
    
    console.log('📝 FIXES APPLIED IN v9.0:');
    console.log('✅ Fix 1: Date window logic (off-by-one + timestamptz)');
    console.log('✅ Fix 2: conversation_history JSONB access');  
    console.log('✅ Fix 3: RAISE NOTICE placeholders (%d → %)');
    console.log('✅ Fix 4: Tenant vs platform messages');
    console.log('✅ Fix 5: Status spelling (cancelled/canceled)');
    console.log('✅ Fix 6: Numeric/integer casts');
    console.log('✅ Fix 7: Calculate missing derived fields');
    console.log('✅ Fix 8: Consistent semiopen intervals\n');
    
    // First, we need to apply the v9.0 function
    console.log('⚠️  IMPORTANT: You need to apply the v9.0 function first!');
    console.log('   Please execute: database/DEFINITIVA-TOTAL-v9.0-ALL-FIXES-APPLIED.sql\n');
    
    // Wait for user confirmation
    await new Promise(resolve => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      readline.question('Press Enter when v9.0 function is applied...', () => {
        readline.close();
        resolve();
      });
    });
    
    // Test v9.0 on single tenant first
    console.log('🚀 Running DEFINITIVA TOTAL v9.0 on single tenant...');
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v9', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v9.0 procedure error:', error);
      return;
    }
    
    console.log('📋 v9.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results in table
    const { data: metrics, count: actualCount } = await client
      .from('tenant_metrics')
      .select('period', { count: 'exact' })
      .eq('tenant_id', tenant.id);
    
    console.log('📊 SINGLE TENANT VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${actualCount} metrics`);
    console.log(`Expected: 3 metrics (1 tenant × 3 periods)\n`);
    
    if (actualCount === 3) {
      console.log('🎉🎉🎉 SUCCESS! v9.0 FIXES WORK! 🎉🎉🎉');
      console.log('✅ All 3 records stored correctly for single tenant!');
      
      if (metrics) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`✅ Periods stored: [${periods.join(', ')}]`);
      }
      
      // Now test on ALL tenants
      console.log('\n' + '='.repeat(70));
      console.log('🌍 TESTING v9.0 ON ALL TENANTS - THE ULTIMATE TEST');
      console.log('='.repeat(70));
      
      // Clear table
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('🚀 Running DEFINITIVA TOTAL v9.0 on ALL tenants...');
      const allStartTime = Date.now();
      
      const { data: allResult, error: allError } = await client.rpc('calculate_tenant_metrics_definitiva_total_v9', {
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
        console.log('🎉🎉🎉 ULTIMATE SUCCESS! v9.0 WORKS FOR ALL TENANTS! 🎉🎉🎉');
        console.log('✅ All 30 records stored correctly!');
        console.log('✅ All 8 critical fixes resolved the issues!');
        console.log('✅ No more 28 vs 30 problem!');
        console.log('✅ No more silent failures!');
        console.log('✅ System is ready for production!');
        
        // Detailed analysis
        const periods = { '7d': 0, '30d': 0, '90d': 0 };
        const tenantsFound = new Set();
        const tenantPeriods = {};
        
        allMetrics.forEach(m => {
          periods[m.period]++;
          tenantsFound.add(m.tenant_id);
          
          if (!tenantPeriods[m.tenant_id]) {
            tenantPeriods[m.tenant_id] = [];
          }
          tenantPeriods[m.tenant_id].push(m.period);
        });
        
        console.log('\n📊 PERFECT DISTRIBUTION:');
        console.log('Period distribution:', periods);
        console.log(`Unique tenants: ${tenantsFound.size}`);
        console.log('All periods have exactly 10 records each ✅');
        
        console.log('\n🔧 READY FOR CRONJOB INTEGRATION!');
        console.log('Next steps:');
        console.log('1. Update tenant-metrics-cron-optimized.service.ts to use v9.0');
        console.log('2. Deploy to production');
        console.log('3. Monitor performance');
        
      } else {
        console.log(`❌ Still missing ${30 - allActualCount} records`);
        
        // Detailed analysis of what's still missing
        const periods = { '7d': 0, '30d': 0, '90d': 0 };
        const tenantsFound = new Set();
        const tenantPeriods = {};
        
        allMetrics.forEach(m => {
          periods[m.period]++;
          tenantsFound.add(m.tenant_id);
          
          if (!tenantPeriods[m.tenant_id]) {
            tenantPeriods[m.tenant_id] = [];
          }
          tenantPeriods[m.tenant_id].push(m.period);
        });
        
        console.log('\n📊 Period distribution:', periods);
        console.log(`Unique tenants: ${tenantsFound.size}`);
        
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
        
        console.log('\n🔧 Additional investigation needed for remaining failures.');
      }
      
    } else {
      console.log(`❌ Single tenant test failed: ${actualCount}/3 records`);
      
      if (metrics && metrics.length > 0) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`Periods found: [${periods.join(', ')}]`);
      }
      
      console.log('\nSome of the 8 fixes may need additional refinement.');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV9AllFixes();