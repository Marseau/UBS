/**
 * Instagram OAuth Service
 *
 * Implementa o fluxo OAuth do Instagram Business Login para obter acesso
 * à Instagram Graph API de forma segura e em conformidade com ToS.
 *
 * Fluxo (Instagram Business Login - Lançado Julho 2024):
 * 1. Cliente clica "Conectar Instagram"
 * 2. Redireciona para Instagram Login (não Facebook)
 * 3. Cliente autoriza permissões
 * 4. Callback recebe code
 * 5. Troca code por access_token (short-lived)
 * 6. Troca por long-lived token (60 dias)
 * 7. Obtém dados da conta Instagram
 * 8. Salva tokens no banco (criptografados)
 *
 * Documentação: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
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
  // Métricas (opcional, populado durante OAuth)
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  user_id?: number;
  permissions?: string[];
  token_type?: string;
  expires_in?: number;
}

export interface InstagramUserProfile {
  id: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

// ============================================================================
// INSTAGRAM OAUTH SERVICE (Instagram Business Login)
// ============================================================================

export class InstagramOAuthService {
  private supabase: SupabaseClient;
  private config: InstagramOAuthConfig;
  private encryptionKey: string;

  // Permissões para Instagram Business Login
  // Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
  private readonly SCOPES = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish'
  ];

  constructor() {
    // Usar Instagram App ID e Secret (não Facebook)
    this.config = {
      appId: process.env.INSTAGRAM_APP_ID || '',
      appSecret: process.env.INSTAGRAM_APP_SECRET || '',
      redirectUri: process.env.META_OAUTH_REDIRECT_URI || ''
    };

    this.encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY || 'default-key-change-in-production';

    if (!this.config.appId || !this.config.appSecret) {
      console.warn('[InstagramOAuth] INSTAGRAM_APP_ID ou INSTAGRAM_APP_SECRET não configurados');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  // ==========================================================================
  // FLUXO OAUTH (Instagram Business Login)
  // ==========================================================================

  /**
   * Gera URL de autorização do Instagram
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

    // Instagram Business Login usa www.instagram.com/oauth/authorize
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
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

    // Gerar IV aleatório de 16 bytes
    const iv = crypto.randomBytes(16);
    // Garantir que a chave tem 32 bytes (AES-256)
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Concatenar IV + encrypted (IV em hex para facilitar parsing)
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decodifica state e extrai campaignId
   */
  parseState(state: string): { campaignId: string; timestamp: number } | null {
    try {
      // Separar IV e dados criptografados
      const [ivHex, encrypted] = state.split(':');
      if (!ivHex || !encrypted) {
        console.error('[InstagramOAuth] State inválido: formato incorreto');
        return null;
      }

      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
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
   * Troca authorization code por access token (short-lived)
   * Instagram usa POST com form-urlencoded (diferente do Facebook)
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse | null> {
    try {
      console.log('[InstagramOAuth] Trocando code por token...');

      // Instagram token endpoint usa POST com form data
      const params = new URLSearchParams({
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
        code: code
      });

      const response = await axios.post(
        'https://api.instagram.com/oauth/access_token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('[InstagramOAuth] Token obtido com sucesso, user_id:', response.data.user_id);

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao trocar code por token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Obtém long-lived token (60 dias) a partir do short-lived
   * Para Instagram, usa endpoint diferente do Facebook
   */
  async getLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse | null> {
    try {
      console.log('[InstagramOAuth] Obtendo long-lived token...');

      const response = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: this.config.appSecret,
          access_token: shortLivedToken
        }
      });

      console.log('[InstagramOAuth] Long-lived token obtido, expira em:', response.data.expires_in, 'segundos');

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao obter long-lived token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Refresh do long-lived token (antes de expirar)
   */
  async refreshLongLivedToken(longLivedToken: string): Promise<OAuthTokenResponse | null> {
    try {
      const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: longLivedToken
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao refresh token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Obtém perfil do usuário Instagram
   */
  async getUserProfile(accessToken: string, userId?: string): Promise<InstagramUserProfile | null> {
    try {
      const id = userId || 'me';
      const response = await axios.get(`https://graph.instagram.com/v21.0/${id}`, {
        params: {
          fields: 'id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count',
          access_token: accessToken
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao obter perfil:', error.response?.data || error.message);
      return null;
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
    console.log(`[InstagramOAuth] Processando callback para campanha: ${campaignId}`);

    // 2. Trocar code por short-lived token
    const shortLivedToken = await this.exchangeCodeForToken(code);
    if (!shortLivedToken) {
      return { success: false, error: 'Erro ao obter access token' };
    }

    // 3. Obter long-lived token (60 dias)
    const longLivedToken = await this.getLongLivedToken(shortLivedToken.access_token);
    if (!longLivedToken) {
      // Se falhar, usar o short-lived mesmo (1 hora)
      console.warn('[InstagramOAuth] Usando short-lived token como fallback');
    }

    const finalToken = longLivedToken?.access_token || shortLivedToken.access_token;
    const expiresIn = longLivedToken?.expires_in || 3600; // 1 hora se short-lived

    // 4. Obter perfil do usuário Instagram (usar 'me' para Instagram Business Login)
    const profile = await this.getUserProfile(finalToken);
    if (!profile) {
      return { success: false, error: 'Erro ao obter perfil do Instagram' };
    }

    console.log(`[InstagramOAuth] Perfil obtido: @${profile.username} (${profile.followers_count || 0} seguidores)`);

    // 5. Montar objeto da conta (incluindo métricas)
    const account: InstagramAccount = {
      id: profile.id,
      instagram_business_account_id: profile.id,
      username: profile.username,
      name: profile.name,
      profile_picture_url: profile.profile_picture_url,
      page_id: profile.id, // Para Instagram Business Login, não há Facebook Page
      page_name: profile.name || profile.username,
      access_token: finalToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000),
      // Métricas do perfil
      followers_count: profile.followers_count,
      follows_count: profile.follows_count,
      media_count: profile.media_count
    };

    // 6. Salvar conta no banco
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
        auth_method: 'instagram_business_login', // Novo método
        updated_at: new Date().toISOString(),
        // Métricas iniciais (baseline)
        followers_count: account.followers_count,
        follows_count: account.follows_count,
        media_count: account.media_count,
        metrics_updated_at: new Date().toISOString(),
        followers_count_baseline: account.followers_count,
        baseline_recorded_at: new Date().toISOString()
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

      // Registrar métrica inicial se temos followers_count
      if (account.followers_count !== undefined) {
        // Buscar ID da conta recém-salva
        const { data: savedAccount } = await this.supabase
          .from('instagram_accounts')
          .select('id')
          .eq('campaign_id', campaignId)
          .single();

        if (savedAccount) {
          const { error: metricError } = await this.supabase.rpc('record_instagram_metrics', {
            p_account_id: savedAccount.id,
            p_followers_count: account.followers_count,
            p_follows_count: account.follows_count || null,
            p_media_count: account.media_count || null,
            p_source: 'oauth_callback'
          });

          if (metricError) {
            console.warn(`[InstagramOAuth] Erro ao registrar métrica inicial: ${metricError.message}`);
          } else {
            console.log(`[InstagramOAuth] Métrica inicial registrada: ${account.followers_count} seguidores`);
          }
        }
      }

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
      const profile = await this.getUserProfile(account.access_token);

      if (!profile) {
        throw new Error('Não foi possível obter perfil');
      }

      return {
        connected: true,
        username: profile.username || account.username,
        profile_picture_url: profile.profile_picture_url || account.profile_picture_url,
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
  // MÉTRICAS E TRACKING DE FOLLOWERS
  // ==========================================================================

  /**
   * Atualiza métricas de uma conta Instagram via API
   * Chamado por job periódico (ex: diário via N8N)
   */
  async refreshAccountMetrics(campaignId: string): Promise<{
    success: boolean;
    followers_count?: number;
    followers_delta?: number;
    error?: string;
  }> {
    try {
      // 1. Obter conta com token
      const account = await this.getInstagramAccount(campaignId);
      if (!account) {
        return { success: false, error: 'Conta Instagram não encontrada' };
      }

      // 2. Buscar perfil atualizado da API
      const profile = await this.getUserProfile(account.access_token);
      if (!profile) {
        return { success: false, error: 'Erro ao obter perfil da API' };
      }

      // 3. Buscar ID da conta no banco
      const { data: dbAccount } = await this.supabase
        .from('instagram_accounts')
        .select('id, followers_count')
        .eq('campaign_id', campaignId)
        .single();

      if (!dbAccount) {
        return { success: false, error: 'Conta não encontrada no banco' };
      }

      const previousCount = dbAccount.followers_count || 0;
      const currentCount = profile.followers_count || 0;
      const delta = currentCount - previousCount;

      // 4. Registrar métrica via RPC
      const { error: metricError } = await this.supabase.rpc('record_instagram_metrics', {
        p_account_id: dbAccount.id,
        p_followers_count: currentCount,
        p_follows_count: profile.follows_count || null,
        p_media_count: profile.media_count || null,
        p_source: 'api_refresh'
      });

      if (metricError) {
        console.error(`[InstagramOAuth] Erro ao registrar métrica: ${metricError.message}`);
        return { success: false, error: metricError.message };
      }

      console.log(`[InstagramOAuth] Métricas atualizadas para @${account.username}: ${currentCount} seguidores (${delta >= 0 ? '+' : ''}${delta})`);

      return {
        success: true,
        followers_count: currentCount,
        followers_delta: delta
      };
    } catch (error: any) {
      console.error('[InstagramOAuth] Erro ao atualizar métricas:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Atualiza métricas de todas as contas ativas
   * Filtra apenas campanhas com status 'active' ou 'test'
   * Retorna resumo das atualizações
   */
  async refreshAllAccountsMetrics(): Promise<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    results: Array<{
      campaign_id: string;
      campaign_name: string;
      campaign_status: string;
      username: string;
      followers_count?: number;
      followers_delta?: number;
      error?: string;
      skipped?: boolean;
    }>;
  }> {
    // Buscar todas as contas ativas com campanhas ativas ou em teste
    const { data: accounts, error } = await this.supabase
      .from('instagram_accounts')
      .select(`
        campaign_id,
        instagram_username,
        cluster_campaigns!inner (
          campaign_name,
          status
        )
      `)
      .eq('status', 'active')
      .not('access_token_encrypted', 'is', null)
      .in('cluster_campaigns.status', ['active', 'test']);

    if (error || !accounts) {
      console.error('[InstagramOAuth] Erro ao buscar contas:', error);
      return { total: 0, success: 0, failed: 0, skipped: 0, results: [] };
    }

    const results: Array<{
      campaign_id: string;
      campaign_name: string;
      campaign_status: string;
      username: string;
      followers_count?: number;
      followers_delta?: number;
      error?: string;
      skipped?: boolean;
    }> = [];

    let successCount = 0;
    let failedCount = 0;

    for (const account of accounts) {
      const campaignData = account.cluster_campaigns as any;
      const campaignStatus = campaignData?.status || 'unknown';

      const refreshResult = await this.refreshAccountMetrics(account.campaign_id);

      results.push({
        campaign_id: account.campaign_id,
        campaign_name: campaignData?.campaign_name || 'Unknown',
        campaign_status: campaignStatus,
        username: account.instagram_username,
        followers_count: refreshResult.followers_count,
        followers_delta: refreshResult.followers_delta,
        error: refreshResult.error
      });

      if (refreshResult.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Rate limit: esperar 1s entre requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[InstagramOAuth] Refresh completo: ${successCount}/${accounts.length} contas atualizadas (campanhas ativas/teste)`);

    return {
      total: accounts.length,
      success: successCount,
      failed: failedCount,
      skipped: 0, // Todas as contas retornadas já são de campanhas ativas/teste
      results
    };
  }

  /**
   * Obtém histórico de métricas de uma campanha
   */
  async getMetricsHistory(campaignId: string, days: number = 30): Promise<{
    success: boolean;
    history?: Array<{
      recorded_date: string;
      followers_count: number;
      follows_count: number;
      followers_delta: number;
      cumulative_followers_delta: number;
    }>;
    error?: string;
  }> {
    try {
      const { data, error } = await this.supabase.rpc('get_instagram_metrics_history', {
        p_campaign_id: campaignId,
        p_days: days
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, history: data || [] };
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

export function resetInstagramOAuthService(): void {
  instagramOAuthInstance = null;
}

export default InstagramOAuthService;
