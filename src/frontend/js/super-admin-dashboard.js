/**
 * SUPER ADMIN DASHBOARD - JAVASCRIPT INTEGRADO
 * Conecta o frontend dashboard-standardized.html com as APIs do backend
 * 
 * Funcionalidades:
 * - Carrega e exibe os 8 KPIs estratégicos da plataforma
 * - Alimenta os 4 gráficos principais com dados reais
 * - Carrega insights estratégicos (distorção, upsell, churn)
 * - Conecta com o sistema de cron para atualizações
 */

(function() {
    'use strict';
    
    // Global variables
    let platformData = null;
    let charts = {};
    let updateInterval = null;
    
    // API endpoints
    const API_BASE = '/api/super-admin';
    const ENDPOINTS = {
        kpis: `${API_BASE}/kpis`,
        revenueVsUsageCost: `${API_BASE}/charts/revenue-vs-usage-cost`,
        appointmentStatus: `${API_BASE}/charts/appointment-status`,
        distortion: `${API_BASE}/insights/distortion`,
        upsell: `${API_BASE}/insights/upsell`,
        triggerCalc: `${API_BASE}/trigger-calculation`,
        status: `${API_BASE}/status`
    };
    
    // Initialize dashboard when DOM is ready
    document.addEventListener('DOMContentLoaded', async function() {
        console.log('🚀 Inicializando Super Admin Dashboard...');
        
        try {
            // Setup authentication
            await setupAuthentication();
            
            // Setup event listeners
            setupEventListeners();
            
            // Register widgets with standardized system
            await registerWidgets();
            
            // Load initial data with delay to ensure DOM is ready
            setTimeout(async () => {
                try {
                    await loadDashboardData();
                    
                    // Setup auto-refresh
                    setupAutoRefresh();
                    
                    console.log('✅ Super Admin Dashboard inicializado com sucesso');
                } catch (error) {
                    console.error('❌ Erro no carregamento tardio:', error);
                    if (window.errorHandler) {
                        window.errorHandler.handleApiError(error, 'dashboard-initialization');
                    } else {
                        console.error('❌ Error handler não disponível:', error);
                        showErrorState('Erro ao carregar dados');
                    }
                }
            }, 500);
            
        } catch (error) {
            console.error('❌ Erro na inicialização do dashboard:', error);
            if (window.errorHandler) {
                window.errorHandler.handleApiError(error, 'dashboard-setup');
            } else {
                console.error('❌ Error handler não disponível:', error);
                showErrorState('Erro ao carregar dashboard');
            }
        }
    });
    
    // =====================================================
    // WIDGET REGISTRATION
    // =====================================================
    
    async function registerWidgets() {
        if (!window.ubsWidgetSystem) {
            console.warn('⚠️ Sistema de widgets não disponível');
            return;
        }
        
        try {
            // Register all chart widgets
            window.ubsWidgetSystem.registerWidget('revenueVsUsageCostChart', {
                type: 'chart',
                title: 'Revenue vs UsageCost',
                refreshable: true,
                autoRefresh: true,
                refreshInterval: 10000,
                dataSource: () => loadCharts()
            });
            
            window.ubsWidgetSystem.registerWidget('appointmentStatusChart', {
                type: 'chart',
                title: 'Status dos Agendamentos',
                refreshable: true,
                autoRefresh: true,
                refreshInterval: 10000,
                dataSource: () => loadCharts()
            });
            
            // Register KPI widgets
            const kpiWidgets = [
                'receitaUsoRatio', 'mrrPlatform', 'activeTenants', 'operationalEfficiency',
                'spamRate', 'cancellationRate', 'totalAppointments', 'aiInteractions'
            ];
            
            kpiWidgets.forEach(widgetId => {
                window.ubsWidgetSystem.registerWidget(widgetId, {
                    type: 'kpi',
                    title: getKPITitle(widgetId),
                    refreshable: true,
                    autoRefresh: true,
                    refreshInterval: 10000,
                    dataSource: () => loadKPIs()
                });
            });
            
            console.log('✅ Widgets registrados no sistema padronizado');
        } catch (error) {
            console.error('❌ Erro ao registrar widgets:', error);
        }
    }
    
    function getKPITitle(widgetId) {
        const titles = {
            'receitaUsoRatio': 'Receita/Uso',
            'mrrPlatform': 'MRR Plataforma',
            'activeTenants': 'Tenants Ativos',
            'operationalEfficiency': 'Eficiência Operacional',
            'spamRate': 'Taxa de Spam',
            'cancellationRate': 'Taxa de Cancelamento',
            'totalAppointments': 'Total Agendamentos',
            'aiInteractions': 'Interações IA'
        };
        return titles[widgetId] || widgetId;
    }
    
    // =====================================================
    // AUTHENTICATION & SETUP
    // =====================================================
    
    async function setupAuthentication() {
        const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
        if (!token) {
            console.warn('⚠️ Token não encontrado, usando modo demo');
            return;
        }
        
        // Verify token and user role
        try {
            const response = await fetch('/api/admin/user-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const userInfo = await response.json();
                console.log('👤 Usuário autenticado:', userInfo.data.role);
                updateUserInterface(userInfo.data);
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível verificar usuário, continuando...');
            if (window.errorHandler) {
                window.errorHandler.logError(error, 'authentication', { endpoint: '/api/admin/user-info' });
            }
        }
    }
    
    function updateUserInterface(userInfo) {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (userNameEl) userNameEl.textContent = userInfo.name || 'Super Admin';
        if (userRoleEl) userRoleEl.textContent = userInfo.role === 'super_admin' ? 'Super Administrador' : 'Administrador';
        if (userAvatarEl) userAvatarEl.textContent = (userInfo.name || 'Super Admin').charAt(0).toUpperCase();
    }
    
    // =====================================================
    // DATA LOADING FUNCTIONS
    // =====================================================
    
    async function loadDashboardData(period = 30) {
        try {
            console.log(`📊 Carregando dados do dashboard para período: ${period} dias`);
            
            // Show loading state using widget system
            if (window.ubsWidgetSystem) {
                const widgetIds = [
                    'revenueVsUsageCostChart', 'appointmentStatusChart',
                    'receitaUsoRatio', 'mrrPlatform', 'activeTenants', 'operationalEfficiency',
                    'spamRate', 'cancellationRate', 'totalAppointments', 'aiInteractions'
                ];
                
                widgetIds.forEach(widgetId => {
                    window.ubsWidgetSystem.showLoading(widgetId);
                });
            } else {
                showLoadingState();
            }
            
            // Load all data in parallel
            const [kpisData, chartsData, insightsData] = await Promise.all([
                loadKPIs(period),
                loadCharts(period),
                loadInsights(period)
            ]);
            
            // Update UI with loaded data
            updateKPIsUI(kpisData);
            updateChartsUI(chartsData);
            updateInsightsUI(insightsData);
            
            // Update last refresh time
            updateLastRefreshTime();
            
            // Hide loading state
            hideLoadingState();
            
            console.log('✅ Dashboard carregado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados do dashboard:', error);
            hideLoadingState();
            
            if (window.errorHandler) {
                window.errorHandler.handleApiError(error, 'dashboard-data-loading');
            } else {
                showErrorState('Erro ao carregar dados');
            }
        }
    }
    
    async function loadKPIs(period = 30) {
        try {
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const response = await fetch(`${ENDPOINTS.kpis}?period=${period}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📊 KPIs carregados:', data.data?.kpis ? 'dados reais' : 'sem dados');
            
            return data.data;
            
        } catch (error) {
            console.error('❌ Erro ao carregar KPIs:', error);
            
            if (window.errorHandler) {
                window.errorHandler.handleApiError(error, 'kpis-loading');
            }
            
            // Show error state in widgets
            if (window.ubsWidgetSystem) {
                const kpiWidgets = [
                    'receitaUsoRatio', 'mrrPlatform', 'activeTenants', 'operationalEfficiency',
                    'spamRate', 'cancellationRate', 'totalAppointments', 'aiInteractions'
                ];
                
                kpiWidgets.forEach(widgetId => {
                    window.ubsWidgetSystem.showError(widgetId, {
                        message: 'Erro ao carregar dados',
                        retryCallback: () => loadKPIs()
                    });
                });
            }
            
            // Retornar estrutura vazia em vez de mock data
            return { 
                kpis: {
                    receitaUsoRatio: { value: 0, formatted: 'Sem dados', subtitle: 'R$ por minuto de chat' },
                    mrrPlatform: { value: 0, formatted: 'Sem dados', subtitle: 'Receita Recorrente Mensal' },
                    activeTenants: { value: 0, formatted: 'Sem dados', subtitle: 'Clientes pagantes' },
                    operationalEfficiency: { value: 0, formatted: 'Sem dados', subtitle: 'Agendamentos / Conversas' },
                    spamRate: { value: 0, formatted: 'Sem dados', subtitle: '% conversas sem cadastro' },
                    cancellationRate: { value: 0, formatted: 'Sem dados', subtitle: '(Cancel + Remarc) / Total chats' },
                    totalAppointments: { value: 0, formatted: 'Sem dados', subtitle: 'Últimos 7 dias' },
                    aiInteractions: { value: 0, formatted: 'Sem dados', subtitle: 'Respostas automáticas' }
                },
                metadata: { has_data: false } 
            };
        }
    }
    
    async function loadCharts(period = 30) {
        try {
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const [revenueVsUsageCost, appointmentStatus] = await Promise.all([
                fetch(`${ENDPOINTS.revenueVsUsageCost}?period=${period}`, { headers }),
                fetch(`${ENDPOINTS.appointmentStatus}?period=${period}`, { headers })
            ]);
            
            const revenueData = revenueVsUsageCost.ok ? await revenueVsUsageCost.json() : null;
            const statusData = appointmentStatus.ok ? await appointmentStatus.json() : null;
            
            console.log('📈 Gráficos carregados:', {
                revenueVsUsageCost: revenueData?.success ? 'sucesso' : 'erro',
                appointmentStatus: statusData?.success ? 'sucesso' : 'erro'
            });
            
            return {
                revenueVsUsageCost: revenueData?.data || { datasets: [{ label: 'Tenants', data: [] }] },
                appointmentStatus: statusData?.data || { 
                    labels: ['Sem dados'], 
                    datasets: [{ data: [1], backgroundColor: ['#cccccc'] }] 
                }
            };
            
        } catch (error) {
            console.error('❌ Erro ao carregar gráficos:', error);
            return {
                revenueVsUsageCost: { datasets: [{ label: 'Tenants', data: [] }] },
                appointmentStatus: { 
                    labels: ['Sem dados'], 
                    datasets: [{ data: [1], backgroundColor: ['#cccccc'] }] 
                }
            };
        }
    }
    
    async function loadInsights(period = 30) {
        try {
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const [distortion, upsell] = await Promise.all([
                fetch(`${ENDPOINTS.distortion}?period=${period}&limit=3`, { headers }),
                fetch(`${ENDPOINTS.upsell}?period=${period}&limit=3`, { headers })
            ]);
            
            const distortionData = distortion.ok ? await distortion.json() : null;
            const upsellData = upsell.ok ? await upsell.json() : null;
            
            console.log('💡 Insights carregados:', {
                distortion: distortionData?.success ? 'sucesso' : 'erro',
                upsell: upsellData?.success ? 'sucesso' : 'erro'
            });
            
            return {
                distortion: distortionData?.data?.distortion_tenants || [],
                upsell: upsellData?.data?.upsell_opportunities || []
            };
            
        } catch (error) {
            console.error('❌ Erro ao carregar insights:', error);
            return {
                distortion: [],
                upsell: []
            };
        }
    }
    
    // =====================================================
    // UI UPDATE FUNCTIONS
    // =====================================================
    
    function updateKPIsUI(data) {
        // Usar apenas dados reais - sem fallback para mock data
        const kpis = data?.kpis;
        
        console.log('🎯 Atualizando KPIs na UI...');
        
        if (!kpis) {
            console.warn('⚠️ Dados de KPIs não disponíveis - exibindo estado sem dados');
            // Mostrar indicadores de "sem dados" em vez de valores mock
            showNoDataState();
            return;
        }
        
        // KPI 1: Receita/Uso Ratio
        updateKPI('receitaUsoRatio', kpis.receitaUsoRatio);
        updateKPITrend('receitaUsoTrend', kpis.receitaUsoRatio, {
            calculation: `R$ ${kpis.totalRevenueBrl || 0} ÷ ${kpis.totalChatMinutes || 0} min`,
            previousValue: kpis.receitaUsoRatioPrevious || null
        });
        
        // KPI 2: MRR da Plataforma
        updateKPI('mrrPlatform', kpis.mrrPlatform);
        const activeTenantsNum = Number(kpis.activeTenants?.value || kpis.activeTenants || 0);
        const mrrValue = Number(kpis.mrrPlatform?.value || 0);
        const avgRevenue = activeTenantsNum > 0 ? (mrrValue / activeTenantsNum) : 0;
        updateKPITrend('mrrTrend', kpis.mrrPlatform, {
            calculation: `${activeTenantsNum} tenants × R$ ${avgRevenue.toFixed(0)} médio`,
            previousValue: kpis.mrrPlatformPrevious || null
        });
        
        // KPI 3: Tenants Ativos
        updateKPI('activeTenants', kpis.activeTenants);
        updateKPITrend('tenantsTrend', kpis.activeTenants, {
            calculation: `Crescimento vs período anterior`,
            previousValue: kpis.activeTenantsLPrevious || null
        });
        
        // KPI 4: Eficiência Operacional
        updateKPI('operationalEfficiency', kpis.operationalEfficiency);
        updateKPITrend('efficiencyTrend', kpis.operationalEfficiency, {
            calculation: `${kpis.totalAppointments?.value || 0} appts ÷ ${kpis.totalConversations || 0} conv`,
            previousValue: kpis.operationalEfficiencyPrevious || null
        });
        
        // KPI 5: Spam Rate
        updateKPI('spamRate', kpis.spamRate);
        updateKPITrend('spamTrend', kpis.spamRate, {
            calculation: `${kpis.spamMessages || 0} spam ÷ ${kpis.totalMessages || 0} total`,
            previousValue: kpis.spamRatePrevious || null
        });
        
        // KPI 6: Taxa de Cancelamentos
        updateKPI('cancellationRate', kpis.cancellationRate);
        updateKPITrend('cancellationTrend', kpis.cancellationRate, {
            calculation: `(${kpis.cancelledAppointments || 0} cancel + ${kpis.rescheduledAppointments || 0} remarc) ÷ ${kpis.totalAppointments?.value || 0}`,
            previousValue: kpis.cancellationRatePrevious || null
        });
        
        // KPI 7: Total de Agendamentos
        updateKPI('totalAppointments', kpis.totalAppointments);
        updateKPITrend('appointmentsTrend', kpis.totalAppointments, {
            calculation: `Crescimento vs período anterior`,
            previousValue: kpis.totalAppointmentsPrevious || null
        });
        
        // KPI 8: Interações com IA
        updateKPI('aiInteractions', kpis.aiInteractions);
        updateKPITrend('aiInteractionsTrend', kpis.aiInteractions, {
            calculation: `Automação vs período anterior`,
            previousValue: kpis.aiInteractionsPrevious || null
        });
        
        console.log('✅ KPIs atualizados na UI');
    }
    
    function updateKPI(elementId, kpiData, type = 'value') {
        const element = document.getElementById(elementId);
        if (!element || !kpiData) {
            if (element) element.textContent = 'Sem dados';
            return;
        }
        
        if (type === 'trend') {
            const trend = kpiData.trend || { direction: 'stable', text: 'Estável' };
            const iconClass = getTrendIcon(trend.direction);
            const trendClass = getTrendClass(trend.direction);
            
            element.className = `metric-trend ${trendClass}`;
            element.innerHTML = `
                <i class="${iconClass}"></i>
                <small>${trend.text}</small>
            `;
        } else {
            element.textContent = kpiData.formatted || kpiData.value || '--';
        }
    }
    
    function updateKPITrend(elementId, kpiData, options = {}) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const { calculation, previousValue } = options;
        
        // Se não há dados atuais
        if (!kpiData || kpiData.value === null || kpiData.value === undefined) {
            element.className = 'metric-trend trend-neutral';
            element.innerHTML = `
                <i class="fas fa-question-circle"></i>
                <small>Sem dados disponíveis</small>
            `;
            return;
        }
        
        let trendInfo = '';
        let trendClass = 'trend-neutral';
        let trendIcon = 'fas fa-minus';
        
        // Calcular comparação com valor anterior se disponível
        if (previousValue && previousValue.value !== null && previousValue.value !== undefined && previousValue.value > 0) {
            const currentVal = parseFloat(kpiData.value) || 0;
            const prevVal = parseFloat(previousValue.value) || 0;
            const percentChange = ((currentVal - prevVal) / prevVal * 100);
            
            if (percentChange > 5) {
                trendClass = 'trend-positive';
                trendIcon = 'fas fa-arrow-up';
                trendInfo = `+${percentChange.toFixed(1)}% vs anterior`;
            } else if (percentChange < -5) {
                trendClass = 'trend-negative'; 
                trendIcon = 'fas fa-arrow-down';
                trendInfo = `${percentChange.toFixed(1)}% vs anterior`;
            } else {
                trendClass = 'trend-neutral';
                trendIcon = 'fas fa-minus';
                trendInfo = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}% vs anterior`;
            }
        } else if (calculation) {
            // Mostrar cálculo se não há valor anterior
            trendInfo = calculation;
        } else {
            trendInfo = 'Primeiro período';
        }
        
        element.className = `metric-trend ${trendClass}`;
        element.innerHTML = `
            <i class="${trendIcon}"></i>
            <small title="${calculation || 'Cálculo não disponível'}">${trendInfo}</small>
        `;
    }
    
    function getTrendIcon(direction) {
        const icons = {
            'up': 'fas fa-arrow-up',
            'down': 'fas fa-arrow-down',
            'stable': 'fas fa-minus'
        };
        return icons[direction] || icons.stable;
    }
    
    function getTrendClass(direction) {
        const classes = {
            'up': 'trend-positive',
            'down': 'trend-negative',
            'stable': 'trend-neutral'
        };
        return classes[direction] || classes.stable;
    }
    
    function updateChartsUI(chartsData) {
        console.log('📈 Atualizando gráficos...');
        
        // Destroy existing charts more safely using Chart.js registry
        const chartIds = ['revenueVsUsageCostChart', 'appointmentStatusChart', 'appointmentTrendsChart', 'platformRevenueChart'];
        
        chartIds.forEach(chartId => {
            // Find chart instance in Chart.js registry
            const existingChart = Chart.getChart(chartId);
            if (existingChart) {
                try {
                    existingChart.destroy();
                    console.log(`✅ Chart ${chartId} destruído com sucesso`);
                } catch (error) {
                    console.warn(`⚠️ Erro ao destruir ${chartId}:`, error);
                }
            }
        });
        
        // Clear our local charts object
        charts = {};
        
        // Small delay to ensure canvas cleanup
        setTimeout(() => {
            try {
                // Update revenue vs usage cost chart (primeiro gráfico)
                updateRevenueVsUsageCostChart(chartsData.revenueVsUsageCost);
                
                // Update appointment status chart
                updateAppointmentStatusChart(chartsData.appointmentStatus);
                
                // Update other charts
                updateAppointmentTrendsChart();
                updatePlatformRevenueChart();
            } catch (error) {
                console.error('❌ Erro ao atualizar gráficos:', error);
            }
        }, 300);
        
        console.log('✅ Gráficos atualizados');
    }
    
    function updateRevenueVsUsageCostChart(data) {
        try {
            const ctx = document.getElementById('revenueVsUsageCostChart');
            if (!ctx) {
                console.warn('Canvas revenueVsUsageCostChart não encontrado');
                return;
            }
            
            // Use widget system for loading/error states
            if (window.ubsWidgetSystem) {
                if (!data || !data.datasets || data.datasets[0].data.length === 0) {
                    window.ubsWidgetSystem.showEmpty('revenueVsUsageCostChart', 'Nenhum dado disponível para o gráfico');
                    return;
                }
                window.ubsWidgetSystem.showSuccess('revenueVsUsageCostChart');
            }
            
            const chartData = data.datasets || [{
                label: 'Tenants',
                data: [],
                backgroundColor: '#2D5A9B',
                borderColor: '#2D5A9B',
                borderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }];
            
            charts.revenueVsUsageCost = new Chart(ctx, {
                type: 'scatter',
                data: { datasets: chartData },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#2D5A9B',
                            borderWidth: 1,
                            callbacks: {
                                title: function(context) {
                                    return context[0]?.raw?.tenant || 'Tenant';
                                },
                                label: function(context) {
                                    const x = context.parsed.x || 0;
                                    const y = context.parsed.y || 0;
                                    const margin = context.raw?.margin || 0;
                                    const marginPct = context.raw?.marginPct || 0;
                                    const profitable = context.raw?.isProfitable ? 'SIM' : 'NÃO';
                                    return [
                                        `Receita: $${y.toFixed(2)}`,
                                        `UsageCost: $${x.toFixed(2)}`,
                                        `Margem: $${margin.toFixed(2)} (${marginPct.toFixed(1)}%)`,
                                        `Lucrativo: ${profitable}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { 
                                display: true, 
                                text: 'UsageCost (USD)',
                                color: '#666',
                                font: { size: 12 }
                            },
                            beginAtZero: true,
                            grid: {
                                color: '#f0f0f0'
                            },
                            ticks: {
                                color: '#666',
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        },
                        y: {
                            title: { 
                                display: true, 
                                text: 'Revenue (USD)',
                                color: '#666',
                                font: { size: 12 }
                            },
                            beginAtZero: true,
                            grid: {
                                color: '#f0f0f0'
                            },
                            ticks: {
                                color: '#666',
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
            
            console.log('✅ Gráfico Revenue vs UsageCost criado');
        } catch (error) {
            console.error('❌ Erro ao criar gráfico Revenue vs UsageCost:', error);
            if (window.ubsWidgetSystem) {
                window.ubsWidgetSystem.showError('revenueVsUsageCostChart', {
                    message: 'Erro ao carregar gráfico',
                    retryCallback: () => updateRevenueVsUsageCostChart(data)
                });
            }
        }
    }
    
    function updateAppointmentStatusChart(data) {
        try {
            const canvas = document.getElementById('appointmentStatusChart');
            if (!canvas) {
                console.warn('Canvas appointmentStatusChart não encontrado');
                return;
            }
            
            // Use the documented DoughnutChartWidget system with improved fallback
            if (typeof DoughnutChartWidget !== 'undefined') {
                try {
                    // Create doughnut chart using the standardized widget
                    const doughnutWidget = new DoughnutChartWidget('appointmentStatusChart', {
                        centerText: {
                            enabled: true,
                            mainText: '',
                            subText: 'Total',
                            mainColor: '#2D5A9B',
                            subColor: '#6C757D'
                        },
                        colors: [
                            '#28a745', // Completed - Green
                            '#ffc107', // Pending - Yellow  
                            '#dc3545', // Cancelled - Red
                            '#17a2b8', // Rescheduled - Blue
                            '#6c757d'  // Others - Gray
                        ]
                    });
                    
                    // Prepare data for the widget
                    const chartData = {
                        labels: data.labels || ['Sem dados'],
                        data: data.datasets?.[0]?.data || [1]
                    };
                    
                    // Calculate total for center text
                    const total = chartData.data.reduce((sum, value) => sum + value, 0);
                    
                    // Render using standardized widget
                    doughnutWidget.render(chartData, total);
                    
                    // Store reference
                    charts.appointmentStatus = doughnutWidget;
                    
                    console.log('✅ Gráfico Status Agendamentos criado usando DoughnutChartWidget');
                } catch (error) {
                    console.error('❌ Erro ao usar DoughnutChartWidget:', error);
                    // Fallback to Chart.js
                    createFallbackChart();
                }
            } else {
                // Fallback to regular Chart.js if widget not available
                console.warn('⚠️ DoughnutChartWidget não disponível, usando Chart.js padrão');
                createFallbackChart();
            }
            
            function createFallbackChart() {
                // Se não há dados, não criar chart vazio
                if (!data || !data.labels || data.labels.length === 0) {
                    canvas.parentElement.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-chart-pie mb-2"></i><br>Dados indisponíveis</div>';
                    return;
                }
                
                const chartData = {
                    labels: data.labels,
                    datasets: data.datasets
                };
                
                charts.appointmentStatus = new Chart(canvas, {
                    type: 'doughnut',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom' }
                        },
                        cutout: '60%'
                    }
                });
                
                console.log('✅ Gráfico Status Agendamentos criado com Chart.js');
            }
            
        } catch (error) {
            console.error('❌ Erro ao criar gráfico Status Agendamentos:', error);
        }
    }
    
    function updateAppointmentTrendsChart() {
        try {
            const ctx = document.getElementById('appointmentTrendsChart');
            if (!ctx) {
                console.warn('Canvas appointmentTrendsChart não encontrado');
                return;
            }
            
            // Mostrar mensagem de funcionalidade não implementada
            ctx.parentElement.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-chart-line mb-2 fa-2x"></i>
                    <br>
                    <strong>Funcionalidade em desenvolvimento</strong>
                    <br>
                    <small>Gráfico de tendências de agendamentos será implementado</small>
                </div>
            `;
            
            console.log('✅ Gráfico Tendência Agendamentos criado');
        } catch (error) {
            console.error('❌ Erro ao criar gráfico Tendência Agendamentos:', error);
        }
    }
    
    function updatePlatformRevenueChart() {
        try {
            const ctx = document.getElementById('platformRevenueChart');
            if (!ctx) {
                console.warn('Canvas platformRevenueChart não encontrado');
                return;
            }
            
            // Mostrar mensagem de funcionalidade não implementada
            ctx.parentElement.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-chart-line mb-2 fa-2x"></i>
                    <br>
                    <strong>Funcionalidade em desenvolvimento</strong>
                    <br>
                    <small>Histórico de MRR da plataforma será implementado</small>
                </div>
            `;
            
            console.log('✅ Gráfico Receita da Plataforma criado');
        } catch (error) {
            console.error('❌ Erro ao criar gráfico Receita da Plataforma:', error);
        }
    }
    
    function updateInsightsUI(insightsData) {
        console.log('💡 Atualizando insights...');
        
        // Atualizar lista de distorções
        const distortionList = document.getElementById('distortionInsights');
        if (distortionList && insightsData.distortion) {
            distortionList.innerHTML = '';
            
            if (insightsData.distortion.length === 0) {
                distortionList.innerHTML = `
                    <div class="list-group-item text-center">
                        <small class="text-muted">Nenhuma distorção encontrada</small>
                    </div>
                `;
            } else {
                insightsData.distortion.forEach(tenant => {
                    const badgeClass = tenant.ratio > 2 ? 'bg-warning' : tenant.ratio > 1.5 ? 'bg-info' : 'bg-secondary';
                    distortionList.innerHTML += `
                        <div class="list-group-item d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${tenant.tenant_name}</h6>
                                <small class="text-muted">${tenant.description}</small>
                            </div>
                            <span class="badge ${badgeClass}">${tenant.ratio.toFixed(1)}x</span>
                        </div>
                    `;
                });
            }
        }
        
        // Atualizar lista de oportunidades de upsell
        const upsellList = document.getElementById('upsellInsights');
        if (upsellList && insightsData.upsell) {
            upsellList.innerHTML = '';
            
            if (insightsData.upsell.length === 0) {
                upsellList.innerHTML = `
                    <div class="list-group-item text-center">
                        <small class="text-muted">Nenhuma oportunidade encontrada</small>
                    </div>
                `;
            } else {
                insightsData.upsell.forEach(tenant => {
                    const inverseRatio = 1 / (tenant.ratio || 1);
                    upsellList.innerHTML += `
                        <div class="list-group-item d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${tenant.tenant_name}</h6>
                                <small class="text-muted">${tenant.description}</small>
                            </div>
                            <span class="badge bg-success">${inverseRatio.toFixed(1)}x</span>
                        </div>
                    `;
                });
            }
        }
        
        console.log('✅ Insights atualizados');
    }
    
    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    
    function setupEventListeners() {
        // Refresh data button
        const refreshBtn = document.querySelector('button[onclick="refreshData()"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', handleRefreshData);
        }
        
        // Export data button
        const exportBtn = document.querySelector('button[onclick="exportData()"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExportData);
        }
        
        // Manual calculation trigger (if exists)
        const triggerBtn = document.getElementById('triggerCalculation');
        if (triggerBtn) {
            triggerBtn.addEventListener('click', handleTriggerCalculation);
        }
    }
    
    async function handleRefreshData() {
        console.log('🔄 Refresh manual solicitado...');
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Atualizando...';
            btn.disabled = true;
            
            await loadDashboardData();
            
            btn.innerHTML = '<i class="fas fa-check me-2"></i>Atualizado!';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('❌ Erro no refresh:', error);
            btn.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>Erro';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 3000);
        }
    }
    
    function handleExportData() {
        console.log('📥 Exportação solicitada...');
        alert('Funcionalidade de exportação em desenvolvimento');
    }
    
    async function handleTriggerCalculation() {
        console.log('🔧 Trigger de cálculo solicitado...');
        
        try {
            const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
            const response = await fetch(ENDPOINTS.triggerCalc, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ period_days: 7 })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Cálculo executado:', result);
                
                // Reload data after calculation
                setTimeout(() => loadDashboardData(), 2000);
            } else {
                throw new Error('Erro na execução do cálculo');
            }
            
        } catch (error) {
            console.error('❌ Erro no trigger de cálculo:', error);
        }
    }
    
    // =====================================================
    // AUTO-REFRESH SETUP
    // =====================================================
    
    function setupAutoRefresh() {
        // Refresh every 5 minutes
        updateInterval = setInterval(() => {
            console.log('🔄 Auto-refresh executado');
            loadDashboardData();
        }, 5 * 60 * 1000);
        
        console.log('⏰ Auto-refresh configurado (5 min)');
    }
    
    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================
    
    function updateLastRefreshTime() {
        const element = document.getElementById('lastUpdate');
        if (element) {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = String(now.getFullYear()).slice(-2); // últimos 2 dígitos
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            
            const compactDate = `${day}/${month}/${year} ${hours}:${minutes}`;
            element.textContent = `Atualizado: ${compactDate}`;
        }
    }
    
    function showLoadingState() {
        // Add loading indicators to KPI cards
        document.querySelectorAll('.metric-value').forEach(el => {
            if (el.textContent === '--') {
                el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
        });
    }
    
    function hideLoadingState() {
        // Remove loading indicators (will be replaced by actual values)
    }
    
    function showErrorState(message) {
        const contentContainer = document.getElementById('contentContainer');
        if (contentContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-warning';
            errorDiv.innerHTML = `
                <h6>⚠️ ${message}</h6>
                <p>Dados indisponíveis. Verifique a conexão com o backend ou execute o cálculo de métricas.</p>
            `;
            contentContainer.prepend(errorDiv);
        }
    }
    
    function showNoDataState() {
        // Mostrar "Sem dados" nos cards KPI
        document.querySelectorAll('.metric-value').forEach(el => {
            el.textContent = 'Sem dados';
            el.className = el.className + ' text-muted';
        });
        
        // Mostrar "Sem dados" nos indicadores de trend
        document.querySelectorAll('.metric-change').forEach(el => {
            el.innerHTML = '<small class="text-muted">Falta de dados</small>';
        });
        
        console.log('💭 Estado "sem dados" aplicado aos KPIs');
    }
    
    // =====================================================
    // REMOVED: ALL MOCK DATA FUNCTIONS
    // =====================================================
    // All mock data has been removed to ensure only real data is displayed
    
    // Global period change handler
    window.changePeriod = function(newPeriod) {
        console.log(`🔄 Alterando período global para: ${newPeriod} dias`);
        
        const periodValue = parseInt(newPeriod);
        if (isNaN(periodValue) || periodValue < 1) {
            console.error('❌ Período inválido:', newPeriod);
            return;
        }
        
        // Reload all dashboard data with new period
        loadDashboardData(periodValue);
    };
    
    // Make functions globally available for inline onclick handlers
    window.refreshData = handleRefreshData;
    window.exportData = handleExportData;
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
    });
    
})();