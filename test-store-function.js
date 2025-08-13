require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testStoreTenantMetric() {
  try {
    console.log('🔍 Testing store_tenant_metric function directly...\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    if (!tenants || tenants.length === 0) {
      console.log('❌ No tenants found');
      return;
    }
    
    const tenant = tenants[0];
    console.log(`Testing with tenant: ${tenant.business_name} ${tenant.id.substring(0, 8)}`);
    
    // Clear table first
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Test 1: Simple store_tenant_metric call
    console.log('\nTest 1: Simple store_tenant_metric call...');
    try {
      const { error: storeError } = await client.rpc('store_tenant_metric', {
        p_tenant_id: tenant.id,
        p_metric_type: 'test_simple',
        p_metric_data: { test: 'simple', value: 123 },
        p_period: '7d'
      });
      
      if (storeError) {
        console.log('❌ store_tenant_metric error:', storeError);
      } else {
        console.log('✅ store_tenant_metric succeeded');
        
        // Check if it was stored
        const { count } = await client
          .from('tenant_metrics')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);
        
        console.log(`Records in table: ${count}`);
      }
    } catch (err) {
      console.log('❌ store_tenant_metric exception:', err.message);
    }
    
    // Clear for next test
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Test 2: Complex JSONB like v6.0 uses
    console.log('\nTest 2: Complex JSONB like v6.0 uses...');
    try {
      const complexData = {
        financial_metrics: {
          tenant_revenue: 1000,
          mrr: 1000,
          avg_ticket: 50
        },
        appointment_metrics: {
          appointments_total: 20,
          appointments_confirmed: 15
        },
        metadata: {
          version: 'test_v6.0',
          metrics_count: 73
        }
      };
      
      const { error: complexError } = await client.rpc('store_tenant_metric', {
        p_tenant_id: tenant.id,
        p_metric_type: 'comprehensive',
        p_metric_data: complexData,
        p_period: '30d'
      });
      
      if (complexError) {
        console.log('❌ Complex store_tenant_metric error:', complexError);
      } else {
        console.log('✅ Complex store_tenant_metric succeeded');
        
        // Check if it was stored
        const { count } = await client
          .from('tenant_metrics')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);
        
        console.log(`Records in table: ${count}`);
      }
    } catch (err) {
      console.log('❌ Complex store_tenant_metric exception:', err.message);
    }
    
    // Test the exact pattern that v6.0 uses
    console.log('\nTest 3: Run v6.0 on single tenant to see error...');
    try {
      const { data: v6Result, error: v6Error } = await client.rpc('calculate_tenant_metrics_definitiva_total_v6', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      if (v6Error) {
        console.log('❌ v6.0 error:', v6Error);
      } else {
        console.log('v6.0 result:', v6Result);
        
        // Check what was stored
        const { data: metrics, count } = await client
          .from('tenant_metrics')
          .select('period', { count: 'exact' })
          .eq('tenant_id', tenant.id);
        
        console.log(`v6.0 stored ${count} records`);
        if (metrics) {
          const periods = metrics.map(m => m.period);
          console.log(`Periods: [${periods.join(', ')}]`);
        }
      }
    } catch (err) {
      console.log('❌ v6.0 exception:', err.message);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testStoreTenantMetric();