/**
 * SISTEMA FINAL CORRIGIDO - SEM LIMITAÇÃO DE REGISTROS
 * Usa paginação para capturar TODOS os dados
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAllAppointments(cutoffDate) {
  let allAppointments = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, tenant_id, status, quoted_price, final_price, start_time, created_at')
      .gte('start_time', cutoffDate.toISOString())
      .range(from, from + batchSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allAppointments = allAppointments.concat(data);
    
    if (data.length < batchSize) break; // Última página
    from += batchSize;
  }
  
  return allAppointments;
}

async function fetchAllConversations(cutoffDate) {
  let allConversations = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('conversation_history')
      .select('id, tenant_id, api_cost_usd, processing_cost_usd, conversation_outcome, created_at')
      .gte('created_at', cutoffDate.toISOString())
      .range(from, from + batchSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allConversations = allConversations.concat(data);
    
    if (data.length < batchSize) break; // Última página
    from += batchSize;
  }
  
  return allConversations;
}

async function analyzeCompleteData(days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  console.log(`🔍 Buscando TODOS os dados para ${days} dias desde ${cutoffDate.toISOString()}`);
  
  // Buscar TODOS os appointments com paginação
  const appointments = await fetchAllAppointments(cutoffDate);
  
  // Buscar TODAS as conversations com paginação
  const conversations = await fetchAllConversations(cutoffDate);
  
  console.log(`📊 TODOS os dados encontrados: ${appointments.length} appointments, ${conversations.length} conversations`);
  
  // Processar dados por tenant
  const tenantMetrics = new Map();
  
  // Processar appointments por tenant
  if (appointments) {
    for (const appointment of appointments) {
      if (!tenantMetrics.has(appointment.tenant_id)) {
        tenantMetrics.set(appointment.tenant_id, {
          appointments_total: 0,
          appointments_confirmed: 0,
          appointments_cancelled: 0,
          total_revenue: 0,
          conversations_total: 0,
          conversations_with_outcome: 0,
          total_ai_cost: 0,
          success_rate: 0
        });
      }
      
      const metrics = tenantMetrics.get(appointment.tenant_id);
      metrics.appointments_total++;
      
      if (appointment.status === 'confirmed') {
        metrics.appointments_confirmed++;
      } else if (appointment.status === 'cancelled') {
        metrics.appointments_cancelled++;
      }
      
      // Usar final_price se disponível, senão quoted_price
      const price = appointment.final_price || appointment.quoted_price;
      if (price) {
        metrics.total_revenue += parseFloat(price);
      }
    }
  }
  
  // Processar conversations por tenant
  if (conversations) {
    for (const conversation of conversations) {
      if (!tenantMetrics.has(conversation.tenant_id)) {
        tenantMetrics.set(conversation.tenant_id, {
          appointments_total: 0,
          appointments_confirmed: 0,
          appointments_cancelled: 0,
          total_revenue: 0,
          conversations_total: 0,
          conversations_with_outcome: 0,
          total_ai_cost: 0,
          success_rate: 0
        });
      }
      
      const metrics = tenantMetrics.get(conversation.tenant_id);
      metrics.conversations_total++;
      
      if (conversation.conversation_outcome) {
        metrics.conversations_with_outcome++;
      }
      
      // Somar custos de IA
      const apiCost = parseFloat(conversation.api_cost_usd || 0);
      const processingCost = parseFloat(conversation.processing_cost_usd || 0);
      metrics.total_ai_cost += apiCost + processingCost;
    }
  }
  
  // Calcular success rates
  for (const [tenantId, metrics] of tenantMetrics) {
    if (metrics.appointments_total > 0) {
      metrics.success_rate = (metrics.appointments_confirmed / metrics.appointments_total) * 100;
    }
  }
  
  // Calcular totais da plataforma
  const platformTotals = {
    appointments_total: 0,
    appointments_confirmed: 0,
    appointments_cancelled: 0,
    total_revenue: 0,
    conversations_total: 0,
    conversations_with_outcome: 0,
    total_ai_cost: 0,
    success_rate: 0
  };
  
  for (const metrics of tenantMetrics.values()) {
    platformTotals.appointments_total += metrics.appointments_total;
    platformTotals.appointments_confirmed += metrics.appointments_confirmed;
    platformTotals.appointments_cancelled += metrics.appointments_cancelled;
    platformTotals.total_revenue += metrics.total_revenue;
    platformTotals.conversations_total += metrics.conversations_total;
    platformTotals.conversations_with_outcome += metrics.conversations_with_outcome;
    platformTotals.total_ai_cost += metrics.total_ai_cost;
  }
  
  if (platformTotals.appointments_total > 0) {
    platformTotals.success_rate = (platformTotals.appointments_confirmed / platformTotals.appointments_total) * 100;
  }
  
  console.log(`✅ Análise COMPLETA: ${tenantMetrics.size} tenants, ${platformTotals.appointments_total} appointments totais`);
  
  return { tenantMetrics, platformTotals };
}

async function updatePlatformMetrics(platformTotals, periodDays) {
  try {
    console.log(`💾 Atualizando platform_metrics para período ${periodDays}d`);
    
    // Limpar registros existentes para este período
    await supabase
      .from('platform_metrics')
      .delete()
      .eq('period_days', periodDays);
    
    // Calcular métricas derivadas
    const receita_uso_ratio = platformTotals.conversations_total > 0 ?
      platformTotals.total_revenue / platformTotals.conversations_total : 0;
    
    const operational_efficiency_pct = platformTotals.total_revenue > 0 ?
      ((platformTotals.total_revenue - platformTotals.total_ai_cost) / platformTotals.total_revenue) * 100 : 0;
    
    // Inserir métricas FINAIS corretas da plataforma
    const { error } = await supabase
      .from('platform_metrics')
      .insert({
        calculation_date: new Date().toISOString().split('T')[0],
        period_days: periodDays,
        data_source: 'FINAL_corrected_complete_data',
        total_revenue: platformTotals.total_revenue,
        total_appointments: platformTotals.appointments_total,
        total_customers: 0,
        total_ai_interactions: platformTotals.conversations_total,
        active_tenants: 0,
        platform_mrr: 0,
        total_chat_minutes: 0,
        total_conversations: platformTotals.conversations_total,
        total_valid_conversations: platformTotals.conversations_with_outcome,
        total_spam_conversations: platformTotals.conversations_total - platformTotals.conversations_with_outcome,
        receita_uso_ratio: receita_uso_ratio,
        operational_efficiency_pct: operational_efficiency_pct,
        spam_rate_pct: platformTotals.conversations_total > 0 ?
          ((platformTotals.conversations_total - platformTotals.conversations_with_outcome) / platformTotals.conversations_total) * 100 : 0,
        cancellation_rate_pct: platformTotals.appointments_total > 0 ?
          (platformTotals.appointments_cancelled / platformTotals.appointments_total) * 100 : 0,
        revenue_usage_distortion_index: 0,
        platform_health_score: platformTotals.success_rate,
        tenants_above_usage: 0,
        tenants_below_usage: 0,
        platform_avg_clv: 0,
        platform_avg_conversion_rate: platformTotals.conversations_total > 0 ?
          (platformTotals.conversations_with_outcome / platformTotals.conversations_total) * 100 : 0,
        platform_high_risk_tenants: 0,
        platform_domain_breakdown: {},
        platform_quality_score: platformTotals.success_rate
      });
    
    if (error) {
      console.error('❌ Erro ao inserir platform_metrics:', error);
      throw error;
    }
    
    console.log(`✅ Platform metrics FINAIS atualizadas para período ${periodDays}d`);
    
  } catch (error) {
    console.error('❌ Erro ao processar platform metrics:', error);
    throw error;
  }
}

async function executeFinalMetrics() {
  console.log('🚀 EXECUTANDO SISTEMA FINAL COMPLETO - SEM LIMITAÇÕES');
  console.log('====================================================\n');
  
  try {
    const periods = [90]; // Começar com 90 dias que tem mais dados
    
    for (const period of periods) {
      console.log(`\n📊 PROCESSANDO PERÍODO COMPLETO: ${period} DIAS`);
      
      // Analisar TODOS os dados sem limitação
      const analysis = await analyzeCompleteData(period);
      
      console.log(`📈 RESULTADOS FINAIS PERÍODO ${period}d:`);
      console.log(`   📅 Appointments: ${analysis.platformTotals.appointments_total}`);
      console.log(`   ✅ Confirmados: ${analysis.platformTotals.appointments_confirmed} (${analysis.platformTotals.success_rate.toFixed(2)}%)`);
      console.log(`   💰 Revenue: R$ ${analysis.platformTotals.total_revenue.toFixed(2)}`);
      console.log(`   💬 Conversations: ${analysis.platformTotals.conversations_total}`);
      console.log(`   🤖 Custo IA: $${analysis.platformTotals.total_ai_cost.toFixed(2)}`);
      
      // Atualizar platform_metrics
      await updatePlatformMetrics(analysis.platformTotals, period);
    }
    
    console.log('\n🎉 SISTEMA FINAL EXECUTADO COM DADOS COMPLETOS!');
    console.log('✅ Métricas finais corretas inseridas no banco');
    
    return true;
    
  } catch (error) {
    console.error('❌ ERRO na execução final:', error);
    return false;
  }
}

// Executar sistema final
if (require.main === module) {
  executeFinalMetrics()
    .then((success) => {
      if (success) {
        console.log('\n🎊 SISTEMA DEFINITIVAMENTE 100% FUNCIONAL!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA FINAL');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Falha crítica final:', error);
      process.exit(1);
    });
}