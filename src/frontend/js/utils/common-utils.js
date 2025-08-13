/**
 * Common utility functions for UBS Application
 * Shared across all pages for consistency and DRY principles
 */

// Notification system using Bootstrap toasts
class NotificationManager {
    static container = null;

    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container position-fixed top-0 end-0 p-3';
            this.container.style.zIndex = '9999';
            document.body.appendChild(this.container);
        }
    }

    static show(message, type = 'info', duration = 5000) {
        this.init();
        
        const toastId = 'toast-' + Date.now();
        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-triangle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };

        const colorMap = {
            success: 'text-success',
            error: 'text-danger',
            warning: 'text-warning',
            info: 'text-primary'
        };

        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body d-flex align-items-center">
                        <i class="${iconMap[type]} ${colorMap[type]} me-2"></i>
                        ${message}
                    </div>
                    <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;

        this.container.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: duration });
        
        toast.show();
        
        // Remove from DOM after hiding
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });

        return toast;
    }

    static success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }

    static error(message, duration = 7000) {
        return this.show(message, 'error', duration);
    }

    static warning(message, duration = 6000) {
        return this.show(message, 'warning', duration);
    }

    static info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }
}

// Loading state management
class LoadingManager {
    static setButtonLoading(button, isLoading, originalText = null) {
        if (isLoading) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = originalText || button.innerHTML;
            }
            button.disabled = true;
            button.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Processando...
            `;
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || originalText || 'Submit';
            delete button.dataset.originalText;
        }
    }

    static setElementLoading(element, isLoading, loadingText = 'Carregando...') {
        if (isLoading) {
            if (!element.dataset.originalContent) {
                element.dataset.originalContent = element.innerHTML;
            }
            element.innerHTML = `
                <div class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3 mb-0 text-muted">${loadingText}</p>
                </div>
            `;
        } else {
            element.innerHTML = element.dataset.originalContent || '';
            delete element.dataset.originalContent;
        }
    }
}

// API helper functions
class ApiHelper {
    static getAuthHeaders() {
        const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    static async request(url, options = {}) {
        const config = {
            headers: this.getAuthHeaders(),
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('ubs_token');
                window.location.href = '/login.html';
                throw new Error('Unauthorized');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            // Handle different content types
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    static async get(url) {
        return this.request(url, { method: 'GET' });
    }

    static async post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async delete(url) {
        return this.request(url, { method: 'DELETE' });
    }
}

// Confirmation dialogs
class ConfirmationManager {
    static async confirm(message, title = 'Confirmar ação', confirmText = 'Confirmar', cancelText = 'Cancelar') {
        return new Promise((resolve) => {
            // Create modal if it doesn't exist
            let modal = document.getElementById('confirmationModal');
            if (!modal) {
                const modalHtml = `
                    <div class="modal fade" id="confirmationModal" tabindex="-1" aria-labelledby="confirmationModalLabel" aria-hidden="true">
                        <div class="modal-dialog">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title" id="confirmationModalLabel"></h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                                <div class="modal-body" id="confirmationModalBody">
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="confirmationCancel"></button>
                                    <button type="button" class="btn btn-danger" id="confirmationConfirm"></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                modal = document.getElementById('confirmationModal');
            }

            // Update modal content
            document.getElementById('confirmationModalLabel').textContent = title;
            document.getElementById('confirmationModalBody').textContent = message;
            document.getElementById('confirmationCancel').textContent = cancelText;
            document.getElementById('confirmationConfirm').textContent = confirmText;

            // Set up event handlers
            const confirmBtn = document.getElementById('confirmationConfirm');
            const cancelBtn = document.getElementById('confirmationCancel');

            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('hidden.bs.modal', handleCancel);
            };

            const handleConfirm = () => {
                cleanup();
                bootstrap.Modal.getInstance(modal).hide();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            modal.addEventListener('hidden.bs.modal', handleCancel);

            // Show modal
            new bootstrap.Modal(modal).show();
        });
    }

    static async confirmDelete(itemName = 'item') {
        return this.confirm(
            `Tem certeza que deseja excluir este ${itemName}? Esta ação não pode ser desfeita.`,
            'Confirmar exclusão',
            'Excluir',
            'Cancelar'
        );
    }
}

// Form validation helpers
class FormValidator {
    static validateRequired(value, fieldName) {
        if (!value || value.trim() === '') {
            throw new Error(`${fieldName} é obrigatório`);
        }
        return true;
    }

    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email inválido');
        }
        return true;
    }

    static validatePhone(phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(phone) || phone.length < 10) {
            throw new Error('Telefone inválido');
        }
        return true;
    }

    static validatePrice(price) {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
            throw new Error('Preço deve ser um número válido');
        }
        return true;
    }

    static validateForm(formElement, rules) {
        const errors = [];
        
        Object.keys(rules).forEach(fieldName => {
            const field = formElement.querySelector(`[name="${fieldName}"]`) || 
                          formElement.querySelector(`#${fieldName}`);
            
            if (!field) return;
            
            const value = field.value;
            const fieldRules = rules[fieldName];
            
            try {
                if (fieldRules.required) {
                    this.validateRequired(value, fieldRules.label || fieldName);
                }
                
                if (value && fieldRules.type === 'email') {
                    this.validateEmail(value);
                }
                
                if (value && fieldRules.type === 'phone') {
                    this.validatePhone(value);
                }
                
                if (value && fieldRules.type === 'price') {
                    this.validatePrice(value);
                }
                
                if (fieldRules.custom) {
                    fieldRules.custom(value);
                }
                
                // Remove error styling
                field.classList.remove('is-invalid');
                const feedback = field.parentNode.querySelector('.invalid-feedback');
                if (feedback) feedback.remove();
                
            } catch (error) {
                errors.push({ field: fieldName, message: error.message });
                
                // Add error styling
                field.classList.add('is-invalid');
                let feedback = field.parentNode.querySelector('.invalid-feedback');
                if (!feedback) {
                    feedback = document.createElement('div');
                    feedback.className = 'invalid-feedback';
                    field.parentNode.appendChild(feedback);
                }
                feedback.textContent = error.message;
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// Format utilities
class FormatUtils {
    static currency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value || 0);
    }

    static date(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('pt-BR');
    }

    static datetime(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('pt-BR');
    }

    static time(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static phone(phone) {
        if (!phone) return '';
        // Format Brazilian phone numbers
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
    }

    static truncate(text, maxLength = 50) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}

// Debounce utility
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Export to global scope
window.UBSUtils = {
    NotificationManager,
    LoadingManager,
    ApiHelper,
    ConfirmationManager,
    FormValidator,
    FormatUtils,
    debounce
};

console.log('✅ UBS Common Utilities loaded successfully!');