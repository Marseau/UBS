require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * LIMPEZA TOTAL DE DADOS MOCK - PREPARAÇÃO PARA TESTE DE PRODUÇÃO
 * 
 * Este script remove TODOS os dados simulados/mock das tabelas de métricas
 * para garantir que os testes sejam feitos apenas com dados REAIS.
 */

async function cleanAllMockData() {
    console.log('🧹 LIMPEZA TOTAL DE DADOS MOCK - TESTE DE PRODUÇÃO');
    console.log('='.repeat(70));
    console.log('⚠️  REMOVENDO TODOS OS DADOS SIMULADOS DAS TABELAS DE MÉTRICAS');
    console.log('='.repeat(70));
    
    const results = {
        tenant_metrics: 0,
        platform_metrics: 0,
        ubs_metric_system: 0,
        errors: []
    };
    
    try {
        // 1. LIMPAR TENANT_METRICS
        console.log('\n🗑️ LIMPANDO TABELA: tenant_metrics');
        
        const { data: beforeTenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 Registros antes: ${beforeTenantCount || 0}`);
        
        const { error: tenantError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (tenantError) {
            results.errors.push(`tenant_metrics: ${tenantError.message}`);
            console.log(`   ❌ Erro: ${tenantError.message}`);
        } else {
            results.tenant_metrics = beforeTenantCount || 0;
            console.log(`   ✅ Removidos: ${beforeTenantCount || 0} registros`);
        }
        
        // 2. LIMPAR PLATFORM_METRICS
        console.log('\n🗑️ LIMPANDO TABELA: platform_metrics');
        
        const { data: beforePlatformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 Registros antes: ${beforePlatformCount || 0}`);
        
        const { error: platformError } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (platformError) {
            results.errors.push(`platform_metrics: ${platformError.message}`);
            console.log(`   ❌ Erro: ${platformError.message}`);
        } else {
            results.platform_metrics = beforePlatformCount || 0;
            console.log(`   ✅ Removidos: ${beforePlatformCount || 0} registros`);
        }
        
        // 3. LIMPAR UBS_METRIC_SYSTEM
        console.log('\n🗑️ LIMPANDO TABELA: ubs_metric_system');
        
        const { data: beforeUbsCount } = await supabase
            .from('ubs_metric_system')
            .select('*', { count: 'exact', head: true });
        
        console.log(`   📊 Registros antes: ${beforeUbsCount || 0}`);
        
        const { error: ubsError } = await supabase
            .from('ubs_metric_system')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (ubsError) {
            results.errors.push(`ubs_metric_system: ${ubsError.message}`);
            console.log(`   ❌ Erro: ${ubsError.message}`);
        } else {
            results.ubs_metric_system = beforeUbsCount || 0;
            console.log(`   ✅ Removidos: ${beforeUbsCount || 0} registros`);
        }
        
        // 4. VERIFICAR DADOS REAIS DISPONÍVEIS
        console.log('\n🔍 VERIFICANDO DADOS REAIS DISPONÍVEIS PARA CÁLCULO:');
        console.log('='.repeat(70));
        
        // Conversation History
        const { data: convCount } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .not('conversation_outcome', 'is', null);
        
        console.log(`📞 Conversation History: ${convCount || 0} conversas reais`);
        
        // Appointments
        const { data: apptCount } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });
        
        console.log(`📅 Appointments: ${apptCount || 0} agendamentos`);
        
        // Conversation Billing (dados reais de cobrança)
        const { data: billingCount } = await supabase
            .from('conversation_billing')
            .select('*', { count: 'exact', head: true });
        
        console.log(`💳 Conversation Billing: ${billingCount || 0} registros de cobrança`);
        
        // Tenants ativos
        const { data: tenantsCount } = await supabase
            .from('tenants')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        
        console.log(`🏢 Tenants Ativos: ${tenantsCount || 0} tenants`);
        
        // 5. VERIFICAR ÚLTIMOS 30 DIAS DE DADOS REAIS
        console.log('\n📊 DADOS REAIS DOS ÚLTIMOS 30 DIAS:');
        console.log('='.repeat(70));
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: recentConv } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo.toISOString())
            .not('conversation_outcome', 'is', null);
        
        const { data: recentAppt } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo.toISOString());
        
        console.log(`📞 Conversas (30d): ${recentConv || 0}`);
        console.log(`📅 Appointments (30d): ${recentAppt || 0}`);
        
        // 6. RELATÓRIO FINAL
        console.log('\n' + '='.repeat(70));
        console.log('📋 RELATÓRIO DE LIMPEZA');
        console.log('='.repeat(70));
        
        console.log('🗑️ DADOS MOCK REMOVIDOS:');
        console.log(`   • tenant_metrics: ${results.tenant_metrics} registros`);
        console.log(`   • platform_metrics: ${results.platform_metrics} registros`);
        console.log(`   • ubs_metric_system: ${results.ubs_metric_system} registros`);
        console.log(`   📊 Total removido: ${results.tenant_metrics + results.platform_metrics + results.ubs_metric_system} registros`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ ERROS:');
            results.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        console.log('\n✅ DADOS REAIS DISPONÍVEIS:');
        console.log(`   📞 Conversas: ${convCount || 0}`);
        console.log(`   📅 Appointments: ${apptCount || 0}`);
        console.log(`   💳 Billing: ${billingCount || 0}`);
        console.log(`   🏢 Tenants: ${tenantsCount || 0}`);
        
        console.log('\n🎯 SISTEMA LIMPO E PRONTO PARA TESTE DE PRODUÇÃO');
        console.log('✅ Próximo passo: Executar jobs com dados reais');
        
        return {
            success: results.errors.length === 0,
            removed_records: results.tenant_metrics + results.platform_metrics + results.ubs_metric_system,
            real_data_available: {
                conversations: convCount || 0,
                appointments: apptCount || 0,
                billing: billingCount || 0,
                tenants: tenantsCount || 0
            },
            errors: results.errors
        };
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO NA LIMPEZA:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Executar limpeza
cleanAllMockData()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 LIMPEZA CONCLUÍDA COM SUCESSO!');
            console.log('🚀 Sistema pronto para teste de produção com dados reais');
            process.exit(0);
        } else {
            console.log('\n💥 LIMPEZA FALHOU!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 ERRO FATAL:', error);
        process.exit(1);
    });