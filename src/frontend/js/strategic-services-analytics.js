/**
 * Strategic Services Analytics
 * Comprehensive services analytics for multi-tenant SaaS platform
 * Author: Claude Code
 * Date: 2024
 */

class StrategicServicesAnalytics {
    constructor() {
        this.charts = {};
        this.widgets = {}; // Para widgets reutilizáveis
        this.currentPeriod = '30d';
        this.currentDateRange = 'last_6_months';
        this.currentUser = window.secureAuth?.getUserData();
        this.filters = {
            segment: 'all',
            tenant: 'all',
            status: 'active'
        };
        // Will be built dynamically based on user role
        
        // Hide multi-tenant sections for tenant_admin
        this.initializeRoleBasedVisibility();
    }

    /**
     * Build tenant-aware analytics URL based on user role
     */
    buildAnalyticsUrl(baseEndpoint) {
        const currentUser = window.secureAuth?.getUserData();
        
        if (!currentUser) {
            console.warn('[Services] No user data available, using default endpoint');
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
            } else if (!baseEndpoint.startsWith('/api/analytics/')) {
                url = `/api/analytics${baseEndpoint}`
            }
        }
        
        console.log(`[Services] URL construída: ${url} (role: ${currentUser.role})`);
        return url;
    }

    /**
     * Hide multi-tenant sections for tenant_admin users
     */
    initializeRoleBasedVisibility() {
        if (this.currentUser?.role === 'tenant_admin') {
            console.log('[Services] Hiding multi-tenant sections for tenant_admin');
            
            // Hide tenant filter dropdown
            setTimeout(() => {
                const tenantFilter = document.querySelector('select[name="tenant"], .tenant-filter');
                if (tenantFilter) {
                    tenantFilter.closest('.col-md-3, .form-group, .filter-group')?.style.setProperty('display', 'none');
                }
                
                // Hide any element with "Top X" and tenant-related content
                const allElements = document.querySelectorAll('*');
                allElements.forEach(element => {
                    if (element.textContent?.includes('Top') && (element.textContent?.includes('Tenant') || element.textContent?.includes('Empresa'))) {
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
     * Initialize the services analytics section
     */
    async init(container) {
        try {
            console.log('🚀 Initializing Strategic Services Analytics...');
            
            // Create the HTML structure
            container.innerHTML = this.createHTML();
            
            // Bind event listeners
            this.bindEvents();
            
            // Load initial data
            await this.loadData();
            
            console.log('✅ Strategic Services Analytics initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing services analytics:', error);
            container.innerHTML = '<div class="alert alert-danger">Erro ao carregar análise de serviços</div>';
        }
    }

    /**
     * Create the complete HTML structure for services analytics
     */
    createHTML() {
        return `
            <!-- Services Analytics Header -->
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 class="h3 fw-bold text-dark mb-1">Análise Estratégica de Serviços</h2>
                    <p class="text-muted mb-0">Visão macro de performance, tendências e oportunidades dos serviços</p>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="window.servicesAnalytics.exportReport()">
                        <i class="fas fa-download"></i> Exportar
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.servicesAnalytics.refreshData()">
                        <i class="fas fa-sync"></i> Atualizar
                    </button>
                </div>
            </div>

            <!-- Filters Section -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title mb-3">Filtros Estratégicos</h6>
                            <div class="row g-3">
                                <div class="col-md-2">
                                    <label class="form-label small">Período</label>
                                    <div class="btn-group d-flex" role="group">
                                        <input type="radio" class="btn-check" name="servicePeriod" id="services_7d" value="7d">
                                        <label class="btn btn-outline-primary btn-sm" for="services_7d">7d</label>
                                        
                                        <input type="radio" class="btn-check" name="servicePeriod" id="services_30d" value="30d" checked>
                                        <label class="btn btn-outline-primary btn-sm" for="services_30d">30d</label>
                                        
                                        <input type="radio" class="btn-check" name="servicePeriod" id="services_90d" value="90d">
                                        <label class="btn btn-outline-primary btn-sm" for="services_90d">90d</label>
                                    </div>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Tendência</label>
                                    <select class="form-select form-select-sm" id="dateRangeSelect">
                                        <option value="last_6_months">6 meses</option>
                                        <option value="last_12_months">12 meses</option>
                                        <option value="last_24_months">24 meses</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Segmento</label>
                                    <select class="form-select form-select-sm" id="segmentFilter">
                                        <option value="all">Todos</option>
                                        <option value="beauty">Beleza</option>
                                        <option value="healthcare">Saúde</option>
                                        <option value="legal">Jurídico</option>
                                        <option value="education">Educação</option>
                                        <option value="sports">Esportes</option>
                                        <option value="consulting">Consultoria</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Tenant</label>
                                    <select class="form-select form-select-sm" id="tenantFilter">
                                        <option value="all">Todos</option>
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Status</label>
                                    <select class="form-select form-select-sm" id="statusFilter">
                                        <option value="active">Ativos</option>
                                        <option value="inactive">Inativos</option>
                                        <option value="all">Todos</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">&nbsp;</label>
                                    <button class="btn btn-primary btn-sm d-block w-100" onclick="window.servicesAnalytics.applyFilters()">
                                        <i class="fas fa-filter"></i> Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="row mb-4" id="servicesSummaryCards">
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-cogs text-primary"></i>
                            </div>
                            <h3 class="h4 mb-1 text-primary fw-bold" id="totalServices">-</h3>
                            <p class="text-muted small mb-0">Serviços Ativos</p>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-trophy text-warning"></i>
                            </div>
                            <h3 class="h6 mb-1 text-dark fw-bold" id="mostBookedService">-</h3>
                            <p class="text-muted small mb-0">Mais Agendado</p>
                            <small class="text-primary fw-bold" id="mostBookedValue">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-chart-line text-success"></i>
                            </div>
                            <h3 class="h6 mb-1 text-dark fw-bold" id="fastestGrowingService">-</h3>
                            <p class="text-muted small mb-0">Maior Crescimento</p>
                            <small class="text-primary fw-bold" id="fastestGrowingValue">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-exclamation-triangle text-danger"></i>
                            </div>
                            <h3 class="h6 mb-1 text-dark fw-bold" id="highestCancelService">-</h3>
                            <p class="text-muted small mb-0">Maior Cancelamento</p>
                            <small class="text-primary fw-bold" id="highestCancelValue">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-dollar-sign text-success"></i>
                            </div>
                            <h3 class="h4 mb-1 text-success fw-bold" id="totalServiceRevenue">-</h3>
                            <p class="text-muted small mb-0">Receita Total</p>
                            <small class="text-primary fw-bold" id="revenueGrowth">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-star text-info"></i>
                            </div>
                            <h3 class="h4 mb-1 text-info fw-bold" id="avgServiceRating">-</h3>
                            <p class="text-muted small mb-0">Avaliação Média</p>
                            <small class="text-primary fw-bold" id="ratingTrend">-</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="row mb-4">
                <!-- Top Services Bar Chart -->
                <div class="col-lg-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Top 10 Serviços por Volume</h6>
                            <i class="fas fa-chart-bar text-muted"></i>
                        </div>
                        <div class="card-body">
                            <canvas id="topServicesChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Revenue Distribution Pie Chart -->
                <div class="col-lg-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Distribuição de Receita</h6>
                            <i class="fas fa-chart-pie text-muted"></i>
                        </div>
                        <div class="card-body">
                            <div style="height: 250px; position: relative;">
                                <canvas id="revenueDistributionChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Trend Charts Row -->
            <div class="row mb-4">
                <!-- Bookings Trend Line Chart -->
                <div class="col-lg-8 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Tendência de Agendamentos por Serviço</h6>
                            <div class="btn-group btn-group-sm">
                                <input type="radio" class="btn-check" name="trendPeriod" id="trend_6m" value="6" checked>
                                <label class="btn btn-outline-primary" for="trend_6m">6m</label>
                                <input type="radio" class="btn-check" name="trendPeriod" id="trend_12m" value="12">
                                <label class="btn btn-outline-primary" for="trend_12m">12m</label>
                            </div>
                        </div>
                        <div class="card-body">
                            <canvas id="bookingsTrendChart" height="120"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Performance Heatmap (or Capacity vs Demand) -->
                <div class="col-lg-4 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Performance vs Capacidade</h6>
                            <i class="fas fa-thermometer-half text-muted"></i>
                        </div>
                        <div class="card-body">
                            <canvas id="performanceChart" height="120"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Ranking Table -->
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Ranking de Performance dos Serviços</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary active" onclick="window.servicesAnalytics.sortTable('bookings')">
                                    Por Volume
                                </button>
                                <button class="btn btn-outline-primary" onclick="window.servicesAnalytics.sortTable('growth')">
                                    Por Crescimento
                                </button>
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="px-3">#</th>
                                            <th>Serviço</th>
                                            <th class="text-center">Agendamentos</th>
                                            <th class="text-center">Crescimento</th>
                                            <th class="text-center">Cancelamentos</th>
                                            <th class="text-center">Receita</th>
                                            <th>Top Tenant</th>
                                            <th class="text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody id="servicesRankingTable">
                                        <!-- Data will be populated by JavaScript -->
                                        <tr>
                                            <td colspan="8" class="text-center py-4">
                                                <div class="spinner-border text-primary" role="status">
                                                    <span class="visually-hidden">Carregando...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Bind event listeners for filters and interactions
     */
    bindEvents() {
        // Period filters
        document.querySelectorAll('input[name="servicePeriod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                this.loadData();
            });
        });

        // Date range filter
        document.getElementById('dateRangeSelect').addEventListener('change', (e) => {
            this.currentDateRange = e.target.value;
            this.loadData();
        });

        // Trend period buttons
        document.querySelectorAll('input[name="trendPeriod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateTrendChart(parseInt(e.target.value));
            });
        });
    }

    /**
     * Load data from API or use mock data
     */
    async loadData() {
        try {
            console.log('📊 Loading services analytics data...');
            
            // Show loading state
            this.showLoadingState();
            
            // Try to fetch from API, fallback to mock data
            let data;
            try {
                const apiUrl = this.buildAnalyticsUrl('/metrics');
                const response = await fetch(`${apiUrl}?period=${this.currentPeriod}&range=${this.currentDateRange}`);
                if (response.ok) {
                    data = await response.json();
                    // Transform API data to expected format for services
                    data = this.transformApiDataToServicesFormat(data);
                } else {
                    throw new Error('API not available');
                }
            } catch (error) {
                console.log('🔄 Using mock data for services analytics');
                data = this.getMockData();
            }
            
            // Update UI with data
            this.updateSummaryCards(data.summary);
            this.updateCharts(data.charts);
            this.updateRankingTable(data.ranking);
            
            console.log('✅ Services analytics data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading services data:', error);
            this.showErrorState();
        }
    }

    /**
     * Transform API analytics data to services format
     */
    transformApiDataToServicesFormat(apiData) {
        return {
            summary: {
                totalServices: apiData.services?.totalServices || 0,
                mostBooked: apiData.services?.mostPopular || { name: 'Nenhum', value: 0 },
                fastestGrowing: { name: 'N/A', value: '+0%' },
                highestCancel: { name: 'N/A', value: '0%' },
                totalRevenue: `R$ ${(apiData.revenue?.total || apiData.revenue?.totalRevenue || 0).toLocaleString('pt-BR')}`,
                revenueGrowth: `+${(apiData.revenue?.growthRate || 0).toFixed(1)}%`,
                avgRating: 0,
                ratingTrend: '+0'
            },
            charts: {
                topServices: {
                    labels: (apiData.services?.popular || []).slice(0, 10).map(s => s.name),
                    data: (apiData.services?.popular || []).slice(0, 10).map(s => s.totalBookings || 0)
                },
                revenueDistribution: {
                    labels: (apiData.services?.popular || []).slice(0, 6).map(s => s.name),
                    data: (apiData.services?.popular || []).slice(0, 6).map(s => s.revenue || 0)
                }
            },
            ranking: (apiData.services?.popular || []).slice(0, 10).map((service, index) => ({
                rank: index + 1,
                name: service.name,
                bookings: service.totalBookings || 0,
                growth: ((service.completionRate || 0) - 50).toFixed(1),
                cancellationRate: (100 - (service.completionRate || 0)).toFixed(1),
                revenue: `R$ ${(service.revenue || 0).toLocaleString('pt-BR')}`,
                topTenant: 'Negócio Principal',
                status: 'active'
            }))
        };
    }

    /**
     * Generate mock data for demonstration
     */
    getMockData() {
        const services = [
            'Corte de Cabelo', 'Manicure', 'Pedicure', 'Escova Progressiva',
            'Consulta Psicológica', 'Consulta Jurídica', 'Aula de Inglês',
            'Personal Training', 'Massagem Relaxante', 'Limpeza de Pele'
        ];

        const tenants = [
            'Negócio A', 'Negócio B', 'Negócio C',
            'Negócio D', 'Negócio E', 'Negócio F'
        ];

        return {
            summary: {
                totalServices: 47,
                mostBooked: { name: 'Nenhum', value: 0 },
                fastestGrowing: { name: 'Personal Training', value: '+45%' },
                highestCancel: { name: 'Consulta Jurídica', value: '12.3%' },
                totalRevenue: 'R$ 0',
                revenueGrowth: '+18.2%',
                avgRating: 4.7,
                ratingTrend: '+0.3'
            },
            charts: {
                topServices: {
                    labels: services.slice(0, 10),
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                revenueDistribution: {
                    labels: ['Corte de Cabelo', 'Manicure', 'Pedicure', 'Escova Progressiva', 'Consulta Psicológica', 'Personal Training'],
                    data: [85400, 62300, 51200, 48900, 41500, 53200]
                },
                bookingsTrend: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    datasets: services.slice(0, 5).map((service, index) => ({
                        label: service,
                        data: Array.from({length: 6}, () => Math.floor(Math.random() * 200) + 50),
                        borderColor: this.getChartColor(index),
                        backgroundColor: this.getChartColor(index, 0.1),
                        tension: 0.4
                    }))
                },
                performance: {
                    labels: services.slice(0, 8),
                    data: Array.from({length: 8}, () => Math.floor(Math.random() * 100) + 1)
                }
            },
            ranking: services.slice(0, 10).map((service, index) => ({
                rank: index + 1,
                name: service,
                bookings: 0,
                growth: (Math.random() * 60 - 10).toFixed(1),
                cancellationRate: (Math.random() * 15).toFixed(1),
                revenue: `R$ ${(85000 - index * 8000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
                topTenant: tenants[Math.floor(Math.random() * tenants.length)],
                status: Math.random() > 0.1 ? 'active' : 'inactive'
            }))
        };
    }

    /**
     * Update summary cards with data
     */
    updateSummaryCards(summary) {
        document.getElementById('totalServices').textContent = summary.totalServices;
        document.getElementById('mostBookedService').textContent = summary.mostBooked.name;
        document.getElementById('mostBookedValue').textContent = summary.mostBooked.value;
        document.getElementById('fastestGrowingService').textContent = summary.fastestGrowing.name;
        document.getElementById('fastestGrowingValue').textContent = summary.fastestGrowing.value;
        document.getElementById('highestCancelService').textContent = summary.highestCancel.name;
        document.getElementById('highestCancelValue').textContent = summary.highestCancel.value;
        document.getElementById('totalServiceRevenue').textContent = summary.totalRevenue;
        document.getElementById('revenueGrowth').textContent = summary.revenueGrowth;
        document.getElementById('avgServiceRating').textContent = summary.avgRating;
        document.getElementById('ratingTrend').textContent = summary.ratingTrend;
    }

    /**
     * Update all charts with data
     */
    updateCharts(chartsData) {
        this.createTopServicesChart(chartsData.topServices);
        this.createRevenueDistributionChart(chartsData.revenueDistribution);
        this.createBookingsTrendChart(chartsData.bookingsTrend);
        this.createPerformanceChart(chartsData.performance);
    }

    /**
     * Create top services bar chart
     */
    createTopServicesChart(data) {
        const ctx = document.getElementById('topServicesChart').getContext('2d');
        
        if (this.charts.topServices) {
            this.charts.topServices.destroy();
        }

        this.charts.topServices = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: data.data,
                    backgroundColor: data.labels.map((_, index) => this.getChartColor(index, 0.8)),
                    borderColor: data.labels.map((_, index) => this.getChartColor(index)),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    /**
     * Create revenue distribution doughnut chart using standard widget
     */
    createRevenueDistributionChart(data) {
        console.log('🍩 [Services] Criando doughnut chart com widget padrão...');
        console.log('🍩 [Services] Dados recebidos:', data);
        console.log('🍩 [Services] Widget disponível:', !!window.RevenueDoughnutWidget);
        
        // Destruir widget anterior se existir
        if (this.widgets.revenueDistribution) {
            console.log('🍩 [Services] Destruindo widget anterior');
            this.widgets.revenueDistribution.destroy();
        }

        // Por enquanto, vamos usar o fallback para garantir que funcione exatamente como o dashboard
        console.log('🍩 [Services] Usando método fallback para manter consistência total com dashboard');
        this.createRevenueDistributionChartFallback(data);
    }

    /**
     * Fallback method using Chart.js directly
     */
    createRevenueDistributionChartFallback(data) {
        console.log('🔄 [Services] Usando método fallback para doughnut chart');
        
        const ctx = document.getElementById('revenueDistributionChart').getContext('2d');
        
        if (this.charts.revenueDistribution) {
            this.charts.revenueDistribution.destroy();
        }

        const total = data.data.reduce((a, b) => a + b, 0);

        this.charts.revenueDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: [
                        '#e91e63', '#2196f3', '#ff9800', 
                        '#4caf50', '#9c27b0', '#607d8b'
                    ],
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
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${context.label}: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${percentage}%)`;
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
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = '#2c3e50';
                    ctx.fillText(`R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, centerX, centerY - 8);
                    
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#6c757d';
                    ctx.fillText('Total', centerX, centerY + 12);
                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Create bookings trend line chart
     */
    createBookingsTrendChart(data) {
        const ctx = document.getElementById('bookingsTrendChart').getContext('2d');
        
        if (this.charts.bookingsTrend) {
            this.charts.bookingsTrend.destroy();
        }

        this.charts.bookingsTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: data.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    /**
     * Create performance vs capacity chart
     */
    createPerformanceChart(data) {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        if (this.charts.performance) {
            this.charts.performance.destroy();
        }

        this.charts.performance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Performance (%)',
                    data: data.data,
                    backgroundColor: 'rgba(45, 90, 155, 0.2)',
                    borderColor: 'rgba(45, 90, 155, 1)',
                    pointBackgroundColor: 'rgba(45, 90, 155, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(45, 90, 155, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20
                        }
                    }
                }
            }
        });
    }

    /**
     * Update ranking table with data
     */
    updateRankingTable(ranking) {
        const tbody = document.getElementById('servicesRankingTable');
        
        tbody.innerHTML = ranking.map(service => `
            <tr>
                <td class="px-3 fw-bold">${service.rank}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="service-icon me-2">
                            <i class="fas fa-cog text-primary"></i>
                        </div>
                        <div>
                            <div class="fw-medium">${service.name}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="badge bg-light text-dark">${service.bookings}</span>
                </td>
                <td class="text-center">
                    <span class="badge ${parseFloat(service.growth) >= 0 ? 'bg-success' : 'bg-danger'}">
                        ${service.growth}%
                    </span>
                </td>
                <td class="text-center">
                    <span class="badge ${parseFloat(service.cancellationRate) < 10 ? 'bg-success' : parseFloat(service.cancellationRate) < 20 ? 'bg-warning' : 'bg-danger'}">
                        ${service.cancellationRate}%
                    </span>
                </td>
                <td class="text-center fw-medium text-success">${service.revenue}</td>
                <td>
                    <span class="text-muted small">${service.topTenant}</span>
                </td>
                <td class="text-center">
                    <span class="badge ${service.status === 'active' ? 'bg-success' : 'bg-secondary'}">
                        ${service.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Get chart color by index
     */
    getChartColor(index, alpha = 1) {
        const colors = [
            `rgba(45, 90, 155, ${alpha})`,   // Primary blue
            `rgba(255, 193, 7, ${alpha})`,   // Warning yellow
            `rgba(40, 167, 69, ${alpha})`,   // Success green
            `rgba(220, 53, 69, ${alpha})`,   // Danger red
            `rgba(23, 162, 184, ${alpha})`,  // Info cyan
            `rgba(108, 117, 125, ${alpha})`, // Secondary gray
            `rgba(102, 126, 234, ${alpha})`, // Purple
            `rgba(255, 99, 132, ${alpha})`,  // Pink
            `rgba(54, 162, 235, ${alpha})`,  // Light blue
            `rgba(255, 159, 64, ${alpha})`   // Orange
        ];
        return colors[index % colors.length];
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        // Update summary cards
        ['totalServices', 'mostBookedService', 'fastestGrowingService', 
         'highestCancelService', 'totalServiceRevenue', 'avgServiceRating'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '...';
        });
    }

    /**
     * Show error state
     */
    showErrorState() {
        const tbody = document.getElementById('servicesRankingTable');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle mb-2"></i><br>
                    Erro ao carregar dados dos serviços
                </td>
            </tr>
        `;
    }

    /**
     * Apply filters and reload data
     */
    applyFilters() {
        this.filters = {
            segment: document.getElementById('segmentFilter').value,
            tenant: document.getElementById('tenantFilter').value,
            status: document.getElementById('statusFilter').value
        };
        this.loadData();
    }

    /**
     * Sort ranking table
     */
    sortTable(criteria) {
        console.log(`Sorting table by ${criteria}`);
        // Update active button
        document.querySelectorAll('.btn-group .btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        // Reload data with new sorting
        this.loadData();
    }

    /**
     * Update trend chart period
     */
    updateTrendChart(months) {
        console.log(`Updating trend chart for ${months} months`);
        // This would typically reload the trend data for the new period
        this.loadData();
    }

    /**
     * Export report
     */
    exportReport() {
        console.log('Exporting services analytics report...');
        // Implementation for exporting report
        alert('Funcionalidade de exportação será implementada');
    }

    /**
     * Refresh data
     */
    refreshData() {
        console.log('Refreshing services analytics data...');
        this.loadData();
    }
}

// Global function to render strategic services analytics section
window.renderStrategicServicesSection = function(container) {
    if (!window.servicesAnalytics) {
        window.servicesAnalytics = new StrategicServicesAnalytics();
    }
    window.servicesAnalytics.init(container);
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrategicServicesAnalytics;
}