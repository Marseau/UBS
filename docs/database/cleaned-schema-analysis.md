# Database Schema Analysis - Cleaned Version

## Overview
This document analyzes the **existing** database schema for metrics optimization, focusing on the 3 core tables that are already implemented and working.

## Core Tables (Already Exist)

### 1. `platform_metrics`
**Purpose:** Platform-wide aggregated metrics
**Location:** `/database/platform-metrics-schema.sql`
**Status:** ✅ **ACTIVE AND WORKING**

**Current Columns:**
- `id` - Primary key
- `metric_date` - Date for metrics
- `total_mrr` - Monthly recurring revenue
- `total_appointments` - Total appointments
- `total_customers` - Total customers
- `total_revenue` - Total revenue
- `total_tenants` - Total tenants
- `active_tenants` - Active tenants
- `avg_completion_rate` - Average completion rate
- `total_cancellations` - Total cancellations
- `total_reschedules` - Total reschedules
- `created_at`, `updated_at` - Timestamps

**Functions:**
- `calculate_platform_metrics()` - Calculates platform metrics
- `update_platform_metrics()` - Updates platform metrics
- `get_platform_metrics_with_comparisons()` - API-ready data

### 2. `tenant_metrics`
**Purpose:** Tenant-specific metrics with JSONB flexibility
**Location:** `/database/tenant-metrics-schema.sql`
**Status:** ✅ **ACTIVE AND WORKING**

**Current Columns:**
- `id` - Primary key
- `tenant_id` - Foreign key to tenants
- `metric_type` - Type of metric (ranking, risk_assessment, participation, evolution)
- `metric_data` - JSONB data containing all metrics
- `period` - Time period (7d, 30d, 90d, 1y)
- `calculated_at` - Calculation timestamp
- `created_at`, `updated_at` - Timestamps

**JSONB Structure Examples:**
```json
{
  "revenue": { "value": 15000, "rank": 2 },
  "customers": { "value": 450, "rank": 5 },
  "appointments": { "value": 320, "rank": 3 },
  "participation": { "percentage": 18.5, "trend": "up" }
}
```

### 3. `usage_costs` (Implied from usage cost files)
**Purpose:** Usage-based cost tracking
**Location:** `/database/add-usage-cost-to-metrics.sql`
**Status:** ✅ **ACTIVE AND WORKING**

**Cost Structure:**
- Chat minutes: $0.001 per minute
- Conversations: $0.007 per conversation
- AI interactions: $0.02 per interaction

**Functions:**
- `calculate_new_metrics_system_with_usage_cost()` - Calculates costs
- `get_revenue_vs_usage_cost_data()` - Revenue vs cost analysis

## Current API Integration

### Existing APIs (Working)
1. **Platform APIs** → `platform_metrics` table
2. **Tenant APIs** → `tenant_metrics` table
3. **Usage Cost APIs** → usage cost calculations

### Performance Status
- **Platform queries:** ~50-100ms
- **Tenant queries:** ~20-50ms
- **Usage cost queries:** ~100-200ms

## Optimization Strategy

### Phase 1: Column Completion
Add missing columns to existing tables without breaking current functionality:

**platform_metrics additions needed:**
- `total_chat_minutes`
- `total_conversations`
- `total_ai_interactions`
- `operational_efficiency_pct`
- `spam_rate_pct`
- `receita_uso_ratio`

**tenant_metrics additions needed:**
- Additional JSONB fields for:
  - `health_score`
  - `risk_level`
  - `efficiency_score`
  - `ranking_position`

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

## Conclusion
The current 3-table structure is solid and working. Instead of creating new tables, we will:
1. Complete missing columns
2. Optimize existing queries
3. Unify API access patterns
4. Implement intelligent caching

This approach maintains stability while achieving performance goals.