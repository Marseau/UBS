/**
 * Get the next metric to analyze from tenant_metrics table
 * Excludes the 4 metrics we already analyzed
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function getNextMetric() {
    try {
        console.log('🔍 BUSCANDO PRÓXIMA MÉTRICA PARA ANÁLISE');
        console.log('═'.repeat(50));
        
        // Get all metrics excluding the 4 we already analyzed
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('metric_type, tenant_id, period, metric_data, calculated_at')
            .not('metric_type', 'in', '(risk_assessment,evolution,ranking,participation)')
            .order('calculated_at', { ascending: false })
            .limit(10);
        
        if (error) {
            console.error('❌ Erro ao buscar métricas:', error);
            return;
        }
        
        if (!metrics || metrics.length === 0) {
            console.log('✅ Todas as métricas já foram analisadas ou não há métricas restantes');
            return;
        }
        
        // Get unique metric types
        const uniqueTypes = [...new Set(metrics.map(m => m.metric_type))];
        
        console.log(`📊 Encontradas ${uniqueTypes.length} métricas diferentes:`);
        uniqueTypes.forEach((type, index) => {
            const count = metrics.filter(m => m.metric_type === type).length;
            console.log(`   ${index + 1}. ${type} (${count} registros)`);
        });
        
        // Show details of the first metric type
        const firstMetricType = uniqueTypes[0];
        const firstMetric = metrics.find(m => m.metric_type === firstMetricType);
        
        console.log(`\n🎯 PRÓXIMA MÉTRICA A ANALISAR: ${firstMetricType}`);
        console.log('─'.repeat(50));
        console.log(`Tenant: ${firstMetric.tenant_id.substring(0, 8)}...`);
        console.log(`Period: ${firstMetric.period}`);
        console.log(`Calculated: ${new Date(firstMetric.calculated_at).toLocaleDateString('pt-BR')}`);
        
        // Show metric data structure
        console.log('\n📋 ESTRUTURA DOS DADOS:');
        console.log('─'.repeat(30));
        const sampleData = JSON.stringify(firstMetric.metric_data, null, 2);
        if (sampleData.length > 500) {
            console.log(sampleData.substring(0, 500) + '\n... (truncated)');
        } else {
            console.log(sampleData);
        }
        
        // Show all records for this metric type
        const allRecordsForType = metrics.filter(m => m.metric_type === firstMetricType);
        console.log(`\n📊 REGISTROS PARA '${firstMetricType}':`);
        console.log('─'.repeat(30));
        allRecordsForType.forEach((record, index) => {
            console.log(`${index + 1}. Tenant: ${record.tenant_id.substring(0, 8)}, Period: ${record.period}, Date: ${new Date(record.calculated_at).toLocaleDateString('pt-BR')}`);
        });
        
        return {
            metricType: firstMetricType,
            records: allRecordsForType,
            sampleData: firstMetric.metric_data
        };
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

// Execute
if (require.main === module) {
    getNextMetric()
        .then((result) => {
            if (result) {
                console.log(`\n✅ Métrica '${result.metricType}' pronta para análise!`);
            }
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Falha ao buscar métrica:', error);
            process.exit(1);
        });
}

module.exports = { getNextMetric };