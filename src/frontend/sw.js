/**
 * ADVANCED SERVICE WORKER
 * Service Worker otimizado inspirado nos princípios MCP
 * 
 * FEATURES:
 * - Network-first + Cache fallback strategy
 * - Background sync para operações offline
 * - Push notifications inteligentes
 * - Background fetch para pre-loading
 * - Cache versioning e invalidation
 * - Performance monitoring
 * - Automatic updates com smart refresh
 * - Resource optimization (preload, prefetch)
 * 
 * @fileoverview Service Worker para 110% optimization e offline support
 * @author Claude Code Assistant + MCP Optimization Principles
 * @version 2.0.0
 * @since 2025-07-17
 */

const CACHE_NAME = 'ubs-cache-v2.0';
const DATA_CACHE_NAME = 'ubs-data-cache-v2.0';
const CACHE_VERSION = '2.0.0';

// Cache strategies
const CACHE_STRATEGIES = {
    NETWORK_FIRST: 'network-first',
    CACHE_FIRST: 'cache-first',
    NETWORK_ONLY: 'network-only',
    CACHE_ONLY: 'cache-only',
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Resource patterns
const RESOURCE_PATTERNS = {
    STATIC: {
        pattern: /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
        strategy: CACHE_STRATEGIES.CACHE_FIRST,
        ttl: 86400000 // 24 hours
    },
    API: {
        pattern: /^\/api\//,
        strategy: CACHE_STRATEGIES.NETWORK_FIRST,
        ttl: 300000 // 5 minutes
    },
    DASHBOARD: {
        pattern: /\/(dashboard|admin)/,
        strategy: CACHE_STRATEGIES.NETWORK_FIRST,
        ttl: 3600000 // 1 hour
    },
    METRICS: {
        pattern: /\/api\/(metrics|dashboard|super-admin)/,
        strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
        ttl: 300000 // 5 minutes
    }
};

// Performance metrics
const metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    networkRequests: 0,
    backgroundSyncs: 0,
    pushNotifications: 0,
    offlineRequests: []
};

/**
 * SERVICE WORKER INSTALLATION
 */
self.addEventListener('install', (event) => {
    console.log('🚀 [SW] Installing Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                
                // Cache essential resources
                const essentialResources = [
                    '/',
                    '/admin',
                    '/dashboard',
                    '/js/dashboard.js',
                    '/js/performance/lazy-loading-system.js',
                    '/js/performance/advanced-cache-system.js',
                    '/js/performance/virtual-scrolling-system.js',
                    '/css/dashboard.css',
                    '/css/admin.css',
                    '/offline.html'
                ];
                
                await cache.addAll(essentialResources);
                console.log('✅ [SW] Essential resources cached');
                
                // Skip waiting to activate immediately
                self.skipWaiting();
                
            } catch (error) {
                console.error('❌ [SW] Install failed:', error);
            }
        })()
    );
});

/**
 * SERVICE WORKER ACTIVATION
 */
self.addEventListener('activate', (event) => {
    console.log('🎯 [SW] Activating Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        (async () => {
            try {
                // Clear old caches
                const cacheNames = await caches.keys();
                const oldCaches = cacheNames.filter(name => 
                    name !== CACHE_NAME && 
                    name !== DATA_CACHE_NAME &&
                    name.startsWith('ubs-')
                );
                
                await Promise.all(
                    oldCaches.map(name => caches.delete(name))
                );
                
                if (oldCaches.length > 0) {
                    console.log(`🧹 [SW] Cleared ${oldCaches.length} old caches`);
                }
                
                // Take control of all clients
                await self.clients.claim();
                console.log('✅ [SW] Service Worker activated and controlling clients');
                
                // Send update notification to clients
                await notifyClients({ type: 'SW_UPDATED', version: CACHE_VERSION });
                
            } catch (error) {
                console.error('❌ [SW] Activation failed:', error);
            }
        })()
    );
});

/**
 * FETCH EVENT HANDLER
 */
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and chrome-extension requests
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    const url = new URL(event.request.url);
    const strategy = getRequestStrategy(url.pathname);
    
    event.respondWith(
        handleRequest(event.request, strategy)
    );
});

/**
 * BACKGROUND SYNC
 */
self.addEventListener('sync', (event) => {
    console.log('🔄 [SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'background-metrics-sync') {
        event.waitUntil(syncOfflineMetrics());
    } else if (event.tag === 'background-data-sync') {
        event.waitUntil(syncOfflineData());
    }
});

/**
 * PUSH NOTIFICATIONS
 */
self.addEventListener('push', (event) => {
    console.log('📲 [SW] Push notification received');
    
    const options = {
        body: 'New data available in your dashboard',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'dashboard-update',
        requireInteraction: true,
        data: {
            url: '/dashboard',
            timestamp: Date.now()
        }
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            options.body = payload.body || options.body;
            options.data.url = payload.url || options.data.url;
        } catch (error) {
            console.warn('⚠️ [SW] Invalid push payload');
        }
    }

    event.waitUntil(
        self.registration.showNotification('Universal Booking System', options)
    );
    
    metrics.pushNotifications++;
});

/**
 * NOTIFICATION CLICK
 */
self.addEventListener('notificationclick', (event) => {
    console.log('👆 [SW] Notification clicked');
    
    event.notification.close();
    
    const url = event.notification.data?.url || '/dashboard';
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            // Check if window is already open
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

/**
 * MESSAGE HANDLER
 */
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_METRICS':
            event.ports[0].postMessage(getPerformanceMetrics());
            break;
            
        case 'CLEAR_CACHE':
            clearAllCaches().then(() => {
                event.ports[0].postMessage({ success: true });
            });
            break;
            
        case 'PRELOAD_RESOURCES':
            preloadResources(data.urls);
            break;
            
        case 'QUEUE_OFFLINE_REQUEST':
            queueOfflineRequest(data.request);
            break;
    }
});

/**
 * GET REQUEST STRATEGY
 */
function getRequestStrategy(pathname) {
    for (const [name, config] of Object.entries(RESOURCE_PATTERNS)) {
        if (config.pattern.test(pathname)) {
            return config;
        }
    }
    
    // Default strategy
    return {
        strategy: CACHE_STRATEGIES.NETWORK_FIRST,
        ttl: 300000 // 5 minutes
    };
}

/**
 * HANDLE REQUEST
 */
async function handleRequest(request, strategyConfig) {
    const { strategy, ttl } = strategyConfig;
    
    try {
        switch (strategy) {
            case CACHE_STRATEGIES.NETWORK_FIRST:
                return await networkFirst(request, ttl);
                
            case CACHE_STRATEGIES.CACHE_FIRST:
                return await cacheFirst(request, ttl);
                
            case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
                return await staleWhileRevalidate(request, ttl);
                
            case CACHE_STRATEGIES.NETWORK_ONLY:
                return await fetch(request);
                
            case CACHE_STRATEGIES.CACHE_ONLY:
                return await caches.match(request);
                
            default:
                return await networkFirst(request, ttl);
        }
    } catch (error) {
        console.error('❌ [SW] Request handling failed:', error);
        return await getCachedOrOffline(request);
    }
}

/**
 * NETWORK FIRST STRATEGY
 */
async function networkFirst(request, ttl) {
    try {
        const response = await fetch(request);
        metrics.networkRequests++;
        
        if (response.ok) {
            await cacheResponse(request, response.clone(), ttl);
        }
        
        return response;
    } catch (error) {
        console.warn('⚠️ [SW] Network failed, trying cache');
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            metrics.cacheHits++;
            return cachedResponse;
        }
        
        metrics.cacheMisses++;
        return await getOfflineResponse(request);
    }
}

/**
 * CACHE FIRST STRATEGY
 */
async function cacheFirst(request, ttl) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse && !isExpired(cachedResponse, ttl)) {
        metrics.cacheHits++;
        return cachedResponse;
    }
    
    try {
        const response = await fetch(request);
        metrics.networkRequests++;
        
        if (response.ok) {
            await cacheResponse(request, response.clone(), ttl);
        }
        
        return response;
    } catch (error) {
        if (cachedResponse) {
            metrics.cacheHits++;
            return cachedResponse;
        }
        
        metrics.cacheMisses++;
        return await getOfflineResponse(request);
    }
}

/**
 * STALE WHILE REVALIDATE STRATEGY
 */
async function staleWhileRevalidate(request, ttl) {
    const cachedResponse = await caches.match(request);
    
    // Start fetch in background
    const fetchPromise = fetch(request)
        .then(response => {
            if (response.ok) {
                cacheResponse(request, response.clone(), ttl);
            }
            return response;
        })
        .catch(error => {
            console.warn('⚠️ [SW] Background fetch failed:', error);
        });
    
    if (cachedResponse) {
        metrics.cacheHits++;
        // Return cached immediately, update in background
        fetchPromise.catch(() => {}); // Prevent unhandled rejection
        return cachedResponse;
    } else {
        // No cache, wait for network
        metrics.networkRequests++;
        return await fetchPromise;
    }
}

/**
 * CACHE RESPONSE
 */
async function cacheResponse(request, response, ttl) {
    const cache = await caches.open(getCacheName(request));
    
    // Add timestamp for TTL
    const responseWithTimestamp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
            ...Object.fromEntries(response.headers.entries()),
            'sw-cached-at': Date.now().toString(),
            'sw-ttl': ttl.toString()
        }
    });
    
    await cache.put(request, responseWithTimestamp);
}

/**
 * GET CACHE NAME
 */
function getCacheName(request) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/')) {
        return DATA_CACHE_NAME;
    }
    
    return CACHE_NAME;
}

/**
 * CHECK IF RESPONSE IS EXPIRED
 */
function isExpired(response, ttl) {
    const cachedAt = response.headers.get('sw-cached-at');
    if (!cachedAt) return false;
    
    const age = Date.now() - parseInt(cachedAt);
    const maxAge = parseInt(response.headers.get('sw-ttl')) || ttl;
    
    return age > maxAge;
}

/**
 * GET CACHED OR OFFLINE RESPONSE
 */
async function getCachedOrOffline(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        metrics.cacheHits++;
        return cachedResponse;
    }
    
    metrics.cacheMisses++;
    return await getOfflineResponse(request);
}

/**
 * GET OFFLINE RESPONSE
 */
async function getOfflineResponse(request) {
    const url = new URL(request.url);
    
    // API requests - return JSON error
    if (url.pathname.startsWith('/api/')) {
        return new Response(
            JSON.stringify({
                error: 'Offline',
                message: 'This request is not available offline',
                offline: true
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
    
    // HTML pages - return offline page
    if (request.headers.get('accept')?.includes('text/html')) {
        const offlineResponse = await caches.match('/offline.html');
        if (offlineResponse) {
            return offlineResponse;
        }
    }
    
    // Default offline response
    return new Response('Offline', { status: 503 });
}

/**
 * SYNC OFFLINE METRICS
 */
async function syncOfflineMetrics() {
    console.log('🔄 [SW] Syncing offline metrics...');
    
    try {
        const requests = metrics.offlineRequests.splice(0); // Remove all
        
        for (const request of requests) {
            try {
                await fetch(request.url, request.options);
                console.log('✅ [SW] Synced offline request:', request.url);
            } catch (error) {
                console.error('❌ [SW] Failed to sync request:', request.url, error);
                // Re-queue for next sync
                metrics.offlineRequests.push(request);
            }
        }
        
        metrics.backgroundSyncs++;
        
    } catch (error) {
        console.error('❌ [SW] Offline metrics sync failed:', error);
    }
}

/**
 * SYNC OFFLINE DATA
 */
async function syncOfflineData() {
    console.log('🔄 [SW] Syncing offline data...');
    
    // Implementation for syncing cached data changes
    // This would sync any offline modifications back to server
}

/**
 * QUEUE OFFLINE REQUEST
 */
function queueOfflineRequest(requestData) {
    metrics.offlineRequests.push({
        url: requestData.url,
        options: requestData.options,
        timestamp: Date.now()
    });
    
    // Register background sync
    self.registration.sync.register('background-metrics-sync');
}

/**
 * PRELOAD RESOURCES
 */
async function preloadResources(urls) {
    console.log('🔮 [SW] Preloading resources:', urls);
    
    const cache = await caches.open(CACHE_NAME);
    
    const preloadPromises = urls.map(async (url) => {
        try {
            const response = await fetch(url);
            if (response.ok) {
                await cache.put(url, response);
            }
        } catch (error) {
            console.warn(`⚠️ [SW] Failed to preload ${url}:`, error);
        }
    });
    
    await Promise.allSettled(preloadPromises);
}

/**
 * CLEAR ALL CACHES
 */
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('🧹 [SW] All caches cleared');
}

/**
 * GET PERFORMANCE METRICS
 */
function getPerformanceMetrics() {
    const totalRequests = metrics.cacheHits + metrics.cacheMisses;
    const hitRate = totalRequests > 0 ? (metrics.cacheHits / totalRequests * 100).toFixed(1) : 0;
    
    return {
        ...metrics,
        hitRate: hitRate + '%',
        totalRequests,
        version: CACHE_VERSION,
        timestamp: Date.now()
    };
}

/**
 * NOTIFY CLIENTS
 */
async function notifyClients(message) {
    const clientList = await clients.matchAll({ includeUncontrolled: true });
    
    clientList.forEach(client => {
        client.postMessage(message);
    });
}

/**
 * PERIODIC TASKS
 */
setInterval(() => {
    // Cleanup old offline requests (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    metrics.offlineRequests = metrics.offlineRequests.filter(
        request => request.timestamp > oneHourAgo
    );
}, 300000); // Every 5 minutes

console.log('🚀 [SW] Advanced Service Worker loaded v' + CACHE_VERSION);

// Removed duplicate variable declarations - using the ones defined at the top

// Additional cache strategies per resource type
const ADDITIONAL_CACHE_STRATEGIES = {
    // Static assets - Cache First (longest TTL)
    static: {
        pattern: /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/,
        strategy: 'CacheFirst',
        ttl: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // API responses - Network First with fast fallback
    api: {
        pattern: /\/api\//,
        strategy: 'NetworkFirst',
        ttl: 5 * 60 * 1000, // 5 minutes
        timeout: 100 // 100ms timeout for ultra-fast fallback
    },
    
    // Dashboard data - Stale While Revalidate
    dashboard: {
        pattern: /\/(dashboard|admin|analytics)/,
        strategy: 'StaleWhileRevalidate',
        ttl: 10 * 60 * 1000 // 10 minutes
    },
    
    // Critical resources - Cache First with instant fallback
    critical: {
        pattern: /\/(dist\/js\/(auth-guard|utils-bundle|dashboard-bundle))/,
        strategy: 'CacheFirst',
        ttl: 60 * 60 * 1000, // 1 hour
        timeout: 10 // 10ms timeout for critical resources
    }
};

// Critical resources to precache
const PRECACHE_RESOURCES = [
    '/dist/js/auth-guard.min.js',
    '/dist/js/utils-bundle.min.js',
    '/dist/css/styles-bundle.min.css',
    '/api/health',
    '/manifest.json'
];

// Performance tracking
let performanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    networkRequests: 0,
    averageResponseTime: 0,
    ultraFastResponses: 0 // < 0.1ms responses
};

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                
                // Precache critical resources
                console.log('📦 Precaching critical resources...');
                await cache.addAll(PRECACHE_RESOURCES.filter(url => !url.startsWith('/api/')));
                
                // Precache API endpoints
                const apiPromises = PRECACHE_RESOURCES
                    .filter(url => url.startsWith('/api/'))
                    .map(async (url) => {
                        try {
                            const response = await fetch(url);
                            if (response.ok) {
                                await cache.put(url, response);
                            }
                        } catch (error) {
                            console.warn(`⚠️ Failed to precache ${url}:`, error);
                        }
                    });
                
                await Promise.allSettled(apiPromises);
                
                console.log('✅ Service Worker installed and precached');
                
                // Skip waiting to activate immediately
                self.skipWaiting();
                
            } catch (error) {
                console.error('❌ Service Worker installation failed:', error);
            }
        })()
    );
});

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        (async () => {
            try {
                // Clean up old caches
                const cacheNames = await caches.keys();
                const deletePromises = cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name));
                
                await Promise.all(deletePromises);
                
                // Claim all clients immediately
                await clients.claim();
                
                console.log('✅ Service Worker activated');
                
            } catch (error) {
                console.error('❌ Service Worker activation failed:', error);
            }
        })()
    );
});

/**
 * Fetch Event Handler - Main caching logic
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests and cross-origin requests
    if (request.method !== 'GET' || url.origin !== location.origin) {
        return;
    }
    
    // Determine cache strategy
    const strategy = determineCacheStrategy(request);
    
    event.respondWith(
        handleRequest(request, strategy)
    );
});

/**
 * Determine cache strategy based on request
 */
function determineCacheStrategy(request) {
    const url = request.url;
    
    for (const [name, config] of Object.entries(CACHE_STRATEGIES)) {
        if (config.pattern.test(url)) {
            return { name, ...config };
        }
    }
    
    // Default strategy
    return {
        name: 'default',
        strategy: 'NetworkFirst',
        ttl: 5 * 60 * 1000,
        timeout: 1000
    };
}

/**
 * Handle request with specified strategy
 */
async function handleRequest(request, strategy) {
    const startTime = performance.now();
    
    try {
        let response;
        
        switch (strategy.strategy) {
            case 'CacheFirst':
                response = await cacheFirstStrategy(request, strategy);
                break;
            case 'NetworkFirst':
                response = await networkFirstStrategy(request, strategy);
                break;
            case 'StaleWhileRevalidate':
                response = await staleWhileRevalidateStrategy(request, strategy);
                break;
            default:
                response = await networkFirstStrategy(request, strategy);
        }
        
        // Track performance
        const responseTime = performance.now() - startTime;
        updatePerformanceMetrics(responseTime, response);
        
        // Log ultra-fast responses
        if (responseTime < 0.1) {
            performanceMetrics.ultraFastResponses++;
            console.log(`⚡ ULTRA-FAST: ${request.url} in ${responseTime.toFixed(3)}ms`);
        }
        
        return response;
        
    } catch (error) {
        console.error(`❌ Failed to handle request ${request.url}:`, error);
        return new Response('Service Worker Error', { status: 500 });
    }
}

/**
 * Cache First Strategy - For static assets
 */
async function cacheFirstStrategy(request, strategy) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse && !isExpired(cachedResponse, strategy.ttl)) {
        performanceMetrics.cacheHits++;
        return cachedResponse;
    }
    
    try {
        // Network request with timeout for critical resources
        const fetchPromise = fetch(request);
        const response = strategy.timeout ? 
            await timeoutPromise(fetchPromise, strategy.timeout) : 
            await fetchPromise;
        
        if (response.ok) {
            // Cache successful response
            const responseToCache = response.clone();
            await cache.put(request, responseToCache);
            performanceMetrics.networkRequests++;
            return response;
        }
        
        // Return stale cache if network failed
        if (cachedResponse) {
            console.warn(`⚠️ Network failed, returning stale cache for ${request.url}`);
            return cachedResponse;
        }
        
        return response;
        
    } catch (error) {
        // Return cached response if available
        if (cachedResponse) {
            console.warn(`⚠️ Network error, returning cached response for ${request.url}`);
            performanceMetrics.cacheHits++;
            return cachedResponse;
        }
        
        throw error;
    }
}

/**
 * Network First Strategy - For API calls
 */
async function networkFirstStrategy(request, strategy) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Try network first with timeout
        const fetchPromise = fetch(request);
        const response = strategy.timeout ? 
            await timeoutPromise(fetchPromise, strategy.timeout) : 
            await fetchPromise;
        
        if (response.ok) {
            // Cache successful response
            const responseToCache = response.clone();
            await cache.put(request, responseToCache);
            performanceMetrics.networkRequests++;
            return response;
        }
        
        // If network response is not ok, try cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            performanceMetrics.cacheHits++;
            return cachedResponse;
        }
        
        return response;
        
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse && !isExpired(cachedResponse, strategy.ttl)) {
            console.log(`💾 Network failed, serving from cache: ${request.url}`);
            performanceMetrics.cacheHits++;
            return cachedResponse;
        }
        
        performanceMetrics.cacheMisses++;
        throw error;
    }
}

/**
 * Stale While Revalidate Strategy - For dashboard data
 */
async function staleWhileRevalidateStrategy(request, strategy) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Start network request (don't await)
    const networkPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(error => {
        console.warn(`⚠️ Background update failed for ${request.url}:`, error);
    });
    
    // Return cached version immediately if available
    if (cachedResponse) {
        performanceMetrics.cacheHits++;
        
        // Don't wait for network update
        networkPromise;
        
        return cachedResponse;
    }
    
    // No cache available, wait for network
    try {
        const response = await networkPromise;
        performanceMetrics.networkRequests++;
        return response;
    } catch (error) {
        performanceMetrics.cacheMisses++;
        throw error;
    }
}

/**
 * Check if cached response is expired
 */
function isExpired(response, ttl) {
    const cacheDate = response.headers.get('sw-cache-date');
    if (!cacheDate) return false;
    
    const age = Date.now() - parseInt(cacheDate);
    return age > ttl;
}

/**
 * Add cache date header to response
 */
function addCacheHeaders(response) {
    const headers = new Headers(response.headers);
    headers.set('sw-cache-date', Date.now().toString());
    
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

/**
 * Promise with timeout
 */
function timeoutPromise(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
    ]);
}

/**
 * Update performance metrics
 */
function updatePerformanceMetrics(responseTime, response) {
    // Update average response time
    performanceMetrics.averageResponseTime = 
        (performanceMetrics.averageResponseTime + responseTime) / 2;
    
    // Send metrics to main thread periodically
    if (Math.random() < 0.01) { // 1% sample rate
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'SW_PERFORMANCE_METRICS',
                    metrics: performanceMetrics
                });
            });
        });
    }
}

/**
 * Handle messages from main thread
 */
self.addEventListener('message', (event) => {
    const { data } = event;
    
    switch (data.type) {
        case 'GET_PERFORMANCE_METRICS':
            event.ports[0].postMessage(performanceMetrics);
            break;
            
        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                event.ports[0].postMessage({ success: true });
            });
            break;
            
        case 'PRECACHE_RESOURCE':
            caches.open(CACHE_NAME).then(cache => {
                return cache.add(data.url);
            }).then(() => {
                event.ports[0].postMessage({ success: true });
            }).catch(error => {
                event.ports[0].postMessage({ success: false, error: error.message });
            });
            break;
    }
});

console.log('🚀 Service Worker script loaded');