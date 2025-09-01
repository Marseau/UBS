# Database Schema Analysis - Current Metrics System
*Updated with Production Validation - January 2025*

## Overview
This document analyzes the **active metrics system** in production, focusing on the 2 core tables that are actively used and the deprecated analytics tables.

## Active Metrics Tables (Production Validated)

### 1. `tenant_metrics` - PRIMARY METRICS SYSTEM
**Purpose:** Tenant-specific metrics with JSONB flexibility  
**Production Status:** ✅ **ACTIVE AND HEAVILY USED**
**Last Activity:** 2025-09-01 (TODAY)
**Total Records:** 286 active records

**Confirmed Production Structure:**
- `id` UUID PRIMARY KEY
- `tenant_id` UUID (FK to tenants)
- `metric_type` VARCHAR (ranking, risk_assessment, participation, evolution)
- `metric_data` JSONB (flexible metrics storage)
- `period` VARCHAR (7d, 30d, 90d, 1y)
- `calculated_at` TIMESTAMPTZ
- `metricas_validadas` JSONB (validated metrics)
- `created_at`, `updated_at` TIMESTAMPTZ

**JSONB Structure Examples:**
```json
{
  "revenue": { "value": 15000, "rank": 2 },
  "customers": { "value": 450, "rank": 5 },
  "appointments": { "value": 320, "rank": 3 },
  "participation": { "percentage": 18.5, "trend": "up" }
}
```

### 2. `platform_metrics` - PLATFORM AGGREGATIONS
**Purpose:** Platform-wide aggregated metrics
**Production Status:** ✅ **ACTIVE FOR AGGREGATIONS**
**Last Activity:** 2025-08-12 (Recent)
**Total Records:** 3 aggregation records

**Confirmed Production Structure:**
- `id` UUID PRIMARY KEY
- `platform_id` VARCHAR
- `period` VARCHAR (daily, weekly, monthly)
- `metric_type` VARCHAR (aggregation type)
- `metric_data` JSONB (platform-wide KPIs)
- `created_at`, `updated_at` TIMESTAMP

**JSONB Structure Examples:**
```json
{
  "total_mrr": 125000,
  "total_tenants": 450,
  "active_tenants": 380,
  "total_appointments": 15200,
  "avg_completion_rate": 0.87
}
```

### 3. `usage_costs` - COST TRACKING
**Purpose:** Usage-based cost tracking integration
**Status:** ✅ **ACTIVE FOR BILLING**

**Cost Structure:**
- Chat minutes: $0.001 per minute
- Conversations: $0.007 per conversation  
- AI interactions: $0.02 per interaction

## 🚫 Deprecated Analytics Tables (DO NOT USE)

### Legacy Analytics System (DEPRECATED)
**Status:** ❌ **DEPRECATED - Last activity August 2025**

These tables should be **ignored** in new development:
- `analytics_job_executions` (12 records, last: 2025-08-11)
- `analytics_system_metrics` (3 records, last: 2025-08-08)  
- `analytics_tenant_metrics` (30 records, last: 2025-08-08)

**Migration Note:** The analytics_* tables were replaced by the current tenant_metrics and platform_metrics system. New development should only reference the active tables.

## Current API Integration (Active System)

### Production APIs (Working with Active Tables)
1. **Tenant APIs** → `tenant_metrics` table (PRIMARY - 286 records)
2. **Platform APIs** → `platform_metrics` table (AGGREGATIONS - 3 records)
3. **Cost APIs** → `usage_costs` calculations

### Performance Status (Production Validated)
- **Tenant queries:** ~20-50ms (optimized for heavy use)
- **Platform queries:** ~50-100ms (aggregation focused)
- **Cost queries:** ~100-200ms (billing calculations)

## Current System Status

### ✅ What's Working (No Changes Needed)
- `tenant_metrics` with 286 active records (heavy production use)
- `platform_metrics` with aggregation data (recent activity)
- JSONB flexible structure allowing dynamic metrics
- Performance within acceptable ranges

### 🔧 Optimization Opportunities  
- Additional JSONB fields in `tenant_metrics`:
  - `health_score`
  - `risk_level` 
  - `efficiency_score`
  - `ranking_position`

- Enhanced `platform_metrics` aggregations:
  - `total_chat_minutes`
  - `total_conversations` 
  - `operational_efficiency_pct`

### Phase 2: Query Optimization
Optimize existing queries with:
- Better indexing
- Efficient JOINs
- Intelligent caching

### Phase 3: API Unification
Unify APIs to use optimized queries from existing tables

## Success Metrics
- **Query performance:** Maintain <100ms for all queries
- **Data integrity:** 100% preservation of existing data
- **Zero downtime:** No service interruption
- **API compatibility:** All existing endpoints continue working

## Deprecated Services (DO NOT USE)

### Legacy Analytics Scheduler (DEPRECATED)
**Status:** ❌ **DEPRECATED - Uses analytics_* tables**
**File:** `src/services/analytics-scheduler.service.ts`

This service is deprecated as it operates on the old analytics_* tables. The active metrics system uses:
- `src/services/tenant-metrics-cron-optimized.service.ts` (PRIMARY - 25x faster)
- `src/services/unified-cron.service.ts` (Alternative)
- `src/services/tenant-metrics/` (Specialized metrics modules)

**Migration Note:** New development should use the optimized tenant-metrics system, not the analytics-scheduler service.

## Conclusion
The current 3-table structure is solid and working. Instead of creating new tables, we will:
1. Complete missing columns
2. Optimize existing queries
3. Unify API access patterns
4. Implement intelligent caching

This approach maintains stability while achieving performance goals.