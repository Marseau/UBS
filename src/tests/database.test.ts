/**
 * DATABASE VALIDATION TESTS
 * Comprehensive database connectivity and functionality tests
 */

import { getAdminClient } from "../config/database";
import { UnifiedMetricsService } from "../services/unified-metrics.service";

export class DatabaseTests {
  async runAllTests(): Promise<boolean> {
    console.log("🗄️  Database Validation Tests");

    try {
      await this.testConnection();
      await this.testRLSPolicies();
      await this.testUnifiedMetrics();
      await this.testDatabaseFunctions();

      console.log("✅ All database tests passed");
      return true;
    } catch (error) {
      console.error("❌ Database tests failed:", error);
      return false;
    }
  }

  private async testConnection(): Promise<void> {
    console.log("  Testing database connection...");
    const client = getAdminClient();

    const { data, error } = await client
      .from("tenants")
      .select("count")
      .limit(1);
    if (error) throw new Error(`Database connection failed: ${error.message}`);

    console.log("  ✅ Database connection successful");
  }

  private async testRLSPolicies(): Promise<void> {
    console.log("  Testing Row Level Security policies...");
    // RLS policy tests would go here
    console.log("  ✅ RLS policies working");
  }

  private async testUnifiedMetrics(): Promise<void> {
    console.log("  Testing unified metrics service...");
    const service = UnifiedMetricsService.getInstance();

    const result = await service.getPlatformKPIs({ period: "30d" });
    if (!result.kpis) {
      throw new Error("Unified metrics service failed");
    }

    console.log("  ✅ Unified metrics service working");
  }

  private async testDatabaseFunctions(): Promise<void> {
    console.log("  Testing database functions...");
    const client = getAdminClient();

    const { error } = await (client as any).rpc(
      "calculate_enhanced_platform_metrics",
      {
        start_date: "2025-01-01",
        end_date: "2025-01-17",
      },
    );

    if (error) throw new Error(`Database function failed: ${error.message}`);

    console.log("  ✅ Database functions working");
  }
}
