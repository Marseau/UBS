import { supabase } from "../config/database";

export interface QueryPerformanceMetrics {
  queryName: string;
  executionTime: number;
  recordsReturned: number;
  complexity: "low" | "medium" | "high";
  recommendations: string[];
}

export interface PerformanceAnalysisResult {
  totalQueriesAnalyzed: number;
  averageExecutionTime: number;
  slowQueries: QueryPerformanceMetrics[];
  recommendations: string[];
  indexSuggestions: string[];
}

export class PerformanceAnalyzerService {
  /**
   * Analyze query performance across the application
   */
  static async analyzeSystemPerformance(): Promise<PerformanceAnalysisResult> {
    console.log("🔍 Starting comprehensive performance analysis...");

    const queryMetrics: QueryPerformanceMetrics[] = [];

    // Test dashboard queries
    const dashboardMetrics = await this.analyzeDashboardQueries();
    queryMetrics.push(...dashboardMetrics);

    // Test export queries
    const exportMetrics = await this.analyzeExportQueries();
    queryMetrics.push(...exportMetrics);

    // Test analytics queries
    const analyticsMetrics = await this.analyzeAnalyticsQueries();
    queryMetrics.push(...analyticsMetrics);

    // Calculate overall metrics
    const totalQueries = queryMetrics.length;
    const averageTime =
      queryMetrics.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries;
    const slowQueries = queryMetrics.filter((q) => q.executionTime > 1000); // > 1 second

    // Generate recommendations
    const recommendations =
      this.generatePerformanceRecommendations(queryMetrics);
    const indexSuggestions = this.generateIndexSuggestions(queryMetrics);

    return {
      totalQueriesAnalyzed: totalQueries,
      averageExecutionTime: Math.round(averageTime),
      slowQueries,
      recommendations,
      indexSuggestions,
    };
  }

  /**
   * Analyze dashboard-specific queries
   */
  private static async analyzeDashboardQueries(): Promise<
    QueryPerformanceMetrics[]
  > {
    const metrics: QueryPerformanceMetrics[] = [];

    // Test system dashboard query
    const systemDashboardMetric = await this.measureQuery(
      "System Dashboard - Tenant Count",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("tenants")
          .select("id, business_name, subscription_plan, status, created_at")
          .order("created_at", { ascending: false });
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(systemDashboardMetric);

    // Test customer analytics query
    const customerAnalyticsMetric = await this.measureQuery(
      "Customer Analytics - Complex JOIN",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("users")
          .select(
            `
                        id, name, email, phone, created_at,
                        user_tenants!inner (
                            tenant_id, total_bookings, first_interaction, last_interaction, role
                        )
                    `,
          )
          .order("created_at", { ascending: false })
          .limit(100);
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(customerAnalyticsMetric);

    // Test service analytics query
    const serviceAnalyticsMetric = await this.measureQuery(
      "Service Analytics - Appointment Aggregation",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("services")
          .select(
            `
                        id, name, base_price, duration_minutes, is_active, created_at,
                        service_categories (id, name)
                    `,
          )
          .order("created_at", { ascending: false })
          .limit(50);
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(serviceAnalyticsMetric);

    return metrics;
  }

  /**
   * Analyze export-specific queries
   */
  private static async analyzeExportQueries(): Promise<
    QueryPerformanceMetrics[]
  > {
    const metrics: QueryPerformanceMetrics[] = [];

    // Test large customer export
    const customerExportMetric = await this.measureQuery(
      "Customer Export - Full Dataset",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("users")
          .select(
            `
                        id, name, email, phone, created_at,
                        user_tenants!inner (tenant_id, total_bookings, first_interaction, last_interaction, role)
                    `,
          )
          .order("created_at", { ascending: false });
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(customerExportMetric);

    // Test appointment export with joins
    const appointmentExportMetric = await this.measureQuery(
      "Appointment Export - Complex JOINs",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("appointments")
          .select(
            `
                        id, start_time, end_time, status, final_price, quoted_price, created_at,
                        users (name, phone, email),
                        services (name, duration_minutes, base_price)
                    `,
          )
          .order("start_time", { ascending: false })
          .limit(1000);
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(appointmentExportMetric);

    return metrics;
  }

  /**
   * Analyze analytics and aggregation queries
   */
  private static async analyzeAnalyticsQueries(): Promise<
    QueryPerformanceMetrics[]
  > {
    const metrics: QueryPerformanceMetrics[] = [];

    // Test appointment count by status
    const appointmentStatsMetric = await this.measureQuery(
      "Appointment Statistics - Aggregation",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("appointments")
          .select("status, tenant_id")
          .gte(
            "start_time",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          );
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(appointmentStatsMetric);

    // Test revenue calculation
    const revenueMetric = await this.measureQuery(
      "Revenue Calculation - Financial Aggregation",
      async () => {
        const start = Date.now();
        const { data, error } = await supabase
          .from("appointments")
          .select("final_price, quoted_price, status, tenant_id, created_at")
          .eq("status", "completed")
          .gte(
            "start_time",
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          );
        return { data, error, executionTime: Date.now() - start };
      },
    );
    metrics.push(revenueMetric);

    return metrics;
  }

  /**
   * Measure query execution time and analyze results
   */
  private static async measureQuery(
    queryName: string,
    queryFunction: () => Promise<{
      data: any;
      error: any;
      executionTime: number;
    }>,
  ): Promise<QueryPerformanceMetrics> {
    try {
      console.log(`⏱️ Measuring: ${queryName}`);

      const result = await queryFunction();

      if (result.error) {
        console.error(`❌ Query failed: ${queryName}`, result.error);
        return {
          queryName,
          executionTime: result.executionTime,
          recordsReturned: 0,
          complexity: "high",
          recommendations: [`Query failed: ${result.error.message}`],
        };
      }

      const recordCount = Array.isArray(result.data) ? result.data.length : 1;
      const complexity = this.calculateComplexity(
        result.executionTime,
        recordCount,
      );
      const recommendations = this.generateQueryRecommendations(
        queryName,
        result.executionTime,
        recordCount,
      );

      console.log(
        `✅ ${queryName}: ${result.executionTime}ms, ${recordCount} records`,
      );

      return {
        queryName,
        executionTime: result.executionTime,
        recordsReturned: recordCount,
        complexity,
        recommendations,
      };
    } catch (error) {
      console.error(`❌ Error measuring ${queryName}:`, error);
      return {
        queryName,
        executionTime: 0,
        recordsReturned: 0,
        complexity: "high",
        recommendations: [
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      };
    }
  }

  /**
   * Calculate query complexity based on execution time and data volume
   */
  private static calculateComplexity(
    executionTime: number,
    recordCount: number,
  ): "low" | "medium" | "high" {
    const timeScore = executionTime > 2000 ? 3 : executionTime > 1000 ? 2 : 1;
    const volumeScore = recordCount > 1000 ? 3 : recordCount > 100 ? 2 : 1;
    const totalScore = timeScore + volumeScore;

    if (totalScore >= 5) return "high";
    if (totalScore >= 3) return "medium";
    return "low";
  }

  /**
   * Generate specific recommendations for individual queries
   */
  private static generateQueryRecommendations(
    queryName: string,
    executionTime: number,
    recordCount: number,
  ): string[] {
    const recommendations: string[] = [];

    if (executionTime > 2000) {
      recommendations.push(
        "Execution time > 2s - Critical optimization needed",
      );
    } else if (executionTime > 1000) {
      recommendations.push("Execution time > 1s - Consider optimization");
    }

    if (recordCount > 1000) {
      recommendations.push("Large dataset - Consider pagination");
    }

    if (queryName.includes("JOIN") || queryName.includes("Complex")) {
      recommendations.push(
        "Complex query - Consider query optimization or caching",
      );
    }

    if (queryName.includes("Export")) {
      recommendations.push(
        "Export query - Consider background processing for large datasets",
      );
    }

    if (queryName.includes("Aggregation")) {
      recommendations.push(
        "Aggregation query - Consider materialized views or pre-computed values",
      );
    }

    return recommendations;
  }

  /**
   * Generate overall performance recommendations
   */
  private static generatePerformanceRecommendations(
    metrics: QueryPerformanceMetrics[],
  ): string[] {
    const recommendations: string[] = [];

    const slowQueries = metrics.filter((m) => m.executionTime > 1000);
    const complexQueries = metrics.filter((m) => m.complexity === "high");
    const avgTime =
      metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length;

    if (slowQueries.length > 0) {
      recommendations.push(
        `${slowQueries.length} queries are slower than 1 second - Priority optimization needed`,
      );
    }

    if (complexQueries.length > 3) {
      recommendations.push(
        "Multiple high-complexity queries detected - Consider architectural improvements",
      );
    }

    if (avgTime > 500) {
      recommendations.push(
        "Average query time is high - Implement query caching",
      );
    }

    recommendations.push(
      "Implement database connection pooling for production",
    );
    recommendations.push("Add query monitoring and alerting");
    recommendations.push(
      "Consider implementing read replicas for heavy analytical queries",
    );

    return recommendations;
  }

  /**
   * Generate database index suggestions
   */
  private static generateIndexSuggestions(
    metrics: QueryPerformanceMetrics[],
  ): string[] {
    const suggestions: string[] = [];

    // Analyze common query patterns to suggest indexes
    suggestions.push(
      "CREATE INDEX idx_appointments_tenant_status ON appointments(tenant_id, status);",
    );
    suggestions.push(
      "CREATE INDEX idx_appointments_start_time ON appointments(start_time DESC);",
    );
    suggestions.push(
      "CREATE INDEX idx_appointments_user_tenant ON appointments(user_id, tenant_id);",
    );
    suggestions.push(
      "CREATE INDEX idx_users_created_at ON users(created_at DESC);",
    );
    suggestions.push(
      "CREATE INDEX idx_user_tenants_tenant_role ON user_tenants(tenant_id, role);",
    );
    suggestions.push(
      "CREATE INDEX idx_services_tenant_active ON services(tenant_id, is_active);",
    );
    suggestions.push(
      "CREATE INDEX idx_conversation_history_tenant_time ON conversation_history(tenant_id, created_at DESC);",
    );
    suggestions.push(
      "CREATE INDEX idx_tenants_status_plan ON tenants(status, subscription_plan);",
    );

    return suggestions;
  }

  /**
   * Generate database schema optimization script
   */
  static generateOptimizationScript(): string {
    return `
-- ===================================
-- DATABASE OPTIMIZATION SCRIPT
-- Generated: ${new Date().toISOString()}
-- ===================================

-- Performance Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_tenant_status 
    ON appointments(tenant_id, status);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_start_time 
    ON appointments(start_time DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_user_tenant 
    ON appointments(user_id, tenant_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_service_time 
    ON appointments(service_id, start_time DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at 
    ON users(created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_tenant_role 
    ON user_tenants(tenant_id, role);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tenants_user_tenant 
    ON user_tenants(user_id, tenant_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_tenant_active 
    ON services(tenant_id, is_active);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_created_at 
    ON services(created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_tenant_time 
    ON conversation_history(tenant_id, created_at DESC);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status_plan 
    ON tenants(status, subscription_plan);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_created_at 
    ON tenants(created_at DESC);

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_composite_analytics
    ON appointments(tenant_id, status, start_time DESC, user_id);
    
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_composite_search
    ON users(created_at DESC, name, email);

-- Analyze tables to update statistics
ANALYZE appointments;
ANALYZE users;
ANALYZE user_tenants;
ANALYZE services;
ANALYZE tenants;
ANALYZE conversation_history;

-- ===================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ===================================

-- Daily appointment statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_appointment_stats AS
SELECT 
    tenant_id,
    DATE(start_time) as appointment_date,
    COUNT(*) as total_appointments,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments,
    SUM(CASE WHEN status = 'completed' THEN COALESCE(final_price, quoted_price, 0) ELSE 0 END) as daily_revenue
FROM appointments 
WHERE start_time >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, DATE(start_time);

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant_date 
    ON daily_appointment_stats(tenant_id, appointment_date DESC);

-- Monthly tenant metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_tenant_metrics AS
SELECT 
    t.id as tenant_id,
    t.business_name,
    t.subscription_plan,
    DATE_TRUNC('month', CURRENT_DATE) as metric_month,
    COUNT(DISTINCT ut.user_id) as active_customers,
    COUNT(a.id) as total_appointments,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
    SUM(CASE WHEN a.status = 'completed' THEN COALESCE(a.final_price, a.quoted_price, 0) ELSE 0 END) as monthly_revenue
FROM tenants t
LEFT JOIN user_tenants ut ON t.id = ut.tenant_id
LEFT JOIN appointments a ON t.id = a.tenant_id AND a.start_time >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.id, t.business_name, t.subscription_plan;

-- Customer lifetime value view
CREATE MATERIALIZED VIEW IF NOT EXISTS customer_ltv_metrics AS
SELECT 
    ut.user_id,
    ut.tenant_id,
    u.name,
    u.email,
    COUNT(a.id) as total_appointments,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
    SUM(CASE WHEN a.status = 'completed' THEN COALESCE(a.final_price, a.quoted_price, 0) ELSE 0 END) as lifetime_value,
    MIN(a.start_time) as first_appointment,
    MAX(a.start_time) as last_appointment,
    EXTRACT(days FROM CURRENT_DATE - MAX(a.start_time::date)) as days_since_last
FROM user_tenants ut
JOIN users u ON ut.user_id = u.id
LEFT JOIN appointments a ON ut.user_id = a.user_id AND ut.tenant_id = a.tenant_id
GROUP BY ut.user_id, ut.tenant_id, u.name, u.email;

-- Refresh materialized views (should be scheduled)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_appointment_stats;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_tenant_metrics;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY customer_ltv_metrics;
`;
  }
}
