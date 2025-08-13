/**
 * Unified Metrics Service
 * Consolidated service for all dashboard metrics calculation and retrieval
 *
 * @fileoverview Core service that replaces multiple metric services with unified implementation
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import { getAdminClient } from "../config/database";
import { BusinessDomain } from "../types/database.types";
import {
  BaseMetricRequest,
  PlatformMetricsRequest,
  PlatformMetricsResponse,
  PlatformKPIsRequest,
  PlatformKPIsResponse,
  TenantMetricsRequest,
  TenantMetricsResponse,
  TenantParticipationRequest,
  TenantParticipationResponse,
  ComparisonRequest,
  ComparisonResponse,
  ChartDataRequest,
  ChartDataResponse,
  CalculationRequest,
  CalculationResponse,
  StatusResponse,
  KPIValue,
  ChartData,
  TenantInfo,
  DistortionInsight,
  UpsellOpportunity,
  RiskAssessment,
  UnifiedError,
} from "../types/unified-metrics.types";
import { MetricsCacheService } from "../middleware/metrics-cache.middleware";
import {
  memoryOptimizer,
  getOptimizedConnection,
  releaseOptimizedConnection,
} from "../utils/memory-optimizer";

/**
 * Date range interface for internal use
 */
interface DateRange {
  start: string;
  end: string;
}

/**
 * Lightweight performance monitoring interface - optimized for memory
 */
interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Memory-optimized performance tracker
 */
interface CompactPerformanceStats {
  totalRequests: number;
  successCount: number;
  avgDuration: number;
  lastUpdate: number;
  errorCount: number;
}

/**
 * Unified Metrics Service - Memory Optimized Version
 * Consolidates all metrics calculation and retrieval logic with <50MB target
 */
export class UnifiedMetricsService {
  private static instance: UnifiedMetricsService;
  private compactStats: Map<string, CompactPerformanceStats> = new Map();
  private readonly MAX_OPERATION_TYPES = 5; // Reduced from 10 to save memory
  private memoryOptimizer = memoryOptimizer;

  /**
   * Singleton pattern implementation
   */
  static getInstance(): UnifiedMetricsService {
    if (!UnifiedMetricsService.instance) {
      UnifiedMetricsService.instance = new UnifiedMetricsService();
    }
    return UnifiedMetricsService.instance;
  }

  /**
   * Private constructor for singleton pattern - Memory optimized
   */
  private constructor() {
    // Initialize compact performance stats - no arrays stored
    this.compactStats = new Map();

    // Setup memory optimization
    this.setupMemoryOptimization();
  }

  /**
   * Setup memory optimization callbacks
   */
  private setupMemoryOptimization(): void {
    // Register cleanup callback for GC events
    this.memoryOptimizer.onGC(() => {
      this.clearOldStats();
    });
  }

  /**
   * Clear old stats when memory pressure occurs
   */
  private clearOldStats(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [operation, stats] of this.compactStats) {
      if (now - stats.lastUpdate > maxAge) {
        this.compactStats.delete(operation);
      }
    }
  }

  // ========================= UTILITY METHODS =========================

  /**
   * Convert period string to date range
   */
  private getDateRangeFromPeriod(period: string = "30d"): DateRange {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return {
      start: startDate.toISOString().split("T")[0] || "",
      end: endDate.toISOString().split("T")[0] || "",
    };
  }

  /**
   * Format KPI value with metadata - Memory optimized with object pooling
   */
  private formatKPIValue(
    value: number,
    previousValue?: number,
    unit?: string,
    customFormat?: (val: number) => string,
  ): KPIValue {
    // Get reusable object from pool
    const kpiObj = this.memoryOptimizer.getKPIValue();

    const displayValue = customFormat
      ? customFormat(value)
      : this.formatNumber(value);

    let changePercentage: number | undefined;
    let trend: "up" | "down" | "stable" | undefined;

    if (previousValue !== undefined && previousValue !== 0) {
      changePercentage = ((value - previousValue) / previousValue) * 100;
      trend =
        changePercentage > 5 ? "up" : changePercentage < -5 ? "down" : "stable";
    }

    // Reuse object instead of creating new one
    kpiObj.value = value;
    kpiObj.display_value = displayValue;
    kpiObj.previous_value = previousValue;
    kpiObj.change_percentage = changePercentage;
    kpiObj.trend = trend;
    kpiObj.unit = unit;
    kpiObj.last_updated = new Date().toISOString();

    // Note: KPI object will be automatically returned to pool when response is sent
    return kpiObj;
  }

  /**
   * Format number for display
   */
  private formatNumber(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + "M";
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + "K";
    }
    return value.toFixed(2);
  }

  /**
   * Format currency for display
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  /**
   * Format percentage for display
   */
  private formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  /**
   * Track performance metrics - Memory optimized with aggregation
   */
  private trackPerformance(
    operation: string,
    duration: number,
    success: boolean,
    error?: string,
  ): void {
    // Check if we're tracking too many operation types
    if (
      this.compactStats.size >= this.MAX_OPERATION_TYPES &&
      !this.compactStats.has(operation)
    ) {
      // Remove least recently used operation type
      let oldestOperation = "";
      let oldestTime = Date.now();
      for (const [op, stats] of this.compactStats) {
        if (stats.lastUpdate < oldestTime) {
          oldestTime = stats.lastUpdate;
          oldestOperation = op;
        }
      }
      if (oldestOperation) {
        this.compactStats.delete(oldestOperation);
      }
    }

    // Get or create compact stats for this operation
    let stats = this.compactStats.get(operation);
    if (!stats) {
      stats = {
        totalRequests: 0,
        successCount: 0,
        avgDuration: 0,
        lastUpdate: Date.now(),
        errorCount: 0,
      };
      this.compactStats.set(operation, stats);
    }

    // Update aggregated stats (no arrays stored)
    stats.totalRequests++;
    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }

    // Update running average duration
    stats.avgDuration =
      (stats.avgDuration * (stats.totalRequests - 1) + duration) /
      stats.totalRequests;
    stats.lastUpdate = Date.now();
  }

  /**
   * Execute database query with performance tracking
   */
  private async executeQuery<T>(
    operation: string,
    queryFn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;

      this.trackPerformance(operation, duration, true);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.trackPerformance(operation, duration, false, errorMessage);

      throw error;
    }
  }

  /**
   * Get tenant information
   */
  private async getTenantInfo(tenantId: string): Promise<TenantInfo> {
    const client = getAdminClient();

    const { data: tenant, error } = await client
      .from("tenants")
      .select("id, name, domain, status, created_at")
      .eq("id", tenantId)
      .single();

    if (error || !tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      domain: (tenant.domain || "other") as BusinessDomain,
      status: (tenant.status || "active") as
        | "active"
        | "inactive"
        | "suspended",
      created_at: tenant.created_at || new Date().toISOString(),
      last_activity: new Date().toISOString(), // TODO: Get from actual last activity
    };
  }

  // ========================= PLATFORM METRICS =========================

  /**
   * Get platform-wide metrics
   */
  async getPlatformMetrics(
    request: PlatformMetricsRequest = {},
  ): Promise<PlatformMetricsResponse> {
    const dateRange =
      request.start_date && request.end_date
        ? { start: request.start_date, end: request.end_date }
        : this.getDateRangeFromPeriod(request.period);

    const client = getAdminClient();

    // Get latest platform metrics using enhanced function
    const platformMetrics = await this.executeQuery(
      "platform_metrics",
      async () => {
        const { data, error } = await (client as any).rpc(
          "calculate_enhanced_platform_metrics",
          {
            p_calculation_date: dateRange.end,
            p_period_days: this.periodToDays(request.period || "30d"),
          },
        );

        if (error) {
          throw new Error(`Failed to fetch platform metrics: ${error.message}`);
        }

        return data?.[0]?.platform_totals || {};
      },
    );

    // Get previous period data for comparisons
    const previousPeriod = this.getPreviousPeriod(
      dateRange,
      request.period || "30d",
    );
    const previousMetrics = await this.executeQuery(
      "previous_platform_metrics",
      async () => {
        const { data, error } = await (client as any).rpc(
          "calculate_enhanced_platform_metrics",
          {
            p_calculation_date: previousPeriod.end,
            p_period_days: this.periodToDays(request.period || "30d"),
          },
        );

        return data?.[0]?.platform_totals || {};
      },
    );

    // Format response
    const response: PlatformMetricsResponse = {
      platform_metrics: {
        mrr: this.formatKPIValue(
          platformMetrics.platform_mrr || 0,
          previousMetrics.platform_mrr || 0,
          "BRL",
          this.formatCurrency,
        ),
        active_tenants: this.formatKPIValue(
          platformMetrics.platform_active_tenants || 0,
          previousMetrics.platform_active_tenants || 0,
          "tenants",
        ),
        total_revenue: this.formatKPIValue(
          platformMetrics.platform_total_revenue || 0,
          previousMetrics.platform_total_revenue || 0,
          "BRL",
          this.formatCurrency,
        ),
        total_appointments: this.formatKPIValue(
          platformMetrics.platform_total_appointments || 0,
          previousMetrics.platform_total_appointments || 0,
          "appointments",
        ),
        total_customers: this.formatKPIValue(
          platformMetrics.platform_total_customers || 0,
          previousMetrics.platform_total_customers || 0,
          "customers",
        ),
        revenue_usage_ratio: this.formatKPIValue(
          platformMetrics.platform_receita_uso_ratio || 0,
          previousMetrics.platform_receita_uso_ratio || 0,
          "ratio",
        ),
        operational_efficiency: this.formatKPIValue(
          platformMetrics.platform_operational_efficiency_pct || 0,
          previousMetrics.platform_operational_efficiency_pct || 0,
          "%",
          this.formatPercentage,
        ),
        spam_rate: this.formatKPIValue(
          platformMetrics.platform_spam_rate_pct || 0,
          previousMetrics.platform_spam_rate_pct || 0,
          "%",
          this.formatPercentage,
        ),
        cancellation_rate: this.formatKPIValue(
          platformMetrics.platform_cancellation_rate_pct || 0,
          previousMetrics.platform_cancellation_rate_pct || 0,
          "%",
          this.formatPercentage,
        ),
        ai_interactions: this.formatKPIValue(
          platformMetrics.platform_total_ai_interactions || 0,
          previousMetrics.platform_total_ai_interactions || 0,
          "interactions",
        ),
      },
      period_comparison: {
        mrr_growth: this.calculateGrowth(
          platformMetrics.platform_mrr || 0,
          previousMetrics.platform_mrr || 0,
        ),
        tenants_growth: this.calculateGrowth(
          platformMetrics.platform_active_tenants || 0,
          previousMetrics.platform_active_tenants || 0,
        ),
        revenue_growth: this.calculateGrowth(
          platformMetrics.platform_total_revenue || 0,
          previousMetrics.platform_total_revenue || 0,
        ),
        appointments_growth: this.calculateGrowth(
          platformMetrics.platform_total_appointments || 0,
          previousMetrics.platform_total_appointments || 0,
        ),
      },
      metadata: {
        period: request.period || "30d",
        last_updated: new Date().toISOString(),
        data_quality: this.calculateDataQuality(platformMetrics),
      },
    };

    // Include charts data if requested
    if (request.include_charts) {
      response.charts_data = await this.getPlatformChartsData(
        dateRange,
        request.period || "30d",
      );
    }

    // Schedule KPI object cleanup after response is sent
    this.scheduleKPICleanup(response);

    return response;
  }

  /**
   * Get platform KPIs for super admin
   */
  async getPlatformKPIs(
    request: PlatformKPIsRequest = {},
  ): Promise<PlatformKPIsResponse> {
    const dateRange =
      request.start_date && request.end_date
        ? { start: request.start_date, end: request.end_date }
        : this.getDateRangeFromPeriod(request.period);

    const client = getAdminClient();

    // Get enhanced platform metrics
    const kpis = await this.executeQuery("platform_kpis", async () => {
      const { data, error } = await (client as any).rpc(
        "calculate_enhanced_platform_metrics",
        {
          p_calculation_date: dateRange.end,
          p_period_days: this.periodToDays(request.period || "30d"),
        },
      );

      if (error) {
        throw new Error(`Failed to calculate platform KPIs: ${error.message}`);
      }

      return data?.[0] || {};
    });

    // Get previous period for trends
    const previousPeriod = this.getPreviousPeriod(
      dateRange,
      request.period || "30d",
    );
    const previousKPIs = await this.executeQuery(
      "previous_platform_kpis",
      async () => {
        const { data, error } = await (client as any).rpc(
          "calculate_enhanced_platform_metrics",
          {
            p_calculation_date: previousPeriod.end,
            p_period_days: this.periodToDays(request.period || "30d"),
          },
        );

        return data?.[0] || {};
      },
    );

    const response: PlatformKPIsResponse = {
      kpis: {
        mrr: this.formatKPIValue(
          kpis.platform_mrr || 0,
          previousKPIs.platform_mrr || 0,
          "BRL",
          this.formatCurrency,
        ),
        active_tenants: this.formatKPIValue(
          kpis.platform_active_tenants || 0,
          previousKPIs.platform_active_tenants || 0,
          "tenants",
        ),
        revenue_usage_ratio: this.formatKPIValue(
          kpis.platform_receita_uso_ratio || 0,
          previousKPIs.platform_receita_uso_ratio || 0,
          "ratio",
        ),
        operational_efficiency: this.formatKPIValue(
          kpis.platform_operational_efficiency_pct || 0,
          previousKPIs.platform_operational_efficiency_pct || 0,
          "%",
          this.formatPercentage,
        ),
        spam_rate: this.formatKPIValue(
          kpis.platform_spam_rate_pct || 0,
          previousKPIs.platform_spam_rate_pct || 0,
          "%",
          this.formatPercentage,
        ),
        total_appointments: this.formatKPIValue(
          kpis.platform_total_appointments || 0,
          previousKPIs.platform_total_appointments || 0,
          "appointments",
        ),
        ai_interactions: this.formatKPIValue(
          kpis.platform_total_ai_interactions || 0,
          previousKPIs.platform_total_ai_interactions || 0,
          "interactions",
        ),
        cancellation_rate: this.formatKPIValue(
          kpis.platform_cancellation_rate_pct || 0,
          previousKPIs.platform_cancellation_rate_pct || 0,
          "%",
          this.formatPercentage,
        ),
        usage_cost: this.formatKPIValue(
          kpis.platform_usage_cost || 0,
          previousKPIs.platform_usage_cost || 0,
          "BRL",
          this.formatCurrency,
        ),
      },
      metadata: {
        calculated_at: new Date().toISOString(),
        data_freshness: this.calculateDataFreshness(kpis),
        calculation_time_ms: this.getAverageResponseTime("platform_kpis"),
      },
    };

    // Include insights if requested
    if (request.include_insights) {
      response.insights = await this.getPlatformInsights(dateRange);
    }

    return response;
  }

  // ========================= TENANT METRICS =========================

  /**
   * Get tenant-specific metrics
   */
  async getTenantMetrics(
    tenantId: string,
    request: TenantMetricsRequest = {},
  ): Promise<TenantMetricsResponse> {
    const dateRange =
      request.start_date && request.end_date
        ? { start: request.start_date, end: request.end_date }
        : this.getDateRangeFromPeriod(request.period);

    const client = getAdminClient();

    // Get tenant info
    const tenantInfo = await this.getTenantInfo(tenantId);

    // Get tenant metrics from UBS system
    const tenantMetrics = await this.executeQuery(
      "tenant_metrics",
      async () => {
        const { data, error } = await (client as any).rpc(
          "get_latest_UBS_metrics_tenant",
          {
            tenant_id: tenantId,
            period_days: this.periodToDays(request.period || "30d"),
            start_date: dateRange.start,
            end_date: dateRange.end,
          },
        );

        if (error) {
          throw new Error(`Failed to fetch tenant metrics: ${error.message}`);
        }

        return data?.[0] || {};
      },
    );

    // Get previous period for comparisons
    const previousPeriod = this.getPreviousPeriod(
      dateRange,
      request.period || "30d",
    );
    const previousMetrics = await this.executeQuery(
      "previous_tenant_metrics",
      async () => {
        const { data, error } = await (client as any).rpc(
          "get_latest_UBS_metrics_tenant",
          {
            tenant_id: tenantId,
            period_days: this.periodToDays(request.period || "30d"),
            start_date: previousPeriod.start,
            end_date: previousPeriod.end,
          },
        );

        return data?.[0] || {};
      },
    );

    const response: TenantMetricsResponse = {
      tenant_info: tenantInfo,
      metrics: {
        revenue: this.formatKPIValue(
          tenantMetrics.tenant_revenue_value || 0,
          previousMetrics.tenant_revenue_value || 0,
          "BRL",
          this.formatCurrency,
        ),
        appointments: this.formatKPIValue(
          tenantMetrics.tenant_appointments_count || 0,
          previousMetrics.tenant_appointments_count || 0,
          "appointments",
        ),
        customers: this.formatKPIValue(
          tenantMetrics.tenant_customers_count || 0,
          previousMetrics.tenant_customers_count || 0,
          "customers",
        ),
        ai_interactions: this.formatKPIValue(
          tenantMetrics.tenant_ai_interactions || 0,
          previousMetrics.tenant_ai_interactions || 0,
          "interactions",
        ),
        chat_duration_avg: this.formatKPIValue(
          tenantMetrics.tenant_avg_chat_duration_minutes || 0,
          previousMetrics.tenant_avg_chat_duration_minutes || 0,
          "minutes",
        ),
        cancellation_rate: this.formatKPIValue(
          tenantMetrics.tenant_cancellation_rate_pct || 0,
          previousMetrics.tenant_cancellation_rate_pct || 0,
          "%",
          this.formatPercentage,
        ),
        spam_detection_score: this.formatKPIValue(
          tenantMetrics.tenant_spam_detection_score || 0,
          previousMetrics.tenant_spam_detection_score || 0,
          "score",
        ),
        conversion_rate: this.formatKPIValue(
          tenantMetrics.tenant_operational_efficiency_pct || 0,
          previousMetrics.tenant_operational_efficiency_pct || 0,
          "%",
          this.formatPercentage,
        ),
      },
      metadata: {
        period: request.period || "30d",
        last_updated: new Date().toISOString(),
        data_completeness: this.calculateDataCompleteness(tenantMetrics),
      },
    };

    // Include charts data if requested
    if (request.include_charts) {
      response.charts_data = await this.getTenantChartsData(
        tenantId,
        dateRange,
        request.period || "30d",
      );
    }

    // Include business intelligence if requested
    if (request.include_business_intelligence) {
      response.business_intelligence = {
        health_score: tenantMetrics.tenant_health_score || 0,
        risk_level: this.calculateRiskLevel(
          tenantMetrics.tenant_health_score || 0,
        ),
        efficiency_score: tenantMetrics.tenant_efficiency_score || 0,
        growth_trend: this.calculateGrowthTrend(tenantMetrics, previousMetrics),
      };
    }

    return response;
  }

  // ========================= HELPER METHODS =========================

  /**
   * Convert period string to number of days
   */
  private periodToDays(period: string): number {
    switch (period) {
      case "7d":
        return 7;
      case "30d":
        return 30;
      case "90d":
        return 90;
      case "1y":
        return 365;
      default:
        return 30;
    }
  }

  /**
   * Get previous period date range
   */
  private getPreviousPeriod(
    currentPeriod: DateRange,
    period: string,
  ): DateRange {
    const days = this.periodToDays(period);
    const startDate = new Date(currentPeriod.start);
    const endDate = new Date(currentPeriod.end);

    startDate.setDate(startDate.getDate() - days);
    endDate.setDate(endDate.getDate() - days);

    return {
      start: startDate.toISOString().split("T")[0] || "",
      end: endDate.toISOString().split("T")[0] || "",
    };
  }

  /**
   * Calculate growth percentage
   */
  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQuality(metrics: any): number {
    let score = 0;
    let totalFields = 0;

    // Check for presence of key fields
    const keyFields = [
      "platform_mrr",
      "platform_active_tenants",
      "platform_total_revenue",
      "platform_total_appointments",
    ];

    keyFields.forEach((field) => {
      totalFields++;
      if (metrics[field] !== undefined && metrics[field] !== null) {
        score++;
      }
    });

    return totalFields > 0 ? (score / totalFields) * 100 : 0;
  }

  /**
   * Calculate data freshness in minutes
   */
  private calculateDataFreshness(metrics: any): number {
    const lastUpdate = metrics.calculation_date || metrics.updated_at;
    if (!lastUpdate) return 999;

    const now = new Date();
    const lastUpdateDate = new Date(lastUpdate);
    return Math.floor((now.getTime() - lastUpdateDate.getTime()) / (1000 * 60));
  }

  /**
   * Calculate data completeness percentage
   */
  private calculateDataCompleteness(metrics: any): number {
    let completedFields = 0;
    let totalFields = 0;

    for (const key in metrics) {
      if (metrics.hasOwnProperty(key)) {
        totalFields++;
        if (
          metrics[key] !== null &&
          metrics[key] !== undefined &&
          metrics[key] !== ""
        ) {
          completedFields++;
        }
      }
    }

    return totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
  }

  /**
   * Calculate risk level based on health score
   */
  private calculateRiskLevel(healthScore: number): "low" | "medium" | "high" {
    if (healthScore >= 80) return "low";
    if (healthScore >= 60) return "medium";
    return "high";
  }

  /**
   * Calculate growth trend
   */
  private calculateGrowthTrend(
    current: any,
    previous: any,
  ): "growing" | "stable" | "declining" {
    const currentRevenue = current.tenant_revenue_value || 0;
    const previousRevenue = previous.tenant_revenue_value || 0;

    const growth = this.calculateGrowth(currentRevenue, previousRevenue);

    if (growth > 10) return "growing";
    if (growth < -10) return "declining";
    return "stable";
  }

  /**
   * Get average response time for operation - Memory optimized
   */
  private getAverageResponseTime(operation: string): number {
    const stats = this.compactStats.get(operation);
    return stats ? Math.round(stats.avgDuration) : 0;
  }

  /**
   * Placeholder for platform charts data
   */
  private async getPlatformChartsData(
    dateRange: DateRange,
    period: string,
  ): Promise<any> {
    // TODO: Implement platform charts data retrieval
    return {
      revenue_trend: [],
      tenant_growth: [],
      domain_distribution: [],
    };
  }

  /**
   * Placeholder for tenant charts data
   */
  private async getTenantChartsData(
    tenantId: string,
    dateRange: DateRange,
    period: string,
  ): Promise<any> {
    // TODO: Implement tenant charts data retrieval
    return {
      revenue_trend: [],
      appointment_status: [],
      customer_growth: [],
    };
  }

  /**
   * Placeholder for platform insights
   */
  private async getPlatformInsights(dateRange: DateRange): Promise<any> {
    // TODO: Implement platform insights calculation
    return {
      distortion_analysis: [],
      upsell_opportunities: [],
    };
  }

  /**
   * Get performance statistics - Memory optimized
   */
  getPerformanceStats(): any {
    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let avgDuration = 0;

    // Aggregate stats from all operations
    for (const stats of this.compactStats.values()) {
      totalRequests += stats.totalRequests;
      totalSuccess += stats.successCount;
      totalErrors += stats.errorCount;
      avgDuration += stats.avgDuration * stats.totalRequests;
    }

    const weightedAvgDuration =
      totalRequests > 0 ? avgDuration / totalRequests : 0;

    return {
      success_rate:
        totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0,
      average_duration: Math.round(weightedAvgDuration),
      total_requests: totalRequests,
      total_errors: totalErrors,
      operations_tracked: this.compactStats.size,
    };
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<StatusResponse> {
    const client = getAdminClient();
    const startTime = Date.now();

    try {
      // Test database connection
      await client.from("tenants").select("count()").limit(1);
      const dbResponseTime = Date.now() - startTime;

      // Get performance stats
      const performanceStats = this.getPerformanceStats();

      // Calculate system health
      const isHealthy =
        performanceStats.success_rate > 95 &&
        performanceStats.average_duration < 1000;

      return {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: dbResponseTime < 500 ? "healthy" : "degraded",
            response_time: dbResponseTime,
            last_check: new Date().toISOString(),
          },
          cache: {
            status: "healthy", // TODO: Implement cache health check
            last_check: new Date().toISOString(),
          },
          cron_jobs: {
            status: "healthy", // TODO: Implement cron health check
            last_check: new Date().toISOString(),
          },
          analytics: {
            status: isHealthy ? "healthy" : "degraded",
            response_time: performanceStats.average_duration,
            last_check: new Date().toISOString(),
          },
        },
        metrics: {
          response_time: performanceStats.average_duration,
          last_calculation: new Date().toISOString(),
          cache_hit_rate: 80, // TODO: Get from cache service
          active_connections: 1, // TODO: Get from connection pool
        },
        system_info: {
          version: "1.0.0",
          environment: process.env.NODE_ENV || "development",
          uptime: process.uptime(),
          memory_usage: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            percentage: Math.round(
              (process.memoryUsage().heapUsed /
                process.memoryUsage().heapTotal) *
                100,
            ),
          },
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: "unhealthy",
            error: error instanceof Error ? error.message : "Unknown error",
            last_check: new Date().toISOString(),
          },
          cache: { status: "unhealthy", last_check: new Date().toISOString() },
          cron_jobs: {
            status: "unhealthy",
            last_check: new Date().toISOString(),
          },
          analytics: {
            status: "unhealthy",
            last_check: new Date().toISOString(),
          },
        },
        metrics: {
          response_time: 0,
          last_calculation: new Date().toISOString(),
          cache_hit_rate: 0,
          active_connections: 0,
        },
        system_info: {
          version: "1.0.0",
          environment: process.env.NODE_ENV || "development",
          uptime: process.uptime(),
          memory_usage: {
            used: 0,
            total: 0,
            percentage: 0,
          },
        },
      };
    }
  }

  /**
   * Schedule cleanup of KPI objects to return them to pool
   */
  private scheduleKPICleanup(response: any): void {
    // Use setTimeout to allow response to be sent first
    setTimeout(() => {
      this.releaseKPIObjectsFromResponse(response);
    }, 100);
  }

  /**
   * Release KPI objects from response back to memory pool
   */
  private releaseKPIObjectsFromResponse(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Check if this is a KPI value object
    if (
      obj.hasOwnProperty("value") &&
      obj.hasOwnProperty("display_value") &&
      obj.hasOwnProperty("last_updated")
    ) {
      this.memoryOptimizer.releaseKPIValue(obj);
      return;
    }

    // Recursively check nested objects
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] && typeof obj[key] === "object") {
        this.releaseKPIObjectsFromResponse(obj[key]);
      }
    }
  }
}

// Export singleton instance
export const unifiedMetricsService = UnifiedMetricsService.getInstance();
