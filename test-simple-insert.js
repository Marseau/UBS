/**
 * Teste simples via API demo para verificar duration_minutes
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

// Token do demo (baseado no script full-outcome-test.js)
function makeDemoToken(tenantId) {
  const secret = 'dev-secret';
  const payload = {
    timestamp: Date.now(),
    tenantId: tenantId,
    source: 'test_suite',
    expiresIn: 5 * 60 * 1000
  };

  const dataToSign = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex');

  return `${Buffer.from(dataToSign).toString('base64')}.${signature}`;
}

async function testSimpleAPI() {
  console.log('🧪 Testando API demo com duration_minutes...\n');

  const tenantId = 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8';
  const token = makeDemoToken(tenantId);
  
  console.log('🔑 Token gerado para tenant:', tenantId.substring(0, 8) + '...');

  // Simular mensagens com delay para testar duration
  const messages = [
    'Olá, preciso de ajuda',
    'Quero agendar um horário',
    'Para amanhã de manhã'
  ];

  const sessionId = `test_${Date.now()}`;
  console.log('📱 Session ID:', sessionId);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    if (i > 0) {
      console.log(`⏱️ Aguardando 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`📨 Enviando mensagem ${i + 1}: "${message}"`);
    
    const webhook = {
      entry: [{
        id: 'entry_id',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+551199999999',
              phone_number_id: '123456789'
            },
            messages: [{
              id: `msg_${sessionId}_${i}`,
              from: '+5511888888888',
              timestamp: Math.floor(Date.now() / 1000).toString(), // timestamp atual em segundos
              type: 'text',
              text: {
                body: message
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };

    try {
      const response = await fetch('http://localhost:3000/api/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-demo-mode': 'true'
        },
        body: JSON.stringify(webhook)
      });

      const result = await response.json();
      console.log(`✅ Resposta ${i + 1}: ${response.status} - ${result.status || 'OK'}`);
      
      if (result.aiResponse) {
        console.log(`🤖 AI: "${result.aiResponse.substring(0, 50)}..."`);
      }

    } catch (error) {
      console.error(`❌ Erro na mensagem ${i + 1}:`, error.message);
    }
    
    console.log('');
  }

  console.log('✅ Teste API concluído!');
  console.log('🔍 Aguardando 2s para verificar no banco...\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
}

testSimpleAPI().catch(console.error);