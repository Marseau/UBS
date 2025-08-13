"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryCacheService = void 0;
const database_1 = require("../config/database");
class QueryCacheService {
    static generateCacheKey(queryName, params) {
        const paramString = JSON.stringify(params, Object.keys(params).sort());
        return `${queryName}:${Buffer.from(paramString).toString("base64")}`;
    }
    static isValidCacheEntry(entry) {
        return Date.now() - entry.timestamp < entry.expiresIn;
    }
    static getCachedData(key) {
        const entry = this.cache.get(key);
        if (entry && this.isValidCacheEntry(entry)) {
            console.log(`🎯 Cache HIT: ${key}`);
            return entry.data;
        }
        if (entry) {
            this.cache.delete(key);
            console.log(`⏰ Cache EXPIRED: ${key}`);
        }
        return null;
    }
    static setCachedData(key, data, ttl) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiresIn: ttl,
        });
        console.log(`💾 Cache SET: ${key} (TTL: ${ttl}ms)`);
    }
    static clearCache() {
        this.cache.clear();
        console.log("🗑️ Cache cleared");
    }
    static clearCacheByPattern(pattern) {
        const keysToDelete = Array.from(this.cache.keys()).filter((key) => key.includes(pattern));
        keysToDelete.forEach((key) => this.cache.delete(key));
        console.log(`🗑️ Cache cleared for pattern: ${pattern} (${keysToDelete.length} entries)`);
    }
    static getCacheStats() {
        const now = Date.now();
        let validCount = 0;
        let expiredCount = 0;
        for (const entry of this.cache.values()) {
            if (now - entry.timestamp < entry.expiresIn) {
                validCount++;
            }
            else {
                expiredCount++;
            }
        }
        const memoryUsage = `${Math.round(JSON.stringify(Array.from(this.cache.entries())).length / 1024)} KB`;
        return {
            totalEntries: this.cache.size,
            validEntries: validCount,
            expiredEntries: expiredCount,
            memoryUsage,
        };
    }
    static async get(key) {
        return this.getCachedData(key);
    }
    static async set(key, data, options = {}) {
        const ttl = options.ttl || this.DEFAULT_TTL;
        this.setCachedData(key, data, ttl);
    }
    static async getDashboardAnalytics(tenantId, options = {}) {
        const cacheKey = this.generateCacheKey("dashboard_analytics", { tenantId });
        const ttl = options.ttl || this.DEFAULT_TTL;
        if (!options.forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData)
                return cachedData;
        }
        console.log(`🔍 Cache MISS: Fetching dashboard analytics for tenant ${tenantId}`);
        const [appointmentsResult, customersResult, revenueResult] = await Promise.all([
            database_1.supabase
                .from("appointments")
                .select("id, status, final_price, quoted_price, start_time")
                .eq("tenant_id", tenantId)
                .gte("start_time", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            database_1.supabase
                .from("user_tenants")
                .select("user_id, total_bookings, first_interaction")
                .eq("tenant_id", tenantId),
            database_1.supabase
                .from("appointments")
                .select("final_price, quoted_price")
                .eq("tenant_id", tenantId)
                .eq("status", "completed")
                .gte("start_time", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
        ]);
        const dashboardData = {
            appointments: appointmentsResult.data || [],
            customers: customersResult.data || [],
            revenue: revenueResult.data || [],
            lastUpdated: new Date().toISOString(),
        };
        this.setCachedData(cacheKey, dashboardData, ttl);
        return dashboardData;
    }
    static async getServicesData(tenantId, options = {}) {
        const cacheKey = this.generateCacheKey("services_data", { tenantId });
        const ttl = options.ttl || 10 * 60 * 1000;
        if (!options.forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData)
                return cachedData;
        }
        console.log(`🔍 Cache MISS: Fetching services data for tenant ${tenantId}`);
        const { data, error } = await database_1.supabase
            .from("services")
            .select(`
                id, name, base_price, duration_minutes, is_active, created_at,
                service_categories (id, name)
            `)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        this.setCachedData(cacheKey, data, ttl);
        return data;
    }
    static async getCustomersData(tenantId, options = {}) {
        const cacheKey = this.generateCacheKey("customers_data", { tenantId });
        const ttl = options.ttl || 15 * 60 * 1000;
        if (!options.forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData)
                return cachedData;
        }
        console.log(`🔍 Cache MISS: Fetching customers data for tenant ${tenantId}`);
        const { data, error } = await database_1.supabase
            .from("users")
            .select(`
                id, name, email, phone, created_at,
                user_tenants!inner (
                    tenant_id, total_bookings, first_interaction, last_interaction, role
                )
            `)
            .eq("user_tenants.tenant_id", tenantId)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        this.setCachedData(cacheKey, data, ttl);
        return data;
    }
    static async getTenantConfig(tenantId, options = {}) {
        const cacheKey = this.generateCacheKey("tenant_config", { tenantId });
        const ttl = options.ttl || 30 * 60 * 1000;
        if (!options.forceRefresh) {
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData)
                return cachedData;
        }
        console.log(`🔍 Cache MISS: Fetching tenant config for ${tenantId}`);
        const { data, error } = await database_1.supabase
            .from("tenants")
            .select("*")
            .eq("id", tenantId)
            .single();
        if (error)
            throw error;
        this.setCachedData(cacheKey, data, ttl);
        return data;
    }
    static invalidateTenantCache(tenantId) {
        this.clearCacheByPattern(tenantId);
    }
    static startCacheCleanup() {
        setInterval(() => {
            const before = this.cache.size;
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (!this.isValidCacheEntry(entry)) {
                    this.cache.delete(key);
                }
            }
            const after = this.cache.size;
            if (before !== after) {
                console.log(`🧹 Cache cleanup: Removed ${before - after} expired entries`);
            }
        }, 10 * 60 * 1000);
        console.log("🔄 Cache cleanup scheduler started");
    }
}
exports.QueryCacheService = QueryCacheService;
QueryCacheService.cache = new Map();
QueryCacheService.DEFAULT_TTL = 2 * 60 * 1000;
QueryCacheService.startCacheCleanup();
//# sourceMappingURL=query-cache.service.js.map