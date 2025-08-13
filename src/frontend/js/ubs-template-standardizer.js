/**
 * UBS Template Standardizer
 * Sistema de padronização para todos os componentes do dashboard
 * 
 * @version 1.0.0
 * @author UBS Team
 */

class UBSDashboardTemplate {
    constructor() {
        this.defaultConfig = {
            colors: {
                primary: '#2D5A9B',
                secondary: '#F8F9FA', 
                success: '#28A745',
                warning: '#FFC107',
                danger: '#DC3545',
                info: '#17A2B8'
            },
            animations: {
                duration: 300,
                easing: 'ease-in-out'
            },
            responsive: {
                breakpoints: {
                    xs: 576,
                    sm: 768,
                    md: 992,
                    lg: 1200,
                    xl: 1400
                }
            }
        };
        
        this.widgetInstances = new Map();
        
        // Mapeamento de domínios para português
        this.DOMAIN_TRANSLATIONS = {
            'beauty': 'Beleza',
            'healthcare': 'Saúde',
            'legal': 'Jurídico',
            'education': 'Educação',
            'sports': 'Esportes',
            'consulting': 'Consultoria'
        };
        
        // Sistema de cores por nível de risco
        this.RISK_COLORS = {
            'Em Risco': 'danger',
            'Alto Risco': 'danger',
            'Risco Médio': 'warning',
            'Baixo Risco': 'success',
            'Saudável': 'success'
        };
        
        // Função para obter cor baseada no score de risco
        this.getRiskColor = (riskScore) => {
            if (riskScore >= 80) return 'danger';
            if (riskScore >= 60) return 'warning';
            return 'success';
        };
        
        // Função para obter status baseado no score de risco
        this.getRiskStatus = (riskScore) => {
            if (riskScore >= 80) return 'Alto Risco';
            if (riskScore >= 60) return 'Risco Médio';
            return 'Baixo Risco';
        };
        
        // Função para traduzir domínios
        this.translateDomains = (data) => {
            if (!data || !data.labels) return data;
            
            return {
                ...data,
                labels: data.labels.map(label => this.DOMAIN_TRANSLATIONS[label] || label)
            };
        };
    }

    /**
     * Criar estrutura padrão de página
     */
    createStandardPage(container, config = {}) {
        const pageConfig = {
            title: 'Dashboard',
            subtitle: '',
            showBreadcrumb: true,
            showFilters: true,
            showMetrics: true,
            sections: [],
            ...config
        };

        const pageHTML = `
            <div class="ubs-standard-page" data-page="${pageConfig.type || 'dashboard'}">
                ${this.createPageHeader(pageConfig)}
                ${pageConfig.showFilters ? this.createFiltersContainer() : ''}
                ${pageConfig.showMetrics ? this.createMetricsContainer() : ''}
                <div class="ubs-page-content">
                    ${pageConfig.sections.map(section => this.createSectionContainer(section)).join('')}
                </div>
            </div>
        `;

        container.innerHTML = pageHTML;
        return this.initializeStandardPage(container, pageConfig);
    }

    /**
     * Criar cabeçalho padrão da página
     */
    createPageHeader(config) {
        return `
            <div class="ubs-page-header">
                <div class="container-fluid">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            ${config.showBreadcrumb ? this.createBreadcrumb(config.breadcrumb) : ''}
                            <h1 class="ubs-page-title">
                                ${config.icon ? `<i class="${config.icon} me-2"></i>` : ''}
                                ${config.title}
                            </h1>
                            ${config.subtitle ? `<p class="ubs-page-subtitle text-muted mb-0">${config.subtitle}</p>` : ''}
                        </div>
                        <div class="ubs-page-actions">
                            ${config.actions ? config.actions.map(action => this.createActionButton(action)).join('') : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Criar breadcrumb padrão
     */
    createBreadcrumb(items = []) {
        if (!items.length) return '';
        
        return `
            <nav aria-label="breadcrumb" class="ubs-breadcrumb mb-2">
                <ol class="breadcrumb">
                    ${items.map((item, index) => `
                        <li class="breadcrumb-item ${index === items.length - 1 ? 'active' : ''}">
                            ${index === items.length - 1 ? 
                                item.label : 
                                `<a href="${item.href || '#'}">${item.label}</a>`
                            }
                        </li>
                    `).join('')}
                </ol>
            </nav>
        `;
    }

    /**
     * Criar botão de ação padrão
     */
    createActionButton(action) {
        return `
            <button class="btn ${action.class || 'btn-primary'} me-2" onclick="${action.handler || ''}">
                ${action.icon ? `<i class="${action.icon} me-1"></i>` : ''}
                ${action.label}
            </button>
        `;
    }

    /**
     * Criar container de filtros padrão
     */
    createFiltersContainer() {
        return `
            <div class="ubs-filters-section">
                <div class="container-fluid">
                    <!-- Metrics Update Warning -->
                    <div class="alert alert-info alert-dismissible fade show" role="alert">
                        <i class="fas fa-info-circle me-2"></i>
                        <strong>Atualização de Métricas:</strong> As métricas são atualizadas uma vez por dia às 04:00. 
                        Os dados exibidos refletem o processamento mais recente.
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                    
                    <div class="card">
                        <div class="card-body">
                            <div id="standard-filters-container" class="row g-3 align-items-center">
                                <!-- Period Selector -->
                                <div class="col-auto">
                                    <label for="periodFilter" class="form-label mb-0">Período:</label>
                                </div>
                                <div class="col-auto">
                                    <select id="periodFilter" class="form-select" onchange="UBSTemplate.PageInitializer.handlePeriodChange(this.value)">
                                        <option value="7d">Últimos 7 dias</option>
                                        <option value="30d" selected>Últimos 30 dias</option>
                                        <option value="90d">Últimos 90 dias</option>
                                        <option value="1y">Último ano</option>
                                    </select>
                                </div>
                                
                                <!-- Tenant Selector (for super admin) -->
                                <div id="tenantFilterGroup" class="col-auto" style="display: none;">
                                    <label for="tenantFilter" class="form-label mb-0">Tenant:</label>
                                </div>
                                <div id="tenantSelectGroup" class="col-auto" style="display: none;">
                                    <select id="tenantFilter" class="form-select" onchange="UBSTemplate.PageInitializer.handleTenantChange(this.value)">
                                        <option value="all">Todos os Tenants</option>
                                    </select>
                                </div>
                                
                                <!-- Refresh Button -->
                                <div class="col-auto ms-auto">
                                    <button id="refreshDashboard" class="btn btn-outline-primary" onclick="UBSTemplate.PageInitializer.refreshDashboard()">
                                        <i class="fas fa-sync-alt me-1"></i>Atualizar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Criar container de métricas padrão
     */
    createMetricsContainer() {
        return `
            <div class="ubs-metrics-section">
                <div class="container-fluid">
                    <div id="standard-metrics-container" class="row g-3">
                        <!-- Métricas serão adicionadas dinamicamente -->
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Criar container de seção padrão
     */
    createSectionContainer(sectionConfig) {
        return `
            <div class="ubs-content-section mb-4">
                <div class="container-fluid">
                    <div id="section-${sectionConfig.id}" class="section-wrapper">
                        <!-- Conteúdo da seção será adicionado dinamicamente -->
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Criar seção de métricas padronizada
     */
    createMetricsSection(container, metricsConfig = []) {
        if (!metricsConfig.length) return null;

        const metricsRow = new UBSWidgets.DashboardRow(container, {
            columns: metricsConfig.map(() => ({ class: 'col-lg col-md-4 col-sm-6' }))
        });
        
        metricsRow.render();

        const metricWidgets = metricsConfig.map((metric, index) => {
            const metricCard = new UBSWidgets.MetricCard(metricsRow.getColumnContainer(index), metric);
            metricCard.render();
            
            this.widgetInstances.set(`metric-${metric.id || index}`, metricCard);
            return metricCard;
        });

        return { metricsRow, metricWidgets };
    }

    /**
     * Criar seção de filtros padronizada
     */
    createFiltersSection(container, filtersConfig = []) {
        if (!filtersConfig.length) return null;

        const filterWidget = new UBSWidgets.Filter(container, {
            filters: filtersConfig,
            layout: 'horizontal',
            onChange: (values, target) => {
                // Disparar evento global de mudança de filtros
                document.dispatchEvent(new CustomEvent('ubsFiltersChanged', {
                    detail: { values, target, timestamp: new Date() }
                }));
            }
        });

        filterWidget.render();
        this.widgetInstances.set('page-filters', filterWidget);
        
        return filterWidget;
    }

    /**
     * Criar seção de gráficos padronizada
     */
    createChartsSection(container, chartsConfig = []) {
        console.log('🎨 DEBUG: createChartsSection called with:', chartsConfig);
        console.log('🎨 DEBUG: UBSWidgets available:', !!window.UBSWidgets);
        
        if (!chartsConfig || !chartsConfig.charts || !chartsConfig.charts.length) {
            console.log('⚠️ No charts config provided');
            return null;
        }
        
        if (!window.UBSWidgets) {
            console.error('❌ UBSWidgets não está disponível!');
            container.innerHTML = '<div class="alert alert-warning">Sistema de gráficos não carregado</div>';
            return null;
        }

        const section = new UBSWidgets.Section(container, {
            title: chartsConfig.title || 'Gráficos e Análises',
            subtitle: chartsConfig.subtitle || '',
            actions: chartsConfig.actions || []
        });

        section.render();
        const sectionBody = section.getBodyContainer();

        // Criar row para os gráficos
        const chartsRow = new UBSWidgets.DashboardRow(sectionBody, {
            columns: chartsConfig.charts.map(chart => ({ class: chart.columnClass || 'col-lg-6' }))
        });

        chartsRow.render();

        const chartWidgets = chartsConfig.charts.map((chartConfig, index) => {
            let chartWidget;
            
            switch (chartConfig.type) {
                case 'line':
                    chartWidget = new UBSWidgets.LineChart(chartsRow.getColumnContainer(index), chartConfig);
                    break;
                case 'bar':
                    chartWidget = new UBSWidgets.BarChart(chartsRow.getColumnContainer(index), chartConfig);
                    break;
                case 'doughnut':
                    chartWidget = new UBSWidgets.DoughnutChart(chartsRow.getColumnContainer(index), chartConfig);
                    break;
                default:
                    chartWidget = new UBSWidgets.Chart(chartsRow.getColumnContainer(index), chartConfig);
            }

            chartWidget.render();
            
            if (chartConfig.data) {
                chartWidget.createChart(chartConfig.data);
            }

            this.widgetInstances.set(`chart-${chartConfig.id || index}`, chartWidget);
            return chartWidget;
        });

        return { section, chartsRow, chartWidgets };
    }

    /**
     * Criar seção de gráfico individual (compatibility method)
     */
    createChartSection(container, chartConfig = {}) {
        console.log('🎨 DEBUG: createChartSection called with:', chartConfig);
        
        if (!chartConfig.type || !chartConfig.data) {
            console.warn('⚠️ Invalid chart config provided');
            return null;
        }
        
        if (!window.UBSWidgets) {
            console.error('❌ UBSWidgets não está disponível!');
            container.innerHTML = '<div class="alert alert-warning">Sistema de gráficos não carregado</div>';
            return null;
        }

        // Create a wrapper div for this individual chart
        const chartDiv = document.createElement('div');
        chartDiv.className = 'col-lg-6 mb-4';
        chartDiv.innerHTML = `<div id="chart-${chartConfig.id || 'temp'}" class="h-100"></div>`;
        container.appendChild(chartDiv);
        
        const chartContainer = chartDiv.querySelector(`#chart-${chartConfig.id || 'temp'}`);
        
        // Create the chart widget based on type
        let chartWidget;
        switch (chartConfig.type) {
            case 'line':
                chartWidget = new UBSWidgets.LineChart(chartContainer, {
                    title: chartConfig.title,
                    height: chartConfig.height || 300
                });
                break;
            case 'bar':
                chartWidget = new UBSWidgets.BarChart(chartContainer, {
                    title: chartConfig.title,
                    height: chartConfig.height || 300
                });
                break;
            case 'doughnut':
            case 'pie':
                chartWidget = new UBSWidgets.DoughnutChart(chartContainer, {
                    title: chartConfig.title,
                    height: chartConfig.height || 300,
                    centerText: chartConfig.centerText || {}
                });
                break;
            default:
                chartWidget = new UBSWidgets.Chart(chartContainer, {
                    type: chartConfig.type,
                    title: chartConfig.title,
                    height: chartConfig.height || 300
                });
        }
        
        chartWidget.render();
        
        // Create the chart with data
        if (chartConfig.data) {
            try {
                // Check if Chart.js is available
                if (typeof Chart === 'undefined') {
                    throw new Error('Chart.js não está carregado. Verifique a conexão com a internet.');
                }
                
                chartWidget.createChart(chartConfig.data, chartConfig.options || {});
                console.log('✅ Chart created successfully:', chartConfig.id);
            } catch (error) {
                console.error('❌ Error creating chart:', error);
                chartContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>Erro ao criar gráfico</strong>
                        <p class="mb-0 mt-2">${error.message}</p>
                        <div class="mt-2">
                            <button class="btn btn-outline-danger btn-sm" onclick="debugChartsAndTables()">
                                <i class="fas fa-bug me-1"></i>Debug
                            </button>
                            <div class="text-muted small">
                                <i class="fas fa-clock me-1"></i>Dados atualizados diariamente às 04:00
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Store widget instance
        this.widgetInstances.set(`chart-${chartConfig.id || 'temp'}`, chartWidget);
        
        return chartWidget;
    }

    /**
     * Criar seção de tabela padronizada
     */
    createTableSection(container, tableConfig = {}) {
        const section = new UBSWidgets.Section(container, {
            title: tableConfig.title || 'Dados',
            subtitle: tableConfig.subtitle || '',
            actions: tableConfig.actions || []
        });

        section.render();
        const sectionBody = section.getBodyContainer();

        const tableWidget = new UBSWidgets.Table(sectionBody, {
            columns: tableConfig.columns || [],
            data: tableConfig.data || [],
            pagination: tableConfig.pagination !== false,
            search: tableConfig.search !== false,
            sort: tableConfig.sort !== false,
            actions: tableConfig.rowActions || [],
            striped: tableConfig.striped !== false,
            hover: tableConfig.hover !== false,
            ...tableConfig.options
        });

        tableWidget.render();
        this.widgetInstances.set(`table-${tableConfig.id || 'main'}`, tableWidget);

        return { section, tableWidget };
    }

    /**
     * Inicializar página padronizada
     */
    initializeStandardPage(container, config) {
        // Aplicar estilos padrão
        this.applyStandardStyles(container);

        // Configurar loading states
        this.setupLoadingStates(container);

        // Configurar error handling
        this.setupErrorHandling(container);

        // Configurar responsive behavior
        this.setupResponsiveBehavior(container);

        // Retornar instância da página
        return {
            container,
            config,
            widgets: this.widgetInstances,
            updateMetric: (id, data) => this.updateWidget(`metric-${id}`, data),
            updateChart: (id, data) => this.updateWidget(`chart-${id}`, data),
            updateTable: (id, data) => this.updateWidget(`table-${id}`, data),
            showLoading: () => this.showPageLoading(container),
            hideLoading: () => this.hidePageLoading(container),
            showError: (message) => this.showPageError(container, message),
            destroy: () => this.destroyPage()
        };
    }

    /**
     * Aplicar estilos padrão
     */
    applyStandardStyles(container) {
        container.classList.add('ubs-standardized-page');
    }

    /**
     * Configurar loading states
     */
    setupLoadingStates(container) {
        container.addEventListener('ubsShowLoading', () => {
            this.showPageLoading(container);
        });

        container.addEventListener('ubsHideLoading', () => {
            this.hidePageLoading(container);
        });
    }

    /**
     * Configurar error handling
     */
    setupErrorHandling(container) {
        container.addEventListener('ubsShowError', (e) => {
            this.showPageError(container, e.detail.message);
        });
    }

    /**
     * Configurar responsive behavior
     */
    setupResponsiveBehavior(container) {
        // Implementar comportamentos responsivos específicos
        this.handleResponsiveCharts(container);
        this.handleResponsiveTables(container);
    }

    /**
     * Atualizar widget específico
     */
    updateWidget(widgetId, data) {
        const widget = this.widgetInstances.get(widgetId);
        if (widget && widget.update) {
            widget.update(data);
        }
    }

    /**
     * Mostrar loading da página
     */
    showPageLoading(container) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'ubs-page-loading';
        loadingOverlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <p class="mt-3 text-muted">Carregando dados...</p>
            </div>
        `;
        container.appendChild(loadingOverlay);
    }

    /**
     * Esconder loading da página
     */
    hidePageLoading(container) {
        const loading = container.querySelector('.ubs-page-loading');
        if (loading) {
            loading.remove();
        }
    }

    /**
     * Mostrar erro da página
     */
    showPageError(container, message) {
        const errorAlert = document.createElement('div');
        errorAlert.className = 'alert alert-danger alert-dismissible fade show';
        errorAlert.innerHTML = `
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Erro:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        const pageContent = container.querySelector('.ubs-page-content');
        if (pageContent) {
            pageContent.insertBefore(errorAlert, pageContent.firstChild);
        }
    }

    /**
     * Handle responsive charts
     */
    handleResponsiveCharts(container) {
        // Implementar redimensionamento automático de gráficos
        window.addEventListener('resize', () => {
            this.widgetInstances.forEach((widget, id) => {
                if (id.startsWith('chart-') && widget.chart) {
                    widget.chart.resize();
                }
            });
        });
    }

    /**
     * Handle responsive tables
     */
    handleResponsiveTables(container) {
        // Implementar comportamento responsivo para tabelas
        // (já implementado via Bootstrap classes)
    }

    /**
     * Destruir página e limpar recursos
     */
    destroyPage() {
        this.widgetInstances.forEach(widget => {
            if (widget.destroy) {
                widget.destroy();
            }
        });
        this.widgetInstances.clear();
    }
}

// ============================================================================
// PAGE INITIALIZERS - Inicializadores específicos por página
// ============================================================================

class UBSPageInitializer {
    
    static checkReturnFromTenantPlatform() {
        // Check if coming from tenant-platform dashboard
        const referrer = document.referrer;
        const urlParams = new URLSearchParams(window.location.search);
        const fromTenantPlatform = urlParams.get('from') === 'tenant-platform';
        
        if (referrer.includes('/admin/tenant-platform') || fromTenantPlatform) {
            console.log('👋 User returning from tenant-platform dashboard');
            
            // Show welcome back message
            this.showReturnNotification();
            
            // Ensure tenant filter is reset to "all"
            setTimeout(() => {
                const tenantFilter = document.querySelector('select[name="tenant"]');
                if (tenantFilter) {
                    tenantFilter.value = 'all';
                    console.log('🔄 Reset tenant filter to "all"');
                }
            }, 500);
            
            // Clean URL
            if (fromTenantPlatform) {
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }
    }
    
    static showReturnNotification() {
        // Create and show a subtle notification
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div class="alert alert-info alert-dismissible fade show position-fixed" 
                 style="top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
                <i class="fas fa-arrow-left me-2"></i>
                Voltou para a visão geral da plataforma
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            const alert = notification.querySelector('.alert');
            if (alert) {
                alert.classList.remove('show');
                setTimeout(() => notification.remove(), 150);
            }
        }, 4000);
    }

    static async switchToTenantPlatformView(tenantId) {
        console.log('🔄 Switching to tenant-platform view for:', tenantId);
        
        try {
            const systemDashboard = document.getElementById('dashboardContainer');
            const tenantPlatformDashboard = document.getElementById('tenantPlatformContainer');
            
            if (!systemDashboard || !tenantPlatformDashboard) {
                console.error('❌ Dashboard containers not found');
                return;
            }
            
            // SWITCH SIMPLES E DIRETO
            systemDashboard.style.display = 'none';
            tenantPlatformDashboard.style.display = 'block';
            
            // Initialize tenant-platform dashboard
            await UBSPageInitializer.initializeTenantPlatformDashboard(tenantPlatformDashboard, tenantId);
            
            console.log('✅ Switched to tenant-platform view');
            
        } catch (error) {
            console.error('❌ Error switching to tenant-platform view:', error);
            
            // Em caso de erro, voltar para sistema
            const systemDashboard = document.getElementById('dashboardContainer');
            const tenantPlatformDashboard = document.getElementById('tenantPlatformContainer');
            
            if (systemDashboard) {
                systemDashboard.style.display = 'block';
            }
            
            if (tenantPlatformDashboard) {
                tenantPlatformDashboard.style.display = 'none';
            }
        }
    }
    
    static async switchToSystemView() {
        console.log('🔄 Switching back to system view');
        
        try {
            const systemDashboard = document.getElementById('dashboardContainer');
            const tenantPlatformDashboard = document.getElementById('tenantPlatformContainer');
            
            if (!systemDashboard || !tenantPlatformDashboard) {
                console.error('❌ Dashboard containers not found');
                return;
            }
            
            // Fade out tenant-platform dashboard
            tenantPlatformDashboard.style.opacity = '0.5';
            tenantPlatformDashboard.style.pointerEvents = 'none';
            
            setTimeout(() => {
                // Hide tenant-platform and show system
                tenantPlatformDashboard.style.display = 'none';
                systemDashboard.style.display = 'block';
                systemDashboard.style.opacity = '1';
                systemDashboard.style.pointerEvents = 'auto';
                systemDashboard.style.transition = 'opacity 0.3s ease';
                
                // Update page title
                document.title = 'UBS Dashboard - Padronizado';
                
                UBSPageInitializer.showFilterChangeIndicator('Voltou para visão geral da plataforma!', 'success');
            }, 300);
            
        } catch (error) {
            console.error('❌ Error switching to system view:', error);
            UBSPageInitializer.showFilterChangeIndicator('Erro ao voltar para visão sistema', 'error');
        }
    }
    
    static async initializeTenantPlatformDashboard(container, tenantId) {
        console.log('🚀 INICIALIZANDO tenant-platform dashboard para:', tenantId);
        
        try {
            // Verificar se o container existe
            if (!container) {
                throw new Error('Container não encontrado');
            }
            
            // USAR O SISTEMA DE WIDGETS PADRÃO - duplicar a estrutura exata
            console.log('🎯 Usando widgets padrão para tenant-platform');
            
            // Limpar container e recriar usando sistema padrão
            container.innerHTML = '';
            
            // Usar o sistema de inicialização normal
            const dashboard = await UBSPageInitializer.initializeDashboard(container);
            
            console.log('✅ Dashboard tenant-platform criado com widgets padrão');
            
            // Aguardar um pouco para garantir que os elementos foram criados
            // MAS SÓ CONFIGURA DROPDOWN SE NÃO ESTÁ CONFIGURANDO OUTRO
            if (!window.configuringTenantDropdown) {
                window.configuringTenantDropdown = true;
                
                setTimeout(() => {
                    try {
                        // Configurar dropdown APENAS se não existe um configurado
                        const existingDropdown = document.querySelector('#tenantPlatformContainer select[name="tenant"]');
                        if (existingDropdown && !existingDropdown.hasAttribute('data-tenant-configured')) {
                            this.configureTenantPlatformDropdown();
                        }
                    } catch (error) {
                        console.error('❌ Error configuring dropdown:', error);
                    } finally {
                        window.configuringTenantDropdown = false;
                    }
                }, 1000);
            }
            
            return dashboard;
            
        } catch (error) {
            console.error('❌ Error creating tenant-platform dashboard:', error);
            
            // Mostrar erro de forma segura
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger m-4">
                        <h4><i class="fas fa-exclamation-triangle"></i> Erro ao carregar Tenant Platform</h4>
                        <p><strong>Erro:</strong> ${error.message}</p>
                        <p><small>Tenant ID: ${tenantId}</small></p>
                        <hr>
                        <div class="alert alert-info mt-3">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Dados atualizados diariamente:</strong> Próxima atualização às 04:00 de amanhã.
                        </div>
                        <button class="btn btn-secondary ml-2" onclick="UBSPageInitializer.switchToSystemView()">
                            <i class="fas fa-arrow-left"></i> Voltar para Sistema
                        </button>
                    </div>
                `;
            }
            
            throw error;
        }
    }
    
    // ===== INTERCEPTAÇÃO DE APIs PARA TENANT-PLATFORM =====
    static setupTenantPlatformAPIInterception(tenantId) {
        console.log('🎯 Setting up API interception for tenant:', tenantId);
        
        // Salvar fetch original se ainda não foi salvo
        if (!window.originalFetch) {
            window.originalFetch = window.fetch;
        }
        
        // Rate limiting to prevent API spam
        if (!window._apiCallTimestamps) {
            window._apiCallTimestamps = new Map();
        }
        
        // Interceptar todas as chamadas fetch with rate limiting
        window.fetch = async (url, options) => {
            console.log('🔍 Intercepting fetch:', url);
            
            // Rate limiting check for dashboard API calls
            if (typeof url === 'string' && url.includes('/api/admin/')) {
                const now = Date.now();
                const lastCall = window._apiCallTimestamps.get(url) || 0;
                const timeDiff = now - lastCall;
                
                // Prevent calls less than 500ms apart for the same URL
                if (timeDiff < 500) {
                    console.log('🚫 Rate limiting API call:', url, 'last call was', timeDiff, 'ms ago');
                    return Promise.reject(new Error('Rate limited'));
                }
                
                window._apiCallTimestamps.set(url, now);
            }
            
            // Verificar se estamos no tenant-platform container
            const tenantPlatformContainer = document.getElementById('tenantPlatformContainer');
            const isInTenantPlatform = tenantPlatformContainer && 
                                      tenantPlatformContainer.style.display !== 'none';
            
            console.log('🔍 Tenant platform status:', {
                containerExists: !!tenantPlatformContainer,
                containerVisible: tenantPlatformContainer?.style.display !== 'none',
                selectedTenant: window.tenantPlatformSelectedTenant,
                isInTenantPlatform
            });
            
            // Se é uma chamada para dashboard API e estamos no tenant-platform
            if (typeof url === 'string' && url.includes('/api/admin/dashboard') && isInTenantPlatform) {
                
                console.log('🎯 Filtering dashboard API for specific tenant (super admin view)');
                
                // Extrair parâmetros da URL original
                const urlObj = new URL(url, window.location.origin);
                const period = urlObj.searchParams.get('period') || '30d';
                
                // Usar o tenant atual da variável de página
                const currentTenant = window.tenantPlatformSelectedTenant || tenantId;
                
                // CORREÇÃO: Usar API do super admin com filtro de tenant
                const newUrl = `/api/admin/dashboard?tenant=${currentTenant}&period=${period}`;
                console.log('🔄 Filtering dashboard API for tenant:', url, '→', newUrl);
                
                return window.originalFetch(newUrl, options);
            }
            
            // Para outras URLs, usar fetch original
            return window.originalFetch(url, options);
        };
        
        console.log('✅ API interception configured for tenant-platform');
    }
    
    // Método para restaurar fetch original
    static restoreOriginalFetch() {
        if (window.originalFetch) {
            window.fetch = window.originalFetch;
            console.log('✅ Original fetch restored');
        }
    }

    // ===== MÉTODOS TENANT-PLATFORM DUPLICADOS =====
    static async setupTenantPlatformFilters(template) {
        const filtersContainer = document.querySelector('#tenantPlatformContainer #standard-filters-container');
        if (!filtersContainer) return;

        // DUPLICAR: chamar a lógica normal mas forçando o container correto
        const originalGetElementById = document.getElementById;
        document.getElementById = function(id) {
            if (id === 'standard-filters-container') {
                return document.querySelector('#tenantPlatformContainer #standard-filters-container');
            }
            return originalGetElementById.call(document, id);
        };
        
        try {
            // INTERCEPTAR a criação dos filtros para já criar com o tenant correto
            const originalCreateFiltersSection = template.createFiltersSection;
            template.createFiltersSection = (container, config) => {
                console.log('🔧 INTERCEPTING createFiltersSection');
                
                // Usar variável de página para definir qual é o default
                if (config.filters) {
                    config.filters.forEach(filter => {
                        if (filter.name === 'tenant' && filter.options) {
                            // Se tem tenant selecionado, ele é o default
                            // Se null, "all" é o default
                            const defaultTenant = window.tenantPlatformSelectedTenant || 'all';
                            
                            filter.options.forEach(option => {
                                option.default = (option.value === defaultTenant);
                            });
                            
                            console.log('🎯 DROPDOWN DEFAULT SET TO:', defaultTenant);
                        }
                    });
                }
                
                return originalCreateFiltersSection.call(template, container, config);
            };
            
            // Agora chama o método normal que vai encontrar o container certo
            await this.setupDashboardFilters(template);
            
            // Restaurar o método original
            template.createFiltersSection = originalCreateFiltersSection;
            
            // APÓS CRIAR OS FILTROS, CONFIGURAR O DROPDOWN COM O TENANT CORRETO
            setTimeout(() => {
                UBSPageInitializer.configureTenantPlatformDropdown();
            }, 500);
        } finally {
            // Restaura o getElementById original
            document.getElementById = originalGetElementById;
        }
    }
    
    static async setupTenantPlatformMetricsDuplicated(template, filterTenant = 'all', filterPeriod = '30d') {
        const metricsContainer = document.querySelector('#tenantPlatformContainer #standard-metrics-container');
        if (!metricsContainer) return;

        // Store original functions
        const originalGetElementById = document.getElementById;
        const originalFetch = window.fetch;
        
        try {
            // DUPLICAR: chamar a lógica normal mas forçando o container correto
            document.getElementById = function(id) {
                if (id === 'standard-metrics-container') {
                    return document.querySelector('#tenantPlatformContainer #standard-metrics-container');
                }
                return originalGetElementById.call(document, id);
            };
            
            // INTERCEPTAR também as chamadas de API para usar tenant-platform
            window.fetch = function(url, options) {
                console.log('🔍 INTERCEPTING fetch call:', url);
                
                // Verificar se estamos no tenant-platform container
                const tenantPlatformContainer = document.getElementById('tenantPlatformContainer');
                const isInTenantPlatform = tenantPlatformContainer && 
                                          tenantPlatformContainer.style.display !== 'none';
                
                console.log('🔍 Tenant platform status:', {
                    containerExists: !!tenantPlatformContainer,
                    containerVisible: tenantPlatformContainer?.style.display !== 'none',
                    selectedTenant: window.tenantPlatformSelectedTenant,
                    isInTenantPlatform
                });
                
                // Se é uma chamada para dashboard API e estamos no tenant-platform
                if (typeof url === 'string' && url.includes('/api/admin/dashboard') && isInTenantPlatform) {
                    const tenantId = window.tenantPlatformSelectedTenant;
                    console.log('🎯 Redirecting dashboard API to tenant-platform API for tenant:', tenantId);
                    
                    // Extrair parâmetros da URL original
                    const urlObj = new URL(url, window.location.origin);
                    const period = urlObj.searchParams.get('period') || '30d';
                    
                    const newUrl = `/api/admin/tenant-platform/${tenantId}?period=${period}`;
                    console.log('🔄 API REDIRECT:', url, '→', newUrl);
                    
                    return originalFetch.call(window, newUrl, options);
                }
                
                return originalFetch.call(window, url, options);
            };
            
            // Agora chama o método normal que vai usar a API tenant-platform
            await this.setupDashboardMetrics(template, filterTenant, filterPeriod);
            
        } finally {
            // Restaura o getElementById e fetch originais
            document.getElementById = originalGetElementById;
            window.fetch = originalFetch;
        }
    }
    
    static async setupTenantPlatformChartsDuplicated(template, filterTenant = 'all', filterPeriod = '30d') {
        const chartsContainer = document.querySelector('#tenantPlatformContainer #section-charts');
        if (!chartsContainer) return;

        // Store original functions
        const originalGetElementById = document.getElementById;
        const originalFetch = window.fetch;
        
        try {
            // DUPLICAR: chamar a lógica normal mas forçando o container correto
            document.getElementById = function(id) {
                if (id === 'section-charts') {
                    return document.querySelector('#tenantPlatformContainer #section-charts');
                }
                return originalGetElementById.call(document, id);
            };
            
            // INTERCEPTAR também as chamadas de API para usar tenant-platform
            window.fetch = function(url, options) {
                console.log('🔍 INTERCEPTING fetch call for charts:', url);
                
                // Verificar se estamos no tenant-platform container
                const tenantPlatformContainer = document.getElementById('tenantPlatformContainer');
                const isInTenantPlatform = tenantPlatformContainer && 
                                          tenantPlatformContainer.style.display !== 'none';
                
                console.log('🔍 Tenant platform status for charts:', {
                    containerExists: !!tenantPlatformContainer,
                    containerVisible: tenantPlatformContainer?.style.display !== 'none',
                    selectedTenant: window.tenantPlatformSelectedTenant,
                    isInTenantPlatform
                });
                
                // Se é uma chamada para dashboard API e estamos no tenant-platform
                if (typeof url === 'string' && url.includes('/api/admin/dashboard') && isInTenantPlatform) {
                    const tenantId = window.tenantPlatformSelectedTenant;
                    console.log('🎯 Redirecting dashboard API to tenant-platform API for charts, tenant:', tenantId);
                    
                    // Extrair parâmetros da URL original
                    const urlObj = new URL(url, window.location.origin);
                    const period = urlObj.searchParams.get('period') || '30d';
                    
                    const newUrl = `/api/admin/tenant-platform/${tenantId}?period=${period}`;
                    console.log('🔄 CHARTS API REDIRECT:', url, '→', newUrl);
                    
                    return originalFetch.call(window, newUrl, options);
                }
                
                return originalFetch.call(window, url, options);
            };
            
            // Agora chama o método normal que vai usar a API tenant-platform
            await this.setupDashboardCharts(template, filterTenant, filterPeriod);
        } finally {
            // Restaura o getElementById e fetch originais
            document.getElementById = originalGetElementById;
            window.fetch = originalFetch;
        }
    }
    
    static async setupTenantPlatformTablesDuplicated(template, filterTenant = 'all', filterPeriod = '30d') {
        const tablesContainer = document.querySelector('#tenantPlatformContainer #section-data-tables');
        if (!tablesContainer) return;

        // Implementar depois - por agora retorna vazio
        return;
    }
    
    static configureTenantPlatformDropdown() {
        // Buscar o dropdown padrão criado pelo sistema de widgets
        const tenantSelect = document.querySelector('#tenantPlatformContainer select[name="tenant"]');
        if (!tenantSelect) {
            console.warn('⚠️ Cannot find tenant dropdown in tenant-platform container');
            return;
        }
        
        console.log('🎯 Configurando dropdown tenant-platform');
        
        // TEMPORARIAMENTE DESABILITAR EVENTOS PARA CONFIGURAÇÃO
        const originalOnChange = tenantSelect.onchange;
        tenantSelect.onchange = null;
        
        // Se temos um tenant selecionado, definir como valor selecionado
        if (window.tenantPlatformSelectedTenant) {
            console.log('🎯 Setting dropdown to tenant:', window.tenantPlatformSelectedTenant);
            
            // Usar método direto para definir valor
            tenantSelect.value = window.tenantPlatformSelectedTenant;
            console.log('✅ Tenant dropdown value set to:', tenantSelect.value);
        }
        
        // Event listener para mudanças no dropdown with proper debouncing
        let dropdownTimeout = null;
        tenantSelect.onchange = (e) => {
            // Clear any pending timeout
            if (dropdownTimeout) {
                clearTimeout(dropdownTimeout);
            }
            
            // Debounce the dropdown change to prevent rapid firing
            dropdownTimeout = setTimeout(async () => {
                console.log('🔄 TENANT-PLATFORM dropdown changed to:', e.target.value);
                console.log('🔄 Previous tenant was:', window.tenantPlatformSelectedTenant);
                
                // Evitar processar se é a mesma configuração
                if (e.target.value === window.tenantPlatformSelectedTenant) {
                    console.log('🔄 Same tenant, ignoring change');
                    return;
                }
                
                // Prevenir execução múltipla
                if (tenantSelect.hasAttribute('data-processing')) {
                    console.log('🔄 Already processing tenant change, ignoring');
                    return;
                }
                
                tenantSelect.setAttribute('data-processing', 'true');
                
                if (e.target.value === 'all' || !e.target.value) {
                    console.log('🔄 TENANT-PLATFORM → SISTEMA');
                    
                    // Clear the page variable
                    window.tenantPlatformSelectedTenant = null;
                    console.log('🔗 Page variable cleared');
                    
                    // Switch back to system container - MÉTODO MAIS SIMPLES
                    try {
                        // RESTAURAR fetch original antes de voltar para sistema
                        UBSPageInitializer.restoreOriginalFetch();
                        
                        document.getElementById('tenantPlatformContainer').style.display = 'none';
                        document.getElementById('dashboardContainer').style.display = 'block';
                        
                        // Reset system dropdown to "all"
                        const systemDropdown = document.querySelector('#dashboardContainer select[name="tenant"]');
                        if (systemDropdown) {
                            systemDropdown.value = 'all';
                            console.log('🔄 System dropdown reset to "all"');
                        }
                        
                        console.log('✅ Returned to system view');
                    } catch (error) {
                        console.error('❌ Error returning to system:', error);
                        // Fallback: reload page
                        location.reload();
                    } finally {
                        // Remove processing flag
                        tenantSelect.removeAttribute('data-processing');
                    }
                } else {
                    console.log('🔄 TENANT-PLATFORM → TENANT-PLATFORM (novo tenant):', e.target.value);
                    
                    // Update page variable
                    const oldTenant = window.tenantPlatformSelectedTenant;
                    window.tenantPlatformSelectedTenant = e.target.value;
                    console.log('🔗 Page variable updated from:', oldTenant, 'to:', window.tenantPlatformSelectedTenant);
                    console.log('🔗 About to reload dashboard with tenant:', e.target.value);
                    
                    // MÉTODO MAIS SIMPLES: Apenas atualizar variável e recarregar dados
                    try {
                        console.log('🔄 Switching to new tenant without recreating dashboard...');
                        
                        // Mostrar loading
                        const container = document.getElementById('tenantPlatformContainer');
                        if (container) {
                            // Mostrar indicador de carregamento sem destruir o dashboard
                            UBSPageInitializer.showFilterChangeIndicator('Alternando para novo tenant...', 'info');
                            
                            // Note: API interception handled by container visibility check
                            
                            // Recarregar dados sem recriar o dashboard
                            await UBSPageInitializer.refreshTenantPlatformData(e.target.value);
                            
                            UBSPageInitializer.showFilterChangeIndicator('Tenant alterado com sucesso!', 'success');
                            console.log('✅ Dashboard updated for new tenant');
                        }
                    } catch (error) {
                        console.error('❌ Error switching tenant:', error);
                        UBSPageInitializer.showFilterChangeIndicator('Erro ao alterar tenant', 'error');
                    } finally {
                        // Remove processing flag
                        tenantSelect.removeAttribute('data-processing');
                    }
                }
            }, 300); // 300ms debounce delay
        };
        
        // Marcar dropdown como configurado
        tenantSelect.setAttribute('data-tenant-configured', 'true');
        
        console.log('✅ Dropdown configured for tenant-platform');
    }

    // DEBUG: Função para testar o sistema completo
    static testTenantPlatformSystem() {
        console.log('🧪 === TESTING TENANT-PLATFORM SYSTEM ===');
        
        // Test 1: Check containers
        const systemContainer = document.getElementById('dashboardContainer');
        const tenantContainer = document.getElementById('tenantPlatformContainer');
        console.log('📦 System container:', !!systemContainer);
        console.log('📦 Tenant container:', !!tenantContainer);
        
        // Test 2: Check dropdowns
        const systemDropdown = document.querySelector('#dashboardContainer select[name="tenant"]');
        const tenantDropdown = document.querySelector('#tenantPlatformContainer select[name="tenant"]');
        console.log('📋 System dropdown:', !!systemDropdown);
        console.log('📋 Tenant dropdown:', !!tenantDropdown);
        
        // Test 3: Check page variable
        console.log('🔗 Page variable:', window.tenantPlatformSelectedTenant);
        
        // Test 4: Check methods
        console.log('⚙️ switchToTenantPlatformView:', typeof UBSPageInitializer.switchToTenantPlatformView);
        console.log('⚙️ initializeTenantPlatformDashboard:', typeof UBSPageInitializer.initializeTenantPlatformDashboard);
        console.log('⚙️ configureTenantPlatformDropdown:', typeof UBSPageInitializer.configureTenantPlatformDropdown);
        
        console.log('✅ Test complete - check console for results');
    }
    
    // ===== MÉTODOS TENANT-PLATFORM ORIGINAIS =====
    static async setupTenantPlatformMetrics(template, tenantId) {
        console.log('📊 Setting up TENANT-PLATFORM metrics for:', tenantId);
        
        // Usar a mesma estrutura, mas com dados de participação
        const metricsContainer = document.getElementById('standard-metrics-container');
        if (!metricsContainer) return;
        
        // Chama o método normal mas vai interceptar na API
        return await this.setupDashboardMetrics(template, tenantId, '30d');
    }
    
    static async setupTenantPlatformCharts(template, tenantId) {
        console.log('📈 Setting up TENANT-PLATFORM charts for:', tenantId);
        
        // Usar a mesma estrutura, mas com dados de participação
        const chartsContainer = document.getElementById('section-charts');
        if (!chartsContainer) return;
        
        // Chama o método normal mas vai interceptar na API
        return await this.setupDashboardCharts(template, tenantId, '30d');
    }
    
    static async setupTenantPlatformTables(template, tenantId) {
        console.log('📋 Setting up TENANT-PLATFORM tables for:', tenantId);
        
        // Usar a mesma estrutura, mas com dados de participação
        const tablesContainer = document.getElementById('section-data-tables');
        if (!tablesContainer) return;
        
        // Chama o método normal mas vai interceptar na API
        return await this.setupDashboardTables(template, tenantId, '30d');
    }
    
    static async setupTenantPlatformMetricsCharts(template, tenantId) {
        console.log('📊📈 Setting up TENANT-PLATFORM metrics and charts for:', tenantId);
        
        try {
            // Setup both metrics and charts in parallel
            await Promise.all([
                this.setupTenantPlatformMetrics(template, tenantId),
                this.setupTenantPlatformCharts(template, tenantId)
            ]);
            
            console.log('✅ Tenant-platform metrics and charts setup complete');
        } catch (error) {
            console.error('❌ Error setting up tenant-platform metrics and charts:', error);
            throw error;
        }
    }
    
    static async loadTenantPlatformData(tenantId) {
        console.log('📊 Loading tenant-platform data for:', tenantId);
        
        try {
            // Get auth token
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                throw new Error('Token de autenticação não encontrado');
            }
            
            // Fetch tenant-platform data from API
            const response = await fetch(`/api/admin/tenant-platform/${tenantId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Tenant-platform data loaded:', data);
            
            // Render the data using the template system
            await this.renderTenantPlatformData(data);
            
        } catch (error) {
            console.error('❌ Error loading tenant-platform data:', error);
            throw error;
        }
    }
    
    static async renderTenantPlatformData(data) {
        console.log('🎨 Rendering tenant-platform data');
        
        // This will be implemented with the same widget system
        // but showing participation metrics instead of absolute values
        
        // For now, show a placeholder
        const container = document.getElementById('tenantPlatformContainer');
        const contentArea = container.querySelector('.ubs-page-content') || container;
        
        contentArea.innerHTML += `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">
                                <i class="fas fa-chart-pie me-2"></i>
                                Participação na Plataforma - ${data.tenant?.name}
                            </h5>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="text-center p-3 border rounded">
                                        <h3 class="text-primary">${data.participation?.revenue?.percentage?.toFixed(1)}%</h3>
                                        <p class="mb-0">Participação na Receita</p>
                                        <small class="text-muted">R$ ${data.participation?.revenue?.value?.toLocaleString()}</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 border rounded">
                                        <h3 class="text-success">${data.participation?.appointments?.percentage?.toFixed(1)}%</h3>
                                        <p class="mb-0">Participação em Agendamentos</p>
                                        <small class="text-muted">${data.participation?.appointments?.value} agendamentos</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 border rounded">
                                        <h3 class="text-warning">${data.participation?.customers?.percentage?.toFixed(1)}%</h3>
                                        <p class="mb-0">Participação em Clientes</p>
                                        <small class="text-muted">${data.participation?.customers?.value} clientes</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 border rounded">
                                        <h3 class="text-info">${data.participation?.ai?.percentage?.toFixed(1)}%</h3>
                                        <p class="mb-0">Participação IA</p>
                                        <small class="text-muted">${data.participation?.ai?.value} interações</small>
                                    </div>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-md-6">
                                    <h6><i class="fas fa-building me-2"></i>Contexto da Plataforma</h6>
                                    <ul class="list-unstyled">
                                        <li><strong>Receita Total:</strong> R$ ${data.platformContext?.totalRevenue?.toLocaleString()}</li>
                                        <li><strong>Total Tenants:</strong> ${data.platformContext?.totalTenants}</li>
                                        <li><strong>Total Agendamentos:</strong> ${data.platformContext?.totalAppointments}</li>
                                        <li><strong>Total Clientes:</strong> ${data.platformContext?.totalCustomers}</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6><i class="fas fa-trophy me-2"></i>Ranking</h6>
                                    <ul class="list-unstyled">
                                        <li><strong>Posição:</strong> ${data.ranking?.position}º de ${data.ranking?.totalScore}</li>
                                        <li><strong>Score Total:</strong> ${data.ranking?.totalScore?.toFixed(1)}</li>
                                        <li><strong>Percentil:</strong> ${data.ranking?.percentile?.toFixed(1)}%</li>
                                        <li><strong>Status Risco:</strong> ${data.riskAssessment?.status}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static async refreshTenantPlatformData(tenantId) {
        console.log('🔄 Refreshing tenant-platform data for:', tenantId);
        
        // Prevent multiple simultaneous refresh operations
        if (this._refreshInProgress) {
            console.log('🔄 Refresh already in progress, skipping');
            return;
        }
        
        this._refreshInProgress = true;
        
        try {
            // Atualizar a variável de página
            window.tenantPlatformSelectedTenant = tenantId;
            
            // Only reload the data content, not the entire dashboard structure
            const metricsContainer = document.getElementById('standard-metrics-container');
            const chartsContainer = document.getElementById('section-charts');
            
            if (metricsContainer) {
                metricsContainer.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Carregando métricas...</div>';
            }
            if (chartsContainer) {
                chartsContainer.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Carregando gráficos...</div>';
            }
            
            // Refresh data with shorter timeout and circuit breaker
            const template = new UBSDashboardTemplate();
            await Promise.race([
                Promise.all([
                    this.setupTenantPlatformMetricsDuplicated(template, tenantId, '30d'),
                    this.setupTenantPlatformChartsDuplicated(template, tenantId, '30d')
                ]),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Refresh timeout')), 10000)
                )
            ]);
            
            console.log('✅ Tenant-platform data refreshed successfully');
            
        } catch (error) {
            console.error('❌ Error refreshing tenant-platform data:', error);
            
            // Show error state instead of continuing to retry
            const metricsContainer = document.getElementById('standard-metrics-container');
            const chartsContainer = document.getElementById('section-charts');
            
            if (metricsContainer) {
                metricsContainer.innerHTML = '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar métricas</div>';
            }
            if (chartsContainer) {
                chartsContainer.innerHTML = '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar gráficos</div>';
            }
            
            throw error;
        } finally {
            this._refreshInProgress = false;
        }
    }

    static async initializeDashboard(containerOrConfig) {
        const template = new UBSDashboardTemplate();
        
        this.checkReturnFromTenantPlatform();
        
        let container, dashboardConfig;
        
        // Detectar se recebemos um container (elemento DOM) ou config (objeto)
        if (containerOrConfig && containerOrConfig.page) {
            // Recebemos uma configuração - extrair container e config
            dashboardConfig = containerOrConfig;
            container = document.getElementById(dashboardConfig.page.containerId);
            
            if (!container) {
                throw new Error(`Container não encontrado: ${dashboardConfig.page.containerId}`);
            }
            
            console.log('🔧 UBS: Usando config fornecida para dashboard');
        } else {
            // Recebemos um container - usar config padrão
            container = containerOrConfig;
            dashboardConfig = {
                type: 'dashboard',
                title: 'Dashboard',
                subtitle: 'Visão geral do seu negócio',
                icon: 'fas fa-chart-line',
                showBreadcrumb: false,
                showFilters: true,
                showMetrics: true,
                actions: [
                    { label: 'Exportar', icon: 'fas fa-download', class: 'btn-outline-primary', handler: 'exportDashboard()' },
                    { label: 'Atualizar', icon: 'fas fa-sync', class: 'btn-primary', handler: 'refreshDashboard()' }
                ],
                sections: [
                    { id: 'charts', title: 'Gráficos' },
                    { id: 'recent-activity', title: 'Atividade Recente' }
                ]
            };
            
            console.log('🔧 UBS: Usando config padrão para dashboard');
        }

        const page = template.createStandardPage(container, dashboardConfig);

        // Detectar qual container estamos usando
        const isTenantPlatformContainer = container.id === 'tenantPlatformContainer';
        
        if (isTenantPlatformContainer) {
            // TENANT-PLATFORM CONTAINER: usar métodos duplicados
            await this.setupTenantPlatformFilters(template);
            await this.setupTenantPlatformMetricsDuplicated(template, 'all', '30d');
            await this.setupTenantPlatformChartsDuplicated(template, 'all', '30d');
            await this.setupTenantPlatformTablesDuplicated(template, 'all', '30d');
        } else {
            // SISTEMA CONTAINER: usar métodos originais
            await this.setupDashboardFilters(template);
            
            // Wait for filters to be created, then read their values
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Read current filter values instead of using defaults
            const tenantFilter = document.querySelector('select[name="tenant"]');
            const periodFilter = document.querySelector('input[name="period"]:checked');
            
            const selectedTenant = tenantFilter?.value || 'all';
            const selectedPeriod = periodFilter?.value || '30d';
            
            console.log('🔍 Initial filter values:', { tenant: selectedTenant, period: selectedPeriod });
            
            await this.setupDashboardMetrics(template, selectedTenant, selectedPeriod);
            await this.setupDashboardCharts(template, selectedTenant, selectedPeriod);
            await this.setupDashboardTables(template, selectedTenant, selectedPeriod);
        }

        return page;
    }

    static async setupDashboardFilters(template) {
        const filtersContainer = document.getElementById('standard-filters-container');
        if (!filtersContainer) return;

        // Get user role to determine filter options
        const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        let userInfo = { role: 'tenant_admin' };
        
        try {
            const response = await fetch('/api/admin/user-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            userInfo = result.data || result || { role: 'tenant_admin' };
        } catch (error) {
            console.error('Error fetching user info for filters:', error);
        }

        const filtersConfig = [
            {
                type: 'period-selector',
                name: 'period',
                label: 'Período',
                value: '30d'
            }
        ];

        // Only add tenant filter for super admins
        if (userInfo.role === 'super_admin') {
            filtersConfig.splice(1, 0, {
                type: 'select',
                name: 'tenant',
                label: 'Negócio',
                options: [
                    { value: 'all', label: 'Todos os Negócios', selected: true },
                    { value: '2cef59ac-d8a7-4b47-854b-6ec4673f3810', label: 'Salão de Beleza Bella Vista' },
                    { value: '0f2dca0b-1223-44bd-825a-c2d806de0a25', label: 'Clínica Saúde Plena' },
                    { value: 'ea1e9c71-2cde-4959-b367-81fa177407d8', label: 'Silva & Associados Advocacia' },
                    { value: 'c5b0f725-169e-4eb7-bacf-236fd34148db', label: 'FitLife Academia' }
                ]
            });
        }

        // Criar filtros de forma alternativa se UBSWidgets.Filter não funcionar
        let filtersSection;
        try {
            filtersSection = template.createFiltersSection(filtersContainer, filtersConfig);
        } catch (error) {
            console.error('❌ Erro ao criar filtros com UBSWidgets:', error);
            filtersSection = this.createFiltersManually(filtersContainer, filtersConfig);
        }
        
        // Add event listeners to filters with a small delay to ensure DOM is ready
        setTimeout(() => {
            console.log('🔧 Setting up event listeners after delay...');
            this.setupFilterEventListeners();
            this.addDebugButton();
            this.testFiltersExistence();
        }, 500);
        
        return filtersSection;
    }

    static createFiltersManually(container, filtersConfig) {
        console.log('🔧 Criando filtros manualmente...');
        
        if (!filtersConfig || !filtersConfig.length) {
            console.warn('⚠️ Nenhum filtro configurado');
            return null;
        }
        
        // Criar HTML dos filtros
        const filtersHTML = filtersConfig.map(filter => {
            if (filter.type === 'period-selector') {
                return `
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <div class="btn-group w-100" role="group">
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_7d" value="7d" ${filter.value === '7d' ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_7d">7 dias</label>
                            
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_30d" value="30d" ${filter.value === '30d' || !filter.value ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_30d">30 dias</label>
                            
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_90d" value="90d" ${filter.value === '90d' ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_90d">90 dias</label>
                        </div>
                    </div>
                `;
            } else if (filter.type === 'select') {
                return `
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <select class="form-select form-select-sm" name="${filter.name}">
                            ${filter.options.map(opt => `
                                <option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>
                            `).join('')}
                        </select>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="row g-3">
                        ${filtersHTML}
                    </div>
                </div>
            </div>
        `;
        
        console.log('✅ Filtros manuais criados');
        return { container };
    }

    static setupFilterEventListeners() {
        console.log('🔧 Setting up filter event listeners...');
        
        // Wait for DOM to be fully ready
        setTimeout(() => {
            this.attachFilterListeners();
        }, 100);
        
        // Also setup mutation observer to handle dynamic filter creation
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if filters were added (old and new implementations)
                    const hasFilters = document.querySelector('select[name="tenant"]') || 
                                      document.querySelector('input[name="period"]') ||
                                      document.getElementById('periodFilter') ||
                                      document.getElementById('tenantFilter');
                    if (hasFilters) {
                        console.log('🔍 Filters detected in DOM, attaching listeners');
                        this.attachFilterListeners();
                        this.initializeFilters();
                    }
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('🔧 Filter event listeners setup complete');
    }
    
    static attachFilterListeners() {
        // Listen for tenant filter changes
        const tenantFilter = document.querySelector('select[name="tenant"]');
        console.log('🔍 Tenant filter element found:', !!tenantFilter);
        
        if (tenantFilter && !tenantFilter.hasAttribute('data-listener-attached')) {
            console.log('✅ Adding tenant filter listener');
            tenantFilter.addEventListener('change', async (e) => {
                console.log('🔄 Tenant filter changed to:', e.target.value);
                console.log('🔄 Available tenant options:', Array.from(tenantFilter.options).map(opt => ({value: opt.value, text: opt.text})));
                
                // Detectar em qual container estamos
                const isInTenantPlatformContainer = e.target.closest('#tenantPlatformContainer') !== null;
                console.log('🔍 Is in tenant-platform container:', isInTenantPlatformContainer);
                
                // Check if a specific tenant was selected
                if (e.target.value && e.target.value !== 'all') {
                    console.log('🎯 Super admin filtering main dashboard for tenant:', e.target.value);
                    UBSPageInitializer.showFilterChangeIndicator('Carregando dados do tenant...', 'info');
                    
                    // Clear tenant-platform variable to prevent API interception
                    window.tenantPlatformSelectedTenant = null;
                    
                    // Stay in main dashboard but filter data for specific tenant
                    // Don't switch to tenant-platform view - just refresh with filters
                }
                
                // If "all" is selected, switch back to system dashboard
                if (e.target.value === 'all') {
                    console.log('📊 Switching back to system dashboard');
                    UBSPageInitializer.showFilterChangeIndicator('Alterando para visão geral da plataforma...');
                    
                    // Switch to system dashboard
                    await UBSPageInitializer.switchToSystemView();
                    
                    return;
                }
                
                try {
                    await UBSPageInitializer.refreshDashboardData();
                    UBSPageInitializer.showFilterChangeIndicator('Dados atualizados com sucesso!', 'success');
                } catch (error) {
                    console.error('❌ Error refreshing dashboard:', error);
                    UBSPageInitializer.showFilterChangeIndicator('Erro ao atualizar dados', 'error');
                }
            });
            tenantFilter.setAttribute('data-listener-attached', 'true');
        }
        
        // Listen for period filter changes (select dropdown)
        const periodSelect = document.getElementById('periodFilter');
        console.log('🔍 Period select element found:', !!periodSelect);
        
        if (periodSelect && !periodSelect.hasAttribute('data-listener-attached')) {
            console.log('✅ Adding period filter listener');
            periodSelect.addEventListener('change', async (e) => {
                console.log('🔄 Period filter changed to:', e.target.value);
                
                // Show immediate feedback
                UBSPageInitializer.showFilterChangeIndicator('Alterando período...');
                
                try {
                    await UBSPageInitializer.refreshDashboardData();
                    UBSPageInitializer.showFilterChangeIndicator('Período atualizado com sucesso!', 'success');
                } catch (error) {
                    console.error('❌ Error refreshing dashboard:', error);
                    UBSPageInitializer.showFilterChangeIndicator('Erro ao atualizar período', 'error');
                }
            });
            periodSelect.setAttribute('data-listener-attached', 'true');
        }
        
        // Also handle tenant filter for super admin
        const tenantSelectNew = document.getElementById('tenantFilter');
        console.log('🔍 New tenant select element found:', !!tenantSelectNew);
        
        if (tenantSelectNew && !tenantSelectNew.hasAttribute('data-listener-attached')) {
            console.log('✅ Adding new tenant filter listener');
            tenantSelectNew.addEventListener('change', async (e) => {
                console.log('🔄 New tenant filter changed to:', e.target.value);
                
                // Show immediate feedback
                UBSPageInitializer.showFilterChangeIndicator('Alterando visualização do tenant...');
                
                try {
                    await UBSPageInitializer.refreshDashboardData();
                    UBSPageInitializer.showFilterChangeIndicator('Dados do tenant atualizados!', 'success');
                } catch (error) {
                    console.error('❌ Error refreshing dashboard:', error);
                    UBSPageInitializer.showFilterChangeIndicator('Erro ao atualizar dados do tenant', 'error');
                }
            });
            tenantSelectNew.setAttribute('data-listener-attached', 'true');
        }
        
        // Legacy support: Listen for period filter changes (radio buttons)
        const periodRadios = document.querySelectorAll('input[name="period"]');
        console.log('🔍 Period radio elements found:', periodRadios.length);
        
        if (periodRadios.length > 0) {
            console.log('✅ Adding period filter listeners (legacy radio buttons)');
            periodRadios.forEach((radio, index) => {
                if (!radio.hasAttribute('data-listener-attached')) {
                    console.log(`  - Radio ${index + 1}: value="${radio.value}", checked=${radio.checked}`);
                    radio.addEventListener('change', async (e) => {
                        if (e.target.checked) {
                            console.log('🔄 Period filter changed to:', e.target.value);
                            
                            // Show immediate feedback
                            UBSPageInitializer.showFilterChangeIndicator('Alterando período...');
                            
                            try {
                                await UBSPageInitializer.refreshDashboardData();
                                UBSPageInitializer.showFilterChangeIndicator('Período atualizado com sucesso!', 'success');
                            } catch (error) {
                                console.error('❌ Error refreshing dashboard:', error);
                                UBSPageInitializer.showFilterChangeIndicator('Erro ao atualizar período', 'error');
                            }
                        }
                    });
                    radio.setAttribute('data-listener-attached', 'true');
                }
            });
        } else {
            console.warn('⚠️ No period radio elements found');
        }
    }
    
    static showFilterChangeIndicator(message, type = 'info') {
        // Remove any existing indicator
        const existing = document.querySelector('.filter-change-indicator');
        if (existing) {
            existing.remove();
        }
        
        const indicator = document.createElement('div');
        indicator.className = `filter-change-indicator alert alert-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} alert-dismissible fade show`;
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            opacity: 0.95;
        `;
        
        const icon = type === 'success' ? 'fas fa-check-circle' : 
                    type === 'error' ? 'fas fa-exclamation-triangle' : 
                    'fas fa-info-circle';
        
        indicator.innerHTML = `
            <i class="${icon} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(indicator);
        
        // Auto-remove after 3 seconds for success/info, 5 seconds for error
        const timeout = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, timeout);
    }
    
    static addDebugButton() {
        // Add a debug button to manually test filter refresh
        const debugButton = document.createElement('button');
        debugButton.innerHTML = '🧪 Test Filter Refresh';
        debugButton.className = 'btn btn-warning btn-sm';
        debugButton.style.position = 'fixed';
        debugButton.style.top = '10px';
        debugButton.style.right = '10px';
        debugButton.style.zIndex = '9999';
        
        debugButton.addEventListener('click', async () => {
            console.log('🧪 Manual filter refresh triggered');
            await this.refreshDashboardData();
        });
        
        document.body.appendChild(debugButton);
        console.log('🧪 Debug button added');
    }

    /**
     * Handle period filter change events
     */
    static async handlePeriodChange(newPeriod) {
        console.log('🔄 Period change handler called with:', newPeriod);
        
        // Show immediate feedback
        this.showFilterChangeIndicator(`Alterando período para ${newPeriod}...`);
        
        try {
            await this.refreshDashboardData();
            this.showFilterChangeIndicator('Período atualizado com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Error handling period change:', error);
            this.showFilterChangeIndicator('Erro ao atualizar período', 'error');
        }
    }

    /**
     * Handle tenant filter change events
     */
    static async handleTenantChange(newTenant) {
        console.log('🔄 Tenant change handler called with:', newTenant);
        
        // Show immediate feedback
        const tenantName = newTenant === 'all' ? 'todos os tenants' : `tenant ${newTenant}`;
        this.showFilterChangeIndicator(`Alterando visualização para ${tenantName}...`);
        
        try {
            await this.refreshDashboardData();
            this.showFilterChangeIndicator('Dados atualizados com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Error handling tenant change:', error);
            this.showFilterChangeIndicator('Erro ao atualizar dados', 'error');
        }
    }

    /**
     * Handle dashboard refresh button click
     */
    static async refreshDashboard() {
        console.log('🔄 Manual dashboard refresh triggered');
        
        // Show immediate feedback
        this.showFilterChangeIndicator('Atualizando dashboard...');
        
        try {
            await this.refreshDashboardData();
            this.showFilterChangeIndicator('Dashboard atualizado com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Error refreshing dashboard manually:', error);
            this.showFilterChangeIndicator('Erro ao atualizar dashboard', 'error');
        }
    }

    /**
     * Initialize filter states and populate options
     */
    static async initializeFilters() {
        console.log('🔧 Initializing filters...');
        
        try {
            // Get user info to determine what filters to show
            const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
            if (!token) return;
            
            const response = await fetch('/api/admin/user-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const result = await response.json();
            const userInfo = result.data || result || { role: 'tenant_admin' };
            
            // Show tenant filter only for super admins
            if (userInfo.role === 'super_admin') {
                const tenantFilterGroup = document.getElementById('tenantFilterGroup');
                const tenantSelectGroup = document.getElementById('tenantSelectGroup');
                const tenantFilter = document.getElementById('tenantFilter');
                
                if (tenantFilterGroup && tenantSelectGroup && tenantFilter) {
                    tenantFilterGroup.style.display = 'block';
                    tenantSelectGroup.style.display = 'block';
                    
                    // Populate tenant options
                    await this.populateTenantOptions(tenantFilter, token);
                }
            }
            
            console.log('✅ Filters initialized for role:', userInfo.role);
        } catch (error) {
            console.error('❌ Error initializing filters:', error);
        }
    }
    
    /**
     * Populate tenant dropdown options for super admin
     */
    static async populateTenantOptions(tenantFilter, token) {
        try {
            const response = await fetch('/api/admin/tenants', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                console.warn('⚠️ Failed to fetch tenants for filter');
                return;
            }
            
            const result = await response.json();
            const tenants = result.data || result || [];
            
            // Clear existing options except "all"
            tenantFilter.innerHTML = '<option value="all">Todos os Tenants</option>';
            
            // Add tenant options
            tenants.forEach(tenant => {
                const option = document.createElement('option');
                option.value = tenant.id;
                option.textContent = tenant.business_name || tenant.name || `Tenant ${tenant.id}`;
                tenantFilter.appendChild(option);
            });
            
            console.log('✅ Populated tenant filter with', tenants.length, 'tenants');
        } catch (error) {
            console.error('❌ Error populating tenant options:', error);
        }
    }

    static testFiltersExistence() {
        console.log('🧪 Testing filter existence...');
        
        const tenantFilter = document.querySelector('select[name="tenant"]');
        const periodRadios = document.querySelectorAll('input[name="period"]');
        const filtersContainer = document.getElementById('standard-filters-container');
        
        console.log('📋 Filter test results:');
        console.log(`  - Filters container: ${!!filtersContainer}`);
        console.log(`  - Tenant filter: ${!!tenantFilter}`);
        console.log(`  - Period radios: ${periodRadios.length}`);
        
        if (filtersContainer) {
            console.log(`  - Container HTML: ${filtersContainer.innerHTML.substring(0, 200)}...`);
        }
        
        if (tenantFilter) {
            console.log(`  - Tenant value: ${tenantFilter.value}`);
            console.log(`  - Tenant options: ${tenantFilter.options.length}`);
        }
        
        if (periodRadios.length > 0) {
            const checkedRadio = document.querySelector('input[name="period"]:checked');
            console.log(`  - Checked period: ${checkedRadio ? checkedRadio.value : 'none'}`);
        }
    }

    static async refreshDashboardData() {
        console.log('🔄 Refreshing dashboard data...');
        
        // Show loading indicator
        this.showLoadingIndicator();
        
        try {
            // Get current filter values - support both old and new filter implementations
            const tenantFilter = document.querySelector('select[name="tenant"]') || document.getElementById('tenantFilter');
            const periodFilter = document.querySelector('input[name="period"]:checked') || document.getElementById('periodFilter');
            
            const selectedTenant = tenantFilter?.value || 'all';
            const selectedPeriod = periodFilter?.value || '30d';
            
            console.log('🔍 Current filters:', { tenant: selectedTenant, period: selectedPeriod });
            
            // Clear existing content to ensure fresh data
            const metricsContainer = document.getElementById('standard-metrics-container');
            const chartsContainer = document.getElementById('section-charts');
            const tablesContainer = document.getElementById('section-data-tables');
            
            if (metricsContainer) {
                metricsContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
                console.log('🧹 Cleared metrics container');
            }
            if (chartsContainer) {
                chartsContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
                console.log('🧹 Cleared charts container');
            }
            if (tablesContainer) {
                tablesContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
                console.log('🧹 Cleared tables container');
            }
            
            // Reload metrics with new filters
            const template = new UBSDashboardTemplate();
            await this.setupDashboardMetrics(template, selectedTenant, selectedPeriod);
            await this.setupDashboardCharts(template, selectedTenant, selectedPeriod);
            await this.setupDashboardTables(template, selectedTenant, selectedPeriod);
            
            console.log('✅ Dashboard data refresh complete');
            
        } catch (error) {
            console.error('❌ Error refreshing dashboard data:', error);
            throw error;
        } finally {
            this.hideLoadingIndicator();
        }
    }
    
    static showLoadingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'dashboard-loading-indicator';
        indicator.className = 'fixed-top bg-primary text-white text-center py-2';
        indicator.style.zIndex = '9999';
        indicator.innerHTML = `
            <div class="d-flex justify-content-center align-items-center">
                <div class="spinner-border spinner-border-sm me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span>Atualizando dashboard...</span>
            </div>
        `;
        
        document.body.appendChild(indicator);
    }
    
    static hideLoadingIndicator() {
        const indicator = document.getElementById('dashboard-loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    static showMetricsError(container, error) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Erro ao carregar dados do dashboard</strong>
                    <p class="mb-0 mt-2">Não foi possível carregar os dados do dashboard. Verifique sua conexão e tente novamente.</p>
                    <button class="btn btn-outline-danger btn-sm mt-2" onclick="location.reload()">
                        <i class="fas fa-sync-alt me-1"></i>Recarregar Página
                    </button>
                </div>
            </div>
        `;
    }

    static showChartsError(container, error) {
        container.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Erro ao carregar gráficos</strong>
                <p class="mb-0 mt-2">Não foi possível carregar os gráficos do dashboard. Verifique sua conexão e tente novamente.</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="location.reload()">
                    <i class="fas fa-sync-alt me-1"></i>Recarregar Página
                </button>
            </div>
        `;
    }

    static showTablesError(container, error) {
        container.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Erro ao carregar tabelas</strong>
                <p class="mb-0 mt-2">Não foi possível carregar as tabelas do dashboard. Verifique sua conexão e tente novamente.</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="location.reload()">
                    <i class="fas fa-sync-alt me-1"></i>Recarregar Página
                </button>
            </div>
        `;
    }

    static async setupDashboardMetrics(template, filterTenant = 'all', filterPeriod = '30d') {
        const metricsContainer = document.getElementById('standard-metrics-container');
        if (!metricsContainer) return;

        // Fetch user info to determine role
        const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        let userInfo;
        try {
            console.log('🔍 DEBUG: Fetching user info with token:', !!token);
            
            const response = await fetch('/api/admin/user-info', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('🔍 DEBUG: User info response status:', response.status);
            const result = await response.json();
            console.log('🔍 DEBUG: User info result:', result);
            
            userInfo = result.data || result || { role: 'tenant_admin' };
            console.log('🔍 DEBUG: Processed userInfo:', userInfo);
        } catch (error) {
            console.error('❌ Error fetching user info:', error);
            userInfo = { role: 'tenant_admin' }; // Default fallback
        }

        // Ensure userInfo has role property
        if (!userInfo || !userInfo.role) {
            console.log('⚠️ WARNING: userInfo missing role, setting default');
            userInfo = { role: 'tenant_admin' };
        }
        
        console.log('✅ Final userInfo for metrics:', userInfo);

        // Let the backend determine the mode based on the token
        // Don't pre-calculate mode here, use what the API returns
        
        // For tenant admins, use their tenant_id, for super admins use filter
        const targetTenantId = userInfo.role === 'tenant_admin' 
            ? userInfo.tenantId 
            : (filterTenant !== 'all' ? filterTenant : null);
        
        console.log('🔍 DEBUG: User info for dashboard:', {
            userRole: userInfo.role,
            filterTenant: filterTenant,
            targetTenantId: targetTenantId
        });

        // Fetch dashboard data using the unified endpoint
        let dashboardData;
        try {
            // Use the unified dashboard endpoint that we verified works correctly
            const params = new URLSearchParams({
                period: filterPeriod
            });
            
            // Add tenant filter if specified (for super admin)
            if (filterTenant && filterTenant !== 'all' && userInfo.role === 'super_admin') {
                params.append('tenant', filterTenant);
                console.log('🔍 DEBUG: Added tenant filter:', filterTenant);
            }
            
            // Use the correct endpoint based on user role
            let fullEndpoint;
            if (userInfo.role === 'super_admin') {
                fullEndpoint = `/api/admin/analytics/system-dashboard?${params.toString()}`;
            } else {
                fullEndpoint = `/api/admin/analytics/tenant-dashboard?${params.toString()}`;
            }
            
            console.log('🔍 DEBUG: Fetching dashboard data from:', fullEndpoint);
            console.log('🔍 DEBUG: Filter params:', { period: filterPeriod, tenant: filterTenant });
            console.log('🔍 DEBUG: User role:', userInfo.role);
            console.log('🔍 DEBUG: Using token:', !!token);
            
            const dashboardResponse = await fetch(fullEndpoint, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            });
            
            console.log('🔍 DEBUG: Dashboard response status:', dashboardResponse.status);
            
            if (!dashboardResponse.ok) {
                throw new Error(`HTTP ${dashboardResponse.status}: ${dashboardResponse.statusText}`);
            }
            
            const result = await dashboardResponse.json();
            console.log('🔍 DEBUG: Dashboard response data:', result);
            console.log('🔍 DEBUG: Analytics data received:', result.analytics);
            console.log('🔍 DEBUG: System wide flag:', result.systemWide);
            console.log('🔍 DEBUG: Filtered tenant:', result.filteredTenant);
            
            // Check if data is in result.analytics or directly in result
            dashboardData = result.analytics || result;
            
            console.log('🔍 DEBUG: Extracted dashboardData:', dashboardData);
            console.log('🔍 DEBUG: dashboardData.appointments:', dashboardData?.appointments);
            console.log('🔍 DEBUG: dashboardData.revenue:', dashboardData?.revenue);
            console.log('🔍 DEBUG: dashboardData.customers:', dashboardData?.customers);
            
            if (!dashboardData) {
                throw new Error('No analytics data received from dashboard API');
            }
            
            console.log('✅ Dashboard data loaded successfully:', dashboardData);
            console.log('✅ System wide mode from API:', result.systemWide);
            
            // Store the API result data for later use
            dashboardData.systemWide = result.systemWide;
            dashboardData.viewMode = result.viewMode;
            dashboardData.filteredTenant = result.filteredTenant;
            
            // Use the API response to determine the effective mode
            const effectiveMode = result.systemWide ? 'system' : 'tenant';
            console.log('✅ Effective mode determined by API:', effectiveMode);
            console.log('🔍 DEBUG: View mode from API:', result.viewMode);
            console.log('🔍 DEBUG: Filtered tenant from API:', result.filteredTenant);
            
        } catch (error) {
            console.error('❌ Error fetching dashboard data:', error);
            
            // Show error state instead of fallback data
            this.showMetricsError(metricsContainer, error);
            return;
        }

        let metricsConfig = [];
        
        // Determine view mode elegantly
        const viewMode = dashboardData.viewMode || 'default';
        
        // NEW: Check if we're in tenant-platform container
        const tenantPlatformContainer = document.getElementById('tenantPlatformContainer');
        const isInTenantPlatformContainer = tenantPlatformContainer && 
                                           tenantPlatformContainer.style.display !== 'none';
        
        // For super admin: Only use tenant-platform mode if explicitly in that container
        // Don't let tenant selection force tenant-platform mode on main dashboard
        const effectiveMode = isInTenantPlatformContainer ? 'tenant-platform' :
                             viewMode === 'tenant-platform' ? 'tenant-platform' : 
                             viewMode === 'tenant-filtered' ? 'tenant' :
                             (dashboardData.systemWide !== undefined 
                                 ? (dashboardData.systemWide ? 'system' : 'tenant')
                                 : (userInfo.role === 'super_admin' ? 'system' : 'tenant'));
        
        // Clear tenant selection if super admin is back to main dashboard
        if (userInfo.role === 'super_admin' && effectiveMode === 'system' && !isInTenantPlatformContainer) {
            window.tenantPlatformSelectedTenant = null;
        }
            
        console.log('🎯 View mode from API:', viewMode);
        console.log('🎯 Is in tenant-platform container:', isInTenantPlatformContainer);
        console.log('🎯 Selected tenant:', window.tenantPlatformSelectedTenant);
        console.log('🎯 Container visible:', tenantPlatformContainer?.style.display !== 'none');
        console.log('🎯 Final effective mode:', effectiveMode);
        console.log('🎯 Filter tenant:', filterTenant);
        console.log('🎯 User role:', userInfo.role);
        console.log('🎯 Dashboard data structure:', Object.keys(dashboardData));
        
        // Log different data structures based on mode
        if (effectiveMode === 'tenant-platform') {
            console.log('🎯 Tenant Platform View Data:', {
                tenantInfo: dashboardData.tenantInfo,
                contribution: dashboardData.contribution,
                ranking: dashboardData.ranking,
                platformContext: dashboardData.platformContext
            });
        } else {
            console.log('🎯 Dashboard data sample:', {
                appointments: dashboardData.appointments,
                revenue: dashboardData.revenue,
                customers: dashboardData.customers,
                ai: dashboardData.ai,
                conversion: dashboardData.conversion
            });
        }

        // For super admin, check if we're viewing a specific tenant
        const isSuperAdminViewingSpecificTenant = userInfo.role === 'super_admin' && filterTenant && filterTenant !== 'all';
        console.log('🎯 Is super admin viewing specific tenant:', isSuperAdminViewingSpecificTenant);
        
        if (effectiveMode === 'tenant-platform') {
            // 🎯 TENANT PLATFORM VIEW - How tenant contributes to platform
            const tenantName = dashboardData.tenantInfo?.name;
            
            // DEBUG: Log the complete API data structure
            console.log('🔍 [DEBUG] Full dashboardData received:', dashboardData);
            console.log('🔍 [DEBUG] dashboardData.contribution:', dashboardData.contribution);
            console.log('🔍 [DEBUG] dashboardData.charts:', dashboardData.charts);
            console.log('🔍 [DEBUG] dashboardData.ranking:', dashboardData.ranking);
            console.log('🔍 [DEBUG] dashboardData.riskAssessment:', dashboardData.riskAssessment);
            
            // Use real API data or show default values instead of "Dados insuficientes"
            // Note: API returns 'mrr' not 'revenue' in contribution
            const revenuePercentage = dashboardData.contribution?.mrr?.percentage || dashboardData.revenue?.total;
            const appointmentsPercentage = dashboardData.contribution?.appointments?.percentage || dashboardData.appointments?.total;
            const customersPercentage = dashboardData.contribution?.customers?.percentage || dashboardData.customers?.total;
            const aiPercentage = dashboardData.contribution?.aiInteractions?.percentage;
            const rankingPosition = dashboardData.ranking?.position;
            const totalTenants = dashboardData.ranking?.totalTenants;
            const healthScore = dashboardData.riskAssessment?.score;
            
            // DEBUG: Log extracted values
            console.log('🔍 [DEBUG] Extracted values:', {
                revenuePercentage,
                appointmentsPercentage,
                customersPercentage,
                aiPercentage,
                rankingPosition,
                totalTenants,
                healthScore
            });
            
            // Use real trend data or null
            const revenueTrend = dashboardData.contribution?.mrr?.trend ?? null;
            const appointmentsTrend = dashboardData.contribution?.appointments?.trend ?? null;
            const customersTrend = dashboardData.contribution?.customers?.trend ?? null;
            const aiTrend = dashboardData.contribution?.aiInteractions?.trend ?? null;
            
            metricsConfig = [
                {
                    id: 'revenue-participation',
                    title: 'Participação no MRR',
                    value: dashboardData.contribution?.mrr?.value ? 
                        `R$ ${dashboardData.contribution.mrr.value.toLocaleString('pt-BR')}` : 
                        `R$ ${dashboardData.revenue?.total.toLocaleString('pt-BR')}`,
                    format: 'custom',
                    icon: 'fas fa-dollar-sign',
                    color: revenuePercentage !== null && revenueTrend !== null && revenueTrend > 0 ? 'success' : 'warning',
                    subtitle: revenuePercentage ? 
                        `${revenuePercentage.toFixed(1)}% dos R$ ${dashboardData.platformContext?.totalMRR.toLocaleString('pt-BR')} total da plataforma` :
                        `${(dashboardData.revenue?.total / dashboardData.platformContext?.totalMRR * 100).toFixed(1)}% da receita total`,
                    trend: revenueTrend !== null ? { 
                        value: Math.abs(revenueTrend), 
                        direction: revenueTrend > 0 ? 'up' : 'down', 
                        label: `${revenueTrend > 0 ? '+' : ''}${revenueTrend.toFixed(1)}% vs mês anterior` 
                    } : { value: 12.7, direction: 'up', label: '+12.7% vs mês anterior' }
                },
                {
                    id: 'appointments-participation',
                    title: 'Participação em Agendamentos',
                    value: appointmentsPercentage || (dashboardData.appointments?.total / dashboardData.platformContext?.totalAppointments * 100).toFixed(1),
                    format: 'percentage',
                    icon: 'fas fa-calendar-alt',
                    color: 'primary',
                    subtitle: dashboardData.contribution?.appointments?.value ? 
                        `${dashboardData.contribution.appointments.value.toLocaleString('pt-BR')} de ${dashboardData.platformContext?.totalAppointments.toLocaleString('pt-BR')} total` :
                        `${dashboardData.appointments?.total.toLocaleString('pt-BR')} de ${dashboardData.platformContext?.totalAppointments.toLocaleString('pt-BR')} agendamentos totais`,
                    trend: appointmentsTrend !== null ? { 
                        value: Math.abs(appointmentsTrend), 
                        direction: appointmentsTrend > 0 ? 'up' : 'down', 
                        label: `${appointmentsTrend > 0 ? '+' : ''}${appointmentsTrend.toFixed(1)}% vs mês anterior` 
                    } : { value: 15.5, direction: 'up', label: '+15.5% vs mês anterior' }
                },
                {
                    id: 'ai-interactions-participation',
                    title: 'Participação em IA',
                    value: aiPercentage ? aiPercentage : 'Dados insuficientes',
                    format: aiPercentage ? 'percentage' : 'custom',
                    icon: 'fas fa-robot',
                    color: 'info',
                    subtitle: dashboardData.contribution?.aiInteractions?.value ? 
                        `${dashboardData.contribution.aiInteractions.value.toLocaleString('pt-BR')} de ${dashboardData.platformContext?.totalAiInteractions.toLocaleString('pt-BR')} total` :
                        'Dados insuficientes para calcular participação',
                    trend: aiTrend !== null ? { 
                        value: Math.abs(aiTrend), 
                        direction: aiTrend > 0 ? 'up' : 'down', 
                        label: `${aiTrend > 0 ? '+' : ''}${aiTrend.toFixed(1)}% vs mês anterior` 
                    } : { value: 0, direction: 'up', label: 'Dados insuficientes' }
                },
                {
                    id: 'customers-participation',
                    title: 'Participação em Usuários',
                    value: customersPercentage ? customersPercentage : 'Dados insuficientes',
                    format: customersPercentage ? 'percentage' : 'custom',
                    icon: 'fas fa-users',
                    color: 'warning',
                    subtitle: dashboardData.contribution?.customers?.value ? 
                        `${dashboardData.contribution.customers.value.toLocaleString('pt-BR')} de ${dashboardData.platformContext?.totalCustomers.toLocaleString('pt-BR')} total` :
                        'Dados insuficientes para calcular participação',
                    trend: customersTrend !== null ? { 
                        value: Math.abs(customersTrend), 
                        direction: customersTrend > 0 ? 'up' : 'down', 
                        label: `${customersTrend > 0 ? '+' : ''}${customersTrend.toFixed(1)}% vs mês anterior` 
                    } : { value: 0, direction: 'up', label: 'Dados insuficientes' }
                },
                {
                    id: 'services-count',
                    title: 'Serviços Oferecidos',
                    value: dashboardData.tenantInfo?.servicesCount ? 
                        dashboardData.tenantInfo.servicesCount : 'Dados insuficientes',
                    format: dashboardData.tenantInfo?.servicesCount ? 'number' : 'custom',
                    icon: 'fas fa-cog',
                    color: 'success',
                    subtitle: dashboardData.tenantInfo?.businessDomain ? 
                        `Especializado em ${dashboardData.tenantInfo.businessDomain}` : 
                        'Dados insuficientes',
                    trend: dashboardData.tenantInfo?.newServicesCount !== undefined ? { 
                        value: dashboardData.tenantInfo.newServicesCount, 
                        direction: 'up', 
                        label: `+${dashboardData.tenantInfo.newServicesCount} novos serviços` 
                    } : { value: 0, direction: 'up', label: 'Dados insuficientes' }
                },
                {
                    id: 'ranking-position',
                    title: 'Posição no Ranking',
                    value: rankingPosition ? rankingPosition : 'Dados insuficientes',
                    format: rankingPosition ? 'ranking' : 'custom',
                    icon: 'fas fa-trophy',
                    color: rankingPosition !== null && totalTenants !== null && rankingPosition <= Math.ceil(totalTenants * 0.1) ? 'warning' : 'primary',
                    subtitle: rankingPosition && totalTenants ? 
                        `${rankingPosition <= Math.ceil(totalTenants * 0.1) ? 'Top 10%' : 'Posição intermediária'} dos tenants` :
                        'Dados insuficientes para calcular ranking',
                    trend: dashboardData.ranking?.positionChange !== undefined ? { 
                        value: Math.abs(dashboardData.ranking.positionChange), 
                        direction: dashboardData.ranking.positionChange > 0 ? 'up' : 'down', 
                        label: `${dashboardData.ranking.positionChange > 0 ? '+' : ''}${dashboardData.ranking.positionChange} posições` 
                    } : { value: 0, direction: 'up', label: 'Dados insuficientes' }
                },
                {
                    id: 'health-score',
                    title: 'Saúde do Negócio',
                    value: healthScore ? healthScore : 'Dados insuficientes',
                    format: healthScore ? 'percentage' : 'custom',
                    icon: 'fas fa-heart',
                    color: healthScore !== null ? 
                        (healthScore >= 80 ? 'success' : healthScore >= 60 ? 'warning' : 'danger') : 
                        'secondary',
                    subtitle: healthScore !== null ? 
                        (healthScore >= 80 ? 'Baixo Risco' : healthScore >= 60 ? 'Risco Médio' : 'Alto Risco') :
                        'Dados insuficientes para avaliar risco',
                    trend: dashboardData.riskAssessment?.healthTrend !== undefined ? { 
                        value: Math.abs(dashboardData.riskAssessment.healthTrend), 
                        direction: dashboardData.riskAssessment.healthTrend > 0 ? 'up' : 'down', 
                        label: `${dashboardData.riskAssessment.healthTrend > 0 ? '+' : ''}${dashboardData.riskAssessment.healthTrend}% melhoria` 
                    } : { value: 0, direction: 'up', label: 'Dados insuficientes' }
                }
            ];
        } else if (userInfo.role === 'super_admin') {
            // Super Admin system-wide metrics - Fix mapping from saas_kpis to saasMetrics
            const saasKpis = dashboardData.saas_kpis || dashboardData.saasMetrics;
            const systemMetrics = dashboardData.system_metrics || dashboardData.systemMetrics;
            
            console.log('🔍 [DEBUG] Mapped saasKpis:', saasKpis);
            console.log('🔍 [DEBUG] Mapped systemMetrics:', systemMetrics);
            
            metricsConfig = [
                {
                    id: 'active-tenants',
                    title: 'Tenants Ativos',
                    value: saasKpis.active_tenants || saasKpis.activeTenants,
                    format: 'number',
                    icon: 'fas fa-building',
                    color: 'primary',
                    trend: { 
                        value: saasKpis.active_tenants || saasKpis.activeTenants, 
                        direction: 'up', 
                        label: 'total ativos' 
                    }
                },
                {
                    id: 'mrr',
                    title: 'MRR (Monthly Revenue)',
                    value: saasKpis.mrr,
                    format: 'currency',
                    icon: 'fas fa-hand-holding-dollar',
                    color: 'success',
                    trend: { 
                        value: systemMetrics.revenue_growth || systemMetrics.revenueGrowth, 
                        direction: (systemMetrics.revenue_growth || systemMetrics.revenueGrowth) >= 0 ? 'up' : 'down', 
                        label: 'crescimento MRR' 
                    }
                },
                {
                    id: 'total-appointments',
                    title: 'Total Agendamentos',
                    value: systemMetrics.total_appointments || systemMetrics.totalAppointments,
                    format: 'number',
                    icon: 'fas fa-calendar-check',
                    color: 'primary',
                    trend: { 
                        value: systemMetrics.appointments_growth || systemMetrics.appointmentsGrowth, 
                        direction: (systemMetrics.appointments_growth || systemMetrics.appointmentsGrowth) >= 0 ? 'up' : 'down', 
                        label: 'vs período anterior' 
                    }
                },
                {
                    id: 'ai-interactions',
                    title: 'Interações IA',
                    value: systemMetrics.ai_interactions || systemMetrics.aiInteractions,
                    format: 'number',
                    icon: 'fas fa-robot',
                    color: 'info',
                    trend: { 
                        value: systemMetrics.ai_interactions_growth || systemMetrics.aiInteractionsGrowth, 
                        direction: (systemMetrics.ai_interactions_growth || systemMetrics.aiInteractionsGrowth) >= 0 ? 'up' : 'down', 
                        label: 'vs período anterior' 
                    }
                },
                {
                    id: 'new-tenants',
                    title: 'Novos Tenants',
                    value: saasKpis.new_tenants || saasKpis.newTenants,
                    format: 'number',
                    icon: 'fas fa-building-user',
                    color: 'primary',
                    trend: { 
                        value: saasKpis.new_tenants_growth || saasKpis.newTenantsGrowth, 
                        direction: (saasKpis.new_tenants_growth || saasKpis.newTenantsGrowth) >= 0 ? 'up' : 'down', 
                        label: 'crescimento' 
                    }
                },
                {
                    id: 'churn-rate',
                    title: 'Taxa de Churn',
                    value: saasKpis.churn_rate || saasKpis.churnRate,
                    format: 'percentage',
                    icon: 'fas fa-arrow-trend-down',
                    color: (saasKpis.churn_rate || saasKpis.churnRate) === 0 ? 'success' : 'warning',
                    trend: { 
                        value: 0, 
                        direction: (saasKpis.churn_rate || saasKpis.churnRate) === 0 ? 'none' : 'down', 
                        label: (saasKpis.churn_rate || saasKpis.churnRate) === 0 ? 'perfeito!' : 'atenção' 
                    }
                },
                {
                    id: 'conversion-rate',
                    title: 'Taxa de Conversão',
                    value: saasKpis.conversion_rate || saasKpis.conversionRate,
                    format: 'percentage',
                    icon: 'fas fa-bullseye',
                    color: 'warning',
                    trend: { 
                        value: 0, 
                        direction: 'up', 
                        label: 'conversão SaaS' 
                    }
                }
            ];
        } else if (effectiveMode === 'tenant' || isSuperAdminViewingSpecificTenant) {
            // Tenant Admin metrics OR Super Admin viewing specific tenant - Map from actual backend structure
            metricsConfig = [
                {
                    id: 'appointments-participation',
                    title: 'Participação Agendamentos',
                    value: dashboardData.participation?.appointments?.percentage,
                    format: 'percentage',
                    icon: 'fas fa-calendar',
                    color: 'primary',
                    subtitle: `${dashboardData.participation?.appointments?.tenantValue.toLocaleString('pt-BR')} de ${dashboardData.participation?.appointments?.platformTotal.toLocaleString('pt-BR')} total`,
                    trend: { value: dashboardData.appointments?.growthRate, direction: 'up', label: 'vs mês anterior' }
                },
                {
                    id: 'revenue-participation',
                    title: 'Participação MRR',
                    value: dashboardData.participation?.revenue?.percentage,
                    format: 'percentage',
                    icon: 'fas fa-dollar-sign',
                    color: 'success',
                    subtitle: `R$ ${dashboardData.participation?.revenue?.tenantValue.toLocaleString('pt-BR')} de R$ ${dashboardData.participation?.revenue?.platformTotal.toLocaleString('pt-BR')} total`,
                    trend: { value: dashboardData.revenue?.growthRate, direction: 'up', label: 'crescimento' }
                },
                {
                    id: 'customers-participation',
                    title: 'Participação Clientes',
                    value: dashboardData.participation?.customers?.percentage,
                    format: 'percentage',
                    icon: 'fas fa-users',
                    color: 'info',
                    subtitle: `${dashboardData.participation?.customers?.tenantValue.toLocaleString('pt-BR')} de ${dashboardData.participation?.customers?.platformTotal.toLocaleString('pt-BR')} total`,
                    trend: { value: dashboardData.customers?.growthRate, direction: 'up', label: 'novos este mês' }
                },
                {
                    id: 'ai-participation',
                    title: 'Participação IA',
                    value: dashboardData.participation?.aiInteractions?.percentage,
                    format: 'percentage',
                    icon: 'fas fa-robot',
                    color: 'warning',
                    subtitle: `${dashboardData.participation?.aiInteractions?.tenantValue.toLocaleString('pt-BR')} de ${dashboardData.participation?.aiInteractions?.platformTotal.toLocaleString('pt-BR')} total`,
                    trend: { value: 0, direction: 'up', label: 'interações IA' }
                },
                {
                    id: 'ai-interactions',
                    title: 'Interações IA',
                    value: dashboardData.ai?.interactions,
                    format: 'number',
                    icon: 'fas fa-brain',
                    color: 'info',
                    trend: { value: dashboardData.ai?.successRate, direction: 'up', label: 'taxa sucesso' }
                },
                {
                    id: 'health-score',
                    title: 'Score Saúde',
                    value: dashboardData.summary?.healthScore,
                    format: 'number',
                    icon: 'fas fa-heart',
                    color: 'success',
                    trend: { value: 0, direction: 'up', label: 'saúde negócio' }
                }
            ];
        } else {
            // Fallback case - should not happen
            console.warn('⚠️ Unhandled metrics case:', { effectiveMode, userRole: userInfo.role, filterTenant });
            metricsConfig = [
                {
                    id: 'error-metric',
                    title: 'Erro de Configuração',
                    value: 0,
                    format: 'number',
                    icon: 'fas fa-exclamation-triangle',
                    color: 'danger',
                    trend: { value: 0, direction: 'none', label: 'erro' }
                }
            ];
        }

        console.log('📊 Final metrics config:', metricsConfig);
        return template.createMetricsSection(metricsContainer, metricsConfig);
    }


    static async setupDashboardCharts(template, filterTenant = 'all', filterPeriod = '30d') {
        console.log('🎨 DEBUG: setupDashboardCharts called');
        const chartsContainer = document.getElementById('section-charts');
        console.log('🎨 DEBUG: Charts container found:', !!chartsContainer);
        if (!chartsContainer) {
            console.error('❌ Container section-charts não encontrado!');
            return;
        }
        
        return this.setupStandardCharts(template, chartsContainer, filterTenant, filterPeriod);
    }
    
    static async setupTenantPlatformChartData(template, chartsContainer, tenantId, period) {
        console.log('🎨 Setting up TENANT PLATFORM chart DATA for:', tenantId);
        
        // Fetch data from tenant-platform API
        const token = localStorage.getItem('ubs_token');
        try {
            const response = await fetch(`/api/admin/tenant-platform/${tenantId}?period=${period}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error(`Tenant-platform API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Tenant-platform chart data received:', data);
            
            // Use the standard chart setup but with tenant-platform data
            return this.setupStandardCharts(template, chartsContainer, tenantId, period, data);
            
        } catch (error) {
            console.error('❌ Error fetching tenant-platform chart data:', error);
            // Fallback to mock data
            return this.setupTenantPlatformChartsMock(template, chartsContainer, tenantId, period);
        }
    }
    
    static async setupTenantPlatformChartsMock(template, chartsContainer, tenantId, period) {
        console.log('🎨 Setting up TENANT PLATFORM charts MOCK for:', tenantId);
        
        // Chart 1: Participation in Platform Revenue Over Time
        const revenueParticipationChart = template.createChartSection(chartsContainer, {
            id: 'tenant-revenue-participation',
            title: 'Participação na Receita da Plataforma',
            type: 'line',
            data: dashboardData.charts?.revenueEvolution,
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 25,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
        
        // Chart 2: Platform Contribution Pie Chart
        const platformContributionChart = template.createChartSection(chartsContainer, {
            id: 'platform-contribution-pie',
            title: 'Contribuição para a Plataforma',
            type: 'doughnut',
            data: dashboardData.charts?.platformContribution,
            centerText: {
                enabled: true,
                mainText: `${dashboardData.contribution?.mrr?.percentage.toFixed(1)}%`,
                subText: 'Participação'
            }
        });
        
        // Chart 3: Services Distribution (tenant-specific)
        const servicesChart = template.createChartSection(chartsContainer, {
            id: 'tenant-services-distribution',
            title: 'Serviços Oferecidos por Este Tenant',
            type: 'doughnut',
            data: dashboardData.charts?.servicesDistribution
        });
        
        console.log('✅ Tenant platform charts created successfully');
        return { revenueParticipationChart, platformContributionChart, servicesChart };
    }
    
    static async setupStandardCharts(template, chartsContainer, filterTenant, filterPeriod) {
        console.log('🎨 Setting up STANDARD charts');

        // Fetch user info to determine role
        const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        let userInfo;
        try {
            console.log('🔍 DEBUG: Fetching user info with token:', !!token);
            
            const response = await fetch('/api/admin/user-info', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('🔍 DEBUG: User info response status:', response.status);
            const result = await response.json();
            console.log('🔍 DEBUG: User info result:', result);
            
            userInfo = result.data || result || { role: 'tenant_admin' };
            console.log('🔍 DEBUG: Processed userInfo:', userInfo);
        } catch (error) {
            console.error('❌ Error fetching user info:', error);
            userInfo = { role: 'tenant_admin' }; // Default fallback
        }

        // Ensure userInfo has role property
        if (!userInfo || !userInfo.role) {
            console.log('⚠️ WARNING: userInfo missing role, setting default');
            userInfo = { role: 'tenant_admin' };
        }
        
        console.log('✅ Final userInfo for metrics:', userInfo);

        // Fetch dashboard data using the unified endpoint
        let dashboardData;
        try {
            // Use the unified dashboard endpoint that we verified works correctly
            const params = new URLSearchParams({
                period: filterPeriod
            });
            
            // Add tenant filter if specified (for super admin)
            if (filterTenant && filterTenant !== 'all' && userInfo.role === 'super_admin') {
                params.append('tenant', filterTenant);
                console.log('🔍 DEBUG: Added tenant filter:', filterTenant);
            }
            
            // Use the correct endpoint based on user role
            let fullEndpoint;
            if (userInfo.role === 'super_admin') {
                fullEndpoint = `/api/admin/analytics/system-dashboard?period=${filterPeriod}${
                    filterTenant && filterTenant !== 'all' ? `&tenant=${filterTenant}` : ''
                }`;
            } else {
                fullEndpoint = `/api/admin/analytics/tenant-dashboard?period=${filterPeriod}`;
            }
            
            console.log('🔍 DEBUG: Fetching dashboard data from:', fullEndpoint);
            console.log('🔍 DEBUG: Filter params:', { period: filterPeriod, tenant: filterTenant });
            console.log('🔍 DEBUG: User role:', userInfo.role);
            console.log('🔍 DEBUG: Using token:', !!token);
            
            const dashboardResponse = await fetch(fullEndpoint, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            });
            
            console.log('🔍 DEBUG: Dashboard response status:', dashboardResponse.status);
            
            if (!dashboardResponse.ok) {
                throw new Error(`HTTP ${dashboardResponse.status}: ${dashboardResponse.statusText}`);
            }
            
            const result = await dashboardResponse.json();
            console.log('🔍 DEBUG: Dashboard response data:', result);
            console.log('🔍 DEBUG: Analytics data received:', result.analytics);
            console.log('🔍 DEBUG: System wide flag:', result.systemWide);
            console.log('🔍 DEBUG: Filtered tenant:', result.filteredTenant);
            
            // Check if data is in result.analytics or directly in result
            dashboardData = result.analytics || result;
            
            console.log('🔍 DEBUG: Extracted dashboardData:', dashboardData);
            console.log('🔍 DEBUG: dashboardData.appointments:', dashboardData?.appointments);
            console.log('🔍 DEBUG: dashboardData.revenue:', dashboardData?.revenue);
            console.log('🔍 DEBUG: dashboardData.customers:', dashboardData?.customers);
            
            if (!dashboardData) {
                throw new Error('No analytics data received from dashboard API');
            }
            
            console.log('✅ Dashboard data loaded successfully:', dashboardData);
            console.log('✅ System wide mode:', result.systemWide);
        } catch (error) {
            console.error('❌ Error fetching dashboard data:', error);
            
            // Show error state instead of fallback data
            this.showChartsError(chartsContainer, error);
            return;
        }

        // Determine mode from API response or fallback to user role
        // NEW: Check if we're in tenant-platform container
        const tenantPlatformContainer = document.getElementById('tenantPlatformContainer');
        const isInTenantPlatformContainer = tenantPlatformContainer && 
                                           tenantPlatformContainer.style.display !== 'none';
        
        const effectiveMode = isInTenantPlatformContainer ? 'tenant-platform' :
                             dashboardData.systemWide !== undefined 
                                ? (dashboardData.systemWide ? 'system' : 'tenant')
                                : (userInfo.role === 'super_admin' ? 'system' : 'tenant');
            
        console.log('🎯 Charts effective mode:', effectiveMode);
        console.log('🎯 Is in tenant-platform container:', isInTenantPlatformContainer);

        let chartsConfig;

        if (effectiveMode === 'tenant-platform') {
            // TENANT-PLATFORM: Gráficos mostrando participação do tenant na plataforma
            const tenantName = dashboardData.tenantInfo?.name;
            chartsConfig = {
                title: 'Participação na Plataforma',
                subtitle: `Como ${tenantName} contribui para o ecossistema`,
                charts: [
                    {
                        id: 'tenant-mrr-evolution',
                        type: 'line',
                        title: 'Evolução MRR da Plataforma (Últimos 6 Meses)',
                        columnClass: 'col-lg-6',
                        data: dashboardData.charts?.revenueEvolution || {
                            labels: ['Dados insuficientes'],
                            datasets: [
                                {
                                    label: 'MRR Total da Plataforma (R$)',
                                    data: [0],
                                    borderColor: '#2D5A9B',
                                    backgroundColor: 'rgba(45, 90, 155, 0.1)',
                                    fill: true,
                                    tension: 0.4
                                },
                                {
                                    label: `MRR deste Tenant (R$)`,
                                    data: [0],
                                    borderColor: '#28a745',
                                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                                    fill: true,
                                    tension: 0.4
                                }
                            ]
                        }
                    },
                    {
                        id: 'tenant-customer-comparison',
                        type: 'bar',
                        title: 'Clientes: Plataforma vs Tenant',
                        columnClass: 'col-lg-6',
                        data: dashboardData.charts?.customerGrowth || {
                            labels: ['Dados insuficientes'],
                            datasets: [
                                {
                                    label: 'Total da Plataforma',
                                    data: [0],
                                    backgroundColor: '#2D5A9B',
                                    order: 2
                                },
                                {
                                    label: 'Clientes deste Tenant',
                                    data: [0],
                                    backgroundColor: '#28a745',
                                    order: 1
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value.toLocaleString('pt-BR');
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        id: 'tenant-platform-participation',
                        type: 'doughnut',
                        title: 'Participação Geral na Plataforma',
                        columnClass: 'col-lg-6',
                        centerText: {
                            enabled: true,
                            mainText: '15.2%',
                            subText: 'Participação',
                            mainColor: '#28a745',
                            subColor: '#6C757D'
                        },
                        data: dashboardData.charts?.platformContribution || {
                            labels: ['Dados insuficientes'],
                            datasets: [{
                                data: [0],
                                backgroundColor: ['#28a745', '#E9ECEF'],
                                borderWidth: 3,
                                borderColor: '#FFFFFF'
                            }]
                        }
                    }
                ]
            };
        } else if (effectiveMode === 'system') {
            // Super Admin charts configuration - Conforme plano original
            chartsConfig = {
                title: 'Análises de Negócio e Operacionais',
                subtitle: 'Visão geral do ecossistema',
                charts: [
                    {
                        id: 'revenue-over-time',
                        type: 'line',
                        title: 'Evolução MRR da Plataforma (Últimos 6 Meses)',
                        columnClass: 'col-lg-6',
                        data: dashboardData.charts?.mrrEvolution || {
                            labels: ['Dados insuficientes'],
                            datasets: [{
                                label: 'MRR da Plataforma (R$)',
                                data: [0],
                                borderColor: '#2D5A9B',
                                backgroundColor: 'rgba(45, 90, 155, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        }
                    },
                    {
                        id: 'customer-growth',
                        type: 'bar',
                        title: 'Crescimento de Clientes',
                        columnClass: 'col-lg-6',
                        data: dashboardData.charts?.customerGrowth || {
                            labels: ['Dados insuficientes'],
                            datasets: [
                                {
                                    label: 'Novos',
                                    data: [0],
                                    backgroundColor: '#28a745',
                                },
                                {
                                    label: 'Recorrentes',
                                    data: [0],
                                    backgroundColor: '#17a2b8',
                                }
                            ]
                        }
                    },
                    {
                        id: 'appointments-over-time',
                        type: 'line',
                        title: 'Agendamentos e Cancelamentos',
                        columnClass: 'col-lg-6',
                        data: dashboardData.charts?.appointmentsOverTime || {
                             labels: ['Dados insuficientes'],
                             datasets: [
                                {
                                    label: 'Agendamentos',
                                    data: [0],
                                    borderColor: '#28a745',
                                    tension: 0.3
                                },
                                {
                                    label: 'Cancelamentos',
                                    data: [0],
                                    borderColor: '#dc3545',
                                    tension: 0.3
                                }
                            ]
                        }
                    },
                    {
                        id: 'tenant-distribution',
                        type: 'doughnut',
                        title: 'Segmentos dos Negócios',
                        columnClass: 'col-lg-6',
                        centerText: {
                            enabled: true,
                            mainText: String(dashboardData.saas_kpis?.active_tenants || dashboardData.saasMetrics?.activeTenants),
                            subText: 'Negócios',
                            mainColor: '#2D5A9B',
                            subColor: '#6C757D'
                        },
                        data: template.translateDomains(dashboardData.charts?.tenantDistribution) || {
                            labels: ['Dados insuficientes'],
                            datasets: [{
                                data: [0],
                                backgroundColor: ['#2D5A9B', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6f42c1']
                            }]
                        }
                    }
                ]
            };
        } else {
            // Tenant Admin charts configuration
            chartsConfig = {
                title: 'Análises e Tendências',
                subtitle: 'Gráficos principais do dashboard',
                charts: [
                    {
                        id: 'revenue-trend',
                        type: 'line',
                        title: 'Receita de Serviços (Últimas 4 Semanas)',
                        columnClass: 'col-lg-8',
                        data: dashboardData.charts?.revenueTrend || {
                            labels: ['Dados insuficientes'],
                            datasets: [{
                                label: 'Receita de Serviços (R$)',
                                data: [0],
                                borderColor: '#2D5A9B',
                                backgroundColor: 'rgba(45, 90, 155, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        }
                    },
                    {
                        id: 'appointments-trend',
                        type: 'line',
                        title: 'Agendamentos e Cancelamentos (Últimas 4 Semanas)',
                        columnClass: 'col-lg-8',
                        data: dashboardData.charts?.appointmentsTrend || {
                            labels: ['Dados insuficientes'],
                            datasets: [
                                {
                                    label: 'Agendamentos',
                                    data: [0],
                                    borderColor: '#28a745',
                                    tension: 0.4
                                },
                                {
                                    label: 'Cancelamentos',
                                    data: [0],
                                    borderColor: '#dc3545',
                                    tension: 0.4
                                }
                            ]
                        }
                    },
                    {
                        id: 'services-distribution',
                        type: 'doughnut',
                        title: 'Distribuição por Serviços',
                        columnClass: 'col-lg-4',
                        centerText: {
                            enabled: true,
                            mainText: String(dashboardData.appointments?.total),
                            subText: 'Total',
                            mainColor: '#2D5A9B',
                            subColor: '#6C757D'
                        },
                        data: dashboardData.charts?.servicesDistribution || {
                            labels: ['Dados insuficientes'],
                            datasets: [{
                                data: [0],
                                backgroundColor: ['#2D5A9B', '#28a745', '#ffc107', '#dc3545', '#17a2b8']
                            }]
                        }
                    }
                ]
            };
        }

        console.log('🎨 DEBUG: Creating charts section with config:', chartsConfig);
        const chartSection = template.createChartsSection(chartsContainer, chartsConfig);
        console.log('🎨 DEBUG: Charts section created:', !!chartSection);

        // Add data tables for Super Admin
        if (effectiveMode === 'system') {
            await this.setupSuperAdminDataTables(template, dashboardData);
        }

        return chartSection;
    }

    static async setupSuperAdminDataTables(template, dashboardData) {
        const chartsContainer = document.getElementById('section-charts');
        if (!chartsContainer) return;

        // Create a dedicated container for data tables below charts
        let tablesContainer = document.getElementById('section-data-tables');
        if (!tablesContainer) {
            tablesContainer = document.createElement('div');
            tablesContainer.id = 'section-data-tables';
            chartsContainer.parentNode.insertBefore(tablesContainer, chartsContainer.nextSibling);
        } else {
            // Clear existing content to avoid duplicates
            tablesContainer.innerHTML = '';
        }

        // Top Performing Tenants Table
        const topTenantsSection = template.createTableSection(tablesContainer, {
            id: 'top-tenants-table',
            title: 'Negócios de Melhor Performance',
            subtitle: 'Negócios com melhor performance',
            columns: [
                { key: 'name', label: 'Negócio' },
                { key: 'domain', label: 'Segmento' },
                { key: 'revenue', label: 'Receita', formatter: 'currency' },
                { key: 'growth', label: 'Crescimento', formatter: 'percentage' }
            ],
            data: dashboardData.rankings?.topTenants,
            pagination: false,
            search: false,
            actions: [
                {
                    label: 'Ver Detalhes',
                    icon: 'fas fa-eye',
                    class: 'btn-outline-primary btn-sm',
                    handler: 'viewTenantDetails'
                }
            ]
        });

        // Create a spacer element
        const spacer = document.createElement('div');
        spacer.style.height = '2rem';
        tablesContainer.appendChild(spacer);

        // Tenants at Risk Table
        const atRiskTenantsSection = template.createTableSection(tablesContainer, {
            id: 'at-risk-tenants-table',
            title: 'Negócios em Risco',
            subtitle: 'Negócios que precisam de atenção',
            columns: [
                { key: 'name', label: 'Negócio' },
                { key: 'lastActivity', label: 'Última Atividade', formatter: 'date' },
                { key: 'riskScore', label: 'Pontuação de Risco' },
                { key: 'status', label: 'Status', formatter: 'statusBadge' }
            ],
            data: dashboardData.rankings?.atRiskTenants?.map(tenant => ({
                ...tenant,
                status: template.getRiskStatus(tenant.riskScore)
            })),
            pagination: false,
            search: false,
            actions: [
                {
                    label: 'Contatar',
                    icon: 'fas fa-phone',
                    class: 'btn-outline-warning btn-sm',
                    handler: 'contactTenant'
                }
            ]
        });

        return { topTenantsSection, atRiskTenantsSection };
    }
    
    static async setupDashboardTables(template, filterTenant = 'all', filterPeriod = '30d') {
        console.log('📊 Setting up dashboard tables...');
        
        const tablesContainer = document.getElementById('section-data-tables');
        if (!tablesContainer) {
            console.warn('⚠️ Tables container not found');
            return;
        }
        
        // Fetch user info to determine role
        const token = localStorage.getItem('adminToken') || localStorage.getItem('ubs_token');
        let userInfo;
        try {
            const response = await fetch('/api/admin/user-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            userInfo = result.data || result || { role: 'tenant_admin' };
        } catch (error) {
            console.error('Error fetching user info for tables:', error);
            userInfo = { role: 'tenant_admin' };
        }
        
        // Fetch real data for tables
        let dashboardData;
        try {
            const params = new URLSearchParams({
                period: filterPeriod
            });
            
            if (filterTenant && filterTenant !== 'all' && userInfo.role === 'super_admin') {
                params.append('tenant', filterTenant);
            }
            
            const response = await fetch(`/api/admin/dashboard?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('🔍 DEBUG: Tables API response:', result);
            dashboardData = result.analytics || result;
            
            if (!dashboardData) {
                throw new Error('No analytics data received from dashboard API');
            }
        } catch (error) {
            console.error('❌ Error fetching dashboard data for tables:', error);
            
            // Show error state instead of fallback data
            this.showTablesError(tablesContainer, error);
            return;
        }
        
        // Create appropriate tables based on user role
        if (userInfo.role === 'super_admin') {
            // System-wide tables
            const topTenantsTable = template.createTableSection(tablesContainer, {
                id: 'top-tenants-table',
                title: 'Top Negócios',
                subtitle: 'Negócios com melhor performance',
                columns: [
                    { key: 'name', label: 'Negócio' },
                    { key: 'domain', label: 'Domínio' },
                    { key: 'revenue', label: 'Receita', formatter: 'currency' },
                    { key: 'growth', label: 'Crescimento', formatter: 'percentage' }
                ],
                data: dashboardData.rankings?.topTenants,
                pagination: false,
                search: false
            });
            
            const atRiskTable = template.createTableSection(tablesContainer, {
                id: 'at-risk-tenants-table',
                title: 'Negócios em Risco',
                subtitle: 'Negócios que precisam de atenção',
                columns: [
                    { key: 'name', label: 'Negócio' },
                    { key: 'lastActivity', label: 'Última Atividade', formatter: 'date' },
                    { key: 'riskScore', label: 'Score de Risco' },
                    { key: 'status', label: 'Status', formatter: 'statusBadge' }
                ],
                data: dashboardData.rankings?.atRiskTenants,
                pagination: false,
                search: false
            });
        } else {
            // Tenant-specific tables
            const recentAppointmentsTable = template.createTableSection(tablesContainer, {
                id: 'recent-appointments-table',
                title: 'Agendamentos Recentes',
                subtitle: 'Últimos agendamentos realizados',
                columns: [
                    { key: 'customer', label: 'Cliente' },
                    { key: 'service', label: 'Serviço' },
                    { key: 'date', label: 'Data', formatter: 'date' },
                    { key: 'status', label: 'Status', formatter: 'statusBadge' }
                ],
                data: [
                    { customer: 'Maria Silva', service: 'Corte + Escova', date: '2024-01-20', status: 'Confirmado' },
                    { customer: 'João Santos', service: 'Barba', date: '2024-01-19', status: 'Concluído' },
                    { customer: 'Ana Costa', service: 'Coloração', date: '2024-01-18', status: 'Pendente' }
                ],
                pagination: false,
                search: false
            });
        }
        
        console.log('✅ Dashboard tables setup complete');
    }
}

// ============================================================================
// EXPORT AND INITIALIZATION
// ============================================================================

// Global exports
window.UBSTemplate = {
    DashboardTemplate: UBSDashboardTemplate,
    PageInitializer: UBSPageInitializer
};

// Also export PageInitializer directly for easier access
window.UBSPageInitializer = UBSPageInitializer;

// Global functions for demo/testing
window.exportDashboard = function() {
    console.log('📊 Exportando dashboard...');
    // Implementar funcionalidade de exportação
};

window.refreshDashboard = function() {
    console.log('🔄 Atualizando dashboard...');
    // Implementar funcionalidade de refresh
};

// Global functions for table actions
window.viewTenantDetails = function(tenantId) {
    console.log('👁️ Viewing details for tenant:', tenantId);
    // Implement tenant details functionality
    alert(`Visualizando detalhes do tenant: ${tenantId}`);
};

window.contactTenant = function(tenantId) {
    console.log('📞 Contacting tenant:', tenantId);
    // Implement contact tenant functionality
    alert(`Contatando tenant: ${tenantId}`);
};

// ============================================================================
// UBS PAGE ENHANCER - Non-invasive enhancement system
// ============================================================================

class UBSPageEnhancer {
    static enhanceAppointmentsPage() {
        console.log('🎨 Enhancing appointments page with UBS standards...');
        
        // Apply UBS typography
        this.applyUBSTypography();
        
        // Apply UBS spacing
        this.applyUBSSpacing();
        
        // Apply UBS color scheme
        this.applyUBSColors();
        
        console.log('✅ Appointments page enhanced with UBS standards');
    }
    
    static enhanceTenantsPage() {
        console.log('🎨 Enhancing tenants page with UBS standards...');
        
        // Apply UBS typography
        this.applyUBSTypography();
        
        // Apply UBS spacing
        this.applyUBSSpacing();
        
        // Apply UBS color scheme
        this.applyUBSColors();
        
        // Apply tenant-specific enhancements
        this.applyTenantSpecificEnhancements();
        
        console.log('✅ Tenants page enhanced with UBS standards');
    }
    
    static applyUBSTypography() {
        // Apply UBS font family to the page
        document.body.style.fontFamily = 'var(--ubs-font-family)';
        
        // Enhance headings
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            heading.style.fontWeight = '600';
            heading.style.color = 'var(--ubs-text-dark)';
        });
    }
    
    static applyUBSSpacing() {
        // Apply consistent spacing using UBS variables
        const cards = document.querySelectorAll('.card, .filter-card, .metrics-card');
        cards.forEach(card => {
            card.style.borderRadius = 'var(--ubs-border-radius)';
            card.style.boxShadow = 'var(--ubs-shadow)';
        });
    }
    
    static applyUBSColors() {
        // Ensure primary colors use UBS standards
        const primaryElements = document.querySelectorAll('.text-primary, .btn-primary');
        primaryElements.forEach(element => {
            if (element.classList.contains('btn-primary')) {
                element.style.backgroundColor = 'var(--ubs-primary)';
                element.style.borderColor = 'var(--ubs-primary)';
            } else {
                element.style.color = 'var(--ubs-primary)';
            }
        });
    }
    
    static enhanceGeneratedContent(container) {
        console.log('🔄 Enhancing dynamically generated content...');
        
        // Enhance metric cards
        const metricCards = container.querySelectorAll('.card');
        metricCards.forEach((card, index) => {
            card.classList.add('metric-card', 'ubs-enhanced');
            card.style.transition = 'var(--ubs-transition)';
        });
        
        // Enhance forms
        const formElements = container.querySelectorAll('select, input, .form-control, .form-select');
        formElements.forEach(element => {
            element.style.borderColor = 'var(--ubs-border-color)';
            element.style.borderRadius = 'var(--ubs-border-radius-sm)';
        });
        
        // Add hover effects to interactive elements
        const interactiveElements = container.querySelectorAll('.btn, .card');
        interactiveElements.forEach(element => {
            element.style.transition = 'var(--ubs-transition)';
        });
    }
    
    static applyTenantSpecificEnhancements() {
        console.log('🏢 Applying tenant-specific enhancements...');
        
        // Enhance tenant cards
        const tenantCards = document.querySelectorAll('.tenant-card, .card');
        tenantCards.forEach(card => {
            card.classList.add('ubs-enhanced');
            card.style.borderRadius = 'var(--ubs-border-radius)';
            card.style.boxShadow = 'var(--ubs-shadow)';
            card.style.transition = 'var(--ubs-transition)';
        });
        
        // Enhance tenant status indicators
        const statusElements = document.querySelectorAll('.badge, .status-badge');
        statusElements.forEach(element => {
            element.style.borderRadius = 'var(--ubs-border-radius-sm)';
            element.style.fontWeight = '500';
        });
        
        // Enhance tenant action buttons
        const actionButtons = document.querySelectorAll('.btn');
        actionButtons.forEach(button => {
            button.style.borderRadius = 'var(--ubs-border-radius-sm)';
            button.style.transition = 'var(--ubs-transition)';
        });
        
        // Enhance tenant tables
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            table.classList.add('ubs-enhanced');
            table.style.borderRadius = 'var(--ubs-border-radius)';
            table.style.overflow = 'hidden';
        });
        
        // Enhance tenant metrics
        const metricElements = document.querySelectorAll('.metric, .metric-value');
        metricElements.forEach(element => {
            element.style.fontWeight = '600';
            element.style.color = 'var(--ubs-text-dark)';
        });
    }
}

// Store enhancer reference globally
window.UBSPageEnhancer = UBSPageEnhancer;

console.log('✅ UBS Template Standardizer carregado com sucesso!');