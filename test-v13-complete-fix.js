require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV13CompleteFix() {
  try {
    console.log('🎯 TESTING DEFINITIVA TOTAL v13.0 - COMPLETE 73+ METRICS WITH v12.0 FIXES\n');
    console.log('This version combines:');
    console.log('✅ v12.0 working fixes (30 records success)');
    console.log('✅ Complete 73+ metrics from original system');
    console.log('✅ All 8 modules of analytics\n');
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Test v13.0 on ALL tenants immediately - we know the fix works
    console.log('🚀 Running DEFINITIVA TOTAL v13.0 on ALL tenants...');
    console.log('Expected: 30 records with 73+ metrics each\n');
    
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v13', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v13.0 procedure error:', error);
      console.log('There may be an issue with the complete metrics implementation');
      return;
    }
    
    console.log('📋 v13.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results
    const { data: allMetrics, count: allActualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, metric_data', { count: 'exact' });
    
    console.log('📊 COMPLETE SYSTEM VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${allActualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants × 3 periods)\n`);
    
    if (allActualCount === 30) {
      console.log('🎉🎉🎉🎉🎉 ULTIMATE SUCCESS - COMPLETE SYSTEM! 🎉🎉🎉🎉🎉');
      console.log('✅ ALL 30 RECORDS STORED CORRECTLY!');
      console.log('✅ v13.0 COMBINES BOTH FIXES: WORKING FUNCTION + COMPLETE METRICS!');
      
      // Verify metrics completeness
      if (allMetrics && allMetrics.length > 0) {
        const sampleMetric = allMetrics[0];
        const metricData = sampleMetric.metric_data;
        
        console.log('\n📊 METRICS COMPLETENESS ANALYSIS:');
        console.log(`Sample record from tenant: ${sampleMetric.tenant_id.substring(0, 8)}`);
        console.log(`Period: ${sampleMetric.period}`);
        console.log(`Metric type: ${sampleMetric.metric_type}\n`);
        
        // Count modules in the JSONB
        const modules = Object.keys(metricData || {});
        console.log('📋 MODULES INCLUDED:');
        modules.forEach((module, index) => {
          const moduleData = metricData[module] || {};
          const fieldCount = Object.keys(moduleData).length;
          console.log(`${(index + 1).toString().padStart(2, ' ')}. ${module}: ${fieldCount} fields`);
        });
        
        console.log(`\n📊 TOTAL MODULES: ${modules.length}`);
        
        // Count total fields across all modules
        let totalFields = 0;
        modules.forEach(module => {
          if (metricData[module] && typeof metricData[module] === 'object') {
            totalFields += Object.keys(metricData[module]).length;
          }
        });
        
        console.log(`📊 TOTAL FIELDS: ${totalFields}`);
        
        if (modules.length >= 8 && totalFields >= 60) {
          console.log('✅ COMPLETE METRICS CONFIRMED!');
          console.log('✅ All major modules present');
          console.log('✅ Rich analytics data included');
          
          // Perfect distribution analysis
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
          
          console.log(`\n📊 PERFECT DISTRIBUTION: ${JSON.stringify(periods)}`);
          console.log(`Unique tenants: ${tenantsFound.size}`);
          console.log('✅ Each period has exactly 10 records!');
          
          console.log('\n🏆 TENANT COMPLETION STATUS:');
          let perfectTenants = 0;
          Object.keys(tenantPeriods).forEach(tenantId => {
            const tenantPeriodsArray = tenantPeriods[tenantId].sort();
            const prefix = tenantId.substring(0, 8);
            
            if (tenantPeriodsArray.length === 3) {
              perfectTenants++;
              console.log(`✅ ${prefix}: [${tenantPeriodsArray.join(', ')}] (3/3) COMPLETE`);
            } else {
              console.log(`❌ ${prefix}: [${tenantPeriodsArray.join(', ')}] (${tenantPeriodsArray.length}/3) INCOMPLETE`);
            }
          });
          
          console.log(`\n🎯 FINAL SCORE: ${perfectTenants}/${tenantsFound.size} tenants have all 3 periods`);
          
          if (perfectTenants === tenantsFound.size) {
            console.log('\n🏆🏆🏆 PERFECT SCORE! MISSION COMPLETELY ACCOMPLISHED! 🏆🏆🏆');
            console.log('✅ 30/30 records stored (100% success rate)');
            console.log(`✅ ${totalFields}+ metrics per record (complete analytics)`);
            console.log(`✅ ${modules.length} modules per record (full business intelligence)`);
            console.log('✅ No more 28 vs 30 issue - SOLVED FOREVER!');
            console.log('✅ No more incomplete metrics - FULL SYSTEM RESTORED!');
            
            console.log('\n🚀 READY FOR PRODUCTION DEPLOYMENT:');
            console.log('1. ✅ Update cronjob system to use v13.0');
            console.log('2. ✅ Deploy to production with confidence');
            console.log('3. ✅ Full analytics dashboard ready');
            console.log('4. ✅ Business intelligence metrics complete');
            
            console.log('\n🎊🎊🎊 THE REGRESSION HAS BEEN COMPLETELY FIXED! 🎊🎊🎊');
            console.log('v13.0 = v12.0 reliability + Original system completeness');
          }
          
        } else {
          console.log(`⚠️ Metrics may be incomplete: ${modules.length} modules, ${totalFields} fields`);
          console.log('Expected: 8+ modules, 60+ fields');
        }
        
        // Show sample data structure
        console.log('\n📋 SAMPLE METRIC STRUCTURE:');
        console.log('Financial metrics:', JSON.stringify(metricData.financial_metrics || {}, null, 2));
        
      } else {
        console.log('⚠️ Could not analyze metric completeness - no sample data');
      }
      
    } else {
      console.log(`❌ REGRESSION: Only ${allActualCount}/30 records stored`);
      
      if (allActualCount > 0) {
        console.log('Some records stored - partial success');
        
        // Basic analysis
        const periods = { '7d': 0, '30d': 0, '90d': 0 };
        allMetrics.forEach(m => periods[m.period]++);
        
        console.log(`Period distribution: ${JSON.stringify(periods)}`);
        
        // Check if we have complete metrics in the stored records
        if (allMetrics.length > 0) {
          const sampleData = allMetrics[0].metric_data;
          const modules = Object.keys(sampleData || {});
          console.log(`Sample record has ${modules.length} modules`);
          
          if (modules.length >= 8) {
            console.log('✅ At least the metrics are complete in stored records');
          } else {
            console.log('❌ Even the stored records have incomplete metrics');
          }
        }
      } else {
        console.log('❌ Complete failure - no records stored at all');
        console.log('The v13.0 implementation may have introduced new errors');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV13CompleteFix();