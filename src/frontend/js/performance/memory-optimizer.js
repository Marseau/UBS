/**
 * Memory Optimizer for Frontend JavaScript
 * Reduces memory usage and optimizes performance for <50MB target
 * 
 * @fileoverview Frontend memory optimization utilities
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-01-17
 */

class MemoryOptimizer {
    constructor() {
        this.observers = new Map();
        this.timers = new Map();
        this.cache = new Map();
        this.maxCacheSize = 20; // Reduced cache size
        this.cleanupInterval = 30000; // 30 seconds
        
        this.initializeOptimizations();
    }

    /**
     * Initialize memory optimizations
     */
    initializeOptimizations() {
        // Auto cleanup intervals
        this.startAutoCleanup();
        
        // Memory monitoring
        this.enableMemoryMonitoring();
        
        // Optimize DOM operations
        this.optimizeDOMOperations();
        
        // Lazy load event listeners
        this.setupLazyEventListeners();
    }

    /**
     * Start automatic cleanup processes
     */
    startAutoCleanup() {
        const cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.cleanupInterval);
        
        this.timers.set('cleanup', cleanupTimer);
    }

    /**
     * Perform memory cleanup
     */
    performCleanup() {
        // Clean cache if over limit
        if (this.cache.size > this.maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            const toKeep = entries.slice(-Math.floor(this.maxCacheSize * 0.7)); // Keep 70%
            this.cache.clear();
            toKeep.forEach(([key, value]) => this.cache.set(key, value));
        }

        // Clean expired observers
        for (const [key, observer] of this.observers.entries()) {
            if (observer.isExpired && observer.isExpired()) {
                observer.disconnect();
                this.observers.delete(key);
            }
        }

        // Force garbage collection if available
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
        }
    }

    /**
     * Enable memory monitoring
     */
    enableMemoryMonitoring() {
        if (performance.memory) {
            const monitorTimer = setInterval(() => {
                const memory = performance.memory;
                const usedMB = memory.usedJSHeapSize / 1024 / 1024;
                
                // Log warning if memory usage is high
                if (usedMB > 40) { // Warning at 40MB
                    console.warn(`High memory usage detected: ${usedMB.toFixed(1)}MB`);
                    this.performEmergencyCleanup();
                }
            }, 10000); // Check every 10 seconds
            
            this.timers.set('memoryMonitor', monitorTimer);
        }
    }

    /**
     * Emergency cleanup when memory is high
     */
    performEmergencyCleanup() {
        // Clear all caches
        this.cache.clear();
        
        // Remove non-essential observers
        for (const [key, observer] of this.observers.entries()) {
            if (!key.includes('essential')) {
                observer.disconnect();
                this.observers.delete(key);
            }
        }
        
        // Clear event listeners on hidden elements
        this.cleanupHiddenElements();
    }

    /**
     * Optimize DOM operations
     */
    optimizeDOMOperations() {
        // Override common DOM methods to add memory optimization
        const originalAddEventListener = Element.prototype.addEventListener;
        const optimizedListeners = new WeakMap();

        Element.prototype.addEventListener = function(type, listener, options) {
            const key = `${type}_${listener.toString().substring(0, 50)}`;
            
            // Prevent duplicate listeners
            if (optimizedListeners.has(this) && optimizedListeners.get(this).has(key)) {
                return;
            }
            
            if (!optimizedListeners.has(this)) {
                optimizedListeners.set(this, new Set());
            }
            optimizedListeners.get(this).add(key);
            
            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    /**
     * Setup lazy event listeners
     */
    setupLazyEventListeners() {
        const lazyElements = document.querySelectorAll('[data-lazy-events]');
        
        lazyElements.forEach(element => {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadElementEvents(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '50px' });
            
            observer.observe(element);
            this.observers.set(`lazy_${element.id || Math.random()}`, observer);
        });
    }

    /**
     * Load events for lazy elements
     */
    loadElementEvents(element) {
        const eventsData = element.getAttribute('data-lazy-events');
        if (eventsData) {
            try {
                const events = JSON.parse(eventsData);
                events.forEach(({ type, handler }) => {
                    if (typeof window[handler] === 'function') {
                        element.addEventListener(type, window[handler]);
                    }
                });
            } catch (error) {
                console.error('Error loading lazy events:', error);
            }
        }
    }

    /**
     * Cleanup hidden elements
     */
    cleanupHiddenElements() {
        const hiddenElements = document.querySelectorAll('[style*="display: none"], [hidden]');
        
        hiddenElements.forEach(element => {
            // Remove event listeners from hidden elements
            const clone = element.cloneNode(true);
            element.parentNode?.replaceChild(clone, element);
        });
    }

    /**
     * Optimized cache management
     */
    getCached(key) {
        const value = this.cache.get(key);
        if (value) {
            // Move to end (LRU)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    setCached(key, value) {
        // Remove oldest if at limit
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    /**
     * Memory-efficient fetch wrapper
     */
    async optimizedFetch(url, options = {}) {
        const cacheKey = `fetch_${url}_${JSON.stringify(options)}`;
        const cached = this.getCached(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
            return cached.data;
        }

        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache only small responses
            if (JSON.stringify(data).length < 10000) { // 10KB limit
                this.setCached(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
            }
            
            return data;
        } catch (error) {
            console.error('Optimized fetch error:', error);
            throw error;
        }
    }

    /**
     * Debounced function wrapper for memory efficiency
     */
    debounced(func, delay = 300) {
        const key = func.toString().substring(0, 50);
        
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }
        
        const timer = setTimeout(() => {
            func();
            this.timers.delete(key);
        }, delay);
        
        this.timers.set(key, timer);
    }

    /**
     * Get memory statistics
     */
    getMemoryStats() {
        const stats = {
            cacheSize: this.cache.size,
            observersCount: this.observers.size,
            timersCount: this.timers.size,
            maxCacheSize: this.maxCacheSize
        };

        if (performance.memory) {
            stats.jsHeapSize = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }

        return stats;
    }

    /**
     * Cleanup all resources
     */
    destroy() {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
            clearInterval(timer);
        }
        this.timers.clear();

        // Disconnect all observers
        for (const observer of this.observers.values()) {
            observer.disconnect();
        }
        this.observers.clear();

        // Clear cache
        this.cache.clear();
    }
}

// Create global instance
window.memoryOptimizer = new MemoryOptimizer();

// Auto-cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.memoryOptimizer) {
        window.memoryOptimizer.destroy();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryOptimizer;
}