class SettingsManager {
    constructor() {
        this.apiUrl = '/api/admin';
        this.token = localStorage.getItem('ubs_token');
        this.allServices = [];
        this.professionals = [];
        this.currentProfessionalId = null;

        this.cacheDOM();
        this.init();
    }

    cacheDOM() {
        // Containers e Carregamento
        this.professionalsAccordion = document.getElementById('professionals-accordion');
        this.loadingSpinner = document.getElementById('loading-professionals');

        // Modal Principal do Profissional
        this.professionalModal = new bootstrap.Modal(document.getElementById('professionalModal'));
        this.professionalModalEl = document.getElementById('professionalModal');
        this.professionalModalLabel = document.getElementById('professionalModalLabel');
        this.professionalForm = document.getElementById('professionalForm');
        this.professionalIdInput = document.getElementById('professionalId');
        this.professionalNameInput = document.getElementById('professionalName');
        this.professionalEmailInput = document.getElementById('professionalEmail');
        this.professionalBioInput = document.getElementById('professionalBio');

        // Abas do Modal
        this.workingHoursEditor = document.getElementById('workingHoursEditor');
        this.professionalServicesTableBody = document.getElementById('professionalServicesTableBody');
        this.availabilityExceptionsTableBody = document.getElementById('availabilityExceptionsTableBody');

        // Modal de Associar Serviço
        this.associateServiceModal = new bootstrap.Modal(document.getElementById('addServiceToProfessionalModal'));
        this.associateServiceForm = document.getElementById('associateServiceForm');
        this.serviceSelect = document.getElementById('serviceSelect');
        this.customPriceInput = document.getElementById('customPrice');
        this.customDurationInput = document.getElementById('customDuration');

        // Modal de Adicionar Exceção
        this.addExceptionModal = new bootstrap.Modal(document.getElementById('addExceptionModal'));
        this.exceptionForm = document.getElementById('exceptionForm');
        this.exceptionReasonInput = document.getElementById('exceptionReason');
        this.exceptionStartDateInput = document.getElementById('exceptionStartDate');
        this.exceptionEndDateInput = document.getElementById('exceptionEndDate');
    }

    async init() {
        if (!this.token) {
            logger?.error('Token não encontrado. Redirecionando para login.');
            window.location.href = '/login.html';
            return;
        }

        // Check if this is a new user setup
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('setup') === 'true') {
            this.showWelcomeMessage();
        }

        this.addEventListeners();
        this.setupFormValidation();
        this.setupCharacterCounters();
        this.setupAddressForm();
        this.setupPhoneFormatting();
        this.setupWhatsAppConfiguration();
        await this.loadInitialData();
        await this.loadProfessionals();
        await this.loadSettings();
        
        // Tentar inicializar horários com delay para garantir que DOM está pronto
        setTimeout(() => {
            logger?.log('🕒 Tentando inicializar horários após delay...');
            this.initBusinessHours();
        }, 500);
    }

    addEventListeners() {
        // Botão para abrir o modal para um novo profissional
        this.professionalModalEl.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            const professionalId = button.getAttribute('data-professional-id');
            this.handleOpenProfessionalModal(professionalId);
        });
        
        // Salvar profissional (novo ou edição)
        this.professionalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfessional();
        });

        // Salvar associação de serviço
        this.associateServiceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfessionalServiceAssociation();
        });
        
        // Salvar exceção de agenda
        this.exceptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAvailabilityException();
        });

        // Listeners para botões de remoção dentro das tabelas
        this.professionalServicesTableBody.addEventListener('click', (e) => {
            if (e.target.closest('.delete-service-association-btn')) {
                const associationId = e.target.closest('.delete-service-association-btn').dataset.id;
                this.deleteProfessionalServiceAssociation(associationId);
            }
        });

        this.availabilityExceptionsTableBody.addEventListener('click', (e) => {
            if (e.target.closest('.delete-exception-btn')) {
                const exceptionId = e.target.closest('.delete-exception-btn').dataset.id;
                this.deleteAvailabilityException(exceptionId);
            }
        });
        
        // Listener para o botão de apagar no acordeão
        this.professionalsAccordion.addEventListener('click', (e) => {
            if (e.target.closest('.delete-professional-btn')) {
                 const professionalId = e.target.closest('.delete-professional-btn').dataset.professionalId;
                 this.deleteProfessional(professionalId);
            }
        });

        // Listener para o botão de salvar horários
        const saveBusinessHoursBtn = document.getElementById('saveBusinessHours');
        if (saveBusinessHoursBtn) {
            saveBusinessHoursBtn.addEventListener('click', () => {
                this.saveBusinessHours();
            });
        }
    }

    // Configurar formatação de telefone
    setupPhoneFormatting() {
        const phoneInput = document.getElementById('businessPhone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                
                if (value.length <= 11) {
                    if (value.length <= 2) {
                        value = value.replace(/^(\d{0,2})/, '($1');
                    } else if (value.length <= 7) {
                        value = value.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
                    } else {
                        value = value.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
                    }
                }
                
                e.target.value = value;
            });
        }
    }

    // Configurar formulário de endereço com CEP
    setupAddressForm() {
        const cepInput = document.getElementById('businessCep');
        if (cepInput) {
            // Formatação do CEP
            cepInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length <= 8) {
                    value = value.replace(/^(\d{5})(\d{0,3})/, '$1-$2');
                    e.target.value = value;
                }
            });

            // Buscar endereço quando CEP estiver completo
            cepInput.addEventListener('blur', async (e) => {
                const cep = e.target.value.replace(/\D/g, '');
                if (cep.length === 8) {
                    await this.fetchAddressByCep(cep);
                }
            });
        }
    }

    // Buscar endereço pela API ViaCEP
    async fetchAddressByCep(cep) {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json();
            
            if (data.erro) {
                this.showAlert('CEP não encontrado', 'warning');
                return;
            }

            // Preencher campos automaticamente
            const streetInput = document.getElementById('businessStreet');
            const neighborhoodInput = document.getElementById('businessNeighborhood');
            const cityInput = document.getElementById('businessCity');
            const stateInput = document.getElementById('businessState');

            if (streetInput) streetInput.value = data.logradouro || '';
            if (neighborhoodInput) neighborhoodInput.value = data.bairro || '';
            if (cityInput) cityInput.value = data.localidade || '';
            if (stateInput) stateInput.value = data.uf || '';

            // Focar no campo número
            const numberInput = document.getElementById('businessNumber');
            if (numberInput) numberInput.focus();

        } catch (error) {
            logger?.error('Erro ao buscar CEP:', error);
            this.showAlert('Erro ao buscar CEP. Tente novamente.', 'danger');
        }
    }

    // Mostrar alerta
    showAlert(message, type = 'info') {
        // Criar elemento de alerta se não existir
        let alertContainer = document.getElementById('alert-container');
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'alert-container';
            alertContainer.style.position = 'fixed';
            alertContainer.style.top = '20px';
            alertContainer.style.right = '20px';
            alertContainer.style.zIndex = '9999';
            document.body.appendChild(alertContainer);
        }

        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        alertContainer.appendChild(alert);

        // Remover automaticamente após 5 segundos
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    // === HORÁRIOS DE FUNCIONAMENTO ===
    
    initBusinessHours() {
        logger?.log('🔍 Inicializando horários de funcionamento...');
        const container = document.getElementById('businessHours');
        logger?.log('📋 Container encontrado:', container);
        
        if (container) {
            const html = this.renderBusinessHours();
            logger?.log('🏗️ HTML gerado:', html.substring(0, 200) + '...');
            container.innerHTML = html;
            this.setupBusinessHoursListeners();
            logger?.log('✅ Horários inicializados com sucesso!');
        } else {
            logger?.error('❌ Container #businessHours não encontrado!');
        }
    }

    renderBusinessHours(businessHours = {}) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = { 
            monday: 'Segunda-feira', 
            tuesday: 'Terça-feira', 
            wednesday: 'Quarta-feira', 
            thursday: 'Quinta-feira', 
            friday: 'Sexta-feira', 
            saturday: 'Sábado', 
            sunday: 'Domingo'
        };
        
        return days.map(day => {
            const slots = businessHours[day] || [{ start: '', end: '' }];
            return `
                <div class="business-day-row" data-day="${day}">
                    <div class="day-header">
                        <h6 class="day-name">${dayNames[day]}</h6>
                        <div class="day-controls">
                            <button class="btn btn-outline-success btn-sm add-business-slot" type="button" title="Adicionar horário">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="btn btn-outline-secondary btn-sm copy-to-all" type="button" title="Copiar para todos os dias">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div class="business-slots-container">
                        ${slots.map((slot, index) => this.renderBusinessSlot(slot, index)).join('')}
                    </div>
                    ${slots.length === 0 || (slots.length === 1 && !slots[0].start && !slots[0].end) ? 
                        '<small class="text-muted">Fechado neste dia</small>' : ''}
                </div>
            `;
        }).join('');
    }

    renderBusinessSlot(slot, index) {
        return `
            <div class="business-slot" data-slot-index="${index}">
                <div class="slot-times">
                    <input type="time" class="form-control form-control-sm slot-start" value="${slot.start || ''}" placeholder="Início">
                    <span class="slot-separator">às</span>
                    <input type="time" class="form-control form-control-sm slot-end" value="${slot.end || ''}" placeholder="Fim">
                </div>
                <button class="btn btn-outline-danger btn-sm remove-business-slot" type="button" title="Remover horário">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    setupBusinessHoursListeners() {
        const container = document.getElementById('businessHours');
        
        // Adicionar novo slot
        container.addEventListener('click', (e) => {
            if (e.target.closest('.add-business-slot')) {
                const dayRow = e.target.closest('.business-day-row');
                this.addBusinessSlot(dayRow);
            }
        });

        // Remover slot
        container.addEventListener('click', (e) => {
            if (e.target.closest('.remove-business-slot')) {
                const slot = e.target.closest('.business-slot');
                this.removeBusinessSlot(slot);
            }
        });

        // Copiar para todos os dias
        container.addEventListener('click', (e) => {
            if (e.target.closest('.copy-to-all')) {
                const dayRow = e.target.closest('.business-day-row');
                this.copyDayToAll(dayRow);
            }
        });
    }

    addBusinessSlot(dayRow) {
        const container = dayRow.querySelector('.business-slots-container');
        const newSlotHtml = this.renderBusinessSlot({ start: '', end: '' }, container.children.length);
        container.insertAdjacentHTML('beforeend', newSlotHtml);
        
        // Remove mensagem "Fechado neste dia" se existir
        const closedMessage = dayRow.querySelector('small.text-muted');
        if (closedMessage) closedMessage.remove();
    }

    removeBusinessSlot(slot) {
        const dayRow = slot.closest('.business-day-row');
        const container = dayRow.querySelector('.business-slots-container');
        
        slot.remove();
        
        // Se não há mais slots, mostra mensagem "Fechado"
        if (container.children.length === 0) {
            dayRow.insertAdjacentHTML('beforeend', '<small class="text-muted">Fechado neste dia</small>');
        }
    }

    copyDayToAll(dayRow) {
        const day = dayRow.dataset.day;
        const slots = this.getBusinessSlotsFromDay(dayRow);
        
        // Aplicar para todos os outros dias
        const allDayRows = document.querySelectorAll('.business-day-row');
        allDayRows.forEach(otherDayRow => {
            if (otherDayRow.dataset.day !== day) {
                const container = otherDayRow.querySelector('.business-slots-container');
                container.innerHTML = '';
                
                if (slots.length > 0) {
                    slots.forEach((slot, index) => {
                        const slotHtml = this.renderBusinessSlot(slot, index);
                        container.insertAdjacentHTML('beforeend', slotHtml);
                    });
                    
                    // Remove mensagem "Fechado" se existir
                    const closedMessage = otherDayRow.querySelector('small.text-muted');
                    if (closedMessage) closedMessage.remove();
                } else {
                    otherDayRow.insertAdjacentHTML('beforeend', '<small class="text-muted">Fechado neste dia</small>');
                }
            }
        });
        
        this.showAlert(`Horários copiados para todos os dias!`, 'success');
    }

    // Obter slots de horário de um dia específico
    getBusinessSlotsFromDay(dayRow) {
        const slots = [];
        const slotElements = dayRow.querySelectorAll('.business-slot');
        
        slotElements.forEach(slot => {
            const startTime = slot.querySelector('.slot-start')?.value;
            const endTime = slot.querySelector('.slot-end')?.value;
            
            if (startTime && endTime) {
                slots.push({ start: startTime, end: endTime });
            }
        });
        
        return slots;
    }

    // Salvar horários de funcionamento
    async saveBusinessHours() {
        const button = document.getElementById('saveBusinessHours');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        button.disabled = true;

        try {
            // Collect business hours data from new flexible interface
            const businessHours = {};
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            
            days.forEach(day => {
                const dayRow = document.querySelector(`.business-day-row[data-day="${day}"]`);
                if (dayRow) {
                    const slots = this.getBusinessSlotsFromDay(dayRow);
                    businessHours[day] = slots;
                } else {
                    businessHours[day] = [];
                }
            });

            // Chamada real para a API de horários
            const response = await this.apiCall('/business-hours', 'PUT', { businessHours });
            
            if (response.success) {
                this.showAlert(response.message || 'Horários salvos com sucesso!', 'success');
            } else {
                this.showAlert(response.message || 'Erro ao salvar horários', 'danger');
            }
        } catch (error) {
            logger?.error('Erro ao salvar horários:', error);
            this.showAlert('Erro ao salvar horários. Tente novamente.', 'danger');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    setupFormValidation() {
        // Implementação básica
        logger?.log('Form validation setup');
    }

    setupCharacterCounters() {
        // Implementação básica
        logger?.log('Character counters setup');
    }

    // === WHATSAPP BUSINESS CONFIGURATION ===
    
    setupWhatsAppConfiguration() {
        // Configurar botão do guia
        const guideLink = document.querySelector('[data-whatsapp-guide]');
        if (guideLink) {
            guideLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showWhatsAppGuide();
            });
        }

        // Configurar formulário WhatsApp
        const whatsappForm = document.getElementById('whatsappForm');
        if (whatsappForm) {
            whatsappForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveWhatsAppSettings();
            });
        }

        // Configurar botão de teste
        const testButton = document.getElementById('testWhatsAppConnection');
        if (testButton) {
            testButton.addEventListener('click', () => {
                this.testWhatsAppConnection();
            });
        }

        // Configurar formatação do número
        const phoneInput = document.getElementById('whatsappNumber');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                e.target.value = this.formatWhatsAppNumber(e.target.value);
            });
        }

        // Carregar configurações existentes
        this.loadWhatsAppSettings();
    }

    showWhatsAppGuide() {
        // Modal já está embutido no HTML, apenas mostrar
        const modalElement = document.getElementById('whatsappSetupGuide');
        if (modalElement) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
            logger?.log('✅ Guia WhatsApp aberto com sucesso');
        } else {
            logger?.error('❌ Modal do guia WhatsApp não encontrado');
            this.showAlert('Erro: Modal do guia não encontrado.', 'danger');
        }
    }

    formatWhatsAppNumber(value) {
        // Remove tudo que não é número
        const numbers = value.replace(/\D/g, '');
        
        // Formato brasileiro: +55 (xx) 9xxxx-xxxx
        if (numbers.length <= 2) {
            return `+${numbers}`;
        } else if (numbers.length <= 4) {
            return `+${numbers.slice(0, 2)} (${numbers.slice(2)}`;
        } else if (numbers.length <= 9) {
            return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4)}`;
        } else if (numbers.length <= 13) {
            return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
        }
        
        // Limitar a 13 dígitos
        return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4, 9)}-${numbers.slice(9, 13)}`;
    }

    async loadWhatsAppSettings() {
        try {
            const response = await this.apiCall('/whatsapp-settings', 'GET');
            
            if (response.success && response.data) {
                const settings = response.data;
                
                // Preencher campos
                const phoneInput = document.getElementById('whatsappNumber');
                const businessIdInput = document.getElementById('whatsappBusinessId');
                const tokenInput = document.getElementById('whatsappAccessToken');
                const statusElement = document.querySelector('.whatsapp-status');
                
                if (phoneInput) phoneInput.value = settings.phone_number || '';
                if (businessIdInput) businessIdInput.value = settings.business_account_id || '';
                if (tokenInput) tokenInput.value = settings.access_token || '';
                
                // Atualizar status
                if (statusElement) {
                    this.updateWhatsAppStatus(settings.is_connected, settings.last_test_date);
                }
            }
        } catch (error) {
            logger?.error('Erro ao carregar configurações WhatsApp:', error);
        }
    }

    async saveWhatsAppSettings() {
        const phoneInput = document.getElementById('whatsappNumber');
        const businessIdInput = document.getElementById('whatsappBusinessId');
        const tokenInput = document.getElementById('whatsappAccessToken');
        const saveButton = document.querySelector('#whatsappForm button[type="submit"]');
        
        if (!phoneInput || !businessIdInput || !tokenInput) {
            this.showAlert('Campos obrigatórios não encontrados', 'danger');
            return;
        }

        // Validar campos
        if (!phoneInput.value.trim()) {
            this.showAlert('Número do WhatsApp é obrigatório', 'warning');
            phoneInput.focus();
            return;
        }

        if (!businessIdInput.value.trim()) {
            this.showAlert('Business Account ID é obrigatório', 'warning');
            businessIdInput.focus();
            return;
        }

        if (!tokenInput.value.trim()) {
            this.showAlert('Access Token é obrigatório', 'warning');
            tokenInput.focus();
            return;
        }

        // Estado de carregamento
        const originalText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        saveButton.disabled = true;

        try {
            const settingsData = {
                phone_number: phoneInput.value.trim(),
                business_account_id: businessIdInput.value.trim(),
                access_token: tokenInput.value.trim()
            };

            const response = await this.apiCall('/whatsapp-settings', 'POST', settingsData);
            
            if (response.success) {
                this.showAlert('Configurações WhatsApp salvas com sucesso!', 'success');
                
                // Tentar conectar automaticamente
                setTimeout(() => {
                    this.testWhatsAppConnection(true);
                }, 1000);
            } else {
                this.showAlert(response.message || 'Erro ao salvar configurações', 'danger');
            }
        } catch (error) {
            logger?.error('Erro ao salvar configurações WhatsApp:', error);
            this.showAlert('Erro ao salvar configurações. Tente novamente.', 'danger');
        } finally {
            saveButton.innerHTML = originalText;
            saveButton.disabled = false;
        }
    }

    async testWhatsAppConnection(isAutoTest = false) {
        const testButton = document.getElementById('testWhatsAppConnection');
        
        if (!isAutoTest && testButton) {
            const originalText = testButton.innerHTML;
            testButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
            testButton.disabled = true;
        }

        try {
            const response = await this.apiCall('/whatsapp-test', 'POST');
            
            if (response.success) {
                this.showAlert('Conexão WhatsApp testada com sucesso!', 'success');
                this.updateWhatsAppStatus(true, new Date().toISOString());
                
                if (response.data?.phoneNumberId) {
                    // Salvar Phone Number ID automaticamente detectado
                    this.savePhoneNumberId(response.data.phoneNumberId);
                }
            } else {
                this.showAlert(response.message || 'Erro no teste de conexão', 'danger');
                this.updateWhatsAppStatus(false);
            }
        } catch (error) {
            logger?.error('Erro ao testar conexão WhatsApp:', error);
            this.showAlert('Erro ao testar conexão. Verifique suas credenciais.', 'danger');
            this.updateWhatsAppStatus(false);
        } finally {
            if (!isAutoTest && testButton) {
                testButton.innerHTML = '<i class="fas fa-vial"></i> Testar Conexão';
                testButton.disabled = false;
            }
        }
    }

    updateWhatsAppStatus(isConnected, lastTestDate = null) {
        const statusElement = document.querySelector('.whatsapp-status');
        const statusBadge = document.querySelector('.whatsapp-status-badge');
        
        if (statusElement) {
            if (isConnected) {
                statusElement.innerHTML = '<i class="fas fa-check-circle text-success"></i> Conectado';
                statusElement.className = 'whatsapp-status text-success';
                
                if (lastTestDate) {
                    const date = new Date(lastTestDate);
                    const timeString = date.toLocaleString('pt-BR');
                    statusElement.innerHTML += `<br><small class="text-muted">Último teste: ${timeString}</small>`;
                }
            } else {
                statusElement.innerHTML = '<i class="fas fa-times-circle text-danger"></i> Não conectado';
                statusElement.className = 'whatsapp-status text-danger';
            }
        }

        if (statusBadge) {
            if (isConnected) {
                statusBadge.className = 'badge bg-success whatsapp-status-badge';
                statusBadge.textContent = 'Conectado';
            } else {
                statusBadge.className = 'badge bg-danger whatsapp-status-badge';
                statusBadge.textContent = 'Desconectado';
            }
        }
    }

    async savePhoneNumberId(phoneNumberId) {
        try {
            await this.apiCall('/whatsapp-phone-id', 'POST', { phone_number_id: phoneNumberId });
            logger?.log('Phone Number ID salvo automaticamente:', phoneNumberId);
        } catch (error) {
            logger?.error('Erro ao salvar Phone Number ID:', error);
        }
    }

    async apiCall(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` }
        };
        
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`${this.apiUrl}${endpoint}`, options);
        return await response.json();
    }

    showWelcomeMessage() {
        logger?.log('Welcome message');
    }

    async loadInitialData() {
        logger?.log('Loading initial data');
    }

    async loadProfessionals() {
        logger?.log('Loading professionals');
    }

    async loadSettings() {
        logger?.log('Loading settings');
    }

    handleOpenProfessionalModal() {
        logger?.log('Opening professional modal');
    }

    saveProfessional() {
        logger?.log('Saving professional');
    }

    saveProfessionalServiceAssociation() {
        logger?.log('Saving service association');
    }

    saveAvailabilityException() {
        logger?.log('Saving availability exception');
    }

    deleteProfessionalServiceAssociation() {
        logger?.log('Deleting service association');
    }

    deleteAvailabilityException() {
        logger?.log('Deleting availability exception');
    }

    deleteProfessional() {
        logger?.log('Deleting professional');
    }
}

// Global functions
function goBackToDashboard() {
    // Detectar o tipo de usuário baseado no token
    const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
    
    if (token) {
        try {
            // Decodificar token JWT simples
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const decodedToken = JSON.parse(jsonPayload);
            
            // Redirecionar baseado no role do usuário
            if (decodedToken.role === 'super_admin') {
                window.location.href = '/dashboard-standardized.html';
            } else if (decodedToken.role === 'tenant_admin') {
                window.location.href = '/dashboard-tenant-admin.html';
            } else {
                // Fallback para dashboard padrão
                window.location.href = '/dashboard-standardized.html';
            }
        } catch (error) {
            console.error('Erro ao decodificar token:', error);
            // Fallback para dashboard padrão
            window.location.href = '/dashboard-standardized.html';
        }
    } else {
        // Se não há token, redirecionar para login
        window.location.href = '/login.html';
    }
}

// Manter função logout para compatibilidade (se ainda for usada em algum lugar)
function logout() {
    localStorage.removeItem('ubs_token');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('ubs_user');
    window.location.href = '/login.html';
}

function editProfessional(professionalId) {
    if (window.settingsManager) {
        window.settingsManager.editProfessional(professionalId);
    }
}

function deleteProfessional(professionalId) {
    if (window.settingsManager) {
        window.settingsManager.deleteProfessional(professionalId);
    }
}

// Inicia o gerenciador quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager = new SettingsManager();
});