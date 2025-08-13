const { createClient } = require('@supabase/supabase-js');

async function testPlatformService() {
  console.log('🧪 Testando busca de dados do PlatformAggregationService...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Test the exact query that the service uses
    console.log('🔍 Executando query exata do serviço...');
    
    const { data, error } = await supabase
      .from("platform_metrics")
      .select("*")
      .eq("period", "30d")
      .eq("platform_id", "PLATFORM")
      .eq("metric_type", "comprehensive")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('❌ Erro na query:', error);
      return;
    }

    console.log('✅ Dados encontrados:', !!data);
    if (data) {
      console.log('📊 Raw Data Keys:', Object.keys(data));
      console.log('📋 Basic Info:');
      console.log(`   ID: ${data.id}`);
      console.log(`   Platform ID: ${data.platform_id}`);
      console.log(`   Period: ${data.period}`);
      console.log(`   Metric Type: ${data.metric_type}`);
      console.log(`   Created: ${data.created_at}`);
      
      if (data.metric_data) {
        console.log('\n📊 Metric Data Structure:');
        console.log('   Top Level Keys:', Object.keys(data.metric_data));
        
        const financial = data.metric_data.financial_metrics;
        if (financial) {
          console.log('\n💰 Financial Metrics:');
          console.log(`   Platform MRR: R$ ${financial.platform_mrr}`);
          console.log(`   Total Revenue: R$ ${financial.total_tenant_revenue}`);
          console.log(`   Margin: R$ ${financial.total_platform_margin}`);
        }
        
        const appointments = data.metric_data.appointment_metrics;
        if (appointments) {
          console.log('\n📅 Appointment Metrics:');
          console.log(`   Total Appointments: ${appointments.total_appointments}`);
          console.log(`   Success Rate: ${appointments.avg_success_rate}%`);
        }
        
        const tenants = data.metric_data.tenant_outcomes;
        if (tenants) {
          console.log('\n👥 Tenant Outcomes:');
          console.log(`   Active Tenants: ${tenants.active_tenants}`);
          console.log(`   Health Rating: ${tenants.platform_health_rating}`);
        }
      }
      
      // Test data extraction like the service does
      console.log('\n🔧 Testando extração como o serviço...');
      
      const rawData = data;
      const metricData = rawData.metric_data || {};
      const financial = metricData.financial_metrics || {};
      const appointments = metricData.appointment_metrics || {};
      const tenants = metricData.tenant_outcomes || {};
      const conversations = metricData.conversation_outcomes || {};
      
      console.log('📊 Extracted Values:');
      console.log(`   Active Tenants: ${tenants.active_tenants || 0}`);
      console.log(`   Total Revenue: ${financial.total_tenant_revenue || 0}`);
      console.log(`   Total Appointments: ${appointments.total_appointments || 0}`);
      console.log(`   Total Conversations: ${conversations.total_conversations || 0}`);
      console.log(`   Platform MRR: ${financial.platform_mrr || 0}`);
      console.log(`   Operational Efficiency: ${appointments.avg_success_rate || 0}%`);
    }

  } catch (error) {
    console.error('❌ Erro durante teste:', error);
  }
}

// Load environment variables
require('dotenv').config();

testPlatformService();