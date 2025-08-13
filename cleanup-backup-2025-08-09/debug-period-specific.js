/**
 * DEBUG PERIOD SPECIFIC
 * Verificar dados por período específico (7, 30, 90 dias)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugPeriodSpecific() {
  console.log('📅 DEBUGANDO DADOS POR PERÍODO ESPECÍFICO');
  console.log('='.repeat(60));

  try {
    // 1. Verificar registro na platform_metrics (que período foi usado?)
    console.log('\n📊 1. PLATFORM_METRICS - PERÍODO USADO:');
    const { data: platformData, error: pmError } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (pmError) {
      console.log('❌ Erro:', pmError);
      return;
    }

    if (platformData && platformData.length > 0) {
      const record = platformData[0];
      console.log(`✅ Registro da platform_metrics:`);
      console.log(`   Período: ${record.period_days} dias`);
      console.log(`   Data cálculo: ${record.calculation_date}`);
      console.log(`   Tenants: ${record.active_tenants}`);
      console.log(`   Conversas: ${record.total_conversations}`);
      console.log(`   Appointments: ${record.total_appointments}`);
      console.log(`   MRR: R$ ${record.platform_mrr}`);
      console.log(`   Data source: ${record.data_source}`);
    }

    // 2. Dados reais por período
    const periods = [7, 30, 90];
    
    for (const days of periods) {
      console.log(`\n📊 2. DADOS REAIS - ÚLTIMOS ${days} DIAS:`);
      
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // Conversas
      const { data: conversations, error: convError } = await supabase
        .from('conversation_history')
        .select('tenant_id, conversation_outcome')
        .not('conversation_outcome', 'is', null)
        .gte('created_at', daysAgo.toISOString());

      if (convError) {
        console.log(`❌ Erro conversas ${days}d:`, convError);
      } else {
        const conversasPorTenant = {};
        conversations?.forEach(conv => {
          if (!conversasPorTenant[conv.tenant_id]) {
            conversasPorTenant[conv.tenant_id] = 0;
          }
          conversasPorTenant[conv.tenant_id]++;
        });

        const totalConversas = conversations?.length || 0;
        const tenantsComConversas = Object.keys(conversasPorTenant).length;
        
        console.log(`   💬 Conversas: ${totalConversas}`);
        console.log(`   🏢 Tenants com conversas: ${tenantsComConversas}`);
      }

      // Appointments
      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select('tenant_id, status')
        .gte('created_at', daysAgo.toISOString());

      if (appError) {
        console.log(`❌ Erro appointments ${days}d:`, appError);
      } else {
        const appointmentsPorTenant = {};
        appointments?.forEach(app => {
          if (!appointmentsPorTenant[app.tenant_id]) {
            appointmentsPorTenant[app.tenant_id] = 0;
          }
          appointmentsPorTenant[app.tenant_id]++;
        });

        const totalAppointments = appointments?.length || 0;
        const tenantsComAppointments = Object.keys(appointmentsPorTenant).length;
        
        console.log(`   📅 Appointments: ${totalAppointments}`);
        console.log(`   🏢 Tenants com appointments: ${tenantsComAppointments}`);
      }
    }

    // 3. Tenants ativos totais
    console.log('\n📊 3. TENANTS ATIVOS (ATUAL):');
    const { data: activeTenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, business_name, status, subscription_plan')
      .eq('status', 'active');

    if (tenantError) {
      console.log('❌ Erro tenants:', tenantError);
    } else {
      console.log(`   🏢 Total tenants ativos: ${activeTenants?.length || 0}`);
    }

    // 4. Todos os tenants (incluindo inativos)
    console.log('\n📊 4. TODOS OS TENANTS:');
    const { data: allTenants, error: allTenantError } = await supabase
      .from('tenants')
      .select('id, business_name, status, subscription_plan');

    if (allTenantError) {
      console.log('❌ Erro todos os tenants:', allTenantError);
    } else {
      const byStatus = {};
      allTenants?.forEach(tenant => {
        if (!byStatus[tenant.status]) {
          byStatus[tenant.status] = 0;
        }
        byStatus[tenant.status]++;
      });

      console.log(`   🏢 Total geral: ${allTenants?.length || 0} tenants`);
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} tenants`);
      });
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📅 DEBUG POR PERÍODO CONCLUÍDO');
}

debugPeriodSpecific();