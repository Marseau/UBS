# Unified API Design Document

## Project: Dashboard APIs Rationalization
**Date:** 2025-01-17  
**Version:** 1.0  
**Author:** Claude Code Assistant  

---

## Executive Summary

This document outlines the design for a unified API structure that consolidates 3 separate dashboard APIs (2,114 lines) into a single, efficient `/api/metrics/` endpoint system (estimated 800 lines), achieving a 68% reduction in endpoints and 62% reduction in code duplication.

---

## Current State Analysis

### Existing APIs Overview:
- **`/api/dashboard/`** - 11 endpoints, 593 lines
- **`/api/tenant-platform/`** - 9 endpoints, 667 lines  
- **`/api/super-admin/`** - 7 endpoints, 854 lines

### Key Problems:
1. **68% endpoint redundancy** (25 → 8 endpoints)
2. **60+ lines of duplicated date processing**
3. **3 identical trigger calculation endpoints**
4. **Inconsistent response formats**
5. **Fragmented cache management**

---

## Unified API Architecture

### New Structure: `/api/metrics/`

```
/api/metrics/
├── GET    /platform/all            # Platform-wide metrics (Super Admin)
├── GET    /platform/kpis           # Strategic KPIs (Super Admin)
├── GET    /tenant/:id/metrics      # Individual tenant metrics
├── GET    /tenant/:id/participation # Tenant participation data
├── GET    /comparison/:id          # Tenant vs platform comparison
├── GET    /charts/:type           # Chart-specific data
├── POST   /calculate              # Manual calculation trigger
└── GET    /status                 # Unified health check
```

### Endpoint Consolidation Map:

| **New Endpoint** | **Replaces Current Endpoints** | **Reduction** |
|---|---|---|
| `GET /platform/all` | `/dashboard/sistema/overview`<br/>`/tenant-platform/platform/metrics`<br/>`/super-admin/kpis` | 3 → 1 |
| `GET /platform/kpis` | `/super-admin/kpis`<br/>`/dashboard/sistema/overview` | 2 → 1 |
| `GET /tenant/:id/metrics` | `/dashboard/tenant/:id/overview`<br/>`/tenant-platform/tenant/:id/metrics` | 2 → 1 |
| `GET /tenant/:id/participation` | `/dashboard/tenant-platform/:id`<br/>`/tenant-platform/tenant/:id/metrics` | 2 → 1 |
| `GET /comparison/:id` | `/tenant-platform/comparison/:id`<br/>`/dashboard/tenant-platform/:id/participation` | 2 → 1 |
| `GET /charts/:type` | `/dashboard/tenant/:id/charts`<br/>`/super-admin/charts/*` | 3 → 1 |
| `POST /calculate` | `/dashboard/trigger-calculation`<br/>`/tenant-platform/calculate`<br/>`/super-admin/trigger-calculation` | 3 → 1 |
| `GET /status` | `/dashboard/status`<br/>`/tenant-platform/status`<br/>`/super-admin/status` | 3 → 1 |

**Total Reduction:** 25 → 8 endpoints (68% reduction)

---

## API Endpoint Specifications

### 1. Platform Metrics (`GET /platform/all`)

**Purpose:** Consolidated platform-wide metrics for super admin dashboard  
**Replaces:** `/dashboard/sistema/overview`, `/tenant-platform/platform/metrics`

**Parameters:**
```typescript
interface PlatformMetricsRequest {
  period?: '7d' | '30d' | '90d' | '1y';
  start_date?: string;
  end_date?: string;
  include_charts?: boolean;
}
```

**Response:**
```typescript
interface PlatformMetricsResponse {
  platform_metrics: {
    mrr: number;
    active_tenants: number;
    total_revenue: number;
    total_appointments: number;
    total_customers: number;
    revenue_usage_ratio: number;
    operational_efficiency: number;
    spam_rate: number;
    cancellation_rate: number;
  };
  period_comparison: {
    mrr_growth: number;
    tenants_growth: number;
    revenue_growth: number;
  };
  charts_data?: {
    revenue_trend: ChartData[];
    tenant_growth: ChartData[];
    domain_distribution: ChartData[];
  };
}
```

### 2. Platform KPIs (`GET /platform/kpis`)

**Purpose:** Strategic KPIs for super admin decision making  
**Replaces:** `/super-admin/kpis`

**Parameters:**
```typescript
interface PlatformKPIsRequest {
  period?: '7d' | '30d' | '90d';
  include_insights?: boolean;
}
```

**Response:**
```typescript
interface PlatformKPIsResponse {
  kpis: {
    mrr: KPIValue;
    active_tenants: KPIValue;
    revenue_usage_ratio: KPIValue;
    operational_efficiency: KPIValue;
    spam_rate: KPIValue;
    total_appointments: KPIValue;
    ai_interactions: KPIValue;
    cancellation_rate: KPIValue;
    usage_cost: KPIValue;
  };
  insights?: {
    distortion_analysis: DistortionInsight[];
    upsell_opportunities: UpsellOpportunity[];
  };
}
```

### 3. Tenant Metrics (`GET /tenant/:id/metrics`)

**Purpose:** Individual tenant performance metrics  
**Replaces:** `/dashboard/tenant/:id/overview`, `/tenant-platform/tenant/:id/metrics`

**Parameters:**
```typescript
interface TenantMetricsRequest {
  period?: '7d' | '30d' | '90d';
  include_charts?: boolean;
  include_ai_metrics?: boolean;
}
```

**Response:**
```typescript
interface TenantMetricsResponse {
  tenant_info: {
    id: string;
    name: string;
    domain: string;
    status: string;
  };
  metrics: {
    revenue: number;
    appointments: number;
    customers: number;
    ai_interactions: number;
    chat_duration_avg: number;
    cancellation_rate: number;
    spam_detection_score: number;
  };
  charts_data?: {
    revenue_trend: ChartData[];
    appointment_status: ChartData[];
    customer_growth: ChartData[];
  };
}
```

### 4. Tenant Participation (`GET /tenant/:id/participation`)

**Purpose:** Tenant participation in platform totals  
**Replaces:** `/dashboard/tenant-platform/:id`, `/tenant-platform/tenant/:id/metrics`

**Parameters:**
```typescript
interface TenantParticipationRequest {
  period?: '7d' | '30d' | '90d';
  comparison_type?: 'percentage' | 'absolute' | 'both';
}
```

**Response:**
```typescript
interface TenantParticipationResponse {
  tenant_info: TenantInfo;
  participation: {
    revenue: {
      value: number;
      percentage: number;
      platform_total: number;
    };
    appointments: {
      value: number;
      percentage: number;
      platform_total: number;
    };
    customers: {
      value: number;
      percentage: number;
      platform_total: number;
    };
    ai_interactions: {
      value: number;
      percentage: number;
      platform_total: number;
    };
  };
  business_intelligence: {
    risk_score: number;
    efficiency_score: number;
    growth_score: number;
  };
}
```

### 5. Comparison Data (`GET /comparison/:id`)

**Purpose:** Tenant vs platform comparison analysis  
**Replaces:** `/tenant-platform/comparison/:id`

**Parameters:**
```typescript
interface ComparisonRequest {
  period?: '7d' | '30d' | '90d';
  metrics?: string[]; // Filter specific metrics
}
```

**Response:**
```typescript
interface ComparisonResponse {
  tenant_data: TenantMetrics;
  platform_data: PlatformMetrics;
  comparison_scores: {
    revenue_performance: number;
    efficiency_score: number;
    growth_rate: number;
    risk_level: 'low' | 'medium' | 'high';
  };
  rankings: {
    revenue_rank: number;
    efficiency_rank: number;
    growth_rank: number;
    total_tenants: number;
  };
}
```

### 6. Chart Data (`GET /charts/:type`)

**Purpose:** Specific chart data for different dashboard types  
**Replaces:** `/dashboard/tenant/:id/charts`, `/super-admin/charts/*`

**Supported Chart Types:**
- `revenue-vs-usage` - Revenue vs Usage Cost scatter plot
- `appointment-status` - Appointment status donut chart
- `domain-distribution` - Domain distribution pie chart
- `growth-trends` - Growth trend line chart
- `tenant-rankings` - Tenant ranking bar chart

**Parameters:**
```typescript
interface ChartDataRequest {
  period?: '7d' | '30d' | '90d';
  tenant_id?: string; // Optional for tenant-specific charts
  chart_options?: ChartOptions;
}
```

**Response:**
```typescript
interface ChartDataResponse {
  chart_type: string;
  data: ChartData[];
  metadata: {
    total_points: number;
    last_updated: string;
    period: string;
  };
  chart_config: {
    title: string;
    x_axis: string;
    y_axis: string;
    colors: string[];
  };
}
```

### 7. Manual Calculation (`POST /calculate`)

**Purpose:** Trigger manual metrics calculation  
**Replaces:** All 3 trigger calculation endpoints

**Request Body:**
```typescript
interface CalculationRequest {
  type: 'platform' | 'tenant' | 'all';
  tenant_id?: string; // Required if type is 'tenant'
  force_recalculation?: boolean;
  include_cache_refresh?: boolean;
}
```

**Response:**
```typescript
interface CalculationResponse {
  success: boolean;
  message: string;
  calculation_id: string;
  estimated_completion: string;
  results?: {
    platform_metrics?: boolean;
    tenant_metrics?: boolean;
    cache_refreshed?: boolean;
  };
}
```

### 8. Health Check (`GET /status`)

**Purpose:** Unified health check for all dashboard systems  
**Replaces:** All 3 status endpoints

**Response:**
```typescript
interface StatusResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceStatus;
    cache: ServiceStatus;
    cron_jobs: ServiceStatus;
    analytics: ServiceStatus;
  };
  metrics: {
    response_time: number;
    last_calculation: string;
    cache_hit_rate: number;
  };
}
```

---

## Authentication & Authorization

### Middleware Strategy:

```typescript
// Auth middleware for different access levels
const authMiddleware = {
  superAdmin: requireSuperAdminAuth,
  tenantAdmin: requireTenantAdminAuth,
  anyAdmin: requireAnyAdminAuth
};

// Apply auth to endpoints
router.get('/platform/all', authMiddleware.superAdmin, handler);
router.get('/platform/kpis', authMiddleware.superAdmin, handler);
router.get('/tenant/:id/metrics', authMiddleware.tenantAdmin, handler);
router.get('/tenant/:id/participation', authMiddleware.tenantAdmin, handler);
router.get('/comparison/:id', authMiddleware.tenantAdmin, handler);
router.get('/charts/:type', authMiddleware.anyAdmin, handler);
router.post('/calculate', authMiddleware.anyAdmin, handler);
router.get('/status', authMiddleware.anyAdmin, handler);
```

### Role-Based Access Control:

| **Endpoint** | **Super Admin** | **Tenant Admin** | **Support** |
|---|---|---|---|
| `/platform/all` | ✅ | ❌ | ❌ |
| `/platform/kpis` | ✅ | ❌ | ❌ |
| `/tenant/:id/metrics` | ✅ | ✅ (own tenant) | ✅ (read-only) |
| `/tenant/:id/participation` | ✅ | ✅ (own tenant) | ✅ (read-only) |
| `/comparison/:id` | ✅ | ✅ (own tenant) | ✅ (read-only) |
| `/charts/:type` | ✅ | ✅ | ✅ |
| `POST /calculate` | ✅ | ✅ (own tenant) | ❌ |
| `/status` | ✅ | ✅ | ✅ |

---

## Caching Strategy

### Unified Cache Architecture:

```typescript
interface CacheConfig {
  platform_metrics: {
    ttl: 300; // 5 minutes
    key_pattern: 'platform_metrics_{period}_{date}';
  };
  tenant_metrics: {
    ttl: 180; // 3 minutes
    key_pattern: 'tenant_metrics_{tenant_id}_{period}_{date}';
  };
  charts_data: {
    ttl: 600; // 10 minutes
    key_pattern: 'charts_{type}_{tenant_id}_{period}';
  };
}
```

### Cache Management:
- **Automatic invalidation** on data changes
- **Manual refresh** via calculate endpoint
- **Tiered caching** (memory + Redis)
- **Performance monitoring** and analytics

---

## Error Handling

### Standardized Error Response:

```typescript
interface ErrorResponse {
  error: true;
  message: string;
  code: string;
  details?: any;
  timestamp: string;
  request_id: string;
}
```

### Error Codes:
- `METRICS_001` - Platform metrics calculation failed
- `METRICS_002` - Tenant not found
- `METRICS_003` - Cache service unavailable
- `METRICS_004` - Invalid date range
- `METRICS_005` - Database connection failed
- `METRICS_006` - Insufficient permissions
- `METRICS_007` - Calculation timeout
- `METRICS_008` - Invalid chart type

---

## Performance Targets

### Response Time Goals:
- **Platform metrics:** < 1 second
- **Tenant metrics:** < 800ms
- **Chart data:** < 500ms
- **Status check:** < 200ms

### Scalability Metrics:
- **Concurrent requests:** 100+ per second
- **Cache hit rate:** > 80%
- **Database queries:** < 50ms average
- **Memory usage:** < 512MB per instance

---

## Migration Strategy

### Phase 1: New API Implementation (Week 1)
1. Create unified API endpoints
2. Implement UnifiedMetricsService
3. Setup caching layer
4. Add comprehensive tests

### Phase 2: Frontend Integration (Week 2)
1. Update dashboard JavaScript files
2. Modify API calls to use new endpoints
3. Test all three dashboards
4. Performance optimization

### Phase 3: Deprecation (Week 3)
1. Add deprecation warnings to old endpoints
2. Monitor usage and performance
3. Gradual traffic migration
4. Remove old endpoints

---

## Rollback Procedures

### Rollback Plan:
1. **Immediate rollback:** Switch traffic back to old endpoints
2. **Database rollback:** Restore from backup if needed
3. **Cache rollback:** Clear unified cache, restore old cache
4. **Frontend rollback:** Revert to backup JavaScript files

### Rollback Triggers:
- **Performance degradation** > 50%
- **Error rate increase** > 5%
- **Critical functionality broken**
- **Data integrity issues**

---

## Testing Strategy

### Test Coverage:
- **Unit tests** for all endpoint handlers
- **Integration tests** for complete workflows
- **Performance tests** for response times
- **Security tests** for authentication
- **Load tests** for scalability

### Test Data:
- **Mock tenant data** for development
- **Realistic metrics** for performance testing
- **Edge cases** for error handling
- **Large datasets** for scalability testing

---

## Documentation Requirements

### API Documentation:
- **OpenAPI 3.0 specification**
- **Interactive API explorer**
- **Request/response examples**
- **Error code reference**

### Developer Documentation:
- **Integration guide** for frontend developers
- **Authentication setup** instructions
- **Caching best practices**
- **Performance optimization** guide

---

## Success Metrics

### Technical Metrics:
- **68% reduction in endpoints** (25 → 8)
- **62% reduction in code** (2,114 → 800 lines)
- **80% improvement in response time**
- **40% reduction in memory usage**

### Business Metrics:
- **100% functionality preserved**
- **Zero downtime deployment**
- **Improved developer productivity**
- **Better user experience**

---

## Next Steps

1. **Review and approve** this design document
2. **Create detailed implementation plan**
3. **Begin UnifiedMetricsService implementation**
4. **Setup development environment**
5. **Start with first endpoint implementation**

---

**Document Status:** Ready for Implementation  
**Estimated Implementation Time:** 2 weeks  
**Risk Level:** Low (comprehensive rollback plan)  
**Priority:** High (significant performance and maintainability gains)