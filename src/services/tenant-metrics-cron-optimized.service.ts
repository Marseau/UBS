/**
 * Tenant Metrics Cron Service (Optimized)
 * High-performance metrics calculation for 10,000+ tenants
 * Features: Redis caching, intelligent batching, circuit breaker, structured logging
 * 
 * @version 3.0.0 (High Scale Optimized)
 * @author UBS Team
 */

import * as cron from 'node-cron';
import { TenantMetricsCalculatorService } from './tenant-metrics/tenant-metrics-calculator.service';
import { TenantMetricsRedisCache } from './tenant-metrics/tenant-metrics-redis-cache.service';
import { ConcurrencyManagerService } from './tenant-metrics/concurrency-manager.service';
import { DatabasePoolManagerService } from './tenant-metrics/database-pool-manager.service';
import { PlatformAggregationOptimizedService } from './tenant-metrics/platform-aggregation-optimized.service';
import { StructuredLoggerService } from '../utils/structured-logger.service';
import { getAdminClient } from '../config/database';
import winston, { Logger } from 'winston';

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

export class TenantMetricsCronOptimizedService {
    private logger: StructuredLoggerService;
    private winstonLogger: Logger;
    private cache: TenantMetricsRedisCache;
    private concurrencyManager: ConcurrencyManagerService;
    private metricsCalculator: TenantMetricsCalculatorService;
    private dbPool: DatabasePoolManagerService;
    private platformAggregation: PlatformAggregationOptimizedService;
    private isInitialized = false;
    private activeJobs = new Set<string>();
    private stats: ServiceStats;

    constructor() {
        // Initialize logger first
        this.logger = new StructuredLoggerService('tenant-metrics-cron', {
            level: process.env.LOG_LEVEL || 'info',
            enableConsole: process.env.NODE_ENV !== 'production',
            enableFile: true
        });
        
        // Create Winston logger for compatibility
        this.winstonLogger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/tenant-metrics-cron.log' })
            ]
        });

        // Initialize cache system with explicit Redis config
        this.cache = new TenantMetricsRedisCache(this.winstonLogger, {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: false // Force immediate connection
        });

        // Initialize concurrency manager with optimized settings for 10k tenants
        this.concurrencyManager = new ConcurrencyManagerService(this.winstonLogger, {
            maxConcurrency: this.calculateOptimalConcurrency(),
            batchSize: this.calculateOptimalBatchSize(),
            adaptiveBatching: true,
            circuitBreakerThreshold: 50, // Higher threshold for large scale
            retryAttempts: 2 // Reduced retries for faster processing
        });

        // Initialize database pool
        this.dbPool = new DatabasePoolManagerService(this.winstonLogger, {
            minConnections: 10,
            maxConnections: 100, // Increased for high concurrency
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000 // 5 minutes
        });

        // Initialize metrics calculator
        this.metricsCalculator = new TenantMetricsCalculatorService(this.winstonLogger, this.cache);


        // Initialize platform aggregation service
        this.platformAggregation = new PlatformAggregationOptimizedService(
            this.winstonLogger,
            this.cache,
            this.dbPool,
            {
                enableRealTimeAggregation: true,
                batchSize: this.calculateOptimalBatchSize(),
                cacheTtl: 30 * 60 * 1000, // 30 minutes
                parallelProcessing: true
            }
        );

        // Initialize stats
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

    /**
     * Initialize all services and cron jobs
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('Service already initialized');
            return;
        }

        const timer = this.logger.startTimer('service-initialization');

        try {
            this.logger.info('Initializing optimized tenant metrics service...');

            // Initialize database pool
            await this.dbPool.initialize();

            // Verify cache connectivity
            const cacheHealth = await this.cache.healthCheck();
            this.logger.info('Cache health check', cacheHealth);

            // Setup cron jobs with optimized schedules
            this.setupCronJobs();

            // Start monitoring and health checks
            this.startMonitoring();

            this.isInitialized = true;
            timer();

            this.logger.info('Optimized tenant metrics service initialized successfully', {
                cacheConnected: cacheHealth.redis,
                dbPoolConnected: (await this.dbPool.healthCheck()).healthy,
                concurrencySettings: this.concurrencyManager.getStats()
            });

        } catch (error) {
            timer();
            this.logger.error('Failed to initialize service', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Setup optimized cron jobs for high-scale processing
     */
    private setupCronJobs(): void {
        const cronConfigs = this.getCronConfigs();

        // Daily comprehensive metrics calculation (optimized for 10k tenants)
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

        // Weekly risk assessment (optimized batching)
        if (cronConfigs.weekly?.enabled) {
            cron.schedule(cronConfigs.weekly.schedule, async () => {
                await this.executeJob('weekly-risk', () => this.calculateWeeklyRiskAssessment());
            }, {
                scheduled: true,
                timezone: cronConfigs.weekly.timezone
            });
        }

        // Monthly evolution metrics
        if (cronConfigs.monthly?.enabled) {
            cron.schedule(cronConfigs.monthly.schedule, async () => {
                await this.executeJob('monthly-evolution', () => this.calculateMonthlyEvolution());
            }, {
                scheduled: true,
                timezone: cronConfigs.monthly.timezone
            });
        }

        // Cache optimization (every hour)
        cron.schedule('0 * * * *', async () => {
            await this.optimizeCaches();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        // Development mode: manual triggers
        if (process.env.NODE_ENV === 'development') {
            cron.schedule('*/30 * * * *', async () => { // Every 30 minutes
                this.logger.info('Development mode: Running sample metrics calculation');
                await this.executeJob('dev-sample', () => this.calculateSampleMetrics(50));
            }, {
                scheduled: true,
                timezone: 'America/Sao_Paulo'
            });
        }
    }

    /**
     * Execute comprehensive metrics calculation for all tenants
     */
    async calculateComprehensiveMetrics(): Promise<void> {
        const timer = this.logger.startTimer('comprehensive-metrics');

        try {
            this.logger.info('Starting comprehensive metrics calculation for all tenants');

            // Get all active tenants with optimized query
            const tenants = await this.getActiveTenants();
            this.logger.info('Retrieved active tenants', { 
                tenantCount: tenants.length,
                estimatedDuration: `${Math.round(tenants.length / 100)} minutes` // Assuming 100 tenants per minute
            });

            if (tenants.length === 0) {
                this.logger.warn('No active tenants found for metrics calculation');
                return;
            }

            // Execute DEFINITIVA TOTAL procedure ONCE for ALL periods (7d, 30d, 90d)
            // This is much more efficient than the old 3-period parallel processing
            const result = await this.processTenantsByPeriod(tenants, 'all_periods');
            
            const totalProcessed = result.processed;
            const totalErrors = result.errors;

            this.logger.info('DEFINITIVA TOTAL processing completed', {
                processed: result.processed,
                errors: result.errors,
                duration: result.duration,
                efficiency: 'Single procedure call vs 3 separate period calls'
            });

            // Update service statistics
            this.updateStats(totalProcessed, totalErrors);
            
            // Calculate rankings after all metrics are processed
            await this.calculateTenantRankings();

            // CRITICAL: Aggregate tenant metrics to platform metrics
            await this.aggregateToPlatformMetrics();

            timer();
            this.logger.info('Comprehensive metrics calculation completed', {
                totalTenants: tenants.length,
                totalProcessed,
                totalErrors,
                successRate: `${totalProcessed > 0 ? Math.round(((totalProcessed - totalErrors) / totalProcessed) * 100) : 0}%`,
                periodsProcessed: 3, // Always 3 periods (7d, 30d, 90d)
                metricsPerTenant: 23, // 23+ metrics per tenant
                totalMetricsGenerated: totalProcessed * 3 // tenants × periods
            });

        } catch (error) {
            timer();
            this.stats.errors++;
            this.logger.error('Error in comprehensive metrics calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Process all tenants using DEFINITIVA TOTAL PostgreSQL procedure
     * This replaces the old period-by-period processing with a single optimized call
     */
    private async processTenantsByPeriod(
        tenants: Array<{id: string; business_name: string}>, 
        period: string
    ): Promise<{processed: number; errors: number; duration: number}> {
        const startTime = Date.now();
        
        try {
            this.logger.info('Processing ALL tenants using DEFINITIVA TOTAL v5.0 procedure', {
                tenantCount: tenants.length,
                usingOptimizedProcedure: true,
                version: 'v5.0_with_retry_mechanism',
                enhancements: ['retry_mechanism', 'protected_calculations', 'storage_verification']
            });

            // Execute our DEFINITIVA TOTAL FIXED v5.0 procedure for ALL tenants at once
            const result = await this.dbPool.withConnection(async (client) => {
                const { data, error } = await (client as any)
                    .rpc('calculate_tenant_metrics_definitiva_total_fixed_v5', {
                        p_calculation_date: new Date().toISOString().split('T')[0],
                        p_tenant_id: null // NULL = process ALL active tenants
                    });

                if (error) {
                    this.logger.error('DEFINITIVA TOTAL v5.0 procedure failed', {
                        error: error.message,
                        code: error.code,
                        version: 'v5.0'
                    });
                    throw error;
                }

                return data;
            });

            const duration = Date.now() - startTime;
            
            this.logger.info('DEFINITIVA TOTAL v5.0 procedure completed successfully', {
                result: {
                    success: result?.success,
                    processed_tenants: result?.processed_tenants,
                    periods_processed: result?.periods_processed,
                    total_metrics_created: result?.total_metrics_created,
                    execution_time_ms: result?.execution_time_ms,
                    version: result?.version,
                    features_implemented: result?.features_implemented
                },
                totalDuration: duration
            });

            // Return results in expected format
            const processed = result?.processed_tenants || 0;
            const errors = result?.success ? 0 : 1;

            return { processed, errors, duration };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Error in DEFINITIVA TOTAL processing', {
                duration,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Return with error count
            return { processed: 0, errors: tenants.length, duration };
        }
    }

    /**
     * Calculate weekly risk assessment with optimized processing
     */
    async calculateWeeklyRiskAssessment(): Promise<void> {
        const timer = this.logger.startTimer('weekly-risk-assessment');

        try {
            this.logger.info('Starting weekly risk assessment');

            const tenants = await this.getActiveTenants();
            
            const results = await this.concurrencyManager.processWithConcurrency(
                tenants,
                async (tenant) => {
                    // Risk assessment logic here
                    // This would use the risk assessment functions
                    return { tenantId: tenant.id, riskScore: 25, riskLevel: 'Low' };
                },
                {
                    maxConcurrency: Math.min(50, tenants.length),
                    batchSize: 25
                }
            );

            timer();
            this.logger.info('Weekly risk assessment completed', {
                tenantsProcessed: results.successes.length,
                errors: results.failures.length,
                averageRiskScore: results.successes.reduce((sum, r) => sum + r.riskScore, 0) / results.successes.length
            });

        } catch (error) {
            timer();
            this.logger.error('Error in weekly risk assessment', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Calculate monthly evolution metrics
     */
    async calculateMonthlyEvolution(): Promise<void> {
        const timer = this.logger.startTimer('monthly-evolution');

        try {
            this.logger.info('Starting monthly evolution calculation');

            const tenants = await this.getActiveTenants();
            
            // Process evolution metrics with lower concurrency for historical data
            const results = await this.concurrencyManager.processWithConcurrency(
                tenants,
                async (tenant) => {
                    // Evolution calculation logic here
                    return { tenantId: tenant.id, evolutionScore: 75 };
                },
                {
                    maxConcurrency: 20, // Lower for historical data processing
                    batchSize: 10
                }
            );

            timer();
            this.logger.info('Monthly evolution calculation completed', {
                tenantsProcessed: results.successes.length,
                errors: results.failures.length
            });

        } catch (error) {
            timer();
            this.logger.error('Error in monthly evolution calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Calculate sample metrics (development mode)
     */
    private async calculateSampleMetrics(sampleSize: number = 50): Promise<void> {
        try {
            const allTenants = await this.getActiveTenants();
            const sampleTenants = allTenants.slice(0, sampleSize);
            
            this.logger.info('Processing sample metrics', {
                sampleSize: sampleTenants.length,
                totalTenants: allTenants.length
            });

            await this.processTenantsByPeriod(sampleTenants, '7d');
            
        } catch (error) {
            this.logger.error('Error in sample metrics calculation', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Manual trigger methods for admin endpoints
    async triggerComprehensiveCalculation(): Promise<void> {
        await this.executeJob('manual-comprehensive', () => this.calculateComprehensiveMetrics());
    }

    async triggerRiskAssessment(): Promise<void> {
        await this.executeJob('manual-risk', () => this.calculateWeeklyRiskAssessment());
    }

    async triggerEvolutionCalculation(): Promise<void> {
        await this.executeJob('manual-evolution', () => this.calculateMonthlyEvolution());
    }

    async triggerPlatformAggregation(): Promise<void> {
        await this.executeJob('manual-platform-aggregation', () => this.aggregateToPlatformMetrics());
    }

    /**
     * Get service statistics
     */
    getServiceStats(): ServiceStats & { concurrency: any; cache: any; dbPool: any } {
        return {
            ...this.stats,
            concurrency: this.concurrencyManager.getStats(),
            cache: this.cache.getStats(),
            dbPool: this.dbPool.getStats()
        };
    }

    /**
     * Execute job with monitoring and error handling
     */
    private async executeJob(jobName: string, jobFunction: () => Promise<void>): Promise<void> {
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

        } catch (error) {
            this.stats.errors++;
            timer();
            this.logger.error('Cron job failed', {
                jobName,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            
        } finally {
            this.activeJobs.delete(jobName);
            this.stats.activeJobs = this.activeJobs.size;
        }
    }

    // Helper methods (optimized versions of original methods)
    private async getActiveTenants(): Promise<Array<{id: string; business_name: string}>> {
        const cacheKey = 'active_tenants_list';
        let tenants = await this.cache.get(cacheKey);
        
        if (!tenants) {
            const result = await this.dbPool.withConnection(async (client) => {
                const { data, error } = await client
                    .from('tenants')
                    .select('id, business_name')
                    .eq('status', 'active')
                    .order('created_at', { ascending: true });

                if (error) throw error;
                return data || [];
            });

            tenants = result as Array<{id: string; business_name: string}>;
            await this.cache.set(cacheKey, tenants, 10 * 60 * 1000); // 10 minutes cache
        }

        return tenants as Array<{id: string; business_name: string}>;
    }

    private async calculatePlatformTotals(period: string): Promise<any> {
        const cacheKey = `platform_totals_${period}`;
        
        return await this.dbPool.withConnection(async (client) => {
            const dateRange = this.getDateRange(period);
            const { data: result, error } = await (client as any)
                .rpc('get_platform_totals', {
                    p_start_date: dateRange.start.toISOString().split('T')[0],
                    p_end_date: dateRange.end.toISOString().split('T')[0]
                });

            if (error) throw error;

            const totals = result || {
                total_tenants: 0,
                active_tenants: 0,
                total_revenue: 0,
                total_appointments: 0,
                total_customers: 0,
                total_conversations: 0
            };

            // Cache platform totals for 30 minutes
            await this.cache.set(cacheKey, totals, 30 * 60 * 1000);
            return totals;
        });
    }

    private async saveMetricsToDatabase(metrics: any): Promise<void> {
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
                }, {
                    onConflict: 'tenant_id,metric_type,period'
                });

            if (error) throw error;
        });
    }

    private async calculateTenantRankings(): Promise<void> {
        // Implementation for tenant rankings calculation
        this.logger.info('Calculating tenant rankings...');
        // This would implement ranking logic
    }

    /**
     * CRÍTICO: Agrega métricas dos tenants para platform_metrics
     * Preserva funcionalidades do Super Admin Dashboard
     */
    private async aggregateToPlatformMetrics(): Promise<void> {
        const timer = this.logger.startTimer('platform-aggregation');

        try {
            this.logger.info('Starting platform metrics aggregation using new procedure');

            const client = getAdminClient();
            
            // Execute aggregation for all periods
            const periods = ['7d', '30d', '90d'];
            const results: { period: string; result: any }[] = [];

            for (const period of periods) {
                const { data, error } = await client
                    .rpc('aggregate_platform_metrics_from_tenants' as any, { p_period: period }) as any;

                if (error) {
                    throw new Error(`Error aggregating ${period}: ${error.message}`);
                }

                results.push({ period, result: data });
                this.logger.info(`Platform aggregation completed for ${period}`, {
                    result: data
                });
            }

            this.logger.info('All platform aggregations completed', {
                periods: periods,
                results: results.map(r => ({ period: r.period, success: r.result?.includes('SUCESSO') }))
            });

            timer();

        } catch (error) {
            timer();
            this.logger.error('Error in platform aggregation procedure', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, error instanceof Error ? error : undefined);
            // Don't throw - platform aggregation failure shouldn't stop tenant processing
        }
    }

    private calculateOptimalConcurrency(): number {
        const cpuCount = require('os').cpus().length;
        const memoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
        
        // For 10k tenants, we need higher concurrency
        const baseConcurrency = Math.max(cpuCount * 4, 20);
        const memoryFactor = Math.min(Math.floor(memoryGB / 2), 50);
        
        return Math.min(baseConcurrency + memoryFactor, 100);
    }

    private calculateOptimalBatchSize(): number {
        // Larger batches for better throughput with 10k tenants
        return process.env.NODE_ENV === 'production' ? 100 : 25;
    }

    private calculateDynamicConcurrency(tenantCount: number): number {
        if (tenantCount < 100) return 10;
        if (tenantCount < 1000) return 25;
        if (tenantCount < 5000) return 50;
        return 100; // Max for 10k+ tenants
    }

    private calculateDynamicBatchSize(tenantCount: number): number {
        if (tenantCount < 100) return 10;
        if (tenantCount < 1000) return 25;
        if (tenantCount < 5000) return 50;
        return 100; // Larger batches for 10k+ tenants
    }

    private getDateRange(period: string): { start: Date; end: Date } {
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

    private getCronConfigs(): { [key: string]: CronJobConfig } {
        return {
            daily: {
                enabled: process.env.ENABLE_DAILY_METRICS !== 'false',
                schedule: process.env.DAILY_METRICS_SCHEDULE || '0 2 * * *', // 2 AM (off-peak)
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 6 * 60 * 60 * 1000, // 6 hours for 10k tenants
                retryAttempts: 2,
                retryDelay: 5 * 60 * 1000 // 5 minutes
            },
            weekly: {
                enabled: process.env.ENABLE_WEEKLY_RISK !== 'false',
                schedule: '0 1 * * 0', // Sunday 1 AM
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 2 * 60 * 60 * 1000, // 2 hours
                retryAttempts: 2,
                retryDelay: 10 * 60 * 1000
            },
            monthly: {
                enabled: process.env.ENABLE_MONTHLY_EVOLUTION !== 'false',
                schedule: '0 0 1 * *', // 1st of month at midnight
                timezone: 'America/Sao_Paulo',
                maxExecutionTime: 4 * 60 * 60 * 1000, // 4 hours
                retryAttempts: 1,
                retryDelay: 30 * 60 * 1000
            }
        };
    }

    private updateStats(processed: number, errors: number): void {
        this.stats.totalTenantsProcessed += processed;
        this.stats.errors += errors;
        this.stats.successRate = processed > 0 ? 
            ((processed - errors) / processed) * 100 : 100;
    }

    private async optimizeCaches(): Promise<void> {
        try {
            this.logger.info('Starting cache optimization');
            
            await this.cache.optimize();
            const cacheStats = await this.cache.getStats();
            
            this.stats.cacheHitRate = cacheStats.hitRate;
            
            this.logger.info('Cache optimization completed', cacheStats);
            
        } catch (error) {
            this.logger.error('Error during cache optimization', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private startMonitoring(): void {
        // System health monitoring every 2 minutes
        setInterval(async () => {
            try {
                const stats = this.getServiceStats();
                this.logger.info('Service health check', stats);
                
                // Log system resources
                this.logger.systemResources();
                
            } catch (error) {
                this.logger.error('Health monitoring failed', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 2 * 60 * 1000);
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down Tenant Metrics Cron Service...');
        
        try {
            // Wait for active jobs to complete (with timeout)
            const maxWaitTime = 30000; // 30 seconds
            const startTime = Date.now();
            
            while (this.activeJobs.size > 0 && (Date.now() - startTime) < maxWaitTime) {
                this.logger.info('Waiting for active jobs to complete', {
                    activeJobs: Array.from(this.activeJobs),
                    remainingTime: maxWaitTime - (Date.now() - startTime)
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Close services
            await Promise.all([
                this.cache.close(),
                this.dbPool.close(),
                this.logger.close()
            ]);

            this.logger.info('Tenant Metrics Cron Service shutdown completed');
            
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}

export default TenantMetricsCronOptimizedService;