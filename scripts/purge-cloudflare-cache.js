#!/usr/bin/env node

/**
 * Purge Cloudflare Cache for ubs.app.br
 *
 * Este script limpa o cache do Cloudflare usando a API REST.
 * Requer CLOUDFLARE_API_TOKEN e CLOUDFLARE_ZONE_ID no .env
 */

require('dotenv').config();
const https = require('https');

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// Se não tiver as credenciais, pedir ao usuário
if (!API_TOKEN || !ZONE_ID) {
  console.log('❌ Credenciais Cloudflare não encontradas no .env\n');
  console.log('📋 Para configurar:');
  console.log('1. Obtenha API Token: https://dash.cloudflare.com/profile/api-tokens');
  console.log('   - Create Token → "Edit zone DNS" template');
  console.log('   - Ou use "Custom Token" com permissão "Cache Purge"');
  console.log('');
  console.log('2. Obtenha Zone ID:');
  console.log('   - Acesse: https://dash.cloudflare.com');
  console.log('   - Selecione domínio ubs.app.br');
  console.log('   - Sidebar → API → Zone ID');
  console.log('');
  console.log('3. Adicione ao .env:');
  console.log('   CLOUDFLARE_API_TOKEN=seu_token_aqui');
  console.log('   CLOUDFLARE_ZONE_ID=seu_zone_id_aqui');
  console.log('');
  console.log('💡 Alternativamente, limpe manualmente:');
  console.log('   https://dash.cloudflare.com → ubs.app.br → Caching → Purge Everything');
  process.exit(1);
}

console.log('🧹 Limpando cache do Cloudflare...\n');

const data = JSON.stringify({
  purge_everything: true
});

const options = {
  hostname: 'api.cloudflare.com',
  port: 443,
  path: `/client/v4/zones/${ZONE_ID}/purge_cache`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(responseData);

      if (response.success) {
        console.log('✅ Cache limpo com sucesso!');
        console.log('');
        console.log('⏳ Aguarde 30 segundos para propagação...');
        console.log('');
        console.log('🔄 Depois, teste:');
        console.log('   - http://ubs.app.br (Ctrl+Shift+R para hard refresh)');
        console.log('   - Modo anônimo para garantir cache limpo');
        console.log('');
      } else {
        console.log('❌ Falha ao limpar cache');
        console.log('');
        console.log('Resposta da API:');
        console.log(JSON.stringify(response, null, 2));
        console.log('');
        console.log('💡 Tente limpar manualmente:');
        console.log('   https://dash.cloudflare.com → ubs.app.br → Caching → Purge Everything');
      }
    } catch (error) {
      console.log('❌ Erro ao processar resposta:', error.message);
      console.log('Resposta bruta:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Erro na requisição:', error.message);
  console.log('');
  console.log('💡 Verifique:');
  console.log('   - Conexão com internet');
  console.log('   - Validade do API Token');
  console.log('   - Zone ID correto');
});

req.write(data);
req.end();
