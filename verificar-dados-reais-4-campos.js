require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarDadosReais4Campos() {
    console.log('🔍 VERIFICAÇÃO RIGOROSA DOS DADOS REAIS - 4 CAMPOS JSON');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // Buscar registros mais recentes
        const { data: records, error } = await client
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (error) {
            console.error('❌ Erro ao buscar dados:', error);
            return false;
        }
        
        if (!records || records.length === 0) {
            console.log('❌ FALHA: Nenhum registro encontrado na tabela');
            return false;
        }
        
        console.log(`📊 Analisando ${records.length} registros mais recentes:`);
        
        let sucessoTotal = true;
        let problemas = [];
        
        records.forEach((record, index) => {
            console.log(`\n📋 REGISTRO ${index + 1}:`);
            console.log(`   🆔 ID: ${record.id?.substring(0,8) || 'N/A'}`);
            console.log(`   🏢 Tenant ID: ${record.tenant_id?.substring(0,8) || 'N/A'}`);
            console.log(`   📅 Período: ${record.period || 'N/A'}`);
            console.log(`   📊 Metric Type: ${record.metric_type || 'N/A'}`);
            console.log(`   ⏰ Criado em: ${record.created_at || 'N/A'}`);
            
            // VERIFICAÇÃO RIGOROSA DOS 4 CAMPOS JSON
            console.log('\n🎯 VERIFICAÇÃO DOS 4 CAMPOS JSON:');
            
            // 1. comprehensive_metrics
            const comprehensive = record.comprehensive_metrics;
            if (!comprehensive || typeof comprehensive !== 'object') {
                console.log('   ❌ comprehensive_metrics: NULO ou INVÁLIDO');
                sucessoTotal = false;
                problemas.push('comprehensive_metrics nulo/inválido');
            } else {
                const compKeys = Object.keys(comprehensive);
                console.log(`   📊 comprehensive_metrics: ${compKeys.length} propriedades`);
                
                if (compKeys.length === 0) {
                    console.log('      ❌ VAZIO! Nenhuma propriedade');
                    sucessoTotal = false;
                    problemas.push('comprehensive_metrics vazio');
                } else {
                    // Verificar propriedades específicas importantes
                    const requiredFields = ['total_revenue', 'total_appointments', 'business_health_score'];
                    const missingFields = requiredFields.filter(field => !(field in comprehensive));
                    
                    if (missingFields.length > 0) {
                        console.log(`      ⚠️ Campos obrigatórios faltando: ${missingFields.join(', ')}`);
                        sucessoTotal = false;
                        problemas.push(`comprehensive_metrics faltando: ${missingFields.join(', ')}`);
                    } else {
                        console.log('      ✅ Campos obrigatórios presentes');
                        console.log(`         💰 Revenue: ${comprehensive.total_revenue || 0}`);
                        console.log(`         📅 Appointments: ${comprehensive.total_appointments || 0}`);
                        console.log(`         📊 Health Score: ${comprehensive.business_health_score || 0}`);
                    }
                }
            }
            
            // 2. participation_metrics
            const participation = record.participation_metrics;
            if (!participation || typeof participation !== 'object') {
                console.log('   ❌ participation_metrics: NULO ou INVÁLIDO');
                sucessoTotal = false;
                problemas.push('participation_metrics nulo/inválido');
            } else {
                const partKeys = Object.keys(participation);
                console.log(`   📈 participation_metrics: ${partKeys.length} propriedades`);
                
                if (partKeys.length === 0) {
                    console.log('      ❌ VAZIO! Nenhuma propriedade');
                    sucessoTotal = false;
                    problemas.push('participation_metrics vazio');
                } else {
                    // Verificar propriedades específicas importantes
                    const requiredFields = ['revenue_platform_percentage', 'platform_market_share'];
                    const presentFields = requiredFields.filter(field => field in participation);
                    
                    if (presentFields.length === 0) {
                        console.log('      ⚠️ Nenhum campo importante encontrado');
                        sucessoTotal = false;
                        problemas.push('participation_metrics sem campos relevantes');
                    } else {
                        console.log('      ✅ Campos relevantes presentes');
                        console.log(`         📈 Revenue %: ${participation.revenue_platform_percentage || 0}%`);
                        console.log(`         🎯 Market Share: ${participation.platform_market_share || 0}%`);
                    }
                }
            }
            
            // 3. ranking_metrics
            const ranking = record.ranking_metrics;
            if (!ranking || typeof ranking !== 'object') {
                console.log('   ❌ ranking_metrics: NULO ou INVÁLIDO');
                sucessoTotal = false;
                problemas.push('ranking_metrics nulo/inválido');
            } else {
                const rankKeys = Object.keys(ranking);
                console.log(`   🏆 ranking_metrics: ${rankKeys.length} propriedades`);
                
                if (rankKeys.length === 0) {
                    console.log('      ❌ VAZIO! Nenhuma propriedade');
                    sucessoTotal = false;
                    problemas.push('ranking_metrics vazio');
                } else {
                    // Verificar propriedades específicas importantes
                    const requiredFields = ['overall_score', 'risk_level', 'competitive_position'];
                    const presentFields = requiredFields.filter(field => field in ranking);
                    
                    if (presentFields.length === 0) {
                        console.log('      ⚠️ Nenhum campo importante encontrado');
                        sucessoTotal = false;
                        problemas.push('ranking_metrics sem campos relevantes');
                    } else {
                        console.log('      ✅ Campos relevantes presentes');
                        console.log(`         🏆 Overall Score: ${ranking.overall_score || 0}`);
                        console.log(`         ⚠️ Risk Level: ${ranking.risk_level || 'N/A'}`);
                        console.log(`         🏅 Position: ${ranking.competitive_position || 'N/A'}`);
                    }
                }
            }
            
            // 4. metric_data
            const metricData = record.metric_data;
            if (!metricData || typeof metricData !== 'object') {
                console.log('   ❌ metric_data: NULO ou INVÁLIDO');
                sucessoTotal = false;
                problemas.push('metric_data nulo/inválido');
            } else {
                const dataKeys = Object.keys(metricData);
                console.log(`   🗃️ metric_data: ${dataKeys.length} propriedades`);
                
                if (dataKeys.length === 0) {
                    console.log('      ❌ VAZIO! Nenhuma propriedade');
                    sucessoTotal = false;
                    problemas.push('metric_data vazio');
                } else {
                    console.log('      ✅ Contém dados');
                    console.log(`         📊 Calculated at: ${metricData.calculated_at || 'N/A'}`);
                    console.log(`         🏢 Period type: ${metricData.period_type || 'N/A'}`);
                }
            }
        });
        
        // RESULTADO FINAL RIGOROSO
        console.log('\n' + '='.repeat(80));
        console.log('🎯 RESULTADO FINAL DA VERIFICAÇÃO RIGOROSA:');
        
        if (sucessoTotal && problemas.length === 0) {
            console.log('✅ 🎉 SUCESSO TOTAL! Todos os 4 campos JSON estão corretamente populados!');
            console.log('💡 O TenantMetricsCronService foi CORRIGIDO COM SUCESSO!');
            return true;
        } else {
            console.log('❌ FALHA! Problemas encontrados na população dos campos:');
            problemas.forEach((problema, index) => {
                console.log(`   ${index + 1}. ${problema}`);
            });
            console.log('\n💡 A correção NÃO foi totalmente efetiva. Há campos vazios ou malformados.');
            return false;
        }
        
    } catch (error) {
        console.error('💥 ERRO na verificação:', error);
        return false;
    }
}

verificarDadosReais4Campos()
    .then(sucesso => {
        if (sucesso) {
            console.log('\n🚀 PRÓXIMO PASSO: Gerar CSV com dados completos dos 4 campos JSON');
        } else {
            console.log('\n🔧 É NECESSÁRIO corrigir os problemas identificados antes de prosseguir');
        }
        process.exit(sucesso ? 0 : 1);
    })
    .catch(console.error);