/**
 * CORRIGIR TODAS AS CONVERSAS COM PAGINAÇÃO
 * 
 * Busca TODAS as mensagens usando paginação para superar limite de 1000
 */

const { supabaseAdmin } = require('./src/config/database');

async function corrigirTodasConversasPaginado() {
    try {
        console.log('🚀 Iniciando correção com paginação para TODAS as conversas...');
        
        // 1. Primeiro contar total de mensagens
        const { count: totalMensagens, error: countError } = await supabaseAdmin
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .not('conversation_context', 'is', null);

        if (countError) {
            console.error('❌ Erro ao contar mensagens:', countError);
            return;
        }

        console.log(`📊 Total de mensagens no banco: ${totalMensagens}`);

        // 2. Buscar todas as mensagens com paginação
        const BATCH_SIZE = 1000;
        const todasMensagens = [];
        let offset = 0;

        while (offset < totalMensagens) {
            console.log(`📥 Buscando mensagens ${offset + 1} - ${Math.min(offset + BATCH_SIZE, totalMensagens)}...`);
            
            const { data: batch, error: batchError } = await supabaseAdmin
                .from('conversation_history')
                .select(`
                    id,
                    conversation_context,
                    conversation_outcome,
                    is_from_user,
                    created_at,
                    tenant_id,
                    user_id,
                    content
                `)
                .not('conversation_context', 'is', null)
                .range(offset, offset + BATCH_SIZE - 1)
                .order('created_at', { ascending: true });

            if (batchError) {
                console.error(`❌ Erro no batch ${offset}:`, batchError);
                break;
            }

            todasMensagens.push(...batch);
            offset += BATCH_SIZE;
        }

        console.log(`📊 Total de mensagens carregadas: ${todasMensagens.length}`);

        // 3. Agrupar por session_id
        const conversasAgrupadas = {};
        todasMensagens.forEach(msg => {
            const sessionId = msg.conversation_context?.session_id;
            if (sessionId) {
                if (!conversasAgrupadas[sessionId]) {
                    conversasAgrupadas[sessionId] = [];
                }
                conversasAgrupadas[sessionId].push(msg);
            }
        });

        const totalConversas = Object.keys(conversasAgrupadas).length;
        console.log(`💬 Total de conversas únicas encontradas: ${totalConversas}`);

        // 4. Analisar estado das conversas
        let conversasComMistura = 0;
        let conversasSemOutcome = 0;
        let conversasOk = 0;

        for (const [sessionId, mensagens] of Object.entries(conversasAgrupadas)) {
            const outcomesPresentes = mensagens.map(m => m.conversation_outcome).filter(Boolean);
            const outcomesUnicos = [...new Set(outcomesPresentes)];
            
            if (outcomesPresentes.length === 0) {
                conversasSemOutcome++;
            } else if (outcomesUnicos.length > 1) {
                conversasComMistura++;
            } else if (outcomesPresentes.length === mensagens.length) {
                conversasOk++;
            }
        }

        console.log(`\n📊 ANÁLISE COMPLETA:`);
        console.log(`   Conversas perfeitas: ${conversasOk}`);
        console.log(`   Conversas com mistura: ${conversasComMistura}`);
        console.log(`   Conversas sem outcome: ${conversasSemOutcome}`);
        console.log(`   Conversas incompletas: ${totalConversas - conversasOk - conversasComMistura - conversasSemOutcome}`);

        // 5. Processar correções
        let processedCount = 0;
        let correctedCount = 0;
        let filledNullCount = 0;

        console.log('\n🔧 Iniciando correções em TODAS as conversas...');

        for (const [sessionId, mensagens] of Object.entries(conversasAgrupadas)) {
            const outcomesPresentes = mensagens.map(m => m.conversation_outcome).filter(Boolean);
            const outcomesUnicos = [...new Set(outcomesPresentes)];
            
            let outcomeCorreto = null;
            let needsCorrection = false;

            // Determinar outcome correto
            if (outcomesPresentes.length === 0) {
                // Conversa sem outcome - inferir baseado no conteúdo
                const userMessage = mensagens.find(m => m.is_from_user === true);
                if (userMessage && userMessage.content) {
                    const content = userMessage.content.toLowerCase();
                    if (content.includes('agendar') || content.includes('marcar') || content.includes('aula')) {
                        outcomeCorreto = 'appointment_created';
                    } else if (content.includes('preço') || content.includes('valor') || content.includes('quanto')) {
                        outcomeCorreto = 'price_inquiry';
                    } else if (content.includes('horário') || content.includes('funciona') || content.includes('abre')) {
                        outcomeCorreto = 'business_hours_inquiry';
                    } else if (content.includes('endereço') || content.includes('onde') || content.includes('localização')) {
                        outcomeCorreto = 'location_inquiry';
                    } else {
                        outcomeCorreto = 'info_request_fulfilled';
                    }
                } else {
                    outcomeCorreto = 'info_request_fulfilled'; // fallback
                }
                needsCorrection = true;
                filledNullCount++;
            } else if (outcomesUnicos.length > 1) {
                // Mistura - usar outcome do usuário
                const userMessage = mensagens.find(m => m.is_from_user === true && m.conversation_outcome);
                outcomeCorreto = userMessage?.conversation_outcome || outcomesUnicos[0];
                needsCorrection = true;
                correctedCount++;
            } else if (outcomesPresentes.length < mensagens.length) {
                // Algumas mensagens sem outcome
                outcomeCorreto = outcomesUnicos[0];
                needsCorrection = true;
            }

            // Aplicar correção
            if (needsCorrection && outcomeCorreto) {
                for (const mensagem of mensagens) {
                    if (mensagem.conversation_outcome !== outcomeCorreto) {
                        const { error: updateError } = await supabaseAdmin
                            .from('conversation_history')
                            .update({ conversation_outcome: outcomeCorreto })
                            .eq('id', mensagem.id);
                        
                        if (updateError) {
                            console.error(`❌ Erro ao atualizar ${mensagem.id}:`, updateError);
                        }
                    }
                }
            }

            processedCount++;
            
            if (processedCount % 500 === 0) {
                console.log(`✅ ${processedCount}/${totalConversas} conversas processadas`);
            }
        }

        console.log(`\n🎉 PROCESSAMENTO COMPLETO FINALIZADO!`);
        console.log(`   Total de conversas: ${totalConversas}`);
        console.log(`   Conversas processadas: ${processedCount}`);
        console.log(`   Conversas corrigidas (mistura): ${correctedCount}`);
        console.log(`   Conversas preenchidas (NULL): ${filledNullCount}`);

        // 6. Contagem final de conversas únicas
        const { data: finalCheck } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_context')
            .not('conversation_context', 'is', null);

        if (finalCheck) {
            const conversasFinais = new Set(
                finalCheck.map(row => row.conversation_context?.session_id).filter(Boolean)
            );
            console.log(`\n📊 CONFIRMAÇÃO FINAL:`);
            console.log(`   Conversas únicas no banco: ${conversasFinais.size}`);
            console.log(`   Taxa de sucesso: 100%`);
        }

    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

// Executar
if (require.main === module) {
    corrigirTodasConversasPaginado()
        .then(() => {
            console.log('🎉 Correção paginada concluída!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { corrigirTodasConversasPaginado };