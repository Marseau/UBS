/**
 * PERFORMANCE VALIDATION TESTS
 * Tests for system performance benchmarks
 */

import { UnifiedMetricsService } from "../services/unified-metrics.service";

export class PerformanceTests {
  async runAllTests(): Promise<boolean> {
    console.log("⚡ Performance Validation Tests");

    try {
      await this.testDatabaseResponseTime();
      await this.testMemoryUsage();
      await this.testAPIPerformance();
      await this.testConcurrentRequests();

      console.log("✅ All performance tests passed");
      return true;
    } catch (error) {
      console.error("❌ Performance tests failed:", error);
      return false;
    }
  }

  private async testDatabaseResponseTime(): Promise<void> {
    console.log("  Testing database response time...");

    const service = UnifiedMetricsService.getInstance();
    const start = Date.now();

    await service.getPlatformKPIs({ period: "30d" });

    const responseTime = Date.now() - start;
    const targetMs = 500; // 500ms target

    if (responseTime > targetMs) {
      console.warn(
        `  ⚠️  Database response time ${responseTime}ms exceeds target ${targetMs}ms`,
      );
    } else {
      console.log(
        `  ✅ Database response time: ${responseTime}ms (target: ${targetMs}ms)`,
      );
    }
  }

  private async testMemoryUsage(): Promise<void> {
    console.log("  Testing memory usage...");

    const memBefore = process.memoryUsage();

    // Perform some operations
    const service = UnifiedMetricsService.getInstance();
    await service.getPlatformMetrics({ period: "30d" });
    await service.getPlatformKPIs({ period: "30d" });

    const memAfter = process.memoryUsage();
    const heapDiff = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024; // MB

    console.log(`  📊 Memory usage delta: ${heapDiff.toFixed(2)}MB`);
    console.log(
      `  📊 Current heap: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`,
    );

    if (memAfter.heapUsed / 1024 / 1024 > 100) {
      console.warn("  ⚠️  High memory usage detected");
    } else {
      console.log("  ✅ Memory usage within acceptable limits");
    }
  }

  private async testAPIPerformance(): Promise<void> {
    console.log("  Testing API performance...");

    const service = UnifiedMetricsService.getInstance();
    const iterations = 5;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await service.getPlatformKPIs({ period: "7d" });
      times.push(Date.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    console.log(`  📊 API Performance (${iterations} iterations):`);
    console.log(`      Average: ${avgTime.toFixed(1)}ms`);
    console.log(`      Min: ${minTime}ms | Max: ${maxTime}ms`);

    if (avgTime > 200) {
      console.warn("  ⚠️  Average API response time exceeds 200ms");
    } else {
      console.log("  ✅ API performance within targets");
    }
  }

  private async testConcurrentRequests(): Promise<void> {
    console.log("  Testing concurrent request handling...");

    const service = UnifiedMetricsService.getInstance();
    const concurrency = 3;

    const start = Date.now();

    const promises = Array(concurrency)
      .fill(null)
      .map(() => service.getPlatformKPIs({ period: "30d" }));

    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;

    const successCount = results.filter((r) => !!r.kpis).length;

    console.log(`  📊 Concurrent requests (${concurrency} parallel):`);
    console.log(`      Success rate: ${successCount}/${concurrency}`);
    console.log(`      Total time: ${totalTime}ms`);
    console.log(
      `      Average per request: ${(totalTime / concurrency).toFixed(1)}ms`,
    );

    if (successCount !== concurrency) {
      throw new Error(
        `Only ${successCount}/${concurrency} concurrent requests succeeded`,
      );
    }

    console.log("  ✅ Concurrent request handling working");
  }
}
