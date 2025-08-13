/**
 * GERAR CSV COM MÚLTIPLOS PERÍODOS
 * CSV comparativo com 7, 30 e 90 dias para cada tenant
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function generateMultiplePeriodsCSV() {
    console.log('📊 GERANDO CSV COM MÚLTIPLOS PERÍODOS');
    console.log('='.repeat(50));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // =====================================================
        // 1. BUSCAR DADOS DE TODOS OS PERÍODOS
        // =====================================================
        
        console.log('1️⃣ Buscando dados dos múltiplos períodos...');
        
        const { data: allMetrics, error } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data')
            .eq('metric_type', 'billing_analysis')
            .order('tenant_id, period');
            
        if (error) {
            throw new Error(`Erro ao buscar métricas: ${error.message}`);
        }
        
        console.log(`   📋 ${allMetrics.length} registros encontrados`);
        
        // =====================================================
        // 2. AGRUPAR POR TENANT
        // =====================================================
        
        console.log('2️⃣ Agrupando dados por tenant...');
        
        const tenantGroups = {};
        allMetrics.forEach(record => {
            const tenantId = record.tenant_id;
            if (!tenantGroups[tenantId]) {
                tenantGroups[tenantId] = {};
            }
            tenantGroups[tenantId][record.period] = record.metric_data;
        });
        
        console.log(`   🏢 ${Object.keys(tenantGroups).length} tenants processados`);
        
        // =====================================================
        // 3. GERAR CSV COMPARATIVO
        // =====================================================
        
        console.log('3️⃣ Gerando CSV comparativo...');
        
        const csvData = [];
        
        Object.entries(tenantGroups).forEach(([tenantId, periods]) => {
            const data7d = periods['7d'] || {};
            const data30d = periods['30d'] || {};
            const data90d = periods['90d'] || {};
            
            // Usar nome do período de 30d como padrão
            const tenantName = data30d.business_name || data7d.business_name || data90d.business_name || 'Unknown';
            
            csvData.push({
                tenant: tenantName,
                tenant_id: tenantId,
                
                // Conversas por período
                conversas_7d: data7d.total_conversations || 0,
                conversas_30d: data30d.total_conversations || 0,
                conversas_90d: data90d.total_conversations || 0,
                
                // Appointments por período
                appointments_7d: data7d.total_appointments || 0,
                appointments_30d: data30d.total_appointments || 0,
                appointments_90d: data90d.total_appointments || 0,
                
                // Eficiência por período
                eficiencia_7d: (data7d.efficiency_pct || 0).toFixed(1),
                eficiencia_30d: (data30d.efficiency_pct || 0).toFixed(1),
                eficiencia_90d: (data90d.efficiency_pct || 0).toFixed(1),
                
                // MRR por período
                mrr_7d: data7d.plan_price_brl || 0,
                mrr_30d: data30d.plan_price_brl || 0,
                mrr_90d: data90d.plan_price_brl || 0,
                
                // Planos sugeridos por período
                plano_7d: data7d.suggested_plan || 'basico',
                plano_30d: data30d.suggested_plan || 'basico',
                plano_90d: data90d.suggested_plan || 'basico',
                
                // Minutos por período
                minutos_7d: (data7d.total_minutes || 0).toFixed(0),
                minutos_30d: (data30d.total_minutes || 0).toFixed(0),
                minutos_90d: (data90d.total_minutes || 0).toFixed(0),
                
                // Spam rate por período
                spam_7d: (data7d.spam_rate_pct || 0).toFixed(1),
                spam_30d: (data30d.spam_rate_pct || 0).toFixed(1),
                spam_90d: (data90d.spam_rate_pct || 0).toFixed(1),
                
                // Crescimento (90d vs 30d vs 7d)
                crescimento_conversas_30d_vs_7d: data7d.total_conversations > 0 ? 
                    (((data30d.total_conversations || 0) - (data7d.total_conversations || 0)) / (data7d.total_conversations || 1) * 100).toFixed(1) : 'N/A',
                crescimento_conversas_90d_vs_30d: data30d.total_conversations > 0 ? 
                    (((data90d.total_conversations || 0) - (data30d.total_conversations || 0)) / (data30d.total_conversations || 1) * 100).toFixed(1) : 'N/A',
                
                // Status
                status: (data30d.total_conversations || 0) > 0 ? 'ATIVO' : 'INATIVO',
                
                // Consistency check
                consistent: (data7d.total_conversations || 0) <= (data30d.total_conversations || 0) && 
                           (data30d.total_conversations || 0) <= (data90d.total_conversations || 0) ? 'SIM' : 'NÃO'
            });
        });
        
        // Ordenar por conversas 30d (desc)
        csvData.sort((a, b) => b.conversas_30d - a.conversas_30d);
        
        // =====================================================
        // 4. SALVAR CSV
        // =====================================================
        
        const headers = [
            'tenant', 'status', 'consistent',
            'conversas_7d', 'conversas_30d', 'conversas_90d',
            'appointments_7d', 'appointments_30d', 'appointments_90d',
            'eficiencia_7d', 'eficiencia_30d', 'eficiencia_90d',
            'mrr_7d', 'mrr_30d', 'mrr_90d',
            'plano_7d', 'plano_30d', 'plano_90d',
            'minutos_7d', 'minutos_30d', 'minutos_90d',
            'spam_7d', 'spam_30d', 'spam_90d',
            'crescimento_conversas_30d_vs_7d', 'crescimento_conversas_90d_vs_30d'
        ];
        
        let csvContent = headers.join(',') + '\n';
        
        csvData.forEach(row => {
            const csvRow = headers.map(header => {
                const value = row[header];
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvContent += csvRow.join(',') + '\n';
        });
        
        const filename = `multiplos_periodos_${timestamp}.csv`;
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        // =====================================================
        // 5. GERAR RESUMO AGREGADO
        // =====================================================
        
        console.log('4️⃣ Gerando resumo agregado...');
        
        const summary = [
            { periodo: '7 dias', tenants_ativos: 0, total_conversas: 0, total_appointments: 0, total_mrr: 0 },
            { periodo: '30 dias', tenants_ativos: 0, total_conversas: 0, total_appointments: 0, total_mrr: 0 },
            { periodo: '90 dias', tenants_ativos: 0, total_conversas: 0, total_appointments: 0, total_mrr: 0 }
        ];
        
        csvData.forEach(row => {
            // 7 dias
            if (row.conversas_7d > 0) summary[0].tenants_ativos++;
            summary[0].total_conversas += parseInt(row.conversas_7d);
            summary[0].total_appointments += parseInt(row.appointments_7d);
            summary[0].total_mrr += parseFloat(row.mrr_7d);
            
            // 30 dias  
            if (row.conversas_30d > 0) summary[1].tenants_ativos++;
            summary[1].total_conversas += parseInt(row.conversas_30d);
            summary[1].total_appointments += parseInt(row.appointments_30d);
            summary[1].total_mrr += parseFloat(row.mrr_30d);
            
            // 90 dias
            if (row.conversas_90d > 0) summary[2].tenants_ativos++;
            summary[2].total_conversas += parseInt(row.conversas_90d);
            summary[2].total_appointments += parseInt(row.appointments_90d);
            summary[2].total_mrr += parseFloat(row.mrr_90d);
        });
        
        let summaryCSV = 'periodo,tenants_ativos,total_conversas,total_appointments,total_mrr,eficiencia_pct\n';
        summary.forEach(s => {
            const efficiency = s.total_conversas > 0 ? (s.total_appointments / s.total_conversas * 100).toFixed(1) : '0.0';
            summaryCSV += `${s.periodo},${s.tenants_ativos},${s.total_conversas},${s.total_appointments},${s.total_mrr.toFixed(2)},${efficiency}\n`;
        });
        
        const summaryFilename = `resumo_multiplos_periodos_${timestamp}.csv`;
        fs.writeFileSync(summaryFilename, summaryCSV, 'utf8');
        
        // =====================================================
        // 6. RESULTADO
        // =====================================================
        
        console.log('');
        console.log('✅ CSVs GERADOS COM SUCESSO:');
        console.log('='.repeat(50));
        console.log(`📋 ${filename} - Análise comparativa detalhada`);
        console.log(`📊 ${summaryFilename} - Resumo agregado por período`);
        
        console.log('');
        console.log('📈 INSIGHTS DOS MÚLTIPLOS PERÍODOS:');
        console.log(`🏢 Tenants analisados: ${csvData.length}`);
        console.log(`✅ Dados consistentes: ${csvData.filter(t => t.consistent === 'SIM').length}/${csvData.length}`);
        console.log(`📊 Tenants ativos (30d): ${csvData.filter(t => t.status === 'ATIVO').length}`);
        
        console.log('');
        console.log('🎯 CRESCIMENTO:');
        const avgGrowth30vs7 = csvData.filter(t => t.crescimento_conversas_30d_vs_7d !== 'N/A')
            .reduce((sum, t) => sum + parseFloat(t.crescimento_conversas_30d_vs_7d), 0) / 
            csvData.filter(t => t.crescimento_conversas_30d_vs_7d !== 'N/A').length;
        const avgGrowth90vs30 = csvData.filter(t => t.crescimento_conversas_90d_vs_30d !== 'N/A')
            .reduce((sum, t) => sum + parseFloat(t.crescimento_conversas_90d_vs_30d), 0) / 
            csvData.filter(t => t.crescimento_conversas_90d_vs_30d !== 'N/A').length;
            
        console.log(`📈 Crescimento médio 30d vs 7d: ${avgGrowth30vs7.toFixed(1)}%`);
        console.log(`📈 Crescimento médio 90d vs 30d: ${avgGrowth90vs30.toFixed(1)}%`);
        
        return {
            success: true,
            files: [filename, summaryFilename],
            tenants_analyzed: csvData.length,
            consistent_data: csvData.filter(t => t.consistent === 'SIM').length
        };
        
    } catch (error) {
        console.error('💥 ERRO:', error);
        return { success: false, error: error.message };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generateMultiplePeriodsCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSVs gerados com sucesso!');
                process.exit(0);
            } else {
                console.log('\n💥 Erro:', result.error);
                process.exit(1);
            }
        })
        .catch(console.error);
}

module.exports = { generateMultiplePeriodsCSV };