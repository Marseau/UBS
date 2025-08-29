// src/utils/google-token.js
const { google } = require('googleapis');
const { supabaseAdmin } = require('../config/database');
const EncryptionService = require('../utils/encryption.service');

const encryption = new EncryptionService();

/**
 * Garante access_token fresco via refresh_token antes de chamar o Calendar.
 * Atualiza o JSON criptografado no banco se houver mudança.
 * @param {{ professionalId: string }} params
 */
async function ensureFreshGoogleToken({ professionalId }) {
  if (!professionalId) return { refreshed: false };

  // 1) Buscar credenciais criptografadas
  const { data: prof, error } = await supabaseAdmin
    .from('professionals')
    .select('google_calendar_credentials')
    .eq('id', professionalId)
    .single();

  if (error || !prof || !prof.google_calendar_credentials) {
    console.warn(`⚠️ Sem credenciais Google para profissional ${professionalId}`);
    return { refreshed: false };
  }

  // 2) Descriptografar
  let creds;
  try {
    creds = await encryption.decryptCredentials(prof.google_calendar_credentials);
  } catch (e) {
    console.error('❌ Falha ao descriptografar credenciais Google:', e);
    return { refreshed: false };
  }

  if (!creds.refresh_token) {
    console.warn(`⚠️ Profissional ${professionalId} sem refresh_token; não dá para atualizar access_token`);
    return { refreshed: false };
  }

  // 3) OAuth2 client
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

  // 4) Ver se precisa refresh (faltando ou expira em < 2min)
  const now = Date.now();
  const exp = typeof creds.expiry_date === 'number' ? creds.expiry_date : 0;
  const needsRefresh = !creds.access_token || !exp || (exp - now) < 2 * 60 * 1000;

  if (!needsRefresh) return { refreshed: false };

  try {
    const tokenResponse = await oauth2.getAccessToken(); // dispara refresh quando necessário
    const updated = oauth2.credentials;
    const newAccessToken = tokenResponse?.token || updated?.access_token;

    if (newAccessToken || updated?.expiry_date) {
      const merged = {
        ...creds,
        access_token: newAccessToken || creds.access_token,
        expiry_date: updated?.expiry_date || creds.expiry_date,
        token_type: updated?.token_type || creds.token_type,
        scope: updated?.scope || creds.scope,
        refresh_token: creds.refresh_token, // manter
      };

      const encrypted = await encryption.encryptCredentials(merged);

      const { error: upErr } = await supabaseAdmin
        .from('professionals')
        .update({ google_calendar_credentials: encrypted })
        .eq('id', professionalId);

      if (upErr) {
        console.error('❌ Falha ao salvar credenciais atualizadas:', upErr);
        return { refreshed: false };
      }

      console.log(`✅ Access token Google atualizado para profissional ${professionalId}`);
      return { refreshed: true };
    }

    return { refreshed: false };
  } catch (e) {
    console.error('❌ Erro ao atualizar access_token do Google:', e);
    return { refreshed: false };
  }
}

module.exports = { ensureFreshGoogleToken };