import { getAdminClient } from "../config/database";
import { differenceInDays, subDays, format } from "date-fns";

export interface RiskFactors {
  lastActivityDays: number;
  cancellationRate: number;
  revenueTrend: number;
  customerSatisfaction: number;
  aiSuccessRate: number;
  appointmentFrequency: number;
}

export interface TenantRiskScore {
  tenantId: string;
  riskScore: number;
  riskStatus: "Baixo Risco" | "Risco Médio" | "Alto Risco";
  factors: RiskFactors;
  lastActivity: Date;
  recommendations: string[];
}

export class RiskCalculatorService {
  private get supabase() {
    return getAdminClient();
  }

  /**
   * Calcula o score de risco para um tenant específico
   */
  async calculateTenantRisk(tenantId: string): Promise<TenantRiskScore> {
    try {
      const factors = await this.gatherRiskFactors(tenantId);
      const riskScore = this.calculateRiskScore(factors);
      const riskStatus = this.getRiskStatus(riskScore);
      const recommendations = this.generateRecommendations(factors, riskScore);

      return {
        tenantId,
        riskScore,
        riskStatus,
        factors,
        lastActivity: new Date(),
        recommendations,
      };
    } catch (error) {
      console.error(`Erro ao calcular risco para tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Calcula risco para todos os tenants ativos
   */
  async calculateAllTenantsRisk(): Promise<TenantRiskScore[]> {
    try {
      // Buscar todos os tenants ativos
      const { data: tenants, error } = await this.supabase
        .from("tenants")
        .select("id")
        .eq("status", "active");

      if (error) throw error;

      const results: TenantRiskScore[] = [];

      for (const tenant of tenants) {
        try {
          const riskScore = await this.calculateTenantRisk(tenant.id);
          results.push(riskScore);
        } catch (error) {
          console.error(
            `Erro ao calcular risco para tenant ${tenant.id}:`,
            error,
          );
          // Continuar com outros tenants
        }
      }

      return results;
    } catch (error) {
      console.error("Erro ao calcular risco de todos os tenants:", error);
      throw error;
    }
  }

  /**
   * Coleta fatores de risco para um tenant
   */
  private async gatherRiskFactors(tenantId: string): Promise<RiskFactors> {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const sevenDaysAgo = subDays(new Date(), 7);

    // Última atividade
    const lastActivityDays = await this.getLastActivityDays(tenantId);

    // Taxa de cancelamento (últimos 30 dias)
    const cancellationRate = await this.getCancellationRate(
      tenantId,
      thirtyDaysAgo,
    );

    // Tendência de receita (comparação últimos 30 vs anteriores)
    const revenueTrend = await this.getRevenueTrend(tenantId);

    // Satisfação do cliente (baseada em feedback/ratings)
    const customerSatisfaction = await this.getCustomerSatisfaction(tenantId);

    // Taxa de sucesso das interações IA
    const aiSuccessRate = await this.getAiSuccessRate(tenantId, thirtyDaysAgo);

    // Frequência de agendamentos
    const appointmentFrequency = await this.getAppointmentFrequency(
      tenantId,
      sevenDaysAgo,
    );

    return {
      lastActivityDays,
      cancellationRate,
      revenueTrend,
      customerSatisfaction,
      aiSuccessRate,
      appointmentFrequency,
    };
  }

  /**
   * Calcula score de risco baseado nos fatores (0-100)
   */
  private calculateRiskScore(factors: RiskFactors): number {
    let score = 0;

    // Atividade recente (peso: 25)
    if (factors.lastActivityDays > 14) score += 25;
    else if (factors.lastActivityDays > 7) score += 15;
    else if (factors.lastActivityDays > 3) score += 8;

    // Taxa de cancelamento (peso: 20)
    if (factors.cancellationRate > 30) score += 20;
    else if (factors.cancellationRate > 15) score += 12;
    else if (factors.cancellationRate > 5) score += 6;

    // Tendência de receita (peso: 20)
    if (factors.revenueTrend < -20) score += 20;
    else if (factors.revenueTrend < -10) score += 12;
    else if (factors.revenueTrend < 0) score += 6;

    // Satisfação do cliente (peso: 15)
    if (factors.customerSatisfaction < 2) score += 15;
    else if (factors.customerSatisfaction < 3) score += 10;
    else if (factors.customerSatisfaction < 4) score += 5;

    // Taxa de sucesso IA (peso: 10)
    if (factors.aiSuccessRate < 50) score += 10;
    else if (factors.aiSuccessRate < 70) score += 6;
    else if (factors.aiSuccessRate < 85) score += 3;

    // Frequência de agendamentos (peso: 10)
    if (factors.appointmentFrequency < 1) score += 10;
    else if (factors.appointmentFrequency < 3) score += 6;
    else if (factors.appointmentFrequency < 5) score += 3;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Determina status baseado no score
   */
  private getRiskStatus(
    score: number,
  ): "Baixo Risco" | "Risco Médio" | "Alto Risco" {
    if (score >= 70) return "Alto Risco";
    if (score >= 40) return "Risco Médio";
    return "Baixo Risco";
  }

  /**
   * Gera recomendações baseadas nos fatores de risco
   */
  private generateRecommendations(
    factors: RiskFactors,
    score: number,
  ): string[] {
    const recommendations: string[] = [];

    if (factors.lastActivityDays > 7) {
      recommendations.push(
        "Entrar em contato para verificar se precisam de suporte",
      );
    }

    if (factors.cancellationRate > 15) {
      recommendations.push("Investigar motivos dos cancelamentos frequentes");
    }

    if (factors.revenueTrend < -10) {
      recommendations.push("Oferecer consultoria para aumentar receita");
    }

    if (factors.customerSatisfaction < 3) {
      recommendations.push("Melhorar experiência do cliente");
    }

    if (factors.aiSuccessRate < 70) {
      recommendations.push(
        "Treinar configurações de IA para melhor performance",
      );
    }

    if (factors.appointmentFrequency < 3) {
      recommendations.push(
        "Estratégias para aumentar frequência de agendamentos",
      );
    }

    if (score >= 70) {
      recommendations.push("Prioridade alta - Intervenção imediata necessária");
    }

    return recommendations;
  }

  // Métodos auxiliares para buscar dados específicos
  private async getLastActivityDays(tenantId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("conversation_history")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return 999; // Muito tempo sem atividade

    return differenceInDays(
      new Date(),
      new Date((data[0] as any).created_at || new Date()),
    );
  }

  private async getCancellationRate(
    tenantId: string,
    since: Date,
  ): Promise<number> {
    const { data: appointments, error } = await this.supabase
      .from("appointments")
      .select("status")
      .eq("tenant_id", tenantId)
      .gte("created_at", since.toISOString());

    if (error || !appointments || appointments.length === 0) return 0;

    const cancelled = appointments.filter(
      (a) => a.status === "cancelled",
    ).length;
    return (cancelled / appointments.length) * 100;
  }

  private async getRevenueTrend(tenantId: string): Promise<number> {
    const now = new Date();
    const lastMonth = subDays(now, 30);
    const previousMonth = subDays(now, 60);

    // Receita último mês
    const { data: recent, error: recentError } = await this.supabase
      .from("appointments")
      .select("appointment_data")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("created_at", lastMonth.toISOString())
      .lt("created_at", now.toISOString());

    // Receita mês anterior
    const { data: previous, error: previousError } = await this.supabase
      .from("appointments")
      .select("appointment_data")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("created_at", previousMonth.toISOString())
      .lt("created_at", lastMonth.toISOString());

    if (recentError || previousError) return 0;

    const recentRevenue = this.calculateRevenueFromAppointments(recent || []);
    const previousRevenue = this.calculateRevenueFromAppointments(
      previous || [],
    );

    if (previousRevenue === 0) return 0;

    return ((recentRevenue - previousRevenue) / previousRevenue) * 100;
  }

  private calculateRevenueFromAppointments(appointments: any[]): number {
    return appointments.reduce((total, appointment) => {
      const data = (appointment as any).appointment_data;
      return total + ((data as any)?.price || 0);
    }, 0);
  }

  private async getCustomerSatisfaction(tenantId: string): Promise<number> {
    // Implementar quando tivermos sistema de avaliação
    // Por ora, retorna valor neutro
    return 3.5;
  }

  private async getAiSuccessRate(
    tenantId: string,
    since: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("conversation_history")
      .select("response_data")
      .eq("tenant_id", tenantId)
      .gte("created_at", since.toISOString());

    if (error || !data || data.length === 0) return 100; // Sem dados = assumir sucesso

    const successful = data.filter((conv) => {
      const responseData = (conv as any).response_data;
      return responseData && !(responseData as any).error;
    }).length;

    return (successful / data.length) * 100;
  }

  private async getAppointmentFrequency(
    tenantId: string,
    since: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("appointments")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("created_at", since.toISOString());

    if (error || !data) return 0;

    const days = differenceInDays(new Date(), since);
    return data.length / days; // Agendamentos por dia
  }

  /**
   * Salva scores de risco calculados no banco
   */
  async saveRiskScores(riskScores: TenantRiskScore[]): Promise<void> {
    try {
      const records = riskScores.map((score) => ({
        tenant_id: score.tenantId,
        risk_score: score.riskScore,
        risk_status: score.riskStatus,
        risk_factors: score.factors,
        last_activity_days: score.factors.lastActivityDays,
        cancellation_rate: score.factors.cancellationRate,
        revenue_trend: score.factors.revenueTrend,
        customer_satisfaction: score.factors.customerSatisfaction,
        ai_success_rate: score.factors.aiSuccessRate,
        calculated_at: new Date().toISOString(),
      }));

      const { error } = await (this.supabase as any)
        .from("tenant_risk_scores")
        .insert(records);

      if (error) throw error;

      console.log(`✅ Salvos ${records.length} scores de risco`);
    } catch (error) {
      console.error("Erro ao salvar scores de risco:", error);
      throw error;
    }
  }
}
