/**
 * SYSTEM HEALTH MONITORING FOR SUPER ADMIN DASHBOARD
 * Comprehensive monitoring of UBS metrics system, job executions, and performance
 * 
 * Monitors:
 * - UBS Monitoring System execution status
 * - Platform metrics calculation jobs
 * - Database query performance
 * - Memory usage and resource consumption
 * - Data freshness and update frequencies
 * - Background job execution logs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    database: {
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
    },
    monitoring: {
        checkInterval: 30000, // 30 seconds
        maxExecutionTime: 300000, // 5 minutes
        memoryThreshold: 500, // MB
        staleDataThreshold: 86400000 // 24 hours
    }
};

class SystemHealthMonitor {
    constructor() {
        this.supabase = null;
        this.healthHistory = [];
        this.alerts = [];
        this.isRunning = false;
        
        if (config.database.url && config.database.key) {
            this.supabase = createClient(config.database.url, config.database.key);
            console.log('✅ Database connection initialized');
        } else {
            console.log('⚠️ Database credentials not found - limited monitoring available');
        }
    }

    /**
     * Start comprehensive health monitoring
     */
    async startMonitoring() {
        console.log('🔍 SYSTEM HEALTH MONITORING STARTED');
        console.log('====================================');
        
        this.isRunning = true;
        
        try {
            // Initial comprehensive check
            await this.performHealthCheck();
            
            // Start periodic monitoring
            const monitoringInterval = setInterval(async () => {
                if (!this.isRunning) {
                    clearInterval(monitoringInterval);
                    return;
                }
                
                try {
                    await this.performQuickHealthCheck();
                } catch (error) {
                    console.error('❌ Health check error:', error);
                }
            }, config.monitoring.checkInterval);
            
            // Keep process alive for continuous monitoring
            process.on('SIGINT', () => {
                console.log('\n🛑 Stopping health monitoring...');
                this.isRunning = false;
                clearInterval(monitoringInterval);
                this.generateHealthReport();
                process.exit(0);
            });
            
            console.log(`⏰ Continuous monitoring active (${config.monitoring.checkInterval / 1000}s intervals)`);
            console.log('Press Ctrl+C to stop and generate report\n');
            
        } catch (error) {
            console.error('❌ Failed to start monitoring:', error);
        }
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        const startTime = Date.now();
        const healthCheck = {
            timestamp: new Date().toISOString(),
            system: await this.checkSystemHealth(),
            database: await this.checkDatabaseHealth(),
            jobs: await this.checkJobExecutions(),
            performance: await this.checkPerformanceMetrics(),
            dataFreshness: await this.checkDataFreshness(),
            memory: this.checkMemoryUsage(),
            alerts: []
        };
        
        // Analyze results and generate alerts
        healthCheck.alerts = this.analyzeHealthCheck(healthCheck);
        
        this.healthHistory.push(healthCheck);
        this.displayHealthSummary(healthCheck);
        
        return healthCheck;
    }

    /**
     * Quick health check for periodic monitoring
     */
    async performQuickHealthCheck() {
        const quickCheck = {
            timestamp: new Date().toISOString(),
            database: await this.quickDatabaseCheck(),
            memory: this.checkMemoryUsage(),
            alerts: []
        };
        
        quickCheck.alerts = this.analyzeQuickCheck(quickCheck);
        
        if (quickCheck.alerts.length > 0) {
            console.log(`⚠️ ${new Date().toLocaleTimeString()}: ${quickCheck.alerts.length} alerts detected`);
            quickCheck.alerts.forEach(alert => console.log(`   • ${alert.level}: ${alert.message}`));
        }
        
        this.healthHistory.push(quickCheck);
        
        // Keep only last 100 entries to prevent memory issues
        if (this.healthHistory.length > 100) {
            this.healthHistory = this.healthHistory.slice(-50);
        }
    }

    /**
     * Check system health
     */
    async checkSystemHealth() {
        const systemHealth = {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
            cpuUsage: process.cpuUsage(),
            status: 'healthy'
        };
        
        // Analyze system metrics
        if (systemHealth.uptime > 86400) { // Running for more than 24 hours
            systemHealth.status = 'stable';
        }
        
        return systemHealth;
    }

    /**
     * Check database connectivity and performance
     */
    async checkDatabaseHealth() {
        if (!this.supabase) {
            return { status: 'unavailable', message: 'Database not configured' };
        }
        
        const dbHealth = {
            connectivity: false,
            responseTime: 0,
            tableStatus: {},
            lastError: null,
            status: 'unknown'
        };
        
        try {
            // Test basic connectivity
            const start = Date.now();
            const { data, error } = await this.supabase
                .from('tenants')
                .select('count')
                .limit(1);
            
            dbHealth.responseTime = Date.now() - start;
            dbHealth.connectivity = !error;
            
            if (error) {
                dbHealth.lastError = error.message;
                dbHealth.status = 'error';
            } else {
                dbHealth.status = dbHealth.responseTime < 1000 ? 'healthy' : 'slow';
            }
            
            // Check critical tables
            const criticalTables = ['tenants', 'appointments', 'platform_metrics', 'tenant_metrics'];
            for (const table of criticalTables) {
                try {
                    const tableStart = Date.now();
                    const { count, error: tableError } = await this.supabase
                        .from(table)
                        .select('*', { count: 'exact', head: true });
                    
                    dbHealth.tableStatus[table] = {
                        accessible: !tableError,
                        responseTime: Date.now() - tableStart,
                        recordCount: count || 0,
                        error: tableError?.message
                    };
                } catch (err) {
                    dbHealth.tableStatus[table] = {
                        accessible: false,
                        error: err.message
                    };
                }
            }
            
        } catch (error) {
            dbHealth.lastError = error.message;
            dbHealth.status = 'error';
        }
        
        return dbHealth;
    }

    /**
     * Quick database connectivity check
     */
    async quickDatabaseCheck() {
        if (!this.supabase) return { status: 'unavailable' };
        
        try {
            const start = Date.now();
            const { error } = await this.supabase
                .from('tenants')
                .select('count')
                .limit(1);
            
            return {
                status: error ? 'error' : 'healthy',
                responseTime: Date.now() - start,
                error: error?.message
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Check recent job executions and UBS monitoring
     */
    async checkJobExecutions() {
        if (!this.supabase) {
            return { status: 'unavailable', message: 'Database not configured' };
        }
        
        const jobHealth = {
            recentPlatformMetrics: null,
            recentTenantMetrics: null,
            ubsMonitoring: null,
            lastCalculationAge: null,
            status: 'unknown'
        };
        
        try {
            // Check platform_metrics table for recent calculations
            const { data: platformMetrics, error: pmError } = await this.supabase
                .from('platform_metrics')
                .select('calculation_date, created_at, data_source, period_days')
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (!pmError && platformMetrics && platformMetrics.length > 0) {
                const latest = platformMetrics[0];
                jobHealth.recentPlatformMetrics = {
                    lastRun: latest.created_at,
                    calculationDate: latest.calculation_date,
                    dataSource: latest.data_source,
                    periodDays: latest.period_days
                };
                
                // Calculate age of last calculation
                const lastCalc = new Date(latest.created_at);
                jobHealth.lastCalculationAge = Date.now() - lastCalc.getTime();
            }
            
            // Check tenant_metrics for recent activity
            const { data: tenantMetrics, error: tmError } = await this.supabase
                .from('tenant_metrics')
                .select('calculated_at, metric_type, period')
                .order('calculated_at', { ascending: false })
                .limit(3);
            
            if (!tmError && tenantMetrics && tenantMetrics.length > 0) {
                jobHealth.recentTenantMetrics = {
                    lastRun: tenantMetrics[0].calculated_at,
                    recentCount: tenantMetrics.length
                };
            }
            
            // Determine overall job health status
            if (jobHealth.lastCalculationAge) {
                if (jobHealth.lastCalculationAge < 3600000) { // < 1 hour
                    jobHealth.status = 'healthy';
                } else if (jobHealth.lastCalculationAge < 86400000) { // < 24 hours
                    jobHealth.status = 'stale';
                } else {
                    jobHealth.status = 'outdated';
                }
            } else {
                jobHealth.status = 'no_data';
            }
            
        } catch (error) {
            jobHealth.status = 'error';
            jobHealth.error = error.message;
        }
        
        return jobHealth;
    }

    /**
     * Check performance metrics and trends
     */
    async checkPerformanceMetrics() {
        const performance = {
            avgResponseTime: 0,
            memoryTrend: 'stable',
            errorRate: 0,
            throughput: 0,
            status: 'unknown'
        };
        
        // Calculate performance from recent health history
        if (this.healthHistory.length > 5) {
            const recentChecks = this.healthHistory.slice(-10);
            const responseTimes = recentChecks
                .filter(check => check.database?.responseTime)
                .map(check => check.database.responseTime);
            
            if (responseTimes.length > 0) {
                performance.avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
            }
            
            // Memory trend analysis
            const memoryUsages = recentChecks
                .filter(check => check.memory?.heapUsed)
                .map(check => check.memory.heapUsed);
            
            if (memoryUsages.length > 3) {
                const recent = memoryUsages.slice(-3);
                const older = memoryUsages.slice(-6, -3);
                const recentAvg = recent.reduce((sum, mem) => sum + mem, 0) / recent.length;
                const olderAvg = older.reduce((sum, mem) => sum + mem, 0) / older.length;
                
                if (recentAvg > olderAvg * 1.1) performance.memoryTrend = 'increasing';
                else if (recentAvg < olderAvg * 0.9) performance.memoryTrend = 'decreasing';
            }
        }
        
        // Determine performance status
        if (performance.avgResponseTime < 500) {
            performance.status = 'excellent';
        } else if (performance.avgResponseTime < 1000) {
            performance.status = 'good';
        } else if (performance.avgResponseTime < 3000) {
            performance.status = 'acceptable';
        } else {
            performance.status = 'poor';
        }
        
        return performance;
    }

    /**
     * Check data freshness across critical tables
     */
    async checkDataFreshness() {
        if (!this.supabase) {
            return { status: 'unavailable' };
        }
        
        const freshness = {
            platformMetrics: null,
            tenantMetrics: null,
            appointments: null,
            conversations: null,
            status: 'unknown'
        };
        
        try {
            // Check platform_metrics freshness
            const { data: pmData } = await this.supabase
                .from('platform_metrics')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (pmData && pmData.length > 0) {
                const age = Date.now() - new Date(pmData[0].created_at).getTime();
                freshness.platformMetrics = {
                    lastUpdate: pmData[0].created_at,
                    ageHours: Math.round(age / 3600000),
                    isFresh: age < config.monitoring.staleDataThreshold
                };
            }
            
            // Check recent appointments
            const { data: apptData } = await this.supabase
                .from('appointments')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (apptData && apptData.length > 0) {
                const age = Date.now() - new Date(apptData[0].created_at).getTime();
                freshness.appointments = {
                    lastUpdate: apptData[0].created_at,
                    ageHours: Math.round(age / 3600000),
                    isFresh: age < config.monitoring.staleDataThreshold
                };
            }
            
            // Determine overall freshness status
            const allFresh = Object.values(freshness)
                .filter(item => item && typeof item === 'object' && 'isFresh' in item)
                .every(item => item.isFresh);
            
            freshness.status = allFresh ? 'fresh' : 'stale';
            
        } catch (error) {
            freshness.status = 'error';
            freshness.error = error.message;
        }
        
        return freshness;
    }

    /**
     * Check memory usage and system resources
     */
    checkMemoryUsage() {
        const memoryUsage = process.memoryUsage();
        const mbDivisor = 1024 * 1024;
        
        return {
            rss: Math.round(memoryUsage.rss / mbDivisor),
            heapTotal: Math.round(memoryUsage.heapTotal / mbDivisor),
            heapUsed: Math.round(memoryUsage.heapUsed / mbDivisor),
            external: Math.round(memoryUsage.external / mbDivisor),
            heapUtilization: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
            status: memoryUsage.rss / mbDivisor < config.monitoring.memoryThreshold ? 'healthy' : 'high'
        };
    }

    /**
     * Analyze health check results and generate alerts
     */
    analyzeHealthCheck(healthCheck) {
        const alerts = [];
        
        // Database alerts
        if (healthCheck.database.status === 'error') {
            alerts.push({
                level: 'CRITICAL',
                component: 'Database',
                message: `Database connectivity failed: ${healthCheck.database.lastError}`
            });
        } else if (healthCheck.database.status === 'slow') {
            alerts.push({
                level: 'WARNING',
                component: 'Database',
                message: `Slow database response: ${healthCheck.database.responseTime}ms`
            });
        }
        
        // Job execution alerts
        if (healthCheck.jobs.status === 'outdated') {
            alerts.push({
                level: 'WARNING',
                component: 'Jobs',
                message: `Platform metrics calculation is outdated (${Math.round(healthCheck.jobs.lastCalculationAge / 3600000)}h old)`
            });
        } else if (healthCheck.jobs.status === 'no_data') {
            alerts.push({
                level: 'CRITICAL',
                component: 'Jobs',
                message: 'No recent platform metrics calculations found'
            });
        }
        
        // Memory alerts
        if (healthCheck.memory.status === 'high') {
            alerts.push({
                level: 'WARNING',
                component: 'Memory',
                message: `High memory usage: ${healthCheck.memory.rss}MB (threshold: ${config.monitoring.memoryThreshold}MB)`
            });
        }
        
        // Data freshness alerts
        if (healthCheck.dataFreshness.status === 'stale') {
            alerts.push({
                level: 'WARNING',
                component: 'Data',
                message: 'Some data sources are stale'
            });
        }
        
        return alerts;
    }

    /**
     * Analyze quick check results
     */
    analyzeQuickCheck(quickCheck) {
        const alerts = [];
        
        if (quickCheck.database.status === 'error') {
            alerts.push({
                level: 'CRITICAL',
                component: 'Database',
                message: `Database error: ${quickCheck.database.error}`
            });
        }
        
        if (quickCheck.memory.status === 'high') {
            alerts.push({
                level: 'WARNING',
                component: 'Memory',
                message: `High memory usage: ${quickCheck.memory.rss}MB`
            });
        }
        
        return alerts;
    }

    /**
     * Display current health summary
     */
    displayHealthSummary(healthCheck) {
        console.log(`\n🏥 HEALTH CHECK - ${healthCheck.timestamp}`);
        console.log('================================================');
        
        // System Status
        console.log(`🖥️  System: ${healthCheck.system.status.toUpperCase()} (uptime: ${Math.round(healthCheck.system.uptime / 3600)}h)`);
        
        // Database Status
        const dbStatus = healthCheck.database.status;
        const dbIcon = dbStatus === 'healthy' ? '✅' : dbStatus === 'slow' ? '🟡' : '❌';
        console.log(`${dbIcon} Database: ${dbStatus.toUpperCase()} (${healthCheck.database.responseTime}ms)`);
        
        // Job Status
        if (healthCheck.jobs) {
            const jobIcon = healthCheck.jobs.status === 'healthy' ? '✅' : 
                           healthCheck.jobs.status === 'stale' ? '🟡' : '❌';
            console.log(`${jobIcon} Jobs: ${healthCheck.jobs.status.toUpperCase()}`);
            
            if (healthCheck.jobs.lastCalculationAge) {
                const ageHours = Math.round(healthCheck.jobs.lastCalculationAge / 3600000);
                console.log(`   Latest calculation: ${ageHours}h ago`);
            }
        }
        
        // Memory Status
        const memIcon = healthCheck.memory.status === 'healthy' ? '✅' : '⚠️';
        console.log(`${memIcon} Memory: ${healthCheck.memory.rss}MB (${healthCheck.memory.heapUtilization}% heap)`);
        
        // Performance Status
        if (healthCheck.performance) {
            const perfIcon = healthCheck.performance.status === 'excellent' ? '🚀' : 
                            healthCheck.performance.status === 'good' ? '✅' : 
                            healthCheck.performance.status === 'acceptable' ? '🟡' : '❌';
            console.log(`${perfIcon} Performance: ${healthCheck.performance.status.toUpperCase()} (avg: ${Math.round(healthCheck.performance.avgResponseTime)}ms)`);
        }
        
        // Alerts
        if (healthCheck.alerts && healthCheck.alerts.length > 0) {
            console.log('\n⚠️  ALERTS:');
            healthCheck.alerts.forEach(alert => {
                const alertIcon = alert.level === 'CRITICAL' ? '🔴' : '🟡';
                console.log(`   ${alertIcon} ${alert.level}: ${alert.message}`);
            });
        } else {
            console.log('\n✅ No alerts - system is healthy');
        }
    }

    /**
     * Generate comprehensive health report
     */
    generateHealthReport() {
        console.log('\n📊 COMPREHENSIVE HEALTH REPORT');
        console.log('===============================');
        
        if (this.healthHistory.length === 0) {
            console.log('No health data collected');
            return;
        }
        
        const totalChecks = this.healthHistory.length;
        const recentChecks = this.healthHistory.slice(-20);
        
        // Calculate statistics
        const stats = {
            totalChecks,
            timespan: this.healthHistory.length > 1 ? 
                new Date(this.healthHistory[this.healthHistory.length - 1].timestamp).getTime() - 
                new Date(this.healthHistory[0].timestamp).getTime() : 0,
            avgMemoryUsage: recentChecks
                .filter(check => check.memory)
                .reduce((sum, check) => sum + check.memory.rss, 0) / 
                recentChecks.filter(check => check.memory).length,
            avgDbResponseTime: recentChecks
                .filter(check => check.database?.responseTime)
                .reduce((sum, check) => sum + check.database.responseTime, 0) /
                recentChecks.filter(check => check.database?.responseTime).length,
            totalAlerts: this.healthHistory.reduce((sum, check) => sum + (check.alerts?.length || 0), 0),
            criticalAlerts: this.healthHistory.reduce((sum, check) => 
                sum + (check.alerts?.filter(alert => alert.level === 'CRITICAL').length || 0), 0)
        };
        
        console.log(`📈 Statistics:`);
        console.log(`   Total checks: ${stats.totalChecks}`);
        console.log(`   Monitoring duration: ${Math.round(stats.timespan / 60000)} minutes`);
        console.log(`   Average memory usage: ${Math.round(stats.avgMemoryUsage)}MB`);
        console.log(`   Average DB response: ${Math.round(stats.avgDbResponseTime)}ms`);
        console.log(`   Total alerts: ${stats.totalAlerts} (${stats.criticalAlerts} critical)`);
        
        // Most recent status
        const latest = this.healthHistory[this.healthHistory.length - 1];
        console.log(`\n🔍 Latest Status:`);
        console.log(`   Timestamp: ${latest.timestamp}`);
        console.log(`   System: ${latest.system?.status || 'N/A'}`);
        console.log(`   Database: ${latest.database?.status || 'N/A'}`);
        console.log(`   Memory: ${latest.memory?.rss || 'N/A'}MB`);
        
        // Save report to file
        const reportPath = path.join(__dirname, `health-report-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            statistics: stats,
            healthHistory: this.healthHistory.slice(-50), // Save last 50 entries
            summary: latest
        }, null, 2));
        
        console.log(`\n💾 Report saved to: ${reportPath}`);
    }
}

// Load environment variables if .env file exists
try {
    require('dotenv').config();
} catch (error) {
    // dotenv not available, continue with environment variables
}

// Run monitoring if called directly
if (require.main === module) {
    const monitor = new SystemHealthMonitor();
    monitor.startMonitoring().catch(console.error);
}

module.exports = SystemHealthMonitor;