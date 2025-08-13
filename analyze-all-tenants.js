const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeAllTenants() {
  try {
    console.log('📊 Analyzing ALL tenants and their metrics...\n');
    
    // Get all active tenants
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name');
    
    console.log(`Found ${tenants?.length || 0} active tenants:\n`);
    
    if (!tenants) {
      console.log('❌ No tenants found');
      return;
    }
    
    // Map tenant IDs to their prefixes
    tenants.forEach((tenant, index) => {
      const prefix = tenant.id.substring(0, 8);
      console.log(`${index + 1}. ${tenant.business_name}`);
      console.log(`   ID: ${tenant.id}`);
      console.log(`   Prefix: ${prefix}`);
    });
    
    console.log('\n--- METRICS ANALYSIS ---\n');
    
    // Get all current metrics
    const { data: metrics } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, created_at')
      .order('tenant_id, period');
    
    if (!metrics) {
      console.log('❌ No metrics found');
      return;
    }
    
    console.log(`Found ${metrics.length} total metrics\n`);
    
    // Group metrics by tenant
    const metricsByTenant = {};
    metrics.forEach(metric => {
      if (!metricsByTenant[metric.tenant_id]) {
        metricsByTenant[metric.tenant_id] = [];
      }
      metricsByTenant[metric.tenant_id].push(metric);
    });
    
    // Analyze each tenant
    tenants.forEach(tenant => {
      const tenantMetrics = metricsByTenant[tenant.id] || [];
      const periods = tenantMetrics.map(m => m.period).sort();
      const prefix = tenant.id.substring(0, 8);
      
      console.log(`🏢 ${tenant.business_name} (${prefix})`);
      console.log(`   Periods: [${periods.join(', ')}] (${periods.length} total)`);
      
      if (periods.length !== 3) {
        console.log(`   ⚠️  MISSING PERIODS! Expected: [7d, 30d, 90d]`);
        
        const expectedPeriods = ['7d', '30d', '90d'];
        const missingPeriods = expectedPeriods.filter(p => !periods.includes(p));
        const extraPeriods = periods.filter(p => !expectedPeriods.includes(p));
        
        if (missingPeriods.length > 0) {
          console.log(`      Missing: [${missingPeriods.join(', ')}]`);
        }
        if (extraPeriods.length > 0) {
          console.log(`      Extra: [${extraPeriods.join(', ')}]`);
        }
      } else {
        console.log(`   ✅ Complete (all 3 periods)`);
      }
      
      console.log('');
    });
    
    // Summary
    const completeTenants = tenants.filter(tenant => {
      const tenantMetrics = metricsByTenant[tenant.id] || [];
      return tenantMetrics.length === 3;
    });
    
    const incompleteTenants = tenants.filter(tenant => {
      const tenantMetrics = metricsByTenant[tenant.id] || [];
      return tenantMetrics.length !== 3;
    });
    
    console.log('=== SUMMARY ===');
    console.log(`✅ Complete tenants: ${completeTenants.length}/${tenants.length}`);
    console.log(`❌ Incomplete tenants: ${incompleteTenants.length}/${tenants.length}`);
    console.log(`📊 Total metrics: ${metrics.length} (expected: ${tenants.length * 3})`);
    
    if (incompleteTenants.length > 0) {
      console.log('\n🔍 INCOMPLETE TENANTS:');
      incompleteTenants.forEach(tenant => {
        const tenantMetrics = metricsByTenant[tenant.id] || [];
        const periods = tenantMetrics.map(m => m.period);
        const missing = ['7d', '30d', '90d'].filter(p => !periods.includes(p));
        console.log(`  - ${tenant.business_name}: missing ${missing.join(', ')}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Analysis error:', error.message);
  }
}

analyzeAllTenants();