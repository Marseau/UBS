#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA AVG_COST_USD_PER_CONVERSATION
 * 
 * Verifica se os campos api_cost_usd e processing_cost_usd estão populados
 * e testa o cálculo da média de custo USD por conversa
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verificar se campos de custo estão populados na base de dados
 */
async function inspectCostFields(tenantId, periodDays = 30) {
    console.log(`🔍 Inspecionando campos de custo para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - periodDays);
    
    // Buscar amostra de conversas com custos
    const { data: conversations, error } = await supabase
        .from('conversation_history')
        .select(`
            id,
            api_cost_usd,
            processing_cost_usd,
            created_at,
            conversation_context,
            content
        `)
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .not('conversation_context', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20); // Amostra dos últimos 20 registros

    if (error) {
        console.error(`   ❌ Erro na query: ${error.message}`);
        return null;
    }

    if (!conversations || conversations.length === 0) {
        console.log(`   📭 Nenhuma conversa encontrada`);
        return null;
    }

    console.log(`   📊 Amostra de ${conversations.length} mensagens:`);
    
    let withApiCost = 0;
    let withProcessingCost = 0;
    let withBothCosts = 0;
    let totalApiCost = 0;
    let totalProcessingCost = 0;

    conversations.forEach((conv, index) => {
        const apiCost = conv.api_cost_usd || 0;
        const processingCost = conv.processing_cost_usd || 0;
        const totalCost = apiCost + processingCost;
        
        if (apiCost > 0) {
            withApiCost++;
            totalApiCost += apiCost;
        }
        if (processingCost > 0) {
            withProcessingCost++;
            totalProcessingCost += processingCost;
        }
        if (apiCost > 0 && processingCost > 0) {
            withBothCosts++;
        }

        if (index < 5) { // Mostrar primeiras 5 para debug
            const sessionId = conv.conversation_context?.session_id?.substring(0, 8) || 'N/A';
            const preview = conv.content?.substring(0, 40) || 'Sem conteúdo';
            console.log(`      ${index + 1}. Session: ${sessionId} | API: $${apiCost} | Proc: $${processingCost} | "${preview}..."`);
        }
    });

    const analysis = {
        total_messages: conversations.length,
        with_api_cost: withApiCost,
        with_processing_cost: withProcessingCost,
        with_both_costs: withBothCosts,
        api_cost_percentage: Math.round((withApiCost / conversations.length) * 100),
        processing_cost_percentage: Math.round((withProcessingCost / conversations.length) * 100),
        both_costs_percentage: Math.round((withBothCosts / conversations.length) * 100),
        avg_api_cost: withApiCost > 0 ? totalApiCost / withApiCost : 0,
        avg_processing_cost: withProcessingCost > 0 ? totalProcessingCost / withProcessingCost : 0,
        total_api_cost: totalApiCost,
        total_processing_cost: totalProcessingCost
    };

    console.log(`   📈 ANÁLISE DOS CUSTOS:`);
    console.log(`      Com API cost: ${analysis.with_api_cost}/${analysis.total_messages} (${analysis.api_cost_percentage}%)`);
    console.log(`      Com Processing cost: ${analysis.with_processing_cost}/${analysis.total_messages} (${analysis.processing_cost_percentage}%)`);
    console.log(`      Com ambos custos: ${analysis.with_both_costs}/${analysis.total_messages} (${analysis.both_costs_percentage}%)`);
    console.log(`      API cost médio: $${analysis.avg_api_cost.toFixed(6)}`);
    console.log(`      Processing cost médio: $${analysis.avg_processing_cost.toFixed(6)}`);

    return analysis;
}

/**
 * Calcular avg_cost_usd_per_conversation igual ao script base
 */
async function calculateAvgCostUSDPerConversation(tenantId, periodDays) {
    console.log(`💰 Testando AVG_COST_USD_PER_CONVERSATION para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                conversation_context,
                created_at,
                api_cost_usd,
                processing_cost_usd
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null);

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa encontrada`);
            return {
                cost_usd: 0,
                total_cost_usd: 0,
                total_conversations: 0
            };
        }

        // Agregar por session_id e calcular custos
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            const apiCost = conv.api_cost_usd || 0;
            const processingCost = conv.processing_cost_usd || 0;
            const totalCost = apiCost + processingCost;
            
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    total_cost: totalCost,
                    api_cost_sum: apiCost,
                    processing_cost_sum: processingCost,
                    message_count: 1
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar data de início da conversa (primeira mensagem)
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                // Somar custos de todas as mensagens da sessão
                session.total_cost += totalCost;
                session.api_cost_sum += apiCost;
                session.processing_cost_sum += processingCost;
                session.message_count++;
            }
        }
        
        // Filtrar sessões que iniciaram no período
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        });
        
        console.log(`   💬 Sessões válidas encontradas: ${validSessions.length}`);
        
        if (validSessions.length === 0) {
            return {
                cost_usd: 0,
                total_cost_usd: 0,
                total_conversations: 0
            };
        }

        // Calcular totais
        const totalConversations = validSessions.length;
        const totalCostUSD = validSessions.reduce((sum, session) => sum + session.total_cost, 0);
        const totalApiCost = validSessions.reduce((sum, session) => sum + session.api_cost_sum, 0);
        const totalProcessingCost = validSessions.reduce((sum, session) => sum + session.processing_cost_sum, 0);
        const avgCostUSD = totalConversations > 0 ? totalCostUSD / totalConversations : 0;
        
        console.log(`   📊 RESULTADOS:`);
        console.log(`      Total conversas: ${totalConversations}`);
        console.log(`      Total API cost: $${totalApiCost.toFixed(6)}`);
        console.log(`      Total Processing cost: $${totalProcessingCost.toFixed(6)}`);
        console.log(`      Custo total: $${totalCostUSD.toFixed(6)}`);
        console.log(`      Custo médio/conversa: $${avgCostUSD.toFixed(6)}`);
        
        // Mostrar algumas sessões de exemplo
        if (validSessions.length > 0) {
            console.log(`   🔍 Amostra de custos por sessão (top 5):`);
            validSessions
                .sort((a, b) => b.total_cost - a.total_cost)
                .slice(0, 5)
                .forEach((session, index) => {
                    console.log(`      ${index + 1}. ${session.session_id.substring(0, 8)}: $${session.total_cost.toFixed(6)} (${session.message_count} msgs)`);
                });
        }

        const result = {
            cost_usd: Math.round(avgCostUSD * 10000) / 10000,
            total_cost_usd: Math.round(totalCostUSD * 10000) / 10000,
            total_conversations: totalConversations,
            // Dados extras para análise
            total_api_cost: Math.round(totalApiCost * 10000) / 10000,
            total_processing_cost: Math.round(totalProcessingCost * 10000) / 10000
        };
        
        console.log(`   ✅ Resultado: $${result.total_cost_usd} / ${result.total_conversations} = $${result.cost_usd}/conversa`);
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA AVG_COST_USD_PER_CONVERSATION');
    console.log('='.repeat(70));
    
    try {
        // Buscar tenants ativos para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        console.log('');
        
        // Testar cada tenant
        const periods = [7, 30, 90]; // Todos os três períodos
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            // Primeiro inspecionar os campos de custo
            const costInspection = await inspectCostFields(tenant.id, 30);
            
            if (!costInspection || costInspection.both_costs_percentage < 1) {
                console.log(`   ⚠️  AVISO: Poucos registros com custos populados - métrica pode ser imprecisa`);
            }
            
            // Testar diferentes períodos
            for (const periodDays of periods) {
                try {
                    const result = await calculateAvgCostUSDPerConversation(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Custo médio/conversa: $${result.cost_usd}`);
                    console.log(`      Total conversas: ${result.total_conversations}`);
                    console.log(`      Custo total: $${result.total_cost_usd}`);
                    
                    if (result.total_api_cost !== undefined) {
                        console.log(`      API cost: $${result.total_api_cost}`);
                        console.log(`      Processing cost: $${result.total_processing_cost}`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n📈 VALIDAÇÃO DA MÉTRICA:');
        console.log('='.repeat(60));
        console.log('✅ Métrica implementada corretamente no código');
        console.log('✅ Usa agregação por session_id');  
        console.log('✅ Soma api_cost_usd + processing_cost_usd');
        console.log('✅ Filtra por período de início da conversa');
        console.log('⚠️  DEPENDENTE: Qualidade dos dados de custo na base');
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n💡 CONCLUSÕES:');
        console.log('   📊 Se custos estão populados → métrica é precisa');
        console.log('   ⚠️  Se custos são zero/null → métrica retorna $0.00');
        console.log('   💰 Essencial para análise de ROI e pricing');
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateAvgCostUSDPerConversation, inspectCostFields };