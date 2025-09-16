#!/usr/bin/env node

const { demoTokenValidator } = require('../dist/utils/demo-token-validator');
const fetch = require('node-fetch');

const CONFIG = {
  HOST: 'http://localhost:3000',
  DEMO_SECRET: 'dev-secret',
  // Usar tenant existente dos testes anteriores
  TENANT_ID: '689a46f9-354e-4cdc-9b54-cbe3fc88f267',
  USER_PHONE: '5511940017505', // Mesmo do teste anterior que funcionou
  WHATSAPP_NUMBER: '5511940017005', // Número do negócio que funcionou
  MESSAGE_DELAY: 3000
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendMessage(message) {
  const token = demoTokenValidator.generateToken({
    source: 'test_suite',
    tenantId: CONFIG.TENANT_ID
  });

  console.log(`📨 Enviando: "${message}"`);

  const response = await fetch(`${CONFIG.HOST}/api/demo/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-token': token
    },
    body: JSON.stringify({
      message: message,
      userPhone: CONFIG.USER_PHONE,
      whatsappNumber: CONFIG.WHATSAPP_NUMBER
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na mensagem: ${errorText}`);
  }

  const result = await response.json();
  console.log(`🤖 Resposta: "${result.response}"`);
  console.log('---');

  return result;
}

async function testOnboardingFlow() {
  console.log('🚀 TESTE DE ONBOARDING FLOW');
  console.log(`📱 Telefone: ${CONFIG.USER_PHONE}`);
  console.log(`🏢 Tenant: ${CONFIG.TENANT_ID}`);
  console.log('---');

  try {
    // Mensagem 1: Saudação (deve iniciar flow_lock)
    await sendMessage("Olá");
    await sleep(CONFIG.MESSAGE_DELAY);

    // Mensagem 2: Nome (deve processar e avançar para email)
    await sendMessage("Mario Sérgio");
    await sleep(CONFIG.MESSAGE_DELAY);

    // Mensagem 3: Email (deve completar onboarding)
    await sendMessage("mario.sergio@email.com");

    console.log('✅ Teste de onboarding concluído!');

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar o teste
if (require.main === module) {
  testOnboardingFlow().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { testOnboardingFlow };