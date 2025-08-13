// Script para gerar URL de autorização do Google Calendar para produção

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const PROFESSIONAL_ID = '72a8459a-0017-424e-be85-58b0faf867b9';

// Configurações do OAuth
const CLIENT_ID = '1082639244907-chsj9dgjp39oei8r46pab3d2o5muhpal.apps.googleusercontent.com';
const REDIRECT_URI = 'https://dev.ubs.app.br/api/demo/google-calendar/callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Criar state com tenant e professional IDs
const state = JSON.stringify({ 
  tenant_id: TENANT_ID, 
  professional_id: PROFESSIONAL_ID 
});
const encodedState = Buffer.from(state).toString('base64');

// Construir URL de autorização
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPE)}&` +
  `access_type=offline&` +
  `prompt=consent&` +
  `state=${encodedState}`;

console.log('='.repeat(80));
console.log('🔗 URL DE AUTORIZAÇÃO DO GOOGLE CALENDAR (PRODUÇÃO)');
console.log('='.repeat(80));
console.log('');
console.log(authUrl);
console.log('');
console.log('='.repeat(80));
console.log('📋 INSTRUÇÕES:');
console.log('='.repeat(80));
console.log('1. Copie a URL acima');
console.log('2. Abra em seu navegador');
console.log('3. Faça login com sua conta Google');
console.log('4. Autorize o acesso ao Google Calendar');
console.log('5. Será redirecionado para: https://dev.ubs.app.br/api/demo/google-calendar/callback');
console.log('');
console.log('⚠️  IMPORTANTE:');
console.log('- A aplicação precisa estar rodando em dev.ubs.app.br');
console.log('- A rota /api/demo/google-calendar/callback precisa estar implementada');
console.log('- O código de autorização será processado no servidor');
console.log('');
console.log('🔧 DADOS DA DEMO:');
console.log('- Tenant ID:', TENANT_ID);
console.log('- Professional ID:', PROFESSIONAL_ID);
console.log('- Redirect URI:', REDIRECT_URI);
console.log('='.repeat(80));