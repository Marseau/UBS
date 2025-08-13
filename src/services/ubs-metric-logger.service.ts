/**
 * UBS Metric System Logger Service
 * Centralized logging and monitoring for all UBS metric calculations
 *
 * @fileoverview Service for tracking job executions, performance, and data quality
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-07-31
 */

import { getAdminClient } from "../config/database";

export interface UBSRunMetrics {
  tenants_processed: number;
  total_tenants: number;
  metrics_calculated: number;
  data_quality_score: number;
  missing_data_count: number;
  execution_time_ms: number;
  error_message?: string;
}

export interface UBSRunStatus {
  id: string;
  run_date: string;
  period_days: number;
  run_status: "running" | "completed" | "failed" | "cancelled";
  tenants_processed: number;
  total_tenants: number;
  execution_time_ms: number;
  started_at: string;
  completed_at?: string;
  data_quality_score: number;
  missing_data_count: number;
  error_message?: string;
}

export interface SystemHealthStatus {
  overall_health: "healthy" | "warning" | "critical";
  last_successful_run: string | null;
  hours_since_last_run: number;
  success_rate_24h: number;
  avg_execution_time_24h: number;
  failed_runs_24h: number;
  data_quality_trend: "improving" | "stable" | "degrading";
  recommendations: string[];
}

export class UBSMetricLoggerService {
  private supabase = getAdminClient();

  /**
   * Start a new metrics calculation run
   */
  async startRun(periodDays: number, description?: string): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .from("ubs_metric_system_runs")
        .insert({
          run_date: new Date().toISOString().split("T")[0]!,
          period_days: periodDays,
          run_status: "running",
          tenants_processed: 0,
          total_tenants: 0,
          execution_time_ms: 0,
          metrics_calculated: 0,
          started_at: new Date().toISOString(),
          data_quality_score: 0,
          missing_data_count: 0,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to start UBS run: ${error.message}`);
      }

      console.log(
        `🚀 [UBS LOGGER] Started run ${data.id} for ${periodDays} days period`,
      );
      return data.id;
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error starting run:", error);
      throw error;
    }
  }

  /**
   * Update run progress (for long-running jobs)
   */
  async updateProgress(
    runId: string,
    tenants_processed: number,
    total_tenants: number,
    metrics_calculated?: number,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("ubs_metric_system_runs")
        .update({
          tenants_processed,
          total_tenants,
          metrics_calculated: metrics_calculated || 0,
          execution_time_ms:
            Date.now() -
            new Date((await this.getRun(runId))?.started_at || 0).getTime(),
        })
        .eq("id", runId);

      if (error) {
        throw new Error(`Failed to update progress: ${error.message}`);
      }

      console.log(
        `📊 [UBS LOGGER] Progress ${runId}: ${tenants_processed}/${total_tenants} tenants`,
      );
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error updating progress:", error);
    }
  }

  /**
   * Complete a successful run
   */
  async completeRun(runId: string, metrics: UBSRunMetrics): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("ubs_metric_system_runs")
        .update({
          run_status: "completed",
          tenants_processed: metrics.tenants_processed,
          total_tenants: metrics.total_tenants,
          metrics_calculated: metrics.metrics_calculated,
          execution_time_ms: metrics.execution_time_ms,
          data_quality_score: metrics.data_quality_score,
          missing_data_count: metrics.missing_data_count,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      if (error) {
        throw new Error(`Failed to complete run: ${error.message}`);
      }

      const duration = (metrics.execution_time_ms / 1000).toFixed(2);
      console.log(
        `✅ [UBS LOGGER] Completed run ${runId} in ${duration}s - Quality: ${metrics.data_quality_score}%`,
      );
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error completing run:", error);
      throw error;
    }
  }

  /**
   * Mark run as failed with error details
   */
  async failRun(
    runId: string,
    errorMessage: string,
    partialMetrics?: Partial<UBSRunMetrics>,
  ): Promise<void> {
    try {
      const startedRun = await this.getRun(runId);
      const executionTime = startedRun
        ? Date.now() - new Date(startedRun.started_at).getTime()
        : 0;

      const { error } = await this.supabase
        .from("ubs_metric_system_runs")
        .update({
          run_status: "failed",
          error_message: errorMessage,
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString(),
          tenants_processed: partialMetrics?.tenants_processed || 0,
          total_tenants: partialMetrics?.total_tenants || 0,
          metrics_calculated: partialMetrics?.metrics_calculated || 0,
          data_quality_score: partialMetrics?.data_quality_score || 0,
          missing_data_count: partialMetrics?.missing_data_count || 0,
        })
        .eq("id", runId);

      if (error) {
        throw new Error(`Failed to mark run as failed: ${error.message}`);
      }

      console.error(`❌ [UBS LOGGER] Failed run ${runId}: ${errorMessage}`);
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error marking run as failed:", error);
    }
  }

  /**
   * Get specific run details
   */
  async getRun(runId: string): Promise<UBSRunStatus | null> {
    try {
      const { data, error } = await this.supabase
        .from("ubs_metric_system_runs")
        .select("*")
        .eq("id", runId)
        .single();

      if (error) {
        return null;
      }

      return data as UBSRunStatus;
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error getting run:", error);
      return null;
    }
  }

  /**
   * Get recent runs history
   */
  async getRecentRuns(limit: number = 10): Promise<UBSRunStatus[]> {
    try {
      const { data, error } = await this.supabase
        .from("ubs_metric_system_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get recent runs: ${error.message}`);
      }

      return data as UBSRunStatus[];
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error getting recent runs:", error);
      return [];
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get runs from last 24 hours
      const { data: recentRuns, error } = await this.supabase
        .from("ubs_metric_system_runs")
        .select("*")
        .gte("started_at", yesterday.toISOString())
        .order("started_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to get system health: ${error.message}`);
      }

      const runs = recentRuns as UBSRunStatus[];

      // Calculate metrics
      const totalRuns = runs.length;
      const successfulRuns = runs.filter((r) => r.run_status === "completed");
      const failedRuns = runs.filter((r) => r.run_status === "failed");
      const lastSuccessful = successfulRuns[0];

      const successRate =
        totalRuns > 0 ? (successfulRuns.length / totalRuns) * 100 : 0;
      const avgExecutionTime =
        successfulRuns.length > 0
          ? successfulRuns.reduce((sum, r) => sum + r.execution_time_ms, 0) /
            successfulRuns.length
          : 0;

      const hoursSinceLastRun = lastSuccessful
        ? Math.round(
            (now.getTime() -
              new Date(
                lastSuccessful.completed_at || lastSuccessful.started_at,
              ).getTime()) /
              (1000 * 60 * 60),
          )
        : 999;

      // Determine overall health
      let overallHealth: SystemHealthStatus["overall_health"] = "healthy";
      const recommendations: string[] = [];

      if (successRate < 50) {
        overallHealth = "critical";
        recommendations.push(
          "Taxa de sucesso crítica - verificar logs de erro imediatamente",
        );
      } else if (successRate < 80) {
        overallHealth = "warning";
        recommendations.push(
          "Taxa de sucesso baixa - investigar causas de falhas",
        );
      }

      if (hoursSinceLastRun > 25) {
        overallHealth = "critical";
        recommendations.push(
          "Nenhuma execução nas últimas 24h - verificar cron jobs",
        );
      } else if (hoursSinceLastRun > 12) {
        overallHealth = "warning";
        recommendations.push(
          "Última execução há mais de 12h - verificar agendamento",
        );
      }

      if (avgExecutionTime > 30000) {
        // 30 seconds
        if (overallHealth === "healthy") overallHealth = "warning";
        recommendations.push(
          "Tempo de execução alto - otimizar queries e processamento",
        );
      }

      // Data quality trend (simplified)
      const recentQualityScores = successfulRuns
        .slice(0, 5)
        .map((r) => r.data_quality_score)
        .filter((score) => score > 0);

      let dataQualityTrend: SystemHealthStatus["data_quality_trend"] = "stable";
      if (recentQualityScores.length >= 2) {
        const recent =
          recentQualityScores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const older =
          recentQualityScores.slice(2).reduce((a, b) => a + b, 0) /
          Math.max(1, recentQualityScores.length - 2);

        if (recent > older + 5) dataQualityTrend = "improving";
        else if (recent < older - 5) dataQualityTrend = "degrading";
      }

      if (recommendations.length === 0) {
        recommendations.push("Sistema funcionando normalmente");
      }

      return {
        overall_health: overallHealth,
        last_successful_run: lastSuccessful?.completed_at || null,
        hours_since_last_run: hoursSinceLastRun,
        success_rate_24h: Math.round(successRate * 100) / 100,
        avg_execution_time_24h: Math.round(avgExecutionTime),
        failed_runs_24h: failedRuns.length,
        data_quality_trend: dataQualityTrend,
        recommendations,
      };
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error getting system health:", error);
      return {
        overall_health: "critical",
        last_successful_run: null,
        hours_since_last_run: 999,
        success_rate_24h: 0,
        avg_execution_time_24h: 0,
        failed_runs_24h: 0,
        data_quality_trend: "degrading",
        recommendations: [
          "Erro ao verificar status do sistema - verificar conectividade com banco",
        ],
      };
    }
  }

  /**
   * Get performance metrics for charts
   */
  async getPerformanceMetrics(days: number = 7): Promise<{
    dates: string[];
    execution_times: number[];
    success_rates: number[];
    data_quality_scores: number[];
    tenants_processed: number[];
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await this.supabase
        .from("ubs_metric_system_runs")
        .select("*")
        .gte("started_at", startDate.toISOString())
        .order("started_at", { ascending: true });

      if (error) {
        throw new Error(`Failed to get performance metrics: ${error.message}`);
      }

      const runs = data as UBSRunStatus[];

      // Group by date
      const dailyMetrics = new Map<
        string,
        {
          total: number;
          successful: number;
          avg_execution_time: number;
          avg_quality_score: number;
          total_tenants: number;
          execution_times: number[];
          quality_scores: number[];
        }
      >();

      runs.forEach((run) => {
        const date =
          run.started_at?.split("T")[0] ||
          new Date().toISOString().split("T")[0]!;

        if (!dailyMetrics.has(date)) {
          dailyMetrics.set(date, {
            total: 0,
            successful: 0,
            avg_execution_time: 0,
            avg_quality_score: 0,
            total_tenants: 0,
            execution_times: [],
            quality_scores: [],
          });
        }

        const metrics = dailyMetrics.get(date)!;
        metrics.total++;

        if (run.run_status === "completed") {
          metrics.successful++;
          metrics.execution_times.push(run.execution_time_ms || 0);
          if ((run.data_quality_score || 0) > 0) {
            metrics.quality_scores.push(run.data_quality_score || 0);
          }
        }

        metrics.total_tenants = Math.max(
          metrics.total_tenants,
          run.tenants_processed || 0,
        );
      });

      // Convert to arrays for charts
      const dates: string[] = [];
      const execution_times: number[] = [];
      const success_rates: number[] = [];
      const data_quality_scores: number[] = [];
      const tenants_processed: number[] = [];

      for (const [date, metrics] of dailyMetrics) {
        dates.push(date);

        const avgExecTime =
          metrics.execution_times.length > 0
            ? metrics.execution_times.reduce((a, b) => a + b, 0) /
              metrics.execution_times.length
            : 0;
        execution_times.push(Math.round(avgExecTime / 1000)); // Convert to seconds

        const successRate =
          metrics.total > 0 ? (metrics.successful / metrics.total) * 100 : 0;
        success_rates.push(Math.round(successRate * 100) / 100);

        const avgQuality =
          metrics.quality_scores.length > 0
            ? metrics.quality_scores.reduce((a, b) => a + b, 0) /
              metrics.quality_scores.length
            : 0;
        data_quality_scores.push(Math.round(avgQuality * 100) / 100);

        tenants_processed.push(metrics.total_tenants);
      }

      return {
        dates,
        execution_times,
        success_rates,
        data_quality_scores,
        tenants_processed,
      };
    } catch (error) {
      console.error(
        "❌ [UBS LOGGER] Error getting performance metrics:",
        error,
      );
      return {
        dates: [],
        execution_times: [],
        success_rates: [],
        data_quality_scores: [],
        tenants_processed: [],
      };
    }
  }

  /**
   * Clean old runs (keep last 100 runs)
   */
  async cleanOldRuns(keepCount: number = 100): Promise<void> {
    try {
      // Get IDs of runs to keep
      const { data: keepRuns, error: selectError } = await this.supabase
        .from("ubs_metric_system_runs")
        .select("id")
        .order("started_at", { ascending: false })
        .limit(keepCount);

      if (selectError) {
        throw new Error(
          `Failed to select runs to keep: ${selectError.message}`,
        );
      }

      if (!keepRuns || keepRuns.length === 0) {
        return; // No runs to clean
      }

      const keepIds = keepRuns.map((r) => r.id);

      // Delete old runs
      const { error: deleteError } = await this.supabase
        .from("ubs_metric_system_runs")
        .delete()
        .not("id", "in", `(${keepIds.map((id) => `'${id}'`).join(",")})`);

      if (deleteError) {
        throw new Error(`Failed to delete old runs: ${deleteError.message}`);
      }

      console.log(`🧹 [UBS LOGGER] Cleaned old runs, kept latest ${keepCount}`);
    } catch (error) {
      console.error("❌ [UBS LOGGER] Error cleaning old runs:", error);
    }
  }

  /**
   * Wrapper for executing a job with automatic logging
   */
  async executeWithLogging<T>(
    periodDays: number,
    jobFunction: (logger: UBSMetricLoggerService, runId: string) => Promise<T>,
    description?: string,
  ): Promise<T> {
    const runId = await this.startRun(periodDays, description);
    const startTime = Date.now();

    try {
      const result = await jobFunction(this, runId);

      // Auto-calculate basic metrics if not provided
      const executionTime = Date.now() - startTime;
      await this.completeRun(runId, {
        tenants_processed: 0, // Should be updated by job function
        total_tenants: 0, // Should be updated by job function
        metrics_calculated: 0, // Should be updated by job function
        execution_time_ms: executionTime,
        data_quality_score: 100, // Default to perfect if not specified
        missing_data_count: 0,
      });

      return result;
    } catch (error) {
      await this.failRun(
        runId,
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }
}

export default UBSMetricLoggerService;
