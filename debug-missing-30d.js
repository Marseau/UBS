const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugMissing30d() {
  try {
    console.log('🔍 Debugging missing 30d periods...');
    
    const problemTenants = [
      'f34d8c94',  // Missing 30d
      'fe2fa876'   // Missing 30d
    ];
    
    const workingTenants = [
      '33b8c488',  // Has all 3 periods
      '5bd592ee'   // Has all 3 periods  
    ];
    
    console.log('\n1️⃣ Testing individual tenant execution...');
    
    for (const tenantPrefix of problemTenants) {
      // Get full tenant ID
      const { data: tenantData } = await client
        .from('tenants')
        .select('id, business_name')
        .like('id', `${tenantPrefix}%`)
        .single();
      
      if (tenantData) {
        console.log(`\n🔍 Testing tenant: ${tenantData.business_name} (${tenantPrefix})`);
        
        // Execute procedure for specific tenant
        const { data: result, error } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
          p_calculation_date: new Date().toISOString().split('T')[0],
          p_tenant_id: tenantData.id
        });
        
        if (error) {
          console.error(`❌ Error for tenant ${tenantPrefix}:`, error);
        } else {
          console.log(`✅ Result for ${tenantPrefix}:`, {
            success: result.success,
            processed_tenants: result.processed_tenants,
            periods_processed: result.periods_processed,
            total_metrics_created: result.total_metrics_created
          });
        }
        
        // Check what was actually created
        const { data: metrics } = await client
          .from('tenant_metrics')
          .select('period, created_at')
          .eq('tenant_id', tenantData.id)
          .order('created_at', { ascending: false });
        
        if (metrics) {
          console.log(`📊 Created metrics for ${tenantPrefix}:`, metrics.map(m => m.period).sort());
        }
      }
    }
    
    console.log('\n2️⃣ Checking data differences...');
    
    // Check appointments data for these tenants
    for (const tenantPrefix of problemTenants) {
      const { data: tenantData } = await client
        .from('tenants')
        .select('id, business_name')
        .like('id', `${tenantPrefix}%`)
        .single();
      
      if (tenantData) {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const { count: appointmentCount } = await client
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantData.id)
          .gte('start_time', thirtyDaysAgo.toISOString())
          .lt('start_time', today.toISOString());
        
        console.log(`📅 Appointments in 30d for ${tenantPrefix}: ${appointmentCount || 0}`);
        
        // Check conversations
        const { count: conversationCount } = await client
          .from('conversation_history')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantData.id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .lt('created_at', today.toISOString());
        
        console.log(`💬 Conversations in 30d for ${tenantPrefix}: ${conversationCount || 0}`);
      }
    }
    
    console.log('\n3️⃣ Testing store_tenant_metric function directly...');
    
    // Test the store function directly
    const testMetric = {
      tenant_id: 'f34d8c94-ddb0-423c-9fc9-b9b0932b7c95', // Full ID
      metric_type: 'comprehensive',
      period: '30d',
      metric_data: { test: 'debug_30d_fix' }
    };
    
    try {
      const { data: storeResult, error: storeError } = await client.rpc('store_tenant_metric', {
        p_tenant_id: testMetric.tenant_id,
        p_metric_type: testMetric.metric_type,
        p_metric_data: testMetric.metric_data,
        p_period: testMetric.period
      });
      
      if (storeError) {
        console.error('❌ store_tenant_metric error:', storeError);
      } else {
        console.log('✅ store_tenant_metric test successful');
      }
    } catch (err) {
      console.error('❌ store_tenant_metric exception:', err.message);
    }
    
    console.log('\n4️⃣ Hypothesis: Checking for constraint violations or unique conflicts...');
    
    // Check for any constraint issues
    const { data: existingMetrics } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, created_at, updated_at')
      .in('tenant_id', problemTenants.map(t => `${t}%`));
    
    console.log('📊 Existing metrics for problem tenants:', existingMetrics);
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugMissing30d();