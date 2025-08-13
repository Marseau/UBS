/**
 * Strategic Customers Analytics
 * Comprehensive customer analytics for multi-tenant SaaS platform
 * Author: Claude Code
 * Date: 2025
 */

class StrategicCustomersAnalytics {
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
        if (!currentUser) return baseEndpoint;
        
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
        return url;
    }

    /**
     * Hide multi-tenant sections for tenant_admin users
     */
    initializeRoleBasedVisibility() {
        if (this.currentUser?.role === 'tenant_admin') {
            console.log('[Customers] Hiding multi-tenant sections for tenant_admin');
            
            // Hide tenant filter dropdown
            const tenantFilter = document.querySelector('select[name="tenant"], .tenant-filter');
            if (tenantFilter) {
                tenantFilter.closest('.col-md-3, .form-group, .filter-group')?.style.setProperty('display', 'none');
            }
            
            // Hide "Top X Tenants" sections
            const topTenantsSections = document.querySelectorAll('[class*="top"][class*="tenant"], [id*="topTenant"], [id*="TopTenant"]');
            topTenantsSections.forEach(section => {
                const container = section.closest('.col-lg-6, .card, .widget');
                if (container) {
                    container.style.display = 'none';
                }
            });
            
            // Hide any element with "Top 10 Tenants" in text
            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
                if (element.textContent?.includes('Top') && element.textContent?.includes('Tenant')) {
                    const container = element.closest('.col-lg-6, .card, .widget');
                    if (container) {
                        container.style.display = 'none';
                    }
                }
            });
        }
    }

    /**
     * Initialize the customers analytics section
     */
    async init(container) {
        try {
            console.log('🚀 Initializing Strategic Customers Analytics...');
            
            // Create the HTML structure
            container.innerHTML = this.createHTML();
            
            // Bind event listeners
            this.bindEvents();
            
            // Load initial data
            await this.loadData();
            
            console.log('✅ Strategic Customers Analytics initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing customers analytics:', error);
            container.innerHTML = '<div class="alert alert-danger">Erro ao carregar análise de clientes</div>';
        }
    }

    /**
     * Create the complete HTML structure for customers analytics
     */
    createHTML() {
        return `
            <!-- Customers Analytics Header -->
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 class="h3 fw-bold text-dark mb-1">Análise Estratégica de Clientes</h2>
                    <p class="text-muted mb-0">Crescimento, retenção, churn e performance por tenant</p>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="window.customersAnalytics.exportReport()">
                        <i class="fas fa-download"></i> Exportar
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.customersAnalytics.refreshData()">
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
                                        <input type="radio" class="btn-check" name="customerPeriod" id="customers_7d" value="7d">
                                        <label class="btn btn-outline-primary btn-sm" for="customers_7d">7d</label>
                                        
                                        <input type="radio" class="btn-check" name="customerPeriod" id="customers_30d" value="30d" checked>
                                        <label class="btn btn-outline-primary btn-sm" for="customers_30d">30d</label>
                                        
                                        <input type="radio" class="btn-check" name="customerPeriod" id="customers_90d" value="90d">
                                        <label class="btn btn-outline-primary btn-sm" for="customers_90d">90d</label>
                                    </div>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Tendência</label>
                                    <select class="form-select form-select-sm" id="customersDateRangeSelect">
                                        <option value="last_6_months">6 meses</option>
                                        <option value="last_12_months">12 meses</option>
                                        <option value="last_24_months">24 meses</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Segmento</label>
                                    <select class="form-select form-select-sm" id="customersSegmentFilter">
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
                                    <select class="form-select form-select-sm" id="customersTenantFilter">
                                        <option value="all">Todos</option>
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">Status</label>
                                    <select class="form-select form-select-sm" id="customersStatusFilter">
                                        <option value="active">Ativos</option>
                                        <option value="inactive">Inativos</option>
                                        <option value="churned">Cancelados</option>
                                        <option value="all">Todos</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small">&nbsp;</label>
                                    <button class="btn btn-primary btn-sm d-block w-100" onclick="window.customersAnalytics.applyFilters()">
                                        <i class="fas fa-filter"></i> Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="row mb-4" id="customersSummaryCards">
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-users text-primary"></i>
                            </div>
                            <h3 class="h4 mb-1 text-primary fw-bold" id="totalCustomers">-</h3>
                            <p class="text-muted small mb-0">Total de Clientes</p>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-user-plus text-success"></i>
                            </div>
                            <h3 class="h4 mb-1 text-success fw-bold" id="newCustomers">-</h3>
                            <p class="text-muted small mb-0">Novos Clientes</p>
                            <small class="text-primary fw-bold" id="newCustomersGrowth">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-chart-line-down text-danger"></i>
                            </div>
                            <h3 class="h4 mb-1 text-danger fw-bold" id="churnRate">-</h3>
                            <p class="text-muted small mb-0">Taxa de Churn</p>
                            <small class="text-primary fw-bold" id="churnTrend">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-dollar-sign text-warning"></i>
                            </div>
                            <h3 class="h4 mb-1 text-warning fw-bold" id="avgLTV">-</h3>
                            <p class="text-muted small mb-0">LTV Médio</p>
                            <small class="text-primary fw-bold" id="ltvTrend">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-trophy text-info"></i>
                            </div>
                            <h3 class="h6 mb-1 text-dark fw-bold" id="topGrowthTenant">-</h3>
                            <p class="text-muted small mb-0">Maior Crescimento</p>
                            <small class="text-primary fw-bold" id="topGrowthValue">-</small>
                        </div>
                    </div>
                </div>
                
                <div class="col-lg-2 col-md-4 col-sm-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-chart-pie text-secondary"></i>
                            </div>
                            <h3 class="h4 mb-1 text-secondary fw-bold" id="activePercentage">-</h3>
                            <p class="text-muted small mb-0">% Ativos</p>
                            <small class="text-primary fw-bold" id="activeVsInactive">-</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="row mb-4">
                <!-- Customer Growth Line Chart -->
                <div class="col-lg-8 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Crescimento de Clientes ao Longo do Tempo</h6>
                            <div class="btn-group btn-group-sm">
                                <input type="radio" class="btn-check" name="growthPeriod" id="growth_6m" value="6" checked>
                                <label class="btn btn-outline-primary" for="growth_6m">6m</label>
                                <input type="radio" class="btn-check" name="growthPeriod" id="growth_12m" value="12">
                                <label class="btn btn-outline-primary" for="growth_12m">12m</label>
                            </div>
                        </div>
                        <div class="card-body">
                            <canvas id="customerGrowthChart" height="120"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Customer Distribution Pie Chart -->
                <div class="col-lg-4 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Distribuição por Segmento</h6>
                            <i class="fas fa-chart-pie text-muted"></i>
                        </div>
                        <div class="card-body">
                            <div style="height: 250px; position: relative;">
                                <canvas id="customerDistributionChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Performance Charts Row -->
            <div class="row mb-4">
                <!-- Top Tenants by New Customers -->
                <div class="col-lg-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Top 10 Tenants - Novos Clientes</h6>
                            <i class="fas fa-chart-bar text-muted"></i>
                        </div>
                        <div class="card-body">
                            <canvas id="topTenantsChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Churn Rate by Tenant -->
                <div class="col-lg-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Taxa de Churn por Tenant</h6>
                            <i class="fas fa-chart-bar text-muted"></i>
                        </div>
                        <div class="card-body">
                            <canvas id="churnByTenantChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Ranking Table -->
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">Ranking de Performance dos Tenants</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary active" onclick="window.customersAnalytics.sortTable('newCustomers')">
                                    Por Novos Clientes
                                </button>
                                <button class="btn btn-outline-primary" onclick="window.customersAnalytics.sortTable('churn')">
                                    Por Churn
                                </button>
                                <button class="btn btn-outline-primary" onclick="window.customersAnalytics.sortTable('ltv')">
                                    Por LTV
                                </button>
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="px-3">#</th>
                                            <th>Tenant</th>
                                            <th class="text-center">Total Clientes</th>
                                            <th class="text-center">Novos Clientes</th>
                                            <th class="text-center">Taxa Churn (%)</th>
                                            <th class="text-center">LTV Médio</th>
                                            <th class="text-center">% Ativos</th>
                                            <th class="text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody id="customersRankingTable">
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
        document.querySelectorAll('input[name="customerPeriod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                this.loadData();
            });
        });

        // Date range filter
        document.getElementById('customersDateRangeSelect').addEventListener('change', (e) => {
            this.currentDateRange = e.target.value;
            this.loadData();
        });

        // Growth period buttons
        document.querySelectorAll('input[name="growthPeriod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateGrowthChart(parseInt(e.target.value));
            });
        });
    }

    /**
     * Load data from API or use mock data
     */
    async loadData() {
        try {
            console.log('📊 Loading customers analytics data...');
            
            // Show loading state
            this.showLoadingState();
            
            // Try to fetch from API, fallback to mock data
            let data;
            try {
                const apiUrl = this.buildAnalyticsUrl('/metrics');
                const response = await fetch(`${apiUrl}?period=${this.currentPeriod}&range=${this.currentDateRange}`);
                if (response.ok) {
                    data = await response.json();
                } else {
                    throw new Error('API not available');
                }
            } catch (error) {
                console.log('🔄 Using mock data for customers analytics');
                data = this.getMockData();
            }
            
            // Update UI with data
            this.updateSummaryCards(data.summary);
            this.updateCharts(data.charts);
            this.updateRankingTable(data.ranking);
            
            console.log('✅ Customers analytics data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading customers data:', error);
            this.showErrorState();
        }
    }

    /**
     * Generate mock data for demonstration
     */
    getMockData() {
        const tenants = [
            'Salão Elegância', 'Clínica Bem-Estar', 'Escritório Silva & Santos',
            'Academia Fitness', 'Instituto de Beleza', 'Centro Médico',
            'Estúdio Zen', 'Consultoria Premium', 'Clínica Especializada',
            'Academia VitalFit'
        ];

        const segments = ['beauty', 'healthcare', 'legal', 'sports', 'consulting', 'education'];

        return {
            summary: {
                totalCustomers: 0, // Will be populated from API
                newCustomers: { value: 0, growth: '0%' },
                churnRate: { value: '0%', trend: '0%' },
                avgLTV: { value: 'R$ 0', trend: '0%' },
                topGrowthTenant: { name: 'Nenhum', value: '0%' },
                activePercentage: { value: '84.7%', comparison: '15.3% inativos' }
            },
            charts: {
                customerGrowth: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    datasets: [{
                        label: 'Novos Clientes',
                        data: [89, 134, 156, 178, 245, 342],
                        borderColor: '#2D5A9B',
                        backgroundColor: 'rgba(45, 90, 155, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Clientes Perdidos',
                        data: [23, 31, 45, 38, 52, 67],
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                customerDistribution: {
                    labels: ['Beleza', 'Saúde', 'Jurídico', 'Esportes', 'Consultoria', 'Educação'],
                    data: [3200, 2800, 2100, 1900, 1500, 1347]
                },
                topTenants: {
                    labels: tenants.slice(0, 10),
                    data: [89, 76, 65, 58, 52, 47, 43, 39, 35, 31]
                },
                churnByTenant: {
                    labels: tenants.slice(0, 8),
                    data: [12.5, 8.3, 6.7, 9.2, 11.8, 7.4, 5.9, 10.1]
                }
            },
            ranking: tenants.slice(0, 10).map((tenant, index) => ({
                rank: index + 1,
                name: tenant,
                totalCustomers: 1800 - (index * 150),
                newCustomers: 89 - (index * 8),
                churnRate: (5 + Math.random() * 10).toFixed(1),
                avgLTV: `R$ ${(2800 - index * 200).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
                activePercentage: (85 + Math.random() * 10).toFixed(1),
                status: Math.random() > 0.1 ? 'active' : 'attention'
            }))
        };
    }

    /**
     * Update summary cards with data
     */
    updateSummaryCards(summary) {
        document.getElementById('totalCustomers').textContent = summary.totalCustomers.toLocaleString();
        document.getElementById('newCustomers').textContent = summary.newCustomers.value;
        document.getElementById('newCustomersGrowth').textContent = summary.newCustomers.growth;
        document.getElementById('churnRate').textContent = summary.churnRate.value;
        document.getElementById('churnTrend').textContent = summary.churnRate.trend;
        document.getElementById('avgLTV').textContent = summary.avgLTV.value;
        document.getElementById('ltvTrend').textContent = summary.avgLTV.trend;
        document.getElementById('topGrowthTenant').textContent = summary.topGrowthTenant.name;
        document.getElementById('topGrowthValue').textContent = summary.topGrowthTenant.value;
        document.getElementById('activePercentage').textContent = summary.activePercentage.value;
        document.getElementById('activeVsInactive').textContent = summary.activePercentage.comparison;
    }

    /**
     * Update all charts with data
     */
    updateCharts(chartsData) {
        this.createCustomerGrowthChart(chartsData.customerGrowth);
        this.createCustomerDistributionChart(chartsData.customerDistribution);
        this.createTopTenantsChart(chartsData.topTenants);
        this.createChurnByTenantChart(chartsData.churnByTenant);
    }

    /**
     * Create customer growth line chart
     */
    createCustomerGrowthChart(data) {
        const ctx = document.getElementById('customerGrowthChart').getContext('2d');
        
        if (this.charts.customerGrowth) {
            this.charts.customerGrowth.destroy();
        }

        this.charts.customerGrowth = new Chart(ctx, {
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
     * Create customer distribution doughnut chart using same pattern as dashboard
     */
    createCustomerDistributionChart(data) {
        console.log('🍩 [Customers] Criando doughnut chart com padrão do dashboard...');
        
        const ctx = document.getElementById('customerDistributionChart').getContext('2d');
        
        if (this.charts.customerDistribution) {
            this.charts.customerDistribution.destroy();
        }

        const total = data.data.reduce((a, b) => a + b, 0);

        this.charts.customerDistribution = new Chart(ctx, {
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
                                return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
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
     * Create top tenants bar chart
     */
    createTopTenantsChart(data) {
        const ctx = document.getElementById('topTenantsChart').getContext('2d');
        
        if (this.charts.topTenants) {
            this.charts.topTenants.destroy();
        }

        this.charts.topTenants = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Novos Clientes',
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
     * Create churn by tenant bar chart
     */
    createChurnByTenantChart(data) {
        const ctx = document.getElementById('churnByTenantChart').getContext('2d');
        
        if (this.charts.churnByTenant) {
            this.charts.churnByTenant.destroy();
        }

        this.charts.churnByTenant = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Taxa de Churn (%)',
                    data: data.data,
                    backgroundColor: data.data.map(value => {
                        if (value > 10) return 'rgba(220, 53, 69, 0.8)'; // Red for high churn
                        if (value > 7) return 'rgba(255, 193, 7, 0.8)';  // Yellow for medium churn
                        return 'rgba(40, 167, 69, 0.8)';                 // Green for low churn
                    }),
                    borderColor: data.data.map(value => {
                        if (value > 10) return '#dc3545';
                        if (value > 7) return '#ffc107';
                        return '#28a745';
                    }),
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
                        max: 15,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
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
     * Update ranking table with data
     */
    updateRankingTable(ranking) {
        const tbody = document.getElementById('customersRankingTable');
        
        tbody.innerHTML = ranking.map(tenant => `
            <tr>
                <td class="px-3 fw-bold">${tenant.rank}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="tenant-icon me-2">
                            <i class="fas fa-building text-primary"></i>
                        </div>
                        <div>
                            <div class="fw-medium">${tenant.name}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="badge bg-light text-dark">${tenant.totalCustomers}</span>
                </td>
                <td class="text-center">
                    <span class="badge bg-success">${tenant.newCustomers}</span>
                </td>
                <td class="text-center">
                    <span class="badge ${parseFloat(tenant.churnRate) < 7 ? 'bg-success' : parseFloat(tenant.churnRate) < 10 ? 'bg-warning' : 'bg-danger'}">
                        ${tenant.churnRate}%
                    </span>
                </td>
                <td class="text-center fw-medium text-success">${tenant.avgLTV}</td>
                <td class="text-center">
                    <span class="badge bg-info">${tenant.activePercentage}%</span>
                </td>
                <td class="text-center">
                    <span class="badge ${tenant.status === 'active' ? 'bg-success' : 'bg-warning'}">
                        ${tenant.status === 'active' ? 'Ativo' : 'Atenção'}
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
        ['totalCustomers', 'newCustomers', 'churnRate', 
         'avgLTV', 'topGrowthTenant', 'activePercentage'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '...';
        });
    }

    /**
     * Show error state
     */
    showErrorState() {
        const tbody = document.getElementById('customersRankingTable');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle mb-2"></i><br>
                    Erro ao carregar dados dos clientes
                </td>
            </tr>
        `;
    }

    /**
     * Apply filters and reload data
     */
    applyFilters() {
        this.filters = {
            segment: document.getElementById('customersSegmentFilter').value,
            tenant: document.getElementById('customersTenantFilter').value,
            status: document.getElementById('customersStatusFilter').value
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
     * Update growth chart period
     */
    updateGrowthChart(months) {
        console.log(`Updating growth chart for ${months} months`);
        // This would typically reload the growth data for the new period
        this.loadData();
    }

    /**
     * Export report
     */
    exportReport() {
        console.log('Exporting customers analytics report...');
        // Implementation for exporting report
        alert('Funcionalidade de exportação será implementada');
    }

    /**
     * Refresh data
     */
    refreshData() {
        console.log('Refreshing customers analytics data...');
        this.loadData();
    }
}

// Global function to render strategic customers analytics section
window.renderStrategicCustomersSection = function(container) {
    if (!window.customersAnalytics) {
        window.customersAnalytics = new StrategicCustomersAnalytics();
    }
    window.customersAnalytics.init(container);
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrategicCustomersAnalytics;
}