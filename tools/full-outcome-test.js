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
  MESSAGE_DELAY: 250, // ms entre mensagens
  SCENARIOS_FILE: process.env.SCENARIOS || 'scenarios/all-domains.json',
  TENANTS_FILE: 'scenarios/tenants.json'
};

// Gerar ID único para o teste
const TEST_RUN_ID = `run_${Date.now()}`;
console.log(`🚀 TEST_RUN_ID: ${TEST_RUN_ID}`);

/**
 * Base64URL encoding
 */
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

/**
 * Função para gerar token demo usando a classe DemoTokenValidator do sistema
 */
function makeDemoToken(tenantId) {
  // Import e usar a classe real do sistema
  const { demoTokenValidator } = require('../src/utils/demo-token-validator');
  return demoTokenValidator.generateToken({ source: 'test_suite', tenantId });
}


/**
 * Pausa entre mensagens
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mapeamento tenant ID -> telefone do negócio (para demo)
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
 * Enviar mensagem para a rota DEMO correta
 * - Usa /api/demo/chat para bypass com token
 * - Payload simplificado para demo
 */
async function sendWhatsAppWebhook(tenantId, message, userPhone) {
  const url = `${CONFIG.HOST}/api/demo/chat`;

  const whatsappNumber = TENANT_PHONE_MAP[tenantId];
  if (!whatsappNumber) {
    throw new Error(`Tenant phone not found for ID: ${tenantId}`);
  }

  // Payload simples para rota demo
  const payload = {
    message: message,
    userPhone: userPhone,
    whatsappNumber: whatsappNumber
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-demo-token': makeDemoToken(tenantId) // bypass credencial WhatsApp
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }
  return response.json().catch(() => ({}));
}

// =====================================================
// EXECUÇÃO PRINCIPAL
// =====================================================

async function runFullOutcomeTest() {
  console.log('📋 Iniciando Full Outcome Test...');
  console.log(`⚙️ Config: ${JSON.stringify(CONFIG, null, 2)}`);

  try {
    // 1. Carregar arquivos de configuração
    console.log('\n📂 Carregando configurações...');

    const tenantsPath = path.resolve(CONFIG.TENANTS_FILE);
    const scenariosPath = path.resolve(CONFIG.SCENARIOS_FILE);

    if (!fs.existsSync(tenantsPath)) {
      throw new Error(`❌ Arquivo não encontrado: ${tenantsPath}`);
    }
    if (!fs.existsSync(scenariosPath)) {
      throw new Error(`❌ Arquivo não encontrado: ${scenariosPath}`);
    }

    const tenants = JSON.parse(fs.readFileSync(tenantsPath, 'utf8'));
    const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));

    console.log(`✅ Tenants carregados: ${Object.keys(tenants).length} domínios`);
    console.log(`✅ Scenarios carregados: ${scenarios.outcomes.length} outcomes possíveis`);

    // 2. Executar testes por domínio
    let totalConversations = 0;
    let totalMessages = 0;

    for (const [domain, tenantIds] of Object.entries(tenants)) {
      console.log(`\n🎯 DOMÍNIO: ${domain.toUpperCase()}`);
      console.log(`📋 Tenants: ${tenantIds.join(', ')}`);

      // Verificar se domínio tem scenarios
      if (!scenarios.domains[domain]) {
        console.warn(`⚠️ Nenhum scenario encontrado para domínio: ${domain}`);
        continue;
      }

      const domainScenarios = scenarios.domains[domain];

      // Para cada tenant do domínio
      for (let i = 0; i < tenantIds.length; i++) {
        const tenantId = tenantIds[i];
        console.log(`\n  👤 TENANT ${i + 1}: ${tenantId}`);

        // Executar conversas do domínio
        for (let j = 0; j < domainScenarios.conversations.length; j++) {
          const conversation = domainScenarios.conversations[j];
          console.log(`\n    💬 CONVERSA ${j + 1}: ${conversation.id}`);
          console.log(`    🎯 Expected outcome: ${conversation.expected_outcome}`);

          const userPhone = conversation.test_user_phone || '+5511999999999';

          // Enviar todas as mensagens da conversa
          for (let k = 0; k < conversation.messages.length; k++) {
            const message = conversation.messages[k];
            console.log(`      📨 Mensagem ${k + 1}: "${message}"`);

            try {
              const response = await sendWhatsAppWebhook(tenantId, message, userPhone);
              const preview = typeof response === 'object' ? (response.response || response.status || 'OK') : 'OK';
              console.log(`      ✅ Resposta: "${preview}"`);
              totalMessages++;

              // Pausa entre mensagens
              if (k < conversation.messages.length - 1) {
                await sleep(CONFIG.MESSAGE_DELAY);
              }
            } catch (error) {
              console.error(`      ❌ Erro na mensagem: ${error.message}`);
            }
          }

          totalConversations++;
          console.log(`    ✅ Conversa finalizada`);

          // Pausa maior entre conversas
          await sleep(CONFIG.MESSAGE_DELAY * 2);
        }
      }
    }

    // 3. Resumo final
    console.log(`\n🎉 TESTE CONCLUÍDO!`);
    console.log(`📊 Estatísticas:`);
    console.log(`  - TEST_RUN_ID: ${TEST_RUN_ID}`);
    console.log(`  - Total de conversas: ${totalConversations}`);
    console.log(`  - Total de mensagens: ${totalMessages}`);
    console.log(`  - Domínios testados: ${Object.keys(tenants).length}`);
    console.log(`  - Tenants usados: ${Object.values(tenants).flat().length}`);

    // 4. Queries SQL para validação
    console.log(`\n🔍 QUERIES SQL PARA VALIDAÇÃO:`);

    console.log(`\n-- Ver últimas mensagens persistidas`);
    console.log(`SELECT created_at, tenant_id, user_id, is_from_user, message_source, intent_detected, conversation_outcome, conversation_context`);
    console.log(`FROM public.conversation_history`);
    console.log(`WHERE created_at >= NOW() - INTERVAL '30 minutes'`);
    console.log(`ORDER BY created_at DESC;`);

    console.log(`\n-- Fonte das mensagens (deve ser 'whatsapp_demo')`);
    console.log(`SELECT message_source, count(*)`);
    console.log(`FROM public.conversation_history`);
    console.log(`WHERE created_at >= NOW() - INTERVAL '30 minutes'`);
    console.log(`GROUP BY message_source;`);

    const allTenantIds = Object.values(tenants).flat();
    console.log(`\n-- Appointments criados recentemente (últimas 2h)`);
    console.log(`SELECT tenant_id, status, service_id, professional_id, start_time, end_time, created_at`);
    console.log(`FROM public.appointments`);
    console.log(`WHERE tenant_id IN ('${allTenantIds.join("', '")}')`);
    console.log(`  AND created_at >= NOW() - INTERVAL '2 hours';`);

  } catch (error) {
    console.error(`\n❌ ERRO FATAL:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// =====================================================
// EXECUÇÃO
// =====================================================

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📋 Full Outcome Test - Sistema de Testes de Conversas

USO:
  HOST=https://SEU_HOST MODE=demo DEMO_MODE_TOKEN='SEU_SECRET' node tools/full-outcome-test.js

VARIÁVEIS DE AMBIENTE:
  HOST                - URL do servidor (default: http://localhost:3000)
  MODE                - Modo de execução (default: demo)
  DEMO_MODE_TOKEN     - Secret para tokens demo (default: fixed-secret-for-load-test-2025)
  SCENARIOS           - Arquivo de scenarios (default: scenarios/all-domains.json)

ARQUIVOS NECESSÁRIOS:
  scenarios/tenants.json      - Lista de tenants por domínio
  scenarios/all-domains.json  - Scenarios de conversas

SAÍDA:
  - TEST_RUN_ID para auditoria
  - Queries SQL para validação
  - Estatísticas de execução
  `);
  process.exit(0);
}

// Executar teste
runFullOutcomeTest().catch(error => {
  console.error('💥 Erro não capturado:', error);
  process.exit(1);
});