// Script para obter token demo válido da sessão atual do servidor
const http = require('http');

// Fazer uma requisição direta ao servidor para obter o token da sessão atual
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/whatsapp/webhook/v3',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-demo-token': 'force-generate-new-token' // Sinal para gerar novo token
  }
};

// Payload mínimo para provocar resposta
const data = JSON.stringify({
  entry: [{
    id: "test",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: "test" },
        messages: [{
          from: "test",
          id: "test",
          timestamp: "1",
          text: { body: "test" },
          type: "text"
        }]
      },
      field: "messages"
    }]
  }]
});

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', body);
    
    // Se a resposta contiver informação sobre token válido, extrair
    if (body.includes('Token válido') || res.statusCode === 200) {
      console.log('✅ Resposta obtida - analisar logs do servidor para token válido');
    } else {
      console.log('❌ Não conseguiu obter token válido');
    }
  });
});

req.on('error', (e) => {
  console.error(`Erro na requisição: ${e.message}`);
});

req.write(data);
req.end();