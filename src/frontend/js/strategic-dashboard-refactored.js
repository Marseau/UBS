/**
 * Strategic Dashboard Refactored with UBS Widget System
 * Exemplo prático de como usar o sistema de widgets para criar seções padronizadas
 * 
 * @version 1.0.0
 * @author UBS Team
 */

/**
 * Renderiza a seção estratégica de agendamentos usando o sistema de widgets
 * @param {HTMLElement} container - Container onde a seção será renderizada
 */
function renderStrategicAppointmentsSectionWithWidgets(container) {
    console.log('🎨 Renderizando seção estratégica com sistema de widgets...');
    
    // Limpar container
    container.innerHTML = '';
    
    // 1. CRIAR SEÇÃO PRINCIPAL
    const mainSection = new UBSWidgets.Section(container, {
        title: 'Análise Estratégica de Agendamentos',
        subtitle: 'Visão macro e insights acionáveis para tomada de decisão',
        actions: [
            {
                label: 'Exportar',
                icon: 'fas fa-download',
                class: 'btn-outline-primary',
                handler: 'exportStrategicReport()'
            },
            {
                label: 'Atualizar',
                icon: 'fas fa-sync-alt',
                class: 'btn-primary',
                handler: 'refreshStrategicData()'
            }
        ]
    });
    
    mainSection.render();
    const sectionBody = mainSection.getBodyContainer();
    
    // 2. CRIAR FILTROS
    const filtersContainer = document.createElement('div');
    sectionBody.appendChild(filtersContainer);
    
    const filtersWidget = new UBSWidgets.Filter(filtersContainer, {
        layout: 'horizontal',
        filters: [
            {
                type: 'select',
                name: 'period',
                label: 'Período',
                options: [
                    { value: '7d', label: 'Últimos 7 dias' },
                    { value: '30d', label: 'Últimos 30 dias', selected: true },
                    { value: '90d', label: 'Últimos 90 dias' },
                    { value: '1y', label: 'Último ano' }
                ]
            },
            {
                type: 'select',
                name: 'segment',
                label: 'Segmento',
                options: [
                    { value: 'all', label: 'Todos os segmentos', selected: true },
                    { value: 'beauty', label: 'Beleza' },
                    { value: 'health', label: 'Saúde Mental' },
                    { value: 'legal', label: 'Jurídico' },
                    { value: 'education', label: 'Educação' },
                    { value: 'fitness', label: 'Fitness' },
                    { value: 'consulting', label: 'Consultoria' }
                ]
            },
            {
                type: 'select',
                name: 'tenant',
                label: 'Empresa',
                options: [
                    { value: 'all', label: 'Todas as empresas', selected: true }
                ]
            },
            {
                type: 'select',
                name: 'professional',
                label: 'Profissional',
                options: [
                    { value: 'all', label: 'Todos os profissionais', selected: true }
                ]
            }
        ],
        onChange: (values, target) => {
            console.log('🔄 Filtros alterados:', values);
            // Atualizar dados baseado nos filtros
            updateStrategicData(values);
        }
    });
    
    filtersWidget.render();
    
    // 3. CRIAR ROW DE MÉTRICAS
    const metricsRowContainer = document.createElement('div');
    sectionBody.appendChild(metricsRowContainer);
    
    const metricsRow = new UBSWidgets.DashboardRow(metricsRowContainer, {
        columns: [
            { class: 'col-md-2' },
            { class: 'col-md-2' },
            { class: 'col-md-2' },
            { class: 'col-md-2' },
            { class: 'col-md-2' },
            { class: 'col-md-2' }
        ],
        gap: 'normal'
    });
    
    metricsRow.render();
    
    // Criar cards de métricas
    const metricsData = [
        {
            title: 'Total Agendamentos',
            value: 9920,
            icon: 'fas fa-calendar-check',
            color: 'primary',
            trend: { value: 24.5, direction: 'up', label: 'vs mês anterior' }
        },
        {
            title: 'Taxa de Crescimento',
            value: 24.5,
            format: 'percentage',
            icon: 'fas fa-chart-line',
            color: 'success',
            trend: { value: 18.2, direction: 'up', label: 'vs período anterior' }
        },
        {
            title: 'Taxa de Cancelamento',
            value: 5.2,
            format: 'percentage',
            icon: 'fas fa-times-circle',
            color: 'warning',
            trend: { value: -2.1, direction: 'down', label: 'melhoria' }
        },
        {
            title: 'Taxa de Comparecimento',
            value: 91.3,
            format: 'percentage',
            icon: 'fas fa-user-check',
            color: 'info',
            trend: { value: 3.7, direction: 'up', label: 'melhoria' }
        },
        {
            title: 'Top Empresa',
            value: 892,
            subtitle: 'Salão Bella Vista',
            icon: 'fas fa-trophy',
            color: 'primary',
            trend: { value: 31.2, direction: 'up' }
        },
        {
            title: 'Impacto na Receita',
            value: 298500,
            format: 'currency',
            icon: 'fas fa-dollar-sign',
            color: 'success',
            trend: { value: 18.7, direction: 'up' }
        }
    ];
    
    metricsData.forEach((metric, index) => {
        const metricCard = new UBSWidgets.MetricCard(metricsRow.getColumnContainer(index), {
            ...metric,
            size: 'compact'
        });
        metricCard.render();
    });
    
    // 4. CRIAR ROW DE GRÁFICOS
    const chartsRowContainer = document.createElement('div');
    sectionBody.appendChild(chartsRowContainer);
    
    const chartsRow = new UBSWidgets.DashboardRow(chartsRowContainer, {
        columns: [
            { class: 'col-lg-6' },
            { class: 'col-lg-6' }
        ],
        gap: 'normal'
    });
    
    chartsRow.render();
    
    // Gráfico de linha - Evolução temporal
    const timelineChart = new UBSWidgets.LineChart(chartsRow.getColumnContainer(0), {
        title: 'Evolução dos Agendamentos',
        height: 300,
        actions: [
            {
                label: '6M',
                handler: "updateTimelineChart('6m')"
            },
            {
                label: '12M',
                handler: "updateTimelineChart('12m')"
            }
        ]
    });
    
    timelineChart.render();
    
    // Dados do gráfico de linha
    const timelineData = {
        labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
        datasets: [
            {
                label: 'Agendamentos',
                data: [1200, 1350, 1180, 1420, 1580, 1650],
                borderColor: '#2D5A9B',
                backgroundColor: 'rgba(45, 90, 155, 0.1)',
                fill: true
            },
            {
                label: 'Cancelamentos',
                data: [85, 92, 78, 95, 89, 82],
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                fill: false
            }
        ]
    };
    
    timelineChart.createChart(timelineData);
    
    // Gráfico de pizza - Distribuição por segmento
    const segmentChart = new UBSWidgets.DoughnutChart(chartsRow.getColumnContainer(1), {
        title: 'Distribuição por Segmento',
        height: 300,
        centerText: {
            enabled: true,
            mainText: '9.920',
            subText: 'Total',
            mainColor: '#2D5A9B',
            subColor: '#6C757D'
        }
    });
    
    segmentChart.render();
    
    // Dados do gráfico de pizza
    const segmentData = {
        labels: ['Beleza', 'Saúde Mental', 'Jurídico', 'Educação', 'Fitness', 'Consultoria'],
        datasets: [{
            data: [2840, 2210, 1820, 1510, 980, 640],
            backgroundColor: [
                '#e91e63', '#2196f3', '#ff9800', 
                '#4caf50', '#9c27b0', '#607d8b'
            ]
        }]
    };
    
    segmentChart.createChart(segmentData);
    
    // 5. CRIAR ROW DE GRÁFICOS SECUNDÁRIOS
    const secondaryChartsRowContainer = document.createElement('div');
    sectionBody.appendChild(secondaryChartsRowContainer);
    
    const secondaryChartsRow = new UBSWidgets.DashboardRow(secondaryChartsRowContainer, {
        columns: [
            { class: 'col-lg-6' },
            { class: 'col-lg-6' }
        ],
        gap: 'normal'
    });
    
    secondaryChartsRow.render();
    
    // Gráfico de barras - Top empresas
    const topTenantsChart = new UBSWidgets.BarChart(secondaryChartsRow.getColumnContainer(0), {
        title: 'Top 5 Empresas',
        height: 250
    });
    
    topTenantsChart.render();
    
    const topTenantsData = {
        labels: ['Salão Bella Vista', 'Mental Health Pro', 'Lima & Associados', 'EduMaster', 'FitLife Academy'],
        datasets: [{
            label: 'Agendamentos',
            data: [892, 734, 612, 578, 489],
            backgroundColor: '#2D5A9B'
        }]
    };
    
    topTenantsChart.createChart(topTenantsData, {
        indexAxis: 'y',
        plugins: { legend: { display: false } }
    });
    
    // Gráfico de pizza - Status dos agendamentos
    const statusChart = new UBSWidgets.DoughnutChart(secondaryChartsRow.getColumnContainer(1), {
        title: 'Status dos Agendamentos',
        height: 250
    });
    
    statusChart.render();
    
    const statusData = {
        labels: ['Confirmados', 'Concluídos', 'Pendentes', 'Cancelados', 'Não Compareceu'],
        datasets: [{
            data: [4500, 3800, 800, 520, 300],
            backgroundColor: ['#198754', '#0dcaf0', '#ffc107', '#dc3545', '#6c757d']
        }]
    };
    
    statusChart.createChart(statusData);
    
    // 6. CRIAR TABELA DE RANKING
    const tableContainer = document.createElement('div');
    sectionBody.appendChild(tableContainer);
    
    const rankingTable = new UBSWidgets.Table(tableContainer, {
        title: 'Ranking de Performance - Top 10',
        search: true,
        columns: [
            { key: 'position', label: 'Posição', sortable: false },
            { key: 'name', label: 'Empresa' },
            { key: 'appointments', label: 'Agendamentos', format: 'number' },
            { key: 'growth', label: 'Crescimento', format: 'percentage' },
            { key: 'cancellationRate', label: 'Taxa Cancelamento', format: 'percentage' },
            { key: 'showRate', label: 'Taxa Comparecimento', format: 'percentage' }
        ],
        data: [
            { position: '🥇', name: 'Salão Bella Vista', appointments: 892, growth: 31.2, cancellationRate: 3.1, showRate: 95.8 },
            { position: '🥈', name: 'Mental Health Pro', appointments: 734, growth: 28.7, cancellationRate: 4.2, showRate: 93.1 },
            { position: '🥉', name: 'Lima & Associados', appointments: 612, growth: 22.1, cancellationRate: 5.8, showRate: 91.2 },
            { position: '4º', name: 'EduMaster Tutoring', appointments: 578, growth: 19.5, cancellationRate: 2.9, showRate: 96.3 },
            { position: '5º', name: 'FitLife Academy', appointments: 489, growth: 35.2, cancellationRate: 6.1, showRate: 89.4 }
        ],
        striped: true,
        hover: true
    });
    
    rankingTable.render();
    
    console.log('✅ Seção estratégica renderizada com sistema de widgets!');
}

/**
 * Função para atualizar dados estratégicos baseado nos filtros
 * @param {Object} filters - Valores dos filtros
 */
function updateStrategicData(filters) {
    console.log('🔄 Atualizando dados estratégicos...', filters);
    
    // Simular carregamento
    // Em produção, aqui faria chamada para API
    
    // Exemplo de como atualizar widgets específicos
    // const metricCard = document.querySelector('[data-widget-id*="metric"]');
    // if (metricCard) {
    //     const widget = UBSWidgets.findWidget(metricCard);
    //     widget.update({ value: newValue, trend: newTrend });
    // }
}

/**
 * Função para atualizar gráfico de timeline
 * @param {string} period - Período selecionado
 */
function updateTimelineChart(period) {
    console.log('📊 Atualizando gráfico timeline para período:', period);
    
    // Gerar novos dados baseado no período
    const newData = UBSWidgets.Utils.generateMockData('revenue', period === '12m' ? 12 : 6);
    
    // Encontrar e atualizar o gráfico
    // Em implementação real, você manteria referências aos widgets
}

/**
 * Função para exportar relatório estratégico
 */
function exportStrategicReport() {
    console.log('📄 Exportando relatório estratégico...');
    alert('Funcionalidade de exportação será implementada');
}

/**
 * Função para atualizar dados estratégicos
 */
function refreshStrategicData() {
    console.log('🔄 Atualizando dados estratégicos...');
    
    // Mostrar loading em todos os widgets
    document.querySelectorAll('[data-widget-id]').forEach(element => {
        element.classList.add('widget-loading');
    });
    
    // Simular carregamento
    setTimeout(() => {
        document.querySelectorAll('[data-widget-id]').forEach(element => {
            element.classList.remove('widget-loading');
        });
        console.log('✅ Dados atualizados!');
    }, 2000);
}

/**
 * Exemplo de como criar uma seção de serviços estratégicos
 * @param {HTMLElement} container - Container onde a seção será renderizada
 */
function renderStrategicServicesSectionWithWidgets(container) {
    console.log('🎨 Renderizando seção estratégica de serviços...');
    
    // Limpar container
    container.innerHTML = '';
    
    // Criar seção principal
    const mainSection = new UBSWidgets.Section(container, {
        title: 'Análise Estratégica de Serviços',
        subtitle: 'Performance e otimização de serviços oferecidos',
        collapsible: true
    });
    
    mainSection.render();
    const sectionBody = mainSection.getBodyContainer();
    
    // Métricas de serviços
    const metricsRowContainer = document.createElement('div');
    sectionBody.appendChild(metricsRowContainer);
    
    const metricsRow = new UBSWidgets.DashboardRow(metricsRowContainer, {
        columns: [
            { class: 'col-md-3' },
            { class: 'col-md-3' },
            { class: 'col-md-3' },
            { class: 'col-md-3' }
        ]
    });
    
    metricsRow.render();
    
    // Cards de métricas de serviços
    const serviceMetrics = [
        {
            title: 'Serviços Ativos',
            value: 247,
            icon: 'fas fa-concierge-bell',
            color: 'primary'
        },
        {
            title: 'Receita por Serviço',
            value: 1205.50,
            format: 'currency',
            icon: 'fas fa-coins',
            color: 'success'
        },
        {
            title: 'Tempo Médio',
            value: 45,
            subtitle: 'minutos',
            icon: 'fas fa-clock',
            color: 'info'
        },
        {
            title: 'Satisfação',
            value: 4.8,
            subtitle: '⭐⭐⭐⭐⭐',
            icon: 'fas fa-star',
            color: 'warning'
        }
    ];
    
    serviceMetrics.forEach((metric, index) => {
        const metricCard = new UBSWidgets.MetricCard(metricsRow.getColumnContainer(index), metric);
        metricCard.render();
    });
    
    console.log('✅ Seção de serviços renderizada!');
}

// Exportar funções para uso global
window.renderStrategicAppointmentsSectionWithWidgets = renderStrategicAppointmentsSectionWithWidgets;
window.renderStrategicServicesSectionWithWidgets = renderStrategicServicesSectionWithWidgets;
window.updateStrategicData = updateStrategicData;
window.updateTimelineChart = updateTimelineChart;
window.exportStrategicReport = exportStrategicReport;
window.refreshStrategicData = refreshStrategicData;

console.log('✅ Strategic Dashboard Refactored carregado!'); 