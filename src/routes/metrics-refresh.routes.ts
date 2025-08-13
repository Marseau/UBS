/**
 * Metrics Refresh Routes
 * Context Engineering COLEAM00 - Manual refresh endpoints for dashboards
 *
 * @fileoverview REST endpoints for manual metrics refresh from dashboard UI
 * @author Context Engineering Implementation
 * @version 1.0.0
 * @since 2025-08-04
 */

import express from "express";
import {
  MetricsPopulationService,
  PopulationResult,
  PlatformPopulationResult,
} from "../services/metrics-population.service";
import { MetricsPeriod } from "../services/metrics-analysis.service";

const router = express.Router();
const metricsPopulationService = MetricsPopulationService.getInstance();

/**
 * Response interface for API endpoints
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  processingTime: number;
}

/**
 * Create standardized API response
 */
function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  processingTime: number = 0,
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
    processingTime,
  };
}

/**
 * Validate period parameter
 */
function validatePeriod(period: string): MetricsPeriod | null {
  const validPeriods = ["7d", "30d", "90d"];
  if (validPeriods.includes(period)) {
    return period as MetricsPeriod;
  }
  return null;
}

/**
 * POST /api/metrics/refresh/:tenantId/:period
 * Manual refresh for specific tenant and period
 */
router.post("/refresh/:tenantId/:period", async (req, res) => {
  const startTime = Date.now();

  try {
    const { tenantId, period } = req.params;

    // Validate parameters
    if (!tenantId || typeof tenantId !== "string") {
      return res
        .status(400)
        .json(
          createApiResponse(
            false,
            undefined,
            "Invalid tenant ID provided",
            Date.now() - startTime,
          ),
        );
    }

    const validatedPeriod = validatePeriod(period);
    if (!validatedPeriod) {
      return res
        .status(400)
        .json(
          createApiResponse(
            false,
            undefined,
            "Invalid period. Use: 7d, 30d, or 90d",
            Date.now() - startTime,
          ),
        );
    }

    // Execute metrics population for specific tenant
    const result: PopulationResult =
      await metricsPopulationService.populateTenantMetrics(
        tenantId,
        validatedPeriod,
      );

    const processingTime = Date.now() - startTime;

    if (result.success) {
      return res.status(200).json(
        createApiResponse(
          true,
          {
            tenantId: result.tenantId,
            period: result.period,
            recordsCreated: result.recordsCreated,
            recordsUpdated: result.recordsUpdated,
            validationScore: result.validationScore,
            message: `Tenant metrics refreshed successfully for ${period} period`,
          },
          undefined,
          processingTime,
        ),
      );
    } else {
      return res.status(422).json(
        createApiResponse(
          false,
          {
            tenantId: result.tenantId,
            period: result.period,
            validationScore: result.validationScore,
            errors: result.errors,
          },
          "Metrics refresh failed validation",
          processingTime,
        ),
      );
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("Tenant metrics refresh error:", error);
    return res
      .status(500)
      .json(
        createApiResponse(
          false,
          undefined,
          `Internal server error: ${error.message}`,
          processingTime,
        ),
      );
  }
});

/**
 * POST /api/metrics/refresh-platform/:period
 * Manual refresh for platform metrics aggregation
 */
router.post("/refresh-platform/:period", async (req, res) => {
  const startTime = Date.now();

  try {
    const { period } = req.params;

    const validatedPeriod = validatePeriod(period);
    if (!validatedPeriod) {
      return res
        .status(400)
        .json(
          createApiResponse(
            false,
            undefined,
            "Invalid period. Use: 7d, 30d, or 90d",
            Date.now() - startTime,
          ),
        );
    }

    // Execute platform metrics population (aggregation)
    const result: PlatformPopulationResult =
      await metricsPopulationService.populatePlatformMetrics(validatedPeriod);

    const processingTime = Date.now() - startTime;

    if (result.success) {
      return res.status(200).json(
        createApiResponse(
          true,
          {
            period: result.period,
            totalTenantsProcessed: result.totalTenantsProcessed,
            platformMetricsUpdated: result.platformMetricsUpdated,
            aggregationScore: result.aggregationScore,
            message: `Platform metrics refreshed successfully for ${period} period`,
          },
          undefined,
          processingTime,
        ),
      );
    } else {
      return res.status(422).json(
        createApiResponse(
          false,
          {
            period: result.period,
            totalTenantsProcessed: result.totalTenantsProcessed,
            errors: result.errors,
          },
          "Platform metrics refresh failed",
          processingTime,
        ),
      );
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("Platform metrics refresh error:", error);
    return res
      .status(500)
      .json(
        createApiResponse(
          false,
          undefined,
          `Internal server error: ${error.message}`,
          processingTime,
        ),
      );
  }
});

/**
 * POST /api/metrics/refresh-all/:period
 * Manual refresh for all tenants + platform aggregation (full workflow)
 */
router.post("/refresh-all/:period", async (req, res) => {
  const startTime = Date.now();

  try {
    const { period } = req.params;

    const validatedPeriod = validatePeriod(period);
    if (!validatedPeriod) {
      return res
        .status(400)
        .json(
          createApiResponse(
            false,
            undefined,
            "Invalid period. Use: 7d, 30d, or 90d",
            Date.now() - startTime,
          ),
        );
    }

    // Execute full workflow (all tenants + platform aggregation)
    const workflowResult =
      await metricsPopulationService.populateMetricsWorkflow(validatedPeriod);

    const processingTime = Date.now() - startTime;

    // Check if workflow was generally successful
    const workflowSuccess =
      workflowResult.platformResult.success &&
      workflowResult.summary.successfulTenants > 0;

    if (workflowSuccess) {
      return res.status(200).json(
        createApiResponse(
          true,
          {
            period: validatedPeriod,
            summary: workflowResult.summary,
            platformResult: {
              success: workflowResult.platformResult.success,
              totalTenantsProcessed:
                workflowResult.platformResult.totalTenantsProcessed,
              aggregationScore: workflowResult.platformResult.aggregationScore,
            },
            failedTenants: workflowResult.tenantResults
              .filter((r) => !r.success)
              .map((r) => ({
                tenantId: r.tenantId,
                errors: r.errors,
              })),
            message: `Full metrics refresh completed for ${period} period`,
          },
          undefined,
          processingTime,
        ),
      );
    } else {
      return res.status(422).json(
        createApiResponse(
          false,
          {
            period: validatedPeriod,
            summary: workflowResult.summary,
            platformErrors: workflowResult.platformResult.errors,
            tenantErrors: workflowResult.tenantResults
              .filter((r) => !r.success)
              .map((r) => ({
                tenantId: r.tenantId,
                errors: r.errors,
              })),
          },
          "Full metrics refresh encountered errors",
          processingTime,
        ),
      );
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("Full metrics refresh error:", error);
    return res
      .status(500)
      .json(
        createApiResponse(
          false,
          undefined,
          `Internal server error: ${error.message}`,
          processingTime,
        ),
      );
  }
});

/**
 * GET /api/metrics/status
 * Get status of metrics system
 */
router.get("/status", async (req, res) => {
  const startTime = Date.now();

  try {
    // Get basic status information
    const currentDate = new Date();
    const last24Hours = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);

    // This is a basic status check - could be enhanced with more detailed health checks
    const status = {
      systemStatus: "operational",
      currentTime: currentDate.toISOString(),
      last24Hours: last24Hours.toISOString(),
      availablePeriods: ["7d", "30d", "90d"],
      endpoints: {
        tenantRefresh: "/api/metrics/refresh/:tenantId/:period",
        platformRefresh: "/api/metrics/refresh-platform/:period",
        fullRefresh: "/api/metrics/refresh-all/:period",
        status: "/api/metrics/status",
      },
      notes: {
        refreshMethods: "POST only",
        supportedPeriods: "7d (7 days), 30d (30 days), 90d (90 days)",
        validationThreshold:
          "Minimum 70% validation score required for population",
      },
    };

    const processingTime = Date.now() - startTime;

    return res
      .status(200)
      .json(createApiResponse(true, status, undefined, processingTime));
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("Metrics status error:", error);
    return res
      .status(500)
      .json(
        createApiResponse(
          false,
          undefined,
          `Internal server error: ${error.message}`,
          processingTime,
        ),
      );
  }
});

export default router;
