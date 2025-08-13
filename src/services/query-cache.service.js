/**
 * Query Cache Service
 * Sistema de cache em memória para otimizar performance do dashboard
 */

class QueryCacheService {
    constructor() {
        this.cache = new Map();
        this.timeouts = new Map();
        
        // Limpar cache automaticamente a cada hora
        setInterval(() => {
            this.clearExpired();
        }, 60 * 60 * 1000);
        
        console.log('✅ QueryCacheService initialized');
    }
    
    /**
     * Armazenar dados no cache com TTL
     */
    set(key, data, ttl = 5 * 60 * 1000) { // Default 5 minutos
        // Limpar timeout anterior se existir
        if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key));
        }
        
        // Armazenar dados
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
        
        // Configurar expiração automática
        const timeout = setTimeout(() => {
            this.delete(key);
        }, ttl);
        
        this.timeouts.set(key, timeout);
        
        console.log(`📦 [CACHE SET] Key: ${key}, TTL: ${ttl}ms`);
    }
    
    /**
     * Buscar dados do cache
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }
        
        // Verificar se expirou
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            return null;
        }
        
        console.log(`📦 [CACHE HIT] Key: ${key}`);
        return entry.data;
    }
    
    /**
     * Remover entrada do cache
     */
    delete(key) {
        // Limpar timeout
        if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key));
            this.timeouts.delete(key);
        }
        
        // Remover do cache
        const removed = this.cache.delete(key);
        
        if (removed) {
            console.log(`📦 [CACHE DELETE] Key: ${key}`);
        }
        
        return removed;
    }
    
    /**
     * Verificar se chave existe no cache
     */
    has(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }
        
        // Verificar se expirou
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            return false;
        }
        
        return true;
    }
    
    /**
     * Limpar todas as entradas expiradas
     */
    clearExpired() {
        const now = Date.now();
        let expired = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.delete(key);
                expired++;
            }
        }
        
        if (expired > 0) {
            console.log(`📦 [CACHE CLEANUP] Removed ${expired} expired entries`);
        }
    }
    
    /**
     * Limpar todo o cache
     */
    clear() {
        // Limpar todos os timeouts
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }
        
        const size = this.cache.size;
        this.cache.clear();
        this.timeouts.clear();
        
        console.log(`📦 [CACHE CLEAR] Removed ${size} entries`);
    }
    
    /**
     * Invalidar cache por padrão (ex: invalidar todos os dashboards)
     */
    invalidatePattern(pattern) {
        let invalidated = 0;
        
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.delete(key);
                invalidated++;
            }
        }
        
        console.log(`📦 [CACHE INVALIDATE] Pattern: ${pattern}, Removed: ${invalidated}`);
        return invalidated;
    }
    
    /**
     * Obter estatísticas do cache
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            memory: process.memoryUsage()
        };
    }
}

module.exports = { QueryCacheService };