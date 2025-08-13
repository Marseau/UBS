/**
 * STANDARDIZED WIDGET SYSTEM
 * Implements standardized widget system with all states (loading, error, refresh, empty)
 */

class StandardizedWidgetSystem {
    constructor() {
        this.widgets = new Map();
        this.autoRefreshInterval = null;
        this.refreshRate = 10000; // 10 seconds
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        
        console.log('🔧 Standardized Widget System initialized');
    }

    /**
     * Register a widget with the system
     */
    registerWidget(widgetId, config) {
        const widget = {
            id: widgetId,
            element: document.getElementById(widgetId),
            type: config.type || 'generic',
            apiEndpoint: config.apiEndpoint,
            refreshable: config.refreshable !== false,
            autoRefresh: config.autoRefresh !== false,
            retryCount: 0,
            lastUpdate: null,
            state: 'idle',
            ...config
        };

        if (!widget.element) {
            console.error(`❌ Widget element not found: ${widgetId}`);
            return false;
        }

        this.widgets.set(widgetId, widget);
        this.setupWidgetStructure(widget);
        
        console.log(`✅ Widget registered: ${widgetId} (${widget.type})`);
        return true;
    }

    /**
     * Setup standardized widget structure
     */
    setupWidgetStructure(widget) {
        const element = widget.element;
        
        // Add widget classes
        element.classList.add('ubs-widget', `ubs-widget-${widget.type}`);
        
        // Create widget header if it doesn't exist
        if (!element.querySelector('.widget-header')) {
            const header = document.createElement('div');
            header.className = 'widget-header';
            header.innerHTML = `
                <h5 class="widget-title">${widget.title || 'Widget'}</h5>
                <div class="widget-controls">
                    ${widget.refreshable ? '<button class="btn btn-sm btn-outline-primary widget-refresh-btn" title="Atualizar"><i class="fas fa-sync"></i></button>' : ''}
                    <div class="widget-status">
                        <span class="widget-status-indicator" title="Status"></span>
                    </div>
                </div>
            `;
            element.insertBefore(header, element.firstChild);
        }

        // Create widget body if it doesn't exist
        if (!element.querySelector('.widget-body')) {
            const body = document.createElement('div');
            body.className = 'widget-body';
            element.appendChild(body);
        }

        // Setup event listeners
        this.setupWidgetEvents(widget);
    }

    /**
     * Setup widget event listeners
     */
    setupWidgetEvents(widget) {
        const refreshBtn = widget.element.querySelector('.widget-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshWidget(widget.id);
            });
        }

        // Add hover effects
        widget.element.addEventListener('mouseenter', () => {
            widget.element.classList.add('widget-hover');
        });

        widget.element.addEventListener('mouseleave', () => {
            widget.element.classList.remove('widget-hover');
        });
    }

    /**
     * Set widget state with visual feedback
     */
    setWidgetState(widgetId, state, message = '') {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        widget.state = state;
        const element = widget.element;
        const statusIndicator = element.querySelector('.widget-status-indicator');
        const refreshBtn = element.querySelector('.widget-refresh-btn');

        // Remove all state classes
        element.classList.remove('widget-loading', 'widget-error', 'widget-empty', 'widget-success');
        
        // Add current state class
        element.classList.add(`widget-${state}`);

        // Update status indicator
        if (statusIndicator) {
            statusIndicator.className = 'widget-status-indicator';
            statusIndicator.classList.add(`status-${state}`);
            statusIndicator.title = message || this.getStateMessage(state);
        }

        // Update refresh button
        if (refreshBtn) {
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.className = state === 'loading' ? 'fas fa-spinner fa-spin' : 'fas fa-sync';
            }
            refreshBtn.disabled = state === 'loading';
        }

        console.log(`🔄 Widget ${widgetId} state: ${state}${message ? ` - ${message}` : ''}`);
    }

    /**
     * Get default state message
     */
    getStateMessage(state) {
        const messages = {
            idle: 'Pronto',
            loading: 'Carregando...',
            success: 'Atualizado',
            error: 'Erro',
            empty: 'Sem dados',
            refreshing: 'Atualizando...'
        };
        return messages[state] || state;
    }

    /**
     * Show loading state
     */
    showLoading(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        this.setWidgetState(widgetId, 'loading');
        const body = widget.element.querySelector('.widget-body');
        
        if (body) {
            body.innerHTML = `
                <div class="widget-loading-state">
                    <div class="loading-skeleton">
                        <div class="loading-bar loading-bar-lg"></div>
                        <div class="loading-bar loading-bar-md"></div>
                        <div class="loading-bar loading-bar-sm"></div>
                    </div>
                    <p class="text-muted text-center mt-3">Carregando dados...</p>
                </div>
            `;
        }
    }

    /**
     * Show error state
     */
    showError(widgetId, error) {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        this.setWidgetState(widgetId, 'error', error.message || 'Erro desconhecido');
        const body = widget.element.querySelector('.widget-body');
        
        if (body) {
            body.innerHTML = `
                <div class="widget-error-state">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h6>Erro ao carregar dados</h6>
                    <p class="text-muted">${error.message || 'Erro desconhecido'}</p>
                    <button class="btn btn-sm btn-outline-primary widget-retry-btn">
                        <i class="fas fa-redo"></i> Tentar novamente
                    </button>
                </div>
            `;

            // Add retry functionality
            const retryBtn = body.querySelector('.widget-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.refreshWidget(widgetId);
                });
            }
        }
    }

    /**
     * Show empty state
     */
    showEmpty(widgetId, message = 'Nenhum dado disponível') {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        this.setWidgetState(widgetId, 'empty', message);
        const body = widget.element.querySelector('.widget-body');
        
        if (body) {
            body.innerHTML = `
                <div class="widget-empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-inbox"></i>
                    </div>
                    <h6>Sem dados</h6>
                    <p class="text-muted">${message}</p>
                    <button class="btn btn-sm btn-outline-primary widget-retry-btn">
                        <i class="fas fa-sync"></i> Atualizar
                    </button>
                </div>
            `;

            // Add retry functionality
            const retryBtn = body.querySelector('.widget-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.refreshWidget(widgetId);
                });
            }
        }
    }

    /**
     * Load widget data
     */
    async loadWidget(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        try {
            this.showLoading(widgetId);
            
            // Call custom load function if provided
            if (widget.loadFunction) {
                const result = await widget.loadFunction(widget);
                
                if (result && result.success) {
                    this.setWidgetState(widgetId, 'success', 'Dados carregados');
                    widget.lastUpdate = new Date();
                    widget.retryCount = 0;
                    
                    // Update widget body with data
                    if (widget.renderFunction) {
                        widget.renderFunction(widget, result.data);
                    }
                } else {
                    throw new Error(result?.error || 'Erro ao carregar dados');
                }
            } else if (widget.apiEndpoint) {
                // Default API loading
                const response = await fetch(widget.apiEndpoint);
                
                if (!response.ok) {
                    throw new Error(`Erro ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data && data.success !== false) {
                    this.setWidgetState(widgetId, 'success', 'Dados carregados');
                    widget.lastUpdate = new Date();
                    widget.retryCount = 0;
                    
                    // Update widget body with data
                    if (widget.renderFunction) {
                        widget.renderFunction(widget, data);
                    }
                } else {
                    throw new Error(data?.error || 'Dados inválidos');
                }
            } else {
                throw new Error('Nenhum endpoint ou função de carregamento definida');
            }
            
        } catch (error) {
            console.error(`❌ Error loading widget ${widgetId}:`, error);
            
            widget.retryCount++;
            
            if (widget.retryCount < this.maxRetries) {
                console.log(`🔄 Retrying widget ${widgetId} (${widget.retryCount}/${this.maxRetries})`);
                setTimeout(() => {
                    this.loadWidget(widgetId);
                }, this.retryDelay);
            } else {
                this.showError(widgetId, error);
            }
        }
    }

    /**
     * Refresh widget
     */
    async refreshWidget(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (!widget) return;

        widget.retryCount = 0;
        await this.loadWidget(widgetId);
    }

    /**
     * Refresh all widgets
     */
    async refreshAllWidgets() {
        console.log('🔄 Refreshing all widgets...');
        
        const promises = Array.from(this.widgets.keys()).map(widgetId => 
            this.refreshWidget(widgetId)
        );
        
        await Promise.allSettled(promises);
        console.log('✅ All widgets refreshed');
    }

    /**
     * Start auto-refresh
     */
    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        this.autoRefreshInterval = setInterval(() => {
            const autoRefreshWidgets = Array.from(this.widgets.values())
                .filter(widget => widget.autoRefresh && widget.state !== 'loading');

            if (autoRefreshWidgets.length > 0) {
                console.log(`🔄 Auto-refreshing ${autoRefreshWidgets.length} widgets`);
                
                autoRefreshWidgets.forEach(widget => {
                    this.refreshWidget(widget.id);
                });
            }
        }, this.refreshRate);

        console.log(`✅ Auto-refresh started (${this.refreshRate}ms)`);
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('🛑 Auto-refresh stopped');
        }
    }

    /**
     * Get widget status
     */
    getWidgetStatus(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (!widget) return null;

        return {
            id: widget.id,
            type: widget.type,
            state: widget.state,
            lastUpdate: widget.lastUpdate,
            retryCount: widget.retryCount,
            isHealthy: widget.state === 'success' && widget.retryCount === 0
        };
    }

    /**
     * Get system status
     */
    getSystemStatus() {
        const widgets = Array.from(this.widgets.values());
        const totalWidgets = widgets.length;
        const healthyWidgets = widgets.filter(w => w.state === 'success').length;
        const loadingWidgets = widgets.filter(w => w.state === 'loading').length;
        const errorWidgets = widgets.filter(w => w.state === 'error').length;

        return {
            totalWidgets,
            healthyWidgets,
            loadingWidgets,
            errorWidgets,
            healthPercentage: totalWidgets > 0 ? (healthyWidgets / totalWidgets * 100).toFixed(1) : 0,
            autoRefreshActive: !!this.autoRefreshInterval,
            refreshRate: this.refreshRate
        };
    }
}

// Global instance
window.ubsWidgetSystem = new StandardizedWidgetSystem();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandardizedWidgetSystem;
}