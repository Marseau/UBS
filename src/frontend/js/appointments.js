class AppointmentsManager {
    constructor() {
        this.apiUrl = '/api/admin';
        this.token = localStorage.getItem('ubs_token');
        this.currentView = 'list'; // 'list' or 'calendar'
        this.currentMonth = new Date();
        this.selectedAppointment = null;
        
        this.state = {
            filters: {
                status: '',
                serviceId: '',
                professionalId: '',
                customerQuery: '',
                startDate: '',
                endDate: ''
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                limit: 15
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        logger?.log('🗓️ Inicializando Appointments Manager...');
        
        if (!this.token) {
            window.location.href = '/login.html';
            return;
        }

        this.cacheDOMElements();
        this.addEventListeners();
        this.initFilters();
        await this.fetchAppointments();
        this.renderCalendar();
        
        logger?.log('✅ Appointments Manager inicializado');
    }

    cacheDOMElements() {
        this.dom = {
            // Filters
            statusFilter: document.getElementById('statusFilter'),
            startDate: document.getElementById('startDate'),
            endDate: document.getElementById('endDate'),
            searchInput: document.getElementById('searchInput'),
            
            // Views
            calendarView: document.getElementById('calendarView'),
            appointmentsView: document.getElementById('appointmentsView'),
            viewToggleText: document.getElementById('viewToggleText'),
            
            // Calendar
            currentMonth: document.getElementById('currentMonth'),
            calendarGrid: document.getElementById('calendarGrid'),
            
            // Table
            appointmentsTableBody: document.getElementById('appointmentsTableBody'),
            pagination: document.getElementById('pagination'),
            totalCount: document.getElementById('totalCount'),
            
            // Modal
            appointmentModal: document.getElementById('appointmentModal'),
            appointmentModalBody: document.getElementById('appointmentModalBody')
        };
    }

    addEventListeners() {
        // Filter events
        this.dom.statusFilter?.addEventListener('change', () => {
            this.state.pagination.currentPage = 1;
            this.fetchAppointments();
        });

        this.dom.startDate?.addEventListener('change', () => {
            this.state.pagination.currentPage = 1;
            this.fetchAppointments();
        });

        this.dom.endDate?.addEventListener('change', () => {
            this.state.pagination.currentPage = 1;
            this.fetchAppointments();
        });

        this.dom.searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.applyFilters();
            }
        });

        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.fetchAppointments(false); // Silent refresh
        }, 30000);
    }

    initFilters() {
        // Set default date range to current month
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        if (this.dom.startDate) {
            this.dom.startDate.value = firstDay.toISOString().split('T')[0];
        }
        if (this.dom.endDate) {
            this.dom.endDate.value = lastDay.toISOString().split('T')[0];
        }
    }

    getFilters() {
        return {
            status: this.dom.statusFilter?.value || '',
            startDate: this.dom.startDate?.value || '',
            endDate: this.dom.endDate?.value || '',
            search: this.dom.searchInput?.value.trim() || ''
        };
    }

    applyFilters() {
        this.state.pagination.currentPage = 1;
        this.fetchAppointments();
    }

    async fetchAppointments(showLoading = true) {
        try {
            if (showLoading) {
                this.showLoading();
            }

            const filters = this.getFilters();
            const params = new URLSearchParams({
                page: this.state.pagination.currentPage,
                limit: this.state.pagination.limit,
                ...filters
            });

            const response = await this.apiCall(`/appointments?${params}`);
            this.renderAppointments(response.appointments || []);
            this.renderPagination(response.pagination || {});
            this.updateCount(response.pagination?.totalItems || 0);

        } catch (error) {
            logger?.error('❌ Erro ao carregar agendamentos:', error);
            this.showError('Erro ao carregar agendamentos');
            this.renderEmptyState();
        }
    }

    renderAppointments(appointments) {
        const tbody = this.dom.appointmentsTableBody;
        
        if (!appointments || appointments.length === 0) {
            this.renderEmptyState();
            return;
        }

        const appointmentsHtml = appointments.map(appointment => {
            const startTime = new Date(appointment.start_time);
            const date = startTime.toLocaleDateString('pt-BR');
            const time = startTime.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const statusClass = `status-${appointment.status}`;
            const statusText = this.getStatusText(appointment.status);
            const price = this.formatPrice(appointment.total_price || 0);

            return `
                <tr class="appointment-row" onclick="openAppointmentModal('${appointment.id}')">
                    <td>
                        <div class="appointment-time">${date}</div>
                        <small class="text-muted">${time}</small>
                    </td>
                    <td>
                        <div class="service-name">${appointment.user_name || 'Cliente não identificado'}</div>
                        <small class="customer-name">${appointment.user_phone || ''}</small>
                    </td>
                    <td>
                        <div class="service-name">${appointment.service_name || 'Serviço não especificado'}</div>
                        ${appointment.professional_name ? `<small class="text-muted">${appointment.professional_name}</small>` : ''}
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                    <td>
                        <span class="appointment-price">${price}</span>
                    </td>
                    <td>
                        <div class="quick-actions">
                            ${this.getQuickActions(appointment)}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = appointmentsHtml;
    }

    getQuickActions(appointment) {
        const actions = [];

        if (appointment.status === 'confirmed') {
            actions.push(`
                <button class="action-btn btn-complete" onclick="event.stopPropagation(); quickComplete('${appointment.id}')" title="Completar">
                    <i class="fas fa-check"></i>
                </button>
            `);
        }

        if (['pending', 'confirmed'].includes(appointment.status)) {
            actions.push(`
                <button class="action-btn btn-cancel" onclick="event.stopPropagation(); quickCancel('${appointment.id}')" title="Cancelar">
                    <i class="fas fa-times"></i>
                </button>
            `);
        }

        actions.push(`
            <button class="action-btn btn-edit" onclick="event.stopPropagation(); openAppointmentModal('${appointment.id}')" title="Ver detalhes">
                <i class="fas fa-eye"></i>
            </button>
        `);

        return actions.join('');
    }

    renderEmptyState() {
        const tbody = this.dom.appointmentsTableBody;
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fas fa-calendar-times fa-3x mb-3"></i>
                        <h5>Nenhum agendamento encontrado</h5>
                        <p class="text-muted">Tente ajustar os filtros ou criar um novo agendamento</p>
                        <button class="btn btn-primary" onclick="newAppointment()">
                            <i class="fas fa-plus"></i> Novo Agendamento
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    showLoading() {
        const tbody = this.dom.appointmentsTableBody;
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="loading-spinner">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Carregando...</span>
                        </div>
                        <p class="mt-2 mb-0">Carregando agendamentos...</p>
                    </div>
                </td>
            </tr>
        `;
    }

    renderPagination(pagination) {
        const paginationEl = this.dom.pagination;
        
        if (!pagination || pagination.totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        const { currentPage, totalPages } = pagination;
        let paginationHtml = '';

        // Previous button
        if (currentPage > 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="goToPage(${currentPage - 1})">
                        <i class="fas fa-chevron-left"></i>
                    </a>
                </li>
            `;
        }

        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        for (let page = startPage; page <= endPage; page++) {
            const isActive = page === currentPage;
            paginationHtml += `
                <li class="page-item ${isActive ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="goToPage(${page})">${page}</a>
                </li>
            `;
        }

        // Next button
        if (currentPage < totalPages) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="goToPage(${currentPage + 1})">
                        <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `;
        }

        paginationEl.innerHTML = paginationHtml;
    }

    updateCount(total) {
        if (this.dom.totalCount) {
            this.dom.totalCount.textContent = total.toLocaleString();
        }
    }

    // Calendar functionality
    renderCalendar() {
        if (!this.dom.calendarGrid) return;

        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();
        
        // Update month display
        const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        if (this.dom.currentMonth) {
            this.dom.currentMonth.textContent = `${monthNames[month]} ${year}`;
        }

        // Generate calendar grid
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

        let calendarHtml = '';
        
        // Week headers
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        weekDays.forEach(day => {
            calendarHtml += `<div class="calendar-day" style="background: var(--primary-color); color: white; text-align: center; font-weight: 600;">${day}</div>`;
        });

        // Calendar days
        for (let week = 0; week < 6; week++) {
            for (let day = 0; day < 7; day++) {
                const currentDate = new Date(startDate);
                currentDate.setDate(startDate.getDate() + (week * 7) + day);
                
                const isOtherMonth = currentDate.getMonth() !== month;
                const isToday = this.isToday(currentDate);
                
                let dayClass = 'calendar-day';
                if (isOtherMonth) dayClass += ' other-month';
                if (isToday) dayClass += ' today';

                calendarHtml += `
                    <div class="${dayClass}" onclick="selectCalendarDay('${currentDate.toISOString().split('T')[0]}')">
                        <span>${currentDate.getDate()}</span>
                        <div class="appointment-dot" style="display: none;"></div>
                    </div>
                `;
            }
        }

        this.dom.calendarGrid.innerHTML = calendarHtml;
    }

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    // Utility methods
    getStatusText(status) {
        const statusMap = {
            'confirmed': 'Confirmado',
            'completed': 'Concluído',
            'cancelled': 'Cancelado',
            'pending': 'Pendente',
            'no_show': 'Não compareceu'
        };
        return statusMap[status] || status;
    }

    formatPrice(price) {
        if (!price || price === 0) return 'A definir';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }

    async apiCall(endpoint, options = {}) {
        const url = this.apiUrl + endpoint;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            ...options
        };

        const response = await fetch(url, config);
        
        if (response.status === 401) {
            localStorage.removeItem('ubs_token');
            window.location.href = '/login.html';
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }
}

// Global functions for HTML onclick handlers
function toggleView() {
    const calendarView = document.getElementById('calendarView');
    const appointmentsView = document.getElementById('appointmentsView');
    const toggleText = document.getElementById('viewToggleText');
    
    if (window.appointmentsManager.currentView === 'list') {
        calendarView.style.display = 'block';
        appointmentsView.style.display = 'none';
        toggleText.textContent = 'Lista';
        window.appointmentsManager.currentView = 'calendar';
        window.appointmentsManager.renderCalendar();
    } else {
        calendarView.style.display = 'none';
        appointmentsView.style.display = 'block';
        toggleText.textContent = 'Calendário';
        window.appointmentsManager.currentView = 'list';
    }
}

function previousMonth() {
    window.appointmentsManager.currentMonth.setMonth(window.appointmentsManager.currentMonth.getMonth() - 1);
    window.appointmentsManager.renderCalendar();
}

function nextMonth() {
    window.appointmentsManager.currentMonth.setMonth(window.appointmentsManager.currentMonth.getMonth() + 1);
    window.appointmentsManager.renderCalendar();
}

function selectCalendarDay(date) {
    // Filter appointments for selected day
    document.getElementById('startDate').value = date;
    document.getElementById('endDate').value = date;
    
    // Switch to list view and load appointments
    if (window.appointmentsManager.currentView === 'calendar') {
        toggleView();
    }
    window.appointmentsManager.state.pagination.currentPage = 1;
    window.appointmentsManager.fetchAppointments();
}

function applyFilters() {
    window.appointmentsManager.applyFilters();
}

function clearFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('searchInput').value = '';
    
    window.appointmentsManager.initFilters();
    window.appointmentsManager.state.pagination.currentPage = 1;
    window.appointmentsManager.fetchAppointments();
}

function goToPage(page) {
    window.appointmentsManager.state.pagination.currentPage = page;
    window.appointmentsManager.fetchAppointments();
}

function newAppointment() {
    const modal = new bootstrap.Modal(document.getElementById('appointmentModal'));
    const modalBody = document.getElementById('appointmentModalBody');
    
    modalBody.innerHTML = `
        <form id="newAppointmentForm">
            <div class="row">
                <div class="col-md-6">
                    <div class="form-floating mb-3">
                        <input type="text" class="form-control" id="customerName" placeholder="Nome do cliente" required>
                        <label for="customerName">Nome do Cliente</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-floating mb-3">
                        <input type="tel" class="form-control" id="customerPhone" placeholder="(11) 99999-9999" required>
                        <label for="customerPhone">Telefone</label>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-floating mb-3">
                        <input type="date" class="form-control" id="appointmentDate" required>
                        <label for="appointmentDate">Data</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-floating mb-3">
                        <input type="time" class="form-control" id="appointmentTime" required>
                        <label for="appointmentTime">Horário</label>
                    </div>
                </div>
            </div>
            <div class="form-floating mb-3">
                <select class="form-select" id="serviceSelect" required>
                    <option value="">Selecione um serviço</option>
                </select>
                <label for="serviceSelect">Serviço</label>
            </div>
            <div class="form-floating mb-3">
                <textarea class="form-control" id="appointmentNotes" placeholder="Observações" style="height: 100px"></textarea>
                <label for="appointmentNotes">Observações (opcional)</label>
            </div>
        </form>
    `;
    
    // Update modal footer
    document.querySelector('#appointmentModal .modal-footer').innerHTML = `
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="saveNewAppointment()">
            <i class="fas fa-save"></i> Salvar Agendamento
        </button>
    `;
    
    document.querySelector('#appointmentModal .modal-title').textContent = 'Novo Agendamento';
    
    // Set default date to today
    document.getElementById('appointmentDate').value = new Date().toISOString().split('T')[0];
    
    modal.show();
}

async function openAppointmentModal(appointmentId) {
    try {
        const appointment = await window.appointmentsManager.apiCall(`/appointments/${appointmentId}`);
        const modal = new bootstrap.Modal(document.getElementById('appointmentModal'));
        const modalBody = document.getElementById('appointmentModalBody');
        
        const startTime = new Date(appointment.start_time);
        const endTime = appointment.end_time ? new Date(appointment.end_time) : null;
        
        modalBody.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Informações do Cliente</h6>
                    <p><strong>Nome:</strong> ${appointment.user_name || 'Não informado'}</p>
                    <p><strong>Telefone:</strong> ${appointment.user_phone || 'Não informado'}</p>
                    <p><strong>Email:</strong> ${appointment.user_email || 'Não informado'}</p>
                </div>
                <div class="col-md-6">
                    <h6>Detalhes do Agendamento</h6>
                    <p><strong>Data:</strong> ${startTime.toLocaleDateString('pt-BR')}</p>
                    <p><strong>Horário:</strong> ${startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        ${endTime ? ` - ${endTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                    <p><strong>Serviço:</strong> ${appointment.service_name || 'Não especificado'}</p>
                    <p><strong>Profissional:</strong> ${appointment.professional_name || 'Não especificado'}</p>
                    <p><strong>Status:</strong> <span class="status-badge status-${appointment.status}">${window.appointmentsManager.getStatusText(appointment.status)}</span></p>
                    <p><strong>Valor:</strong> ${window.appointmentsManager.formatPrice(appointment.total_price)}</p>
                </div>
            </div>
            ${appointment.notes ? `
                <div class="row mt-3">
                    <div class="col-12">
                        <h6>Observações</h6>
                        <p class="text-muted">${appointment.notes}</p>
                    </div>
                </div>
            ` : ''}
            ${appointment.appointment_data ? `
                <div class="row mt-3">
                    <div class="col-12">
                        <h6>Informações Adicionais</h6>
                        <pre class="small text-muted">${JSON.stringify(appointment.appointment_data, null, 2)}</pre>
                    </div>
                </div>
            ` : ''}
        `;
        
        // Update modal footer based on appointment status
        let footerButtons = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>`;
        
        if (appointment.status === 'pending') {
            footerButtons += `
                <button type="button" class="btn btn-success" onclick="updateAppointmentStatus('${appointmentId}', 'confirmed')">
                    <i class="fas fa-check"></i> Confirmar
                </button>
                <button type="button" class="btn btn-danger" onclick="updateAppointmentStatus('${appointmentId}', 'cancelled')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `;
        } else if (appointment.status === 'confirmed') {
            footerButtons += `
                <button type="button" class="btn btn-success" onclick="updateAppointmentStatus('${appointmentId}', 'completed')">
                    <i class="fas fa-check-double"></i> Completar
                </button>
                <button type="button" class="btn btn-danger" onclick="updateAppointmentStatus('${appointmentId}', 'cancelled')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `;
        }
        
        document.querySelector('#appointmentModal .modal-footer').innerHTML = footerButtons;
        document.querySelector('#appointmentModal .modal-title').textContent = `Agendamento #${appointmentId}`;
        
        window.appointmentsManager.selectedAppointment = appointment;
        modal.show();
        
    } catch (error) {
        logger?.error('Erro ao carregar detalhes do agendamento:', error);
        window.appointmentsManager.showError('Erro ao carregar detalhes do agendamento');
    }
}

async function quickComplete(appointmentId) {
    if (!confirm('Tem certeza que deseja marcar este agendamento como completado?')) {
        return;
    }
    
    try {
        await window.appointmentsManager.apiCall(`/appointments/${appointmentId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'completed' })
        });
        
        window.appointmentsManager.showSuccess('Agendamento completado com sucesso!');
        window.appointmentsManager.fetchAppointments(false);
        
    } catch (error) {
        logger?.error('Erro ao completar agendamento:', error);
        window.appointmentsManager.showError('Erro ao completar agendamento');
    }
}

async function quickCancel(appointmentId) {
    if (!confirm('Tem certeza que deseja cancelar este agendamento?')) {
        return;
    }
    
    try {
        await window.appointmentsManager.apiCall(`/appointments/${appointmentId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'cancelled' })
        });
        
        window.appointmentsManager.showSuccess('Agendamento cancelado com sucesso!');
        window.appointmentsManager.fetchAppointments(false);
        
    } catch (error) {
        logger?.error('Erro ao cancelar agendamento:', error);
        window.appointmentsManager.showError('Erro ao cancelar agendamento');
    }
}

async function exportAppointments() {
    try {
        const filters = window.appointmentsManager.getFilters();
        const params = new URLSearchParams({
            format: 'csv',
            ...filters
        });
        
        const response = await fetch(`${window.appointmentsManager.apiUrl}/appointments/export?${params}`, {
            headers: {
                'Authorization': `Bearer ${window.appointmentsManager.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao exportar agendamentos');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agendamentos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        window.appointmentsManager.showSuccess('Agendamentos exportados com sucesso!');
        
    } catch (error) {
        logger?.error('Erro ao exportar agendamentos:', error);
        window.appointmentsManager.showError('Erro ao exportar agendamentos');
    }
}

// Additional global functions for appointment actions
async function saveNewAppointment() {
    try {
        const form = document.getElementById('newAppointmentForm');
        const formData = new FormData(form);
        
        const appointmentData = {
            user_name: document.getElementById('customerName').value,
            user_phone: document.getElementById('customerPhone').value,
            start_time: `${document.getElementById('appointmentDate').value}T${document.getElementById('appointmentTime').value}:00`,
            service_id: document.getElementById('serviceSelect').value,
            notes: document.getElementById('appointmentNotes').value || null,
            status: 'pending'
        };
        
        await window.appointmentsManager.apiCall('/appointments', {
            method: 'POST',
            body: JSON.stringify(appointmentData)
        });
        
        window.appointmentsManager.showSuccess('Agendamento criado com sucesso!');
        bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
        window.appointmentsManager.fetchAppointments(false);
        
    } catch (error) {
        logger?.error('Erro ao criar agendamento:', error);
        window.appointmentsManager.showError('Erro ao criar agendamento');
    }
}

async function updateAppointmentStatus(appointmentId, newStatus) {
    try {
        await window.appointmentsManager.apiCall(`/appointments/${appointmentId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        
        const statusText = window.appointmentsManager.getStatusText(newStatus);
        window.appointmentsManager.showSuccess(`Agendamento ${statusText.toLowerCase()} com sucesso!`);
        bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
        window.appointmentsManager.fetchAppointments(false);
        
    } catch (error) {
        logger?.error('Erro ao atualizar status:', error);
        window.appointmentsManager.showError('Erro ao atualizar status do agendamento');
    }
}

// Initialize when page loads
window.appointmentsManager = new AppointmentsManager(); 