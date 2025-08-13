"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearDatabasePool = exports.getDatabasePoolStats = exports.testRLSPolicies = exports.testDatabaseConnection = exports.withSuperAdminContext = exports.withTenantContext = exports.createSuperAdminClient = exports.createTenantContextClient = exports.clearTenantContext = exports.setSuperAdminContext = exports.setTenantContext = exports.supabaseAdmin = exports.getAdminClient = exports.getTenantAdminClient = exports.getTenantClient = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Environment check failed:");
    console.error("SUPABASE_URL:", !!process.env.SUPABASE_URL);
    console.error("SUPABASE_ANON_KEY:", !!process.env.SUPABASE_ANON_KEY);
    throw new Error("Missing Supabase environment variables");
}
class QueryPerformanceMonitor {
    constructor() {
        this.metrics = {
            totalQueries: 0,
            avgResponseTime: 0,
            slowQueries: 0,
            errorRate: 0,
            cacheHitRate: 0,
        };
        this.queryTimes = [];
        this.MAX_QUERY_HISTORY = 1000;
    }
    static getInstance() {
        if (!QueryPerformanceMonitor.instance) {
            QueryPerformanceMonitor.instance = new QueryPerformanceMonitor();
        }
        return QueryPerformanceMonitor.instance;
    }
    recordQuery(responseTime, error = false) {
        this.metrics.totalQueries++;
        this.queryTimes.push(responseTime);
        if (responseTime > 1000) {
            this.metrics.slowQueries++;
        }
        if (error) {
            this.metrics.errorRate =
                (this.metrics.errorRate * (this.metrics.totalQueries - 1) + 1) /
                    this.metrics.totalQueries;
        }
        if (this.queryTimes.length > this.MAX_QUERY_HISTORY) {
            this.queryTimes = this.queryTimes.slice(-this.MAX_QUERY_HISTORY);
        }
        this.metrics.avgResponseTime =
            this.queryTimes.reduce((sum, time) => sum + time, 0) /
                this.queryTimes.length;
    }
    getMetrics() {
        return { ...this.metrics };
    }
    shouldOptimize() {
        return this.metrics.avgResponseTime > 500 || this.metrics.slowQueries > 10;
    }
}
class AdvancedQueryCache {
    constructor() {
        this.cache = new Map();
        this.DEFAULT_TTL = 300000;
        this.MAX_CACHE_SIZE = 1000;
    }
    static getInstance() {
        if (!AdvancedQueryCache.instance) {
            AdvancedQueryCache.instance = new AdvancedQueryCache();
        }
        return AdvancedQueryCache.instance;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        entry.accessCount++;
        return entry.data;
    }
    set(key, data, ttl = this.DEFAULT_TTL) {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            this.evictLeastUsed();
        }
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
            accessCount: 1,
        });
    }
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }
    evictLeastUsed() {
        let leastUsedKey = "";
        let leastUsedCount = Infinity;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.accessCount < leastUsedCount) {
                leastUsedCount = entry.accessCount;
                leastUsedKey = key;
            }
        }
        if (leastUsedKey) {
            this.cache.delete(leastUsedKey);
        }
    }
    getStats() {
        const monitor = QueryPerformanceMonitor.getInstance();
        return {
            size: this.cache.size,
            hitRate: monitor.getMetrics().cacheHitRate,
        };
    }
}
class DatabaseCircuitBreaker {
    constructor() {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.FAILURE_THRESHOLD = 5;
        this.TIMEOUT = 60000;
    }
    static getInstance() {
        if (!DatabaseCircuitBreaker.instance) {
            DatabaseCircuitBreaker.instance = new DatabaseCircuitBreaker();
        }
        return DatabaseCircuitBreaker.instance;
    }
    canExecute() {
        if (this.state === "OPEN") {
            if (Date.now() - this.lastFailureTime > this.TIMEOUT) {
                this.state = "HALF_OPEN";
                return true;
            }
            return false;
        }
        return true;
    }
    recordSuccess() {
        this.failureCount = 0;
        this.state = "CLOSED";
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.FAILURE_THRESHOLD) {
            this.state = "OPEN";
            console.log("🔴 [DB-CIRCUIT-BREAKER] Database circuit opened");
        }
    }
}
class DatabaseConnectionPool {
    constructor() {
        this.clients = new Map();
        this.MAX_POOL_SIZE = 5;
        this.lastCleanup = Date.now();
        this.CLEANUP_INTERVAL = 5 * 60 * 1000;
    }
    static getInstance() {
        if (!DatabaseConnectionPool.instance) {
            DatabaseConnectionPool.instance = new DatabaseConnectionPool();
        }
        return DatabaseConnectionPool.instance;
    }
    getClient(key, factory) {
        this.performCleanupIfNeeded();
        if (this.clients.has(key)) {
            return this.clients.get(key);
        }
        if (this.clients.size >= this.MAX_POOL_SIZE) {
            const firstKey = this.clients.keys().next().value;
            if (firstKey) {
                this.clients.delete(firstKey);
            }
        }
        const client = factory();
        this.clients.set(key, client);
        return client;
    }
    performCleanupIfNeeded() {
        const now = Date.now();
        if (now - this.lastCleanup > this.CLEANUP_INTERVAL) {
            const entries = Array.from(this.clients.entries());
            if (entries.length > 3) {
                const toKeep = entries.slice(-3);
                this.clients.clear();
                toKeep.forEach(([key, client]) => this.clients.set(key, client));
            }
            this.lastCleanup = now;
        }
    }
    clear() {
        this.clients.clear();
    }
    getStats() {
        return {
            poolSize: this.clients.size,
            maxPoolSize: this.MAX_POOL_SIZE,
        };
    }
}
const connectionPool = DatabaseConnectionPool.getInstance();
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
    },
    db: {
        schema: "public",
    },
});
const getTenantClient = (tenantId) => {
    const key = `tenant_${tenantId}`;
    return connectionPool.getClient(key, () => (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
        },
        db: {
            schema: "public",
        },
        global: {
            headers: {
                "X-Tenant-ID": tenantId,
            },
        },
    }));
};
exports.getTenantClient = getTenantClient;
const getTenantAdminClient = (tenantId) => {
    if (!serviceKey) {
        console.warn("SUPABASE_SERVICE_ROLE_KEY not provided, falling back to anon key");
        return (0, exports.getTenantClient)(tenantId);
    }
    const key = `tenant_admin_${tenantId}`;
    return connectionPool.getClient(key, () => (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
        auth: {
            persistSession: false,
        },
        db: {
            schema: "public",
        },
        global: {
            headers: {
                "X-Tenant-ID": tenantId,
            },
        },
    }));
};
exports.getTenantAdminClient = getTenantAdminClient;
const getAdminClient = () => {
    if (!serviceKey) {
        console.warn("SUPABASE_SERVICE_ROLE_KEY not provided, using anon key");
        return exports.supabase;
    }
    const key = "admin_client";
    return connectionPool.getClient(key, () => (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
        auth: {
            persistSession: false,
        },
        db: {
            schema: "public",
        },
    }));
};
exports.getAdminClient = getAdminClient;
exports.supabaseAdmin = (0, exports.getAdminClient)();
const setTenantContext = async (client, tenantId, isAdmin = false) => {
    try {
        await client.rpc("set_tenant_context", {
            tenant_id: tenantId,
            is_admin: isAdmin,
        });
    }
    catch (error) {
        console.error("Failed to set tenant context:", error);
        throw new Error(`Failed to set tenant context for tenant ${tenantId}: ${error}`);
    }
};
exports.setTenantContext = setTenantContext;
const setSuperAdminContext = async (client) => {
    try {
        await client.rpc("set_super_admin_context");
    }
    catch (error) {
        console.error("Failed to set super admin context:", error);
        throw new Error(`Failed to set super admin context: ${error}`);
    }
};
exports.setSuperAdminContext = setSuperAdminContext;
const clearTenantContext = async (client) => {
    try {
        await client.rpc("clear_tenant_context");
    }
    catch (error) {
        console.error("Failed to clear tenant context:", error);
        throw new Error(`Failed to clear tenant context: ${error}`);
    }
};
exports.clearTenantContext = clearTenantContext;
const createTenantContextClient = async (tenantId, useServiceRole = false) => {
    const client = useServiceRole
        ? (0, exports.getTenantAdminClient)(tenantId)
        : (0, exports.getTenantClient)(tenantId);
    await (0, exports.setTenantContext)(client, tenantId, useServiceRole);
    return client;
};
exports.createTenantContextClient = createTenantContextClient;
const createSuperAdminClient = async () => {
    const client = (0, exports.getAdminClient)();
    await (0, exports.setSuperAdminContext)(client);
    return client;
};
exports.createSuperAdminClient = createSuperAdminClient;
const withTenantContext = async (tenantId, operation, useServiceRole = false) => {
    const client = useServiceRole
        ? (0, exports.getTenantAdminClient)(tenantId)
        : (0, exports.getTenantClient)(tenantId);
    try {
        await (0, exports.setTenantContext)(client, tenantId, useServiceRole);
        return await operation(client);
    }
    finally {
        await (0, exports.clearTenantContext)(client);
    }
};
exports.withTenantContext = withTenantContext;
const withSuperAdminContext = async (operation) => {
    const client = (0, exports.getAdminClient)();
    try {
        await (0, exports.setSuperAdminContext)(client);
        return await operation(client);
    }
    finally {
        await (0, exports.clearTenantContext)(client);
    }
};
exports.withSuperAdminContext = withSuperAdminContext;
const testDatabaseConnection = async () => {
    try {
        const { data, error } = await exports.supabase
            .from("tenants")
            .select("count")
            .limit(1);
        if (error) {
            console.error("Database connection test failed:", error);
            return false;
        }
        console.log("Database connection test successful");
        return true;
    }
    catch (error) {
        console.error("Database connection test failed:", error);
        return false;
    }
};
exports.testDatabaseConnection = testDatabaseConnection;
const testRLSPolicies = async (tenantId) => {
    try {
        const tenantClient = await (0, exports.createTenantContextClient)(tenantId);
        const { data: tenantData, error: tenantError } = await tenantClient
            .from("services")
            .select("id, tenant_id")
            .limit(10);
        if (tenantError) {
            console.error("RLS test failed for tenant client:", tenantError);
            return false;
        }
        const invalidData = tenantData?.filter((item) => item.tenant_id !== tenantId);
        if (invalidData && invalidData.length > 0) {
            console.error("RLS policy violation: Found data from other tenants");
            return false;
        }
        const adminClient = await (0, exports.createSuperAdminClient)();
        const { data: adminData, error: adminError } = await adminClient
            .from("tenants")
            .select("id")
            .limit(1);
        if (adminError) {
            console.error("RLS test failed for admin client:", adminError);
            return false;
        }
        console.log("RLS policies test successful");
        return true;
    }
    catch (error) {
        console.error("RLS policies test failed:", error);
        return false;
    }
};
exports.testRLSPolicies = testRLSPolicies;
const getDatabasePoolStats = () => connectionPool.getStats();
exports.getDatabasePoolStats = getDatabasePoolStats;
const clearDatabasePool = () => connectionPool.clear();
exports.clearDatabasePool = clearDatabasePool;
exports.default = exports.supabase;
//# sourceMappingURL=database.js.map