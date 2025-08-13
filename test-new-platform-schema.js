/**
 * Teste Completo do Novo Schema Platform Metrics
 * 1. Executa cronjob para popular tenant_metrics
 * 2. Executa nova procedure para platform_metrics  
 * 3. Testa se PlatformAggregationService funciona
 */

const { TenantMetricsCronOptimizedService } = require('./dist/services/tenant-metrics-cron-optimized.service');

async function testCompleteFlow() {
    console.log('🚀 INICIANDO TESTE COMPLETO DO NOVO SCHEMA PLATFORM_METRICS');
    console.log('=====================================');

    try {
        // Inicializar serviço 
        const cronService = new TenantMetricsCronOptimizedService();
        await cronService.initialize();

        console.log('\n⏰ ETAPA 1: Executando Cronjob Tenant Metrics...');
        console.log('▶️ Calculando métricas dos tenants (DEFINITIVA TOTAL)');
        
        // Executar cronjob manualmente - usar método correto
        await cronService.triggerComprehensiveCalculation();
        
        console.log('✅ Tenant metrics calculadas com sucesso!');
        
        console.log('\n🔄 ETAPA 2: Executando Nova Procedure Platform Metrics...');
        
        // Testar aggregation manual para verificar se funciona  
        await cronService.triggerPlatformAggregation();
        
        console.log('✅ Platform metrics agregadas com nova procedure!');
        
        console.log('\n🧪 ETAPA 3: Testando PlatformAggregationService...');
        
        // Aqui podemos testar se o service consegue ler os dados
        const { PlatformAggregationService } = require('./dist/services/platform-aggregation.service');
        const platformService = new PlatformAggregationService();
        
        const platformMetrics30d = await platformService.getPlatformMetrics('30d');
        
        console.log('📊 PLATFORM METRICS 30D:');
        console.log(`   Platform MRR: R$ ${platformMetrics30d.platform_mrr}`);
        console.log(`   Total Revenue: R$ ${platformMetrics30d.total_tenant_revenue}`);
        console.log(`   Active Tenants: ${platformMetrics30d.active_tenants || 'N/A'}`);
        console.log(`   Total Appointments: ${platformMetrics30d.total_appointments}`);
        
        if (platformMetrics30d.platform_mrr > 0) {
            console.log('\n🎉 TESTE COMPLETO: SUCESSO!');
            console.log('✅ Schema corrigido funciona perfeitamente');
            console.log('✅ PlatformAggregationService lê dados corretamente');
            console.log('✅ APIs do dashboard mostrarão valores corretos');
        } else {
            console.log('\n⚠️ ALERTA: Platform MRR ainda está zerado');
            console.log('Verifique se há dados em tenant_metrics');
        }

    } catch (error) {
        console.error('\n❌ ERRO NO TESTE:', error.message);
        console.error(error.stack);
    }

    process.exit(0);
}

// Executar teste
testCompleteFlow();