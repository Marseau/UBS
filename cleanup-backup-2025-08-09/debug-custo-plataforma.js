/**
 * DEBUG: Investigar por que métrica custo_plataforma existe mas erro persiste
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugCustoPlatformaIssue() {
    console.log('🔍 DEBUGGANDO PROBLEMA COM CUSTO_PLATAFORMA...\n');
    
    // Replicar exatamente a query que está falhando no PlatformAggregationService
    const period = '30d';
    
    console.log(`📊 Testando query exata do PlatformAggregationService para período: ${period}`);
    
    const { data: costMetrics, error: costError } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('period', period)
        .eq('metric_type', 'custo_plataforma')
        .order('calculated_at', { ascending: false });

    console.log('\n🔍 RESULTADO DA QUERY:');
    console.log(`   Error: ${costError ? costError.message : 'null'}`);
    console.log(`   Data: ${costMetrics ? costMetrics.length + ' registros' : 'null'}`);
    
    if (costError) {
        console.log('\n❌ ERRO ENCONTRADO:');
        console.log(costError);
        return;
    }
    
    if (!costMetrics || costMetrics.length === 0) {
        console.log('\n❌ PROBLEMA CONFIRMADO: Query retorna 0 registros');
        
        // Investigar registros disponíveis
        console.log('\n🔍 Investigando registros disponíveis...');
        
        const { data: allCusto } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, calculated_at, metric_data')
            .eq('metric_type', 'custo_plataforma')
            .order('calculated_at', { ascending: false })
            .limit(10);
        
        console.log(`📊 Total de registros custo_plataforma: ${allCusto?.length || 0}`);
        
        if (allCusto && allCusto.length > 0) {
            console.log('\n📋 Períodos disponíveis para custo_plataforma:');
            const periods = [...new Set(allCusto.map(r => r.period))];
            periods.forEach(p => {
                const count = allCusto.filter(r => r.period === p).length;
                console.log(`   • ${p}: ${count} registros`);
            });
            
            console.log('\n📋 Amostra dos dados:');
            allCusto.slice(0, 3).forEach((record, i) => {
                const data = record.metric_data || {};
                console.log(`   ${i+1}. Tenant: ${record.tenant_id}, Período: ${record.period}`);
                console.log(`      Custo: R$ ${data.custo_total_plataforma?.toFixed(2) || '0.00'}`);
                console.log(`      Calculado: ${record.calculated_at}`);
            });
        }
        
    } else {
        console.log('\n✅ QUERY FUNCIONOU - Problema pode ser intermitente');
        console.log(`📊 Encontrados ${costMetrics.length} registros`);
        
        // Mostrar amostra
        costMetrics.slice(0, 3).forEach((record, i) => {
            const data = record.metric_data || {};
            console.log(`   ${i+1}. Tenant: ${record.tenant_id}`);
            console.log(`      Custo: R$ ${data.custo_total_plataforma?.toFixed(2) || '0.00'}`);
        });
    }
    
    // Testar outros períodos
    console.log('\n🔍 Testando outros períodos...');
    for (const testPeriod of ['7d', '90d']) {
        const { data: testData, error: testError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id')
            .eq('period', testPeriod)
            .eq('metric_type', 'custo_plataforma');
        
        console.log(`   ${testPeriod}: ${testError ? 'ERRO' : (testData?.length || 0) + ' registros'}`);
    }
    
    // Verificar se há problema com calculated_at sendo null
    console.log('\n🔍 Verificando registros com calculated_at null...');
    const { data: nullCalcAt } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, period')
        .eq('metric_type', 'custo_plataforma')
        .is('calculated_at', null);
    
    console.log(`📊 Registros com calculated_at null: ${nullCalcAt?.length || 0}`);
    
    if (nullCalcAt && nullCalcAt.length > 0) {
        console.log('⚠️ PROBLEMA ENCONTRADO: Alguns registros têm calculated_at null');
        console.log('   Isso pode causar problemas na ordenação');
        
        // Corrigir registros com calculated_at null
        console.log('\n🔧 Corrigindo registros com calculated_at null...');
        const { error: updateError } = await supabase
            .from('tenant_metrics')
            .update({ calculated_at: new Date().toISOString() })
            .eq('metric_type', 'custo_plataforma')
            .is('calculated_at', null);
        
        if (updateError) {
            console.log(`❌ Erro ao corrigir: ${updateError.message}`);
        } else {
            console.log(`✅ Corrigidos registros com calculated_at null`);
        }
    }
    
    // Teste final após possível correção
    console.log('\n🧪 TESTE FINAL...');
    const { data: finalTest, error: finalError } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('period', '30d')
        .eq('metric_type', 'custo_plataforma')
        .order('calculated_at', { ascending: false });
    
    console.log(`   Resultado final: ${finalError ? 'ERRO' : (finalTest?.length || 0) + ' registros'}`);
    
    if (finalTest && finalTest.length > 0) {
        console.log('✅ PROBLEMA RESOLVIDO!');
    } else {
        console.log('❌ PROBLEMA PERSISTE - Verificar manualmente');
    }
}

// Executar debug
debugCustoPlatformaIssue().then(() => {
    console.log('\n🏁 Debug finalizado');
    process.exit(0);
}).catch(error => {
    console.error('\n💥 Erro no debug:', error);
    process.exit(1);
});