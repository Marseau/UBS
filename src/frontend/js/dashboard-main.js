document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Dashboard] Initializing new dashboard structure...');

    // Inicializar estado do tenant platform como null ao fazer login
    // Isso garante que super admin sempre comece no dashboard sistema
    if (!window.tenantPlatformSelectedTenant) {
        window.tenantPlatformSelectedTenant = null;
        console.log('🔗 Initialized tenantPlatformSelectedTenant as null for main dashboard');
    }

    // Pega o container principal onde o dashboard será renderizado
    const container = document.getElementById('dashboard-container');
    if (!container) {
        console.error('Dashboard container not found!');
        return;
    }

    // Inicializa o sistema de widgets com o container principal
    const widgetSystem = new DashboardWidgetSystem(container);

    // --- FASE 1: Construir a Estrutura Completa do Dashboard (A "Receita") ---
    // Esta função cria todos os placeholders de seções e widgets, exatamente como no widget-demo.html
    const widgets = createFullDashboardLayout(widgetSystem);
    console.log('[Dashboard] Full widget layout created successfully.');


    // --- FASE 2: Buscar Dados do Backend ---
    // Esta lógica foi adaptada do antigo dashboard.js para buscar dados reais.
    let dashboardData = null;
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const tenantId = localStorage.getItem('tenantId');
        const token = localStorage.getItem('token');

        if (!user || !token) {
            window.location.href = '/login.html';
            return;
        }

        const API_URL = user.role === 'super_admin' ?
            '/api/admin/dashboard-data' :
            `/api/analytics/dashboard?tenantId=${tenantId}`;

        const response = await fetch(API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch dashboard data. Status: ${response.status}`);
        }
        dashboardData = await response.json();
        console.log('[Dashboard] Backend data fetched successfully.', dashboardData);
    } catch (error) {
        console.error('[Dashboard] Critical error fetching data:', error);
        // Opcional: Renderizar um estado de erro no dashboard
        container.innerHTML = `<div class="alert alert-danger">Falha ao carregar os dados do dashboard. Tente novamente mais tarde.</div>`;
        return;
    }


    // --- FASE 3: Renderizar os Widgets com os Dados do Backend ---
    // Mapeia os dados recebidos para cada widget e chama a função .render()
    if (dashboardData) {
        renderAllWidgets(widgets, dashboardData);
        console.log('[Dashboard] All widgets rendered with backend data.');
    }
});


/**
 * Constrói a estrutura visual completa do dashboard usando o sistema de widgets.
 * @param {DashboardWidgetSystem} widgetSystem - A instância do sistema de widgets.
 * @returns {Object} - Um objeto contendo todas as instâncias de widgets criadas.
 */
function createFullDashboardLayout(widgetSystem) {
    const widgets = {};

    // Seção 1: Visão Geral Operacional (Para todos)
    widgetSystem.addSection('Visão Geral Operacional', 'Métricas chave do dia a dia.');
    widgets.totalRevenue = widgetSystem.addWidget('kpi-card', { title: 'Receita Total', icon: 'fa-dollar-sign' });
    widgets.totalAppointments = widgetSystem.addWidget('kpi-card', { title: 'Agendamentos', icon: 'fa-calendar-check' });
    widgets.newCustomers = widgetSystem.addWidget('kpi-card', { title: 'Novos Clientes', icon: 'fa-user-plus' });
    widgets.avgRating = widgetSystem.addWidget('kpi-card', { title: 'Avaliação Média', icon: 'fa-star' });

    // Seção 2: Gráficos Operacionais (Para todos)
    widgetSystem.addSection('Análise de Performance', 'Visualização de tendências e distribuição.');
    widgets.revenueGrowth = widgetSystem.addWidget('line-chart', { title: 'Evolução da Receita (Últimos 30 dias)' });
    widgets.serviceDistribution = widgetSystem.addWidget('doughnut-chart', { title: 'Distribuição por Serviço' });

    // Seção 3: Análise de Conversas (Para todos)
    widgetSystem.addSection('Painel de Conversas', 'Análise das interações recentes via WhatsApp.');
    widgets.conversationsPanel = widgetSystem.addWidget('conversations-panel', { title: 'Últimas Conversas' });


    // --- Seções Exclusivas para Super Admin ---
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.role === 'super_admin') {
        // Seção 4: Métricas da Plataforma (Super Admin)
        widgetSystem.addSection('Métricas da Plataforma (SaaS)', 'Indicadores chave de saúde do negócio.');
        widgets.mrr = widgetSystem.addWidget('kpi-card', { title: 'MRR', icon: 'fa-chart-line' });
        widgets.activeTenants = widgetSystem.addWidget('kpi-card', { title: 'Tenants Ativos', icon: 'fa-store' });
        widgets.tenantGrowth = widgetSystem.addWidget('kpi-card', { title: 'Cresc. de Tenants (Mês)', icon: 'fa-arrow-trend-up' });
        widgets.churnRate = widgetSystem.addWidget('kpi-card', { title: 'Taxa de Churn', icon: 'fa-arrow-trend-down' });

        // Seção 5: Rankings da Plataforma (Super Admin)
        widgetSystem.addSection('Rankings e Tabelas', 'Visão comparativa do ecossistema.');
        widgets.topTenantsByRevenue = widgetSystem.addWidget('data-table', { title: 'Top 5 Tenants por Receita' });
        widgets.topProfessionalsByAppointments = widgetSystem.addWidget('data-table', { title: 'Top 5 Profissionais por Agendamentos' });
    }

    return widgets;
}

/**
 * Renderiza todos os widgets com os dados recebidos do backend.
 * @param {Object} widgets - O objeto com as instâncias dos widgets.
 * @param {Object} data - Os dados completos do dashboard vindos da API.
 */
function renderAllWidgets(widgets, data) {
    // Renderiza widgets comuns
    widgets.totalRevenue?.render({ value: data.kpis.total_revenue, format: 'currency' });
    widgets.totalAppointments?.render({ value: data.kpis.total_appointments });
    widgets.newCustomers?.render({ value: data.kpis.new_customers });
    widgets.avgRating?.render({ value: data.kpis.average_rating, suffix: '/ 5' });

    widgets.revenueGrowth?.render(data.charts.revenue_over_time);
    widgets.serviceDistribution?.render(data.charts.service_distribution);
    widgets.conversationsPanel?.render(data.conversations);

    // Renderiza widgets de Super Admin, se existirem e os dados estiverem disponíveis
    if (data.saas_kpis) {
        widgets.mrr?.render({ value: data.saas_kpis.mrr, format: 'currency' });
        widgets.activeTenants?.render({ value: data.saas_kpis.active_tenants });
        widgets.tenantGrowth?.render({ value: data.saas_kpis.tenant_growth_monthly });
        widgets.churnRate?.render({ value: data.saas_kpis.churn_rate_monthly, suffix: '%' });
    }

    if(data.rankings) {
        widgets.topTenantsByRevenue?.render(data.rankings.top_tenants_by_revenue);
        widgets.topProfessionalsByAppointments?.render(data.rankings.top_professionals_by_appointments);
    }
} 