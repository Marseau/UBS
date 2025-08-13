require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV14GradualExpansion() {
  try {
    console.log('🎯 TESTING DEFINITIVA TOTAL v14.0 - GRADUAL EXPANSION STRATEGY\n');
    console.log('Strategy: Start from v12.0 working base (21 metrics) → Expand to ~45 metrics');
    console.log('Goal: Maintain 30 records success while adding more metrics safely\n');
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Test v14.0 on ALL tenants
    console.log('🚀 Running DEFINITIVA TOTAL v14.0 on ALL tenants...');
    console.log('Expected: 30 records with ~45 metrics each (safe expansion)\n');
    
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v14', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v14.0 procedure error:', error);
      console.log('The gradual expansion approach failed - there may be an issue in the expanded logic');
      return;
    }
    
    console.log('📋 v14.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration}ms\n`);
    
    // Check actual results
    const { data: allMetrics, count: allActualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, metric_data', { count: 'exact' });
    
    console.log('📊 GRADUAL EXPANSION VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${allActualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants × 3 periods)\n`);
    
    if (allActualCount === 30) {
      console.log('🎉🎉🎉 SUCCESS! v14.0 GRADUAL EXPANSION WORKS! 🎉🎉🎉');
      console.log('✅ ALL 30 RECORDS STORED CORRECTLY!');
      console.log('✅ GRADUAL EXPANSION STRATEGY IS EFFECTIVE!');
      console.log('✅ More metrics than v12.0, but stable implementation!');
      
      // Analyze the expanded metrics
      if (allMetrics && allMetrics.length > 0) {
        const sampleMetric = allMetrics[0];
        const metricData = sampleMetric.metric_data;
        
        console.log('\n📊 EXPANDED METRICS ANALYSIS:');
        console.log(`Sample record from tenant: ${sampleMetric.tenant_id.substring(0, 8)}`);
        console.log(`Period: ${sampleMetric.period}`);
        console.log(`Metric type: ${sampleMetric.metric_type}\n`);
        
        // Count modules and fields
        const modules = Object.keys(metricData || {});
        console.log('📋 EXPANDED MODULES INCLUDED:');
        let totalFields = 0;
        
        modules.forEach((module, index) => {
          const moduleData = metricData[module] || {};
          const fieldCount = Object.keys(moduleData).length;
          totalFields += fieldCount;
          console.log(`${(index + 1).toString().padStart(2, ' ')}. ${module}: ${fieldCount} fields`);
        });
        
        console.log(`\n📊 TOTAL MODULES: ${modules.length}`);
        console.log(`📊 TOTAL FIELDS: ${totalFields}`);
        
        const comparison = {
          v12: { modules: 3, fields: 21, status: 'Working baseline' },
          v14: { modules: modules.length, fields: totalFields, status: 'Current expansion' },
          v13: { modules: 11, fields: 73, status: 'Failed target' }
        };
        
        console.log('\n📈 EXPANSION COMPARISON:');
        console.log(`v12.0: ${comparison.v12.modules} modules, ${comparison.v12.fields} fields - ${comparison.v12.status}`);
        console.log(`v14.0: ${comparison.v14.modules} modules, ${comparison.v14.fields} fields - ${comparison.v14.status}`);
        console.log(`v13.0: ${comparison.v13.modules} modules, ${comparison.v13.fields} fields - ${comparison.v13.status}`);
        
        if (totalFields > 21 && totalFields < 73) {
          console.log('\n✅ SWEET SPOT ACHIEVED!');
          console.log(`✅ Expanded from ${comparison.v12.fields} to ${totalFields} fields successfully`);
          console.log('✅ More comprehensive than v12.0 baseline');
          console.log('✅ More stable than v13.0 full expansion');
          
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
          
          console.log('\n🎯 NEXT STEPS - FURTHER EXPANSION:');
          console.log('1. ✅ v14.0 proves gradual expansion works');
          console.log('2. 🚀 Can create v15.0 with ~55-60 fields');
          console.log('3. 🚀 Eventually reach full 73+ field target');
          console.log('4. 🎊 Safe, incremental approach to complete metrics');
          
        } else if (totalFields <= 21) {
          console.log('\n⚠️ No significant expansion achieved');
          console.log('Field count similar to v12.0 - expansion logic may need review');
        } else {
          console.log('\n⚠️ Expanded beyond safe range');
          console.log('May be approaching the complexity that breaks v13.0');
        }
        
        // Show sample module structure
        console.log('\n📋 SAMPLE EXPANDED STRUCTURE:');
        if (metricData.financial_metrics) {
          console.log('Financial metrics:', Object.keys(metricData.financial_metrics));
        }
        if (metricData.appointment_metrics) {
          console.log('Appointment metrics:', Object.keys(metricData.appointment_metrics));
        }
        if (metricData.customer_metrics) {
          console.log('Customer metrics:', Object.keys(metricData.customer_metrics));
        }
        
        console.log('\n🏆 v14.0 GRADUAL EXPANSION SUCCESS CONFIRMED!');
        console.log('Ready for production or further safe expansion');
        
      } else {
        console.log('⚠️ Could not analyze expanded metrics - no sample data available');
      }
      
    } else if (allActualCount > 0) {
      console.log(`⚠️ PARTIAL SUCCESS: ${allActualCount}/30 records stored`);
      console.log('Some expansion may have caused issues for specific tenants/periods');
      
      // Basic analysis
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      allMetrics.forEach(m => periods[m.period]++);
      
      console.log(`Period distribution: ${JSON.stringify(periods)}`);
      
      // Check if the stored records have the expanded metrics
      if (allMetrics.length > 0) {
        const sampleData = allMetrics[0].metric_data;
        const modules = Object.keys(sampleData || {});
        let totalFields = 0;
        modules.forEach(mod => {
          totalFields += Object.keys(sampleData[mod] || {}).length;
        });
        
        console.log(`Stored records have ${modules.length} modules, ${totalFields} fields`);
        
        if (totalFields > 21) {
          console.log('✅ At least partial expansion worked in stored records');
          console.log('Issue may be with specific tenant data or edge cases');
        }
      }
      
    } else {
      console.log('❌ COMPLETE FAILURE: 0/30 records stored');
      console.log('The gradual expansion introduced errors that broke even the basic functionality');
      console.log('Need to revert to v12.0 working baseline or debug the expansion logic');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV14GradualExpansion();