/**
 * TENANT-PLATFORM CRON SERVICE CONSOLIDADO
 * Gerencia cálculos automatizados para o sistema Tenant/Platform
 *
 * Funções principais:
 * - Cálculo diário de métricas tenant/plataforma
 * - Atualização de rankings
 * - Limpeza de cache
 * - Agregação de dados da plataforma
 */

import * as cron from "node-cron";
import { getAdminClient } from "../config/database";
import { QueryCacheService } from "./query-cache.service";

export class TenantPlatformCronService {
  private client = getAdminClient();
  private isInitialized = false;
  private jobs: Map<string, any> = new Map();

  constructor() {}

  /**
   * Inicializa todos os cron jobs
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log("⚠️ Tenant-Platform Cron Service já inicializado");
      return;
    }

    console.log("🚀 Inicializando Tenant-Platform Cron Service...");

    // Em desenvolvimento, verificar se ENABLE_CRON está definido
    if (
      process.env.NODE_ENV === "development" &&
      process.env.ENABLE_CRON !== "true"
    ) {
      console.log("🔧 [DEV] Crons desabilitados para desenvolvimento");
      console.log("🔧 [DEV] Para habilitar: ENABLE_CRON=true no .env");
      console.log(
        "🔧 [DEV] Use triggers manuais via API: POST /api/tenant-platform/calculate",
      );
      this.isInitialized = true;
      return;
    }

    if (process.env.ENABLE_CRON === "true") {
      console.log("🚀 [DEV] Crons habilitados via ENABLE_CRON=true");
    }

    // Cálculo de métricas - PRODUÇÃO: 3:00 AM | DESENVOLVIMENTO: a cada 5 minutos para teste
    const cronTime =
      process.env.NODE_ENV === "development" ? "*/5 * * * *" : "0 3 * * *";
    console.log(`⏰ Agendando cálculo de métricas: ${cronTime}`);

    this.jobs.set(
      "daily-metrics",
      cron.schedule(
        cronTime,
        async () => {
          console.log(
            "📊 [CRON] Calculando métricas diárias tenant-platform...",
          );
          await this.calculateDailyMetrics();
        },
        {
          scheduled: true,
          timezone: "America/Sao_Paulo",
        },
      ),
    );

    // PRODUÇÃO: Limpeza de cache (A cada 4 horas)
    this.jobs.set(
      "cache-cleanup",
      cron.schedule(
        "0 */4 * * *",
        async () => {
          console.log("🧹 [CRON] Limpando cache expirado...");
          await this.cleanupExpiredCache();
        },
        {
          scheduled: true,
          timezone: "America/Sao_Paulo",
        },
      ),
    );

    // PRODUÇÃO: Atualização de agregados semanais (Domingo 2:00 AM)
    this.jobs.set(
      "weekly-aggregates",
      cron.schedule(
        "0 2 * * 0",
        async () => {
          console.log("📈 [CRON] Calculando agregados semanais...");
          await this.calculateWeeklyAggregates();
        },
        {
          scheduled: true,
          timezone: "America/Sao_Paulo",
        },
      ),
    );

    this.isInitialized = true;
    console.log("✅ Tenant-Platform Cron Service inicializado");
    console.log(`📋 Jobs ativos: ${this.jobs.size} (produção apenas)`);
  }

  /**
   * Para todos os cron jobs
   */
  stop(): void {
    console.log("🛑 Parando Tenant-Platform Cron Service...");

    this.jobs.forEach((job, name) => {
      if (job && typeof job.stop === "function") {
        job.stop();
        console.log(`   ✅ Job '${name}' parado`);
      }
    });

    this.jobs.clear();
    this.isInitialized = false;
    console.log("✅ Todos os jobs foram parados");
  }

  /**
   * Calcula métricas diárias para todos os tenants - 7, 30 e 90 dias
   */
  async calculateDailyMetrics(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log("📊 [DAILY-METRICS] Iniciando cálculo para 30 dias...");

      const today = new Date().toISOString().split("T")[0];

      // Popular diretamente tenant_metrics e platform_metrics (sem ubs_metric_system)
      console.log(
        "📊 Populando tenant_metrics e platform_metrics para 30 dias...",
      );

      // Chamar função que popula as tabelas corretas (ou criar script direto)
      const result = await this.populateMetricsTables(today as string, 30);

      if (result.success) {
        console.log(
          `✅ Métricas populadas: ${result.processed_tenants} tenants`,
        );
        console.log(
          `📊 Platform metrics: ${result.platform_metrics_created ? "CRIADO" : "ERRO"}`,
        );
        console.log(
          `📊 Tenant metrics: ${result.tenant_metrics_created || 0} registros`,
        );
      } else {
        console.error(`❌ Erro ao popular métricas:`, result.error);
      }

      const duration = Date.now() - startTime;

      console.log("✅ [DAILY-METRICS] Cálculo concluído:");
      console.log(`   ⏱️ Tempo total: ${duration}ms`);
      console.log(`   📊 Resultado: ${result.success ? "SUCESSO" : "ERRO"}`);

      if (result.success) {
        console.log(`   💰 Tenants processados: ${result.processed_tenants}`);
        console.log(
          `   📊 Platform metrics: ${result.platform_metrics_created ? "CRIADO" : "FALHOU"}`,
        );
        console.log(
          `   📊 Tenant metrics: ${result.tenant_metrics_created} registros`,
        );
      }

      // Invalidar cache relacionado
      await this.invalidateMetricsCache();
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [DAILY-METRICS] Erro após ${duration}ms:`, error);

      // Log estruturado para monitoramento
      await this.logCalculationError("daily-metrics", error as Error, duration);
    }
  }

  /**
   * Popula tenant_metrics e platform_metrics diretamente
   */
  async populateMetricsTables(
    calculationDate: string,
    periodDays: number,
  ): Promise<any> {
    try {
      console.log("📊 Iniciando população das tabelas de métricas...");

      // 1. Buscar todos os tenants
      const { data: tenants, error: tenantsError } = await (this.client as any)
        .from("tenants")
        .select("id, business_name, domain");

      if (tenantsError) {
        return { success: false, error: tenantsError.message };
      }

      // 2. Calcular platform metrics
      const { count: totalAppointments } = await (this.client as any)
        .from("appointments")
        .select("*", { count: "exact", head: true });

      const { count: totalCustomers } = await (this.client as any)
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: totalConversations } = await (this.client as any)
        .from("conversation_history")
        .select("*", { count: "exact", head: true });

      const platformRevenue = tenants.length * 79.9;

      // 3. Inserir platform_metrics
      const { error: platformError } = await (this.client as any)
        .from("platform_metrics")
        .insert({
          calculation_date: calculationDate,
          period_days: periodDays,
          data_source: "cron_job",
          total_revenue: platformRevenue,
          total_appointments: totalAppointments,
          total_customers: totalCustomers,
          total_ai_interactions: totalConversations,
          active_tenants: tenants.length,
          platform_mrr: platformRevenue,
          total_chat_minutes: 0,
          total_conversations: totalConversations,
          total_valid_conversations: totalConversations,
          total_spam_conversations: 0,
          receita_uso_ratio: 0,
          operational_efficiency_pct: 0,
          spam_rate_pct: 0,
          cancellation_rate_pct: 0,
          revenue_usage_distortion_index: 0,
          platform_health_score: 85,
          tenants_above_usage: 0,
          tenants_below_usage: 0,
        });

      // 4. Inserir tenant_metrics para cada tenant
      let tenantMetricsCount = 0;

      for (let i = 0; i < tenants.length; i++) {
        const tenant = tenants[i];

        // Calcular dados básicos do tenant
        const { count: tenantAppointments } = await (this.client as any)
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id);

        const { data: tenantUsers } = await (this.client as any)
          .from("appointments")
          .select("user_id")
          .eq("tenant_id", tenant.id);

        const uniqueCustomers = [
          ...new Set(tenantUsers?.map((u: any) => u.user_id) || []),
        ].length;

        const { count: tenantConversations } = await (this.client as any)
          .from("conversation_history")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id);

        // === MÉTRICAS AVANÇADAS ===

        // 1. Calcular métricas de agendamentos (cancelamentos e remarcações)
        const { count: cancelledAppointments } = await (this.client as any)
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "cancelled");

        const { count: rescheduledAppointments } = await (this.client as any)
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "rescheduled");

        const cancellationRate =
          tenantAppointments > 0
            ? (cancelledAppointments / tenantAppointments) * 100
            : 0;
        const reschedulingRate =
          tenantAppointments > 0
            ? (rescheduledAppointments / tenantAppointments) * 100
            : 0;

        // 2. Calcular tempo médio de chat
        const { data: conversations } = await (this.client as any)
          .from("conversation_history")
          .select("created_at, updated_at")
          .eq("tenant_id", tenant.id)
          .not("updated_at", "is", null)
          .limit(100); // Últimas 100 conversas para performance

        let avgChatDuration = 0;
        if (conversations && conversations.length > 0) {
          const durations = conversations
            .map((conv: any) => {
              const start = new Date(conv.created_at);
              const end = new Date(conv.updated_at);
              return (end.getTime() - start.getTime()) / (1000 * 60); // em minutos
            })
            .filter((duration: number) => duration > 0 && duration < 120); // Filtrar valores válidos (0-120 min)

          if (durations.length > 0) {
            avgChatDuration =
              durations.reduce((a: number, b: number) => a + b, 0) /
              durations.length;
          }
        }

        // 3. Calcular qualidade das conversas (spam detection)
        const { data: validConversations } = await (this.client as any)
          .from("conversation_history")
          .select("confidence_score")
          .eq("tenant_id", tenant.id)
          .not("confidence_score", "is", null);

        let spamDetectionScore = 100; // Assume 100% se não há dados
        if (validConversations && validConversations.length > 0) {
          const validCount = validConversations.filter(
            (conv: any) => conv.confidence_score >= 0.7,
          ).length;
          spamDetectionScore = (validCount / validConversations.length) * 100;
        }

        // 4. Calcular score de risco (baseado em múltiplos fatores)
        const riskFactors = {
          cancellation: Math.min(cancellationRate / 30, 1), // 30% = risco máximo
          chat_quality: Math.max(0, (100 - spamDetectionScore) / 100),
          engagement: Math.max(0, (5 - avgChatDuration) / 5), // Menos de 5 min = risco
          appointments: Math.max(0, (10 - tenantAppointments) / 10), // Menos de 10 = risco
        };

        const riskScore = Math.round(
          riskFactors.cancellation * 30 +
            riskFactors.chat_quality * 25 +
            riskFactors.engagement * 25 +
            riskFactors.appointments * 20,
        );

        // 5. Calcular efficiency score
        const efficiencyScore =
          tenantConversations > 0
            ? Math.round((tenantAppointments / tenantConversations) * 100)
            : 0;

        // Calcular participações básicas
        const appointmentsParticipation =
          totalAppointments > 0
            ? (tenantAppointments / totalAppointments) * 100
            : 0;
        const customersParticipation =
          totalCustomers > 0 ? (uniqueCustomers / totalCustomers) * 100 : 0;
        const aiParticipation =
          totalConversations > 0
            ? (tenantConversations / totalConversations) * 100
            : 0;
        const revenueParticipation =
          tenants.length > 0 ? 100 / tenants.length : 0;

        // DADOS ENRIQUECIDOS DE PARTICIPAÇÃO
        const participationData = {
          revenue: {
            participation_pct: parseFloat(revenueParticipation.toFixed(2)),
            participation_value: 79.9,
          },
          appointments: {
            participation_pct: parseFloat(appointmentsParticipation.toFixed(2)),
            count: tenantAppointments,
            cancellation_rate_pct: parseFloat(cancellationRate.toFixed(2)),
            rescheduling_rate_pct: parseFloat(reschedulingRate.toFixed(2)),
          },
          customers: {
            participation_pct: parseFloat(customersParticipation.toFixed(2)),
            count: uniqueCustomers,
          },
          ai_interactions: {
            participation_pct: parseFloat(aiParticipation.toFixed(2)),
            count: tenantConversations,
            avg_chat_duration_minutes: parseFloat(avgChatDuration.toFixed(2)),
          },
          business_intelligence: {
            spam_detection_score: parseFloat(spamDetectionScore.toFixed(2)),
            risk_score: riskScore,
            efficiency_score: efficiencyScore,
            risk_status:
              riskScore < 25
                ? "Low Risk"
                : riskScore < 50
                  ? "Medium Risk"
                  : "High Risk",
          },
        };

        // Ranking metrics
        const rankingData = {
          position: i + 1,
          total_tenants: tenants.length,
          category: i < 3 ? "Top 3" : "Standard",
          percentile: parseFloat(
            (((tenants.length - i) / tenants.length) * 100).toFixed(1),
          ),
        };

        // Inserir participation e ranking
        const metricsToInsert = [
          {
            tenant_id: tenant.id,
            metric_type: "participation",
            metric_data: participationData,
            period: "30d",
          },
          {
            tenant_id: tenant.id,
            metric_type: "ranking",
            metric_data: rankingData,
            period: "30d",
          },
        ];

        for (const metric of metricsToInsert) {
          const { error } = await (this.client as any)
            .from("tenant_metrics")
            .insert(metric);

          if (!error) tenantMetricsCount++;
        }
      }

      return {
        success: true,
        processed_tenants: tenants.length,
        platform_metrics_created: !platformError,
        tenant_metrics_created: tenantMetricsCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      };
    }
  }

  /**
   * Calcula agregados semanais e mensais
   */
  async calculateWeeklyAggregates(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log("📈 [WEEKLY-AGGREGATES] Iniciando cálculo semanal...");

      // Usar a mesma função do cálculo diário (redundante, mas mantido para compatibilidade)
      await this.calculateDailyMetrics();

      const duration = Date.now() - startTime;
      console.log(`✅ [WEEKLY-AGGREGATES] Concluído em ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [WEEKLY-AGGREGATES] Erro após ${duration}ms:`, error);
    }
  }

  /**
   * Limpa cache expirado
   */
  async cleanupExpiredCache(): Promise<void> {
    try {
      console.log("🧹 [CACHE-CLEANUP] Iniciando limpeza...");

      // Mock cleanup for now - implement actual cleanup in QueryCacheService if needed
      const cleanedCount = 0;

      console.log(`✅ [CACHE-CLEANUP] ${cleanedCount} entradas removidas`);
    } catch (error) {
      console.error("❌ [CACHE-CLEANUP] Erro na limpeza:", error);
    }
  }

  /**
   * Invalida cache relacionado a métricas
   */
  async invalidateMetricsCache(): Promise<void> {
    try {
      // Padrões de cache para invalidar
      const patterns = [
        "tenant_metrics:*",
        "platform_metrics:*",
        "tenant_platform:*",
        "rankings:*",
      ];

      let invalidatedCount = 0;
      for (const pattern of patterns) {
        // Mock invalidation for now - implement actual invalidation in QueryCacheService if needed
        const count = 0;
        invalidatedCount += count;
      }

      console.log(`🗑️  [CACHE] ${invalidatedCount} entradas invalidadas`);
    } catch (error) {
      console.error("❌ [CACHE] Erro na invalidação:", error);
    }
  }

  /**
   * Log estruturado de erros para monitoramento
   */
  async logCalculationError(
    jobType: string,
    error: Error,
    duration: number,
  ): Promise<void> {
    try {
      const errorLog = {
        job_type: jobType,
        error_message: error.message,
        error_stack: error.stack,
        execution_time_ms: duration,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      };

      // Log no console para desenvolvimento
      console.error("📋 [ERROR-LOG]", JSON.stringify(errorLog, null, 2));

      // TODO: Enviar para sistema de monitoramento em produção
      // await this.sendToMonitoring(errorLog);
    } catch (logError) {
      console.error("❌ Erro ao registrar erro:", logError);
    }
  }

  /**
   * Triggers manuais para desenvolvimento/debug
   */
  async triggerDailyMetrics(): Promise<any> {
    console.log("🔧 [MANUAL] Trigger manual - cálculo diário");
    await this.calculateDailyMetrics();
    return { success: true, trigger: "daily-metrics" };
  }

  async triggerWeeklyAggregates(): Promise<any> {
    console.log("🔧 [MANUAL] Trigger manual - agregados semanais");
    await this.calculateWeeklyAggregates();
    return { success: true, trigger: "weekly-aggregates" };
  }

  async triggerCacheCleanup(): Promise<any> {
    console.log("🔧 [MANUAL] Trigger manual - limpeza cache");
    await this.cleanupExpiredCache();
    return { success: true, trigger: "cache-cleanup" };
  }

  async triggerAll(): Promise<any> {
    console.log("🔧 [MANUAL] Trigger manual - TODOS os jobs");

    const results = await Promise.allSettled([
      this.calculateDailyMetrics(),
      this.calculateWeeklyAggregates(),
      this.cleanupExpiredCache(),
    ]);

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(
      `✅ [MANUAL] ${successful} jobs executados, ${failed} falharam`,
    );

    return {
      success: failed === 0,
      trigger: "all",
      results: {
        successful,
        failed,
        details: results,
      },
    };
  }

  /**
   * Status do serviço
   */
  getStatus(): any {
    return {
      initialized: this.isInitialized,
      environment: process.env.NODE_ENV || "unknown",
      active_jobs: this.jobs.size,
      job_names: Array.from(this.jobs.keys()),
      service_version: "1.0.0-consolidated",
    };
  }
}

// Export singleton instance
export const tenantPlatformCronService = new TenantPlatformCronService();
