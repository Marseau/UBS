// COLEAM00 Modal Bootstrap Fix
// Based on real browser testing findings

class ModalFix {
    constructor() {
        this.modals = new Map();
        this.initialized = false;
    }

    // Enhanced modal creation and initialization
    createModal(id, config = {}) {
        console.log(`🔧 Criando modal: ${id}`);
        
        try {
            // Remove existing modal if it exists
            this.destroyModal(id);

            const modalHtml = `
                <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
                    <div class="modal-dialog ${config.size || 'modal-lg'}">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="${id}Label">
                                    ${config.icon ? `<i class="${config.icon} me-2"></i>` : ''}
                                    ${config.title || 'Modal'}
                                </h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body" id="${id}Body">
                                ${config.body || ''}
                            </div>
                            <div class="modal-footer" id="${id}Footer">
                                ${config.footer || `
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                    <button type="button" class="btn btn-primary" onclick="${config.saveFunction || 'console.log(\'Save clicked\')'}">
                                        <i class="fas fa-save me-2"></i>Salvar
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add to DOM
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Initialize Bootstrap Modal
            const modalElement = document.getElementById(id);
            if (!modalElement) {
                throw new Error(`Modal element ${id} not found after creation`);
            }

            // Ensure Bootstrap is available
            if (typeof bootstrap === 'undefined') {
                throw new Error('Bootstrap not loaded');
            }

            const modalInstance = new bootstrap.Modal(modalElement, {
                backdrop: true,
                keyboard: true,
                focus: true
            });

            // Store reference
            this.modals.set(id, {
                element: modalElement,
                instance: modalInstance,
                config: config
            });

            // Add cleanup listener
            modalElement.addEventListener('hidden.bs.modal', () => {
                this.destroyModal(id);
            });

            console.log(`✅ Modal ${id} criado com sucesso`);
            return modalInstance;

        } catch (error) {
            console.error(`❌ Erro ao criar modal ${id}:`, error);
            return null;
        }
    }

    // Show modal with enhanced error handling
    showModal(id, bodyContent = null) {
        console.log(`👁️ Exibindo modal: ${id}`);
        
        try {
            const modalData = this.modals.get(id);
            if (!modalData) {
                console.error(`❌ Modal ${id} não encontrado`);
                return false;
            }

            // Update body content if provided
            if (bodyContent) {
                const bodyElement = document.getElementById(`${id}Body`);
                if (bodyElement) {
                    bodyElement.innerHTML = bodyContent;
                }
            }

            // Show modal
            modalData.instance.show();
            
            // Verify modal is visible
            setTimeout(() => {
                const modalElement = document.getElementById(id);
                if (modalElement && modalElement.classList.contains('show')) {
                    console.log(`✅ Modal ${id} exibido com sucesso`);
                } else {
                    console.error(`❌ Modal ${id} não está visível após show()`);
                }
            }, 500);

            return true;

        } catch (error) {
            console.error(`❌ Erro ao exibir modal ${id}:`, error);
            return false;
        }
    }

    // Destroy modal and cleanup
    destroyModal(id) {
        try {
            const modalData = this.modals.get(id);
            if (modalData) {
                // Hide first if visible
                if (modalData.instance) {
                    modalData.instance.hide();
                    modalData.instance.dispose();
                }
                
                // Remove from DOM
                if (modalData.element) {
                    modalData.element.remove();
                }
                
                // Remove from map
                this.modals.delete(id);
                
                console.log(`🗑️ Modal ${id} removido`);
            }
        } catch (error) {
            console.error(`❌ Erro ao remover modal ${id}:`, error);
        }
    }

    // Fix existing modals in DOM
    fixExistingModals() {
        console.log('🔧 Corrigindo modais existentes...');
        
        const existingModals = document.querySelectorAll('.modal');
        existingModals.forEach(modalEl => {
            try {
                const id = modalEl.id;
                if (!id) return;

                // Reinitialize Bootstrap Modal
                const instance = bootstrap.Modal.getOrCreateInstance(modalEl);
                
                this.modals.set(id, {
                    element: modalEl,
                    instance: instance,
                    config: {}
                });

                console.log(`✅ Modal existente ${id} corrigido`);
            } catch (error) {
                console.error('❌ Erro ao corrigir modal existente:', error);
            }
        });
    }

    // Initialize modal system
    init() {
        if (this.initialized) return;
        
        console.log('🚀 Inicializando sistema de modais...');
        
        // Wait for Bootstrap to be available
        const checkBootstrap = () => {
            if (typeof bootstrap !== 'undefined') {
                this.fixExistingModals();
                this.initialized = true;
                console.log('✅ Sistema de modais inicializado');
            } else {
                console.log('⏳ Aguardando Bootstrap...');
                setTimeout(checkBootstrap, 100);
            }
        };
        
        checkBootstrap();
    }

    // Quick modal creation helpers
    createAppointmentModal() {
        return this.createModal('newAppointmentModal', {
            title: 'Novo Agendamento',
            icon: 'fas fa-calendar-plus',
            size: 'modal-lg',
            saveFunction: 'saveNewAppointment()'
        });
    }

    createCustomerModal() {
        return this.createModal('addCustomerModal', {
            title: 'Novo Cliente',
            icon: 'fas fa-user-plus',
            size: 'modal-lg',
            saveFunction: 'saveNewCustomer()'
        });
    }
}

// Global instance
window.modalFix = new ModalFix();

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.modalFix.init();
});

// Global helper functions
window.createModal = (id, config) => window.modalFix.createModal(id, config);
window.showModal = (id, content) => window.modalFix.showModal(id, content);
window.destroyModal = (id) => window.modalFix.destroyModal(id);