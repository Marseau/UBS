/**
 * UBS Widget System - Demo and Testing Script
 * Demonstração e validação de todos os componentes do sistema
 * 
 * @version 1.0.0
 * @author UBS Team
 */

// Global variables for demo
let demoWidgets = {};
let testResults = {};
let currentTheme = 'default';
let isRealTimeActive = false;

// Initialize demo when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando demonstração do UBS Widget System...');
    
    // Check if widget system is loaded
    if (!window.UBSWidgets) {
        console.error('❌ UBS Widget System não carregado!');
        showError('Sistema de widgets não encontrado. Verifique se os arquivos foram carregados corretamente.');
        return;
    }
    
    console.log('✅ UBS Widget System carregado com sucesso!');
    
    // Initialize all demos
    initializeAllDemos();
    
    // Show metrics demo by default
    showDemo('metrics');
    
    // Update test summary
    updateTestSummary();
});

/**
 * Initialize all demo sections
 */
function initializeAllDemos() {
    try {
        initializeMetricsDemo();
        initializeChartsDemo();
        initializeTablesDemo();
        initializeFiltersDemo();
        initializeSectionsDemo();
        initializeConversationsDemo();
        initializeCompleteDemo();
        initializeHeatmapDemo();
        
        console.log('✅ Todas as demonstrações inicializadas!');
    } catch (error) {
        console.error('❌ Erro ao inicializar demonstrações:', error);
        showError('Erro ao inicializar demonstrações: ' + error.message);
    }
}

/**
 * Show specific demo section
 */
function showDemo(section) {
    // Hide all demo content
    document.querySelectorAll('.demo-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected demo
    const demoElement = document.getElementById(`${section}-demo`);
    if (demoElement) {
        demoElement.style.display = 'block';
    }
    
    // Add active class to clicked nav link
    const navLink = document.querySelector(`[href="#${section}"]`);
    if (navLink) {
        navLink.classList.add('active');
    }
    
    // Forçar renderização do heatmap ao mostrar a aba
    if(section === 'heatmap') {
        initializeHeatmapDemo();
    }
    
    console.log(`📋 Mostrando demonstração: ${section}`);
}

// ============================================================================
// METRICS DEMO
// ============================================================================

function initializeMetricsDemo() {
    console.log('📊 Inicializando demonstração de Metric Cards...');
    
    const container = document.getElementById('metric-cards-container');
    if (!container) return;
    
    // Create different metric card examples
    const metricConfigs = [
        {
            id: 'sales',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Vendas Totais',
                value: 125000,
                format: 'currency',
                icon: 'fas fa-dollar-sign',
                color: 'success',
                trend: { value: 15.2, direction: 'up', label: 'vs mês anterior' },
                size: 'normal'
            }
        },
        {
            id: 'growth',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Crescimento',
                value: 24.5,
                format: 'percentage',
                icon: 'fas fa-chart-line',
                color: 'primary',
                trend: { value: 18.2, direction: 'up', label: 'aceleração' },
                size: 'normal'
            }
        },
        {
            id: 'users',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Usuários Ativos',
                value: 8920,
                format: 'number',
                icon: 'fas fa-users',
                color: 'info',
                trend: { value: 7.3, direction: 'up', label: 'este mês' },
                size: 'normal'
            }
        },
        {
            id: 'conversion',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Conversão',
                value: 3.2,
                format: 'percentage',
                icon: 'fas fa-funnel-dollar',
                color: 'warning',
                trend: { value: -0.5, direction: 'down', label: 'precisa atenção' },
                size: 'normal'
            }
        },
        {
            id: 'satisfaction',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Satisfação',
                value: 4.8,
                subtitle: '⭐⭐⭐⭐⭐',
                icon: 'fas fa-star',
                color: 'warning',
                trend: { value: 2.1, direction: 'up', label: 'excelente' },
                size: 'normal'
            }
        },
        {
            id: 'tickets',
            container: 'col-lg-2 col-md-4 col-sm-6',
            config: {
                title: 'Tickets Abertos',
                value: 23,
                format: 'number',
                icon: 'fas fa-ticket-alt',
                color: 'danger',
                trend: { value: -12.5, direction: 'down', label: 'melhoria' },
                size: 'normal'
            }
        }
    ];
    
    // Clear container
    container.innerHTML = '';
    
    // Create metric cards
    metricConfigs.forEach(({ id, container: colClass, config }) => {
        const colDiv = document.createElement('div');
        colDiv.className = colClass;
        
        const cardContainer = document.createElement('div');
        colDiv.appendChild(cardContainer);
        container.appendChild(colDiv);
        
        try {
            const metricCard = new UBSWidgets.MetricCard(cardContainer, config);
            metricCard.render();
            demoWidgets[id] = metricCard;
            
            testResults[`metric-${id}`] = { status: 'success', message: 'Card criado com sucesso' };
        } catch (error) {
            console.error(`❌ Erro ao criar metric card ${id}:`, error);
            testResults[`metric-${id}`] = { status: 'error', message: error.message };
        }
    });
    
    updateTestStatus('metric', 'Metric Cards inicializados com sucesso');
}

function updateMetricCard(id, data) {
    if (demoWidgets[id]) {
        try {
            demoWidgets[id].update(data);
            testResults[`metric-${id}-update`] = { status: 'success', message: 'Card atualizado com sucesso' };
            updateTestStatus('metric', `Card ${id} atualizado: ${JSON.stringify(data)}`);
        } catch (error) {
            console.error(`❌ Erro ao atualizar metric card ${id}:`, error);
            testResults[`metric-${id}-update`] = { status: 'error', message: error.message };
        }
    }
}

function toggleMetricSize() {
    const sizes = ['compact', 'normal', 'large'];
    const currentSize = demoWidgets.sales?.options?.size || 'normal';
    const nextSize = sizes[(sizes.indexOf(currentSize) + 1) % sizes.length];
    
    Object.keys(demoWidgets).forEach(id => {
        if (id.startsWith('sales') || id.startsWith('growth')) {
            demoWidgets[id].options.size = nextSize;
            // Re-render with new size
            const container = demoWidgets[id].container;
            demoWidgets[id].destroy();
            demoWidgets[id] = new UBSWidgets.MetricCard(container, {
                ...demoWidgets[id].options,
                size: nextSize
            });
            demoWidgets[id].render();
        }
    });
    
    updateTestStatus('metric', `Tamanho alterado para: ${nextSize}`);
}

function testMetricLoading() {
    Object.keys(demoWidgets).forEach(id => {
        if (demoWidgets[id] && demoWidgets[id].container) {
            UBSWidgets.Utils.showLoading(demoWidgets[id]);
        }
    });
    
    setTimeout(() => {
        Object.keys(demoWidgets).forEach(id => {
            if (demoWidgets[id] && demoWidgets[id].container) {
                UBSWidgets.Utils.hideLoading(demoWidgets[id]);
            }
        });
        updateTestStatus('metric', 'Teste de loading concluído');
    }, 2000);
}

// ============================================================================
// CHARTS DEMO
// ============================================================================

function initializeChartsDemo() {
    console.log('📈 Inicializando demonstração de Charts...');
    
    // Line Chart
    const lineContainer = document.getElementById('line-chart-container');
    if (lineContainer) {
        try {
            const lineChart = new UBSWidgets.LineChart(lineContainer, {
                title: 'Vendas ao Longo do Tempo',
                height: 300,
                actions: [
                    { label: '6M', handler: "updateChartPeriod('line', '6m')" },
                    { label: '12M', handler: "updateChartPeriod('line', '12m')" }
                ]
            });
            
            lineChart.render();
            
            const lineData = {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                datasets: [{
                    label: 'Vendas',
                    data: [12000, 15000, 13000, 18000, 16000, 20000],
                    borderColor: '#2D5A9B',
                    backgroundColor: 'rgba(45, 90, 155, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            };
            
            lineChart.createChart(lineData);
            demoWidgets.lineChart = lineChart;
            
            testResults['chart-line'] = { status: 'success', message: 'Line chart criado com sucesso' };
        } catch (error) {
            console.error('❌ Erro ao criar line chart:', error);
            testResults['chart-line'] = { status: 'error', message: error.message };
        }
    }
    
    // Doughnut Chart - Formato Dashboard
    const doughnutContainer = document.getElementById('doughnut-chart-container');
    if (doughnutContainer) {
        try {
            // Criar estrutura HTML para o chart (formato dashboard)
            doughnutContainer.innerHTML = `
                <div class="chart-widget">
                    <div class="chart-header">
                        <h6 class="chart-title">Distribuição por Categoria</h6>
                    </div>
                    <div class="chart-body" style="height: 300px; position: relative;">
                        <canvas id="demo-doughnut-canvas"></canvas>
                    </div>
                </div>
            `;
            
            // Dados do gráfico
            const doughnutData = {
                labels: ['Eletrônicos', 'Roupas', 'Casa', 'Livros', 'Esportes'],
                datasets: [{
                    data: [450, 150, 280, 220, 300],
                    backgroundColor: [
                        '#2D5A9B', '#28a745', '#ffc107', 
                        '#dc3545', '#17a2b8'
                    ]
                }]
            };
            
            // Criar chart usando formato do dashboard
            const canvas = document.getElementById('demo-doughnut-canvas');
            const ctx = canvas.getContext('2d');
            
            const doughnutChart = new Chart(ctx, {
                type: 'doughnut',
                data: doughnutData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    radius: 80,
                    layout: {
                        padding: 10
                    },
                    animation: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                padding: 8,
                                font: { size: 10 },
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.parsed;
                                    const dataSum = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((total / dataSum) * 100).toFixed(1);
                                    return `${context.label}: ${total.toLocaleString()} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    elements: {
                        arc: {
                            borderWidth: 1
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
                        ctx.font = 'bold 20px Inter, Arial, sans-serif';
                        ctx.fillStyle = '#2c3e50';
                        ctx.fillText(total.toLocaleString('pt-BR'), centerX, centerY - 8);
                        
                        ctx.font = '12px Inter, Arial, sans-serif';
                        ctx.fillStyle = '#6c757d';
                        ctx.fillText('Total', centerX, centerY + 12);
                        ctx.restore();
                    }
                }]
            });
            
            demoWidgets.doughnutChart = doughnutChart;
            
            testResults['chart-doughnut'] = { status: 'success', message: 'Doughnut chart criado com formato dashboard' };
        } catch (error) {
            console.error('❌ Erro ao criar doughnut chart:', error);
            testResults['chart-doughnut'] = { status: 'error', message: error.message };
        }
    }
    
    // Bar Chart
    const barContainer = document.getElementById('bar-chart-container');
    if (barContainer) {
        try {
            const barChart = new UBSWidgets.BarChart(barContainer, {
                title: 'Top 5 Produtos por Vendas',
                height: 250
            });
            
            barChart.render();
            
            const barData = {
                labels: ['Produto A', 'Produto B', 'Produto C', 'Produto D', 'Produto E'],
                datasets: [{
                    label: 'Vendas',
                    data: [300, 250, 200, 180, 150],
                    backgroundColor: '#2D5A9B',
                    borderRadius: 4
                }]
            };
            
            barChart.createChart(barData);
            demoWidgets.barChart = barChart;
            
            testResults['chart-bar'] = { status: 'success', message: 'Bar chart criado com sucesso' };
        } catch (error) {
            console.error('❌ Erro ao criar bar chart:', error);
            testResults['chart-bar'] = { status: 'error', message: error.message };
        }
    }
    
    updateTestStatus('chart', 'Charts inicializados com sucesso');
}

function updateChartData(chartType) {
    const chart = demoWidgets[`${chartType}Chart`];
    if (!chart) return;
    
    try {
        let newData;
        
        switch (chartType) {
            case 'line':
                newData = {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    datasets: [{
                        label: 'Vendas',
                        data: Array.from({length: 6}, () => Math.floor(Math.random() * 25000) + 5000),
                        borderColor: '#2D5A9B',
                        backgroundColor: 'rgba(45, 90, 155, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                };
                break;
                
            case 'bar':
                newData = {
                    labels: ['Produto A', 'Produto B', 'Produto C', 'Produto D', 'Produto E'],
                    datasets: [{
                        label: 'Vendas',
                        data: Array.from({length: 5}, () => Math.floor(Math.random() * 400) + 100),
                        backgroundColor: '#2D5A9B',
                        borderRadius: 4
                    }]
                };
                break;
                
            case 'doughnut':
                newData = {
                    labels: ['Eletrônicos', 'Roupas', 'Casa', 'Livros', 'Esportes'],
                    datasets: [{
                        data: Array.from({length: 5}, () => Math.floor(Math.random() * 500) + 100),
                        backgroundColor: [
                            '#e91e63', '#2196f3', '#ff9800', 
                            '#4caf50', '#9c27b0'
                        ]
                    }]
                };
                break;
        }
        
        chart.update(newData);
        updateTestStatus('chart', `${chartType} chart atualizado com novos dados`);
        
    } catch (error) {
        console.error(`❌ Erro ao atualizar ${chartType} chart:`, error);
        updateTestStatus('chart', `Erro ao atualizar ${chartType}: ${error.message}`);
    }
}

function toggleChartTheme() {
    currentTheme = currentTheme === 'default' ? 'dark' : 'default';
    updateTestStatus('chart', `Tema alterado para: ${currentTheme}`);
}

function exportCharts() {
    updateTestStatus('chart', 'Funcionalidade de exportação seria implementada aqui');
}

function testChartError() {
    try {
        // Simulate error by passing invalid data
        if (demoWidgets.lineChart) {
            demoWidgets.lineChart.update(null);
        }
    } catch (error) {
        updateTestStatus('chart', `Erro simulado capturado: ${error.message}`);
    }
}

// ============================================================================
// TABLES DEMO
// ============================================================================

function initializeTablesDemo() {
    console.log('📋 Inicializando demonstração de Tables...');
    
    const container = document.getElementById('table-container');
    if (!container) return;
    
    try {
        const tableWidget = new UBSWidgets.Table(container, {
            title: 'Lista de Vendas - Demonstração',
            search: true,
            pagination: true,
            columns: [
                { key: 'id', label: 'ID', sortable: true },
                { key: 'product', label: 'Produto', sortable: true },
                { key: 'customer', label: 'Cliente', sortable: true },
                { key: 'value', label: 'Valor', format: 'currency', sortable: true },
                { key: 'date', label: 'Data', format: 'date', sortable: true },
                { key: 'status', label: 'Status', format: 'badge', sortable: false }
            ],
            data: generateTableData(10),
            actions: [
                {
                    label: 'Ver',
                    icon: 'fas fa-eye',
                    class: 'btn-outline-primary',
                    handler: 'viewItem'
                },
                {
                    label: 'Editar',
                    icon: 'fas fa-edit',
                    class: 'btn-outline-secondary',
                    handler: 'editItem'
                }
            ],
            striped: true,
            hover: true
        });
        
        tableWidget.render();
        demoWidgets.table = tableWidget;
        
        testResults['table-main'] = { status: 'success', message: 'Table criada com sucesso' };
        updateTestStatus('table', 'Table inicializada com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao criar table:', error);
        testResults['table-main'] = { status: 'error', message: error.message };
        updateTestStatus('table', `Erro: ${error.message}`);
    }
}

function generateTableData(count) {
    const products = ['Notebook Dell', 'Mouse Logitech', 'Teclado Mecânico', 'Monitor LG', 'Webcam HD'];
    const customers = ['João Silva', 'Maria Santos', 'Pedro Costa', 'Ana Oliveira', 'Carlos Ferreira'];
    const statuses = ['Ativo', 'Pendente', 'Cancelado', 'Concluído'];
    
    return Array.from({length: count}, (_, i) => ({
        id: i + 1,
        product: products[Math.floor(Math.random() * products.length)],
        customer: customers[Math.floor(Math.random() * customers.length)],
        value: Math.floor(Math.random() * 1000) + 100,
        date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: statuses[Math.floor(Math.random() * statuses.length)]
    }));
}

function addTableRow() {
    if (demoWidgets.table) {
        const currentData = demoWidgets.table.options.data;
        const newRow = generateTableData(1)[0];
        newRow.id = currentData.length + 1;
        
        const newData = [...currentData, newRow];
        demoWidgets.table.update(newData);
        
        updateTestStatus('table', `Nova linha adicionada. Total: ${newData.length} linhas`);
    }
}

function updateTableData() {
    if (demoWidgets.table) {
        const newData = generateTableData(8);
        demoWidgets.table.update(newData);
        updateTestStatus('table', 'Dados da tabela atualizados completamente');
    }
}

function toggleTableStyle() {
    updateTestStatus('table', 'Funcionalidade de alternar estilo seria implementada aqui');
}

function testTableSearch() {
    updateTestStatus('table', 'Digite na caixa de busca para testar a funcionalidade');
}

function exportTableData() {
    if (demoWidgets.table) {
        const data = demoWidgets.table.options.data;
        const csv = convertToCSV(data);
        downloadCSV(csv, 'table-data.csv');
        updateTestStatus('table', 'Dados exportados para CSV');
    }
}

function clearTable() {
    if (demoWidgets.table) {
        demoWidgets.table.update([]);
        updateTestStatus('table', 'Tabela limpa');
    }
}

function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    
    return csvContent;
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================================
// FILTERS DEMO
// ============================================================================

function initializeFiltersDemo() {
    console.log('🔍 Inicializando demonstração de Filters...');
    
    const container = document.getElementById('filter-container');
    if (!container) return;
    
    try {
        const filterWidget = new UBSWidgets.Filter(container, {
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
                    name: 'category',
                    label: 'Categoria',
                    options: [
                        { value: 'all', label: 'Todas as categorias', selected: true },
                        { value: 'electronics', label: 'Eletrônicos' },
                        { value: 'clothing', label: 'Roupas' },
                        { value: 'books', label: 'Livros' },
                        { value: 'sports', label: 'Esportes' }
                    ]
                },
                {
                    type: 'date',
                    name: 'startDate',
                    label: 'Data Inicial',
                    value: new Date().toISOString().split('T')[0]
                },
                {
                    type: 'text',
                    name: 'search',
                    label: 'Buscar',
                    placeholder: 'Digite para buscar...'
                }
            ],
            onChange: (values, target) => {
                console.log('🔄 Filtros alterados:', values);
                document.getElementById('filter-values').textContent = JSON.stringify(values, null, 2);
                updateTestStatus('filter', `Filtros alterados: ${target.name} = ${target.value}`);
            }
        });
        
        filterWidget.render();
        demoWidgets.filter = filterWidget;
        
        testResults['filter-main'] = { status: 'success', message: 'Filter criado com sucesso' };
        updateTestStatus('filter', 'Filter inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao criar filter:', error);
        testResults['filter-main'] = { status: 'error', message: error.message };
        updateTestStatus('filter', `Erro: ${error.message}`);
    }
}

function toggleFilterLayout() {
    if (demoWidgets.filter) {
        const currentLayout = demoWidgets.filter.options.layout;
        const newLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
        
        // Re-create filter with new layout
        const container = demoWidgets.filter.container;
        const options = { ...demoWidgets.filter.options, layout: newLayout };
        
        demoWidgets.filter.destroy();
        demoWidgets.filter = new UBSWidgets.Filter(container, options);
        demoWidgets.filter.render();
        
        updateTestStatus('filter', `Layout alterado para: ${newLayout}`);
    }
}

function addFilterOption() {
    updateTestStatus('filter', 'Funcionalidade de adicionar opção seria implementada aqui');
}

function getFilterValues() {
    if (demoWidgets.filter) {
        const values = demoWidgets.filter.getFilterValues();
        document.getElementById('filter-values').textContent = JSON.stringify(values, null, 2);
        updateTestStatus('filter', 'Valores dos filtros obtidos');
    }
}

function resetFilters() {
    if (demoWidgets.filter) {
        // Reset all filters to default values
        demoWidgets.filter.setFilterValue('period', '30d');
        demoWidgets.filter.setFilterValue('category', 'all');
        demoWidgets.filter.setFilterValue('startDate', '');
        demoWidgets.filter.setFilterValue('search', '');
        
        updateTestStatus('filter', 'Filtros resetados para valores padrão');
    }
}

// ============================================================================
// SECTIONS DEMO
// ============================================================================

function initializeSectionsDemo() {
    console.log('📦 Inicializando demonstração de Sections...');
    
    const container = document.getElementById('section-container');
    if (!container) return;
    
    try {
        const sectionWidget = new UBSWidgets.Section(container, {
            title: 'Seção de Demonstração',
            subtitle: 'Esta é uma seção com conteúdo dinâmico e ações personalizadas',
            collapsible: true,
            actions: [
                {
                    label: 'Exportar',
                    icon: 'fas fa-download',
                    class: 'btn-outline-primary',
                    handler: 'exportSection()'
                },
                {
                    label: 'Configurar',
                    icon: 'fas fa-cog',
                    class: 'btn-outline-secondary',
                    handler: 'configureSection()'
                },
                {
                    label: 'Atualizar',
                    icon: 'fas fa-sync-alt',
                    class: 'btn-primary',
                    handler: 'refreshSection()'
                }
            ]
        });
        
        sectionWidget.render();
        
        // Add some content to the section
        const sectionBody = sectionWidget.getBodyContainer();
        sectionBody.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">Conteúdo Dinâmico</h6>
                            <p class="card-text">Este conteúdo foi adicionado dinamicamente ao corpo da seção.</p>
                            <button class="btn btn-sm btn-primary" onclick="addSectionContent()">
                                <i class="fas fa-plus me-1"></i>Adicionar Mais
                            </button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">Estatísticas</h6>
                            <div class="d-flex justify-content-between">
                                <span>Items:</span>
                                <strong id="section-items-count">0</strong>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Última atualização:</span>
                                <strong id="section-last-update">Agora</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        demoWidgets.section = sectionWidget;
        
        testResults['section-main'] = { status: 'success', message: 'Section criada com sucesso' };
        updateTestStatus('section', 'Section inicializada com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao criar section:', error);
        testResults['section-main'] = { status: 'error', message: error.message };
        updateTestStatus('section', `Erro: ${error.message}`);
    }
}

function toggleSectionCollapse() {
    const sectionElement = document.querySelector('.section-widget');
    if (sectionElement) {
        sectionElement.classList.toggle('collapsed');
        const isCollapsed = sectionElement.classList.contains('collapsed');
        updateTestStatus('section', `Seção ${isCollapsed ? 'recolhida' : 'expandida'}`);
    }
}

function addSectionContent() {
    const sectionBody = demoWidgets.section?.getBodyContainer();
    if (sectionBody) {
        const currentCount = parseInt(document.getElementById('section-items-count')?.textContent || '0');
        const newCount = currentCount + 1;
        
        // Update counter
        const counterEl = document.getElementById('section-items-count');
        if (counterEl) counterEl.textContent = newCount;
        
        // Update timestamp
        const timestampEl = document.getElementById('section-last-update');
        if (timestampEl) timestampEl.textContent = new Date().toLocaleTimeString();
        
        updateTestStatus('section', `Conteúdo adicionado. Total: ${newCount} items`);
    }
}

function updateSectionTitle() {
    const titles = [
        'Seção de Demonstração',
        'Seção Atualizada',
        'Nova Seção',
        'Seção Modificada',
        'Seção de Teste'
    ];
    
    const currentTitle = document.querySelector('.section-title')?.textContent || '';
    const currentIndex = titles.indexOf(currentTitle);
    const newTitle = titles[(currentIndex + 1) % titles.length];
    
    const titleEl = document.querySelector('.section-title');
    if (titleEl) {
        titleEl.textContent = newTitle;
        updateTestStatus('section', `Título atualizado para: ${newTitle}`);
    }
}

function testSectionActions() {
    updateTestStatus('section', 'Clique nos botões do cabeçalho da seção para testar as ações');
}

// ============================================================================
// CONVERSATIONS DEMO
// ============================================================================

function initializeConversationsDemo() {
    console.log('💬 Inicializando demonstração de Real-Time Conversations Panel...');
    
    const container = document.getElementById('real-time-conversations-container');
    if (!container) {
        console.error('❌ Container real-time-conversations-container não encontrado');
        return;
    }
    
    try {
        // Initialize real-time conversations panel
        if (typeof window.renderRealTimeConversationsPanel === 'function') {
            window.renderRealTimeConversationsPanel(container);
            
            // Store reference
            demoWidgets.realTimeConversationsPanel = window.conversationsPanel;
            
            testResults['real-time-conversations-panel'] = { 
                status: 'success', 
                message: 'Painel de conversas em tempo real criado com sucesso' 
            };
            
            updateTestStatus('conversations', 'Real-Time Conversations Panel inicializado com sucesso!');
            
            // Update demo stats
            updateDemoStats();
            
        } else {
            throw new Error('Função renderRealTimeConversationsPanel não encontrada');
        }
        
    } catch (error) {
        console.error('❌ Erro ao criar painel de conversas em tempo real:', error);
        testResults['real-time-conversations-panel'] = { 
            status: 'error', 
            message: error.message 
        };
        updateTestStatus('conversations', 'Erro: ' + error.message);
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar painel de conversas em tempo real</div>';
    }
}

// Real-Time Conversation demo functions
function refreshRealTimeConversations() {
    const panel = window.conversationsPanel;
    if (panel) {
        panel.refreshData();
        updateTestStatus('conversations', 'Conversas em tempo real atualizadas com sucesso!');
    }
}

function toggleRealTimeAutoRefresh() {
    const panel = window.conversationsPanel;
    if (panel) {
        if (panel.intervalId) {
            panel.stopAutoRefresh();
            updateTestStatus('conversations', 'Auto-refresh parado');
        } else {
            panel.startAutoRefresh();
            updateTestStatus('conversations', 'Auto-refresh ativado (10s)');
        }
    }
}

function simulateNewConversation() {
    const panel = window.conversationsPanel;
    if (panel) {
        // Add a new tenant with conversation for simulation
        const newTenant = {
            id: `t_${Date.now()}`,
            name: `Novo Cliente ${Math.floor(Math.random() * 100)}`,
            domain: 'beauty',
            phone: `+5511${Math.floor(Math.random() * 900000000) + 100000000}`
        };
        
        panel.tenants.push(newTenant);
        panel.conversations[newTenant.id] = [{
            id: `conv_${newTenant.id}_1`,
            userId: `user_${Math.floor(Math.random() * 1000)}`,
            userName: `Cliente Simulado`,
            userPhone: `+5511${Math.floor(Math.random() * 900000000) + 100000000}`,
            startTime: new Date().toISOString(),
            duration: Math.floor(Math.random() * 300) + 30,
            lastMessage: 'Nova conversa simulada para demonstração',
            messageCount: 1,
            status: 'active'
        }];
        
        panel.updateUI();
        panel.updateStats();
        updateTestStatus('conversations', 'Nova conversa simulada adicionada!');
    }
}

function simulatePhoneActivity() {
    const panel = window.conversationsPanel;
    if (panel && panel.tenants.length > 0) {
        // Randomly modify conversation durations to simulate activity
        panel.tenants.forEach(tenant => {
            const conversations = panel.conversations[tenant.id] || [];
            conversations.forEach(conv => {
                // Simulate some time passing
                conv.duration += Math.floor(Math.random() * 30) + 10;
                conv.messageCount += Math.floor(Math.random() * 3) + 1;
            });
        });
        
        panel.updateUI();
        panel.updateStats();
        updateTestStatus('conversations', 'Atividade de telefone simulada!');
    }
}

function exportConversationsData() {
    const panel = window.conversationsPanel;
    if (panel) {
        const data = {
            tenants: panel.tenants,
            conversations: panel.conversations,
            timestamp: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'conversations-data.json';
        a.click();
        URL.revokeObjectURL(url);
        
        updateTestStatus('conversations', 'Dados de conversas exportados!');
    }
}

function testConversationsError() {
    const panel = window.conversationsPanel;
    if (panel) {
        // Simulate an error
        panel.showErrorState();
        updateTestStatus('conversations', 'Estado de erro simulado!');
        
        // Restore after 3 seconds
        setTimeout(() => {
            panel.loadData();
            updateTestStatus('conversations', 'Estado restaurado após erro simulado');
        }, 3000);
    }
}

// Update demo statistics
function updateDemoStats() {
    const panel = window.conversationsPanel;
    if (panel) {
        const totalConversations = Object.values(panel.conversations)
            .reduce((total, tenantConvs) => total + tenantConvs.length, 0);
        
        // Update stats in the demo interface
        const activeCountEl = document.getElementById('demo-active-count');
        const tenantsCountEl = document.getElementById('demo-tenants-count');
        const lastUpdateEl = document.getElementById('demo-last-update');
        const autorefreshStatusEl = document.getElementById('demo-autorefresh-status');
        
        if (activeCountEl) activeCountEl.textContent = totalConversations;
        if (tenantsCountEl) tenantsCountEl.textContent = panel.tenants.length;
        if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString('pt-BR');
        if (autorefreshStatusEl) {
            autorefreshStatusEl.textContent = panel.intervalId ? 'Ativo' : 'Inativo';
        }
    }
}

// ============================================================================
// COMPLETE DEMO
// ============================================================================

function initializeCompleteDemo() {
    console.log('🚀 Inicializando demonstração completa...');
    
    const container = document.getElementById('complete-dashboard-container');
    if (!container) return;
    
    try {
        // Use the refactored strategic appointments section as example
        if (typeof renderStrategicAppointmentsSectionWithWidgets === 'function') {
            renderStrategicAppointmentsSectionWithWidgets(container);
            updateTestStatus('complete', 'Dashboard completo renderizado com sucesso');
        } else {
            // Fallback: create a simpler complete example
            createSimpleCompleteDashboard(container);
        }
        
        testResults['complete-main'] = { status: 'success', message: 'Dashboard completo criado' };
        
    } catch (error) {
        console.error('❌ Erro ao criar dashboard completo:', error);
        testResults['complete-main'] = { status: 'error', message: error.message };
        updateTestStatus('complete', `Erro: ${error.message}`);
    }
}

function createSimpleCompleteDashboard(container) {
    // Create a simple dashboard with multiple widgets
    container.innerHTML = '';
    
    // Main section
    const mainSection = new UBSWidgets.Section(container, {
        title: 'Dashboard Completo - Demonstração',
        subtitle: 'Exemplo de dashboard usando todos os componentes do sistema'
    });
    
    mainSection.render();
    const sectionBody = mainSection.getBodyContainer();
    
    // Filters
    const filtersContainer = document.createElement('div');
    sectionBody.appendChild(filtersContainer);
    
    const filters = new UBSWidgets.Filter(filtersContainer, {
        filters: [
            {
                type: 'select',
                name: 'period',
                label: 'Período',
                options: [
                    { value: '30d', label: 'Últimos 30 dias', selected: true }
                ]
            }
        ]
    });
    filters.render();
    
    // Metrics row
    const metricsContainer = document.createElement('div');
    sectionBody.appendChild(metricsContainer);
    
    const metricsRow = new UBSWidgets.DashboardRow(metricsContainer, {
        columns: [
            { class: 'col-md-3' },
            { class: 'col-md-3' },
            { class: 'col-md-3' },
            { class: 'col-md-3' }
        ]
    });
    metricsRow.render();
    
    // Create metric cards
    const metrics = [
        { title: 'Total', value: 1250, icon: 'fas fa-chart-bar', color: 'primary' },
        { title: 'Crescimento', value: 15.2, format: 'percentage', icon: 'fas fa-arrow-up', color: 'success' },
        { title: 'Conversão', value: 3.8, format: 'percentage', icon: 'fas fa-funnel-dollar', color: 'warning' },
        { title: 'Receita', value: 85000, format: 'currency', icon: 'fas fa-dollar-sign', color: 'info' }
    ];
    
    metrics.forEach((metric, index) => {
        const card = new UBSWidgets.MetricCard(metricsRow.getColumnContainer(index), metric);
        card.render();
    });
    
    // Charts row
    const chartsContainer = document.createElement('div');
    sectionBody.appendChild(chartsContainer);
    
    const chartsRow = new UBSWidgets.DashboardRow(chartsContainer, {
        columns: [
            { class: 'col-lg-8' },
            { class: 'col-lg-4' }
        ]
    });
    chartsRow.render();
    
    // Line chart
    const lineChart = new UBSWidgets.LineChart(chartsRow.getColumnContainer(0), {
        title: 'Tendência de Vendas'
    });
    lineChart.render();
    lineChart.createChart({
        labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
        datasets: [{
            label: 'Vendas',
            data: [12000, 15000, 13000, 18000, 16000, 20000],
            borderColor: '#2D5A9B',
            backgroundColor: 'rgba(45, 90, 155, 0.1)',
            fill: true
        }]
    });
    
    // Doughnut chart
    const doughnutChart = new UBSWidgets.DoughnutChart(chartsRow.getColumnContainer(1), {
        title: 'Distribuição'
    });
    doughnutChart.render();
    doughnutChart.createChart({
        labels: ['A', 'B', 'C', 'D'],
        datasets: [{
            data: [30, 25, 25, 20],
            backgroundColor: ['#e91e63', '#2196f3', '#ff9800', '#4caf50']
        }]
    });
    
    updateTestStatus('complete', 'Dashboard simples criado com sucesso');
}

function refreshCompleteDashboard() {
    updateTestStatus('complete', 'Atualizando dashboard completo...');
    // Simulate refresh
    setTimeout(() => {
        updateTestStatus('complete', 'Dashboard atualizado com sucesso');
    }, 1000);
}

function simulateRealTimeUpdate() {
    if (isRealTimeActive) {
        isRealTimeActive = false;
        updateTestStatus('complete', 'Atualizações em tempo real desativadas');
        return;
    }
    
    isRealTimeActive = true;
    updateTestStatus('complete', 'Simulando atualizações em tempo real...');
    
    const interval = setInterval(() => {
        if (!isRealTimeActive) {
            clearInterval(interval);
            return;
        }
        
        // Update some random metrics
        const randomValue = Math.floor(Math.random() * 10000) + 1000;
        updateTestStatus('complete', `Atualização em tempo real: ${randomValue}`);
    }, 2000);
}

function changeTheme() {
    document.body.classList.toggle('dark-theme');
    updateTestStatus('complete', 'Tema alternado (funcionalidade demonstrativa)');
}

function exportDashboard() {
    updateTestStatus('complete', 'Funcionalidade de exportação seria implementada aqui');
}

function testResponsive() {
    updateTestStatus('complete', 'Redimensione a janela para testar responsividade');
}

function simulateError() {
    try {
        throw new Error('Erro simulado para teste');
    } catch (error) {
        updateTestStatus('complete', `Erro capturado: ${error.message}`);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function updateTestStatus(section, message) {
    const statusElement = document.getElementById(`${section}-status`);
    if (statusElement) {
        const timestamp = new Date().toLocaleTimeString();
        statusElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>${message}</span>
                <small class="text-muted">${timestamp}</small>
            </div>
        `;
    }
    
    console.log(`📊 [${section.toUpperCase()}] ${message}`);
    updateTestSummary();
}

function updateTestSummary() {
    const summaryContainer = document.getElementById('test-summary');
    if (!summaryContainer) return;
    
    const sections = ['metric', 'chart', 'table', 'filter', 'section', 'conversations', 'complete'];
    let totalTests = 0;
    let passedTests = 0;
    
    summaryContainer.innerHTML = '';
    
    sections.forEach(section => {
        const sectionTests = Object.keys(testResults).filter(key => key.startsWith(section));
        const sectionPassed = sectionTests.filter(key => testResults[key].status === 'success').length;
        
        totalTests += sectionTests.length;
        passedTests += sectionPassed;
        
        const percentage = sectionTests.length > 0 ? Math.round((sectionPassed / sectionTests.length) * 100) : 0;
        const statusClass = percentage === 100 ? 'success' : percentage >= 50 ? 'warning' : 'danger';
        
        summaryContainer.innerHTML += `
            <div class="col-md-4 col-lg-2">
                <div class="card text-center">
                    <div class="card-body">
                        <h6 class="card-title text-capitalize">${section}</h6>
                        <div class="progress mb-2" style="height: 8px;">
                            <div class="progress-bar bg-${statusClass}" style="width: ${percentage}%"></div>
                        </div>
                        <small class="text-${statusClass}">${sectionPassed}/${sectionTests.length} testes</small>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Overall summary
    const overallPercentage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
    const overallClass = overallPercentage === 100 ? 'success' : overallPercentage >= 80 ? 'warning' : 'danger';
    
    summaryContainer.innerHTML += `
        <div class="col-md-8 col-lg-12">
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">
                        <i class="fas fa-chart-pie me-2"></i>Resumo Geral
                    </h6>
                    <div class="progress mb-2" style="height: 12px;">
                        <div class="progress-bar bg-${overallClass}" style="width: ${overallPercentage}%"></div>
                    </div>
                    <div class="d-flex justify-content-between">
                        <span>Total de Testes: <strong>${totalTests}</strong></span>
                        <span>Sucessos: <strong class="text-${overallClass}">${passedTests}</strong></span>
                        <span>Taxa de Sucesso: <strong class="text-${overallClass}">${overallPercentage}%</strong></span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Erro:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.insertBefore(alertDiv, document.body.firstChild);
}

// Global functions for demo controls
window.showDemo = showDemo;
window.updateMetricCard = updateMetricCard;
window.toggleMetricSize = toggleMetricSize;
window.testMetricLoading = testMetricLoading;
window.updateChartData = updateChartData;
window.toggleChartTheme = toggleChartTheme;
window.exportCharts = exportCharts;
window.testChartError = testChartError;
window.addTableRow = addTableRow;
window.updateTableData = updateTableData;
window.toggleTableStyle = toggleTableStyle;
window.testTableSearch = testTableSearch;
window.exportTableData = exportTableData;
window.clearTable = clearTable;
window.toggleFilterLayout = toggleFilterLayout;
window.addFilterOption = addFilterOption;
window.getFilterValues = getFilterValues;
window.resetFilters = resetFilters;
window.toggleSectionCollapse = toggleSectionCollapse;
window.addSectionContent = addSectionContent;
window.updateSectionTitle = updateSectionTitle;
window.testSectionActions = testSectionActions;
window.refreshCompleteDashboard = refreshCompleteDashboard;
window.simulateRealTimeUpdate = simulateRealTimeUpdate;
window.changeTheme = changeTheme;
window.exportDashboard = exportDashboard;
window.testResponsive = testResponsive;
window.simulateError = simulateError;
// Real-time conversations demo functions
window.refreshRealTimeConversations = refreshRealTimeConversations;
window.toggleRealTimeAutoRefresh = toggleRealTimeAutoRefresh;
window.simulateNewConversation = simulateNewConversation;
window.simulatePhoneActivity = simulatePhoneActivity;
window.exportConversationsData = exportConversationsData;
window.testConversationsError = testConversationsError;
window.updateDemoStats = updateDemoStats;

console.log('✅ Widget Demo Script carregado com sucesso!');

function initializeHeatmapDemo() {
    // Cards de exemplo
    const cards = [
        {
            id: 'stat-card-demo-1',
            value: 128,
            label: 'Conversas Ativas',
            color: 'primary',
            icon: 'fas fa-comments'
        },
        {
            id: 'stat-card-demo-2',
            value: 97,
            label: 'Dentro do Prazo',
            color: 'success',
            icon: 'fas fa-check-circle'
        },
        {
            id: 'stat-card-demo-3',
            value: 21,
            label: 'Acima do Prazo',
            color: 'warning',
            icon: 'fas fa-exclamation-triangle'
        },
        {
            id: 'stat-card-demo-4',
            value: 10,
            label: 'Muito Demoradas',
            color: 'danger',
            icon: 'fas fa-bolt'
        }
    ];
    cards.forEach(cfg => {
        const el = document.getElementById(cfg.id);
        if (el) {
            const card = new StatCardWidget(el, cfg);
            card.render();
        }
    });
    // Heatmap mock
    const tenants = [
        { id: 't1', name: 'Salão Bella Vista', whatsapp: '+55 11 99999-1234' },
        { id: 't2', name: 'Clínica Dr. Silva', whatsapp: '+55 11 99999-5678' }
    ];
    const users = ['+55 11 98888-1111', '+55 11 97777-2222', '+55 11 96666-3333'];
    const conversations = [
        { tenantId: 't1', userPhone: '+55 11 98888-1111', status: 'excellent', messageCount: 12, lastMessageTime: 2, lastMessage: 'Olá, tudo bem?', tenantName: 'Salão Bella Vista' },
        { tenantId: 't1', userPhone: '+55 11 97777-2222', status: 'warning', messageCount: 7, lastMessageTime: 15, lastMessage: 'Preciso reagendar', tenantName: 'Salão Bella Vista' },
        { tenantId: 't2', userPhone: '+55 11 96666-3333', status: 'danger', messageCount: 3, lastMessageTime: 25, lastMessage: 'Aguardando retorno', tenantName: 'Clínica Dr. Silva' }
    ];
    // Renderizar o heatmap
    let heatmapContainer = document.getElementById('heatmap-widget-demo');
    if (!heatmapContainer) {
        heatmapContainer = document.createElement('div');
        heatmapContainer.id = 'heatmap-widget-demo';
        document.getElementById('heatmap-demo').querySelector('.demo-section').appendChild(heatmapContainer);
    }
    heatmapContainer.innerHTML = '';
    const heatmap = new window.HeatmapWidget(heatmapContainer, { tenants, users, conversations });
    heatmap.render();
} 