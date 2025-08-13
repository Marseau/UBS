import { Logger } from 'winston';
import { TenantMetricsRedisCache } from './tenant-metrics-redis-cache.service';
import { DatabasePoolManagerService } from './database-pool-manager.service';
export interface PlatformAggregationConfig {
    enableRealTimeAggregation: boolean;
    batchSize: number;
    cacheTtl: number;
    parallelProcessing: boolean;
}
export interface PlatformMetrics {
    id?: string;
    calculation_date: string | null;
    period_days: number | null;
    data_source: string | null;
    total_revenue: number | null;
    total_appointments: number | null;
    total_customers: number | null;
    total_ai_interactions: number | null;
    active_tenants: number | null;
    platform_mrr: number | null;
    total_chat_minutes: number | null;
    total_conversations: number | null;
    total_valid_conversations: number | null;
    total_spam_conversations: number | null;
    receita_uso_ratio: number | null;
    operational_efficiency_pct: number | null;
    spam_rate_pct: number | null;
    cancellation_rate_pct: number | null;
    revenue_usage_distortion_index: number | null;
    created_at?: string | null;
    updated_at?: string | null;
}
export declare class PlatformAggregationOptimizedService {
    private logger;
    private cache;
    private dbPool;
    private config;
    private client;
    constructor(logger: Logger, cache: TenantMetricsRedisCache, dbPool: DatabasePoolManagerService, config?: PlatformAggregationConfig);
    aggregatePlatformMetrics(period: '7d' | '30d' | '90d', forceRecalculation?: boolean): Promise<PlatformMetrics>;
    private performAggregation;
    private fallbackManualAggregation;
    private savePlatformMetrics;
    aggregateAllPeriods(forceRecalculation?: boolean): Promise<{
        sevenDays: PlatformMetrics;
        thirtyDays: PlatformMetrics;
        ninetyDays: PlatformMetrics;
    }>;
    getPlatformMetrics(period: '7d' | '30d' | '90d'): Promise<PlatformMetrics | null>;
    triggerAggregation(periods?: ('7d' | '30d' | '90d')[]): Promise<void>;
    private formatAggregationResult;
    private getDateRangeStart;
    private isTenantActive;
}
