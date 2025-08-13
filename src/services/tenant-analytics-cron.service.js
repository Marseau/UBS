// ================================================================================
// FASE 6: Tenant Analytics Cron Service - Sistema Único e Eficiente
// ================================================================================
// OBJETIVO: Automatizar cálculo de métricas tenant/platform de forma otimizada
// ================================================================================

const cron = require('node-cron');
const { getAdminClient } = require('../config/database');

class TenantAnalyticsCronService {
    constructor() {
        this.isRunning = false;
        this.scheduledJobs = new Map();
        this.lastExecution = null;
        this.executionStats = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            avgExecutionTime: 0
        };
        
        console.log('🕐 Inicializando Tenant Analytics Cron Service...');
    }
    
    // Initialize cron jobs
    init() {
        try {
            // Só inicia se não estiver em modo de desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.log('🔧 [DEV] Cron jobs desabilitados para desenvolvimento');
                console.log('🔧 [DEV] Use trigger manual via API: POST /api/tenant-business-analytics/refresh');
                return;
            }
            
            this.setupDailyMetricsCalculation();
            this.setupHourlyHealthCheck();
            this.setupWeeklyCleanup();
            
            console.log('✅ Tenant Analytics Cron Service initialized successfully');
            console.log(`📋 Active jobs: ${this.scheduledJobs.size}`);
            
        } catch (error) {
            console.error('❌ Error initializing Tenant Analytics Cron Service:', error);
        }
    }
    
    // Daily metrics calculation - Every day at 2 AM
    setupDailyMetricsCalculation() {
        const job = cron.schedule('0 2 * * *', async () => {
            await this.executeDailyMetricsCalculation();
        }, {
            scheduled: false,
            timezone: 'America/Sao_Paulo'
        });
        
        this.scheduledJobs.set('daily-metrics', job);
        job.start();
        
        console.log('📊 Daily metrics calculation scheduled: 02:00 AM (America/Sao_Paulo)');
    }
    
    // Hourly health check - Every hour
    setupHourlyHealthCheck() {
        const job = cron.schedule('0 * * * *', async () => {
            await this.executeHealthCheck();
        }, {
            scheduled: false,
            timezone: 'America/Sao_Paulo'
        });
        
        this.scheduledJobs.set('hourly-health', job);
        job.start();
        
        console.log('💚 Hourly health check scheduled: Every hour');
    }
    
    // Weekly cleanup - Every Sunday at 3 AM
    setupWeeklyCleanup() {
        const job = cron.schedule('0 3 * * 0', async () => {
            await this.executeWeeklyCleanup();
        }, {
            scheduled: false,
            timezone: 'America/Sao_Paulo'
        });
        
        this.scheduledJobs.set('weekly-cleanup', job);
        job.start();
        
        console.log('🧹 Weekly cleanup scheduled: Sundays at 03:00 AM');
    }
    
    // Execute daily metrics calculation
    async executeDailyMetricsCalculation() {
        const startTime = Date.now();
        this.isRunning = true;
        
        try {
            console.log('🚀 Starting daily metrics calculation...');
            
            const client = getAdminClient();
            
            // Calculate metrics for last 7 days
            const calculations = [];
            
            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                console.log(`📊 Calculating metrics for ${dateStr}...`);
                
                const { data: result, error } = await client.rpc('calculate_tenant_metrics', {
                    p_calculation_date: dateStr,
                    p_period_days: 30
                });
                
                if (error) {
                    console.error(`❌ Error calculating metrics for ${dateStr}:`, error);
                } else {
                    console.log(`✅ Metrics calculated for ${dateStr}:`, result);
                    calculations.push({ date: dateStr, result });
                }
            }
            
            // Update execution stats
            this.executionStats.totalRuns++;
            this.executionStats.successfulRuns++;
            this.lastExecution = new Date();
            
            const executionTime = Date.now() - startTime;
            this.executionStats.avgExecutionTime = 
                (this.executionStats.avgExecutionTime + executionTime) / 2;
            
            console.log(`🎉 Daily metrics calculation completed in ${executionTime}ms`);
            console.log(`📈 Processed ${calculations.length} days of metrics`);
            
        } catch (error) {
            console.error('❌ Error in daily metrics calculation:', error);
            this.executionStats.totalRuns++;
            this.executionStats.failedRuns++;
        } finally {
            this.isRunning = false;
        }
    }
    
    // Execute health check
    async executeHealthCheck() {
        try {
            console.log('💚 Executing hourly health check...');
            
            const client = getAdminClient();
            
            // Check database connection
            const { data: dbTest, error: dbError } = await client
                .from('tenant_business_analytics')
                .select('id')
                .limit(1);
            
            if (dbError) {
                console.error('❌ Database health check failed:', dbError);
                return;
            }
            
            // Check if recent data exists
            const today = new Date().toISOString().split('T')[0];
            const { data: recentData, error: recentError } = await client
                .from('tenant_business_analytics')
                .select('*')
                .eq('metric_date', today)
                .limit(1);
            
            if (recentError) {
                console.error('❌ Recent data check failed:', recentError);
                return;
            }
            
            if (!recentData || recentData.length === 0) {
                console.log('⚠️ No metrics data found for today - triggering calculation...');
                await this.triggerManualCalculation();
            } else {
                console.log('✅ Health check passed - recent data exists');
            }
            
        } catch (error) {
            console.error('❌ Error in health check:', error);
        }
    }
    
    // Execute weekly cleanup
    async executeWeeklyCleanup() {
        try {
            console.log('🧹 Executing weekly cleanup...');
            
            const client = getAdminClient();
            
            // Delete metrics older than 90 days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
            
            const { data: deletedRows, error } = await client
                .from('tenant_business_analytics')
                .delete()
                .lt('metric_date', cutoffDateStr);
            
            if (error) {
                console.error('❌ Cleanup failed:', error);
            } else {
                console.log(`✅ Cleanup completed - removed old metrics (older than ${cutoffDateStr})`);
            }
            
            // Log current stats
            const { data: totalRows } = await client
                .from('tenant_business_analytics')
                .select('*', { count: 'exact', head: true });
            
            console.log(`📊 Current metrics records: ${totalRows?.length || 'unknown'}`);
            console.log('🎯 Weekly cleanup completed successfully');
            
        } catch (error) {
            console.error('❌ Error in weekly cleanup:', error);
        }
    }
    
    // Trigger manual calculation (used by health check)
    async triggerManualCalculation() {
        try {
            const client = getAdminClient();
            const today = new Date().toISOString().split('T')[0];
            
            const { data: result, error } = await client.rpc('calculate_tenant_metrics', {
                p_calculation_date: today,
                p_period_days: 30
            });
            
            if (error) {
                console.error('❌ Manual calculation failed:', error);
            } else {
                console.log('✅ Manual calculation triggered successfully:', result);
            }
            
        } catch (error) {
            console.error('❌ Error in manual calculation:', error);
        }
    }
    
    // Stop all cron jobs
    stop() {
        console.log('🛑 Stopping Tenant Analytics Cron Service...');
        
        this.scheduledJobs.forEach((job, name) => {
            job.stop();
            console.log(`   ⏹️ Stopped job: ${name}`);
        });
        
        this.scheduledJobs.clear();
        console.log('✅ All cron jobs stopped');
    }
    
    // Get service status
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeJobs: Array.from(this.scheduledJobs.keys()),
            lastExecution: this.lastExecution,
            executionStats: this.executionStats,
            nextExecutions: this.getNextExecutions()
        };
    }
    
    // Get next execution times
    getNextExecutions() {
        const next = {};
        
        this.scheduledJobs.forEach((job, name) => {
            if (job.getStatus() === 'scheduled') {
                // Calculate next execution (simplified)
                const now = new Date();
                switch (name) {
                    case 'daily-metrics':
                        const tomorrow = new Date(now);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(2, 0, 0, 0);
                        next[name] = tomorrow.toISOString();
                        break;
                    case 'hourly-health':
                        const nextHour = new Date(now);
                        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
                        next[name] = nextHour.toISOString();
                        break;
                    case 'weekly-cleanup':
                        const nextSunday = new Date(now);
                        nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
                        nextSunday.setHours(3, 0, 0, 0);
                        next[name] = nextSunday.toISOString();
                        break;
                }
            }
        });
        
        return next;
    }
    
    // Force execution for testing
    async forceExecution(jobName) {
        console.log(`🔧 Force executing job: ${jobName}`);
        
        switch (jobName) {
            case 'daily-metrics':
                await this.executeDailyMetricsCalculation();
                break;
            case 'hourly-health':
                await this.executeHealthCheck();
                break;
            case 'weekly-cleanup':
                await this.executeWeeklyCleanup();
                break;
            default:
                throw new Error(`Unknown job: ${jobName}`);
        }
    }
}

// Create singleton instance
const tenantAnalyticsCronService = new TenantAnalyticsCronService();

module.exports = {
    TenantAnalyticsCronService,
    tenantAnalyticsCronService
};