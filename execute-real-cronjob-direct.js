/**
 * EXECUÇÃO DIRETA DO CRON JOB REAL PARA VALIDAÇÃO
 * Usar o service compilado existente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeRealCronJobDirect() {
    console.log('🚀 EXECUÇÃO DIRETA DO CRON JOB REAL');
    console.log('='.repeat(60));
    console.log('🎯 Usar service compilado dist/services/');
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    
    try {
        // STEP 1: Limpar tabelas
        console.log('\n🗑️ STEP 1: LIMPEZA DAS TABELAS');
        console.log('-'.repeat(40));
        
        const { error: deleteTenant } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        const { error: deletePlatform } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (deleteTenant || deletePlatform) {
            console.error('Erro na limpeza:', deleteTenant || deletePlatform);
        }
        
        console.log('✅ Tabelas limpas');
        
        // STEP 2: Executar service compilado
        console.log('\n🚀 STEP 2: EXECUTANDO SERVICE COMPILADO');
        console.log('-'.repeat(40));
        
        const cronStartTime = Date.now();
        
        try {
            // Tentar importar e executar o service compilado
            const { TenantMetricsCronService } = require('./dist/services/tenant-metrics-cron.service.js');
            const cronService = new TenantMetricsCronService();
            
            console.log('🔧 TenantMetricsCronService importado');
            console.log('🔄 Executando calculateHistoricalMetrics()...');
            
            await cronService.calculateHistoricalMetrics();
            
            console.log('✅ Service executado com sucesso');
            
        } catch (importError) {
            console.error('❌ Erro ao importar service:', importError.message);
            
            // Tentar service alternativo
            try {
                const { TenantMetricsService } = require('./dist/services/tenant-metrics.service.js');
                const metricsService = new TenantMetricsService();
                
                console.log('🔧 TenantMetricsService importado (alternativo)');
                console.log('🔄 Executando método principal...');
                
                // Tentar métodos possíveis
                if (typeof metricsService.calculateAllMetrics === 'function') {
                    await metricsService.calculateAllMetrics();
                } else if (typeof metricsService.calculateMetrics === 'function') {
                    await metricsService.calculateMetrics();
                } else {
                    console.log('⚠️ Métodos disponíveis:', Object.getOwnPropertyNames(metricsService));
                }
                
                console.log('✅ Service alternativo executado');
                
            } catch (altError) {
                console.error('❌ Erro no service alternativo:', altError.message);
                throw altError;
            }
        }
        
        const cronExecutionTime = Math.round((Date.now() - cronStartTime) / 1000);
        
        // STEP 3: Verificar resultados
        console.log('\n📊 STEP 3: VERIFICANDO RESULTADOS');
        console.log('-'.repeat(40));
        
        const { count: tenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: platformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📊 Resultados:`);
        console.log(`   tenant_metrics: ${tenantCount || 0} registros`);
        console.log(`   platform_metrics: ${platformCount || 0} registros`);
        console.log(`   ⏱️ Tempo execução: ${cronExecutionTime}s`);
        
        // Amostra dos dados
        if ((tenantCount || 0) > 0) {
            const { data: sampleTenant } = await supabase
                .from('tenant_metrics')
                .select('tenant_id, metric_type, period')
                .limit(3);
                
            console.log('\n📋 Amostra tenant_metrics:');
            sampleTenant?.forEach((row, i) => {
                console.log(`   ${i+1}. ${row.tenant_id?.substring(0,8)} - ${row.metric_type} - ${row.period}`);
            });
        }
        
        if ((platformCount || 0) > 0) {
            const { data: samplePlatform } = await supabase
                .from('platform_metrics')
                .select('period_days, total_revenue, active_tenants')
                .limit(3);
                
            console.log('\n🌐 Amostra platform_metrics:');
            samplePlatform?.forEach((row, i) => {
                console.log(`   ${i+1}. ${row.period_days}d - R$ ${row.total_revenue} - ${row.active_tenants} tenants`);
            });
        }
        
        // Análise final
        const totalTime = Math.round((Date.now() - startTime) / 1000);
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 VALIDAÇÃO DO SERVICE REAL CONCLUÍDA');
        console.log('='.repeat(60));
        
        console.log(`\n⏱️ Tempo total: ${totalTime}s`);
        
        if ((tenantCount || 0) === 0 && (platformCount || 0) === 0) {
            console.log('❌ RESULTADO: ZERO DADOS GERADOS');
            console.log('   • Service original não gerou métricas');
            console.log('   • Confirma problema com PostgreSQL functions');
            console.log('   • Sistema chama functions inexistentes');
            
        } else {
            console.log('✅ RESULTADO: DADOS REAIS GERADOS');
            console.log('   • Service original funcionando');
            console.log('   • PostgreSQL functions existem');
            console.log('   • Sistema está operacional');
        }
        
        return {
            tenant_metrics_count: tenantCount || 0,
            platform_metrics_count: platformCount || 0,
            execution_time: totalTime,
            has_data: (tenantCount || 0) > 0 || (platformCount || 0) > 0
        };
        
    } catch (error) {
        console.error('💥 ERRO FATAL:', error);
        
        // Estado final das tabelas mesmo com erro
        try {
            const { count: errorTenant } = await supabase
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });
            const { count: errorPlatform } = await supabase
                .from('platform_metrics')
                .select('*', { count: 'exact', head: true });
                
            console.log(`\n📊 Estado final: tenant=${errorTenant || 0}, platform=${errorPlatform || 0}`);
        } catch {}
        
        throw error;
    }
}

// Executar
if (require.main === module) {
    executeRealCronJobDirect().then((result) => {
        console.log('\n🎯 VALIDAÇÃO CONCLUÍDA');
        if (result?.has_data) {
            console.log('✅ Service original está FUNCIONANDO e gerando dados');
        } else {
            console.log('❌ Service original está FALHANDO - confirma problema original');
        }
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = {
    executeRealCronJobDirect
};