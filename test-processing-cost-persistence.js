const crypto = require('crypto');

// Token gerado
const demoToken = "eyJzb3VyY2UiOiJ0ZXN0X3N1aXRlIiwidGVuYW50SWQiOiJkMDMyZDg1My1kOWM4LTRlODQtOTAzMy1jMDc1NzE3OTBhNTIiLCJ0aW1lc3RhbXAiOjE3NTYwODIxNTUwMTEsImV4cGlyZXNJbiI6MzAwMDAwfS5lYmMwMTBiOTA5ODkzYTAyYmM5MjVjYWNlMzMzZTdjYzNjNDI5MmRiNDlmNzRjN2UyN2FlNGU5YmYyNjg0OWVk";

async function testProcessingCostPersistence() {
    console.log('🧪 TESTE: Persistência das métricas processing_cost_usd corrigidas');
    console.log('=' .repeat(80));
    
    // Simular mensagem WhatsApp
    const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [{
                value: {
                    messaging_product: "whatsapp",
                    metadata: {
                        display_phone_number: "+5511999999999",
                        phone_number_id: "PHONE_NUMBER_ID"
                    },
                    messages: [{
                        from: "+5511888888888",
                        id: `wamid_test_${Date.now()}`,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        text: {
                            body: "Qual o preço do corte de cabelo?"
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
        .createHmac('sha256', demoToken)
        .update(payload)
        .digest('hex');
    
    console.log('📤 Enviando webhook para o sistema V3...');
    console.log(`🔑 Usando demo token: ${demoToken.substring(0, 50)}...`);
    console.log(`🔒 Assinatura HMAC: sha256=${signature}`);
    
    try {
        // Usar child_process para executar curl com raw body
        const { execSync } = require('child_process');
        
        const curlCommand = `curl -X POST http://localhost:3000/api/whatsapp/webhook \
            -H 'Content-Type: application/json' \
            -H 'X-Hub-Signature-256: sha256=${signature}' \
            -H 'User-Agent: WhatsApp-Testing/1.0' \
            --data-raw '${payload.replace(/'/g, "'\"'\"'")}'`;
        
        console.log('🔧 Executando curl para envio raw...');
        
        const response = execSync(curlCommand, { encoding: 'utf8' });
        
        console.log('✅ Webhook executado!');
        console.log('📊 Resposta:', response.substring(0, 200) + '...');
        
        // Aguardar um pouco para o processamento assíncrono
        console.log('⏳ Aguardando processamento assíncrono...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao enviar webhook:', error);
        return false;
    }
}

async function checkDatabaseResults() {
    console.log('\n🔍 Verificando resultados no banco de dados...');
    
    const { supabaseAdmin } = require('./dist/config/database');
    
    try {
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('content, is_from_user, tokens_used, api_cost_usd, processing_cost_usd, confidence_score, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (error) {
            console.error('❌ Erro ao consultar BD:', error);
            return;
        }
        
        console.log(`📊 Últimas ${data.length} mensagens:`)
        console.log('='.repeat(60));
        
        data.forEach((row, i) => {
            const userType = row.is_from_user ? 'USER' : 'AI  ';
            console.log(`${i+1}. [${userType}] ${row.content?.substring(0, 40)}...`);
            console.log(`   📊 tokens: ${row.tokens_used}`);
            console.log(`   💰 api_cost: ${row.api_cost_usd}`);  
            console.log(`   ⚙️  processing_cost: ${row.processing_cost_usd}`);
            console.log(`   🎯 confidence: ${row.confidence_score}`);
            console.log(`   🕒 ${row.created_at}`);
            
            // Verificar se é mensagem AI com métricas corretas
            if (!row.is_from_user && row.processing_cost_usd !== null && row.api_cost_usd !== null) {
                const ratio = row.processing_cost_usd / row.api_cost_usd;
                console.log(`   📈 Ratio processing/api: ${ratio.toFixed(4)}`);
                
                if (ratio < 0.1) {
                    console.log(`   ✅ NOVO CÁLCULO CORRETO! (não é mais 10%)`);
                } else if (Math.abs(ratio - 0.1) < 0.001) {
                    console.log(`   ❌ AINDA USANDO CÁLCULO ANTIGO (10%)`);
                } else {
                    console.log(`   🤔 CÁLCULO DIFERENTE: ${(ratio * 100).toFixed(2)}%`);
                }
            } else if (!row.is_from_user) {
                console.log(`   ⚠️  MENSAGEM AI SEM MÉTRICAS`);
            } else {
                console.log(`   ✅ MENSAGEM USER COM MÉTRICAS NULL (correto)`);
            }
            
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

async function runTest() {
    const success = await testProcessingCostPersistence();
    
    if (success) {
        await checkDatabaseResults();
        
        console.log('\n🎯 CONCLUSÃO:');
        console.log('- O webhook V3 foi testado com demo token');
        console.log('- Métricas de processing_cost_usd devem estar corretas (não mais 10%)');
        console.log('- Mensagens de usuário devem ter métricas NULL');
        console.log('- Mensagens de IA devem ter métricas calculadas corretamente');
    }
}

runTest().catch(console.error);