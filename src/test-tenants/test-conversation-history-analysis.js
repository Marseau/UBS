/**
 * ANÁLISE DETALHADA DA TABELA CONVERSATION_HISTORY
 * Context Engineering COLEAM00 - Validação de dados de conversação
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function analyzeConversationHistory() {
    console.log('🔍 ANÁLISE DETALHADA DA TABELA CONVERSATION_HISTORY');
    console.log('Context Engineering COLEAM00 - Validação de Dados de Conversação');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        
        // 1. VERIFICAR ESTRUTURA DA TABELA
        console.log('\n📊 VERIFICANDO ESTRUTURA DA TABELA...');
        
        const { data: sampleData, error: sampleError } = await supabase
            .from('conversation_history')
            .select('*')
            .limit(1);

        if (sampleError) {
            throw new Error(`Erro ao buscar estrutura: ${sampleError.message}`);
        }

        if (sampleData && sampleData.length > 0) {
            console.log('📋 CAMPOS DISPONÍVEIS:');
            const fields = Object.keys(sampleData[0]);
            fields.forEach((field, index) => {
                console.log(`   ${index + 1}. ${field}`);
            });
        }

        // 2. CONTAGEM TOTAL
        console.log('\n📈 ESTATÍSTICAS GERAIS...');
        
        const { count: totalCount, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            throw new Error(`Erro ao contar registros: ${countError.message}`);
        }

        console.log(`📊 Total de registros: ${totalCount}`);

        // 3. ANÁLISE DE CONVERSATION_OUTCOME
        console.log('\n🎯 ANALISANDO CONVERSATION_OUTCOMES...');
        
        const { data: outcomes, error: outcomesError } = await supabase
            .from('conversation_history')
            .select('conversation_outcome')
            .not('conversation_outcome', 'is', null);

        if (outcomesError) {
            console.log(`⚠️  Erro ao buscar outcomes: ${outcomesError.message}`);
        } else {
            const outcomeDistribution = {};
            outcomes.forEach(record => {
                if (record.conversation_outcome) {
                    outcomeDistribution[record.conversation_outcome] = (outcomeDistribution[record.conversation_outcome] || 0) + 1;
                }
            });

            console.log(`📋 Registros com outcome: ${outcomes.length}/${totalCount} (${((outcomes.length/totalCount)*100).toFixed(1)}%)`);
            console.log(`📈 Distribuição de outcomes:`);
            
            const sortedOutcomes = Object.entries(outcomeDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10);
            
            sortedOutcomes.forEach(([outcome, count]) => {
                const percentage = ((count / outcomes.length) * 100).toFixed(1);
                console.log(`   ${outcome}: ${count} (${percentage}%)`);
            });
        }

        // 4. ANÁLISE DE INTENT_DETECTED
        console.log('\n🤖 ANALISANDO INTENT DETECTION...');
        
        const { data: intents, error: intentsError } = await supabase
            .from('conversation_history')
            .select('intent_detected')
            .not('intent_detected', 'is', null);

        if (intentsError) {
            console.log(`⚠️  Erro ao buscar intents: ${intentsError.message}`);
        } else {
            const intentDistribution = {};
            intents.forEach(record => {
                if (record.intent_detected) {
                    intentDistribution[record.intent_detected] = (intentDistribution[record.intent_detected] || 0) + 1;
                }
            });

            console.log(`📋 Registros com intent: ${intents.length}/${totalCount} (${((intents.length/totalCount)*100).toFixed(1)}%)`);
            console.log(`🎯 Top 10 intents detectados:`);
            
            const sortedIntents = Object.entries(intentDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10);
            
            sortedIntents.forEach(([intent, count]) => {
                const percentage = ((count / intents.length) * 100).toFixed(1);
                console.log(`   ${intent}: ${count} (${percentage}%)`);
            });
        }

        // 5. ANÁLISE DE CONFIDENCE_SCORE
        console.log('\n📊 ANALISANDO CONFIDENCE SCORES...');
        
        const { data: confidenceData, error: confidenceError } = await supabase
            .from('conversation_history')
            .select('confidence_score')
            .not('confidence_score', 'is', null);

        if (confidenceError) {
            console.log(`⚠️  Erro ao buscar confidence: ${confidenceError.message}`);
        } else {
            const scores = confidenceData.map(r => r.confidence_score).filter(s => s !== null);
            if (scores.length > 0) {
                const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                const highConfidence = scores.filter(s => s >= 0.9).length;
                const mediumConfidence = scores.filter(s => s >= 0.7 && s < 0.9).length;
                const lowConfidence = scores.filter(s => s < 0.7).length;

                console.log(`📋 Registros com confidence: ${scores.length}/${totalCount} (${((scores.length/totalCount)*100).toFixed(1)}%)`);
                console.log(`📈 Confidence médio: ${avgScore.toFixed(3)}`);
                console.log(`🟢 Alta confiança (≥0.9): ${highConfidence} (${((highConfidence/scores.length)*100).toFixed(1)}%)`);
                console.log(`🟡 Média confiança (0.7-0.9): ${mediumConfidence} (${((mediumConfidence/scores.length)*100).toFixed(1)}%)`);
                console.log(`🔴 Baixa confiança (<0.7): ${lowConfidence} (${((lowConfidence/scores.length)*100).toFixed(1)}%)`);
            }
        }

        // 6. ANÁLISE DE CUSTOS (se existirem)
        console.log('\n💰 ANALISANDO CUSTOS...');
        
        const { data: costData, error: costError } = await supabase
            .from('conversation_history')
            .select('api_cost_usd, processing_cost_usd, tokens_used')
            .or('api_cost_usd.not.is.null,processing_cost_usd.not.is.null,tokens_used.not.is.null')
            .limit(100);

        if (costError) {
            console.log(`⚠️  Erro ao buscar custos: ${costError.message}`);
        } else if (costData && costData.length > 0) {
            const apiCosts = costData.filter(r => r.api_cost_usd).map(r => r.api_cost_usd);
            const tokens = costData.filter(r => r.tokens_used).map(r => r.tokens_used);
            
            if (apiCosts.length > 0) {
                const avgApiCost = apiCosts.reduce((sum, cost) => sum + cost, 0) / apiCosts.length;
                const totalApiCost = apiCosts.reduce((sum, cost) => sum + cost, 0);
                console.log(`💵 Custo API médio: $${avgApiCost.toFixed(6)}`);
                console.log(`💵 Custo API total (amostra): $${totalApiCost.toFixed(4)}`);
            }
            
            if (tokens.length > 0) {
                const avgTokens = tokens.reduce((sum, token) => sum + token, 0) / tokens.length;
                console.log(`🔢 Tokens médios: ${avgTokens.toFixed(1)}`);
            }
        } else {
            console.log(`📋 Nenhum dado de custo encontrado`);
        }

        // 7. ANÁLISE DE CONVERSATION_CONTEXT
        console.log('\n📝 ANALISANDO CONVERSATION_CONTEXT...');
        
        const { data: contextData, error: contextError } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .not('conversation_context', 'is', null)
            .limit(10);

        if (contextError) {
            console.log(`⚠️  Erro ao buscar contexto: ${contextError.message}`);
        } else if (contextData && contextData.length > 0) {
            console.log(`📋 Registros com contexto: ${contextData.length} (amostra)`);
            console.log(`📄 Exemplo de contexto:`);
            
            const sampleContext = contextData[0].conversation_context;
            if (typeof sampleContext === 'object') {
                Object.keys(sampleContext).forEach(key => {
                    console.log(`   ${key}: ${sampleContext[key]}`);
                });
            } else {
                console.log(`   ${sampleContext}`);
            }
        }

        // 8. ANÁLISE POR TENANT
        console.log('\n🏢 ANALISANDO DISTRIBUIÇÃO POR TENANT...');
        
        const { data: tenantData, error: tenantError } = await supabase
            .from('conversation_history')
            .select('tenant_id')
            .not('tenant_id', 'is', null);

        if (tenantError) {
            console.log(`⚠️  Erro ao buscar tenants: ${tenantError.message}`);
        } else {
            const tenantDistribution = {};
            tenantData.forEach(record => {
                if (record.tenant_id) {
                    tenantDistribution[record.tenant_id] = (tenantDistribution[record.tenant_id] || 0) + 1;
                }
            });

            const sortedTenants = Object.entries(tenantDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5);
            
            console.log(`🏢 Total de tenants: ${Object.keys(tenantDistribution).length}`);
            console.log(`📈 Top 5 tenants por volume:`);
            sortedTenants.forEach(([tenantId, count]) => {
                const percentage = ((count / tenantData.length) * 100).toFixed(1);
                console.log(`   ${tenantId.substring(0, 8)}...: ${count} (${percentage}%)`);
            });
        }

        // 9. RESUMO EXECUTIVO
        console.log('\n' + '='.repeat(80));
        console.log('📋 RESUMO EXECUTIVO');
        console.log('='.repeat(80));
        console.log(`✅ ANÁLISE DA TABELA CONVERSATION_HISTORY CONCLUÍDA`);
        console.log(`📊 Total de registros analisados: ${totalCount}`);
        console.log(`🎯 Dados disponíveis para métricas de conversação`);
        console.log(`🤖 Dados disponíveis para métricas de IA`);
        console.log(`💰 Dados disponíveis para métricas de custo`);
        console.log(`🏢 Dados distribuídos entre múltiplos tenants`);

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        console.error(error.stack);
    }
}

// Executar análise
analyzeConversationHistory();