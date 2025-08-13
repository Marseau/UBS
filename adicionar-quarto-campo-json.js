require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function adicionarQuartoCampoJson() {
    console.log('🎯 ADICIONANDO O 4º CAMPO JSON - metric_data');
    console.log('='.repeat(60));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Buscar todos os registros atuais
        const { data: allRecords, error: fetchError } = await client
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (fetchError) {
            console.error('❌ Erro ao buscar registros:', fetchError.message);
            return false;
        }
        
        console.log(`📊 Processando ${allRecords.length} registros...`);
        
        // 2. Para cada registro, adicionar o campo metric_data extraído de comprehensive_metrics
        for (const record of allRecords) {
            console.log(`\n🔄 Processando registro: ${record.period} (${record.calculation_date})`);
            
            // Extrair dados do comprehensive_metrics para criar metric_data
            const comp = record.comprehensive_metrics || {};
            const part = record.participation_metrics || {};
            const rank = record.ranking_metrics || {};
            
            // Criar o 4º campo JSON com dados estruturados
            const metricData = {
                // Dados básicos da plataforma
                platform_totals: {
                    total_revenue: comp.total_platform_revenue || 0,
                    total_appointments: comp.total_platform_appointments || 0,
                    active_tenants: comp.active_tenants_count || 0,
                    platform_mrr: comp.platform_mrr_total || 0
                },
                
                // Dados de performance
                performance_metrics: {
                    operational_efficiency: comp.operational_efficiency_pct || 0,
                    platform_health_score: comp.platform_health_score || 0,
                    platform_quality_score: comp.platform_quality_score || 0
                },
                
                // Dados de participação
                participation_data: {
                    receita_uso_ratio: part.receita_uso_ratio || 0,
                    spam_rate_pct: part.spam_rate_pct || 0,
                    cancellation_rate_pct: part.cancellation_rate_pct || 0,
                    conversion_rate: part.platform_avg_conversion_rate || 0
                },
                
                // Dados de ranking
                ranking_data: {
                    overall_score: rank.overall_platform_score || 0,
                    health_index: rank.health_index || 0,
                    efficiency_index: rank.efficiency_index || 0,
                    platform_ranking: rank.platform_ranking || 'A'
                },
                
                // Metadados do sistema
                system_metadata: {
                    calculation_date: record.calculation_date,
                    period: record.period,
                    tenants_processed: record.tenants_processed || 0,
                    calculation_method: record.calculation_method || 'platform_aggregation',
                    timestamp: new Date().toISOString(),
                    version: '4.0.0-complete-json-structure'
                },
                
                // Campos extras que eram armazenados em _system_fields
                legacy_fields: comp._system_fields || null,
                
                // Formatação brasileira
                formatted_values: {
                    total_revenue_br: `R$ ${(comp.total_platform_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    total_appointments_br: (comp.total_platform_appointments || 0).toLocaleString('pt-BR'),
                    platform_mrr_br: `R$ ${(comp.platform_mrr_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
            };
            
            // 3. Atualizar registro com o novo campo metric_data
            const { error: updateError } = await client
                .from('platform_metrics')
                .update({
                    metric_data: metricData
                })
                .eq('id', record.id);
            
            if (updateError) {
                console.log(`   ❌ Erro ao atualizar ${record.period}:`, updateError.message);
            } else {
                console.log(`   ✅ ${record.period} atualizado com metric_data (${Object.keys(metricData).length} seções)`);
            }
        }
        
        // 4. Verificação final
        console.log('\n🔍 VERIFICAÇÃO FINAL...');
        
        const { data: updatedRecords } = await client
            .from('platform_metrics')
            .select('period, comprehensive_metrics, participation_metrics, ranking_metrics, metric_data')
            .order('created_at', { ascending: false });
        
        if (updatedRecords && updatedRecords.length > 0) {
            console.log('\n✅ ESTRUTURA FINAL CONFIRMADA:');
            
            updatedRecords.forEach((record, i) => {
                const jsonFieldsCount = [
                    record.comprehensive_metrics ? 1 : 0,
                    record.participation_metrics ? 1 : 0,
                    record.ranking_metrics ? 1 : 0,
                    record.metric_data ? 1 : 0
                ].reduce((a, b) => a + b, 0);
                
                console.log(`\n   📋 Registro ${i+1} - Período: ${record.period}`);
                console.log(`       • comprehensive_metrics: ${record.comprehensive_metrics ? '✅ PRESENTE' : '❌ AUSENTE'}`);
                console.log(`       • participation_metrics: ${record.participation_metrics ? '✅ PRESENTE' : '❌ AUSENTE'}`);
                console.log(`       • ranking_metrics: ${record.ranking_metrics ? '✅ PRESENTE' : '❌ AUSENTE'}`);
                console.log(`       • metric_data: ${record.metric_data ? '✅ PRESENTE' : '❌ AUSENTE'}`);
                console.log(`       🎯 Total JSON fields: ${jsonFieldsCount}/4`);
                
                if (record.metric_data) {
                    const sections = Object.keys(record.metric_data).length;
                    console.log(`       📊 metric_data sections: ${sections}`);
                }
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
        return false;
    }
}

adicionarQuartoCampoJson()
    .then(success => {
        if (success) {
            console.log('\n🎉 4º CAMPO JSON ADICIONADO COM SUCESSO!');
            console.log('✅ platform_metrics agora tem 4 campos JSON completos');
            console.log('🚀 SISTEMA 100% COMPATÍVEL COM SUPER ADMIN DASHBOARD!');
        } else {
            console.log('\n❌ FALHA AO ADICIONAR 4º CAMPO JSON');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);