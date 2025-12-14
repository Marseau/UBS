/**
 * GOOGLE OAUTH SERVICE
 *
 * Serviço para gerenciar autenticação OAuth 2.0 do Google Calendar
 * por campanha AIC.
 *
 * Funcionalidades:
 * - Gerar URL de autenticação OAuth
 * - Processar callback OAuth e salvar credenciais
 * - Refresh de access tokens
 * - Validação de tokens
 * - Revogação de acesso
 */

import { google, Auth } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { encryptOAuthCredentials, decryptOAuthCredentials } from './encryption.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TIPOS
// ============================================================================

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface CampaignOAuthCredentials {
  id: string;
  campaign_id: string;
  google_client_id: string;
  google_calendar_id: string;
  oauth_status: 'pending' | 'active' | 'expired' | 'error' | 'revoked';
  access_token_expires_at?: string;
  // Credenciais descriptografadas
  decrypted: {
    client_secret?: string;
    refresh_token?: string;
    access_token?: string;
  };
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope: string;
}

// ============================================================================
// CONFIGURAÇÃO OAUTH
// ============================================================================

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

/**
 * Cria cliente OAuth2 do Google
 */
function createOAuth2Client(config: GoogleOAuthConfig): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

// ============================================================================
// GERAÇÃO DE URL DE AUTENTICAÇÃO
// ============================================================================

/**
 * Gera URL de autenticação OAuth do Google para uma campanha
 *
 * @param campaignId - ID da campanha AIC
 * @param config - Configuração OAuth (client_id, client_secret, redirect_uri)
 * @returns URL de autenticação para redirecionar o usuário
 */
export async function generateAuthUrl(
  campaignId: string,
  config: GoogleOAuthConfig
): Promise<string> {
  const oauth2Client = createOAuth2Client(config);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Obter refresh_token
    prompt: 'consent',      // Forçar tela de consentimento
    scope: SCOPES,
    state: campaignId       // Passar campaign_id no state para callback
  });

  console.log(`[GOOGLE OAUTH] URL de autenticação gerada para campanha ${campaignId}`);

  return authUrl;
}

// ============================================================================
// PROCESSAMENTO DO CALLBACK
// ============================================================================

/**
 * Processa callback OAuth e salva credenciais criptografadas
 *
 * @param code - Código de autorização recebido do Google
 * @param campaignId - ID da campanha (extraído do state)
 * @param config - Configuração OAuth
 * @returns Sucesso ou erro
 */
export async function handleOAuthCallback(
  code: string,
  campaignId: string,
  config: GoogleOAuthConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const oauth2Client = createOAuth2Client(config);

    // Trocar código por tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Tokens incompletos recebidos do Google');
    }

    // Criptografar credenciais sensíveis
    const encrypted = encryptOAuthCredentials({
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token
    });

    // Calcular data de expiração do access_token
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // 1 hora padrão

    // Salvar no banco
    const { error } = await supabase
      .from('campaign_google_calendar')
      .upsert({
        campaign_id: campaignId,
        google_client_id: config.clientId,
        google_client_secret: encrypted.encrypted_client_secret,
        google_refresh_token: encrypted.encrypted_refresh_token,
        google_access_token: encrypted.encrypted_access_token,
        access_token_expires_at: expiresAt.toISOString(),
        oauth_status: 'active',
        last_oauth_check_at: new Date().toISOString(),
        oauth_error_message: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'campaign_id'
      });

    if (error) {
      console.error('[GOOGLE OAUTH] Erro ao salvar credenciais:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ [GOOGLE OAUTH] Credenciais salvas para campanha ${campaignId}`);

    return { success: true };
  } catch (error: any) {
    console.error('[GOOGLE OAUTH] Erro no callback:', error.message);

    // Salvar erro no banco
    await supabase
      .from('campaign_google_calendar')
      .upsert({
        campaign_id: campaignId,
        oauth_status: 'error',
        oauth_error_message: error.message,
        last_oauth_check_at: new Date().toISOString()
      }, {
        onConflict: 'campaign_id'
      });

    return { success: false, error: error.message };
  }
}

// ============================================================================
// BUSCA DE CREDENCIAIS
// ============================================================================

/**
 * Busca credenciais OAuth de uma campanha e descriptografa
 *
 * @param campaignId - ID da campanha
 * @returns Credenciais descriptografadas ou null
 */
export async function getCampaignOAuthCredentials(
  campaignId: string
): Promise<CampaignOAuthCredentials | null> {
  const { data, error } = await supabase
    .from('campaign_google_calendar')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();

  if (error || !data) {
    console.log(`[GOOGLE OAUTH] Nenhuma credencial encontrada para campanha ${campaignId}`);
    return null;
  }

  // Descriptografar credenciais sensíveis
  const decrypted = decryptOAuthCredentials({
    encrypted_client_secret: data.google_client_secret,
    encrypted_refresh_token: data.google_refresh_token,
    encrypted_access_token: data.google_access_token
  });

  return {
    id: data.id,
    campaign_id: data.campaign_id,
    google_client_id: data.google_client_id,
    google_calendar_id: data.google_calendar_id,
    oauth_status: data.oauth_status,
    access_token_expires_at: data.access_token_expires_at,
    decrypted
  };
}

// ============================================================================
// REFRESH DE TOKENS
// ============================================================================

/**
 * Verifica se access token está expirado
 */
function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true;

  const now = new Date();
  const expiry = new Date(expiresAt);

  // Considerar expirado se faltam menos de 5 minutos
  const bufferMs = 5 * 60 * 1000;
  return expiry.getTime() - now.getTime() < bufferMs;
}

/**
 * Atualiza access token usando refresh token
 *
 * @param campaignId - ID da campanha
 * @returns Novo access token ou erro
 */
export async function refreshAccessToken(
  campaignId: string
): Promise<{ success: boolean; access_token?: string; error?: string }> {
  try {
    const credentials = await getCampaignOAuthCredentials(campaignId);

    if (!credentials || !credentials.decrypted.refresh_token) {
      return { success: false, error: 'Refresh token não encontrado' };
    }

    const oauth2Client = createOAuth2Client({
      clientId: credentials.google_client_id,
      clientSecret: credentials.decrypted.client_secret!,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI!
    });

    // Configurar refresh token
    oauth2Client.setCredentials({
      refresh_token: credentials.decrypted.refresh_token
    });

    // Solicitar novo access token
    const { credentials: newTokens } = await oauth2Client.refreshAccessToken();

    if (!newTokens.access_token) {
      throw new Error('Novo access token não recebido');
    }

    // Criptografar novo access token
    const encrypted = encryptOAuthCredentials({
      access_token: newTokens.access_token
    });

    // Atualizar no banco
    const expiresAt = newTokens.expiry_date
      ? new Date(newTokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await supabase
      .from('campaign_google_calendar')
      .update({
        google_access_token: encrypted.encrypted_access_token,
        access_token_expires_at: expiresAt.toISOString(),
        oauth_status: 'active',
        last_oauth_check_at: new Date().toISOString(),
        oauth_error_message: null
      })
      .eq('campaign_id', campaignId);

    console.log(`✅ [GOOGLE OAUTH] Access token atualizado para campanha ${campaignId}`);

    return { success: true, access_token: newTokens.access_token };
  } catch (error: any) {
    console.error('[GOOGLE OAUTH] Erro ao fazer refresh:', error.message);

    // Marcar como expirado no banco
    await supabase
      .from('campaign_google_calendar')
      .update({
        oauth_status: 'expired',
        oauth_error_message: error.message,
        last_oauth_check_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId);

    return { success: false, error: error.message };
  }
}

/**
 * Obtém access token válido (faz refresh se necessário)
 *
 * @param campaignId - ID da campanha
 * @returns Access token válido
 */
export async function getValidAccessToken(
  campaignId: string
): Promise<string | null> {
  const credentials = await getCampaignOAuthCredentials(campaignId);

  if (!credentials) {
    console.log(`[GOOGLE OAUTH] Credenciais não encontradas para campanha ${campaignId}`);
    return null;
  }

  // Verificar se token está expirado
  if (isTokenExpired(credentials.access_token_expires_at)) {
    console.log(`[GOOGLE OAUTH] Token expirado, fazendo refresh...`);
    const result = await refreshAccessToken(campaignId);
    return result.access_token || null;
  }

  return credentials.decrypted.access_token || null;
}

// ============================================================================
// VALIDAÇÃO E STATUS
// ============================================================================

/**
 * Verifica status da autenticação OAuth de uma campanha
 *
 * @param campaignId - ID da campanha
 * @returns Status da OAuth
 */
export async function checkOAuthStatus(
  campaignId: string
): Promise<{
  configured: boolean;
  status: 'pending' | 'active' | 'expired' | 'error' | 'revoked';
  needs_reauth: boolean;
  error_message?: string;
}> {
  const credentials = await getCampaignOAuthCredentials(campaignId);

  if (!credentials) {
    return {
      configured: false,
      status: 'pending',
      needs_reauth: true
    };
  }

  const needsReauth = credentials.oauth_status !== 'active' ||
                      isTokenExpired(credentials.access_token_expires_at);

  return {
    configured: true,
    status: credentials.oauth_status,
    needs_reauth: needsReauth,
    error_message: undefined
  };
}

// ============================================================================
// REVOGAÇÃO
// ============================================================================

/**
 * Revoga acesso OAuth de uma campanha
 *
 * @param campaignId - ID da campanha
 * @returns Sucesso ou erro
 */
export async function revokeOAuthAccess(
  campaignId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = await getCampaignOAuthCredentials(campaignId);

    if (!credentials) {
      return { success: false, error: 'Credenciais não encontradas' };
    }

    // Tentar revogar no Google
    if (credentials.decrypted.access_token) {
      const oauth2Client = createOAuth2Client({
        clientId: credentials.google_client_id,
        clientSecret: credentials.decrypted.client_secret!,
        redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI!
      });

      oauth2Client.setCredentials({
        access_token: credentials.decrypted.access_token
      });

      await oauth2Client.revokeCredentials();
    }

    // Atualizar status no banco
    await supabase
      .from('campaign_google_calendar')
      .update({
        oauth_status: 'revoked',
        google_access_token: null,
        access_token_expires_at: null,
        last_oauth_check_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId);

    console.log(`✅ [GOOGLE OAUTH] Acesso revogado para campanha ${campaignId}`);

    return { success: true };
  } catch (error: any) {
    console.error('[GOOGLE OAUTH] Erro ao revogar acesso:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const googleOAuthService = {
  generateAuthUrl,
  handleOAuthCallback,
  getCampaignOAuthCredentials,
  refreshAccessToken,
  getValidAccessToken,
  checkOAuthStatus,
  revokeOAuthAccess
};

export default googleOAuthService;
