require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR CSV PLATFORM_METRICS REFATORADO
 * - Estrutura JSON (comprehensive, participation, ranking)
 * - Formatação brasileira (1.234,56)
 * - Todas as métricas expandidas
 */

async function generatePlatformMetricsCSV() {
    console.log('🏢 GERADOR CSV PLATFORM_METRICS - ESTRUTURA REFATORADA');
    console.log('='.repeat(70));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Buscar dados da nova estrutura platform_metrics
        console.log('📊 Buscando métricas da plataforma refatorada...');
        
        const { data: platformMetrics, error } = await supabase
            .from('platform_metrics')
            .select(`
                calculation_date, period,
                comprehensive_metrics, participation_metrics, ranking_metrics,
                tenants_processed, total_tenants, calculation_method,
                created_at
            `)
            .not('comprehensive_metrics', 'is', null)
            .order('calculation_date', { ascending: false })
            .order('period');
        
        if (error) {
            throw new Error(`Erro ao buscar platform_metrics: ${error.message}`);
        }
        
        console.log(`📈 Processando ${platformMetrics.length} registros platform_metrics`);
        
        // 2. Gerar CSV com estrutura elegante
        const csvData = generatePlatformCSV(platformMetrics);
        
        // 3. Salvar arquivo
        const fileName = `PLATFORM-METRICS-REFATORADO-BRASILEIRO-${timestamp}.csv`;
        fs.writeFileSync(fileName, csvData);
        
        console.log(`✅ CSV gerado: ${fileName}`);
        console.log(`   📊 Registros: ${platformMetrics.length}`);
        console.log(`   🇧🇷 Formatação: Brasileira (1.234,56)`);
        console.log(`   📋 Estrutura: 3 JSONs especializados da plataforma`);
        
        // 4. Mostrar preview
        showPlatformPreview(platformMetrics);
        
        return fileName;
        
    } catch (error) {
        console.error('❌ ERRO na geração:', error);
        throw error;
    }
}

function generatePlatformCSV(platformMetrics) {
    const rows = [];
    
    // Header com todas as métricas da plataforma
    const headers = [
        // Identificação
        'calculation_date',
        'period',
        'tenants_processed',
        'total_tenants',
        'calculation_method',
        'created_at',
        
        // === COMPREHENSIVE METRICS (Operacionais da Plataforma) ===
        'total_platform_revenue_brl',
        'platform_mrr_total_brl',
        'total_platform_appointments',
        'total_platform_conversations',
        'active_tenants_count',
        'platform_health_score',
        'operational_efficiency_pct',
        'platform_quality_score',
        'total_chat_minutes',
        
        // === PARTICIPATION METRICS (Distribuição e Ratios) ===
        'receita_uso_ratio',
        'revenue_usage_distortion_index',
        'platform_avg_conversion_rate_pct',
        'tenants_above_usage',
        'tenants_below_usage', 
        'platform_high_risk_tenants',
        'spam_rate_pct',
        'cancellation_rate_pct',
        
        // === RANKING METRICS (Scores e Rankings) ===
        'overall_platform_score',
        'health_index',
        'efficiency_index',
        'platform_avg_clv_brl',
        'high_risk_count',
        'platform_ranking'
    ];
    
    rows.push(headers.join(','));
    
    // Dados formatados
    platformMetrics.forEach(platform => {
        const comp = platform.comprehensive_metrics || {};
        const part = platform.participation_metrics || {};
        const rank = platform.ranking_metrics || {};
        
        const row = [
            // Identificação
            platform.calculation_date || '',
            platform.period || '',
            platform.tenants_processed || 0,
            platform.total_tenants || 0,
            `"${platform.calculation_method || ''}"`,
            platform.created_at || '',
            
            // Comprehensive (operacionais da plataforma)
            formatBrazilianCurrency(comp.total_platform_revenue || 0),
            formatBrazilianCurrency(comp.platform_mrr_total || 0),
            comp.total_platform_appointments || 0,
            comp.total_platform_conversations || 0,
            comp.active_tenants_count || 0,
            formatBrazilianNumber(comp.platform_health_score || 0),
            formatBrazilianPercent(comp.operational_efficiency_pct || 0),
            formatBrazilianNumber(comp.platform_quality_score || 0),
            formatBrazilianNumber(comp.period_summary?.total_chat_minutes || 0),
            
            // Participation (distribuição)
            formatBrazilianNumber(part.receita_uso_ratio || 0),
            formatBrazilianNumber(part.revenue_usage_distortion_index || 0),
            formatBrazilianPercent(part.platform_avg_conversion_rate || 0),
            part.tenants_above_usage || 0,
            part.tenants_below_usage || 0,
            part.platform_high_risk_tenants || 0,
            formatBrazilianPercent(part.spam_rate_pct || 0),
            formatBrazilianPercent(part.cancellation_rate_pct || 0),
            
            // Ranking (scores)
            formatBrazilianNumber(rank.overall_platform_score || 0),
            formatBrazilianNumber(rank.health_index || 0),
            formatBrazilianNumber(rank.efficiency_index || 0),
            formatBrazilianCurrency(rank.platform_avg_clv || 0),
            rank.risk_distribution?.high_risk_count || 0,
            `"${rank.platform_ranking || 'N/A'}"`
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
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
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

function showPlatformPreview(platformMetrics) {
    console.log('\n📋 PREVIEW DOS DADOS PLATFORM:');
    console.log('-'.repeat(50));
    
    platformMetrics.slice(0, 3).forEach(platform => {
        const comp = platform.comprehensive_metrics || {};
        const part = platform.participation_metrics || {};
        const rank = platform.ranking_metrics || {};
        
        console.log(`🏢 Plataforma (${platform.period}) - ${platform.calculation_date}`);
        console.log(`   📊 Revenue: ${formatBrazilianCurrency(comp.total_platform_revenue || 0)}`);
        console.log(`   💰 MRR: ${formatBrazilianCurrency(comp.platform_mrr_total || 0)}`);
        console.log(`   🏢 Tenants Ativos: ${comp.active_tenants_count || 0}`);
        console.log(`   📅 Appointments: ${comp.total_platform_appointments || 0}`);
        console.log(`   📈 Health Score: ${formatBrazilianNumber(comp.platform_health_score || 0)}`);
        console.log('');
    });
    
    if (platformMetrics.length > 3) {
        console.log(`   ... e mais ${platformMetrics.length - 3} registros`);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generatePlatformMetricsCSV()
        .then(fileName => {
            console.log(`\n🎉 CSV PLATFORM_METRICS BRASILEIRO GERADO: ${fileName}`);
            console.log('🚀 Pronto para validação manual das métricas da plataforma!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA:', error);
            process.exit(1);
        });
}

module.exports = { generatePlatformMetricsCSV };