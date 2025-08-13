require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generateFinalCSV() {
    console.log('📊 Gerando CSV FINAL com todos os dados corretos...');
    
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
    
    // Helper para verificar se valor existe
    const getValue = (value, defaultValue = 'N/A') => {
        return value !== undefined && value !== null ? value.toString() : defaultValue;
    };
    
    // Cabeçalho CSV
    const headers = [
        'Nome do Tenant',
        'Dominio', 
        'Periodo',
        'Data Calculo',
        'Minutos Medios',
        'Total Minutos', 
        'Conversas (Min)',
        'Mensagens Medias',
        'Total Mensagens',
        'Conversas (Msg)',
        'Custo USD Medio',
        'Custo USD Total',
        'Conversas (USD)',
        'Confidence Medio',
        'Confidence Total',
        'Conversas (Conf)',
        'Clientes Unicos',
        'Servicos',
        'Profissionais',
        'Custo Plataforma BRL',
        'Status Calculo'
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
        const platformCost = data.monthly_platform_cost_brl || {};
        
        // Determinar status do cálculo
        let status = 'Completo';
        if (!avgMinutes.minutes && !avgMessages.messages) status = 'Sem dados';
        else if (data.unique_customers_count === undefined) status = 'Parcial';
        
        const row = [
            tenant.name || 'Tenant não encontrado',
            tenant.domain || 'N/A',
            metric.period || '',
            new Date(metric.calculated_at).toLocaleString('pt-BR'),
            formatNumber(avgMinutes.minutes),
            formatNumber(avgMinutes.total_minutes, 0),
            getValue(avgMinutes.total_conversations, '0'),
            formatNumber(avgMessages.messages),
            getValue(avgMessages.total_messages, '0'),
            getValue(avgMessages.total_conversations, '0'),
            formatNumber(avgCost.cost_usd || avgCost.cost, 6),
            formatNumber(avgCost.total_cost_usd || avgCost.total_cost, 6),
            getValue(avgCost.total_conversations, '0'),
            formatNumber(avgConfidence.confidence),
            formatNumber(avgConfidence.total_confidence, 0),
            getValue(avgConfidence.total_conversations, '0'),
            getValue(data.unique_customers_count),
            getValue(data.services_count),
            getValue(data.professionals_count),
            formatNumber(platformCost.cost_brl || 0),
            status
        ];
        
        csvContent += row.join(';') + '\n';
    }
    
    const timestamp = new Date().toISOString().slice(0,16).replace(/[:-]/g, '');
    const filename = `tenant-metrics-FINAL-${timestamp}.csv`;
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV FINAL gerado: ${filename}`);
    console.log(`📊 Total de registros: ${tenantMetrics.length}`);
    
    // Resumo estatístico
    console.log('\n📈 RESUMO ESTATÍSTICO:');
    const stats = {
        tenants: new Set(),
        periodsWithData: 0,
        avgMinutesCalculated: 0,
        uniqueCustomersCalculated: 0
    };
    
    tenantMetrics.forEach(metric => {
        const data = metric.metric_data || {};
        stats.tenants.add(metric.tenant_id);
        
        if (data.avg_minutes_per_conversation?.minutes > 0) {
            stats.avgMinutesCalculated++;
        }
        
        if (data.unique_customers_count !== undefined) {
            stats.uniqueCustomersCalculated++;
        }
    });
    
    console.log(`• Tenants únicos: ${stats.tenants.size}`);
    console.log(`• Registros com minutos calculados: ${stats.avgMinutesCalculated}/${tenantMetrics.length}`);
    console.log(`• Registros com clientes únicos: ${stats.uniqueCustomersCalculated}/${tenantMetrics.length}`);
    
    // Mostrar amostra dos melhores dados
    console.log('\n🏆 AMOSTRA DOS MELHORES DADOS:');
    const bestSamples = tenantMetrics
        .filter(m => m.metric_data?.avg_minutes_per_conversation?.minutes > 0)
        .slice(0, 3);
        
    bestSamples.forEach(metric => {
        const data = metric.metric_data || {};
        const tenant = tenantMap[metric.tenant_id] || {};
        const avgMinutes = data.avg_minutes_per_conversation || {};
        const avgCost = data.avg_cost_usd_per_conversation || {};
        
        console.log(`🏢 ${tenant.name} (${metric.period})`);
        console.log(`   • ${formatNumber(avgMinutes.minutes)} min/conversa de ${avgMinutes.total_conversations || 0} conversas`);
        console.log(`   • $${formatNumber(avgCost.cost_usd || avgCost.cost, 6)} USD por conversa`);
        console.log(`   • Clientes únicos: ${getValue(data.unique_customers_count, 'não calculado')}`);
        console.log('');
    });
}

generateFinalCSV().catch(console.error);