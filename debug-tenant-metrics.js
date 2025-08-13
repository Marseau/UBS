const { createClient } = require('@supabase/supabase-js');

async function debugTenantMetrics() {
  console.log('🔍 Debugando dados reais dos tenant_metrics...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check recent tenant_metrics data
    console.log('📊 Buscando dados recentes dos tenant_metrics...');
    
    const { data: recentData, error: recentError } = await supabase
      .from('tenant_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error('❌ Erro ao buscar dados recentes:', recentError);
      return;
    }

    console.log(`✅ Encontrados ${recentData.length} registros recentes`);
    
    recentData.forEach((record, index) => {
      console.log(`\n📋 Registro ${index + 1}:`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Tenant ID: ${record.tenant_id}`);
      console.log(`   Period: ${record.period}`);
      console.log(`   Metric Type: ${record.metric_type}`);
      console.log(`   Created: ${record.created_at}`);
      
      if (record.metric_data) {
        console.log('   Metric Data Keys:', Object.keys(record.metric_data));
        
        const data = record.metric_data;
        console.log('   Sample Values:');
        console.log(`     total_revenue: ${data.total_revenue}`);
        console.log(`     total_appointments: ${data.total_appointments}`);
        console.log(`     platform_subscription_cost: ${data.platform_subscription_cost}`);
        console.log(`     active_tenants: ${data.active_tenants}`);
        
        if (data.total_revenue && data.total_revenue > 0) {
          console.log('   🎯 DADOS COM RECEITA ENCONTRADOS!');
          console.log('   Full Metric Data:', JSON.stringify(data, null, 2).substring(0, 500));
        }
      }
    });

    // Check for comprehensive metrics specifically
    console.log('\n🔍 Buscando métricas comprehensive especificamente...');
    
    const { data: comprehensiveData, error: compError } = await supabase
      .from('tenant_metrics')
      .select('*')
      .eq('metric_type', 'comprehensive')
      .eq('period', '30d')
      .not('metric_data->total_revenue', 'is', null);

    if (compError) {
      console.error('❌ Erro ao buscar comprehensive:', compError);
    } else {
      console.log(`✅ Encontrados ${comprehensiveData.length} registros comprehensive com receita`);
      
      let totalRevenue = 0;
      let totalAppointments = 0;
      let totalMRR = 0;
      
      comprehensiveData.forEach(record => {
        const data = record.metric_data;
        if (data) {
          totalRevenue += data.total_revenue || 0;
          totalAppointments += data.total_appointments || 0;
          totalMRR += data.platform_subscription_cost || 0;
        }
      });
      
      console.log('\n📊 TOTAIS REAIS:');
      console.log(`   Total Revenue: R$ ${totalRevenue.toFixed(2)}`);
      console.log(`   Total Appointments: ${totalAppointments}`);
      console.log(`   Platform MRR: R$ ${totalMRR.toFixed(2)}`);
      console.log(`   Tenants com dados: ${comprehensiveData.length}`);
    }

    // Check for any non-zero revenue data
    console.log('\n🔍 Buscando QUALQUER dados com receita > 0...');
    
    const { data: anyRevenueData, error: anyError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, metric_data')
      .gt('metric_data->total_revenue', 0)
      .limit(10);

    if (anyError) {
      console.error('❌ Erro ao buscar dados com receita:', anyError);
    } else {
      console.log(`✅ Encontrados ${anyRevenueData.length} registros com receita > 0`);
      
      anyRevenueData.forEach((record, index) => {
        console.log(`\n💰 Registro ${index + 1} com receita:`);
        console.log(`   Tenant: ${record.tenant_id}, Period: ${record.period}, Type: ${record.metric_type}`);
        console.log(`   Revenue: R$ ${record.metric_data.total_revenue}`);
        console.log(`   Appointments: ${record.metric_data.total_appointments}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro durante debug:', error);
  }
}

// Load environment variables
require('dotenv').config();

debugTenantMetrics();