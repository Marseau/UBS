require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listarTodasAsMetricas() {
    console.log('🔍 LISTANDO TODAS AS MÉTRICAS DESENVOLVIDAS...');
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data: metrics, error } = await supabase
        .from('tenant_metrics')
        .select('metric_data')
        .gte('calculated_at', today)
        .limit(1);
        
    if (error || !metrics || metrics.length === 0) {
        console.error('❌ Erro ou sem dados:', error);
        return;
    }
    
    const data = metrics[0].metric_data || {};
    const allMetrics = Object.keys(data).sort();
    
    console.log('📊 TODAS AS MÉTRICAS NO SISTEMA:');
    console.log('='.repeat(50));
    
    allMetrics.forEach((metric, index) => {
        console.log(`${(index + 1).toString().padStart(2, ' ')}. ${metric}`);
    });
    
    console.log('\n📈 TOTAL:', allMetrics.length, 'métricas');
    
    // Analisar quais são as métricas de conversation outcomes
    console.log('\n🎯 MÉTRICAS DE CONVERSATION OUTCOMES:');
    const outcomeMetrics = allMetrics.filter(m => m.includes('_rate'));
    outcomeMetrics.forEach(metric => {
        console.log('• ' + metric);
    });
    
    // Analisar as novas métricas que implementamos
    console.log('\n✨ NOVAS MÉTRICAS IMPLEMENTADAS:');
    const newMetrics = [
        'avg_minutes_per_conversation',
        'avg_messages_per_conversation', 
        'avg_cost_usd_per_conversation',
        'avg_confidence_per_conversation',
        'unique_customers_count',
        'services_count',
        'professionals_count',
        'monthly_platform_cost_brl',
        'six_months_conversations',
        'six_months_revenue',
        'six_months_customers'
    ];
    
    newMetrics.forEach(metric => {
        const exists = allMetrics.includes(metric);
        console.log(`${exists ? '✅' : '❌'} ${metric}`);
    });
}

listarTodasAsMetricas().catch(console.error);