/**
 * Enhanced Metrics Cron Service - WITH REAL DATABASE INSERTS
 * Replaces the existing service to actually populate database tables
 *
 * @version 3.0.0 - Real Data Implementation
 */

import * as cron from "node-cron";
import { getAdminClient } from "../config/database";

export class MetricsCronEnhancedService {
  private client = getAdminClient();
  private isInitialized = false;

  constructor() {}

  /**
   * Initialize all cron jobs with real database operations
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log("⚠️ Enhanced Metrics Cron Service already initialized");
      return;
    }

    console.log("🚀 Inicializando Enhanced Metrics Cron Service...");

    // Disable ALL cron jobs in development to avoid system instability
    if (process.env.NODE_ENV === "development") {
      console.log(
        "🔧 [DEV] ALL automatic calculations DISABLED for development",
      );
      console.log("🔧 [DEV] Use manual triggers via API instead");
      console.log("🔧 [DEV] Sistema estável - sem processos em background");
      this.isInitialized = true;
      return;
    }

    // Production-only cron jobs
    // Daily SaaS metrics calculation (2:00 AM)
    cron.schedule(
      "0 2 * * *",
      async () => {
        console.log("📊 Calculating daily SaaS metrics...");
        await this.calculateAndStoreSaasMetrics();
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    // Weekly tenant rankings calculation (Monday 3:00 AM)
    cron.schedule(
      "0 3 * * 1",
      async () => {
        console.log("🏆 Calculating weekly tenant rankings...");
        await this.calculateAndStoreTopTenants();
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    // Monthly growth metrics (1st day of month, 4:00 AM)
    cron.schedule(
      "0 4 1 * *",
      async () => {
        console.log("📈 Calculating monthly growth metrics...");
        await this.calculateAndStoreGrowthMetrics();
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    // Risk calculations (Every 6 hours)
    cron.schedule(
      "0 */6 * * *",
      async () => {
        console.log("⚠️ Calculating tenant risk scores...");
        await this.calculateAndStoreRiskScores();
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    // Tenant distribution by domain (Daily at 5:00 AM)
    cron.schedule(
      "0 5 * * *",
      async () => {
        console.log("🌐 Calculating domain distribution...");
        await this.calculateAndStoreDomainDistribution();
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      },
    );

    this.isInitialized = true;
    console.log("✅ Enhanced Metrics Cron Service inicializado com sucesso");
    console.log("📋 Jobs ativos: 5 (production only)");
  }

  /**
   * Calculate and store SaaS metrics in database
   */
  async calculateAndStoreSaasMetrics(): Promise<void> {
    try {
      console.log("📊 [SAAS METRICS] Starting calculation...");

      // Get SaaS metrics using the new function
      const { data: saasData, error: saasError } = await (
        this.client as any
      ).rpc("get_saas_metrics");

      if (saasError) {
        console.error("❌ Error calculating SaaS metrics:", saasError);
        return;
      }

      const metrics = saasData?.[0];
      if (!metrics) {
        console.warn("⚠️ No SaaS metrics data returned");
        return;
      }

      // Insert/update SaaS metrics table
      const { error: insertError } = await (this.client as any)
        .from("saas_metrics")
        .upsert(
          {
            id: "current", // Single row for current metrics
            active_tenants: metrics.active_tenants,
            total_tenants: metrics.total_tenants,
            mrr: metrics.mrr,
            arr: metrics.arr,
            churn_rate: metrics.churn_rate,
            conversion_rate: metrics.conversion_rate,
            total_appointments: metrics.total_appointments,
            total_revenue: metrics.total_revenue,
            ai_interactions: metrics.ai_interactions,
            avg_response_time: metrics.avg_response_time,
            platform_health_score: metrics.platform_health_score,
            calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          },
        );

      if (insertError) {
        console.error("❌ Error storing SaaS metrics:", insertError);
      } else {
        console.log("✅ [SAAS METRICS] Stored successfully");
        console.log(
          `   MRR: R$ ${metrics.mrr}, Active Tenants: ${metrics.active_tenants}`,
        );
      }
    } catch (error) {
      console.error("❌ [SAAS METRICS] Calculation failed:", error);
    }
  }

  /**
   * Calculate and store top tenants ranking
   */
  async calculateAndStoreTopTenants(): Promise<void> {
    try {
      console.log("🏆 [TOP TENANTS] Starting calculation...");

      // Get top tenants for different periods
      const periods = [7, 30, 90];

      for (const period of periods) {
        const { data: tenantsData, error: tenantsError } = await (
          this.client as any
        ).rpc("get_top_tenants", {
          period_days: period,
          limit_count: 20,
        });

        if (tenantsError) {
          console.error(
            `❌ Error calculating top tenants for ${period}d:`,
            tenantsError,
          );
          continue;
        }

        if (!tenantsData || tenantsData.length === 0) {
          console.warn(`⚠️ No tenant data for ${period}d period`);
          continue;
        }

        // Clear existing data for this period
        await (this.client as any)
          .from("top_tenants")
          .delete()
          .eq("period_days", period);

        // Insert new rankings
        const insertData = tenantsData.map((tenant: any) => ({
          tenant_id: tenant.tenant_id,
          tenant_name: tenant.tenant_name,
          business_domain: tenant.business_domain,
          total_revenue: tenant.total_revenue,
          total_appointments: tenant.total_appointments,
          total_customers: tenant.total_customers,
          growth_rate: tenant.growth_rate,
          health_score: tenant.health_score,
          ranking_position: tenant.ranking_position,
          period_days: period,
          calculated_at: new Date().toISOString(),
        }));

        const { error: insertError } = await (this.client as any)
          .from("top_tenants")
          .insert(insertData);

        if (insertError) {
          console.error(
            `❌ Error storing top tenants for ${period}d:`,
            insertError,
          );
        } else {
          console.log(
            `✅ [TOP TENANTS] Stored ${tenantsData.length} tenants for ${period}d period`,
          );
        }
      }
    } catch (error) {
      console.error("❌ [TOP TENANTS] Calculation failed:", error);
    }
  }

  /**
   * Calculate and store growth metrics
   */
  async calculateAndStoreGrowthMetrics(): Promise<void> {
    try {
      console.log("📈 [GROWTH METRICS] Starting calculation...");

      const currentMonth = new Date();
      const previousMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1,
      );
      const currentMonthStart = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1,
      );

      // Calculate current month metrics
      const { data: currentData, error: currentError } = await (
        this.client as any
      ).rpc("get_saas_metrics", {
        start_date: currentMonthStart.toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
      });

      // Calculate previous month metrics
      const { data: previousData, error: previousError } = await (
        this.client as any
      ).rpc("get_saas_metrics", {
        start_date: previousMonth.toISOString().split("T")[0],
        end_date: new Date(currentMonthStart.getTime() - 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });

      if (currentError || previousError) {
        console.error(
          "❌ Error calculating growth metrics:",
          currentError || previousError,
        );
        return;
      }

      const current = currentData?.[0];
      const previous = previousData?.[0];

      if (!current || !previous) {
        console.warn("⚠️ Insufficient data for growth calculation");
        return;
      }

      // Calculate growth rates
      const revenueGrowth =
        previous.total_revenue > 0
          ? ((current.total_revenue - previous.total_revenue) /
              previous.total_revenue) *
            100
          : 0;

      const tenantGrowth =
        previous.active_tenants > 0
          ? ((current.active_tenants - previous.active_tenants) /
              previous.active_tenants) *
            100
          : 0;

      const appointmentGrowth =
        previous.total_appointments > 0
          ? ((current.total_appointments - previous.total_appointments) /
              previous.total_appointments) *
            100
          : 0;

      // Store growth metrics
      const { error: insertError } = await (this.client as any)
        .from("growth_metrics")
        .insert({
          period_start: currentMonthStart.toISOString().split("T")[0],
          period_end: new Date().toISOString().split("T")[0],
          revenue_growth: revenueGrowth,
          tenant_growth: tenantGrowth,
          appointment_growth: appointmentGrowth,
          new_tenants: Math.max(
            0,
            current.active_tenants - previous.active_tenants,
          ),
          churned_tenants: Math.max(
            0,
            previous.active_tenants - current.active_tenants,
          ),
          net_growth: current.active_tenants - previous.active_tenants,
          calculated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("❌ Error storing growth metrics:", insertError);
      } else {
        console.log("✅ [GROWTH METRICS] Stored successfully");
        console.log(`   Revenue Growth: ${revenueGrowth.toFixed(2)}%`);
        console.log(`   Tenant Growth: ${tenantGrowth.toFixed(2)}%`);
      }
    } catch (error) {
      console.error("❌ [GROWTH METRICS] Calculation failed:", error);
    }
  }

  /**
   * Calculate and store tenant risk scores
   */
  async calculateAndStoreRiskScores(): Promise<void> {
    try {
      console.log("⚠️ [RISK SCORES] Starting calculation...");

      // Get all active tenants
      const { data: tenants, error: tenantsError } = await this.client
        .from("tenants")
        .select("id, business_name")
        .eq("status", "active");

      if (tenantsError || !tenants || tenants.length === 0) {
        console.error(
          "❌ Error fetching tenants for risk calculation:",
          tenantsError,
        );
        return;
      }

      console.log(`🔍 Calculating risk for ${tenants.length} tenants...`);

      // Process tenants in batches to avoid overwhelming the database
      const batchSize = 5;
      for (let i = 0; i < tenants.length; i += batchSize) {
        const batch = tenants.slice(i, i + batchSize);

        const riskPromises = batch.map(async (tenant) => {
          try {
            // Calculate risk score for 30d period
            const { data: riskData, error: riskError } = await (
              this.client as any
            ).rpc("calculate_risk_score", {
              p_tenant_id: tenant.id,
              p_period_type: "30d",
            });

            if (riskError || !riskData) {
              console.warn(
                `⚠️ Could not calculate risk for tenant ${tenant.business_name}`,
              );
              return null;
            }

            const riskScore = Array.isArray(riskData) ? riskData[0] : riskData;

            // Determine risk level
            let riskLevel = "low";
            if (riskScore >= 80) riskLevel = "high";
            else if (riskScore >= 60) riskLevel = "medium";
            else if (riskScore >= 40) riskLevel = "moderate";

            return {
              tenant_id: tenant.id,
              tenant_name: tenant.business_name,
              risk_score: riskScore,
              risk_level: riskLevel,
              risk_factors: JSON.stringify({
                calculation_period: "30d",
                last_calculated: new Date().toISOString(),
              }),
              calculated_at: new Date().toISOString(),
            };
          } catch (error) {
            console.error(
              `❌ Error calculating risk for tenant ${tenant.business_name}:`,
              error,
            );
            return null;
          }
        });

        const riskResults = await Promise.all(riskPromises);
        const validResults = riskResults.filter((result) => result !== null);

        if (validResults.length > 0) {
          // Clear existing risk scores for these tenants
          const tenantIds = validResults.map((r) => r!.tenant_id);
          await (this.client as any)
            .from("tenant_risk_scores")
            .delete()
            .in("tenant_id", tenantIds);

          // Insert new risk scores
          const { error: insertError } = await (this.client as any)
            .from("tenant_risk_scores")
            .insert(validResults);

          if (insertError) {
            console.error("❌ Error storing risk scores:", insertError);
          } else {
            console.log(
              `✅ [RISK SCORES] Stored ${validResults.length} risk assessments`,
            );
          }
        }

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("❌ [RISK SCORES] Calculation failed:", error);
    }
  }

  /**
   * Calculate and store domain distribution
   */
  async calculateAndStoreDomainDistribution(): Promise<void> {
    try {
      console.log("🌐 [DOMAIN DISTRIBUTION] Starting calculation...");

      const { data: distributionData, error: distributionError } = await (
        this.client as any
      ).rpc("get_tenant_distribution");

      if (
        distributionError ||
        !distributionData ||
        distributionData.length === 0
      ) {
        console.error(
          "❌ Error calculating domain distribution:",
          distributionError,
        );
        return;
      }

      // Clear existing distribution data
      await (this.client as any)
        .from("tenant_distribution")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      // Insert new distribution data
      const insertData = distributionData.map((domain: any) => ({
        business_domain: domain.business_domain,
        tenant_count: domain.tenant_count,
        revenue_share: domain.revenue_share,
        avg_performance: domain.avg_performance,
        calculated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await (this.client as any)
        .from("tenant_distribution")
        .insert(insertData);

      if (insertError) {
        console.error("❌ Error storing domain distribution:", insertError);
      } else {
        console.log("✅ [DOMAIN DISTRIBUTION] Stored successfully");
        console.log(`   Domains processed: ${distributionData.length}`);
      }
    } catch (error) {
      console.error("❌ [DOMAIN DISTRIBUTION] Calculation failed:", error);
    }
  }

  /**
   * Run all calculations (for manual trigger or development)
   */
  async runAllCalculations(): Promise<void> {
    console.log("🔄 Running all metric calculations...");

    try {
      await Promise.allSettled([
        this.calculateAndStoreSaasMetrics(),
        this.calculateAndStoreTopTenants(),
        this.calculateAndStoreGrowthMetrics(),
        this.calculateAndStoreRiskScores(),
        this.calculateAndStoreDomainDistribution(),
      ]);

      console.log("✅ All metric calculations completed");
    } catch (error) {
      console.error("❌ Error in bulk calculations:", error);
    }
  }

  /**
   * Get calculation status
   */
  async getCalculationStatus(): Promise<any> {
    try {
      const { data: status, error } = await (this.client as any).rpc(
        "get_metrics_calculation_status",
      );

      if (error) {
        console.error("Error getting calculation status:", error);
        return { error: "Failed to get status" };
      }

      return {
        initialized: this.isInitialized,
        last_calculations: status,
        next_scheduled: {
          saas_metrics: "Daily at 2:00 AM",
          top_tenants: "Weekly (Monday) at 3:00 AM",
          growth_metrics: "Monthly (1st day) at 4:00 AM",
          risk_scores: "Every 6 hours",
          domain_distribution: "Daily at 5:00 AM",
        },
      };
    } catch (error) {
      console.error("Error getting calculation status:", error);
      return { error: "Status check failed" };
    }
  }

  /**
   * Manual trigger methods for admin endpoints
   */
  async triggerSaasMetrics(): Promise<void> {
    console.log("🔧 Manual trigger: SaaS Metrics");
    await this.calculateAndStoreSaasMetrics();
  }

  async triggerTopTenants(): Promise<void> {
    console.log("🔧 Manual trigger: Top Tenants");
    await this.calculateAndStoreTopTenants();
  }

  async triggerGrowthMetrics(): Promise<void> {
    console.log("🔧 Manual trigger: Growth Metrics");
    await this.calculateAndStoreGrowthMetrics();
  }

  async triggerRiskScores(): Promise<void> {
    console.log("🔧 Manual trigger: Risk Scores");
    await this.calculateAndStoreRiskScores();
  }

  async triggerDomainDistribution(): Promise<void> {
    console.log("🔧 Manual trigger: Domain Distribution");
    await this.calculateAndStoreDomainDistribution();
  }

  /**
   * Stop all cron jobs
   */
  destroy(): void {
    if (this.isInitialized) {
      console.log("🛑 Stopping Enhanced Metrics Cron Service...");
      this.isInitialized = false;
      console.log("✅ Enhanced Metrics Cron Service stopped");
    }
  }
}

export default MetricsCronEnhancedService;
