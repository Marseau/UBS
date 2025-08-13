require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testV6Fix() {
  try {
    console.log('🚀 TESTING DEFINITIVA TOTAL v6.0 MEMORY OPTIMIZED\n');
    
    // Clear table first
    console.log('🧹 Clearing tenant_metrics table...');
    const { count: cleared } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log(`Cleared ${cleared || 0} existing records\n`);
    
    // Test v6.0 on ALL tenants
    console.log('🚀 Running DEFINITIVA TOTAL v6.0 on ALL tenants...');
    const startTime = Date.now();
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v6', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.log('❌ v6.0 procedure error:', error);
      return;
    }
    
    console.log('📋 v6.0 Procedure result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Duration: ${duration}ms\n`);
    
    // Check actual results in table
    const { data: metrics, count: actualCount } = await client
      .from('tenant_metrics')
      .select('tenant_id, period', { count: 'exact' });
    
    console.log('📊 RESULTS VERIFICATION:');
    console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
    console.log(`Actually stored: ${actualCount} metrics`);
    console.log(`Expected: 30 metrics (10 tenants × 3 periods)\n`);
    
    if (actualCount === 30) {
      console.log('🎉 SUCCESS! All 30 records stored correctly!');
      console.log('✅ BUG FIXED - v6.0 memory optimization worked!');
    } else {
      console.log('❌ Still missing records. Let me analyze...');
      
      // Analyze missing records
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      const tenants = new Set();
      
      metrics.forEach(m => {
        periods[m.period]++;
        tenants.add(m.tenant_id);
      });
      
      console.log('Period distribution:', periods);
      console.log(`Unique tenants: ${tenants.size}`);
      
      if (periods['30d'] < tenants.size) {
        console.log(`⚠️ Still missing ${tenants.size - periods['30d']} tenants with 30d period`);
        
        // Find which tenants are still missing 30d
        const tenantsWith30d = new Set();
        metrics.filter(m => m.period === '30d').forEach(m => tenantsWith30d.add(m.tenant_id));
        
        console.log('\n🔍 Tenants still missing 30d:');
        Array.from(tenants).forEach(tenantId => {
          if (!tenantsWith30d.has(tenantId)) {
            console.log(`  - ${tenantId.substring(0, 8)}`);
          }
        });
      }
    }
    
    // Show complete analysis
    console.log('\n📊 COMPLETE ANALYSIS:');
    const tenantsAnalysis = {};
    
    metrics.forEach(m => {
      if (!tenantsAnalysis[m.tenant_id]) {
        tenantsAnalysis[m.tenant_id] = [];
      }
      tenantsAnalysis[m.tenant_id].push(m.period);
    });
    
    Object.keys(tenantsAnalysis).forEach(tenantId => {
      const periods = tenantsAnalysis[tenantId].sort();
      const prefix = tenantId.substring(0, 8);
      const status = periods.length === 3 ? '✅' : '❌';
      
      console.log(`${status} ${prefix}: [${periods.join(', ')}] (${periods.length}/3)`);
      
      if (periods.length < 3) {
        const missing = ['7d', '30d', '90d'].filter(p => !periods.includes(p));
        console.log(`     Missing: [${missing.join(', ')}]`);
      }
    });
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testV6Fix();