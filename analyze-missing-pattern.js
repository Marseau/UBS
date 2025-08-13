require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeMissingPattern() {
  try {
    console.log('🔍 ANALYZING: Is this a TENANT problem or a PERIOD problem?\n');
    
    // Clear table and run main procedure multiple times to see if it's consistent
    for (let run = 1; run <= 3; run++) {
      console.log(`=== RUN ${run} ===`);
      
      // Clear table
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('🧹 Table cleared');
      
      // Run main procedure
      const { data: result } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: null
      });
      
      console.log(`Procedure reports: ${result.total_metrics_created} metrics created`);
      
      // Analyze what was actually stored
      const { data: metrics, count } = await client
        .from('tenant_metrics')
        .select('tenant_id, period', { count: 'exact' });
      
      console.log(`Actually stored: ${count} metrics`);
      
      // Count by period
      const periodCounts = { '7d': 0, '30d': 0, '90d': 0 };
      const tenantSet = new Set();
      const tenantPeriods = {};
      
      metrics.forEach(m => {
        periodCounts[m.period]++;
        tenantSet.add(m.tenant_id);
        
        if (!tenantPeriods[m.tenant_id]) {
          tenantPeriods[m.tenant_id] = [];
        }
        tenantPeriods[m.tenant_id].push(m.period);
      });
      
      console.log(`Unique tenants: ${tenantSet.size}`);
      console.log('Period distribution:', periodCounts);
      
      // Find missing patterns
      console.log('\n🔍 Missing Analysis:');
      
      // Are the same periods always missing?
      const expectedPerTenant = 3;
      const expectedTotal = tenantSet.size * expectedPerTenant;
      const missing = expectedTotal - count;
      
      console.log(`Expected: ${expectedTotal} (${tenantSet.size} tenants × 3 periods)`);
      console.log(`Actual: ${count}`);
      console.log(`Missing: ${missing}`);
      
      if (missing > 0) {
        // Check if it's always the same period missing
        const missingPeriods = [];
        Object.keys(periodCounts).forEach(period => {
          if (periodCounts[period] < tenantSet.size) {
            missingPeriods.push(period);
            console.log(`❌ Period ${period}: ${periodCounts[period]}/${tenantSet.size} (missing ${tenantSet.size - periodCounts[period]})`);
          }
        });
        
        // Check if it's always the same tenants missing periods
        const problematicTenants = [];
        Object.keys(tenantPeriods).forEach(tenantId => {
          if (tenantPeriods[tenantId].length < 3) {
            const missing = ['7d', '30d', '90d'].filter(p => !tenantPeriods[tenantId].includes(p));
            problematicTenants.push({
              tenant: tenantId.substring(0, 8),
              has: tenantPeriods[tenantId],
              missing: missing
            });
          }
        });
        
        if (problematicTenants.length > 0) {
          console.log('\n❌ Tenants with missing periods:');
          problematicTenants.forEach(t => {
            console.log(`  ${t.tenant}: has [${t.has.join(', ')}], missing [${t.missing.join(', ')}]`);
          });
        }
        
        console.log(`\n🎯 PATTERN: ${missingPeriods.length > 0 ? 'PERIOD-specific' : 'TENANT-specific'} problem`);
        if (missingPeriods.length > 0) {
          console.log(`Always missing period(s): ${missingPeriods.join(', ')}`);
        }
      } else {
        console.log('✅ No missing records in this run');
      }
      
      console.log('\n');
    }
    
    console.log('🎯 CONCLUSION: Run this 3 times to see if:');
    console.log('1. Same TENANTS always lose records → TENANT-specific problem');
    console.log('2. Same PERIODS always missing → PERIOD-specific problem'); 
    console.log('3. Random pattern → RACE CONDITION or MEMORY issue');
    console.log('4. Consistent pattern → LOGIC BUG in procedure');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

analyzeMissingPattern();