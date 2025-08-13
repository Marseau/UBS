/**
 * SCRIPT CONSOLIDADO DE POPULAÇÃO DE MÉTRICAS
 * 
 * Executa as totalizações completas:
 * - 41 campos de conversation_history 
 * - 27 campos de appointments
 * - Para períodos 7d, 30d, 90d
 * - Popula tenant_metrics com metric_types específicos
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { calculateConversationTotals } = require('./calculate-conversation-totals');
const { calculateAppointmentTotals } = require('./calculate-appointment-totals');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Buscar tenants ativos com atividade nos últimos 90 dias
 */
async function getActiveTenants() {
  console.log('🔍 Buscando tenants ativos...');
  
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, name, domain, status');
  
  if (error) {
    throw new Error(`Erro ao buscar tenants: ${error.message}`);
  }
  
  // Verificar atividade recente para cada tenant
  const activeTenantsPromises = tenants.map(async (tenant) => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    // Verificar conversas recentes
    const { count: conversationCount } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', ninetyDaysAgo.toISOString());
    
    // Verificar appointments recentes
    const { count: appointmentCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('start_time', ninetyDaysAgo.toISOString());
    
    return {
      ...tenant,
      has_recent_activity: (conversationCount || 0) > 0 || (appointmentCount || 0) > 0
    };
  });
  
  const tenantsWithActivity = await Promise.all(activeTenantsPromises);
  const activeTenants = tenantsWithActivity.filter(t => t.has_recent_activity);
  
  console.log(`✅ Encontrados ${activeTenants.length} tenants ativos de ${tenants.length} total`);
  return activeTenants;
}

/**
 * Inserir/atualizar métricas na tabela tenant_metrics
 */
async function upsertTenantMetrics(tenantId, period, metricType, metricData) {
  // Primeiro, deletar registro existente (se houver)
  const { error: deleteError } = await supabase
    .from('tenant_metrics')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('period', period)
    .eq('metric_type', metricType);
  
  if (deleteError) {
    console.warn(`⚠️ Aviso ao deletar registro existente: ${deleteError.message}`);
  }
  
  // Inserir novo registro
  const { error: insertError } = await supabase
    .from('tenant_metrics')
    .insert({
      tenant_id: tenantId,
      period: period,
      metric_type: metricType,
      metric_data: metricData,
      calculated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  
  if (insertError) {
    throw new Error(`Erro ao inserir métrica ${metricType}: ${insertError.message}`);
  }
}

/**
 * Calcular e inserir métricas para um tenant específico
 */
async function processTenantMetrics(tenant) {
  console.log(`\n🏢 Processando tenant: ${tenant.name} (${tenant.domain})`);
  
  const periods = [
    { name: '7d', days: 7 },
    { name: '30d', days: 30 },
    { name: '90d', days: 90 }
  ];
  
  let totalMetricsInserted = 0;
  
  for (const period of periods) {
    console.log(`  📊 Período: ${period.name}`);
    
    try {
      // 1. CALCULAR CONVERSATION TOTALS (41 campos)
      console.log(`    💬 Calculando conversation_totals...`);
      const conversationTotals = await calculateConversationTotals(tenant.id, period.days);
      
      await upsertTenantMetrics(
        tenant.id, 
        period.name, 
        'conversation_totals', 
        conversationTotals
      );
      totalMetricsInserted++;
      
      // 2. CALCULAR APPOINTMENT TOTALS (27 campos)
      console.log(`    📅 Calculando appointment_totals...`);
      const appointmentTotals = await calculateAppointmentTotals(tenant.id, period.days);
      
      await upsertTenantMetrics(
        tenant.id, 
        period.name, 
        'appointment_totals', 
        appointmentTotals
      );
      totalMetricsInserted++;
      
      console.log(`    ✅ ${period.name} concluído`);
      
    } catch (error) {
      console.error(`    ❌ Erro no período ${period.name}: ${error.message}`);
      // Continuar com próximo período mesmo se um falhar
    }
  }
  
  console.log(`  ✅ Tenant concluído: ${totalMetricsInserted} métricas inseridas`);
  return totalMetricsInserted;
}

/**
 * Executar população completa de métricas
 */
async function executeConsolidatedMetricsPopulation() {
  const startTime = Date.now();
  console.log('🚀 INICIANDO POPULAÇÃO CONSOLIDADA DE MÉTRICAS');
  console.log('📋 Totalizações: 41 conversation_history + 27 appointments');
  console.log('📅 Períodos: 7d, 30d, 90d');
  console.log(`🕐 Início: ${new Date().toLocaleString('pt-BR')}\n`);
  
  let totalTenantsProcessed = 0;
  let totalMetricsInserted = 0;
  let errors = [];
  
  try {
    // 1. Buscar tenants ativos
    const activeTenants = await getActiveTenants();
    
    if (activeTenants.length === 0) {
      console.log('⚠️ Nenhum tenant ativo encontrado. Finalizando.');
      return;
    }
    
    // 2. Processar cada tenant
    for (const tenant of activeTenants) {
      try {
        const metricsInserted = await processTenantMetrics(tenant);
        totalMetricsInserted += metricsInserted;
        totalTenantsProcessed++;
        
        // Pequena pausa entre tenants para não sobrecarregar o banco
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Erro crítico no tenant ${tenant.name}: ${error.message}`);
        errors.push({
          tenant: tenant.name,
          error: error.message
        });
        // Continuar com próximo tenant mesmo se um falhar completamente
      }
    }
    
    // 3. Verificar resultados finais
    console.log('\n📊 Verificando população na tabela tenant_metrics...');
    const { count: finalCount } = await supabase
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true })
      .in('metric_type', ['conversation_totals', 'appointment_totals']);
    
    // 4. Relatório final
    const endTime = Date.now();
    const executionTime = Math.round((endTime - startTime) / 1000);
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 RELATÓRIO FINAL - POPULAÇÃO CONSOLIDADA DE MÉTRICAS');
    console.log('='.repeat(70));
    console.log(`🕐 Executado em: ${new Date().toLocaleString('pt-BR')}`);
    console.log(`⏱️ Tempo de execução: ${executionTime}s`);
    console.log(`🏢 Tenants processados: ${totalTenantsProcessed}/${activeTenants.length}`);
    console.log(`📊 Métricas inseridas: ${totalMetricsInserted}`);
    console.log(`📈 Total na tabela: ${finalCount} registros`);
    console.log(`🎯 Esperado por tenant: 6 registros (3 períodos × 2 metric_types)`);
    console.log(`❌ Erros: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ ERROS ENCONTRADOS:');
      errors.forEach((err, index) => {
        console.log(`   ${index + 1}. ${err.tenant}: ${err.error}`);
      });
    }
    
    console.log('\n✅ POPULAÇÃO CONSOLIDADA CONCLUÍDA');
    console.log('📋 Dados disponíveis para:');
    console.log('   - Dashboard de tenant (41 métricas de conversas)');
    console.log('   - Analytics de appointments (27 métricas de agendamentos)');
    console.log('   - Análises comparativas por período (7d vs 30d vs 90d)');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO NA POPULAÇÃO:', error.message);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  executeConsolidatedMetricsPopulation()
    .then(() => {
      console.log('\n🎉 Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falha na execução:', error.message);
      process.exit(1);
    });
}

module.exports = {
  executeConsolidatedMetricsPopulation,
  processTenantMetrics,
  getActiveTenants
};