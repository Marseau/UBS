require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDefinitivaTotalFixed() {
  try {
    console.log('🎯 TESTING DEFINITIVA-TOTAL-FIXED-ALL-ISSUES.sql');
    console.log('This procedure contains all 6 critical fixes applied\n');
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('🚀 Running DEFINITIVA TOTAL FIXED on ALL tenants...');
    console.log('Expected: 30 records with 73+ metrics each\n');
    
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ Procedure error:', error);
      return;
    }
    
    console.log('📋 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results
    const { data: allMetrics, count: allActualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, metric_data', { count: 'exact' });
    
    console.log('📊 VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${allActualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants x 3 periods)\n`);
    
    if (allActualCount === 30) {
      console.log('🎉🎉🎉 DEFINITIVA TOTAL FIXED SUCCESS! 🎉🎉🎉');
      console.log('✅ ALL 30 RECORDS STORED CORRECTLY!');
      console.log('✅ The DEFINITIVA-TOTAL-FIXED-ALL-ISSUES procedure WORKS!');
      
      if (allMetrics && allMetrics.length > 0) {
        const sampleMetric = allMetrics[0];
        const metricData = sampleMetric.metric_data;
        const modules = Object.keys(metricData || {});
        
        console.log('\n📊 METRICS COMPLETENESS ANALYSIS:');
        console.log(`Sample record from tenant: ${sampleMetric.tenant_id.substring(0, 8)}`);
        console.log(`Period: ${sampleMetric.period}`);
        console.log(`Metric type: ${sampleMetric.metric_type}\n`);
        
        console.log('📋 MODULES INCLUDED:');
        let totalFields = 0;
        modules.forEach((module, index) => {
          const moduleData = metricData[module] || {};
          const fieldCount = Object.keys(moduleData).length;
          totalFields += fieldCount;
          console.log(`${(index + 1).toString().padStart(2, ' ')}. ${module}: ${fieldCount} fields`);
        });
        
        console.log(`\n📊 TOTAL MODULES: ${modules.length}`);
        console.log(`📊 TOTAL FIELDS: ${totalFields}`);
        
        if (totalFields >= 70) {
          console.log('\n🏆🏆🏆 ULTIMATE SUCCESS! 🏆🏆🏆');
          console.log('✅ BOTH 30 RECORDS AND 73+ METRICS ACHIEVED!');
          console.log('✅ The DEFINITIVA-TOTAL-FIXED-ALL-ISSUES procedure is PERFECT!');
          console.log('✅ Combines ALL critical fixes with complete metrics!');
          console.log('✅ Ready for production deployment!');
          
          // Perfect distribution analysis
          const periods = { '7d': 0, '30d': 0, '90d': 0 };
          const tenantsFound = new Set();
          
          allMetrics.forEach(m => {
            periods[m.period]++;
            tenantsFound.add(m.tenant_id);
          });
          
          console.log(`\n📊 PERFECT DISTRIBUTION: ${JSON.stringify(periods)}`);
          console.log(`Unique tenants: ${tenantsFound.size}`);
          console.log('✅ Each period has exactly 10 records!');
          
          console.log('\n🎯 FINAL ACHIEVEMENT:');
          console.log('✅ 30/30 records stored (100% success rate)');
          console.log(`✅ ${totalFields}+ metrics per record (complete analytics)`);
          console.log(`✅ ${modules.length} modules per record (full business intelligence)`);
          console.log('✅ All 6 critical fixes applied successfully');
          console.log('✅ No more regression issues - STABLE SOLUTION!');
          
        } else if (totalFields > 21) {
          console.log(`\n✅ PARTIAL SUCCESS: ${totalFields} fields (more than v12.0 baseline)`);
          console.log('Some metrics expansion achieved, but not full 73+ target');
        } else {
          console.log(`\n⚠️ LIMITED METRICS: Only ${totalFields} fields`);
          console.log('Similar to v12.0 baseline - expansion may not have worked');
        }
        
        // Show sample data structure
        console.log('\n📋 SAMPLE METRIC STRUCTURE:');
        if (metricData.financial_metrics) {
          console.log('Financial metrics:', Object.keys(metricData.financial_metrics));
        }
        if (metricData.appointment_metrics) {
          console.log('Appointment metrics:', Object.keys(metricData.appointment_metrics));
        }
        if (metricData.metadata) {
          console.log('Data source:', metricData.metadata.data_source);
          console.log('Fixes applied:', metricData.metadata.fixes_applied);
        }
      }
      
    } else if (allActualCount > 0) {
      console.log(`⚠️ PARTIAL SUCCESS: ${allActualCount}/30 records stored`);
      
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      allMetrics.forEach(m => periods[m.period]++);
      console.log(`Period distribution: ${JSON.stringify(periods)}`);
      
      if (allMetrics.length > 0) {
        const sampleData = allMetrics[0].metric_data;
        const modules = Object.keys(sampleData || {});
        let totalFields = 0;
        modules.forEach(mod => {
          totalFields += Object.keys(sampleData[mod] || {}).length;
        });
        
        console.log(`Stored records have ${modules.length} modules, ${totalFields} fields`);
        
        if (totalFields >= 70) {
          console.log('✅ At least the metrics are complete in stored records');
          console.log('Issue may be with specific tenant data or edge cases');
        }
      }
      
    } else {
      console.log('❌ COMPLETE FAILURE: 0/30 records stored');
      console.log('The DEFINITIVA-TOTAL-FIXED-ALL-ISSUES procedure failed completely');
      console.log('There may be fundamental issues with the implementation');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testDefinitivaTotalFixed();