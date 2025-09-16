#!/usr/bin/env node

require('dotenv').config();
const fetch = require('node-fetch');

// Import the DemoTokenValidator from compiled JS
const { demoTokenValidator } = require('../dist/utils/demo-token-validator');

async function testSimple() {
  console.log('🧪 Teste simples de 1 mensagem via demo API');
  
  // Use simple fallback token that now works
  const tenantId = 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8';
  const token = 'fixed-secret-for-load-test-2025';
  
  console.log('🔑 Token gerado:', token.substring(0, 50) + '...');
  console.log('📋 TenantId:', tenantId);

  const payload = {
    message: 'Olá, teste simples - preciso marcar uma consulta',
    userPhone: '5511999000001',
    whatsappNumber: '5511999001001' // phone do tenant healthcare 1
  };

  console.log('📨 Enviando payload:', payload);

  const response = await fetch('http://localhost:3000/api/demo/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-token': token
    },
    body: JSON.stringify(payload)
  });

  const result = await response.text();
  console.log('📊 Status:', response.status);
  console.log('📄 Response:', result);
  
  if (response.ok) {
    console.log('✅ SUCESSO! Sistema demo funcionando');
    try {
      const parsed = JSON.parse(result);
      console.log('🎯 Reply:', parsed.reply || parsed.text || 'No reply found');
    } catch (e) {
      console.log('⚠️ Resposta não é JSON válido');
    }
  } else {
    console.log('❌ ERRO no teste demo');
  }
}

testSimple().catch(console.error);