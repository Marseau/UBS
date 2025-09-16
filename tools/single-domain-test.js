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
  DEMO_SECRET: process.env.DEMO_MODE_TOKEN || 'fixed-secret-for-load-test-2025',
  MESSAGE_DELAY: parseInt(process.env.DELAY) || 2000, // ms entre mensagens
  SCENARIOS_FILE: process.env.SCENARIOS || 'scenarios/all-domains.json',
  TENANTS_FILE: 'scenarios/tenants.json'
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

// Mapeamento tenant ID -> telefone do negócio (para demo) - CÓPIA EXATA DO FULL TEST
const TENANT_PHONE_MAP = {
  'f34d8c94-f6cf-4dd7-82de-a3123b380cd8': '5511999001001', // Healthcare 1
  'fe2fa876-05da-49b5-b266-8141bcd090fa': '5511999001002', // Healthcare 2
  '33b8c488-5aa9-4891-b335-701d10296681': '5511999002001', // Beauty 1
  '5bd592ee-8247-4a62-862e-7491fa499103': '5511999002002', // Beauty 2
  '85cee693-a2e2-444a-926a-19f69db13489': '5511999003001', // Education 1
  'c3aa73f8-db80-40db-a9c4-73718a0fee34': '5511999003002', // Education 2
  '7ae2807f-4a30-4b37-b11e-073b79a3b0c4': '5511999004001', // Sports 1
  '4853f74d-9518-4476-bfa7-9cb4e43af04a': '5511999004002', // Sports 2
  'ae509773-6b9d-45f9-925c-dfa3edd0326a': '5511999005001', // Legal 1
  '765b26dc-f8e3-4eb2-b1c6-a896d99d1c2a': '5511999005002', // Legal 2
  '151b2fb0-39e6-4a7f-bf87-3454a5327cb4': '5511999006001', // Consulting 1
  '4a6dc7c4-abd6-4ca6-bb4c-f4d14a3579f5': '5511999006002', // Consulting 2
};

/**
 * Carrega tenants configurados - formato simplificado (só IDs)
 */
function loadTenants() {
  const tenantsPath = path.join(__dirname, '..', CONFIG.TENANTS_FILE);

  if (!fs.existsSync(tenantsPath)) {
    throw new Error(`Arquivo de tenants não encontrado: ${tenantsPath}`);
  }

  return JSON.parse(fs.readFileSync(tenantsPath, 'utf-8'));
}

/**
 * Carrega cenários de teste
 */
function loadScenarios() {
  const scenariosPath = path.join(__dirname, '..', CONFIG.SCENARIOS_FILE);

  if (!fs.existsSync(scenariosPath)) {
    throw new Error(`Arquivo de scenarios não encontrado: ${scenariosPath}`);
  }

  return JSON.parse(fs.readFileSync(scenariosPath, 'utf-8'));
}

/**
 * Envia mensagem para o webhook
 */
async function sendMessage(tenantId, userPhone, message) {
  const businessPhone = TENANT_PHONE_MAP[tenantId];
  if (!businessPhone) {
    throw new Error(`Telefone do negócio não encontrado para tenant ${tenantId}`);
  }

  const token = makeDemoToken(tenantId);

  const response = await fetch(`${CONFIG.HOST}/api/demo/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-token': token
    },
    body: JSON.stringify({
      message: message,
      userPhone: userPhone,
      whatsappNumber: businessPhone
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`      ❌ Erro na mensagem: ${errorText}`);
    return null;
  }

  const result = await response.json();
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
    console.log(`      📨 Mensagem ${i + 1}: "${message}"`);

    try {
      const result = await sendMessage(tenantId, userPhone, message);

      if (result) {
        console.log(`      🤖 Resposta: "${result.response}"`);

        // Log adicional se houver outcome
        if (result.conversationOutcome) {
          console.log(`      🎯 Outcome detectado: ${result.conversationOutcome}`);
        }
      }

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
 * Executa teste focado em apenas 1 domínio
 */
async function runSingleDomainTest() {
  console.log(`\n🚀 INICIANDO TESTE DE DOMÍNIO ÚNICO`);
  console.log(`📋 Host: ${CONFIG.HOST}`);
  console.log(`⏱️  Delay entre mensagens: ${CONFIG.MESSAGE_DELAY}ms`);

  const stats = {
    totalConversations: 0,
    successfulConversations: 0,
    errors: 0
  };

  try {
    // Carregar dados
    const tenants = loadTenants();
    const scenarios = loadScenarios();

    // Pegar apenas HEALTHCARE (primeiro domínio)
    const domain = 'healthcare';
    const domainTenantIds = tenants[domain];  // Array de IDs
    const domainScenarios = scenarios.domains?.[domain]?.conversations || scenarios[domain];

    if (!domainTenantIds || !domainScenarios) {
      throw new Error(`Domínio ${domain} não encontrado nos arquivos de configuração`);
    }

    console.log(`🎯 DOMÍNIO: ${domain.toUpperCase()}`);
    console.log(`📋 Tenants: ${domainTenantIds.map(id => id.substring(0,8) + '...').join(', ')}\n`);

    // Pegar apenas o primeiro tenant ID
    const tenantId = domainTenantIds[0];
    const whatsappNumber = TENANT_PHONE_MAP[tenantId];

    console.log(`  👤 TENANT: ${tenantId}`);
    console.log(`  📱 WhatsApp Business: ${whatsappNumber}\n`);

    // Pegar apenas o primeiro cenário
    const scenario = domainScenarios[0];
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
    console.error(`❌ Erro no teste: ${error.message}`);
    stats.errors++;
  }

  // Estatísticas finais
  console.log(`\n📊 RESULTADO DO TESTE:`);
  console.log(`✅ Conversas executadas: ${stats.totalConversations}`);
  console.log(`✅ Conversas bem-sucedidas: ${stats.successfulConversations}`);
  console.log(`❌ Erros: ${stats.errors}`);
  if (stats.totalConversations > 0) {
    console.log(`📈 Taxa de sucesso: ${Math.round((stats.successfulConversations / stats.totalConversations) * 100)}%`);
  }
  console.log(`\n🎉 Teste de domínio único finalizado!`);
}

// Executar o teste
if (require.main === module) {
  runSingleDomainTest().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { runSingleDomainTest };