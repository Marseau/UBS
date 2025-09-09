/**
 * Metrics Cache Middleware
 * Unified caching layer for dashboard metrics
 *
 * @fileoverview High-performance caching middleware with TTL, invalidation, and monitoring
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

import { Request, Response, NextFunction } from "express";
import {
  CacheConfig,
  CacheEntry,
  CacheStats,
  UnifiedError,
} from "../types/unified-metrics.types";

/**
 * Memory-optimized cache configuration per metric type
 * Reduced max_size values to target <50MB total memory usage
 */
const CACHE_CONFIGS: Record<string, CacheConfig> = {
  platform_metrics: {
    key_prefix: "platform_metrics",
    ttl: 5 * 60 * 1000, // 5 minutes
    type: "memory",
    max_size: 25, // Reduced from 100
    eviction_policy: "lru",
  },
  tenant_metrics: {
    key_prefix: "tenant_metrics",
    ttl: 3 * 60 * 1000, // 3 minutes
    type: "memory",
    max_size: 100, // Reduced from 500
    eviction_policy: "lru",
  },
  platform_kpis: {
    key_prefix: "platform_kpis",
    ttl: 10 * 60 * 1000, // 10 minutes
    type: "memory",
    max_size: 15, // Reduced from 50
    eviction_policy: "ttl",
  },
  tenant_participation: {
    key_prefix: "tenant_participation",
    ttl: 5 * 60 * 1000, // 5 minutes
    type: "memory",
    max_size: 50, // Reduced from 200
    eviction_policy: "lru",
  },
  comparison_data: {
    key_prefix: "comparison_data",
    ttl: 5 * 60 * 1000, // 5 minutes
    type: "memory",
    max_size: 30, // Reduced from 200
    eviction_policy: "lru",
  },
  charts_data: {
    key_prefix: "charts_data",
    ttl: 10 * 60 * 1000, // 10 minutes
    type: "memory",
    max_size: 50, // Reduced from 300
    eviction_policy: "lru",
  },
  system_status: {
    key_prefix: "system_status",
    ttl: 1 * 60 * 1000, // 1 minute
    type: "memory",
    max_size: 5, // Reduced from 10
    eviction_policy: "ttl",
  },
};

/**
 * Unified Metrics Cache Service
 */
class MetricsCacheService {
  private static cache = new Map<string, CacheEntry>();
  private static stats: CacheStats = {
    hits: 0,
    misses: 0,
    hit_rate: 0,
    total_entries: 0,
    memory_usage: 0,
    avg_response_time: 0,
  };

  /**
   * Generate cache key from request parameters
   */
  static generateCacheKey(
    metricType: string,
    params: Record<string, any>,
  ): string {
    const config = CACHE_CONFIGS[metricType];
    if (!config) {
      throw new Error(`Unknown metric type: ${metricType}`);
    }

    // Sort parameters for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = params[key];
          return acc;
        },
        {} as Record<string, any>,
      );

    const paramString = JSON.stringify(sortedParams);
    const hash = Buffer.from(paramString)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");

    return `${config.key_prefix}:${hash}`;
  }

  /**
   * Check if cache entry is valid
   */
  static isValidEntry(entry: CacheEntry): boolean {
    const now = Date.now();
    const isValid = now - entry.timestamp < entry.ttl;

    if (isValid) {
      entry.hit_count++;
      entry.last_accessed = now;
    }

    return isValid;
  }

  /**
   * Get data from cache
   */
  static async get<T = any>(
    metricType: string,
    params: Record<string, any>,
  ): Promise<T | null> {
    const startTime = Date.now();
    const key = this.generateCacheKey(metricType, params);
    const entry = this.cache.get(key);

    if (entry && this.isValidEntry(entry)) {
      this.stats.hits++;
      this.updateStats(Date.now() - startTime);

      // Clone data to prevent mutations
      return JSON.parse(JSON.stringify(entry.data));
    }

    this.stats.misses++;
    this.updateStats(Date.now() - startTime);
    return null;
  }

  /**
   * Set data in cache
   */
  static async set<T = any>(
    metricType: string,
    params: Record<string, any>,
    data: T,
  ): Promise<void> {
    const config = CACHE_CONFIGS[metricType];
    if (!config) {
      throw new Error(`Unknown metric type: ${metricType}`);
    }

    const key = this.generateCacheKey(metricType, params);
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: now,
      ttl: config.ttl,
      key,
      hit_count: 0,
      last_accessed: now,
    };

    this.cache.set(key, entry);
    this.stats.total_entries = this.cache.size;

    // Enforce cache size limits
    this.enforceMaxSize(metricType);
    this.updateMemoryUsage();
  }

  /**
   * Invalidate cache entries by pattern
   */
  static async invalidate(pattern: string): Promise<number> {
    let removedCount = 0;
    const keysToRemove: string[] = [];

    for (const [key] of Array.from(this.cache)) {
      if (key.includes(pattern)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      this.cache.delete(key);
      removedCount++;
    });

    this.stats.total_entries = this.cache.size;
    this.updateMemoryUsage();

    return removedCount;
  }

  /**
   * Invalidate all cache entries for a specific metric type
   */
  static async invalidateMetricType(metricType: string): Promise<number> {
    const config = CACHE_CONFIGS[metricType];
    if (!config) {
      throw new Error(`Unknown metric type: ${metricType}`);
    }

    return this.invalidate(config.key_prefix);
  }

  /**
   * Invalidate all cache entries for a specific tenant
   */
  static async invalidateTenant(tenantId: string): Promise<number> {
    return this.invalidate(tenantId);
  }

  /**
   * Clear all cache entries
   */
  static async clear(): Promise<void> {
    this.cache.clear();
    this.stats.total_entries = 0;
    this.stats.memory_usage = 0;
  }

  /**
   * Clean up expired entries
   */
  static async cleanup(): Promise<number> {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, entry] of Array.from(this.cache)) {
      if (now - entry.timestamp >= entry.ttl) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      this.cache.delete(key);
    });

    this.stats.total_entries = this.cache.size;
    this.updateMemoryUsage();

    return keysToRemove.length;
  }

  /**
   * Enforce maximum cache size based on eviction policy
   */
  private static enforceMaxSize(metricType: string): void {
    const config = CACHE_CONFIGS[metricType];
    if (!config || !config.max_size) return;

    const entries = Array.from(this.cache.entries()).filter(([key]) =>
      key.startsWith(config.key_prefix),
    );

    if (entries.length <= (config.max_size || 100)) return;

    // Sort entries based on eviction policy
    const sortedEntries = this.sortEntriesByEvictionPolicy(
      entries,
      config.eviction_policy || "lru",
    );

    // Remove excess entries
    const maxSize = config.max_size || 100;
    const excessCount = entries.length - maxSize;
    for (let i = 0; i < excessCount; i++) {
      this.cache.delete(sortedEntries[i]?.[0] || "");
    }

    this.stats.total_entries = this.cache.size;
  }

  /**
   * Sort entries by eviction policy
   */
  private static sortEntriesByEvictionPolicy(
    entries: [string, CacheEntry][],
    policy: string = "lru",
  ): [string, CacheEntry][] {
    switch (policy) {
      case "lru": // Least Recently Used
        return entries.sort(
          ([, a], [, b]) => a.last_accessed - b.last_accessed,
        );

      case "lfu": // Least Frequently Used
        return entries.sort(([, a], [, b]) => a.hit_count - b.hit_count);

      case "ttl": // Time To Live (oldest first)
        return entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);

      default:
        return entries;
    }
  }

  /**
   * Update cache statistics
   */
  private static updateStats(responseTime: number): void {
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hit_rate =
      totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    this.stats.avg_response_time =
      (this.stats.avg_response_time + responseTime) / 2;
  }

  /**
   * Update memory usage estimation
   */
  private static updateMemoryUsage(): void {
    let totalSize = 0;
    for (const [key, entry] of Array.from(this.cache)) {
      totalSize += key.length * 2; // String characters (UTF-16)
      totalSize += JSON.stringify(entry.data).length * 2; // Data size
      totalSize += 64; // Entry metadata overhead
    }
    this.stats.memory_usage = totalSize;
  }

  /**
   * Get cache statistics
   */
  static getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get detailed cache information
   */
  static getDetailedInfo(): Record<string, any> {
    const info: Record<string, any> = {};

    for (const [metricType, config] of Object.entries(CACHE_CONFIGS)) {
      const entries = Array.from(this.cache.entries()).filter(([key]) =>
        key.startsWith(config.key_prefix),
      );

      info[metricType] = {
        config,
        entries_count: entries.length,
        hit_rate: entries.reduce((acc, [, entry]) => acc + entry.hit_count, 0),
        avg_age:
          entries.reduce(
            (acc, [, entry]) => acc + (Date.now() - entry.timestamp),
            0,
          ) / entries.length || 0,
        memory_usage: entries.reduce((acc, [key, entry]) => {
          return acc + key.length * 2 + JSON.stringify(entry.data).length * 2;
        }, 0),
      };
    }

    return info;
  }
}

/**
 * Express middleware for caching metrics requests
 */
export const cacheMiddleware = (metricType: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Skip cache for force refresh requests
      if (req.query.force_refresh === "true") {
        return next();
      }

      // Generate cache parameters from request
      const cacheParams = {
        ...req.query,
        ...req.params,
        tenant_id: req.params.tenantId || req.params.id,
        user_id: (req as any).user?.id,
        timestamp: Math.floor(Date.now() / 60000), // Round to minute for cache grouping
      };

      // Try to get from cache
      const cachedData = await MetricsCacheService.get(metricType, cacheParams);

      if (cachedData) {
        // Add cache headers
        res.set({
          "X-Cache-Status": "HIT",
          "X-Cache-Key": MetricsCacheService.generateCacheKey(
            metricType,
            cacheParams,
          ),
          "X-Cache-TTL": CACHE_CONFIGS[metricType]?.ttl.toString() || "0",
        });

        res.json(cachedData);
        return;
      }

      // Cache miss - store original res.json
      const originalJson = res.json;

      res.json = function (data: any): Response {
        // Store in cache before sending response
        MetricsCacheService.set(metricType, cacheParams, data).catch(
          (error) => {
            console.error("Cache storage error:", error);
          },
        );

        // Add cache headers
        res.set({
          "X-Cache-Status": "MISS",
          "X-Cache-Key": MetricsCacheService.generateCacheKey(
            metricType,
            cacheParams,
          ),
          "X-Cache-TTL": CACHE_CONFIGS[metricType]?.ttl.toString() || "0",
        });

        return originalJson.call(this, data);
      };

      next();
      return;
    } catch (error) {
      console.error("Cache middleware error:", error);

      // Send error response
      const errorResponse: UnifiedError = {
        error: true,
        message: "Cache middleware error",
        code: "CACHE_001",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        request_id: (req.headers["x-request-id"] as string) || "unknown",
      };

      res.status(500).json(errorResponse);
    }
  };
};

/**
 * Middleware to invalidate cache on data changes
 */
export const invalidateCacheMiddleware = (patterns: string[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Store original response methods
      const originalJson = res.json;
      const originalSend = res.send;

      // Override response methods to invalidate cache after successful response
      const invalidateCache = async (data: any): Promise<void> => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            for (const pattern of patterns) {
              await MetricsCacheService.invalidate(pattern);
            }
          } catch (error) {
            console.error("Cache invalidation error:", error);
          }
        }
      };

      res.json = function (data: any): Response {
        invalidateCache(data);
        return originalJson.call(this, data);
      };

      res.send = function (data: any): Response {
        invalidateCache(data);
        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      console.error("Cache invalidation middleware error:", error);
      next();
    }
  };
};

/**
 * Cleanup middleware to remove expired cache entries
 * Should be called periodically
 */
export const cleanupCacheMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Run cleanup in background
    setImmediate(async () => {
      try {
        const removed = await MetricsCacheService.cleanup();
        if (removed > 0) {
          console.log(`Cache cleanup: removed ${removed} expired entries`);
        }
      } catch (error) {
        console.error("Cache cleanup error:", error);
      }
    });

    next();
  } catch (error) {
    console.error("Cache cleanup middleware error:", error);
    next();
  }
};

/**
 * Health check middleware for cache service
 */
export const cacheHealthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const stats = MetricsCacheService.getStats();
    const isHealthy = stats.hit_rate > 50 && stats.total_entries < 1000;

    (req as any).cacheHealth = {
      status: isHealthy ? "healthy" : "degraded",
      stats,
      detailed_info: MetricsCacheService.getDetailedInfo(),
    };

    next();
  } catch (error) {
    console.error("Cache health check error:", error);
    (req as any).cacheHealth = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    };
    next();
  }
};

// Export cache service for direct use
export { MetricsCacheService };

// Export middleware factories
export const createCacheMiddleware = cacheMiddleware;
export const createInvalidationMiddleware = invalidateCacheMiddleware;
