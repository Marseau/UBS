/**
 * TENANT-PLATFORM APIs CONSOLIDADAS
 * Rotas padronizadas para /api/tenant-platform/
 *
 * Implementa todas as APIs necessárias para o dashboard Tenant/Platform
 * conforme especificado no MASTER_INTEGRATION_DASHBOARD_TENANT_PLATAFORMA.md
 */

import { Router, Request, Response } from "express";
import { getAdminClient } from "../config/database";
import {
  getAdminClientExtended,
  getLatestMetrics,
  getTenantRankings,
} from "../config/database-extended";
import {
  UBSMetricSystem,
  PlatformMetrics,
  TenantMetrics,
} from "../types/ubs-metric-system.types";

const router = Router();

// Middleware para log de requests
router.use((req, res, next) => {
  console.log(
    `[Tenant-Platform API] ${req.method} ${req.path} - ${new Date().toISOString()}`,
  );
  next();
});

// =====================================================
// 1. MÉTRICAS PRINCIPAIS DO TENANT
// =====================================================

/**
 * GET /api/tenant-platform/tenant/:tenantId/metrics
 * Retorna métricas de participação do tenant na plataforma
 */
router.get(
  "/tenant/:tenantId/metrics",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { tenantId } = req.params;
      const { period = "30" } = req.query;

      const client = getAdminClient();

      // Buscar métricas do tenant da tabela tenant_metrics (JSONB)
      const { data: tenantMetrics, error: tenantError } = await (client as any)
        .from("tenant_metrics")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("period", `${period}d`)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .single();

      if (tenantError && tenantError.code !== "PGRST116") {
        console.error("Erro ao buscar métricas do tenant:", tenantError);
        return res.status(500).json({
          success: false,
          error: "Erro ao buscar métricas do tenant",
          details: tenantError.message,
        });
      }

      // Parse JSONB data or create default structure
      const metrics = tenantMetrics?.metric_data || {
        revenue: { participation_pct: 0, participation_value: 79.9 },
        appointments: { participation_pct: 0, count: 0 },
        customers: { participation_pct: 0, count: 0 },
        ai_interactions: { participation_pct: 0, count: 0 },
        ranking: { position: 0, category: "Standard", percentile: 0 },
        business_intelligence: { risk_score: 0, risk_status: "Unknown" },
      };

      // Obter info do tenant
      const { data: tenantInfo, error: infoError } = await client
        .from("tenants")
        .select("business_name, domain, created_at")
        .eq("id", tenantId as string)
        .single();

      if (infoError) {
        console.error("Erro ao buscar info do tenant:", infoError);
        return res.status(404).json({
          success: false,
          error: "Tenant não encontrado",
        });
      }

      return res.json({
        success: true,
        data: {
          tenant: {
            id: tenantId,
            name: tenantInfo?.business_name || "Unknown",
            domain: tenantInfo?.domain || "N/A",
            created_at: tenantInfo?.created_at || new Date().toISOString(),
          },
          metrics: {
            revenue: {
              participation_pct: metrics.revenue?.participation_pct || 0,
              participation_value: metrics.revenue?.participation_value || 79.9,
            },
            appointments: {
              participation_pct: metrics.appointments?.participation_pct || 0,
              count: metrics.appointments?.count || 0,
            },
            customers: {
              participation_pct: metrics.customers?.participation_pct || 0,
              count: metrics.customers?.count || 0,
            },
            ai_interactions: {
              participation_pct:
                metrics.ai_interactions?.participation_pct || 0,
              count: metrics.ai_interactions?.count || 0,
            },
            ranking: {
              position: metrics.ranking?.position || 0,
              category: metrics.ranking?.category || "Standard",
              percentile: metrics.ranking?.percentile || 0,
            },
            business_intelligence: {
              risk_score: metrics.business_intelligence?.risk_score || 0,
              risk_status:
                metrics.business_intelligence?.risk_status || "Unknown",
              efficiency_score:
                metrics.business_intelligence?.efficiency_score || 0,
              conversion_rate:
                metrics.business_intelligence?.conversion_rate || 0,
            },
          },
          period_days: parseInt(period as string),
          last_updated: tenantMetrics?.calculated_at || null,
          platform_totals: {
            revenue: 0, // Will be filled from platform_metrics
            appointments: 0,
            customers: 0,
            mrr: 0,
          },
        },
      });
    } catch (error) {
      console.error("Erro na API de métricas do tenant:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  },
);

// =====================================================
// 2. MÉTRICAS DA PLATAFORMA
// =====================================================

/**
 * GET /api/tenant-platform/platform/metrics
 * Retorna métricas totais da plataforma
 */
router.get(
  "/platform/metrics",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { period = "30" } = req.query;

      const client = getAdminClient();

      // Buscar dados mais recentes da plataforma da tabela platform_metrics
      const { data: platformMetrics, error: platformError } = await (
        client as any
      )
        .from("platform_metrics")
        .select("*")
        .eq("period_days", parseInt(period as string))
        .order("calculation_date", { ascending: false })
        .limit(1)
        .single();

      if (platformError) {
        console.error("Erro ao buscar métricas da plataforma:", platformError);
        return res.status(500).json({
          success: false,
          error: "Erro ao buscar métricas da plataforma",
          details: platformError.message,
        });
      }

      const metrics = platformMetrics || {};

      return res.json({
        success: true,
        data: {
          platform: {
            total_revenue: metrics.total_revenue || 0,
            total_appointments: metrics.total_appointments || 0,
            total_customers: metrics.total_customers || 0,
            total_ai_interactions: metrics.total_ai_interactions || 0,
            total_active_tenants: metrics.active_tenants || 0,
            averages: {
              revenue_per_tenant:
                (metrics.total_revenue || 0) / (metrics.active_tenants || 1),
              appointments_per_tenant:
                (metrics.total_appointments || 0) /
                (metrics.active_tenants || 1),
            },
            strategic_metrics: {
              mrr: metrics.platform_mrr || 0,
              receita_uso_ratio: metrics.receita_uso_ratio || 0,
              operational_efficiency_pct:
                metrics.operational_efficiency_pct || 0,
              spam_rate_pct: metrics.spam_rate_pct || 0,
              total_chat_minutes: metrics.total_chat_minutes || 0,
            },
          },
          period_days: parseInt(period as string),
          calculation_date: metrics.calculation_date,
        },
      });
    } catch (error) {
      console.error("Erro na API de métricas da plataforma:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  },
);

// =====================================================
// 3. COMPARAÇÃO TENANT VS PLATAFORMA
// =====================================================

/**
 * GET /api/tenant-platform/comparison/:tenantId
 * Retorna comparação detalhada entre tenant e plataforma
 */
router.get(
  "/comparison/:tenantId",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { tenantId } = req.params;
      const { period = "30" } = req.query;

      // Buscar métricas do tenant e da plataforma diretamente (evitar fetch interno)
      const client = getAdminClientExtended();

      // Buscar dados mais recentes da tabela ubs_metric_system
      const [tenantResult, platformResult] = await Promise.all([
        getLatestMetrics(client, {
          tenantId: tenantId as string,
          periodDays: parseInt((period as string) || "30"),
        }),
        getLatestMetrics(client, {
          periodDays: parseInt((period as string) || "30"),
        }),
      ]);

      const tenantData = {
        success: !tenantResult.error,
        data: tenantResult.data
          ? {
              tenant: { id: tenantId, name: "Tenant", domain: "N/A" },
              metrics: tenantResult.data,
            }
          : null,
      };

      const platformData = {
        success: !platformResult.error,
        data: platformResult.data
          ? {
              platform: platformResult.data,
            }
          : null,
      };

      if (!tenantData.success || !platformData.success) {
        return res.status(500).json({
          success: false,
          error: "Erro ao buscar dados para comparação",
        });
      }

      const tenant = (tenantData.data as any) || {};
      const platform = (platformData.data as any) || {};

      return res.json({
        success: true,
        data: {
          tenant_info: tenant?.tenant || { id: tenantId, name: "Unknown" },
          comparison: {
            revenue: {
              tenant_value: tenant?.metrics?.tenant_revenue_value || 0,
              platform_total: platform?.platform?.platform_total_revenue || 0,
              participation_pct:
                tenant?.metrics?.tenant_revenue_participation_pct || 0,
              ranking_vs_average:
                (tenant?.metrics?.tenant_revenue_value || 0) >
                (platform?.platform?.platform_total_revenue || 0) /
                  (platform?.platform?.platform_active_tenants || 1)
                  ? "above"
                  : "below",
            },
            appointments: {
              tenant_count: tenant?.metrics?.tenant_appointments_count || 0,
              platform_total:
                platform?.platform?.platform_total_appointments || 0,
              participation_pct:
                tenant?.metrics?.tenant_appointments_participation_pct || 0,
              ranking_vs_average:
                (tenant?.metrics?.tenant_appointments_count || 0) >
                (platform?.platform?.platform_total_appointments || 0) /
                  (platform?.platform?.platform_active_tenants || 1)
                  ? "above"
                  : "below",
            },
            customers: {
              tenant_count: tenant?.metrics?.tenant_customers_count || 0,
              platform_total: platform?.platform?.platform_total_customers || 0,
              participation_pct:
                tenant?.metrics?.tenant_customers_participation_pct || 0,
            },
            ai_interactions: {
              tenant_count: tenant?.metrics?.tenant_ai_interactions || 0,
              platform_total:
                platform?.platform?.platform_total_ai_interactions || 0,
              participation_pct:
                tenant?.metrics?.tenant_ai_participation_pct || 0,
            },
          },
          performance: {
            ranking: tenant?.metrics?.ranking || {},
            business_intelligence: tenant?.metrics?.business_intelligence || {},
          },
          period_days: parseInt((period as string) || "30"),
        },
      });
    } catch (error) {
      console.error("Erro na API de comparação:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  },
);

// =====================================================
// 4. RANKINGS DA PLATAFORMA
// =====================================================

/**
 * GET /api/tenant-platform/rankings
 * Retorna rankings de tenants na plataforma
 */
router.get("/rankings", async (req: Request, res: Response): Promise<any> => {
  try {
    const { period = "30", limit = "10" } = req.query;

    const client = getAdminClient();

    // Buscar participation data da nova tabela tenant_metrics
    const { data: rankingRecords, error: rankingError } = await (client as any)
      .from("tenant_metrics")
      .select(
        `
                tenant_id,
                metric_data,
                calculated_at
            `,
      )
      .eq("metric_type", "participation")
      .eq("period", `${period}d`)
      .order("calculated_at", { ascending: false })
      .limit(parseInt(limit as string));

    // Buscar dados dos tenants separadamente
    let tenantNames: any = {};
    if (rankingRecords && rankingRecords.length > 0) {
      const tenantIds = rankingRecords.map((r: any) => r.tenant_id);
      const { data: tenantsData } = await (client as any)
        .from("tenants")
        .select("id, business_name, domain")
        .in("id", tenantIds);

      tenantNames = (tenantsData || []).reduce((acc: any, tenant: any) => {
        acc[tenant.id] = {
          business_name: tenant.business_name,
          domain: tenant.domain,
        };
        return acc;
      }, {});
    }

    if (rankingError) {
      console.error("Erro ao buscar rankings:", rankingError);
      return res.status(500).json({
        success: false,
        error: "Erro ao buscar rankings",
        details: rankingError.message,
      });
    }

    const formattedRankings = (rankingRecords || [])
      .map((record: any, index: number) => {
        const metricData = record.metric_data || {};
        const tenantInfo = tenantNames[record.tenant_id] || {};

        const businessIntel = metricData.business_intelligence || {};
        const revenueData = metricData.revenue || {};
        const appointmentsData = metricData.appointments || {};

        return {
          position: index + 1,
          tenant_id: record.tenant_id,
          tenant_name: tenantInfo.business_name || "Unknown",
          domain: tenantInfo.domain || "business",
          revenue_value: revenueData.participation_value || 79.9,
          revenue_participation: revenueData.participation_pct || 0,
          appointments_count: appointmentsData.count || 0,
          health_score:
            businessIntel.efficiency_score ||
            Math.round(Math.random() * 40 + 60),
          risk_level: businessIntel.risk_status || "Medium Risk",
        };
      })
      .sort(
        (a: any, b: any) => b.revenue_participation - a.revenue_participation,
      );

    return res.json({
      success: true,
      data: {
        rankings: formattedRankings,
        total_shown: formattedRankings.length,
        period_days: parseInt(period as string),
      },
    });
  } catch (error) {
    console.error("Erro na API de rankings:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
    });
  }
});

// =====================================================
// 5. CÁLCULO E ATUALIZAÇÃO DE MÉTRICAS
// =====================================================

/**
 * POST /api/tenant-platform/calculate
 * Recalcula métricas para um tenant específico ou todos
 */
router.post("/calculate", async (req: Request, res: Response): Promise<any> => {
  try {
    const { tenant_id, calculation_date, period_days = 30 } = req.body;

    const client = getAdminClient();

    // Usar a função corrigida
    const { data: result, error: calcError } = await (client as any).rpc(
      "calculate_metrics_final_corrected",
      {
        p_calculation_date:
          calculation_date || new Date().toISOString().split("T")[0],
        p_period_days: parseInt(period_days),
        p_tenant_id: tenant_id || null,
      },
    );

    if (calcError) {
      console.error("Erro no cálculo de métricas:", calcError);
      return res.status(500).json({
        success: false,
        error: "Erro no cálculo de métricas",
        details: calcError.message,
      });
    }

    const calcResult = result || {};

    return res.json({
      success: true,
      data: {
        calculation: {
          processed_tenants: calcResult.processed_tenants || 0,
          total_revenue: calcResult.platform_totals?.total_revenue || 0,
          total_appointments:
            calcResult.platform_totals?.total_appointments || 0,
          execution_time_ms: calcResult.execution_time_ms || 0,
          success: calcResult.success || false,
          platform_mrr: calcResult.platform_totals?.platform_mrr || 0,
        },
        timestamp: new Date().toISOString(),
        scope: tenant_id ? "single_tenant" : "all_tenants",
      },
    });
  } catch (error) {
    console.error("Erro na API de cálculo:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
    });
  }
});

// =====================================================
// 6. STATUS E SAÚDE DO SISTEMA
// =====================================================

/**
 * GET /api/tenant-platform/status
 * Retorna status do sistema tenant-platform
 */
router.get("/status", async (req: Request, res: Response): Promise<any> => {
  try {
    const client = getAdminClient();

    // Verificar se as tabelas existem e têm dados
    const { count: platformCount } = await (client as any)
      .from("platform_metrics")
      .select("*", { count: "exact", head: true });

    const { count: tenantCount } = await (client as any)
      .from("tenant_metrics")
      .select("*", { count: "exact", head: true });

    // Verificar data da última atualização na tabela platform_metrics
    const { data: lastUpdate } = await (client as any)
      .from("platform_metrics")
      .select("calculation_date")
      .order("calculation_date", { ascending: false })
      .limit(1)
      .single();

    const lastUpdateTime = lastUpdate?.calculation_date;
    const isRecent = lastUpdateTime
      ? new Date().getTime() - new Date(lastUpdateTime).getTime() <
        24 * 60 * 60 * 1000
      : false;

    return res.json({
      success: true,
      data: {
        system_status: "operational",
        data_availability: {
          platform_metrics: platformCount || 0,
          tenant_metrics: tenantCount || 0,
        },
        data_freshness: {
          last_calculation: lastUpdateTime,
          is_recent: isRecent,
          staleness_hours: lastUpdateTime
            ? Math.round(
                (new Date().getTime() - new Date(lastUpdateTime).getTime()) /
                  (60 * 60 * 1000),
              )
            : null,
        },
        api_version: "1.0.0",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro na API de status:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
    });
  }
});

// =====================================================
// 7. LISTA DE TENANTS DISPONÍVEIS
// =====================================================

/**
 * GET /api/tenant-platform/tenants
 * Retorna lista de tenants disponíveis para análise (baseado em admin_users)
 */
router.get("/tenants", async (req: Request, res: Response): Promise<any> => {
  try {
    const client = getAdminClient();

    // Buscar tenants reais da tabela tenants (usando client genérico)
    const { data: tenants, error: tenantsError } = await (client as any)
      .from("tenants")
      .select("id, name, business_name, email, domain, created_at")
      .order("name");

    if (tenantsError) {
      console.error("Erro ao buscar tenants:", tenantsError);
      return res.status(500).json({
        success: false,
        error: "Erro ao buscar tenants",
        details: tenantsError.message,
      });
    }

    // Buscar métricas para cada tenant da tabela tenant_metrics (JSONB)
    const { data: metrics, error: metricsError } = await (client as any)
      .from("tenant_metrics")
      .select("tenant_id, metric_data, calculated_at")
      .eq("period", "30d")
      .eq("metric_type", "participation");

    return res.json({
      success: true,
      data: {
        tenants: (tenants || []).map((tenant: any) => {
          const tenantMetrics = metrics?.find(
            (m: any) => m.tenant_id === tenant.id,
          );
          const metricData = tenantMetrics?.metric_data || {};

          return {
            id: tenant.id,
            name: tenant.business_name || tenant.name,
            admin_name: `Admin ${tenant.name}`,
            admin_email: tenant.email,
            domain: tenant.domain || "business",
            created_at: tenant.created_at,
            has_metrics: !!tenantMetrics,
            last_revenue: metricData.revenue?.participation_value || 79.9,
            last_ranking: metricData.ranking?.position || 0,
            participation_pct: metricData.revenue?.participation_pct || 0,
            last_updated: tenantMetrics?.calculated_at || null,
          };
        }),
        total_count: tenants?.length || 0,
        last_updated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro na API de tenants:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
    });
  }
});

// =====================================================
// 8. TRIGGERS MANUAIS PARA CRON JOBS (DEV/DEBUG)
// =====================================================

/**
 * POST /api/tenant-platform/trigger-cron
 * Triggers manuais para jobs de cron (desenvolvimento)
 */
router.post(
  "/trigger-cron",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { job_type = "all" } = req.body;

      // Import do serviço de cron
      const { tenantPlatformCronService } = await import(
        "../services/tenant-platform-cron.service"
      );

      let result;

      switch (job_type) {
        case "daily-metrics":
          result = await tenantPlatformCronService.triggerDailyMetrics();
          break;
        case "weekly-aggregates":
          result = await tenantPlatformCronService.triggerWeeklyAggregates();
          break;
        case "cache-cleanup":
          result = await tenantPlatformCronService.triggerCacheCleanup();
          break;
        case "all":
          result = await tenantPlatformCronService.triggerAll();
          break;
        default:
          return res.status(400).json({
            success: false,
            error: "Tipo de job inválido",
            valid_types: [
              "daily-metrics",
              "weekly-aggregates",
              "cache-cleanup",
              "all",
            ],
          });
      }

      return res.json({
        success: true,
        data: {
          trigger_result: result,
          job_type: job_type,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || "unknown",
        },
      });
    } catch (error) {
      console.error("Erro no trigger manual de cron:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  },
);

/**
 * GET /api/tenant-platform/cron-status
 * Status do serviço de cron jobs
 */
router.get(
  "/cron-status",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { tenantPlatformCronService } = await import(
        "../services/tenant-platform-cron.service"
      );

      const status = tenantPlatformCronService.getStatus();

      return res.json({
        success: true,
        data: {
          cron_service: status,
          api_endpoints: {
            manual_trigger: "POST /api/tenant-platform/trigger-cron",
            calculate_metrics: "POST /api/tenant-platform/calculate",
            status_check: "GET /api/tenant-platform/cron-status",
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Erro ao obter status do cron:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  },
);

export default router;
