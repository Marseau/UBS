/**
 * TESTE DA INTEGRAÇÃO AI + OUTCOMES
 * 
 * Testa se a IA está preenchendo outcomes automaticamente
 */

const { AIService } = require('./src/services/ai-complex.service');
const { supabaseAdmin } = require('./src/config/database');

async function testarIntegracaoAI() {
    try {
        console.log('🤖 Testando integração AI + Outcomes...');
        
        // 1. Criar contexto de teste
        const testContext = {
            tenantId: '33b8c488-5aa9-4891-b335-701d10296681', // Tenant real: Bella Vista Spa
            userId: '5cace1d6-611b-4032-9a89-202d75ddaa17',   // User real: Cliente 849
            phoneNumber: '+551190000849',
            conversationId: null, // Será criado
            sessionId: 'test_session_' + Date.now(),
            tenantConfig: {
                domain: 'beauty',
                business_name: 'Teste Salon',
                ai_personality: 'friendly'
            },
            conversationHistory: []
        };

        console.log('📋 Contexto criado:', testContext.sessionId);

        // 2. Criar conversa de teste no banco
        const { data: conversaTeste, error: conversaError } = await supabaseAdmin
            .from('conversation_history')
            .insert({
                tenant_id: testContext.tenantId,
                user_id: testContext.userId,
                content: 'Oi, gostaria de agendar uma manicure',
                is_from_user: true,
                message_type: 'text',
                intent_detected: 'booking_request',
                confidence_score: 0.95,
                conversation_context: { session_id: testContext.sessionId },
                tokens_used: 10,
                api_cost_usd: 0.001,
                model_used: 'gpt-4-turbo',
                message_source: 'test',
                processing_cost_usd: 0.0005,
                conversation_outcome: null // NULL - deve ser preenchido pela IA
            })
            .select()
            .single();

        if (conversaError) {
            console.error('❌ Erro ao criar conversa teste:', conversaError);
            return;
        }

        testContext.conversationId = conversaTeste.id;
        console.log('💬 Conversa teste criada:', conversaTeste.id);

        // 3. Verificar se IA está disponível
        const aiService = new AIService();
        
        if (!aiService.openai) {
            console.log('⚠️  OpenAI não configurado - testando apenas detectAndMarkOutcome');
            
            // Testar diretamente o ConversationOutcomeService
            const { ConversationOutcomeService } = require('./src/services/conversation-outcome.service');
            const outcomeService = new ConversationOutcomeService();
            
            const resultado = await outcomeService.detectAndMarkOutcome(
                conversaTeste.id,
                'Oi, gostaria de agendar uma manicure',
                'booking_request',
                0.95,
                testContext.tenantId,
                testContext.userId,
                testContext.phoneNumber
            );
            
            console.log('🎯 Resultado detectAndMarkOutcome:', resultado);
            
        } else {
            // 4. Processar mensagem com IA completa
            console.log('🤖 Processando com AI Complex Service...');
            
            try {
                const aiResult = await aiService.processMessage(
                    'Oi, gostaria de agendar uma manicure', 
                    testContext,
                    null // sem media
                );
                
                console.log('✅ AI processou com sucesso!');
                console.log('📊 Resposta:', {
                    message: aiResult.response.message?.substring(0, 100) + '...',
                    intent: aiResult.response.intent,
                    confidence: aiResult.response.confidence,
                    actions: aiResult.actions?.length || 0
                });
                
            } catch (aiError) {
                console.error('❌ Erro no processamento AI:', aiError.message);
            }
        }

        // 5. Verificar se outcome foi preenchido
        const { data: conversaFinal, error: finalError } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('id', conversaTeste.id)
            .single();

        if (finalError) {
            console.error('❌ Erro ao verificar resultado:', finalError);
            return;
        }

        console.log('\n📊 RESULTADO DO TESTE:');
        console.log(`   Conversa ID: ${conversaTeste.id}`);
        console.log(`   Outcome inicial: NULL`);
        console.log(`   Outcome final: ${conversaFinal.conversation_outcome}`);
        
        if (conversaFinal.conversation_outcome) {
            console.log('🎉 SUCESSO: Outcome foi preenchido automaticamente!');
        } else {
            console.log('❌ FALHA: Outcome ainda está NULL');
        }

        // 6. Limpar dados de teste
        console.log('🧹 Limpando dados de teste...');
        await supabaseAdmin
            .from('conversation_history')
            .delete()
            .eq('id', conversaTeste.id);

        console.log('✅ Teste concluído!');

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar teste
if (require.main === module) {
    testarIntegracaoAI()
        .then(() => {
            console.log('🏁 Teste finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { testarIntegracaoAI };