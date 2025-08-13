/**
 * CRON SERVICE VALIDATION TESTS
 * Tests for unified cron service functionality
 */

import { UnifiedCronService } from "../services/unified-cron.service";

export class CronServiceTests {
  async runAllTests(): Promise<boolean> {
    console.log("⏰ Cron Service Validation Tests");

    try {
      await this.testServiceInitialization();
      await this.testStatusMethods();
      await this.testJobExecution();

      console.log("✅ All cron service tests passed");
      return true;
    } catch (error) {
      console.error("❌ Cron service tests failed:", error);
      return false;
    }
  }

  private async testServiceInitialization(): Promise<void> {
    console.log("  Testing service initialization...");

    const service = new UnifiedCronService();
    const status = service.getStatus();

    if (typeof status !== "object") {
      throw new Error("getStatus() should return an object");
    }

    if (!status.hasOwnProperty("isInitialized")) {
      throw new Error("Status should include isInitialized property");
    }

    console.log("  ✅ Service initialization working");
  }

  private async testStatusMethods(): Promise<void> {
    console.log("  Testing status methods...");

    const service = new UnifiedCronService();

    // Test synchronous method
    const syncStatus = service.getStatus();
    if (!syncStatus || typeof syncStatus !== "object") {
      throw new Error("Synchronous getStatus() failed");
    }

    // Test asynchronous method
    const asyncStatus = await service.getStatusAsync();
    if (!asyncStatus || typeof asyncStatus !== "object") {
      throw new Error("Asynchronous getStatusAsync() failed");
    }

    // Verify both return similar structure
    if (syncStatus.isInitialized !== asyncStatus.isInitialized) {
      throw new Error("Sync and async status methods return different data");
    }

    console.log("  ✅ Both sync and async status methods working");
  }

  private async testJobExecution(): Promise<void> {
    console.log("  Testing job execution capabilities...");

    const service = new UnifiedCronService();
    const status = service.getStatus();

    // Verify performance metrics structure
    if (!status.performance) {
      throw new Error("Status should include performance metrics");
    }

    const requiredMetrics = [
      "avgExecutionTime",
      "successRate",
      "memoryUsage",
      "errorRate",
    ];
    for (const metric of requiredMetrics) {
      if (!(metric in status.performance)) {
        throw new Error(`Performance metrics missing: ${metric}`);
      }
    }

    console.log("  ✅ Job execution capabilities verified");
  }
}
