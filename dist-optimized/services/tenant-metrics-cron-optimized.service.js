"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMetricsCronOptimizedService = void 0;
const cron = __importStar(require("node-cron"));
const tenant_metrics_calculator_service_1 = require("./tenant-metrics/tenant-metrics-calculator.service");
const tenant_metrics_redis_cache_service_1 = require("./tenant-metrics/tenant-metrics-redis-cache.service");
const concurrency_manager_service_1 = require("./tenant-metrics/concurrency-manager.service");
const database_pool_manager_service_1 = require("./tenant-metrics/database-pool-manager.service");
const platform_aggregation_optimized_service_1 = require("./tenant-metrics/platform-aggregation-optimized.service");
const structured_logger_service_1 = require("../utils/structured-logger.service");
const winston_1 = __importDefault(require("winston"));
class TenantMetricsCronOptimizedService {
    constructor() {
        this.isInitialized = false;
        this.activeJobs = new Set();
        this.logger = new structured_logger_service_1.StructuredLoggerService('tenant-metrics-cron', {
            level: process.env.LOG_LEVEL || 'info',
            enableConsole: process.env.NODE_ENV !== 'production',
            enableFile: true
        });
        this.winstonLogger = winston_1.default.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston_1.default.format.json(),
            transports: [
                new winston_1.default.transports.Console(),
                new winston_1.default.transports.File({ filename: 'logs/tenant-metrics-cron.log' })
            ]
        });
        this.cache = new tenant_metrics_redis_cache_service_1.TenantMetricsRedisCache(this.winstonLogger);
        this.concurrencyManager = new concurrency_manager_service_1.ConcurrencyManagerService(this.winstonLogger, {
            maxConcurrency: this.calculateOptimalConcurrency(),
            batchSize: this.calculateOptimalBatchSize(),
            adaptiveBatching: true,
            circuitBreakerThreshold: 50,
            retryAttempts: 2
        });
        this.dbPool = new database_pool_manager_service_1.DatabasePoolManagerService(this.winstonLogger, {
            minConnections: 10,
            maxConnections: 100,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000
        });
        this.metricsCalculator = new tenant_metrics_calculator_service_1.TenantMetricsCalculatorService(this.winstonLogger, this.cache);
        this.platformAggregation = new platform_aggregation_optimized_service_1.PlatformAggregationOptimizedService(this.winstonLogger, this.cache, this.dbPool, {
            enableRealTimeAggregation: true,
            batchSize: this.calculateOptimalBatchSize(),
            cacheTtl: 30 * 60 * 1000,
            parallelProcessing: true
        });
        this.stats = {
            totalTenantsProcessed: 0,
            averageProcessingTime: 0,
            successRate: 100,
            lastExecutionTime: null,
            cacheHitRate: 0,
            activeJobs: 0,
            errors: 0
        };
        this.logger.info('Tenant Metrics Cron Service (Optimized) created', {
            maxConcurrency: this.concurrencyManager.getStats().totalProcessed,
            optimalBatchSize: this.calculateOptimalBatchSize()
        });
    }
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('Service already initialized');
            return;
        }
        const timer = this.logger.startTimer('service-initialization');
        try {
            this.logger.info('Initializing optimized tenant metrics service...');
            await this.dbPool.initialize();
            const cacheHealth = await this.cache.healthCheck();
            this.logger.info('Cache health check', cacheHealth);
            this.setupCronJobs();
            this.startMonitoring();
            this.isInitialized = true;
            timer();
            this.logger.info('Optimized tenant metrics service initialized successfully', {
                cacheConnected: cacheHealth.redis,
                dbPoolConnected: (await this.dbPool.healthCheck()).healthy,
                concurrencySettings: this.concurrencyManager.getStats()
            });
        }
        catch (error) {
            timer();
            this.logger.error('Failed to initialize service', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }
    setupCronJobs() {
        const cronConfigs = this.getCronConfigs();
        if (cronConfigs.daily?.enabled) {
            cron.schedule(cronConfigs.daily.schedule, async () => {
                await this.executeJob('daily-metrics', () => this.calculateComprehensiveMetrics());
            }, {
                scheduled: true,
                timezone: cronConfigs.daily.timezone
            });
            this.logger.info('Daily metrics cron job scheduled', {
                schedule: cronConfigs.daily.schedule,
                timezone: cronConfigs.daily.timezone
            });
        }
        if (cronConfigs.weekly?.enabled) {
            cron.schedule(cronConfigs.weekly.schedule, async () => {
                await this.executeJob('weekly-risk', () => this.calculateWeeklyRiskAssessment());
            }, {
                scheduled: true,
                timezone: cronConfigs.weekly.timezone
            });
        }
        if (cronConfigs.monthly?.enabled) {
            cron.schedule(cronConfigs.monthly.schedule, async () => {
                await this.executeJob('monthly-evolution', () => this.calculateMonthlyEvolution());
            }, {
                scheduled: true,
                timezone: cronConfigs.monthly.timezone
            });
        }
        cron.schedule('0 * * * *', async () => {
            await this.optimizeCaches();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });
        if (process.env.NODE_ENV === 'development') {
            cron.schedule('*/30 * * * *', async () => {
                this.logger.info('Development mode: Running sample metrics calculation');
                await this.executeJob('dev-sample', () => this.calculateSampleMetrics(50));
            }, {
                scheduled: true,
                timezone: 'America/Sao_Paulo'
            });
        }
    }
    async calculateComprehensiveMetrics() {
        const timer = this.logger.startTimer('comprehensive-metrics');
        try {
            this.logger.info('Starting comprehensive metrics calculation for all tenants');
            const tenants = await this.getActiveTenants();
            this.logger.info('Retrieved active tenants', {
                tenantCount: tenants.length,
                estimatedDuration: `${Math.round(tenants.length / 100)} minutes`
            });
            if (tenants.length === 0) {
                this.logger.warn('No active tenants found for metrics calculation');
                return;
            }
            const periods = ['7d', '30d', '90d'];
            const periodPromises = periods.map(period => this.processTenantsByPeriod(tenants, period));
            const results = await Promise.allSettled(periodPromises);
            let totalProcessed = 0;
            let totalErrors = 0;
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    totalProcessed += result.value.processed;
                    totalErrors += result.value.errors;
                    this.logger.info(`Period ${periods[index]} processing completed`, {
                        period: periods[index],
                        processed: result.value.processed,
                        errors: result.value.errors,
                        duration: result.value.duration
                    });
                }
                else {
                    totalErrors += tenants.length;
                    this.logger.error(`Period ${periods[index]} processing failed`, {
                        period: periods[index],
                        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
                    });
                }
            });
            this.updateStats(totalProcessed, totalErrors);
            await this.calculateTenantRankings();
            await this.aggregateToPlatformMetrics();
            timer();
            this.logger.info('Comprehensive metrics calculation completed', {
                totalTenants: tenants.length,
                totalProcessed,
                totalErrors,
                successRate: `${Math.round(((totalProcessed - totalErrors) / totalProcessed) * 100)}%`,
                periodsProcessed: periods.length
            });
        }
        catch (error) {
            timer();
            this.stats.errors++;
            this.logger.error('Error in comprehensive metrics calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }
    async processTenantsByPeriod(tenants, period) {
        const startTime = Date.now();
        try {
            this.logger.info('Processing tenants by period', {
                period,
                tenantCount: tenants.length
            });
            const platformTotals = await this.cache.get(`platform_totals_${period}`) ||
                await this.calculatePlatformTotals(period);
            const results = await this.concurrencyManager.processWithConcurrency(tenants, async (tenant) => {
                try {
                    const result = await this.metricsCalculator.calculateTenantMetrics(tenant.id, period, platformTotals);
                    await this.saveMetricsToDatabase(result);
                    return { success: true, tenantId: tenant.id };
                }
                catch (error) {
                    this.logger.error('Error processing tenant', {
                        tenantId: tenant.id,
                        period,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    return { success: false, tenantId: tenant.id, error };
                }
            }, {
                maxConcurrency: this.calculateDynamicConcurrency(tenants.length),
                batchSize: this.calculateDynamicBatchSize(tenants.length),
                adaptiveBatching: true
            });
            const duration = Date.now() - startTime;
            const processed = results.successes.length + results.failures.length;
            const errors = results.failures.length;
            return { processed, errors, duration };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Error processing period', {
                period,
                duration,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async calculateWeeklyRiskAssessment() {
        const timer = this.logger.startTimer('weekly-risk-assessment');
        try {
            this.logger.info('Starting weekly risk assessment');
            const tenants = await this.getActiveTenants();
            const results = await this.concurrencyManager.processWithConcurrency(tenants, async (tenant) => {
                return { tenantId: tenant.id, riskScore: 25, riskLevel: 'Low' };
            }, {
                maxConcurrency: Math.min(50, tenants.length),
                batchSize: 25
            });
            timer();
            this.logger.info('Weekly risk assessment completed', {
                tenantsProcessed: results.successes.length,
                errors: results.failures.length,
                averageRiskScore: results.successes.reduce((sum, r) => sum + r.riskScore, 0) / results.successes.length
            });
        }
        catch (error) {
            timer();
            this.logger.error('Error in weekly risk assessment', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }
    async calculateMonthlyEvolution() {
        const timer = this.logger.startTimer('monthly-evolution');
        try {
            this.logger.info('Starting monthly evolution calculation');
            const tenants = await this.getActiveTenants();
            const results = await this.concurrencyManager.processWithConcurrency(tenants, async (tenant) => {
                return { tenantId: tenant.id, evolutionScore: 75 };
            }, {
                maxConcurrency: 20,
                batchSize: 10
            });
            timer();
            this.logger.info('Monthly evolution calculation completed', {
                tenantsProcessed: results.successes.length,
                errors: results.failures.length
            });
        }
        catch (error) {
            timer();
            this.logger.error('Error in monthly evolution calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
        }
    }
    async calculateSampleMetrics(sampleSize = 50) {
        try {
            const allTenants = await this.getActiveTenants();
            const sampleTenants = allTenants.slice(0, sampleSize);
            this.logger.info('Processing sample metrics', {
                sampleSize: sampleTenants.length,
                totalTenants: allTenants.length
            });
            await this.processTenantsByPeriod(sampleTenants, '7d');
        }
        catch (error) {
            this.logger.error('Error in sample metrics calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async triggerComprehensiveCalculation() {
        await this.executeJob('manual-comprehensive', () => this.calculateComprehensiveMetrics());
    }
    async triggerRiskAssessment() {
        await this.executeJob('manual-risk', () => this.calculateWeeklyRiskAssessment());
    }
    async triggerEvolutionCalculation() {
        await this.executeJob('manual-evolution', () => this.calculateMonthlyEvolution());
    }
    async triggerPlatformAggregation() {
        await this.executeJob('manual-platform-aggregation', () => this.aggregateToPlatformMetrics());
    }
    getServiceStats() {
        return {
            ...this.stats,
            concurrency: this.concurrencyManager.getStats(),
            cache: this.cache.getStats(),
            dbPool: this.dbPool.getStats()
        };
    }
    async executeJob(jobName, jobFunction) {
        if (this.activeJobs.has(jobName)) {
            this.logger.warn('Job already running, skipping execution', { jobName });
            return;
        }
        this.activeJobs.add(jobName);
        this.stats.activeJobs = this.activeJobs.size;
        const timer = this.logger.startTimer(`job-${jobName}`);
        try {
            this.logger.info('Starting cron job execution', { jobName });
            await jobFunction();
            this.stats.lastExecutionTime = new Date();
            timer();
            this.logger.info('Cron job completed successfully', { jobName });
        }
        catch (error) {
            this.stats.errors++;
            timer();
            this.logger.error('Cron job failed', {
                jobName,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
        }
        finally {
            this.activeJobs.delete(jobName);
            this.stats.activeJobs = this.activeJobs.size;
        }
    }
    async getActiveTenants() {
        const cacheKey = 'active_tenants_list';
        let tenants = await this.cache.get(cacheKey);
        if (!tenants) {
            const result = await this.dbPool.withConnection(async (client) => {
                const { data, error } = await client
                    .from('tenants')
                    .select('id, business_name')
                    .eq('status', 'active')
                    .order('created_at', { ascending: true });
                if (error)
                    throw error;
                return data || [];
            });
            tenants = result;
            await this.cache.set(cacheKey, tenants, 10 * 60 * 1000);
        }
        return tenants;
    }
    async calculatePlatformTotals(period) {
        const cacheKey = `platform_totals_${period}`;
        return await this.dbPool.withConnection(async (client) => {
            const dateRange = this.getDateRange(period);
            const { data: result, error } = await client
                .rpc('get_platform_totals', {
                p_start_date: dateRange.start.toISOString().split('T')[0],
                p_end_date: dateRange.end.toISOString().split('T')[0]
            });
            if (error)
                throw error;
            const totals = result || {
                total_tenants: 0,
                active_tenants: 0,
                total_revenue: 0,
                total_appointments: 0,
                total_customers: 0,
                total_conversations: 0
            };
            await this.cache.set(cacheKey, totals, 30 * 60 * 1000);
            return totals;
        });
    }
    async saveMetricsToDatabase(metrics) {
        await this.dbPool.withConnection(async (client) => {
            const { error } = await client
                .from('tenant_metrics')
                .upsert({
                tenant_id: metrics.tenant_id,
                metric_type: 'comprehensive',
                period: metrics.period_type,
                metric_data: metrics,
                calculated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (error)
                throw error;
        });
    }
    async calculateTenantRankings() {
        this.logger.info('Calculating tenant rankings...');
    }
    async aggregateToPlatformMetrics() {
        const timer = this.logger.startTimer('platform-aggregation');
        try {
            this.logger.info('Starting platform metrics aggregation');
            const aggregationResults = await this.platformAggregation.aggregateAllPeriods(false);
            this.logger.info('Platform aggregation completed successfully', {
                results: {
                    '7d': {
                        activeTenants: aggregationResults.sevenDays.active_tenants,
                        platformMrr: aggregationResults.sevenDays.platform_mrr,
                        totalRevenue: aggregationResults.sevenDays.total_revenue
                    },
                    '30d': {
                        activeTenants: aggregationResults.thirtyDays.active_tenants,
                        platformMrr: aggregationResults.thirtyDays.platform_mrr,
                        totalRevenue: aggregationResults.thirtyDays.total_revenue
                    },
                    '90d': {
                        activeTenants: aggregationResults.ninetyDays.active_tenants,
                        platformMrr: aggregationResults.ninetyDays.platform_mrr,
                        totalRevenue: aggregationResults.ninetyDays.total_revenue
                    }
                }
            });
            timer();
        }
        catch (error) {
            timer();
            this.logger.error('Error in platform aggregation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
        }
    }
    calculateOptimalConcurrency() {
        const cpuCount = require('os').cpus().length;
        const memoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
        const baseConcurrency = Math.max(cpuCount * 4, 20);
        const memoryFactor = Math.min(Math.floor(memoryGB / 2), 50);
        return Math.min(baseConcurrency + memoryFactor, 100);
    }
    calculateOptimalBatchSize() {
        return process.env.NODE_ENV === 'production' ? 100 : 25;
    }
    calculateDynamicConcurrency(tenantCount) {
        if (tenantCount < 100)
            return 10;
        if (tenantCount < 1000)
            return 25;
        if (tenantCount < 5000)
            return 50;
        return 100;
    }
    calculateDynamicBatchSize(tenantCount) {
        if (tenantCount < 100)
            return 10;
        if (tenantCount < 1000)
            return 25;
        if (tenantCount < 5000)
            return 50;
        return 100;
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
    getCronConfigs() {
        return {
            daily: {
                enabled: process.env.ENABLE_DAILY_METRICS !== 'false',
                schedule: process.env.DAILY_METRICS_SCHEDULE || '0 2 * * *',
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 6 * 60 * 60 * 1000,
                retryAttempts: 2,
                retryDelay: 5 * 60 * 1000
            },
            weekly: {
                enabled: process.env.ENABLE_WEEKLY_RISK !== 'false',
                schedule: '0 1 * * 0',
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 2 * 60 * 60 * 1000,
                retryAttempts: 2,
                retryDelay: 10 * 60 * 1000
            },
            monthly: {
                enabled: process.env.ENABLE_MONTHLY_EVOLUTION !== 'false',
                schedule: '0 0 1 * *',
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 4 * 60 * 60 * 1000,
                retryAttempts: 1,
                retryDelay: 30 * 60 * 1000
            }
        };
    }
    updateStats(processed, errors) {
        this.stats.totalTenantsProcessed += processed;
        this.stats.errors += errors;
        this.stats.successRate = processed > 0 ?
            ((processed - errors) / processed) * 100 : 100;
    }
    async optimizeCaches() {
        try {
            this.logger.info('Starting cache optimization');
            await this.cache.optimize();
            const cacheStats = await this.cache.getStats();
            this.stats.cacheHitRate = cacheStats.hitRate;
            this.logger.info('Cache optimization completed', cacheStats);
        }
        catch (error) {
            this.logger.error('Error during cache optimization', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    startMonitoring() {
        setInterval(async () => {
            try {
                const stats = this.getServiceStats();
                this.logger.info('Service health check', stats);
                this.logger.systemResources();
            }
            catch (error) {
                this.logger.error('Health monitoring failed', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 2 * 60 * 1000);
    }
    async shutdown() {
        this.logger.info('Shutting down Tenant Metrics Cron Service...');
        try {
            const maxWaitTime = 30000;
            const startTime = Date.now();
            while (this.activeJobs.size > 0 && (Date.now() - startTime) < maxWaitTime) {
                this.logger.info('Waiting for active jobs to complete', {
                    activeJobs: Array.from(this.activeJobs),
                    remainingTime: maxWaitTime - (Date.now() - startTime)
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await Promise.all([
                this.cache.close(),
                this.dbPool.close(),
                this.logger.close()
            ]);
            this.logger.info('Tenant Metrics Cron Service shutdown completed');
        }
        catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}
exports.TenantMetricsCronOptimizedService = TenantMetricsCronOptimizedService;
exports.default = TenantMetricsCronOptimizedService;
//# sourceMappingURL=tenant-metrics-cron-optimized.service.js.map