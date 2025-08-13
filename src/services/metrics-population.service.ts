/**
 * Metrics Population Service
 * Context Engineering COLEAM00 - Population of tenant_metrics and platform_metrics tables
 *
 * @fileoverview Populates metrics tables with analyzed data from MetricsAnalysisService
 * @author Context Engineering Implementation
 * @version 1.0.0
 * @since 2025-08-04
 */

import { getAdminClient } from "../config/database";
import {
  MetricsAnalysisService,
  MetricsPeriod,
  AppointmentMetrics,
  ConversationMetrics,
  BillingMetrics,
  ValidationScore,
} from "./metrics-analysis.service";

/**
 * Population result interface
 */
export interface PopulationResult {
  success: boolean;
  tenantId: string;
  period: MetricsPeriod;
  recordsCreated: number;
  recordsUpdated: number;
  validationScore: number;
  processingTime: number;
  errors: string[];
}

/**
 * Platform metrics aggregation result
 */
export interface PlatformPopulationResult {
  success: boolean;
  period: MetricsPeriod;
  totalTenantsProcessed: number;
  platformMetricsUpdated: boolean;
  aggregationScore: number;
  processingTime: number;
  errors: string[];
}

/**
 * Tenant metric data structure for JSONB storage
 */
export interface TenantMetricData {
  // Business Core
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  total_revenue: number;
  total_customers: number;

  // Service Metrics (NEW)
  services_count: number;
  services: string[];

  // Conversation Intelligence
  total_conversations: number;
  billable_conversations: number;
  avg_conversation_duration: number;
  conversation_outcomes: Record<string, number>;

  // Performance KPIs
  appointment_success_rate: number;
  conversion_rate: number;
  customer_recurrence_rate: number;

  // Revenue Intelligence
  current_plan: string;
  plan_price_brl: number;
  revenue_per_conversation: number;

  // Data Quality
  data_completeness_score: number;
  validation_score: number;
  calculation_date: string;
  period_days: number;
}

/**
 * Transaction-safe Metrics Population Service
 */
export class MetricsPopulationService {
  private static instance: MetricsPopulationService;
  private analysisService: MetricsAnalysisService;

  static getInstance(): MetricsPopulationService {
    if (!MetricsPopulationService.instance) {
      MetricsPopulationService.instance = new MetricsPopulationService();
    }
    return MetricsPopulationService.instance;
  }

  constructor() {
    this.analysisService = MetricsAnalysisService.getInstance();
  }

  /**
   * Get period in days for validation
   */
  private getPeriodDays(period: MetricsPeriod): number {
    switch (period) {
      case MetricsPeriod.SEVEN_DAYS:
        return 7;
      case MetricsPeriod.THIRTY_DAYS:
        return 30;
      case MetricsPeriod.NINETY_DAYS:
        return 90;
      default:
        return 30;
    }
  }

  /**
   * Get all active tenant IDs from database
   */
  private async getActiveTenantIds(): Promise<string[]> {
    const supabase = getAdminClient();

    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Failed to fetch active tenants: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return tenants?.map((t) => t.id) || [];
  }

  /**
   * Populate metrics for specific tenant and period
   */
  async populateTenantMetrics(
    tenantId: string,
    period: MetricsPeriod,
  ): Promise<PopulationResult> {
    const startTime = Date.now();
    const supabase = getAdminClient();

    const result: PopulationResult = {
      success: false,
      tenantId,
      period,
      recordsCreated: 0,
      recordsUpdated: 0,
      validationScore: 0,
      processingTime: 0,
      errors: [],
    };

    try {
      // Step 1: Analyze data from source tables
      const [appointmentMetrics, conversationMetrics, billingMetrics] =
        await Promise.all([
          this.analysisService.analyzeAppointments(tenantId, period),
          this.analysisService.analyzeConversations(tenantId, period),
          this.analysisService.analyzeBilling(tenantId, period),
        ]);

      // Step 2: Calculate cross-table consistency validation
      const validationScore =
        await this.analysisService.calculateCrossTableConsistency(
          tenantId,
          period,
          appointmentMetrics,
          conversationMetrics,
          billingMetrics,
        );

      // Step 3: Validate data quality before population
      if (validationScore.overall_score < 70) {
        result.errors.push(
          `Validation score too low: ${validationScore.overall_score}%`,
        );
        result.errors.push(...validationScore.inconsistencies);
        return result;
      }

      // Step 4: Build tenant metric data structure
      const tenantMetricData: TenantMetricData = {
        // Business Core
        total_appointments: appointmentMetrics.total_appointments,
        completed_appointments: appointmentMetrics.completed_appointments,
        cancelled_appointments: appointmentMetrics.cancelled_appointments,
        total_revenue: appointmentMetrics.total_revenue,
        total_customers: appointmentMetrics.total_customers,

        // Service Metrics (NEW)
        services_count: appointmentMetrics.services_count || 0,
        services: appointmentMetrics.services || [],

        // Conversation Intelligence
        total_conversations: conversationMetrics.total_conversations,
        billable_conversations: conversationMetrics.billable_conversations,
        avg_conversation_duration:
          conversationMetrics.avg_conversation_duration,
        conversation_outcomes: conversationMetrics.conversation_outcomes,

        // Performance KPIs
        appointment_success_rate: appointmentMetrics.appointment_success_rate,
        conversion_rate: conversationMetrics.conversion_rate,
        customer_recurrence_rate: appointmentMetrics.customer_recurrence_rate,

        // Revenue Intelligence
        current_plan: billingMetrics.current_plan,
        plan_price_brl: billingMetrics.plan_price_brl,
        revenue_per_conversation: billingMetrics.revenue_per_conversation,

        // Data Quality
        data_completeness_score: appointmentMetrics.data_completeness_score,
        validation_score: validationScore.overall_score,
        calculation_date: new Date().toISOString(),
        period_days: this.getPeriodDays(period),
      };

      // Step 5: Transaction-safe upsert to tenant_metrics
      const { data: existingRecord, error: fetchError } = await supabase
        .from("tenant_metrics")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("metric_type", "business_performance")
        .eq("period", period)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = no rows found
        throw new Error(
          `Failed to check existing metrics: ${fetchError.message}`,
        );
      }

      let upsertResult;
      if (existingRecord) {
        // Update existing record
        upsertResult = await supabase
          .from("tenant_metrics")
          .update({
            metric_data: tenantMetricData as any,
            calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRecord.id);

        if (!upsertResult.error) {
          result.recordsUpdated = 1;
        }
      } else {
        // Insert new record
        upsertResult = await supabase.from("tenant_metrics").insert({
          tenant_id: tenantId,
          metric_type: "business_performance",
          period: period,
          metric_data: tenantMetricData as any,
          calculated_at: new Date().toISOString(),
        });

        if (!upsertResult.error) {
          result.recordsCreated = 1;
        }
      }

      if (upsertResult.error) {
        throw new Error(
          `Failed to upsert tenant metrics: ${upsertResult.error instanceof Error ? upsertResult.error.message : String(upsertResult.error)}`,
        );
      }

      // Step 6: Success result
      result.success = true;
      result.validationScore = validationScore.overall_score;
      result.processingTime = Date.now() - startTime;

      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Populate platform metrics by aggregating all tenant metrics
   */
  async populatePlatformMetrics(
    period: MetricsPeriod,
  ): Promise<PlatformPopulationResult> {
    const startTime = Date.now();
    const supabase = getAdminClient();

    const result: PlatformPopulationResult = {
      success: false,
      period,
      totalTenantsProcessed: 0,
      platformMetricsUpdated: false,
      aggregationScore: 0,
      processingTime: 0,
      errors: [],
    };

    try {
      // Step 1: Get all tenant metrics for the period
      const { data: tenantMetrics, error: fetchError } = await supabase
        .from("tenant_metrics")
        .select(
          `
                    tenant_id,
                    metric_data,
                    calculated_at
                `,
        )
        .eq("metric_type", "business_performance")
        .eq("period", period)
        .order("calculated_at", { ascending: false });

      if (fetchError) {
        throw new Error(
          `Failed to fetch tenant metrics: ${fetchError.message}`,
        );
      }

      if (!tenantMetrics || tenantMetrics.length === 0) {
        result.errors.push("No tenant metrics found for aggregation");
        return result;
      }

      // Step 2: Aggregate tenant metrics into platform totals
      let platformTotalAppointments = 0;
      let platformTotalRevenue = 0;
      let platformTotalCustomers = 0;
      let platformTotalConversations = 0;
      let platformTotalChatMinutes = 0;
      let platformMrr = 0;
      let activeTenants = 0;
      let totalValidationScore = 0;
      let totalSuccessRate = 0;
      let totalConversionRate = 0;

      tenantMetrics.forEach((tm) => {
        const data = tm.metric_data as any as any;

        platformTotalAppointments += data.total_appointments || 0;
        platformTotalRevenue += data.total_revenue || 0;
        platformTotalCustomers += data.total_customers || 0;
        platformTotalConversations += data.total_conversations || 0;
        platformTotalChatMinutes +=
          (data.avg_conversation_duration || 0) *
          (data.total_conversations || 0);
        platformMrr += data.plan_price_brl || 0;
        totalValidationScore += data.validation_score || 0;
        totalSuccessRate += data.appointment_success_rate || 0;
        totalConversionRate += data.conversion_rate || 0;

        if (data.total_conversations > 0) {
          activeTenants++;
        }
      });

      // Step 3: Calculate platform KPIs
      const avgValidationScore =
        tenantMetrics.length > 0
          ? totalValidationScore / tenantMetrics.length
          : 0;
      const operationalEfficiencyPct =
        activeTenants > 0 ? totalSuccessRate / activeTenants : 0;
      const platformConversionRate =
        activeTenants > 0 ? totalConversionRate / activeTenants : 0;
      const receita_uso_ratio =
        platformTotalConversations > 0
          ? platformTotalRevenue / platformTotalConversations
          : 0;

      // Step 4: Upsert platform metrics
      const { data: existingPlatform, error: platformFetchError } =
        await supabase
          .from("platform_metrics")
          .select("id")
          .eq("period", period)
          .single();

      if (platformFetchError && platformFetchError.code !== "PGRST116") {
        throw new Error(
          `Failed to check existing platform metrics: ${platformFetchError.message}`,
        );
      }

      const platformData = {
        calculation_date: new Date().toISOString().split('T')[0] as string,
        period: period,
        data_source: 'tenant_metrics_aggregation',
        comprehensive_metrics: {
          total_appointments: platformTotalAppointments,
          total_customers: platformTotalCustomers,
          total_ai_interactions: platformTotalConversations,
          active_tenants: activeTenants,
          platform_mrr: platformMrr,
          total_chat_minutes: platformTotalChatMinutes,
          total_conversations: platformTotalConversations,
          total_valid_conversations: platformTotalConversations,
          total_spam_conversations: 0,
          operational_efficiency_pct: operationalEfficiencyPct,
          spam_rate_pct: 0,
          cancellation_rate_pct: 0,
          platform_health_score: avgValidationScore,
          platform_avg_clv: platformTotalRevenue / Math.max(platformTotalCustomers, 1),
          platform_avg_conversion_rate: platformConversionRate,
          platform_high_risk_tenants: 0
        },
        participation_metrics: {
          receita_uso_ratio: receita_uso_ratio,
          revenue_usage_distortion_index: 0,
          tenants_above_usage: 0,
          tenants_below_usage: 0
        },
        ranking_metrics: {
          platform_domain_breakdown: {}
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let platformUpsertResult;
      if (existingPlatform) {
        // Update existing platform metrics
        platformUpsertResult = await supabase
          .from("platform_metrics")
          .update({
            ...platformData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPlatform.id);
      } else {
        // Insert new platform metrics
        platformUpsertResult = await supabase
          .from("platform_metrics")
          .insert(platformData);
      }

      if (platformUpsertResult.error) {
        throw new Error(
          `Failed to upsert platform metrics: ${platformUpsertResult.error instanceof Error ? platformUpsertResult.error.message : String(platformUpsertResult.error)}`,
        );
      }

      // Step 5: Success result
      result.success = true;
      result.totalTenantsProcessed = tenantMetrics.length;
      result.platformMetricsUpdated = true;
      result.aggregationScore = avgValidationScore;
      result.processingTime = Date.now() - startTime;

      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Populate metrics for all active tenants for a specific period
   */
  async populateAllTenantMetrics(
    period: MetricsPeriod,
  ): Promise<PopulationResult[]> {
    try {
      const tenantIds = await this.getActiveTenantIds();

      if (tenantIds.length === 0) {
        return [];
      }

      // Process tenants in batches to avoid overwhelming the database
      const batchSize = 10;
      const results: PopulationResult[] = [];

      for (let i = 0; i < tenantIds.length; i += batchSize) {
        const batch = tenantIds.slice(i, i + batchSize);

        const batchPromises = batch.map((tenantId) =>
          this.populateTenantMetrics(tenantId, period),
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to prevent database overload
        if (i + batchSize < tenantIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      return results;
    } catch (error) {
      throw new Error(
        `Failed to populate all tenant metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Full metrics population workflow for a period
   */
  async populateMetricsWorkflow(period: MetricsPeriod): Promise<{
    tenantResults: PopulationResult[];
    platformResult: PlatformPopulationResult;
    summary: {
      totalTenantsProcessed: number;
      successfulTenants: number;
      failedTenants: number;
      avgValidationScore: number;
      totalProcessingTime: number;
    };
  }> {
    const workflowStartTime = Date.now();

    try {
      // Step 1: Populate all tenant metrics
      const tenantResults = await this.populateAllTenantMetrics(period);

      // Step 2: Populate platform metrics (aggregation)
      const platformResult = await this.populatePlatformMetrics(period);

      // Step 3: Calculate summary statistics
      const successfulTenants = tenantResults.filter((r) => r.success).length;
      const failedTenants = tenantResults.filter((r) => !r.success).length;
      const avgValidationScore =
        tenantResults.length > 0
          ? tenantResults.reduce((sum, r) => sum + r.validationScore, 0) /
            tenantResults.length
          : 0;
      const totalProcessingTime = Date.now() - workflowStartTime;

      return {
        tenantResults,
        platformResult,
        summary: {
          totalTenantsProcessed: tenantResults.length,
          successfulTenants,
          failedTenants,
          avgValidationScore,
          totalProcessingTime,
        },
      };
    } catch (error) {
      throw new Error(
        `Metrics population workflow failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
