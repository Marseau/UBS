/**
 * UBS Monitoring Routes
 * API endpoints for monitoring UBS metric system executions
 *
 * @fileoverview Routes for job monitoring, system health, and performance metrics
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-07-31
 */

import express from "express";
import { UBSMetricLoggerService } from "../services/ubs-metric-logger.service";
import { AdminAuthMiddleware } from "../middleware/admin-auth";

const router = express.Router();
const ubsLogger = new UBSMetricLoggerService();
const authMiddleware = new AdminAuthMiddleware();

/**
 * GET /api/ubs-monitoring/health
 * Get system health status
 */
router.get("/health", async (req: express.Request, res: express.Response) => {
  try {
    const healthStatus = await ubsLogger.getSystemHealth();

    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting system health:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get system health",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/ubs-monitoring/runs
 * Get recent job execution history
 */
router.get("/runs", async (req: express.Request, res: express.Response) => {
  try {
    const { limit = 20 } = req.query;
    const runs = await ubsLogger.getRecentRuns(parseInt(limit as string));

    res.json({
      success: true,
      data: runs,
      count: runs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting recent runs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get recent runs",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/ubs-monitoring/runs/:id
 * Get specific run details
 */
router.get("/runs/:id", async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "ID is required",
      });
    }
    const run = await ubsLogger.getRun(id);

    if (!run) {
      return res.status(404).json({
        success: false,
        error: "Run not found",
        message: `No run found with ID: ${id}`,
      });
    }

    return res.json({
      success: true,
      data: run,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting run details:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get run details",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/ubs-monitoring/performance
 * Get performance metrics for charts
 */
router.get(
  "/performance",
  async (req: express.Request, res: express.Response) => {
    try {
      const { days = 7 } = req.query;
      const performance = await ubsLogger.getPerformanceMetrics(
        parseInt(days as string),
      );

      res.json({
        success: true,
        data: performance,
        period_days: parseInt(days as string),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error getting performance metrics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get performance metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /api/ubs-monitoring/status
 * Get overall system status for dashboard widgets
 */
router.get("/status", async (req: express.Request, res: express.Response) => {
  try {
    const [healthStatus, recentRuns] = await Promise.all([
      ubsLogger.getSystemHealth(),
      ubsLogger.getRecentRuns(5),
    ]);

    // Calculate additional status metrics
    const runningJobs = recentRuns.filter(
      (r) => r.run_status === "running",
    ).length;
    const lastRun = recentRuns[0];
    const isSystemActive =
      runningJobs > 0 ||
      (lastRun &&
        new Date().getTime() - new Date(lastRun.started_at).getTime() <
          5 * 60 * 1000); // 5 minutes

    res.json({
      success: true,
      data: {
        overall_health: healthStatus.overall_health,
        is_system_active: isSystemActive,
        running_jobs: runningJobs,
        success_rate_24h: healthStatus.success_rate_24h,
        last_successful_run: healthStatus.last_successful_run,
        hours_since_last_run: healthStatus.hours_since_last_run,
        avg_execution_time: healthStatus.avg_execution_time_24h,
        failed_runs_24h: healthStatus.failed_runs_24h,
        recommendations: healthStatus.recommendations.slice(0, 3), // Top 3
        recent_runs_count: recentRuns.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting system status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get system status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/ubs-monitoring/cleanup
 * Clean old run records (admin only)
 */
router.post(
  "/cleanup",
  authMiddleware.requireSuperAdmin,
  async (req: express.Request, res: express.Response) => {
    try {
      const { keep_count = 100 } = req.body;

      await ubsLogger.cleanOldRuns(parseInt(keep_count));

      res.json({
        success: true,
        message: `Cleaned old runs, kept latest ${keep_count}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error cleaning old runs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to clean old runs",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /api/ubs-monitoring/dashboard-widget
 * Get dashboard widget data for UBS monitoring
 */
router.get(
  "/dashboard-widget",
  async (req: express.Request, res: express.Response) => {
    try {
      const healthStatus = await ubsLogger.getSystemHealth();
      const recentRuns = await ubsLogger.getRecentRuns(10);

      // Calculate widget metrics
      const totalRuns = recentRuns.length;
      const successfulRuns = recentRuns.filter(
        (r) => r.run_status === "completed",
      ).length;
      const failedRuns = recentRuns.filter(
        (r) => r.run_status === "failed",
      ).length;
      const runningJobs = recentRuns.filter(
        (r) => r.run_status === "running",
      ).length;

      const avgExecutionTime =
        successfulRuns > 0
          ? recentRuns
              .filter((r) => r.run_status === "completed")
              .reduce((sum, r) => sum + r.execution_time_ms, 0) /
            successfulRuns /
            1000 // Convert to seconds
          : 0;

      // Health status color
      let statusColor = "#28a745"; // green
      if (healthStatus.overall_health === "warning") statusColor = "#ffc107"; // yellow
      if (healthStatus.overall_health === "critical") statusColor = "#dc3545"; // red

      res.json({
        success: true,
        data: {
          // Main metrics
          health_status: healthStatus.overall_health,
          health_color: statusColor,
          success_rate: healthStatus.success_rate_24h,
          avg_execution_time: Math.round(avgExecutionTime * 100) / 100,

          // Counters
          total_runs: totalRuns,
          successful_runs: successfulRuns,
          failed_runs: failedRuns,
          running_jobs: runningJobs,

          // Time info
          last_run: recentRuns[0]?.started_at || null,
          hours_since_last: healthStatus.hours_since_last_run,

          // Quality metrics
          data_quality_trend: healthStatus.data_quality_trend,

          // Quick status indicators
          is_healthy: healthStatus.overall_health === "healthy",
          needs_attention: healthStatus.overall_health !== "healthy",
          has_recent_failures: failedRuns > 0,

          // Recommendations (first one only for widget)
          primary_recommendation:
            healthStatus.recommendations[0] ||
            "Sistema funcionando normalmente",

          // Chart data for mini-chart (last 7 runs)
          mini_chart: {
            labels: recentRuns
              .slice(0, 7)
              .reverse()
              .map((r) =>
                new Date(r.started_at).toLocaleDateString("pt-BR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              ),
            success_data: recentRuns
              .slice(0, 7)
              .reverse()
              .map((r) => (r.run_status === "completed" ? 1 : 0)),
            execution_times: recentRuns
              .slice(0, 7)
              .reverse()
              .map((r) => Math.round((r.execution_time_ms / 1000) * 100) / 100),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error getting dashboard widget data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get dashboard widget data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /api/ubs-monitoring/alerts
 * Get system alerts and notifications
 */
router.get("/alerts", async (req: express.Request, res: express.Response) => {
  try {
    const healthStatus = await ubsLogger.getSystemHealth();
    const recentRuns = await ubsLogger.getRecentRuns(5);

    const alerts: Array<{
      type: string;
      title: string;
      message: string;
      timestamp: string;
      action_required: boolean;
      run_id?: string;
    }> = [];

    // Critical alerts
    if (healthStatus.overall_health === "critical") {
      alerts.push({
        type: "critical",
        title: "Sistema UBS Crítico",
        message: healthStatus.recommendations[0] || "Sistema em estado crítico",
        timestamp: new Date().toISOString(),
        action_required: true,
      });
    }

    // Warning alerts
    if (healthStatus.overall_health === "warning") {
      alerts.push({
        type: "warning",
        title: "Atenção: Sistema UBS",
        message:
          healthStatus.recommendations[0] || "Sistema precisa de atenção",
        timestamp: new Date().toISOString(),
        action_required: false,
      });
    }

    // Recent failures
    const recentFailures = recentRuns
      .filter((r) => r.run_status === "failed")
      .slice(0, 3);
    recentFailures.forEach((failure) => {
      alerts.push({
        type: "error",
        title: "Falha na Execução UBS",
        message: failure.error_message || "Execução falhou sem detalhes",
        timestamp: failure.completed_at || failure.started_at,
        action_required: false,
        run_id: failure.id,
      });
    });

    // Long execution alerts
    const longRunning = recentRuns
      .filter(
        (r) => r.run_status === "completed" && r.execution_time_ms > 60000, // 1 minute
      )
      .slice(0, 2);

    longRunning.forEach((run) => {
      alerts.push({
        type: "info",
        title: "Execução Lenta",
        message: `Execução demorou ${Math.round(run.execution_time_ms / 1000)}s para completar`,
        timestamp: run.completed_at || run.started_at,
        action_required: false,
        run_id: run.id,
      });
    });

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
      has_critical: alerts.some((a) => a.type === "critical"),
      has_warnings: alerts.some((a) => a.type === "warning"),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting alerts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get alerts",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
