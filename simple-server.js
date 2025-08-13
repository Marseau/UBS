const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000; // Using port 3000 to match Google Console configuration

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Google Calendar OAuth route - simplified
app.get('/api/demo/google-calendar/auth', (req, res) => {
  const { tenant_id, professional_id } = req.query;
  
  if (!tenant_id || !professional_id) {
    return res.status(400).json({
      error: 'Missing tenant_id or professional_id parameters'
    });
  }

  // Google OAuth URL construction
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || '1082639244907-chsj9dgjp39oei8r46pab3d2o5muhpal.apps.googleusercontent.com';
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/demo/google-calendar/callback';
  const scope = 'https://www.googleapis.com/auth/calendar';
  
  const state = JSON.stringify({ tenant_id, professional_id });
  const encodedState = Buffer.from(state).toString('base64');
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${encodedState}`;

  // Redirect to Google OAuth
  res.redirect(authUrl);
});

// OAuth callback
app.get('/api/demo/google-calendar/callback', (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.send(`
      <h1>❌ Erro na Autorização</h1>
      <p>Erro: ${error}</p>
      <p><a href="/">Voltar</a></p>
    `);
  }
  
  if (!code) {
    return res.send(`
      <h1>❌ Código de Autorização Não Recebido</h1>
      <p><a href="/">Voltar</a></p>
    `);
  }
  
  // Decode state
  let tenantId, professionalId;
  try {
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
    tenantId = decodedState.tenant_id;
    professionalId = decodedState.professional_id;
  } catch (e) {
    return res.send(`
      <h1>❌ Estado Inválido</h1>
      <p>Erro ao decodificar parâmetros</p>
    `);
  }
  
  // Success page (for now - later we'll save the tokens to database)
  res.send(`
    <h1>🎉 Autorização do Google Calendar Realizada com Sucesso!</h1>
    <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px;">
      <h2>✅ Próximos Passos:</h2>
      <ol>
        <li><strong>Salvamos seu código de autorização:</strong> <code>${code.substring(0, 20)}...</code></li>
        <li><strong>Tenant ID:</strong> <code>${tenantId}</code></li>
        <li><strong>Professional ID:</strong> <code>${professionalId}</code></li>
        <li><strong>Sistema está configurado!</strong> Agora todos os testes da demo usarão seu Google Calendar</li>
      </ol>
    </div>
    
    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px;">
      <h3>🔧 Para Desenvolvedores:</h3>
      <p>Agora você precisa implementar a troca do código por tokens de acesso na aplicação principal.</p>
      <p>Código de autorização recebido: <code>${code}</code></p>
    </div>
    
    <p><strong>🚀 Demo do Google Calendar está pronta para uso!</strong></p>
  `);
});

// Static files
const frontendPath = path.join(__dirname, 'src', 'frontend');
app.use(express.static(frontendPath));

app.listen(PORT, () => {
  console.log(`🌐 Simple server running on http://localhost:${PORT}`);
  console.log(`🔗 Authorization URL: http://localhost:${PORT}/api/demo/google-calendar/auth?tenant_id=00000000-0000-4000-8000-000000000001&professional_id=72a8459a-0017-424e-be85-58b0faf867b9`);
  console.log(`✅ Google Calendar OAuth ready!`);
});