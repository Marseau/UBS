class ServicesManager {
    constructor() {
        this.apiUrl = '/api/admin/services';
        this.token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        this.services = [];
        this.state = {
            filters: {
                category: '',
                query: ''
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                limit: 12
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        if (!this.token) {
            window.location.href = '/login.html';
            return;
        }
        this.cacheDOMElements();
        this.addEventListeners();
        this.fetchServices();
    }

    cacheDOMElements() {
        this.dom = {
            servicesGrid: document.querySelector('.services-grid'),
            categoryFilter: document.querySelector('.category-filter'),
            searchFilter: document.getElementById('searchFilter'),
            paginationContainer: document.getElementById('pagination-container'),
            emptyState: document.querySelector('.empty-state')
        };
    }

    addEventListeners() {
        this.dom.searchFilter?.addEventListener('input', UBSUtils.debounce(() => {
            this.handleFilterChange();
        }, 500));
        
        // Category filter listeners
        this.dom.categoryFilter?.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-btn')) {
                // Update active category button
                this.dom.categoryFilter.querySelectorAll('.category-btn').forEach(btn => 
                    btn.classList.remove('active'));
                e.target.classList.add('active');
                
                this.state.filters.category = e.target.dataset.category || '';
                this.handleFilterChange();
            }
        });

        // Event delegation for service action buttons
        this.dom.servicesGrid?.addEventListener('click', (e) => {
            const serviceCard = e.target.closest('.service-card');
            if (!serviceCard) return;

            const serviceId = serviceCard.dataset.serviceId;
            
            if (e.target.classList.contains('btn-edit')) {
                this.editService(serviceId);
            } else if (e.target.classList.contains('btn-toggle')) {
                this.toggleServiceStatus(serviceId);
            } else if (e.target.classList.contains('btn-delete')) {
                this.deleteService(serviceId);
            }
        });
    }

    handleFilterChange() {
        this.state.pagination.currentPage = 1;
        this.state.filters.query = this.dom.searchFilter?.value || '';
        this.fetchServices();
    }

    async fetchServices() {
        try {
            UBSUtils.LoadingManager.setElementLoading(this.dom.servicesGrid, true, 'Carregando serviços...');
            
            const params = new URLSearchParams({
                page: this.state.pagination.currentPage,
                limit: this.state.pagination.limit,
                search: this.state.filters.query,
                category: this.state.filters.category
            });

            const data = await UBSUtils.ApiHelper.get(`${this.apiUrl}?${params.toString()}`);
            
            this.services = data.services || [];
            this.state.pagination = data.pagination || this.state.pagination;
            
            this.renderCards();
            this.renderPagination();
            
        } catch (error) {
            console.error('Error fetching services:', error);
            UBSUtils.NotificationManager.error('Erro ao carregar serviços: ' + error.message);
            this.showError();
        } finally {
            UBSUtils.LoadingManager.setElementLoading(this.dom.servicesGrid, false);
        }
    }

    renderCards() {
        if (this.services.length === 0) {
            this.showEmptyState();
            return;
        }

        this.dom.servicesGrid.innerHTML = this.services.map(service => `
            <div class="service-card" data-service-id="${service.id}">
                <div class="service-status">
                    <span class="status-badge status-${service.is_active ? 'active' : 'inactive'}">
                        ${service.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                </div>
                <div class="service-header">
                    <div class="service-icon" style="background-color: ${this.getServiceColor(service.service_categories?.name)};">
                        <i class="${this.getServiceIcon(service.service_categories?.name)}"></i>
                    </div>
                    <div>
                        <h5 class="service-title">${service.name}</h5>
                        ${service.service_categories?.name ? `<small class="text-muted">${service.service_categories.name}</small>` : ''}
                    </div>
                </div>
                <p class="service-description">${UBSUtils.FormatUtils.truncate(service.description || 'Nenhuma descrição fornecida.', 80)}</p>
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="service-price">${UBSUtils.FormatUtils.currency(service.base_price || 0)}</div>
                    <div class="service-duration"><i class="far fa-clock"></i> ${service.duration_minutes || 0} min</div>
                </div>
                <hr>
                <div class="service-actions d-flex gap-2">
                    <button class="btn btn-sm btn-outline-primary btn-edit flex-fill" title="Editar serviço">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-outline-${service.is_active ? 'warning' : 'success'} btn-toggle" title="${service.is_active ? 'Desativar' : 'Ativar'} serviço">
                        <i class="fas fa-${service.is_active ? 'pause' : 'play'}"></i> ${service.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-delete" title="Excluir serviço">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        if (this.dom.emptyState) {
            this.dom.emptyState.style.display = 'none';
        }
    }

    renderPagination() {
        if (!this.dom.paginationContainer || this.state.pagination.totalPages <= 1) {
            if (this.dom.paginationContainer) this.dom.paginationContainer.innerHTML = '';
            return;
        }

        const { currentPage, totalPages } = this.state.pagination;
        let html = '<nav><ul class="pagination justify-content-center">';
        
        // Previous button
        if (currentPage > 1) {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="servicesManager.goToPage(${currentPage - 1})">Anterior</a></li>`;
        }

        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === currentPage;
            html += `<li class="page-item ${isActive ? 'active' : ''}"><a class="page-link" href="#" onclick="servicesManager.goToPage(${i})">${i}</a></li>`;
        }

        // Next button
        if (currentPage < totalPages) {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="servicesManager.goToPage(${currentPage + 1})">Próxima</a></li>`;
        }
        
        html += '</ul></nav>';
        this.dom.paginationContainer.innerHTML = html;
    }

    goToPage(page) {
        this.state.pagination.currentPage = page;
        this.fetchServices();
    }

    async editService(serviceId) {
        try {
            const service = await UBSUtils.ApiHelper.get(`${this.apiUrl}/${serviceId}`);
            this.showEditModal(service);
        } catch (error) {
            console.error('Error fetching service details:', error);
            UBSUtils.NotificationManager.error('Erro ao carregar dados do serviço');
        }
    }

    showEditModal(service) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('editServiceModal');
        if (!modal) {
            this.createEditModal();
            modal = document.getElementById('editServiceModal');
        }

        // Populate form with service data
        document.getElementById('editServiceName').value = service.name || '';
        document.getElementById('editServiceDescription').value = service.description || '';
        document.getElementById('editServicePrice').value = service.base_price || 0;
        document.getElementById('editServiceDuration').value = service.duration_minutes || 30;
        document.getElementById('editServiceActive').checked = service.is_active;

        // Store service ID for saving
        modal.dataset.serviceId = service.id;

        // Show modal
        new bootstrap.Modal(modal).show();
    }

    createEditModal() {
        const modalHtml = `
            <div class="modal fade" id="editServiceModal" tabindex="-1" aria-labelledby="editServiceModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="editServiceModalLabel">Editar Serviço</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editServiceForm">
                                <div class="mb-3">
                                    <label for="editServiceName" class="form-label">Nome do Serviço *</label>
                                    <input type="text" class="form-control" id="editServiceName" required>
                                </div>
                                <div class="mb-3">
                                    <label for="editServiceDescription" class="form-label">Descrição</label>
                                    <textarea class="form-control" id="editServiceDescription" rows="3"></textarea>
                                </div>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label for="editServicePrice" class="form-label">Preço Base (R$) *</label>
                                            <input type="number" class="form-control" id="editServicePrice" min="0" step="0.01" required>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label for="editServiceDuration" class="form-label">Duração (minutos) *</label>
                                            <input type="number" class="form-control" id="editServiceDuration" min="15" step="15" required>
                                        </div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="editServiceActive" checked>
                                        <label class="form-check-label" for="editServiceActive">
                                            Serviço ativo
                                        </label>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-primary" onclick="servicesManager.saveService()">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveService() {
        const modal = document.getElementById('editServiceModal');
        const serviceId = modal.dataset.serviceId;
        const saveButton = modal.querySelector('.btn-primary');

        try {
            // Validate form
            const validation = UBSUtils.FormValidator.validateForm(document.getElementById('editServiceForm'), {
                editServiceName: { required: true, label: 'Nome do serviço' },
                editServicePrice: { required: true, type: 'price', label: 'Preço' },
                editServiceDuration: { required: true, label: 'Duração' }
            });

            if (!validation.isValid) {
                UBSUtils.NotificationManager.error('Por favor, corrija os erros no formulário');
                return;
            }

            UBSUtils.LoadingManager.setButtonLoading(saveButton, true);

            const serviceData = {
                name: document.getElementById('editServiceName').value.trim(),
                description: document.getElementById('editServiceDescription').value.trim(),
                base_price: parseFloat(document.getElementById('editServicePrice').value),
                duration_minutes: parseInt(document.getElementById('editServiceDuration').value),
                is_active: document.getElementById('editServiceActive').checked
            };

            await UBSUtils.ApiHelper.put(`${this.apiUrl}/${serviceId}`, serviceData);

            UBSUtils.NotificationManager.success('Serviço atualizado com sucesso!');
            bootstrap.Modal.getInstance(modal).hide();
            this.fetchServices(); // Refresh the list

        } catch (error) {
            console.error('Error saving service:', error);
            UBSUtils.NotificationManager.error('Erro ao salvar serviço: ' + error.message);
        } finally {
            UBSUtils.LoadingManager.setButtonLoading(saveButton, false);
        }
    }

    async toggleServiceStatus(serviceId) {
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const newStatus = !service.is_active;
        const action = newStatus ? 'ativar' : 'desativar';

        try {
            await UBSUtils.ApiHelper.put(`${this.apiUrl}/${serviceId}`, {
                is_active: newStatus
            });

            UBSUtils.NotificationManager.success(`Serviço ${newStatus ? 'ativado' : 'desativado'} com sucesso!`);
            
            // Update local state
            service.is_active = newStatus;
            this.renderCards();

        } catch (error) {
            console.error('Error toggling service status:', error);
            UBSUtils.NotificationManager.error(`Erro ao ${action} serviço: ` + error.message);
        }
    }

    async deleteService(serviceId) {
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const confirmed = await UBSUtils.ConfirmationManager.confirmDelete(`serviço "${service.name}"`);
        if (!confirmed) return;

        try {
            await UBSUtils.ApiHelper.delete(`${this.apiUrl}/${serviceId}`);

            UBSUtils.NotificationManager.success('Serviço excluído com sucesso!');
            
            // Remove from local state and re-render
            this.services = this.services.filter(s => s.id !== serviceId);
            this.renderCards();

        } catch (error) {
            console.error('Error deleting service:', error);
            UBSUtils.NotificationManager.error('Erro ao excluir serviço: ' + error.message);
        }
    }

    getServiceIcon(category) {
        const iconMap = {
            'Cabelo': 'fas fa-cut',
            'Estética Facial': 'fas fa-spa',
            'Unhas': 'fas fa-hand-paper',
            'Sobrancelhas': 'fas fa-eye',
            'Consultas Médicas': 'fas fa-user-md',
            'Exames': 'fas fa-microscope',
            'Procedimentos': 'fas fa-medical-surgery',
            'Consultas Jurídicas': 'fas fa-balance-scale',
            'Contratos': 'fas fa-file-contract',
            'Processos': 'fas fa-gavel',
            'Inglês': 'fas fa-language',
            'Francês': 'fas fa-language',
            'Espanhol': 'fas fa-language',
            'Treinamento': 'fas fa-dumbbell',
            'Avaliação': 'fas fa-clipboard-check',
            'Aulas': 'fas fa-yoga'
        };
        return iconMap[category] || 'fas fa-concierge-bell';
    }

    getServiceColor(category) {
        const colorMap = {
            'Cabelo': '#e91e63',
            'Estética Facial': '#ff9800',
            'Unhas': '#9c27b0',
            'Sobrancelhas': '#795548',
            'Consultas Médicas': '#2196f3',
            'Exames': '#00bcd4',
            'Procedimentos': '#009688',
            'Consultas Jurídicas': '#3f51b5',
            'Contratos': '#673ab7',
            'Processos': '#f44336',
            'Inglês': '#4caf50',
            'Francês': '#8bc34a',
            'Espanhol': '#cddc39',
            'Treinamento': '#ff5722',
            'Avaliação': '#607d8b',
            'Aulas': '#9e9e9e'
        };
        return colorMap[category] || '#6c757d';
    }

    showEmptyState() {
        this.dom.servicesGrid.innerHTML = `
            <div class="empty-state col-12 text-center py-5">
                <i class="fas fa-concierge-bell fa-3x mb-3 text-muted"></i>
                <h5>Nenhum serviço encontrado</h5>
                <p class="text-muted">Tente ajustar os filtros ou adicione novos serviços</p>
                <button class="btn btn-primary" onclick="newService()">
                    <i class="fas fa-plus"></i> Novo Serviço
                </button>
            </div>
        `;
        
        if (this.dom.emptyState) {
            this.dom.emptyState.style.display = 'block';
        }
    }
    
    showError() {
        this.dom.servicesGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-exclamation-triangle fa-3x mb-3 text-danger"></i>
                <h5>Erro ao carregar serviços</h5>
                <p class="text-muted">Tente novamente mais tarde</p>
                <button class="btn btn-outline-primary" onclick="servicesManager.fetchServices()">
                    <i class="fas fa-redo"></i> Tentar Novamente
                </button>
            </div>
        `;
    }
}

// Global instance
const servicesManager = new ServicesManager();

// Global functions for HTML onclick handlers
function newService() {
    console.log('New service functionality - to be implemented');
    UBSUtils.NotificationManager.info('Funcionalidade de novo serviço será implementada em breve');
}

// Export to global scope
window.servicesManager = servicesManager; 