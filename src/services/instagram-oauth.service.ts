/**
 * Instagram OAuth Service
 *
 * Implementa o fluxo OAuth do Facebook/Instagram para obter acesso
 * à Instagram Graph API de forma segura e em conformidade com ToS.
 *
 * Fluxo:
 * 1. Cliente clica "Conectar Instagram"
 * 2. Redireciona para Facebook Login
 * 3. Cliente autoriza permissões
 * 4. Callback recebe code
 * 5. Troca code por access_token
 * 6. Obtém Instagram Business Account ID
 * 7. Salva tokens no banco (criptografados)
 *
 * Documentação: https://developers.facebook.com/docs/instagram-api/getting-started
 */

import axios from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface InstagramOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface InstagramAccount {
  id: string;
  instagram_business_account_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  page_id: string;
  page_name: string;
  access_token: string;
  token_expires_at?: Date;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

// ============================================================================
// INSTAGRAM OAUTH SERVICE
// ============================================================================

export class InstagramOAuthService {
  private supabase: SupabaseClient;
  private config: InstagramOAuthConfig;
  private encryptionKey: string;

  // Permissões necessárias para Instagram Graph API
  private readonly SCOPES = [
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'business_management'
  ];

  constructor() {
    this.config = {
      appId: process.env.META_APP_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      redirectUri: process.env.META_OAUTH_REDIRECT_URI || ''
    };

    this.encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY || 'default-key-change-in-production';

    if (!this.config.appId || !this.config.appSecret) {
      console.warn('[InstagramOAuth] META_APP_ID ou META_APP_SECRET não configurados');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  // ==========================================================================
  // FLUXO OAUTH
  // ==========================================================================

  /**
   * Gera URL de autorização do Facebook
   * Cliente será redirecionado para esta URL
   */
  generateAuthorizationUrl(campaignId: string): string {
    const state = this.generateState(campaignId);

    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      scope: this.SCOPES.join(','),
      response_type: 'code',
      state: state
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Gera state seguro para prevenir CSRF
   * Inclui campaignId criptografado
   */
  private generateState(campaignId: string): string {
    const data = {
      campaignId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return encrypted;
  }

  /**
   * Decodifica state e extrai campaignId
   */
  parseState(state: string): { campaignId: string; timestamp: number } | null {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(state, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);

      // Verificar se state não expirou (15 minutos)
      if (Date.now() - data.timestamp > 15 * 60 * 1000) {
        console.error('[InstagramOAuth] State expirado');
        return null;
      }

      return data;
    } catch (error) {
      console.error('[InstagramOAuth] Erro ao decodificar state:', error);
      return null;
    }
  }

  /**
   * Troca authorization code por access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse | null> {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          redirect_uri: this.config.redirectUri,
          code: code
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao trocar code por token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Obtém long-lived token (60 dias) a partir do short-lived
   */
  async getLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse | null> {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao obter long-lived token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Obtém lista de Facebook Pages do usuário
   */
  async getUserPages(accessToken: string): Promise<FacebookPage[]> {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}'
        }
      });

      return response.data.data || [];
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao obter pages:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Processa callback do OAuth e salva conta Instagram
   */
  async processOAuthCallback(code: string, state: string): Promise<{
    success: boolean;
    account?: InstagramAccount;
    error?: string;
  }> {
    // 1. Validar state e extrair campaignId
    const stateData = this.parseState(state);
    if (!stateData) {
      return { success: false, error: 'State inválido ou expirado' };
    }

    const { campaignId } = stateData;

    // 2. Trocar code por short-lived token
    const shortLivedToken = await this.exchangeCodeForToken(code);
    if (!shortLivedToken) {
      return { success: false, error: 'Erro ao obter access token' };
    }

    // 3. Obter long-lived token (60 dias)
    const longLivedToken = await this.getLongLivedToken(shortLivedToken.access_token);
    if (!longLivedToken) {
      return { success: false, error: 'Erro ao obter long-lived token' };
    }

    // 4. Obter Facebook Pages com Instagram Business Account
    const pages = await this.getUserPages(longLivedToken.access_token);

    // 5. Encontrar page com Instagram Business Account
    const pageWithInstagram = pages.find(page => page.instagram_business_account);

    if (!pageWithInstagram || !pageWithInstagram.instagram_business_account) {
      return {
        success: false,
        error: 'Nenhuma conta Instagram Business encontrada. Certifique-se de que sua conta Instagram está convertida para Business/Creator e conectada a uma Facebook Page.'
      };
    }

    const igAccount = pageWithInstagram.instagram_business_account;

    // 6. Salvar no banco de dados
    const account: InstagramAccount = {
      id: igAccount.id,
      instagram_business_account_id: igAccount.id,
      username: igAccount.username || '',
      name: igAccount.name,
      profile_picture_url: igAccount.profile_picture_url,
      page_id: pageWithInstagram.id,
      page_name: pageWithInstagram.name,
      access_token: pageWithInstagram.access_token, // Page access token para API calls
      token_expires_at: new Date(Date.now() + (longLivedToken.expires_in || 5184000) * 1000)
    };

    // Salvar conta no banco
    const saveResult = await this.saveInstagramAccount(campaignId, account);

    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, account };
  }

  /**
   * Salva conta Instagram no banco de dados
   */
  async saveInstagramAccount(campaignId: string, account: InstagramAccount): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Criptografar access_token antes de salvar
      const encryptedToken = this.encryptToken(account.access_token);

      // Verificar se já existe conta para esta campanha
      const { data: existing } = await this.supabase
        .from('instagram_accounts')
        .select('id')
        .eq('campaign_id', campaignId)
        .single();

      const accountData = {
        campaign_id: campaignId,
        instagram_business_account_id: account.instagram_business_account_id,
        instagram_username: account.username,
        account_name: account.name || account.username,
        profile_picture_url: account.profile_picture_url,
        page_id: account.page_id,
        page_name: account.page_name,
        access_token_encrypted: encryptedToken,
        token_expires_at: account.token_expires_at?.toISOString(),
        status: 'active',
        auth_method: 'oauth',
        updated_at: new Date().toISOString()
      };

      if (existing) {
        // Atualizar existente
        const { error } = await this.supabase
          .from('instagram_accounts')
          .update(accountData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Inserir nova
        const { error } = await this.supabase
          .from('instagram_accounts')
          .insert({
            ...accountData,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      console.log(`[InstagramOAuth] Conta @${account.username} salva para campanha ${campaignId}`);

      return { success: true };
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao salvar conta:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtém conta Instagram de uma campanha (descriptografa token)
   */
  async getInstagramAccount(campaignId: string): Promise<InstagramAccount | null> {
    try {
      const { data, error } = await this.supabase
        .from('instagram_accounts')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .single();

      if (error || !data) return null;

      // Descriptografar token
      const accessToken = this.decryptToken(data.access_token_encrypted);

      return {
        id: data.id,
        instagram_business_account_id: data.instagram_business_account_id,
        username: data.instagram_username,
        name: data.account_name,
        profile_picture_url: data.profile_picture_url,
        page_id: data.page_id,
        page_name: data.page_name,
        access_token: accessToken,
        token_expires_at: data.token_expires_at ? new Date(data.token_expires_at) : undefined
      };
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao obter conta:', error);
      return null;
    }
  }

  /**
   * Verifica status da conta Instagram (token válido, etc.)
   */
  async checkAccountStatus(campaignId: string): Promise<{
    connected: boolean;
    username?: string;
    profile_picture_url?: string;
    expires_at?: Date;
    error?: string;
  }> {
    const account = await this.getInstagramAccount(campaignId);

    if (!account) {
      return { connected: false };
    }

    // Verificar se token expirou
    if (account.token_expires_at && account.token_expires_at < new Date()) {
      return {
        connected: false,
        error: 'Token expirado. Reconecte sua conta Instagram.'
      };
    }

    // Verificar se token ainda é válido com uma chamada à API
    try {
      const response = await axios.get(`https://graph.facebook.com/v18.0/${account.instagram_business_account_id}`, {
        params: {
          fields: 'username,name,profile_picture_url',
          access_token: account.access_token
        }
      });

      return {
        connected: true,
        username: response.data.username || account.username,
        profile_picture_url: response.data.profile_picture_url || account.profile_picture_url,
        expires_at: account.token_expires_at
      };
    } catch (error: any) {
      console.error('[InstagramOAuth] Token inválido:', error.response?.data || error.message);

      // Marcar conta como inativa
      await this.supabase
        .from('instagram_accounts')
        .update({ status: 'token_invalid' })
        .eq('campaign_id', campaignId);

      return {
        connected: false,
        error: 'Token inválido. Reconecte sua conta Instagram.'
      };
    }
  }

  /**
   * Desconecta conta Instagram (remove do banco)
   */
  async disconnectAccount(campaignId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('instagram_accounts')
        .update({
          status: 'disconnected',
          access_token_encrypted: null,
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // CRIPTOGRAFIA DE TOKENS
  // ==========================================================================

  private encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;

      const iv = Buffer.from(ivHex!, 'hex');
      const authTag = Buffer.from(authTagHex!, 'hex');
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted!, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[InstagramOAuth] Erro ao descriptografar token:', error);
      return '';
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instagramOAuthInstance: InstagramOAuthService | null = null;

export function getInstagramOAuthService(): InstagramOAuthService {
  if (!instagramOAuthInstance) {
    instagramOAuthInstance = new InstagramOAuthService();
  }
  return instagramOAuthInstance;
}

export default InstagramOAuthService;
