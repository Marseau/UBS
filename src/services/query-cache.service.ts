import { supabase } from "../config/database";

interface CacheEntry {
  data: any;
  timestamp: number;
  expiresIn: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  forceRefresh?: boolean;
}

export class QueryCacheService {
  private static cache = new Map<string, CacheEntry>();
  private static readonly DEFAULT_TTL = 2 * 60 * 1000; // 2 minutes for better real-time data

  /**
   * Generate cache key from query parameters
   */
  private static generateCacheKey(queryName: string, params: any): string {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    return `${queryName}:${Buffer.from(paramString).toString("base64")}`;
  }

  /**
   * Check if cache entry is valid
   */
  private static isValidCacheEntry(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.expiresIn;
  }

  /**
   * Get cached data if available and valid
   */
  private static getCachedData(key: string): any | null {
    const entry = this.cache.get(key);
    if (entry && this.isValidCacheEntry(entry)) {
      console.log(`🎯 Cache HIT: ${key}`);
      return entry.data;
    }

    if (entry) {
      this.cache.delete(key); // Remove expired entry
      console.log(`⏰ Cache EXPIRED: ${key}`);
    }

    return null;
  }

  /**
   * Set data in cache
   */
  private static setCachedData(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn: ttl,
    });
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Clear all cached data
   */
  static clearCache(): void {
    this.cache.clear();
    console.log("🗑️ Cache cleared");
  }

  /**
   * Clear specific cache entries by pattern
   */
  static clearCacheByPattern(pattern: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
      key.includes(pattern),
    );
    keysToDelete.forEach((key) => this.cache.delete(key));
    console.log(
      `🗑️ Cache cleared for pattern: ${pattern} (${keysToDelete.length} entries)`,
    );
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    memoryUsage: string;
  } {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp < entry.expiresIn) {
        validCount++;
      } else {
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

  /**
   * Get data from cache
   */
  static async get(key: string): Promise<any> {
    return this.getCachedData(key);
  }

  /**
   * Set data in cache
   */
  static async set(
    key: string,
    data: any,
    options: CacheOptions = {},
  ): Promise<void> {
    const ttl = options.ttl || this.DEFAULT_TTL;
    this.setCachedData(key, data, ttl);
  }

  /**
   * Cached dashboard analytics query
   */
  static async getDashboardAnalytics(
    tenantId: string,
    options: CacheOptions = {},
  ): Promise<any> {
    const cacheKey = this.generateCacheKey("dashboard_analytics", { tenantId });
    const ttl = options.ttl || this.DEFAULT_TTL;

    if (!options.forceRefresh) {
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) return cachedData;
    }

    console.log(
      `🔍 Cache MISS: Fetching dashboard analytics for tenant ${tenantId}`,
    );

    // Fetch fresh data
    const [appointmentsResult, customersResult, revenueResult] =
      await Promise.all([
        supabase
          .from("appointments")
          .select("id, status, final_price, quoted_price, start_time")
          .eq("tenant_id", tenantId)
          .gte(
            "start_time",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          ),

        supabase
          .from("user_tenants")
          .select("user_id, total_bookings, first_interaction")
          .eq("tenant_id", tenantId),

        supabase
          .from("appointments")
          .select("final_price, quoted_price")
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .gte(
            "start_time",
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          ),
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

  /**
   * Cached services data
   */
  static async getServicesData(
    tenantId: string,
    options: CacheOptions = {},
  ): Promise<any> {
    const cacheKey = this.generateCacheKey("services_data", { tenantId });
    const ttl = options.ttl || 10 * 60 * 1000; // 10 minutes for services

    if (!options.forceRefresh) {
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) return cachedData;
    }

    console.log(`🔍 Cache MISS: Fetching services data for tenant ${tenantId}`);

    const { data, error } = await supabase
      .from("services")
      .select(
        `
                id, name, base_price, duration_minutes, is_active, created_at,
                service_categories (id, name)
            `,
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    this.setCachedData(cacheKey, data, ttl);
    return data;
  }

  /**
   * Cached customer data
   */
  static async getCustomersData(
    tenantId: string,
    options: CacheOptions = {},
  ): Promise<any> {
    const cacheKey = this.generateCacheKey("customers_data", { tenantId });
    const ttl = options.ttl || 15 * 60 * 1000; // 15 minutes for customers

    if (!options.forceRefresh) {
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) return cachedData;
    }

    console.log(
      `🔍 Cache MISS: Fetching customers data for tenant ${tenantId}`,
    );

    const { data, error } = await supabase
      .from("users")
      .select(
        `
                id, name, email, phone, created_at,
                user_tenants!inner (
                    tenant_id, total_bookings, first_interaction, last_interaction, role
                )
            `,
      )
      .eq("user_tenants.tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    this.setCachedData(cacheKey, data, ttl);
    return data;
  }

  /**
   * Cached tenant configuration
   */
  static async getTenantConfig(
    tenantId: string,
    options: CacheOptions = {},
  ): Promise<any> {
    const cacheKey = this.generateCacheKey("tenant_config", { tenantId });
    const ttl = options.ttl || 30 * 60 * 1000; // 30 minutes for tenant config

    if (!options.forceRefresh) {
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) return cachedData;
    }

    console.log(`🔍 Cache MISS: Fetching tenant config for ${tenantId}`);

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (error) throw error;

    this.setCachedData(cacheKey, data, ttl);
    return data;
  }

  /**
   * Invalidate cache when data changes
   */
  static invalidateTenantCache(tenantId: string): void {
    this.clearCacheByPattern(tenantId);
  }

  /**
   * Schedule automatic cache cleanup
   */
  static startCacheCleanup(): void {
    // Clean expired entries every 10 minutes
    setInterval(
      () => {
        const before = this.cache.size;
        const now = Date.now();

        for (const [key, entry] of this.cache.entries()) {
          if (!this.isValidCacheEntry(entry)) {
            this.cache.delete(key);
          }
        }

        const after = this.cache.size;
        if (before !== after) {
          console.log(
            `🧹 Cache cleanup: Removed ${before - after} expired entries`,
          );
        }
      },
      10 * 60 * 1000,
    );

    console.log("🔄 Cache cleanup scheduler started");
  }
}

// Start cache cleanup on module load
QueryCacheService.startCacheCleanup();
