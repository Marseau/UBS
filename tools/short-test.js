#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

// =====================================================
// CONFIGURAÇÃO E UTILITÁRIOS
// =====================================================

const CONFIG = {
  HOST: process.env.HOST || 'http://localhost:3000',
  MODE: process.env.MODE || 'demo',
  DEMO_SECRET: process.env.DEMO_MODE_TOKEN || 'dev-secret',
  MESSAGE_DELAY: parseInt(process.env.DELAY) || 2000, // ms entre mensagens
};

// Gerar ID único para o teste
const TEST_RUN_ID = `run_${Date.now()}`;
console.log(`🚀 TEST_RUN_ID: ${TEST_RUN_ID}`);

/**
 * Função para gerar token demo usando a classe DemoTokenValidator do sistema
 */
function makeDemoToken(tenantId) {
  // Import e usar a classe real do sistema
  const { demoTokenValidator } = require('../dist/utils/demo-token-validator');
  return demoTokenValidator.generateToken({ source: 'test_suite', tenantId });
}

/**
 * Pausa entre mensagens
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CENÁRIOS SIMPLES - APENAS UMA CONVERSA POR DOMÍNIO
const SIMPLE_SCENARIOS = {
  "healthcare": [
    {
      "id": "onboarding_test",
      "name": "Teste de Onboarding com Nome",
      "expected_outcome": "information_provided",
      "messages": [
        "Olá",
        "Mario Sérgio",
        "mario.sergio@email.com"
      ]
    }
  ],
  "beauty": [
    {
      "id": "beauty_simple",
      "name": "Agendamento Simples Beleza",
      "expected_outcome": "appointment_scheduled",
      "messages": [
        "Oi, quero agendar um corte",
        "Sábado de manhã",
        "9h está bom"
      ]
    }
  ],
  "education": [
    {
      "id": "education_simple",
      "name": "Consulta Simples Educação",
      "expected_outcome": "information_provided",
      "messages": [
        "Quero informações sobre cursos",
        "Inglês básico",
        "Obrigado"
      ]
    }
  ]
};

// TENANTS SIMPLES
const SIMPLE_TENANTS = {
  "healthcare": [
    {
      "id": "test-healthcare-1",
      "name": "Clínica Teste",
      "whatsapp": "5511940017001",
      "domain": "healthcare"
    }
  ],
  "beauty": [
    {
      "id": "test-beauty-1",
      "name": "Salão Teste",
      "whatsapp": "5511940017002",
      "domain": "beauty"
    }
  ],
  "education": [
    {
      "id": "test-education-1",
      "name": "Escola Teste",
      "whatsapp": "5511940017003",
      "domain": "education"
    }
  ]
};

/**
 * Cria tenant demo
 */
async function createTenant(tenantData) {
  const response = await fetch(`${CONFIG.HOST}/api/demo/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantName: tenantData.name,
      whatsappNumber: tenantData.whatsapp,
      businessName: tenantData.name,
      domain: tenantData.domain
    })
  });

  if (!response.ok) {
    throw new Error(`Erro ao criar tenant: ${response.status}`);
  }

  const result = await response.json();
  console.log(`✅ Tenant criado: ${tenantData.name} (${result.tenantId})`);
  return result.tenantId;
}

/**
 * Envia mensagem para o chat
 */
async function sendMessage(tenantId, userPhone, message) {
  const token = makeDemoToken(tenantId);

  console.log(`      📨 "${message}"`);

  const response = await fetch(`${CONFIG.HOST}/api/demo/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-token': token
    },
    body: JSON.stringify({
      message: message,
      userPhone: userPhone
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na mensagem: ${errorText}`);
  }

  const result = await response.json();
  console.log(`      🤖 "${result.response}"`);

  return result;
}

/**
 * Executa uma conversa completa
 */
async function runConversation(tenantId, scenario, userPhone) {
  console.log(`    💬 CONVERSA: ${scenario.name}`);
  console.log(`    🎯 Expected outcome: ${scenario.expected_outcome}`);

  for (let i = 0; i < scenario.messages.length; i++) {
    const message = scenario.messages[i];

    try {
      const result = await sendMessage(tenantId, userPhone, message);

      // Pausa entre mensagens
      if (i < scenario.messages.length - 1) {
        await sleep(CONFIG.MESSAGE_DELAY);
      }

    } catch (error) {
      console.log(`      ❌ Erro na mensagem: ${error.message}`);
      return false;
    }
  }

  console.log(`    ✅ Conversa finalizada\n`);
  return true;
}

/**
 * Executa teste completo
 */
async function runShortTest() {
  console.log(`\n🚀 INICIANDO TESTE CURTO`);
  console.log(`📋 Host: ${CONFIG.HOST}`);
  console.log(`⏱️  Delay entre mensagens: ${CONFIG.MESSAGE_DELAY}ms`);
  console.log(`🎯 Executando apenas 1 conversa por domínio\n`);

  const stats = {
    totalDomains: 0,
    totalConversations: 0,
    successfulConversations: 0,
    errors: 0
  };

  // Para cada domínio
  for (const [domain, scenarios] of Object.entries(SIMPLE_SCENARIOS)) {
    console.log(`🎯 DOMÍNIO: ${domain.toUpperCase()}`);
    stats.totalDomains++;

    // Pegar apenas o primeiro tenant
    const tenantData = SIMPLE_TENANTS[domain][0];

    try {
      // Criar tenant
      const tenantId = await createTenant(tenantData);
      await sleep(500); // Pausa após criar tenant

      console.log(`  👤 TENANT: ${tenantId.substring(0,8)}...\n`);

      // Executar apenas o primeiro cenário
      const scenario = scenarios[0];
      stats.totalConversations++;

      // Gerar telefone único para o usuário
      const userPhone = `551194001${String(Date.now()).slice(-4)}`;

      const success = await runConversation(tenantId, scenario, userPhone);
      if (success) {
        stats.successfulConversations++;
      } else {
        stats.errors++;
      }

    } catch (error) {
      console.log(`❌ Erro no domínio ${domain}: ${error.message}\n`);
      stats.errors++;
    }

    // Pausa entre domínios
    if (domain !== Object.keys(SIMPLE_SCENARIOS).slice(-1)[0]) {
      await sleep(1000);
    }
  }

  // Estatísticas finais
  console.log(`\n📊 RESULTADO DO TESTE CURTO:`);
  console.log(`✅ Domínios testados: ${stats.totalDomains}`);
  console.log(`✅ Conversas executadas: ${stats.totalConversations}`);
  console.log(`✅ Conversas bem-sucedidas: ${stats.successfulConversations}`);
  console.log(`❌ Erros: ${stats.errors}`);
  console.log(`📈 Taxa de sucesso: ${Math.round((stats.successfulConversations / stats.totalConversations) * 100)}%`);
  console.log(`\n🎉 Teste curto finalizado!`);
}

// Executar o teste
if (require.main === module) {
  runShortTest().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { runShortTest };