/**
 * P3-001: Fallback In-Memory Cache Service
 * 
 * Production-ready fallback when Redis is not available
 */

class FallbackCacheService {
    constructor() {
        this.cache = new Map();
        this.ttlMap = new Map();
        this.stats = { hits: 0, misses: 0, sets: 0, errors: 0 };
        this.maxSize = 10000; // Prevent memory leaks
        
        // Cleanup expired entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
        
        console.log('⚠️  Using fallback in-memory cache (Redis not available)');
    }
    
    async set(key, value, ttl = 300) {
        try {
            if (this.cache.size >= this.maxSize) {
                this.evictOldest();
            }
            
            this.cache.set(key, JSON.stringify(value));
            this.ttlMap.set(key, Date.now() + (ttl * 1000));
            this.stats.sets++;
            return true;
        } catch (error) {
            this.stats.errors++;
            return false;
        }
    }
    
    async get(key) {
        try {
            const expiry = this.ttlMap.get(key);
            
            if (!expiry || Date.now() > expiry) {
                this.cache.delete(key);
                this.ttlMap.delete(key);
                this.stats.misses++;
                return null;
            }
            
            const value = this.cache.get(key);
            if (value) {
                this.stats.hits++;
                return JSON.parse(value);
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            return null;
        }
    }
    
    async del(key) {
        this.cache.delete(key);
        this.ttlMap.delete(key);
        return true;
    }
    
    evictOldest() {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.ttlMap.delete(oldestKey);
        }
    }
    
    cleanup() {
        const now = Date.now();
        for (const [key, expiry] of this.ttlMap.entries()) {
            if (now > expiry) {
                this.cache.delete(key);
                this.ttlMap.delete(key);
            }
        }
    }
    
    getCacheStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
            : 0;
            
        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            isConnected: true, // Always connected for in-memory
            type: 'in-memory-fallback',
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

module.exports = { FallbackCacheService };