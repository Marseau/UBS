import { Request, Response, NextFunction } from 'express';
import { redisCacheService } from '../services/redis-cache.service';

/**
 * Redis Cache Middleware for WhatsApp Salon N8N
 * Provides caching for API responses to improve performance
 */

interface CacheOptions {
    ttlSeconds?: number;
    keyGenerator?: (req: Request) => string;
    bypassCache?: (req: Request) => boolean;
}

/**
 * Generic cache middleware
 */
export const cacheMiddleware = (options: CacheOptions = {}) => {
    const {
        ttlSeconds = 300, // 5 minutes default
        keyGenerator = (req) => `api:${req.method}:${req.originalUrl}`,
        bypassCache = () => false
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Skip cache for non-GET requests or if bypassed
            if (req.method !== 'GET' || bypassCache(req)) {
                return next();
            }

            const cacheKey = keyGenerator(req);
            
            // Try to get from cache
            const cachedData = await redisCacheService.get(cacheKey);
            
            if (cachedData) {
                console.log(`🎯 Cache HIT: ${cacheKey}`);
                return res.json({
                    ...cachedData,
                    _cached: true,
                    _cachedAt: new Date().toISOString()
                });
            }

            console.log(`❌ Cache MISS: ${cacheKey}`);

            // Store original json method
            const originalJson = res.json.bind(res);
            
            // Override json method to cache response
            res.json = function(data: any) {
                // Cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    redisCacheService.set(cacheKey, data, ttlSeconds)
                        .catch(error => console.error('❌ Cache set error:', error));
                }
                
                return originalJson(data);
            };

            next();
        } catch (error) {
            console.error('❌ Cache middleware error:', error);
            next(); // Continue without caching
        }
    };
};

/**
 * Dashboard metrics cache middleware
 */
export const dashboardMetricsCache = cacheMiddleware({
    ttlSeconds: 900, // 15 minutes
    keyGenerator: (req) => {
        const tenantId = req.headers['x-tenant-id'] || 'unknown';
        const period = req.query.period || '30d';
        return `dashboard:metrics:${tenantId}:${period}`;
    },
    bypassCache: (req) => req.query.nocache === 'true'
});

/**
 * Platform metrics cache middleware
 */
export const platformMetricsCache = cacheMiddleware({
    ttlSeconds: 600, // 10 minutes
    keyGenerator: (req) => {
        const period = req.query.period || '30d';
        return `platform:metrics:${period}`;
    },
    bypassCache: (req) => req.query.nocache === 'true'
});

/**
 * WhatsApp conversation cache middleware
 */
export const conversationCache = cacheMiddleware({
    ttlSeconds: 300, // 5 minutes
    keyGenerator: (req) => {
        const tenantId = req.params.tenantId || req.headers['x-tenant-id'];
        const page = req.query.page || '1';
        const limit = req.query.limit || '50';
        return `conversations:${tenantId}:page:${page}:limit:${limit}`;
    }
});

/**
 * Analytics cache middleware
 */
export const analyticsCache = cacheMiddleware({
    ttlSeconds: 1800, // 30 minutes
    keyGenerator: (req) => {
        const tenantId = req.headers['x-tenant-id'] || 'unknown';
        const type = req.params.type || 'general';
        const period = req.query.period || '30d';
        return `analytics:${tenantId}:${type}:${period}`;
    }
});

/**
 * Super admin cache middleware
 */
export const superAdminCache = cacheMiddleware({
    ttlSeconds: 300, // 5 minutes
    keyGenerator: (req) => {
        const endpoint = req.path.split('/').pop();
        const period = req.query.period || '30d';
        return `super-admin:${endpoint}:${period}`;
    },
    bypassCache: (req) => req.query.nocache === 'true'
});

/**
 * Rate limiting middleware using Redis
 */
export const rateLimitMiddleware = (options: { maxRequests: number; windowSeconds: number; keyGenerator?: (req: Request) => string }) => {
    const {
        maxRequests,
        windowSeconds,
        keyGenerator = (req) => req.ip || 'unknown'
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const key = keyGenerator(req);
            const { allowed, remaining } = await redisCacheService.checkRateLimit(key, maxRequests, windowSeconds);

            // Add rate limit headers
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', remaining);
            res.setHeader('X-RateLimit-Window', windowSeconds);

            if (!allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: `Maximum ${maxRequests} requests per ${windowSeconds} seconds`,
                    retryAfter: windowSeconds
                });
            }

            return next();
        } catch (error) {
            console.error('❌ Rate limit middleware error:', error);
            next(); // Continue without rate limiting
        }
    };
};

/**
 * WhatsApp API rate limiting
 */
export const whatsappRateLimit = rateLimitMiddleware({
    maxRequests: 100,
    windowSeconds: 60,
    keyGenerator: (req) => `whatsapp:${req.headers['x-tenant-id'] || req.ip}`
});

/**
 * Dashboard API rate limiting
 */
export const dashboardRateLimit = rateLimitMiddleware({
    maxRequests: 200,
    windowSeconds: 60,
    keyGenerator: (req) => `dashboard:${req.headers['x-tenant-id'] || req.ip}`
});

/**
 * General API rate limiting
 */
export const generalRateLimit = rateLimitMiddleware({
    maxRequests: 300,
    windowSeconds: 60,
    keyGenerator: (req) => `api:${req.ip}`
});

// Ensure all functions return a value
export default {
    cacheMiddleware,
    dashboardMetricsCache,
    platformMetricsCache,
    conversationCache,
    analyticsCache,
    superAdminCache,
    rateLimitMiddleware,
    whatsappRateLimit,
    dashboardRateLimit,
    generalRateLimit
};