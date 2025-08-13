const http = require('http');

// Testar diferentes endpoints para ver quais estão funcionando
const endpoints = [
  '/api/health',
  '/api/cron/status',
  '/api/cron/health', 
  '/api/cron/dashboard',
  '/api/super-admin/dashboard',
  '/api/metrics/status'
];

async function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      resolve({ path, status: res.statusCode, available: res.statusCode !== 404 });
    });

    req.on('error', (err) => {
      resolve({ path, status: 'ERROR', available: false, error: err.message });
    });

    req.setTimeout(5000, () => {
      req.abort();
      resolve({ path, status: 'TIMEOUT', available: false });
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 Testando endpoints disponíveis:');
  console.log('=================================');
  
  const results = await Promise.all(endpoints.map(testEndpoint));
  
  results.forEach(result => {
    const status = result.available ? '✅' : '❌';
    console.log(`${status} ${result.path} - Status: ${result.status}`);
  });
  
  const availableCount = results.filter(r => r.available).length;
  console.log(`\n📊 ${availableCount}/${results.length} endpoints disponíveis`);
}

main().catch(console.error);