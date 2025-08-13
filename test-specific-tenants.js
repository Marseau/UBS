const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSpecificTenants() {
  try {
    console.log('🔍 Testing specific failing tenants...\n');
    
    const problemTenantPrefixes = ['f34d8c94', 'fe2fa876'];
    
    for (const prefix of problemTenantPrefixes) {
      console.log(`\n==== TESTING TENANT ${prefix} ====`);
      
      // Get full tenant info
      const { data: tenant } = await client
        .from('tenants')
        .select('id, business_name')
        .like('id', `${prefix}%`)
        .single();
      
      if (!tenant) {
        console.log(`❌ Tenant ${prefix} not found`);
        continue;
      }
      
      console.log(`🏢 Tenant: ${tenant.business_name}`);
      console.log(`🆔 Full ID: ${tenant.id}`);
      
      // Test each period manually
      for (const periodDays of [7, 30, 90]) {
        console.log(`\n--- PERIOD ${periodDays}d ---`);
        
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (periodDays - 1));
        
        console.log(`📅 Date window: ${startDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
        
        // Check appointments
        const { data: appointments, count: appointmentCount } = await client
          .from('appointments')
          .select('id, start_time, status, quoted_price, final_price', { count: 'exact' })
          .eq('tenant_id', tenant.id)
          .gte('start_time', startDate.toISOString())
          .lt('start_time', new Date(today.getTime() + 24*60*60*1000).toISOString());
        
        const revenue = appointments ? appointments.reduce((sum, apt) => {
          const price = apt.quoted_price || apt.final_price || 0;
          return sum + price;
        }, 0) : 0;
        
        console.log(`💰 Appointments: ${appointmentCount || 0}, Revenue: $${revenue}`);
        
        // Check conversations
        const { count: conversationCount } = await client
          .from('conversation_history')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', startDate.toISOString())
          .lt('created_at', new Date(today.getTime() + 24*60*60*1000).toISOString());
        
        console.log(`💬 Conversations: ${conversationCount || 0}`);
        
        // Test if we can create a metric manually
        const testMetric = {
          tenant_id: tenant.id,
          period_days: periodDays,
          revenue: revenue,
          appointments: appointmentCount || 0,
          conversations: conversationCount || 0,
          test: true
        };
        
        try {
          console.log('🧪 Testing manual metric creation...');
          const { error: storeError } = await client.rpc('store_tenant_metric', {
            p_tenant_id: tenant.id,
            p_metric_type: 'manual_test',
            p_metric_data: testMetric,
            p_period: `${periodDays}d`
          });
          
          if (storeError) {
            console.log(`❌ Manual store failed for ${periodDays}d:`, storeError.message);
          } else {
            console.log(`✅ Manual store succeeded for ${periodDays}d`);
          }
        } catch (err) {
          console.log(`❌ Manual store exception for ${periodDays}d:`, err.message);
        }
        
        // Check what exists in the table for this tenant/period
        const { data: existingMetrics } = await client
          .from('tenant_metrics')
          .select('metric_type, period, created_at')
          .eq('tenant_id', tenant.id)
          .eq('period', `${periodDays}d`)
          .order('created_at', { ascending: false });
        
        if (existingMetrics && existingMetrics.length > 0) {
          console.log(`📊 Existing metrics for ${periodDays}d:`, existingMetrics.map(m => `${m.metric_type} (${new Date(m.created_at).toLocaleTimeString()})`));
        } else {
          console.log(`📊 NO existing metrics found for ${periodDays}d`);
        }
      }
      
      console.log(`\n--- TESTING INDIVIDUAL TENANT EXECUTION ---`);
      
      // Test running the procedure for just this tenant
      const { data: individualResult, error: individualError } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: tenant.id
      });
      
      if (individualError) {
        console.log(`❌ Individual execution error:`, individualError);
      } else {
        console.log(`✅ Individual execution result:`, {
          success: individualResult.success,
          processed_tenants: individualResult.processed_tenants,
          periods_processed: individualResult.periods_processed,
          total_metrics_created: individualResult.total_metrics_created
        });
      }
      
      // Check what was actually created after individual execution
      const { data: finalMetrics } = await client
        .from('tenant_metrics')
        .select('period, metric_type, created_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      console.log('📊 Final metrics after individual execution:');
      if (finalMetrics) {
        finalMetrics.forEach(m => {
          console.log(`  - ${m.period} (${m.metric_type}) at ${new Date(m.created_at).toLocaleString()}`);
        });
      } else {
        console.log('  - NO METRICS FOUND');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testSpecificTenants();