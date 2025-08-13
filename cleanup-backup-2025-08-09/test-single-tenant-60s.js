require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Importar as funções do arquivo compilado
const tenantMetricsService = require('./dist/services/tenant-metrics-cron.service.js');

async function testSingleTenant() {
    console.log('🧪 TESTE: Executar cálculo para UM tenant apenas (60s)');
    
    try {
        console.log('🔄 Executando calculateTenantMetrics...');
        
        console.log('⚠️ Executando sistema completo - vou interromper manualmente...');
        
        const result = await tenantMetricsService.triggerManualCalculation();
        console.log('📊 Resultado:', result);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

// Executar por apenas 60 segundos
setTimeout(() => {
    console.log('⏱️ TIMEOUT: Interrompendo execução após 60s');
    process.exit(0);
}, 60000);

testSingleTenant();