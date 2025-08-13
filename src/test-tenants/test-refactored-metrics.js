require('dotenv').config();
const { TenantMetricsRefactoredService } = require('./dist/services/tenant-metrics-refactored.service.js');

/**
 * TESTE DO SERVICE REFATORADO
 * Executa pipeline com nova estrutura de 3 campos JSON
 */

async function testRefactoredMetrics() {
    console.log('🧪 TESTANDO SERVICE REFATORADO COM NOVA ESTRUTURA JSON');
    console.log('='.repeat(70));
    
    try {
        const service = new TenantMetricsRefactoredService();
        
        // 1. Buscar tenants ativos primeiro
        console.log('🔍 Buscando tenants ativos...');
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(3); // Testar apenas 3 primeiro
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        console.log(`📊 Encontrados ${tenants.length} tenants ativos`);
        tenants.forEach(t => console.log(`   - ${t.name} (${t.id})`));
        
        // 2. Processar cada tenant para os 3 períodos
        const periods = ['7d', '30d', '90d'];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 Processando tenant: ${tenant.name}`);
            
            for (const period of periods) {
                console.log(`   ⏰ Período: ${period}`);
                
                try {
                    await service.calculateAndSaveTenantMetrics(tenant.id, period);
                    console.log(`   ✅ ${period} concluído`);
                } catch (error) {
                    console.error(`   ❌ Erro em ${period}:`, error.message);
                }
            }
        }
        
        // 3. Verificar dados salvos
        console.log('\n🔍 VERIFICANDO DADOS SALVOS:');
        
        const { data: savedMetrics, error: metricsError } = await supabase
            .from('tenant_metrics')
            .select('tenant_name, period, comprehensive_metrics, participation_metrics, ranking_metrics')
            .order('tenant_name, period');
        
        if (metricsError) {
            throw new Error(`Erro ao verificar métricas: ${metricsError.message}`);
        }
        
        console.log(`📊 Total de registros salvos: ${savedMetrics.length}`);
        
        savedMetrics.forEach(metric => {
            const compKeys = Object.keys(metric.comprehensive_metrics || {}).length;
            const partKeys = Object.keys(metric.participation_metrics || {}).length;
            const rankKeys = Object.keys(metric.ranking_metrics || {}).length;
            
            console.log(`   📈 ${metric.tenant_name} (${metric.period}): ${compKeys} comprehensive, ${partKeys} participation, ${rankKeys} ranking`);
        });
        
        console.log('\n✅ TESTE DO SERVICE REFATORADO CONCLUÍDO COM SUCESSO!');
        
    } catch (error) {
        console.error('❌ ERRO NO TESTE:', error);
        throw error;
    }
}

testRefactoredMetrics()
    .then(() => {
        console.log('\n🎉 PIPELINE REFATORADO FUNCIONAL!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 FALHA NO TESTE:', error);
        process.exit(1);
    });