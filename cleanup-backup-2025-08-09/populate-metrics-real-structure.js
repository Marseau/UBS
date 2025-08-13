/**
 * SCRIPT CORRETO - População baseada na estrutura REAL do banco
 * 
 * Estrutura real identificada:
 * - tenants: id, name, status, domain
 * - appointments: id, tenant_id, user_id, final_price, quoted_price, start_time, status
 * - conversation_history: id, tenant_id, user_id, conversation_outcome, confidence_score
 * 
 * Períodos corretos: 7d, 30d, 90d
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PERÍODOS CORRETOS CONFIRMADOS
const PERIODS = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 }
];

/**
 * Calcula revenue_tenant baseado na estrutura real - CORRIGIDO
 */
async function calculateRealRevenueTenant(tenantId, periodDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Query baseada na estrutura REAL da tabela appointments - CORRIGIDO
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, final_price, quoted_price, user_id')
    .eq('tenant_id', tenantId)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', new Date().toISOString()) // ✅ EXCLUIR AGENDAMENTOS FUTUROS
    .in('status', ['completed', 'confirmed']);

  if (error) {
    console.error(`Erro ao buscar appointments: ${error.message}`);
    return null;
  }

  if (!appointments || appointments.length === 0) {
    return {
      period_days: periodDays,
      total_revenue: 0,
      unique_customers: 0,
      total_appointments: 0,
      revenue_per_customer: 0,
      avg_appointment_value: 0,
      calculated_at: new Date().toISOString()
    };
  }

  // Cálculos baseados nos dados reais - LÓGICA CORRIGIDA
  const totalRevenue = appointments.reduce((sum, apt) => {
    // Usar quoted_price se final_price for null ou zero
    const price = (apt.final_price && apt.final_price > 0) ? 
                  parseFloat(apt.final_price) : 
                  parseFloat(apt.quoted_price || 0);
    return sum + price;
  }, 0);

  const uniqueCustomers = new Set(appointments.map(apt => apt.user_id)).size;
  const totalAppointments = appointments.length;
  const revenuePerCustomer = uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;
  const avgAppointmentValue = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

  return {
    period_days: periodDays,
    total_revenue: totalRevenue,
    unique_customers: uniqueCustomers,
    total_appointments: totalAppointments,
    revenue_per_customer: revenuePerCustomer,
    avg_appointment_value: avgAppointmentValue,
    calculated_at: new Date().toISOString()
  };
}

/**
 * Calcula conversion_rate baseado na estrutura real
 */
async function calculateRealConversionRate(tenantId, periodDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Query baseada na estrutura REAL da tabela conversation_history
  const { data: conversations, error } = await supabase
    .from('conversation_history')
    .select('id, conversation_outcome, confidence_score')
    .eq('tenant_id', tenantId)
    .gte('created_at', startDate.toISOString());

  if (error) {
    console.warn(`Aviso ao buscar conversations: ${error.message}`);
    return {
      period_days: periodDays,
      total_conversations: 0,
      successful_conversions: 0,
      conversion_rate: 0,
      avg_confidence: 0,
      calculated_at: new Date().toISOString()
    };
  }

  const totalConversations = conversations?.length || 0;
  const successfulConversions = conversations?.filter(c => 
    c.conversation_outcome === 'appointment_scheduled' || 
    c.conversation_outcome === 'converted'
  ).length || 0;

  const avgConfidence = conversations?.length > 0 ? 
    conversations.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / conversations.length : 0;

  const conversionRate = totalConversations > 0 ? 
    (successfulConversions / totalConversations) * 100 : 0;

  return {
    period_days: periodDays,
    total_conversations: totalConversations,
    successful_conversions: successfulConversions,
    conversion_rate: conversionRate,
    avg_confidence: avgConfidence,
    calculated_at: new Date().toISOString()
  };
}

/**
 * Popula métricas para um tenant usando estrutura real
 */
async function populateMetricsForRealTenant(tenant) {
  console.log(`📊 ${tenant.name} (${tenant.domain})`);

  for (const period of PERIODS) {
    try {
      // 1. Revenue tenant com estrutura real - CORRIGIDO
      const revenueData = await calculateRealRevenueTenant(tenant.id, period.days);
      if (revenueData) {
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'revenue_tenant',
          period: period.key,
          metric_data: revenueData,
          calculated_at: new Date().toISOString()
        });
      }

      // 2. Conversion rate com estrutura real
      const conversionData = await calculateRealConversionRate(tenant.id, period.days);
      await supabase.from('tenant_metrics').insert({
        tenant_id: tenant.id,
        metric_type: 'conversion_rate',
        period: period.key,
        metric_data: conversionData,
        calculated_at: new Date().toISOString()
      });

      console.log(`   ${period.key}: R$ ${revenueData?.total_revenue?.toFixed(2) || '0.00'}, ${revenueData?.total_appointments || 0} appt`);

    } catch (error) {
      console.error(`   Erro ${period.key}: ${error.message}`);
    }
  }
}

/**
 * Calcula métricas da plataforma baseado em dados reais
 */
async function calculateRealPlatformMetrics(periodDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Appointments reais do período - CORRIGIDO TAMBÉM AQUI
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, final_price, quoted_price, tenant_id, user_id')
    .gte('start_time', startDate.toISOString())
    .lte('start_time', new Date().toISOString()) // ✅ EXCLUIR AGENDAMENTOS FUTUROS
    .in('status', ['completed', 'confirmed']);

  // Conversations reais do período  
  const { data: conversations } = await supabase
    .from('conversation_history')
    .select('id, tenant_id, conversation_outcome')
    .gte('created_at', startDate.toISOString());

  // Cálculos baseados em dados reais - LÓGICA CORRIGIDA TAMBÉM AQUI
  const totalRevenue = appointments?.reduce((sum, apt) => {
    const price = (apt.final_price && apt.final_price > 0) ? 
                  parseFloat(apt.final_price) : 
                  parseFloat(apt.quoted_price || 0);
    return sum + price;
  }, 0) || 0;

  const totalAppointments = appointments?.length || 0;
  const uniqueCustomers = new Set(appointments?.map(apt => apt.user_id) || []).size;
  const activeTenants = new Set(appointments?.map(apt => apt.tenant_id) || []).size;
  
  const totalConversations = conversations?.length || 0;
  const validConversations = conversations?.filter(c => 
    c.conversation_outcome && c.conversation_outcome !== 'spam'
  ).length || 0;

  const spamRate = totalConversations > 0 ? 
    ((totalConversations - validConversations) / totalConversations) * 100 : 0;

  // Inserir na platform_metrics
  await supabase.from('platform_metrics').insert({
    calculation_date: new Date().toISOString().split('T')[0],
    period_days: periodDays,
    data_source: 'real_structure_script',
    revenue_tenant: totalRevenue, // ✅ NOVO CAMPO ESPECÍFICO PARA REVENUE DOS TENANTS
    total_revenue: totalRevenue, // Manter compatibilidade temporária
    total_appointments: totalAppointments,
    total_customers: uniqueCustomers,
    active_tenants: activeTenants,
    platform_mrr: 0, // ✅ CORRIGIDO: platform_mrr deve vir de subscription_payments, não de appointments
    total_conversations: totalConversations,
    total_valid_conversations: validConversations,
    total_spam_conversations: totalConversations - validConversations,
    spam_rate_pct: spamRate,
    platform_health_score: Math.max(0, 100 - spamRate),
    platform_quality_score: validConversations / Math.max(1, totalConversations)
  });

  console.log(`🏢 Plataforma ${periodDays}d: R$ ${totalRevenue.toFixed(2)}, ${totalAppointments} appointments, ${activeTenants} tenants`);
}

/**
 * Execução principal
 */
async function executeRealPopulation() {
  console.log('🚀 POPULAÇÃO COM ESTRUTURA REAL DO BANCO');
  console.log('📅 ' + new Date().toLocaleString('pt-BR'));
  console.log('🔄 Períodos: 7d, 30d, 90d');
  console.log('=' .repeat(60));

  try {
    // 1. Buscar tenants ativos (estrutura real confirmada)
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, name, domain')
      .eq('status', 'active');

    if (error) {
      throw new Error(`Erro ao buscar tenants: ${error.message}`);
    }

    console.log(`📋 ${tenants.length} tenants ativos encontrados\n`);

    // 2. Popular métricas por tenant
    for (const tenant of tenants) {
      await populateMetricsForRealTenant(tenant);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🏢 CALCULANDO MÉTRICAS DA PLATAFORMA...');

    // 3. Calcular métricas da plataforma
    for (const period of PERIODS) {
      await calculateRealPlatformMetrics(period.days);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 4. Verificar resultados
    const { data: tenantMetrics } = await supabase
      .from('tenant_metrics')
      .select('id', { count: 'exact' });

    const { data: platformMetrics } = await supabase
      .from('platform_metrics')
      .select('id', { count: 'exact' });

    console.log('\n✅ POPULAÇÃO CONCLUÍDA:');
    console.log(`   Tenant metrics: ${tenantMetrics?.length || 0} registros`);
    console.log(`   Platform metrics: ${platformMetrics?.length || 0} registros`);
    console.log(`   Períodos: 7d, 30d, 90d`);

  } catch (error) {
    console.error('❌ Erro na população:', error.message);
    throw error;
  }
}

// Executar
if (require.main === module) {
  executeRealPopulation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Erro crítico:', error.message);
      process.exit(1);
    });
}

module.exports = { executeRealPopulation };