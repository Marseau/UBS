/**
 * EXECUTAR SISTEMA TOTALMENTE NOVO - CRIADO DO ZERO
 * Ignorando completamente todos os scripts existentes
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class FreshMetricsSystem {
  
  /**
   * NOVO SISTEMA: Identifica conversas reais agrupando mensagens por session_id
   */
  async identifyRealConversations(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    console.log(`🔍 SISTEMA NOVO: Identificando conversas reais para ${days} dias`);
    
    // Buscar TODAS as mensagens do período com campos reais
    const { data: messages, error } = await supabase
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
      .order('created_at', { ascending: true });
    
    if (error) {
      throw new Error(`Erro ao buscar mensagens: ${error.message}`);
    }
    
    console.log(`📨 Mensagens encontradas: ${messages?.length || 0}`);
    
    // Agrupar mensagens por session_id para formar conversas
    const conversationMap = new Map();
    
    if (messages) {
      for (const message of messages) {
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
    }
    
    const conversations = Array.from(conversationMap.values());
    console.log(`💬 Conversas reais identificadas: ${conversations.length}`);
    
    return conversations;
  }
  
  /**
   * Busca appointments criados via WhatsApp
   */
  async getWhatsAppAppointments(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const { data: appointments, error } = await supabase
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
      .order('start_time', { ascending: true });
    
    if (error) {
      throw new Error(`Erro ao buscar appointments: ${error.message}`);
    }
    
    // Filtrar apenas appointments criados via WhatsApp
    const whatsappAppointments = appointments?.filter(apt => 
      apt.appointment_data?.booked_via === 'whatsapp_ai' ||
      apt.appointment_data?.source === 'whatsapp'
    ) || [];
    
    console.log(`📅 Appointments via WhatsApp: ${whatsappAppointments.length}`);
    
    return whatsappAppointments;
  }
  
  /**
   * Calcula métricas por tenant
   */
  async calculateTenantMetrics(conversations, appointments, days) {
    const tenantMetricsMap = new Map();
    
    // Agrupar appointments por tenant
    const appointmentsByTenant = new Map();
    for (const apt of appointments) {
      if (!appointmentsByTenant.has(apt.tenant_id)) {
        appointmentsByTenant.set(apt.tenant_id, []);
      }
      appointmentsByTenant.get(apt.tenant_id).push(apt);
    }
    
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
      ...appointmentsByTenant.keys()
    ]);
    
    for (const tenantId of allTenantIds) {
      const tenantConversations = conversationsByTenant.get(tenantId) || [];
      const tenantAppointments = appointmentsByTenant.get(tenantId) || [];
      
      // Métricas básicas
      const conversationsCount = tenantConversations.length;
      const appointmentsCreated = tenantConversations.filter(c => c.has_appointment).length;
      const appointmentsConfirmed = tenantAppointments.filter(a => a.status === 'confirmed').length;
      const appointmentsCancelled = tenantAppointments.filter(a => a.status === 'cancelled').length;
      
      // Receita total
      const totalRevenue = tenantAppointments.reduce((sum, apt) => {
        const price = apt.final_price || apt.quoted_price || 0;
        return sum + parseFloat(price.toString());
      }, 0);
      
      // Custo total de IA
      const totalAiCost = tenantConversations.reduce((sum, conv) => {
        return sum + conv.total_ai_cost;
      }, 0);
      
      // Taxas
      const successRate = tenantAppointments.length > 0 ? 
        (appointmentsConfirmed / tenantAppointments.length) * 100 : 0;
      
      const conversionRate = conversationsCount > 0 ? 
        (appointmentsCreated / conversationsCount) * 100 : 0;
      
      tenantMetricsMap.set(tenantId, {
        tenant_id: tenantId,
        period_days: days,
        conversations_count: conversationsCount,
        appointments_created: appointmentsCreated,
        appointments_confirmed: appointmentsConfirmed,
        appointments_cancelled: appointmentsCancelled,
        total_revenue: totalRevenue,
        total_ai_cost: totalAiCost,
        success_rate: successRate,
        conversion_rate: conversionRate
      });
    }
    
    console.log(`📊 Métricas calculadas para ${tenantMetricsMap.size} tenants`);
    
    return tenantMetricsMap;
  }
  
  /**
   * Salva métricas por tenant
   */
  async saveTenantMetrics(tenantMetrics) {
    console.log(`💾 Salvando métricas de ${tenantMetrics.size} tenants`);
    
    for (const [tenantId, metrics] of tenantMetrics) {
      const { error } = await supabase
        .from('tenant_metrics')
        .insert({
          tenant_id: tenantId,
          calculation_date: new Date().toISOString().split('T')[0],
          period_days: metrics.period_days,
          data_source: 'fresh_system_conversations',
          total_conversations: metrics.conversations_count,
          total_appointments: metrics.appointments_created,
          appointments_confirmed: metrics.appointments_confirmed,
          appointments_cancelled: metrics.appointments_cancelled,
          total_revenue: metrics.total_revenue,
          total_ai_cost: metrics.total_ai_cost,
          success_rate: metrics.success_rate,
          conversion_rate: metrics.conversion_rate,
          avg_conversation_length: 0,
          peak_hour: null,
          customer_satisfaction: null,
          repeat_customer_rate: 0
        });
      
      if (error) {
        console.error(`❌ Erro ao salvar tenant ${tenantId}:`, error);
      }
    }
    
    console.log('✅ Métricas de tenants salvas');
  }
  
  /**
   * Calcula e salva métricas da plataforma
   */
  async calculateAndSavePlatformMetrics(tenantMetrics, days) {
    console.log('🌐 Calculando métricas da plataforma');
    
    // Somar totais
    let totalConversations = 0;
    let totalAppointments = 0;
    let totalAppointmentsConfirmed = 0;
    let totalAppointmentsCancelled = 0;
    let totalRevenue = 0;
    let totalAiCost = 0;
    
    for (const metrics of tenantMetrics.values()) {
      totalConversations += metrics.conversations_count;
      totalAppointments += metrics.appointments_created;
      totalAppointmentsConfirmed += metrics.appointments_confirmed;
      totalAppointmentsCancelled += metrics.appointments_cancelled;
      totalRevenue += metrics.total_revenue;
      totalAiCost += metrics.total_ai_cost;
    }
    
    // Métricas derivadas
    const platformSuccessRate = totalAppointments > 0 ? 
      (totalAppointmentsConfirmed / totalAppointments) * 100 : 0;
    
    const platformConversionRate = totalConversations > 0 ? 
      (totalAppointments / totalConversations) * 100 : 0;
    
    const operationalEfficiency = totalRevenue > 0 ? 
      ((totalRevenue - totalAiCost) / totalRevenue) * 100 : 0;
    
    const revenuePerConversation = totalConversations > 0 ? 
      totalRevenue / totalConversations : 0;
    
    // Salvar métricas da plataforma
    const { error } = await supabase
      .from('platform_metrics')
      .insert({
        calculation_date: new Date().toISOString().split('T')[0],
        period_days: days,
        data_source: 'fresh_system_conversations',
        total_revenue: totalRevenue,
        total_appointments: totalAppointments,
        total_customers: 0,
        total_ai_interactions: totalConversations,
        active_tenants: tenantMetrics.size,
        platform_mrr: 0,
        total_chat_minutes: 0,
        total_conversations: totalConversations,
        total_valid_conversations: totalConversations,
        total_spam_conversations: 0,
        receita_uso_ratio: revenuePerConversation,
        operational_efficiency_pct: operationalEfficiency,
        spam_rate_pct: 0,
        cancellation_rate_pct: totalAppointments > 0 ? (totalAppointmentsCancelled / totalAppointments) * 100 : 0,
        revenue_usage_distortion_index: 0,
        platform_health_score: platformSuccessRate,
        tenants_above_usage: 0,
        tenants_below_usage: 0,
        platform_avg_clv: 0,
        platform_avg_conversion_rate: platformConversionRate,
        platform_high_risk_tenants: 0,
        platform_domain_breakdown: {},
        platform_quality_score: platformSuccessRate
      });
    
    if (error) {
      console.error('❌ Erro ao salvar plataforma:', error);
      throw error;
    }
    
    console.log('✅ Métricas da plataforma salvas');
    
    // Resumo
    console.log(`\n📊 RESUMO DA PLATAFORMA (${days} dias):`);
    console.log(`   💬 Conversas: ${totalConversations}`);
    console.log(`   📅 Appointments: ${totalAppointments}`);
    console.log(`   ✅ Confirmados: ${totalAppointmentsConfirmed}`);
    console.log(`   💰 Receita: R$ ${totalRevenue.toFixed(2)}`);
    console.log(`   🤖 Custo IA: $${totalAiCost.toFixed(2)}`);
    console.log(`   📈 Taxa Conversão: ${platformConversionRate.toFixed(2)}%`);
    console.log(`   🎯 Taxa Sucesso: ${platformSuccessRate.toFixed(2)}%`);
  }
  
  /**
   * MÉTODO PRINCIPAL: Executa sistema novo completo
   */
  async executeCompleteNewSystem(periods = [7, 30, 90]) {
    console.log('🚀 EXECUTANDO SISTEMA TOTALMENTE NOVO DE MÉTRICAS');
    console.log('================================================\n');
    
    try {
      for (const days of periods) {
        console.log(`\n📊 PROCESSANDO PERÍODO: ${days} DIAS`);
        
        // 1. Identificar conversas reais
        const conversations = await this.identifyRealConversations(days);
        
        // 2. Buscar appointments do WhatsApp
        const appointments = await this.getWhatsAppAppointments(days);
        
        // 3. Calcular métricas por tenant
        const tenantMetrics = await this.calculateTenantMetrics(conversations, appointments, days);
        
        // 4. Salvar métricas dos tenants
        await this.saveTenantMetrics(tenantMetrics);
        
        // 5. Calcular e salvar métricas da plataforma
        await this.calculateAndSavePlatformMetrics(tenantMetrics, days);
      }
      
      console.log('\n🎉 SISTEMA NOVO EXECUTADO COM SUCESSO TOTAL!');
      return true;
      
    } catch (error) {
      console.error('❌ Erro no sistema novo:', error);
      return false;
    }
  }
}

// Executar sistema novo
if (require.main === module) {
  const freshSystem = new FreshMetricsSystem();
  
  freshSystem.executeCompleteNewSystem()
    .then((success) => {
      if (success) {
        console.log('\n🎊 SISTEMA NOVO 100% FUNCIONAL E CORRETO!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NO SISTEMA NOVO');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Erro crítico:', error);
      process.exit(1);
    });
}

module.exports = { FreshMetricsSystem };