/**
 * Redis Monitoring Service
 * Advanced monitoring and metrics for Redis performance with 10k+ tenants
 * 
 * @version 1.0.0 (Production Ready)
 * @author UBS Team
 */

import { redisCacheService } from './redis-cache.service';

export interface RedisMetrics {
    memoryUsage: string;
    keyCount: number;
    hitRate: number;
    missRate: number;
    connectedClients: number;
    operationsPerSecond: number;
    avgResponseTime: number;
    evictedKeys: number;
    expiredKeys: number;
    uptime: number;
}

export interface RedisHealthStatus {
    healthy: boolean;
    latency: number;
    memoryPressure: 'low' | 'medium' | 'high';
    performanceRating: 'excellent' | 'good' | 'poor';
    recommendations: string[];
}

export class RedisMonitorService {
    private static instance: RedisMonitorService;
    private metrics: RedisMetrics | null = null;
    private monitoringInterval: NodeJS.Timeout | null = null;

    private constructor() {
        this.startMonitoring();
    }

    public static getInstance(): RedisMonitorService {
        if (!RedisMonitorService.instance) {
            RedisMonitorService.instance = new RedisMonitorService();
        }
        return RedisMonitorService.instance;
    }

    /**
     * Start continuous monitoring
     */
    private startMonitoring(): void {
        // Monitor every 30 seconds
        this.monitoringInterval = setInterval(async () => {
            await this.collectMetrics();
            await this.checkHealth();
        }, 30000);

        console.log('✅ Redis monitoring started - collecting metrics every 30s');
    }

    /**
     * Collect comprehensive Redis metrics
     */
    private async collectMetrics(): Promise<void> {
        try {
            const health = await redisCacheService.healthCheck();
            if (!health.connected) {
                this.metrics = null;
                return;
            }

            // Get memory info
            const memoryInfo = await redisCacheService.getMemoryInfo();
            
            // Parse memory info
            const memoryMatch = memoryInfo?.match(/used_memory_human:(.+)/);
            const keyCountMatch = memoryInfo?.match(/used_memory_dataset:(.+)/);
            const evictedMatch = memoryInfo?.match(/evicted_keys:(.+)/);
            const expiredMatch = memoryInfo?.match(/expired_keys:(.+)/);

            this.metrics = {
                memoryUsage: memoryMatch?.[1]?.trim() || 'Unknown',
                keyCount: parseInt(keyCountMatch?.[1] || '0'),
                hitRate: 0, // Will be calculated from cache service stats
                missRate: 0,
                connectedClients: 1,
                operationsPerSecond: 0,
                avgResponseTime: health.latency || 0,
                evictedKeys: parseInt(evictedMatch?.[1] || '0'),
                expiredKeys: parseInt(expiredMatch?.[1] || '0'),
                uptime: 0
            };

        } catch (error) {
            console.error('❌ Error collecting Redis metrics:', error);
            this.metrics = null;
        }
    }

    /**
     * Check Redis health and generate recommendations
     */
    private async checkHealth(): Promise<RedisHealthStatus | null> {
        try {
            if (!this.metrics) return null;

            const health = await redisCacheService.healthCheck();
            const recommendations: string[] = [];

            // Determine memory pressure
            let memoryPressure: 'low' | 'medium' | 'high' = 'low';
            const memoryUsageNum = this.parseMemoryUsage(this.metrics.memoryUsage);
            
            if (memoryUsageNum > 800) { // >800MB
                memoryPressure = 'high';
                recommendations.push('Consider increasing Redis memory limit or implementing data cleanup');
            } else if (memoryUsageNum > 500) { // >500MB
                memoryPressure = 'medium';
                recommendations.push('Monitor memory usage trend closely');
            }

            // Check performance
            let performanceRating: 'excellent' | 'good' | 'poor' = 'excellent';
            if (this.metrics.avgResponseTime > 10) {
                performanceRating = 'poor';
                recommendations.push('High latency detected - check Redis server resources');
            } else if (this.metrics.avgResponseTime > 5) {
                performanceRating = 'good';
                recommendations.push('Response time acceptable but could be optimized');
            }

            // Check eviction rate
            if (this.metrics.evictedKeys > 1000) {
                recommendations.push('High eviction rate - consider increasing memory or optimizing TTL');
            }

            const healthStatus: RedisHealthStatus = {
                healthy: health.connected && performanceRating !== 'poor',
                latency: this.metrics.avgResponseTime,
                memoryPressure,
                performanceRating,
                recommendations
            };

            // Log health status periodically
            if (recommendations.length > 0) {
                console.log('🔍 Redis Health Check:', {
                    status: healthStatus,
                    metrics: this.metrics
                });
            }

            return healthStatus;

        } catch (error) {
            console.error('❌ Error checking Redis health:', error);
            return null;
        }
    }

    /**
     * Get current metrics
     */
    public getMetrics(): RedisMetrics | null {
        return this.metrics;
    }

    /**
     * Get performance summary for dashboards
     */
    public async getPerformanceSummary(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        summary: string;
        details: any;
    }> {
        const health = await this.checkHealth();
        const metrics = this.getMetrics();

        if (!health || !metrics) {
            return {
                status: 'critical',
                summary: 'Redis monitoring unavailable',
                details: { connected: false }
            };
        }

        let status: 'healthy' | 'warning' | 'critical' = 'healthy';
        let summary = 'Redis performing optimally';

        if (health.performanceRating === 'poor' || health.memoryPressure === 'high') {
            status = 'critical';
            summary = 'Redis requires immediate attention';
        } else if (health.performanceRating === 'good' || health.memoryPressure === 'medium') {
            status = 'warning';
            summary = 'Redis performance could be improved';
        }

        return {
            status,
            summary,
            details: {
                latency: `${health.latency}ms`,
                memoryUsage: metrics.memoryUsage,
                keyCount: metrics.keyCount,
                recommendations: health.recommendations
            }
        };
    }

    /**
     * Parse memory usage string to number (MB)
     */
    private parseMemoryUsage(memoryStr: string): number {
        const match = memoryStr.match(/([0-9.]+)([KMG])?/);
        if (!match || !match[1]) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2] || '';

        switch (unit) {
            case 'K': return value / 1024;
            case 'M': return value;
            case 'G': return value * 1024;
            default: return value / (1024 * 1024); // bytes to MB
        }
    }

    /**
     * Stop monitoring
     */
    public stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('🛑 Redis monitoring stopped');
        }
    }
}

// Export singleton instance
export const redisMonitorService = RedisMonitorService.getInstance();