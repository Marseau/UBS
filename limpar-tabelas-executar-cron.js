/**
 * EXECUTAR SISTEMA INTEGRADO COMPLETO
 * 1. Limpar tabelas tenant_metrics e platform_metrics
 * 2. Executar cron job com PostgreSQL functions integradas
 * 3. Validar dados populados
 */

const { createClient } = require('@supabase/supabase-js');
const { TenantMetricsCronService } = require('./dist/services/tenant-metrics-cron.service.js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executarSistemaCompleto() {
    console.log('🎯 EXECUTAR SISTEMA INTEGRADO COMPLETO');
    console.log('='.repeat(80));
    
    try {
        // PASSO 1: Limpar tabelas
        console.log('\n🗑️ PASSO 1: LIMPANDO TABELAS');
        console.log('-'.repeat(40));
        
        const { error: deleteTenantError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (deleteTenantError) {
            console.error('❌ Erro ao limpar tenant_metrics:', deleteTenantError);
        } else {
            console.log('✅ tenant_metrics limpa');
        }
        
        const { error: deletePlatformError } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (deletePlatformError) {
            console.error('❌ Erro ao limpar platform_metrics:', deletePlatformError);
        } else {
            console.log('✅ platform_metrics limpa');
        }
        
        // PASSO 2: Verificar PostgreSQL functions
        console.log('\n🔧 PASSO 2: VERIFICANDO POSTGRESQL FUNCTIONS');
        console.log('-'.repeat(40));
        
        const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista Spa & Salon
        
        try {
            const { data: testResult, error: testError } = await supabase
                .rpc('get_tenant_metrics_for_period', {
                    p_tenant_id: testTenantId,
                    p_start_date: '2025-07-31',
                    p_end_date: '2025-08-07',
                    p_period_type: '7d'
                });
                
            if (testError) {
                console.error('❌ PostgreSQL function não encontrada:', testError.message);
                throw testError;
            }
            
            console.log('✅ PostgreSQL functions OK');
            console.log(`📊 Teste: R$ ${testResult?.monthly_revenue || 0}, ${testResult?.new_customers || 0} customers`);
            
        } catch (functionError) {
            console.error('💥 ERRO CRÍTICO: PostgreSQL functions não funcionais');
            throw functionError;
        }
        
        // PASSO 3: Executar cron job integrado
        console.log('\n🚀 PASSO 3: EXECUTANDO CRON JOB INTEGRADO');
        console.log('-'.repeat(40));
        
        const cronService = new TenantMetricsCronService();
        
        console.log('🔄 Inicializando cron service...');
        await cronService.executeManualMetricsUpdate();
        
        // PASSO 4: Verificar dados populados
        console.log('\n📊 PASSO 4: VERIFICANDO DADOS POPULADOS');
        console.log('-'.repeat(40));
        
        // Contar registros populados
        const { count: tenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: platformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📊 tenant_metrics populados: ${tenantCount || 0}`);
        console.log(`🌐 platform_metrics populados: ${platformCount || 0}`);
        
        // Verificar se há dados reais (não zero)
        const { data: sampleData } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data, tenants(business_name)')
            .limit(5);
            
        console.log('\n📋 AMOSTRA DOS DADOS:');
        let hasRealData = false;
        
        for (const record of sampleData || []) {
            const data = record.metric_data || {};
            const tenantName = record.tenants?.business_name || 'Unknown';
            const revenue = data.total_revenue || data.monthly_revenue || 0;
            const customers = data.total_customers || data.new_customers || 0;
            const appointments = data.total_appointments || 0;
            
            console.log(`   ${tenantName} (${record.period}): R$ ${revenue}, ${customers} customers, ${appointments} appointments`);
            
            if (revenue > 0 || customers > 0 || appointments > 0) {
                hasRealData = true;
            }
        }
        
        // PASSO 5: Relatório final
        console.log('\n' + '='.repeat(80));
        console.log('🎯 RELATÓRIO FINAL DO SISTEMA INTEGRADO');
        console.log('='.repeat(80));
        
        console.log('\n✅ STATUS:');
        console.log(`   🗑️ Tabelas limpas: SIM`);
        console.log(`   🔧 PostgreSQL functions: IMPLEMENTADAS`);
        console.log(`   🚀 Cron job executado: SIM`);
        console.log(`   📊 tenant_metrics populados: ${tenantCount || 0}`);
        console.log(`   🌐 platform_metrics populados: ${platformCount || 0}`);
        console.log(`   💰 Dados reais gerados: ${hasRealData ? 'SIM' : 'NÃO'}`);
        
        if (hasRealData) {
            console.log('\n🎉 SUCESSO COMPLETO!');
            console.log('   ✅ Sistema integrado funcionando corretamente');
            console.log('   ✅ PostgreSQL functions retornando dados reais');
            console.log('   ✅ Pronto para gerar CSV final');
        } else {
            console.log('\n⚠️ PROBLEMA IDENTIFICADO:');
            console.log('   ❌ Sistema executado mas ainda retorna dados zero');
            console.log('   🔍 Verificar logs do cron service para mais detalhes');
        }
        
        return {
            success: true,
            tenant_metrics_count: tenantCount || 0,
            platform_metrics_count: platformCount || 0,
            has_real_data: hasRealData,
            ready_for_csv: hasRealData
        };
        
    } catch (error) {
        console.error('💥 ERRO FATAL NO SISTEMA:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    executarSistemaCompleto().then((result) => {
        console.log('\n🎯 EXECUÇÃO COMPLETA');
        if (result.has_real_data) {
            console.log('🎉 Sistema integrado com PostgreSQL functions FUNCIONANDO!');
            console.log('✅ Pronto para gerar CSV final de validação');
        } else {
            console.log('⚠️ Sistema executado mas precisa de ajustes');
        }
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = {
    executarSistemaCompleto
};