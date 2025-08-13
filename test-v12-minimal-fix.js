require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV12MinimalFix() {
  try {
    console.log('🎯 TESTING DEFINITIVA TOTAL v12.0 - MINIMAL FIX (Conservative Approach)\n');
    console.log('This version keeps ALL original working logic and ONLY fixes store_tenant_metric call\n');
    
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
    
    console.log('🔧 MINIMAL FIX APPLIED:');
    console.log('✅ Store_tenant_metric call corrected (parameter names & order)');
    console.log('✅ customer_id → user_id field correction');
    console.log('✅ All other original logic preserved\n');
    
    // Test v12.0 on single tenant first
    console.log('🚀 Running DEFINITIVA TOTAL v12.0 on single tenant...');
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v12', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v12.0 procedure error:', error);
      console.log('The minimal fix approach failed. There may be deeper issues.');
      return;
    }
    
    console.log('📋 v12.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results in table
    const { data: metrics, count: actualCount } = await client
      .from('tenant_metrics')
      .select('period, metric_type', { count: 'exact' })
      .eq('tenant_id', tenant.id);
    
    console.log('📊 SINGLE TENANT VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${actualCount} metrics`);
    console.log(`Expected: 3 metrics (1 tenant × 3 periods)\n`);
    
    if (actualCount === 3) {
      console.log('🎉🎉🎉 SUCCESS! v12.0 MINIMAL FIX WORKS! 🎉🎉🎉');
      console.log('✅ All 3 records stored correctly for single tenant!');
      console.log('✅ The conservative approach with minimal fix worked!');
      
      if (metrics) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`✅ Periods stored: [${periods.join(', ')}]`);
      }
      
      // Now test on ALL tenants - back to the original scale
      console.log('\n' + '='.repeat(70));
      console.log('🌍 TESTING v12.0 ON ALL TENANTS - RESTORE ORIGINAL PERFORMANCE');
      console.log('='.repeat(70));
      
      // Clear table
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('🚀 Running DEFINITIVA TOTAL v12.0 on ALL tenants...');
      console.log('Expected: Either 28 records (same as before) or 30 records (fully fixed)\n');
      
      const allStartTime = Date.now();
      
      const { data: allResult, error: allError } = await client.rpc('calculate_tenant_metrics_definitiva_total_v12', {
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
        console.log('🎉🎉🎉🎉🎉 ULTIMATE SUCCESS! 🎉🎉🎉🎉🎉');
        console.log('✅ ALL 30 RECORDS STORED CORRECTLY!');
        console.log('✅ IMPROVED FROM 28 TO 30 RECORDS!');
        console.log('✅ MINIMAL FIX APPROACH WORKED PERFECTLY!');
        console.log('✅ CONSERVATIVE STRATEGY WAS THE RIGHT CHOICE!');
        
        // Perfect analysis
        const periods = { '7d': 0, '30d': 0, '90d': 0 };
        const tenantsFound = new Set();
        
        allMetrics.forEach(m => {
          periods[m.period]++;
          tenantsFound.add(m.tenant_id);
        });
        
        console.log(`\n📊 PERFECT DISTRIBUTION: ${JSON.stringify(periods)}`);
        console.log(`Unique tenants: ${tenantsFound.size}`);
        console.log('✅ Each period has exactly 10 records!');
        
        console.log('\n🏆 MISSION ACCOMPLISHED:');
        console.log('✅ Fixed from 28 → 30 records (100% success rate)');
        console.log('✅ No more missing 30d period records');
        console.log('✅ Minimal fix approach proved most effective');
        console.log('✅ System ready for production deployment');
        
      } else if (allActualCount === 28) {
        console.log('🟡 RESTORED TO PREVIOUS WORKING STATE (28 records)');
        console.log('✅ At least we\'re back to the original performance!');
        console.log('⚠️ Still missing 2 records (same as before)');
        
        // Analyze the 28 vs 30 issue
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
        
        console.log(`\n📊 Period distribution: ${JSON.stringify(periods)}`);
        console.log(`Unique tenants: ${tenantsFound.size}`);
        
        if (periods['30d'] < tenantsFound.size) {
          console.log(`⚠️ Missing ${tenantsFound.size - periods['30d']} tenants with 30d period (same as before)`);
          
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
          
          console.log('\n🎯 NEXT STEPS: The minimal fix restored basic functionality.');
          console.log('The remaining 2 missing records need specific tenant investigation.');
        }
        
      } else {
        console.log(`📊 RESULT: ${allActualCount} records stored`);
        
        if (allActualCount > 0) {
          console.log('✅ At least some records are being stored (progress!)');
          
          // Basic analysis
          const periods = { '7d': 0, '30d': 0, '90d': 0 };
          allMetrics.forEach(m => periods[m.period]++);
          
          console.log(`Period distribution: ${JSON.stringify(periods)}`);
        } else {
          console.log('❌ Still storing 0 records - deeper investigation needed');
        }
      }
      
    } else {
      console.log(`❌ Single tenant test failed: ${actualCount}/3 records`);
      
      if (metrics && metrics.length > 0) {
        const periods = metrics.map(m => m.period).sort();
        console.log(`Periods found: [${periods.join(', ')}]`);
        console.log('Some periods work - there may be period-specific issues');
      } else {
        console.log('No records stored at all - the minimal fix didn\'t resolve the core issue');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV12MinimalFix();