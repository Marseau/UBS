/**
 * ADVANCED LAZY LOADING SYSTEM
 * Carregamento inteligente de widgets e componentes
 * Target: <0.1ms initial load
 */

class LazyLoader {
    constructor() {
        this.loadedModules = new Map();
        this.observer = null;
        this.loadQueue = new Set();
        this.criticalComponents = new Set(['dashboard-stats', 'navigation', 'auth-check']);
        this.performanceMetrics = {
            loadTimes: new Map(),
            totalComponents: 0,
            lazyComponents: 0,
            criticalComponents: 0
        };
        
        this.init();
    }

    /**
     * Inicializar sistema de lazy loading
     */
    init() {
        console.log('⚡ Initializing Advanced Lazy Loader...');
        
        // Configurar Intersection Observer para lazy loading
        this.setupIntersectionObserver();
        
        // Preload críticos
        this.preloadCriticalComponents();
        
        // Setup performance monitoring
        this.setupPerformanceMonitoring();
        
        // Register service worker for caching
        this.registerServiceWorker();
        
        console.log('✅ Lazy Loader initialized');
    }

    /**
     * Configurar Intersection Observer
     */
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '100px', // Load 100px before visible
            threshold: 0.1
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadComponent(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }, options);
    }

    /**
     * Registrar componente para lazy loading
     */
    registerLazyComponent(element, modulePath, options = {}) {
        const componentId = element.id || `lazy-${Date.now()}`;
        
        // Verificar se é componente crítico
        const isCritical = this.criticalComponents.has(componentId) || options.critical;
        
        if (isCritical) {
            // Carregar imediatamente se crítico
            this.loadComponent(element, modulePath);
            this.performanceMetrics.criticalComponents++;
        } else {
            // Adicionar ao observer para lazy loading
            element.dataset.lazyModule = modulePath;
            element.dataset.lazyOptions = JSON.stringify(options);
            this.observer.observe(element);
            this.performanceMetrics.lazyComponents++;
        }
        
        this.performanceMetrics.totalComponents++;
        
        return componentId;
    }

    /**
     * Carregar componente dinamicamente
     */
    async loadComponent(element, modulePath = null) {
        const startTime = performance.now();
        const path = modulePath || element.dataset.lazyModule;
        const options = element.dataset.lazyOptions ? 
            JSON.parse(element.dataset.lazyOptions) : {};

        if (!path) {
            console.warn('⚠️ No module path specified for lazy component');
            return;
        }

        try {
            // Verificar se já está carregado
            if (this.loadedModules.has(path)) {
                const module = this.loadedModules.get(path);
                await this.initializeComponent(element, module, options);
                return;
            }

            // Mostrar loading indicator
            this.showLoadingIndicator(element);

            // Carregar módulo dinamicamente
            const module = await this.dynamicImport(path);
            this.loadedModules.set(path, module);

            // Inicializar componente
            await this.initializeComponent(element, module, options);

            // Remover loading indicator
            this.hideLoadingIndicator(element);

            // Registrar performance
            const loadTime = performance.now() - startTime;
            this.performanceMetrics.loadTimes.set(path, loadTime);
            
            console.log(`⚡ Loaded ${path} in ${loadTime.toFixed(2)}ms`);

        } catch (error) {
            console.error(`❌ Failed to load component ${path}:`, error);
            this.showErrorIndicator(element, error);
        }
    }

    /**
     * Dynamic import com fallback
     */
    async dynamicImport(path) {
        try {
            // Tentar import ES6 module
            const module = await import(path);
            return module;
        } catch (error) {
            // Fallback para script tag
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = path;
                script.onload = () => {
                    // Assumir que módulo foi carregado globalmente
                    const moduleName = path.split('/').pop().replace('.js', '');
                    resolve(window[moduleName] || {});
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }

    /**
     * Inicializar componente carregado
     */
    async initializeComponent(element, module, options) {
        try {
            // Verificar diferentes padrões de exportação
            const Component = module.default || module[Object.keys(module)[0]] || module;
            
            if (typeof Component === 'function') {
                // Componente como classe/função
                const instance = new Component(element, options);
                if (instance.init && typeof instance.init === 'function') {
                    await instance.init();
                }
            } else if (typeof Component === 'object' && Component.init) {
                // Componente como objeto com init
                await Component.init(element, options);
            } else {
                // Executar função de inicialização padrão
                if (window.initializeComponent) {
                    await window.initializeComponent(element, module, options);
                }
            }
            
            // Marcar como carregado
            element.classList.add('lazy-loaded');
            element.removeAttribute('data-lazy-module');
            
        } catch (error) {
            console.error('❌ Failed to initialize component:', error);
            throw error;
        }
    }

    /**
     * Preload componentes críticos
     */
    async preloadCriticalComponents() {
        const criticalPaths = [
            '/dist/js/auth-guard.min.js',
            '/dist/js/utils-bundle.min.js'
        ];

        const preloadPromises = criticalPaths.map(async (path) => {
            try {
                await this.dynamicImport(path);
                console.log(`✅ Preloaded critical: ${path}`);
            } catch (error) {
                console.warn(`⚠️ Failed to preload ${path}:`, error);
            }
        });

        await Promise.allSettled(preloadPromises);
    }

    /**
     * Mostrar indicador de loading
     */
    showLoadingIndicator(element) {
        const indicator = document.createElement('div');
        indicator.className = 'lazy-loading-indicator';
        indicator.innerHTML = `
            <div class="spinner-border spinner-border-sm" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        `;
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 1000;
        `;
        
        element.style.position = 'relative';
        element.appendChild(indicator);
    }

    /**
     * Esconder indicador de loading
     */
    hideLoadingIndicator(element) {
        const indicator = element.querySelector('.lazy-loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Mostrar indicador de erro
     */
    showErrorIndicator(element, error) {
        this.hideLoadingIndicator(element);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'lazy-error-indicator alert alert-warning';
        errorDiv.innerHTML = `
            <small>⚠️ Component failed to load. <a href="#" onclick="location.reload()">Reload page</a></small>
        `;
        
        element.appendChild(errorDiv);
    }

    /**
     * Preload recurso específico
     */
    preloadResource(url, type = 'script') {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = type;
            link.href = url;
            link.onload = resolve;
            link.onerror = reject;
            
            document.head.appendChild(link);
        });
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Monitor Web Vitals
        if ('web-vital' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    console.log(`📊 ${entry.name}: ${entry.value.toFixed(2)}ms`);
                });
            });
            
            observer.observe({ entryTypes: ['measure'] });
        }

        // Monitor resource loading
        window.addEventListener('load', () => {
            const loadTime = performance.now();
            console.log(`🎯 Page fully loaded in: ${loadTime.toFixed(2)}ms`);
            
            // Verificar se atingiu target <0.1ms para componentes críticos
            const criticalLoadTime = Math.max(...Array.from(this.performanceMetrics.loadTimes.values()));
            if (criticalLoadTime < 0.1) {
                console.log('🏆 TARGET ACHIEVED: <0.1ms load time!');
            }
        });
    }

    /**
     * Registrar Service Worker para cache
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('✅ Service Worker registered:', registration);
            } catch (error) {
                console.warn('⚠️ Service Worker registration failed:', error);
            }
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            averageLoadTime: Array.from(this.performanceMetrics.loadTimes.values())
                .reduce((sum, time) => sum + time, 0) / this.performanceMetrics.loadTimes.size,
            lazyPercentage: (this.performanceMetrics.lazyComponents / this.performanceMetrics.totalComponents) * 100
        };
    }

    /**
     * Force load all pending components
     */
    async loadAllPending() {
        const lazyElements = document.querySelectorAll('[data-lazy-module]');
        const loadPromises = Array.from(lazyElements).map(element => 
            this.loadComponent(element)
        );
        
        await Promise.allSettled(loadPromises);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.loadedModules.clear();
        this.loadQueue.clear();
    }
}

// Export para uso global
window.LazyLoader = LazyLoader;

// Auto-inicializar se DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.lazyLoader = new LazyLoader();
    });
} else {
    window.lazyLoader = new LazyLoader();
}