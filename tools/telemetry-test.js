#!/usr/bin/env node

/**
 * TELEMETRY FOCUSED TEST
 * Teste rápido e focado para validar sistema Intent→Outcome
 * Máximo 6 conversas (1 por domínio) para validar telemetria
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Config minimalista
const CONFIG = {
  HOST: process.env.HOST || 'http://localhost:3000',
  MODE: process.env.MODE || 'demo',
  DEMO_SECRET: process.env.DEMO_MODE_TOKEN || 'dev-secret',
  MESSAGE_DELAY: 500 // Delay menor para ser mais rápido
};

// 1 tenant por domínio para teste rápido
const QUICK_TENANTS = {
  healthcare: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8',
  beauty: '33b8c488-5aa9-4891-b335-701d10296681', 
  education: '85cee693-a2e2-444a-926a-19f69db13489',
  sports: '7ae2807f-4a30-4b37-b11e-073b79a3b0c4',
  legal: 'ae509773-6b9d-45f9-925c-dfa3edd0326a',
  consulting: '151b2fb0-39e6-4a7f-bf87-3454a5327cb4'
};

// 1 cenário por domínio - focado em outcomes diferentes
const QUICK_SCENARIOS = {
  healthcare: {
    messages: [
      "Olá, preciso marcar uma consulta",
      "Tenho disponibilidade na próxima semana", 
      "Pode ser terça-feira às 9h?",
      "Perfeito, confirmo o horário"
    ],
    expected_outcome: 'appointment_created'
  },
  beauty: {
    messages: [
      "Oi, quero agendar um corte",
      "Posso agendar para sábado?",
      "Às 10h está bom",
      "Agendado!"
    ],
    expected_outcome: 'appointment_created'
  },
  education: {
    messages: [
      "Gostaria de informações sobre cursos",
      "Estou interessado em inglês intermediário",
      "Qual a duração total do curso?",
      "Vou conversar em casa e retorno"
    ],
    expected_outcome: 'info_request_fulfilled'
  },
  sports: {
    messages: [
      "Vocês têm aulas de pilates?",
      "Quais os horários disponíveis?",
      "Quanto custa o pacote mensal?",
      "Vou pensar e entro em contato"
    ],
    expected_outcome: 'info_request_fulfilled'
  },
  legal: {
    messages: [
      "Preciso de uma consulta jurídica",
      "Vocês atendem nessa área?",
      "Quinta-feira à tarde tem vaga?",
      "Confirmado para quinta às 15h"
    ],
    expected_outcome: 'appointment_created'
  },
  consulting: {
    messages: [
      "Gostaria de saber sobre consultoria em marketing",
      "Como funciona o processo?",
      "Qual o investimento necessário?",
      "Vou discutir com sócios e retorno"
    ],
    expected_outcome: 'info_request_fulfilled'
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Gera token HMAC válido como no sistema
function generateDemoToken(secret, tenantId = null) {
  const payload = {
    source: 'test_suite',
    tenantId: tenantId,
    timestamp: Date.now(),
    expiresIn: 5 * 60 * 1000 // 5 minutos
  };

  const dataToSign = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex');

  const token = Buffer.from(`${dataToSign}.${signature}`).toString('base64');
  return token;
}

async function sendMessage(tenantId, userId, message, isFromUser = true) {
  try {
    const response = await axios.post(`${CONFIG.HOST}/api/whatsapp/webhook`, {
      entry: [{
        id: "whatsapp_business_account_id",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15551234567",
              phone_number_id: "phone_number_id"
            },
            messages: isFromUser ? [{
              from: userId,
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              text: { body: message },
              type: "text"
            }] : []
          },
          field: "messages"
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-demo-token': generateDemoToken(CONFIG.DEMO_SECRET, tenantId),
        'x-tenant-id': tenantId
      },
      timeout: 10000
    });

    return response.status === 200;
  } catch (error) {
    console.error(`      ❌ Erro na mensagem: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`);
    return false;
  }
}

async function runTelemetryTest() {
  const TEST_RUN_ID = `telemetry_${Date.now()}`;
  
  console.log(`🚀 TELEMETRY TEST_RUN_ID: ${TEST_RUN_ID}`);
  console.log(`📋 Teste Focado de Telemetria Intent→Outcome`);
  console.log(`⚙️ Config: ${JSON.stringify(CONFIG, null, 2)}`);
  console.log('');

  let totalConversations = 0;
  let successfulMessages = 0;

  console.log(`🎯 TESTE RÁPIDO: 6 conversas (1 por domínio)`);
  console.log('');

  for (const [domain, tenantId] of Object.entries(QUICK_TENANTS)) {
    const scenario = QUICK_SCENARIOS[domain];
    const userId = uuidv4();
    
    console.log(`  🏢 ${domain.toUpperCase()}: ${tenantId}`);
    console.log(`    💬 CONVERSA: ${scenario.expected_outcome}`);
    console.log(`    🎯 Expected outcome: ${scenario.expected_outcome}`);

    // Enviar mensagens do cenário
    for (let i = 0; i < scenario.messages.length; i++) {
      const message = scenario.messages[i];
      console.log(`      📨 Mensagem ${i + 1}: "${message}"`);
      
      const success = await sendMessage(tenantId, userId, message, true);
      if (success) successfulMessages++;
      
      await sleep(CONFIG.MESSAGE_DELAY);
    }
    
    console.log(`    ✅ Conversa finalizada`);
    console.log('');
    totalConversations++;
  }

  console.log(`🎉 TESTE CONCLUÍDO!`);
  console.log(`📊 Estatísticas:`);
  console.log(`  - TEST_RUN_ID: ${TEST_RUN_ID}`);
  console.log(`  - Total de conversas: ${totalConversations}`);
  console.log(`  - Mensagens enviadas: ${successfulMessages}`);
  console.log(`  - Domínios testados: ${Object.keys(QUICK_TENANTS).length}`);
  console.log('');

  console.log(`🔍 QUERIES SQL PARA VALIDAÇÃO DE TELEMETRIA:`);
  console.log('');
  console.log(`-- Ver telemetria Intent→Outcome recém capturada`);
  console.log(`SELECT tenant_id, intent_detected, outcome_finalized, abandoned, conversion_time_seconds, source`);
  console.log(`FROM public.intent_outcome_telemetry`);
  console.log(`WHERE created_at >= NOW() - INTERVAL '5 minutes'`);
  console.log(`ORDER BY created_at DESC;`);
  console.log('');
  console.log(`-- Ver outcomes das conversas (últimos 5 min)`);
  console.log(`SELECT tenant_id, user_id, intent_detected, conversation_outcome, message_source`);
  console.log(`FROM public.conversation_history`);
  console.log(`WHERE created_at >= NOW() - INTERVAL '5 minutes'`);
  console.log(`AND conversation_outcome IS NOT NULL`);
  console.log(`ORDER BY created_at DESC;`);
}

// Executar teste
runTelemetryTest().catch(console.error);