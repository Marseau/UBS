// src/utils/google-token.js
const { google } = require('googleapis');
const { supabaseAdmin } = require('../config/database');
const EncryptionService = require('../utils/encryption.service');

const encryption = new EncryptionService();

/**
 * Garante que o profissional tenha um access_token válido.
 * - Lê credenciais (criptografadas) do profissional
 * - Descriptografa
 * - Se expirado ou ausente, renova via refresh_token
 * - Salva de volta (criptografado) se houver mudança
 *
 * @param {{ professionalId: string }} params
 * @returns {Promise<{ refreshed: boolean }>}
 */
async function ensureFreshGoogleToken({ professionalId }) {
  if (!professionalId) return { refreshed: false };

  // 1) Buscar credenciais do profissional
  const { data: prof, error } = await supabaseAdmin
    .from('professionals')
    .select('google_calendar_credentials')
    .eq('id', professionalId)
    .single();

  if (error || !prof || !prof.google_calendar_credentials) {
    console.warn(`⚠️ Sem credenciais Google para o profissional ${professionalId}`);
    return { refreshed: false };
  }

  // 2) Descriptografar
  let creds;
  try {
    creds = await encryption.decryptCredentials(prof.google_calendar_credentials);
  } catch (e) {
    console.error('❌ Falha ao descriptografar credenciais do Google:', e);
    return { refreshed: false };
  }


  // 3) Criar OAuth2 client
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );

  oauth2.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date: creds.expiry_date,
    token_type: creds.token_type,
    scope: creds.scope,
  });

  // 4) Validar token atual antes de decidir se precisa renovar
  const now = Date.now();
  const exp = typeof creds.expiry_date === 'number' ? creds.expiry_date : 0;
  const isTokenExpired = !creds.access_token || !exp || (exp - now) < 2 * 60 * 1000; // < 2 min

  // 4.1) Testar se o token atual ainda funciona (mesmo se não expirado)
  if (!isTokenExpired && creds.access_token) {
    try {
      const isValid = await validateGoogleToken(creds.access_token);
      if (isValid) {
        console.log(`✅ [TOKEN] Token válido para profissional ${professionalId}, não precisa renovar`);
        return { refreshed: false, valid: true };
      } else {
        console.log(`⚠️ [TOKEN] Token inválido para profissional ${professionalId}, forçando refresh`);
      }
    } catch (error) {
      console.log(`⚠️ [TOKEN] Erro ao validar token para profissional ${professionalId}, forçando refresh:`, error.message);
    }
  }

  // Se token expirado ou inválido, tentar refresh
  console.log(`🔄 [TOKEN] Iniciando refresh para profissional ${professionalId}`);

  if (!creds.refresh_token) {
    console.warn(`⚠️ Profissional ${professionalId} sem refresh_token — não é possível renovar access_token`);
    return { refreshed: false, error: 'no_refresh_token', needsReauth: true };
  }

  // 5) Renovar (getAccessToken aciona refresh se necessário)
  try {
    const tokenResponse = await oauth2.getAccessToken();
    const newAccessToken = tokenResponse?.token;

    // Pegar credenciais internas do client (com expiry atualizado)
    const updated = oauth2.credentials;

    // 5.1) Validar o novo token antes de salvar
    let tokenValidationResult = false;
    if (newAccessToken) {
      try {
        tokenValidationResult = await validateGoogleToken(newAccessToken);
        console.log(`🧪 [TOKEN] Novo token validation result para ${professionalId}:`, tokenValidationResult);
      } catch (error) {
        console.error(`❌ [TOKEN] Erro ao validar novo token para ${professionalId}:`, error);
      }
    }

    // Se veio token novo, validar antes de salvar
    if (newAccessToken || updated?.expiry_date) {
      // Validar novo token se houver
      if (newAccessToken && !tokenValidationResult) {
        console.error(`❌ [TOKEN] Novo token inválido para profissional ${professionalId}, não salvando`);
        return { refreshed: false, valid: false, error: 'new_token_invalid' };
      }

      const merged = {
        ...creds,
        access_token: updated.access_token || newAccessToken || creds.access_token,
        expiry_date: updated.expiry_date || creds.expiry_date,
        token_type: updated.token_type || creds.token_type,
        scope: updated.scope || creds.scope,
        refresh_token: creds.refresh_token, // preserva
      };

      const encrypted = await encryption.encryptCredentials(merged);

      const { error: upErr } = await supabaseAdmin
        .from('professionals')
        .update({ google_calendar_credentials: encrypted })
        .eq('id', professionalId);

      if (upErr) {
        console.error('❌ Falha ao salvar credenciais renovadas:', upErr);
        return { refreshed: false, valid: false, error: 'save_failed' };
      }

      console.log(`✅ Token Google renovado e validado p/ profissional ${professionalId}`);
      return { refreshed: true, valid: tokenValidationResult || true };
    }

    return { refreshed: false };
  } catch (e) {
    console.error('❌ Erro ao renovar access_token Google:', e.message);
    console.error('📋 Detalhes completos do erro:', e);

    // Verificar se é erro de grant inválido
    if (e.message && e.message.includes('invalid_grant')) {
      console.error('🚨 INVALID_GRANT: Refresh token expirado ou inválido');
      console.error('💡 Solução: Usuário precisa refazer autorização OAuth2');
      return { refreshed: false, error: 'invalid_grant', needsReauth: true };
    }

    return { refreshed: false, error: e.message };
  }
}

/**
 * Valida se um access token do Google é válido fazendo uma chamada leve à API
 * @param {string} accessToken
 * @returns {Promise<boolean>}
 */
async function validateGoogleToken(accessToken) {
  try {
    // Fazer uma chamada leve para validar o token
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken);

    if (response.ok) {
      const tokenInfo = await response.json();

      // Verificar se o token tem os scopes necessários
      const requiredScope = 'https://www.googleapis.com/auth/calendar';
      const hasCalendarScope = tokenInfo.scope && tokenInfo.scope.includes(requiredScope);

      if (!hasCalendarScope) {
        console.warn('⚠️ [TOKEN] Token não tem scope de calendar:', tokenInfo.scope);
        return false;
      }

      // Verificar se o token não está expirado
      const expiresIn = parseInt(tokenInfo.expires_in || '0');
      if (expiresIn <= 60) { // Menos de 1 minuto
        console.warn('⚠️ [TOKEN] Token expira em menos de 1 minuto:', expiresIn);
        return false;
      }

      console.log('✅ [TOKEN] Token válido, expira em:', expiresIn, 'segundos');
      return true;
    } else {
      console.warn('⚠️ [TOKEN] Token inválido, response status:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ [TOKEN] Erro ao validar token:', error);
    return false;
  }
}

/**
 * Valida completamente as credenciais do Google para um profissional
 * Inclui validação de token e teste de acesso ao Calendar API
 * @param {string} professionalId
 * @returns {Promise<{valid: boolean, error?: string, details?: object}>}
 */
async function validateProfessionalGoogleCredentials(professionalId) {
  try {
    // 1) Buscar credenciais
    const { data: prof, error } = await supabaseAdmin
      .from('professionals')
      .select('google_calendar_credentials, google_calendar_id')
      .eq('id', professionalId)
      .single();

    if (error || !prof || !prof.google_calendar_credentials) {
      return { valid: false, error: 'no_credentials' };
    }

    // 2) Descriptografar
    let creds;
    try {
      creds = await encryption.decryptCredentials(prof.google_calendar_credentials);
    } catch (e) {
      return { valid: false, error: 'decrypt_failed' };
    }

    // 3) Validar token
    if (!creds.access_token) {
      return { valid: false, error: 'no_access_token' };
    }

    const tokenValid = await validateGoogleToken(creds.access_token);
    if (!tokenValid) {
      return { valid: false, error: 'invalid_token' };
    }

    // 4) Testar acesso ao Calendar API
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        process.env.GOOGLE_CALENDAR_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: creds.access_token,
        refresh_token: creds.refresh_token
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Fazer uma chamada leve ao Calendar API
      const calendarId = prof.google_calendar_id || 'primary';
      const response = await calendar.calendars.get({ calendarId });

      if (response.status === 200) {
        return {
          valid: true,
          details: {
            calendarId,
            calendarName: response.data.summary,
            tokenExpiresIn: creds.expiry_date
          }
        };
      } else {
        return { valid: false, error: 'calendar_api_failed', details: { status: response.status } };
      }
    } catch (apiError) {
      console.error('❌ [TOKEN] Calendar API test failed:', apiError);
      return { valid: false, error: 'calendar_api_error', details: { message: apiError.message } };
    }

  } catch (error) {
    console.error('❌ [TOKEN] Validation error:', error);
    return { valid: false, error: 'validation_failed', details: { message: error.message } };
  }
}

module.exports = {
  ensureFreshGoogleToken,
  validateGoogleToken,
  validateProfessionalGoogleCredentials
};