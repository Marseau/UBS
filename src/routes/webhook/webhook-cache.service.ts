/**
 * Cache and Redis service for webhook operations
 */

import Redis from 'ioredis';
import { config, logger } from './webhook-validation.middleware';
import { SessionData } from './webhook-message-parser';

export interface TenantCache {
    id: string;
    business_name: string;
    domain: 'beauty'|'healthcare'|'legal'|'education'|'sports'|'consulting'|'general'|string;
    address?: string;
    payment_methods?: string[];
    policies: { reschedule: string; cancel: string; no_show: string; };
    business_description?: string;
    services: Array<{ name: string; duration?: string; price?: string }>;
}

// ===== Cache Service =====
export class CacheService {
    private redis: Redis;
    private prefix = 'whatsapp:';

    constructor() {
        this.redis = new Redis(config.redis.url);
    }

    async getSession(key: string): Promise<SessionData | null> {
        try {
            const data = await this.redis.get(`${this.prefix}session:${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get error', { key, error });
            return null;
        }
    }

    async setSession(key: string, data: SessionData): Promise<void> {
        try {
            await this.redis.setex(`${this.prefix}session:${key}`, config.redis.sessionTtl, JSON.stringify(data));
        } catch (error) {
            logger.error('Cache set error', { key, error });
        }
    }

    async getTenant(phoneNumberId: string): Promise<TenantCache | null> {
        try {
            const data = await this.redis.get(`${this.prefix}tenant:${phoneNumberId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get tenant error', { phoneNumberId, error });
            return null;
        }
    }

    async setTenant(phoneNumberId: string, tenant: TenantCache): Promise<void> {
        try {
            await this.redis.setex(`${this.prefix}tenant:${phoneNumberId}`, config.redis.cacheTtl, JSON.stringify(tenant));
        } catch (error) {
            logger.error('Cache set tenant error', { phoneNumberId, error });
        }
    }

    async incrementSpamScore(key: string): Promise<number> {
        try {
            const score = await this.redis.incr(`${this.prefix}spam:${key}`);
            await this.redis.expire(`${this.prefix}spam:${key}`, 300);
            return score;
        } catch (error) {
            logger.error('Spam score increment error', { key, error });
            return 0;
        }
    }

    async close(): Promise<void> {
        try {
            await this.redis.quit();
        } catch (error) {
            logger.error('Redis close error', { error });
        }
    }
}

// Singleton instance
export const cacheService = new CacheService();