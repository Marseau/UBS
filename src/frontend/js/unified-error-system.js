/**
 * UNIFIED ERROR HANDLING SYSTEM
 * Standardizes error handling patterns across all dashboards
 */

(function() {
    'use strict';

    // Error types
    const ERROR_TYPES = {
        API: 'api',
        NETWORK: 'network',
        AUTH: 'authentication',
        VALIDATION: 'validation',
        TIMEOUT: 'timeout',
        UNKNOWN: 'unknown'
    };

    // Error severity levels
    const SEVERITY_LEVELS = {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
    };

    // Error messages
    const ERROR_MESSAGES = {
        [ERROR_TYPES.API]: 'Erro na comunicação com o servidor',
        [ERROR_TYPES.NETWORK]: 'Erro de conexão. Verifique sua internet',
        [ERROR_TYPES.AUTH]: 'Erro de autenticação. Faça login novamente',
        [ERROR_TYPES.VALIDATION]: 'Dados inválidos. Verifique as informações',
        [ERROR_TYPES.TIMEOUT]: 'Operação demorou muito. Tente novamente',
        [ERROR_TYPES.UNKNOWN]: 'Erro inesperado. Tente novamente'
    };

    // Unified Error System
    class UnifiedErrorSystem {
        constructor() {
            this.errorLog = [];
            this.errorCallbacks = new Map();
            this.initializeCSS();
            this.initializeGlobalHandlers();
        }

        // Initialize CSS for error states
        initializeCSS() {
            if (document.getElementById('unified-error-styles')) return;

            const style = document.createElement('style');
            style.id = 'unified-error-styles';
            style.textContent = `
                /* Unified Error States */
                .error-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 60px;
                    padding: 1rem;
                    text-align: center;
                }

                .error-inline {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--bs-danger, #dc3545);
                }

                .error-card {
                    background: #fff5f5;
                    border: 1px solid #fed7d7;
                    border-radius: 8px;
                    padding: 1rem;
                    margin: 0.5rem 0;
                }

                .error-card.severity-low {
                    background: #fffbf0;
                    border-color: #feebc8;
                    color: #744210;
                }

                .error-card.severity-medium {
                    background: #fff5f5;
                    border-color: #fed7d7;
                    color: #742a2a;
                }

                .error-card.severity-high {
                    background: #fff5f5;
                    border-color: #feb2b2;
                    color: #742a2a;
                }

                .error-card.severity-critical {
                    background: #fed7d7;
                    border-color: #fc8181;
                    color: #742a2a;
                    font-weight: 600;
                }

                .error-icon {
                    font-size: 1.2em;
                    margin-right: 0.5rem;
                }

                .error-message {
                    flex: 1;
                }

                .error-actions {
                    margin-top: 0.75rem;
                    display: flex;
                    gap: 0.5rem;
                    justify-content: center;
                }

                .error-dismiss {
                    background: none;
                    border: none;
                    color: currentColor;
                    opacity: 0.7;
                    cursor: pointer;
                    padding: 0.25rem;
                }

                .error-dismiss:hover {
                    opacity: 1;
                }

                .error-toast {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1050;
                    min-width: 300px;
                    max-width: 500px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transform: translateX(100%);
                    transition: transform 0.3s ease;
                }

                .error-toast.show {
                    transform: translateX(0);
                }

                .error-toast-header {
                    display: flex;
                    align-items: center;
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #e2e8f0;
                }

                .error-toast-body {
                    padding: 1rem;
                }

                /* Metric card error state */
                .metric-card.error {
                    border-color: #fed7d7;
                    background: #fff5f5;
                }

                .metric-card.error .metric-value {
                    color: var(--bs-danger, #dc3545);
                }

                /* Chart error state */
                .chart-widget.error {
                    border-color: #fed7d7;
                }

                .chart-widget.error .chart-body::before {
                    content: '⚠️ Erro ao carregar gráfico';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: var(--bs-danger, #dc3545);
                    font-weight: 500;
                    z-index: 1;
                }

                /* Table error state */
                .table-widget.error tbody::before {
                    content: '⚠️ Erro ao carregar dados';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: var(--bs-danger, #dc3545);
                    z-index: 1;
                }

                /* Global error overlay */
                .global-error-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                }

                .global-error-modal {
                    background: white;
                    border-radius: 12px;
                    padding: 2rem;
                    max-width: 500px;
                    margin: 1rem;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }

                /* Responsive adjustments */
                @media (max-width: 768px) {
                    .error-toast {
                        left: 20px;
                        right: 20px;
                        min-width: auto;
                        transform: translateY(-100%);
                    }
                    
                    .error-toast.show {
                        transform: translateY(0);
                    }

                    .error-actions {
                        flex-direction: column;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Initialize global error handlers
        initializeGlobalHandlers() {
            // Global unhandled promise rejection
            window.addEventListener('unhandledrejection', (event) => {
                console.error('Unhandled promise rejection:', event.reason);
                this.handleError(event.reason, ERROR_TYPES.UNKNOWN, SEVERITY_LEVELS.HIGH);
            });

            // Global error handler
            window.addEventListener('error', (event) => {
                console.error('Global error:', event.error);
                this.handleError(event.error, ERROR_TYPES.UNKNOWN, SEVERITY_LEVELS.MEDIUM);
            });
        }

        // Main error handling method
        handleError(error, type = ERROR_TYPES.UNKNOWN, severity = SEVERITY_LEVELS.MEDIUM, context = {}) {
            const errorObj = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                error: error,
                type: type,
                severity: severity,
                context: context,
                message: this.getErrorMessage(error, type),
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            // Log error
            this.errorLog.push(errorObj);
            console.error('🚨 Error handled:', errorObj);

            // Execute callbacks
            if (this.errorCallbacks.has(type)) {
                this.errorCallbacks.get(type).forEach(callback => {
                    try {
                        callback(errorObj);
                    } catch (callbackError) {
                        console.error('Error in error callback:', callbackError);
                    }
                });
            }

            // Show error based on severity
            this.showError(errorObj);

            return errorObj.id;
        }

        // Get error message
        getErrorMessage(error, type) {
            if (error && error.message) {
                return error.message;
            }
            
            if (typeof error === 'string') {
                return error;
            }

            return ERROR_MESSAGES[type] || ERROR_MESSAGES[ERROR_TYPES.UNKNOWN];
        }

        // Show error to user
        showError(errorObj) {
            switch (errorObj.severity) {
                case SEVERITY_LEVELS.LOW:
                    this.showInlineError(errorObj);
                    break;
                case SEVERITY_LEVELS.MEDIUM:
                    this.showToastError(errorObj);
                    break;
                case SEVERITY_LEVELS.HIGH:
                    this.showCardError(errorObj);
                    break;
                case SEVERITY_LEVELS.CRITICAL:
                    this.showModalError(errorObj);
                    break;
            }
        }

        // Show inline error
        showInlineError(errorObj, elementId = null) {
            const message = `<span class="error-inline"><i class="fas fa-exclamation-triangle error-icon"></i>${errorObj.message}</span>`;
            
            if (elementId) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = message;
                    element.classList.add('error');
                }
            }
        }

        // Show toast error
        showToastError(errorObj) {
            const toast = document.createElement('div');
            toast.className = 'error-toast';
            toast.innerHTML = `
                <div class="error-toast-header severity-${errorObj.severity}">
                    <i class="fas fa-exclamation-triangle error-icon"></i>
                    <strong class="me-auto">Erro</strong>
                    <button type="button" class="error-dismiss" onclick="this.closest('.error-toast').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="error-toast-body">
                    ${errorObj.message}
                </div>
            `;

            document.body.appendChild(toast);

            // Show toast with animation
            setTimeout(() => toast.classList.add('show'), 100);

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }
            }, 5000);
        }

        // Show card error
        showCardError(errorObj, elementId = 'contentContainer') {
            const container = document.getElementById(elementId);
            if (!container) return;

            const errorCard = document.createElement('div');
            errorCard.className = `error-card severity-${errorObj.severity}`;
            errorCard.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle error-icon"></i>
                    <div class="error-message">
                        <strong>Erro:</strong> ${errorObj.message}
                    </div>
                    <button type="button" class="error-dismiss" onclick="this.closest('.error-card').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="error-actions">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.location.reload()">
                        <i class="fas fa-sync me-1"></i>Recarregar Página
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="this.closest('.error-card').remove()">
                        Fechar
                    </button>
                </div>
            `;

            container.insertBefore(errorCard, container.firstChild);
        }

        // Show modal error
        showModalError(errorObj) {
            const modal = document.createElement('div');
            modal.className = 'global-error-overlay';
            modal.innerHTML = `
                <div class="global-error-modal">
                    <div class="mb-3">
                        <i class="fas fa-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
                    </div>
                    <h4>Erro Crítico</h4>
                    <p class="mb-4">${errorObj.message}</p>
                    <div class="d-flex gap-2 justify-content-center">
                        <button type="button" class="btn btn-primary" onclick="window.location.reload()">
                            <i class="fas fa-sync me-2"></i>Recarregar Página
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.global-error-overlay').remove()">
                            Fechar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.remove();
                }
            }, 10000);
        }

        // Show error in specific element
        showElementError(elementId, message, severity = SEVERITY_LEVELS.MEDIUM) {
            const element = document.getElementById(elementId);
            if (!element) return;

            const errorObj = {
                message: message,
                severity: severity,
                type: ERROR_TYPES.UNKNOWN
            };

            element.classList.add('error');
            
            if (severity === SEVERITY_LEVELS.LOW) {
                this.showInlineError(errorObj, elementId);
            } else {
                element.innerHTML = `
                    <div class="error-container">
                        <i class="fas fa-exclamation-triangle error-icon text-danger"></i>
                        <span>${message}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary ms-2" onclick="window.location.reload()">
                            <i class="fas fa-sync"></i>
                        </button>
                    </div>
                `;
            }
        }

        // Handle API errors
        handleApiError(response, context = {}) {
            let errorType = ERROR_TYPES.API;
            let severity = SEVERITY_LEVELS.MEDIUM;
            let message = 'Erro na comunicação com o servidor';

            if (response.status === 401 || response.status === 403) {
                errorType = ERROR_TYPES.AUTH;
                severity = SEVERITY_LEVELS.HIGH;
                message = 'Erro de autenticação. Faça login novamente';
            } else if (response.status >= 500) {
                severity = SEVERITY_LEVELS.HIGH;
                message = 'Erro interno do servidor';
            } else if (response.status === 404) {
                message = 'Recurso não encontrado';
            } else if (response.status === 408) {
                errorType = ERROR_TYPES.TIMEOUT;
                message = 'Tempo limite esgotado';
            }

            return this.handleError(
                new Error(`${message} (${response.status})`),
                errorType,
                severity,
                { ...context, status: response.status, statusText: response.statusText }
            );
        }

        // Handle network errors
        handleNetworkError(error, context = {}) {
            return this.handleError(
                error,
                ERROR_TYPES.NETWORK,
                SEVERITY_LEVELS.HIGH,
                context
            );
        }

        // Clear errors
        clearErrors(elementId = null) {
            if (elementId) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.classList.remove('error');
                    const errorCards = element.querySelectorAll('.error-card');
                    errorCards.forEach(card => card.remove());
                }
            } else {
                // Clear all errors
                document.querySelectorAll('.error-card, .error-toast, .global-error-overlay').forEach(el => el.remove());
                document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
            }
        }

        // Register error callback
        onError(type, callback) {
            if (!this.errorCallbacks.has(type)) {
                this.errorCallbacks.set(type, []);
            }
            this.errorCallbacks.get(type).push(callback);
        }

        // Get error log
        getErrorLog() {
            return [...this.errorLog];
        }

        // Clear error log
        clearErrorLog() {
            this.errorLog = [];
        }

        // Export error log
        exportErrorLog() {
            const logData = {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href,
                errors: this.errorLog
            };

            const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `error-log-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    // Create global instance
    window.unifiedErrorSystem = new UnifiedErrorSystem();

    // Backward compatibility aliases
    window.handleError = (error, type, severity, context) => 
        window.unifiedErrorSystem.handleError(error, type, severity, context);
    window.showError = (elementId, message, severity) => 
        window.unifiedErrorSystem.showElementError(elementId, message, severity);
    window.clearErrors = (elementId) => 
        window.unifiedErrorSystem.clearErrors(elementId);

    // Export error types and severity levels
    window.ERROR_TYPES = ERROR_TYPES;
    window.SEVERITY_LEVELS = SEVERITY_LEVELS;

    console.log('✅ Unified Error System initialized');

})();