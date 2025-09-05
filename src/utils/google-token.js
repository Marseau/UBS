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

  // Se não tem refresh_token, não dá pra renovar
  if (!creds.refresh_token) {
    console.warn(`⚠️ Profissional ${professionalId} sem refresh_token — não é possível renovar access_token`);
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

  // 4) Decidir se precisa renovar
  const now = Date.now();
  const exp = typeof creds.expiry_date === 'number' ? creds.expiry_date : 0;
  const needsRefresh = !creds.access_token || !exp || (exp - now) < 2 * 60 * 1000; // < 2 min

  if (!needsRefresh) {
    return { refreshed: false };
  }

  // 5) Renovar (getAccessToken aciona refresh se necessário)
  try {
    const tokenResponse = await oauth2.getAccessToken();
    const newAccessToken = tokenResponse?.token;

    // Pegar credenciais internas do client (com expiry atualizado)
    const updated = oauth2.credentials;

    // Se veio token novo, salvar
    if (newAccessToken || updated?.expiry_date) {
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
        return { refreshed: false };
      }

      console.log(`✅ Token Google renovado p/ profissional ${professionalId}`);
      return { refreshed: true };
    }

    return { refreshed: false };
  } catch (e) {
    console.error('❌ Erro ao renovar access_token Google:', e);
    return { refreshed: false };
  }
}

module.exports = { ensureFreshGoogleToken };