/**
 * Unified Metrics Service Test Suite
 * Comprehensive tests for the unified metrics service
 *
 * @fileoverview Unit tests and integration tests for UnifiedMetricsService
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import { UnifiedMetricsService } from "./unified-metrics.service";
import { MetricsCacheService } from "../middleware/metrics-cache.middleware";
import { getAdminClient } from "../config/database";

// Mock dependencies
jest.mock("../config/database");
jest.mock("../middleware/metrics-cache.middleware");

const mockClient = {
  from: jest.fn(),
  rpc: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
  limit: jest.fn(),
};

const mockGetAdminClient = getAdminClient as jest.MockedFunction<
  typeof getAdminClient
>;
mockGetAdminClient.mockReturnValue(mockClient as any);

describe("UnifiedMetricsService", () => {
  let service: UnifiedMetricsService;

  beforeEach(() => {
    service = UnifiedMetricsService.getInstance();
    jest.clearAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = UnifiedMetricsService.getInstance();
      const instance2 = UnifiedMetricsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("getPlatformMetrics", () => {
    const mockPlatformData = {
      platform_mrr: 15000,
      platform_active_tenants: 25,
      platform_total_revenue: 50000,
      platform_total_appointments: 500,
      platform_total_customers: 1000,
      platform_receita_uso_ratio: 1.2,
      platform_operational_efficiency_pct: 85,
      platform_spam_rate_pct: 5,
      platform_cancellation_rate_pct: 10,
      platform_total_ai_interactions: 2000,
    };

    beforeEach(() => {
      mockClient.rpc.mockResolvedValue({
        data: [mockPlatformData],
        error: null,
      });
    });

    it("should fetch platform metrics successfully", async () => {
      const request = { period: "30d" as const };
      const result = await service.getPlatformMetrics(request);

      expect(result).toHaveProperty("platform_metrics");
      expect(result.platform_metrics).toHaveProperty("mrr");
      expect(result.platform_metrics.mrr.value).toBe(15000);
      expect(result.platform_metrics.mrr.unit).toBe("BRL");
      expect(result.metadata.period).toBe("30d");
    });

    it("should handle custom date range", async () => {
      const request = {
        start_date: "2024-01-01",
        end_date: "2024-01-31",
      };

      await service.getPlatformMetrics(request);

      expect(mockClient.rpc).toHaveBeenCalledWith(
        "get_latest_UBS_metrics_platform",
        expect.objectContaining({
          start_date: "2024-01-01",
          end_date: "2024-01-31",
        }),
      );
    });

    it("should calculate period comparisons correctly", async () => {
      const previousData = {
        ...mockPlatformData,
        platform_mrr: 12000,
        platform_active_tenants: 20,
      };

      mockClient.rpc
        .mockResolvedValueOnce({ data: [mockPlatformData], error: null })
        .mockResolvedValueOnce({ data: [previousData], error: null });

      const request = { period: "30d" as const };
      const result = await service.getPlatformMetrics(request);

      expect(result.period_comparison.mrr_growth).toBeCloseTo(25, 1); // (15000-12000)/12000 * 100
      expect(result.period_comparison.tenants_growth).toBeCloseTo(25, 1); // (25-20)/20 * 100
    });

    it("should handle database errors gracefully", async () => {
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: "Database connection failed" },
      });

      const request = { period: "30d" as const };

      await expect(service.getPlatformMetrics(request)).rejects.toThrow(
        "Failed to fetch platform metrics: Database connection failed",
      );
    });

    it("should include charts data when requested", async () => {
      const request = {
        period: "30d" as const,
        include_charts: true,
      };

      const result = await service.getPlatformMetrics(request);

      expect(result).toHaveProperty("charts_data");
      expect(result.charts_data).toHaveProperty("revenue_trend");
      expect(result.charts_data).toHaveProperty("tenant_growth");
      expect(result.charts_data).toHaveProperty("domain_distribution");
    });
  });

  describe("getPlatformKPIs", () => {
    const mockKPIData = {
      platform_mrr: 15000,
      platform_active_tenants: 25,
      platform_receita_uso_ratio: 1.2,
      platform_operational_efficiency_pct: 85,
      platform_spam_rate_pct: 5,
      platform_total_appointments: 500,
      platform_total_ai_interactions: 2000,
      platform_cancellation_rate_pct: 10,
      platform_usage_cost: 5000,
    };

    beforeEach(() => {
      mockClient.rpc.mockResolvedValue({ data: [mockKPIData], error: null });
    });

    it("should fetch platform KPIs successfully", async () => {
      const request = { period: "30d" as const };
      const result = await service.getPlatformKPIs(request);

      expect(result).toHaveProperty("kpis");
      expect(result.kpis).toHaveProperty("mrr");
      expect(result.kpis).toHaveProperty("active_tenants");
      expect(result.kpis).toHaveProperty("usage_cost");
      expect(result.kpis.usage_cost.value).toBe(5000);
    });

    it("should include calculation metadata", async () => {
      const request = { period: "30d" as const };
      const result = await service.getPlatformKPIs(request);

      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("calculated_at");
      expect(result.metadata).toHaveProperty("data_freshness");
      expect(result.metadata).toHaveProperty("calculation_time_ms");
    });

    it("should include insights when requested", async () => {
      const request = {
        period: "30d" as const,
        include_insights: true,
      };

      const result = await service.getPlatformKPIs(request);

      expect(result).toHaveProperty("insights");
      expect(result.insights).toHaveProperty("distortion_analysis");
      expect(result.insights).toHaveProperty("upsell_opportunities");
    });
  });

  describe("getTenantMetrics", () => {
    const mockTenantData = {
      tenant_revenue_value: 2500,
      tenant_appointments_count: 50,
      tenant_customers_count: 100,
      tenant_ai_interactions: 200,
      tenant_avg_chat_duration_minutes: 15.5,
      tenant_cancellation_rate_pct: 8,
      tenant_spam_detection_score: 95,
      tenant_conversion_rate_pct: 12,
      tenant_health_score: 85,
      tenant_efficiency_score: 90,
    };

    const mockTenantInfo = {
      id: "tenant-123",
      name: "Test Tenant",
      business_domain: "beauty",
      status: "active",
      created_at: "2024-01-01T00:00:00Z",
    };

    beforeEach(() => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockTenantInfo,
              error: null,
            }),
          }),
        }),
      });

      mockClient.rpc.mockResolvedValue({ data: [mockTenantData], error: null });
    });

    it("should fetch tenant metrics successfully", async () => {
      const result = await service.getTenantMetrics("tenant-123", {
        period: "30d",
      });

      expect(result).toHaveProperty("tenant_info");
      expect(result).toHaveProperty("metrics");
      expect(result.tenant_info.name).toBe("Test Tenant");
      expect(result.metrics.revenue.value).toBe(2500);
      expect(result.metrics.appointments.value).toBe(50);
    });

    it("should handle tenant not found", async () => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Tenant not found" },
            }),
          }),
        }),
      });

      await expect(
        service.getTenantMetrics("invalid-tenant", { period: "30d" }),
      ).rejects.toThrow("Tenant not found: invalid-tenant");
    });

    it("should include business intelligence when requested", async () => {
      const request = {
        period: "30d" as const,
        include_business_intelligence: true,
      };

      const result = await service.getTenantMetrics("tenant-123", request);

      expect(result).toHaveProperty("business_intelligence");
      expect(result.business_intelligence).toHaveProperty("health_score");
      expect(result.business_intelligence).toHaveProperty("risk_level");
      expect(result.business_intelligence).toHaveProperty("efficiency_score");
      expect(result.business_intelligence).toHaveProperty("growth_trend");
    });

    it("should include charts data when requested", async () => {
      const request = {
        period: "30d" as const,
        include_charts: true,
      };

      const result = await service.getTenantMetrics("tenant-123", request);

      expect(result).toHaveProperty("charts_data");
      expect(result.charts_data).toHaveProperty("revenue_trend");
      expect(result.charts_data).toHaveProperty("appointment_status");
      expect(result.charts_data).toHaveProperty("customer_growth");
    });
  });

  describe("Performance Tracking", () => {
    it("should track performance metrics for operations", async () => {
      mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

      await service.getPlatformMetrics({ period: "30d" });

      const stats = service.getPerformanceStats();
      expect(stats).toHaveProperty("success_rate");
      expect(stats).toHaveProperty("average_duration");
      expect(stats).toHaveProperty("total_requests");
      expect(stats.total_requests).toBeGreaterThan(0);
    });

    it("should track failed operations", async () => {
      mockClient.rpc.mockRejectedValue(new Error("Database error"));

      try {
        await service.getPlatformMetrics({ period: "30d" });
      } catch (error) {
        // Expected error
      }

      const stats = service.getPerformanceStats();
      expect(stats.recent_errors).toHaveLength(1);
      expect(stats.recent_errors[0]).toHaveProperty("error");
      expect(stats.recent_errors[0].error).toBe("Database error");
    });
  });

  describe("Health Check", () => {
    it("should return healthy status when all services are working", async () => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: [{}], error: null }),
        }),
      });

      const result = await service.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.services.database.status).toBe("healthy");
      expect(result).toHaveProperty("metrics");
      expect(result).toHaveProperty("system_info");
    });

    it("should return unhealthy status when database is down", async () => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockRejectedValue(new Error("Connection refused")),
        }),
      });

      const result = await service.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.services.database.status).toBe("unhealthy");
      expect(result.services.database.error).toBe("Connection refused");
    });

    it("should include system information", async () => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: [{}], error: null }),
        }),
      });

      const result = await service.healthCheck();

      expect(result.system_info).toHaveProperty("version");
      expect(result.system_info).toHaveProperty("environment");
      expect(result.system_info).toHaveProperty("uptime");
      expect(result.system_info).toHaveProperty("memory_usage");
      expect(result.system_info.memory_usage).toHaveProperty("used");
      expect(result.system_info.memory_usage).toHaveProperty("total");
      expect(result.system_info.memory_usage).toHaveProperty("percentage");
    });
  });

  describe("Utility Methods", () => {
    it("should convert period strings to days correctly", () => {
      // Access private method through reflection for testing
      const periodToDays = (service as any).periodToDays;

      expect(periodToDays("7d")).toBe(7);
      expect(periodToDays("30d")).toBe(30);
      expect(periodToDays("90d")).toBe(90);
      expect(periodToDays("1y")).toBe(365);
      expect(periodToDays("invalid")).toBe(30); // default
    });

    it("should calculate growth percentages correctly", () => {
      const calculateGrowth = (service as any).calculateGrowth;

      expect(calculateGrowth(120, 100)).toBe(20);
      expect(calculateGrowth(80, 100)).toBe(-20);
      expect(calculateGrowth(100, 0)).toBe(100);
      expect(calculateGrowth(0, 100)).toBe(-100);
    });

    it("should format currency values correctly", () => {
      const formatCurrency = (service as any).formatCurrency;

      expect(formatCurrency(1000)).toBe("R$ 1.000,00");
      expect(formatCurrency(1500.5)).toBe("R$ 1.500,50");
    });

    it("should format percentage values correctly", () => {
      const formatPercentage = (service as any).formatPercentage;

      expect(formatPercentage(15.678)).toBe("15.7%");
      expect(formatPercentage(100)).toBe("100.0%");
      expect(formatPercentage(0)).toBe("0.0%");
    });

    it("should calculate risk level based on health score", () => {
      const calculateRiskLevel = (service as any).calculateRiskLevel;

      expect(calculateRiskLevel(85)).toBe("low");
      expect(calculateRiskLevel(70)).toBe("medium");
      expect(calculateRiskLevel(45)).toBe("high");
      expect(calculateRiskLevel(80)).toBe("low");
      expect(calculateRiskLevel(60)).toBe("medium");
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      mockClient.rpc.mockRejectedValue(new Error("Network timeout"));

      await expect(
        service.getPlatformMetrics({ period: "30d" }),
      ).rejects.toThrow("Network timeout");
    });

    it("should handle invalid data gracefully", async () => {
      mockClient.rpc.mockResolvedValue({ data: null, error: null });

      const result = await service.getPlatformMetrics({ period: "30d" });

      expect(result.platform_metrics.mrr.value).toBe(0);
      expect(result.platform_metrics.active_tenants.value).toBe(0);
    });

    it("should handle missing tenant data", async () => {
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "No tenant found" },
            }),
          }),
        }),
      });

      await expect(
        service.getTenantMetrics("nonexistent", { period: "30d" }),
      ).rejects.toThrow("Tenant not found: nonexistent");
    });
  });

  describe("Data Quality", () => {
    it("should calculate data quality scores", () => {
      const calculateDataQuality = (service as any).calculateDataQuality;

      const completeData = {
        platform_mrr: 15000,
        platform_active_tenants: 25,
        platform_total_revenue: 50000,
        platform_total_appointments: 500,
      };

      expect(calculateDataQuality(completeData)).toBe(100);

      const partialData = {
        platform_mrr: 15000,
        platform_active_tenants: null,
        platform_total_revenue: 50000,
        platform_total_appointments: undefined,
      };

      expect(calculateDataQuality(partialData)).toBe(50);
    });

    it("should calculate data completeness", () => {
      const calculateDataCompleteness = (service as any)
        .calculateDataCompleteness;

      const completeData = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      expect(calculateDataCompleteness(completeData)).toBe(100);

      const partialData = {
        field1: "value1",
        field2: null,
        field3: "",
      };

      expect(calculateDataCompleteness(partialData)).toBeCloseTo(33.33, 1);
    });
  });
});

describe("Integration Tests", () => {
  let service: UnifiedMetricsService;

  beforeEach(() => {
    service = UnifiedMetricsService.getInstance();
  });

  describe("Performance Requirements", () => {
    it("should complete platform metrics request within 100ms", async () => {
      const startTime = Date.now();

      mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

      await service.getPlatformMetrics({ period: "30d" });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    it("should handle concurrent requests efficiently", async () => {
      mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

      const requests = Array(10)
        .fill(null)
        .map(() => service.getPlatformMetrics({ period: "30d" }));

      const startTime = Date.now();
      await Promise.all(requests);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // All requests should complete within 1 second
    });
  });

  describe("Memory Usage", () => {
    it("should not cause memory leaks during repeated requests", async () => {
      mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

      const initialMemory = process.memoryUsage().heapUsed;

      // Make 100 requests to test for memory leaks
      for (let i = 0; i < 100; i++) {
        await service.getPlatformMetrics({ period: "30d" });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});

describe("Cache Integration", () => {
  let service: UnifiedMetricsService;
  let cacheService: typeof MetricsCacheService;

  beforeEach(() => {
    service = UnifiedMetricsService.getInstance();
    cacheService = MetricsCacheService;
  });

  it("should respect cache TTL settings", async () => {
    const mockGet = jest.spyOn(cacheService, "get");
    const mockSet = jest.spyOn(cacheService, "set");

    mockGet.mockResolvedValue(null); // Cache miss
    mockSet.mockResolvedValue(undefined);
    mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

    await service.getPlatformMetrics({ period: "30d" });

    expect(mockGet).toHaveBeenCalledWith(
      "platform_metrics",
      expect.any(Object),
    );
    expect(mockSet).toHaveBeenCalledWith(
      "platform_metrics",
      expect.any(Object),
      expect.any(Object),
    );
  });
});

// Performance benchmarks
describe("Performance Benchmarks", () => {
  beforeEach(() => {
    jest.setTimeout(10000); // 10 second timeout for performance tests
  });

  it("should achieve target response times", async () => {
    const service = UnifiedMetricsService.getInstance();
    mockClient.rpc.mockResolvedValue({ data: [{}], error: null });

    const operations = [
      {
        name: "Platform Metrics",
        fn: () => service.getPlatformMetrics({ period: "30d" }),
        target: 100,
      },
      {
        name: "Platform KPIs",
        fn: () => service.getPlatformKPIs({ period: "30d" }),
        target: 100,
      },
      { name: "Health Check", fn: () => service.healthCheck(), target: 50 },
    ];

    for (const operation of operations) {
      const startTime = Date.now();
      await operation.fn();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(operation.target);
      console.log(
        `${operation.name}: ${duration}ms (target: ${operation.target}ms)`,
      );
    }
  });
});

export {};
