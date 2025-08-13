/**
 * Metrics Analysis Service
 * Context Engineering COLEAM00 - Data extraction and analysis from source tables
 *
 * @fileoverview Analyzes raw data from appointments, conversation_history, conversation_billing
 * @author Context Engineering Implementation
 * @version 1.0.0
 * @since 2025-08-04
 */

import { getAdminClient } from "../config/database";

/**
 * Period enum for metrics calculation
 */
export enum MetricsPeriod {
  SEVEN_DAYS = "7d",
  THIRTY_DAYS = "30d",
  NINETY_DAYS = "90d",
}

/**
 * Appointment analysis results interface - SEPARADO POR FONTE
 */
export interface AppointmentMetrics {
  // Métricas Gerais
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  no_show_appointments: number;
  confirmed_appointments: number;
  total_revenue: number;
  avg_appointment_value: number;
  total_customers: number;
  appointment_success_rate: number;
  customer_recurrence_rate: number;
  data_completeness_score: number;

  // Service Metrics (NEW)
  services_count?: number;
  services?: string[];

  // SEPARAÇÃO CRÍTICA: Internos vs Externos
  internal_appointments: InternalAppointmentMetrics;
  external_appointments: ExternalAppointmentMetrics;
  whatsapp_ai_appointments: WhatsAppAIAppointmentMetrics;

  // NOVAS MÉTRICAS DETALHADAS
  cancelled_appointments_detail: CancelledAppointmentMetrics;
  no_show_appointments_detail: NoShowAppointmentMetrics;
  appointments_by_service: Record<string, ServiceAppointmentMetrics>;
  available_services: ServiceAvailabilityMetrics;
  customer_metrics: CustomerMetrics;
  staff_metrics: StaffMetrics;

  // Comparação de Canais
  channel_performance: ChannelPerformanceComparison;
}

/**
 * Métricas específicas para agendamentos internos (criados no sistema)
 */
export interface InternalAppointmentMetrics {
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
  success_rate: number;
  avg_value: number;
  customers: number;
}

/**
 * Métricas específicas para agendamentos externos (Google Calendar, etc)
 */
export interface ExternalAppointmentMetrics {
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
  success_rate: number;
  avg_value: number;
  customers: number;
  sources: Record<string, number>; // google_calendar, outlook, etc
}

/**
 * Métricas específicas para agendamentos via WhatsApp/IA
 */
export interface WhatsAppAIAppointmentMetrics {
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
  success_rate: number;
  avg_value: number;
  customers: number;
  linked_conversations: number;
  conversion_rate: number; // conversations -> appointments
}

/**
 * Comparação de performance entre canais
 */
export interface ChannelPerformanceComparison {
  internal_vs_external_ratio: number;
  best_performing_channel: string;
  best_conversion_rate: number;
  best_revenue_per_appointment: number;
  channel_efficiency_ranking: Array<{
    channel: string;
    success_rate: number;
    revenue_per_appointment: number;
    efficiency_score: number;
  }>;
}

/**
 * Conversation analysis results interface - EXPANDIDA
 */
export interface ConversationMetrics {
  // Métricas Básicas
  total_conversations: number;
  billable_conversations: number;
  spam_conversations: number;
  avg_conversation_duration: number;
  total_chat_minutes: number;

  // Outcomes de Conversação
  conversation_outcomes: Record<string, number>;
  conversion_rate: number;
  appointment_creation_rate: number;
  cancellation_rate: number;
  price_inquiry_rate: number;

  // Métricas de IA
  ai_performance: AIPerformanceMetrics;
  intent_analysis: IntentAnalysisMetrics;

  // Métricas Financeiras
  cost_metrics: ConversationCostMetrics;

  // Métricas de Qualidade
  quality_metrics: ConversationQualityMetrics;

  // Eficiência Geral
  conversation_efficiency: number;
  ai_accuracy_score: number;
}

/**
 * Métricas de Performance da IA
 */
export interface AIPerformanceMetrics {
  avg_confidence_score: number;
  high_confidence_rate: number; // >= 0.9
  medium_confidence_rate: number; // 0.7-0.9
  low_confidence_rate: number; // < 0.7
  intent_detection_rate: number;
  model_distribution: Record<string, number>;
  accuracy_trend: number; // Tendência de melhora
}

/**
 * Análise de Intents
 */
export interface IntentAnalysisMetrics {
  total_intents_detected: number;
  top_intents: Array<{
    intent: string;
    count: number;
    percentage: number;
  }>;
  business_critical_intents: {
    booking_requests: number;
    date_preferences: number;
    confirmations: number;
    cancellations: number;
  };
  customer_satisfaction_indicators: {
    gratitude_expressions: number;
    complaint_indicators: number;
    satisfaction_score: number;
  };
}

/**
 * Métricas de Custo
 */
export interface ConversationCostMetrics {
  total_api_cost_usd: number;
  total_processing_cost_usd: number;
  avg_cost_per_conversation: number;
  avg_tokens_per_conversation: number;
  cost_efficiency_score: number; // Custo vs conversões
  monthly_projected_cost: number;
  roi_estimate: number; // ROI baseado em conversões
}

/**
 * Métricas de Qualidade
 */
export interface ConversationQualityMetrics {
  completion_rate: number; // % com conversation_outcome
  spam_detection_accuracy: number;
  avg_session_duration: number;
  message_response_quality: number;
  customer_engagement_score: number;
  conversation_resolution_rate: number;
}

/**
 * Billing analysis results interface
 */
export interface BillingMetrics {
  current_plan: string;
  plan_price_brl: number;
  conversation_count: number;
  appointment_count: number;
  total_amount_brl: number;
  was_upgraded: boolean;
  calculation_method: string;
  revenue_per_conversation: number;
  plan_utilization_rate: number;
}

/**
 * Cross-table consistency validation results
 */
export interface ValidationScore {
  appointment_conversation_consistency: number;
  billing_conversation_consistency: number;
  revenue_consistency: number;
  overall_score: number;
  inconsistencies: string[];
}

/**
 * Métricas detalhadas de agendamentos cancelados
 */
export interface CancelledAppointmentMetrics {
  total_cancelled: number;
  cancelled_by_customer: number;
  cancelled_by_business: number;
  cancelled_by_system: number;
  cancellation_rate: number;
  avg_cancellation_time_hours: number;
  revenue_lost: number;
  top_cancellation_reasons: Record<string, number>;
}

/**
 * Métricas detalhadas de no-show
 */
export interface NoShowAppointmentMetrics {
  total_no_show: number;
  no_show_rate: number;
  no_show_by_service: Record<string, number>;
  no_show_by_time_slot: Record<string, number>;
  revenue_lost_no_show: number;
  repeat_no_show_customers: number;
}

/**
 * Métricas por serviço
 */
export interface ServiceAppointmentMetrics {
  service_name: string;
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  no_show_appointments: number;
  total_revenue: number;
  avg_service_price: number;
  success_rate: number;
  popularity_ranking: number;
}

/**
 * Métricas de disponibilidade de serviços
 */
export interface ServiceAvailabilityMetrics {
  total_services_available: number;
  active_services: number;
  inactive_services: number;
  services_with_appointments: number;
  services_without_appointments: number;
  avg_price_per_service: number;
  price_range: { min: number; max: number };
  most_popular_service: string;
  highest_revenue_service: string;
}

/**
 * Métricas de clientes
 */
export interface CustomerMetrics {
  total_unique_customers: number;
  new_customers: number;
  returning_customers: number;
  customer_retention_rate: number;
  avg_appointments_per_customer: number;
  customer_lifetime_value: number;
  customers_by_acquisition_channel: Record<string, number>;
  top_customers_by_revenue: Array<{
    customer_id: string;
    appointments: number;
    total_spent: number;
  }>;
}

/**
 * Métricas de funcionários
 */
export interface StaffMetrics {
  total_staff_members: number;
  active_staff_members: number;
  staff_with_appointments: number;
  avg_appointments_per_staff: number;
  staff_utilization_rate: number;
  top_performing_staff: Array<{
    staff_id: string;
    appointments_handled: number;
    revenue_generated: number;
    success_rate: number;
  }>;
  staff_availability_hours: number;
}

/**
 * Memory-optimized Metrics Analysis Service
 */
export class MetricsAnalysisService {
  private static instance: MetricsAnalysisService;

  static getInstance(): MetricsAnalysisService {
    if (!MetricsAnalysisService.instance) {
      MetricsAnalysisService.instance = new MetricsAnalysisService();
    }
    return MetricsAnalysisService.instance;
  }

  private constructor() {}

  /**
   * Get date range for specific period
   */
  private getDateRange(period: MetricsPeriod): { start: string; end: string } {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case MetricsPeriod.SEVEN_DAYS:
        start.setDate(start.getDate() - 7);
        break;
      case MetricsPeriod.THIRTY_DAYS:
        start.setDate(start.getDate() - 30);
        break;
      case MetricsPeriod.NINETY_DAYS:
        start.setDate(start.getDate() - 90);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  /**
   * Analyze appointments data for specific tenant and period
   */
  async analyzeAppointments(
    tenantId: string,
    period: MetricsPeriod,
  ): Promise<AppointmentMetrics> {
    const supabase = getAdminClient();
    const dateRange = this.getDateRange(period);

    const { data: appointments, error } = (await supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("start_time", dateRange.start)
      .lte("start_time", dateRange.end)) as { data: any[] | null; error: any };

    if (error) {
      throw new Error(`Failed to fetch appointments: ${error.message}`);
    }

    if (!appointments || appointments.length === 0) {
      return this.getEmptyAppointmentMetrics();
    }

    // SEPARAÇÃO CRÍTICA: Classificar appointments por fonte
    const internalAppointments = appointments.filter((a) =>
      this.isInternalAppointment(a),
    );
    const externalAppointments = appointments.filter((a) =>
      this.isExternalAppointment(a),
    );
    const whatsappAIAppointments = appointments.filter((a) =>
      this.isWhatsAppAIAppointment(a),
    );

    // Calcular métricas gerais
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(
      (a) => a.status === "completed",
    ).length;
    const confirmedAppointments = appointments.filter(
      (a) => a.status === "confirmed",
    ).length;
    const cancelledAppointments = appointments.filter(
      (a) => a.status === "cancelled",
    ).length;
    const noShowAppointments = appointments.filter(
      (a) => a.status === "no_show",
    ).length;

    const totalRevenue = appointments
      .filter((a) => a.status === "completed" || a.status === "confirmed")
      .reduce((sum, a) => {
        const price = a.quoted_price || a.final_price || 0;
        return sum + price;
      }, 0);

    const avgAppointmentValue =
      completedAppointments > 0 ? totalRevenue / completedAppointments : 0;
    const uniqueCustomers = new Set(appointments.map((a) => a.user_id)).size;

    // Calculate customer recurrence
    const customerAppointmentCounts = new Map<string, number>();
    appointments.forEach((a) => {
      if (a.user_id) {
        customerAppointmentCounts.set(
          a.user_id,
          (customerAppointmentCounts.get(a.user_id) || 0) + 1,
        );
      }
    });
    const recurringCustomers = Array.from(
      customerAppointmentCounts.values(),
    ).filter((count) => count > 1).length;
    const customerRecurrenceRate =
      uniqueCustomers > 0 ? (recurringCustomers / uniqueCustomers) * 100 : 0;

    const appointmentSuccessRate =
      totalAppointments > 0
        ? (completedAppointments / totalAppointments) * 100
        : 0;

    // Calculate data completeness score
    const fieldsToCheck = [
      "status",
      "quoted_price",
      "final_price",
      "start_time",
    ];
    const completenessScore =
      (appointments.reduce((score, appointment) => {
        const filledFields = fieldsToCheck.filter(
          (field) => appointment[field] != null,
        ).length;
        return score + filledFields / fieldsToCheck.length;
      }, 0) /
        appointments.length) *
      100;

    // Calcular métricas por canal
    const internalMetrics = this.calculateChannelMetrics(internalAppointments);
    const externalMetrics = this.calculateChannelMetrics(externalAppointments);
    const whatsappAIMetrics = this.calculateChannelMetrics(
      whatsappAIAppointments,
    );

    // Calcular fontes externas
    const externalSources: Record<string, number> = {};
    externalAppointments.forEach((apt) => {
      const source = this.getAppointmentSource(apt);
      externalSources[source] = (externalSources[source] || 0) + 1;
    });

    // Calcular novas métricas detalhadas
    const cancelledDetail = await this.analyzeCancelledAppointments(
      appointments.filter((a) => a.status === "cancelled"),
    );
    const noShowDetail = await this.analyzeNoShowAppointments(
      appointments.filter((a) => a.status === "no_show"),
    );
    const serviceMetrics = await this.analyzeAppointmentsByService(
      tenantId,
      appointments,
      period,
    );
    const serviceAvailability = await this.analyzeServiceAvailability(tenantId);
    const customerMetrics = await this.analyzeCustomerMetrics(
      tenantId,
      appointments,
      period,
    );
    const staffMetrics = await this.analyzeStaffMetrics(
      tenantId,
      appointments,
      period,
    );

    // Calcular comparação de performance
    const channelPerformance = this.calculateChannelPerformance(
      internalMetrics,
      externalMetrics,
      whatsappAIMetrics,
    );

    return {
      // Métricas Gerais
      total_appointments: totalAppointments,
      completed_appointments: completedAppointments,
      confirmed_appointments: confirmedAppointments,
      cancelled_appointments: cancelledAppointments,
      no_show_appointments: noShowAppointments,
      total_revenue: totalRevenue,
      avg_appointment_value: avgAppointmentValue,
      total_customers: uniqueCustomers,
      appointment_success_rate: appointmentSuccessRate,
      customer_recurrence_rate: customerRecurrenceRate,
      data_completeness_score: completenessScore,

      // Métricas Separadas por Canal
      internal_appointments: {
        ...internalMetrics,
        customers: new Set(internalAppointments.map((a) => a.user_id)).size,
      },
      external_appointments: {
        ...externalMetrics,
        customers: new Set(externalAppointments.map((a) => a.user_id)).size,
        sources: externalSources,
      },
      whatsapp_ai_appointments: {
        ...whatsappAIMetrics,
        customers: new Set(whatsappAIAppointments.map((a) => a.user_id)).size,
        linked_conversations: 0, // Será calculado ao cruzar com conversation_history
        conversion_rate: 0, // Será calculado ao cruzar com conversation_history
      },

      // NOVAS MÉTRICAS DETALHADAS
      cancelled_appointments_detail: cancelledDetail,
      no_show_appointments_detail: noShowDetail,
      appointments_by_service: serviceMetrics,
      available_services: serviceAvailability,
      customer_metrics: customerMetrics,
      staff_metrics: staffMetrics,

      // Comparação de Canais
      channel_performance: channelPerformance,
    };
  }

  /**
   * Analyze conversations data for specific tenant and period
   */
  async analyzeConversations(
    tenantId: string,
    period: MetricsPeriod,
  ): Promise<ConversationMetrics> {
    const supabase = getAdminClient();
    const dateRange = this.getDateRange(period);

    const { data: conversations, error } = (await supabase
      .from("conversation_history")
      .select(
        `
                id,
                user_id,
                content,
                is_from_user,
                intent_detected,
                confidence_score,
                conversation_context,
                conversation_outcome,
                created_at
            `,
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", dateRange.start)
      .lte("created_at", dateRange.end)) as { data: any[] | null; error: any };

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    if (!conversations || conversations.length === 0) {
      return this.getEmptyConversationMetrics();
    }

    // Calculate conversation metrics from real data
    const totalConversations = conversations.length;
    const billableConversations = conversations.filter(
      (c) => c.conversation_outcome && c.conversation_outcome !== "spam",
    ).length;
    const spamConversations = conversations.filter(
      (c) => c.conversation_outcome === "spam",
    ).length;

    // Calculate conversation duration from context
    let totalChatMinutes = 0;
    conversations.forEach((conv) => {
      if (
        conv.conversation_context &&
        typeof conv.conversation_context === "object"
      ) {
        const context = conv.conversation_context as any;
        if (context.duration_minutes) {
          totalChatMinutes += parseFloat(context.duration_minutes) || 0;
        }
      }
    });

    const avgConversationDuration =
      totalConversations > 0 ? totalChatMinutes / totalConversations : 0;

    // Count conversation outcomes
    const conversationOutcomes: Record<string, number> = {};
    conversations.forEach((conv) => {
      if (conv.conversation_outcome) {
        conversationOutcomes[conv.conversation_outcome] =
          (conversationOutcomes[conv.conversation_outcome] || 0) + 1;
      }
    });

    // Calculate conversion rate
    const appointmentCreatedCount =
      conversationOutcomes["appointment_created"] || 0;
    const conversionRate =
      totalConversations > 0
        ? (appointmentCreatedCount / totalConversations) * 100
        : 0;
    const conversationEfficiency = conversionRate;

    // Calculate AI accuracy score
    const confidenceScores = conversations
      .filter((c) => c.confidence_score != null)
      .map((c) => c.confidence_score as number);
    const aiAccuracyScore =
      confidenceScores.length > 0
        ? (confidenceScores.reduce((sum, score) => sum + score, 0) /
            confidenceScores.length) *
          100
        : 0;

    return {
      total_conversations: totalConversations,
      billable_conversations: billableConversations,
      spam_conversations: spamConversations,
      avg_conversation_duration: avgConversationDuration,
      total_chat_minutes: totalChatMinutes,
      conversation_outcomes: conversationOutcomes,
      conversion_rate: conversionRate,
      conversation_efficiency: conversationEfficiency,
      ai_accuracy_score: aiAccuracyScore,
      appointment_creation_rate: 0,
      cancellation_rate: 0,
      price_inquiry_rate: 0,
      ai_performance: {
        avg_confidence_score: 0,
        high_confidence_rate: 0,
        medium_confidence_rate: 0,
        low_confidence_rate: 0,
        intent_detection_rate: 0,
        model_distribution: {},
        accuracy_trend: 0,
      } as AIPerformanceMetrics,
      // Note: Adding empty nested objects for now as placeholders
      intent_analysis: {} as IntentAnalysisMetrics,
      cost_metrics: {} as ConversationCostMetrics,
      quality_metrics: {} as ConversationQualityMetrics,
    };
  }

  /**
   * Analyze billing data for specific tenant and period
   */
  async analyzeBilling(
    tenantId: string,
    period: MetricsPeriod,
  ): Promise<BillingMetrics> {
    const supabase = getAdminClient();
    const dateRange = this.getDateRange(period);

    // TODO: conversation_billing table does not exist, using conversation_history instead
    const { data: billingRecords, error } = (await supabase
      .from("conversation_history")
      .select(
        `
                id,
                tenant_id,
                billing_period_start,
                billing_period_end,
                conversations_included,
                conversations_used,
                conversations_overage,
                base_amount_brl,
                overage_amount_brl,
                total_amount_brl,
                processed_at,
                created_at
            `,
      )
      .eq("tenant_id", tenantId)
      .gte("billing_period_start", dateRange.start)
      .lte("billing_period_end", dateRange.end)
      .order("billing_period_start", { ascending: false })) as {
      data: any[] | null;
      error: any;
    };

    if (error) {
      throw new Error(`Failed to fetch billing data: ${error.message}`);
    }

    if (!billingRecords || billingRecords.length === 0) {
      return this.getEmptyBillingMetrics();
    }

    // Use most recent billing record for current plan info
    const latestBilling = billingRecords[0];

    // Aggregate billing data across the period
    const totalConversationsUsed = billingRecords.reduce(
      (sum, record) => sum + (record.conversations_used || 0),
      0,
    );
    const totalConversationsIncluded = billingRecords.reduce(
      (sum, record) => sum + (record.conversations_included || 0),
      0,
    );
    const totalConversationsOverage = billingRecords.reduce(
      (sum, record) => sum + (record.conversations_overage || 0),
      0,
    );
    const totalBaseAmount = billingRecords.reduce(
      (sum, record) => sum + (record.base_amount_brl || 0),
      0,
    );
    const totalOverageAmount = billingRecords.reduce(
      (sum, record) => sum + (record.overage_amount_brl || 0),
      0,
    );
    const totalAmountBrl = billingRecords.reduce(
      (sum, record) => sum + (record.total_amount_brl || 0),
      0,
    );

    const revenuePerConversation =
      totalConversationsUsed > 0 ? totalAmountBrl / totalConversationsUsed : 0;
    const planUtilizationRate =
      totalConversationsIncluded > 0
        ? (totalConversationsUsed / totalConversationsIncluded) * 100
        : 0;
    const wasUpgraded = totalConversationsOverage > 0;

    // Determine plan type based on conversations included
    let currentPlan = "basic";
    if (totalConversationsIncluded >= 1000) currentPlan = "enterprise";
    else if (totalConversationsIncluded >= 500) currentPlan = "pro";
    else if (totalConversationsIncluded >= 100) currentPlan = "standard";

    return {
      current_plan: currentPlan,
      plan_price_brl: totalBaseAmount,
      conversation_count: totalConversationsUsed,
      appointment_count: 0, // Not tracked in billing table
      total_amount_brl: totalAmountBrl,
      was_upgraded: wasUpgraded,
      calculation_method:
        totalConversationsOverage > 0 ? "overage" : "standard",
      revenue_per_conversation: revenuePerConversation,
      plan_utilization_rate: planUtilizationRate,
    };
  }

  /**
   * Calculate cross-table consistency validation
   */
  async calculateCrossTableConsistency(
    tenantId: string,
    period: MetricsPeriod,
    appointmentMetrics: AppointmentMetrics,
    conversationMetrics: ConversationMetrics,
    billingMetrics: BillingMetrics,
  ): Promise<ValidationScore> {
    const inconsistencies: string[] = [];

    // Validate appointment-conversation consistency
    const appointmentConversationRatio =
      conversationMetrics.total_conversations > 0
        ? appointmentMetrics.total_appointments /
          conversationMetrics.total_conversations
        : 0;

    const appointmentConversationConsistency =
      appointmentConversationRatio >= 0.1 && appointmentConversationRatio <= 0.8
        ? 100
        : 70;

    if (appointmentConversationConsistency < 100) {
      inconsistencies.push(
        `Appointment-conversation ratio unusual: ${(appointmentConversationRatio * 100).toFixed(1)}%`,
      );
    }

    // Validate billing-conversation consistency
    const billingConversationDiff = Math.abs(
      billingMetrics.conversation_count -
        conversationMetrics.total_conversations,
    );
    const billingConversationConsistency =
      billingConversationDiff <= conversationMetrics.total_conversations * 0.1
        ? 100
        : 80;

    if (billingConversationConsistency < 100) {
      inconsistencies.push(
        `Billing conversation count mismatch: ${billingConversationDiff} difference`,
      );
    }

    // Validate revenue consistency
    const revenueDiff = Math.abs(
      billingMetrics.total_amount_brl - appointmentMetrics.total_revenue,
    );
    const revenueConsistency =
      revenueDiff <= appointmentMetrics.total_revenue * 0.2 ? 100 : 85;

    if (revenueConsistency < 100) {
      inconsistencies.push(
        `Revenue mismatch: R$ ${revenueDiff.toFixed(2)} difference`,
      );
    }

    const overallScore =
      (appointmentConversationConsistency +
        billingConversationConsistency +
        revenueConsistency) /
      3;

    return {
      appointment_conversation_consistency: appointmentConversationConsistency,
      billing_conversation_consistency: billingConversationConsistency,
      revenue_consistency: revenueConsistency,
      overall_score: overallScore,
      inconsistencies,
    };
  }

  private getEmptyAppointmentMetrics(): AppointmentMetrics {
    const emptyChannelMetrics = {
      total: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
      success_rate: 0,
      avg_value: 0,
      customers: 0,
    };

    return {
      // Métricas Gerais
      total_appointments: 0,
      completed_appointments: 0,
      confirmed_appointments: 0,
      cancelled_appointments: 0,
      no_show_appointments: 0,
      total_revenue: 0,
      avg_appointment_value: 0,
      total_customers: 0,
      appointment_success_rate: 0,
      customer_recurrence_rate: 0,
      data_completeness_score: 0,

      // Métricas Separadas por Canal
      internal_appointments: emptyChannelMetrics,
      external_appointments: {
        ...emptyChannelMetrics,
        sources: {},
      },
      whatsapp_ai_appointments: {
        ...emptyChannelMetrics,
        linked_conversations: 0,
        conversion_rate: 0,
      },

      // NOVAS MÉTRICAS DETALHADAS
      cancelled_appointments_detail: this.getEmptyCancelledMetrics(),
      no_show_appointments_detail: this.getEmptyNoShowMetrics(),
      appointments_by_service: {},
      available_services: this.getEmptyServiceAvailabilityMetrics(),
      customer_metrics: this.getEmptyCustomerMetrics(),
      staff_metrics: this.getEmptyStaffMetrics(),

      // Comparação de Canais
      channel_performance: {
        internal_vs_external_ratio: 0,
        best_performing_channel: "none",
        best_conversion_rate: 0,
        best_revenue_per_appointment: 0,
        channel_efficiency_ranking: [],
      },
    };
  }

  private getEmptyConversationMetrics(): ConversationMetrics {
    return {
      total_conversations: 0,
      billable_conversations: 0,
      spam_conversations: 0,
      avg_conversation_duration: 0,
      total_chat_minutes: 0,
      conversation_outcomes: {},
      conversion_rate: 0,
      conversation_efficiency: 0,
      ai_accuracy_score: 0,
      appointment_creation_rate: 0,
      cancellation_rate: 0,
      price_inquiry_rate: 0,
      ai_performance: {
        avg_confidence_score: 0,
        high_confidence_rate: 0,
        medium_confidence_rate: 0,
        low_confidence_rate: 0,
        intent_detection_rate: 0,
        model_distribution: {},
        accuracy_trend: 0,
      } as AIPerformanceMetrics,
      // Note: Adding empty nested objects for now as placeholders
      intent_analysis: {} as IntentAnalysisMetrics,
      cost_metrics: {} as ConversationCostMetrics,
      quality_metrics: {} as ConversationQualityMetrics,
    };
  }

  private getEmptyBillingMetrics(): BillingMetrics {
    return {
      current_plan: "unknown",
      plan_price_brl: 0,
      conversation_count: 0,
      appointment_count: 0,
      total_amount_brl: 0,
      was_upgraded: false,
      calculation_method: "standard",
      revenue_per_conversation: 0,
      plan_utilization_rate: 0,
    };
  }

  /**
   * Classificar se appointment é interno (criado no sistema)
   * CORREÇÃO: WhatsApp/IA são INTERNOS (feitos no app)
   */
  private isInternalAppointment(appointment: any): boolean {
    if (!appointment.appointment_data) return true; // Sem dados = provavelmente interno

    const data = appointment.appointment_data;

    // Sources INTERNOS: criados no app (WhatsApp/IA + manual/internal)
    const internalSources = [
      "whatsapp_conversation",
      "whatsapp_ai",
      "whatsapp",
      "ai_booking",
      "conversation",
      "internal",
      "manual",
    ];

    // Se não tem source ou source é interno
    if (!data.source || internalSources.includes(data.source)) {
      return true;
    }

    return false;
  }

  /**
   * Classificar se appointment é externo (Google Calendar, Outlook, etc)
   */
  private isExternalAppointment(appointment: any): boolean {
    if (!appointment.appointment_data) return false;

    const data = appointment.appointment_data;

    // Sources conhecidas de sistemas externos
    const externalSources = [
      "google_calendar",
      "outlook",
      "calendly",
      "external_sync",
    ];

    return externalSources.includes(data.source);
  }

  /**
   * Classificar se appointment é do WhatsApp/IA (subconjunto dos internos)
   */
  private isWhatsAppAIAppointment(appointment: any): boolean {
    if (!appointment.appointment_data) return false;

    const data = appointment.appointment_data;

    // Sources relacionadas ao WhatsApp/IA (são internos)
    const whatsappSources = [
      "whatsapp_conversation",
      "whatsapp_ai",
      "whatsapp",
      "ai_booking",
      "conversation",
    ];

    return whatsappSources.includes(data.source);
  }

  /**
   * Obter source do appointment
   */
  private getAppointmentSource(appointment: any): string {
    if (!appointment.appointment_data || !appointment.appointment_data.source) {
      return "unknown";
    }

    return appointment.appointment_data.source;
  }

  /**
   * Calcular métricas para um conjunto de appointments (por canal)
   */
  private calculateChannelMetrics(
    channelAppointments: any[],
  ): Omit<InternalAppointmentMetrics, "customers"> {
    if (!channelAppointments || channelAppointments.length === 0) {
      return {
        total: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0,
        success_rate: 0,
        avg_value: 0,
      };
    }

    const total = channelAppointments.length;
    const completed = channelAppointments.filter(
      (a) => a.status === "completed",
    ).length;
    const cancelled = channelAppointments.filter(
      (a) => a.status === "cancelled",
    ).length;

    const revenue = channelAppointments
      .filter((a) => a.status === "completed" || a.status === "confirmed")
      .reduce((sum, a) => {
        const price = a.quoted_price || a.final_price || 0;
        return sum + price;
      }, 0);

    const successRate = total > 0 ? (completed / total) * 100 : 0;
    const avgValue = completed > 0 ? revenue / completed : 0;

    return {
      total,
      completed,
      cancelled,
      revenue,
      success_rate: successRate,
      avg_value: avgValue,
    };
  }

  /**
   * Calcular comparação de performance entre canais
   */
  private calculateChannelPerformance(
    internal: Omit<InternalAppointmentMetrics, "customers">,
    external: Omit<ExternalAppointmentMetrics, "customers" | "sources">,
    whatsappAI: Omit<
      WhatsAppAIAppointmentMetrics,
      "customers" | "linked_conversations" | "conversion_rate"
    >,
  ): ChannelPerformanceComparison {
    const totalExternal = external.total + whatsappAI.total;
    const internalVsExternalRatio =
      totalExternal > 0 ? (internal.total / totalExternal) * 100 : 0;

    // Ranking de eficiência por canal
    const channels = [
      {
        channel: "internal",
        success_rate: internal.success_rate,
        revenue_per_appointment:
          internal.total > 0 ? internal.revenue / internal.total : 0,
        efficiency_score:
          (internal.success_rate + internal.avg_value / 100) / 2,
      },
      {
        channel: "external",
        success_rate: external.success_rate,
        revenue_per_appointment:
          external.total > 0 ? external.revenue / external.total : 0,
        efficiency_score:
          (external.success_rate + external.avg_value / 100) / 2,
      },
      {
        channel: "whatsapp_ai",
        success_rate: whatsappAI.success_rate,
        revenue_per_appointment:
          whatsappAI.total > 0 ? whatsappAI.revenue / whatsappAI.total : 0,
        efficiency_score:
          (whatsappAI.success_rate + whatsappAI.avg_value / 100) / 2,
      },
    ];

    // Ordenar por efficiency_score
    channels.sort((a, b) => b.efficiency_score - a.efficiency_score);

    const bestChannel = channels[0];

    return {
      internal_vs_external_ratio: internalVsExternalRatio,
      best_performing_channel: bestChannel?.channel || "none",
      best_conversion_rate: bestChannel?.success_rate || 0,
      best_revenue_per_appointment: bestChannel?.revenue_per_appointment || 0,
      channel_efficiency_ranking: channels,
    };
  }

  /**
   * Analisar agendamentos cancelados em detalhes
   */
  private async analyzeCancelledAppointments(
    cancelledAppointments: any[],
  ): Promise<CancelledAppointmentMetrics> {
    if (!cancelledAppointments || cancelledAppointments.length === 0) {
      return this.getEmptyCancelledMetrics();
    }

    const totalCancelled = cancelledAppointments.length;
    let cancelledByCustomer = 0;
    let cancelledByBusiness = 0;
    let cancelledBySystem = 0;
    let totalCancellationTimeHours = 0;
    let revenueLost = 0;
    const cancellationReasons: Record<string, number> = {};

    cancelledAppointments.forEach((apt) => {
      // Calcular revenue perdido
      const price = apt.quoted_price || apt.final_price || 0;
      revenueLost += price;

      // Analisar dados de cancelamento
      if (apt.appointment_data && apt.appointment_data.cancellation) {
        const cancellationData = apt.appointment_data.cancellation;

        // Classificar por quem cancelou
        switch (cancellationData.cancelled_by) {
          case "customer":
            cancelledByCustomer++;
            break;
          case "business":
          case "staff":
            cancelledByBusiness++;
            break;
          case "system":
          case "auto":
            cancelledBySystem++;
            break;
          default:
            cancelledByCustomer++; // Default para customer
            break;
        }

        // Tempo de cancelamento
        if (cancellationData.cancelled_at && apt.start_time) {
          const cancelTime = new Date(cancellationData.cancelled_at);
          const appointmentTime = new Date(apt.start_time);
          const hoursBeforeAppointment =
            (appointmentTime.getTime() - cancelTime.getTime()) /
            (1000 * 60 * 60);
          totalCancellationTimeHours += Math.max(0, hoursBeforeAppointment);
        }

        // Razões de cancelamento
        if (cancellationData.reason) {
          cancellationReasons[cancellationData.reason] =
            (cancellationReasons[cancellationData.reason] || 0) + 1;
        }
      } else {
        // Se não tem dados de cancelamento, assume que foi pelo customer
        cancelledByCustomer++;
      }
    });

    const avgCancellationTimeHours =
      totalCancelled > 0 ? totalCancellationTimeHours / totalCancelled : 0;

    return {
      total_cancelled: totalCancelled,
      cancelled_by_customer: cancelledByCustomer,
      cancelled_by_business: cancelledByBusiness,
      cancelled_by_system: cancelledBySystem,
      cancellation_rate: 0, // Será calculado no contexto total
      avg_cancellation_time_hours: avgCancellationTimeHours,
      revenue_lost: revenueLost,
      top_cancellation_reasons: cancellationReasons,
    };
  }

  /**
   * Analisar no-shows em detalhes
   */
  private async analyzeNoShowAppointments(
    noShowAppointments: any[],
  ): Promise<NoShowAppointmentMetrics> {
    if (!noShowAppointments || noShowAppointments.length === 0) {
      return this.getEmptyNoShowMetrics();
    }

    const totalNoShow = noShowAppointments.length;
    let revenueLostNoShow = 0;
    const noShowByService: Record<string, number> = {};
    const noShowByTimeSlot: Record<string, number> = {};
    const customerNoShowCount = new Map<string, number>();

    noShowAppointments.forEach((apt) => {
      // Revenue perdido
      const price = apt.quoted_price || apt.final_price || 0;
      revenueLostNoShow += price;

      // Por serviço
      if (apt.service_name) {
        noShowByService[apt.service_name] =
          (noShowByService[apt.service_name] || 0) + 1;
      }

      // Por horário
      if (apt.start_time) {
        const hour = new Date(apt.start_time).getHours();
        const timeSlot = `${hour}:00-${hour + 1}:00`;
        noShowByTimeSlot[timeSlot] = (noShowByTimeSlot[timeSlot] || 0) + 1;
      }

      // Clientes com múltiplos no-shows
      if (apt.user_id) {
        customerNoShowCount.set(
          apt.user_id,
          (customerNoShowCount.get(apt.user_id) || 0) + 1,
        );
      }
    });

    const repeatNoShowCustomers = Array.from(
      customerNoShowCount.values(),
    ).filter((count) => count > 1).length;

    return {
      total_no_show: totalNoShow,
      no_show_rate: 0, // Será calculado no contexto total
      no_show_by_service: noShowByService,
      no_show_by_time_slot: noShowByTimeSlot,
      revenue_lost_no_show: revenueLostNoShow,
      repeat_no_show_customers: repeatNoShowCustomers,
    };
  }

  /**
   * Analisar agendamentos por serviço
   */
  private async analyzeAppointmentsByService(
    tenantId: string,
    appointments: any[],
    period: MetricsPeriod,
  ): Promise<Record<string, ServiceAppointmentMetrics>> {
    const serviceMetrics: Record<string, ServiceAppointmentMetrics> = {};

    // Agrupar appointments por serviço
    const appointmentsByService = new Map<string, any[]>();

    appointments.forEach((apt) => {
      const serviceName = apt.service_name || "Serviço não especificado";
      if (!appointmentsByService.has(serviceName)) {
        appointmentsByService.set(serviceName, []);
      }
      appointmentsByService.get(serviceName)!.push(apt);
    });

    // Calcular métricas para cada serviço
    let popularityRanking = 1;
    const serviceArray = Array.from(appointmentsByService.entries()).sort(
      ([, aptsA], [, aptsB]) => aptsB.length - aptsA.length,
    );

    serviceArray.forEach(([serviceName, serviceAppointments]) => {
      const totalAppointments = serviceAppointments.length;
      const completed = serviceAppointments.filter(
        (a) => a.status === "completed",
      ).length;
      const cancelled = serviceAppointments.filter(
        (a) => a.status === "cancelled",
      ).length;
      const noShow = serviceAppointments.filter(
        (a) => a.status === "no_show",
      ).length;

      const revenue = serviceAppointments
        .filter((a) => a.status === "completed" || a.status === "confirmed")
        .reduce((sum, a) => sum + (a.quoted_price || a.final_price || 0), 0);

      const avgPrice = totalAppointments > 0 ? revenue / totalAppointments : 0;
      const successRate =
        totalAppointments > 0 ? (completed / totalAppointments) * 100 : 0;

      serviceMetrics[serviceName] = {
        service_name: serviceName,
        total_appointments: totalAppointments,
        completed_appointments: completed,
        cancelled_appointments: cancelled,
        no_show_appointments: noShow,
        total_revenue: revenue,
        avg_service_price: avgPrice,
        success_rate: successRate,
        popularity_ranking: popularityRanking++,
      };
    });

    return serviceMetrics;
  }

  /**
   * Analisar disponibilidade de serviços - USANDO APENAS APPOINTMENTS
   */
  private async analyzeServiceAvailability(
    tenantId: string,
  ): Promise<ServiceAvailabilityMetrics> {
    const supabase = getAdminClient();

    // Buscar appointments com serviços para calcular métricas
    const { data: appointments, error } = (await supabase
      .from("appointments")
      .select("service_name, quoted_price, final_price")
      .eq("tenant_id", tenantId)
      .not("service_name", "is", null)) as { data: any[] | null; error: any };

    if (error || !appointments) {
      return this.getEmptyServiceAvailabilityMetrics();
    }

    // Extrair serviços únicos dos appointments
    const uniqueServices = Array.from(
      new Set(appointments.map((a) => a.service_name)),
    );
    const totalServices = uniqueServices.length;

    // Todos os serviços com appointments são considerados "ativos"
    const activeServices = totalServices;
    const inactiveServices = 0; // Não temos dados de serviços inativos apenas dos appointments
    const servicesWithAppointments = activeServices;
    const servicesWithoutAppointments = 0;

    // Calcular métricas de preço dos appointments
    const prices = appointments
      .map((a) => a.quoted_price || a.final_price || 0)
      .filter((p) => p > 0);

    const avgPrice =
      prices.length > 0
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
        : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Determinar serviço mais popular por quantidade de appointments
    const serviceCount: Record<string, number> = {};
    const serviceRevenue: Record<string, number> = {};

    appointments.forEach((apt) => {
      if (apt.service_name) {
        serviceCount[apt.service_name] =
          (serviceCount[apt.service_name] || 0) + 1;
        const price = apt.quoted_price || apt.final_price || 0;
        serviceRevenue[apt.service_name] =
          (serviceRevenue[apt.service_name] || 0) + price;
      }
    });

    const mostPopular =
      Object.keys(serviceCount).length > 0
        ? Object.keys(serviceCount).reduce(
            (a, b) => (serviceCount[a]! > serviceCount[b]! ? a : b),
            uniqueServices[0] || "N/A",
          )
        : "N/A";

    const highestRevenue =
      Object.keys(serviceRevenue).length > 0
        ? Object.keys(serviceRevenue).reduce(
            (a, b) => (serviceRevenue[a]! > serviceRevenue[b]! ? a : b),
            uniqueServices[0] || "N/A",
          )
        : "N/A";

    return {
      total_services_available: totalServices,
      active_services: activeServices,
      inactive_services: inactiveServices,
      services_with_appointments: servicesWithAppointments,
      services_without_appointments: servicesWithoutAppointments,
      avg_price_per_service: avgPrice,
      price_range: { min: minPrice, max: maxPrice },
      most_popular_service: mostPopular,
      highest_revenue_service: highestRevenue,
    };
  }

  /**
   * Analisar métricas de clientes
   */
  private async analyzeCustomerMetrics(
    tenantId: string,
    appointments: any[],
    period: MetricsPeriod,
  ): Promise<CustomerMetrics> {
    const uniqueCustomers = new Set(
      appointments.map((a) => a.user_id).filter((id) => id),
    ).size;

    if (uniqueCustomers === 0) {
      return this.getEmptyCustomerMetrics();
    }

    // Calcular clientes novos vs retornantes usando apenas os appointments do período
    const dateRange = this.getDateRange(period);

    // Simplificado: assumir que metade são novos clientes (placeholder)
    const newCustomers = Math.floor(uniqueCustomers * 0.4); // 40% novos

    const returningCustomers = uniqueCustomers - newCustomers;
    const retentionRate =
      uniqueCustomers > 0 ? (returningCustomers / uniqueCustomers) * 100 : 0;

    // Appointments por cliente
    const customerAppointmentCounts = new Map<string, number>();
    const customerRevenue = new Map<string, number>();

    appointments.forEach((apt) => {
      if (apt.user_id) {
        customerAppointmentCounts.set(
          apt.user_id,
          (customerAppointmentCounts.get(apt.user_id) || 0) + 1,
        );

        const revenue = apt.quoted_price || apt.final_price || 0;
        customerRevenue.set(
          apt.user_id,
          (customerRevenue.get(apt.user_id) || 0) + revenue,
        );
      }
    });

    const avgAppointmentsPerCustomer =
      uniqueCustomers > 0 ? appointments.length / uniqueCustomers : 0;
    const totalRevenue = Array.from(customerRevenue.values()).reduce(
      (sum, rev) => sum + rev,
      0,
    );
    const customerLifetimeValue =
      uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;

    // Top customers by revenue
    const topCustomers = Array.from(customerRevenue.entries())
      .map(([customerId, revenue]) => ({
        customer_id: customerId,
        appointments: customerAppointmentCounts.get(customerId) || 0,
        total_spent: revenue,
      }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    // Canal de aquisição (placeholder - seria necessário dados mais detalhados)
    const acquisitionChannels: Record<string, number> = {
      whatsapp: Math.floor(newCustomers * 0.6),
      website: Math.floor(newCustomers * 0.3),
      referral: Math.floor(newCustomers * 0.1),
    };

    return {
      total_unique_customers: uniqueCustomers,
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      customer_retention_rate: retentionRate,
      avg_appointments_per_customer: avgAppointmentsPerCustomer,
      customer_lifetime_value: customerLifetimeValue,
      customers_by_acquisition_channel: acquisitionChannels,
      top_customers_by_revenue: topCustomers,
    };
  }

  /**
   * Analisar métricas de funcionários - USANDO APENAS APPOINTMENTS
   */
  private async analyzeStaffMetrics(
    tenantId: string,
    appointments: any[],
    period: MetricsPeriod,
  ): Promise<StaffMetrics> {
    // Extrair funcionários únicos dos appointments
    const uniqueStaffIds = Array.from(
      new Set(appointments.map((a) => a.professional_id).filter((id) => id)),
    );

    const totalStaff = uniqueStaffIds.length;
    const activeStaff = totalStaff; // Todos os staff com appointments são considerados ativos

    // Calcular staff com appointments
    const staffWithAppointments = new Set(
      appointments.map((a) => a.professional_id).filter((id) => id),
    ).size;

    const avgAppointmentsPerStaff =
      activeStaff > 0 ? appointments.length / activeStaff : 0;
    const utilizationRate =
      totalStaff > 0 ? (staffWithAppointments / totalStaff) * 100 : 0;

    // Top performing staff
    const staffPerformance = new Map<
      string,
      { appointments: number; revenue: number; completed: number }
    >();

    appointments.forEach((apt) => {
      if (apt.professional_id) {
        const current = staffPerformance.get(apt.professional_id) || {
          appointments: 0,
          revenue: 0,
          completed: 0,
        };
        current.appointments++;

        if (apt.status === "completed" || apt.status === "confirmed") {
          current.revenue += apt.quoted_price || apt.final_price || 0;
        }

        if (apt.status === "completed") {
          current.completed++;
        }

        staffPerformance.set(apt.professional_id, current);
      }
    });

    const topPerformingStaff = Array.from(staffPerformance.entries())
      .map(([staffId, metrics]) => ({
        staff_id: staffId,
        appointments_handled: metrics.appointments,
        revenue_generated: metrics.revenue,
        success_rate:
          metrics.appointments > 0
            ? (metrics.completed / metrics.appointments) * 100
            : 0,
      }))
      .sort((a, b) => b.revenue_generated - a.revenue_generated)
      .slice(0, 5);

    // Placeholder para horas disponíveis baseado no período
    const daysInPeriod =
      period === MetricsPeriod.SEVEN_DAYS
        ? 7
        : period === MetricsPeriod.THIRTY_DAYS
          ? 30
          : 90;
    const availabilityHours = activeStaff * 8 * Math.min(daysInPeriod, 30); // Máx 30 dias úteis

    return {
      total_staff_members: totalStaff,
      active_staff_members: activeStaff,
      staff_with_appointments: staffWithAppointments,
      avg_appointments_per_staff: avgAppointmentsPerStaff,
      staff_utilization_rate: utilizationRate,
      top_performing_staff: topPerformingStaff,
      staff_availability_hours: availabilityHours,
    };
  }

  // Métodos para métricas vazias
  private getEmptyCancelledMetrics(): CancelledAppointmentMetrics {
    return {
      total_cancelled: 0,
      cancelled_by_customer: 0,
      cancelled_by_business: 0,
      cancelled_by_system: 0,
      cancellation_rate: 0,
      avg_cancellation_time_hours: 0,
      revenue_lost: 0,
      top_cancellation_reasons: {},
    };
  }

  private getEmptyNoShowMetrics(): NoShowAppointmentMetrics {
    return {
      total_no_show: 0,
      no_show_rate: 0,
      no_show_by_service: {},
      no_show_by_time_slot: {},
      revenue_lost_no_show: 0,
      repeat_no_show_customers: 0,
    };
  }

  private getEmptyServiceAvailabilityMetrics(): ServiceAvailabilityMetrics {
    return {
      total_services_available: 0,
      active_services: 0,
      inactive_services: 0,
      services_with_appointments: 0,
      services_without_appointments: 0,
      avg_price_per_service: 0,
      price_range: { min: 0, max: 0 },
      most_popular_service: "N/A",
      highest_revenue_service: "N/A",
    };
  }

  private getEmptyCustomerMetrics(): CustomerMetrics {
    return {
      total_unique_customers: 0,
      new_customers: 0,
      returning_customers: 0,
      customer_retention_rate: 0,
      avg_appointments_per_customer: 0,
      customer_lifetime_value: 0,
      customers_by_acquisition_channel: {},
      top_customers_by_revenue: [],
    };
  }

  private getEmptyStaffMetrics(): StaffMetrics {
    return {
      total_staff_members: 0,
      active_staff_members: 0,
      staff_with_appointments: 0,
      avg_appointments_per_staff: 0,
      staff_utilization_rate: 0,
      top_performing_staff: [],
      staff_availability_hours: 0,
    };
  }
}
