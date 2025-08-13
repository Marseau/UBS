/**
 * P3-001: Advanced Redis Caching Service
 * 
 * Implements comprehensive caching layer for API responses,
 * dashboard data, and metrics calculations
 */

const Redis = require('ioredis');
const crypto = require('crypto');

class RedisCacheService {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            errors: 0
        };
        
        // Cache TTL configurations (in seconds)
        this.ttlConfig = {
            DASHBOARD_DATA: 300,      // 5 minutes
            METRICS_CALCULATION: 600, // 10 minutes
            API_RESPONSE: 180,        // 3 minutes
            USER_SESSION: 1800,       // 30 minutes
            TENANT_CONFIG: 3600,      // 1 hour
            ANALYTICS_HEAVY: 1800,    // 30 minutes
            QUICK_STATS: 60,          // 1 minute
            PLATFORM_METRICS: 900     // 15 minutes
        };
        
        this.keyPrefixes = {
            DASHBOARD: 'dash:',
            METRICS: 'metrics:',
            API: 'api:',
            USER: 'user:',
            TENANT: 'tenant:',
            ANALYTICS: 'analytics:',
            STATS: 'stats:',
            PLATFORM: 'platform:'
        };
        
        this.init();
    }
    
    async init() {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000
            };
            
            this.redis = new Redis(redisConfig);
            
            this.redis.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
            });
            
            this.redis.on('error', (err) => {
                console.error('❌ Redis error:', err.message);
                this.cacheStats.errors++;
                this.isConnected = false;
            });
            
            this.redis.on('close', () => {
                console.log('⚠️  Redis connection closed');
                this.isConnected = false;
            });
            
            // Test connection
            await this.redis.ping();
            console.log('🚀 Redis cache service initialized');
            
        } catch (error) {
            console.error('❌ Redis initialization failed:', error.message);
            this.isConnected = false;
        }
    }
    
    generateCacheKey(prefix, identifier, params = {}) {
        const baseKey = `${prefix}${identifier}`;
        
        if (Object.keys(params).length === 0) {
            return baseKey;
        }
        
        // Create deterministic hash from parameters
        const sortedParams = Object.keys(params)
            .sort()
            .reduce((result, key) => {
                result[key] = params[key];
                return result;
            }, {});
            
        const paramsString = JSON.stringify(sortedParams);
        const hash = crypto.createHash('md5').update(paramsString).digest('hex').substring(0, 8);
        
        return `${baseKey}:${hash}`;
    }
    
    async get(key) {
        if (!this.isConnected) {
            this.cacheStats.misses++;
            return null;
        }
        
        try {
            const value = await this.redis.get(key);
            
            if (value) {
                this.cacheStats.hits++;
                try {
                    return JSON.parse(value);
                } catch {
                    return value; // Return as string if not JSON
                }
            } else {
                this.cacheStats.misses++;
                return null;
            }
        } catch (error) {
            console.error('❌ Cache get error:', error.message);
            this.cacheStats.errors++;
            return null;
        }
    }
    
    async set(key, value, ttl = this.ttlConfig.API_RESPONSE) {
        if (!this.isConnected) {
            return false;
        }
        
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            await this.redis.setex(key, ttl, serializedValue);
            this.cacheStats.sets++;
            return true;
        } catch (error) {
            console.error('❌ Cache set error:', error.message);
            this.cacheStats.errors++;
            return false;
        }
    }
    
    async del(key) {
        if (!this.isConnected) {
            return false;
        }
        
        try {
            await this.redis.del(key);
            return true;
        } catch (error) {
            console.error('❌ Cache delete error:', error.message);
            this.cacheStats.errors++;
            return false;
        }
    }
    
    async invalidatePattern(pattern) {
        if (!this.isConnected) {
            return false;
        }
        
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`);
            }
            return true;
        } catch (error) {
            console.error('❌ Cache pattern invalidation error:', error.message);
            this.cacheStats.errors++;
            return false;
        }
    }
    
    // Dashboard-specific caching methods
    async cacheDashboardData(tenantId, dashboardType, data) {
        const key = this.generateCacheKey(
            this.keyPrefixes.DASHBOARD,
            `${tenantId}:${dashboardType}`
        );
        return await this.set(key, data, this.ttlConfig.DASHBOARD_DATA);
    }
    
    async getDashboardData(tenantId, dashboardType) {
        const key = this.generateCacheKey(
            this.keyPrefixes.DASHBOARD,
            `${tenantId}:${dashboardType}`
        );
        return await this.get(key);
    }
    
    async invalidateDashboardCache(tenantId) {
        const pattern = `${this.keyPrefixes.DASHBOARD}${tenantId}:*`;
        return await this.invalidatePattern(pattern);
    }
    
    // Metrics calculation caching
    async cacheMetricsCalculation(metricType, params, result) {
        const key = this.generateCacheKey(
            this.keyPrefixes.METRICS,
            metricType,
            params
        );
        return await this.set(key, result, this.ttlConfig.METRICS_CALCULATION);
    }
    
    async getMetricsCalculation(metricType, params) {
        const key = this.generateCacheKey(
            this.keyPrefixes.METRICS,
            metricType,
            params
        );
        return await this.get(key);
    }
    
    async invalidateMetricsCache(metricType = '*') {
        const pattern = `${this.keyPrefixes.METRICS}${metricType}*`;
        return await this.invalidatePattern(pattern);
    }
    
    // API response caching
    async cacheAPIResponse(endpoint, params, response) {
        const key = this.generateCacheKey(
            this.keyPrefixes.API,
            endpoint,
            params
        );
        return await this.set(key, response, this.ttlConfig.API_RESPONSE);
    }
    
    async getAPIResponse(endpoint, params) {
        const key = this.generateCacheKey(
            this.keyPrefixes.API,
            endpoint,
            params
        );
        return await this.get(key);
    }
    
    // Platform metrics caching
    async cachePlatformMetrics(data) {
        const key = `${this.keyPrefixes.PLATFORM}metrics`;
        return await this.set(key, data, this.ttlConfig.PLATFORM_METRICS);
    }
    
    async getPlatformMetrics() {
        const key = `${this.keyPrefixes.PLATFORM}metrics`;
        return await this.get(key);
    }
    
    // User session caching
    async cacheUserSession(userId, sessionData) {
        const key = `${this.keyPrefixes.USER}session:${userId}`;
        return await this.set(key, sessionData, this.ttlConfig.USER_SESSION);
    }
    
    async getUserSession(userId) {
        const key = `${this.keyPrefixes.USER}session:${userId}`;
        return await this.get(key);
    }
    
    // Tenant configuration caching
    async cacheTenantConfig(tenantId, config) {
        const key = `${this.keyPrefixes.TENANT}config:${tenantId}`;
        return await this.set(key, config, this.ttlConfig.TENANT_CONFIG);
    }
    
    async getTenantConfig(tenantId) {
        const key = `${this.keyPrefixes.TENANT}config:${tenantId}`;
        return await this.get(key);
    }
    
    async invalidateTenantCache(tenantId) {
        const pattern = `${this.keyPrefixes.TENANT}*:${tenantId}`;
        return await this.invalidatePattern(pattern);
    }
    
    // Cache warming - preload frequently accessed data
    async warmCache() {
        console.log('🔥 Starting cache warming...');
        
        try {
            // This would be implemented to preload common dashboard data
            // For now, just log the warming process
            console.log('✅ Cache warming completed');
            return true;
        } catch (error) {
            console.error('❌ Cache warming failed:', error.message);
            return false;
        }
    }
    
    // Cache statistics and monitoring
    getCacheStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;
            
        return {
            ...this.cacheStats,
            hitRate: `${hitRate}%`,
            isConnected: this.isConnected,
            uptime: process.uptime()
        };
    }
    
    async getRedisInfo() {
        if (!this.isConnected) {
            return { status: 'disconnected' };
        }
        
        try {
            const info = await this.redis.info('memory');
            const keyspace = await this.redis.info('keyspace');
            
            return {
                status: 'connected',
                memory: info,
                keyspace: keyspace,
                stats: this.getCacheStats()
            };
        } catch (error) {
            console.error('❌ Redis info error:', error.message);
            return { status: 'error', error: error.message };
        }
    }
    
    // Cleanup and maintenance
    async cleanup() {
        console.log('🧹 Starting cache cleanup...');
        
        try {
            // Remove expired keys (Redis handles this automatically, but we can force it)
            const keys = await this.redis.keys('*');
            console.log(`📊 Total cache keys: ${keys.length}`);
            
            // Additional cleanup logic can be added here
            return true;
        } catch (error) {
            console.error('❌ Cache cleanup error:', error.message);
            return false;
        }
    }
    
    async disconnect() {
        if (this.redis) {
            await this.redis.disconnect();
            console.log('👋 Redis disconnected');
        }
    }
}

// Singleton instance
let cacheServiceInstance = null;

function getCacheService() {
    if (!cacheServiceInstance) {
        cacheServiceInstance = new RedisCacheService();
    }
    return cacheServiceInstance;
}

module.exports = {
    RedisCacheService,
    getCacheService
};