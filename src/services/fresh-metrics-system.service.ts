import { getAdminClient } from "../config/database";
import { logger } from "../utils/logger";

interface ConversationData {
  session_id: string;
  tenant_id: string;
  user_id: string;
  conversation_start: string;
  conversation_end: string;
  message_count: number;
  has_appointment: boolean;
  conversation_outcome: string | null;
  total_ai_cost: number;
}

interface TenantMetrics {
  tenant_id: string;
  period_days: number;
  conversations_count: number;
  appointments_created: number;
  appointments_confirmed: number;
  appointments_cancelled: number;
  total_revenue: number;
  total_ai_cost: number;
  success_rate: number;
  conversion_rate: number;
}

export class FreshMetricsSystemService {
  /**
   * NOVO SISTEMA: Identifica conversas reais agrupando mensagens por session_id
   * Cada conversa = 1 unidade faturável conforme landing page
   */
  async identifyRealConversations(days: number): Promise<ConversationData[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    logger.info(
      `🔍 SISTEMA NOVO: Identificando conversas reais para ${days} dias`,
    );

    // 1. Buscar TODAS as mensagens do período
    const supabase = getAdminClient();
    const { data: messages, error } = (await supabase
      .from("conversation_history")
      .select(
        `
        conversation_context,
        tenant_id,
        user_id,
        created_at,
        is_from_user,
        conversation_outcome
      `,
      )
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: true })) as {
      data: any[] | null;
      error: any;
    };

    if (error) {
      throw new Error(`Erro ao buscar mensagens: ${error.message}`);
    }

    logger.info(`📨 Mensagens encontradas: ${messages?.length || 0}`);

    // 2. Agrupar mensagens por session_id para formar conversas
    const conversationMap = new Map<string, ConversationData>();

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
            total_ai_cost: 0,
          });
        }

        const conversation = conversationMap.get(sessionId)!;

        // Atualizar dados da conversa
        conversation.conversation_end = message.created_at; // Última mensagem
        conversation.message_count++;

        // Somar custos de IA (removidos por enquanto)
        conversation.total_ai_cost += 0;

        // Marcar outcome se existir
        if (message.conversation_outcome) {
          conversation.conversation_outcome = message.conversation_outcome;
          conversation.has_appointment =
            message.conversation_outcome === "appointment_created";
        }
      }
    }

    const conversations = Array.from(conversationMap.values());
    logger.info(`💬 Conversas reais identificadas: ${conversations.length}`);

    return conversations;
  }

  /**
   * Busca appointments criados via WhatsApp para relacionar com conversas
   */
  async getWhatsAppAppointments(days: number): Promise<any[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const supabase = getAdminClient();
    const { data: appointments, error } = (await supabase
      .from("appointments")
      .select(
        `
        id,
        tenant_id,
        status,
        quoted_price,
        final_price,
        start_time,
        created_at,
        appointment_data
      `,
      )
      .gte("start_time", cutoffDate.toISOString())
      .order("start_time", { ascending: true })) as {
      data: any[] | null;
      error: any;
    };

    if (error) {
      throw new Error(`Erro ao buscar appointments: ${error.message}`);
    }

    // Filtrar apenas appointments criados via WhatsApp
    const whatsappAppointments =
      appointments?.filter((apt) => {
        const data = apt.appointment_data as any;
        return (
          data?.booked_via === "whatsapp_ai" || data?.source === "whatsapp"
        );
      }) || [];

    logger.info(`📅 Appointments via WhatsApp: ${whatsappAppointments.length}`);

    return whatsappAppointments;
  }

  /**
   * Calcula métricas por tenant baseado nas conversas reais
   */
  async calculateTenantMetrics(
    conversations: ConversationData[],
    appointments: any[],
    days: number,
  ): Promise<Map<string, TenantMetrics>> {
    const tenantMetricsMap = new Map<string, TenantMetrics>();

    // Agrupar appointments por tenant
    const appointmentsByTenant = new Map<string, any[]>();
    for (const apt of appointments) {
      if (!appointmentsByTenant.has(apt.tenant_id)) {
        appointmentsByTenant.set(apt.tenant_id, []);
      }
      appointmentsByTenant.get(apt.tenant_id)!.push(apt);
    }

    // Agrupar conversas por tenant
    const conversationsByTenant = new Map<string, ConversationData[]>();
    for (const conv of conversations) {
      if (!conversationsByTenant.has(conv.tenant_id)) {
        conversationsByTenant.set(conv.tenant_id, []);
      }
      conversationsByTenant.get(conv.tenant_id)!.push(conv);
    }

    // Calcular métricas para cada tenant
    const allTenantIds = new Set([
      ...conversationsByTenant.keys(),
      ...appointmentsByTenant.keys(),
    ]);

    for (const tenantId of allTenantIds) {
      const tenantConversations = conversationsByTenant.get(tenantId) || [];
      const tenantAppointments = appointmentsByTenant.get(tenantId) || [];

      // Calcular métricas básicas
      const conversationsCount = tenantConversations.length;
      const appointmentsCreated = tenantConversations.filter(
        (c) => c.has_appointment,
      ).length;
      const appointmentsConfirmed = tenantAppointments.filter(
        (a) => a.status === "confirmed",
      ).length;
      const appointmentsCancelled = tenantAppointments.filter(
        (a) => a.status === "cancelled",
      ).length;

      // Calcular receita total
      const totalRevenue = tenantAppointments.reduce((sum, apt) => {
        const price = apt.final_price || apt.quoted_price || 0;
        return sum + parseFloat(price.toString());
      }, 0);

      // Calcular custo total de IA
      const totalAiCost = tenantConversations.reduce((sum, conv) => {
        return sum + conv.total_ai_cost;
      }, 0);

      // Calcular taxas
      const successRate =
        tenantAppointments.length > 0
          ? (appointmentsConfirmed / tenantAppointments.length) * 100
          : 0;

      const conversionRate =
        conversationsCount > 0
          ? (appointmentsCreated / conversationsCount) * 100
          : 0;

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
        conversion_rate: conversionRate,
      });
    }

    logger.info(`📊 Métricas calculadas para ${tenantMetricsMap.size} tenants`);

    return tenantMetricsMap;
  }

  /**
   * Salva métricas por tenant na tabela tenant_metrics
   */
  async saveTenantMetrics(
    tenantMetrics: Map<string, TenantMetrics>,
  ): Promise<void> {
    logger.info(`💾 Salvando métricas de ${tenantMetrics.size} tenants`);

    for (const [tenantId, metrics] of tenantMetrics) {
      const supabase = getAdminClient();
      const { error } = await (supabase as any)
        .from("ubs_metric_system")
        .insert({
          tenant_id: tenantId,
          metric_type: "tenant_conversations",
          period: `${metrics.period_days}d`,
          metric_data: {
            data_source: "fresh_system_conversations",
            total_conversations: metrics.conversations_count,
            total_appointments: metrics.appointments_created,
            appointments_confirmed: metrics.appointments_confirmed,
            appointments_cancelled: metrics.appointments_cancelled,
            total_revenue: metrics.total_revenue,
            success_rate: metrics.success_rate,
            conversion_rate: metrics.conversion_rate,
          },
        });

      if (error) {
        logger.error(`Erro ao salvar métricas do tenant ${tenantId}:`, error);
      }
    }

    logger.info("✅ Métricas de tenants salvas com sucesso");
  }

  /**
   * Calcula e salva métricas da plataforma
   */
  async calculateAndSavePlatformMetrics(
    tenantMetrics: Map<string, TenantMetrics>,
    days: number,
  ): Promise<void> {
    logger.info("🌐 Calculando métricas da plataforma");

    // Somar todos os totais
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

    // Calcular métricas derivadas
    const platformSuccessRate =
      totalAppointments > 0
        ? (totalAppointmentsConfirmed / totalAppointments) * 100
        : 0;

    const platformConversionRate =
      totalConversations > 0
        ? (totalAppointments / totalConversations) * 100
        : 0;

    const operationalEfficiency =
      totalRevenue > 0
        ? ((totalRevenue - totalAiCost) / totalRevenue) * 100
        : 0;

    const revenuePerConversation =
      totalConversations > 0 ? totalRevenue / totalConversations : 0;

    // Salvar métricas da plataforma
    const supabase = getAdminClient();
    const { error } = await (supabase as any).from("ubs_metric_system").insert({
      tenant_id: null, // Platform-wide metrics
      metric_type: "platform_summary",
      period: `${days}d`,
      metric_data: {
        data_source: "fresh_system_conversations",
        total_revenue: totalRevenue,
        total_appointments: totalAppointments,
        active_tenants: tenantMetrics.size,
        total_conversations: totalConversations,
        platform_health_score: platformSuccessRate,
        platform_avg_conversion_rate: platformConversionRate,
      },
    });

    if (error) {
      logger.error("Erro ao salvar métricas da plataforma:", error);
      throw error;
    }

    logger.info("✅ Métricas da plataforma salvas com sucesso");

    // Log dos resultados
    logger.info(`📊 RESUMO DA PLATAFORMA (${days} dias):`);
    logger.info(`   💬 Conversas: ${totalConversations}`);
    logger.info(`   📅 Appointments: ${totalAppointments}`);
    logger.info(`   ✅ Confirmados: ${totalAppointmentsConfirmed}`);
    logger.info(`   💰 Receita: R$ ${totalRevenue.toFixed(2)}`);
    logger.info(`   🤖 Custo IA: $${totalAiCost.toFixed(2)}`);
    logger.info(`   📈 Taxa Conversão: ${platformConversionRate.toFixed(2)}%`);
    logger.info(`   🎯 Taxa Sucesso: ${platformSuccessRate.toFixed(2)}%`);
  }

  /**
   * MÉTODO PRINCIPAL: Executa todo o sistema novo
   */
  async executeCompleteNewSystem(
    periods: number[] = [7, 30, 90],
  ): Promise<void> {
    logger.info("🚀 EXECUTANDO SISTEMA TOTALMENTE NOVO DE MÉTRICAS");

    try {
      for (const days of periods) {
        logger.info(`\n📊 PROCESSANDO PERÍODO: ${days} DIAS`);

        // 1. Identificar conversas reais
        const conversations = await this.identifyRealConversations(days);

        // 2. Buscar appointments do WhatsApp
        const appointments = await this.getWhatsAppAppointments(days);

        // 3. Calcular métricas por tenant
        const tenantMetrics = await this.calculateTenantMetrics(
          conversations,
          appointments,
          days,
        );

        // 4. Salvar métricas dos tenants
        await this.saveTenantMetrics(tenantMetrics);

        // 5. Calcular e salvar métricas da plataforma
        await this.calculateAndSavePlatformMetrics(tenantMetrics, days);
      }

      logger.info("\n🎉 SISTEMA NOVO EXECUTADO COM SUCESSO!");
    } catch (error) {
      logger.error("❌ Erro no sistema novo:", error);
      throw error;
    }
  }
}
