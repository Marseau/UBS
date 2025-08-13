/**
 * P3-001: Advanced Caching Middleware
 * 
 * Automatic caching for API endpoints with intelligent invalidation
 */

const { getCacheService } = require('../services/redis-cache.service');

class CacheMiddleware {
    constructor() {
        this.cache = getCacheService();
        this.cacheableEndpoints = new Set([
            '/api/admin/dashboard',
            '/api/admin/analytics',
            '/api/admin/user-info',
            '/api/analytics/dashboard',
            '/api/analytics/metrics',
            '/api/tenant-platform/metrics',
            '/api/super-admin/platform-metrics',
            '/api/billing/subscription'
        ]);
        
        this.nonCacheableMethods = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
        this.cacheBypassHeader = 'x-cache-bypass';
    }
    
    // Main caching middleware
    cacheResponse(options = {}) {
        const {
            ttl = 300, // 5 minutes default
            varyBy = [], // Additional parameters to vary cache by
            skipIf = null, // Function to determine if caching should be skipped
            keyGenerator = null // Custom key generator function
        } = options;
        
        return async (req, res, next) => {
            // Skip caching for non-cacheable methods
            if (this.nonCacheableMethods.has(req.method)) {
                return next();
            }
            
            // Skip caching if bypass header is present
            if (req.headers[this.cacheBypassHeader]) {
                console.log('🚫 Cache bypass requested');
                return next();
            }
            
            // Skip caching if custom condition is met
            if (skipIf && skipIf(req)) {
                return next();
            }
            
            // Generate cache key
            const cacheKey = keyGenerator 
                ? keyGenerator(req)
                : this.generateRequestCacheKey(req, varyBy);
            
            try {
                // Try to get cached response
                const cachedResponse = await this.cache.get(cacheKey);
                
                if (cachedResponse) {
                    console.log(`🎯 Cache HIT: ${req.path}`);
                    res.setHeader('X-Cache-Status', 'HIT');
                    res.setHeader('X-Cache-Key', cacheKey);
                    return res.json(cachedResponse);
                }
                
                console.log(`💫 Cache MISS: ${req.path}`);
                
                // Store original res.json
                const originalJson = res.json.bind(res);
                
                // Override res.json to cache the response
                res.json = (data) => {
                    // Cache the response
                    this.cache.set(cacheKey, data, ttl).catch(err => {
                        console.error('❌ Failed to cache response:', err.message);
                    });
                    
                    res.setHeader('X-Cache-Status', 'MISS');
                    res.setHeader('X-Cache-Key', cacheKey);
                    
                    // Call original res.json
                    return originalJson(data);
                };
                
                next();
                
            } catch (error) {
                console.error('❌ Cache middleware error:', error.message);
                // Continue without caching on error
                next();
            }
        };
    }
    
    // Smart caching based on endpoint patterns
    smartCache() {
        return async (req, res, next) => {
            const endpoint = req.path;
            
            // Determine if endpoint should be cached
            if (!this.shouldCacheEndpoint(endpoint, req.method)) {
                return next();
            }
            
            // Get TTL based on endpoint type
            const ttl = this.getTTLForEndpoint(endpoint);
            
            // Get cache parameters based on endpoint
            const varyBy = this.getVaryByForEndpoint(endpoint, req);
            
            // Apply caching with endpoint-specific configuration
            return this.cacheResponse({ 
                ttl, 
                varyBy,
                keyGenerator: (req) => this.generateSmartCacheKey(req)
            })(req, res, next);
        };
    }
    
    generateRequestCacheKey(req, varyBy = []) {
        const baseKey = `api:${req.path}`;
        
        const params = {
            query: req.query,
            ...varyBy.reduce((acc, field) => {
                if (req[field] !== undefined) {
                    acc[field] = req[field];
                }
                return acc;
            }, {})
        };
        
        // Include tenant ID if available
        if (req.admin?.tenantId) {
            params.tenantId = req.admin.tenantId;
        }
        
        return this.cache.generateCacheKey('api:', req.path, params);
    }
    
    generateSmartCacheKey(req) {
        const segments = [req.path];
        
        // Add tenant ID for tenant-specific endpoints
        if (req.admin?.tenantId && this.isTenantSpecificEndpoint(req.path)) {
            segments.push(`tenant:${req.admin.tenantId}`);
        }
        
        // Add user role for role-specific data
        if (req.admin?.role) {
            segments.push(`role:${req.admin.role}`);
        }
        
        // Add query parameters that affect response
        const relevantQuery = this.getRelevantQueryParams(req.path, req.query);
        if (Object.keys(relevantQuery).length > 0) {
            const queryString = new URLSearchParams(relevantQuery).toString();
            segments.push(`query:${queryString}`);
        }
        
        return segments.join(':');
    }
    
    shouldCacheEndpoint(endpoint, method) {
        if (this.nonCacheableMethods.has(method)) {
            return false;
        }
        
        // Check against whitelist
        return this.cacheableEndpoints.has(endpoint) || 
               endpoint.startsWith('/api/analytics/') ||
               endpoint.startsWith('/api/admin/dashboard') ||
               endpoint.startsWith('/api/metrics/');
    }
    
    getTTLForEndpoint(endpoint) {
        if (endpoint.includes('/dashboard')) {
            return 300; // 5 minutes for dashboard data
        }
        
        if (endpoint.includes('/analytics') || endpoint.includes('/metrics')) {
            return 600; // 10 minutes for analytics
        }
        
        if (endpoint.includes('/user-info')) {
            return 900; // 15 minutes for user info
        }
        
        if (endpoint.includes('/platform-metrics')) {
            return 900; // 15 minutes for platform metrics
        }
        
        return 180; // 3 minutes default
    }
    
    getVaryByForEndpoint(endpoint, req) {
        const varyBy = [];
        
        // Always vary by tenant for tenant-specific data
        if (this.isTenantSpecificEndpoint(endpoint)) {
            varyBy.push('tenantId');
        }
        
        // Vary by period for time-based analytics
        if (endpoint.includes('/analytics') || endpoint.includes('/metrics')) {
            if (req.query.period) varyBy.push('period');
            if (req.query.dateRange) varyBy.push('dateRange');
        }
        
        return varyBy;
    }
    
    isTenantSpecificEndpoint(endpoint) {
        const tenantSpecificPatterns = [
            '/api/admin/dashboard',
            '/api/admin/analytics',
            '/api/tenant-platform/',
            '/api/billing/subscription'
        ];
        
        return tenantSpecificPatterns.some(pattern => endpoint.startsWith(pattern));
    }
    
    getRelevantQueryParams(endpoint, query) {
        const relevant = {};
        
        // Common parameters that affect caching
        const commonParams = ['period', 'startDate', 'endDate', 'limit', 'offset'];
        
        // Endpoint-specific parameters
        const endpointParams = {
            '/api/analytics/': ['metric', 'groupBy', 'filter'],
            '/api/admin/dashboard': ['view', 'period'],
            '/api/metrics/': ['type', 'aggregation']
        };
        
        // Include common parameters
        commonParams.forEach(param => {
            if (query[param] !== undefined) {
                relevant[param] = query[param];
            }
        });
        
        // Include endpoint-specific parameters
        Object.entries(endpointParams).forEach(([pattern, params]) => {
            if (endpoint.startsWith(pattern)) {
                params.forEach(param => {
                    if (query[param] !== undefined) {
                        relevant[param] = query[param];
                    }
                });
            }
        });
        
        return relevant;
    }
    
    // Cache invalidation middleware for data-modifying operations
    invalidateCache() {
        return async (req, res, next) => {
            // Store original res.json
            const originalJson = res.json.bind(res);
            
            // Override res.json to invalidate cache after successful operations
            res.json = async (data) => {
                // Only invalidate if operation was successful
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    await this.invalidateCacheForRequest(req);
                }
                
                return originalJson(data);
            };
            
            next();
        };
    }
    
    async invalidateCacheForRequest(req) {
        try {
            const endpoint = req.path;
            const tenantId = req.admin?.tenantId;
            
            // Invalidate based on endpoint type
            if (endpoint.includes('/appointments')) {
                // Invalidate dashboard and analytics cache
                if (tenantId) {
                    await this.cache.invalidateDashboardCache(tenantId);
                    await this.cache.invalidateMetricsCache();
                }
            }
            
            if (endpoint.includes('/users') || endpoint.includes('/customers')) {
                if (tenantId) {
                    await this.cache.invalidateDashboardCache(tenantId);
                }
            }
            
            if (endpoint.includes('/services')) {
                if (tenantId) {
                    await this.cache.invalidateTenantCache(tenantId);
                    await this.cache.invalidateDashboardCache(tenantId);
                }
            }
            
            // Invalidate platform metrics for any data changes
            await this.cache.invalidatePattern('platform:*');
            
            console.log(`🗑️  Cache invalidated for: ${endpoint}`);
            
        } catch (error) {
            console.error('❌ Cache invalidation error:', error.message);
        }
    }
    
    // Cache health and statistics endpoint
    getCacheHealthMiddleware() {
        return async (req, res) => {
            try {
                const stats = this.cache.getCacheStats();
                const redisInfo = await this.cache.getRedisInfo();
                
                res.json({
                    cacheService: {
                        status: redisInfo.status,
                        stats: stats,
                        configuration: {
                            cacheableEndpoints: Array.from(this.cacheableEndpoints),
                            ttlConfig: this.cache.ttlConfig
                        }
                    },
                    redis: redisInfo
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get cache health',
                    message: error.message
                });
            }
        };
    }
}

// Singleton instance
let cacheMiddlewareInstance = null;

function getCacheMiddleware() {
    if (!cacheMiddlewareInstance) {
        cacheMiddlewareInstance = new CacheMiddleware();
    }
    return cacheMiddlewareInstance;
}

module.exports = {
    CacheMiddleware,
    getCacheMiddleware
};