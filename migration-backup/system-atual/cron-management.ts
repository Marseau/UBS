/**
 * CRON MANAGEMENT CONTROLLER
 * Endpoints para controle e monitoramento do UnifiedCronService
 */

import { Router, Request, Response } from "express";
import { unifiedCronService } from "../services/unified-cron.service";
import { CronJobResult } from "../types/unified-cron.types";

const router = Router();

/**
 * GET /api/cron/status
 * Retorna status completo do sistema de cron jobs
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const status = unifiedCronService.getStatus();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao obter status do cron:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno ao obter status",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * GET /api/cron/dashboard
 * Retorna dashboard completo com métricas e health checks
 */
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const dashboard = unifiedCronService.getDashboard();

    res.json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao obter dashboard do cron:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno ao obter dashboard",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * POST /api/cron/trigger/unified
 * Trigger manual da sequência completa unificada
 */
router.post("/trigger/unified", async (req: Request, res: Response) => {
  try {
    console.log("🔧 [API] Trigger manual - sequência unificada");

    const result: CronJobResult =
      await unifiedCronService.triggerUnifiedCalculation();

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.success
        ? "Sequência unificada executada com sucesso"
        : "Sequência unificada falhou",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro no trigger unificado:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno no trigger",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * POST /api/cron/trigger/platform-metrics
 * Trigger manual apenas do cálculo de platform metrics
 */
router.post(
  "/trigger/platform-metrics",
  async (req: Request, res: Response) => {
    try {
      console.log("🔧 [API] Trigger manual - platform metrics");

      const result: CronJobResult =
        await unifiedCronService.triggerPlatformAggregation();

      const statusCode = result.success ? 200 : 500;

      res.status(statusCode).json({
        success: result.success,
        data: result,
        message: result.success
          ? "Platform metrics calculado com sucesso"
          : "Platform metrics falhou",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro no trigger platform metrics:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno no trigger",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  },
);

/**
 * POST /api/cron/trigger/tenant-metrics
 * Trigger manual apenas do cálculo de tenant metrics
 */
router.post("/trigger/tenant-metrics", async (req: Request, res: Response) => {
  try {
    console.log("🔧 [API] Trigger manual - tenant metrics");

    const { tenantIds, forceRecalculation } = req.body || {};

    const result: CronJobResult =
      await unifiedCronService.triggerTenantMetrics();

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.success
        ? "Tenant metrics calculado com sucesso"
        : "Tenant metrics falhou",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro no trigger tenant metrics:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno no trigger",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * GET /api/cron/performance
 * Retorna métricas de performance dos últimos jobs
 */
router.get("/performance", async (req: Request, res: Response) => {
  try {
    const status = unifiedCronService.getStatus();
    const { performance, executionHistory } = status;

    // Análise das últimas 20 execuções
    const recentJobs = executionHistory.slice(-20);
    const jobsByType = recentJobs.reduce(
      (acc, job) => {
        if (!acc[job.jobName]) {
          acc[job.jobName] = [];
        }
        acc[job.jobName]?.push(job);
        return acc;
      },
      {} as Record<string, CronJobResult[]>,
    );

    const performanceAnalysis = Object.entries(jobsByType).map(
      ([jobName, jobs]) => {
        const totalTime = jobs.reduce(
          (sum, job) => sum + job.executionTimeMs,
          0,
        );
        const avgTime = totalTime / jobs.length;
        const successCount = jobs.filter((job) => job.success).length;
        const successRate = (successCount / jobs.length) * 100;

        return {
          jobName,
          executionCount: jobs.length,
          averageExecutionTime: Math.round(avgTime),
          successRate: Math.round(successRate * 100) / 100,
          totalExecutionTime: totalTime,
          lastExecution: jobs[jobs.length - 1]?.startTime,
        };
      },
    );

    res.json({
      success: true,
      data: {
        overall: performance,
        byJobType: performanceAnalysis,
        recentExecutions: recentJobs.slice(-10),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao obter performance do cron:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno ao obter performance",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * GET /api/cron/health
 * Health check endpoint para monitoring
 */
router.get("/health", async (req: Request, res: Response) => {
  try {
    const status = unifiedCronService.getStatus();
    const { performance } = status;

    const isHealthy =
      performance.successRate >= 95 && performance.avgExecutionTime < 60000;
    const healthStatus = isHealthy ? "healthy" : "degraded";

    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: healthStatus,
      initialized: status.isInitialized,
      activeJobs: status.activeJobs,
      performance: {
        successRate: performance.successRate,
        avgExecutionTime: performance.avgExecutionTime,
        memoryUsage: performance.memoryUsage,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro no health check do cron:", error);
    res.status(503).json({
      status: "error",
      error: "Health check failed",
      details: error instanceof Error ? error.message : "Erro desconhecido",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/cron/stop
 * Para todos os cron jobs (uso administrativo)
 */
router.post("/stop", async (req: Request, res: Response) => {
  try {
    console.log("🛑 [API] Parando todos os cron jobs...");

    unifiedCronService.stop();

    res.json({
      success: true,
      message: "Todos os cron jobs foram parados",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao parar cron jobs:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno ao parar jobs",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

/**
 * POST /api/cron/restart
 * Reinicia o sistema de cron jobs
 */
router.post("/restart", async (req: Request, res: Response) => {
  try {
    console.log("🔄 [API] Reiniciando sistema de cron...");

    // Parar jobs atuais
    unifiedCronService.stop();

    // Aguardar um momento
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Reinicializar
    unifiedCronService.initialize();

    res.json({
      success: true,
      message: "Sistema de cron reiniciado com sucesso",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao reiniciar cron:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno ao reiniciar",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

export default router;
