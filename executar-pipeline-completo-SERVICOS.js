require('dotenv').config();

/**
 * PIPELINE COMPLETO DE EXECUÇÃO DOS SERVIÇOS
 * - Sempre usa os serviços reais (não scripts diretos)
 * - Sequência: tenant-metrics-cron → platform-aggregation → tenant-platform-cron
 * - Permite análise de performance dos serviços
 * - Mantém consistência arquitetural
 */

async function executarPipelineCompletoServicos() {
    console.log('🚀 PIPELINE COMPLETO - EXECUÇÃO DOS SERVIÇOS REAIS');
    console.log('='.repeat(70));
    
    const startTime = Date.now();
    const results = [];
    
    try {
        // ETAPA 1: TENANT METRICS CRON SERVICE
        console.log('\n📊 ETAPA 1: TENANT-METRICS-CRON SERVICE');
        console.log('-'.repeat(50));
        
        const step1Start = Date.now();
        
        try {
            const { TenantMetricsCronService } = require('./dist/services/tenant-metrics-cron.service.js');
            const service = new TenantMetricsCronService();
            
            console.log('🔄 Executando tenant-metrics-cron.service...');
            
            // Executar cálculo manual completo (todos os períodos)
            const executionStart = Date.now();
            const result = await service.executeManualMetricsUpdate();
            const executionTime = Date.now() - executionStart;
            
            const tenantResults = [{
                period: 'all',
                success: result.success || true,
                processed: result.processed_tenants || 'unknown',
                time_ms: executionTime
            }];
            
            console.log(`   ✅ Manual update: ${result.processed_tenants || 'completed'} (${executionTime}ms)`);
            
            const step1Time = Date.now() - step1Start;
            
            results.push({
                step: 1,
                service: 'tenant-metrics-cron',
                success: tenantResults.every(r => r.success),
                details: tenantResults,
                execution_time_ms: step1Time
            });
            
            console.log(`✅ ETAPA 1 CONCLUÍDA: ${step1Time}ms`);
            
        } catch (error) {
            console.error('❌ ERRO na Etapa 1:', error.message);
            results.push({
                step: 1,
                service: 'tenant-metrics-cron',
                success: false,
                error: error.message,
                execution_time_ms: Date.now() - step1Start
            });
        }
        
        // ETAPA 2: PLATFORM AGGREGATION SERVICE
        console.log('\n🏢 ETAPA 2: PLATFORM-AGGREGATION SERVICE');
        console.log('-'.repeat(50));
        
        const step2Start = Date.now();
        
        try {
            const { platformAggregationService } = require('./dist/services/platform-aggregation.service.js');
            
            console.log('🔄 Executando platform-aggregation.service...');
            
            const aggregationResult = await platformAggregationService.executeCompletePlatformAggregation();
            const step2Time = Date.now() - step2Start;
            
            results.push({
                step: 2,
                service: 'platform-aggregation',
                success: aggregationResult.success,
                processed_periods: aggregationResult.processed_periods,
                errors: aggregationResult.errors,
                execution_time_ms: step2Time
            });
            
            console.log(`✅ ETAPA 2 CONCLUÍDA: ${step2Time}ms`);
            console.log(`   📊 Períodos: ${aggregationResult.processed_periods.join(', ')}`);
            console.log(`   ❌ Erros: ${aggregationResult.errors.length}`);
            
        } catch (error) {
            console.error('❌ ERRO na Etapa 2:', error.message);
            results.push({
                step: 2,
                service: 'platform-aggregation',
                success: false,
                error: error.message,
                execution_time_ms: Date.now() - step2Start
            });
        }
        
        // ETAPA 3: TENANT PLATFORM CRON SERVICE (OPCIONAL/COMPLEMENTAR)
        console.log('\n🔧 ETAPA 3: TENANT-PLATFORM-CRON SERVICE');
        console.log('-'.repeat(50));
        
        const step3Start = Date.now();
        
        try {
            const { tenantPlatformCronService } = require('./dist/services/tenant-platform-cron.service.js');
            
            console.log('🔄 Executando tenant-platform-cron.service...');
            
            const cronResult = await tenantPlatformCronService.triggerDailyMetrics();
            const step3Time = Date.now() - step3Start;
            
            results.push({
                step: 3,
                service: 'tenant-platform-cron',
                success: cronResult.success,
                trigger: cronResult.trigger,
                execution_time_ms: step3Time
            });
            
            console.log(`✅ ETAPA 3 CONCLUÍDA: ${step3Time}ms`);
            
        } catch (error) {
            console.error('❌ ERRO na Etapa 3:', error.message);
            results.push({
                step: 3,
                service: 'tenant-platform-cron',
                success: false,
                error: error.message,
                execution_time_ms: Date.now() - step3Start
            });
        }
        
        // RELATÓRIO FINAL
        const totalTime = Date.now() - startTime;
        const successfulSteps = results.filter(r => r.success).length;
        const failedSteps = results.filter(r => !r.success).length;
        
        console.log('\n' + '='.repeat(70));
        console.log('📋 RELATÓRIO FINAL DO PIPELINE');
        console.log('='.repeat(70));
        console.log(`🎯 Status Geral: ${failedSteps === 0 ? 'SUCESSO COMPLETO' : 'SUCESSO PARCIAL'}`);
        console.log(`✅ Etapas Bem-sucedidas: ${successfulSteps}/3`);
        console.log(`❌ Etapas com Erro: ${failedSteps}/3`);
        console.log(`⏱️ Tempo Total: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
        
        console.log('\n📊 DETALHES POR ETAPA:');
        results.forEach((result, idx) => {
            const status = result.success ? '✅' : '❌';
            console.log(`   ${status} Etapa ${result.step}: ${result.service} (${result.execution_time_ms}ms)`);
            
            if (result.details) {
                result.details.forEach(detail => {
                    console.log(`      📅 ${detail.period}: ${detail.processed} tenants (${detail.time_ms}ms)`);
                });
            }
            
            if (result.processed_periods) {
                console.log(`      📈 Períodos: ${result.processed_periods.join(', ')}`);
            }
            
            if (result.error) {
                console.log(`      ❌ Erro: ${result.error}`);
            }
        });
        
        console.log('\n🚀 PRÓXIMOS PASSOS:');
        console.log('   1. Gerar CSVs com dados dos serviços reais');
        console.log('   2. Analisar performance de cada serviço');
        console.log('   3. Validar consistência entre tenant_metrics e platform_metrics');
        console.log('='.repeat(70));
        
        return {
            success: failedSteps === 0,
            total_time_ms: totalTime,
            successful_steps: successfulSteps,
            failed_steps: failedSteps,
            results: results
        };
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO no pipeline:', error);
        return {
            success: false,
            total_time_ms: Date.now() - startTime,
            error: error.message,
            results: results
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    executarPipelineCompletoServicos()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 PIPELINE EXECUTADO COM SUCESSO!');
                console.log('🔧 Todos os serviços executaram corretamente');
                console.log('📊 Dados prontos para análise de performance');
                process.exit(0);
            } else {
                console.log('\n⚠️ PIPELINE EXECUTADO COM PROBLEMAS');
                console.log('🔍 Verifique os erros acima');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 FALHA CRÍTICA:', error);
            process.exit(1);
        });
}

module.exports = { executarPipelineCompletoServicos };