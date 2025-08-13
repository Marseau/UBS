/**
 * UNIFIED CRON SERVICE TYPES
 * Definições TypeScript para o sistema unificado de cron jobs
 */

export interface CronJobConfig {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  timeout?: number;
  retries?: number;
}

export interface CronJobResult {
  success: boolean;
  jobName: string;
  startTime: Date;
  endTime: Date;
  executionTimeMs: number;
  processed?: number;
  errors?: string[];
  data?: any;
}

export interface CronSequence {
  name: string;
  jobs: CronJobConfig[];
  totalTimeoutMs: number;
  parallelExecution?: boolean;
}

export interface UnifiedCronStatus {
  isInitialized: boolean;
  activeJobs: number;
  lastExecution?: Date;
  nextExecution?: Date;
  executionHistory: CronJobResult[];
  performance: {
    avgExecutionTime: number;
    successRate: number;
    memoryUsage: number;
    errorRate: number;
  };
}

export interface MetricsCalculationParams {
  calculationDate?: string;
  periodDays?: number;
  tenantIds?: string[];
  forceRecalculation?: boolean;
  includeHistorical?: boolean;
}

export interface AnalyticsAggregationParams {
  aggregationType: "daily" | "weekly" | "monthly";
  startDate?: string;
  endDate?: string;
  refreshMaterializedViews?: boolean;
}

export interface CacheCleanupParams {
  pattern?: string;
  maxAge?: number;
  dryRun?: boolean;
}

export interface CronHealthCheck {
  service: string;
  status: "healthy" | "warning" | "error";
  lastCheck: Date;
  responseTime: number;
  issues?: string[];
}

export interface UnifiedCronConfig {
  enabled: boolean;
  environment: "development" | "staging" | "production";
  timezone: string;
  maxConcurrentJobs: number;
  defaultTimeout: number;
  retryAttempts: number;
  monitoring: {
    enableMetrics: boolean;
    enableAlerts: boolean;
    maxExecutionTime: number;
    maxMemoryUsage: number;
  };
}

export interface CronJobStep {
  stepName: string;
  description: string;
  estimatedDuration: number;
  dependencies?: string[];
  canSkipOnError?: boolean;
}

export interface SequenceExecutionPlan {
  sequenceName: string;
  totalSteps: number;
  estimatedDuration: number;
  steps: CronJobStep[];
  parallelGroups?: CronJobStep[][];
}

export interface CronPerformanceMetrics {
  jobName: string;
  executionCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  successCount: number;
  failureCount: number;
  lastExecution: Date;
  performanceTrend: "improving" | "stable" | "degrading";
}

export interface CronAlert {
  alertType:
    | "execution_timeout"
    | "high_error_rate"
    | "memory_leak"
    | "dependency_failure";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  jobName: string;
  timestamp: Date;
  resolved?: boolean;
}

export interface UnifiedCronDashboard {
  status: UnifiedCronStatus;
  performance: CronPerformanceMetrics[];
  healthChecks: CronHealthCheck[];
  activeAlerts: CronAlert[];
  upcomingJobs: {
    jobName: string;
    nextRun: Date;
    estimatedDuration: number;
  }[];
}
