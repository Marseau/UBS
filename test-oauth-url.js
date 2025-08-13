// Teste de URL OAuth com valores exatos

const CLIENT_ID = '1082639244907-chsj9dgjp39oei8r46pab3d2o5muhpal.apps.googleusercontent.com';
const REDIRECT_URI = 'https://dev.ubs.app.br/api/demo/google-calendar/callback';

// URL simples sem state para testar
const simpleAuthUrl = 
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  'client_id=' + CLIENT_ID + 
  '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
  '&response_type=code' +
  '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.events') +
  '&access_type=offline' +
  '&prompt=consent';

console.log('='.repeat(80));
console.log('URL DE TESTE SIMPLIFICADA:');
console.log('='.repeat(80));
console.log('');
console.log(simpleAuthUrl);
console.log('');
console.log('='.repeat(80));
console.log('VERIFICAÇÃO:');
console.log('='.repeat(80));
console.log('Client ID:', CLIENT_ID);
console.log('Redirect URI:', REDIRECT_URI);
console.log('Redirect URI encoded:', encodeURIComponent(REDIRECT_URI));
console.log('');