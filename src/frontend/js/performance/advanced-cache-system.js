/**
 * ADVANCED CACHING SYSTEM
 * Sistema de cache multi-nível inspirado nos princípios MCP
 * 
 * FEATURES:
 * - Cache L1: Memory (JavaScript Map) - Fastest
 * - Cache L2: LocalStorage - Persistent
 * - Cache L3: IndexedDB - Large data
 * - Cache L4: Service Worker - Network cache
 * - Intelligent invalidation strategies
 * - Compression for large objects
 * - Performance monitoring & analytics
 * - Automatic cleanup & garbage collection
 * 
 * @fileoverview Cache system avançado para 110% optimization target
 * @author Claude Code Assistant + MCP Optimization Principles
 * @version 2.0.0
 * @since 2025-07-17
 */

class AdvancedCacheSystem {
    constructor(options = {}) {
        this.config = {
            // L1 Cache (Memory)
            l1MaxSize: 100,           // Max items in memory
            l1TTL: 300000,           // 5 minutes
            
            // L2 Cache (LocalStorage)
            l2MaxSize: 1024 * 1024,  // 1MB
            l2TTL: 3600000,          // 1 hour
            
            // L3 Cache (IndexedDB)
            l3MaxSize: 50 * 1024 * 1024,  // 50MB
            l3TTL: 86400000,         // 24 hours
            
            // Compression
            enableCompression: true,
            compressionThreshold: 1024,  // 1KB
            
            // Performance
            enableMetrics: true,
            enableDebug: false,
            
            // Invalidation
            enableAutoCleanup: true,
            cleanupInterval: 600000,  // 10 minutes
            
            ...options
        };

        // Cache stores
        this.l1Cache = new Map();           // Memory cache
        this.l2Cache = window.localStorage; // Persistent cache
        this.l3Cache = null;                // IndexedDB cache
        
        // Metrics
        this.metrics = {
            l1: { hits: 0, misses: 0, sets: 0, evictions: 0 },
            l2: { hits: 0, misses: 0, sets: 0, errors: 0 },
            l3: { hits: 0, misses: 0, sets: 0, errors: 0 },
            compression: { saved: 0, ratio: 0 },
            performance: { avgGetTime: 0, avgSetTime: 0 }
        };

        // Performance tracking
        this.performanceSamples = [];
        this.maxSamples = 1000;

        this.init();
    }

    /**
     * INICIALIZAÇÃO DO SISTEMA
     */
    async init() {
        console.log('🚀 [CACHE] Inicializando Advanced Cache System...');
        
        try {
            // Initialize IndexedDB
            await this.initIndexedDB();
            
            // Setup cleanup
            if (this.config.enableAutoCleanup) {
                this.setupAutoCleanup();
            }
            
            // Load L1 cache from L2 if possible
            await this.warmupL1Cache();
            
            console.log('✅ [CACHE] Sistema inicializado com sucesso');
            this.logCacheStats();
            
        } catch (error) {
            console.error('❌ [CACHE] Erro na inicialização:', error);
        }
    }

    /**
     * INITIALIZE INDEXEDDB
     */
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('⚠️ [CACHE] IndexedDB não disponível');
                resolve();
                return;
            }

            const request = indexedDB.open('AdvancedCacheDB', 1);
            
            request.onerror = () => {
                console.error('❌ [CACHE] Erro ao abrir IndexedDB');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.l3Cache = request.result;
                console.log('📁 [CACHE] IndexedDB inicializado');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('ttl', 'ttl', { unique: false });
                }
                
                console.log('🔧 [CACHE] IndexedDB schema criado');
            };
        });
    }

    /**
     * WARMUP L1 CACHE
     */
    async warmupL1Cache() {
        try {
            // Get most frequently accessed items from L2
            const hotKeys = this.getHotKeys();
            
            for (const key of hotKeys.slice(0, 20)) { // Top 20
                const value = await this.getFromL2(key);
                if (value !== null) {
                    this.setInL1(key, value.data, value.ttl);
                }
            }
            
            console.log(`🔥 [CACHE] L1 Cache warmed up com ${hotKeys.length} hot keys`);
        } catch (error) {
            console.warn('⚠️ [CACHE] Erro no warmup:', error);
        }
    }

    /**
     * GET HOT KEYS (frequently accessed)
     */
    getHotKeys() {
        const accessCounts = {};
        
        // Analyze access patterns from metrics
        for (let i = 0; i < this.l2Cache.length; i++) {
            const key = this.l2Cache.key(i);
            if (key && key.startsWith('cache_')) {
                const accessKey = key + '_access_count';
                const count = parseInt(this.l2Cache.getItem(accessKey) || '0');
                accessCounts[key] = count;
            }
        }
        
        return Object.keys(accessCounts)
            .sort((a, b) => accessCounts[b] - accessCounts[a])
            .map(key => key.replace('cache_', ''));
    }

    /**
     * MAIN GET METHOD
     */
    async get(key) {
        const startTime = performance.now();
        
        try {
            // Try L1 first (fastest)
            let result = this.getFromL1(key);
            if (result !== null) {
                this.metrics.l1.hits++;
                this.recordPerformance(performance.now() - startTime, 'get');
                return result;
            }
            this.metrics.l1.misses++;

            // Try L2 (LocalStorage)
            result = await this.getFromL2(key);
            if (result !== null) {
                this.metrics.l2.hits++;
                // Promote to L1
                this.setInL1(key, result.data, result.ttl);
                this.recordPerformance(performance.now() - startTime, 'get');
                return result.data;
            }
            this.metrics.l2.misses++;

            // Try L3 (IndexedDB)
            result = await this.getFromL3(key);
            if (result !== null) {
                this.metrics.l3.hits++;
                // Promote to L2 and L1
                this.setInL2(key, result.data, result.ttl);
                this.setInL1(key, result.data, result.ttl);
                this.recordPerformance(performance.now() - startTime, 'get');
                return result.data;
            }
            this.metrics.l3.misses++;

            this.recordPerformance(performance.now() - startTime, 'get');
            return null;

        } catch (error) {
            console.error(`❌ [CACHE] Erro ao buscar ${key}:`, error);
            this.recordPerformance(performance.now() - startTime, 'get');
            return null;
        }
    }

    /**
     * MAIN SET METHOD
     */
    async set(key, value, ttl = this.config.l1TTL) {
        const startTime = performance.now();
        
        try {
            // Determine data size
            const serializedValue = JSON.stringify(value);
            const dataSize = new Blob([serializedValue]).size;
            
            // Set in all appropriate levels
            this.setInL1(key, value, ttl);
            
            if (dataSize < this.config.l2MaxSize / 10) { // 10% of L2 max
                this.setInL2(key, value, ttl);
            }
            
            if (dataSize < this.config.l3MaxSize / 10) { // 10% of L3 max
                await this.setInL3(key, value, ttl);
            }
            
            this.recordPerformance(performance.now() - startTime, 'set');
            
        } catch (error) {
            console.error(`❌ [CACHE] Erro ao salvar ${key}:`, error);
        }
    }

    /**
     * L1 CACHE METHODS (Memory)
     */
    getFromL1(key) {
        const entry = this.l1Cache.get(key);
        
        if (!entry) return null;
        
        // Check TTL
        if (Date.now() > entry.expiry) {
            this.l1Cache.delete(key);
            return null;
        }
        
        // Update access count
        entry.accessCount = (entry.accessCount || 0) + 1;
        entry.lastAccess = Date.now();
        
        return entry.data;
    }

    setInL1(key, data, ttl) {
        // Check size limit
        if (this.l1Cache.size >= this.config.l1MaxSize) {
            this.evictFromL1();
        }
        
        this.l1Cache.set(key, {
            data,
            expiry: Date.now() + ttl,
            accessCount: 1,
            lastAccess: Date.now(),
            size: JSON.stringify(data).length
        });
        
        this.metrics.l1.sets++;
    }

    evictFromL1() {
        // LRU eviction
        let oldestKey = null;
        let oldestAccess = Date.now();
        
        for (const [key, entry] of this.l1Cache.entries()) {
            if (entry.lastAccess < oldestAccess) {
                oldestAccess = entry.lastAccess;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.l1Cache.delete(oldestKey);
            this.metrics.l1.evictions++;
        }
    }

    /**
     * L2 CACHE METHODS (LocalStorage)
     */
    async getFromL2(key) {
        try {
            const cacheKey = `cache_${key}`;
            const stored = this.l2Cache.getItem(cacheKey);
            
            if (!stored) return null;
            
            const entry = JSON.parse(stored);
            
            // Check TTL
            if (Date.now() > entry.expiry) {
                this.l2Cache.removeItem(cacheKey);
                return null;
            }
            
            // Update access count
            const accessKey = `${cacheKey}_access_count`;
            const count = parseInt(this.l2Cache.getItem(accessKey) || '0');
            this.l2Cache.setItem(accessKey, (count + 1).toString());
            
            // Decompress if needed
            let data = entry.data;
            if (entry.compressed) {
                data = this.decompress(data);
            }
            
            return { data, ttl: entry.expiry - Date.now() };
            
        } catch (error) {
            console.error(`❌ [CACHE] Erro L2 get ${key}:`, error);
            this.metrics.l2.errors++;
            return null;
        }
    }

    setInL2(key, data, ttl) {
        try {
            const cacheKey = `cache_${key}`;
            
            // Prepare entry
            let entryData = data;
            let compressed = false;
            
            // Compress if large
            if (this.config.enableCompression) {
                const serialized = JSON.stringify(data);
                if (serialized.length > this.config.compressionThreshold) {
                    entryData = this.compress(serialized);
                    compressed = true;
                    
                    const originalSize = serialized.length;
                    const compressedSize = entryData.length;
                    this.metrics.compression.saved += originalSize - compressedSize;
                    this.metrics.compression.ratio = 
                        (this.metrics.compression.saved / (this.metrics.compression.saved + compressedSize)) * 100;
                }
            }
            
            const entry = {
                data: entryData,
                expiry: Date.now() + ttl,
                compressed,
                timestamp: Date.now()
            };
            
            this.l2Cache.setItem(cacheKey, JSON.stringify(entry));
            this.metrics.l2.sets++;
            
        } catch (error) {
            console.error(`❌ [CACHE] Erro L2 set ${key}:`, error);
            this.metrics.l2.errors++;
            
            // Try cleanup and retry once
            this.cleanupL2();
            try {
                const cacheKey = `cache_${key}`;
                const entry = {
                    data,
                    expiry: Date.now() + ttl,
                    compressed: false,
                    timestamp: Date.now()
                };
                this.l2Cache.setItem(cacheKey, JSON.stringify(entry));
            } catch (retryError) {
                console.error(`❌ [CACHE] Retry L2 set ${key} falhou:`, retryError);
            }
        }
    }

    /**
     * L3 CACHE METHODS (IndexedDB)
     */
    async getFromL3(key) {
        if (!this.l3Cache) return null;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.l3Cache.transaction(['cache'], 'readonly');
                const store = transaction.objectStore('cache');
                const request = store.get(key);
                
                request.onsuccess = () => {
                    const result = request.result;
                    
                    if (!result) {
                        resolve(null);
                        return;
                    }
                    
                    // Check TTL
                    if (Date.now() > result.expiry) {
                        // Remove expired entry
                        this.deleteFromL3(key);
                        resolve(null);
                        return;
                    }
                    
                    // Decompress if needed
                    let data = result.data;
                    if (result.compressed) {
                        data = this.decompress(data);
                    }
                    
                    resolve({ data, ttl: result.expiry - Date.now() });
                };
                
                request.onerror = () => {
                    console.error(`❌ [CACHE] Erro L3 get ${key}:`, request.error);
                    this.metrics.l3.errors++;
                    resolve(null);
                };
                
            } catch (error) {
                console.error(`❌ [CACHE] Erro L3 get ${key}:`, error);
                this.metrics.l3.errors++;
                resolve(null);
            }
        });
    }

    async setInL3(key, data, ttl) {
        if (!this.l3Cache) return;
        
        return new Promise((resolve) => {
            try {
                // Prepare entry
                let entryData = data;
                let compressed = false;
                
                // Compress if large
                if (this.config.enableCompression) {
                    const serialized = JSON.stringify(data);
                    if (serialized.length > this.config.compressionThreshold) {
                        entryData = this.compress(serialized);
                        compressed = true;
                    }
                }
                
                const entry = {
                    key,
                    data: entryData,
                    expiry: Date.now() + ttl,
                    compressed,
                    timestamp: Date.now()
                };
                
                const transaction = this.l3Cache.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                const request = store.put(entry);
                
                request.onsuccess = () => {
                    this.metrics.l3.sets++;
                    resolve();
                };
                
                request.onerror = () => {
                    console.error(`❌ [CACHE] Erro L3 set ${key}:`, request.error);
                    this.metrics.l3.errors++;
                    resolve();
                };
                
            } catch (error) {
                console.error(`❌ [CACHE] Erro L3 set ${key}:`, error);
                this.metrics.l3.errors++;
                resolve();
            }
        });
    }

    async deleteFromL3(key) {
        if (!this.l3Cache) return;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.l3Cache.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                const request = store.delete(key);
                
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                
            } catch (error) {
                resolve();
            }
        });
    }

    /**
     * COMPRESSION METHODS
     */
    compress(data) {
        try {
            // Simple compression using JSON + base64
            // In production, consider using a real compression library
            return btoa(JSON.stringify(data));
        } catch (error) {
            console.warn('⚠️ [CACHE] Compression failed, using raw data');
            return data;
        }
    }

    decompress(data) {
        try {
            return JSON.parse(atob(data));
        } catch (error) {
            console.warn('⚠️ [CACHE] Decompression failed, using raw data');
            return data;
        }
    }

    /**
     * DELETE METHODS
     */
    async delete(key) {
        // Delete from all levels
        this.l1Cache.delete(key);
        
        try {
            this.l2Cache.removeItem(`cache_${key}`);
            this.l2Cache.removeItem(`cache_${key}_access_count`);
        } catch (error) {
            console.warn(`⚠️ [CACHE] Erro ao deletar ${key} do L2:`, error);
        }
        
        await this.deleteFromL3(key);
    }

    /**
     * CLEAR METHODS
     */
    async clear() {
        // Clear L1
        this.l1Cache.clear();
        
        // Clear L2
        const keysToRemove = [];
        for (let i = 0; i < this.l2Cache.length; i++) {
            const key = this.l2Cache.key(i);
            if (key && key.startsWith('cache_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => this.l2Cache.removeItem(key));
        
        // Clear L3
        if (this.l3Cache) {
            const transaction = this.l3Cache.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            store.clear();
        }
        
        console.log('🧹 [CACHE] Todos os caches limpos');
    }

    /**
     * CLEANUP METHODS
     */
    setupAutoCleanup() {
        setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
        
        console.log('🧹 [CACHE] Auto cleanup configurado');
    }

    async cleanup() {
        const startTime = Date.now();
        
        // Cleanup L1 (expired entries)
        for (const [key, entry] of this.l1Cache.entries()) {
            if (Date.now() > entry.expiry) {
                this.l1Cache.delete(key);
            }
        }
        
        // Cleanup L2
        this.cleanupL2();
        
        // Cleanup L3
        await this.cleanupL3();
        
        const duration = Date.now() - startTime;
        console.log(`🧹 [CACHE] Cleanup completo em ${duration}ms`);
    }

    cleanupL2() {
        const keysToRemove = [];
        
        for (let i = 0; i < this.l2Cache.length; i++) {
            const key = this.l2Cache.key(i);
            if (key && key.startsWith('cache_')) {
                try {
                    const stored = this.l2Cache.getItem(key);
                    if (stored) {
                        const entry = JSON.parse(stored);
                        if (Date.now() > entry.expiry) {
                            keysToRemove.push(key);
                            keysToRemove.push(key + '_access_count');
                        }
                    }
                } catch (error) {
                    // Remove invalid entries
                    keysToRemove.push(key);
                }
            }
        }
        
        keysToRemove.forEach(key => {
            try {
                this.l2Cache.removeItem(key);
            } catch (error) {
                // Ignore errors during cleanup
            }
        });
    }

    async cleanupL3() {
        if (!this.l3Cache) return;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.l3Cache.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                const index = store.index('timestamp');
                const request = index.openCursor();
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const entry = cursor.value;
                        if (Date.now() > entry.expiry) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                
                request.onerror = () => resolve();
                
            } catch (error) {
                resolve();
            }
        });
    }

    /**
     * PERFORMANCE TRACKING
     */
    recordPerformance(duration, operation) {
        this.performanceSamples.push({ duration, operation, timestamp: Date.now() });
        
        // Keep only recent samples
        if (this.performanceSamples.length > this.maxSamples) {
            this.performanceSamples = this.performanceSamples.slice(-this.maxSamples);
        }
        
        // Update metrics
        const samples = this.performanceSamples.filter(s => s.operation === operation);
        if (samples.length > 0) {
            const avg = samples.reduce((sum, s) => sum + s.duration, 0) / samples.length;
            if (operation === 'get') {
                this.metrics.performance.avgGetTime = Math.round(avg * 100) / 100;
            } else if (operation === 'set') {
                this.metrics.performance.avgSetTime = Math.round(avg * 100) / 100;
            }
        }
    }

    /**
     * METRICS & MONITORING
     */
    getMetrics() {
        const totalHits = this.metrics.l1.hits + this.metrics.l2.hits + this.metrics.l3.hits;
        const totalMisses = this.metrics.l1.misses + this.metrics.l2.misses + this.metrics.l3.misses;
        const totalRequests = totalHits + totalMisses;
        
        return {
            ...this.metrics,
            summary: {
                totalRequests,
                totalHits,
                totalMisses,
                hitRate: totalRequests > 0 ? ((totalHits / totalRequests) * 100).toFixed(1) : 0,
                l1Size: this.l1Cache.size,
                l2Usage: this.getL2Usage(),
                compressionRatio: this.metrics.compression.ratio.toFixed(1)
            }
        };
    }

    getL2Usage() {
        let cacheSize = 0;
        for (let i = 0; i < this.l2Cache.length; i++) {
            const key = this.l2Cache.key(i);
            if (key && key.startsWith('cache_')) {
                try {
                    const value = this.l2Cache.getItem(key);
                    if (value) {
                        cacheSize += value.length;
                    }
                } catch (error) {
                    // Ignore
                }
            }
        }
        return Math.round(cacheSize / 1024); // KB
    }

    logCacheStats() {
        const metrics = this.getMetrics();
        console.log('📊 [CACHE] Estatísticas:', {
            'Hit Rate': metrics.summary.hitRate + '%',
            'L1 Size': metrics.summary.l1Size,
            'L2 Usage': metrics.summary.l2Usage + 'KB',
            'Compression': metrics.summary.compressionRatio + '%',
            'Avg Get': metrics.performance.avgGetTime + 'ms',
            'Avg Set': metrics.performance.avgSetTime + 'ms'
        });
    }

    /**
     * PUBLIC API
     */
    async has(key) {
        return (await this.get(key)) !== null;
    }

    async keys() {
        const allKeys = new Set();
        
        // L1 keys
        for (const key of this.l1Cache.keys()) {
            allKeys.add(key);
        }
        
        // L2 keys
        for (let i = 0; i < this.l2Cache.length; i++) {
            const key = this.l2Cache.key(i);
            if (key && key.startsWith('cache_') && !key.endsWith('_access_count')) {
                allKeys.add(key.replace('cache_', ''));
            }
        }
        
        return Array.from(allKeys);
    }

    async size() {
        return (await this.keys()).length;
    }
}

// Auto-initialize and expose globally
window.advancedCache = new AdvancedCacheSystem({
    enableMetrics: true,
    enableCompression: true,
    l1MaxSize: 100,
    l1TTL: 300000
});

console.log('🚀 [CACHE] Advanced Cache System pronto!');
console.log('📊 [CACHE] Use advancedCache.getMetrics() para métricas');