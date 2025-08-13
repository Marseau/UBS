import { getAdminClient } from "../config/database";
import { subDays, subMonths, format, startOfMonth, endOfMonth } from "date-fns";

export interface SaasMetrics {
  metricDate: Date;
  activeTenants: number;
  totalTenants: number;
  mrr: number;
  arr: number;
  churnRate: number;
  conversionRate: number;
  avgRevenuePerTenant: number;
  totalAppointments: number;
  totalRevenue: number;
  aiInteractions: number;
}

export interface TenantDistribution {
  businessDomain: string;
  tenantCount: number;
  revenueShare: number;
  growthRate: number;
}

export interface GrowthMetrics {
  metricMonth: Date;
  newTenants: number;
  churnedTenants: number;
  revenueGrowth: number;
  customerGrowth: number;
  mrrGrowth: number;
  platformHealthScore: number;
}

export class SaasMetricsService {
  private get supabase() {
    return getAdminClient();
  }

  /**
   * Calcula todas as métricas SaaS para uma data específica
   */
  async calculateSaasMetrics(date: Date = new Date()): Promise<SaasMetrics> {
    try {
      const activeTenants = await this.getActiveTenants(date);
      const totalTenants = await this.getTotalTenants(date);
      const mrr = await this.calculateMRR(date);
      const arr = mrr * 12;
      const churnRate = await this.calculateChurnRate(date);
      const conversionRate = await this.calculateConversionRate(date);
      const avgRevenuePerTenant = activeTenants > 0 ? mrr / activeTenants : 0;
      const totalAppointments = await this.getTotalAppointments(date);
      const totalRevenue = await this.getTotalRevenue(date);
      const aiInteractions = await this.getAiInteractions(date);

      return {
        metricDate: date,
        activeTenants,
        totalTenants,
        mrr,
        arr,
        churnRate,
        conversionRate,
        avgRevenuePerTenant,
        totalAppointments,
        totalRevenue,
        aiInteractions,
      };
    } catch (error) {
      console.error("Erro ao calcular métricas SaaS:", error);
      throw error;
    }
  }

  /**
   * Calcula distribuição de tenants por domínio
   */
  async calculateTenantDistribution(
    date: Date = new Date(),
  ): Promise<TenantDistribution[]> {
    try {
      const { data: tenants, error } = await this.supabase
        .from("tenants")
        .select("domain, created_at")
        .eq("status", "active")
        .lte("created_at", date.toISOString());

      if (error) throw error;

      const distribution: { [key: string]: TenantDistribution } = {};
      const totalRevenue = await this.getTotalRevenue(date);

      // Contar tenants por domínio
      for (const tenant of tenants) {
        const domain = (tenant as any).domain || "other";
        if (!distribution[domain]) {
          distribution[domain] = {
            businessDomain: domain,
            tenantCount: 0,
            revenueShare: 0,
            growthRate: 0,
          };
        }
        distribution[domain].tenantCount++;
      }

      // Calcular receita por domínio e crescimento
      for (const domain of Object.keys(distribution)) {
        const domainRevenue = await this.getDomainRevenue(domain, date);
        (distribution as any)[domain].revenueShare =
          totalRevenue > 0 ? (domainRevenue / totalRevenue) * 100 : 0;
        (distribution as any)[domain].growthRate =
          await this.getDomainGrowthRate(domain, date);
      }

      return Object.values(distribution);
    } catch (error) {
      console.error("Erro ao calcular distribuição de tenants:", error);
      throw error;
    }
  }

  /**
   * Calcula métricas de crescimento mensais
   */
  async calculateGrowthMetrics(
    month: Date = new Date(),
  ): Promise<GrowthMetrics> {
    try {
      const startMonth = startOfMonth(month);
      const endMonth = endOfMonth(month);
      const previousMonth = subMonths(startMonth, 1);

      const newTenants = await this.getNewTenants(startMonth, endMonth);
      const churnedTenants = await this.getChurnedTenants(startMonth, endMonth);
      const revenueGrowth = await this.getRevenueGrowth(month);
      const customerGrowth = await this.getCustomerGrowth(month);
      const mrrGrowth = await this.getMrrGrowth(month);
      const platformHealthScore =
        await this.calculatePlatformHealthScore(month);

      return {
        metricMonth: startMonth,
        newTenants,
        churnedTenants,
        revenueGrowth,
        customerGrowth,
        mrrGrowth,
        platformHealthScore,
      };
    } catch (error) {
      console.error("Erro ao calcular métricas de crescimento:", error);
      throw error;
    }
  }

  /**
   * Obtém top tenants por performance
   */
  async getTopTenants(
    date: Date = new Date(),
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const lastMonth = subDays(date, 30);

      // Buscar tenants com receita do último mês
      const { data: appointments, error } = await this.supabase
        .from("appointments")
        .select(
          `
                    tenant_id,
                    appointment_data,
                    tenants(name, domain)
                `,
        )
        .eq("status", "completed")
        .gte("created_at", lastMonth.toISOString())
        .lte("created_at", date.toISOString());

      if (error) throw error;

      // Agrupar por tenant e calcular métricas
      const tenantMetrics: { [key: string]: any } = {};

      for (const appointment of appointments) {
        const tenantId = (appointment as any).tenant_id;
        const revenue = (appointment.appointment_data as any)?.price || 0;

        if (!tenantMetrics[tenantId]) {
          tenantMetrics[tenantId] = {
            tenantId,
            name: (appointment.tenants as any)?.name || "Unknown",
            domain: (appointment.tenants as any)?.domain || "other",
            revenue: 0,
            appointmentCount: 0,
            growthRate: 0,
          };
        }

        (tenantMetrics as any)[tenantId].revenue += revenue;
        (tenantMetrics as any)[tenantId].appointmentCount++;
      }

      // Calcular crescimento para cada tenant
      for (const tenantId of Object.keys(tenantMetrics)) {
        (tenantMetrics as any)[tenantId].growthRate =
          await this.getTenantGrowthRate(tenantId, date);
      }

      // Ordenar por receita e retornar top
      return Object.values(tenantMetrics)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit)
        .map((tenant, index) => ({
          ...tenant,
          rankPosition: index + 1,
        }));
    } catch (error) {
      console.error("Erro ao obter top tenants:", error);
      throw error;
    }
  }

  // Métodos auxiliares para cálculos específicos
  private async getActiveTenants(date: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("status", "active")
      .lte("created_at", date.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getTotalTenants(date: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .lte("created_at", date.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async calculateMRR(date: Date): Promise<number> {
    const startMonth = startOfMonth(date);
    const endMonth = endOfMonth(date);

    const { data: appointments, error } = await this.supabase
      .from("appointments")
      .select("final_price, quoted_price, appointment_data, external_event_id")
      .eq("status", "completed")
      .gte("created_at", startMonth.toISOString())
      .lte("created_at", endMonth.toISOString());

    if (error) throw error;

    // 💰 REVENUE CORRETO - usar final_price > quoted_price > appointment_data.price
    const totalRevenue =
      appointments?.reduce((sum, app) => {
        const revenue =
          app.final_price ||
          app.quoted_price ||
          (app.appointment_data as any)?.price ||
          0;
        return sum + revenue;
      }, 0) || 0;

    return totalRevenue;
  }

  /**
   * 🎯 MÉTRICAS ESTRATÉGICAS - Appointments por fonte + Risco Bypass
   */
  async calculateStrategicMetrics(date: Date = new Date()): Promise<{
    totalAppointments: number;
    internalAppointments: number;
    externalAppointments: number;
    whatsappAppointments: number;
    calendarAppointments: number;
    bypassRiskPct: number;
    internalRevenue: number;
    externalRevenue: number;
    revenueSplit: { internal: number; external: number };
  }> {
    const startMonth = startOfMonth(date);
    const endMonth = endOfMonth(date);

    const { data: appointments, error } = await this.supabase
      .from("appointments")
      .select("final_price, quoted_price, appointment_data, external_event_id")
      .gte("created_at", startMonth.toISOString())
      .lte("created_at", endMonth.toISOString());

    if (error) throw error;

    // 📊 CONTADORES por fonte
    const totalAppointments = appointments?.length || 0;
    const internalAppointments =
      appointments?.filter((a) => !a.external_event_id).length || 0;
    const externalAppointments =
      appointments?.filter((a) => a.external_event_id).length || 0;
    const whatsappAppointments =
      appointments?.filter(
        (a) => (a.appointment_data as any)?.source === "whatsapp",
      ).length || 0;
    const calendarAppointments =
      appointments?.filter(
        (a) => (a.appointment_data as any)?.source === "google_calendar",
      ).length || 0;

    // 🚨 RISCO BYPASS - % externos vs total
    const bypassRiskPct =
      totalAppointments > 0
        ? (externalAppointments / totalAppointments) * 100
        : 0;

    // 💰 REVENUE por fonte
    const internalRevenue =
      appointments
        ?.filter((a) => !a.external_event_id)
        .reduce((sum, app) => {
          const revenue =
            app.final_price ||
            app.quoted_price ||
            (app.appointment_data as any)?.price ||
            0;
          return sum + revenue;
        }, 0) || 0;

    const externalRevenue =
      appointments
        ?.filter((a) => a.external_event_id)
        .reduce((sum, app) => {
          const revenue =
            app.final_price ||
            app.quoted_price ||
            (app.appointment_data as any)?.price ||
            0;
          return sum + revenue;
        }, 0) || 0;

    const totalRevenue = internalRevenue + externalRevenue;
    const revenueSplit = {
      internal: totalRevenue > 0 ? (internalRevenue / totalRevenue) * 100 : 0,
      external: totalRevenue > 0 ? (externalRevenue / totalRevenue) * 100 : 0,
    };

    return {
      totalAppointments,
      internalAppointments,
      externalAppointments,
      whatsappAppointments,
      calendarAppointments,
      bypassRiskPct,
      internalRevenue,
      externalRevenue,
      revenueSplit,
    };
  }

  /**
   * 💬 CONVERSATION METRICS - Detectar conversas únicas e outcomes
   */
  async calculateConversationMetrics(date: Date = new Date()): Promise<{
    totalConversations: number;
    totalMessages: number;
    conversionRate: number;
    outcomesAnalysis: { [key: string]: number };
    qualityScore: number;
  }> {
    const startMonth = startOfMonth(date);
    const endMonth = endOfMonth(date);

    const { data: conversations, error } = await this.supabase
      .from("conversation_history")
      .select("conversation_context")
      .gte("created_at", startMonth.toISOString())
      .lte("created_at", endMonth.toISOString());

    if (error) throw error;

    // 🗣️ DETECTAR conversas únicas via session_id
    const uniqueSessions = new Set();
    const outcomesAnalysis: { [key: string]: number } = {};

    conversations?.forEach((c: any) => {
      try {
        const context =
          typeof c.conversation_context === "string"
            ? JSON.parse(c.conversation_context)
            : c.conversation_context;

        // Session detection
        const sessionId = context?.session_id || context?.sessionId;
        if (sessionId) {
          uniqueSessions.add(sessionId);
        }

        // Outcome analysis
        const outcome = context?.conversation_outcome;
        if (outcome) {
          outcomesAnalysis[outcome] = (outcomesAnalysis[outcome] || 0) + 1;
        }
      } catch (e) {
        // Ignorar erros de parsing
      }
    });

    const totalConversations = uniqueSessions.size;
    const totalMessages = conversations?.length || 0;

    // 📈 CONVERSION RATE - usar dados de appointments internos
    const strategicMetrics = await this.calculateStrategicMetrics(date);
    const conversionRate =
      totalConversations > 0
        ? (strategicMetrics.internalAppointments / totalConversations) * 100
        : 0;

    // 🎯 QUALITY SCORE baseado em outcomes positivos
    const positiveOutcomes = [
      "appointment_created",
      "appointment_confirmed",
      "info_request_fulfilled",
      "appointment_rescheduled",
    ];
    const negativeOutcomes = [
      "booking_abandoned",
      "timeout_abandoned",
      "spam_detected",
      "wrong_number",
    ];

    const totalOutcomes = Object.values(outcomesAnalysis).reduce(
      (sum, count) => sum + count,
      0,
    );
    const positiveCount = positiveOutcomes.reduce(
      (sum, outcome) => sum + (outcomesAnalysis[outcome] || 0),
      0,
    );
    const negativeCount = negativeOutcomes.reduce(
      (sum, outcome) => sum + (outcomesAnalysis[outcome] || 0),
      0,
    );

    const qualityScore =
      totalOutcomes > 0
        ? ((positiveCount - negativeCount) / totalOutcomes) * 100
        : 0;

    return {
      totalConversations,
      totalMessages,
      conversionRate,
      outcomesAnalysis,
      qualityScore: Math.max(0, qualityScore), // Não permitir score negativo
    };
  }

  private async calculateChurnRate(date: Date): Promise<number> {
    const startMonth = startOfMonth(date);
    const endMonth = endOfMonth(date);
    const previousMonth = subMonths(startMonth, 1);

    const activeAtStart = await this.getActiveTenants(previousMonth);
    const churnedThisMonth = await this.getChurnedTenants(startMonth, endMonth);

    return activeAtStart > 0 ? (churnedThisMonth / activeAtStart) * 100 : 0;
  }

  private async calculateConversionRate(date: Date): Promise<number> {
    const lastMonth = subDays(date, 30);

    // Buscar conversas que resultaram em agendamentos
    const { data: conversations, error: convError } = await this.supabase
      .from("conversation_history")
      .select("tenant_id, user_id")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    const { data: appointments, error: appError } = await this.supabase
      .from("appointments")
      .select("tenant_id, user_id")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    if (convError || appError) return 0;

    const uniqueConversations = new Set(
      conversations?.map((c) => `${c.tenant_id}-${c.user_id}`),
    );
    const uniqueAppointments = new Set(
      appointments?.map((a) => `${a.tenant_id}-${a.user_id}`),
    );

    const totalConversations = uniqueConversations.size;
    const conversionsToAppointments = uniqueAppointments.size;

    return totalConversations > 0
      ? (conversionsToAppointments / totalConversations) * 100
      : 0;
  }

  private async getTotalAppointments(date: Date): Promise<number> {
    const lastMonth = subDays(date, 30);

    const { data, error } = await this.supabase
      .from("appointments")
      .select("id")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getTotalRevenue(date: Date): Promise<number> {
    const lastMonth = subDays(date, 30);

    const { data, error } = await this.supabase
      .from("appointments")
      .select("appointment_data")
      .eq("status", "completed")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    if (error) throw error;

    return (
      data?.reduce((sum, app) => {
        return sum + ((app.appointment_data as any)?.price || 0);
      }, 0) || 0
    );
  }

  private async getAiInteractions(date: Date): Promise<number> {
    const lastMonth = subDays(date, 30);

    const { data, error } = await this.supabase
      .from("conversation_history")
      .select("id")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getDomainRevenue(domain: string, date: Date): Promise<number> {
    const lastMonth = subDays(date, 30);

    const { data, error } = await this.supabase
      .from("appointments")
      .select(
        `
                appointment_data,
                tenants!inner(domain)
            `,
      )
      .eq("status", "completed")
      .gte("created_at", lastMonth.toISOString())
      .lte("created_at", date.toISOString());

    if (error) throw error;

    return (
      data?.reduce((sum, app) => {
        return sum + ((app.appointment_data as any)?.price || 0);
      }, 0) || 0
    );
  }

  private async getDomainGrowthRate(
    domain: string,
    date: Date,
  ): Promise<number> {
    const thisMonth = startOfMonth(date);
    const lastMonth = startOfMonth(subMonths(date, 1));

    const thisMonthCount = await this.getDomainTenantCount(domain, thisMonth);
    const lastMonthCount = await this.getDomainTenantCount(domain, lastMonth);

    return lastMonthCount > 0
      ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100
      : 0;
  }

  private async getDomainTenantCount(
    domain: string,
    date: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("status", "active")
      .lte("created_at", date.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getNewTenants(startDate: Date, endDate: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getChurnedTenants(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("status", "inactive")
      .gte("updated_at", startDate.toISOString())
      .lte("updated_at", endDate.toISOString());

    if (error) throw error;
    return data?.length || 0;
  }

  private async getRevenueGrowth(month: Date): Promise<number> {
    const thisMonth = await this.calculateMRR(month);
    const lastMonth = await this.calculateMRR(subMonths(month, 1));

    return lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  }

  private async getCustomerGrowth(month: Date): Promise<number> {
    const thisMonth = await this.getActiveTenants(month);
    const lastMonth = await this.getActiveTenants(subMonths(month, 1));

    return lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  }

  private async getMrrGrowth(month: Date): Promise<number> {
    return this.getRevenueGrowth(month); // Mesmo cálculo que revenue growth
  }

  private async calculatePlatformHealthScore(month: Date): Promise<number> {
    // Score baseado em múltiplos fatores
    let score = 50; // Base

    const churnRate = await this.calculateChurnRate(month);
    const conversionRate = await this.calculateConversionRate(month);
    const growthRate = await this.getCustomerGrowth(month);

    // Ajustar score baseado em métricas
    if (churnRate < 5) score += 20;
    else if (churnRate < 10) score += 10;
    else if (churnRate > 20) score -= 20;

    if (conversionRate > 20) score += 15;
    else if (conversionRate > 10) score += 10;
    else if (conversionRate < 5) score -= 10;

    if (growthRate > 10) score += 15;
    else if (growthRate > 5) score += 10;
    else if (growthRate < 0) score -= 15;

    return Math.min(100, Math.max(0, score));
  }

  private async getTenantGrowthRate(
    tenantId: string,
    date: Date,
  ): Promise<number> {
    const thisMonth = await this.getTenantRevenue(tenantId, date, 30);
    const lastMonth = await this.getTenantRevenue(
      tenantId,
      subMonths(date, 1),
      30,
    );

    return lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  }

  private async getTenantRevenue(
    tenantId: string,
    date: Date,
    days: number,
  ): Promise<number> {
    const startDate = subDays(date, days);

    const { data, error } = await this.supabase
      .from("appointments")
      .select("appointment_data")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", date.toISOString());

    if (error) throw error;

    return (
      data?.reduce((sum, app) => {
        return sum + ((app.appointment_data as any)?.price || 0);
      }, 0) || 0
    );
  }

  /**
   * Salva métricas SaaS calculadas
   */
  async saveSaasMetrics(metrics: SaasMetrics): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from("saas_metrics")
        .upsert(
          {
            metric_date: format(metrics.metricDate, "yyyy-MM-dd"),
            active_tenants: metrics.activeTenants,
            total_tenants: metrics.totalTenants,
            mrr: metrics.mrr,
            arr: metrics.arr,
            churn_rate: metrics.churnRate,
            conversion_rate: metrics.conversionRate,
            avg_revenue_per_tenant: metrics.avgRevenuePerTenant,
            total_appointments: metrics.totalAppointments,
            total_revenue: metrics.totalRevenue,
            ai_interactions: metrics.aiInteractions,
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "metric_date" },
        );

      if (error) throw error;

      console.log(
        `✅ Métricas SaaS salvas para ${format(metrics.metricDate, "yyyy-MM-dd")}`,
      );
    } catch (error) {
      console.error("Erro ao salvar métricas SaaS:", error);
      throw error;
    }
  }

  /**
   * Salva distribuição de tenants
   */
  async saveTenantDistribution(
    distribution: TenantDistribution[],
    date: Date,
  ): Promise<void> {
    try {
      const records = distribution.map((dist) => ({
        metric_date: format(date, "yyyy-MM-dd"),
        business_domain: dist.businessDomain,
        tenant_count: dist.tenantCount,
        revenue_share: dist.revenueShare,
        growth_rate: dist.growthRate,
        calculated_at: new Date().toISOString(),
      }));

      const { error } = await (this.supabase as any)
        .from("tenant_distribution")
        .upsert(records, { onConflict: "metric_date,business_domain" });

      if (error) throw error;

      console.log(
        `✅ Distribuição de tenants salva para ${format(date, "yyyy-MM-dd")}`,
      );
    } catch (error) {
      console.error("Erro ao salvar distribuição de tenants:", error);
      throw error;
    }
  }

  /**
   * Salva métricas de crescimento
   */
  async saveGrowthMetrics(metrics: GrowthMetrics): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from("growth_metrics")
        .upsert(
          {
            metric_month: format(metrics.metricMonth, "yyyy-MM-dd"),
            new_tenants: metrics.newTenants,
            churned_tenants: metrics.churnedTenants,
            revenue_growth: metrics.revenueGrowth,
            customer_growth: metrics.customerGrowth,
            mrr_growth: metrics.mrrGrowth,
            platform_health_score: metrics.platformHealthScore,
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "metric_month" },
        );

      if (error) throw error;

      console.log(
        `✅ Métricas de crescimento salvas para ${format(metrics.metricMonth, "yyyy-MM-dd")}`,
      );
    } catch (error) {
      console.error("Erro ao salvar métricas de crescimento:", error);
      throw error;
    }
  }

  /**
   * Salva top tenants
   */
  async saveTopTenants(topTenants: any[], date: Date): Promise<void> {
    try {
      const records = topTenants.map((tenant) => ({
        tenant_id: tenant.tenantId,
        ranking_date: format(date, "yyyy-MM-dd"),
        rank_position: tenant.rankPosition,
        revenue: tenant.revenue,
        growth_rate: tenant.growthRate,
        appointment_count: tenant.appointmentCount,
        calculated_at: new Date().toISOString(),
      }));

      const { error } = await (this.supabase as any)
        .from("top_tenants")
        .upsert(records, { onConflict: "ranking_date,tenant_id" });

      if (error) throw error;

      console.log(`✅ Top tenants salvos para ${format(date, "yyyy-MM-dd")}`);
    } catch (error) {
      console.error("Erro ao salvar top tenants:", error);
      throw error;
    }
  }
}
