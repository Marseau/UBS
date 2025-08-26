#!/usr/bin/env node

const crypto = require('crypto');
const fetch = require('node-fetch');

// Gerar token demo válido
function generateDemoToken() {
  const secret = 'dev-secret';
  const fullPayload = {
    timestamp: Date.now(),
    tenantId: '33b8c488-5aa9-4891-b335-701d10296681',
    source: 'test_suite',
    expiresIn: 5 * 60 * 1000 // 5 minutos
  };

  const dataToSign = JSON.stringify(fullPayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex');

  return Buffer.from(`${dataToSign}.${signature}`).toString('base64');
}

async function testMetricsValidation() {
  console.log('🧪 TESTE: Validação das métricas LLM');
  
  const token = generateDemoToken();
  console.log('✅ Token gerado');
  
  const url = 'http://localhost:3000/api/whatsapp/webhook';
  const testMessage = `Teste métricas ${Date.now()}`;
  
  const body = {
    object: "whatsapp_business_account",
    entry: [{
      id: "test_metrics",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "test_phone_metrics",
            phone_number_id: "test_phone_metrics"
          },
          messages: [{
            from: "5511888888888",
            id: `wamid.test_${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: { body: testMessage },
            type: "text"
          }]
        },
        field: "messages"
      }]
    }]
  };

  console.log('📨 Enviando mensagem de teste...');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-token': token
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Resposta recebida:', {
        status: result.status,
        response: result.response ? result.response.substring(0, 50) + '...' : 'N/A',
        telemetry: result.telemetry
      });
      
      // Aguardar processamento assíncrono
      console.log('⏳ Aguardando 3 segundos para persistência...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('\n🔍 Agora verifique no banco de dados:');
      console.log('-- Verificar se métricas estão APENAS em is_from_user=false');
      console.log(`SELECT is_from_user, tokens_used, api_cost_usd, confidence_score, content`);
      console.log(`FROM conversation_history`);
      console.log(`WHERE content LIKE '%${testMessage.substring(0, 20)}%'`);
      console.log(`ORDER BY created_at DESC LIMIT 4;`);
      
    } else {
      const error = await response.text();
      console.error('❌ Erro:', response.status, error);
    }
    
  } catch (error) {
    console.error('❌ Erro na requisição:', error.message);
  }
}

testMetricsValidation();