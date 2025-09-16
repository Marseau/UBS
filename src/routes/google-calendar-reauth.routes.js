// src/routes/google-calendar-reauth.routes.js
// Endpoint para re-autorização do Google Calendar

const express = require('express');
const { google } = require('googleapis');
const { AdminAuthMiddleware } = require('../middleware/admin-auth');
const { supabaseAdmin } = require('../config/database');
const EncryptionService = require('../utils/encryption.service');

const router = express.Router();
const adminAuth = new AdminAuthMiddleware();
const encryption = new EncryptionService();

/**
 * Iniciar processo de re-autorização Google Calendar para profissional
 */
router.get('/professionals/:professionalId/google-calendar-reauth', adminAuth.verifyToken, async (req, res) => {
  try {
    const { professionalId } = req.params;
    const tenantId = req.admin?.tenantId || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Verificar se profissional pertence ao tenant
    const { data: professional, error } = await supabaseAdmin
      .from('professionals')
      .select('id, name, email, tenant_id')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !professional) {
      return res.status(404).json({ error: 'Professional not found' });
    }

    // Criar OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );

    // Gerar URL de autorização
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Força nova autorização
      state: JSON.stringify({
        professionalId,
        tenantId,
        action: 'reauth'
      })
    });

    res.json({
      success: true,
      authUrl,
      professional: {
        id: professional.id,
        name: professional.name,
        email: professional.email
      },
      message: 'Click the authorization URL to re-authorize Google Calendar access'
    });

  } catch (error) {
    console.error('Error initiating Google Calendar reauth:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Callback para processar autorização Google Calendar
 */
router.get('/google-calendar-callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing authorization code or state' });
    }

    let stateData;
    try {
      stateData = JSON.parse(state);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const { professionalId, tenantId } = stateData;

    // Criar OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );

    // Trocar código por tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Preparar credenciais para criptografia
    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date,
      provider: 'google'
    };

    // Criptografar credenciais
    const encryptedCredentials = await encryption.encryptCredentials(credentials);

    // Salvar no banco
    const { error: updateError } = await supabaseAdmin
      .from('professionals')
      .update({
        google_calendar_credentials: encryptedCredentials,
        updated_at: new Date().toISOString()
      })
      .eq('id', professionalId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new Error(`Failed to save credentials: ${updateError.message}`);
    }

    console.log(`✅ [CALENDAR] Re-authorized Google Calendar for professional ${professionalId}`);

    // Resposta de sucesso com redirect para frontend
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Calendar - Autorização Concluída</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; font-size: 18px; margin: 20px 0; }
            .button { background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>🎉 Autorização Concluída!</h1>
          <p class="success">Google Calendar foi autorizado com sucesso para este profissional.</p>
          <p>Agora é possível criar eventos no calendário automaticamente.</p>
          <a href="/professionals-standardized.html" class="button">Voltar para Profissionais</a>

          <script>
            // Auto-fechar janela após 3 segundos se foi aberta em popup
            if (window.opener) {
              setTimeout(() => {
                window.opener.location.reload();
                window.close();
              }, 3000);
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error processing Google Calendar callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Erro na Autorização</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>❌ Erro na Autorização</h1>
          <p>Houve um problema ao processar a autorização do Google Calendar.</p>
          <p style="color: red;">${error.message}</p>
          <a href="/professionals-standardized.html">Voltar para Profissionais</a>
        </body>
      </html>
    `);
  }
});

/**
 * Verificar status da autorização Google Calendar
 */
router.get('/professionals/:professionalId/google-calendar-status', adminAuth.verifyToken, async (req, res) => {
  try {
    const { professionalId } = req.params;
    const tenantId = req.admin?.tenantId || req.query.tenant_id;

    const { data: professional, error } = await supabaseAdmin
      .from('professionals')
      .select('google_calendar_credentials, google_calendar_id, name')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !professional) {
      return res.status(404).json({ error: 'Professional not found' });
    }

    const hasCredentials = !!professional.google_calendar_credentials;
    let credentialsValid = false;
    let tokenInfo = null;

    if (hasCredentials) {
      try {
        const decryptedCreds = await encryption.decryptCredentials(professional.google_calendar_credentials);
        credentialsValid = !!(decryptedCreds.access_token && decryptedCreds.refresh_token);

        tokenInfo = {
          hasAccessToken: !!decryptedCreds.access_token,
          hasRefreshToken: !!decryptedCreds.refresh_token,
          expiryDate: decryptedCreds.expiry_date,
          scope: decryptedCreds.scope
        };
      } catch (error) {
        console.error('Error decrypting credentials:', error);
      }
    }

    res.json({
      professionalId,
      name: professional.name,
      calendarId: professional.google_calendar_id,
      hasCredentials,
      credentialsValid,
      tokenInfo,
      status: credentialsValid ? 'authorized' : 'needs_authorization'
    });

  } catch (error) {
    console.error('Error checking Google Calendar status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;