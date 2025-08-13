/**
 * DEBUG PLATFORM METRICS
 * Consulta direta às tabelas de métricas para entender onde o dashboard busca dados
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugPlatformMetrics() {
  console.log('🔍 DEBUGANDO PLATFORM METRICS');
  console.log('='.repeat(60));

  try {
    // 1. Verificar tabela platform_metrics
    console.log('\n📊 1. TABELA PLATFORM_METRICS:');
    const { data: platformMetrics, error: pmError } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('calculation_date', { ascending: false })
      .limit(5);

    if (pmError) {
      console.log('❌ Erro ao buscar platform_metrics:', pmError);
    } else {
      console.log(`✅ Encontrados ${platformMetrics?.length || 0} registros`);
      if (platformMetrics?.length > 0) {
        platformMetrics.forEach((metric, i) => {
          console.log(`\n📅 Registro ${i + 1}:`);
          console.log(`   Data: ${metric.calculation_date}`);
          console.log(`   Período: ${metric.period_days} dias`);
          console.log(`   Tenants ativos: ${metric.active_tenants}`);
          console.log(`   Conversas: ${metric.total_conversations}`);
          console.log(`   Appointments: ${metric.total_appointments}`);
          console.log(`   MRR: R$ ${metric.platform_mrr}`);
          console.log(`   AI Interactions: ${metric.total_ai_interactions}`);
        });
      }
    }

    // 2. Verificar tabela tenant_metrics (usada para calcular platform)
    console.log('\n📊 2. TABELA TENANT_METRICS:');
    const { data: tenantMetrics, error: tmError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, period_days, metrics_date, metrics_data')
      .eq('period_days', 30)
      .order('metrics_date', { ascending: false })
      .limit(10);

    if (tmError) {
      console.log('❌ Erro ao buscar tenant_metrics:', tmError);
    } else {
      console.log(`✅ Encontrados ${tenantMetrics?.length || 0} registros para 30 dias`);
      if (tenantMetrics?.length > 0) {
        console.log('\n📋 TENANT METRICS (30 dias):');
        tenantMetrics.forEach((metric, i) => {
          const data = metric.metrics_data;
          console.log(`\n🏢 Tenant ${i + 1}:`);
          console.log(`   ID: ${metric.tenant_id}`);
          console.log(`   Data: ${metric.metrics_date}`);
          console.log(`   Conversas: ${data?.total_conversations || 0}`);
          console.log(`   Appointments: ${data?.total_appointments || 0}`);
          console.log(`   MRR: R$ ${data?.plan_price_brl || 0}`);
        });
      }
    }

    // 3. Verificar dados diretos de conversation_history
    console.log('\n📊 3. CONVERSATION_HISTORY (DADOS DIRETOS):');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: conversations, error: chError } = await supabase
      .from('conversation_history')
      .select('tenant_id, conversation_outcome, created_at')
      .not('conversation_outcome', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (chError) {
      console.log('❌ Erro ao buscar conversation_history:', chError);
    } else {
      console.log(`✅ Encontradas ${conversations?.length || 0} conversas nos últimos 30 dias`);
      
      // Agrupar por tenant
      const conversasPorTenant = {};
      conversations?.forEach(conv => {
        if (!conversasPorTenant[conv.tenant_id]) {
          conversasPorTenant[conv.tenant_id] = 0;
        }
        conversasPorTenant[conv.tenant_id]++;
      });

      console.log('\n💬 CONVERSAS POR TENANT (ÚLTIMOS 30 DIAS):');
      Object.entries(conversasPorTenant).forEach(([tenantId, count]) => {
        console.log(`   ${tenantId}: ${count} conversas`);
      });
    }

    // 4. Verificar appointments
    console.log('\n📊 4. APPOINTMENTS (DADOS DIRETOS):');
    const { data: appointments, error: apError } = await supabase
      .from('appointments')
      .select('tenant_id, status, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (apError) {
      console.log('❌ Erro ao buscar appointments:', apError);
    } else {
      console.log(`✅ Encontrados ${appointments?.length || 0} appointments nos últimos 30 dias`);
      
      // Agrupar por tenant
      const appointmentsPorTenant = {};
      appointments?.forEach(app => {
        if (!appointmentsPorTenant[app.tenant_id]) {
          appointmentsPorTenant[app.tenant_id] = 0;
        }
        appointmentsPorTenant[app.tenant_id]++;
      });

      console.log('\n📅 APPOINTMENTS POR TENANT (ÚLTIMOS 30 DIAS):');
      Object.entries(appointmentsPorTenant).forEach(([tenantId, count]) => {
        console.log(`   ${tenantId}: ${count} appointments`);
      });
    }

    // 5. Verificar tenants ativos
    console.log('\n📊 5. TENANTS ATIVOS:');
    const { data: tenants, error: tError } = await supabase
      .from('tenants')
      .select('id, business_name, status, subscription_plan')
      .eq('status', 'active');

    if (tError) {
      console.log('❌ Erro ao buscar tenants:', tError);
    } else {
      console.log(`✅ Encontrados ${tenants?.length || 0} tenants ativos`);
      tenants?.forEach((tenant, i) => {
        console.log(`   ${i + 1}. ${tenant.business_name} (${tenant.subscription_plan})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 DEBUG CONCLUÍDO');
}

debugPlatformMetrics();