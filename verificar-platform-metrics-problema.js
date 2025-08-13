require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarPlatformMetrics() {
    console.log('🔍 VERIFICANDO POR QUE PLATFORM_METRICS NÃO FOI POPULADA');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // Verificar se platform_metrics tem dados
        const { data: platformData, count: platformCount } = await client
            .from('platform_metrics')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);
            
        console.log('📊 PLATFORM_METRICS:');
        console.log(`   Total de registros: ${platformCount || 0}`);
        
        if (platformData?.length > 0) {
            console.log('   ✅ Dados encontrados:');
            platformData.forEach((item, i) => {
                console.log(`   ${i+1}. Period: ${item.period} | Revenue: R$ ${item.total_revenue || 0} | Tenants: ${item.total_tenants || 0}`);
            });
        } else {
            console.log('   ❌ Nenhum dado encontrado em platform_metrics');
        }
        
        // Verificar se tenant_metrics tem dados (para comparação)
        const { count: tenantCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`\n📈 TENANT_METRICS: ${tenantCount || 0} registros`);
        
        // DIAGNÓSTICO FINAL
        console.log('\n' + '='.repeat(70));
        console.log('🎯 DIAGNÓSTICO:');
        
        if (tenantCount > 0 && platformCount === 0) {
            console.log('❌ PROBLEMA IDENTIFICADO:');
            console.log('   - tenant_metrics: ✅ populada com sucesso');
            console.log('   - platform_metrics: ❌ vazia');
            console.log('   - PlatformAggregationService falhou');
            console.log('\n💡 PRÓXIMA AÇÃO: Executar PlatformAggregationService isoladamente');
        } else if (platformCount > 0) {
            console.log('✅ platform_metrics está populada corretamente');
        } else {
            console.log('❌ Ambas as tabelas estão vazias');
        }
        
    } catch (error) {
        console.error('💥 Erro na verificação:', error);
    }
}

verificarPlatformMetrics().then(() => process.exit(0)).catch(console.error);