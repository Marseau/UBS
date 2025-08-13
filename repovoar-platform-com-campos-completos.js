require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function repovoarPlatformCompleta() {
    console.log('🚀 REPOPULANDO PLATFORM_METRICS COM CAMPOS COMPLETOS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Verificar se os campos foram adicionados
        console.log('🔍 Verificando novos campos...');
        const { data: sample } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1);
        
        if (sample && sample[0]) {
            const fields = Object.keys(sample[0]).sort();
            console.log('📊 Campos atuais da platform_metrics (' + fields.length + '):');
            fields.forEach(field => {
                console.log('   ✅', field);
            });
            
            // Verificar se tem os campos essenciais
            const requiredFields = ['calculated_at', 'metric_data', 'metric_type', 'tenant_id', 'tenant_name'];
            const missingFields = requiredFields.filter(field => !fields.includes(field));
            
            if (missingFields.length > 0) {
                console.log('\\n❌ CAMPOS AINDA FALTANDO:', missingFields.length);
                missingFields.forEach(field => {
                    console.log('   🔴', field);
                });
                console.log('\\n💡 Execute primeiro o SQL de migração no painel Supabase!');
                return false;
            }
            
            console.log('\\n✅ TODOS OS CAMPOS ESTÃO PRESENTES!');
        } else {
            console.log('❌ Nenhum registro encontrado para verificação');
        }
        
        // 2. Limpar e repovoar platform_metrics
        console.log('\\n🧹 Limpando platform_metrics atual...');
        const { error: deleteError } = await client
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (deleteError) {
            console.error('❌ Erro ao limpar platform_metrics:', deleteError);
            return false;
        }
        
        // 3. Executar PlatformAggregationService para repovoar com estrutura completa
        console.log('🚀 Executando PlatformAggregationService com campos completos...');
        
        const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;
        const service = new PlatformAggregationService();
        
        await service.executeCompletePlatformAggregation();
        
        // 4. Verificar população final
        const { data: finalData, count: finalCount } = await client
            .from('platform_metrics')
            .select('period, comprehensive_metrics, participation_metrics, ranking_metrics, metric_data, calculated_at, metric_type', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(3);
        
        console.log('\\n📊 VERIFICAÇÃO FINAL:');
        console.log('   Total de registros:', finalCount || 0);
        
        if (finalData && finalData.length > 0) {
            finalData.forEach((record, i) => {
                console.log('\\n   Registro', i + 1, '- Período:', record.period);
                console.log('     ✅ comprehensive_metrics:', record.comprehensive_metrics ? 'POPULADO' : 'VAZIO');
                console.log('     ✅ participation_metrics:', record.participation_metrics ? 'POPULADO' : 'VAZIO');
                console.log('     ✅ ranking_metrics:', record.ranking_metrics ? 'POPULADO' : 'VAZIO');
                console.log('     ✅ metric_data:', record.metric_data ? 'POPULADO' : 'VAZIO');
                console.log('     ✅ calculated_at:', record.calculated_at ? 'POPULADO' : 'VAZIO');
                console.log('     ✅ metric_type:', record.metric_type || 'VAZIO');
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('💥 Erro na repopulação:', error.message);
        return false;
    }
}

repovoarPlatformCompleta()
    .then(success => {
        if (success) {
            console.log('\\n🎉 REPOPULAÇÃO CONCLUÍDA COM SUCESSO!');
            console.log('✅ platform_metrics agora tem a mesma estrutura da tenant_metrics');
            console.log('🚀 Sistema totalmente consistente e pronto para uso!');
        } else {
            console.log('\\n❌ REPOPULAÇÃO FALHOU - Verificar logs acima');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);