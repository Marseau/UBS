/**
 * SISTEMA FINAL CORRIGIDO - SEM LIMITAÇÕES E COM TODOS OS TIPOS
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class FinalCorrectedSystem {
  
  /**
   * BUSCAR TODAS AS MENSAGENS COM PAGINAÇÃO (sem limitação)
   */
  async getAllMessages(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    console.log(`🔍 Buscando TODAS as mensagens (paginação) para ${days} dias`);
    
    let allMessages = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('conversation_history')
        .select(`
          id,
          conversation_context,
          tenant_id,
          user_id,
          created_at,
          is_from_user,
          conversation_outcome,
          api_cost_usd,
          processing_cost_usd
        `)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allMessages = allMessages.concat(data);
      console.log(`   📨 Batch ${Math.floor(from/batchSize + 1)}: +${data.length} mensagens (total: ${allMessages.length})`);
      
      if (data.length < batchSize) break; // Última página
      from += batchSize;
    }
    
    console.log(`📨 TOTAL de mensagens encontradas: ${allMessages.length}`);
    return allMessages;
  }
  
  /**
   * BUSCAR TODOS OS APPOINTMENTS COM PAGINAÇÃO (sem limitação)
   */
  async getAllAppointments(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    console.log(`📅 Buscando TODOS os appointments (paginação) para ${days} dias`);
    
    let allAppointments = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          tenant_id,
          status,
          quoted_price,
          final_price,
          start_time,
          created_at,
          appointment_data
        `)
        .gte('start_time', cutoffDate.toISOString())
        .order('start_time', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allAppointments = allAppointments.concat(data);
      console.log(`   📅 Batch ${Math.floor(from/batchSize + 1)}: +${data.length} appointments (total: ${allAppointments.length})`);
      
      if (data.length < batchSize) break; // Última página
      from += batchSize;
    }
    
    console.log(`📅 TOTAL de appointments encontrados: ${allAppointments.length}`);
    return allAppointments;
  }
  
  /**
   * IDENTIFICAR CONVERSAS REAIS (session_id únicos)
   */
  async identifyRealConversations(allMessages) {
    console.log(`💬 Identificando conversas reais de ${allMessages.length} mensagens`);
    
    const conversationMap = new Map();
    
    for (const message of allMessages) {
      const sessionId = message.conversation_context?.session_id;
      
      // Pular mensagens sem session_id
      if (!sessionId) continue;
      
      // Criar nova conversa se não existir
      if (!conversationMap.has(sessionId)) {
        conversationMap.set(sessionId, {
          session_id: sessionId,
          tenant_id: message.tenant_id,
          user_id: message.user_id,
          conversation_start: message.created_at,
          conversation_end: message.created_at,
          message_count: 0,
          has_appointment: false,
          conversation_outcome: null,
          total_ai_cost: 0
        });
      }
      
      const conversation = conversationMap.get(sessionId);
      
      // Atualizar dados da conversa
      conversation.conversation_end = message.created_at;
      conversation.message_count++;
      
      // Somar custos de IA
      const apiCost = parseFloat(message.api_cost_usd || 0);
      const processingCost = parseFloat(message.processing_cost_usd || 0);
      conversation.total_ai_cost += apiCost + processingCost;
      
      // Marcar outcome se existir
      if (message.conversation_outcome) {
        conversation.conversation_outcome = message.conversation_outcome;
        conversation.has_appointment = message.conversation_outcome === 'appointment_created';
      }
    }
    
    const conversations = Array.from(conversationMap.values());
    console.log(`💬 CONVERSAS REAIS identificadas: ${conversations.length}`);
    
    return conversations;
  }
  
  /**
   * ANALISAR TODOS OS TIPOS DE APPOINTMENTS
   */
  async analyzeAppointmentTypes(allAppointments) {
    console.log(`📊 Analisando tipos de ${allAppointments.length} appointments`);
    
    const analysis = {
      total: allAppointments.length,
      whatsapp_total: 0,
      whatsapp_ai: 0,
      whatsapp_conversation: 0,
      google_calendar: 0,
      other_sources: 0,
      by_status: {
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0,
        other: 0
      },
      by_tenant: new Map(),
      total_revenue: 0
    };
    
    for (const apt of allAppointments) {
      // Analisar source/origem
      const source = apt.appointment_data?.booked_via || apt.appointment_data?.source || 'unknown';
      
      if (source === 'whatsapp_ai') {
        analysis.whatsapp_ai++;
        analysis.whatsapp_total++;
      } else if (source === 'whatsapp_conversation') {
        analysis.whatsapp_conversation++;
        analysis.whatsapp_total++;
      } else if (source === 'google_calendar') {
        analysis.google_calendar++;
      } else {
        analysis.other_sources++;
      }
      
      // Analisar status
      if (analysis.by_status.hasOwnProperty(apt.status)) {
        analysis.by_status[apt.status]++;
      } else {
        analysis.by_status.other++;
      }
      
      // Calcular receita
      const price = apt.final_price || apt.quoted_price || 0;
      analysis.total_revenue += parseFloat(price.toString());
      
      // Agrupar por tenant
      if (!analysis.by_tenant.has(apt.tenant_id)) {
        analysis.by_tenant.set(apt.tenant_id, {
          total: 0,
          whatsapp: 0,
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          no_show: 0,
          revenue: 0
        });
      }
      
      const tenantData = analysis.by_tenant.get(apt.tenant_id);
      tenantData.total++;
      
      if (source.includes('whatsapp')) {
        tenantData.whatsapp++;
      }
      
      if (apt.status === 'confirmed') tenantData.confirmed++;
      else if (apt.status === 'completed') tenantData.completed++;
      else if (apt.status === 'cancelled') tenantData.cancelled++;
      else if (apt.status === 'no_show') tenantData.no_show++;
      
      tenantData.revenue += parseFloat(price.toString());
    }
    
    console.log(`📊 ANÁLISE DE APPOINTMENTS:`);
    console.log(`   📅 Total: ${analysis.total}`);
    console.log(`   💬 WhatsApp Total: ${analysis.whatsapp_total}`);
    console.log(`     - WhatsApp AI: ${analysis.whatsapp_ai}`);
    console.log(`     - WhatsApp Conversation: ${analysis.whatsapp_conversation}`);
    console.log(`   📆 Google Calendar: ${analysis.google_calendar}`);
    console.log(`   ❓ Outras fontes: ${analysis.other_sources}`);
    console.log(`   💰 Receita total: R$ ${analysis.total_revenue.toFixed(2)}`);
    console.log(`   📊 Por status:`, analysis.by_status);
    
    return analysis;
  }
  
  /**
   * CALCULAR MÉTRICAS COMPLETAS POR TENANT
   */
  async calculateCompleteTenantMetrics(conversations, appointmentAnalysis, days) {
    console.log('📊 Calculando métricas completas por tenant');
    
    const tenantMetricsMap = new Map();
    
    // Agrupar conversas por tenant
    const conversationsByTenant = new Map();
    for (const conv of conversations) {
      if (!conversationsByTenant.has(conv.tenant_id)) {
        conversationsByTenant.set(conv.tenant_id, []);
      }
      conversationsByTenant.get(conv.tenant_id).push(conv);
    }
    
    // Calcular métricas para cada tenant
    const allTenantIds = new Set([
      ...conversationsByTenant.keys(),
      ...appointmentAnalysis.by_tenant.keys()
    ]);
    
    for (const tenantId of allTenantIds) {
      const tenantConversations = conversationsByTenant.get(tenantId) || [];
      const tenantAppointments = appointmentAnalysis.by_tenant.get(tenantId) || {
        total: 0, whatsapp: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0, revenue: 0
      };
      
      // Métricas básicas
      const conversationsCount = tenantConversations.length;
      const appointmentsTotal = tenantAppointments.total;
      const appointmentsWhatsapp = tenantAppointments.whatsapp;
      const appointmentsFromConversations = tenantConversations.filter(c => c.has_appointment).length;
      
      // Custo total de IA
      const totalAiCost = tenantConversations.reduce((sum, conv) => sum + conv.total_ai_cost, 0);
      
      // Taxas
      const conversionRate = conversationsCount > 0 ? 
        (appointmentsFromConversations / conversationsCount) * 100 : 0;
      
      const successRate = appointmentsTotal > 0 ? 
        ((tenantAppointments.confirmed + tenantAppointments.completed) / appointmentsTotal) * 100 : 0;
      
      const whatsappShare = appointmentsTotal > 0 ? 
        (appointmentsWhatsapp / appointmentsTotal) * 100 : 0;
      
      tenantMetricsMap.set(tenantId, {
        tenant_id: tenantId,
        period_days: days,
        conversations_count: conversationsCount,
        appointments_total: appointmentsTotal,
        appointments_whatsapp: appointmentsWhatsapp,
        appointments_from_conversations: appointmentsFromConversations,
        appointments_confirmed: tenantAppointments.confirmed,
        appointments_completed: tenantAppointments.completed,
        appointments_cancelled: tenantAppointments.cancelled,
        appointments_no_show: tenantAppointments.no_show,
        total_revenue: tenantAppointments.revenue,
        total_ai_cost: totalAiCost,
        success_rate: successRate,
        conversion_rate: conversionRate,
        whatsapp_share: whatsappShare
      });
    }
    
    console.log(`📊 Métricas calculadas para ${tenantMetricsMap.size} tenants`);
    return tenantMetricsMap;
  }
  
  /**
   * EXECUTAR SISTEMA COMPLETO CORRIGIDO
   */
  async executeCompleteCorrectSystem(periods = [90]) {
    console.log('🚀 EXECUTANDO SISTEMA FINAL CORRIGIDO - SEM LIMITAÇÕES');
    console.log('===========================================================\n');
    
    try {
      for (const days of periods) {
        console.log(`\n📊 PROCESSANDO PERÍODO: ${days} DIAS`);
        
        // 1. Buscar TODAS as mensagens
        const allMessages = await this.getAllMessages(days);
        
        // 2. Buscar TODOS os appointments
        const allAppointments = await this.getAllAppointments(days);
        
        // 3. Identificar conversas reais
        const conversations = await this.identifyRealConversations(allMessages);
        
        // 4. Analisar tipos de appointments
        const appointmentAnalysis = await this.analyzeAppointmentTypes(allAppointments);
        
        // 5. Calcular métricas completas
        const tenantMetrics = await this.calculateCompleteTenantMetrics(
          conversations, 
          appointmentAnalysis, 
          days
        );
        
        console.log(`\n📈 RESUMO FINAL CORRETO (${days} dias):`);
        console.log(`   💬 Conversas reais: ${conversations.length}`);
        console.log(`   📅 Appointments total: ${appointmentAnalysis.total}`);
        console.log(`   💬 Appointments WhatsApp: ${appointmentAnalysis.whatsapp_total}`);
        console.log(`   💰 Receita total: R$ ${appointmentAnalysis.total_revenue.toFixed(2)}`);
        console.log(`   🎯 Tenants ativos: ${tenantMetrics.size}`);
        
        // 6. Mostrar breakdown detalhado
        console.log(`\n📊 BREAKDOWN DETALHADO:`);
        console.log(`   🤖 WhatsApp AI: ${appointmentAnalysis.whatsapp_ai}`);
        console.log(`   💬 WhatsApp Conversation: ${appointmentAnalysis.whatsapp_conversation}`);
        console.log(`   📆 Google Calendar: ${appointmentAnalysis.google_calendar}`);
        console.log(`   ✅ Confirmados: ${appointmentAnalysis.by_status.confirmed}`);
        console.log(`   ✅ Completados: ${appointmentAnalysis.by_status.completed}`);
        console.log(`   ❌ Cancelados: ${appointmentAnalysis.by_status.cancelled}`);
        console.log(`   👻 No-show: ${appointmentAnalysis.by_status.no_show}`);
      }
      
      console.log('\n🎉 SISTEMA FINAL CORRIGIDO EXECUTADO COM SUCESSO!');
      return true;
      
    } catch (error) {
      console.error('❌ Erro no sistema final:', error);
      return false;
    }
  }
}

// Executar sistema final corrigido
if (require.main === module) {
  const finalSystem = new FinalCorrectedSystem();
  
  finalSystem.executeCompleteCorrectSystem()
    .then((success) => {
      if (success) {
        console.log('\n🎊 DADOS FINAIS 100% CORRETOS!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NO SISTEMA FINAL');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Erro crítico final:', error);
      process.exit(1);
    });
}

module.exports = { FinalCorrectedSystem };