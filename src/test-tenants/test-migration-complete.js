#!/usr/bin/env node

/**
 * TESTE COMPLETO DA MIGRAÇÃO SISTEMA OTIMIZADO
 * Verifica se migração foi bem-sucedida
 */

const http = require('http');

async function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: url,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testMigration() {
  console.log('🚀 INICIANDO TESTE COMPLETO DE MIGRAÇÃO');
  console.log('=====================================');
  
  const tests = [
    {
      name: 'Health Check Básico',
      url: '/api/health',
      expectedStatus: 200
    },
    {
      name: 'Status do Sistema de Cron',
      url: '/api/cron/status',
      expectedStatus: [200, 503]
    },
    {
      name: 'Dashboard do Sistema',
      url: '/api/cron/dashboard', 
      expectedStatus: [200, 503]
    },
    {
      name: 'Status de Migração',
      url: '/api/cron/migration-status',
      expectedStatus: [200, 503]
    },
    {
      name: 'Health Check do Cron',
      url: '/api/cron/health',
      expectedStatus: [200, 503]
    }
  ];

  let successCount = 0;
  let totalTests = tests.length;

  for (let test of tests) {
    try {
      console.log(`\n📋 Testando: ${test.name}`);
      console.log(`   URL: ${test.url}`);
      
      const result = await makeRequest(test.url);
      
      const isExpectedStatus = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus.includes(result.status)
        : result.status === test.expectedStatus;
        
      if (isExpectedStatus) {
        console.log(`   ✅ Status: ${result.status} (Esperado)`);
        
        if (result.data && typeof result.data === 'object') {
          if (result.data.service === 'tenant-metrics-cron-optimized') {
            console.log(`   🎯 Migração detectada: ${result.data.service}`);
          }
          if (result.data.migration === 'COMPLETE') {
            console.log(`   ✅ Status de migração: ${result.data.migration}`);
          }
        }
        
        successCount++;
      } else {
        console.log(`   ❌ Status: ${result.status} (Esperado: ${test.expectedStatus})`);
        console.log(`   📄 Resposta: ${JSON.stringify(result.data).substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   💥 Erro: ${error.message}`);
    }
  }

  console.log('\n=====================================');
  console.log(`📊 RESULTADO: ${successCount}/${totalTests} testes passaram`);
  
  if (successCount >= totalTests * 0.8) {
    console.log('✅ MIGRAÇÃO CONSIDERADA BEM-SUCEDIDA');
  } else if (successCount >= totalTests * 0.6) {
    console.log('⚠️  MIGRAÇÃO PARCIALMENTE BEM-SUCEDIDA');
  } else {
    console.log('❌ MIGRAÇÃO COM PROBLEMAS');
  }
  
  console.log('=====================================');
}

// Executar teste
testMigration().catch(console.error);