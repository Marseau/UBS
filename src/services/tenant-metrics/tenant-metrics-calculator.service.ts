/**
 * Tenant Metrics Calculator Service
 * Specialized module for calculating individual tenant metrics
 * Optimized for 10,000+ tenant scale
 * 
 * @version 3.0.0 (High Scale)
 * @author UBS Team
 */

import { getAdminClient } from '../../config/database';
import { QueryCacheService } from '../query-cache.service';
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

export class TenantMetricsCalculatorService {
    private client = getAdminClient();
    private cache: TenantMetricsRedisCache;
    
    constructor(
        private logger: Logger,
        redisCache: TenantMetricsRedisCache
    ) {
        this.cache = redisCache;
    }

    /**
     * Calculate comprehensive metrics for a single tenant
     * Optimized with caching and error handling
     */
    async calculateTenantMetrics(
        tenantId: string, 
        periodType: string,
        platformTotals?: any
    ): Promise<TenantMetricsResult> {
        const startTime = Date.now();
        
        try {
            this.logger.info('Starting tenant metrics calculation', {
                tenantId,
                periodType,
                timestamp: startTime
            });

            const dateRange = this.getDateRange(periodType);
            
            // Check cache first
            const cacheKey = `tenant_metrics:${tenantId}:${periodType}`;
            let cachedResult = await this.cache.get(cacheKey);
            
            if (cachedResult) {
                this.logger.debug('Cache hit for tenant metrics', {
                    tenantId,
                    periodType,
                    cacheKey
                });
                return cachedResult as TenantMetricsResult;
            }

            // Calculate fresh metrics using optimized PostgreSQL functions
            const tenantMetrics = await this.calculateFreshMetrics(tenantId, dateRange, periodType);
            
            // Get platform totals for participation calculation
            const platformData = platformTotals || await this.getPlatformTotals(dateRange);
            
            // Calculate participation percentages
            const participationMetrics = this.calculateParticipationMetrics(tenantMetrics, platformData);
            
            // Calculate growth rates
            const growthMetrics = await this.calculateGrowthMetrics(tenantId, periodType, tenantMetrics);
            
            // Calculate business health and risk scores
            const healthMetrics = await this.calculateHealthMetrics(tenantId, tenantMetrics, periodType);
            
            // Combine all metrics
            const result: TenantMetricsResult = {
                tenant_id: tenantId,
                period_type: periodType,
                period_start: dateRange.start.toISOString().split('T')[0],
                period_end: dateRange.end.toISOString().split('T')[0],
                ...tenantMetrics,
                ...participationMetrics,
                ...growthMetrics,
                ...healthMetrics
            };

            // Cache result for future requests
            await this.cache.set(cacheKey, result, this.getCacheTTL(periodType));
            
            const duration = Date.now() - startTime;
            this.logger.info('Tenant metrics calculation completed', {
                tenantId,
                periodType,
                duration: `${duration}ms`,
                revenue: tenantMetrics.total_revenue,
                appointments: tenantMetrics.total_appointments
            });

            return result;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Error calculating tenant metrics', {
                tenantId,
                periodType,
                duration: `${duration}ms`,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Calculate fresh metrics from database using PostgreSQL functions
     */
    private async calculateFreshMetrics(
        tenantId: string, 
        dateRange: DateRange, 
        periodType: string
    ): Promise<any> {
        const startDate = dateRange.start.toISOString().split('T')[0];
        const endDate = dateRange.end.toISOString().split('T')[0];

        try {
            const { data, error } = await (this.client as any)
                .rpc('get_tenant_metrics_for_period', {
                    p_tenant_id: tenantId,
                    p_start_date: startDate,
                    p_end_date: endDate,
                    p_period_type: periodType
                });

            if (error) {
                this.logger.error('PostgreSQL function error', {
                    tenantId,
                    error: error.message,
                    function: 'get_tenant_metrics_for_period'
                });
                throw error;
            }

            if (!data || !Array.isArray(data) || data.length === 0) {
                this.logger.warn('No data returned from PostgreSQL function', {
                    tenantId,
                    periodType
                });
                return this.getEmptyMetrics();
            }

            // PostgreSQL function returns an array, get first result
            const result = data[0];

            return {
                total_revenue: result.total_revenue || 0,
                total_appointments: result.total_appointments || 0,
                total_customers: result.total_customers || 0,
                new_customers: result.new_customers || 0,
                confirmed_appointments: result.confirmed_appointments || 0,
                cancelled_appointments: result.cancelled_appointments || 0,
                completed_appointments: result.completed_appointments || 0,
                pending_appointments: result.pending_appointments || 0,
                average_value: result.average_value || 0,
                monthly_revenue: result.total_revenue || 0,
                // NEW: Services metrics (FIXED - access from array result)
                services_count: result.services_count || 0,
                services: result.services || []
            };
            
        } catch (error) {
            this.logger.error('Error in calculateFreshMetrics', {
                tenantId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Calculate platform totals with caching
     */
    private async getPlatformTotals(dateRange: DateRange): Promise<any> {
        const cacheKey = `platform_totals:${dateRange.start.toISOString().split('T')[0]}:${dateRange.end.toISOString().split('T')[0]}`;
        
        let cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const { data: result, error } = await (this.client as any)
                .rpc('get_platform_totals', {
                    p_start_date: dateRange.start.toISOString().split('T')[0],
                    p_end_date: dateRange.end.toISOString().split('T')[0]
                });

            if (error) throw error;

            const platformTotals = result || {
                total_tenants: 0,
                active_tenants: 0,
                total_revenue: 0,
                total_appointments: 0,
                total_customers: 0,
                total_conversations: 0
            };

            await this.cache.set(cacheKey, platformTotals, 15 * 60 * 1000); // 15 minutes
            return platformTotals;
            
        } catch (error) {
            this.logger.error('Error getting platform totals', {
                dateRange,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Calculate participation metrics
     */
    private calculateParticipationMetrics(tenantMetrics: any, platformTotals: any): any {
        return {
            revenue_platform_percentage: platformTotals.total_revenue > 0 ? 
                (tenantMetrics.total_revenue / platformTotals.total_revenue) * 100 : 0
        };
    }

    /**
     * Calculate growth metrics by comparing with previous period
     */
    private async calculateGrowthMetrics(
        tenantId: string, 
        periodType: string, 
        currentMetrics: any
    ): Promise<any> {
        try {
            const previousPeriodRange = this.getPreviousPeriodRange(periodType);
            const previousMetrics = await this.getTenantMetricsForRange(tenantId, previousPeriodRange);

            return {
                appointments_growth_rate: this.calculateGrowthRate(
                    currentMetrics.total_appointments, 
                    previousMetrics.total_appointments
                ),
                revenue_growth_rate: this.calculateGrowthRate(
                    currentMetrics.total_revenue, 
                    previousMetrics.total_revenue
                ),
                customer_growth_rate: this.calculateGrowthRate(
                    currentMetrics.total_customers, 
                    previousMetrics.total_customers
                )
            };
        } catch (error) {
            this.logger.warn('Error calculating growth metrics, using defaults', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            return {
                appointments_growth_rate: 0,
                revenue_growth_rate: 0,
                customer_growth_rate: 0
            };
        }
    }

    /**
     * Calculate risk metrics using database functions
     */
    private async calculateHealthMetrics(
        tenantId: string, 
        metrics: any, 
        periodType: string
    ): Promise<any> {
        try {
            const riskScore = await this.calculateRiskScore(tenantId, periodType);

            return {
                risk_score: riskScore
            };
        } catch (error) {
            this.logger.warn('Error calculating risk metrics, using defaults', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            return {
                risk_score: 25
            };
        }
    }

    /**
     * Get tenant metrics for specific date range
     */
    private async getTenantMetricsForRange(tenantId: string, dateRange: DateRange): Promise<any> {
        const cacheKey = `tenant_range_metrics:${tenantId}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
        
        let cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const { data: result, error } = await (this.client as any)
                .rpc('get_tenant_metrics_for_period', {
                    p_tenant_id: tenantId,
                    p_start_date: dateRange.start.toISOString().split('T')[0],
                    p_end_date: dateRange.end.toISOString().split('T')[0],
                    p_period_type: '30d'
                });

            if (error) throw error;

            const metrics = result || this.getEmptyMetrics();
            await this.cache.set(cacheKey, metrics, 10 * 60 * 1000); // 10 minutes
            
            return metrics;
            
        } catch (error) {
            this.logger.error('Error getting tenant metrics for range', {
                tenantId,
                dateRange,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return this.getEmptyMetrics();
        }
    }


    /**
     * Calculate risk score using database function
     */
    private async calculateRiskScore(tenantId: string, periodType: string): Promise<number> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('calculate_risk_score', {
                    p_tenant_id: tenantId,
                    p_period_type: periodType
                });

            if (error) throw error;
            return (typeof result === 'number' ? result : result?.[0] || 25);
            
        } catch (error) {
            this.logger.warn('Error calculating risk score', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return 25;
        }
    }

    // Helper methods
    private getDateRange(period: string): DateRange {
        const end = new Date();
        const start = new Date();
        
        switch (period) {
            case '7d':
                start.setDate(end.getDate() - 7);
                break;
            case '30d':
                start.setDate(end.getDate() - 30);
                break;
            case '90d':
                start.setDate(end.getDate() - 90);
                break;
            default:
                start.setDate(end.getDate() - 30);
        }
        
        return { start, end };
    }

    private getPreviousPeriodRange(period: string): DateRange {
        const currentRange = this.getDateRange(period);
        const duration = currentRange.end.getTime() - currentRange.start.getTime();
        
        const end = new Date(currentRange.start.getTime());
        const start = new Date(currentRange.start.getTime() - duration);
        
        return { start, end };
    }

    private calculateGrowthRate(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }


    private getEmptyMetrics(): any {
        return {
            total_appointments: 0,
            confirmed_appointments: 0,
            cancelled_appointments: 0,
            completed_appointments: 0,
            pending_appointments: 0,
            total_revenue: 0,
            monthly_revenue: 0,
            average_value: 0,
            total_customers: 0,
            new_customers: 0
        };
    }

    private getCacheTTL(periodType: string): number {
        switch (periodType) {
            case '7d': return 5 * 60 * 1000;   // 5 minutes for recent data
            case '30d': return 15 * 60 * 1000; // 15 minutes for monthly
            case '90d': return 30 * 60 * 1000; // 30 minutes for quarterly
            default: return 15 * 60 * 1000;
        }
    }

    /**
     * Clear cache for specific tenant
     */
    async clearTenantCache(tenantId: string): Promise<void> {
        await this.cache.clearPattern(`*${tenantId}*`);
        this.logger.info('Tenant cache cleared', { tenantId });
    }
}