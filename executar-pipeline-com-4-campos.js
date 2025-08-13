require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function executarPipelineCom4Campos() {
    console.log('🚀 EXECUTANDO PIPELINE COM 4 CAMPOS JSON COMPLETOS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Limpar platform_metrics
        console.log('🧹 Limpando platform_metrics...');
        await client.from('platform_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        // 2. Executar PlatformAggregationService atualizado
        console.log('🔄 Executando PlatformAggregationService atualizado...');
        
        // Usar o serviço compilado diretamente
        const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;
        const service = new PlatformAggregationService();
        
        // Executar para todos os períodos
        const result = await service.executeCompletePlatformAggregation();
        
        console.log('\\n📊 RESULTADO DA EXECUÇÃO:', result);
        
        // 3. Verificação da estrutura
        console.log('\\n🔍 VERIFICAÇÃO DA ESTRUTURA COM 4 CAMPOS JSON...');
        
        const { data: finalData } = await client
            .from('platform_metrics')
            .select('period, comprehensive_metrics, participation_metrics, ranking_metrics, metric_data')
            .order('created_at', { ascending: false });
        
        if (finalData && finalData.length > 0) {
            console.log('\\n✅ ESTRUTURA FINAL CONFIRMADA:');
            
            finalData.forEach((record, i) => {
                const jsonFields = [
                    { name: 'comprehensive_metrics', data: record.comprehensive_metrics },
                    { name: 'participation_metrics', data: record.participation_metrics },
                    { name: 'ranking_metrics', data: record.ranking_metrics },
                    { name: 'metric_data', data: record.metric_data }
                ];
                
                console.log(`\\n   📋 Registro ${i+1} - Período: ${record.period}`);
                
                jsonFields.forEach(field => {
                    const present = field.data !== null && field.data !== undefined;
                    const keys = present ? Object.keys(field.data).length : 0;
                    console.log(`     • ${field.name}: ${present ? '✅ PRESENTE' : '❌ AUSENTE'} (${keys} chaves)`);
                });
                
                const totalJsonFields = jsonFields.filter(f => f.data !== null && f.data !== undefined).length;
                console.log(`     🎯 Total JSON fields: ${totalJsonFields}/4`);
            });
            
            // Status final
            const allHave4Fields = finalData.every(record => 
                record.comprehensive_metrics && 
                record.participation_metrics && 
                record.ranking_metrics && 
                record.metric_data
            );
            
            console.log(`\\n🏆 STATUS FINAL: ${allHave4Fields ? 'TODOS OS REGISTROS TÊM 4 CAMPOS JSON' : 'ALGUNS REGISTROS AINDA TÊM PROBLEMAS'}`);
            
            return allHave4Fields;
        } else {
            console.log('❌ Nenhum registro encontrado após execução');
            return false;
        }
        
    } catch (error) {
        console.error('💥 Erro na execução:', error.message);
        return false;
    }
}

executarPipelineCom4Campos()
    .then(success => {
        if (success) {
            console.log('\\n🎉 PIPELINE COM 4 CAMPOS JSON EXECUTADO COM SUCESSO!');
            console.log('✅ platform_metrics tem estrutura completa igual a tenant_metrics');
        } else {
            console.log('\\n❌ PIPELINE FALHOU OU ESTRUTURA INCOMPLETA');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);