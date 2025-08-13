require('dotenv').config();
const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;

async function executarPlatformServiceIsolado() {
    console.log('🌐 EXECUTANDO PLATFORM AGGREGATION SERVICE ISOLADAMENTE');
    console.log('='.repeat(70));
    
    try {
        console.log('📊 Inicializando PlatformAggregationService...');
        const service = new PlatformAggregationService();
        
        console.log('🔄 Executando aggregatePlatformMetrics()...');
        console.log('   💡 Este serviço deve ler os 30 registros de tenant_metrics');
        console.log('   💡 E gerar métricas agregadas para platform_metrics');
        
        const startTime = Date.now();
        
        await service.executeCompletePlatformAggregation();
        
        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`✅ PlatformAggregationService executado em ${executionTime}s`);
        
        // Verificar se platform_metrics foi populada agora
        const { createClient } = require('@supabase/supabase-js');
        const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        const { data: platformData, count: platformCount } = await client
            .from('platform_metrics')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);
            
        console.log('\n🔍 VERIFICANDO RESULTADOS:');
        console.log(`📊 platform_metrics agora tem: ${platformCount || 0} registros`);
        
        if (platformData?.length > 0) {
            console.log('✅ SUCESSO! Platform metrics populadas:');
            platformData.forEach((item, i) => {
                console.log(`   ${i+1}. Period: ${item.period}`);
                console.log(`      💰 Revenue: R$ ${item.total_revenue || 0}`);
                console.log(`      🏢 Tenants: ${item.total_tenants || 0}`);
                console.log(`      📅 Appointments: ${item.total_appointments || 0}`);
                console.log(`      📊 Health Score: ${item.platform_health_score || 0}`);
            });
        } else {
            console.log('❌ FALHA: platform_metrics ainda está vazia');
            console.log('💡 O PlatformAggregationService tem um erro interno');
        }
        
    } catch (error) {
        console.error('💥 ERRO no PlatformAggregationService:', error);
        console.log('\n🔍 DETALHES DO ERRO:');
        console.log(`   Mensagem: ${error.message}`);
        console.log(`   Stack: ${error.stack}`);
    }
}

executarPlatformServiceIsolado().then(() => process.exit(0)).catch(console.error);