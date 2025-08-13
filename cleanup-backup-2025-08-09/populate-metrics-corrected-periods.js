/**
 * SCRIPT CORRIGIDO - População de Métricas com Períodos Corretos
 * 
 * Períodos corretos: 7d, 30d, 90d (removido all_time)
 * Baseado na validação real dos dados existentes
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PERÍODOS CORRETOS DEFINIDOS
const CORRECT_PERIODS = [
  { key: '7d', days: 7, name: '7 dias' },
  { key: '30d', days: 30, name: '30 dias' },
  { key: '90d', days: 90, name: '90 dias' }
];

// TIPOS DE MÉTRICAS IDENTIFICADOS NO SISTEMA
const METRIC_TYPES = [
  'revenue_per_customer',
  'conversion_rate', 
  'customer_lifetime_value',
  'external_appointment_ratio',
  'no_show_rate',
  'participation',
  'ranking',
  'trial_conversion_rate',
  'whatsapp_quality_score'
];

/**
 * Busca tenants ativos no sistema
 */
async function getActiveTenants() {
  console.log('🔍 Buscando tenants ativos...');
  
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, name, business_domain')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Erro ao buscar tenants: ${error.message}`);
  }

  console.log(`   ✅ ${tenants.length} tenants ativos encontrados`);
  return tenants;
}

/**
 * Calcula métrica revenue_per_customer para um período específico
 */
async function calculateRevenuePerCustomer(tenantId, periodDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Buscar appointments do período
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, final_price, quoted_price, user_id, start_time, status')
    .eq('tenant_id', tenantId)
    .gte('start_time', startDate.toISOString())
    .in('status', ['completed', 'confirmed']);

  if (error) {
    throw new Error(`Erro ao buscar appointments: ${error.message}`);
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

  // Calcular métricas
  const totalRevenue = appointments.reduce((sum, apt) => {
    return sum + (apt.final_price || apt.quoted_price || 0);
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
 * Calcula métrica de conversion_rate
 */
async function calculateConversionRate(tenantId, periodDays) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Buscar conversações do período
  const { data: conversations, error: convError } = await supabase
    .from('conversation_sessions')
    .select('id, outcome, tenant_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', startDate.toISOString());

  if (convError) {
    console.warn(`Aviso ao buscar conversações: ${convError.message}`);
    return {
      period_days: periodDays,
      total_conversations: 0,
      successful_conversions: 0,
      conversion_rate: 0,
      calculated_at: new Date().toISOString()
    };
  }

  const totalConversations = conversations?.length || 0;
  const successfulConversions = conversations?.filter(c => 
    c.outcome === 'appointment_scheduled' || c.outcome === 'converted'
  ).length || 0;

  const conversionRate = totalConversations > 0 ? 
    (successfulConversions / totalConversations) * 100 : 0;

  return {
    period_days: periodDays,
    total_conversations: totalConversations,
    successful_conversions: successfulConversions,
    conversion_rate: conversionRate,
    calculated_at: new Date().toISOString()
  };
}

/**
 * Popula métricas para um tenant específico
 */
async function populateMetricsForTenant(tenant) {
  console.log(`\n📊 Populando métricas para tenant: ${tenant.name} (${tenant.id})`);

  for (const period of CORRECT_PERIODS) {
    console.log(`   ⏱️ Calculando período: ${period.name}`);

    try {
      // 1. Revenue per customer
      const revenueMetric = await calculateRevenuePerCustomer(tenant.id, period.days);
      await supabase.from('tenant_metrics').insert({
        tenant_id: tenant.id,
        metric_type: 'revenue_per_customer',
        period: period.key,
        metric_data: revenueMetric,
        calculated_at: new Date().toISOString()
      });

      // 2. Conversion rate  
      const conversionMetric = await calculateConversionRate(tenant.id, period.days);
      await supabase.from('tenant_metrics').insert({
        tenant_id: tenant.id,
        metric_type: 'conversion_rate',
        period: period.key,
        metric_data: conversionMetric,
        calculated_at: new Date().toISOString()
      });

      console.log(`      ✅ ${period.name}: R$ ${revenueMetric.total_revenue.toFixed(2)}, ${revenueMetric.total_appointments} appointments`);

    } catch (error) {
      console.error(`      ❌ Erro no período ${period.name}: ${error.message}`);
    }
  }
}

/**
 * Calcula métricas agregadas da plataforma
 */
async function calculatePlatformMetrics(periodDays) {
  console.log(`\n🏢 Calculando métricas da plataforma (${periodDays} dias)...`);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  try {
    // Buscar todos os appointments do período
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select('id, final_price, quoted_price, tenant_id, user_id, start_time, status')
      .gte('start_time', startDate.toISOString())
      .in('status', ['completed', 'confirmed']);

    if (aptError) {
      throw new Error(`Erro ao buscar appointments: ${aptError.message}`);
    }

    // Buscar conversações do período
    const { data: conversations, error: convError } = await supabase
      .from('conversation_sessions')
      .select('id, tenant_id, outcome')
      .gte('created_at', startDate.toISOString());

    // Calcular métricas agregadas
    const totalRevenue = appointments?.reduce((sum, apt) => {
      return sum + (apt.final_price || apt.quoted_price || 0);
    }, 0) || 0;

    const totalAppointments = appointments?.length || 0;
    const uniqueCustomers = new Set(appointments?.map(apt => apt.user_id) || []).size;
    const activeTenants = new Set(appointments?.map(apt => apt.tenant_id) || []).size;
    
    const totalConversations = conversations?.length || 0;
    const validConversations = conversations?.filter(c => 
      c.outcome && c.outcome !== 'spam'
    ).length || 0;
    const spamConversations = totalConversations - validConversations;

    const spamRate = totalConversations > 0 ? 
      (spamConversations / totalConversations) * 100 : 0;

    // Inserir na tabela platform_metrics
    const { error: insertError } = await supabase
      .from('platform_metrics')
      .insert({
        calculation_date: new Date().toISOString().split('T')[0],
        period_days: periodDays,
        data_source: 'corrected_calculation_script',
        total_revenue: totalRevenue,
        total_appointments: totalAppointments,
        total_customers: uniqueCustomers,
        active_tenants: activeTenants,
        platform_mrr: totalRevenue, // Simplificado
        total_conversations: totalConversations,
        total_valid_conversations: validConversations,
        total_spam_conversations: spamConversations,
        spam_rate_pct: spamRate,
        platform_health_score: Math.max(0, 100 - spamRate), // Score baseado em spam
        platform_quality_score: validConversations / Math.max(1, totalConversations)
      });

    if (insertError) {
      throw new Error(`Erro ao inserir platform metrics: ${insertError.message}`);
    }

    console.log(`   ✅ Plataforma (${periodDays}d): R$ ${totalRevenue.toFixed(2)}, ${totalAppointments} appointments, ${activeTenants} tenants`);

  } catch (error) {
    console.error(`   ❌ Erro na plataforma (${periodDays}d): ${error.message}`);
  }
}

/**
 * Função principal - população completa
 */
async function populateAllMetricsCorrectPeriods() {
  console.log('🚀 POPULAÇÃO DE MÉTRICAS - PERÍODOS CORRETOS (7d, 30d, 90d)');
  console.log('📅 ' + new Date().toLocaleString('pt-BR'));
  console.log('=' .repeat(70));

  try {
    // 1. Buscar tenants ativos
    const tenants = await getActiveTenants();

    // 2. Popular métricas por tenant
    for (const tenant of tenants) {
      await populateMetricsForTenant(tenant);
      // Pequena pausa para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. Calcular métricas da plataforma para cada período
    for (const period of CORRECT_PERIODS) {
      await calculatePlatformMetrics(period.days);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 4. Verificar resultados
    const { data: tenantCount } = await supabase
      .from('tenant_metrics')
      .select('id', { count: 'exact' });

    const { data: platformCount } = await supabase
      .from('platform_metrics')
      .select('id', { count: 'exact' });

    console.log('\n📊 RESUMO DA POPULAÇÃO:');
    console.log('=' .repeat(50));
    console.log(`✅ Tenant metrics: ${tenantCount?.length || 0} registros`);
    console.log(`✅ Platform metrics: ${platformCount?.length || 0} registros`);
    console.log(`✅ Períodos implementados: ${CORRECT_PERIODS.map(p => p.key).join(', ')}`);
    console.log(`✅ População concluída com sucesso!`);

  } catch (error) {
    console.error('❌ Erro na população:', error.message);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  populateAllMetricsCorrectPeriods()
    .then(() => {
      console.log('\n🎉 População de métricas concluída!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Erro crítico:', error.message);
      process.exit(1);
    });
}

module.exports = {
  populateAllMetricsCorrectPeriods,
  CORRECT_PERIODS
};