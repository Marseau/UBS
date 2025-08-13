/**
 * ADVANCED CACHE SYSTEM
 * Multi-layer caching for <0.1ms response times
 */

class AdvancedCache {
    constructor() {
        this.memoryCache = new Map();
        this.indexedDBCache = null;
        this.serviceWorkerCache = null;
        this.cacheConfig = {
            maxMemorySize: 50 * 1024 * 1024, // 50MB
            maxIndexedDBSize: 100 * 1024 * 1024, // 100MB
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            criticalTTL: 60 * 60 * 1000, // 1 hour
            compressionThreshold: 1024 // 1KB
        };
        this.compressionEnabled = 'CompressionStream' in window;
        this.performanceMetrics = {
            hits: 0,
            misses: 0,
            compressionRatio: 0,
            averageRetrievalTime: 0
        };
        
        this.init();
    }

    /**
     * Inicializar sistema de cache
     */
    async init() {
        console.log('💾 Initializing Advanced Cache System...');
        
        try {
            // Configurar IndexedDB
            await this.setupIndexedDB();
            
            // Configurar Service Worker cache
            await this.setupServiceWorkerCache();
            
            // Setup memory cleanup
            this.setupMemoryCleanup();
            
            // Setup performance monitoring
            this.setupPerformanceMonitoring();
            
            console.log('✅ Advanced Cache System initialized');
            console.log(`   Memory Cache: ${this.formatSize(this.cacheConfig.maxMemorySize)}`);
            console.log(`   IndexedDB Cache: ${this.formatSize(this.cacheConfig.maxIndexedDBSize)}`);
            console.log(`   Compression: ${this.compressionEnabled ? 'Enabled' : 'Disabled'}`);
            
        } catch (error) {
            console.error('❌ Failed to initialize cache system:', error);
        }
    }

    /**
     * Setup IndexedDB para persistent cache
     */
    async setupIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AdvancedCache', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.indexedDBCache = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para dados gerais
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' });
                    store.createIndex('expires', 'expires', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
                
                // Store para métricas
                if (!db.objectStoreNames.contains('metrics')) {
                    db.createObjectStore('metrics', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Setup Service Worker cache
     */
    async setupServiceWorkerCache() {
        if ('caches' in window) {
            try {
                this.serviceWorkerCache = await caches.open('advanced-cache-v1');
                console.log('✅ Service Worker cache available');
            } catch (error) {
                console.warn('⚠️ Service Worker cache failed:', error);
            }
        }
    }

    /**
     * Set item no cache com multi-layer strategy
     */
    async set(key, value, options = {}) {
        const startTime = performance.now();
        
        const item = {
            key,
            value,
            expires: Date.now() + (options.ttl || this.cacheConfig.defaultTTL),
            size: this.calculateSize(value),
            compressed: false,
            priority: options.priority || 'normal',
            metadata: {
                created: Date.now(),
                accessed: Date.now(),
                hits: 0
            }
        };

        try {
            // Comprimir se necessário
            if (item.size > this.cacheConfig.compressionThreshold && this.compressionEnabled) {
                item.value = await this.compress(value);
                item.compressed = true;
                
                const compressionRatio = item.size / this.calculateSize(item.value);
                this.performanceMetrics.compressionRatio = 
                    (this.performanceMetrics.compressionRatio + compressionRatio) / 2;
            }

            // Layer 1: Memory Cache (fastest)
            this.memoryCache.set(key, item);
            
            // Layer 2: IndexedDB (persistent)
            if (options.persistent !== false) {
                await this.setIndexedDB(key, item);
            }
            
            // Layer 3: Service Worker (network resources)
            if (options.networkResource && this.serviceWorkerCache) {
                await this.setServiceWorkerCache(key, value);
            }
            
            // Cleanup if memory is full
            await this.cleanupMemoryIfNeeded();
            
            const setTime = performance.now() - startTime;
            console.log(`💾 Cached ${key} in ${setTime.toFixed(2)}ms (${this.formatSize(item.size)})`);
            
        } catch (error) {
            console.error(`❌ Failed to cache ${key}:`, error);
        }
    }

    /**
     * Get item do cache com fallback strategy
     */
    async get(key) {
        const startTime = performance.now();
        
        try {
            // Layer 1: Memory Cache (fastest - target <0.1ms)
            if (this.memoryCache.has(key)) {
                const item = this.memoryCache.get(key);
                
                if (!this.isExpired(item)) {
                    item.metadata.accessed = Date.now();
                    item.metadata.hits++;
                    
                    const value = item.compressed ? await this.decompress(item.value) : item.value;
                    
                    this.performanceMetrics.hits++;
                    const retrievalTime = performance.now() - startTime;
                    
                    if (retrievalTime < 0.1) {
                        console.log(`⚡ ULTRA-FAST retrieval: ${key} in ${retrievalTime.toFixed(3)}ms`);
                    }
                    
                    return value;
                }
            }

            // Layer 2: IndexedDB (fallback)
            const indexedDBItem = await this.getIndexedDB(key);
            if (indexedDBItem && !this.isExpired(indexedDBItem)) {
                // Promote to memory cache
                this.memoryCache.set(key, indexedDBItem);
                
                const value = indexedDBItem.compressed ? 
                    await this.decompress(indexedDBItem.value) : indexedDBItem.value;
                
                this.performanceMetrics.hits++;
                return value;
            }

            // Layer 3: Service Worker (network resources)
            if (this.serviceWorkerCache) {
                const response = await this.serviceWorkerCache.match(key);
                if (response) {
                    const value = await response.json();
                    
                    // Cache back to memory
                    await this.set(key, value, { persistent: false });
                    
                    this.performanceMetrics.hits++;
                    return value;
                }
            }

            // Cache miss
            this.performanceMetrics.misses++;
            return null;
            
        } catch (error) {
            console.error(`❌ Failed to get ${key} from cache:`, error);
            this.performanceMetrics.misses++;
            return null;
        } finally {
            const retrievalTime = performance.now() - startTime;
            this.performanceMetrics.averageRetrievalTime = 
                (this.performanceMetrics.averageRetrievalTime + retrievalTime) / 2;
        }
    }

    /**
     * Cache API response com intelligent prefetching
     */
    async cacheAPIResponse(url, options = {}) {
        const cacheKey = `api:${url}`;
        
        try {
            // Verificar cache primeiro
            const cached = await this.get(cacheKey);
            if (cached && !options.forceRefresh) {
                console.log(`📋 API cache hit: ${url}`);
                return cached;
            }

            // Fetch fresh data
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Cache com TTL baseado no tipo de dados
            const ttl = this.determineTTL(url, options);
            await this.set(cacheKey, data, { 
                ttl, 
                persistent: true,
                priority: options.priority || 'normal'
            });

            // Prefetch related resources se configurado
            if (options.prefetch) {
                this.prefetchRelatedResources(data, options.prefetch);
            }

            console.log(`🌐 API cached: ${url} (TTL: ${ttl}ms)`);
            return data;

        } catch (error) {
            console.error(`❌ API cache failed for ${url}:`, error);
            
            // Return stale data if available
            const stale = await this.get(cacheKey);
            if (stale) {
                console.warn(`⚠️ Returning stale data for ${url}`);
                return stale;
            }
            
            throw error;
        }
    }

    /**
     * Determinar TTL baseado no endpoint
     */
    determineTTL(url, options) {
        if (options.ttl) return options.ttl;
        
        // Configurações específicas por endpoint
        if (url.includes('/api/cron/') || url.includes('/health')) {
            return 30 * 1000; // 30 seconds for health checks
        }
        
        if (url.includes('/api/metrics/') || url.includes('/analytics/')) {
            return 2 * 60 * 1000; // 2 minutes for metrics
        }
        
        if (url.includes('/api/tenant-platform/')) {
            return 5 * 60 * 1000; // 5 minutes for tenant data
        }
        
        return this.cacheConfig.defaultTTL; // Default 5 minutes
    }

    /**
     * Prefetch recursos relacionados
     */
    async prefetchRelatedResources(data, prefetchConfig) {
        if (!prefetchConfig.enabled) return;
        
        const prefetchPromises = [];
        
        // Prefetch tenant data se disponível
        if (data.tenants && prefetchConfig.tenants) {
            data.tenants.slice(0, 5).forEach(tenant => {
                prefetchPromises.push(
                    this.cacheAPIResponse(`/api/tenant-platform/metrics/${tenant.id}`, {
                        priority: 'low'
                    })
                );
            });
        }
        
        // Prefetch dashboard widgets
        if (prefetchConfig.widgets) {
            const widgetEndpoints = [
                '/api/dashboard/stats',
                '/api/dashboard/recent-activity',
                '/api/dashboard/charts'
            ];
            
            widgetEndpoints.forEach(endpoint => {
                prefetchPromises.push(
                    this.cacheAPIResponse(endpoint, { priority: 'low' })
                );
            });
        }
        
        // Execute prefetch em background
        Promise.allSettled(prefetchPromises).then(results => {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            console.log(`🔄 Prefetched ${successful}/${results.length} resources`);
        });
    }

    /**
     * Comprimir dados
     */
    async compress(data) {
        if (!this.compressionEnabled) return data;
        
        try {
            const jsonString = JSON.stringify(data);
            const stream = new CompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();
            
            writer.write(new TextEncoder().encode(jsonString));
            writer.close();
            
            const chunks = [];
            let done = false;
            
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
            }
            
            return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
            
        } catch (error) {
            console.warn('⚠️ Compression failed, storing uncompressed:', error);
            return data;
        }
    }

    /**
     * Descomprimir dados
     */
    async decompress(compressedData) {
        if (!this.compressionEnabled || !(compressedData instanceof Uint8Array)) {
            return compressedData;
        }
        
        try {
            const stream = new DecompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();
            
            writer.write(compressedData);
            writer.close();
            
            const chunks = [];
            let done = false;
            
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
            }
            
            const decompressed = new TextDecoder().decode(
                new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
            );
            
            return JSON.parse(decompressed);
            
        } catch (error) {
            console.error('❌ Decompression failed:', error);
            return compressedData;
        }
    }

    /**
     * Set item no IndexedDB
     */
    async setIndexedDB(key, item) {
        if (!this.indexedDBCache) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDBCache.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get item do IndexedDB
     */
    async getIndexedDB(key) {
        if (!this.indexedDBCache) return null;
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDBCache.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Set item no Service Worker cache
     */
    async setServiceWorkerCache(key, value) {
        if (!this.serviceWorkerCache) return;
        
        const response = new Response(JSON.stringify(value), {
            headers: { 'Content-Type': 'application/json' }
        });
        
        await this.serviceWorkerCache.put(key, response);
    }

    /**
     * Verificar se item expirou
     */
    isExpired(item) {
        return Date.now() > item.expires;
    }

    /**
     * Calcular tamanho do objeto
     */
    calculateSize(obj) {
        return new Blob([JSON.stringify(obj)]).size;
    }

    /**
     * Cleanup memory cache se necessário
     */
    async cleanupMemoryIfNeeded() {
        const currentSize = Array.from(this.memoryCache.values())
            .reduce((total, item) => total + item.size, 0);
        
        if (currentSize > this.cacheConfig.maxMemorySize) {
            console.log(`🧹 Memory cache cleanup needed (${this.formatSize(currentSize)})`);
            
            // Remover itens expirados primeiro
            for (const [key, item] of this.memoryCache.entries()) {
                if (this.isExpired(item)) {
                    this.memoryCache.delete(key);
                }
            }
            
            // Se ainda precisar de espaço, remover LRU
            const remainingSize = Array.from(this.memoryCache.values())
                .reduce((total, item) => total + item.size, 0);
            
            if (remainingSize > this.cacheConfig.maxMemorySize) {
                const sortedItems = Array.from(this.memoryCache.entries())
                    .sort((a, b) => a[1].metadata.accessed - b[1].metadata.accessed);
                
                while (remainingSize > this.cacheConfig.maxMemorySize * 0.8) {
                    const [key] = sortedItems.shift();
                    this.memoryCache.delete(key);
                }
            }
        }
    }

    /**
     * Setup memory cleanup automático
     */
    setupMemoryCleanup() {
        // Cleanup a cada 5 minutos
        setInterval(() => {
            this.cleanupMemoryIfNeeded();
        }, 5 * 60 * 1000);
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Log statistics periodicamente
        setInterval(() => {
            const stats = this.getStatistics();
            console.log('💾 Cache Statistics:', stats);
        }, 10 * 60 * 1000); // A cada 10 minutos
    }

    /**
     * Get estatísticas do cache
     */
    getStatistics() {
        const memoryItems = this.memoryCache.size;
        const memorySize = Array.from(this.memoryCache.values())
            .reduce((total, item) => total + item.size, 0);
        
        const hitRate = (this.performanceMetrics.hits / 
            (this.performanceMetrics.hits + this.performanceMetrics.misses)) * 100;
        
        return {
            memory: {
                items: memoryItems,
                size: this.formatSize(memorySize),
                utilization: `${((memorySize / this.cacheConfig.maxMemorySize) * 100).toFixed(1)}%`
            },
            performance: {
                hitRate: `${hitRate.toFixed(1)}%`,
                averageRetrievalTime: `${this.performanceMetrics.averageRetrievalTime.toFixed(2)}ms`,
                compressionRatio: this.performanceMetrics.compressionRatio.toFixed(2)
            },
            totals: {
                hits: this.performanceMetrics.hits,
                misses: this.performanceMetrics.misses
            }
        };
    }

    /**
     * Clear all caches
     */
    async clearAll() {
        // Clear memory
        this.memoryCache.clear();
        
        // Clear IndexedDB
        if (this.indexedDBCache) {
            const transaction = this.indexedDBCache.transaction(['cache'], 'readwrite');
            await transaction.objectStore('cache').clear();
        }
        
        // Clear Service Worker cache
        if (this.serviceWorkerCache) {
            const keys = await this.serviceWorkerCache.keys();
            await Promise.all(keys.map(key => this.serviceWorkerCache.delete(key)));
        }
        
        console.log('🧹 All caches cleared');
    }

    /**
     * Formatar tamanho em bytes
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Export para uso global
window.AdvancedCache = AdvancedCache;

// Auto-inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.advancedCache = new AdvancedCache();
    });
} else {
    window.advancedCache = new AdvancedCache();
}