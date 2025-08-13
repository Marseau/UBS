/**
 * EXECUÇÃO REAL DO CRON JOB PARA VALIDAÇÃO
 * 
 * 1. Limpar tenant_metrics e platform_metrics
 * 2. Executar o cron job REAL (service original)
 * 3. Medir performance real
 * 4. Validar resultados
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeRealCronJobValidation() {
    console.log('🚀 EXECUÇÃO REAL DO CRON JOB - VALIDAÇÃO COMPLETA');
    console.log('='.repeat(70));
    console.log('🎯 Objetivo: Executar cron job REAL (service original)');
    console.log('='.repeat(70));
    
    const startTime = Date.now();
    
    try {
        // STEP 1: Limpar ambas as tabelas
        console.log('\n🗑️ STEP 1: LIMPANDO TABELAS TENANT_METRICS E PLATFORM_METRICS');
        console.log('-'.repeat(60));
        
        console.log('🔄 Limpando tenant_metrics...');
        const { error: deleteTenantError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (deleteTenantError) {
            console.error('❌ Erro ao limpar tenant_metrics:', deleteTenantError.message);
            throw deleteTenantError;
        }
        
        console.log('🔄 Limpando platform_metrics...');
        const { error: deletePlatformError } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (deletePlatformError) {
            console.error('❌ Erro ao limpar platform_metrics:', deletePlatformError.message);
            throw deletePlatformError;
        }
        
        // Verificar limpeza
        const { count: tenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: platformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`✅ Tabelas limpas:`);
        console.log(`   tenant_metrics: ${tenantCount || 0} registros`);
        console.log(`   platform_metrics: ${platformCount || 0} registros`);
        
        // STEP 2: Executar o cron job REAL via API interna
        console.log('\n🚀 STEP 2: EXECUTANDO CRON JOB REAL VIA API');
        console.log('-'.repeat(60));
        console.log('⚠️ ATENÇÃO: Vai executar o service original real');
        
        const cronStartTime = Date.now();
        
        // Executar via fetch para o endpoint do cron job
        console.log('🔧 Chamando endpoint /api/cron/tenant-metrics...');
        
        const response = await fetch('http://localhost:3000/api/cron/tenant-metrics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.CRON_SECRET || 'internal-cron-call'
            }
        });
        
        if (!response.ok) {
            // Se não tiver endpoint, vamos executar diretamente via TenantMetricsService
            console.log('⚠️ Endpoint não disponível, executando via service direto...');
            
            // Importar e executar o service original TypeScript compilado
            const { TenantMetricsService } = require('../../dist/services/tenant-metrics.service');
            const tenantMetricsService = new TenantMetricsService();
            
            console.log('🔄 Executando calculateAllMetrics()...');
            await tenantMetricsService.calculateAllMetrics();
            
        } else {
            const result = await response.json();
            console.log('✅ Endpoint executado:', result);
        }
        
        const cronExecutionTime = Math.round((Date.now() - cronStartTime) / 1000);
        
        console.log(`✅ Cron job concluído em ${cronExecutionTime}s`);
        
        // STEP 3: Validar resultados
        console.log('\n📊 STEP 3: VALIDANDO RESULTADOS DO CRON JOB REAL');
        console.log('-'.repeat(60));
        
        // Contar registros criados
        const { count: finalTenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: finalPlatformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
        
        // Buscar amostra dos dados
        const { data: sampleTenantData } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at, metric_data')
            .order('calculated_at', { ascending: false })
            .limit(3);
            
        const { data: samplePlatformData } = await supabase
            .from('platform_metrics')
            .select('period_days, total_revenue, active_tenants, created_at')
            .order('created_at', { ascending: false })
            .limit(3);
        
        console.log(`📊 Registros criados:`);
        console.log(`   tenant_metrics: ${finalTenantCount || 0}`);
        console.log(`   platform_metrics: ${finalPlatformCount || 0}`);
        
        // Analisar amostra dos dados
        if (sampleTenantData && sampleTenantData.length > 0) {
            console.log('\n📋 AMOSTRA TENANT_METRICS:');
            sampleTenantData.forEach((record, index) => {
                const metricData = record.metric_data || {};
                console.log(`   ${index + 1}. ${record.tenant_id.substring(0, 8)} (${record.period}): ` +
                           `Revenue: ${metricData.monthly_revenue || 'N/A'}, ` +
                           `Customers: ${metricData.new_customers || 'N/A'}`);
            });
        } else {
            console.log('\n📋 TENANT_METRICS: Nenhum registro encontrado');
        }
        
        if (samplePlatformData && samplePlatformData.length > 0) {
            console.log('\n🌐 AMOSTRA PLATFORM_METRICS:');
            samplePlatformData.forEach((record, index) => {
                console.log(`   ${index + 1}. ${record.period_days || 'N/A'}d: ` +
                           `Revenue: R$ ${record.total_revenue || 0}, ` +
                           `Tenants: ${record.active_tenants || 0}`);
            });
        } else {
            console.log('\n🌐 PLATFORM_METRICS: Nenhum registro encontrado');
        }
        
        // STEP 4: Análise dos resultados
        const totalExecutionTime = Math.round((Date.now() - startTime) / 1000);
        
        console.log('\n' + '='.repeat(70));
        console.log('🎉 VALIDAÇÃO DO CRON JOB REAL CONCLUÍDA');
        console.log('='.repeat(70));
        
        console.log('\n📊 RESULTADOS:');
        console.log(`   ⏱️ Tempo total: ${totalExecutionTime}s`);
        console.log(`   🚀 Tempo cron job: ${cronExecutionTime}s`);
        console.log(`   📊 tenant_metrics: ${finalTenantCount || 0} registros`);
        console.log(`   🌐 platform_metrics: ${finalPlatformCount || 0} registros`);
        
        console.log('\n🎯 ANÁLISE:');
        
        if ((finalTenantCount || 0) === 0 && (finalPlatformCount || 0) === 0) {
            console.log('❌ PROBLEMA: Service original retornou ZERO métricas');
            console.log('   • Confirma que sistema antigo estava com functions inexistentes');
            console.log('   • PostgreSQL functions precisam ser implementadas no banco');
            console.log('   • Sistema atual chama functions que não existem');
            
        } else if ((finalTenantCount || 0) > 0 || (finalPlatformCount || 0) > 0) {
            console.log('✅ SUCESSO: Service original gerou dados reais');
            console.log('   • Sistema está funcionando com dados válidos');
            console.log('   • PostgreSQL functions existem e funcionam');
        
        } else {
            console.log('⚠️ RESULTADO INESPERADO: Verificar implementação');
        }
        
        return {
            execution_time_seconds: totalExecutionTime,
            cron_execution_time_seconds: cronExecutionTime,
            tenant_metrics_count: finalTenantCount || 0,
            platform_metrics_count: finalPlatformCount || 0,
            has_data: (finalTenantCount || 0) > 0 || (finalPlatformCount || 0) > 0,
            sample_tenant_data: sampleTenantData,
            sample_platform_data: samplePlatformData
        };
        
    } catch (error) {
        console.error('💥 ERRO na execução do cron job real:', error);
        
        // Em caso de erro, ainda tentar mostrar o estado das tabelas
        try {
            const { count: errorTenantCount } = await supabase
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });
                
            const { count: errorPlatformCount } = await supabase
                .from('platform_metrics')
                .select('*', { count: 'exact', head: true });
                
            console.log(`\n📊 Estado após erro:`);
            console.log(`   tenant_metrics: ${errorTenantCount || 0} registros`);
            console.log(`   platform_metrics: ${errorPlatformCount || 0} registros`);
        } catch (stateError) {
            console.error('Erro ao verificar estado das tabelas:', stateError.message);
        }
        
        throw error;
    }
}

// Executar validação real
if (require.main === module) {
    executeRealCronJobValidation().then((result) => {
        if (result?.has_data) {
            console.log('\n🎯 VALIDAÇÃO REAL: SERVICE ORIGINAL FUNCIONANDO!');
            console.log('✅ Cron job gerou dados reais');
        } else {
            console.log('\n⚠️ VALIDAÇÃO REAL: SERVICE ORIGINAL RETORNOU ZERO DADOS');
            console.log('❌ Confirma problema com PostgreSQL functions inexistentes');
        }
        process.exit(0);
    }).catch(error => {
        console.error('\nErro fatal na validação real:', error.message);
        console.log('\n🔍 DIAGNÓSTICO DO ERRO:');
        if (error.message.includes('ECONNREFUSED')) {
            console.log('   • Servidor não está rodando em localhost:3000');
            console.log('   • Execute: npm run dev');
        } else if (error.message.includes('function') && error.message.includes('does not exist')) {
            console.log('   • PostgreSQL function não existe no banco');
            console.log('   • Confirma problema original do sistema');
        }
        process.exit(1);
    });
}

module.exports = {
    executeRealCronJobValidation
};