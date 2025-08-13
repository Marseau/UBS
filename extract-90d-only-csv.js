/**
 * Extração CORRETA - APENAS período 90d
 * CSV limpo com nomes dos tenants visíveis
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function extract90dOnlyCSV() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 CORREÇÃO: CSV APENAS Período 90d');
    console.log('==================================\n');
    
    // Tenants solicitados
    const targetTenants = [
        'Bella Vista Spa & Salon',
        'Charme Total BH', 
        'Centro Terapêutico Equilíbrio',
        'Studio Glamour Rio',
        'Clínica Mente Sã'
    ];
    
    try {
        // 1. Buscar tenants
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .in('business_name', targetTenants);
            
        console.log('✅ Tenants encontrados:');
        tenants?.forEach(t => console.log(`   - ${t.business_name}`));
        
        const tenantIds = tenants.map(t => t.id);
        
        // 2. Extrair APENAS período 90d
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, metricas_validadas, calculated_at')
            .in('tenant_id', tenantIds)
            .eq('period', '90d')  // APENAS 90d
            .eq('metric_type', 'comprehensive')
            .not('metricas_validadas', 'is', null)
            .order('calculated_at', { ascending: false });
            
        console.log(`\n✅ ${metrics?.length || 0} registros período 90d encontrados`);
        
        // 3. Processar dados APENAS 90d - excluir colunas de outros períodos
        const csvData = [];
        
        metrics.forEach(metric => {
            const tenant = tenants.find(t => t.id === metric.tenant_id);
            const mv = metric.metricas_validadas || {};
            
            const row = {
                // IDENTIFICAÇÃO CLARA
                tenant_name: tenant?.business_name || 'Desconhecido',
                period: metric.period, // Deve ser apenas 90d
                calculated_at: new Date(metric.calculated_at).toLocaleString('pt-BR'),
                
                // MÉTRICAS PRINCIPAIS - SEM PREFIXOS DE PERÍODOS
                monthly_revenue: formatCurrency(mv.monthly_revenue),
                new_customers: formatNumber(mv.new_customers),
                total_unique_customers: formatNumber(mv.total_unique_customers_count),
                
                // TAXAS E PERCENTUAIS  
                appointment_success_rate: formatPercent(mv.appointment_success_rate),
                spam_rate_percentage: formatPercent(mv.spam_rate?.percentage),
                information_rate_percentage: formatPercent(mv.information_rate?.percentage),
                no_show_impact_percentage: formatPercent(mv.no_show_impact?.impact_percentage),
                cancellation_rate_percentage: formatPercent(mv.cancellation_rate?.percentage),
                reschedule_rate_percentage: formatPercent(mv.reschedule_rate?.percentage),
                
                // CONVERSAS
                total_conversations: formatNumber(mv.spam_rate?.total_conversations || mv.information_rate?.total_conversations),
                spam_conversations: formatNumber(mv.spam_rate?.spam_conversations),
                info_conversations: formatNumber(mv.information_rate?.info_conversations),
                
                // AGENDAMENTOS
                total_appointments: formatNumber(mv.no_show_impact?.total_appointments),
                no_show_count: formatNumber(mv.no_show_impact?.no_show_count),
                cancelled_conversations: formatNumber(mv.cancellation_rate?.cancelled_conversations),
                
                // RECEITAS E CUSTOS
                lost_revenue_no_show: formatCurrency(mv.no_show_impact?.lost_revenue),
                total_potential_revenue: formatCurrency(mv.no_show_impact?.total_potential_revenue),
                monthly_platform_cost_brl: formatCurrency(mv.monthly_platform_cost_brl?.cost_brl),
                total_system_cost_usd: formatCurrencyUSD(mv.total_system_cost_usd?.total_cost_usd),
                
                // ESTRUTURA
                services_available_count: formatNumber(mv.services_available_count),
                total_professionals_count: formatNumber(mv.total_professionals_count),
                
                // QUALIDADE IA
                confidence_score_avg: formatPercent(mv.confidence_score?.avg_confidence),
                ai_failure_rate: formatPercent(mv.ai_failure_rate?.failure_percentage)
            };
            
            csvData.push(row);
        });
        
        // 4. Verificar se há dados de outros períodos (NÃO DEVERIA HAVER)
        const periods = [...new Set(csvData.map(row => row.period))];
        console.log(`\n🔍 Períodos encontrados: ${periods.join(', ')}`);
        
        if (periods.length > 1 || !periods.includes('90d')) {
            console.log('⚠️  ATENÇÃO: Encontrados outros períodos além de 90d!');
        }
        
        // 5. Gerar CSV CORRETO
        const headers = Object.keys(csvData[0] || {});
        const csvContent = generateCSV(csvData, headers);
        const fileName = `metricas_validadas_90d_correto_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(fileName, csvContent, 'utf8');
        
        console.log(`\n✅ CSV CORRETO gerado: ${fileName}`);
        console.log(`   - ${csvData.length} linhas de dados`);
        console.log(`   - ${headers.length} colunas`);
        console.log(`   - APENAS período 90d`);
        console.log(`   - Nomes dos tenants visíveis`);
        
        // 6. Preview dos dados CORRETOS
        console.log('\n📊 DADOS CORRETOS - PERÍODO 90d:');
        console.log('================================');
        
        csvData.forEach((row, i) => {
            console.log(`\n${i+1}. ${row.tenant_name} (${row.period}):`);
            console.log(`   💰 Receita: ${row.monthly_revenue}`);
            console.log(`   👥 Novos Clientes: ${row.new_customers}`);
            console.log(`   ✅ Taxa Sucesso: ${row.appointment_success_rate}`);
            console.log(`   📞 Conversas: ${row.total_conversations}`);
        });
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(num) ? '' : num.toLocaleString('pt-BR');
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '';
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyUSD(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '';
    return `US$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '';
    return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function generateCSV(data, headers) {
    const csvRows = [];
    
    // Header
    csvRows.push(headers.join(';'));
    
    // Data
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

extract90dOnlyCSV().catch(console.error);