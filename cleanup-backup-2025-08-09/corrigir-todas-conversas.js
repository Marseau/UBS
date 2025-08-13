/**
 * CORRIGIR TODAS AS CONVERSAS
 * 
 * Processa TODAS as 3,129 conversas históricas
 * Remove filtros temporais para cobertura 100%
 */

const { supabaseAdmin } = require('./src/config/database');

async function corrigirTodasConversas() {
    try {
        console.log('🚀 Iniciando correção de TODAS as conversas históricas...');
        
        // 1. Buscar TODAS as conversas (sem filtros temporais)
        console.log('📋 Buscando todas as conversas do banco...');
        
        const { data: todasConversas, error } = await supabaseAdmin
            .from('conversation_history')
            .select(`
                id,
                conversation_context,
                conversation_outcome,
                is_from_user,
                created_at,
                tenant_id,
                user_id
            `)
            .not('conversation_context', 'is', null); // Apenas conversas com session_id válido

        if (error) {
            console.error('❌ Erro ao buscar conversas:', error);
            return;
        }

        console.log(`📊 Total de mensagens encontradas: ${todasConversas.length}`);

        // 2. Agrupar por session_id para formar conversas
        const conversasAgrupadas = {};
        todasConversas.forEach(msg => {
            const sessionId = msg.conversation_context?.session_id;
            if (sessionId) {
                if (!conversasAgrupadas[sessionId]) {
                    conversasAgrupadas[sessionId] = [];
                }
                conversasAgrupadas[sessionId].push(msg);
            }
        });

        const totalConversas = Object.keys(conversasAgrupadas).length;
        console.log(`💬 Total de conversas únicas: ${totalConversas}`);

        // 3. Analisar conversas com outcomes mistos
        let conversasComMistura = 0;
        let conversasSemOutcome = 0;
        let conversasOk = 0;

        for (const [sessionId, mensagens] of Object.entries(conversasAgrupadas)) {
            const outcomesUnicos = [...new Set(mensagens.map(m => m.conversation_outcome).filter(Boolean))];
            const mensagensComOutcome = mensagens.filter(m => m.conversation_outcome);
            
            if (mensagensComOutcome.length === 0) {
                conversasSemOutcome++;
            } else if (outcomesUnicos.length > 1) {
                conversasComMistura++;
            } else {
                conversasOk++;
            }
        }

        console.log(`📊 ANÁLISE INICIAL:`);
        console.log(`   Conversas OK: ${conversasOk}`);
        console.log(`   Conversas com mistura: ${conversasComMistura}`);
        console.log(`   Conversas sem outcome: ${conversasSemOutcome}`);

        // 4. Processar correções
        let processedCount = 0;
        let correctedCount = 0;
        let filledNullCount = 0;

        console.log('\n🔧 Iniciando correções...');

        for (const [sessionId, mensagens] of Object.entries(conversasAgrupadas)) {
            const outcomesPresentes = mensagens.map(m => m.conversation_outcome).filter(Boolean);
            const outcomesUnicos = [...new Set(outcomesPresentes)];
            
            let outcomeCorreto = null;
            let needsCorrection = false;

            // Caso 1: Conversa sem nenhum outcome - precisa preencher
            if (outcomesPresentes.length === 0) {
                // Definir outcome baseado na lógica de negócio
                const userMessage = mensagens.find(m => m.is_from_user === true);
                if (userMessage) {
                    // Usar lógica simples baseada na mensagem do usuário
                    const content = userMessage.content?.toLowerCase() || '';
                    if (content.includes('agendar') || content.includes('marcar')) {
                        outcomeCorreto = 'appointment_created';
                    } else if (content.includes('preço') || content.includes('valor')) {
                        outcomeCorreto = 'price_inquiry';
                    } else if (content.includes('horário') || content.includes('funciona')) {
                        outcomeCorreto = 'business_hours_inquiry';
                    } else if (content.includes('endereço') || content.includes('onde')) {
                        outcomeCorreto = 'location_inquiry';
                    } else {
                        outcomeCorreto = 'info_request_fulfilled';
                    }
                    needsCorrection = true;
                    filledNullCount++;
                }
            }
            // Caso 2: Conversa com outcomes mistos - usar do usuário
            else if (outcomesUnicos.length > 1) {
                const userMessage = mensagens.find(m => m.is_from_user === true && m.conversation_outcome);
                outcomeCorreto = userMessage?.conversation_outcome || outcomesUnicos[0];
                needsCorrection = true;
                correctedCount++;
            }
            // Caso 3: Conversa com outcome consistente mas mensagens NULL
            else if (outcomesPresentes.length < mensagens.length) {
                outcomeCorreto = outcomesUnicos[0];
                needsCorrection = true;
            }

            // Aplicar correção se necessário
            if (needsCorrection && outcomeCorreto) {
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
            }

            processedCount++;
            
            // Log progresso a cada 500 conversas
            if (processedCount % 500 === 0) {
                console.log(`✅ ${processedCount}/${totalConversas} conversas processadas`);
            }
        }

        console.log(`\n🎉 PROCESSAMENTO CONCLUÍDO!`);
        console.log(`   Total processadas: ${processedCount}`);
        console.log(`   Conversas corrigidas (mistura): ${correctedCount}`);
        console.log(`   Conversas preenchidas (NULL): ${filledNullCount}`);

        // 5. Verificação final
        console.log('\n📊 Executando verificação final...');
        
        const { data: verificacaoFinal } = await supabaseAdmin
            .from('conversation_history')
            .select(`
                conversation_context,
                conversation_outcome,
                is_from_user
            `)
            .not('conversation_context', 'is', null);

        if (verificacaoFinal) {
            // Reagrupar para verificar
            const conversasVerificacao = {};
            verificacaoFinal.forEach(msg => {
                const sessionId = msg.conversation_context?.session_id;
                if (sessionId) {
                    if (!conversasVerificacao[sessionId]) {
                        conversasVerificacao[sessionId] = [];
                    }
                    conversasVerificacao[sessionId].push(msg.conversation_outcome);
                }
            });

            let misturasRestantes = 0;
            let conversasSemOutcomeFinal = 0;
            let conversasPerfeitas = 0;

            for (const outcomes of Object.values(conversasVerificacao)) {
                const outcomesValidos = outcomes.filter(Boolean);
                const outcomesUnicos = [...new Set(outcomesValidos)];
                
                if (outcomesValidos.length === 0) {
                    conversasSemOutcomeFinal++;
                } else if (outcomesUnicos.length > 1) {
                    misturasRestantes++;
                } else if (outcomesValidos.length === outcomes.length) {
                    conversasPerfeitas++;
                }
            }

            console.log('\n📊 RESULTADO FINAL:');
            console.log(`   Total de conversas: ${Object.keys(conversasVerificacao).length}`);
            console.log(`   Conversas perfeitas: ${conversasPerfeitas}`);
            console.log(`   Conversas com mistura: ${misturasRestantes}`);
            console.log(`   Conversas sem outcome: ${conversasSemOutcomeFinal}`);
            
            const successRate = ((conversasPerfeitas / Object.keys(conversasVerificacao).length) * 100).toFixed(2);
            console.log(`   Taxa de sucesso: ${successRate}%`);
            
            if (misturasRestantes === 0 && conversasSemOutcomeFinal === 0) {
                console.log('🎉 PERFEITO: Todas as conversas têm outcomes consistentes!');
            } else {
                console.log(`⚠️  ${misturasRestantes + conversasSemOutcomeFinal} conversas ainda precisam de atenção`);
            }
        }

    } catch (error) {
        console.error('❌ Erro geral na correção:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    corrigirTodasConversas()
        .then(() => {
            console.log('✅ Correção completa finalizada!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { corrigirTodasConversas };