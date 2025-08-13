/**
 * Unified Metrics Routes
 * Consolidated API endpoints for all dashboard metrics
 *
 * @fileoverview Central routing for unified metrics API endpoints
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import express from "express";
import { MetricsController } from "../controllers/metrics.controller";
import { MetricsValidator } from "../validators/metrics.validators";
import {
  cacheMiddleware,
  invalidateCacheMiddleware,
  cleanupCacheMiddleware,
} from "../middleware/metrics-cache.middleware";
import { AdminAuthMiddleware } from "../middleware/admin-auth";

const router = express.Router();
const metricsController = new MetricsController();
const metricsValidator = new MetricsValidator();
const authMiddleware = new AdminAuthMiddleware();

/**
 * Rate limiting middleware for metrics endpoints
 */
const rateLimitMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void => {
  // Simple rate limiting - 100 requests per minute per IP
  const ip = req.ip || req.connection.remoteAddress;
  const key = `rate_limit_${ip}`;

  // In production, use Redis or similar for distributed rate limiting
  // For now, using simple in-memory tracking
  const now = Date.now();
  const minute = 60 * 1000;

  if (!(global as any).rateLimitTracker) {
    (global as any).rateLimitTracker = new Map();
  }

  const tracker = (global as any).rateLimitTracker;
  const requests = tracker.get(key) || [];

  // Remove requests older than 1 minute
  const recentRequests = requests.filter(
    (timestamp: number) => now - timestamp < minute,
  );

  if (recentRequests.length >= 100) {
    res.status(429).json({
      error: true,
      message: "Rate limit exceeded. Maximum 100 requests per minute.",
      code: "RATE_LIMIT_001",
      details: {
        limit: 100,
        period: "1 minute",
        retry_after: 60,
      },
      timestamp: new Date().toISOString(),
      request_id: (req.headers["x-request-id"] as string) || "unknown",
    });
    return;
  }

  // Add current request
  recentRequests.push(now);
  tracker.set(key, recentRequests);

  // Add rate limit headers
  res.set({
    "X-RateLimit-Limit": "100",
    "X-RateLimit-Remaining": String(100 - recentRequests.length),
    "X-RateLimit-Reset": String(Math.ceil((now + minute) / 1000)),
  });

  next();
};

/**
 * Request logging middleware
 */
const loggingMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add request ID to headers
  res.setHeader("X-Request-ID", requestId);

  // Log request
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Request ID: ${requestId}`,
  );

  // Override res.json to log response time
  const originalJson = res.json;
  res.json = function (data: any) {
    const duration = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - Completed in ${duration}ms - Status: ${res.statusCode} - Request ID: ${requestId}`,
    );

    // Add performance headers
    res.set({
      "X-Response-Time": `${duration}ms`,
      "X-Request-ID": requestId as string,
    });

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Error handling middleware
 */
const errorHandlingMiddleware = (
  err: Error,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  console.error(
    `[${new Date().toISOString()}] Error in ${req.method} ${req.path}:`,
    err,
  );

  const errorResponse = {
    error: true,
    message: err.message || "Internal server error",
    code: "METRICS_ERROR_001",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    request_id: (req.headers["x-request-id"] as string) || "unknown",
  };

  res.status(500).json(errorResponse);
};

// Apply middleware to all routes
router.use(rateLimitMiddleware);
router.use(loggingMiddleware);
router.use(cleanupCacheMiddleware);

// ========================= PLATFORM METRICS ROUTES =========================

/**
 * GET /api/metrics/platform/all
 * Get comprehensive platform-wide metrics
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - include_charts: boolean (include chart data)
 * - include_breakdown: boolean (include detailed breakdown)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/platform/all",
  cacheMiddleware("platform_metrics"),
  metricsValidator.validatePlatformMetricsRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getPlatformMetrics(req, res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/metrics/platform/kpis
 * Get strategic platform KPIs for super admin dashboard
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - include_insights: boolean (include business insights)
 * - include_risk_assessment: boolean (include risk analysis)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/platform/kpis",
  cacheMiddleware("platform_kpis"),
  metricsValidator.validatePlatformKPIsRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getPlatformKPIs(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// ========================= TENANT METRICS ROUTES =========================

/**
 * GET /api/metrics/tenant/:id/metrics
 * Get comprehensive tenant-specific metrics
 *
 * Path Parameters:
 * - id: string (tenant ID)
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - include_charts: boolean (include chart data)
 * - include_ai_metrics: boolean (include AI performance metrics)
 * - include_business_intelligence: boolean (include BI analysis)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/tenant/:id/metrics",
  cacheMiddleware("tenant_metrics"),
  metricsValidator.validateTenantMetricsRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getTenantMetrics(req, res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/metrics/tenant/:id/participation
 * Get tenant participation metrics in platform totals
 *
 * Path Parameters:
 * - id: string (tenant ID)
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - comparison_type: 'percentage' | 'absolute' | 'both' (default: 'both')
 * - include_ranking: boolean (include ranking information)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/tenant/:id/participation",
  cacheMiddleware("tenant_participation"),
  metricsValidator.validateTenantParticipationRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getTenantParticipation(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// ========================= COMPARISON ROUTES =========================

/**
 * GET /api/metrics/comparison/:id
 * Get tenant vs platform comparison metrics
 *
 * Path Parameters:
 * - id: string (tenant ID)
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - metrics: string[] (specific metrics to compare)
 * - include_analysis: boolean (include detailed analysis)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/comparison/:id",
  cacheMiddleware("comparison_data"),
  metricsValidator.validateComparisonRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getComparisonData(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// ========================= CHART DATA ROUTES =========================

/**
 * GET /api/metrics/charts/:type
 * Get chart-specific data for dashboards
 *
 * Path Parameters:
 * - type: 'platform' | 'tenant' | 'comparison' | 'revenue_trend' | 'domain_distribution' | 'appointment_status'
 *
 * Query Parameters:
 * - period: '7d' | '30d' | '90d' | '1y' (default: '30d')
 * - start_date: YYYY-MM-DD (custom start date)
 * - end_date: YYYY-MM-DD (custom end date)
 * - tenant_id: string (required for tenant-specific charts)
 * - chart_options: object (custom chart configuration)
 * - force_refresh: boolean (bypass cache)
 */
router.get(
  "/charts/:type",
  cacheMiddleware("charts_data"),
  metricsValidator.validateChartDataRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getChartData(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// ========================= ADMINISTRATIVE ROUTES =========================

/**
 * POST /api/metrics/calculation/trigger
 * Manually trigger metrics calculation
 *
 * Body Parameters:
 * - type: 'platform' | 'tenant' | 'all' (calculation type)
 * - tenant_id: string (required if type is 'tenant')
 * - force_recalculation: boolean (force full recalculation)
 * - include_cache_refresh: boolean (refresh cache after calculation)
 * - priority: 'low' | 'normal' | 'high' (calculation priority)
 */
router.post(
  "/calculation/trigger",
  invalidateCacheMiddleware([
    "platform_metrics",
    "tenant_metrics",
    "platform_kpis",
  ]),
  metricsValidator.validateCalculationRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.triggerCalculation(req, res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/metrics/status
 * Get system health and status information
 *
 * Query Parameters:
 * - include_cache_stats: boolean (include cache statistics)
 * - include_performance_metrics: boolean (include performance data)
 */
router.get(
  "/status",
  metricsValidator.validateStatusRequest,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.getSystemStatus(req, res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/metrics/cache/clear
 * Clear metrics cache
 *
 * Query Parameters:
 * - pattern: string (cache pattern to clear, optional)
 * - tenant_id: string (clear cache for specific tenant, optional)
 */
router.delete(
  "/cache/clear",
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await metricsController.clearCache(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// ========================= LEGACY COMPATIBILITY ROUTES =========================

/**
 * Legacy compatibility routes for gradual migration
 * These routes will be deprecated in future versions
 */

// Super admin dashboard compatibility
router.get(
  "/super-admin/platform-metrics",
  cacheMiddleware("platform_metrics"),
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      // Redirect to new endpoint with deprecation warning
      res.set("X-Deprecated-Endpoint", "true");
      res.set("X-New-Endpoint", "/api/metrics/platform/kpis");
      await metricsController.getPlatformKPIs(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// Tenant dashboard compatibility
router.get(
  "/tenant-analytics/:id",
  cacheMiddleware("tenant_metrics"),
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      // Redirect to new endpoint with deprecation warning
      res.set("X-Deprecated-Endpoint", "true");
      res.set("X-New-Endpoint", "/api/metrics/tenant/:id/metrics");
      await metricsController.getTenantMetrics(req, res);
    } catch (error) {
      next(error);
    }
  },
);

// Apply error handling middleware
router.use(errorHandlingMiddleware);

export default router;
