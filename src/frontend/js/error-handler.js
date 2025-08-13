/**
 * ENHANCED ERROR HANDLING SYSTEM
 * Provides comprehensive error handling with user-friendly messages and recovery options
 */

// Prevent duplicate initialization
(function() {
    if (typeof window.ErrorHandler !== 'undefined') {
        console.log('🛡️ ErrorHandler already defined, skipping...');
        return;
    }

class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 50;
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 2000;
        
        // Initialize global error handlers
        this.initializeGlobalHandlers();
        
        console.log('🛡️ Error Handler initialized');
    }

    /**
     * Initialize global error handlers
     */
    initializeGlobalHandlers() {
        // Handle uncaught JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleJavaScriptError(event);
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handlePromiseRejection(event);
        });

        // Handle fetch errors globally
        this.setupFetchErrorHandling();
    }

    /**
     * Setup fetch error handling
     */
    setupFetchErrorHandling() {
        const originalFetch = window.fetch;
        
        window.fetch = async function(...args) {
            try {
                const response = await originalFetch(...args);
                
                // Check if response is ok
                if (!response.ok) {
                    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                    error.response = response;
                    error.url = args[0];
                    throw error;
                }
                
                return response;
            } catch (error) {
                // Log the error
                window.errorHandler?.logError(error, 'fetch', {
                    url: args[0],
                    options: args[1]
                });
                
                throw error;
            }
        };
    }

    /**
     * Handle JavaScript errors
     */
    handleJavaScriptError(event) {
        const error = {
            type: 'javascript',
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack,
            timestamp: new Date().toISOString()
        };

        this.logError(error, 'javascript');
        
        // Show user-friendly error message
        this.showErrorToast('Erro interno detectado', 'Por favor, recarregue a página se o problema persistir.');
    }

    /**
     * Handle promise rejections
     */
    handlePromiseRejection(event) {
        const error = {
            type: 'promise',
            message: event.reason?.message || 'Promise rejection',
            reason: event.reason,
            timestamp: new Date().toISOString()
        };

        this.logError(error, 'promise');
        
        // Show user-friendly error message
        this.showErrorToast('Erro de conectividade', 'Verifique sua conexão com a internet.');
    }

    /**
     * Log error to internal log
     */
    logError(error, context = 'unknown', metadata = {}) {
        const logEntry = {
            id: Date.now().toString(),
            error,
            context,
            metadata,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.errorLog.push(logEntry);
        
        // Keep log size manageable
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // Console logging for development
        console.error(`🚨 [${context}] Error logged:`, logEntry);
    }

    /**
     * Handle API errors with specific messaging
     */
    handleApiError(error, endpoint = 'unknown') {
        const errorInfo = this.parseApiError(error);
        
        // Log the error
        this.logError(error, 'api', {
            endpoint,
            status: error.response?.status,
            statusText: error.response?.statusText
        });

        // Show appropriate user message
        this.showErrorNotification(errorInfo.title, errorInfo.message, errorInfo.type);
        
        return errorInfo;
    }

    /**
     * Parse API error and return user-friendly info
     */
    parseApiError(error) {
        const status = error.response?.status;
        
        switch (status) {
            case 400:
                return {
                    type: 'warning',
                    title: 'Dados inválidos',
                    message: 'Os dados enviados são inválidos. Verifique os campos e tente novamente.',
                    recoverable: true
                };
                
            case 401:
                return {
                    type: 'error',
                    title: 'Acesso negado',
                    message: 'Sua sessão expirou. Faça login novamente.',
                    recoverable: true,
                    action: 'redirect_login'
                };
                
            case 403:
                return {
                    type: 'error',
                    title: 'Sem permissão',
                    message: 'Você não tem permissão para acessar este recurso.',
                    recoverable: false
                };
                
            case 404:
                return {
                    type: 'warning',
                    title: 'Recurso não encontrado',
                    message: 'O recurso solicitado não foi encontrado.',
                    recoverable: true
                };
                
            case 500:
                return {
                    type: 'error',
                    title: 'Erro interno do servidor',
                    message: 'Ocorreu um erro interno. Tente novamente em alguns minutos.',
                    recoverable: true
                };
                
            case 503:
                return {
                    type: 'warning',
                    title: 'Serviço temporariamente indisponível',
                    message: 'O serviço está temporariamente indisponível. Tente novamente em breve.',
                    recoverable: true
                };
                
            default:
                return {
                    type: 'error',
                    title: 'Erro de conectividade',
                    message: 'Não foi possível conectar com o servidor. Verifique sua conexão.',
                    recoverable: true
                };
        }
    }

    /**
     * Show error notification
     */
    showErrorNotification(title, message, type = 'error') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `error-notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h6>${title}</h6>
                    <button class="notification-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <p>${message}</p>
            </div>
        `;
        
        // Add to page
        this.addNotificationToPage(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }

    /**
     * Show error toast (smaller, less intrusive)
     */
    showErrorToast(title, message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-exclamation-circle"></i>
                <div class="toast-text">
                    <strong>${title}</strong>
                    <span>${message}</span>
                </div>
            </div>
        `;
        
        // Add to page
        this.addToastToPage(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    /**
     * Add notification to page
     */
    addNotificationToPage(notification) {
        let container = document.getElementById('errorNotificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'errorNotificationContainer';
            container.className = 'error-notification-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
    }

    /**
     * Add toast to page
     */
    addToastToPage(toast) {
        let container = document.getElementById('errorToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'errorToastContainer';
            container.className = 'error-toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
    }

    /**
     * Handle widget errors with retry functionality
     */
    handleWidgetError(widgetId, error, retryCallback) {
        const errorInfo = this.parseApiError(error);
        
        // Log the error
        this.logError(error, 'widget', { widgetId });
        
        // Show widget error through standardized widget system
        if (window.ubsWidgetSystem) {
            window.ubsWidgetSystem.showError(widgetId, {
                message: errorInfo.message,
                title: errorInfo.title,
                retryCallback: errorInfo.recoverable ? retryCallback : null
            });
        }
        
        return errorInfo;
    }

    /**
     * Handle form validation errors
     */
    handleFormErrors(formId, errors) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        // Clear previous errors
        form.querySelectorAll('.field-error').forEach(el => el.remove());
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        
        // Add new errors
        Object.entries(errors).forEach(([field, message]) => {
            const fieldElement = form.querySelector(`[name="${field}"]`);
            if (fieldElement) {
                fieldElement.classList.add('is-invalid');
                
                const errorElement = document.createElement('div');
                errorElement.className = 'field-error invalid-feedback';
                errorElement.textContent = message;
                
                fieldElement.parentElement.appendChild(errorElement);
            }
        });
    }

    /**
     * Retry mechanism for failed operations
     */
    async retryOperation(operationName, operation, maxRetries = this.maxRetries) {
        let attempts = this.retryAttempts.get(operationName) || 0;
        
        try {
            const result = await operation();
            
            // Reset retry count on success
            this.retryAttempts.delete(operationName);
            
            return result;
        } catch (error) {
            attempts++;
            this.retryAttempts.set(operationName, attempts);
            
            if (attempts < maxRetries) {
                console.log(`🔄 Retrying ${operationName} (${attempts}/${maxRetries})`);
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
                return this.retryOperation(operationName, operation, maxRetries);
            } else {
                // Max retries reached
                this.retryAttempts.delete(operationName);
                throw error;
            }
        }
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            totalErrors: this.errorLog.length,
            errorsByType: {},
            errorsByContext: {},
            recentErrors: this.errorLog.slice(-5)
        };
        
        this.errorLog.forEach(entry => {
            const type = entry.error.type || 'unknown';
            const context = entry.context || 'unknown';
            
            stats.errorsByType[type] = (stats.errorsByType[type] || 0) + 1;
            stats.errorsByContext[context] = (stats.errorsByContext[context] || 0) + 1;
        });
        
        return stats;
    }

    /**
     * Export error log for debugging
     */
    exportErrorLog() {
        const exportData = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            stats: this.getErrorStats(),
            errors: this.errorLog
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `error-log-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
        this.retryAttempts.clear();
        console.log('🧹 Error log cleared');
    }
}

// Initialize global error handler
window.errorHandler = new ErrorHandler();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}

})(); // Close IIFE