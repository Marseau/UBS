import { Router } from "express";
import { getAdminClient } from "../config/database";
import { MetricsCronService } from "../services/metrics-cron.service";

const router = Router();
const supabase = getAdminClient();

/**
 * Get latest SaaS metrics
 */
router.get("/saas-metrics", async (req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .from("saas_metrics")
      .select("*")
      .order("metric_date", { ascending: false })
      .limit(1);

    if (error) throw error;

    const metrics = data?.[0] || {
      active_tenants: 0,
      total_tenants: 0,
      mrr: 0,
      arr: 0,
      churn_rate: 0,
      conversion_rate: 0,
      avg_revenue_per_tenant: 0,
      total_appointments: 0,
      total_revenue: 0,
      ai_interactions: 0,
    };

    res.json({
      success: true,
      data: {
        activeTenants: metrics.active_tenants,
        totalTenants: metrics.total_tenants,
        mrr: metrics.mrr,
        arr: metrics.arr,
        churnRate: metrics.churn_rate,
        conversionRate: metrics.conversion_rate,
        avgRevenuePerTenant: metrics.avg_revenue_per_tenant,
        totalAppointments: metrics.total_appointments,
        totalRevenue: metrics.total_revenue,
        aiInteractions: metrics.ai_interactions,
        lastUpdated: metrics.calculated_at,
      },
    });
  } catch (error) {
    console.error("Error fetching SaaS metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch SaaS metrics",
    });
  }
});

/**
 * Get SaaS metrics history
 */
router.get("/saas-metrics/history", async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const daysAgo = parseInt(period as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const { data, error } = await (supabase as any)
      .from("saas_metrics")
      .select("*")
      .gte("metric_date", startDate.toISOString().split("T")[0])
      .order("metric_date", { ascending: true });

    if (error) throw error;

    const history =
      data?.map((metric: any) => ({
        date: metric.metric_date,
        activeTenants: metric.active_tenants,
        mrr: metric.mrr,
        churnRate: metric.churn_rate,
        conversionRate: metric.conversion_rate,
        totalRevenue: metric.total_revenue,
        totalAppointments: metric.total_appointments,
        aiInteractions: metric.ai_interactions,
      })) || [];

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching SaaS metrics history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch SaaS metrics history",
    });
  }
});

/**
 * Get tenant distribution (for pie chart)
 */
router.get("/tenant-distribution", async (req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .from("tenant_distribution")
      .select("*")
      .order("metric_date", { ascending: false })
      .limit(10); // Pegar os 10 mais recentes (diferentes domínios)

    if (error) throw error;

    // Agrupar por domínio (pegar o mais recente de cada)
    const distributionMap = new Map();
    data?.forEach((item: any) => {
      if (!distributionMap.has((item as any).business_domain)) {
        distributionMap.set((item as any).business_domain, item);
      }
    });

    const distribution = Array.from(distributionMap.values());

    // Traduzir domínios para português
    const domainTranslations: { [key: string]: string } = {
      beauty: "Beleza",
      healthcare: "Saúde",
      legal: "Jurídico",
      education: "Educação",
      sports: "Esportes",
      consulting: "Consultoria",
    };

    const labels = distribution.map(
      (d: any) =>
        domainTranslations[(d as any).business_domain] ||
        (d as any).business_domain,
    );
    const data_values = distribution.map((d: any) => (d as any).tenant_count);
    const colors = [
      "#2D5A9B",
      "#28a745",
      "#ffc107",
      "#dc3545",
      "#17a2b8",
      "#6f42c1",
    ];

    res.json({
      success: true,
      data: {
        labels,
        datasets: [
          {
            data: data_values,
            backgroundColor: colors.slice(0, labels.length),
          },
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching tenant distribution:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tenant distribution",
    });
  }
});

/**
 * Get tenants at risk
 */
router.get("/tenants-at-risk", async (req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .from("tenant_risk_scores")
      .select(
        `
                *,
                tenants(name, business_domain)
            `,
      )
      .gte("risk_score", 50) // Apenas tenants com risco médio ou alto
      .order("risk_score", { ascending: false })
      .limit(20);

    if (error) throw error;

    const atRiskTenants =
      data?.map((tenant: any) => ({
        name: (tenant.tenants as any)?.name || "Unknown",
        domain: (tenant.tenants as any)?.business_domain || "other",
        lastActivity: (tenant as any).calculated_at,
        riskScore: (tenant as any).risk_score,
        status: (tenant as any).risk_status,
        factors: (tenant as any).risk_factors,
        recommendations: (tenant as any).risk_factors?.recommendations || [],
      })) || [];

    res.json({
      success: true,
      data: atRiskTenants,
    });
  } catch (error) {
    console.error("Error fetching tenants at risk:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tenants at risk",
    });
  }
});

/**
 * Get top performing tenants
 */
router.get("/top-tenants", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { data, error } = await (supabase as any)
      .from("top_tenants")
      .select(
        `
                *,
                tenants(name, business_domain)
            `,
      )
      .order("rank_position", { ascending: true })
      .limit(parseInt(limit as string));

    if (error) throw error;

    const topTenants =
      data?.map((tenant: any) => ({
        name: (tenant.tenants as any)?.name || "Unknown",
        domain: (tenant.tenants as any)?.business_domain || "other",
        revenue: (tenant as any).revenue,
        growthRate: (tenant as any).growth_rate,
        appointmentCount: (tenant as any).appointment_count,
        rankPosition: (tenant as any).rank_position,
      })) || [];

    res.json({
      success: true,
      data: topTenants,
    });
  } catch (error) {
    console.error("Error fetching top tenants:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch top tenants",
    });
  }
});

/**
 * Get growth metrics
 */
router.get("/growth-metrics", async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const { data, error } = await (supabase as any)
      .from("growth_metrics")
      .select("*")
      .order("metric_month", { ascending: false })
      .limit(parseInt(months as string));

    if (error) throw error;

    const growthMetrics =
      data?.map((metric: any) => ({
        month: (metric as any).metric_month,
        newTenants: (metric as any).new_tenants,
        churnedTenants: (metric as any).churned_tenants,
        revenueGrowth: (metric as any).revenue_growth,
        customerGrowth: (metric as any).customer_growth,
        mrrGrowth: (metric as any).mrr_growth,
        platformHealthScore: (metric as any).platform_health_score,
      })) || [];

    res.json({
      success: true,
      data: growthMetrics.reverse(), // Ordem cronológica
    });
  } catch (error) {
    console.error("Error fetching growth metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch growth metrics",
    });
  }
});

/**
 * Get conversion metrics
 */
router.get("/conversion-metrics", async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const daysAgo = parseInt(period as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const { data, error } = await (supabase as any)
      .from("conversion_metrics")
      .select(
        `
                *,
                tenants(name, business_domain)
            `,
      )
      .gte("metric_date", startDate.toISOString().split("T")[0])
      .order("metric_date", { ascending: true });

    if (error) throw error;

    // Agrupar por tenant e calcular médias
    const tenantMetrics = new Map();

    data?.forEach((metric: any) => {
      const tenantId = metric.tenant_id;
      if (!tenantMetrics.has(tenantId)) {
        tenantMetrics.set(tenantId, {
          name: (metric.tenants as any)?.name || "Unknown",
          domain: (metric.tenants as any)?.business_domain || "other",
          totalLeads: 0,
          totalAppointments: 0,
          totalCompleted: 0,
          conversionRate: 0,
          completionRate: 0,
          records: [],
        });
      }

      const tenant = tenantMetrics.get(tenantId);
      (tenant as any).totalLeads += (metric as any).leads_generated;
      (tenant as any).totalAppointments += (metric as any).appointments_booked;
      (tenant as any).totalCompleted += (metric as any).appointments_completed;
      (tenant as any).records.push(metric);
    });

    // Calcular métricas finais
    const conversionMetrics = Array.from(tenantMetrics.values()).map(
      (tenant: any) => ({
        ...tenant,
        conversionRate:
          tenant.totalLeads > 0
            ? (tenant.totalAppointments / tenant.totalLeads) * 100
            : 0,
        completionRate:
          tenant.totalAppointments > 0
            ? (tenant.totalCompleted / tenant.totalAppointments) * 100
            : 0,
      }),
    );

    res.json({
      success: true,
      data: conversionMetrics,
    });
  } catch (error) {
    console.error("Error fetching conversion metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch conversion metrics",
    });
  }
});

/**
 * Get platform health score
 */
router.get("/platform-health", async (req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .from("growth_metrics")
      .select("platform_health_score, metric_month")
      .order("metric_month", { ascending: false })
      .limit(1);

    if (error) throw error;

    const healthScore = (data as any)?.[0]?.platform_health_score || 75;
    const lastUpdated = (data as any)?.[0]?.metric_month;

    let status = "Saudável";
    if (healthScore < 50) status = "Crítico";
    else if (healthScore < 70) status = "Atenção";
    else if (healthScore < 85) status = "Bom";

    res.json({
      success: true,
      data: {
        score: healthScore,
        status,
        lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error fetching platform health:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch platform health",
    });
  }
});

/**
 * Trigger manual calculation
 */
router.post("/calculate/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ["daily", "weekly", "monthly", "risk"];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid calculation type",
      });
    }

    // Assumindo que o MetricsCronService está disponível globalmente
    const { MetricsCronService } = await import(
      "../services/metrics-cron.service"
    );
    const cronService = new MetricsCronService();

    await cronService.runManualCalculation(
      type as "daily" | "weekly" | "monthly" | "risk",
    );

    return res.json({
      success: true,
      message: `${type} calculation completed successfully`,
    });
  } catch (error) {
    console.error("Error running manual calculation:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to run manual calculation",
    });
  }
});

/**
 * Get metrics calculation status
 */
router.get("/status", async (req, res) => {
  try {
    // Verificar últimas atualizações de cada tipo de métrica
    const [saasMetrics, riskScores, distribution, growth] = await Promise.all([
      (supabase as any)
        .from("saas_metrics")
        .select("calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("tenant_risk_scores")
        .select("calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("tenant_distribution")
        .select("calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("growth_metrics")
        .select("calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1),
    ]);

    const status = {
      saasMetrics: {
        lastUpdated: (saasMetrics.data as any)?.[0]?.calculated_at || null,
        status: (saasMetrics.data as any)?.[0] ? "healthy" : "missing",
      },
      riskScores: {
        lastUpdated: (riskScores.data as any)?.[0]?.calculated_at || null,
        status: (riskScores.data as any)?.[0] ? "healthy" : "missing",
      },
      tenantDistribution: {
        lastUpdated: (distribution.data as any)?.[0]?.calculated_at || null,
        status: (distribution.data as any)?.[0] ? "healthy" : "missing",
      },
      growthMetrics: {
        lastUpdated: (growth.data as any)?.[0]?.calculated_at || null,
        status: (growth.data as any)?.[0] ? "healthy" : "missing",
      },
    };

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("Error fetching metrics status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch metrics status",
    });
  }
});

export default router;
