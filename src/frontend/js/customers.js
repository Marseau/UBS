document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/admin';
    const token = localStorage.getItem('adminToken');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // --- State Management ---
    let state = {
        customers: [],
        metrics: {},
        filters: {
            search: '',
            status: '',
        },
        pagination: {
            page: 1,
            pageSize: 10,
            totalCount: 0,
            totalPages: 1,
        },
        sorting: {
            sortBy: 'last_appointment_date',
            sortAsc: false,
        }
    };

    // --- Element Selectors ---
    const elements = {
        totalCustomers: document.getElementById('totalCustomers'),
        activeCustomers: document.getElementById('activeCustomers'),
        newCustomers: document.getElementById('newCustomers'),
        averageLTV: document.getElementById('averageLTV'),
        searchInput: document.getElementById('searchInput'),
        statusFilter: document.getElementById('statusFilter'),
        customerListBody: document.getElementById('customer-list-body'),
        // loadingSpinner: document.getElementById('loading-spinner'), // Assuming this exists
        paginationContainer: document.getElementById('pagination-container'),
    };
    
    // Use UBSUtils for consistent formatting and utilities
    const debounce = UBSUtils.debounce;
    const formatCurrency = UBSUtils.FormatUtils.currency;
    const formatDate = UBSUtils.FormatUtils.date;

    // --- API Fetching ---
    const fetchMetrics = async () => {
        try {
            const response = await fetch(`${API_URL}/customers/metrics`, { headers });
            if (!response.ok) throw new Error('Falha ao carregar métricas.');
            
            state.metrics = await response.json();
            renderMetrics();
        } catch (error) {
            console.error("Error fetching metrics:", error);
            UBSUtils.NotificationManager.error('Erro ao carregar métricas dos clientes');
        }
    };

    const fetchCustomers = async () => {
        // showSpinner(true);
        const { page, pageSize } = state.pagination;
        const { search, status } = state.filters;
        const { sortBy, sortAsc } = state.sorting;
        
        const params = new URLSearchParams({
            page,
            pageSize,
            search,
            status,
            sortBy,
            sortAsc,
        });

        try {
            const response = await fetch(`${API_URL}/customers?${params.toString()}`, { headers });
            if (!response.ok) throw new Error('Falha ao carregar clientes.');

            const data = await response.json();
            state.customers = data.customers;
            state.pagination = {
                ...state.pagination,
                totalCount: data.totalCount,
                totalPages: data.totalPages,
                page: data.page,
            };

            renderCustomers();
            renderPagination();
        } catch (error) {
            console.error("Error fetching customers:", error);
            UBSUtils.NotificationManager.error('Erro ao carregar clientes: ' + error.message);
            elements.customerListBody.innerHTML = `<div class="empty-state p-5 text-center">Ocorreu um erro ao carregar os clientes.</div>`;
        } finally {
            // showSpinner(false);
        }
    };

    // --- Rendering ---
    const renderMetrics = () => {
        const { totalCustomers, activeCustomers, newCustomers, averageLTV } = state.metrics;
        elements.totalCustomers.textContent = totalCustomers || 0;
        elements.activeCustomers.textContent = activeCustomers || 0;
        elements.newCustomers.textContent = newCustomers || 0;
        elements.averageLTV.textContent = formatCurrency(averageLTV);
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            active: { text: 'Ativo', class: 'status-active' },
            inactive: { text: 'Inativo', class: 'status-inactive' },
            blocked: { text: 'Bloqueado', class: 'status-blocked' },
        };
        const { text, className } = statusMap[status] || { text: 'Desconhecido', class: '' };
        return `<span class="status-badge ${className}">${text}</span>`;
    };

    const renderCustomers = () => {
        if (state.customers.length === 0) {
            elements.customerListBody.innerHTML = `<div class="empty-state p-5 text-center">Nenhum cliente encontrado.</div>`;
            return;
        }

        elements.customerListBody.innerHTML = state.customers.map(customer => `
            <div class="customer-row p-3 d-flex flex-wrap align-items-center">
                <div class="col-12 col-md-3 d-flex align-items-center mb-2 mb-md-0">
                    <div class="customer-avatar me-3">${(customer.name || '?').charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="customer-name">${customer.name || 'Nome não informado'}</div>
                        <div class="customer-phone">${customer.phone}</div>
                    </div>
                </div>
                <div class="col-6 col-md-2">
                    <div class="customer-since">Cliente desde ${formatDate(customer.created_at)}</div>
                </div>
                <div class="col-6 col-md-2">
                    <div class="customer-value">${formatCurrency(customer.total_spent)}</div>
                </div>
                <div class="col-6 col-md-2 text-md-center">
                    ${getStatusBadge(customer.status)}
                </div>
                <div class="col-6 col-md-3 text-md-end">
                    <div class="quick-actions">
                        <button class="action-btn btn-message" onclick="sendMessage('${customer.phone}')" title="Enviar Mensagem"><i class="fab fa-whatsapp"></i></button>
                        <button class="action-btn btn-edit" onclick="editCustomer('${customer.id}')" title="Editar Cliente"><i class="fas fa-edit"></i></button>
                        ${customer.status === 'blocked' 
                            ? `<button class="action-btn btn-unblock" onclick="unblockCustomer('${customer.id}')" title="Desbloquear Cliente"><i class="fas fa-unlock"></i></button>`
                            : `<button class="action-btn btn-block" onclick="blockCustomer('${customer.id}')" title="Bloquear Cliente"><i class="fas fa-ban"></i></button>`
                        }
                    </div>
                </div>
            </div>
        `).join('');
    };
    
    const renderPagination = () => {
        const { page, totalPages } = state.pagination;
        if (totalPages <= 1) {
            elements.paginationContainer.innerHTML = '';
            return;
        }

        let html = '<nav><ul class="pagination justify-content-center">';
        
        // Prev button
        html += `<li class="page-item ${page === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${page - 1}">Anterior</a></li>`;

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            html += `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }

        // Next button
        html += `<li class="page-item ${page === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${page + 1}">Próxima</a></li>`;
        
        html += '</ul></nav>';
        elements.paginationContainer.innerHTML = html;
    };


    // --- Event Listeners ---
    const setupEventListeners = () => {
        elements.searchInput.addEventListener('input', debounce(() => {
            state.filters.search = elements.searchInput.value;
            state.pagination.page = 1;
            fetchCustomers();
        }, 500));

        elements.statusFilter.addEventListener('change', () => {
            state.filters.status = elements.statusFilter.value;
            state.pagination.page = 1;
            fetchCustomers();
        });

        elements.paginationContainer.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target.tagName === 'A' && e.target.dataset.page) {
                const newPage = parseInt(e.target.dataset.page, 10);
                if (newPage !== state.pagination.page) {
                    state.pagination.page = newPage;
                    fetchCustomers();
                }
            }
        });
    };

    // --- Initialization ---
    const init = () => {
        setupEventListeners();
        fetchMetrics();
        fetchCustomers();
    };

    init();

    // --- Global Functions for Customer Actions ---
    window.sendMessage = async (phone) => {
        try {
            const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}`;
            window.open(whatsappUrl, '_blank');
        } catch (error) {
            console.error('Error opening WhatsApp:', error);
            alert('Erro ao abrir WhatsApp');
        }
    };

    window.editCustomer = async (customerId) => {
        try {
            // TODO: Implement customer edit modal
            alert('Funcionalidade de edição será implementada em breve');
        } catch (error) {
            console.error('Error editing customer:', error);
            alert('Erro ao editar cliente');
        }
    };

    window.blockCustomer = async (customerId) => {
        const customer = state.customers.find(c => c.id === customerId);
        if (!customer) return;

        const confirmed = confirm(
            `Tem certeza que deseja bloquear o cliente "${customer.name}"? O cliente não poderá mais fazer agendamentos.`
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`${API_URL}/users/${customerId}/block`, {
                method: 'PUT',
                headers
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Erro ao bloquear cliente');
            }

            alert('Cliente bloqueado com sucesso!');
            
            // Update local state
            customer.status = 'blocked';
            renderCustomers();

        } catch (error) {
            console.error('Error blocking customer:', error);
            alert('Erro ao bloquear cliente: ' + error.message);
        }
    };

    window.unblockCustomer = async (customerId) => {
        const customer = state.customers.find(c => c.id === customerId);
        if (!customer) return;

        const confirmed = confirm(
            `Tem certeza que deseja desbloquear o cliente "${customer.name}"? O cliente poderá voltar a fazer agendamentos.`
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`${API_URL}/users/${customerId}/unblock`, {
                method: 'PUT',
                headers
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Erro ao desbloquear cliente');
            }

            alert('Cliente desbloqueado com sucesso!');
            
            // Update local state
            customer.status = 'active';
            renderCustomers();

        } catch (error) {
            console.error('Error unblocking customer:', error);
            alert('Erro ao desbloquear cliente: ' + error.message);
        }
    };
}); 