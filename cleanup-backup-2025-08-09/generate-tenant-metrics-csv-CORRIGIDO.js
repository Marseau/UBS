require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR CSV TENANT_METRICS CORRIGIDO
 * - Extrai dados da estrutura JSON (comprehensive, participation, ranking)
 * - Faz JOIN com tabela tenants para obter nomes
 * - Formatação brasileira (1.234,56)
 * - TODAS as métricas expandidas
 */

async function generateTenantMetricsCSVCorrected() {
    console.log('🏢 GERADOR CSV TENANT_METRICS - ESTRUTURA CORRIGIDA');
    console.log('='.repeat(70));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Buscar dados de tenant_metrics
        console.log('📊 Buscando métricas dos tenants...');
        
        const { data: tenantMetricsData, error } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, calculated_at, comprehensive_metrics, participation_metrics, ranking_metrics')
            .not('comprehensive_metrics', 'is', null)
            .order('calculated_at', { ascending: false });
        
        if (error) {
            throw new Error(`Erro ao buscar tenant_metrics: ${error.message}`);
        }
        
        // 2. Buscar dados dos tenants
        console.log('🏢 Buscando nomes dos tenants...');
        const { data: tenantsData, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, domain');
        
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        // 3. Combinar dados (manual join)
        const tenantsMap = {};
        tenantsData.forEach(tenant => {
            tenantsMap[tenant.id] = tenant;
        });
        
        const tenantMetricsWithNames = tenantMetricsData.map(metric => ({
            ...metric,
            tenants: tenantsMap[metric.tenant_id] || { business_name: 'Tenant Desconhecido', domain: 'unknown' }
        }));
        
        console.log(`📈 Processando ${tenantMetricsWithNames.length} registros tenant_metrics`);
        
        // 2. Gerar CSV com estrutura completa
        const csvData = generateCompleteTenantCSV(tenantMetricsWithNames);
        
        // 3. Salvar arquivo
        const fileName = `TENANT-METRICS-REAL-CORRIGIDO-${timestamp}.csv`;
        fs.writeFileSync(fileName, csvData);
        
        console.log(`✅ CSV gerado: ${fileName}`);
        console.log(`   📊 Registros: ${tenantMetricsWithNames.length}`);
        console.log(`   🇧🇷 Formatação: Brasileira (1.234,56)`);
        console.log(`   📋 Estrutura: JSON completa + nomes dos tenants`);
        
        // 4. Mostrar preview
        showTenantPreview(tenantMetricsWithNames);
        
        return fileName;
        
    } catch (error) {
        console.error('❌ ERRO na geração:', error);
        throw error;
    }
}

function generateCompleteTenantCSV(tenantMetrics) {
    const rows = [];
    
    // Header com TODAS as métricas da estrutura JSON
    const headers = [
        // Identificação
        'tenant_id',
        'tenant_name', 
        'domain',
        'period',
        'calculated_at',
        
        // === COMPREHENSIVE METRICS (Operacionais) ===
        'monthly_revenue_brl',
        'total_appointments',
        'confirmed_appointments',
        'cancelled_appointments', 
        'completed_appointments',
        'pending_appointments',
        'average_appointment_value_brl',
        'total_conversations',
        'services_count',
        'appointment_success_rate_pct',
        'conversation_conversion_rate_pct',
        'period_start',
        'period_end',
        
        // === PARTICIPATION METRICS (Percentuais da Plataforma) ===
        'revenue_platform_percentage',
        'appointments_platform_percentage',
        'conversations_platform_percentage',
        'tenant_ranking_position',
        'market_share_pct',
        
        // === RANKING METRICS (Avaliação e Risco) ===
        'business_health_score',
        'risk_level',
        'risk_score',
        'efficiency_score',
        'growth_potential'
    ];
    
    rows.push(headers.join(','));
    
    // Dados formatados
    tenantMetrics.forEach(tenant => {
        const comp = tenant.comprehensive_metrics || {};
        const part = tenant.participation_metrics || {};
        const rank = tenant.ranking_metrics || {};
        const tenantInfo = tenant.tenants || {};
        
        const row = [
            // Identificação
            tenant.tenant_id || '',
            `"${tenantInfo.business_name || 'N/A'}"`,
            `"${tenantInfo.domain || 'N/A'}"`,
            tenant.period || '',
            tenant.calculated_at || '',
            
            // Comprehensive (operacionais)
            formatBrazilianCurrency(comp.monthly_revenue_brl || 0),
            comp.total_appointments || 0,
            comp.confirmed_appointments || 0,
            comp.cancelled_appointments || 0,
            comp.completed_appointments || 0,
            comp.pending_appointments || 0,
            formatBrazilianCurrency(comp.average_appointment_value_brl || 0),
            comp.total_conversations || 0,
            comp.services_count || 0,
            formatBrazilianPercent(comp.appointment_success_rate_pct || 0),
            formatBrazilianPercent(comp.conversation_conversion_rate_pct || 0),
            comp.period_summary?.period_start || '',
            comp.period_summary?.period_end || '',
            
            // Participation (percentuais)
            formatBrazilianPercent(part.revenue_platform_percentage || 0),
            formatBrazilianPercent(part.appointments_platform_percentage || 0),
            formatBrazilianPercent(part.conversations_platform_percentage || 0),
            part.tenant_ranking_position || 0,
            formatBrazilianPercent(part.market_share_pct || 0),
            
            // Ranking (avaliação)
            formatBrazilianNumber(rank.business_health_score || 0),
            `"${rank.risk_level || 'N/A'}"`,
            formatBrazilianNumber(rank.risk_score || 0),
            formatBrazilianPercent(rank.efficiency_score || 0),
            `"${rank.growth_potential || 'N/A'}"`
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

function showTenantPreview(tenantMetrics) {
    console.log('\n📋 PREVIEW DOS DADOS TENANT:');
    console.log('-'.repeat(50));
    
    tenantMetrics.slice(0, 5).forEach(tenant => {
        const comp = tenant.comprehensive_metrics || {};
        const rank = tenant.ranking_metrics || {};
        const tenantInfo = tenant.tenants || {};
        
        console.log(`🏢 ${tenantInfo.business_name} (${tenant.period})`);
        console.log(`   💰 Revenue: ${formatBrazilianCurrency(comp.monthly_revenue_brl || 0)}`);
        console.log(`   📅 Appointments: ${comp.total_appointments || 0}`);
        console.log(`   💬 Conversations: ${comp.total_conversations || 0}`);
        console.log(`   ✅ Success: ${formatBrazilianPercent(comp.appointment_success_rate_pct || 0)}`);
        console.log(`   🎯 Health: ${formatBrazilianNumber(rank.business_health_score || 0)}`);
        console.log(`   ⚠️  Risk: ${rank.risk_level} (${formatBrazilianNumber(rank.risk_score || 0)})`);
        console.log('');
    });
    
    if (tenantMetrics.length > 5) {
        console.log(`   ... e mais ${tenantMetrics.length - 5} registros`);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generateTenantMetricsCSVCorrected()
        .then(fileName => {
            console.log(`\n🎉 CSV TENANT_METRICS CORRIGIDO GERADO: ${fileName}`);
            console.log('🚀 Pronto para análise com dados reais e nomes dos tenants!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA:', error);
            process.exit(1);
        });
}

module.exports = { generateTenantMetricsCSVCorrected };