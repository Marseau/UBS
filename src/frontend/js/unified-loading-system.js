/**
 * UNIFIED LOADING SYSTEM
 * Standardizes loading states across all dashboards
 */

(function() {
    'use strict';

    // Loading states registry
    const loadingStates = new Map();
    
    // Loading animations
    const LOADING_ANIMATIONS = {
        spinner: '<i class="fas fa-spinner fa-spin"></i>',
        dots: '<div class="loading-dots"><span></span><span></span><span></span></div>',
        pulse: '<div class="loading-pulse"></div>',
        skeleton: '<div class="loading-skeleton"></div>'
    };

    // Loading messages
    const LOADING_MESSAGES = {
        default: 'Carregando...',
        kpis: 'Carregando métricas...',
        charts: 'Carregando gráficos...',
        data: 'Carregando dados...',
        authentication: 'Autenticando...',
        saving: 'Salvando...',
        exporting: 'Exportando...',
        refreshing: 'Atualizando...'
    };

    // Unified Loading System
    class UnifiedLoadingSystem {
        constructor() {
            this.activeLoadings = new Set();
            this.initializeCSS();
        }

        // Initialize CSS for loading states
        initializeCSS() {
            if (document.getElementById('unified-loading-styles')) return;

            const style = document.createElement('style');
            style.id = 'unified-loading-styles';
            style.textContent = `
                /* Unified Loading States */
                .loading-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 40px;
                    color: var(--ubs-primary, #2d5a9b);
                }

                .loading-inline {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255, 255, 255, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10;
                }

                .loading-dots {
                    display: inline-flex;
                    gap: 4px;
                }

                .loading-dots span {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: currentColor;
                    animation: loading-dots 1.4s infinite ease-in-out both;
                }

                .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
                .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
                .loading-dots span:nth-child(3) { animation-delay: 0s; }

                @keyframes loading-dots {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }

                .loading-pulse {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: currentColor;
                    animation: loading-pulse 1.5s infinite ease-in-out;
                }

                @keyframes loading-pulse {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.2); }
                }

                .loading-skeleton {
                    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                    background-size: 200% 100%;
                    animation: loading-skeleton 1.5s infinite;
                    border-radius: 4px;
                    height: 20px;
                    width: 100%;
                }

                @keyframes loading-skeleton {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                /* Loading state for different components */
                .metric-card.loading .metric-value {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 40px;
                }

                .chart-widget.loading {
                    position: relative;
                }

                .chart-widget.loading::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255, 255, 255, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1;
                }

                .table-widget.loading tbody {
                    position: relative;
                }

                .table-widget.loading tbody::before {
                    content: '${LOADING_ANIMATIONS.spinner} Carregando dados...';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: var(--ubs-primary, #2d5a9b);
                    z-index: 1;
                }

                /* Responsive loading states */
                @media (max-width: 768px) {
                    .loading-container {
                        min-height: 30px;
                        font-size: 0.9rem;
                    }
                    
                    .loading-overlay {
                        border-radius: 8px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Show loading state
        showLoading(elementId, options = {}) {
            const element = document.getElementById(elementId);
            if (!element) {
                console.warn(`Loading element not found: ${elementId}`);
                return;
            }

            const config = {
                type: options.type || 'spinner',
                message: options.message || LOADING_MESSAGES.default,
                overlay: options.overlay || false,
                inline: options.inline || false,
                ...options
            };

            // Store original content
            if (!element.dataset.originalContent) {
                element.dataset.originalContent = element.innerHTML;
            }

            // Create loading content
            const animation = LOADING_ANIMATIONS[config.type] || LOADING_ANIMATIONS.spinner;
            const loadingHTML = config.inline 
                ? `<span class="loading-inline">${animation} ${config.message}</span>`
                : `<div class="loading-container">${animation} <span class="ms-2">${config.message}</span></div>`;

            if (config.overlay) {
                // Add overlay loading
                element.style.position = 'relative';
                const overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                overlay.innerHTML = `${animation} <span class="ms-2">${config.message}</span>`;
                overlay.dataset.loadingOverlay = elementId;
                element.appendChild(overlay);
            } else {
                // Replace content with loading
                element.innerHTML = loadingHTML;
                element.classList.add('loading');
            }

            // Track active loading
            this.activeLoadings.add(elementId);
            loadingStates.set(elementId, config);

            // Auto-timeout for safety
            if (config.timeout) {
                setTimeout(() => {
                    this.hideLoading(elementId);
                }, config.timeout);
            }

            console.log(`🔄 Loading started: ${elementId}`);
        }

        // Hide loading state
        hideLoading(elementId) {
            const element = document.getElementById(elementId);
            if (!element) return;

            // Remove overlay if exists
            const overlay = element.querySelector(`[data-loading-overlay="${elementId}"]`);
            if (overlay) {
                overlay.remove();
                element.style.position = '';
            } else if (element.dataset.originalContent) {
                // Restore original content
                element.innerHTML = element.dataset.originalContent;
                delete element.dataset.originalContent;
            }

            element.classList.remove('loading');
            this.activeLoadings.delete(elementId);
            loadingStates.delete(elementId);

            console.log(`✅ Loading ended: ${elementId}`);
        }

        // Show loading for multiple elements
        showMultipleLoading(elementIds, options = {}) {
            elementIds.forEach(id => this.showLoading(id, options));
        }

        // Hide loading for multiple elements
        hideMultipleLoading(elementIds) {
            elementIds.forEach(id => this.hideLoading(id));
        }

        // Show loading for KPI cards
        showKPILoading(kpiIds = []) {
            const defaultKPIs = [
                'receitaUsoRatio', 'mrrPlatform', 'activeTenants', 'operationalEfficiency',
                'spamRate', 'cancellationRate', 'totalAppointments', 'aiInteractions',
                // Tenant admin KPIs
                'tenant-appointments', 'tenant-revenue', 'tenant-customers', 'tenant-services',
                'new-customers', 'cancellation-rate', 'avg-session', 'ai-usage'
            ];
            
            const targetKPIs = kpiIds.length > 0 ? kpiIds : defaultKPIs;
            targetKPIs.forEach(id => {
                this.showLoading(id, {
                    type: 'pulse',
                    message: '',
                    inline: true
                });
            });
        }

        // Hide loading for KPI cards
        hideKPILoading(kpiIds = []) {
            const defaultKPIs = [
                'receitaUsoRatio', 'mrrPlatform', 'activeTenants', 'operationalEfficiency',
                'spamRate', 'cancellationRate', 'totalAppointments', 'aiInteractions',
                'tenant-appointments', 'tenant-revenue', 'tenant-customers', 'tenant-services',
                'new-customers', 'cancellation-rate', 'avg-session', 'ai-usage'
            ];
            
            const targetKPIs = kpiIds.length > 0 ? kpiIds : defaultKPIs;
            targetKPIs.forEach(id => this.hideLoading(id));
        }

        // Show loading for charts
        showChartLoading(chartIds = []) {
            const defaultCharts = [
                'revenueVsUsageCostChart', 'appointmentStatusChart', 'appointmentTrendsChart', 'platformRevenueChart',
                'revenueChart', 'customerChart', 'appointmentsChart', 'servicesChart'
            ];
            
            const targetCharts = chartIds.length > 0 ? chartIds : defaultCharts;
            targetCharts.forEach(id => {
                const chartContainer = document.getElementById(id)?.closest('.chart-widget');
                if (chartContainer) {
                    this.showLoading(chartContainer.id || `${id}-container`, {
                        type: 'spinner',
                        message: LOADING_MESSAGES.charts,
                        overlay: true
                    });
                }
            });
        }

        // Hide loading for charts
        hideChartLoading(chartIds = []) {
            const defaultCharts = [
                'revenueVsUsageCostChart', 'appointmentStatusChart', 'appointmentTrendsChart', 'platformRevenueChart',
                'revenueChart', 'customerChart', 'appointmentsChart', 'servicesChart'
            ];
            
            const targetCharts = chartIds.length > 0 ? chartIds : defaultCharts;
            targetCharts.forEach(id => {
                const chartContainer = document.getElementById(id)?.closest('.chart-widget');
                if (chartContainer) {
                    this.hideLoading(chartContainer.id || `${id}-container`);
                }
            });
        }

        // Show page loading
        showPageLoading(message = LOADING_MESSAGES.default) {
            this.showLoading('contentContainer', {
                type: 'spinner',
                message: message,
                overlay: false
            });
        }

        // Hide page loading
        hidePageLoading() {
            this.hideLoading('contentContainer');
        }

        // Get active loadings
        getActiveLoadings() {
            return Array.from(this.activeLoadings);
        }

        // Clear all loadings
        clearAllLoadings() {
            this.activeLoadings.forEach(id => this.hideLoading(id));
            console.log('🧹 All loadings cleared');
        }

        // Check if element is loading
        isLoading(elementId) {
            return this.activeLoadings.has(elementId);
        }
    }

    // Create global instance
    window.unifiedLoadingSystem = new UnifiedLoadingSystem();

    // Backward compatibility aliases
    window.showLoading = (id, options) => window.unifiedLoadingSystem.showLoading(id, options);
    window.hideLoading = (id) => window.unifiedLoadingSystem.hideLoading(id);
    window.showKPILoading = (ids) => window.unifiedLoadingSystem.showKPILoading(ids);
    window.hideKPILoading = (ids) => window.unifiedLoadingSystem.hideKPILoading(ids);

    console.log('✅ Unified Loading System initialized');

})();