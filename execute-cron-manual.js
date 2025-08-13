/**
 * EXECUTAR CRON MANUAL: Dispara cron jobs de tenant_metrics
 */

async function executeCronManually() {
    console.log('🚀 EXECUÇÃO MANUAL: Cron jobs tenant_metrics');
    
    const baseURL = 'http://localhost:3000';
    
    // Primeiro, vamos testar se o servidor está rodando
    console.log('📡 Verificando servidor...');
    
    try {
        const healthResponse = await fetch(`${baseURL}/api/health`);
        const healthData = await healthResponse.json();
        console.log(`✅ Servidor ativo: ${healthData.status}`);
    } catch (error) {
        console.log('❌ Servidor offline. Execute: npm run dev');
        return;
    }
    
    // Lista de endpoints para testar
    const cronEndpoints = [
        '/api/cron/trigger/comprehensive',
        '/api/admin/execute-comprehensive-metrics',
        '/api/optimized-cron/trigger/daily-metrics',
        '/api/cron/status'
    ];
    
    console.log('\n🎯 Disparando cron jobs...');
    
    for (const endpoint of cronEndpoints) {
        console.log(`\n📤 ${endpoint}`);
        
        try {
            const response = await fetch(`${baseURL}${endpoint}`, {
                method: endpoint.includes('/status') ? 'GET' : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`   Status: ${response.status}`);
            
            const responseText = await response.text();
            if (responseText) {
                console.log(`   Resposta: ${responseText.substring(0, 150)}...`);
            }
            
        } catch (error) {
            console.log(`   ❌ Erro: ${error.message}`);
        }
    }
    
    // Aguardar um pouco antes de verificar resultados
    console.log('\n⏳ Aguardando 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar resultados
    console.log('\n🔍 VERIFICANDO RESULTADOS...');
    
    try {
        const { getAdminClient } = require('./dist/config/database.js');
        const client = getAdminClient();
        
        const { count: currentCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📈 Total registros tenant_metrics: ${currentCount || 0}`);
        
        // Get recent entries
        const { data: recentMetrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at')
            .order('calculated_at', { ascending: false })
            .limit(5);
            
        console.log('\n📋 Últimos 5 registros:');
        recentMetrics?.forEach((metric, idx) => {
            const time = new Date(metric.calculated_at).toLocaleString('pt-BR');
            console.log(`   ${idx + 1}. ${metric.metric_type} | ${metric.period} | ${time}`);
        });
        
    } catch (dbError) {
        console.log(`❌ Erro acessando banco: ${dbError.message}`);
    }
}

// Check if we're in Node.js environment
if (typeof global !== 'undefined') {
    // Node.js - need to install fetch
    global.fetch = require('node-fetch');
}

executeCronManually().catch(console.error);