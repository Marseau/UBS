/**
 * Unified Metrics Types
 * TypeScript definitions for the unified metrics system
 *
 * @fileoverview Comprehensive type definitions for dashboard metrics consolidation
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

/**
 * Base interface for all metric requests
 */
export interface BaseMetricRequest {
  /** Time period for metrics calculation */
  period?: "7d" | "30d" | "90d" | "1y";
  /** Custom start date (YYYY-MM-DD format) */
  start_date?: string;
  /** Custom end date (YYYY-MM-DD format) */
  end_date?: string;
  /** Force cache refresh */
  force_refresh?: boolean;
}

/**
 * KPI Value structure with metadata
 */
export interface KPIValue {
  /** Current value */
  value: number;
  /** Formatted display value */
  display_value: string;
  /** Previous period value for comparison */
  previous_value?: number;
  /** Percentage change from previous period */
  change_percentage?: number;
  /** Trend direction */
  trend?: "up" | "down" | "stable";
  /** Unit of measurement */
  unit?: string;
  /** Timestamp of last calculation */
  last_updated?: string;
}

/**
 * Chart data point structure
 */
export interface ChartData {
  /** X-axis value (usually date or category) */
  x: string | number;
  /** Y-axis value */
  y: number;
  /** Additional metadata */
  label?: string;
  /** Color for the data point */
  color?: string;
  /** Additional properties */
  [key: string]: any;
}

/**
 * Chart configuration
 */
export interface ChartConfig {
  /** Chart title */
  title: string;
  /** X-axis label */
  x_axis: string;
  /** Y-axis label */
  y_axis: string;
  /** Chart type */
  type: "line" | "bar" | "pie" | "doughnut" | "scatter";
  /** Color scheme */
  colors: string[];
  /** Additional chart options */
  options?: Record<string, any>;
}

/**
 * Service status information
 */
export interface ServiceStatus {
  /** Service health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Response time in milliseconds */
  response_time?: number;
  /** Last check timestamp */
  last_check?: string;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Tenant information structure
 */
export interface TenantInfo {
  /** Tenant unique identifier */
  id: string;
  /** Tenant display name */
  name: string;
  /** Business domain */
  domain: BusinessDomain;
  /** Tenant status */
  status: "active" | "inactive" | "suspended";
  /** Creation date */
  created_at: string;
  /** Last activity date */
  last_activity?: string;
}

/**
 * Business domain type
 */
export type BusinessDomain =
  | "healthcare"
  | "beauty"
  | "legal"
  | "education"
  | "sports"
  | "consulting"
  | "other";

// ========================= PLATFORM METRICS =========================

/**
 * Platform metrics request parameters
 */
export interface PlatformMetricsRequest extends BaseMetricRequest {
  /** Include chart data in response */
  include_charts?: boolean;
  /** Include detailed breakdown */
  include_breakdown?: boolean;
}

/**
 * Platform metrics response structure
 */
export interface PlatformMetricsResponse {
  /** Core platform metrics */
  platform_metrics: {
    /** Monthly Recurring Revenue */
    mrr: KPIValue;
    /** Number of active tenants */
    active_tenants: KPIValue;
    /** Total platform revenue */
    total_revenue: KPIValue;
    /** Total appointments across platform */
    total_appointments: KPIValue;
    /** Total unique customers */
    total_customers: KPIValue;
    /** Revenue to usage ratio */
    revenue_usage_ratio: KPIValue;
    /** Operational efficiency percentage */
    operational_efficiency: KPIValue;
    /** Platform spam rate */
    spam_rate: KPIValue;
    /** Platform cancellation rate */
    cancellation_rate: KPIValue;
    /** Total AI interactions */
    ai_interactions: KPIValue;
  };
  /** Period-over-period comparison */
  period_comparison: {
    /** MRR growth percentage */
    mrr_growth: number;
    /** Active tenants growth */
    tenants_growth: number;
    /** Revenue growth percentage */
    revenue_growth: number;
    /** Appointments growth */
    appointments_growth: number;
  };
  /** Chart data (optional) */
  charts_data?: {
    /** Revenue trend over time */
    revenue_trend: ChartData[];
    /** Tenant growth chart */
    tenant_growth: ChartData[];
    /** Domain distribution */
    domain_distribution: ChartData[];
  };
  /** Metadata */
  metadata: {
    /** Calculation period */
    period: string;
    /** Last updated timestamp */
    last_updated: string;
    /** Data quality score */
    data_quality?: number;
  };
}

/**
 * Platform KPIs request parameters
 */
export interface PlatformKPIsRequest extends BaseMetricRequest {
  /** Include insights and analysis */
  include_insights?: boolean;
  /** Include risk assessment */
  include_risk_assessment?: boolean;
}

/**
 * Platform KPIs response structure
 */
export interface PlatformKPIsResponse {
  /** Strategic KPIs */
  kpis: {
    /** Monthly Recurring Revenue */
    mrr: KPIValue;
    /** Active tenants count */
    active_tenants: KPIValue;
    /** Revenue to usage ratio */
    revenue_usage_ratio: KPIValue;
    /** Operational efficiency */
    operational_efficiency: KPIValue;
    /** Spam detection rate */
    spam_rate: KPIValue;
    /** Total appointments */
    total_appointments: KPIValue;
    /** AI interactions count */
    ai_interactions: KPIValue;
    /** Cancellation rate */
    cancellation_rate: KPIValue;
    /** Platform usage cost */
    usage_cost: KPIValue;
  };
  /** Business insights (optional) */
  insights?: {
    /** Distortion analysis */
    distortion_analysis: DistortionInsight[];
    /** Upsell opportunities */
    upsell_opportunities: UpsellOpportunity[];
    /** Risk assessment */
    risk_assessment?: RiskAssessment;
  };
  /** Metadata */
  metadata: {
    /** Calculation timestamp */
    calculated_at: string;
    /** Data freshness in minutes */
    data_freshness: number;
    /** Total calculation time */
    calculation_time_ms: number;
  };
}

// ========================= TENANT METRICS =========================

/**
 * Tenant metrics request parameters
 */
export interface TenantMetricsRequest extends BaseMetricRequest {
  /** Include chart data */
  include_charts?: boolean;
  /** Include AI performance metrics */
  include_ai_metrics?: boolean;
  /** Include business intelligence */
  include_business_intelligence?: boolean;
}

/**
 * Tenant metrics response structure
 */
export interface TenantMetricsResponse {
  /** Tenant information */
  tenant_info: TenantInfo;
  /** Core tenant metrics */
  metrics: {
    /** Revenue generated */
    revenue: KPIValue;
    /** Appointments count */
    appointments: KPIValue;
    /** Unique customers */
    customers: KPIValue;
    /** AI interactions */
    ai_interactions: KPIValue;
    /** Average chat duration */
    chat_duration_avg: KPIValue;
    /** Cancellation rate */
    cancellation_rate: KPIValue;
    /** Spam detection score */
    spam_detection_score: KPIValue;
    /** Conversion rate */
    conversion_rate: KPIValue;
  };
  /** Chart data (optional) */
  charts_data?: {
    /** Revenue trend */
    revenue_trend: ChartData[];
    /** Appointment status distribution */
    appointment_status: ChartData[];
    /** Customer growth */
    customer_growth: ChartData[];
    /** AI performance */
    ai_performance?: ChartData[];
  };
  /** Business intelligence (optional) */
  business_intelligence?: {
    /** Health score (0-100) */
    health_score: number;
    /** Risk level */
    risk_level: "low" | "medium" | "high";
    /** Efficiency score */
    efficiency_score: number;
    /** Growth trend */
    growth_trend: "growing" | "stable" | "declining";
  };
  /** Metadata */
  metadata: {
    /** Calculation period */
    period: string;
    /** Last updated */
    last_updated: string;
    /** Data completeness percentage */
    data_completeness: number;
  };
}

/**
 * Tenant participation request parameters
 */
export interface TenantParticipationRequest extends BaseMetricRequest {
  /** Comparison type */
  comparison_type?: "percentage" | "absolute" | "both";
  /** Include ranking information */
  include_ranking?: boolean;
}

/**
 * Tenant participation response structure
 */
export interface TenantParticipationResponse {
  /** Tenant information */
  tenant_info: TenantInfo;
  /** Platform participation metrics */
  participation: {
    /** Revenue participation */
    revenue: ParticipationMetric;
    /** Appointments participation */
    appointments: ParticipationMetric;
    /** Customers participation */
    customers: ParticipationMetric;
    /** AI interactions participation */
    ai_interactions: ParticipationMetric;
  };
  /** Business intelligence scores */
  business_intelligence: {
    /** Risk score (0-100) */
    risk_score: number;
    /** Efficiency score (0-100) */
    efficiency_score: number;
    /** Growth score (0-100) */
    growth_score: number;
  };
  /** Ranking information (optional) */
  ranking?: {
    /** Overall ranking position */
    position: number;
    /** Total tenants in ranking */
    total_tenants: number;
    /** Percentile (0-100) */
    percentile: number;
    /** Ranking category */
    category: string;
    /** Position change from previous period */
    position_change: number;
  };
  /** Metadata */
  metadata: {
    /** Calculation period */
    period: string;
    /** Last updated */
    last_updated: string;
    /** Platform totals used for calculation */
    platform_totals: Record<string, number>;
  };
}

/**
 * Participation metric structure
 */
export interface ParticipationMetric {
  /** Absolute value */
  value: number;
  /** Percentage of platform total */
  percentage: number;
  /** Platform total for reference */
  platform_total: number;
  /** Formatted display value */
  display_value: string;
  /** Trend compared to previous period */
  trend?: "up" | "down" | "stable";
}

// ========================= COMPARISON METRICS =========================

/**
 * Comparison request parameters
 */
export interface ComparisonRequest extends BaseMetricRequest {
  /** Metrics to compare */
  metrics?: string[];
  /** Include detailed analysis */
  include_analysis?: boolean;
}

/**
 * Comparison response structure
 */
export interface ComparisonResponse {
  /** Tenant data */
  tenant_data: TenantMetricsResponse["metrics"];
  /** Platform averages */
  platform_data: {
    /** Average revenue per tenant */
    avg_revenue_per_tenant: number;
    /** Average appointments per tenant */
    avg_appointments_per_tenant: number;
    /** Average customers per tenant */
    avg_customers_per_tenant: number;
    /** Platform-wide conversion rate */
    platform_conversion_rate: number;
  };
  /** Comparison scores */
  comparison_scores: {
    /** Revenue performance vs platform */
    revenue_performance: number;
    /** Efficiency score vs platform */
    efficiency_score: number;
    /** Growth rate vs platform */
    growth_rate: number;
    /** Overall risk level */
    risk_level: "low" | "medium" | "high";
  };
  /** Rankings */
  rankings: {
    /** Revenue ranking */
    revenue_rank: number;
    /** Efficiency ranking */
    efficiency_rank: number;
    /** Growth ranking */
    growth_rank: number;
    /** Total tenants in ranking */
    total_tenants: number;
  };
  /** Analysis (optional) */
  analysis?: {
    /** Strengths */
    strengths: string[];
    /** Areas for improvement */
    improvements: string[];
    /** Recommendations */
    recommendations: string[];
  };
}

// ========================= CHART METRICS =========================

/**
 * Chart data request parameters
 */
export interface ChartDataRequest extends BaseMetricRequest {
  /** Tenant ID for tenant-specific charts */
  tenant_id?: string;
  /** Chart configuration options */
  chart_options?: Partial<ChartConfig>;
}

/**
 * Chart data response structure
 */
export interface ChartDataResponse {
  /** Chart type */
  chart_type: string;
  /** Chart data points */
  data: ChartData[];
  /** Chart configuration */
  chart_config: ChartConfig;
  /** Metadata */
  metadata: {
    /** Total data points */
    total_points: number;
    /** Data range */
    date_range: {
      start: string;
      end: string;
    };
    /** Last updated */
    last_updated: string;
    /** Data quality score */
    data_quality: number;
  };
}

// ========================= CALCULATION METRICS =========================

/**
 * Manual calculation request
 */
export interface CalculationRequest {
  /** Calculation type */
  type: "platform" | "tenant" | "all";
  /** Tenant ID (required if type is 'tenant') */
  tenant_id?: string;
  /** Force recalculation */
  force_recalculation?: boolean;
  /** Include cache refresh */
  include_cache_refresh?: boolean;
  /** Calculation priority */
  priority?: "low" | "normal" | "high";
}

/**
 * Manual calculation response
 */
export interface CalculationResponse {
  /** Success status */
  success: boolean;
  /** Status message */
  message: string;
  /** Calculation job ID */
  calculation_id: string;
  /** Estimated completion time */
  estimated_completion: string;
  /** Calculation results */
  results?: {
    /** Platform metrics calculated */
    platform_metrics?: boolean;
    /** Tenant metrics calculated */
    tenant_metrics?: boolean;
    /** Cache refreshed */
    cache_refreshed?: boolean;
    /** Calculation time */
    calculation_time_ms?: number;
  };
  /** Error details (if any) */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Error details */
    details?: any;
  };
}

// ========================= STATUS METRICS =========================

/**
 * System status response
 */
export interface StatusResponse {
  /** Overall system status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Status timestamp */
  timestamp: string;
  /** Individual service statuses */
  services: {
    /** Database service */
    database: ServiceStatus;
    /** Cache service */
    cache: ServiceStatus;
    /** Cron jobs service */
    cron_jobs: ServiceStatus;
    /** Analytics service */
    analytics: ServiceStatus;
  };
  /** Performance metrics */
  metrics: {
    /** Average response time */
    response_time: number;
    /** Last calculation timestamp */
    last_calculation: string;
    /** Cache hit rate percentage */
    cache_hit_rate: number;
    /** Active connections */
    active_connections: number;
  };
  /** System information */
  system_info: {
    /** Application version */
    version: string;
    /** Environment */
    environment: string;
    /** Uptime in seconds */
    uptime: number;
    /** Memory usage */
    memory_usage: {
      /** Used memory in MB */
      used: number;
      /** Total memory in MB */
      total: number;
      /** Usage percentage */
      percentage: number;
    };
  };
}

// ========================= BUSINESS INTELLIGENCE =========================

/**
 * Distortion insight structure
 */
export interface DistortionInsight {
  /** Tenant ID */
  tenant_id: string;
  /** Tenant name */
  tenant_name: string;
  /** Distortion type */
  type: "over_paying" | "under_paying" | "balanced";
  /** Distortion score */
  score: number;
  /** Revenue paid */
  revenue_paid: number;
  /** Usage cost */
  usage_cost: number;
  /** Distortion ratio */
  ratio: number;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Upsell opportunity structure
 */
export interface UpsellOpportunity {
  /** Tenant ID */
  tenant_id: string;
  /** Tenant name */
  tenant_name: string;
  /** Opportunity type */
  type: "usage_exceeds_plan" | "growth_potential" | "feature_adoption";
  /** Opportunity score (0-100) */
  score: number;
  /** Current revenue */
  current_revenue: number;
  /** Potential revenue */
  potential_revenue: number;
  /** Revenue increase potential */
  revenue_increase: number;
  /** Recommendations */
  recommendations: string[];
  /** Next best action */
  next_action: string;
}

/**
 * Risk assessment structure
 */
export interface RiskAssessment {
  /** Overall risk score (0-100) */
  overall_risk_score: number;
  /** Risk level */
  risk_level: "low" | "medium" | "high";
  /** Risk factors */
  risk_factors: {
    /** Churn risk */
    churn_risk: number;
    /** Payment risk */
    payment_risk: number;
    /** Usage decline risk */
    usage_decline_risk: number;
    /** Technical risk */
    technical_risk: number;
  };
  /** High-risk tenants */
  high_risk_tenants: {
    /** Tenant ID */
    tenant_id: string;
    /** Tenant name */
    tenant_name: string;
    /** Risk score */
    risk_score: number;
    /** Primary risk factor */
    primary_risk: string;
    /** Recommended actions */
    actions: string[];
  }[];
  /** Recommendations */
  recommendations: string[];
}

// ========================= CACHE TYPES =========================

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache key prefix */
  key_prefix: string;
  /** Time to live in milliseconds */
  ttl: number;
  /** Cache type */
  type: "memory" | "redis" | "hybrid";
  /** Maximum cache size */
  max_size?: number;
  /** Eviction policy */
  eviction_policy?: "lru" | "lfu" | "ttl";
}

/**
 * Cache entry structure
 */
export interface CacheEntry<T = any> {
  /** Cached data */
  data: T;
  /** Entry timestamp */
  timestamp: number;
  /** Time to live */
  ttl: number;
  /** Cache key */
  key: string;
  /** Hit count */
  hit_count: number;
  /** Last access time */
  last_accessed: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Cache hit rate percentage */
  hit_rate: number;
  /** Total entries */
  total_entries: number;
  /** Memory usage in bytes */
  memory_usage: number;
  /** Average response time */
  avg_response_time: number;
}

// ========================= ERROR TYPES =========================

/**
 * Unified error response
 */
export interface UnifiedError {
  /** Error flag */
  error: true;
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Error details */
  details?: any;
  /** Request timestamp */
  timestamp: string;
  /** Request ID for tracking */
  request_id: string;
  /** Stack trace (development only) */
  stack?: string;
}

// ========================= API RESPONSE WRAPPERS =========================

/**
 * Standard API response wrapper for success cases
 */
export interface SuccessResponse<T = any> {
  /** Success flag */
  success: true;
  /** Response data */
  data: T;
  /** Response message */
  message?: string;
  /** Response timestamp */
  timestamp?: string;
}

/**
 * Standard API response wrapper for error cases
 */
export interface ErrorResponse {
  /** Success flag */
  success: false;
  /** Error message */
  error: string;
  /** Error code */
  code?: string;
  /** Error details */
  details?: any;
  /** Response timestamp */
  timestamp?: string;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Enhanced Platform Metrics Response with API wrapper
 */
export type PlatformMetricsApiResponse = ApiResponse<PlatformMetricsResponse>;

/**
 * Enhanced Platform KPIs Response with API wrapper
 */
export type PlatformKPIsApiResponse = ApiResponse<PlatformKPIsResponse>;
