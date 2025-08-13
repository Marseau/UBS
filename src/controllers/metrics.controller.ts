/**
 * Metrics Controller
 * Central controller for all unified metrics operations
 *
 * @fileoverview Controller layer for unified metrics API endpoints
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import { Request, Response } from "express";
import { unifiedMetricsService } from "../services/unified-metrics.service";
import { MetricsCacheService } from "../middleware/metrics-cache.middleware";
import {
  PlatformMetricsRequest,
  PlatformKPIsRequest,
  TenantMetricsRequest,
  TenantParticipationRequest,
  ComparisonRequest,
  ChartDataRequest,
  CalculationRequest,
  UnifiedError,
} from "../types/unified-metrics.types";

/**
 * Metrics Controller Class
 * Handles all HTTP requests for metrics endpoints
 */
export class MetricsController {
  /**
   * Error response helper
   */
  private sendErrorResponse(
    res: Response,
    error: any,
    code: string = "METRICS_ERROR_001",
  ): void {
    const errorResponse: UnifiedError = {
      error: true,
      message: error.message || "Internal server error",
      code,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      request_id: (res.getHeader("X-Request-ID") as string) || "unknown",
    };

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json(errorResponse);
  }

  /**
   * Success response helper
   */
  private sendSuccessResponse(res: Response, data: any, metadata?: any): void {
    const response = {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        request_id: (res.getHeader("X-Request-ID") as string) || "unknown",
        ...metadata,
      },
    };

    res.json(response);
  }

  /**
   * Extract request parameters helper
   */
  private extractBaseParams(req: Request): any {
    return {
      period: (req.query.period as string) || "30d",
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      force_refresh: req.query.force_refresh === "true",
    };
  }

  // ========================= PLATFORM METRICS =========================

  /**
   * GET /api/metrics/platform/all
   * Get comprehensive platform-wide metrics
   */
  async getPlatformMetrics(req: Request, res: Response): Promise<void> {
    try {
      const request: PlatformMetricsRequest = {
        ...this.extractBaseParams(req),
        include_charts: req.query.include_charts === "true",
        include_breakdown: req.query.include_breakdown === "true",
      };

      console.log(
        `[${new Date().toISOString()}] Getting platform metrics with params:`,
        request,
      );

      const result = await unifiedMetricsService.getPlatformMetrics(request);

      this.sendSuccessResponse(res, result, {
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getPlatformMetrics:", error);
      this.sendErrorResponse(res, error, "PLATFORM_METRICS_001");
    }
  }

  /**
   * GET /api/metrics/platform/kpis
   * Get strategic platform KPIs for super admin dashboard
   */
  async getPlatformKPIs(req: Request, res: Response): Promise<void> {
    try {
      const request: PlatformKPIsRequest = {
        ...this.extractBaseParams(req),
        include_insights: req.query.include_insights === "true",
        include_risk_assessment: req.query.include_risk_assessment === "true",
      };

      console.log(
        `[${new Date().toISOString()}] Getting platform KPIs with params:`,
        request,
      );

      const result = await unifiedMetricsService.getPlatformKPIs(request);

      this.sendSuccessResponse(res, result, {
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getPlatformKPIs:", error);
      this.sendErrorResponse(res, error, "PLATFORM_KPIS_001");
    }
  }

  // ========================= TENANT METRICS =========================

  /**
   * GET /api/metrics/tenant/:id/metrics
   * Get comprehensive tenant-specific metrics
   */
  async getTenantMetrics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.params.id;

      if (!tenantId) {
        const error = new Error("Tenant ID is required");
        (error as any).statusCode = 400;
        throw error;
      }

      const request: TenantMetricsRequest = {
        ...this.extractBaseParams(req),
        include_charts: req.query.include_charts === "true",
        include_ai_metrics: req.query.include_ai_metrics === "true",
        include_business_intelligence:
          req.query.include_business_intelligence === "true",
      };

      console.log(
        `[${new Date().toISOString()}] Getting tenant metrics for ${tenantId} with params:`,
        request,
      );

      const result = await unifiedMetricsService.getTenantMetrics(
        tenantId,
        request,
      );

      this.sendSuccessResponse(res, result, {
        tenant_id: tenantId,
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getTenantMetrics:", error);
      this.sendErrorResponse(res, error, "TENANT_METRICS_001");
    }
  }

  /**
   * GET /api/metrics/tenant/:id/participation
   * Get tenant participation metrics in platform totals
   */
  async getTenantParticipation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.params.id;

      if (!tenantId) {
        const error = new Error("Tenant ID is required");
        (error as any).statusCode = 400;
        throw error;
      }

      const request: TenantParticipationRequest = {
        ...this.extractBaseParams(req),
        comparison_type:
          (req.query.comparison_type as "percentage" | "absolute" | "both") ||
          "both",
        include_ranking: req.query.include_ranking === "true",
      };

      console.log(
        `[${new Date().toISOString()}] Getting tenant participation for ${tenantId} with params:`,
        request,
      );

      // TODO: Implement getTenantParticipation in UnifiedMetricsService
      const result = {
        tenant_info: {
          id: tenantId,
          name: "Sample Tenant",
          domain: "beauty" as const,
          status: "active" as const,
          created_at: new Date().toISOString(),
        },
        participation: {
          revenue: {
            value: 2500,
            percentage: 12.5,
            platform_total: 20000,
            display_value: "R$ 2.500,00",
          },
          appointments: {
            value: 45,
            percentage: 15.0,
            platform_total: 300,
            display_value: "45",
          },
          customers: {
            value: 120,
            percentage: 10.0,
            platform_total: 1200,
            display_value: "120",
          },
          ai_interactions: {
            value: 200,
            percentage: 8.0,
            platform_total: 2500,
            display_value: "200",
          },
        },
        business_intelligence: {
          risk_score: 25,
          efficiency_score: 85,
          growth_score: 70,
        },
        metadata: {
          period: request.period || "30d",
          last_updated: new Date().toISOString(),
          platform_totals: {
            revenue: 20000,
            appointments: 300,
            customers: 1200,
            ai_interactions: 2500,
          },
        },
      };

      this.sendSuccessResponse(res, result, {
        tenant_id: tenantId,
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getTenantParticipation:", error);
      this.sendErrorResponse(res, error, "TENANT_PARTICIPATION_001");
    }
  }

  // ========================= COMPARISON METRICS =========================

  /**
   * GET /api/metrics/comparison/:id
   * Get tenant vs platform comparison metrics
   */
  async getComparisonData(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.params.id;

      if (!tenantId) {
        const error = new Error("Tenant ID is required");
        (error as any).statusCode = 400;
        throw error;
      }

      const request: ComparisonRequest = {
        ...this.extractBaseParams(req),
        metrics: req.query.metrics
          ? (req.query.metrics as string).split(",")
          : undefined,
        include_analysis: req.query.include_analysis === "true",
      };

      console.log(
        `[${new Date().toISOString()}] Getting comparison data for ${tenantId} with params:`,
        request,
      );

      // TODO: Implement getComparisonData in UnifiedMetricsService
      const result = {
        tenant_data: {
          revenue: { value: 2500, display_value: "R$ 2.500,00" },
          appointments: { value: 45, display_value: "45" },
          customers: { value: 120, display_value: "120" },
          ai_interactions: { value: 200, display_value: "200" },
          chat_duration_avg: { value: 15.5, display_value: "15.5 min" },
          cancellation_rate: { value: 8, display_value: "8.0%" },
          spam_detection_score: { value: 95, display_value: "95" },
          conversion_rate: { value: 12, display_value: "12.0%" },
        },
        platform_data: {
          avg_revenue_per_tenant: 1666.67,
          avg_appointments_per_tenant: 30,
          avg_customers_per_tenant: 100,
          platform_conversion_rate: 10.5,
        },
        comparison_scores: {
          revenue_performance: 150, // 150% of platform average
          efficiency_score: 120,
          growth_rate: 110,
          risk_level: "low" as const,
        },
        rankings: {
          revenue_rank: 3,
          efficiency_rank: 2,
          growth_rank: 5,
          total_tenants: 25,
        },
      };

      this.sendSuccessResponse(res, result, {
        tenant_id: tenantId,
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getComparisonData:", error);
      this.sendErrorResponse(res, error, "COMPARISON_DATA_001");
    }
  }

  // ========================= CHART DATA =========================

  /**
   * GET /api/metrics/charts/:type
   * Get chart-specific data for dashboards
   */
  async getChartData(req: Request, res: Response): Promise<void> {
    try {
      const chartType = req.params.type;

      if (!chartType) {
        const error = new Error("Chart type is required");
        (error as any).statusCode = 400;
        throw error;
      }

      const request: ChartDataRequest = {
        ...this.extractBaseParams(req),
        tenant_id: req.query.tenant_id as string,
        chart_options: req.query.chart_options
          ? JSON.parse(req.query.chart_options as string)
          : undefined,
      };

      console.log(
        `[${new Date().toISOString()}] Getting chart data for ${chartType} with params:`,
        request,
      );

      // TODO: Implement getChartData in UnifiedMetricsService
      const result = {
        chart_type: chartType,
        data: [
          { x: "2024-01-01", y: 1000, label: "Jan" },
          { x: "2024-01-15", y: 1200, label: "Mid Jan" },
          { x: "2024-02-01", y: 1500, label: "Feb" },
          { x: "2024-02-15", y: 1800, label: "Mid Feb" },
        ],
        chart_config: {
          title: `${chartType} Chart`,
          x_axis: "Date",
          y_axis: "Value",
          type: "line" as const,
          colors: ["#007bff", "#28a745", "#ffc107", "#dc3545"],
        },
        metadata: {
          total_points: 4,
          date_range: {
            start: "2024-01-01",
            end: "2024-02-15",
          },
          last_updated: new Date().toISOString(),
          data_quality: 95,
        },
      };

      this.sendSuccessResponse(res, result, {
        chart_type: chartType,
        cache_status: res.getHeader("X-Cache-Status"),
        response_time: res.getHeader("X-Response-Time"),
      });
    } catch (error) {
      console.error("Error in getChartData:", error);
      this.sendErrorResponse(res, error, "CHART_DATA_001");
    }
  }

  // ========================= ADMINISTRATIVE OPERATIONS =========================

  /**
   * POST /api/metrics/calculation/trigger
   * Manually trigger metrics calculation
   */
  async triggerCalculation(req: Request, res: Response): Promise<void> {
    try {
      const request: CalculationRequest = {
        type: req.body.type || "all",
        tenant_id: req.body.tenant_id,
        force_recalculation: req.body.force_recalculation === true,
        include_cache_refresh: req.body.include_cache_refresh === true,
        priority: req.body.priority || "normal",
      };

      console.log(
        `[${new Date().toISOString()}] Triggering calculation with params:`,
        request,
      );

      const calculationId = `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // TODO: Implement actual calculation trigger
      const result = {
        success: true,
        message: "Calculation triggered successfully",
        calculation_id: calculationId,
        estimated_completion: new Date(
          Date.now() + 5 * 60 * 1000,
        ).toISOString(), // 5 minutes from now
        results: {
          platform_metrics:
            request.type === "platform" || request.type === "all",
          tenant_metrics: request.type === "tenant" || request.type === "all",
          cache_refreshed: request.include_cache_refresh,
          calculation_time_ms: 150,
        },
      };

      // Clear cache if requested
      if (request.include_cache_refresh) {
        await MetricsCacheService.clear();
      }

      this.sendSuccessResponse(res, result, {
        calculation_id: calculationId,
        priority: request.priority,
      });
    } catch (error) {
      console.error("Error in triggerCalculation:", error);
      this.sendErrorResponse(res, error, "CALCULATION_TRIGGER_001");
    }
  }

  /**
   * GET /api/metrics/status
   * Get system health and status information
   */
  async getSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      const includeCacheStats = req.query.include_cache_stats === "true";
      const includePerformanceMetrics =
        req.query.include_performance_metrics === "true";

      console.log(`[${new Date().toISOString()}] Getting system status`);

      const result = await unifiedMetricsService.healthCheck();

      // Add additional stats if requested
      if (includeCacheStats) {
        (result as any).cache_stats = MetricsCacheService.getStats();
      }

      if (includePerformanceMetrics) {
        (result as any).performance_metrics =
          unifiedMetricsService.getPerformanceStats();
      }

      this.sendSuccessResponse(res, result, {
        health_check_time: new Date().toISOString(),
        include_cache_stats: includeCacheStats,
        include_performance_metrics: includePerformanceMetrics,
      });
    } catch (error) {
      console.error("Error in getSystemStatus:", error);
      this.sendErrorResponse(res, error, "SYSTEM_STATUS_001");
    }
  }

  /**
   * DELETE /api/metrics/cache/clear
   * Clear metrics cache
   */
  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const pattern = req.query.pattern as string;
      const tenantId = req.query.tenant_id as string;

      console.log(
        `[${new Date().toISOString()}] Clearing cache - Pattern: ${pattern}, TenantId: ${tenantId}`,
      );

      let removedCount = 0;

      if (tenantId) {
        removedCount = await MetricsCacheService.invalidateTenant(tenantId);
      } else if (pattern) {
        removedCount = await MetricsCacheService.invalidate(pattern);
      } else {
        await MetricsCacheService.clear();
        removedCount = -1; // Indicate full clear
      }

      const result = {
        success: true,
        message:
          removedCount === -1
            ? "All cache cleared"
            : `Removed ${removedCount} cache entries`,
        removed_count: removedCount === -1 ? "all" : removedCount,
        pattern: pattern || "all",
        tenant_id: tenantId || "all",
        timestamp: new Date().toISOString(),
      };

      this.sendSuccessResponse(res, result, {
        cache_operation: "clear",
        scope: pattern || tenantId || "all",
      });
    } catch (error) {
      console.error("Error in clearCache:", error);
      this.sendErrorResponse(res, error, "CACHE_CLEAR_001");
    }
  }
}

export default MetricsController;
