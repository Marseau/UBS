import cron from "node-cron";
import { RiskCalculatorService } from "./risk-calculator.service";
import { SaasMetricsService } from "./saas-metrics.service";
import { getAdminClient } from "../config/database";

export class MetricsCronService {
  private riskCalculator: RiskCalculatorService;
  private saasMetrics: SaasMetricsService;
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.riskCalculator = new RiskCalculatorService();
    this.saasMetrics = new SaasMetricsService();
  }

  private get supabase() {
    return getAdminClient();
  }

  /**
   * Inicializa todos os cron jobs
   */
  initialize(): void {
    console.log("🚀 Inicializando Metrics Cron Service...");

    // Executar cálculos diários às 2:00 AM
    this.scheduleDailyMetrics();

    // Executar cálculos semanais às segundas-feiras 3:00 AM
    this.scheduleWeeklyMetrics();

    // Executar cálculos mensais no dia 1 às 4:00 AM
    this.scheduleMonthlyMetrics();

    // Executar cálculos de risco a cada 6 horas
    this.scheduleRiskCalculations();

    console.log("✅ Metrics Cron Service inicializado com sucesso");
    console.log(`📋 Jobs ativos: ${this.jobs.size}`);
  }

  /**
   * Cálculos diários (2:00 AM)
   */
  private scheduleDailyMetrics(): void {
    const job = cron.schedule(
      "0 2 * * *",
      async () => {
        console.log("🔄 Executando cálculos diários...");

        try {
          const today = new Date();

          // Calcular métricas SaaS
          const saasMetrics =
            await this.saasMetrics.calculateSaasMetrics(today);
          await this.saasMetrics.saveSaasMetrics(saasMetrics);

          // Calcular distribuição de tenants
          const distribution =
            await this.saasMetrics.calculateTenantDistribution(today);
          await this.saasMetrics.saveTenantDistribution(distribution, today);

          // Calcular métricas de conversão
          await this.calculateConversionMetrics(today);

          console.log("✅ Cálculos diários concluídos");
        } catch (error) {
          console.error("❌ Erro nos cálculos diários:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("daily-metrics", job);
    console.log("📅 Cálculos diários agendados: 2:00 AM");
  }

  /**
   * Cálculos semanais (Segunda-feira 3:00 AM)
   */
  private scheduleWeeklyMetrics(): void {
    const job = cron.schedule(
      "0 3 * * 1",
      async () => {
        console.log("🔄 Executando cálculos semanais...");

        try {
          const today = new Date();

          // Calcular top tenants
          const topTenants = await this.saasMetrics.getTopTenants(today, 20);
          await this.saasMetrics.saveTopTenants(topTenants, today);

          // Limpar dados antigos
          await this.cleanupOldData();

          console.log("✅ Cálculos semanais concluídos");
        } catch (error) {
          console.error("❌ Erro nos cálculos semanais:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("weekly-metrics", job);
    console.log("📅 Cálculos semanais agendados: Segunda-feira 3:00 AM");
  }

  /**
   * Cálculos mensais (Dia 1 às 4:00 AM)
   */
  private scheduleMonthlyMetrics(): void {
    const job = cron.schedule(
      "0 4 1 * *",
      async () => {
        console.log("🔄 Executando cálculos mensais...");

        try {
          const today = new Date();

          // Calcular métricas de crescimento
          const growthMetrics =
            await this.saasMetrics.calculateGrowthMetrics(today);
          await this.saasMetrics.saveGrowthMetrics(growthMetrics);

          // Relatório mensal
          await this.generateMonthlyReport(today);

          console.log("✅ Cálculos mensais concluídos");
        } catch (error) {
          console.error("❌ Erro nos cálculos mensais:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("monthly-metrics", job);
    console.log("📅 Cálculos mensais agendados: Dia 1 às 4:00 AM");
  }

  /**
   * Cálculos de risco (a cada 6 horas)
   */
  private scheduleRiskCalculations(): void {
    const job = cron.schedule(
      "0 */6 * * *",
      async () => {
        console.log("🔄 Executando cálculos de risco...");

        try {
          // Calcular risco de todos os tenants
          const riskScores =
            await this.riskCalculator.calculateAllTenantsRisk();
          await this.riskCalculator.saveRiskScores(riskScores);

          // Alertar sobre tenants de alto risco
          await this.alertHighRiskTenants(riskScores);

          console.log("✅ Cálculos de risco concluídos");
        } catch (error) {
          console.error("❌ Erro nos cálculos de risco:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("risk-calculations", job);
    console.log("📅 Cálculos de risco agendados: a cada 6 horas");
  }

  /**
   * Calcular métricas de conversão por tenant
   */
  private async calculateConversionMetrics(date: Date): Promise<void> {
    try {
      const { data: tenants, error } = await this.supabase
        .from("tenants")
        .select("id")
        .eq("status", "active");

      if (error) throw error;

      const records: any[] = [];

      for (const tenant of tenants) {
        const metrics = await this.calculateTenantConversionMetrics(
          tenant.id,
          date,
        );
        records.push({
          tenant_id: tenant.id,
          metric_date: date.toISOString().split("T")[0],
          ...(metrics as any),
          calculated_at: new Date().toISOString(),
        });
      }

      const { error: insertError } = await (this.supabase as any)
        .from("conversion_metrics")
        .upsert(records, { onConflict: "tenant_id,metric_date" });

      if (insertError) throw insertError;

      console.log(
        `✅ Métricas de conversão calculadas para ${records.length} tenants`,
      );
    } catch (error) {
      console.error("Erro ao calcular métricas de conversão:", error);
      throw error;
    }
  }

  /**
   * Calcular métricas de conversão para um tenant específico
   */
  private async calculateTenantConversionMetrics(
    tenantId: string,
    date: Date,
  ): Promise<any> {
    const startDate = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 dias atrás

    // Buscar interações IA (leads)
    const { data: conversations, error: convError } = await this.supabase
      .from("conversation_history")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", date.toISOString());

    // Buscar agendamentos
    const { data: appointments, error: appError } = await this.supabase
      .from("appointments")
      .select("user_id, status")
      .eq("tenant_id", tenantId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", date.toISOString());

    if (convError || appError) {
      throw new Error(
        `Erro ao buscar dados de conversão: ${convError?.message || appError?.message}`,
      );
    }

    const uniqueLeads = new Set(
      conversations?.map((c: any) => c.user_id) || [],
    );
    const appointmentsBooked = appointments?.length || 0;
    const appointmentsCompleted =
      appointments?.filter((a: any) => a.status === "completed").length || 0;

    const leadsGenerated = uniqueLeads.size;
    const conversionRate =
      leadsGenerated > 0 ? (appointmentsBooked / leadsGenerated) * 100 : 0;
    const completionRate =
      appointmentsBooked > 0
        ? (appointmentsCompleted / appointmentsBooked) * 100
        : 0;

    return {
      leads_generated: leadsGenerated,
      appointments_booked: appointmentsBooked,
      appointments_completed: appointmentsCompleted,
      conversion_rate: conversionRate,
      completion_rate: completionRate,
    };
  }

  /**
   * Alertar sobre tenants de alto risco
   */
  private async alertHighRiskTenants(riskScores: any[]): Promise<void> {
    const highRiskTenants = riskScores.filter((score) => score.riskScore >= 70);

    if (highRiskTenants.length > 0) {
      console.log(
        `🚨 Encontrados ${highRiskTenants.length} tenants de alto risco:`,
      );

      for (const tenant of highRiskTenants) {
        console.log(
          `- ${tenant.tenantId}: ${tenant.riskScore}% (${tenant.riskStatus})`,
        );

        // Aqui você pode implementar notificações via email, Slack, etc.
        // await this.sendRiskAlert(tenant);
      }
    }
  }

  /**
   * Gerar relatório mensal
   */
  private async generateMonthlyReport(date: Date): Promise<void> {
    try {
      const month = date.getMonth();
      const year = date.getFullYear();

      console.log(`📊 Gerando relatório mensal para ${month + 1}/${year}`);

      // Buscar métricas do mês
      const { data: metrics, error } = await (this.supabase as any)
        .from("saas_metrics")
        .select("*")
        .gte("metric_date", `${year}-${String(month + 1).padStart(2, "0")}-01`)
        .lt("metric_date", `${year}-${String(month + 2).padStart(2, "0")}-01`)
        .order("metric_date", { ascending: false });

      if (error) throw error;

      const summary = {
        totalDays: metrics?.length || 0,
        avgActiveTenants:
          metrics?.reduce(
            (sum: number, m: any) => sum + (m as any).active_tenants,
            0,
          ) / (metrics?.length || 1),
        totalMRR: (metrics as any)?.[0]?.mrr || 0,
        avgChurnRate:
          metrics?.reduce(
            (sum: number, m: any) => sum + (m as any).churn_rate,
            0,
          ) / (metrics?.length || 1),
        avgConversionRate:
          metrics?.reduce(
            (sum: number, m: any) => sum + (m as any).conversion_rate,
            0,
          ) / (metrics?.length || 1),
      };

      console.log("📈 Resumo do mês:", summary);

      // Salvar ou enviar relatório
      // await this.saveMonthlyReport(summary, date);
    } catch (error) {
      console.error("Erro ao gerar relatório mensal:", error);
    }
  }

  /**
   * Limpar dados antigos
   */
  private async cleanupOldData(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // Manter 90 dias

      const tables = [
        "saas_metrics",
        "tenant_risk_scores",
        "tenant_distribution",
        "conversion_metrics",
      ];

      for (const table of tables) {
        const { error } = await (this.supabase as any)
          .from(table)
          .delete()
          .lt("calculated_at", cutoffDate.toISOString());

        if (error) {
          console.error(`Erro ao limpar tabela ${table}:`, error);
        } else {
          console.log(`🧹 Dados antigos removidos da tabela ${table}`);
        }
      }
    } catch (error) {
      console.error("Erro na limpeza de dados antigos:", error);
    }
  }

  /**
   * Executar cálculos manualmente (para teste)
   */
  async runManualCalculation(
    type: "daily" | "weekly" | "monthly" | "risk",
  ): Promise<void> {
    console.log(`🔄 Executando cálculo manual: ${type}`);

    try {
      switch (type) {
        case "daily":
          const saasMetrics = await this.saasMetrics.calculateSaasMetrics();
          await this.saasMetrics.saveSaasMetrics(saasMetrics);

          const distribution =
            await this.saasMetrics.calculateTenantDistribution();
          await this.saasMetrics.saveTenantDistribution(
            distribution,
            new Date(),
          );

          await this.calculateConversionMetrics(new Date());
          break;

        case "weekly":
          const topTenants = await this.saasMetrics.getTopTenants();
          await this.saasMetrics.saveTopTenants(topTenants, new Date());
          break;

        case "monthly":
          const growthMetrics = await this.saasMetrics.calculateGrowthMetrics();
          await this.saasMetrics.saveGrowthMetrics(growthMetrics);
          break;

        case "risk":
          const riskScores =
            await this.riskCalculator.calculateAllTenantsRisk();
          await this.riskCalculator.saveRiskScores(riskScores);
          break;
      }

      console.log(`✅ Cálculo manual ${type} concluído`);
    } catch (error) {
      console.error(`❌ Erro no cálculo manual ${type}:`, error);
      throw error;
    }
  }

  /**
   * Parar todos os cron jobs
   */
  stopAll(): void {
    console.log("🛑 Parando todos os cron jobs...");

    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`⏹️  Job ${name} parado`);
    }

    this.jobs.clear();
    console.log("✅ Todos os cron jobs foram parados");
  }

  /**
   * Obter status dos jobs
   */
  getJobsStatus(): { [key: string]: boolean } {
    const status: { [key: string]: boolean } = {};

    for (const [name, job] of this.jobs) {
      status[name] = (job as any).running || false;
    }

    return status;
  }
}
