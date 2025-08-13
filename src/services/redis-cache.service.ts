import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Cache Service for WhatsApp Salon N8N
 * Handles session management, message queues, rate limiting and metrics caching
 */
export class RedisCacheService {
    private static instance: RedisCacheService;
    private redis: Redis;
    private isConnected: boolean = false;

    private constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
            enableReadyCheck: false,
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '10000'),
            commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
            // High performance settings for 10k+ tenants
            keepAlive: 30000,
            family: 4, // Use IPv4
            enableOfflineQueue: true
        });

        this.setupEventHandlers();
        this.connect();
    }

    public static getInstance(): RedisCacheService {
        if (!RedisCacheService.instance) {
            RedisCacheService.instance = new RedisCacheService();
        }
        return RedisCacheService.instance;
    }

    private setupEventHandlers(): void {
        this.redis.on('connect', () => {
            console.log('🔗 Redis: Connecting...');
        });

        this.redis.on('ready', () => {
            console.log('✅ Redis: Connection established successfully');
            this.isConnected = true;
        });

        this.redis.on('error', (error) => {
            console.error('❌ Redis connection error:', error);
            this.isConnected = false;
        });

        this.redis.on('close', () => {
            console.log('🔴 Redis: Connection closed');
            this.isConnected = false;
        });

        this.redis.on('reconnecting', () => {
            console.log('🔄 Redis: Attempting to reconnect...');
        });
    }

    private async connect(): Promise<void> {
        try {
            if (process.env.ENABLE_REDIS_CACHE !== 'true') {
                console.log('⚠️ Redis cache is disabled via ENABLE_REDIS_CACHE');
                return;
            }

            await this.redis.connect();
            console.log('🚀 Redis Cache Service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to connect to Redis:', error);
            this.isConnected = false;
        }
    }

    // ==================================================
    // CORE CACHE OPERATIONS
    // ==================================================

    /**
     * Set a key-value pair with optional TTL
     */
    async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
        try {
            if (!this.isConnected) return false;

            const serializedValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.redis.setex(key, ttlSeconds, serializedValue);
            } else {
                await this.redis.set(key, serializedValue);
            }
            return true;
        } catch (error) {
            console.error(`❌ Redis SET error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Get a value by key
     */
    async get<T = any>(key: string): Promise<T | null> {
        try {
            if (!this.isConnected) return null;

            const value = await this.redis.get(key);
            if (!value) return null;
            
            return JSON.parse(value) as T;
        } catch (error) {
            console.error(`❌ Redis GET error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Delete a key
     */
    async del(key: string): Promise<boolean> {
        try {
            if (!this.isConnected) return false;

            const result = await this.redis.del(key);
            return result > 0;
        } catch (error) {
            console.error(`❌ Redis DEL error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Check if a key exists
     */
    async exists(key: string): Promise<boolean> {
        try {
            if (!this.isConnected) return false;

            const result = await this.redis.exists(key);
            return result > 0;
        } catch (error) {
            console.error(`❌ Redis EXISTS error for key ${key}:`, error);
            return false;
        }
    }

    // ==================================================
    // WHATSAPP SESSION MANAGEMENT
    // ==================================================

    /**
     * Store WhatsApp session data
     */
    async setWhatsAppSession(phoneNumber: string, sessionData: any, ttlSeconds: number = 3600): Promise<boolean> {
        const key = `whatsapp:session:${phoneNumber}`;
        return await this.set(key, sessionData, ttlSeconds);
    }

    /**
     * Get WhatsApp session data
     */
    async getWhatsAppSession(phoneNumber: string): Promise<any> {
        const key = `whatsapp:session:${phoneNumber}`;
        return await this.get(key);
    }

    /**
     * Store conversation context for AI processing
     */
    async setConversationContext(conversationId: string, context: any, ttlSeconds: number = 1800): Promise<boolean> {
        const key = `conversation:context:${conversationId}`;
        return await this.set(key, context, ttlSeconds);
    }

    /**
     * Get conversation context
     */
    async getConversationContext(conversationId: string): Promise<any> {
        const key = `conversation:context:${conversationId}`;
        return await this.get(key);
    }

    // ==================================================
    // RATE LIMITING
    // ==================================================

    /**
     * Implement rate limiting for API calls
     */
    async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
        try {
            if (!this.isConnected) return { allowed: true, remaining: maxRequests };

            const rateLimitKey = `rate_limit:${key}`;
            const current = await this.redis.incr(rateLimitKey);
            
            if (current === 1) {
                await this.redis.expire(rateLimitKey, windowSeconds);
            }

            const remaining = Math.max(0, maxRequests - current);
            const allowed = current <= maxRequests;

            return { allowed, remaining };
        } catch (error) {
            console.error(`❌ Redis rate limit error for key ${key}:`, error);
            return { allowed: true, remaining: maxRequests };
        }
    }

    // ==================================================
    // METRICS CACHING
    // ==================================================

    /**
     * Cache dashboard metrics
     */
    async cacheDashboardMetrics(tenantId: string, period: string, metrics: any, ttlSeconds: number = 900): Promise<boolean> {
        const key = `dashboard:metrics:${tenantId}:${period}`;
        return await this.set(key, metrics, ttlSeconds);
    }

    /**
     * Get cached dashboard metrics
     */
    async getCachedDashboardMetrics(tenantId: string, period: string): Promise<any> {
        const key = `dashboard:metrics:${tenantId}:${period}`;
        return await this.get(key);
    }

    /**
     * Cache platform-wide metrics
     */
    async cachePlatformMetrics(period: string, metrics: any, ttlSeconds: number = 600): Promise<boolean> {
        const key = `platform:metrics:${period}`;
        return await this.set(key, metrics, ttlSeconds);
    }

    /**
     * Get cached platform metrics
     */
    async getCachedPlatformMetrics(period: string): Promise<any> {
        const key = `platform:metrics:${period}`;
        return await this.get(key);
    }

    // ==================================================
    // MESSAGE QUEUES
    // ==================================================

    /**
     * Add message to processing queue
     */
    async enqueueMessage(queueName: string, message: any): Promise<boolean> {
        try {
            if (!this.isConnected) return false;

            await this.redis.lpush(`queue:${queueName}`, JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`❌ Redis queue error for ${queueName}:`, error);
            return false;
        }
    }

    /**
     * Process message from queue
     */
    async dequeueMessage(queueName: string): Promise<any> {
        try {
            if (!this.isConnected) return null;

            const message = await this.redis.rpop(`queue:${queueName}`);
            return message ? JSON.parse(message) : null;
        } catch (error) {
            console.error(`❌ Redis dequeue error for ${queueName}:`, error);
            return null;
        }
    }

    /**
     * Get queue length
     */
    async getQueueLength(queueName: string): Promise<number> {
        try {
            if (!this.isConnected) return 0;

            return await this.redis.llen(`queue:${queueName}`);
        } catch (error) {
            console.error(`❌ Redis queue length error for ${queueName}:`, error);
            return 0;
        }
    }

    // ==================================================
    // HEALTH CHECK & UTILITIES
    // ==================================================

    /**
     * Health check
     */
    async healthCheck(): Promise<{ status: string; connected: boolean; latency?: number }> {
        try {
            if (!this.isConnected) {
                return { status: 'disconnected', connected: false };
            }

            const start = Date.now();
            await this.redis.ping();
            const latency = Date.now() - start;

            return { status: 'healthy', connected: true, latency };
        } catch (error) {
            return { status: 'error', connected: false };
        }
    }

    /**
     * Clear all cache (use with caution)
     */
    async clearAllCache(): Promise<boolean> {
        try {
            if (!this.isConnected) return false;

            await this.redis.flushdb();
            console.log('🧹 Redis cache cleared');
            return true;
        } catch (error) {
            console.error('❌ Redis clear cache error:', error);
            return false;
        }
    }

    /**
     * Get memory usage statistics
     */
    async getMemoryInfo(): Promise<any> {
        try {
            if (!this.isConnected) return null;

            const info = await this.redis.info('memory');
            return info;
        } catch (error) {
            console.error('❌ Redis memory info error:', error);
            return null;
        }
    }

    /**
     * Close connection
     */
    async disconnect(): Promise<void> {
        try {
            await this.redis.disconnect();
            console.log('🔌 Redis connection closed');
        } catch (error) {
            console.error('❌ Error closing Redis connection:', error);
        }
    }
}

// Export singleton instance
export const redisCacheService = RedisCacheService.getInstance();