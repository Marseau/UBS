/**
 * Tenant Admin Dashboard JavaScript
 * 
 * Sistema de dashboard para administradores de tenant com funcionalidades:
 * - Gestão de KPIs do estabelecimento
 * - Gráficos de performance operacional
 * - Quick actions e export de dados
 * - Real-time updates e period selector
 * - Mobile responsive interface
 * 
 * @author Claude Code
 * @version 1.0.0
 */

class TenantAdminDashboard {
    constructor() {
        this.currentPeriod = '30';
        this.autoRefreshInterval = null;
        this.chartsInitialized = false;
        this.currentTenantId = null;
        this.lastUpdateTime = null;
        
        // Widget system integration
        this.widgets = new Map();
        this.widgetFactory = null;
        
        // Performance optimization
        this.lazyLoadElements = new Map();
        this.intersectionObserver = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Tenant Admin Dashboard...');
        
        try {
            // Setup authentication and user info
            await this.initializeUser();
            
            // Setup UI components
            this.setupSidebarToggle();
            this.setupMobileNavigation();
            this.setupActiveNavigation();
            this.setupRealTimeClock();
            this.setupPeriodSelector();
            this.setupFloatingActionButton();
            this.setupCustomization();
            this.setupLazyLoading();
            this.setupAccessibility();
            
            // Load tenant data
            await this.loadTenantData();
            
            // Initialize widget system
            this.initializeWidgetSystem();
            
            // Initialize charts and widgets
            this.initializeCharts();
            this.setupAutoRefresh();
            
            console.log('✅ Tenant Admin Dashboard inicializado com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar dashboard:', error);
            this.showErrorState(error.message);
        }
    }

    // ==============================================
    // Widget System Integration
    // ==============================================
    
    initializeWidgetSystem() {
        console.log('🧩 Inicializando sistema de widgets...');
        
        try {
            // Initialize widget factory if available
            if (typeof window.DashboardWidgetFactory !== 'undefined') {
                this.widgetFactory = new window.DashboardWidgetFactory();
                console.log('✅ Widget factory inicializada');
            }
            
            // Register tenant admin widgets
            this.registerTenantWidgets();
            
        } catch (error) {
            console.warn('⚠️ Widget system não disponível:', error);
        }
    }
    
    registerTenantWidgets() {
        if (!this.widgetFactory) return;
        
        // Register KPI Card Widget
        this.widgets.set('kpi-card', {
            type: 'stat-card',
            updateMethod: this.updateKPICard.bind(this),
            errorBoundary: true
        });
        
        // Register Chart Widgets
        this.widgets.set('revenue-chart', {
            type: 'chart',
            chartType: 'line',
            updateMethod: this.updateRevenueChart.bind(this),
            errorBoundary: true
        });
        
        this.widgets.set('customer-chart', {
            type: 'chart', 
            chartType: 'line',
            updateMethod: this.updateCustomerChart.bind(this),
            errorBoundary: true
        });
        
        this.widgets.set('appointments-chart', {
            type: 'chart',
            chartType: 'line', 
            updateMethod: this.updateAppointmentsChart.bind(this),
            errorBoundary: true
        });
        
        this.widgets.set('services-chart', {
            type: 'chart',
            chartType: 'doughnut',
            updateMethod: this.updateServicesChart.bind(this),
            errorBoundary: true
        });
        
        // Register List Widgets
        this.widgets.set('appointments-list', {
            type: 'list',
            updateMethod: this.updateUpcomingAppointments.bind(this),
            errorBoundary: true
        });
        
        this.widgets.set('customers-list', {
            type: 'list',
            updateMethod: this.updateTopCustomers.bind(this),
            errorBoundary: true
        });
        
        console.log(`🧩 Registrados ${this.widgets.size} widgets`);
    }
    
    updateWidget(widgetId, data) {
        const widget = this.widgets.get(widgetId);
        if (!widget) {
            console.warn(`⚠️ Widget ${widgetId} não encontrado`);
            return;
        }
        
        try {
            // Show loading state
            this.showWidgetLoading(widgetId);
            
            // Update widget with error boundary
            if (widget.errorBoundary) {
                this.safeUpdateWidget(widget, data);
            } else {
                widget.updateMethod(data);
            }
            
            // Show success state
            this.showWidgetSuccess(widgetId);
            
        } catch (error) {
            console.error(`❌ Erro ao atualizar widget ${widgetId}:`, error);
            this.showWidgetError(widgetId, error.message);
        }
    }
    
    safeUpdateWidget(widget, data) {
        try {
            widget.updateMethod(data);
        } catch (error) {
            throw new Error(`Widget update failed: ${error.message}`);
        }
    }
    
    showWidgetLoading(widgetId) {
        // Use UBS widget system if available
        if (typeof window.ubsWidgetSystem !== 'undefined') {
            window.ubsWidgetSystem.showLoading(widgetId);
        }
    }
    
    showWidgetSuccess(widgetId) {
        // Use UBS widget system if available
        if (typeof window.ubsWidgetSystem !== 'undefined') {
            window.ubsWidgetSystem.showSuccess(widgetId);
        }
    }
    
    showWidgetError(widgetId, error) {
        // Use UBS widget system if available
        if (typeof window.ubsWidgetSystem !== 'undefined') {
            window.ubsWidgetSystem.showError(widgetId, error);
        }
    }
    
    refreshWidget(widgetId) {
        console.log(`🔄 Atualizando widget ${widgetId}...`);
        
        // Reload data specific to widget
        if (widgetId.includes('chart')) {
            // Reload chart data
            this.loadTenantData();
        } else if (widgetId.includes('list')) {
            // Reload list data
            this.loadTenantData();
        } else if (widgetId.includes('kpi')) {
            // Reload KPI data
            this.loadTenantData();
        }
    }

    // ==============================================
    // Authentication & User Management
    // ==============================================
    
    async initializeUser() {
        const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
        
        if (!token) {
            console.warn('🚫 Token não encontrado, usando modo demo');
            this.updateUserInterface({
                name: 'Tenant Admin',
                role: 'tenant_admin'
            });
            return;
        }
        
        try {
            const response = await fetch('/api/admin/user-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const userInfo = await response.json();
                this.currentTenantId = userInfo.data.tenantId;
                this.updateUserInterface(userInfo.data);
            } else {
                throw new Error('API não disponível');
            }
        } catch (error) {
            console.warn('API não disponível, usando dados mock:', error);
            this.updateUserInterface({
                name: 'Tenant Admin',
                role: 'tenant_admin'
            });
        }
    }
    
    updateUserInterface(userInfo) {
        const userNameElement = document.getElementById('userName');
        const userRoleElement = document.getElementById('userRole');
        const userAvatarElement = document.getElementById('userAvatar');
        
        if (userNameElement) userNameElement.textContent = userInfo.name || 'Tenant Admin';
        if (userRoleElement) userRoleElement.textContent = userInfo.role === 'tenant_admin' ? 'Administrador' : 'Administrador';
        if (userAvatarElement) userAvatarElement.textContent = (userInfo.name || 'Tenant Admin').charAt(0).toUpperCase();
    }

    // ==============================================
    // UI Setup & Navigation
    // ==============================================
    
    setupSidebarToggle() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        
        if (sidebarToggle && sidebar && mainContent) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
                
                // Mobile overlay
                if (window.innerWidth <= 768) {
                    sidebar.classList.toggle('mobile-open');
                    sidebarOverlay?.classList.toggle('show');
                }
            });
        }
    }
    
    setupMobileNavigation() {
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebar = document.getElementById('sidebar');
        
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar?.classList.remove('mobile-open');
                sidebarOverlay.classList.remove('show');
            });
        }
    }
    
    setupActiveNavigation() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.sidebar .nav-link');
        
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && currentPath.includes(href)) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
    
    setupRealTimeClock() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            const clockElement = document.getElementById('realTimeClock');
            if (clockElement) {
                clockElement.textContent = timeStr;
            }
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }
    
    setupPeriodSelector() {
        const periodSelector = document.getElementById('globalPeriodSelector');
        
        if (periodSelector) {
            // Load saved period from localStorage
            const savedPeriod = localStorage.getItem('tenantDashboardPeriod');
            if (savedPeriod) {
                this.currentPeriod = savedPeriod;
                periodSelector.value = savedPeriod;
            }
            
            // Setup period change handler
            periodSelector.addEventListener('change', (e) => {
                this.changePeriod(e.target.value);
            });
        }
    }
    
    setupFloatingActionButton() {
        const mainFab = document.getElementById('mainFab');
        const fabMenu = document.getElementById('fabMenu');
        
        if (mainFab && fabMenu) {
            let isOpen = false;
            
            mainFab.addEventListener('click', () => {
                isOpen = !isOpen;
                
                if (isOpen) {
                    mainFab.classList.add('active');
                    fabMenu.classList.add('show');
                } else {
                    mainFab.classList.remove('active');
                    fabMenu.classList.remove('show');
                }
            });
            
            // Close FAB menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.fab-container') && isOpen) {
                    isOpen = false;
                    mainFab.classList.remove('active');
                    fabMenu.classList.remove('show');
                }
            });
        }
    }
    
    setupCustomization() {
        // Load saved customization preferences
        this.loadCustomizationPreferences();
        
        // Setup theme selector
        this.setupThemeSelector();
        
        // Add customization button to user menu
        this.addCustomizationToMenu();
    }
    
    setupThemeSelector() {
        const colorOptions = document.querySelectorAll('.color-option');
        
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove active class from all options
                colorOptions.forEach(opt => opt.classList.remove('active'));
                
                // Add active class to clicked option
                option.classList.add('active');
                
                // Apply theme
                const theme = option.dataset.theme;
                this.applyTheme(theme);
            });
        });
    }
    
    addCustomizationToMenu() {
        const userDropdown = document.querySelector('.dropdown-menu');
        if (userDropdown) {
            const customizationItem = document.createElement('li');
            customizationItem.innerHTML = `
                <a class="dropdown-item compact-dropdown-item" href="#" onclick="showCustomization()">
                    <i class="fas fa-palette me-2"></i>Personalizar
                </a>
            `;
            
            // Insert before the last divider
            const dividers = userDropdown.querySelectorAll('.dropdown-divider');
            if (dividers.length > 0) {
                userDropdown.insertBefore(customizationItem, dividers[dividers.length - 1]);
            }
        }
    }

    // ==============================================
    // Data Loading & Management
    // ==============================================
    
    async loadTenantData() {
        if (!this.currentTenantId) {
            console.warn('⚠️ Tenant ID não disponível, usando dados mock');
            this.loadMockData();
            return;
        }
        
        try {
            this.showLoadingState();
            
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const response = await fetch(`/api/admin/analytics/tenant-dashboard?tenant_id=${this.currentTenantId}&period=${this.currentPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                this.updateDashboardData(result.data);
            } else {
                throw new Error('Erro ao carregar dados do tenant');
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            this.loadMockData();
        } finally {
            this.hideLoadingState();
            this.updateLastUpdateTime();
        }
    }
    
    loadMockData() {
        const mockData = {
            kpis: {
                appointments: { value: 143, trend: '+12%', direction: 'up' },
                revenue: { value: 'R$ 8.450', trend: '+8%', direction: 'up' },
                customers: { value: 89, trend: '+5%', direction: 'up' },
                services: { value: 12, trend: '0%', direction: 'stable' },
                newCustomers: { value: 23, trend: '+15%', direction: 'up' },
                cancellationRate: { value: '8%', trend: '-2%', direction: 'down' },
                avgSession: { value: '24 min', trend: '+3%', direction: 'up' },
                aiUsage: { value: 156, trend: '+18%', direction: 'up' }
            },
            charts: {
                revenue: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    data: [7200, 8000, 8100, 8300, 8200, 8450]
                },
                customers: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    data: [65, 72, 0, 82, 86, 89]
                },
                appointments: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    data: [98, 105, 118, 132, 139, 143]
                },
                services: {
                    labels: ['Corte', 'Escova', 'Coloração', 'Tratamento', 'Outros'],
                    data: [35, 25, 20, 15, 5]
                }
            },
            lists: {
                upcomingAppointments: [
                    { client: 'Maria Silva', service: 'Corte + Escova', time: '14:30', status: 'confirmed' },
                    { client: 'João Santos', service: 'Barba', time: '15:00', status: 'confirmed' },
                    { client: 'Ana Costa', service: 'Coloração', time: '16:00', status: 'pending' }
                ],
                topCustomers: [
                    { name: 'Maria Silva', visits: 12, spent: 'R$ 1.200', loyalty: 'VIP' },
                    { name: 'Ana Costa', visits: 8, spent: 'R$ 890', loyalty: 'Gold' },
                    { name: 'João Santos', visits: 6, spent: 'R$ 650', loyalty: 'Silver' }
                ]
            }
        };
        
        this.updateDashboardData(mockData);
    }
    
    updateDashboardData(data) {
        // Update KPI cards
        if (data.kpis) {
            this.updateKPICards(data.kpis);
        }
        
        // Update charts
        if (data.charts) {
            this.updateCharts(data.charts);
        }
        
        // Update lists
        if (data.lists) {
            this.updateLists(data.lists);
        }
    }
    
    updateKPICards(kpis) {
        // Update KPI 1: Agendamentos
        this.updateKPICard('tenant-appointments', kpis.appointments?.value || '--', 
                          'appointments-trend', kpis.appointments?.trend, kpis.appointments?.direction);
        
        // Update KPI 2: Receita
        this.updateKPICard('tenant-revenue', kpis.revenue?.value || '--', 
                          'revenue-trend', kpis.revenue?.trend, kpis.revenue?.direction);
        
        // Update KPI 3: Clientes
        this.updateKPICard('tenant-customers', kpis.customers?.value || '--', 
                          'customers-trend', kpis.customers?.trend, kpis.customers?.direction);
        
        // Update KPI 4: Serviços
        this.updateKPICard('tenant-services', kpis.services?.value || '--', 
                          'services-trend', kpis.services?.trend, kpis.services?.direction);
        
        // Update KPI 5: Novos Clientes
        this.updateKPICard('new-customers', kpis.newCustomers?.value || '--', 
                          'new-customers-trend', kpis.newCustomers?.trend, kpis.newCustomers?.direction);
        
        // Update KPI 6: Taxa de Cancelamento
        this.updateKPICard('cancellation-rate', kpis.cancellationRate?.value || '--', 
                          'cancellation-trend', kpis.cancellationRate?.trend, kpis.cancellationRate?.direction);
        
        // Update KPI 7: Duração Média
        this.updateKPICard('avg-session', kpis.avgSession?.value || '--', 
                          'session-trend', kpis.avgSession?.trend, kpis.avgSession?.direction);
        
        // Update KPI 8: Uso de IA
        this.updateKPICard('ai-usage', kpis.aiUsage?.value || '--', 
                          'ai-usage-trend', kpis.aiUsage?.trend, kpis.aiUsage?.direction);
    }
    
    updateKPICard(valueId, value, trendId, trend, direction) {
        const valueElement = document.getElementById(valueId);
        const trendElement = document.getElementById(trendId);
        
        if (valueElement) {
            valueElement.textContent = value;
        }
        
        if (trendElement && trend) {
            const trendClass = direction === 'up' ? 'trend-positive' : 
                             direction === 'down' ? 'trend-negative' : 'trend-neutral';
            const trendIcon = direction === 'up' ? 'fas fa-arrow-up' : 
                            direction === 'down' ? 'fas fa-arrow-down' : 'fas fa-minus';
            
            // Para taxa de cancelamento, inverter as cores (down = good, up = bad)
            const finalTrendClass = trendId === 'cancellation-trend' ? 
                (direction === 'down' ? 'trend-positive' : direction === 'up' ? 'trend-negative' : 'trend-neutral') : 
                trendClass;
            
            trendElement.className = `metric-trend ${finalTrendClass}`;
            trendElement.innerHTML = `
                <i class="${trendIcon}"></i>
                <small>${trend}</small>
            `;
        }
    }

    // ==============================================
    // Charts Management
    // ==============================================
    
    initializeCharts() {
        console.log('📊 Inicializando gráficos...');
        
        // Initialize with empty/loading state
        this.initializeRevenueChart();
        this.initializeCustomerChart();
        this.initializeAppointmentsChart();
        this.initializeServicesChart();
        
        this.chartsInitialized = true;
    }
    
    updateCharts(chartsData) {
        console.log('📊 Atualizando gráficos:', chartsData);
        
        if (!this.chartsInitialized) {
            this.initializeCharts();
        }
        
        // Update each chart with new data
        if (chartsData.revenue) {
            this.updateRevenueChart(chartsData.revenue);
        }
        
        if (chartsData.customers) {
            this.updateCustomerChart(chartsData.customers);
        }
        
        if (chartsData.appointments) {
            this.updateAppointmentsChart(chartsData.appointments);
        }
        
        if (chartsData.services) {
            this.updateServicesChart(chartsData.services);
        }
    }
    
    initializeRevenueChart() {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }
        
        this.revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Carregando...'],
                datasets: [{
                    label: 'Receita (R$)',
                    data: [0],
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Receita: ${this.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatCurrency(value)
                        }
                    }
                }
            }
        });
    }
    
    updateRevenueChart(data) {
        if (!this.revenueChart) return;
        
        this.revenueChart.data.labels = data.labels || [];
        this.revenueChart.data.datasets[0].data = data.data || [];
        this.revenueChart.update();
    }
    
    initializeCustomerChart() {
        const ctx = document.getElementById('customerChart');
        if (!ctx) return;
        
        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }
        
        this.customerChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Carregando...'],
                datasets: [{
                    label: 'Clientes Ativos',
                    data: [0],
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Clientes: ${context.parsed.y}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    updateCustomerChart(data) {
        if (!this.customerChart) return;
        
        this.customerChart.data.labels = data.labels || [];
        this.customerChart.data.datasets[0].data = data.data || [];
        this.customerChart.update();
    }
    
    initializeAppointmentsChart() {
        const ctx = document.getElementById('appointmentsChart');
        if (!ctx) return;
        
        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }
        
        this.appointmentsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Carregando...'],
                datasets: [{
                    label: 'Agendamentos',
                    data: [0],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Agendamentos: ${context.parsed.y}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    updateAppointmentsChart(data) {
        if (!this.appointmentsChart) return;
        
        this.appointmentsChart.data.labels = data.labels || [];
        this.appointmentsChart.data.datasets[0].data = data.data || [];
        this.appointmentsChart.update();
    }
    
    initializeServicesChart() {
        const ctx = document.getElementById('servicesChart');
        if (!ctx) return;
        
        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }
        
        this.servicesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Carregando...'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#cccccc'],
                    borderWidth: 3,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${percentage}% (${value})`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }
    
    updateServicesChart(data) {
        if (!this.servicesChart) return;
        
        const colors = [
            '#2D5A9B', '#28a745', '#ffc107', '#dc3545', '#6c757d',
            '#17a2b8', '#6f42c1', '#e83e8c', '#fd7e14', '#20c997'
        ];
        
        this.servicesChart.data.labels = data.labels || [];
        this.servicesChart.data.datasets[0].data = data.data || [];
        this.servicesChart.data.datasets[0].backgroundColor = colors.slice(0, data.labels?.length || 1);
        this.servicesChart.update();
    }
    
    destroyCharts() {
        console.log('🧹 Limpando gráficos...');
        
        if (this.revenueChart) {
            this.revenueChart.destroy();
            this.revenueChart = null;
        }
        
        if (this.customerChart) {
            this.customerChart.destroy();
            this.customerChart = null;
        }
        
        if (this.appointmentsChart) {
            this.appointmentsChart.destroy();
            this.appointmentsChart = null;
        }
        
        if (this.servicesChart) {
            this.servicesChart.destroy();
            this.servicesChart = null;
        }
        
        this.chartsInitialized = false;
    }

    // ==============================================
    // Lists & Actions Management
    // ==============================================
    
    updateLists(listsData) {
        if (listsData.upcomingAppointments) {
            this.updateUpcomingAppointments(listsData.upcomingAppointments);
        }
        
        if (listsData.topCustomers) {
            this.updateTopCustomers(listsData.topCustomers);
        }
    }
    
    updateUpcomingAppointments(appointments) {
        const container = document.getElementById('upcomingAppointmentsList');
        if (!container) return;
        
        if (appointments.length === 0) {
            container.innerHTML = `
                <div class="list-group-item text-center">
                    <i class="fas fa-calendar-plus text-muted mb-2"></i>
                    <p class="text-muted mb-0">Nenhum agendamento próximo</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        appointments.forEach(appointment => {
            const statusClass = appointment.status === 'confirmed' ? 'success' : 'warning';
            const statusText = appointment.status === 'confirmed' ? 'Confirmado' : 'Pendente';
            
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div>
                    <h6 class="mb-1">${appointment.client}</h6>
                    <small class="text-muted">${appointment.service} • ${appointment.time}</small>
                </div>
                <div>
                    <span class="badge bg-${statusClass}">${statusText}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }
    
    updateTopCustomers(customers) {
        const container = document.getElementById('topCustomersList');
        if (!container) return;
        
        if (customers.length === 0) {
            container.innerHTML = `
                <div class="list-group-item text-center">
                    <i class="fas fa-users text-muted mb-2"></i>
                    <p class="text-muted mb-0">Nenhum cliente encontrado</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        customers.forEach(customer => {
            const loyaltyColors = {
                'VIP': 'warning',
                'Gold': 'success', 
                'Silver': 'info',
                'Bronze': 'secondary'
            };
            
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div>
                    <h6 class="mb-1">${customer.name}</h6>
                    <small class="text-muted">${customer.visits} visitas • ${customer.spent}</small>
                </div>
                <div>
                    <span class="badge bg-${loyaltyColors[customer.loyalty] || 'secondary'}">${customer.loyalty}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    // ==============================================
    // Period Management & Auto-refresh
    // ==============================================
    
    changePeriod(period) {
        console.log('📅 Alterando período para:', period);
        this.currentPeriod = period;
        localStorage.setItem('tenantDashboardPeriod', period);
        
        // Reload data with new period
        this.loadTenantData();
    }
    
    setupAutoRefresh() {
        console.log('🔄 Configurando auto-refresh...');
        
        // Auto-refresh every 10 seconds
        this.autoRefreshInterval = setInterval(() => {
            console.log('🔄 Auto-refresh executado');
            this.loadTenantData();
        }, 10000);
    }
    
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // ==============================================
    // User Actions & Export
    // ==============================================
    
    async refreshData() {
        console.log('🔄 Atualizando dados manualmente...');
        await this.loadTenantData();
    }
    
    exportData() {
        console.log('📥 Abrindo modal de exportação...');
        
        // Set current period in export modal
        const exportPeriodSelect = document.getElementById('exportPeriod');
        if (exportPeriodSelect) {
            exportPeriodSelect.value = this.currentPeriod;
        }
        
        // Show export modal
        const exportModal = new bootstrap.Modal(document.getElementById('exportModal'));
        exportModal.show();
    }
    
    async executeExport() {
        console.log('📥 Executando exportação...');
        
        try {
            // Get export configuration
            const config = this.getExportConfiguration();
            
            // Show loading state
            this.showExportLoading();
            
            // Call export API
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const response = await fetch('/api/admin/export/tenant-data', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tenantId: this.currentTenantId,
                    ...config
                })
            });
            
            if (response.ok) {
                // Handle file download
                const blob = await response.blob();
                this.downloadFile(blob, config);
                
                // Close modal and show success
                bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
                this.showExportSuccess();
            } else {
                throw new Error('Erro no servidor ao gerar arquivo');
            }
            
        } catch (error) {
            console.error('❌ Erro na exportação:', error);
            this.showExportError(error.message);
        } finally {
            this.hideExportLoading();
        }
    }
    
    getExportConfiguration() {
        // Get format
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'csv';
        
        // Get period
        const period = document.getElementById('exportPeriod')?.value || this.currentPeriod;
        
        // Get sections
        const sections = [];
        document.querySelectorAll('#exportForm input[type="checkbox"]:checked').forEach(checkbox => {
            if (checkbox.value && checkbox.value !== 'on') {
                sections.push(checkbox.value);
            }
        });
        
        // Get options
        const includeTimestamp = document.getElementById('includeTimestamp')?.checked || false;
        const includeMetadata = document.getElementById('includeMetadata')?.checked || false;
        
        return {
            format,
            period,
            sections,
            options: {
                includeTimestamp,
                includeMetadata
            }
        };
    }
    
    downloadFile(blob, config) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Generate filename
        let filename = 'tenant-dashboard';
        
        if (config.options.includeTimestamp) {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            filename += `_${timestamp}`;
        }
        
        filename += config.format === 'excel' ? '.xlsx' : '.csv';
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
    
    showExportLoading() {
        const button = document.querySelector('#exportModal .btn-primary');
        if (button) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Exportando...';
            button.disabled = true;
        }
    }
    
    hideExportLoading() {
        const button = document.querySelector('#exportModal .btn-primary');
        if (button) {
            button.innerHTML = '<i class="fas fa-download me-2"></i>Exportar';
            button.disabled = false;
        }
    }
    
    showExportSuccess() {
        // Could implement toast notification here
        console.log('✅ Exportação concluída com sucesso!');
    }
    
    showExportError(message) {
        alert(`Erro na exportação: ${message}`);
    }
    
    logout() {
        console.log('🚪 Fazendo logout...');
        localStorage.removeItem('ubs_token');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('tenantDashboardPeriod');
        window.location.href = 'login.html';
    }
    
    newAppointment() {
        console.log('➕ Novo agendamento');
        // Implementar quick action - redirecionar para tela de agendamento
        window.location.href = 'appointments-standardized.html?action=new';
    }
    
    newCustomer() {
        console.log('👤 Novo cliente');
        window.location.href = 'customers-standardized.html?action=new';
    }
    
    newService() {
        console.log('🛎️ Novo serviço');
        window.location.href = 'services-standardized.html?action=new';
    }
    
    quickReport() {
        console.log('📊 Relatório rápido');
        this.exportData();
    }
    
    viewAllCustomers() {
        console.log('👥 Ver todos clientes');
        window.location.href = 'customers-standardized.html';
    }
    
    // ==============================================
    // Customization & Themes
    // ==============================================
    
    showCustomization() {
        console.log('🎨 Abrindo modal de customização...');
        
        // Load current preferences into modal
        this.loadPreferencesIntoModal();
        
        // Show customization modal
        const customizationModal = new bootstrap.Modal(document.getElementById('customizationModal'));
        customizationModal.show();
    }
    
    loadCustomizationPreferences() {
        const preferences = localStorage.getItem('tenantDashboardPreferences');
        
        if (preferences) {
            try {
                const prefs = JSON.parse(preferences);
                this.applyPreferences(prefs);
            } catch (error) {
                console.warn('⚠️ Erro ao carregar preferências:', error);
            }
        }
    }
    
    loadPreferencesIntoModal() {
        const preferences = localStorage.getItem('tenantDashboardPreferences');
        
        if (preferences) {
            try {
                const prefs = JSON.parse(preferences);
                
                // Update modal checkboxes
                document.getElementById('showKPIs').checked = prefs.showKPIs !== false;
                document.getElementById('showCharts').checked = prefs.showCharts !== false;
                document.getElementById('showLists').checked = prefs.showLists !== false;
                document.getElementById('showQuickActions').checked = prefs.showQuickActions !== false;
                document.getElementById('compactMode').checked = prefs.compactMode || false;
                document.getElementById('autoRefresh').checked = prefs.autoRefresh !== false;
                document.getElementById('showActivityFeed').checked = prefs.showActivityFeed || false;
                
                // Update theme selection
                document.querySelectorAll('.color-option').forEach(option => {
                    option.classList.remove('active');
                    if (option.dataset.theme === (prefs.theme || 'default')) {
                        option.classList.add('active');
                    }
                });
                
            } catch (error) {
                console.warn('⚠️ Erro ao carregar preferências no modal:', error);
            }
        }
    }
    
    applyPreferences(prefs) {
        // Apply theme
        if (prefs.theme) {
            this.applyTheme(prefs.theme);
        }
        
        // Apply visibility settings
        this.toggleSection('metricsRow1', prefs.showKPIs !== false);
        this.toggleSection('metricsRow2', prefs.showKPIs !== false);
        this.toggleSection('chartsContainer', prefs.showCharts !== false);
        this.toggleSection('tablesContainer', prefs.showLists !== false);
        this.toggleSection('actionButtons', prefs.showQuickActions !== false);
        this.toggleSection('floatingActions', prefs.showQuickActions !== false);
        
        // Apply compact mode
        if (prefs.compactMode) {
            document.body.classList.add('compact-mode');
        }
        
        // Apply auto-refresh setting
        if (prefs.autoRefresh === false) {
            this.stopAutoRefresh();
        }
    }
    
    applyTheme(theme) {
        // Remove existing theme classes
        document.body.classList.remove('theme-beauty', 'theme-sports', 'theme-legal', 'theme-healthcare', 'theme-education');
        
        // Apply new theme
        if (theme !== 'default') {
            document.body.classList.add(`theme-${theme}`);
        }
    }
    
    toggleSection(sectionId, show) {
        const section = document.getElementById(sectionId) || document.querySelector(`#${sectionId}`);
        if (section) {
            if (show) {
                section.classList.remove('section-hidden');
            } else {
                section.classList.add('section-hidden');
            }
        }
    }
    
    saveCustomization() {
        console.log('💾 Salvando preferências de customização...');
        
        const preferences = {
            showKPIs: document.getElementById('showKPIs').checked,
            showCharts: document.getElementById('showCharts').checked,
            showLists: document.getElementById('showLists').checked,
            showQuickActions: document.getElementById('showQuickActions').checked,
            compactMode: document.getElementById('compactMode').checked,
            autoRefresh: document.getElementById('autoRefresh').checked,
            showActivityFeed: document.getElementById('showActivityFeed').checked,
            theme: document.querySelector('.color-option.active')?.dataset.theme || 'default'
        };
        
        // Save to localStorage
        localStorage.setItem('tenantDashboardPreferences', JSON.stringify(preferences));
        
        // Apply preferences
        this.applyPreferences(preferences);
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('customizationModal')).hide();
        
        console.log('✅ Preferências salvas com sucesso!');
    }
    
    resetCustomization() {
        console.log('🔄 Restaurando configurações padrão...');
        
        // Clear saved preferences
        localStorage.removeItem('tenantDashboardPreferences');
        
        // Reset modal to defaults
        document.getElementById('showKPIs').checked = true;
        document.getElementById('showCharts').checked = true;
        document.getElementById('showLists').checked = true;
        document.getElementById('showQuickActions').checked = true;
        document.getElementById('compactMode').checked = false;
        document.getElementById('autoRefresh').checked = true;
        document.getElementById('showActivityFeed').checked = false;
        
        // Reset theme
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.theme === 'default') {
                option.classList.add('active');
            }
        });
        
        // Apply defaults
        this.applyPreferences({
            showKPIs: true,
            showCharts: true,
            showLists: true,
            showQuickActions: true,
            compactMode: false,
            autoRefresh: true,
            showActivityFeed: false,
            theme: 'default'
        });
        
        console.log('✅ Configurações restauradas!');
    }

    // ==============================================
    // Performance & Accessibility
    // ==============================================
    
    setupLazyLoading() {
        console.log('⚡ Configurando lazy loading...');
        
        // Setup intersection observer for lazy loading
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const lazyAction = this.lazyLoadElements.get(element);
                    
                    if (lazyAction) {
                        lazyAction();
                        this.lazyLoadElements.delete(element);
                        this.intersectionObserver.unobserve(element);
                    }
                }
            });
        }, { threshold: 0.1 });
        
        // Setup lazy loading for charts
        const chartElements = document.querySelectorAll('[id$="Chart"]');
        chartElements.forEach(chart => {
            this.lazyLoadElements.set(chart, () => {
                console.log(`⚡ Lazy loading chart: ${chart.id}`);
                // Chart will be initialized when visible
            });
            this.intersectionObserver.observe(chart);
        });
    }
    
    setupAccessibility() {
        console.log('♿ Configurando acessibilidade...');
        
        // Add skip link
        this.addSkipLink();
        
        // Setup keyboard navigation
        this.setupKeyboardNavigation();
        
        // Add ARIA live regions for dynamic content
        this.setupAriaLiveRegions();
        
        // Setup focus management
        this.setupFocusManagement();
    }
    
    addSkipLink() {
        const skipLink = document.createElement('a');
        skipLink.href = '#mainContent';
        skipLink.className = 'skip-link';
        skipLink.textContent = 'Pular para o conteúdo principal';
        skipLink.style.cssText = `
            position: absolute;
            top: -40px;
            left: 6px;
            background: #000;
            color: #fff;
            padding: 8px;
            text-decoration: none;
            z-index: 10000;
            transition: top 0.3s;
        `;
        
        skipLink.addEventListener('focus', () => {
            skipLink.style.top = '6px';
        });
        
        skipLink.addEventListener('blur', () => {
            skipLink.style.top = '-40px';
        });
        
        document.body.prepend(skipLink);
    }
    
    setupKeyboardNavigation() {
        // Enhanced keyboard navigation for FAB
        const mainFab = document.getElementById('mainFab');
        if (mainFab) {
            mainFab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    mainFab.click();
                }
            });
        }
        
        // Keyboard navigation for modal forms
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                }
            });
        });
    }
    
    setupAriaLiveRegions() {
        // Add ARIA live region for status updates
        const statusRegion = document.createElement('div');
        statusRegion.id = 'statusRegion';
        statusRegion.setAttribute('aria-live', 'polite');
        statusRegion.setAttribute('aria-atomic', 'true');
        statusRegion.style.cssText = `
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
        `;
        document.body.appendChild(statusRegion);
    }
    
    setupFocusManagement() {
        // Manage focus for modals
        document.addEventListener('shown.bs.modal', (e) => {
            const modal = e.target;
            const firstInput = modal.querySelector('input, select, textarea, button');
            if (firstInput) {
                firstInput.focus();
            }
        });
    }
    
    announceToScreenReader(message) {
        const statusRegion = document.getElementById('statusRegion');
        if (statusRegion) {
            statusRegion.textContent = message;
        }
    }
    
    // Enhanced updateKPICard with accessibility
    updateKPICardAccessible(valueId, value, trendId, trend, direction) {
        this.updateKPICard(valueId, value, trendId, trend, direction);
        
        // Announce significant changes to screen readers
        if (value !== '--' && value !== '0') {
            const cardTitle = document.querySelector(`#${valueId}`).closest('.metric-card').querySelector('.metric-title').textContent;
            this.announceToScreenReader(`${cardTitle} atualizado para ${value}`);
        }
    }

    // ==============================================
    // Loading States & Error Handling
    // ==============================================
    
    showLoadingState() {
        const kpiIds = [
            'tenant-appointments', 'tenant-revenue', 'tenant-customers', 'tenant-services',
            'new-customers', 'cancellation-rate', 'avg-session', 'ai-usage'
        ];
        
        kpiIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
        });
        
        // Show loading in lists
        const containers = ['upcomingAppointmentsList', 'topCustomersList'];
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <div class="list-group-item text-center">
                        <i class="fas fa-spinner fa-spin me-2"></i>Carregando...
                    </div>
                `;
            }
        });
    }
    
    hideLoadingState() {
        // Loading indicators will be replaced by actual data
        console.log('🔄 Estado de loading removido');
    }
    
    showErrorState(message) {
        console.error('❌ Estado de erro:', message);
        const contentContainer = document.getElementById('contentContainer');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="content-section">
                    <div class="alert alert-danger">
                        <h4>Erro ao carregar dashboard</h4>
                        <p>${message}</p>
                        <button class="btn btn-primary" onclick="tenantAdminDashboard.refreshData()" aria-label="Tentar carregar dashboard novamente">
                            Tentar novamente
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    updateLastUpdateTime() {
        this.lastUpdateTime = new Date();
        const lastUpdateElement = document.getElementById('lastUpdate');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = `Atualizado às ${this.lastUpdateTime.toLocaleTimeString('pt-BR')}`;
        }
    }

    // ==============================================
    // Cleanup & Destroy
    // ==============================================
    
    destroy() {
        console.log('🧹 Limpando Tenant Admin Dashboard...');
        this.stopAutoRefresh();
        
        // Clean up chart instances
        if (this.chartsInitialized) {
            this.destroyCharts();
        }
        
        // Clear widgets
        this.widgets.clear();
    }
    
    // ==============================================
    // Utility Functions
    // ==============================================
    
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value || 0);
    }
    
    formatNumber(value) {
        return new Intl.NumberFormat('pt-BR').format(value || 0);
    }
    
    formatDate(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR');
    }
}

// ==============================================
// Global Instance & Functions
// ==============================================

let tenantAdminDashboard = null;

// Global functions for backward compatibility
function refreshData() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.refreshData();
    }
}

function changePeriod(period) {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.changePeriod(period);
    }
}

function exportData() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.exportData();
    }
}

function executeExport() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.executeExport();
    }
}

function logout() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.logout();
    }
}

function newAppointment() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.newAppointment();
    }
}

function viewAllCustomers() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.viewAllCustomers();
    }
}

function newCustomer() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.newCustomer();
    }
}

function newService() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.newService();
    }
}

function quickReport() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.quickReport();
    }
}

function showCustomization() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.showCustomization();
    }
}

function saveCustomization() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.saveCustomization();
    }
}

function resetCustomization() {
    if (tenantAdminDashboard) {
        tenantAdminDashboard.resetCustomization();
    }
}

// ==============================================
// Initialization
// ==============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema Tenant Admin Dashboard...');
    
    try {
        tenantAdminDashboard = new TenantAdminDashboard();
    } catch (error) {
        console.error('❌ Erro crítico na inicialização:', error);
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (tenantAdminDashboard) {
            tenantAdminDashboard.destroy();
        }
    });
});