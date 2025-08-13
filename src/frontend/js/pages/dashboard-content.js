/**
 * Dashboard Super Admin - Conteúdo da Página
 * Extraído de dashboard-standardized.html
 */

const DashboardContent = {
    // Renderizar o conteúdo completo do dashboard
    render() {
        return `
            <!-- Quick Actions -->
            <div class="action-buttons" id="actionButtons">
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-primary btn-action" onclick="refreshData()" aria-label="Atualizar dados do dashboard">
                        <i class="fas fa-sync me-2"></i>Atualizar
                    </button>
                    <div class="d-flex align-items-center gap-2">
                        <label class="form-label mb-0 text-muted compact-label" for="globalPeriodSelector">
                            <i class="fas fa-calendar-alt me-1"></i>Período:
                        </label>
                        <select class="form-select compact-select" id="globalPeriodSelector" onchange="changePeriod(this.value)">
                            <option value="7">7 dias</option>
                            <option value="30" selected>30 dias</option>
                            <option value="90">90 dias</option>
                        </select>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-outline-primary btn-action" onclick="exportData()" aria-label="Exportar dados do dashboard">
                        <i class="fas fa-download me-2"></i>Exportar
                    </button>
                    <div class="text-muted compact-small">
                        <i class="fas fa-clock me-1"></i>
                        <span id="lastUpdate">Carregando...</span>
                    </div>
                </div>
            </div>
            
            <!-- Main Content Container -->
            <div id="contentContainer">
                <!-- KPIs Estratégicos -->
                <div class="content-section">
                    <h3><i class="fas fa-tachometer-alt me-2"></i>KPIs Estratégicos</h3>
                    <div class="row g-3 mb-3" id="metricsRow1">
                        <!-- KPI 1: Receita/Uso -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-warning">
                                        <i class="fas fa-balance-scale"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="receitaUsoRatio">R$ 0,00</div>
                                        <div class="metric-title">Receita/Uso</div>
                                        <div class="metric-subtitle">R$ por minuto de chat</div>
                                        <div class="metric-trend trend-neutral" id="receitaUsoTrend">
                                            <i class="fas fa-clock"></i>
                                            <small>Subutilizado</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 2: MRR da Plataforma -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-success">
                                        <i class="fas fa-dollar-sign"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="mrrPlatform">R$ 31.320</div>
                                        <div class="metric-title">MRR</div>
                                        <div class="metric-subtitle">Receita Recorrente Mensal</div>
                                        <div class="metric-trend trend-positive" id="mrrTrend">
                                            <i class="fas fa-arrow-up"></i>
                                            <small>+23% vs anterior</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 3: Tenants Ativos -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-primary">
                                        <i class="fas fa-building"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="activeTenants">392</div>
                                        <div class="metric-title">Tenants Ativos</div>
                                        <div class="metric-subtitle">Clientes pagantes</div>
                                        <div class="metric-trend trend-positive" id="tenantsTrend">
                                            <i class="fas fa-arrow-up"></i>
                                            <small>+18 este mês</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 4: Eficiência Operacional -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-info">
                                        <i class="fas fa-cogs"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="operationalEfficiency">87%</div>
                                        <div class="metric-title">Eficiência Operacional</div>
                                        <div class="metric-subtitle">Agendamentos / Conversas</div>
                                        <div class="metric-trend trend-neutral" id="efficiencyTrend">
                                            <i class="fas fa-minus"></i>
                                            <small>Estável</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row g-3" id="metricsRow2">
                        <!-- KPI 5: Spam Rate -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-danger">
                                        <i class="fas fa-exclamation-triangle"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="spamRate">2.1%</div>
                                        <div class="metric-title">Spam Rate</div>
                                        <div class="metric-subtitle">Conversas spam vs válidas</div>
                                        <div class="metric-trend trend-positive" id="spamTrend">
                                            <i class="fas fa-arrow-down"></i>
                                            <small>-0.3% vs anterior</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 6: Total Agendamentos -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-primary">
                                        <i class="fas fa-calendar-check"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="totalAppointments">15.847</div>
                                        <div class="metric-title">Total Agendamentos</div>
                                        <div class="metric-subtitle">Este mês</div>
                                        <div class="metric-trend trend-positive" id="appointmentsTrend">
                                            <i class="fas fa-arrow-up"></i>
                                            <small>+1.2k vs anterior</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 7: Interações IA -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-info">
                                        <i class="fas fa-robot"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="aiInteractions">89.234</div>
                                        <div class="metric-title">Interações IA</div>
                                        <div class="metric-subtitle">Conversas processadas</div>
                                        <div class="metric-trend trend-positive" id="aiTrend">
                                            <i class="fas fa-arrow-up"></i>
                                            <small>+8.9k vs anterior</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- KPI 8: Taxa Cancelamento -->
                        <div class="col-xl-3 col-lg-6">
                            <div class="metric-card">
                                <div class="metric-card-body">
                                    <div class="metric-icon metric-icon-warning">
                                        <i class="fas fa-times-circle"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value" id="cancellationRate">4.2%</div>
                                        <div class="metric-title">Taxa Cancelamento</div>
                                        <div class="metric-subtitle">Agendamentos cancelados</div>
                                        <div class="metric-trend trend-positive" id="cancellationTrend">
                                            <i class="fas fa-arrow-down"></i>
                                            <small>-0.8% vs anterior</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Análises Avançadas -->
                <div class="content-section">
                    <h3><i class="fas fa-chart-line me-2"></i>Análises Avançadas</h3>
                    <div class="row g-3 mb-4">
                        <!-- Gráfico: Receita vs Uso -->
                        <div class="col-lg-6">
                            <div class="chart-widget">
                                <div class="chart-header">
                                    <h5><i class="fas fa-scatter-chart me-2"></i>Receita vs Uso</h5>
                                    <p class="text-muted">Distribuição de tenants por receita e uso</p>
                                </div>
                                <div class="chart-body">
                                    <canvas id="revenueUsageChart" width="400" height="300"></canvas>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Gráfico: Status dos Agendamentos -->
                        <div class="col-lg-6">
                            <div class="chart-widget">
                                <div class="chart-header">
                                    <h5><i class="fas fa-chart-pie me-2"></i>Status dos Agendamentos</h5>
                                    <p class="text-muted">Distribuição por status atual</p>
                                </div>
                                <div class="chart-body">
                                    <canvas id="appointmentStatusChart" width="400" height="300"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Business Intelligence -->
                <div class="content-section">
                    <h3><i class="fas fa-brain me-2"></i>Business Intelligence</h3>
                    <div class="row g-3">
                        <!-- Análise de Distorção -->
                        <div class="col-lg-6">
                            <div class="widget-section">
                                <div class="widget-header">
                                    <h4 class="widget-title">
                                        <i class="fas fa-exclamation-triangle me-2 text-warning"></i>Análise de Distorção
                                    </h4>
                                    <p class="widget-subtitle">Tenants pagando mais do que usam</p>
                                </div>
                                <div class="widget-content">
                                    <div class="alert alert-warning">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <strong>23 tenants</strong> em risco de churn
                                                <br><small>Pagando mais do que consomem</small>
                                            </div>
                                            <div class="text-end">
                                                <div class="fs-4 fw-bold">R$ 3.847</div>
                                                <small>Receita em risco</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Oportunidades de Upsell -->
                        <div class="col-lg-6">
                            <div class="widget-section">
                                <div class="widget-header">
                                    <h4 class="widget-title">
                                        <i class="fas fa-chart-line me-2 text-success"></i>Oportunidades de Upsell
                                    </h4>
                                    <p class="widget-subtitle">Tenants usando mais do que pagam</p>
                                </div>
                                <div class="widget-content">
                                    <div class="alert alert-success">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <strong>47 tenants</strong> para upgrade
                                                <br><small>Alto uso, baixo pagamento</small>
                                            </div>
                                            <div class="text-end">
                                                <div class="fs-4 fw-bold">R$ 12.234</div>
                                                <small>Potencial revenue</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Inicializar funcionalidades específicas do dashboard
    init() {
        console.log('🚀 Inicializando Dashboard Super Admin...');
        
        // Carregar dados dos KPIs
        this.loadKPIs();
        
        // Inicializar gráficos
        this.initCharts();
        
        // Atualizar timestamp
        this.updateLastUpdate();
        
        console.log('✅ Dashboard Super Admin carregado com sucesso!');
    },

    // Carregar KPIs
    loadKPIs() {
        // Simular carregamento de dados em tempo real
        const kpis = {
            receitaUsoRatio: 'R$ 0,08',
            mrrPlatform: 'R$ 31.320',
            activeTenants: '392',
            operationalEfficiency: '87%',
            spamRate: '2.1%',
            totalAppointments: '15.847',
            aiInteractions: '89.234',
            cancellationRate: '4.2%'
        };

        // Atualizar valores na interface
        Object.keys(kpis).forEach(kpi => {
            const element = document.getElementById(kpi);
            if (element) {
                element.textContent = kpis[kpi];
            }
        });
    },

    // Inicializar gráficos
    initCharts() {
        // Gráfico Receita vs Uso (Scatter)
        setTimeout(() => {
            const ctx1 = document.getElementById('revenueUsageChart');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'scatter',
                    data: {
                        datasets: [{
                            label: 'Tenants',
                            data: [
                                {x: 100, y: 500}, {x: 200, y: 800}, {x: 150, y: 300},
                                {x: 300, y: 1200}, {x: 250, y: 900}, {x: 180, y: 600}
                            ],
                            backgroundColor: 'rgba(45, 90, 155, 0.7)',
                            borderColor: 'rgba(45, 90, 155, 1)'
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            x: { title: { display: true, text: 'Uso (minutos)' } },
                            y: { title: { display: true, text: 'Receita (R$)' } }
                        }
                    }
                });
            }
        }, 100);

        // Gráfico Status Agendamentos (Doughnut)
        setTimeout(() => {
            const ctx2 = document.getElementById('appointmentStatusChart');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'doughnut',
                    data: {
                        labels: ['Confirmados', 'Pendentes', 'Cancelados', 'Concluídos'],
                        datasets: [{
                            data: [45, 15, 8, 32],
                            backgroundColor: [
                                '#28a745', '#ffc107', '#dc3545', '#17a2b8'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { position: 'bottom' }
                        }
                    }
                });
            }
        }, 200);
    },

    // Atualizar último update
    updateLastUpdate() {
        const element = document.getElementById('lastUpdate');
        if (element) {
            const now = new Date();
            element.textContent = `Atualizado às ${now.toLocaleTimeString()}`;
        }
    },

    // Funções de ação
    refreshData() {
        console.log('🔄 Atualizando dados do dashboard...');
        this.loadKPIs();
        this.updateLastUpdate();
    },

    changePeriod(period) {
        console.log('📅 Mudando período para:', period, 'dias');
        // Recarregar dados com novo período
        this.loadKPIs();
    }
};

// Exportar para uso global
window.DashboardContent = DashboardContent;