require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR CSV REFATORADO COM FORMATAÇÃO BRASILEIRA
 * - Todas as métricas expandidas dos 3 JSONs
 * - tenant_name incluído
 * - Valores decimais formatados (1.234,56)
 * - Estrutura semântica elegante
 */

async function generateBrazilianFormattedCSV() {
    console.log('🇧🇷 GERADOR CSV BRASILEIRO - ESTRUTURA REFATORADA');
    console.log('='.repeat(70));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Buscar dados da nova estrutura
        console.log('📊 Buscando métricas da estrutura refatorada...');
        
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select(`
                tenant_id, tenant_name, period, 
                comprehensive_metrics, participation_metrics, ranking_metrics,
                calculated_at
            `)
            .not('comprehensive_metrics', 'is', null)
            .order('tenant_name, period');
        
        if (error) {
            throw new Error(`Erro ao buscar métricas: ${error.message}`);
        }
        
        console.log(`📈 Processando ${metrics.length} registros refatorados`);
        
        // 2. Gerar CSV com estrutura elegante
        const csvData = generateElegantCSV(metrics);
        
        // 3. Salvar arquivo
        const fileName = `TENANT-METRICS-REFATORADO-BRASILEIRO-${timestamp}.csv`;
        fs.writeFileSync(fileName, csvData);
        
        console.log(`✅ CSV gerado: ${fileName}`);
        console.log(`   📊 Registros: ${metrics.length}`);
        console.log(`   🇧🇷 Formatação: Brasileira (1.234,56)`);
        console.log(`   📋 Estrutura: 3 JSONs especializados`);
        
        // 4. Mostrar preview
        showPreview(metrics);
        
        return fileName;
        
    } catch (error) {
        console.error('❌ ERRO na geração:', error);
        throw error;
    }
}

function generateElegantCSV(metrics) {
    const rows = [];
    
    // Header com todas as métricas possíveis
    const headers = [
        // Identificação
        'tenant_id',
        'tenant_name', 
        'period',
        'calculated_at',
        
        // === COMPREHENSIVE METRICS (Operacionais) ===
        'total_appointments',
        'confirmed_appointments', 
        'cancelled_appointments',
        'completed_appointments',
        'pending_appointments',
        'total_revenue_brl',
        'average_value_brl', 
        'total_conversations',
        'services_count',
        'ai_success_rate_pct',
        'conversion_rate_pct',
        'period_start',
        'period_end',
        
        // === PARTICIPATION METRICS (Percentuais) ===
        'revenue_platform_percentage',
        'appointments_platform_percentage',
        'conversations_platform_percentage',
        
        // === RANKING METRICS (Scores) ===
        'business_health_score',
        'risk_level',
        'risk_score'
    ];
    
    rows.push(headers.join(','));
    
    // Dados formatados
    metrics.forEach(metric => {
        const comp = metric.comprehensive_metrics || {};
        const part = metric.participation_metrics || {};
        const rank = metric.ranking_metrics || {};
        
        const row = [
            // Identificação
            metric.tenant_id || '',
            `"${metric.tenant_name || ''}"`, // Aspas para nomes com vírgula
            metric.period || '',
            metric.calculated_at || '',
            
            // Comprehensive (operacionais)
            comp.total_appointments || 0,
            comp.confirmed_appointments || 0,
            comp.cancelled_appointments || 0, 
            comp.completed_appointments || 0,
            comp.pending_appointments || 0,
            formatBrazilianCurrency(comp.total_revenue || 0),
            formatBrazilianCurrency(comp.average_value || 0),
            comp.total_conversations || 0,
            comp.services_count || 0,
            formatBrazilianPercent(comp.ai_success_rate || 0),
            formatBrazilianPercent(comp.conversion_rate || 0),
            comp.period_start || '',
            comp.period_end || '',
            
            // Participation (percentuais)
            formatBrazilianPercent(part.revenue_platform_percentage || 0),
            formatBrazilianPercent(part.appointments_platform_percentage || 0),
            formatBrazilianPercent(part.conversations_platform_percentage || 0),
            
            // Ranking (scores)
            formatBrazilianNumber(rank.business_health_score || 0),
            rank.risk_level || 'N/A',
            formatBrazilianNumber(rank.risk_score || 0)
        ];
        
        rows.push(row.join(','));
    });
    
    return rows.join('\n');
}

function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return '"R$ 0,00"';
    
    // Converter para número e formatar
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `"${formatted}"`; // Aspas para CSV
}

function formatBrazilianPercent(value) {
    if (!value || isNaN(value)) return '"0,00%"';
    
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `"${formatted}"`; // Aspas para CSV
}

function formatBrazilianNumber(value) {
    if (!value || isNaN(value)) return '"0,00"';
    
    const num = parseFloat(value);
    const formatted = num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `"${formatted}"`; // Aspas para CSV
}

function showPreview(metrics) {
    console.log('\n📋 PREVIEW DOS DADOS:');
    console.log('-'.repeat(50));
    
    metrics.slice(0, 3).forEach(metric => {
        const comp = metric.comprehensive_metrics || {};
        const part = metric.participation_metrics || {};
        const rank = metric.ranking_metrics || {};
        
        console.log(`🏢 ${metric.tenant_name} (${metric.period})`);
        console.log(`   📊 Appointments: ${comp.total_appointments || 0}`);
        console.log(`   💰 Revenue: ${formatBrazilianCurrency(comp.total_revenue || 0)}`);
        console.log(`   📈 Health Score: ${formatBrazilianNumber(rank.business_health_score || 0)}`);
        console.log(`   🎯 Revenue Share: ${formatBrazilianPercent(part.revenue_platform_percentage || 0)}`);
        console.log('');
    });
    
    if (metrics.length > 3) {
        console.log(`   ... e mais ${metrics.length - 3} tenants`);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generateBrazilianFormattedCSV()
        .then(fileName => {
            console.log(`\n🎉 CSV BRASILEIRO GERADO: ${fileName}`);
            console.log('🚀 Pronto para validação manual das métricas!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA:', error);
            process.exit(1);
        });
}

module.exports = { generateBrazilianFormattedCSV };