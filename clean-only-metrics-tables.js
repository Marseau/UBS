require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * LIMPAR APENAS TABELAS DE MÉTRICAS CALCULADAS
 * 
 * ✅ LIMPAR: tenant_metrics, platform_metrics (dados calculados)
 * ❌ NÃO TOCAR: tenants, conversation_history, appointments, billing (dados reais)
 */

async function cleanOnlyMetricsTables() {
    console.log('🧹 LIMPEZA APENAS DAS TABELAS DE MÉTRICAS CALCULADAS');
    console.log('='.repeat(70));
    console.log('✅ PRESERVANDO: Todos os dados reais (tenants, conversas, appointments, billing)');
    console.log('🗑️ LIMPANDO: Apenas métricas calculadas (tenant_metrics, platform_metrics)');
    console.log('='.repeat(70));
    
    try {
        // 1. VERIFICAR DADOS REAIS ANTES (para garantir que existem)
        console.log('\n🔍 VERIFICANDO DADOS REAIS (DEVEM PERMANECER):');
        
        const realDataChecks = [
            { table: 'tenants', description: 'Tenants' },
            { table: 'conversation_history', description: 'Conversas' },
            { table: 'appointments', description: 'Agendamentos' },
            { table: 'conversation_billing', description: 'Billing' }
        ];
        
        const realDataCounts = {};
        
        for (const check of realDataChecks) {
            const { data: count, error } = await supabase
                .from(check.table)
                .select('*', { count: 'exact', head: true });
            
            if (!error) {
                realDataCounts[check.table] = count || 0;
                console.log(`   📊 ${check.description}: ${count || 0} registros`);
            } else {
                console.log(`   ❌ ${check.description}: Erro - ${error.message}`);
            }
        }
        
        // 2. LIMPAR APENAS TABELAS DE MÉTRICAS
        console.log('\n🗑️ LIMPANDO TABELAS DE MÉTRICAS CALCULADAS:');
        
        const metricsResults = {
            tenant_metrics: 0,
            platform_metrics: 0,
            errors: []
        };
        
        // Limpar tenant_metrics
        const { data: beforeTenant } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 tenant_metrics antes: ${beforeTenant || 0} registros`);
        
        const { error: tenantError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (tenantError) {
            metricsResults.errors.push(`tenant_metrics: ${tenantError.message}`);
            console.log(`   ❌ Erro ao limpar tenant_metrics: ${tenantError.message}`);
        } else {
            metricsResults.tenant_metrics = beforeTenant || 0;
            console.log(`   ✅ tenant_metrics: ${beforeTenant || 0} registros removidos`);
        }
        
        // Limpar platform_metrics
        const { data: beforePlatform } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 platform_metrics antes: ${beforePlatform || 0} registros`);
        
        const { error: platformError } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (platformError) {
            metricsResults.errors.push(`platform_metrics: ${platformError.message}`);
            console.log(`   ❌ Erro ao limpar platform_metrics: ${platformError.message}`);
        } else {
            metricsResults.platform_metrics = beforePlatform || 0;
            console.log(`   ✅ platform_metrics: ${beforePlatform || 0} registros removidos`);
        }
        
        // 3. VERIFICAR DADOS REAIS APÓS (devem estar intactos)
        console.log('\n🔍 VERIFICANDO DADOS REAIS APÓS LIMPEZA (DEVEM ESTAR INTACTOS):');
        
        for (const check of realDataChecks) {
            const { data: count, error } = await supabase
                .from(check.table)
                .select('*', { count: 'exact', head: true });
            
            if (!error) {
                const before = realDataCounts[check.table] || 0;
                const after = count || 0;
                
                if (before === after) {
                    console.log(`   ✅ ${check.description}: ${after} registros (PRESERVADO)`);
                } else {
                    console.log(`   🚨 ${check.description}: ${before} → ${after} (DADOS PERDIDOS!)`);
                }
            }
        }
        
        // 4. VERIFICAR SE TABELAS DE MÉTRICAS ESTÃO VAZIAS
        console.log('\n🔍 VERIFICANDO TABELAS DE MÉTRICAS (DEVEM ESTAR VAZIAS):');
        
        const { data: afterTenant } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
        
        const { data: afterPlatform } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 tenant_metrics após: ${afterTenant || 0} registros`);
        console.log(`   📊 platform_metrics após: ${afterPlatform || 0} registros`);
        
        // 5. RELATÓRIO FINAL
        console.log('\n' + '='.repeat(70));
        console.log('📋 RELATÓRIO DE LIMPEZA SELETIVA');
        console.log('='.repeat(70));
        
        console.log('✅ DADOS REAIS PRESERVADOS:');
        Object.entries(realDataCounts).forEach(([table, count]) => {
            console.log(`   📊 ${table}: ${count} registros mantidos`);
        });
        
        console.log('\n🗑️ MÉTRICAS CALCULADAS REMOVIDAS:');
        console.log(`   📊 tenant_metrics: ${metricsResults.tenant_metrics} registros`);
        console.log(`   📊 platform_metrics: ${metricsResults.platform_metrics} registros`);
        
        if (metricsResults.errors.length > 0) {
            console.log('\n❌ ERROS:');
            metricsResults.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        console.log('\n🎯 STATUS:');
        if (metricsResults.errors.length === 0) {
            console.log('✅ LIMPEZA SELETIVA CONCLUÍDA COM SUCESSO');
            console.log('🚀 Sistema pronto para testar cron jobs com dados reais');
        } else {
            console.log('⚠️ LIMPEZA PARCIAL - Verificar erros acima');
        }
        
        return {
            success: metricsResults.errors.length === 0,
            real_data_preserved: realDataCounts,
            metrics_removed: {
                tenant_metrics: metricsResults.tenant_metrics,
                platform_metrics: metricsResults.platform_metrics
            },
            errors: metricsResults.errors
        };
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO:', error);
        return { success: false, error: error.message };
    }
}

cleanOnlyMetricsTables()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 PRONTO PARA TESTE DE PRODUÇÃO!');
            process.exit(0);
        } else {
            console.log('\n💥 FALHA NA LIMPEZA!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 ERRO FATAL:', error);
        process.exit(1);
    });