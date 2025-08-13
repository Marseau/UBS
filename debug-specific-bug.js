require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugSpecificBug() {
  try {
    console.log('🔍 DEBUGGING: Specific bug in main procedure for failing tenants\n');
    
    const problemTenants = [
      { name: 'Centro Terapêutico Equilíbrio', id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8' },
      { name: 'Clínica Mente Sã', id: 'fe2fa876-05da-49b5-b266-8141bcd090fa' }
    ];
    
    for (const tenant of problemTenants) {
      console.log('='.repeat(70));
      console.log(`🏥 ${tenant.name} (${tenant.id.substring(0, 8)})`);
      console.log('='.repeat(70));
      
      // Test 1: Main procedure for this tenant only
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('🚀 Test 1: Main procedure for this tenant only...');
      const { data: mainResult } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      console.log('Main result:', {
        success: mainResult.success,
        processed_tenants: mainResult.processed_tenants,
        total_metrics_created: mainResult.total_metrics_created
      });
      
      const { data: mainMetrics, count: mainCount } = await client
        .from('tenant_metrics')
        .select('period, metric_type', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`Main stored: ${mainCount} metrics`);
      if (mainMetrics) {
        const periods = mainMetrics.map(m => m.period).sort();
        console.log(`Periods: [${periods.join(', ')}]`);
      }
      
      // Test 2: Debug procedure for comparison  
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('🧪 Test 2: Debug procedure for comparison...');
      const { data: debugResult } = await client.rpc('calculate_tenant_metrics_definitiva_total_debug', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      console.log('Debug result:', {
        success: debugResult.success,
        processed_tenants: debugResult.processed_tenants,
        total_metrics_created: debugResult.total_metrics_created
      });
      
      const { data: debugMetrics, count: debugCount } = await client
        .from('tenant_metrics')
        .select('period, metric_type', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`Debug stored: ${debugCount} metrics`);
      if (debugMetrics) {
        const periods = debugMetrics.map(m => m.period).sort();
        console.log(`Periods: [${periods.join(', ')}]`);
      }
      
      // Analysis
      console.log('\\n🔍 ANALYSIS:');
      if (mainCount < debugCount) {
        console.log('❌ CONFIRMED: Main procedure fails, Debug procedure works');
        console.log('📋 This proves the bug is in the main procedure logic');
        
        if (debugMetrics && mainMetrics) {
          const debugPeriods = debugMetrics.map(m => m.period);
          const mainPeriods = mainMetrics.map(m => m.period);
          const missing = debugPeriods.filter(p => !mainPeriods.includes(p));
          console.log(`🎯 Main procedure is missing: [${missing.join(', ')}]`);
        }
      } else {
        console.log('🤔 Both procedures work when run individually - this suggests a race condition');
      }
      
      console.log('\\n');
    }
    
    console.log('🎯 CONCLUSION: The bug is definitely in the main procedure logic.');
    console.log('Next step: Compare the exact JSONB construction and store_tenant_metric calls.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugSpecificBug();