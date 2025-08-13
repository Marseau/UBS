/**
 * ADVANCED LAZY LOADING SYSTEM
 * Inspirado pelos princípios MCP de otimização inteligente
 * 
 * FEATURES:
 * - Intersection Observer API para carregamento sob demanda
 * - Preload inteligente baseado em padrões de uso
 * - Cache de componentes com TTL
 * - Fallback gracioso para browsers antigos
 * - Performance monitoring integrado
 * 
 * @fileoverview Sistema de lazy loading avançado para 110% optimization
 * @author Claude Code Assistant + MCP Optimization Principles  
 * @version 2.0.0
 * @since 2025-07-17
 */

class AdvancedLazyLoadingSystem {
    constructor(options = {}) {
        this.config = {
            // Intersection Observer config
            rootMargin: '50px 0px',
            threshold: 0.1,
            
            // Preload settings
            preloadDistance: 200, // pixels
            preloadDelay: 100, // ms
            
            // Cache settings
            cacheTTL: 300000, // 5 minutes
            maxCacheSize: 50, // components
            
            // Performance settings
            enableMetrics: true,
            debounceDelay: 16, // 60fps
            
            // Fallback settings
            fallbackTimeout: 5000, // 5 seconds
            
            ...options
        };

        this.observer = null;
        this.componentCache = new Map();
        this.loadingQueue = new Set();
        this.metrics = {
            componentsLoaded: 0,
            cacheHits: 0,
            loadTimes: [],
            errors: 0
        };

        this.init();
    }

    /**
     * INICIALIZAÇÃO DO SISTEMA
     */
    init() {
        console.log('🚀 [LAZY-LOADING] Inicializando Advanced Lazy Loading System...');
        
        // Check browser support
        if (!this.checkBrowserSupport()) {
            console.warn('⚠️ [LAZY-LOADING] Usando fallback mode para browser antigo');
            this.initFallbackMode();
            return;
        }

        // Setup Intersection Observer
        this.setupIntersectionObserver();
        
        // Setup preload detector
        this.setupPreloadDetector();
        
        // Setup cache cleanup
        this.setupCacheCleanup();
        
        // Auto-detect lazy elements
        this.detectLazyElements();
        
        console.log('✅ [LAZY-LOADING] Sistema inicializado com sucesso');
        console.log(`📊 [LAZY-LOADING] Configuração: ${JSON.stringify(this.config, null, 2)}`);
    }

    /**
     * CHECK BROWSER SUPPORT
     */
    checkBrowserSupport() {
        return !!(
            window.IntersectionObserver &&
            window.Promise &&
            window.Map &&
            window.Set
        );
    }

    /**
     * SETUP INTERSECTION OBSERVER
     */
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: this.config.rootMargin,
            threshold: this.config.threshold
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadComponent(entry.target);
                }
            });
        }, options);

        console.log('🔍 [LAZY-LOADING] Intersection Observer configurado');
    }

    /**
     * SETUP PRELOAD DETECTOR
     */
    setupPreloadDetector() {
        let scrollTimer = null;
        
        const handleScroll = () => {
            if (scrollTimer) return;
            
            scrollTimer = setTimeout(() => {
                this.detectPreloadCandidates();
                scrollTimer = null;
            }, this.config.debounceDelay);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        console.log('🔮 [LAZY-LOADING] Preload detector ativo');
    }

    /**
     * DETECT PRELOAD CANDIDATES
     */
    detectPreloadCandidates() {
        const viewportHeight = window.innerHeight;
        const scrollTop = window.pageYOffset;
        const preloadZone = scrollTop + viewportHeight + this.config.preloadDistance;

        document.querySelectorAll('[data-lazy-component]:not([data-lazy-loaded])').forEach(element => {
            const elementTop = element.offsetTop;
            
            if (elementTop <= preloadZone && elementTop > scrollTop + viewportHeight) {
                // Element is in preload zone
                setTimeout(() => {
                    this.preloadComponent(element);
                }, this.config.preloadDelay);
            }
        });
    }

    /**
     * AUTO-DETECT LAZY ELEMENTS
     */
    detectLazyElements() {
        const lazyElements = document.querySelectorAll('[data-lazy-component]');
        
        lazyElements.forEach(element => {
            if (!element.hasAttribute('data-lazy-observed')) {
                this.observer.observe(element);
                element.setAttribute('data-lazy-observed', 'true');
            }
        });

        console.log(`🎯 [LAZY-LOADING] Detectados ${lazyElements.length} elementos lazy`);
    }

    /**
     * LOAD COMPONENT
     */
    async loadComponent(element) {
        const componentName = element.getAttribute('data-lazy-component');
        const loadStartTime = performance.now();
        
        if (!componentName) {
            console.error('❌ [LAZY-LOADING] Elemento sem data-lazy-component');
            return;
        }

        if (element.hasAttribute('data-lazy-loaded')) {
            return; // Already loaded
        }

        if (this.loadingQueue.has(componentName)) {
            return; // Already loading
        }

        try {
            console.log(`⏳ [LAZY-LOADING] Carregando componente: ${componentName}`);
            this.loadingQueue.add(componentName);

            // Check cache first
            let componentData = this.getFromCache(componentName);
            
            if (!componentData) {
                // Load from source
                componentData = await this.fetchComponent(componentName);
                
                // Cache for future use
                this.cacheComponent(componentName, componentData);
            } else {
                this.metrics.cacheHits++;
                console.log(`💾 [LAZY-LOADING] Cache hit para: ${componentName}`);
            }

            // Render component
            await this.renderComponent(element, componentData);
            
            // Mark as loaded
            element.setAttribute('data-lazy-loaded', 'true');
            this.observer.unobserve(element);
            
            // Record metrics
            const loadTime = performance.now() - loadStartTime;
            this.recordLoadMetrics(componentName, loadTime);
            
            console.log(`✅ [LAZY-LOADING] Componente carregado: ${componentName} (${loadTime.toFixed(2)}ms)`);

        } catch (error) {
            console.error(`❌ [LAZY-LOADING] Erro ao carregar ${componentName}:`, error);
            this.handleLoadError(element, error);
            this.metrics.errors++;
        } finally {
            this.loadingQueue.delete(componentName);
        }
    }

    /**
     * PRELOAD COMPONENT
     */
    async preloadComponent(element) {
        const componentName = element.getAttribute('data-lazy-component');
        
        if (this.getFromCache(componentName)) {
            return; // Already cached
        }

        try {
            console.log(`🔮 [LAZY-LOADING] Preload: ${componentName}`);
            const componentData = await this.fetchComponent(componentName);
            this.cacheComponent(componentName, componentData);
        } catch (error) {
            console.warn(`⚠️ [LAZY-LOADING] Preload falhou para ${componentName}:`, error);
        }
    }

    /**
     * FETCH COMPONENT
     */
    async fetchComponent(componentName) {
        // Determine component type and source
        const componentConfig = this.getComponentConfig(componentName);
        
        switch (componentConfig.type) {
            case 'widget':
                return await this.fetchWidget(componentConfig);
            case 'chart':
                return await this.fetchChart(componentConfig);
            case 'module':
                return await this.fetchModule(componentConfig);
            default:
                throw new Error(`Tipo de componente desconhecido: ${componentConfig.type}`);
        }
    }

    /**
     * GET COMPONENT CONFIG
     */
    getComponentConfig(componentName) {
        const configs = {
            'dashboard-stats': { type: 'widget', endpoint: '/api/dashboard/stats' },
            'tenant-metrics': { type: 'widget', endpoint: '/api/metrics/tenant' },
            'revenue-chart': { type: 'chart', endpoint: '/api/charts/revenue' },
            'appointments-list': { type: 'widget', endpoint: '/api/appointments/recent' },
            'performance-monitor': { type: 'module', script: '/js/performance/monitor.js' }
        };

        return configs[componentName] || { type: 'widget', endpoint: `/api/components/${componentName}` };
    }

    /**
     * FETCH WIDGET
     */
    async fetchWidget(config) {
        const response = await fetch(config.endpoint);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * FETCH CHART
     */
    async fetchChart(config) {
        const [dataResponse, chartLib] = await Promise.all([
            fetch(config.endpoint),
            this.loadChartLibrary()
        ]);

        if (!dataResponse.ok) {
            throw new Error(`HTTP ${dataResponse.status}: ${dataResponse.statusText}`);
        }

        const data = await dataResponse.json();
        return { data, chartLib };
    }

    /**
     * FETCH MODULE
     */
    async fetchModule(config) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = config.script;
            script.onload = () => resolve({ loaded: true });
            script.onerror = () => reject(new Error(`Failed to load script: ${config.script}`));
            document.head.appendChild(script);
        });
    }

    /**
     * LOAD CHART LIBRARY (if needed)
     */
    async loadChartLibrary() {
        if (window.Chart) {
            return window.Chart;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => resolve(window.Chart);
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }

    /**
     * RENDER COMPONENT
     */
    async renderComponent(element, componentData) {
        const componentName = element.getAttribute('data-lazy-component');
        
        // Show loading state
        element.innerHTML = '<div class="lazy-loading">Carregando...</div>';
        
        // Render based on component type
        switch (componentName) {
            case 'dashboard-stats':
                this.renderDashboardStats(element, componentData);
                break;
            case 'tenant-metrics':
                this.renderTenantMetrics(element, componentData);
                break;
            case 'revenue-chart':
                this.renderRevenueChart(element, componentData);
                break;
            default:
                this.renderGenericComponent(element, componentData);
        }

        // Add fade-in animation
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.3s ease-in-out';
        
        setTimeout(() => {
            element.style.opacity = '1';
        }, 50);
    }

    /**
     * RENDER DASHBOARD STATS
     */
    renderDashboardStats(element, data) {
        element.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Revenue</h3>
                    <p class="stat-value">${data.revenue || '$0'}</p>
                </div>
                <div class="stat-card">
                    <h3>Appointments</h3>
                    <p class="stat-value">${data.appointments || '0'}</p>
                </div>
                <div class="stat-card">
                    <h3>Customers</h3>
                    <p class="stat-value">${data.customers || '0'}</p>
                </div>
            </div>
        `;
    }

    /**
     * RENDER TENANT METRICS
     */
    renderTenantMetrics(element, data) {
        element.innerHTML = `
            <div class="metrics-container">
                <h4>Tenant Performance</h4>
                <div class="metric-item">
                    <span>Active Tenants:</span>
                    <span>${data.activeTenants || 0}</span>
                </div>
                <div class="metric-item">
                    <span>Total Revenue:</span>
                    <span>${data.totalRevenue || '$0'}</span>
                </div>
            </div>
        `;
    }

    /**
     * RENDER REVENUE CHART
     */
    renderRevenueChart(element, { data, chartLib }) {
        const canvas = document.createElement('canvas');
        element.innerHTML = '';
        element.appendChild(canvas);

        new chartLib(canvas, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Revenue Trend'
                    }
                }
            }
        });
    }

    /**
     * RENDER GENERIC COMPONENT
     */
    renderGenericComponent(element, data) {
        if (typeof data === 'string') {
            element.innerHTML = data;
        } else {
            element.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }
    }

    /**
     * CACHE MANAGEMENT
     */
    getFromCache(componentName) {
        const cached = this.componentCache.get(componentName);
        
        if (!cached) return null;
        
        // Check TTL
        if (Date.now() - cached.timestamp > this.config.cacheTTL) {
            this.componentCache.delete(componentName);
            return null;
        }
        
        return cached.data;
    }

    cacheComponent(componentName, data) {
        // Manage cache size
        if (this.componentCache.size >= this.config.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.componentCache.keys().next().value;
            this.componentCache.delete(firstKey);
        }

        this.componentCache.set(componentName, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * SETUP CACHE CLEANUP
     */
    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            
            for (const [key, value] of this.componentCache.entries()) {
                if (now - value.timestamp > this.config.cacheTTL) {
                    this.componentCache.delete(key);
                }
            }
        }, this.config.cacheTTL);

        console.log('🧹 [LAZY-LOADING] Cache cleanup configurado');
    }

    /**
     * ERROR HANDLING
     */
    handleLoadError(element, error) {
        element.innerHTML = `
            <div class="lazy-error">
                <p>⚠️ Erro ao carregar componente</p>
                <button onclick="lazyLoader.retryLoad(this.parentElement.parentElement)">
                    Tentar novamente
                </button>
            </div>
        `;
    }

    /**
     * RETRY LOAD
     */
    retryLoad(element) {
        element.removeAttribute('data-lazy-loaded');
        element.removeAttribute('data-lazy-observed');
        this.observer.observe(element);
    }

    /**
     * METRICS & MONITORING
     */
    recordLoadMetrics(componentName, loadTime) {
        this.metrics.componentsLoaded++;
        this.metrics.loadTimes.push(loadTime);
        
        // Keep only last 100 load times
        if (this.metrics.loadTimes.length > 100) {
            this.metrics.loadTimes = this.metrics.loadTimes.slice(-100);
        }
    }

    getMetrics() {
        const avgLoadTime = this.metrics.loadTimes.length > 0
            ? this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length
            : 0;

        return {
            ...this.metrics,
            avgLoadTime: Math.round(avgLoadTime * 100) / 100,
            cacheHitRate: this.metrics.componentsLoaded > 0 
                ? (this.metrics.cacheHits / this.metrics.componentsLoaded * 100).toFixed(1)
                : 0,
            cacheSize: this.componentCache.size
        };
    }

    /**
     * FALLBACK MODE
     */
    initFallbackMode() {
        console.log('🔄 [LAZY-LOADING] Fallback mode ativo');
        
        // Load all components immediately (fallback)
        document.querySelectorAll('[data-lazy-component]').forEach(element => {
            setTimeout(() => {
                this.loadComponent(element);
            }, 100);
        });
    }

    /**
     * PUBLIC API
     */
    refresh() {
        this.detectLazyElements();
    }

    addElement(element) {
        if (this.observer) {
            this.observer.observe(element);
            element.setAttribute('data-lazy-observed', 'true');
        }
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.componentCache.clear();
        console.log('🛑 [LAZY-LOADING] Sistema destruído');
    }
}

// Auto-initialize and expose globally
window.lazyLoader = new AdvancedLazyLoadingSystem({
    enableMetrics: true,
    cacheTTL: 300000, // 5 minutes
    preloadDistance: 200
});

console.log('🚀 [LAZY-LOADING] Advanced Lazy Loading System pronto!');
console.log('📊 [LAZY-LOADING] Use lazyLoader.getMetrics() para métricas');