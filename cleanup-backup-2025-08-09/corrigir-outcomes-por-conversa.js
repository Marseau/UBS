/**
 * CORRIGIR OUTCOMES POR CONVERSA
 * 
 * Normaliza conversation_outcome para que todas as mensagens
 * de uma mesma conversa (session_id) tenham o mesmo outcome.
 * 
 * Lógica: Usa o outcome da mensagem do USUÁRIO como padrão
 */

const { supabaseAdmin } = require('./src/config/database');

async function corrigirOutcomesPorConversa() {
    try {
        console.log('🔧 Iniciando correção de outcomes por conversa...');
        
        // 1. Buscar todas as conversas com outcomes mistos
        const { data: conversasComMisto, error: mistoError } = await supabaseAdmin
            .rpc('get_mixed_outcome_conversations');
        
        if (mistoError) {
            // Fallback para query manual
            console.log('📋 Usando query manual para buscar conversas mistas...');
            
            const { data: allConversations, error } = await supabaseAdmin
                .from('conversation_history')
                .select(`
                    conversation_context,
                    conversation_outcome,
                    is_from_user,
                    id,
                    created_at
                `)
                .not('conversation_context', 'is', null)
                .not('conversation_outcome', 'is', null);

            if (error) {
                console.error('❌ Erro ao buscar conversas:', error);
                return;
            }

            // Agrupar por session_id
            const conversasAgrupadas = {};
            allConversations.forEach(msg => {
                const sessionId = msg.conversation_context?.session_id;
                if (sessionId) {
                    if (!conversasAgrupadas[sessionId]) {
                        conversasAgrupadas[sessionId] = [];
                    }
                    conversasAgrupadas[sessionId].push(msg);
                }
            });

            console.log(`📊 ${Object.keys(conversasAgrupadas).length} conversas encontradas`);

            // 2. Processar cada conversa
            let processedCount = 0;
            let correctedCount = 0;

            for (const [sessionId, mensagens] of Object.entries(conversasAgrupadas)) {
                // Verificar se tem outcomes diferentes
                const outcomes = [...new Set(mensagens.map(m => m.conversation_outcome))];
                
                if (outcomes.length > 1) {
                    // Conversa com outcomes mistos - precisa correção
                    console.log(`🔄 Corrigindo conversa ${sessionId} com outcomes: ${outcomes.join(', ')}`);
                    
                    // Definir outcome correto (prioridade: user message)
                    const userMessage = mensagens.find(m => m.is_from_user === true);
                    const outcomeCorreto = userMessage?.conversation_outcome || outcomes[0];
                    
                    // Atualizar todas as mensagens da conversa
                    for (const mensagem of mensagens) {
                        if (mensagem.conversation_outcome !== outcomeCorreto) {
                            const { error: updateError } = await supabaseAdmin
                                .from('conversation_history')
                                .update({ conversation_outcome: outcomeCorreto })
                                .eq('id', mensagem.id);
                            
                            if (updateError) {
                                console.error(`❌ Erro ao atualizar mensagem ${mensagem.id}:`, updateError);
                            }
                        }
                    }
                    
                    correctedCount++;
                }
                
                processedCount++;
                
                if (processedCount % 100 === 0) {
                    console.log(`✅ ${processedCount} conversas processadas, ${correctedCount} corrigidas`);
                }
            }

            console.log(`🎉 Correção concluída! ${correctedCount} conversas corrigidas de ${processedCount} processadas`);
        }

        // 3. Verificar resultado final
        console.log('📊 Verificando resultado final...');
        
        const { data: verificacao, error: verifyError } = await supabaseAdmin
            .from('conversation_history')
            .select(`
                conversation_context,
                conversation_outcome,
                is_from_user
            `)
            .not('conversation_context', 'is', null)
            .not('conversation_outcome', 'is', null);

        if (!verifyError && verificacao) {
            // Reagrupar para verificar
            const conversasVerificacao = {};
            verificacao.forEach(msg => {
                const sessionId = msg.conversation_context?.session_id;
                if (sessionId) {
                    if (!conversasVerificacao[sessionId]) {
                        conversasVerificacao[sessionId] = [];
                    }
                    conversasVerificacao[sessionId].push(msg.conversation_outcome);
                }
            });

            // Contar conversas com outcomes ainda mistos
            let misturasRestantes = 0;
            for (const outcomes of Object.values(conversasVerificacao)) {
                const uniqueOutcomes = [...new Set(outcomes)];
                if (uniqueOutcomes.length > 1) {
                    misturasRestantes++;
                }
            }

            console.log('\n📊 RESULTADO FINAL:');
            console.log(`   Total de conversas: ${Object.keys(conversasVerificacao).length}`);
            console.log(`   Conversas com outcomes mistos: ${misturasRestantes}`);
            console.log(`   Conversas normalizadas: ${Object.keys(conversasVerificacao).length - misturasRestantes}`);
            
            if (misturasRestantes === 0) {
                console.log('🎉 SUCESSO: Todas as conversas têm outcomes consistentes!');
            } else {
                console.log(`⚠️  ${misturasRestantes} conversas ainda precisam de correção`);
            }
        }

    } catch (error) {
        console.error('❌ Erro geral na correção:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    corrigirOutcomesPorConversa()
        .then(() => {
            console.log('✅ Script de correção finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { corrigirOutcomesPorConversa };