require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR CSV BASEADO NA ESTRUTURA REAL DOS SERVIÇOS
 * - Lê da estrutura metric_type + metric_data (que os serviços reais usam)
 * - Agrupa comprehensive, participation, ranking por tenant/período
 * - Formatação brasileira completa
 * - Nomes dos tenants via JOIN
 */

async function generateCSVEstruturaRealServicos() {
    console.log('🔧 GERADOR CSV - ESTRUTURA REAL DOS SERVIÇOS');
    console.log('='.repeat(70));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Buscar dados da estrutura REAL (metric_type + metric_data)
        console.log('📊 Buscando dados da estrutura REAL dos serviços...');
        
        const { data: rawMetrics, error } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, metric_data, period, calculated_at')
            .not('metric_data', 'is', null)
            .order('calculated_at', { ascending: false });
        
        if (error) {
            throw new Error(`Erro ao buscar metrics: ${error.message}`);
        }
        
        // 2. Buscar nomes dos tenants
        console.log('🏢 Buscando nomes dos tenants...');
        const { data: tenantsData, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, domain');
        
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        const tenantsMap = {};
        tenantsData.forEach(tenant => {
            tenantsMap[tenant.id] = tenant;
        });
        
        // 3. Agrupar métricas por tenant+período (consolidar comprehensive, participation, ranking)
        console.log('🔄 Agrupando métricas por tenant e período...');
        
        const groupedMetrics = {};
        
        rawMetrics.forEach(metric => {
            const key = `${metric.tenant_id}_${metric.period}`;
            
            if (!groupedMetrics[key]) {
                groupedMetrics[key] = {
                    tenant_id: metric.tenant_id,
                    period: metric.period,
                    calculated_at: metric.calculated_at,
                    comprehensive: {},
                    participation: {},
                    ranking: {}
                };
            }
            
            // Consolidar dados por tipo
            if (metric.metric_type === 'comprehensive') {
                groupedMetrics[key].comprehensive = metric.metric_data || {};
            } else if (metric.metric_type === 'participation') {
                groupedMetrics[key].participation = metric.metric_data || {};
            } else if (metric.metric_type === 'ranking') {
                groupedMetrics[key].ranking = metric.metric_data || {};
            }
        });
        
        const consolidatedMetrics = Object.values(groupedMetrics)
            .map(metric => ({
                ...metric,
                tenant_info: tenantsMap[metric.tenant_id] || { business_name: 'Tenant Desconhecido', domain: 'unknown' }
            }))
            .filter(metric => 
                Object.keys(metric.comprehensive).length > 0 || 
                Object.keys(metric.participation).length > 0 || 
                Object.keys(metric.ranking).length > 0
            );
        
        console.log(`📈 Processando ${consolidatedMetrics.length} registros consolidados`);
        
        // 4. Gerar CSV
        const csvData = generateRealStructureCSV(consolidatedMetrics);
        
        // 5. Salvar arquivo
        const fileName = `TENANT-METRICS-ESTRUTURA-REAL-SERVICOS-${timestamp}.csv`;
        fs.writeFileSync(fileName, csvData);
        
        console.log(`✅ CSV gerado: ${fileName}`);
        console.log(`   📊 Registros: ${consolidatedMetrics.length}`);
        console.log(`   🇧🇷 Formatação: Brasileira (1.234,56)`);
        console.log(`   📋 Estrutura: Baseada nos serviços reais`);
        
        // 6. Preview
        showRealDataPreview(consolidatedMetrics);
        
        return fileName;
        
    } catch (error) {
        console.error('❌ ERRO na geração:', error);
        throw error;
    }
}

function generateRealStructureCSV(metrics) {
    const rows = [];
    
    // Header expandido baseado na estrutura real dos serviços
    const headers = [
        // Identificação
        'tenant_id',
        'tenant_name',
        'domain', 
        'period',
        'calculated_at',
        
        // === COMPREHENSIVE METRICS (da estrutura metric_data dos serviços) ===
        'total_revenue_brl',
        'total_appointments',
        'confirmed_appointments',
        'cancelled_appointments',
        'completed_appointments',
        'pending_appointments',
        'average_appointment_value_brl',
        'total_customers',
        'new_customers',
        'returning_customers',
        'business_health_score',
        'revenue_growth_rate_pct',
        'customer_growth_rate_pct',
        'appointments_growth_rate_pct',
        
        // === PARTICIPATION METRICS ===
        'revenue_platform_percentage',
        'appointments_platform_percentage',
        'customers_platform_percentage',
        'tenant_market_position',
        
        // === RANKING METRICS ===
        'risk_level',
        'risk_score',
        'period_start',
        'period_end',
        
        // Metadata
        'data_source',
        'metric_types_available'
    ];
    
    rows.push(headers.join(','));
    
    // Dados formatados
    metrics.forEach(metric => {
        const comp = metric.comprehensive || {};
        const part = metric.participation || {};
        const rank = metric.ranking || {};
        const tenantInfo = metric.tenant_info || {};
        
        const row = [
            // Identificação
            metric.tenant_id || '',
            `"${tenantInfo.business_name || 'N/A'}"`,
            `"${tenantInfo.domain || 'N/A'}"`,
            metric.period || '',
            metric.calculated_at || '',
            
            // Comprehensive (operacionais)
            formatBrazilianCurrency(comp.total_revenue || 0),
            comp.total_appointments || 0,
            comp.confirmed_appointments || 0,
            comp.cancelled_appointments || 0,
            comp.completed_appointments || 0,
            comp.pending_appointments || 0,
            formatBrazilianCurrency(comp.average_value || 0),
            comp.total_customers || 0,
            comp.new_customers || 0,
            comp.returning_customers || 0,
            formatBrazilianNumber(comp.business_health_score || 0),
            formatBrazilianPercent(comp.revenue_growth_rate || 0),
            formatBrazilianPercent(comp.customer_growth_rate || 0),
            formatBrazilianPercent(comp.appointments_growth_rate || 0),
            
            // Participation
            formatBrazilianPercent(comp.revenue_platform_percentage || part.revenue_platform_percentage || 0),
            formatBrazilianPercent(comp.appointments_platform_percentage || part.appointments_platform_percentage || 0),
            formatBrazilianPercent(comp.customers_platform_percentage || part.customers_platform_percentage || 0),
            `"${part.market_position || 'N/A'}"`,
            
            // Ranking
            `"${comp.risk_level || rank.risk_level || 'N/A'}"`,
            formatBrazilianNumber(comp.risk_score || rank.risk_score || 0),
            comp.period_start || rank.period_start || '',
            comp.period_end || rank.period_end || '',
            
            // Metadata
            '"servicos_reais"',
            `"${Object.keys(metric.comprehensive).length > 0 ? 'comprehensive ' : ''}${Object.keys(metric.participation).length > 0 ? 'participation ' : ''}${Object.keys(metric.ranking).length > 0 ? 'ranking' : ''}".trim()`
        ];
        
        rows.push(row.join(','));
    });
    
    return rows.join('\n');
}

function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return '"R$ 0,00"';
    
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `"${formatted}"`; 
}

function formatBrazilianPercent(value) {
    if (!value || isNaN(value)) return '"0,00%"';
    
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + '%';
    
    return `"${formatted}"`;
}

function formatBrazilianNumber(value) {
    if (!value || isNaN(value)) return '"0,00"';
    
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `"${formatted}"`;
}

function showRealDataPreview(metrics) {
    console.log('\n📋 PREVIEW DOS DADOS REAIS DOS SERVIÇOS:');
    console.log('-'.repeat(50));
    
    metrics.slice(0, 5).forEach(metric => {
        const comp = metric.comprehensive || {};
        const tenantInfo = metric.tenant_info || {};
        
        console.log(`🏢 ${tenantInfo.business_name} (${metric.period})`);
        console.log(`   💰 Revenue: ${formatBrazilianCurrency(comp.total_revenue || 0)}`);
        console.log(`   📅 Appointments: ${comp.total_appointments || 0}`);
        console.log(`   👥 Customers: ${comp.total_customers || 0}`);
        console.log(`   🎯 Health Score: ${formatBrazilianNumber(comp.business_health_score || 0)}`);
        console.log(`   ⚠️  Risk: ${comp.risk_level || 'N/A'} (${formatBrazilianNumber(comp.risk_score || 0)})`);
        console.log('');
    });
    
    if (metrics.length > 5) {
        console.log(`   ... e mais ${metrics.length - 5} registros`);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generateCSVEstruturaRealServicos()
        .then(fileName => {
            console.log(`\n🎉 CSV ESTRUTURA REAL GERADO: ${fileName}`);
            console.log('🔧 Baseado na estrutura que os serviços realmente usam!');
            console.log('📊 Dados reais extraídos corretamente!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA:', error);
            process.exit(1);
        });
}

module.exports = { generateCSVEstruturaRealServicos };