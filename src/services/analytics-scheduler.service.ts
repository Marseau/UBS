/**
 * Analytics Scheduler Service
 *
 * This service manages the scheduled aggregation of analytics data.
 * It runs cron jobs to keep the analytics tables updated with fresh data.
 */

import * as cron from "node-cron";
import { getAdminClient } from "../config/database";
import { SupabaseClient } from "@supabase/supabase-js";

interface JobStatus {
  running: boolean;
  scheduled: boolean;
}

interface HealthCheck {
  healthy: boolean;
  check: string;
  error?: string;
  lastSystemMetric?: string;
  lastTenantMetric?: string;
  expectedDate?: string;
  hasData?: boolean;
  accessible?: boolean;
}

export class AnalyticsSchedulerService {
  private jobs: Map<string, cron.ScheduledTask>;
  private isProduction: boolean;
  private logger: Console;
  private adminClient: SupabaseClient<any>;

  constructor() {
    this.jobs = new Map();
    this.isProduction = process.env.NODE_ENV === "production";
    this.logger = console; // Could be replaced with winston logger
    this.adminClient = getAdminClient() as any; // Cast to any to bypass type restrictions
  }

  /**
   * Initialize all analytics cron jobs
   */
  async initialize() {
    try {
      this.logger.log("🕐 Initializing Analytics Scheduler Service...");

      // Test database connection first
      const { error } = await this.adminClient
        .from("tenants")
        .select("id")
        .limit(1);

      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      this.setupDailyAggregationJob();
      this.setupMaterializedViewRefreshJob();
      this.setupCacheCleanupJob();
      this.setupHealthCheckJob();

      this.logger.log(
        "✅ Analytics Scheduler Service initialized successfully",
      );
      this.logger.log(`📋 Active jobs: ${this.jobs.size}`);

      return true;
    } catch (error) {
      this.logger.error("❌ Failed to initialize Analytics Scheduler:", error);
      throw error;
    }
  }

  /**
   * Daily aggregation job - Runs at 1:00 AM every day
   * Aggregates previous day's data into analytics tables
   */
  setupDailyAggregationJob() {
    // Apenas rodar às 04:00 em produção - NUNCA em desenvolvimento
    if (!this.isProduction) {
      this.logger.log(
        `📊 [DEV] Daily aggregation DISABLED - dados não precisam ser real-time`,
      );
      return;
    }

    const cronExpression = "0 4 * * *"; // 04:00 apenas em produção

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.runDailyAggregation();
      },
      {
        scheduled: false,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("dailyAggregation", job);
    job.start();

    this.logger.log(
      `📊 Daily aggregation job scheduled for PRODUCTION ONLY: ${cronExpression}`,
    );
  }

  /**
   * Materialized views refresh job - Runs every 6 hours
   * Refreshes materialized views for faster analytics queries
   */
  setupMaterializedViewRefreshJob() {
    // Apenas rodar em produção - desenvolvimento não precisa de refresh
    if (!this.isProduction) {
      this.logger.log(
        `🔄 [DEV] Materialized views refresh DISABLED - não necessário em dev`,
      );
      return;
    }

    const cronExpression = "0 4 * * *"; // Junto com aggregation às 04:00

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.refreshMaterializedViews();
      },
      {
        scheduled: false,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("materializedViewRefresh", job);
    job.start();

    this.logger.log(
      `🔄 Materialized views refresh scheduled for PRODUCTION ONLY: ${cronExpression}`,
    );
  }

  /**
   * Cache cleanup job - Runs every hour
   * Removes expired cache entries
   */
  setupCacheCleanupJob() {
    // Desabilitar em desenvolvimento para evitar instabilidade
    if (!this.isProduction) {
      this.logger.log(
        `🧹 [DEV] Cache cleanup DISABLED - evitando instabilidade`,
      );
      return;
    }

    const cronExpression = "0 * * * *"; // Every hour in production only

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.cleanExpiredCache();
      },
      {
        scheduled: false,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("cacheCleanup", job);
    job.start();

    this.logger.log(
      `🧹 Cache cleanup job scheduled for PRODUCTION ONLY: ${cronExpression}`,
    );
  }

  /**
   * Health check job - Runs every 30 minutes
   * Monitors the health of analytics aggregation
   */
  setupHealthCheckJob() {
    // Desabilitar em desenvolvimento para evitar instabilidade
    if (!this.isProduction) {
      this.logger.log(
        `💚 [DEV] Health check DISABLED - evitando instabilidade`,
      );
      return;
    }

    const cronExpression = "*/30 * * * *"; // Every 30 minutes in production only

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.performHealthCheck();
      },
      {
        scheduled: false,
        timezone: "America/Sao_Paulo",
      },
    );

    this.jobs.set("healthCheck", job);
    job.start();

    this.logger.log(
      `💚 Health check job scheduled for PRODUCTION ONLY: ${cronExpression}`,
    );
  }

  /**
   * Execute daily aggregation for tenant and system metrics
   */
  async runDailyAggregation() {
    const startTime = Date.now();

    try {
      this.logger.log("📊 [CRON] Starting daily analytics aggregation...");

      // Calculate target date (TODAY - not yesterday)
      const targetDate = new Date();
      const targetDateStr = targetDate.toISOString().split("T")[0];

      this.logger.log(`📅 [CRON] Aggregating data for date: ${targetDateStr}`);

      // Run tenant aggregation
      const { data: tenantResult, error: tenantError } =
        await this.adminClient.rpc("aggregate_tenant_daily_metrics", {
          target_date: targetDateStr,
        });

      if (tenantError) {
        throw new Error(
          `Tenant aggregation failed: ${String(tenantError.message || tenantError)}`,
        );
      }

      this.logger.log("✅ [CRON] Tenant metrics aggregated successfully");

      // Run system aggregation
      const { data: systemResult, error: systemError } =
        await this.adminClient.rpc("aggregate_system_daily_metrics", {
          target_date: targetDateStr,
        });

      if (systemError) {
        throw new Error(
          `System aggregation failed: ${String(systemError.message || systemError)}`,
        );
      }

      this.logger.log("✅ [CRON] System metrics aggregated successfully");

      // Log performance metrics
      const duration = Date.now() - startTime;
      this.logger.log(`⚡ [CRON] Daily aggregation completed in ${duration}ms`);

      // Pre-compute chart data
      await this.preComputeChartData(targetDateStr as string);

      // Record successful aggregation
      await this.recordJobExecution(
        "daily_aggregation",
        "success",
        duration,
        targetDateStr,
        null,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("❌ [CRON] Daily aggregation failed:", error);

      // Record failed aggregation
      await this.recordJobExecution(
        "daily_aggregation",
        "error",
        duration,
        null,
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Refresh materialized views for better query performance
   */
  async refreshMaterializedViews() {
    const startTime = Date.now();

    try {
      this.logger.log("🔄 [CRON] Refreshing materialized views...");

      const { data, error } = await this.adminClient.rpc(
        "refresh_analytics_materialized_views",
      );

      if (error) {
        throw new Error(
          `Materialized view refresh failed: ${String(error.message || error)}`,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [CRON] Materialized views refreshed in ${duration}ms`,
      );

      await this.recordJobExecution(
        "materialized_view_refresh",
        "success",
        duration,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("❌ [CRON] Materialized view refresh failed:", error);

      await this.recordJobExecution(
        "materialized_view_refresh",
        "error",
        duration,
        null,
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache() {
    const startTime = Date.now();

    try {
      this.logger.log("🧹 [CRON] Cleaning expired cache entries...");

      const { data: deletedCount, error } = await this.adminClient.rpc(
        "clean_expired_analytics_cache",
      );

      if (error) {
        throw new Error(
          `Cache cleanup failed: ${String(error.message || error)}`,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [CRON] Cleaned ${deletedCount || 0} expired cache entries in ${duration}ms`,
      );

      await this.recordJobExecution(
        "cache_cleanup",
        "success",
        duration,
        null,
        null,
        { deletedCount },
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("❌ [CRON] Cache cleanup failed:", error);

      await this.recordJobExecution(
        "cache_cleanup",
        "error",
        duration,
        null,
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Perform health check on analytics system
   */
  async performHealthCheck() {
    const startTime = Date.now();

    try {
      this.logger.log("💚 [CRON] Performing analytics health check...");

      const checks = await Promise.all([
        this.checkTableHealth(),
        this.checkDataFreshness(),
        // DEPRECATED: checkMaterializedViewHealth removido - view UBS não existe mais
      ]);

      const allHealthy = checks.every((check) => check.healthy);
      const duration = Date.now() - startTime;

      if (allHealthy) {
        this.logger.log(`✅ [CRON] Health check passed in ${duration}ms`);
        await this.recordJobExecution(
          "health_check",
          "success",
          duration,
          null,
          null,
          { checks },
        );
      } else {
        const issues = checks.filter((check) => !check.healthy);
        this.logger.warn(`⚠️ [CRON] Health check found issues:`, issues);
        await this.recordJobExecution(
          "health_check",
          "warning",
          duration,
          null,
          "Health issues detected",
          { checks },
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("❌ [CRON] Health check failed:", error);

      await this.recordJobExecution(
        "health_check",
        "error",
        duration,
        null,
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Check the health of analytics tables
   */
  private async checkTableHealth(): Promise<HealthCheck> {
    try {
      // Check if analytics tables exist and have recent data
      const { data: systemMetrics, error: systemError } = await this.adminClient
        .from("analytics_system_metrics")
        .select("metric_date")
        .order("metric_date", { ascending: false })
        .limit(1);

      if (systemError) {
        return {
          healthy: false,
          check: "system_metrics_table",
          error: String(systemError.message || systemError),
        };
      }

      const { data: tenantMetrics, error: tenantError } = await this.adminClient
        .from("analytics_tenant_metrics")
        .select("metric_date")
        .order("metric_date", { ascending: false })
        .limit(1);

      if (tenantError) {
        return {
          healthy: false,
          check: "tenant_metrics_table",
          error: String(tenantError.message || tenantError),
        };
      }

      return {
        healthy: true,
        check: "analytics_tables",
        lastSystemMetric: systemMetrics?.[0]?.metric_date,
        lastTenantMetric: tenantMetrics?.[0]?.metric_date,
      };
    } catch (error) {
      return {
        healthy: false,
        check: "analytics_tables",
        error: String(error instanceof Error ? error.message : error),
      };
    }
  }

  /**
   * Check data freshness (should have data from yesterday)
   */
  private async checkDataFreshness(): Promise<HealthCheck> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const { data, error } = await this.adminClient
        .from("analytics_system_metrics")
        .select("metric_date")
        .eq("metric_date", yesterdayStr)
        .eq("period_type", "daily");

      if (error) {
        return {
          healthy: false,
          check: "data_freshness",
          error: String(error.message || error),
        };
      }

      const hasYesterdayData = data && data.length > 0;

      return {
        healthy: hasYesterdayData,
        check: "data_freshness",
        expectedDate: yesterdayStr,
        hasData: hasYesterdayData,
      };
    } catch (error) {
      return {
        healthy: false,
        check: "data_freshness",
        error: String((error as Error)?.message || error),
      };
    }
  }

  /**
   * Check materialized view health
   */
  private async checkMaterializedViewHealth(): Promise<HealthCheck> {
    try {
      // Test if materialized views are accessible
      const { data, error } = await this.adminClient
        .from("mv_daily_appointment_stats")
        .select("appointment_date")
        .limit(1);

      if (error) {
        return {
          healthy: false,
          check: "materialized_views",
          error: String(error.message || error),
        };
      }

      return { healthy: true, check: "materialized_views", accessible: true };
    } catch (error) {
      return {
        healthy: false,
        check: "materialized_views",
        error: String((error as Error)?.message || error),
      };
    }
  }

  /**
   * Record job execution for monitoring
   */
  private async recordJobExecution(
    jobName: string,
    status: string,
    duration: number,
    targetDate: string | null = null,
    errorMessage: string | null = null,
    metadata: any = null,
  ): Promise<void> {
    try {
      const { error } = await this.adminClient
        .from("analytics_job_executions")
        .insert({
          job_name: jobName,
          status,
          duration_ms: duration,
          target_date: targetDate,
          error_message: errorMessage,
          metadata,
          executed_at: new Date().toISOString(),
        });

      if (error) {
        this.logger.warn("⚠️ Failed to record job execution:", error.message);
      }
    } catch (error) {
      this.logger.warn(
        "⚠️ Failed to record job execution:",
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stopAllJobs() {
    this.logger.log("🛑 Stopping all analytics scheduler jobs...");

    this.jobs.forEach((job, name) => {
      job.stop();
      this.logger.log(`⏹️ Stopped job: ${name}`);
    });

    this.jobs.clear();
    this.logger.log("✅ All analytics scheduler jobs stopped");
  }

  /**
   * Get status of all jobs
   */
  public getJobsStatus(): {
    totalJobs: number;
    environment: string;
    jobs: Record<string, JobStatus>;
  } {
    const status: Record<string, JobStatus> = {};

    this.jobs.forEach((job, name) => {
      status[name] = {
        running: (job as any).running || false, // ScheduledTask doesn't expose running status
        scheduled: true,
      };
    });

    return {
      totalJobs: this.jobs.size,
      environment: this.isProduction ? "production" : "development",
      jobs: status,
    };
  }

  /**
   * Manually trigger a specific job (for testing/maintenance)
   */
  async triggerJob(jobName: string): Promise<void> {
    this.logger.log(`🔧 [MANUAL] Triggering job: ${jobName}`);

    switch (jobName) {
      case "dailyAggregation":
        await this.runDailyAggregation();
        break;
      case "materializedViewRefresh":
        await this.refreshMaterializedViews();
        break;
      case "cacheCleanup":
        await this.cleanExpiredCache();
        break;
      case "healthCheck":
        await this.performHealthCheck();
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }

    this.logger.log(`✅ [MANUAL] Job completed: ${jobName}`);
  }

  /**
   * Pre-compute chart data for faster dashboard loading
   */
  private async preComputeChartData(targetDate: string): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log("📊 [CRON] Starting chart data pre-computation...");

      // Get all active tenants for chart pre-computation
      const { data: tenants, error: tenantsError } = await this.adminClient
        .from("tenants")
        .select("id, business_name")
        .eq("status", "active");

      if (tenantsError) {
        throw new Error(
          `Failed to get tenants: ${String(tenantsError.message || tenantsError)}`,
        );
      }

      const chartDataCache: any[] = [];

      // Pre-compute system-wide chart data
      this.logger.log("📈 [CRON] Pre-computing system chart data...");
      try {
        const systemChartData = await this.computeSystemChartData(targetDate);
        chartDataCache.push({
          type: "system",
          tenant_id: null,
          chart_data: systemChartData,
          computed_date: targetDate,
          period: "30d",
        });
        this.logger.log("✅ [CRON] System chart data computed");
      } catch (error) {
        this.logger.error(
          "❌ [CRON] System chart computation failed:",
          String(error instanceof Error ? error.message : error),
        );
      }

      // Pre-compute chart data for each tenant
      this.logger.log(
        `📈 [CRON] Pre-computing chart data for ${tenants?.length || 0} tenants...`,
      );

      for (const tenant of tenants || []) {
        try {
          const tenantChartData = await this.computeTenantChartData(
            tenant.id,
            targetDate,
          );
          chartDataCache.push({
            type: "tenant",
            tenant_id: tenant.id,
            chart_data: tenantChartData,
            computed_date: targetDate,
            period: "30d",
          });
          this.logger.log(
            `✅ [CRON] Chart data computed for tenant: ${tenant.business_name}`,
          );
        } catch (error) {
          this.logger.error(
            `❌ [CRON] Chart computation failed for tenant ${tenant.business_name}:`,
            String(error instanceof Error ? error.message : error),
          );
        }
      }

      // Store pre-computed data in cache table
      if (chartDataCache.length > 0) {
        const { error: insertError } = await this.adminClient
          .from("chart_data_cache")
          .upsert(chartDataCache, { onConflict: "type,tenant_id,period" });

        if (insertError) {
          throw new Error(
            `Failed to cache chart data: ${String(insertError.message || insertError)}`,
          );
        }

        this.logger.log(
          `💾 [CRON] Cached ${chartDataCache.length} chart datasets`,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `⚡ [CRON] Chart data pre-computation completed in ${duration}ms`,
      );

      // Record successful chart computation
      await this.recordJobExecution(
        "chart_precomputation",
        "success",
        duration,
        targetDate,
        null,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error("❌ [CRON] Chart data pre-computation failed:", error);

      // Record failed computation
      await this.recordJobExecution(
        "chart_precomputation",
        "error",
        duration,
        targetDate,
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  /**
   * Compute system-wide chart data
   */
  private async computeSystemChartData(targetDate: string): Promise<any> {
    const endDate = new Date(targetDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    // Get revenue evolution data
    const { data: revenueData } = await this.adminClient
      .from("appointments")
      .select("created_at, final_price, quoted_price")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .eq("status", "completed");

    // Get tenant distribution
    const { data: tenants } = await this.adminClient
      .from("tenants")
      .select("domain")
      .eq("status", "active");

    const domainCounts: Record<string, number> = {};
    tenants?.forEach((t) => {
      const domain = t.domain || "outros";
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

    // Process revenue by month
    const monthlyRevenue: Record<string, number> = {};
    revenueData?.forEach((apt) => {
      if (apt.created_at) {
        const month = new Date(apt.created_at).toISOString().substr(0, 7);
        const revenue = apt.final_price || apt.quoted_price || 0;
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + revenue;
      }
    });

    return {
      revenueEvolution: {
        labels: Object.keys(monthlyRevenue).sort(),
        datasets: [
          {
            label: "Receita da Plataforma (R$)",
            data: Object.keys(monthlyRevenue)
              .sort()
              .map((month) => monthlyRevenue[month]),
            borderColor: "#28a745",
          },
        ],
      },
      tenantDistribution: {
        labels: Object.keys(domainCounts),
        datasets: [
          {
            data: Object.values(domainCounts),
            backgroundColor: [
              "#2D5A9B",
              "#28a745",
              "#ffc107",
              "#dc3545",
              "#17a2b8",
              "#6f42c1",
            ],
          },
        ],
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Compute tenant-specific chart data
   */
  private async computeTenantChartData(
    tenantId: string,
    targetDate: string,
  ): Promise<any> {
    const endDate = new Date(targetDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    // Get tenant appointments
    const { data: appointments } = await this.adminClient
      .from("appointments")
      .select(
        "created_at, final_price, quoted_price, status, service_id, services(name)",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    // Process services distribution
    const serviceCounts: Record<string, number> = {};
    appointments?.forEach((apt) => {
      const serviceName =
        (apt.services as any)?.name || "Serviço não especificado";
      serviceCounts[serviceName] = (serviceCounts[serviceName] || 0) + 1;
    });

    // Process revenue by day
    const dailyRevenue: Record<string, number> = {};
    appointments
      ?.filter((apt) => apt.status === "completed")
      .forEach((apt) => {
        if (apt.created_at) {
          const day = apt.created_at.split("T")[0];
          const revenue = apt.final_price || apt.quoted_price || 0;
          dailyRevenue[day] = (dailyRevenue[day] || 0) + revenue;
        }
      });

    return {
      servicesDistribution: {
        labels: Object.keys(serviceCounts),
        datasets: [
          {
            data: Object.values(serviceCounts),
            backgroundColor: [
              "#2D5A9B",
              "#28a745",
              "#ffc107",
              "#dc3545",
              "#17a2b8",
            ],
          },
        ],
      },
      revenueTrend: {
        labels: Object.keys(dailyRevenue).sort(),
        datasets: [
          {
            label: "Receita Diária (R$)",
            data: Object.keys(dailyRevenue)
              .sort()
              .map((day) => dailyRevenue[day]),
            borderColor: "#28a745",
          },
        ],
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}

// Singleton instance
let schedulerInstance: AnalyticsSchedulerService | null = null;

export function getSchedulerInstance(): AnalyticsSchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new AnalyticsSchedulerService();
  }
  return schedulerInstance;
}
