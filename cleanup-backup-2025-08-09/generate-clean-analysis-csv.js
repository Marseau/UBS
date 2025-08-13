/**
 * GERAR CSV LIMPO PARA ANÁLISE
 * CSV simples e claro para conferência no Excel
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function generateCleanAnalysisCSV() {
    console.log('📋 GERANDO CSV LIMPO PARA ANÁLISE');
    console.log('='.repeat(50));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // Buscar dados das tabelas
        const { data: tenantMetrics } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_data')
            .eq('metric_type', 'conversation_billing')
            .eq('period', '30d');
            
        const { data: platformMetrics } = await supabase
            .from('platform_metrics')
            .select('*')
            .eq('data_source', 'conversation_outcome_corrected')
            .single();
        
        // =====================================================
        // 1. ANÁLISE POR TENANT (SIMPLES)
        // =====================================================
        
        console.log('📊 Preparando análise por tenant...');
        
        const tenantAnalysis = [];
        
        tenantMetrics.forEach(record => {
            const data = record.metric_data;
            
            tenantAnalysis.push({
                tenant: data.business_name,
                conversas: data.total_conversations || 0,
                appointments: data.total_appointments || 0,
                eficiencia_pct: ((data.total_appointments || 0) / Math.max(1, data.total_conversations || 1) * 100).toFixed(1),
                spam_pct: (data.spam_rate_pct || 0).toFixed(1),
                minutos_total: (data.total_minutes || 0).toFixed(0),
                minutos_por_conversa: (data.avg_minutes_per_conversation || 0).toFixed(1),
                custo_usd: (data.total_cost_usd || 0).toFixed(4),
                plano_sugerido: data.suggested_plan || 'basico',
                preco_mensal: data.plan_price_brl || 58,
                excedentes: data.excess_conversations || 0,
                
                // Outcomes principais (desmembrados)
                outcome_appointments: (data.outcome_distribution?.appointment_created || 0),
                outcome_info: (data.outcome_distribution?.info_request_fulfilled || 0),
                outcome_price: (data.outcome_distribution?.price_inquiry || 0),
                outcome_cancelled: (data.outcome_distribution?.appointment_cancelled || 0),
                outcome_outros: Math.max(0, (data.total_conversations || 0) - 
                    (data.outcome_distribution?.appointment_created || 0) -
                    (data.outcome_distribution?.info_request_fulfilled || 0) -
                    (data.outcome_distribution?.price_inquiry || 0) -
                    (data.outcome_distribution?.appointment_cancelled || 0)),
                
                // Status
                status: (data.total_conversations || 0) > 0 ? 'ATIVO' : 'INATIVO'
            });
        });
        
        // Ordenar por conversas (desc)
        tenantAnalysis.sort((a, b) => b.conversas - a.conversas);
        
        // =====================================================
        // 2. RESUMO DA PLATAFORMA
        // =====================================================
        
        const platformSummary = {
            tenant: 'TOTAL PLATAFORMA',
            conversas: platformMetrics.total_conversations,
            appointments: platformMetrics.total_appointments,
            eficiencia_pct: platformMetrics.operational_efficiency_pct.toFixed(1),
            spam_pct: platformMetrics.spam_rate_pct.toFixed(1),
            minutos_total: platformMetrics.total_chat_minutes,
            minutos_por_conversa: (platformMetrics.total_chat_minutes / Math.max(1, platformMetrics.total_conversations)).toFixed(1),
            custo_usd: 'N/A',
            plano_sugerido: 'N/A',
            preco_mensal: platformMetrics.platform_mrr,
            excedentes: 0,
            outcome_appointments: tenantAnalysis.reduce((sum, t) => sum + t.outcome_appointments, 0),
            outcome_info: tenantAnalysis.reduce((sum, t) => sum + t.outcome_info, 0),
            outcome_price: tenantAnalysis.reduce((sum, t) => sum + t.outcome_price, 0),
            outcome_cancelled: tenantAnalysis.reduce((sum, t) => sum + t.outcome_cancelled, 0),
            outcome_outros: tenantAnalysis.reduce((sum, t) => sum + t.outcome_outros, 0),
            status: 'AGREGADO'
        };
        
        // Adicionar total no final
        const finalData = [...tenantAnalysis, platformSummary];
        
        // =====================================================
        // 3. GERAR CSV LIMPO
        // =====================================================
        
        const headers = [
            'tenant', 'status', 'conversas', 'appointments', 'eficiencia_pct', 'spam_pct',
            'minutos_total', 'minutos_por_conversa', 'custo_usd', 'plano_sugerido', 
            'preco_mensal', 'excedentes', 'outcome_appointments', 'outcome_info', 
            'outcome_price', 'outcome_cancelled', 'outcome_outros'
        ];
        
        let csvContent = headers.join(',') + '\n';
        
        finalData.forEach(row => {
            const csvRow = headers.map(header => {
                const value = row[header];
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value}"`;
                }
                return value;
            });
            csvContent += csvRow.join(',') + '\n';
        });
        
        const filename = `analise_limpa_${timestamp}.csv`;
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        // =====================================================
        // 4. GERAR INSIGHTS SEPARADOS
        // =====================================================
        
        console.log('💡 Preparando insights...');
        
        const insights = [
            { metrica: 'Total Tenants', valor: tenantAnalysis.length, unidade: 'tenants' },
            { metrica: 'Tenants Ativos', valor: tenantAnalysis.filter(t => t.status === 'ATIVO').length, unidade: 'tenants' },
            { metrica: 'Tenants Inativos', valor: tenantAnalysis.filter(t => t.status === 'INATIVO').length, unidade: 'tenants' },
            { metrica: 'MRR Total', valor: platformMetrics.platform_mrr, unidade: 'R$' },
            { metrica: 'Conversas Totais', valor: platformMetrics.total_conversations, unidade: 'conversas' },
            { metrica: 'Appointments Totais', valor: platformMetrics.total_appointments, unidade: 'appointments' },
            { metrica: 'Eficiência Média', valor: platformMetrics.operational_efficiency_pct.toFixed(1), unidade: '%' },
            { metrica: 'Taxa de Spam', valor: platformMetrics.spam_rate_pct.toFixed(1), unidade: '%' },
            { metrica: 'Minutos Totais', valor: platformMetrics.total_chat_minutes, unidade: 'min' },
            { metrica: 'Receita por Minuto', valor: (platformMetrics.platform_mrr / platformMetrics.total_chat_minutes).toFixed(2), unidade: 'R$/min' },
            { metrica: 'Health Score', valor: platformMetrics.platform_health_score, unidade: 'pontos' }
        ];
        
        let insightsCSV = 'metrica,valor,unidade\n';
        insights.forEach(insight => {
            insightsCSV += `${insight.metrica},${insight.valor},${insight.unidade}\n`;
        });
        
        const insightsFilename = `insights_${timestamp}.csv`;
        fs.writeFileSync(insightsFilename, insightsCSV, 'utf8');
        
        // =====================================================
        // 5. RESULTADO
        // =====================================================
        
        console.log('');
        console.log('✅ CSVs LIMPOS GERADOS:');
        console.log('='.repeat(50));
        console.log(`📋 ${filename} - Análise detalhada por tenant`);
        console.log(`💡 ${insightsFilename} - KPIs e insights principais`);
        
        console.log('');
        console.log('📊 PREVIEW DOS DADOS:');
        console.log('Tenants ativos:', tenantAnalysis.filter(t => t.status === 'ATIVO').length);
        console.log('Maior volume:', tenantAnalysis[0]?.tenant, '-', tenantAnalysis[0]?.conversas, 'conversas');
        console.log('MRR Total: R$', platformMetrics.platform_mrr);
        console.log('Eficiência: ' + platformMetrics.operational_efficiency_pct.toFixed(1) + '%');
        
        return {
            success: true,
            files: [filename, insightsFilename],
            tenants_ativos: tenantAnalysis.filter(t => t.status === 'ATIVO').length,
            mrr_total: platformMetrics.platform_mrr
        };
        
    } catch (error) {
        console.error('💥 ERRO:', error);
        return { success: false, error: error.message };
    }
}

// Executar
if (require.main === module) {
    generateCleanAnalysisCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSVs limpos gerados com sucesso!');
                process.exit(0);
            } else {
                console.log('\n💥 Erro:', result.error);
                process.exit(1);
            }
        })
        .catch(console.error);
}

module.exports = { generateCleanAnalysisCSV };