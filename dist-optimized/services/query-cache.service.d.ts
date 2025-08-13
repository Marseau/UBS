export interface CacheOptions {
    ttl?: number;
    forceRefresh?: boolean;
}
export declare class QueryCacheService {
    private static cache;
    private static readonly DEFAULT_TTL;
    private static generateCacheKey;
    private static isValidCacheEntry;
    private static getCachedData;
    private static setCachedData;
    static clearCache(): void;
    static clearCacheByPattern(pattern: string): void;
    static getCacheStats(): {
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
        memoryUsage: string;
    };
    static get(key: string): Promise<any>;
    static set(key: string, data: any, options?: CacheOptions): Promise<void>;
    static getDashboardAnalytics(tenantId: string, options?: CacheOptions): Promise<any>;
    static getServicesData(tenantId: string, options?: CacheOptions): Promise<any>;
    static getCustomersData(tenantId: string, options?: CacheOptions): Promise<any>;
    static getTenantConfig(tenantId: string, options?: CacheOptions): Promise<any>;
    static invalidateTenantCache(tenantId: string): void;
    static startCacheCleanup(): void;
}
