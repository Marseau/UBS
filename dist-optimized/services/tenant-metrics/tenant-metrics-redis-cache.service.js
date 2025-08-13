"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMetricsRedisCache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class TenantMetricsRedisCache {
    constructor(logger, redisConfig) {
        this.logger = logger;
        this.keyPrefix = 'ubs:metrics:';
        this.fallbackCache = new Map();
        this.stats = { hits: 0, misses: 0, totalOperations: 0, hitRate: 0 };
        this.initializeRedis(redisConfig);
        this.startStatsLogging();
    }
    initializeRedis(config) {
        try {
            const defaultConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0'),
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000,
                ...config
            };
            this.redis = new ioredis_1.default(defaultConfig);
            this.redis.on('connect', () => {
                this.logger.info('Redis connected successfully', {
                    host: defaultConfig.host,
                    port: defaultConfig.port,
                    db: defaultConfig.db
                });
            });
            this.redis.on('error', (error) => {
                this.logger.warn('Redis connection error, falling back to memory cache', {
                    error: error.message,
                    fallback: true
                });
            });
            this.redis.on('reconnecting', () => {
                this.logger.info('Redis reconnecting...');
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize Redis, using memory cache only', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async get(key) {
        const fullKey = this.keyPrefix + key;
        this.stats.totalOperations++;
        try {
            if (this.redis && this.redis.status === 'ready') {
                const value = await this.redis.get(fullKey);
                if (value !== null) {
                    this.stats.hits++;
                    this.updateHitRate();
                    try {
                        return JSON.parse(value);
                    }
                    catch (parseError) {
                        this.logger.warn('Failed to parse cached value', {
                            key: fullKey,
                            error: parseError instanceof Error ? parseError.message : 'Unknown error'
                        });
                        return value;
                    }
                }
            }
            if (this.fallbackCache.has(fullKey)) {
                const entry = this.fallbackCache.get(fullKey);
                if (entry && entry.expiry && Date.now() < entry.expiry) {
                    this.stats.hits++;
                    this.updateHitRate();
                    return entry.value;
                }
                else {
                    this.fallbackCache.delete(fullKey);
                }
            }
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }
        catch (error) {
            this.logger.error('Error getting from cache', {
                key: fullKey,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }
    }
    async set(key, value, ttl = 15 * 60 * 1000, options) {
        const fullKey = this.keyPrefix + key;
        try {
            const serializedValue = JSON.stringify(value);
            let success = false;
            if (this.redis && this.redis.status === 'ready') {
                const ttlSeconds = Math.floor(ttl / 1000);
                await this.redis.setex(fullKey, ttlSeconds, serializedValue);
                success = true;
            }
            this.fallbackCache.set(fullKey, {
                value,
                expiry: Date.now() + ttl,
                timestamp: Date.now()
            });
            if (this.fallbackCache.size > 10000) {
                this.cleanupFallbackCache();
            }
            this.logger.debug('Value cached successfully', {
                key: fullKey,
                ttl: `${ttl}ms`,
                redis: success,
                fallback: true
            });
            return true;
        }
        catch (error) {
            this.logger.error('Error setting cache', {
                key: fullKey,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    async del(key) {
        const fullKey = this.keyPrefix + key;
        try {
            let success = false;
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.del(fullKey);
                success = true;
            }
            this.fallbackCache.delete(fullKey);
            this.logger.debug('Key deleted from cache', {
                key: fullKey,
                redis: success,
                fallback: true
            });
            return true;
        }
        catch (error) {
            this.logger.error('Error deleting from cache', {
                key: fullKey,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    async clearPattern(pattern) {
        const fullPattern = this.keyPrefix + pattern;
        let deletedCount = 0;
        try {
            if (this.redis && this.redis.status === 'ready') {
                const keys = await this.redis.keys(fullPattern);
                if (keys.length > 0) {
                    deletedCount = await this.redis.del(...keys);
                }
            }
            for (const [key] of this.fallbackCache.entries()) {
                if (key.includes(pattern)) {
                    this.fallbackCache.delete(key);
                    deletedCount++;
                }
            }
            this.logger.info('Pattern cleared from cache', {
                pattern: fullPattern,
                deletedCount,
                redis: this.redis?.status === 'ready'
            });
            return deletedCount;
        }
        catch (error) {
            this.logger.error('Error clearing cache pattern', {
                pattern: fullPattern,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return 0;
        }
    }
    async clearAll() {
        try {
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.flushdb();
            }
            this.fallbackCache.clear();
            this.logger.info('All cache cleared');
            return true;
        }
        catch (error) {
            this.logger.error('Error clearing all cache', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    async getStats() {
        const stats = { ...this.stats };
        try {
            if (this.redis && this.redis.status === 'ready') {
                const info = await this.redis.info('memory');
                const keyCount = await this.redis.dbsize();
                const memoryMatch = info?.match(/used_memory_human:(.+)/);
                stats.memoryUsage = memoryMatch ? memoryMatch[1]?.trim() : 'Unknown';
                stats.keyCount = keyCount;
            }
            stats.keyCount = (stats.keyCount || 0) + this.fallbackCache.size;
        }
        catch (error) {
            this.logger.warn('Error getting cache stats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        return stats;
    }
    async healthCheck() {
        const result = {
            redis: false,
            fallback: true,
            latency: undefined
        };
        try {
            if (this.redis && this.redis.status === 'ready') {
                const start = Date.now();
                await this.redis.ping();
                result.latency = Date.now() - start;
                result.redis = true;
            }
        }
        catch (error) {
            this.logger.warn('Redis health check failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        return result;
    }
    async optimize() {
        try {
            this.cleanupFallbackCache();
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.info('memory');
            }
            this.logger.info('Cache optimization completed', {
                fallbackSize: this.fallbackCache.size,
                redisConnected: this.redis?.status === 'ready'
            });
        }
        catch (error) {
            this.logger.error('Error optimizing cache', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    cleanupFallbackCache() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [key, entry] of this.fallbackCache.entries()) {
            if (entry.expiry && now > entry.expiry) {
                this.fallbackCache.delete(key);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logger.debug('Fallback cache cleanup completed', {
                cleanedEntries: cleanedCount,
                remainingEntries: this.fallbackCache.size
            });
        }
    }
    updateHitRate() {
        if (this.stats.totalOperations > 0) {
            this.stats.hitRate = (this.stats.hits / this.stats.totalOperations) * 100;
        }
    }
    startStatsLogging() {
        setInterval(async () => {
            const stats = await this.getStats();
            const health = await this.healthCheck();
            this.logger.info('Cache performance stats', {
                ...stats,
                ...health,
                fallbackSize: this.fallbackCache.size
            });
            if (stats.totalOperations > 1000000) {
                this.stats = { hits: 0, misses: 0, totalOperations: 0, hitRate: 0 };
            }
        }, 5 * 60 * 1000);
    }
    async close() {
        try {
            if (this.redis) {
                await this.redis.quit();
                this.logger.info('Redis connection closed');
            }
            this.fallbackCache.clear();
            this.logger.info('Cache service closed successfully');
        }
        catch (error) {
            this.logger.error('Error closing cache service', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
exports.TenantMetricsRedisCache = TenantMetricsRedisCache;
//# sourceMappingURL=tenant-metrics-redis-cache.service.js.map