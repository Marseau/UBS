/**
 * Performance Monitoring Routes
 * Advanced real-time monitoring API for production systems
 * 
 * @version 1.0.0
 * @author UBS Team
 */

import express from 'express';
import AdvancedPerformanceMonitorService from '../services/advanced-performance-monitor.service';

const router = express.Router();

// Global performance monitor instance
let performanceMonitor: AdvancedPerformanceMonitorService | null = null;

/**
 * Initialize performance monitoring
 */
const initializeMonitor = async () => {
    if (!performanceMonitor) {
        performanceMonitor = new AdvancedPerformanceMonitorService();
        await performanceMonitor.initialize();
    }
    return performanceMonitor;
};

/**
 * GET /api/performance/status
 * Get overall system performance status
 */
router.get('/status', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const status = monitor.getStatus();
        
        res.json({
            success: true,
            status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get performance status',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/performance/metrics
 * Get real-time performance metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const hours = parseInt(req.query.hours as string) || 1;
        const metrics = monitor.getMetricsHistory(hours);
        
        res.json({
            success: true,
            metrics: metrics.slice(-50), // Last 50 data points
            total_points: metrics.length,
            time_range_hours: hours,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get performance metrics',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/performance/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const status = monitor.getStatus();
        const recentMetrics = monitor.getMetricsHistory(1);
        const activeAlerts = monitor.getActiveAlerts();
        
        // Calculate trends
        const trends = calculateTrends(recentMetrics);
        
        // Latest metrics
        const latest = recentMetrics[recentMetrics.length - 1];
        
        res.json({
            success: true,
            dashboard: {
                system_health: status.system_health,
                monitoring_active: status.monitoring_active,
                latest_metrics: latest,
                trends,
                alerts: {
                    active_count: activeAlerts.length,
                    alerts: activeAlerts.slice(0, 10) // Last 10 alerts
                },
                performance_summary: {
                    cpu_status: getStatusLabel(latest?.system.cpu_usage || 0, 80, 95),
                    memory_status: getStatusLabel(latest?.system.memory_usage || 0, 512, 1024),
                    database_status: getStatusLabel(latest?.database.query_time_avg || 0, 500, 1000),
                    redis_status: getStatusLabel(latest?.redis.hit_rate || 100, 70, 85, true) // Inverse - higher is better
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get dashboard data',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/performance/alerts
 * Get active alerts
 */
router.get('/alerts', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const activeAlerts = monitor.getActiveAlerts();
        
        res.json({
            success: true,
            alerts: activeAlerts,
            total_active: activeAlerts.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get alerts',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/performance/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:alertId/acknowledge', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const { alertId } = req.params;
        
        const acknowledged = monitor.acknowledgeAlert(alertId);
        
        if (acknowledged) {
            res.json({
                success: true,
                message: 'Alert acknowledged successfully',
                alert_id: alertId,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Alert not found',
                alert_id: alertId,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to acknowledge alert',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/performance/health
 * Comprehensive system health check
 */
router.get('/health', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const status = monitor.getStatus();
        const latest = monitor.getMetricsHistory(0.1)[0]; // Last 6 minutes
        
        const health = {
            overall_status: status.system_health,
            monitoring: {
                active: status.monitoring_active,
                last_collection: status.last_collection,
                metrics_collected: status.metrics_collected
            },
            system: latest ? {
                cpu_usage: latest.system.cpu_usage,
                memory_usage_mb: latest.system.memory_usage,
                load_average: latest.system.load_average[0],
                uptime_hours: (latest.system.uptime / 3600).toFixed(1)
            } : null,
            services: {
                database: latest?.database.active_connections ? 'healthy' : 'unknown',
                redis: latest?.redis.hit_rate ? 'healthy' : 'unknown',
                cron_jobs: (latest?.cron_jobs.success_rate || 0) > 90 ? 'healthy' : 'warning'
            },
            production_ready: status.system_health !== 'critical' && status.monitoring_active
        };
        
        res.json({
            success: true,
            health,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Health check failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/performance/start
 * Start performance monitoring
 */
router.post('/start', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        
        res.json({
            success: true,
            message: 'Performance monitoring started',
            status: monitor.getStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to start monitoring',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/performance/stop
 * Stop performance monitoring (development only)
 */
router.post('/stop', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            error: 'Cannot stop monitoring in production',
            timestamp: new Date().toISOString()
        });
    }

    try {
        if (performanceMonitor) {
            performanceMonitor.stop();
        }
        
        return res.json({
            success: true,
            message: 'Performance monitoring stopped',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to stop monitoring',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/performance/reports/system
 * Generate system performance report
 */
router.get('/reports/system', async (req, res) => {
    try {
        const monitor = await initializeMonitor();
        const hours = parseInt(req.query.hours as string) || 24;
        const metrics = monitor.getMetricsHistory(hours);
        
        const report = generateSystemReport(metrics, hours);
        
        res.json({
            success: true,
            report,
            period_hours: hours,
            data_points: metrics.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate system report',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// Helper functions

function calculateTrends(metrics: any[]): any {
    if (metrics.length < 2) return null;
    
    const recent = metrics.slice(-10); // Last 10 data points
    const older = metrics.slice(-20, -10); // Previous 10 data points
    
    if (recent.length === 0 || older.length === 0) return null;
    
    const recentAvg = {
        cpu: recent.reduce((sum, m) => sum + m.system.cpu_usage, 0) / recent.length,
        memory: recent.reduce((sum, m) => sum + m.system.memory_usage, 0) / recent.length,
        response_time: recent.reduce((sum, m) => sum + m.application.response_time_avg, 0) / recent.length
    };
    
    const olderAvg = {
        cpu: older.reduce((sum, m) => sum + m.system.cpu_usage, 0) / older.length,
        memory: older.reduce((sum, m) => sum + m.system.memory_usage, 0) / older.length,
        response_time: older.reduce((sum, m) => sum + m.application.response_time_avg, 0) / older.length
    };
    
    return {
        cpu_trend: getTrendDirection(recentAvg.cpu, olderAvg.cpu),
        memory_trend: getTrendDirection(recentAvg.memory, olderAvg.memory),
        response_time_trend: getTrendDirection(recentAvg.response_time, olderAvg.response_time)
    };
}

function getTrendDirection(recent: number, older: number): string {
    const change = ((recent - older) / older) * 100;
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
}

function getStatusLabel(value: number, warning: number, critical: number, inverse = false): string {
    if (inverse) {
        if (value >= warning) return 'healthy';
        if (value >= critical) return 'warning';
        return 'critical';
    } else {
        if (value <= warning) return 'healthy';
        if (value <= critical) return 'warning';
        return 'critical';
    }
}

function generateSystemReport(metrics: any[], hours: number): any {
    if (metrics.length === 0) {
        return { error: 'No data available for report period' };
    }
    
    const latest = metrics[metrics.length - 1];
    
    // Calculate averages
    const avgCpu = metrics.reduce((sum, m) => sum + m.system.cpu_usage, 0) / metrics.length;
    const avgMemory = metrics.reduce((sum, m) => sum + m.system.memory_usage, 0) / metrics.length;
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.application.response_time_avg, 0) / metrics.length;
    
    // Find peaks
    const maxCpu = Math.max(...metrics.map(m => m.system.cpu_usage));
    const maxMemory = Math.max(...metrics.map(m => m.system.memory_usage));
    const maxResponseTime = Math.max(...metrics.map(m => m.application.response_time_avg));
    
    return {
        period: `${hours} hours`,
        summary: {
            overall_health: latest.system.cpu_usage < 80 && latest.system.memory_usage < 512 ? 'healthy' : 'warning',
            data_points: metrics.length,
            monitoring_coverage: `${((metrics.length * 0.5) / 60 / hours * 100).toFixed(1)}%`
        },
        averages: {
            cpu_usage: `${avgCpu.toFixed(1)}%`,
            memory_usage: `${avgMemory.toFixed(0)}MB`,
            response_time: `${avgResponseTime.toFixed(0)}ms`
        },
        peaks: {
            max_cpu: `${maxCpu.toFixed(1)}%`,
            max_memory: `${maxMemory.toFixed(0)}MB`,
            max_response_time: `${maxResponseTime.toFixed(0)}ms`
        },
        current_status: {
            cpu: `${latest.system.cpu_usage.toFixed(1)}%`,
            memory: `${latest.system.memory_usage.toFixed(0)}MB`,
            active_tenants: latest.application.active_tenants,
            cron_success_rate: `${latest.cron_jobs.success_rate}%`
        },
        recommendations: generateRecommendations(avgCpu, avgMemory, maxCpu, maxMemory)
    };
}

function generateRecommendations(avgCpu: number, avgMemory: number, maxCpu: number, maxMemory: number): string[] {
    const recommendations: string[] = [];
    
    if (maxCpu > 90) {
        recommendations.push('Consider scaling horizontally or optimizing CPU-intensive operations');
    }
    
    if (avgMemory > 768) {
        recommendations.push('Memory usage is high - review memory leaks and optimize cache usage');
    }
    
    if (maxMemory > 1024) {
        recommendations.push('Critical memory usage detected - increase server memory or optimize application');
    }
    
    if (avgCpu < 20 && avgMemory < 256) {
        recommendations.push('System is underutilized - consider consolidating resources');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('System performance is within optimal parameters');
    }
    
    return recommendations;
}

export default router;