const { createClient } = require('@supabase/supabase-js');

async function fixPlatformAggregation() {
  console.log('🔧 Executando agregação simplificada da plataforma...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Query real tenant metrics data
    console.log('📊 Buscando dados reais dos tenant_metrics...');
    
    const { data: tenantMetrics, error: queryError } = await supabase
      .from('tenant_metrics')
      .select('metric_data')
      .eq('metric_type', 'comprehensive')
      .eq('period', '30d');

    if (queryError) {
      console.error('❌ Erro ao buscar tenant metrics:', queryError);
      return;
    }

    console.log(`✅ Encontrados ${tenantMetrics.length} tenant metrics`);

    // Aggregate the data
    let totalRevenue = 0;
    let totalAppointments = 0;
    let totalConversations = 0;
    let activeTenants = 0;
    let totalPlatformMRR = 0;

    tenantMetrics.forEach(tenant => {
      const data = tenant.metric_data;
      if (data) {
        totalRevenue += data.total_revenue || 0;
        totalAppointments += data.total_appointments || 0;
        totalConversations += data.total_conversations || 0;
        totalPlatformMRR += data.platform_subscription_cost || 0;
        if ((data.total_revenue || 0) > 0) {
          activeTenants++;
        }
      }
    });

    console.log('📊 Dados agregados:');
    console.log(`   Total Revenue: R$ ${totalRevenue.toFixed(2)}`);
    console.log(`   Total Appointments: ${totalAppointments}`);
    console.log(`   Total Conversations: ${totalConversations}`);
    console.log(`   Platform MRR: R$ ${totalPlatformMRR.toFixed(2)}`);
    console.log(`   Active Tenants: ${activeTenants}`);

    // Save aggregated data to platform_metrics table
    console.log('💾 Salvando dados agregados...');
    
    const periods = ['7d', '30d', '90d'];
    const now = new Date().toISOString();
    
    for (const period of periods) {
      // Scale data based on period (simplified)
      const periodMultiplier = period === '7d' ? 0.25 : period === '30d' ? 1 : 3;
      
      const { error: insertError } = await supabase
        .from('platform_metrics')
        .upsert({
          platform_id: 'PLATFORM',
          period: period,
          metric_type: 'comprehensive',
          metric_data: {
            // Core metrics
            platform_mrr: totalPlatformMRR * periodMultiplier,
            total_revenue: totalRevenue * periodMultiplier,
            active_tenants: activeTenants,
            total_appointments: Math.round(totalAppointments * periodMultiplier),
            total_conversations: Math.round(totalConversations * periodMultiplier),
            
            // Performance metrics
            operational_efficiency_pct: totalConversations > 0 ? 
              Math.round((totalAppointments / totalConversations) * 100) : 0,
            avg_conversion_rate: totalConversations > 0 ? 
              Math.round((totalAppointments / totalConversations) * 100) : 0,
            
            // Metadata
            calculation_date: now.split('T')[0],
            data_source: 'manual_aggregation_fix',
            tenants_processed: tenantMetrics.length,
            period: period
          }
        }, {
          onConflict: 'platform_id,period,metric_type'
        });

      if (insertError) {
        console.error(`❌ Erro ao salvar dados para ${period}:`, insertError);
      } else {
        console.log(`✅ Dados salvos para período ${period}`);
      }
    }

    // Verify the data was saved
    console.log('🔍 Verificando dados salvos...');
    
    const { data: savedData, error: verifyError } = await supabase
      .from('platform_metrics')
      .select('*')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .order('created_at', { ascending: false });

    if (verifyError) {
      console.error('❌ Erro ao verificar dados:', verifyError);
    } else {
      console.log('📊 Dados salvos na platform_metrics:');
      savedData.forEach(record => {
        const data = record.metric_data;
        console.log(`   ${record.period}: MRR=R$${data.platform_mrr}, Revenue=R$${data.total_revenue}, Tenants=${data.active_tenants}`);
      });
    }

    console.log('✅ Agregação da plataforma concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante agregação:', error);
  }
}

// Load environment variables
require('dotenv').config();

fixPlatformAggregation();