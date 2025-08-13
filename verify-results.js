require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyResults() {
  try {
    console.log('🔍 Verifying metrics results...\n');
    
    const { data: metrics, count } = await client
      .from('tenant_metrics')
      .select('tenant_id, period', { count: 'exact' });
    
    console.log(`📊 Total records: ${count}`);
    
    if (metrics) {
      const periods = { '7d': 0, '30d': 0, '90d': 0 };
      const tenants = new Set();
      
      metrics.forEach(m => {
        periods[m.period]++;
        tenants.add(m.tenant_id);
      });
      
      console.log(`🏢 Unique tenants: ${tenants.size}`);
      console.log('📅 Period distribution:');
      console.log(`  - 7d:  ${periods['7d']}`);
      console.log(`  - 30d: ${periods['30d']}`);
      console.log(`  - 90d: ${periods['90d']}`);
      
      const expectedTotal = tenants.size * 3;
      console.log(`\n🎯 Expected: ${expectedTotal} records (${tenants.size} tenants × 3 periods)`);
      console.log(`📍 Actual: ${count} records`);
      console.log(`🔢 Difference: ${expectedTotal - count}`);
      
      if (periods['30d'] < tenants.size) {
        const missing30d = tenants.size - periods['30d'];
        console.log(`\n⚠️  Missing 30d periods: ${missing30d}`);
        
        const tenantsWith30d = new Set();
        metrics.filter(m => m.period === '30d').forEach(m => {
          tenantsWith30d.add(m.tenant_id);
        });
        
        console.log('🔍 Tenants missing 30d periods:');
        Array.from(tenants).forEach(tenantId => {
          if (!tenantsWith30d.has(tenantId)) {
            const prefix = tenantId.substring(0, 8);
            console.log(`  - ${prefix}...`);
          }
        });
      } else {
        console.log('\n✅ All tenants have 30d period metrics!');
      }
      
    } else {
      console.log('❌ No metrics found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyResults();