require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findRealProblemTenants() {
  try {
    console.log('🔍 FINDING: Which tenants are REALLY losing 30d records\n');
    
    // Get all active tenants
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name');
    
    console.log(`📋 Found ${tenants.length} active tenants:`);
    tenants.forEach((t, i) => {
      console.log(`${i + 1}. ${t.business_name} - ${t.id.substring(0, 8)}...`);
    });
    
    // Clear table and run procedure
    console.log('\n🧹 Clearing table...');
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('🚀 Running main procedure...');
    const { data: result } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    console.log('Procedure result:', result);
    
    // Get actual stored metrics
    const { data: metrics, count } = await client
      .from('tenant_metrics')
      .select('tenant_id, period', { count: 'exact' });
    
    console.log(`\n📊 Actually stored: ${count} metrics`);
    
    // Group by tenant
    const tenantMetrics = {};
    metrics.forEach(m => {
      if (!tenantMetrics[m.tenant_id]) {
        tenantMetrics[m.tenant_id] = [];
      }
      tenantMetrics[m.tenant_id].push(m.period);
    });
    
    console.log('\n🔍 Analysis by tenant:');
    console.log('='.repeat(80));
    
    tenants.forEach(tenant => {
      const periods = tenantMetrics[tenant.id] || [];
      const prefix = tenant.id.substring(0, 8);
      const status = periods.length === 3 ? '✅' : '❌';
      
      console.log(`${status} ${tenant.business_name} (${prefix})`);
      console.log(`   Periods: [${periods.sort().join(', ')}] (${periods.length}/3)`);
      
      if (periods.length < 3) {
        const missing = ['7d', '30d', '90d'].filter(p => !periods.includes(p));
        console.log(`   ❌ MISSING: [${missing.join(', ')}]`);
        
        // This is a problem tenant - let's get the full ID
        console.log(`   🆔 FULL ID: ${tenant.id}`);
      }
      console.log('');
    });
    
    // Summary
    const workingTenants = tenants.filter(t => (tenantMetrics[t.id] || []).length === 3);
    const problemTenants = tenants.filter(t => (tenantMetrics[t.id] || []).length < 3);
    
    console.log('\n📋 SUMMARY:');
    console.log(`✅ Working tenants: ${workingTenants.length}`);
    console.log(`❌ Problem tenants: ${problemTenants.length}`);
    
    if (problemTenants.length > 0) {
      console.log('\n🎯 PROBLEM TENANTS (full details):');
      problemTenants.forEach(tenant => {
        const periods = tenantMetrics[tenant.id] || [];
        const missing = ['7d', '30d', '90d'].filter(p => !periods.includes(p));
        console.log(`- ${tenant.business_name}`);
        console.log(`  Full ID: ${tenant.id}`);
        console.log(`  Prefix: ${tenant.id.substring(0, 8)}`);
        console.log(`  Missing: [${missing.join(', ')}]`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findRealProblemTenants();