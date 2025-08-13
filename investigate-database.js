require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigateBanco() {
    console.log('🔍 INVESTIGANDO DADOS NO BANCO...');
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data: metrics, error } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, period, calculated_at, metric_data')
        .gte('calculated_at', today)
        .order('calculated_at', { ascending: false })
        .limit(3);
        
    if (error) {
        console.error('❌ Erro:', error);
        return;
    }
    
    console.log(`📊 Encontrados ${metrics.length} registros de hoje`);
    
    for (const metric of metrics) {
        console.log('\n' + '='.repeat(50));
        console.log(`🏢 Tenant: ${metric.tenant_id.substring(0,8)}...`);
        console.log(`📅 Período: ${metric.period}`);
        console.log(`⏰ Calculado: ${new Date(metric.calculated_at).toLocaleString('pt-BR')}`);
        
        const data = metric.metric_data || {};
        console.log('\n📊 MÉTRICAS NO BANCO:');
        console.log('• avg_minutes_per_conversation:', JSON.stringify(data.avg_minutes_per_conversation, null, 2));
        console.log('• unique_customers_count:', JSON.stringify(data.unique_customers_count, null, 2));
        console.log('• services_count:', JSON.stringify(data.services_count, null, 2));
        console.log('• professionals_count:', JSON.stringify(data.professionals_count, null, 2));
        console.log('• avg_cost_usd_per_conversation:', JSON.stringify(data.avg_cost_usd_per_conversation, null, 2));
        
        // Verificar se as propriedades existem
        console.log('\n🔍 VERIFICAÇÃO DE PROPRIEDADES:');
        console.log('- avg_minutes_per_conversation existe?', data.avg_minutes_per_conversation !== undefined);
        console.log('- unique_customers_count existe?', data.unique_customers_count !== undefined);
        console.log('- services_count existe?', data.services_count !== undefined);
        console.log('- monthly_platform_cost_brl existe?', data.monthly_platform_cost_brl !== undefined);
        
        // Verificar todas as propriedades
        console.log('\n📋 TODAS AS PROPRIEDADES:');
        console.log(Object.keys(data).sort());
    }
}

investigateBanco().catch(console.error);