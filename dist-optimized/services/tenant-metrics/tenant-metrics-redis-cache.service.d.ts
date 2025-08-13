import { Logger } from 'winston';
export interface CacheOptions {
    ttl?: number;
    compress?: boolean;
    serialize?: boolean;
}
export interface CacheStats {
    hits: number;
    misses: number;
    totalOperations: number;
    hitRate: number;
    memoryUsage?: string;
    keyCount?: number;
    connectedClients?: number;
}
export declare class TenantMetricsRedisCache {
    private logger;
    private redis;
    private fallbackCache;
    private stats;
    private readonly keyPrefix;
    constructor(logger: Logger, redisConfig?: {
        host?: string;
        port?: number;
        password?: string;
        db?: number;
        maxRetriesPerRequest?: number;
        retryDelayOnFailover?: number;
        lazyConnect?: boolean;
    });
    private initializeRedis;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl?: number, options?: CacheOptions): Promise<boolean>;
    del(key: string): Promise<boolean>;
    clearPattern(pattern: string): Promise<number>;
    clearAll(): Promise<boolean>;
    getStats(): Promise<CacheStats>;
    healthCheck(): Promise<{
        redis: boolean;
        fallback: boolean;
        latency?: number;
    }>;
    optimize(): Promise<void>;
    private cleanupFallbackCache;
    private updateHitRate;
    private startStatsLogging;
    close(): Promise<void>;
}
