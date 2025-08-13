import { Logger } from 'winston';
import { TenantMetricsRedisCache } from './tenant-metrics-redis-cache.service';
export interface TenantMetricsResult {
    tenant_id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    total_appointments: number;
    confirmed_appointments: number;
    cancelled_appointments: number;
    completed_appointments: number;
    pending_appointments: number;
    total_revenue: number;
    monthly_revenue: number;
    average_value: number;
    total_customers: number;
    new_customers: number;
    returning_customers: number;
    appointments_growth_rate: number;
    revenue_growth_rate: number;
    customer_growth_rate: number;
    revenue_platform_percentage: number;
    appointments_platform_percentage: number;
    customers_platform_percentage: number;
    business_health_score: number;
    risk_level: string;
    risk_score: number;
}
export interface DateRange {
    start: Date;
    end: Date;
}
export declare class TenantMetricsCalculatorService {
    private logger;
    private client;
    private cache;
    constructor(logger: Logger, redisCache: TenantMetricsRedisCache);
    calculateTenantMetrics(tenantId: string, periodType: string, platformTotals?: any): Promise<TenantMetricsResult>;
    private calculateFreshMetrics;
    private getPlatformTotals;
    private calculateParticipationMetrics;
    private calculateGrowthMetrics;
    private calculateHealthMetrics;
    private getTenantMetricsForRange;
    private calculateBusinessHealthScore;
    private calculateRiskScore;
    private getDateRange;
    private getPreviousPeriodRange;
    private calculateGrowthRate;
    private getRiskLevel;
    private getEmptyMetrics;
    private getCacheTTL;
    clearTenantCache(tenantId: string): Promise<void>;
}
