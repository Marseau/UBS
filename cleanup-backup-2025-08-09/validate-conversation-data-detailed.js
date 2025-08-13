/**
 * VALIDAÇÃO DETALHADA DOS DADOS DE CONVERSATION_HISTORY
 * Context Engineering COLEAM00 - Validação completa antes da implementação
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function validateConversationDataDetailed() {
    console.log('🔬 VALIDAÇÃO DETALHADA DOS DADOS DE CONVERSATION_HISTORY');
    console.log('Context Engineering COLEAM00 - Verificação Completa Antes da Implementação');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        const tenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista Spa
        
        console.log(`🏪 Validando dados do tenant: ${tenantId}`);
        console.log('-'.repeat(80));

        // ========================================
        // 1. VALIDAR ESTRUTURA COMPLETA
        // ========================================
        console.log('\n📋 1. VALIDANDO ESTRUTURA DA TABELA...');
        
        const { data: sampleRecord, error: structureError } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .limit(1);

        if (structureError) {
            throw new Error(`Erro estrutura: ${structureError.message}`);
        }

        if (sampleRecord && sampleRecord.length > 0) {
            const record = sampleRecord[0];
            console.log('✅ Campos disponíveis e tipos:');
            
            Object.entries(record).forEach(([field, value]) => {
                const type = value === null ? 'null' : typeof value;
                const sample = value === null ? 'NULL' : 
                              typeof value === 'string' && value.length > 50 ? `${value.substring(0, 50)}...` :
                              JSON.stringify(value);
                console.log(`   ${field}: ${type} = ${sample}`);
            });
        }

        // ========================================
        // 2. VALIDAR DADOS DO PERÍODO (30 DIAS)
        // ========================================
        console.log('\n📅 2. VALIDANDO DADOS DO PERÍODO (30 DIAS)...');
        
        const dateStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const dateEnd = new Date().toISOString();
        
        console.log(`📊 Período: ${dateStart.split('T')[0]} até ${dateEnd.split('T')[0]}`);

        const { data: periodData, error: periodError } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', dateStart)
            .lte('created_at', dateEnd);

        if (periodError) {
            throw new Error(`Erro período: ${periodError.message}`);
        }

        console.log(`✅ Registros no período: ${periodData?.length || 0}`);

        if (!periodData || periodData.length === 0) {
            console.log('⚠️  NENHUM DADO NO PERÍODO - Expandindo para 90 dias...');
            
            const dateStart90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const { data: period90Data } = await supabase
                .from('conversation_history')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateStart90)
                .lte('created_at', dateEnd);
            
            console.log(`📊 Registros em 90 dias: ${period90Data?.length || 0}`);
            
            if (period90Data && period90Data.length > 0) {
                // Usar dados de 90 dias para validação
                periodData = period90Data;
                console.log('✅ Usando dados de 90 dias para validação');
            }
        }

        if (!periodData || periodData.length === 0) {
            console.log('❌ NENHUM DADO ENCONTRADO PARA ESTE TENANT');
            return;
        }

        // ========================================
        // 3. VALIDAR CONVERSATION_OUTCOME
        // ========================================
        console.log('\n🎯 3. VALIDANDO CONVERSATION_OUTCOME...');
        
        const outcomeData = periodData.filter(r => r.conversation_outcome);
        const outcomeDistribution = {};
        
        outcomeData.forEach(record => {
            outcomeDistribution[record.conversation_outcome] = (outcomeDistribution[record.conversation_outcome] || 0) + 1;
        });

        console.log(`📊 Registros com outcome: ${outcomeData.length}/${periodData.length} (${((outcomeData.length/periodData.length)*100).toFixed(1)}%)`);
        
        if (Object.keys(outcomeDistribution).length > 0) {
            console.log('📈 Distribuição de outcomes:');
            Object.entries(outcomeDistribution)
                .sort(([,a], [,b]) => b - a)
                .forEach(([outcome, count]) => {
                    const percentage = ((count / outcomeData.length) * 100).toFixed(1);
                    console.log(`   ${outcome}: ${count} (${percentage}%)`);
                });
        } else {
            console.log('⚠️  Nenhum outcome encontrado');
        }

        // ========================================
        // 4. VALIDAR INTENT_DETECTED
        // ========================================
        console.log('\n🤖 4. VALIDANDO INTENT_DETECTED...');
        
        const intentData = periodData.filter(r => r.intent_detected);
        const intentDistribution = {};
        
        intentData.forEach(record => {
            intentDistribution[record.intent_detected] = (intentDistribution[record.intent_detected] || 0) + 1;
        });

        console.log(`📊 Registros com intent: ${intentData.length}/${periodData.length} (${((intentData.length/periodData.length)*100).toFixed(1)}%)`);
        
        if (Object.keys(intentDistribution).length > 0) {
            console.log('🎯 Top intents detectados:');
            Object.entries(intentDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([intent, count]) => {
                    const percentage = ((count / intentData.length) * 100).toFixed(1);
                    console.log(`   ${intent}: ${count} (${percentage}%)`);
                });
        } else {
            console.log('⚠️  Nenhum intent encontrado');
        }

        // ========================================
        // 5. VALIDAR CONFIDENCE_SCORE
        // ========================================
        console.log('\n📊 5. VALIDANDO CONFIDENCE_SCORE...');
        
        const confidenceData = periodData.filter(r => r.confidence_score !== null);
        
        if (confidenceData.length > 0) {
            const scores = confidenceData.map(r => r.confidence_score);
            const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
            const highConfidence = scores.filter(s => s >= 0.9).length;
            const mediumConfidence = scores.filter(s => s >= 0.7 && s < 0.9).length;
            const lowConfidence = scores.filter(s => s < 0.7).length;

            console.log(`📊 Registros com confidence: ${confidenceData.length}/${periodData.length} (${((confidenceData.length/periodData.length)*100).toFixed(1)}%)`);
            console.log(`📈 Confidence médio: ${avgScore.toFixed(3)}`);
            console.log(`🟢 Alta (≥0.9): ${highConfidence} (${((highConfidence/scores.length)*100).toFixed(1)}%)`);
            console.log(`🟡 Média (0.7-0.9): ${mediumConfidence} (${((mediumConfidence/scores.length)*100).toFixed(1)}%)`);
            console.log(`🔴 Baixa (<0.7): ${lowConfidence} (${((lowConfidence/scores.length)*100).toFixed(1)}%)`);
        } else {
            console.log('⚠️  Nenhum confidence_score encontrado');
        }

        // ========================================
        // 6. VALIDAR DADOS DE CUSTO
        // ========================================
        console.log('\n💰 6. VALIDANDO DADOS DE CUSTO...');
        
        const costData = periodData.filter(r => r.api_cost_usd || r.processing_cost_usd || r.tokens_used);
        
        if (costData.length > 0) {
            const apiCosts = costData.filter(r => r.api_cost_usd).map(r => r.api_cost_usd);
            const processingCosts = costData.filter(r => r.processing_cost_usd).map(r => r.processing_cost_usd);
            const tokens = costData.filter(r => r.tokens_used).map(r => r.tokens_used);
            
            console.log(`📊 Registros com dados de custo: ${costData.length}/${periodData.length} (${((costData.length/periodData.length)*100).toFixed(1)}%)`);
            
            if (apiCosts.length > 0) {
                const avgApiCost = apiCosts.reduce((sum, cost) => sum + cost, 0) / apiCosts.length;
                const totalApiCost = apiCosts.reduce((sum, cost) => sum + cost, 0);
                console.log(`💵 API Cost médio: $${avgApiCost.toFixed(6)}`);
                console.log(`💵 API Cost total: $${totalApiCost.toFixed(4)}`);
            }
            
            if (processingCosts.length > 0) {
                const avgProcessingCost = processingCosts.reduce((sum, cost) => sum + cost, 0) / processingCosts.length;
                console.log(`⚙️  Processing Cost médio: $${avgProcessingCost.toFixed(6)}`);
            }
            
            if (tokens.length > 0) {
                const avgTokens = tokens.reduce((sum, token) => sum + token, 0) / tokens.length;
                const totalTokens = tokens.reduce((sum, token) => sum + token, 0);
                console.log(`🔢 Tokens médios: ${avgTokens.toFixed(1)}`);
                console.log(`🔢 Tokens totais: ${totalTokens}`);
            }
        } else {
            console.log('⚠️  Nenhum dado de custo encontrado');
        }

        // ========================================
        // 7. VALIDAR CONVERSATION_CONTEXT
        // ========================================
        console.log('\n📝 7. VALIDANDO CONVERSATION_CONTEXT...');
        
        const contextData = periodData.filter(r => r.conversation_context);
        
        if (contextData.length > 0) {
            console.log(`📊 Registros com context: ${contextData.length}/${periodData.length} (${((contextData.length/periodData.length)*100).toFixed(1)}%)`);
            
            // Analisar estrutura do contexto
            const sampleContext = contextData[0].conversation_context;
            console.log('📄 Estrutura do contexto:');
            
            if (typeof sampleContext === 'object') {
                Object.keys(sampleContext).forEach(key => {
                    console.log(`   ${key}: ${typeof sampleContext[key]} = ${sampleContext[key]}`);
                });
                
                // Extrair duração se disponível
                const durationsData = contextData
                    .filter(r => r.conversation_context && r.conversation_context.duration_minutes)
                    .map(r => parseFloat(r.conversation_context.duration_minutes));
                
                if (durationsData.length > 0) {
                    const avgDuration = durationsData.reduce((sum, dur) => sum + dur, 0) / durationsData.length;
                    const totalDuration = durationsData.reduce((sum, dur) => sum + dur, 0);
                    console.log(`⏱️  Duração média: ${avgDuration.toFixed(1)} min`);
                    console.log(`⏱️  Duração total: ${totalDuration.toFixed(1)} min`);
                }
            }
        } else {
            console.log('⚠️  Nenhum conversation_context encontrado');
        }

        // ========================================
        // 8. RESUMO DA VALIDAÇÃO
        // ========================================
        console.log('\n' + '='.repeat(80));
        console.log('📋 RESUMO DA VALIDAÇÃO');
        console.log('='.repeat(80));
        console.log(`✅ DADOS VALIDADOS PARA TENANT: ${tenantId}`);
        console.log(`📊 Total de registros: ${periodData.length}`);
        console.log(`🎯 Outcomes disponíveis: ${(outcomeData.length > 0) ? '✅' : '❌'} (${outcomeData.length})`);
        console.log(`🤖 Intents disponíveis: ${(intentData.length > 0) ? '✅' : '❌'} (${intentData.length})`);
        console.log(`📊 Confidence disponível: ${(confidenceData.length > 0) ? '✅' : '❌'} (${confidenceData.length})`);
        console.log(`💰 Custo disponível: ${(costData.length > 0) ? '✅' : '❌'} (${costData.length})`);
        console.log(`📝 Context disponível: ${(contextData.length > 0) ? '✅' : '❌'} (${contextData.length})`);

        console.log('\n🚀 PRONTO PARA IMPLEMENTAÇÃO:');
        if (outcomeData.length > 0) console.log('   ✅ Métricas de Conversão');
        if (intentData.length > 0 && confidenceData.length > 0) console.log('   ✅ Métricas de IA');
        if (costData.length > 0) console.log('   ✅ Métricas de Custo');
        if (contextData.length > 0) console.log('   ✅ Métricas de Qualidade');
        
        console.log('\n📈 QUALIDADE DOS DADOS:');
        const dataQualityScore = [
            outcomeData.length > 0 ? 25 : 0,
            intentData.length > 0 ? 25 : 0,
            confidenceData.length > 0 ? 25 : 0,
            costData.length > 0 ? 25 : 0
        ].reduce((sum, score) => sum + score, 0);
        
        console.log(`   📊 Score de Qualidade: ${dataQualityScore}/100`);
        console.log(`   ${dataQualityScore >= 75 ? '🟢 EXCELENTE' : dataQualityScore >= 50 ? '🟡 BOM' : '🔴 LIMITADO'}`);

    } catch (error) {
        console.error('❌ Erro durante validação:', error.message);
        console.error(error.stack);
    }
}

// Executar validação
validateConversationDataDetailed();