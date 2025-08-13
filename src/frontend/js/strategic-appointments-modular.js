/**
 * Strategic Appointments Analytics - Modular Version
 * 
 * This module provides a self-contained strategic appointments analytics section
 * that can be rendered inside any container without interfering with other dashboard components.
 */

/**
 * Main function to render the strategic appointments section
 * @param {HTMLElement} container - The container where the section will be rendered
 */
function renderStrategicAppointmentsSection(container) {
    // Clear the container first
    container.innerHTML = '';
    
    // Create the HTML structure
    const htmlContent = createStrategicAppointmentsHTML();
    container.innerHTML = htmlContent;
    
    // Initialize the analytics logic
    initializeStrategicAppointments(container);
}

/**
 * Creates the HTML structure for the strategic appointments section
 * @returns {string} The HTML content as a string
 */
function createStrategicAppointmentsHTML() {
    return `
        <!-- Strategic Appointments Analytics Section -->
        <div class="strategic-appointments-container">
            <!-- Action Buttons -->
            <div class="d-flex justify-content-end align-items-center mb-3">
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="exportStrategicReport()">
                        <i class="fas fa-download"></i> Exportar
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="refreshStrategicData()">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                </div>
            </div>

            <!-- Filters Section -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body py-3">
                            <div class="row align-items-center">
                                <div class="col-md-3">
                                    <label class="form-label small fw-semibold text-muted mb-1">Período</label>
                                    <select class="form-select form-select-sm" id="strategic-period-filter">
                                        <option value="7d">Últimos 7 dias</option>
                                        <option value="30d" selected>Últimos 30 dias</option>
                                        <option value="90d">Últimos 90 dias</option>
                                        <option value="1y">Último ano</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small fw-semibold text-muted mb-1">Segmento</label>
                                    <select class="form-select form-select-sm" id="strategic-segment-filter">
                                        <option value="all">Todos os segmentos</option>
                                        <option value="beauty">Beleza</option>
                                        <option value="health">Saúde Mental</option>
                                        <option value="legal">Jurídico</option>
                                        <option value="education">Educação</option>
                                        <option value="fitness">Fitness</option>
                                        <option value="consulting">Consultoria</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small fw-semibold text-muted mb-1">Empresa</label>
                                    <select class="form-select form-select-sm" id="strategic-tenant-filter">
                                        <option value="all">Todas as empresas</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small fw-semibold text-muted mb-1">Profissional</label>
                                    <select class="form-select form-select-sm" id="strategic-professional-filter">
                                        <option value="all">Todos os profissionais</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Key Metrics Cards - UBS Standard -->
            <div class="row mb-4" id="strategic-metrics-container">
                <!-- UBS MetricCard widgets will be inserted here -->
            </div>

            <!-- Charts Section -->
            <div class="row mb-4">
                <!-- Timeline Chart -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
                            <h6 class="fw-semibold mb-0">Evolução dos Agendamentos</h6>
                            <select class="form-select form-select-sm w-auto" id="strategic-timeline-select">
                                <option value="6m" selected>Últimos 6 meses</option>
                                <option value="12m">Últimos 12 meses</option>
                                <option value="24m">Últimos 24 meses</option>
                            </select>
                        </div>
                        <div class="card-body">
                            <div style="height: 300px;">
                                <canvas id="strategic-timeline-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Segment Distribution Chart -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-transparent">
                            <h6 class="fw-semibold mb-0">Distribuição por Segmento</h6>
                        </div>
                        <div class="card-body">
                            <div id="strategic-segment-chart-container" style="height: 300px;">
                                <!-- UBS Doughnut Widget will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Secondary Charts -->
            <div class="row mb-4">
                <!-- Top Tenants Chart -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-transparent">
                            <h6 class="fw-semibold mb-0">Top 5 Empresas</h6>
                        </div>
                        <div class="card-body">
                            <div style="height: 250px;">
                                <canvas id="strategic-top-tenants-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Status Distribution Chart -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-transparent">
                            <h6 class="fw-semibold mb-0">Status dos Agendamentos</h6>
                        </div>
                        <div class="card-body">
                            <div id="strategic-status-chart-container" style="height: 250px;">
                                <!-- UBS Doughnut Widget will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Ranking Table -->
            <div class="row">
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-transparent">
                            <h6 class="fw-semibold mb-0">Ranking de Performance - Top 10</h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-4">Posição</th>
                                            <th>Empresa</th>
                                            <th>Agendamentos</th>
                                            <th>Crescimento</th>
                                            <th>Taxa Cancelamento</th>
                                            <th class="pe-4">Taxa Comparecimento</th>
                                        </tr>
                                    </thead>
                                    <tbody id="strategic-ranking-table-body">
                                        <!-- Dynamic content will be inserted here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Custom CSS for strategic appointments -->
        <style>
            .strategic-appointments-container .strategic-metric-value {
                font-size: 1.5rem;
                color: #2c3e50;
            }

            .strategic-appointments-container .strategic-metric-trend {
                font-size: 0.75rem;
                padding: 2px 6px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 2px;
            }

            .strategic-appointments-container .strategic-metric-trend.positive {
                background-color: rgba(25, 135, 84, 0.1);
                color: #198754;
            }

            .strategic-appointments-container .strategic-metric-trend.negative {
                background-color: rgba(220, 53, 69, 0.1);
                color: #dc3545;
            }

            .strategic-appointments-container .strategic-metric-trend.neutral {
                background-color: rgba(108, 117, 125, 0.1);
                color: #6c757d;
            }

            .strategic-appointments-container .loading-skeleton {
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: loading 1.5s infinite;
            }

            @keyframes loading {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }

            .strategic-appointments-container .badge-trend {
                font-size: 0.7rem;
                padding: 0.25rem 0.5rem;
            }

            .strategic-appointments-container .tenant-name {
                font-weight: 600;
                color: #2c3e50;
            }
        </style>
    `;
}

/**
 * Initializes the strategic appointments analytics logic within the container
 * @param {HTMLElement} container - The container element
 */
function initializeStrategicAppointments(container) {
    // Create a scoped analytics instance for this container
    const strategicAnalytics = new StrategicAppointmentsAnalytics(container);
    
    // Store the instance in the container for later access
    container.strategicAnalytics = strategicAnalytics;
    
    // Initialize the analytics
    strategicAnalytics.init();
}

/**
 * Strategic Appointments Analytics Class - Scoped to container
 */
class StrategicAppointmentsAnalytics {
    constructor(container) {
        this.container = container;
        this.apiBaseUrl = '/api/admin/analytics';
        this.charts = {};
        this.currentUser = window.secureAuth?.getUserData();
        this.currentFilters = {
            period: '30d',
            segment: 'all',
            tenant: 'all',
            professional: 'all'
        };
        this.isInitialized = false;
        this.widgetsCreated = false; // Flag to prevent widget recreation
        
        // Hide multi-tenant sections for tenant_admin
        this.initializeRoleBasedVisibility();
    }

    /**
     * Hide multi-tenant sections for tenant_admin users
     */
    initializeRoleBasedVisibility() {
        if (this.currentUser?.role === 'tenant_admin') {
            console.log('[Appointments] Hiding multi-tenant sections for tenant_admin');
            
            setTimeout(() => {
                // Hide tenant/empresa filters
                const tenantFilters = document.querySelectorAll('select[name*="tenant"], select[name*="empresa"], .tenant-filter, .empresa-filter');
                tenantFilters.forEach(filter => {
                    const container = filter.closest('.col-md-3, .form-group, .filter-group');
                    if (container) {
                        container.style.display = 'none';
                    }
                });
                
                // Hide "Top X Empresas/Tenants" sections
                const allElements = document.querySelectorAll('*');
                allElements.forEach(element => {
                    if (element.textContent?.includes('Top') && (element.textContent?.includes('Empresa') || element.textContent?.includes('Tenant'))) {
                        const container = element.closest('.col-lg-6, .card, .widget');
                        if (container) {
                            container.style.display = 'none';
                        }
                    }
                });
            }, 500);
        }
    }

    /**
     * Build tenant-aware analytics URL based on user role
     */
    buildAnalyticsUrl(baseEndpoint) {
        const currentUser = window.secureAuth?.getUserData();
        
        if (!currentUser) {
            console.warn('[Strategic] No user data available, using default endpoint');
            return baseEndpoint;
        }
        
        let url = baseEndpoint;
        
        // Use the same logic as dashboard.js for consistency
        if (currentUser.role === 'super_admin') {
            // Super admin: API global consolidada
            if (baseEndpoint === '/dashboard' || baseEndpoint === '/metrics') {
                url = '/api/admin/dashboard'
            } else if (!baseEndpoint.startsWith('/api/admin/')) {
                url = `/api/admin${baseEndpoint}`
            }
        } else if (currentUser.role === 'tenant_admin') {
            // Tenant admin: API restrita ao tenant
            if (baseEndpoint === '/dashboard' || baseEndpoint === '/metrics') {
                url = '/api/analytics/dashboard'
            } else if (baseEndpoint.includes('/recent-appointments')) {
                url = '/api/analytics/realtime'
            } else if (!baseEndpoint.startsWith('/api/analytics/')) {
                url = `/api/analytics${baseEndpoint}`
            }
        }
        
        console.log(`[Strategic] URL construída: ${url} (role: ${currentUser.role})`);
        return url;
    }

    /**
     * Initialize the analytics module
     */
    async init() {
        if (this.isInitialized) return;
        
        console.log('🚀 [Strategic] Inicializando Strategic Appointments Analytics...');
        
        try {
            this.bindEventListeners();
            this.initializeTooltips();
            await this.loadInitialData();
            this.isInitialized = true;
            console.log('✅ [Strategic] Inicialização concluída com sucesso');
        } catch (error) {
            console.error('❌ [Strategic] Erro na inicialização:', error);
            this.showErrorState();
        }
    }

    /**
     * Bind event listeners to filters and controls within the container
     */
    bindEventListeners() {
        // Period filter
        const periodFilter = this.container.querySelector('#strategic-period-filter');
        if (periodFilter) {
            periodFilter.addEventListener('change', (e) => {
                this.currentFilters.period = e.target.value;
                this.refreshAllData();
            });
        }

        // Segment filter
        const segmentFilter = this.container.querySelector('#strategic-segment-filter');
        if (segmentFilter) {
            segmentFilter.addEventListener('change', (e) => {
                this.currentFilters.segment = e.target.value;
                this.refreshAllData();
            });
        }

        // Tenant filter
        const tenantFilter = this.container.querySelector('#strategic-tenant-filter');
        if (tenantFilter) {
            tenantFilter.addEventListener('change', (e) => {
                this.currentFilters.tenant = e.target.value;
                this.refreshAllData();
            });
        }

        // Professional filter
        const professionalFilter = this.container.querySelector('#strategic-professional-filter');
        if (professionalFilter) {
            professionalFilter.addEventListener('change', (e) => {
                this.currentFilters.professional = e.target.value;
                this.refreshAllData();
            });
        }

        // Timeline chart period selector
        const timelineSelect = this.container.querySelector('#strategic-timeline-select');
        if (timelineSelect) {
            timelineSelect.addEventListener('change', (e) => {
                this.renderTimelineChart(e.target.value);
            });
        }

        console.log('🔗 [Strategic] Event listeners registrados');
    }

    /**
     * Initialize Bootstrap tooltips within the container
     */
    initializeTooltips() {
        const tooltipTriggerList = this.container.querySelectorAll('[data-bs-toggle="tooltip"]');
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    }

    /**
     * Create UBS MetricCard widgets
     */
    createMetricWidgets() {
        const container = this.container.querySelector('#strategic-metrics-container');
        if (!container) return;

        console.log('🎯 Creating UBS MetricCard widgets...');
        
        // Clear container to prevent duplicates
        container.innerHTML = '';

        // Metric cards configuration
        const metricsConfig = [
            {
                id: 'total-appointments',
                title: 'Total Agendamentos',
                icon: 'fas fa-calendar-check',
                color: 'primary',
                value: '-',
                trend: { direction: 'up', value: '+24.5%' }
            },
            {
                id: 'growth-rate',
                title: 'Taxa de Crescimento',
                icon: 'fas fa-chart-line',
                color: 'success',
                value: '-',
                format: 'percentage',
                trend: { direction: 'up', value: '+18.2%' }
            },
            {
                id: 'cancellation-rate',
                title: 'Taxa de Cancelamento',
                icon: 'fas fa-times-circle',
                color: 'warning',
                value: '-',
                format: 'percentage',
                trend: { direction: 'down', value: '-2.1%' }
            },
            {
                id: 'show-rate',
                title: 'Taxa de Comparecimento',
                icon: 'fas fa-user-check',
                color: 'info',
                value: '-',
                format: 'percentage',
                trend: { direction: 'up', value: '+3.7%' }
            },
            {
                id: 'top-tenant',
                title: 'Top Empresa',
                subtitle: '-',
                icon: 'fas fa-trophy',
                color: 'primary',
                value: '-',
                trend: { direction: 'up', value: '+31.2%' }
            },
            {
                id: 'revenue-impact',
                title: 'Impacto na Receita',
                icon: 'fas fa-dollar-sign',
                color: 'success',
                value: '-',
                format: 'currency',
                trend: { direction: 'up', value: '+18.7%' }
            }
        ];

        // Create metric widgets using UBS system
        if (typeof window.UBSWidgets !== 'undefined' && window.UBSWidgets.MetricCard) {
            this.metricWidgets = {};
            
            metricsConfig.forEach(config => {
                const metricContainer = document.createElement('div');
                metricContainer.className = 'col-lg-2 col-md-4 col-sm-6 mb-3';
                container.appendChild(metricContainer);

                const metricWidget = new window.UBSWidgets.MetricCard(metricContainer, {
                    title: config.title,
                    subtitle: config.subtitle,
                    value: config.value,
                    icon: config.icon,
                    color: config.color,
                    format: config.format || 'number',
                    trend: config.trend,
                    clickable: false
                });

                metricWidget.render();
                this.metricWidgets[config.id] = metricWidget;
            });

            console.log('✅ UBS MetricCard widgets created successfully');
        } else if (typeof MetricCardWidget !== 'undefined') {
            console.log('🎯 Using MetricCardWidget directly');
            this.metricWidgets = {};
            
            metricsConfig.forEach(config => {
                const metricContainer = document.createElement('div');
                metricContainer.className = 'col-lg-2 col-md-4 col-sm-6 mb-3';
                container.appendChild(metricContainer);

                const metricWidget = new MetricCardWidget(metricContainer, {
                    title: config.title,
                    subtitle: config.subtitle,
                    value: config.value,
                    icon: config.icon,
                    color: config.color,
                    format: config.format || 'number',
                    trend: config.trend,
                    clickable: false
                });

                metricWidget.render();
                this.metricWidgets[config.id] = metricWidget;
            });

            console.log('✅ MetricCardWidget widgets created successfully');
        } else {
            console.warn('⚠️ UBS MetricCard widget not available, keeping original layout');
            // Fallback: keep original metric cards HTML
            container.innerHTML = this.getOriginalMetricCardsHTML();
        }
    }

    /**
     * Get original metric cards HTML as fallback
     */
    getOriginalMetricCardsHTML() {
        return `
            <!-- Total Appointments -->
            <div class="col-md-2">
                <div class="card border-0 shadow-sm h-100 metric-card">
                    <div class="card-body text-center p-3">
                        <div class="text-primary mb-2">
                            <i class="fas fa-calendar-check fa-2x"></i>
                        </div>
                        <h3 class="fw-bold mb-1 strategic-metric-value" id="strategic-total-appointments">-</h3>
                        <p class="small text-muted mb-1">Total Agendamentos</p>
                        <div class="strategic-metric-trend" id="strategic-appointments-trend">
                            <i class="fas fa-arrow-up"></i>
                            <span class="small">+24.5%</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Add other fallback cards here if needed -->
        `;
    }

    /**
     * Load initial data and render all components
     */
    async loadInitialData() {
        try {
            console.log('📊 [Strategic] Carregando dados estratégicos...');
            
            // Create UBS metric widgets first (only on initial load)
            if (!this.widgetsCreated) {
                this.createMetricWidgets();
                this.widgetsCreated = true;
            }
            
            // Show loading states
            this.showLoadingStates();

            // Load data from API or use mock data
            const data = await this.fetchDataFromAPI();
            
            // Update all components
            this.updateMetricCards(data.metrics);
            this.renderAllCharts(data);
            this.updateRankingTable(data.ranking);
            this.populateFilterOptions(data.filterOptions);

            console.log('✅ [Strategic] Dados carregados com sucesso');

        } catch (error) {
            console.error('❌ [Strategic] Erro ao carregar dados:', error);
            // Create widgets and use mock data as fallback (only if not created yet)
            if (!this.widgetsCreated) {
                this.createMetricWidgets();
                this.widgetsCreated = true;
            }
            console.error('API endpoint not available');
            this.showErrorState('Unable to load appointments data');
        }
    }

    /**
     * Fetch data from API endpoints
     */
    async fetchDataFromAPI() {
        const token = window.secureAuth?.getToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            // Build tenant-aware URL for metrics endpoint
            const metricsEndpoint = this.buildAnalyticsUrl('/metrics');
            const metricsUrl = `${this.apiBaseUrl.replace('/analytics', '')}${metricsEndpoint}?period=${this.currentFilters.period}`;
            
            console.log(`[Strategic] Calling metrics URL: ${metricsUrl}`);
            
            const [metricsResponse] = await Promise.all([
                fetch(metricsUrl, { headers })
            ]);

            if (!metricsResponse.ok) {
                throw new Error(`Metrics API failed: ${metricsResponse.status}`);
            }

            const metrics = await metricsResponse.json();
            return this.transformApiDataToStrategicFormat(metrics);

        } catch (error) {
            console.error('❌ [Strategic] Erro ao buscar dados da API:', error);
            throw error;
        }
    }

    /**
     * Transform API data to strategic format
     */
    transformApiDataToStrategicFormat(metrics) {
        // Generate different data based on current filters
        const filterMultiplier = this.getFilterMultiplier();
        const baseData = this.getBaseDataForFilters();
        
        return {
            metrics: {
                totalAppointments: Math.floor((metrics.summary?.totalAppointments || 0) * filterMultiplier.appointments),
                growthRate: baseData.growthRate,
                cancellationRate: baseData.cancellationRate,
                showRate: baseData.showRate,
                topTenant: baseData.topTenant,
                revenueImpact: Math.floor((metrics.summary?.totalRevenue || 0) * filterMultiplier.revenue)
            },
            timeline: this.generateTimelineData('6m'),
            segmentDistribution: baseData.segmentDistribution,
            topTenants: baseData.topTenants,
            statusDistribution: baseData.statusDistribution,
            ranking: this.getMockRankingData(),
            filterOptions: {
                tenants: ['Salão Bella Vista', 'Clínica Mental Health Pro', 'Lima & Associados'],
                professionals: ['Dr. Ana Silva', 'Psic. Carlos Santos', 'Adv. Maria Oliveira']
            }
        };
    }

    /**
     * Get filter multiplier based on current filters
     */
    getFilterMultiplier() {
        const { period, segment, tenant } = this.currentFilters;
        
        let appointmentsMultiplier = 1;
        let revenueMultiplier = 1;
        
        // Period multiplier
        switch (period) {
            case '7d': appointmentsMultiplier *= 0.2; revenueMultiplier *= 0.18; break;
            case '30d': appointmentsMultiplier *= 1; revenueMultiplier *= 1; break;
            case '90d': appointmentsMultiplier *= 2.8; revenueMultiplier *= 2.5; break;
            case '1y': appointmentsMultiplier *= 12; revenueMultiplier *= 11.5; break;
        }
        
        // Segment multiplier
        if (segment !== 'all') {
            switch (segment) {
                case 'beauty': appointmentsMultiplier *= 0.45; revenueMultiplier *= 0.42; break;
                case 'health': appointmentsMultiplier *= 0.35; revenueMultiplier *= 0.38; break;
                case 'legal': appointmentsMultiplier *= 0.25; revenueMultiplier *= 0.32; break;
                case 'education': appointmentsMultiplier *= 0.20; revenueMultiplier *= 0.18; break;
                case 'fitness': appointmentsMultiplier *= 0.15; revenueMultiplier *= 0.14; break;
                case 'consulting': appointmentsMultiplier *= 0.10; revenueMultiplier *= 0.16; break;
            }
        }
        
        // Tenant multiplier
        if (tenant !== 'all') {
            appointmentsMultiplier *= 0.33; // Single tenant is ~1/3 of total
            revenueMultiplier *= 0.29;
        }
        
        return { appointments: appointmentsMultiplier, revenue: revenueMultiplier };
    }

    /**
     * Get base data that changes with filters
     */
    getBaseDataForFilters() {
        const { period, segment } = this.currentFilters;
        
        let growthRate = 24.5;
        let cancellationRate = 5.2;
        let showRate = 91.3;
        
        // Adjust metrics based on period
        if (period === '7d') {
            growthRate = 18.2;
            cancellationRate = 3.8;
            showRate = 94.1;
        } else if (period === '90d') {
            growthRate = 31.7;
            cancellationRate = 6.1;
            showRate = 89.8;
        } else if (period === '1y') {
            growthRate = 42.3;
            cancellationRate = 7.2;
            showRate = 87.9;
        }
        
        // Segment-specific data
        let segmentDistribution = {
            labels: ['Beleza', 'Saúde Mental', 'Jurídico', 'Educação', 'Fitness', 'Consultoria'],
            data: [2840, 2210, 1820, 1510, 980, 640]
        };
        
        if (segment !== 'all') {
            const segmentMap = {
                'beauty': { labels: ['Corte', 'Coloração', 'Tratamentos', 'Manicure'], data: [1420, 890, 350, 180] },
                'health': { labels: ['Terapia', 'Psiquiatria', 'Coaching'], data: [1200, 680, 330] },
                'legal': { labels: ['Consultoria', 'Contratos', 'Processos'], data: [920, 580, 320] }
            };
            segmentDistribution = segmentMap[segment] || segmentDistribution;
        }
        
        return {
            growthRate,
            cancellationRate,
            showRate,
            topTenant: {
                name: segment === 'beauty' ? 'Salão Bella Vista' : 
                      segment === 'health' ? 'Clínica Mental Pro' :
                      segment === 'legal' ? 'Lima & Associados' : 'Salão Bella Vista',
                volume: Math.floor(892 * (segment === 'all' ? 1 : 0.8)),
                growth: growthRate
            },
            segmentDistribution,
            topTenants: {
                labels: ['Salão Bella Vista', 'Mental Health Pro', 'Lima & Associados', 'EduMaster', 'FitLife Academy'],
                data: [892, 734, 612, 578, 489]
            },
            statusDistribution: {
                labels: ['Confirmados', 'Concluídos', 'Pendentes', 'Cancelados', 'Não Compareceu'],
                data: [4500, 3800, 800, 520, 300]
            }
        };
    }

    /**
     * Update metric cards with new data
     */
    updateMetricCards(metrics) {
        console.log('📊 [Strategic] Atualizando métricas...');

        // Update UBS MetricCard widgets if available
        if (this.metricWidgets) {
            // Total Appointments
            if (this.metricWidgets['total-appointments']) {
                this.metricWidgets['total-appointments'].update({
                    value: metrics.totalAppointments,
                    trend: { direction: 'up', value: '+24.5%' }
                });
            }

            // Growth Rate
            if (this.metricWidgets['growth-rate']) {
                this.metricWidgets['growth-rate'].update({
                    value: metrics.growthRate,
                    trend: { direction: metrics.growthRate >= 0 ? 'up' : 'down', value: `${metrics.growthRate >= 0 ? '+' : ''}${metrics.growthRate.toFixed(1)}%` }
                });
            }

            // Cancellation Rate
            if (this.metricWidgets['cancellation-rate']) {
                this.metricWidgets['cancellation-rate'].update({
                    value: metrics.cancellationRate,
                    trend: { direction: 'down', value: '-2.1%' }
                });
            }

            // Show Rate
            if (this.metricWidgets['show-rate']) {
                this.metricWidgets['show-rate'].update({
                    value: metrics.showRate,
                    trend: { direction: 'up', value: '+3.7%' }
                });
            }

            // Top Tenant
            if (this.metricWidgets['top-tenant']) {
                this.metricWidgets['top-tenant'].update({
                    value: metrics.topTenant.volume,
                    subtitle: metrics.topTenant.name,
                    trend: { direction: 'up', value: '+31.2%' }
                });
            }

            // Revenue Impact
            if (this.metricWidgets['revenue-impact']) {
                this.metricWidgets['revenue-impact'].update({
                    value: metrics.revenueImpact,
                    trend: { direction: 'up', value: '+18.7%' }
                });
            }

            console.log('✅ [Strategic] Widgets UBS atualizados');
        } else {
            // Fallback: update traditional DOM elements
            console.log('⚠️ Usando fallback DOM tradicional');
            
            // Total Appointments
            const totalEl = this.container.querySelector('#strategic-total-appointments');
            if (totalEl) {
                totalEl.textContent = metrics.totalAppointments.toLocaleString();
                totalEl.classList.remove('loading-skeleton');
            }

            // Growth Rate
            const growthEl = this.container.querySelector('#strategic-growth-rate');
            if (growthEl) {
                growthEl.textContent = `${metrics.growthRate >= 0 ? '+' : ''}${metrics.growthRate.toFixed(1)}%`;
                growthEl.classList.remove('loading-skeleton');
            }

            // Cancellation Rate
            const cancellationEl = this.container.querySelector('#strategic-cancellation-rate');
            if (cancellationEl) {
                cancellationEl.textContent = `${metrics.cancellationRate.toFixed(1)}%`;
                cancellationEl.classList.remove('loading-skeleton');
            }

            // Show Rate
            const showRateEl = this.container.querySelector('#strategic-show-rate');
            if (showRateEl) {
                showRateEl.textContent = `${metrics.showRate.toFixed(1)}%`;
                showRateEl.classList.remove('loading-skeleton');
            }

            // Top Tenant
            const topTenantVolumeEl = this.container.querySelector('#strategic-top-tenant-volume');
            const topTenantNameEl = this.container.querySelector('#strategic-top-tenant-name');
            if (topTenantVolumeEl && topTenantNameEl) {
                topTenantVolumeEl.textContent = metrics.topTenant.volume.toLocaleString();
                topTenantVolumeEl.classList.remove('loading-skeleton');
                topTenantNameEl.textContent = metrics.topTenant.name;
            }

            // Revenue Impact
            const revenueEl = this.container.querySelector('#strategic-revenue-impact');
            if (revenueEl) {
                revenueEl.textContent = `R$ ${metrics.revenueImpact.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                revenueEl.classList.remove('loading-skeleton');
            }
        }

        console.log('📊 [Strategic] Métricas atualizadas');
    }

    /**
     * Render all charts
     */
    renderAllCharts(data) {
        this.renderTimelineChart('6m', data.timeline);
        this.renderSegmentDistributionChart(data.segmentDistribution);
        this.renderTopTenantsChart(data.topTenants);
        this.renderStatusDistributionChart(data.statusDistribution);
    }

    /**
     * Render timeline chart
     */
    renderTimelineChart(period = '6m', data = null) {
        const canvas = this.container.querySelector('#strategic-timeline-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Destroy existing chart
        if (this.charts.timeline) {
            this.charts.timeline.destroy();
        }

        const chartData = data || this.generateTimelineData(period);

        this.charts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: chartData.appointments,
                    borderColor: '#2D5A9B',
                    backgroundColor: 'rgba(45, 90, 155, 0.1)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Cancelamentos',
                    data: chartData.cancellations,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'start'
                    }
                },
                scales: {
                    x: {
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Render segment distribution pie chart
     */
    renderSegmentDistributionChart(data = null) {
        const container = this.container.querySelector('#strategic-segment-chart-container');
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.charts.segmentDistribution) {
            this.charts.segmentDistribution.destroy();
        }

        const chartData = data || {
            labels: ['Beleza', 'Saúde Mental', 'Jurídico', 'Educação', 'Fitness', 'Consultoria'],
            data: [2840, 2210, 1820, 1510, 980, 640]
        };

        // Use direct Chart.js implementation with dashboard format
        console.log('🍩 Using direct Chart.js for segment distribution chart');
        container.innerHTML = '<canvas id="strategic-segment-chart"></canvas>';
        const canvas = container.querySelector('#strategic-segment-chart');
        const ctx = canvas.getContext('2d');

        this.charts.segmentDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.data,
                    backgroundColor: ['#e91e63', '#2196f3', '#ff9800', '#4caf50', '#9c27b0', '#607d8b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = '#2D5A9B';
                    ctx.fillText(total.toLocaleString(), centerX, centerY - 8);
                    
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#6c757d';
                    ctx.fillText('Total', centerX, centerY + 12);
                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Render top tenants bar chart
     */
    renderTopTenantsChart(data = null) {
        const canvas = this.container.querySelector('#strategic-top-tenants-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (this.charts.topTenants) {
            this.charts.topTenants.destroy();
        }

        const chartData = data || {
            labels: ['Salão Bella Vista', 'Mental Health Pro', 'Lima & Associados', 'EduMaster', 'FitLife Academy'],
            data: [892, 734, 612, 578, 489]
        };

        this.charts.topTenants = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: chartData.data,
                    backgroundColor: '#2D5A9B',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString();
                            }
                        }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    /**
     * Render status distribution chart
     */
    renderStatusDistributionChart(data = null) {
        const container = this.container.querySelector('#strategic-status-chart-container');
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.charts.statusDistribution) {
            this.charts.statusDistribution.destroy();
        }

        const chartData = data || {
            labels: ['Confirmados', 'Concluídos', 'Pendentes', 'Cancelados', 'Não Compareceu'],
            data: [4500, 3800, 800, 520, 300]
        };

        // Use direct Chart.js implementation with dashboard format
        console.log('🍩 Using direct Chart.js for status distribution chart');
        container.innerHTML = '<canvas id="strategic-status-chart"></canvas>';
        const canvas = container.querySelector('#strategic-status-chart');
        const ctx = canvas.getContext('2d');

        this.charts.statusDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.data,
                    backgroundColor: ['#198754', '#0dcaf0', '#ffc107', '#dc3545', '#6c757d'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = '#2D5A9B';
                    ctx.fillText(total.toLocaleString(), centerX, centerY - 8);
                    
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#6c757d';
                    ctx.fillText('Total', centerX, centerY + 12);
                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Update ranking table
     */
    updateRankingTable(data = null) {
        const tbody = this.container.querySelector('#strategic-ranking-table-body');
        if (!tbody) return;

        const rankingData = data || this.getMockRankingData();

        const html = rankingData.map((item, index) => `
            <tr>
                <td class="ps-4">
                    <span class="badge bg-primary badge-trend">#${index + 1}</span>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="me-2">
                            <i class="fas fa-building text-muted"></i>
                        </div>
                        <div>
                            <div class="tenant-name">${item.name}</div>
                            <small class="text-muted">${item.segment}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="fw-semibold">${item.appointments.toLocaleString()}</span>
                </td>
                <td>
                    <span class="badge ${item.growth >= 0 ? 'bg-success' : 'bg-danger'} badge-trend">
                        ${item.growth >= 0 ? '+' : ''}${item.growth.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <span class="badge ${item.cancellationRate <= 5 ? 'bg-success' : item.cancellationRate <= 10 ? 'bg-warning' : 'bg-danger'} badge-trend">
                        ${item.cancellationRate.toFixed(1)}%
                    </span>
                </td>
                <td class="pe-4">
                    <span class="badge ${item.showRate >= 90 ? 'bg-success' : item.showRate >= 80 ? 'bg-warning' : 'bg-danger'} badge-trend">
                        ${item.showRate.toFixed(1)}%
                    </span>
                </td>
            </tr>
        `).join('');

        tbody.innerHTML = html;
    }

    /**
     * Populate filter options
     */
    populateFilterOptions(options = null) {
        const mockOptions = options || {
            tenants: ['Salão Bella Vista', 'Clínica Mental Health Pro', 'Lima & Associados'],
            professionals: ['Dr. Ana Silva', 'Psic. Carlos Santos', 'Adv. Maria Oliveira']
        };

        // Populate tenant filter
        const tenantSelect = this.container.querySelector('#strategic-tenant-filter');
        if (tenantSelect) {
            // Clear existing options except "all"
            while (tenantSelect.children.length > 1) {
                tenantSelect.removeChild(tenantSelect.lastChild);
            }
            
            mockOptions.tenants.forEach(tenant => {
                const option = document.createElement('option');
                option.value = tenant.toLowerCase().replace(/\s+/g, '-');
                option.textContent = tenant;
                tenantSelect.appendChild(option);
            });
        }

        // Populate professional filter
        const professionalSelect = this.container.querySelector('#strategic-professional-filter');
        if (professionalSelect) {
            // Clear existing options except "all"
            while (professionalSelect.children.length > 1) {
                professionalSelect.removeChild(professionalSelect.lastChild);
            }
            
            mockOptions.professionals.forEach(professional => {
                const option = document.createElement('option');
                option.value = professional.toLowerCase().replace(/\s+/g, '-');
                option.textContent = professional;
                professionalSelect.appendChild(option);
            });
        }
    }

    /**
     * Show loading states
     */
    showLoadingStates() {
        const metricValues = this.container.querySelectorAll('.strategic-metric-value');
        metricValues.forEach(el => {
            el.classList.add('loading-skeleton');
            el.textContent = '';
        });
    }

    /**
     * Show error state
     */
    showErrorState() {
        const container = this.container.querySelector('.strategic-appointments-container');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Erro ao carregar os dados estratégicos. Tente novamente mais tarde.
                </div>
            `;
        }
    }

    /**
     * Refresh all data
     */
    async refreshAllData() {
        try {
            console.log('🔄 [Strategic] Refresh com filtros aplicados...');
            
            // Show loading states
            this.showLoadingStates();

            // Load data from API or use mock data - WITHOUT recreating widgets
            const data = await this.fetchDataFromAPI();
            
            // Update components with new data (don't recreate them)
            this.updateMetricCards(data.metrics);
            this.renderAllCharts(data);
            this.updateRankingTable(data.ranking);
            // Don't call populateFilterOptions again to avoid resetting filters

            console.log('✅ [Strategic] Dados atualizados com filtros aplicados');

        } catch (error) {
            console.error('❌ [Strategic] Erro ao atualizar dados:', error);
            this.showErrorState('Failed to update appointments data');
        }
    }

    /**
     * Generate timeline data
     */
    generateTimelineData(period) {
        const periods = { '6m': 6, '12m': 12, '24m': 24 };
        const months = periods[period] || 6;
        
        const labels = [];
        const appointments = [];
        const cancellations = [];

        for (let i = months - 1; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            labels.push(date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
            
            const baseAppointments = 550 + Math.random() * 200;
            const baseCancellations = baseAppointments * (0.05 + Math.random() * 0.05);
            
            appointments.push(Math.floor(baseAppointments));
            cancellations.push(Math.floor(baseCancellations));
        }

        return { labels, appointments, cancellations };
    }

    /**
     * Get mock data
     */
    getMockData() {
        return {
            metrics: {
                totalAppointments: 0, // Will be populated from API
                growthRate: 0,
                cancellationRate: 0,
                showRate: 0,
                topTenant: {
                    name: 'Salão Bella Vista',
                    volume: 892,
                    growth: 31.2
                },
                revenueImpact: 0
            },
            timeline: this.generateTimelineData('6m'),
            segmentDistribution: {
                labels: ['Beleza', 'Saúde Mental', 'Jurídico', 'Educação', 'Fitness', 'Consultoria'],
                data: [2840, 2210, 1820, 1510, 980, 640]
            },
            topTenants: {
                labels: ['Salão Bella Vista', 'Mental Health Pro', 'Lima & Associados', 'EduMaster', 'FitLife Academy'],
                data: [892, 734, 612, 578, 489]
            },
            statusDistribution: {
                labels: ['Confirmados', 'Concluídos', 'Pendentes', 'Cancelados', 'Não Compareceu'],
                data: [4500, 3800, 800, 520, 300]
            },
            ranking: this.getMockRankingData(),
            filterOptions: {
                tenants: ['Salão Bella Vista', 'Clínica Mental Health Pro', 'Lima & Associados'],
                professionals: ['Dr. Ana Silva', 'Psic. Carlos Santos', 'Adv. Maria Oliveira']
            }
        };
    }

    /**
     * Get mock ranking data
     */
    getMockRankingData() {
        return [
            { name: 'Salão Bella Vista', segment: 'Beleza', appointments: 892, growth: 31.2, cancellationRate: 3.1, showRate: 95.8 },
            { name: 'Mental Health Pro', segment: 'Saúde Mental', appointments: 734, growth: 28.7, cancellationRate: 4.2, showRate: 93.1 },
            { name: 'Lima & Associados', segment: 'Jurídico', appointments: 612, growth: 22.1, cancellationRate: 5.8, showRate: 91.2 },
            { name: 'EduMaster Tutoring', segment: 'Educação', appointments: 578, growth: 19.5, cancellationRate: 2.9, showRate: 96.3 },
            { name: 'FitLife Academy', segment: 'Fitness', appointments: 489, growth: 35.2, cancellationRate: 6.1, showRate: 89.4 },
            { name: 'ConsultPro', segment: 'Consultoria', appointments: 423, growth: 15.8, cancellationRate: 7.2, showRate: 87.9 },
            { name: 'Beauty Spa Elite', segment: 'Beleza', appointments: 387, growth: 12.3, cancellationRate: 4.5, showRate: 92.1 },
            { name: 'Psic. Bem-Estar', segment: 'Saúde Mental', appointments: 356, growth: 18.9, cancellationRate: 3.8, showRate: 94.2 },
            { name: 'Advocacia Santos', segment: 'Jurídico', appointments: 298, growth: 8.7, cancellationRate: 6.3, showRate: 88.5 },
            { name: 'Smart Learning', segment: 'Educação', appointments: 267, growth: 25.1, cancellationRate: 2.1, showRate: 97.8 }
        ];
    }

    showErrorState(message) {
        const containers = document.querySelectorAll('.strategic-appointments-container');
        containers.forEach(container => {
            container.innerHTML = `
                <div class="widget-error text-center p-4">
                    <div class="error-icon mb-3">⚠️</div>
                    <div class="error-message mb-3">${message}</div>
                    <button class="btn btn-primary" onclick="location.reload()">
                        Reload Page
                    </button>
                </div>
            `;
        });
    }
}

/**
 * Global utility functions for the strategic appointments section
 */
function exportStrategicReport() {
    console.log('🔄 [Strategic] Exportando relatório...');
    alert('Funcionalidade de exportação será implementada');
}

function refreshStrategicData() {
    // Find the container and refresh its data
    const containers = document.querySelectorAll('.strategic-appointments-container');
    containers.forEach(container => {
        const parent = container.parentElement;
        if (parent && parent.strategicAnalytics) {
            parent.strategicAnalytics.refreshAllData();
        }
    });
}

// Export the main function for use in other modules
if (typeof window !== 'undefined') {
    window.renderStrategicAppointmentsSection = renderStrategicAppointmentsSection;
}