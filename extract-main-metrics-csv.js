/**
 * Extrator focado em métricas principais - CSV otimizado
 * Formato mais legível com colunas principais
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function extractMainMetricsToCSV() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 CSV OTIMIZADO: Métricas Principais - Período 90d');
    console.log('===============================================\n');
    
    // Tenants solicitados
    const targetTenants = [
        'Bella Vista Spa & Salon',
        'Charme Total BH', 
        'Centro Terapêutico Equilíbrio',
        'Studio Glamour Rio',
        'Clínica Mente Sã'
    ];
    
    try {
        // 1. Buscar tenants e métricas
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .in('business_name', targetTenants);
            
        const tenantIds = tenants.map(t => t.id);
        
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, metricas_validadas, calculated_at')
            .in('tenant_id', tenantIds)
            .eq('period', '90d')
            .eq('metric_type', 'comprehensive')
            .not('metricas_validadas', 'is', null)
            .order('calculated_at', { ascending: false });
            
        console.log(`✅ ${metrics?.length || 0} registros processados`);
        
        // 2. Headers focados em métricas principais
        const mainHeaders = [
            'tenant_name',
            'period',
            'calculated_at',
            'monthly_revenue',
            'new_customers', 
            'total_unique_customers',
            'appointment_success_rate',
            'total_conversations',
            'spam_rate_percentage',
            'information_rate_percentage',
            'no_show_impact_percentage',
            'cancellation_rate_percentage',
            'services_available_count',
            'total_professionals',
            'monthly_platform_cost_brl',
            'total_system_cost_usd'
        ];
        
        // 3. Processar dados
        const csvData = [];
        
        metrics.forEach(metric => {
            const tenantName = tenants.find(t => t.id === metric.tenant_id)?.business_name || 'Desconhecido';
            const mv = metric.metricas_validadas || {};
            
            const row = {
                tenant_name: tenantName,
                period: metric.period,
                calculated_at: new Date(metric.calculated_at).toLocaleString('pt-BR'),
                monthly_revenue: formatBrazilianCurrency(mv.monthly_revenue),
                new_customers: formatBrazilianNumber(mv.new_customers),
                total_unique_customers: formatBrazilianNumber(mv.total_unique_customers_count),
                appointment_success_rate: formatBrazilianPercentage(mv.appointment_success_rate),
                total_conversations: formatBrazilianNumber(mv.spam_rate?.total_conversations),
                spam_rate_percentage: formatBrazilianPercentage(mv.spam_rate?.percentage),
                information_rate_percentage: formatBrazilianPercentage(mv.information_rate?.percentage),
                no_show_impact_percentage: formatBrazilianPercentage(mv.no_show_impact?.impact_percentage),
                cancellation_rate_percentage: formatBrazilianPercentage(mv.cancellation_rate?.percentage),
                services_available_count: formatBrazilianNumber(mv.services_available_count),
                total_professionals: formatBrazilianNumber(mv.total_professionals_count),
                monthly_platform_cost_brl: formatBrazilianCurrency(mv.monthly_platform_cost_brl?.cost_brl),
                total_system_cost_usd: formatBrazilianCurrency(mv.total_system_cost_usd?.total_cost_usd, 'USD')
            };
            
            csvData.push(row);
        });
        
        // 4. Gerar CSV otimizado
        const csvContent = generateOptimizedCSV(csvData, mainHeaders);
        const fileName = `metricas_principais_90d_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(fileName, csvContent, 'utf8');
        
        console.log(`✅ CSV otimizado gerado: ${fileName}`);
        console.log(`   - ${csvData.length} linhas de dados`);
        console.log(`   - ${mainHeaders.length} colunas principais`);
        
        // 5. Preview detalhado
        console.log('\n📊 RESUMO DOS DADOS:');
        console.log('===================');
        
        csvData.forEach((row, i) => {
            console.log(`\n${i+1}. ${row.tenant_name}:`);
            console.log(`   💰 Receita Mensal: ${row.monthly_revenue}`);
            console.log(`   👥 Novos Clientes: ${row.new_customers}`);
            console.log(`   📞 Total Conversas: ${row.total_conversations}`);
            console.log(`   ✅ Taxa Sucesso: ${row.appointment_success_rate}`);
            console.log(`   🚫 Taxa Spam: ${row.spam_rate_percentage}`);
            console.log(`   ❌ Taxa No-Show: ${row.no_show_impact_percentage}`);
        });
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

function formatBrazilianNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
        return value.toLocaleString('pt-BR');
    }
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
        return parseFloat(value).toLocaleString('pt-BR');
    }
    return String(value);
}

function formatBrazilianCurrency(value, currency = 'BRL') {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '';
    
    const formatted = num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return currency === 'BRL' ? `R$ ${formatted}` : `US$ ${formatted}`;
}

function formatBrazilianPercentage(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '';
    
    return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function generateOptimizedCSV(data, headers) {
    const csvRows = [];
    
    // Header row
    csvRows.push(headers.join(';'));
    
    // Data rows
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(';'));
    });
    
    return csvRows.join('\n');
}

extractMainMetricsToCSV().catch(console.error);