require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function corrigirPlatformMetrics4Campos() {
    console.log('🔧 CORRIGINDO PLATFORM_METRICS PARA TER OS 4 CAMPOS JSON');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Verificar estado atual
        const { data: current } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1);
            
        if (!current || current.length === 0) {
            console.log('❌ Nenhum registro encontrado em platform_metrics');
            return;
        }
        
        console.log('📊 Estado atual:');
        console.log('   comprehensive_metrics:', !!current[0].comprehensive_metrics);
        console.log('   participation_metrics:', !!current[0].participation_metrics); 
        console.log('   ranking_metrics:', !!current[0].ranking_metrics);
        console.log('   metric_data:', current[0].hasOwnProperty('metric_data'));
        
        // 2. Se não tem metric_data, precisamos recriar os registros com UPDATE
        if (!current[0].hasOwnProperty('metric_data')) {
            console.log('\\n⚠️ Campo metric_data não existe na tabela');
            console.log('💡 SOLUÇÕES POSSÍVEIS:');
            console.log('   1. Executar ALTER TABLE platform_metrics ADD COLUMN metric_data JSONB; via painel Supabase');
            console.log('   2. Ou recomputar usando PlatformAggregationService que já salva os 4 campos');
            
            // Vamos rodar o serviço para recomputar tudo
            console.log('\\n🚀 Executando PlatformAggregationService para recomputar...');
            
            const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;
            const service = new PlatformAggregationService();
            
            await service.executeCompletePlatformAggregation();
            
            // Verificar novamente
            const { data: updated } = await client
                .from('platform_metrics')
                .select('*')
                .limit(1);
                
            if (updated && updated[0]) {
                console.log('\\n✅ Verificação pós-recomputação:');
                console.log('   comprehensive_metrics:', !!updated[0].comprehensive_metrics);
                console.log('   participation_metrics:', !!updated[0].participation_metrics);
                console.log('   ranking_metrics:', !!updated[0].ranking_metrics);
                console.log('   metric_data:', updated[0].hasOwnProperty('metric_data'));
            }
        } else {
            console.log('\\n✅ Todos os 4 campos JSON já existem!');
        }
        
    } catch (error) {
        console.error('💥 Erro na correção:', error);
    }
}

corrigirPlatformMetrics4Campos()
    .then(() => {
        console.log('\\n🎯 CONCLUSÃO:');
        console.log('✅ tenant_metrics: 4 campos JSON (comprehensive, participation, ranking, metric_data)');
        console.log('✅ platform_metrics: deve ter os mesmos 4 campos JSON como agregação');
        console.log('\\n💡 Se metric_data ainda não existe, executar no painel Supabase:');
        console.log('   ALTER TABLE platform_metrics ADD COLUMN metric_data JSONB;');
        process.exit(0);
    })
    .catch(console.error);