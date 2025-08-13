/**
 * UNIFIED DASHBOARD SYSTEM
 * Standardizes loading states, error handling, and navigation across all 3 dashboards
 * 
 * This system provides:
 * - Consistent loading states (skeleton, spinner, pulse, progress)
 * - Unified error handling with recovery mechanisms
 * - Standardized navigation patterns
 * - Mobile-first responsive helpers
 * 
 * @version 1.0.0
 * @author UBS Dashboard Team
 */

class UnifiedDashboardSystem {
    constructor() {
        this.isInitialized = false;
        this.dashboardType = this.detectDashboardType();
        this.loadingStates = new Map();
        this.errorQueue = [];
        this.retryAttempts = new Map();
        
        console.log(`🎯 [UDS] Initializing Unified Dashboard System for: ${this.dashboardType}`);
        
        this.init();
    }
    
    /**
     * Detect which dashboard we're running on
     */
    detectDashboardType() {
        const url = window.location.pathname;
        const title = document.title;
        
        if (url.includes('tenant-admin') || title.includes('Tenant Admin')) {
            return 'tenant-admin';
        } else if (url.includes('standardized') || title.includes('Super Admin')) {
            return 'super-admin';
        } else if (url.includes('business-analytics') || url.includes('tenant-business-analytics') || title.includes('Business Analytics') || title.includes('Análise de Tenant')) {
            return 'business-analytics';
        }
        
        return 'unknown';
    }
    
    /**
     * Initialize the unified system
     */
    init() {
        this.createLoadingTemplates();
        this.initErrorHandler();
        this.setupUnifiedNavigation();
        this.initMobileOptimizations();
        this.setupGlobalEventListeners();
        
        this.isInitialized = true;
        console.log('✅ [UDS] Unified Dashboard System initialized successfully');
    }
    
    /**
     * CREATE STANDARDIZED LOADING TEMPLATES
     */
    createLoadingTemplates() {
        this.loadingTemplates = {
            // KPI Card Loading State
            kpiCard: `
                <div class="unified-loading-state kpi-skeleton">
                    <div class="skeleton-icon"></div>
                    <div class="skeleton-content">
                        <div class="skeleton-line short"></div>
                        <div class="skeleton-line medium"></div>
                    </div>
                </div>
            `,
            
            // Chart Loading State
            chart: `
                <div class="unified-loading-state chart-skeleton">
                    <div class="skeleton-chart">
                        <div class="skeleton-bars">
                            <div class="skeleton-bar" style="height: 60%"></div>
                            <div class="skeleton-bar" style="height: 80%"></div>
                            <div class="skeleton-bar" style="height: 40%"></div>
                            <div class="skeleton-bar" style="height: 90%"></div>
                            <div class="skeleton-bar" style="height: 70%"></div>
                        </div>
                    </div>
                    <div class="skeleton-legend">
                        <div class="skeleton-line short"></div>
                        <div class="skeleton-line short"></div>
                    </div>
                </div>
            `,
            
            // List Loading State
            list: `
                <div class="unified-loading-state list-skeleton">
                    ${Array(3).fill().map(() => `
                        <div class="skeleton-list-item">
                            <div class="skeleton-avatar"></div>
                            <div class="skeleton-content">
                                <div class="skeleton-line medium"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `,
            
            // Button Loading State
            button: `<i class="fas fa-spinner fa-spin me-2"></i>Carregando...`,
            
            // Spinner Only
            spinner: `<div class="unified-loading-state spinner-only"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>`,
            
            // Table Loading State
            table: `
                <div class="unified-loading-state table-skeleton">
                    <div class="skeleton-table-header">
                        ${Array(4).fill().map(() => `<div class="skeleton-th"></div>`).join('')}
                    </div>
                    ${Array(5).fill().map(() => `
                        <div class="skeleton-table-row">
                            ${Array(4).fill().map(() => `<div class="skeleton-td"></div>`).join('')}
                        </div>
                    `).join('')}
                </div>
            `
        };
        
        // Inject loading CSS if not already present
        if (!document.querySelector('#unified-loading-styles')) {
            this.injectLoadingStyles();
        }
    }
    
    /**
     * Inject unified loading styles
     */
    injectLoadingStyles() {
        const style = document.createElement('style');
        style.id = 'unified-loading-styles';
        style.textContent = `
            /* UNIFIED LOADING STATES */
            .unified-loading-state {
                padding: 1rem;
                border-radius: 8px;
                background: #f8f9fa;
            }
            
            .skeleton-loading {
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: skeleton-loading 1.5s infinite;
                border-radius: 4px;
            }
            
            @keyframes skeleton-loading {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            
            /* KPI Card Skeleton */
            .kpi-skeleton {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .skeleton-icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: #e0e0e0;
                animation: skeleton-loading 1.5s infinite;
            }
            
            .skeleton-content {
                flex: 1;
            }
            
            .skeleton-line {
                height: 12px;
                margin-bottom: 8px;
                animation: skeleton-loading 1.5s infinite;
            }
            
            .skeleton-line.short { width: 60%; }
            .skeleton-line.medium { width: 80%; }
            .skeleton-line.long { width: 100%; }
            
            /* Chart Skeleton */
            .chart-skeleton {
                text-align: center;
                padding: 2rem;
            }
            
            .skeleton-bars {
                display: flex;
                align-items: end;
                justify-content: space-around;
                height: 150px;
                margin-bottom: 1rem;
            }
            
            .skeleton-bar {
                width: 30px;
                background: #e0e0e0;
                animation: skeleton-loading 1.5s infinite;
            }
            
            .skeleton-legend {
                display: flex;
                gap: 1rem;
                justify-content: center;
            }
            
            /* List Skeleton */
            .skeleton-list-item {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 0.75rem 0;
                border-bottom: 1px solid #eee;
            }
            
            .skeleton-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #e0e0e0;
                animation: skeleton-loading 1.5s infinite;
            }
            
            /* Table Skeleton */
            .skeleton-table-header {
                display: flex;
                gap: 1rem;
                margin-bottom: 0.5rem;
            }
            
            .skeleton-th {
                height: 16px;
                flex: 1;
                background: #d0d0d0;
                animation: skeleton-loading 1.5s infinite;
            }
            
            .skeleton-table-row {
                display: flex;
                gap: 1rem;
                margin-bottom: 0.5rem;
            }
            
            .skeleton-td {
                height: 12px;
                flex: 1;
                background: #e0e0e0;
                animation: skeleton-loading 1.5s infinite;
            }
            
            /* Spinner Only */
            .spinner-only {
                text-align: center;
                padding: 2rem;
            }
            
            /* Mobile Optimizations */
            @media (max-width: 768px) {
                .unified-loading-state {
                    padding: 0.75rem;
                }
                
                .skeleton-bars {
                    height: 100px;
                }
                
                .skeleton-bar {
                    width: 20px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * UNIFIED ERROR HANDLER
     */
    initErrorHandler() {
        this.errorHandler = {
            types: {
                NETWORK: 'network',
                AUTHENTICATION: 'auth',
                VALIDATION: 'validation',
                SYSTEM: 'system',
                API: 'api'
            },
            
            severities: {
                LOW: 'low',
                MEDIUM: 'medium',
                HIGH: 'high',
                CRITICAL: 'critical'
            },
            
            displayMethods: {
                TOAST: 'toast',
                MODAL: 'modal',
                INLINE: 'inline',
                BANNER: 'banner'
            }
        };
        
        // Global error handler
        window.addEventListener('error', (event) => {
            this.handleError(event.error, {
                type: this.errorHandler.types.SYSTEM,
                context: 'global_error_handler'
            });
        });
        
        // Promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, {
                type: this.errorHandler.types.SYSTEM,
                context: 'unhandled_promise_rejection'
            });
        });
    }
    
    /**
     * Handle errors with unified approach
     */
    handleError(error, options = {}) {
        const errorInfo = this.parseError(error, options);
        const displayMethod = this.selectDisplayMethod(errorInfo.severity);
        
        // Log error consistently
        this.logError(errorInfo);
        
        // Display error based on type and severity
        this.displayError(errorInfo, displayMethod);
        
        // Setup recovery if applicable
        if (errorInfo.recoverable) {
            this.setupRecovery(errorInfo);
        }
        
        return errorInfo;
    }
    
    /**
     * Parse error into standardized format
     */
    parseError(error, options = {}) {
        const errorInfo = {
            id: this.generateErrorId(),
            timestamp: new Date().toISOString(),
            type: options.type || this.errorHandler.types.SYSTEM,
            severity: options.severity || this.errorHandler.severities.MEDIUM,
            message: error?.message || error || 'Erro desconhecido',
            context: options.context || 'unknown',
            recoverable: options.recoverable !== false,
            originalError: error,
            dashboardType: this.dashboardType
        };
        
        // Determine severity based on error type
        if (errorInfo.type === this.errorHandler.types.NETWORK) {
            errorInfo.severity = this.errorHandler.severities.HIGH;
        } else if (errorInfo.type === this.errorHandler.types.AUTHENTICATION) {
            errorInfo.severity = this.errorHandler.severities.CRITICAL;
        }
        
        return errorInfo;
    }
    
    /**
     * Select appropriate display method based on severity
     */
    selectDisplayMethod(severity) {
        switch (severity) {
            case this.errorHandler.severities.CRITICAL:
                return this.errorHandler.displayMethods.MODAL;
            case this.errorHandler.severities.HIGH:
                return this.errorHandler.displayMethods.BANNER;
            case this.errorHandler.severities.MEDIUM:
                return this.errorHandler.displayMethods.TOAST;
            default:
                return this.errorHandler.displayMethods.INLINE;
        }
    }
    
    /**
     * Display error using selected method
     */
    displayError(errorInfo, displayMethod) {
        switch (displayMethod) {
            case this.errorHandler.displayMethods.TOAST:
                this.showToast(errorInfo);
                break;
            case this.errorHandler.displayMethods.MODAL:
                this.showModal(errorInfo);
                break;
            case this.errorHandler.displayMethods.BANNER:
                this.showBanner(errorInfo);
                break;
            case this.errorHandler.displayMethods.INLINE:
                this.showInline(errorInfo);
                break;
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(errorInfo) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('unified-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'unified-toast-container';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.innerHTML = `
            <div class="toast-header bg-danger text-white">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong class="me-auto">Erro</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${errorInfo.message}
                ${errorInfo.recoverable ? `<div class="mt-2"><button class="btn btn-sm btn-outline-primary" onclick="unifiedDashboardSystem.retryFromError('${errorInfo.id}')">Tentar Novamente</button></div>` : ''}
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }
    
    /**
     * Show error modal
     */
    showModal(errorInfo) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-exclamation-circle me-2"></i>
                            Erro Crítico
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${errorInfo.message}</p>
                        <small class="text-muted">ID do Erro: ${errorInfo.id}</small>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        ${errorInfo.recoverable ? `<button type="button" class="btn btn-primary" onclick="unifiedDashboardSystem.retryFromError('${errorInfo.id}'); bootstrap.Modal.getInstance(this.closest('.modal')).hide();">Tentar Novamente</button>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        
        // Clean up when modal is hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }
    
    /**
     * Show banner error
     */
    showBanner(errorInfo) {
        // Remove existing banners
        const existingBanners = document.querySelectorAll('.unified-error-banner');
        existingBanners.forEach(banner => banner.remove());
        
        const banner = document.createElement('div');
        banner.className = 'unified-error-banner alert alert-danger alert-dismissible fade show';
        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 9998; margin: 0; border-radius: 0;';
        banner.innerHTML = `
            <div class="container">
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <span class="flex-grow-1">${errorInfo.message}</span>
                    ${errorInfo.recoverable ? `<button class="btn btn-outline-dark btn-sm me-2" onclick="unifiedDashboardSystem.retryFromError('${errorInfo.id}')">Tentar Novamente</button>` : ''}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            </div>
        `;
        
        document.body.insertBefore(banner, document.body.firstChild);
        
        // Adjust main content padding
        document.body.style.paddingTop = banner.offsetHeight + 'px';
        
        // Clean up when banner is dismissed
        banner.addEventListener('closed.bs.alert', () => {
            document.body.style.paddingTop = '';
        });
    }
    
    /**
     * Log error consistently
     */
    logError(errorInfo) {
        console.group(`🚨 [UDS Error] ${errorInfo.type.toUpperCase()} - ${errorInfo.severity.toUpperCase()}`);
        console.error('Message:', errorInfo.message);
        console.error('Context:', errorInfo.context);
        console.error('Dashboard:', errorInfo.dashboardType);
        console.error('Timestamp:', errorInfo.timestamp);
        console.error('ID:', errorInfo.id);
        if (errorInfo.originalError) {
            console.error('Original Error:', errorInfo.originalError);
        }
        console.groupEnd();
        
        // Store error for analytics
        this.errorQueue.push(errorInfo);
        
        // Keep only last 50 errors
        if (this.errorQueue.length > 50) {
            this.errorQueue = this.errorQueue.slice(-50);
        }
    }
    
    /**
     * Generate unique error ID
     */
    generateErrorId() {
        return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Setup error recovery
     */
    setupRecovery(errorInfo) {
        // Store error for retry
        this.retryAttempts.set(errorInfo.id, {
            errorInfo,
            attempts: 0,
            maxAttempts: 3
        });
    }
    
    /**
     * Retry from error
     */
    retryFromError(errorId) {
        const retryInfo = this.retryAttempts.get(errorId);
        if (!retryInfo) {
            console.warn('❌ [UDS] No retry info found for error:', errorId);
            return;
        }
        
        retryInfo.attempts++;
        
        if (retryInfo.attempts > retryInfo.maxAttempts) {
            this.showToast({
                message: 'Máximo de tentativas excedido. Recarregue a página.',
                severity: this.errorHandler.severities.HIGH
            });
            return;
        }
        
        console.log(`🔄 [UDS] Retrying error ${errorId} (attempt ${retryInfo.attempts}/${retryInfo.maxAttempts})`);
        
        // Trigger page reload for critical errors
        if (retryInfo.errorInfo.severity === this.errorHandler.severities.CRITICAL) {
            window.location.reload();
            return;
        }
        
        // For other errors, try to reload widgets or specific components
        if (window.dashboardWidgetSystem && typeof window.dashboardWidgetSystem.refreshAllWidgets === 'function') {
            window.dashboardWidgetSystem.refreshAllWidgets();
        } else {
            // Fallback: reload page
            window.location.reload();
        }
    }
    
    /**
     * LOADING STATE MANAGEMENT
     */
    showLoading(containerId, type = 'spinner') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`❌ [UDS] Container not found: ${containerId}`);
            return;
        }
        
        const template = this.loadingTemplates[type] || this.loadingTemplates.spinner;
        container.innerHTML = template;
        
        this.loadingStates.set(containerId, {
            type,
            startTime: Date.now(),
            originalContent: container.innerHTML
        });
        
        console.log(`⏳ [UDS] Loading state applied to ${containerId} (type: ${type})`);
    }
    
    /**
     * Hide loading state
     */
    hideLoading(containerId, content = null) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`❌ [UDS] Container not found: ${containerId}`);
            return;
        }
        
        const loadingInfo = this.loadingStates.get(containerId);
        if (loadingInfo) {
            const duration = Date.now() - loadingInfo.startTime;
            console.log(`✅ [UDS] Loading completed for ${containerId} (${duration}ms)`);
            this.loadingStates.delete(containerId);
        }
        
        if (content) {
            container.innerHTML = content;
        }
    }
    
    /**
     * UNIFIED NAVIGATION SETUP
     */
    setupUnifiedNavigation() {
        // This will be implemented to standardize navigation across dashboards
        console.log('🧭 [UDS] Setting up unified navigation patterns');
        
        // Ensure consistent sidebar behavior
        this.standardizeSidebar();
        
        // Ensure consistent mobile navigation
        this.standardizeMobileNavigation();
    }
    
    /**
     * Standardize sidebar behavior
     */
    standardizeSidebar() {
        const sidebar = document.querySelector('.sidebar, #sidebar');
        if (!sidebar) return;
        
        // Add unified classes
        sidebar.classList.add('unified-sidebar');
        
        // Ensure consistent toggle behavior
        const toggleButtons = document.querySelectorAll('.sidebar-toggle, [data-bs-toggle="sidebar"]');
        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                sidebar.classList.toggle('sidebar-collapsed');
                
                // Save state
                localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('sidebar-collapsed'));
            });
        });
        
        // Restore sidebar state
        const savedState = localStorage.getItem('sidebar-collapsed');
        if (savedState === 'true') {
            sidebar.classList.add('sidebar-collapsed');
        }
    }
    
    /**
     * Standardize mobile navigation
     */
    standardizeMobileNavigation() {
        const sidebar = document.querySelector('.sidebar, #sidebar');
        if (!sidebar) return;
        
        // Create mobile overlay if it doesn't exist
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }
        
        // Mobile toggle functionality
        const mobileToggle = document.querySelector('.mobile-toggle, .navbar-toggler');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                sidebar.classList.toggle('mobile-open');
                overlay.classList.toggle('show');
            });
        }
        
        // Close on overlay click
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('show');
        });
    }
    
    /**
     * MOBILE OPTIMIZATIONS
     */
    initMobileOptimizations() {
        console.log('📱 [UDS] Initializing mobile optimizations');
        
        // Add mobile-specific CSS if not present
        if (!document.querySelector('#unified-mobile-styles')) {
            this.injectMobileStyles();
        }
        
        // Setup touch optimizations
        this.setupTouchOptimizations();
        
        // Setup viewport optimizations
        this.setupViewportOptimizations();
    }
    
    /**
     * Inject mobile-specific styles
     */
    injectMobileStyles() {
        const style = document.createElement('style');
        style.id = 'unified-mobile-styles';
        style.textContent = `
            /* UNIFIED MOBILE STYLES */
            @media (max-width: 768px) {
                .unified-sidebar {
                    transform: translateX(-100%);
                    transition: transform 0.3s ease;
                    position: fixed;
                    top: 0;
                    left: 0;
                    height: 100vh;
                    z-index: 1050;
                    width: 280px;
                }
                
                .unified-sidebar.mobile-open {
                    transform: translateX(0);
                }
                
                .sidebar-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 1040;
                }
                
                .sidebar-overlay.show {
                    display: block;
                }
                
                /* Touch-friendly buttons */
                .btn, .nav-link, .fab {
                    min-height: 44px;
                    min-width: 44px;
                }
                
                /* Improved text sizing for mobile */
                .card-title {
                    font-size: 1.1rem;
                }
                
                .card-text {
                    font-size: 0.9rem;
                }
                
                /* Better spacing for mobile */
                .container-fluid {
                    padding-left: 1rem;
                    padding-right: 1rem;
                }
                
                .card {
                    margin-bottom: 1rem;
                }
            }
            
            /* Touch optimizations for all screen sizes */
            .touch-friendly {
                min-height: 44px;
                min-width: 44px;
                padding: 12px;
            }
            
            /* Improved form inputs for mobile */
            @media (max-width: 768px) {
                .form-control, .form-select {
                    font-size: 16px; /* Prevents zoom on iOS */
                    min-height: 44px;
                }
                
                .input-group-text {
                    min-height: 44px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Setup touch optimizations
     */
    setupTouchOptimizations() {
        // Add touch-friendly classes to interactive elements
        const interactiveElements = document.querySelectorAll('button, .nav-link, .btn, .card-clickable');
        interactiveElements.forEach(element => {
            element.classList.add('touch-friendly');
        });
        
        // Improve touch feedback
        document.addEventListener('touchstart', function() {}, {passive: true});
    }
    
    /**
     * Setup viewport optimizations
     */
    setupViewportOptimizations() {
        // Ensure proper viewport meta tag
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
            document.head.appendChild(viewport);
        }
        
        // Prevent zoom on input focus (iOS)
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (!input.style.fontSize) {
                input.style.fontSize = '16px';
            }
        });
    }
    
    /**
     * GLOBAL EVENT LISTENERS
     */
    setupGlobalEventListeners() {
        // Handle API call errors consistently
        document.addEventListener('apiError', (event) => {
            this.handleError(event.detail.error, {
                type: this.errorHandler.types.API,
                context: event.detail.context || 'api_call'
            });
        });
        
        // Handle network errors
        window.addEventListener('online', () => {
            console.log('✅ [UDS] Network connection restored');
            this.showToast({
                message: 'Conexão restaurada',
                severity: this.errorHandler.severities.LOW
            });
        });
        
        window.addEventListener('offline', () => {
            console.log('❌ [UDS] Network connection lost');
            this.handleError('Conexão perdida', {
                type: this.errorHandler.types.NETWORK,
                severity: this.errorHandler.severities.HIGH,
                recoverable: false
            });
        });
    }
    
    /**
     * PUBLIC UTILITY METHODS
     */
    
    /**
     * Show standardized loading for any element
     */
    setLoading(elementId, type = 'spinner') {
        this.showLoading(elementId, type);
    }
    
    /**
     * Hide loading for any element
     */
    clearLoading(elementId, content = null) {
        this.hideLoading(elementId, content);
    }
    
    /**
     * Show standardized error
     */
    showError(message, options = {}) {
        this.handleError(message, options);
    }
    
    /**
     * Get dashboard type
     */
    getDashboardType() {
        return this.dashboardType;
    }
    
    /**
     * Check if system is initialized
     */
    isReady() {
        return this.isInitialized;
    }
    
    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            totalErrors: this.errorQueue.length,
            recentErrors: this.errorQueue.slice(-10),
            errorsByType: this.errorQueue.reduce((acc, error) => {
                acc[error.type] = (acc[error.type] || 0) + 1;
                return acc;
            }, {}),
            errorsBySeverity: this.errorQueue.reduce((acc, error) => {
                acc[error.severity] = (acc[error.severity] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

// Initialize the unified system when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.unifiedDashboardSystem = new UnifiedDashboardSystem();
    });
} else {
    window.unifiedDashboardSystem = new UnifiedDashboardSystem();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedDashboardSystem;
}