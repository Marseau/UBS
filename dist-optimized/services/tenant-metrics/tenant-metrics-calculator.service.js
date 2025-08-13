"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMetricsCalculatorService = void 0;
const database_1 = require("../../config/database");
class TenantMetricsCalculatorService {
    constructor(logger, redisCache) {
        this.logger = logger;
        this.client = (0, database_1.getAdminClient)();
        this.cache = redisCache;
    }
    async calculateTenantMetrics(tenantId, periodType, platformTotals) {
        const startTime = Date.now();
        try {
            this.logger.info('Starting tenant metrics calculation', {
                tenantId,
                periodType,
                timestamp: startTime
            });
            const dateRange = this.getDateRange(periodType);
            const cacheKey = `tenant_metrics:${tenantId}:${periodType}`;
            let cachedResult = await this.cache.get(cacheKey);
            if (cachedResult) {
                this.logger.debug('Cache hit for tenant metrics', {
                    tenantId,
                    periodType,
                    cacheKey
                });
                return cachedResult;
            }
            const tenantMetrics = await this.calculateFreshMetrics(tenantId, dateRange, periodType);
            const platformData = platformTotals || await this.getPlatformTotals(dateRange);
            const participationMetrics = this.calculateParticipationMetrics(tenantMetrics, platformData);
            const growthMetrics = await this.calculateGrowthMetrics(tenantId, periodType, tenantMetrics);
            const healthMetrics = await this.calculateHealthMetrics(tenantId, tenantMetrics, periodType);
            const result = {
                tenant_id: tenantId,
                period_type: periodType,
                period_start: dateRange.start.toISOString().split('T')[0],
                period_end: dateRange.end.toISOString().split('T')[0],
                ...tenantMetrics,
                ...participationMetrics,
                ...growthMetrics,
                ...healthMetrics
            };
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
        }
        catch (error) {
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
    async calculateFreshMetrics(tenantId, dateRange, periodType) {
        const startDate = dateRange.start.toISOString().split('T')[0];
        const endDate = dateRange.end.toISOString().split('T')[0];
        try {
            const { data, error } = await this.client
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
            if (!data) {
                this.logger.warn('No data returned from PostgreSQL function', {
                    tenantId,
                    periodType
                });
                return this.getEmptyMetrics();
            }
            return {
                total_revenue: data.monthly_revenue || 0,
                total_appointments: data.total_appointments || 0,
                total_customers: data.new_customers || 0,
                new_customers: data.new_customers || 0,
                confirmed_appointments: data.confirmed_appointments || 0,
                cancelled_appointments: data.cancelled_appointments || 0,
                completed_appointments: data.completed_appointments || 0,
                pending_appointments: data.pending_appointments || 0,
                returning_customers: data.returning_customers || 0,
                average_value: data.average_value || 0,
                monthly_revenue: data.monthly_revenue || 0
            };
        }
        catch (error) {
            this.logger.error('Error in calculateFreshMetrics', {
                tenantId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async getPlatformTotals(dateRange) {
        const cacheKey = `platform_totals:${dateRange.start.toISOString().split('T')[0]}:${dateRange.end.toISOString().split('T')[0]}`;
        let cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const { data: result, error } = await this.client
                .rpc('get_platform_totals', {
                p_start_date: dateRange.start.toISOString().split('T')[0],
                p_end_date: dateRange.end.toISOString().split('T')[0]
            });
            if (error)
                throw error;
            const platformTotals = result || {
                total_tenants: 0,
                active_tenants: 0,
                total_revenue: 0,
                total_appointments: 0,
                total_customers: 0,
                total_conversations: 0
            };
            await this.cache.set(cacheKey, platformTotals, 15 * 60 * 1000);
            return platformTotals;
        }
        catch (error) {
            this.logger.error('Error getting platform totals', {
                dateRange,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    calculateParticipationMetrics(tenantMetrics, platformTotals) {
        return {
            revenue_platform_percentage: platformTotals.total_revenue > 0 ?
                (tenantMetrics.total_revenue / platformTotals.total_revenue) * 100 : 0,
            appointments_platform_percentage: platformTotals.total_appointments > 0 ?
                (tenantMetrics.total_appointments / platformTotals.total_appointments) * 100 : 0,
            customers_platform_percentage: platformTotals.total_customers > 0 ?
                (tenantMetrics.total_customers / platformTotals.total_customers) * 100 : 0
        };
    }
    async calculateGrowthMetrics(tenantId, periodType, currentMetrics) {
        try {
            const previousPeriodRange = this.getPreviousPeriodRange(periodType);
            const previousMetrics = await this.getTenantMetricsForRange(tenantId, previousPeriodRange);
            return {
                appointments_growth_rate: this.calculateGrowthRate(currentMetrics.total_appointments, previousMetrics.total_appointments),
                revenue_growth_rate: this.calculateGrowthRate(currentMetrics.total_revenue, previousMetrics.total_revenue),
                customer_growth_rate: this.calculateGrowthRate(currentMetrics.total_customers, previousMetrics.total_customers)
            };
        }
        catch (error) {
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
    async calculateHealthMetrics(tenantId, metrics, periodType) {
        try {
            const [healthScore, riskScore] = await Promise.all([
                this.calculateBusinessHealthScore(tenantId, periodType),
                this.calculateRiskScore(tenantId, periodType)
            ]);
            return {
                business_health_score: healthScore,
                risk_score: riskScore,
                risk_level: this.getRiskLevel(riskScore)
            };
        }
        catch (error) {
            this.logger.warn('Error calculating health metrics, using defaults', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                business_health_score: 75,
                risk_score: 25,
                risk_level: 'Saudável'
            };
        }
    }
    async getTenantMetricsForRange(tenantId, dateRange) {
        const cacheKey = `tenant_range_metrics:${tenantId}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
        let cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const { data: result, error } = await this.client
                .rpc('get_tenant_metrics_for_period', {
                p_tenant_id: tenantId,
                p_start_date: dateRange.start.toISOString().split('T')[0],
                p_end_date: dateRange.end.toISOString().split('T')[0],
                p_period_type: '30d'
            });
            if (error)
                throw error;
            const metrics = result || this.getEmptyMetrics();
            await this.cache.set(cacheKey, metrics, 10 * 60 * 1000);
            return metrics;
        }
        catch (error) {
            this.logger.error('Error getting tenant metrics for range', {
                tenantId,
                dateRange,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return this.getEmptyMetrics();
        }
    }
    async calculateBusinessHealthScore(tenantId, periodType) {
        try {
            const { data: result, error } = await this.client
                .rpc('calculate_business_health_score', {
                p_tenant_id: tenantId,
                p_period_type: periodType
            });
            if (error)
                throw error;
            return (typeof result === 'number' ? result : result?.[0] || 75);
        }
        catch (error) {
            this.logger.warn('Error calculating business health score', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return 75;
        }
    }
    async calculateRiskScore(tenantId, periodType) {
        try {
            const { data: result, error } = await this.client
                .rpc('calculate_risk_score', {
                p_tenant_id: tenantId,
                p_period_type: periodType
            });
            if (error)
                throw error;
            return (typeof result === 'number' ? result : result?.[0] || 25);
        }
        catch (error) {
            this.logger.warn('Error calculating risk score', {
                tenantId,
                periodType,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return 25;
        }
    }
    getDateRange(period) {
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
    getPreviousPeriodRange(period) {
        const currentRange = this.getDateRange(period);
        const duration = currentRange.end.getTime() - currentRange.start.getTime();
        const end = new Date(currentRange.start.getTime());
        const start = new Date(currentRange.start.getTime() - duration);
        return { start, end };
    }
    calculateGrowthRate(current, previous) {
        if (previous === 0)
            return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }
    getRiskLevel(riskScore) {
        if (riskScore >= 80)
            return 'Alto Risco';
        if (riskScore >= 60)
            return 'Risco Médio';
        if (riskScore >= 40)
            return 'Baixo Risco';
        return 'Saudável';
    }
    getEmptyMetrics() {
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
            new_customers: 0,
            returning_customers: 0
        };
    }
    getCacheTTL(periodType) {
        switch (periodType) {
            case '7d': return 5 * 60 * 1000;
            case '30d': return 15 * 60 * 1000;
            case '90d': return 30 * 60 * 1000;
            default: return 15 * 60 * 1000;
        }
    }
    async clearTenantCache(tenantId) {
        await this.cache.clearPattern(`*${tenantId}*`);
        this.logger.info('Tenant cache cleared', { tenantId });
    }
}
exports.TenantMetricsCalculatorService = TenantMetricsCalculatorService;
//# sourceMappingURL=tenant-metrics-calculator.service.js.map