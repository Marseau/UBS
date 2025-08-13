export interface CronJobConfig {
    enabled: boolean;
    schedule: string;
    timezone: string;
    maxExecutionTime: number;
    retryAttempts: number;
    retryDelay: number;
}
export interface ServiceStats {
    totalTenantsProcessed: number;
    averageProcessingTime: number;
    successRate: number;
    lastExecutionTime: Date | null;
    cacheHitRate: number;
    activeJobs: number;
    errors: number;
}
export declare class TenantMetricsCronOptimizedService {
    private logger;
    private winstonLogger;
    private cache;
    private concurrencyManager;
    private metricsCalculator;
    private dbPool;
    private platformAggregation;
    private isInitialized;
    private activeJobs;
    private stats;
    constructor();
    initialize(): Promise<void>;
    private setupCronJobs;
    calculateComprehensiveMetrics(): Promise<void>;
    private processTenantsByPeriod;
    calculateWeeklyRiskAssessment(): Promise<void>;
    calculateMonthlyEvolution(): Promise<void>;
    private calculateSampleMetrics;
    triggerComprehensiveCalculation(): Promise<void>;
    triggerRiskAssessment(): Promise<void>;
    triggerEvolutionCalculation(): Promise<void>;
    triggerPlatformAggregation(): Promise<void>;
    getServiceStats(): ServiceStats & {
        concurrency: any;
        cache: any;
        dbPool: any;
    };
    private executeJob;
    private getActiveTenants;
    private calculatePlatformTotals;
    private saveMetricsToDatabase;
    private calculateTenantRankings;
    private aggregateToPlatformMetrics;
    private calculateOptimalConcurrency;
    private calculateOptimalBatchSize;
    private calculateDynamicConcurrency;
    private calculateDynamicBatchSize;
    private getDateRange;
    private getCronConfigs;
    private updateStats;
    private optimizeCaches;
    private startMonitoring;
    shutdown(): Promise<void>;
}
export default TenantMetricsCronOptimizedService;
