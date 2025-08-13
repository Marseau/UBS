require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Importar as funções do arquivo compilado
const tenantMetricsService = require('./dist/services/tenant-metrics-cron.service.js');

async function testSingleTenant() {
    console.log('🧪 TESTE: Executar cálculo para UM tenant apenas');
    
    // Simular dados de um tenant
    const mockTenant = {
        id: '33b8c488-5aa9-4891-b335-701d10296681',
        name: 'Bella Vista Spa',
        domain: 'beauty',
        has_recent_activity: true
    };
    
    try {
        console.log('🔄 Executando calculateTenantMetrics...');
        
        // Não posso chamar calculateTenantMetrics diretamente pois não é exportada
        // Vou executar triggerManualCalculation e interromper após o primeiro tenant
        
        console.log('⚠️ Executando sistema completo - vou interromper manualmente...');
        
        const result = await tenantMetricsService.triggerManualCalculation();
        console.log('📊 Resultado:', result);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

// Executar por apenas 30 segundos para não processar todos os tenants
setTimeout(() => {
    console.log('⏱️ TIMEOUT: Interrompendo execução após 30s');
    process.exit(0);
}, 30000);

testSingleTenant();