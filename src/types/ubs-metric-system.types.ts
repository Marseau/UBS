/**
 * Types for UBS Metric System table
 * Tabela central para métricas consolidadas da plataforma
 */

export interface UBSMetricSystem {
  id: string;
  tenant_id: string;
  calculation_date: string;
  period_days: number;
  period_start_date: string;
  period_end_date: string;

  // Tenant Revenue Metrics
  tenant_revenue_value: number;
  tenant_revenue_participation_pct: number;
  tenant_revenue_trend: "growing" | "stable" | "declining";

  // Tenant Appointments Metrics
  tenant_appointments_count: number;
  tenant_appointments_participation_pct: number;
  tenant_appointments_confirmed: number;
  tenant_appointments_cancelled: number;
  tenant_appointments_completed: number;
  tenant_appointments_rescheduled: number;

  // Tenant Customers Metrics
  tenant_customers_count: number;
  tenant_customers_participation_pct: number;

  // Tenant AI Metrics
  tenant_ai_interactions: number;
  tenant_ai_participation_pct: number;

  // Platform Totals
  platform_total_revenue: number;
  platform_total_appointments: number;
  platform_total_customers: number;
  platform_total_ai_interactions: number;
  platform_mrr: number;
  platform_active_tenants: number;

  // Business Intelligence
  tenant_health_score: number;
  tenant_risk_level: string;
  tenant_ranking_position: number;

  // Metadata
  data_source: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface UBSMetricSystemWithTenant extends UBSMetricSystem {
  tenants: {
    business_name: string;
    domain: string;
  };
}

export interface UBSMetricSystemInsert
  extends Omit<UBSMetricSystem, "id" | "created_at" | "updated_at"> {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UBSMetricSystemUpdate extends Partial<UBSMetricSystemInsert> {}

export interface PlatformMetrics {
  total_revenue: number;
  total_appointments: number;
  total_customers: number;
  total_ai_interactions: number;
  total_active_tenants: number;
  averages: {
    revenue_per_tenant: number;
    appointments_per_tenant: number;
  };
  strategic_metrics: {
    mrr: number;
    receita_uso_ratio: number;
    operational_efficiency_pct: number;
    spam_rate_pct: number;
    total_chat_minutes: number;
  };
}

export interface TenantMetrics {
  revenue: {
    participation_pct: number;
    participation_value: number;
  };
  appointments: {
    participation_pct: number;
    count: number;
  };
  customers: {
    participation_pct: number;
    count: number;
  };
  ai_interactions: {
    participation_pct: number;
    count: number;
  };
  ranking: {
    position: number;
    category: string;
    percentile: number;
  };
  business_intelligence: {
    risk_score: number;
    risk_status: string;
    efficiency_score: number;
    conversion_rate: number;
  };
}

export interface TenantRanking {
  position: number;
  tenant_id: string;
  tenant_name: string;
  domain: string;
  revenue_value: number;
  revenue_participation: number;
  appointments_count: number;
  health_score: number;
  risk_level: string;
}
