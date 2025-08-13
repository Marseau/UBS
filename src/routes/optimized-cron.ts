/**
 * OPTIMIZED CRON ROUTES
 * API endpoints para controle manual dos crons
 * Tenant admin: só pode atualizar suas métricas
 * Super admin: pode atualizar métricas da plataforma
 */

import { Router } from "express";
import { optimizedCronService } from "../services/optimized-cron.service";
import AdminAuthMiddleware from "../middleware/admin-auth";

const adminAuth = new AdminAuthMiddleware();

const router = Router();

/**
 * Get cron jobs status
 */
router.get("/status", adminAuth.verifyToken, async (req, res) => {
  try {
    const status = optimizedCronService.getJobStatus();

    res.json({
      success: true,
      data: {
        jobs: status,
        totalJobs: status.length,
        runningJobs: status.filter((job) => job.isRunning).length,
      },
    });
  } catch (error) {
    console.error("❌ Error getting cron status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get cron status",
    });
  }
});

/**
 * Manual trigger: Daily Metrics
 * Tenant admin: apenas suas métricas
 * Super admin: métricas da plataforma
 */
router.post(
  "/trigger/daily-metrics",
  adminAuth.verifyToken,
  async (req, res) => {
    try {
      const admin = req.admin;
      if (!admin) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const tenantId = admin.role === "super_admin" ? null : admin.tenantId;

      await optimizedCronService.triggerDailyMetrics(tenantId || undefined);

      return res.json({
        success: true,
        message: `Daily metrics calculated ${tenantId ? "for tenant" : "for platform"}`,
        tenantId: tenantId,
      });
    } catch (error) {
      console.error("❌ Error triggering daily metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to calculate daily metrics",
      });
    }
  },
);

/**
 * Manual trigger: Weekly Analytics
 * Super admin only (plataforma)
 */
router.post(
  "/trigger/weekly-analytics",
  adminAuth.verifyToken,
  adminAuth.requireSuperAdmin,
  async (req, res) => {
    try {
      await optimizedCronService.triggerWeeklyAnalytics();

      res.json({
        success: true,
        message: "Weekly analytics calculated for platform",
      });
    } catch (error) {
      console.error("❌ Error triggering weekly analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to calculate weekly analytics",
      });
    }
  },
);

/**
 * Manual trigger: Monthly Reports
 * Super admin only (plataforma)
 */
router.post(
  "/trigger/monthly-reports",
  adminAuth.verifyToken,
  adminAuth.requireSuperAdmin,
  async (req, res) => {
    try {
      await optimizedCronService.triggerMonthlyReports();

      res.json({
        success: true,
        message: "Monthly reports calculated for platform",
      });
    } catch (error) {
      console.error("❌ Error triggering monthly reports:", error);
      res.status(500).json({
        success: false,
        error: "Failed to calculate monthly reports",
      });
    }
  },
);

/**
 * Manual trigger: Risk Assessment
 * Tenant admin: apenas seu tenant
 * Super admin: toda a plataforma
 */
router.post(
  "/trigger/risk-assessment",
  adminAuth.verifyToken,
  async (req, res) => {
    try {
      const admin = req.admin;
      if (!admin) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const tenantId = admin.role === "super_admin" ? null : admin.tenantId;

      await optimizedCronService.triggerRiskAssessment(tenantId || undefined);

      return res.json({
        success: true,
        message: `Risk assessment calculated ${tenantId ? "for tenant" : "for platform"}`,
        tenantId: tenantId,
      });
    } catch (error) {
      console.error("❌ Error triggering risk assessment:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to calculate risk assessment",
      });
    }
  },
);

/**
 * Enable/disable optimized cron service
 * Super admin only
 */
router.post(
  "/toggle",
  adminAuth.verifyToken,
  adminAuth.requireSuperAdmin,
  async (req, res) => {
    try {
      const { enabled } = req.body;

      optimizedCronService.setEnabled(enabled);

      res.json({
        success: true,
        message: `Optimized cron service ${enabled ? "enabled" : "disabled"}`,
        enabled: enabled,
      });
    } catch (error) {
      console.error("❌ Error toggling cron service:", error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle cron service",
      });
    }
  },
);

export default router;
