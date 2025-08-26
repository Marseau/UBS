const crypto = require('crypto');
const { supabaseAdmin } = require('./dist/config/database');

async function getValidTenants() {
    console.log('🔍 Buscando tenants reais do banco...');
    
    const { data: tenants, error } = await supabaseAdmin
        .from('tenants')
        .select('id, business_name, phone, domain, whatsapp_numbers')
        .not('phone', 'is', null)
        .limit(2);
        
    if (error) {
        console.error('❌ Erro ao buscar tenants:', error);
        return null;
    }
    
    if (tenants.length < 2) {
        console.error('❌ Menos de 2 tenants encontrados no BD');
        return null;
    }
    
    console.log(`✅ Encontrados ${tenants.length} tenants:`);
    tenants.forEach((t, i) => {
        console.log(`   ${i+1}. ${t.business_name} - Tel: ${t.phone} - Domínio: ${t.domain}`);
    });
    
    return tenants;
}

async function generateDemoTokenForTenant(tenant) {
    try {
        const response = await fetch(`http://localhost:3000/api/whatsapp/generate-demo-token?tenant_id=${tenant.id}&phone_number=${encodeURIComponent(tenant.phone)}`);
        const data = await response.json();
        
        if (!data.token) {
            throw new Error('Token não gerado');
        }
        
        console.log(`🔑 Token gerado para ${tenant.business_name}: ${data.token.substring(0, 50)}...`);
        return data.token;
    } catch (error) {
        console.error(`❌ Erro ao gerar token para ${tenant.business_name}:`, error);
        return null;
    }
}

async function sendWhatsAppMessage(tenant, token, userPhone, messageText, messageNumber, conversationNumber) {
    const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [{
                value: {
                    messaging_product: "whatsapp",
                    metadata: {
                        display_phone_number: tenant.phone,
                        phone_number_id: `PHONE_${tenant.id.substring(0, 8)}`
                    },
                    messages: [{
                        from: userPhone,
                        id: `wamid_test_${tenant.id}_conv${conversationNumber}_msg${messageNumber}_${Date.now()}`,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        text: {
                            body: messageText
                        },
                        type: "text"
                    }]
                },
                field: "messages"
            }]
        }]
    };
    
    const payload = JSON.stringify(webhookPayload);
    
    // Gerar assinatura HMAC usando o demo token
    const signature = crypto
        .createHmac('sha256', token)
        .update(payload)
        .digest('hex');
    
    try {
        const { execSync } = require('child_process');
        
        const curlCommand = `curl -s -X POST http://localhost:3000/api/whatsapp/webhook \
            -H 'Content-Type: application/json' \
            -H 'X-Hub-Signature-256: sha256=${signature}' \
            -H 'User-Agent: WhatsApp-Testing/1.0' \
            --data-raw '${payload.replace(/'/g, "'\"'\"'")}'`;
        
        const response = execSync(curlCommand, { encoding: 'utf8' });
        const parsedResponse = JSON.parse(response);
        
        console.log(`   📤 Msg ${messageNumber}: "${messageText.substring(0, 30)}..." → ${parsedResponse.status}`);
        
        if (parsedResponse.status === 'success') {
            return {
                success: true,
                response: parsedResponse.response,
                telemetry: parsedResponse.telemetry
            };
        } else {
            console.log(`   ⚠️ Resposta: ${parsedResponse.response}`);
            return { success: false, error: parsedResponse.response };
        }
        
    } catch (error) {
        console.error(`   ❌ Erro ao enviar mensagem ${messageNumber}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function runConversation(tenant, token, conversationNumber) {
    console.log(`\n💬 === CONVERSA ${conversationNumber} - ${tenant.business_name} ===`);
    
    const userPhone = `+551199999${String(conversationNumber).padStart(2, '0')}${String(Math.floor(Math.random() * 10))}`;
    console.log(`👤 Cliente: ${userPhone}`);
    
    // Mensagens variadas para cada conversa
    const conversations = [
        [
            "Olá, gostaria de agendar um horário",
            "Preciso para amanhã de manhã se possível",
            "Qual o valor do serviço completo?"
        ],
        [
            "Bom dia! Vocês atendem aos sábados?",
            "Preciso de um corte + barba",
            "Aceita cartão de crédito?"
        ]
    ];
    
    const messages = conversations[conversationNumber - 1] || conversations[0];
    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
        const result = await sendWhatsAppMessage(tenant, token, userPhone, messages[i], i + 1, conversationNumber);
        results.push(result);
        
        // Aguardar um pouco entre mensagens
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`   📊 Resultado: ${successCount}/${results.length} mensagens enviadas com sucesso`);
    
    return results;
}

async function validateDatabaseResults(tenants, startTime) {
    console.log('\n🔍 === VALIDAÇÃO NO BANCO DE DADOS ===');
    
    // Buscar conversas criadas após o início do teste
    const { data: conversations, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${conversations.length} mensagens desde o início do teste`);
    console.log('='.repeat(80));
    
    let userMessages = 0;
    let aiMessages = 0;
    let correctUserMetrics = 0;
    let correctAiMetrics = 0;
    let newCalculationCount = 0;
    let oldCalculationCount = 0;
    
    conversations.forEach((msg, i) => {
        const userType = msg.is_from_user ? 'USER' : 'AI  ';
        console.log(`${i+1}. [${userType}] ${msg.content?.substring(0, 50)}...`);
        console.log(`   🏢 Tenant: ${msg.tenant_id}`);
        console.log(`   📊 Tokens: ${msg.tokens_used} | Cost: ${msg.api_cost_usd} | Processing: ${msg.processing_cost_usd}`);
        console.log(`   🎯 Confidence: ${msg.confidence_score} | Created: ${msg.created_at}`);
        
        if (msg.is_from_user) {
            userMessages++;
            // Verificar se mensagem de usuário tem métricas NULL
            if (msg.tokens_used === null && msg.api_cost_usd === null && msg.processing_cost_usd === null && msg.confidence_score === null) {
                correctUserMetrics++;
                console.log('   ✅ USER: Métricas NULL corretas');
            } else {
                console.log('   ❌ USER: Métricas deviam ser NULL!');
            }
        } else {
            aiMessages++;
            // Verificar mensagem de IA
            if (msg.tokens_used !== null && msg.api_cost_usd !== null && msg.processing_cost_usd !== null) {
                correctAiMetrics++;
                
                const ratio = msg.processing_cost_usd / msg.api_cost_usd;
                console.log(`   📈 Ratio processing/api: ${ratio.toFixed(4)}`);
                
                if (ratio < 0.1) {
                    newCalculationCount++;
                    console.log('   ✅ NOVO CÁLCULO CORRETO (não mais 10%)');
                } else if (Math.abs(ratio - 0.1) < 0.001) {
                    oldCalculationCount++;
                    console.log('   ❌ AINDA USANDO CÁLCULO ANTIGO (10%)');
                } else {
                    console.log(`   🤔 CÁLCULO DIFERENTE: ${(ratio * 100).toFixed(2)}%`);
                }
            } else {
                console.log('   ❌ AI: Métricas faltando!');
            }
        }
        console.log('');
    });
    
    // Resumo final
    console.log('📋 === RESUMO DA VALIDAÇÃO ===');
    console.log(`👤 Mensagens de usuário: ${userMessages} (${correctUserMetrics} com métricas NULL corretas)`);
    console.log(`🤖 Mensagens de IA: ${aiMessages} (${correctAiMetrics} com métricas preenchidas)`);
    console.log(`✅ Novo cálculo correto: ${newCalculationCount}`);
    console.log(`❌ Cálculo antigo (10%): ${oldCalculationCount}`);
    
    // Verificar se correção foi aplicada
    const totalAiWithMetrics = correctAiMetrics;
    const correctionSuccessRate = totalAiWithMetrics > 0 ? (newCalculationCount / totalAiWithMetrics) * 100 : 0;
    
    console.log(`\n🎯 Taxa de sucesso da correção: ${correctionSuccessRate.toFixed(1)}%`);
    
    if (correctionSuccessRate >= 80) {
        console.log('🎉 TESTE PASSOU! Correção das métricas funcionando adequadamente');
    } else if (correctionSuccessRate >= 50) {
        console.log('⚠️ TESTE PARCIAL. Algumas métricas ainda usam cálculo antigo');
    } else {
        console.log('❌ TESTE FALHOU. Maioria ainda usa cálculo antigo');
    }
    
    return {
        userMessages,
        aiMessages,
        correctUserMetrics,
        correctAiMetrics,
        newCalculationCount,
        oldCalculationCount,
        correctionSuccessRate
    };
}

async function runCompleteTest() {
    console.log('🧪 TESTE COMPLETO: Processing Cost USD - Correção das Métricas');
    console.log('📋 Cenário: 2 tenants reais, 2 conversas cada, mínimo 6 mensagens por conversa');
    console.log('=' .repeat(80));
    
    const startTime = new Date();
    
    // 1. Buscar tenants reais
    const tenants = await getValidTenants();
    if (!tenants) {
        console.log('❌ Não foi possível obter tenants válidos. Abortando teste.');
        return;
    }
    
    // 2. Gerar tokens para cada tenant
    console.log('\n🔑 Gerando tokens demo...');
    for (let tenant of tenants) {
        tenant.demoToken = await generateDemoTokenForTenant(tenant);
        if (!tenant.demoToken) {
            console.log(`❌ Falha ao gerar token para ${tenant.business_name}. Abortando.`);
            return;
        }
    }
    
    // 3. Executar conversas
    console.log('\n💬 Executando conversas...');
    const allResults = [];
    
    for (let i = 0; i < tenants.length; i++) {
        const tenant = tenants[i];
        console.log(`\n🏢 === TENANT ${i+1}: ${tenant.business_name} ===`);
        
        // 2 conversas por tenant
        for (let conv = 1; conv <= 2; conv++) {
            const conversationResults = await runConversation(tenant, tenant.demoToken, conv);
            allResults.push(...conversationResults);
            
            // Aguardar entre conversas
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // 4. Aguardar processamento assíncrono
    console.log('\n⏳ Aguardando processamento assíncrono completo...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 5. Validar resultados no banco
    const validation = await validateDatabaseResults(tenants, startTime);
    
    // 6. Resultado final
    console.log('\n🏁 === RESULTADO FINAL DO TESTE ===');
    const totalMessages = allResults.length;
    const successfulMessages = allResults.filter(r => r.success).length;
    
    console.log(`📤 Mensagens enviadas: ${successfulMessages}/${totalMessages}`);
    console.log(`📊 Tenants testados: ${tenants.length}`);
    console.log(`💬 Conversas executadas: ${tenants.length * 2}`);
    console.log(`✅ Correção de processing_cost_usd: ${validation?.correctionSuccessRate?.toFixed(1) || 0}% de sucesso`);
    
    if (validation?.correctionSuccessRate >= 80) {
        console.log('\n🎉 TESTE COMPLETO PASSOU! Sistema funcionando corretamente.');
    } else {
        console.log('\n⚠️ TESTE NECESSITA INVESTIGAÇÃO. Nem todas as métricas foram corrigidas.');
    }
}

runCompleteTest().catch(console.error);