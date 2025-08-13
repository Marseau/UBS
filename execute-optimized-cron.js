/**
 * EXECUTAR SISTEMA OTIMIZADO: tenant-metrics-cron-optimized.service
 * Sistema oficial documentado no CLAUDE.md com performance 25x superior
 */

async function executeOptimizedCronService() {
    console.log('🚀 EXECUTANDO: Sistema Otimizado de Métricas');
    console.log('📄 Baseado no CLAUDE.md: tenant-metrics-cron-optimized.service');
    
    try {
        // Import the optimized service
        console.log('📤 Importando TenantMetricsCronOptimizedService...');
        
        const { TenantMetricsCronOptimizedService } = require('./dist/services/tenant-metrics-cron-optimized.service.js');
        
        console.log('✅ Serviço importado com sucesso');
        
        // Initialize the service
        console.log('🔧 Inicializando serviço otimizado...');
        const optimizedService = new TenantMetricsCronOptimizedService();
        
        // Execute comprehensive metrics
        console.log('🚀 Executando sistema completo otimizado...');
        console.log('⏱️  Esperado: 25x mais rápido, suporte a 10k+ tenants');
        
        const startTime = Date.now();
        
        // Check if the service has a method to execute metrics
        if (typeof optimizedService.executeComprehensiveMetrics === 'function') {
            const result = await optimizedService.executeComprehensiveMetrics();
            console.log('✅ RESULTADO SISTEMA OTIMIZADO:', result);
        } else if (typeof optimizedService.calculateComprehensiveMetrics === 'function') {
            const result = await optimizedService.calculateComprehensiveMetrics();
            console.log('✅ RESULTADO SISTEMA OTIMIZADO:', result);
        } else {
            console.log('🔍 Métodos disponíveis:', Object.getOwnPropertyNames(Object.getPrototypeOf(optimizedService)));
            
            // Try to initialize and run
            if (typeof optimizedService.initialize === 'function') {
                await optimizedService.initialize();
                console.log('✅ Serviço inicializado');
            }
            
            // Try different method names
            const possibleMethods = ['runMetrics', 'execute', 'start', 'processAllTenants'];
            let executed = false;
            
            for (const method of possibleMethods) {
                if (typeof optimizedService[method] === 'function') {
                    console.log(`🎯 Executando método: ${method}`);
                    const result = await optimizedService[method]();
                    console.log('✅ RESULTADO:', result);
                    executed = true;
                    break;
                }
            }
            
            if (!executed) {
                console.log('❌ Não foi possível encontrar método de execução');
                console.log('📋 Métodos disponíveis:');
                console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(optimizedService)));
            }
        }
        
        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000;
        
        console.log(`⏱️  Tempo de execução: ${executionTime} segundos`);
        
        // Check results in database
        console.log('\n🔍 VERIFICANDO RESULTADOS NA BASE DE DADOS...');
        
        const { getAdminClient } = require('./dist/config/database.js');
        const client = getAdminClient();
        
        const { data: recentMetrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_data, calculated_at')
            .order('calculated_at', { ascending: false })
            .limit(3);
            
        if (recentMetrics && recentMetrics.length > 0) {
            console.log('📊 MÉTRICAS MAIS RECENTES:');
            recentMetrics.forEach((metric, idx) => {
                console.log(`   ${idx + 1}. Tenant: ${metric.tenant_id}`);
                console.log(`      Calculado em: ${metric.calculated_at}`);
                
                if (metric.metric_data?.services_available) {
                    console.log(`      Services disponíveis: ${JSON.stringify(metric.metric_data.services_available)}`);
                } else {
                    console.log(`      Services disponíveis: NÃO ENCONTRADO`);
                }
            });
        } else {
            console.log('❌ Nenhuma métrica encontrada na tabela');
        }
        
    } catch (error) {
        console.log('❌ Erro executando sistema otimizado:', error.message);
        console.log('Stack:', error.stack);
        
        // Try fallback to unified service
        console.log('\n🔄 TENTATIVA ALTERNATIVA: UnifiedCronService...');
        
        try {
            const { UnifiedCronService } = require('./dist/services/unified-cron.service.js');
            const unifiedService = new UnifiedCronService();
            
            const result = await unifiedService.calculateComprehensiveMetrics();
            console.log('✅ RESULTADO UNIFICADO:', result);
            
        } catch (fallbackError) {
            console.log('❌ Erro no sistema unificado também:', fallbackError.message);
        }
    }
}

executeOptimizedCronService().catch(console.error);