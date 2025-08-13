require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generatePerfectCSV() {
    console.log('📊 Gerando CSV PERFEITO com todas as métricas validadas...');
    
    // Buscar tenants
    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, domain');
        
    const tenantMap = {};
    tenants.forEach(tenant => {
        tenantMap[tenant.id] = tenant;
    });
    
    // Buscar métricas de hoje
    const today = new Date().toISOString().split('T')[0];
     
    const { data: tenantMetrics } = await supabase
        .from('tenant_metrics')
        .select('*')
        .gte('calculated_at', today)
        .order('tenant_id', { ascending: true })
        .order('period', { ascending: true });
    
    console.log(`✅ Encontrados ${tenantMetrics.length} registros de métricas de hoje`);
    
    // Helper para formatar números
    const formatNumber = (value, decimals = 2) => {
        if (value === null || value === undefined) return '0,00';
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return num.toFixed(decimals).replace('.', ',');
    };
    
    // Helper para extrair valores de objetos
    const extractValue = (obj, property = 'count') => {
        if (!obj) return 'N/A';
        if (typeof obj === 'object' && obj[property] !== undefined) {
            return obj[property].toString();
        }
        if (typeof obj === 'number') return obj.toString();
        return 'N/A';
    };
    
    // Cabeçalho CSV
    const headers = [
        'Nome do Tenant',
        'Dominio', 
        'Periodo',
        'Data Calculo',
        'Minutos Medios por Conversa',
        'Total Minutos', 
        'Total Conversas',
        'Mensagens Medias por Conversa',
        'Total Mensagens',
        'Custo USD Medio por Conversa',
        'Custo USD Total',
        'Confidence Score Medio',
        'Confidence Total',
        'Clientes Unicos',
        'Servicos Disponiveis',
        'Servicos Ativos',
        'Profissionais',
        'Custo Plataforma BRL (Periodo)',
        'Historico 6M - Conversas M1',
        'Historico 6M - Conversas M2',
        'Historico 6M - Conversas M3',
        'Historico 6M - Revenue M1',
        'Historico 6M - Revenue M2',
        'Historico 6M - Revenue M3'
    ];
    
    let csvContent = headers.join(';') + '\n';
    
    for (const metric of tenantMetrics) {
        const data = metric.metric_data || {};
        const tenant = tenantMap[metric.tenant_id] || {};
        
        // Extrair dados de cada métrica
        const avgMinutes = data.avg_minutes_per_conversation || {};
        const avgMessages = data.avg_messages_per_conversation || {};
        const avgCost = data.avg_cost_usd_per_conversation || {};
        const avgConfidence = data.avg_confidence_per_conversation || {};
        const uniqueCustomers = data.unique_customers_count || {};
        const services = data.services_count || {};
        const professionals = data.professionals_count || {};
        const platformCost = data.monthly_platform_cost_brl || {};
        const historicalConversations = data.six_months_conversations || {};
        const historicalRevenue = data.six_months_revenue || {};
        
        const row = [
            tenant.name || 'Tenant não encontrado',
            tenant.domain || 'N/A',
            metric.period || '',
            new Date(metric.calculated_at).toLocaleString('pt-BR'),
            formatNumber(avgMinutes.minutes),
            formatNumber(avgMinutes.total_minutes, 0),
            (avgMinutes.total_conversations || 0).toString(),
            formatNumber(avgMessages.messages),
            (avgMessages.total_messages || 0).toString(),
            formatNumber(avgCost.cost_usd || avgCost.cost, 6),
            formatNumber(avgCost.total_cost_usd || avgCost.total_cost, 6),
            formatNumber(avgConfidence.confidence),
            formatNumber(avgConfidence.total_confidence, 0),
            extractValue(uniqueCustomers, 'count'),
            extractValue(services, 'count'),
            extractValue(services, 'active_count'),
            extractValue(professionals, 'count'),
            formatNumber(platformCost.cost_brl || 0),
            historicalConversations.month_1 || '0',
            historicalConversations.month_2 || '0',
            historicalConversations.month_3 || '0',
            formatNumber(historicalRevenue.month_1 || 0),
            formatNumber(historicalRevenue.month_2 || 0),
            formatNumber(historicalRevenue.month_3 || 0)
        ];
        
        csvContent += row.join(';') + '\n';
    }
    
    const timestamp = new Date().toISOString().slice(0,16).replace(/[:-]/g, '');
    const filename = `tenant-metrics-PERFEITO-${timestamp}.csv`;
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV PERFEITO gerado: ${filename}`);
    console.log(`📊 Total de registros: ${tenantMetrics.length}`);
    
    // Resumo estatístico detalhado
    console.log('\n📈 RESUMO DETALHADO DAS MÉTRICAS:');
    
    const summary = {
        tenantsUnicos: new Set(),
        comMinutos: 0,
        comClientes: 0,
        comServicos: 0,
        comHistorico: 0
    };
    
    tenantMetrics.forEach(metric => {
        const data = metric.metric_data || {};
        summary.tenantsUnicos.add(metric.tenant_id);
        
        if (data.avg_minutes_per_conversation?.minutes > 0) summary.comMinutos++;
        if (data.unique_customers_count?.count > 0) summary.comClientes++;
        if (data.services_count?.count > 0) summary.comServicos++;
        if (data.six_months_conversations?.month_1 > 0) summary.comHistorico++;
    });
    
    console.log(`• Tenants únicos processados: ${summary.tenantsUnicos.size}`);
    console.log(`• Registros com minutos calculados: ${summary.comMinutos}/${tenantMetrics.length}`);
    console.log(`• Registros com clientes únicos: ${summary.comClientes}/${tenantMetrics.length}`);
    console.log(`• Registros com serviços calculados: ${summary.comServicos}/${tenantMetrics.length}`);
    console.log(`• Registros com histórico 6 meses: ${summary.comHistorico}/${tenantMetrics.length}`);
    
    // Mostrar amostra dos melhores dados
    console.log('\n🏆 AMOSTRA DOS DADOS MAIS COMPLETOS:');
    const bestSamples = tenantMetrics
        .filter(m => m.metric_data?.avg_minutes_per_conversation?.minutes > 0)
        .slice(0, 3);
        
    bestSamples.forEach(metric => {
        const data = metric.metric_data || {};
        const tenant = tenantMap[metric.tenant_id] || {};
        const avgMinutes = data.avg_minutes_per_conversation || {};
        const avgCost = data.avg_cost_usd_per_conversation || {};
        const uniqueCustomers = data.unique_customers_count || {};
        const services = data.services_count || {};
        
        console.log(`🏢 ${tenant.name} (${metric.period})`);
        console.log(`   • ${formatNumber(avgMinutes.minutes)} min/conversa (${avgMinutes.total_conversations || 0} conversas)`);
        console.log(`   • $${formatNumber(avgCost.cost_usd || avgCost.cost, 6)} USD por conversa`);
        console.log(`   • ${uniqueCustomers.count || 0} clientes únicos`);
        console.log(`   • ${services.count || 0} serviços (${services.active_count || 0} ativos)`);
        console.log('');
    });
}

generatePerfectCSV().catch(console.error);