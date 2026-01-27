/**
 * CAMPAIGN CREDENTIALS ROUTES
 *
 * Rotas para gerenciar credenciais de campanhas:
 * - WhatsApp Sessions (QR Code, status)
 * - Instagram Accounts (credenciais criptografadas)
 * - Campaign activation
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { credentialsVault } from '../services/credentials-vault.service';
import { whatsappSessionManager } from '../services/whatsapp-session-manager.service';
import {
  authenticateAIC,
  optionalAuthAIC,
  checkCampaignAccess,
  requireCampaignAccess,
  AuthenticatedRequest
} from '../middleware/aic-auth.middleware';
import { clientJourneyService } from '../services/client-journey.service';
import { getWhapiPartnerService } from '../services/whapi-partner.service';
import { campaignDocumentProcessor, DocumentUpload } from '../services/campaign-document-processor.service';

const router = Router();

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// WHATSAPP SESSIONS
// ============================================================================

/**
 * POST /api/whatsapp/sessions
 * Cria uma nova sessao WhatsApp para uma campanha
 */
router.post('/whatsapp/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, sessionName } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Criar sessao
    const session = await whatsappSessionManager.createSession(
      campaignId,
      sessionName || campaign.campaign_name
    );

    res.json({
      id: session.id,
      campaignId: session.campaignId,
      sessionName: session.sessionName,
      status: session.status
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error creating WhatsApp session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whatsapp/sessions/:sessionId/qr
 * Gera QR Code para uma sessao
 */
router.post('/whatsapp/sessions/:sessionId/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const result = await whatsappSessionManager.startSessionAndGetQR(sessionId);

    if (result.qrCode === '') {
      // Ja estava conectado
      res.json({ connected: true, message: 'Already connected' });
    } else {
      res.json({
        qrCode: result.qrCode,
        expiresAt: result.expiresAt
      });
    }
  } catch (error: any) {
    console.error('[Campaign Credentials] Error generating QR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whatsapp/sessions/:sessionId/status
 * Retorna status atual da sessao
 */
router.get('/whatsapp/sessions/:sessionId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const status = await whatsappSessionManager.getSessionStatus(sessionId);

    if (!status) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(status);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting session status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whatsapp/sessions/campaign/:campaignId
 * Busca sessao por campaign ID
 */
router.get('/whatsapp/sessions/campaign/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    const session = await whatsappSessionManager.getSessionByCampaign(campaignId);

    if (!session) {
      res.status(404).json({ error: 'No session found for this campaign' });
      return;
    }

    const status = await whatsappSessionManager.getSessionStatus(session.id);
    res.json(status);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting campaign session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/whatsapp/sessions/:sessionId
 * Fecha uma sessao
 */
router.delete('/whatsapp/sessions/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    await whatsappSessionManager.closeSession(sessionId);

    res.json({ success: true, message: 'Session closed' });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error closing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WHAPI CHANNELS (CANAIS CENTRALIZADOS)
// ============================================================================

/**
 * GET /api/whapi/channels
 * Lista todos os canais Whapi disponíveis
 */
router.get('/whapi/channels', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: channels, error } = await supabase
      .from('whapi_channels')
      .select('id, name, channel_id, phone_number, status, rate_limit_hourly, rate_limit_daily, warmup_mode, last_connected_at')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: channels || [] });
  } catch (error: any) {
    console.error('[Whapi Channels] Error listing channels:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/channels
 * Cria ou atualiza um canal Whapi
 */
router.post('/whapi/channels', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, channelId, phoneNumber, apiToken, rateLimitHourly, rateLimitDaily } = req.body;

    if (!apiToken) {
      res.status(400).json({ error: 'apiToken is required' });
      return;
    }

    // Verificar se canal já existe pelo token
    const { data: existing } = await supabase
      .from('whapi_channels')
      .select('id')
      .eq('api_token', apiToken)
      .single();

    if (existing) {
      // Atualizar existente
      const { data: updated, error } = await supabase
        .from('whapi_channels')
        .update({
          name: name || null,
          channel_id: channelId || null,
          phone_number: phoneNumber || null,
          rate_limit_hourly: rateLimitHourly || 15,
          rate_limit_daily: rateLimitDaily || 120,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data: updated, created: false });
    } else {
      // Criar novo
      const { data: created, error } = await supabase
        .from('whapi_channels')
        .insert({
          name: name || 'Canal Whapi',
          channel_id: channelId || null,
          phone_number: phoneNumber || null,
          api_token: apiToken,
          rate_limit_hourly: rateLimitHourly || 15,
          rate_limit_daily: rateLimitDaily || 120,
          status: 'disconnected'
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data: created, created: true });
    }
  } catch (error: any) {
    console.error('[Whapi Channels] Error creating/updating channel:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/channels/:channelId/qr
 * Gera QR Code para conectar um canal Whapi
 */
router.post('/whapi/channels/:channelId/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId } = req.params;

    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' });
      return;
    }

    // Buscar canal em whapi_channels
    const { data: channel, error: channelError } = await supabase
      .from('whapi_channels')
      .select('id, channel_id, api_token, status')
      .eq('id', channelId)
      .single();

    if (channelError || !channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    if (!channel.api_token) {
      res.status(400).json({ error: 'Channel has no API token configured' });
      return;
    }

    // Criar cliente Whapi com o token do canal
    const { default: WhapiClientService } = await import('../services/whapi-client.service');
    const whapiClient = new WhapiClientService({
      token: channel.api_token,
      channelId: channel.channel_id || undefined
    });

    // Obter QR Code
    const qrCode = await whapiClient.getQRCode();

    if (!qrCode) {
      // Se nao tem QR, pode ja estar conectado
      const channelInfo = await whapiClient.getChannelInfo();
      if (channelInfo?.status === 'connected') {
        // Atualizar status
        await supabase
          .from('whapi_channels')
          .update({
            status: 'active',
            last_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', channelId);

        res.json({ connected: true, message: 'Channel already connected' });
        return;
      }

      res.status(500).json({ error: 'Could not generate QR Code' });
      return;
    }

    // Salvar QR no banco
    await supabase
      .from('whapi_channels')
      .update({
        qr_code_data: qrCode,
        qr_code_generated_at: new Date().toISOString(),
        status: 'disconnected', // Aguardando scan
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId);

    res.json({
      qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`,
      expiresIn: 60 // segundos
    });
  } catch (error: any) {
    console.error('[Whapi Channels] Error generating QR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/channels/:channelId/status
 * Verifica status da conexao de um canal Whapi
 */
router.get('/whapi/channels/:channelId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId } = req.params;

    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' });
      return;
    }

    // Buscar canal
    const { data: channel, error: channelError } = await supabase
      .from('whapi_channels')
      .select('id, channel_id, api_token, status, phone_number')
      .eq('id', channelId)
      .single();

    if (channelError || !channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    if (!channel.api_token) {
      res.json({ status: 'not_configured', connected: false });
      return;
    }

    // Verificar status via API Whapi
    const { default: WhapiClientService } = await import('../services/whapi-client.service');
    const whapiClient = new WhapiClientService({
      token: channel.api_token,
      channelId: channel.channel_id || undefined
    });

    const channelInfo = await whapiClient.getChannelInfo();
    const isConnected = channelInfo?.status === 'connected';

    // Atualizar status no banco se mudou
    if (isConnected && channel.status !== 'active') {
      await supabase
        .from('whapi_channels')
        .update({
          status: 'active',
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', channelId);
    }

    res.json({
      status: isConnected ? 'active' : channel.status || 'disconnected',
      connected: isConnected,
      phone_number: channel.phone_number,
      channelInfo: channelInfo || null
    });
  } catch (error: any) {
    console.error('[Whapi Channels] Error checking status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// INSTAGRAM ACCOUNTS
// ============================================================================

/**
 * POST /api/instagram/accounts
 * Cria conta Instagram com credenciais criptografadas
 */
router.post('/instagram/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, accountName, username, password } = req.body;

    // Validacao
    if (!campaignId || !accountName || !username || !password) {
      res.status(400).json({
        error: 'Missing required fields: campaignId, accountName, username, password'
      });
      return;
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Verificar se ja existe conta para esta campanha
    const { data: existing } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'active')
      .single();

    if (existing) {
      res.status(409).json({
        error: 'An active Instagram account already exists for this campaign'
      });
      return;
    }

    // Criar conta com credenciais criptografadas
    const result = await credentialsVault.createInstagramAccount(
      campaignId,
      accountName,
      username,
      password,
      'api-onboarding' // accessor for audit log
    );

    if (!result.success || !result.accountId) {
      res.status(500).json({ error: result.error || 'Failed to create account' });
      return;
    }

    // Buscar conta criada para retornar dados
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id, campaign_id, account_name, instagram_username, status')
      .eq('id', result.accountId)
      .single();

    res.json({
      id: account?.id || result.accountId,
      campaignId: account?.campaign_id || campaignId,
      accountName: account?.account_name || accountName,
      username: account?.instagram_username || username,
      status: account?.status || 'pending_verification',
      message: 'Credentials encrypted and saved successfully'
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error creating Instagram account:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/instagram/accounts/campaign/:campaignId
 * Busca conta Instagram por campaign ID (sem expor credenciais)
 */
router.get('/instagram/accounts/campaign/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    const { data: account, error } = await supabase
      .from('instagram_accounts')
      .select(`
        id,
        campaign_id,
        account_name,
        instagram_username,
        status,
        last_login_at,
        total_dms_sent,
        total_follows,
        total_unfollows,
        created_at
      `)
      .eq('campaign_id', campaignId)
      .not('status', 'in', '("disabled","permanently_blocked")')
      .single();

    if (error || !account) {
      res.status(404).json({ error: 'No Instagram account found for this campaign' });
      return;
    }

    res.json(account);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting Instagram account:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/instagram/accounts/:accountId/rate-limits
 * Verifica rate limits da conta
 */
router.get('/instagram/accounts/:accountId/rate-limits', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;

    const { data, error } = await supabase.rpc('check_instagram_account_rate_limit', {
      p_account_id: accountId
    });

    if (error) {
      throw error;
    }

    res.json(data[0] || { error: 'Account not found' });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error checking rate limits:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/instagram/accounts/:accountId/user-id
 * Atualiza o instagram_user_id (Meta recipient_id) de uma conta
 * Usado para vincular o ID do Meta ao registro da conta
 */
router.patch('/instagram/accounts/:accountId/user-id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;
    const { instagramUserId } = req.body;

    if (!instagramUserId) {
      res.status(400).json({ error: 'instagramUserId is required' });
      return;
    }

    const { data, error } = await supabase
      .from('instagram_accounts')
      .update({
        instagram_user_id: instagramUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId)
      .select('id, campaign_id, instagram_username, instagram_user_id')
      .single();

    if (error) {
      console.error('[Instagram Accounts] Error updating user ID:', error);
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    console.log(`[Instagram Accounts] ✅ Updated instagram_user_id for ${data.instagram_username}: ${instagramUserId}`);

    res.json({
      success: true,
      message: 'Instagram user ID updated successfully',
      data: {
        accountId: data.id,
        campaignId: data.campaign_id,
        username: data.instagram_username,
        instagramUserId: data.instagram_user_id
      }
    });
  } catch (error: any) {
    console.error('[Instagram Accounts] Error updating user ID:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/instagram/accounts/by-username/:username/user-id
 * Atualiza o instagram_user_id buscando por username
 * Útil para auto-registro via webhook
 */
router.patch('/instagram/accounts/by-username/:username/user-id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;
    const { instagramUserId } = req.body;

    if (!username || !instagramUserId) {
      res.status(400).json({ error: 'username and instagramUserId are required' });
      return;
    }

    // Normalizar username (remover @ se existir)
    const normalizedUsername = username.replace(/^@/, '').toLowerCase();

    const { data, error } = await supabase
      .from('instagram_accounts')
      .update({
        instagram_user_id: instagramUserId,
        updated_at: new Date().toISOString()
      })
      .ilike('instagram_username', normalizedUsername)
      .select('id, campaign_id, instagram_username, instagram_user_id')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Instagram Accounts] Error updating user ID by username:', error);
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Account not found for this username' });
      return;
    }

    console.log(`[Instagram Accounts] ✅ Updated instagram_user_id for @${data.instagram_username}: ${instagramUserId}`);

    res.json({
      success: true,
      message: 'Instagram user ID updated successfully',
      data: {
        accountId: data.id,
        campaignId: data.campaign_id,
        username: data.instagram_username,
        instagramUserId: data.instagram_user_id
      }
    });
  } catch (error: any) {
    console.error('[Instagram Accounts] Error updating user ID by username:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/instagram/accounts/:accountId/status
 * Atualiza status da conta
 */
router.patch('/instagram/accounts/:accountId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;
    const { status, errorMessage } = req.body;

    const validStatuses = [
      'pending_verification', 'active', 'challenge_required',
      'session_expired', 'rate_limited', 'temporarily_blocked',
      'permanently_blocked', 'credentials_invalid', 'disabled'
    ];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (errorMessage) {
      updateData.last_error = errorMessage;
      updateData.last_error_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('instagram_accounts')
      .update(updateData)
      .eq('id', accountId);

    if (error) {
      throw error;
    }

    res.json({ success: true, status });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error updating account status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CAMPAIGNS
// ============================================================================

/**
 * GET /api/campaigns/available
 * Lista campanhas disponiveis para onboarding (sem credenciais configuradas)
 * Filtrada por user_id para usuarios normais; admin ve todas
 */
router.get('/campaigns/available', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Construir query base
    let query = supabase
      .from('cluster_campaigns')
      .select(`
        id,
        campaign_name,
        nicho_principal,
        business_name,
        cluster_status,
        created_at,
        user_id
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    // Filtrar por user_id se nao for admin
    if (req.userId && !req.isAdmin) {
      query = query.eq('user_id', req.userId);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      throw error;
    }

    // Verificar quais ja tem credenciais configuradas
    const campaignsWithStatus = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        // Check WhatsApp session
        const { data: waSession } = await supabase
          .from('whatsapp_sessions')
          .select('id, status')
          .eq('campaign_id', campaign.id)
          .eq('is_active', true)
          .single();

        // Check Instagram account
        const { data: igAccount } = await supabase
          .from('instagram_accounts')
          .select('id, status')
          .eq('campaign_id', campaign.id)
          .not('status', 'in', '("disabled","permanently_blocked")')
          .single();

        return {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          nicho_principal: campaign.nicho_principal,
          business_name: campaign.business_name,
          status: campaign.cluster_status,
          created_at: campaign.created_at,
          hasWhatsApp: !!waSession,
          whatsappStatus: waSession?.status || null,
          hasInstagram: !!igAccount,
          instagramStatus: igAccount?.status || null,
          needsOnboarding: !waSession && !igAccount
        };
      })
    );

    res.json(campaignsWithStatus);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error listing available campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId
 * Retorna dados da campanha
 * Verifica acesso baseado em user_id (admin ve todas)
 */
router.get('/campaigns/:campaignId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Construir query base
    let query = supabase
      .from('cluster_campaigns')
      .select(`
        id,
        campaign_name,
        nicho_principal,
        nicho_secundario,
        service_description,
        target_audience,
        cluster_status,
        business_name,
        created_at,
        user_id
      `)
      .eq('id', campaignId);

    // Filtrar por user_id se nao for admin
    if (req.userId && !req.isAdmin) {
      query = query.eq('user_id', req.userId);
    }

    const { data: campaign, error } = await query.single();

    if (error || !campaign) {
      console.error('[Campaign Credentials] Campaign fetch error:', error);
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Map cluster_status to status for frontend compatibility
    res.json({
      ...campaign,
      status: campaign.cluster_status
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/activate
 * Ativa a campanha apos configuracao usando a funcao SQL que atualiza os FKs
 * Permite acesso sem autenticacao para fluxo de onboarding do cliente
 */
router.post('/campaigns/:campaignId/activate', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar se campanha existe (permitir acesso sem auth para onboarding)
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const { whatsappSessionId, termsAccepted } = req.body;

    if (!termsAccepted) {
      res.status(400).json({ error: 'Terms must be accepted' });
      return;
    }

    // Buscar instagram_account_id se existir para esta campanha
    const { data: instagramAccount } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('campaign_id', campaignId)
      .not('status', 'in', '("disabled","permanently_blocked")')
      .single();

    // Usar funcao SQL que atualiza os FKs corretamente
    const { data: result, error: rpcError } = await supabase.rpc('activate_campaign_after_onboarding', {
      p_campaign_id: campaignId,
      p_whatsapp_session_id: whatsappSessionId || null,
      p_instagram_account_id: instagramAccount?.id || null,
      p_terms_accepted_by: null // TODO: pegar do auth context quando tiver
    });

    if (rpcError) {
      throw rpcError;
    }

    const activationResult = result?.[0];

    if (!activationResult?.success) {
      res.status(400).json({
        error: activationResult?.message || 'Failed to activate campaign'
      });
      return;
    }

    res.json({
      success: true,
      message: activationResult.message,
      campaignId: activationResult.campaign_id,
      channels: {
        whatsapp: activationResult.whatsapp_configured,
        instagram: activationResult.instagram_configured
      }
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error activating campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/credentials-status
 * Retorna status das credenciais configuradas
 * Verifica acesso a campanha
 */
router.get('/campaigns/:campaignId/credentials-status', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Check WhatsApp
    const waSession = await whatsappSessionManager.getSessionByCampaign(campaignId);
    let waStatus: any = null;
    if (waSession) {
      waStatus = await whatsappSessionManager.getSessionStatus(waSession.id);
    }

    // Check Instagram
    const { data: igAccount } = await supabase
      .from('instagram_accounts')
      .select('id, status, instagram_username, last_login_at')
      .eq('campaign_id', campaignId)
      .not('status', 'in', '("disabled","permanently_blocked")')
      .single();

    res.json({
      whatsapp: waStatus ? {
        configured: true,
        status: waStatus.status,
        connected: waStatus.isConnected,
        canSend: waStatus.canSend,
        dailyRemaining: waStatus.dailyRemaining
      } : {
        configured: false
      },
      instagram: igAccount ? {
        configured: true,
        status: igAccount.status,
        username: igAccount.instagram_username,
        lastLogin: igAccount.last_login_at
      } : {
        configured: false
      }
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting credentials status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CAMPAIGN BRIEFING
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/briefing
 * Retorna o briefing de uma campanha
 * Permite acesso sem autenticacao para fluxo de onboarding do cliente
 */
router.get('/campaigns/:campaignId/briefing', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar se campanha existe (permitir acesso sem auth para onboarding)
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const { data: briefing, error } = await supabase
      .from('campaign_briefing')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error for us)
      throw error;
    }

    if (!briefing) {
      // Mesmo sem briefing, calcular progresso baseado em LP processada
      const { data: completion } = await supabase.rpc('calculate_briefing_completion_by_campaign', {
        p_campaign_id: campaignId
      });
      res.json({ completion_percentage: completion || 0 });
      return;
    }

    res.json(briefing);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting briefing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Embeda o briefing como documento para RAG
 * Remove documento anterior e cria novo com dados atualizados
 */
async function embedBriefingForRAG(campaignId: string, briefing: any): Promise<void> {
  try {
    // 1. Remover documento de briefing anterior (se existir)
    await supabase
      .from('campaign_documents')
      .update({ is_active: false })
      .eq('campaign_id', campaignId)
      .eq('doc_type', 'briefing')
      .ilike('title', '%Briefing%');

    // 2. Verificar se há dados relevantes para embedar
    const hasContent = briefing.company_name || briefing.main_differentiator ||
                       briefing.icp_description || briefing.icp_main_pain ||
                       briefing.call_to_action || briefing.campaign_offer;

    if (!hasContent) {
      console.log(`[Briefing Embed] Sem conteúdo relevante para campanha ${campaignId}`);
      return;
    }

    // 3. Formatar briefing como documento estruturado
    const briefingContent = `
=== BRIEFING DA CAMPANHA ===

EMPRESA
- Nome: ${briefing.company_name || 'Não informado'}
- Principal Diferencial: ${briefing.main_differentiator || 'Não informado'}

PÚBLICO-ALVO (ICP)
- Perfil do Cliente Ideal: ${briefing.icp_description || 'Não informado'}
- Principal Dor/Problema: ${briefing.icp_main_pain || 'Não informado'}

CAMPANHA
- Objetivo: ${briefing.campaign_objective || 'Não informado'}
- Oferta Especial: ${briefing.campaign_offer || 'Não informado'}
- Call to Action (CTA): ${briefing.call_to_action || 'Não informado'}
- Link de Agendamento: ${briefing.calendar_link || 'Não informado'}

ARGUMENTAÇÃO
- Por que escolher você: ${briefing.why_choose_us || 'Não informado'}
- Principais Objeções: ${briefing.common_objections || 'Não informado'}
- Tom de Voz: ${briefing.tone_of_voice || 'Não informado'}

CONCORRÊNCIA
- Concorrentes: ${briefing.competitors || 'Não informado'}

Atualizado em: ${new Date().toLocaleDateString('pt-BR')}
    `.trim();

    console.log(`[Briefing Embed] Embedando briefing para campanha: ${campaignId}`);

    // 4. Embedar documento
    const embedResult = await campaignDocumentProcessor.processDocument({
      campaignId: campaignId,
      title: `Briefing da Campanha`,
      docType: 'briefing',
      content: briefingContent,
      metadata: {
        source: 'briefing_form',
        completion_percentage: briefing.completion_percentage || 0,
        updated_at: new Date().toISOString(),
      }
    });

    if (embedResult.success) {
      console.log(`[Briefing Embed] ✅ Sucesso: ${embedResult.chunksCreated} chunks, ${embedResult.totalTokens} tokens`);
    } else {
      console.error(`[Briefing Embed] ❌ Falha: ${embedResult.error}`);
    }
  } catch (error) {
    console.error('[Briefing Embed] Erro:', error);
    throw error;
  }
}

/**
 * POST /api/campaigns/:campaignId/briefing
 * Cria ou atualiza o briefing de uma campanha
 * Permite acesso sem autenticacao para fluxo de onboarding do cliente
 */
router.post('/campaigns/:campaignId/briefing', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    const briefingData = req.body;

    // Verificar se campanha existe (permitir acesso sem auth para onboarding)
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Remover campos que nao devem ser atualizados diretamente
    const {
      id,
      created_at,
      updated_at,
      approved_at,
      approved_by,
      completion_percentage,
      ...dataToSave
    } = briefingData;

    // Verificar se ja existe briefing
    const { data: existing } = await supabase
      .from('campaign_briefing')
      .select('id')
      .eq('campaign_id', campaignId)
      .single();

    let result;

    if (existing) {
      // Atualizar existente
      const { data, error } = await supabase
        .from('campaign_briefing')
        .update({
          ...dataToSave,
          briefing_status: dataToSave.main_differentiator ? 'in_progress' : 'draft'
        })
        .eq('campaign_id', campaignId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar novo
      const { data, error } = await supabase
        .from('campaign_briefing')
        .insert({
          campaign_id: campaignId,
          ...dataToSave,
          briefing_status: dataToSave.main_differentiator ? 'in_progress' : 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Calcular percentual de preenchimento
    if (result?.id) {
      const { data: completion } = await supabase.rpc('calculate_briefing_completion', {
        p_briefing_id: result.id
      });

      // Atualizar percentual e status se necessario
      const newStatus = completion >= 80 ? 'completed' : (completion >= 30 ? 'in_progress' : 'draft');

      await supabase
        .from('campaign_briefing')
        .update({
          completion_percentage: completion || 0,
          briefing_status: newStatus
        })
        .eq('id', result.id);

      result.completion_percentage = completion || 0;
      result.briefing_status = newStatus;

      // Se briefing >= 80%, atualizar jornada do cliente para briefing_completo
      if (completion >= 80) {
        const { data: journey } = await supabase
          .from('aic_client_journeys')
          .select('id, current_step, client_name, client_email')
          .eq('campaign_id', campaignId)
          .single();

        if (journey && journey.current_step === 'briefing_pendente') {
          await clientJourneyService.markBriefingComplete(journey.id);
          console.log(`[Campaign Credentials] Journey ${journey.id} updated to briefing_completo`);

          // Notificar admin via Telegram que briefing foi concluido
          try {
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
              const { data: campaign } = await supabase
                .from('cluster_campaigns')
                .select('campaign_name')
                .eq('id', campaignId)
                .single();

              const telegramMessage =
                `*BRIEFING CONCLUIDO - Pronto para Ativar*\n\n` +
                `Cliente: ${journey.client_name || 'N/A'}\n` +
                `Email: ${journey.client_email || 'N/A'}\n` +
                `Campanha: ${campaign?.campaign_name || campaignId}\n` +
                `Completude: ${completion}%\n\n` +
                `Acao: Revisar e ativar campanha`;

              await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: process.env.TELEGRAM_CHAT_ID,
                  text: telegramMessage,
                  parse_mode: 'Markdown'
                })
              });
              console.log(`[Campaign Credentials] Telegram notification sent for briefing completion`);
            }
          } catch (telegramError) {
            console.warn('[Campaign Credentials] Erro ao enviar notificacao Telegram:', telegramError);
          }
        }
      }
    }

    // Embedar briefing para RAG (em background, não bloqueia resposta)
    embedBriefingForRAG(campaignId, result).catch(err => {
      console.error('[Campaign Credentials] Erro ao embedar briefing (background):', err);
    });

    res.json({
      success: true,
      briefing: result,
      message: existing ? 'Briefing atualizado' : 'Briefing criado'
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error saving briefing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/briefing/context
 * Retorna o contexto formatado do briefing para uso pelo agente de IA
 * Verifica acesso a campanha
 */
router.get('/campaigns/:campaignId/briefing/context', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Usar funcao SQL que formata o briefing para o agente
    const { data, error } = await supabase.rpc('get_briefing_context_for_ai', {
      p_campaign_id: campaignId
    });

    if (error) {
      throw error;
    }

    res.json({
      context: data || 'Briefing nao encontrado para esta campanha.',
      campaignId
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting briefing context:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/briefing/ai-extract
 * Extrai campos do briefing usando IA a partir dos documentos da campanha
 * Usado para pré-preencher o formulário - cliente valida e ajusta
 */
router.post('/campaigns/:campaignId/briefing/ai-extract', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    console.log(`[AI Extract] Iniciando extração para campanha: ${campaignId}`);

    // Chamar o serviço de extração
    const result = await campaignDocumentProcessor.extractBriefingFields(campaignId);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error || 'Erro ao extrair campos do briefing'
      });
      return;
    }

    res.json({
      success: true,
      fields: result.fields,
      sources: result.sources,
      message: 'Campos extraídos com sucesso. Revise e ajuste conforme necessário.'
    });

  } catch (error: any) {
    console.error('[AI Extract] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/briefing/approve
 * Aprova o briefing de uma campanha
 * Verifica acesso a campanha
 */
router.patch('/campaigns/:campaignId/briefing/approve', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    const { approvedBy } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const { data, error } = await supabase
      .from('campaign_briefing')
      .update({
        briefing_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy || null
      })
      .eq('campaign_id', campaignId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      briefing: data,
      message: 'Briefing aprovado'
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error approving briefing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CAMPAIGN DOCUMENTS (RAG)
// ============================================================================

import { getLandingPageScraperService } from '../services/landing-page-scraper.service';
import multer from 'multer';

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Use PDF, DOCX, TXT ou MD.'));
    }
  }
});

/**
 * POST /api/campaigns/:campaignId/documents
 * Upload e processa um documento para RAG
 * Verifica acesso a campanha
 */
router.post('/campaigns/:campaignId/documents', optionalAuthAIC, upload.single('file'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    const { title, docType, content, sourceUrl } = req.body;

    // Validação
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess, campaign } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Preparar dados do documento
    const documentUpload: DocumentUpload = {
      campaignId,
      title,
      docType: docType || 'knowledge',
      sourceUrl: sourceUrl || undefined,
      metadata: {
        uploadedAt: new Date().toISOString(),
        campaignName: campaign.campaign_name
      }
    };

    // Se tem arquivo, usar buffer
    if (req.file) {
      documentUpload.fileBuffer = req.file.buffer;
      documentUpload.fileName = req.file.originalname;
    } else if (content) {
      // Se não tem arquivo, usar conteúdo de texto
      documentUpload.content = content;
    } else {
      res.status(400).json({ error: 'Either file or content is required' });
      return;
    }

    // Processar documento
    const result = await campaignDocumentProcessor.processDocument(documentUpload);

    if (!result.success) {
      res.status(500).json({
        error: result.error || 'Failed to process document',
        chunksCreated: result.chunksCreated
      });
      return;
    }

    res.json({
      success: true,
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      totalTokens: result.totalTokens,
      message: `Documento processado: ${result.chunksCreated} chunks criados`
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error uploading document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/global
 * Upload e processa um documento global (sem campanha específica)
 */
router.post('/documents/global', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, docType, content, sourceUrl } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const documentUpload: DocumentUpload = {
      campaignId: null, // Global
      title,
      docType: docType || 'knowledge',
      sourceUrl: sourceUrl || undefined,
      metadata: {
        uploadedAt: new Date().toISOString(),
        isGlobal: true
      }
    };

    if (req.file) {
      documentUpload.fileBuffer = req.file.buffer;
      documentUpload.fileName = req.file.originalname;
    } else if (content) {
      documentUpload.content = content;
    } else {
      res.status(400).json({ error: 'Either file or content is required' });
      return;
    }

    const result = await campaignDocumentProcessor.processDocument(documentUpload);

    if (!result.success) {
      res.status(500).json({
        error: result.error || 'Failed to process document',
        chunksCreated: result.chunksCreated
      });
      return;
    }

    res.json({
      success: true,
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      totalTokens: result.totalTokens,
      message: `Documento global processado: ${result.chunksCreated} chunks criados`
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error uploading global document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/documents
 * Lista documentos de uma campanha
 * Verifica acesso a campanha
 */
router.get('/campaigns/:campaignId/documents', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const documents = await campaignDocumentProcessor.listDocuments(campaignId);

    res.json({
      campaignId,
      documents,
      count: documents.length
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error listing documents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/global
 * Lista documentos globais
 */
router.get('/documents/global', async (req: Request, res: Response): Promise<void> => {
  try {
    const documents = await campaignDocumentProcessor.listDocuments(null);

    res.json({
      type: 'global',
      documents,
      count: documents.length
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error listing global documents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/documents/:title
 * Desativa um documento (soft delete)
 * Verifica acesso a campanha
 */
router.delete('/campaigns/:campaignId/documents/:title', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, title } = req.params;

    if (!campaignId || !title) {
      res.status(400).json({ error: 'campaignId and title are required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const decodedTitle = decodeURIComponent(title);
    const success = await campaignDocumentProcessor.deactivateDocument(decodedTitle, campaignId);

    if (!success) {
      res.status(500).json({ error: 'Failed to deactivate document' });
      return;
    }

    res.json({
      success: true,
      message: `Documento "${decodedTitle}" desativado`
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error deactivating document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/documents/:title/reprocess
 * Reprocessa um documento existente com novos parâmetros de chunking
 * Verifica acesso a campanha
 */
router.post('/campaigns/:campaignId/documents/:title/reprocess', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, title } = req.params;
    const { maxTokens, overlapTokens } = req.body;

    if (!campaignId || !title) {
      res.status(400).json({ error: 'campaignId and title are required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const decodedTitle = decodeURIComponent(title);
    const result = await campaignDocumentProcessor.reprocessDocument(
      decodedTitle,
      campaignId,
      {
        maxTokens: maxTokens || 500,
        overlapTokens: overlapTokens || 100
      }
    );

    if (!result.success) {
      res.status(500).json({
        error: result.error || 'Failed to reprocess document',
        chunksCreated: result.chunksCreated
      });
      return;
    }

    res.json({
      success: true,
      chunksCreated: result.chunksCreated,
      totalTokens: result.totalTokens,
      message: `Documento reprocessado: ${result.chunksCreated} chunks criados`
    });
  } catch (error: any) {
    console.error('[Campaign Documents] Error reprocessing document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/landing-page
 * Processa landing page: extrai conteudo e embeda para RAG
 */
router.post('/campaigns/:campaignId/landing-page', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { url } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    console.log(`[Landing Page] Processing: ${url} for campaign ${campaignId}`);

    const scraper = getLandingPageScraperService();
    const result = await scraper.processLandingPage(url, campaignId);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'Falha ao processar landing page',
        success: false
      });
      return;
    }

    // Salvar URL da landing page na campanha
    await supabase
      .from('cluster_campaigns')
      .update({ landing_page_url: url })
      .eq('id', campaignId);

    res.json({
      success: true,
      title: result.title,
      description: result.description,
      preview: result.content,
      chunksCreated: result.chunksCreated,
      message: `Landing page processada: ${result.chunksCreated} blocos criados`
    });

  } catch (error: any) {
    console.error('[Landing Page] Error processing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/landing-page/preview
 * Preview do conteudo da landing page sem embedar
 */
router.get('/campaigns/:campaignId/landing-page/preview', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { url } = req.query;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url query param is required' });
      return;
    }

    // Verificar acesso a campanha
    const { hasAccess } = await checkCampaignAccess(campaignId, req.userId, req.isAdmin || false);
    if (!hasAccess) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const scraper = getLandingPageScraperService();
    const content = await scraper.extractOnly(url as string);

    if (!content) {
      res.status(400).json({ error: 'Nao foi possivel extrair conteudo da URL' });
      return;
    }

    res.json({
      success: true,
      title: content.title,
      description: content.description,
      headings: content.headings.slice(0, 10),
      preview: content.fullText.substring(0, 1000)
    });

  } catch (error: any) {
    console.error('[Landing Page] Error previewing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * GET /api/aic/my-campaigns
 * Lista campanhas do usuario logado (ou todas para admin)
 * Filtrado por user_id para usuarios normais
 */
router.get('/aic/my-campaigns', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Construir query base
    let query = supabase
      .from('cluster_campaigns')
      .select(`
        id,
        campaign_name,
        project_id,
        status,
        pipeline_status,
        onboarding_status,
        nicho_principal,
        outreach_enabled,
        created_at,
        updated_at,
        user_id
      `)
      .order('created_at', { ascending: false });

    // Filtrar por user_id se nao for admin
    if (req.userId && !req.isAdmin) {
      query = query.eq('user_id', req.userId);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('[My Campaigns] Error fetching campaigns:', error);
      res.status(500).json({ error: 'Failed to fetch campaigns' });
      return;
    }

    // Enriquecer com métricas e client_name
    const enrichedCampaigns = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        // Buscar client_name do cluster_projects via project_id
        let clientName = null;
        if (campaign.project_id) {
          const { data: project } = await supabase
            .from('cluster_projects')
            .select('client_name')
            .eq('id', campaign.project_id)
            .single();
          clientName = project?.client_name || null;
        }

        // Count leads from campaign_leads (tabela correta AIC)
        const { count: leadsCount } = await supabase
          .from('campaign_leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        // Count documents
        const { count: docsCount } = await supabase
          .from('campaign_documents')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        // Calcular taxa de WhatsApp (leads com whatsapp_number)
        const { count: whatsappCount } = await supabase
          .from('campaign_leads')
          .select('id, instagram_leads!inner(whatsapp_number)', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .not('instagram_leads.whatsapp_number', 'is', null);

        const whatsappRate = leadsCount && leadsCount > 0
          ? ((whatsappCount || 0) / leadsCount * 100).toFixed(1)
          : '0';

        // Generate slug from campaign name
        const slug = campaign.campaign_name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        // Normalizar status para o frontend
        // Prioridade: usar a nova coluna 'status' se existir, senão derivar de pipeline_status
        const normalizeStatus = (status: string | null, pipelineStatus: string | null): string => {
          // Se temos a nova coluna status, usar diretamente
          if (status && ['draft', 'test', 'active', 'paused'].includes(status)) {
            return status;
          }
          // Fallback para derivar de pipeline_status (legado)
          if (!pipelineStatus) return 'draft';
          const activeStatuses = ['active', 'outreach_in_progress', 'ready_for_outreach', 'completed'];
          const pausedStatuses = ['paused', 'on_hold'];
          if (activeStatuses.includes(pipelineStatus)) return 'active';
          if (pausedStatuses.includes(pipelineStatus)) return 'paused';
          return 'draft';
        };

        return {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          client_name: clientName,
          project_id: campaign.project_id,
          status: normalizeStatus((campaign as any).status, campaign.pipeline_status),
          onboarding_status: campaign.onboarding_status || 'pending',
          nicho: campaign.nicho_principal || 'A definir',
          outreach_enabled: campaign.outreach_enabled || false,
          leads_count: leadsCount || 0,
          docs_count: docsCount || 0,
          whatsapp_rate: whatsappRate,
          slug: slug,
          created_at: campaign.created_at,
          updated_at: campaign.updated_at
        };
      })
    );

    res.json({
      success: true,
      campaigns: enrichedCampaigns
    });
  } catch (error: any) {
    console.error('[My Campaigns] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaign/:identifier
 * Busca campanha por slug ou UUID
 * Verifica acesso baseado em user_id (admin ve todas)
 */
router.get('/campaign/:identifier', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      res.status(400).json({ error: 'Campaign identifier is required' });
      return;
    }

    // Check if identifier is UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let campaign;

    if (isUUID) {
      // Search by ID - verificar acesso
      const { hasAccess, campaign: foundCampaign } = await checkCampaignAccess(identifier, req.userId, req.isAdmin || false);

      if (!hasAccess || !foundCampaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      campaign = foundCampaign;
    } else {
      // Search by slug (fuzzy match on campaign_name)
      let query = supabase
        .from('cluster_campaigns')
        .select('*');

      // Filtrar por user_id se nao for admin
      if (req.userId && !req.isAdmin) {
        query = query.eq('user_id', req.userId);
      }

      const { data: campaigns, error } = await query;

      if (error) {
        res.status(500).json({ error: 'Failed to search campaigns' });
        return;
      }

      // Find campaign with matching slug
      campaign = campaigns?.find(c => {
        const slug = c.campaign_name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        return slug === identifier;
      });

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
    }

    // Buscar client_name do projeto associado
    let clientName = null;
    if (campaign.project_id) {
      const { data: project } = await supabase
        .from('cluster_projects')
        .select('client_name')
        .eq('id', campaign.project_id)
        .single();
      clientName = project?.client_name || null;
    }

    res.json({
      success: true,
      campaign: {
        ...campaign,
        client_name: clientName
      }
    });
  } catch (error: any) {
    console.error('[Campaign Lookup] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/create
 * Cria uma nova campanha AIC
 * Integra com a hierarquia: Cliente -> Projeto (cluster_projects) -> Campanha (cluster_campaigns)
 * Associa automaticamente ao user_id do usuario logado
 */
router.post('/campaigns/create', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      objective,
      // Dados do cliente
      client_contact_name,
      client_email,
      client_whatsapp_number,
      client_document,
      client_document_type,
      client_address,
      client_city,
      client_state,
      client_source,
      client_pain_point,
      // Dados do negócio
      business_name,
      business_type,
      project_name
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Campaign name is required' });
      return;
    }

    // Map objective to description
    const objectiveMap: Record<string, string> = {
      lead_generation: 'Geracao de Leads',
      brand_awareness: 'Brand Awareness',
      engagement: 'Engajamento',
      sales: 'Vendas Diretas'
    };

    // Normalizar documento (remover pontuação)
    const cleanDocument = client_document
      ? client_document.replace(/[^\d]/g, '')
      : null;

    // =====================================================================
    // INTEGRAR COM HIERARQUIA: cluster_projects -> cluster_campaigns
    // =====================================================================
    let projectId: string | null = null;
    const clientName = client_contact_name || business_name || 'Cliente Anônimo';
    const projName = project_name || name; // Se não houver nome do projeto, usar nome da campanha

    // Verificar se já existe um projeto para esse cliente
    const { data: existingProject } = await supabase
      .from('cluster_projects')
      .select('id')
      .eq('client_name', clientName)
      .eq('project_name', projName)
      .single();

    if (existingProject) {
      // Projeto já existe, usar o ID
      projectId = existingProject.id;
      console.log(`[Create Campaign] Using existing project: ${projectId}`);
    } else {
      // Criar novo projeto
      const { data: newProject, error: projectError } = await supabase
        .from('cluster_projects')
        .insert({
          client_name: clientName,
          client_email: client_email || null,
          project_name: projName,
          status: 'active',
          metadata: {
            business_type: business_type,
            client_city: client_city,
            client_state: client_state,
            client_document: cleanDocument,
            client_pain_point: client_pain_point
          }
        })
        .select()
        .single();

      if (projectError) {
        console.error('[Create Campaign] Error creating project:', projectError);
        // Continuar sem projeto se houver erro (não bloquear criação da campanha)
      } else {
        projectId = newProject.id;
        console.log(`[Create Campaign] Created new project: ${projectId} - ${projName}`);
      }
    }

    // Create campaign with correct AIC fields + client data + project_id + user_id
    const { data: campaign, error } = await supabase
      .from('cluster_campaigns')
      .insert({
        campaign_name: name,
        project_id: projectId, // Vincular ao projeto
        user_id: req.userId || null, // Vincular ao usuario logado
        nicho_principal: 'a definir',
        keywords: [],
        service_description: objectiveMap[objective] || 'A definir durante briefing',
        target_audience: 'A definir durante briefing',
        onboarding_status: 'pending',
        pipeline_status: 'draft',
        outreach_enabled: false,
        description: `Campanha: ${name} | Objetivo: ${objectiveMap[objective] || objective || 'A definir'}`,
        // Dados do cliente
        client_contact_name: client_contact_name || null,
        client_email: client_email || null,
        client_whatsapp_number: client_whatsapp_number || null,
        client_document: cleanDocument,
        client_document_type: client_document_type || 'cnpj',
        client_address: client_address || {},
        client_city: client_city || null,
        client_state: client_state || null,
        client_source: client_source || 'dashboard',
        client_pain_point: client_pain_point || null,
        // Dados do negócio
        business_name: business_name || null,
        business_type: business_type || null,
        project_name: project_name || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error || !campaign) {
      console.error('[Create Campaign] Supabase error:', error);
      res.status(500).json({ error: 'Failed to create campaign', details: error?.message });
      return;
    }

    console.log(`[Create Campaign] Success: ${campaign.id} - ${name} (project: ${projectId})`);

    // Criar briefing vazio automaticamente para a campanha
    const { data: briefing, error: briefingError } = await supabase
      .from('campaign_briefing')
      .insert({
        campaign_id: campaign.id,
        company_name: business_name || client_contact_name || null,
        briefing_status: 'draft',
        completion_percentage: 0
      })
      .select()
      .single();

    if (briefingError) {
      console.error('[Create Campaign] Error creating briefing:', briefingError);
      // Não bloquear - briefing pode ser criado depois
    } else {
      console.log(`[Create Campaign] Briefing created: ${briefing.id}`);
    }

    res.json({
      success: true,
      campaign: campaign,
      project_id: projectId,
      briefing_id: briefing?.id || null,
      message: 'Campaign created successfully'
    });
  } catch (error: any) {
    console.error('[Create Campaign] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/campaigns/:id/status
 * Atualiza o status de uma campanha AIC (active/test/paused/draft)
 *
 * Status disponíveis:
 * - draft: Campanha em rascunho, não processa mensagens
 * - test: Modo teste - redireciona mensagens para contas de teste hardcoded
 * - active: Campanha ativa em produção
 * - paused: Campanha pausada temporariamente
 */
router.patch('/campaigns/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      res.status(400).json({ error: 'Campaign ID is required' });
      return;
    }

    const validStatuses = ['active', 'test', 'paused', 'draft'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `Valid status is required: ${validStatuses.join(', ')}` });
      return;
    }

    // Update campaign status using the new unified status column
    // - status: new enum column (draft, test, active, paused)
    // - pipeline_status: legacy field (kept for backwards compatibility)
    // - outreach_enabled: derived from status (active or test)
    // Mapping: active/test → outreach_in_progress, paused → outreach_paused, draft → draft
    const pipelineStatusMap: Record<string, string> = {
      active: 'outreach_in_progress',
      test: 'outreach_in_progress',
      paused: 'outreach_paused',
      draft: 'draft'
    };
    const { data: campaign, error } = await supabase
      .from('cluster_campaigns')
      .update({
        status: status,
        pipeline_status: pipelineStatusMap[status] || 'draft',
        outreach_enabled: status === 'active' || status === 'test',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !campaign) {
      console.error('[Update Status] Error:', error);
      res.status(500).json({ error: 'Failed to update campaign status' });
      return;
    }

    const statusLabels: Record<string, string> = {
      active: 'ativa',
      test: 'em modo teste',
      paused: 'pausada',
      draft: 'em rascunho'
    };
    console.log(`[Update Status] Campaign ${id} -> ${status} (${statusLabels[status]})`);

    res.json({
      success: true,
      campaign: campaign,
      message: `Campaign status updated to ${status}`,
      test_mode: status === 'test'
    });
  } catch (error: any) {
    console.error('[Update Status] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/analytics
 * Retorna dados de analytics de uma campanha (para os gráficos)
 */
router.get('/campaigns/:id/analytics', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'Campaign ID is required' });
      return;
    }

    // Get leads history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: leads, error } = await supabase
      .from('aic_leads')
      .select('created_at')
      .eq('campaign_id', id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Campaign Analytics] Error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
      return;
    }

    // Group by day
    const dailyLeads: { [key: string]: number } = {};
    (leads || []).forEach(lead => {
      const date = new Date(lead.created_at).toLocaleDateString('pt-BR');
      dailyLeads[date] = (dailyLeads[date] || 0) + 1;
    });

    // Get last 7 days data
    const last7Days = Array.from({length: 7}, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toLocaleDateString('pt-BR');
    });

    const chartData = last7Days.map(date => ({
      date: date,
      leads: dailyLeads[date] || 0
    }));

    res.json({
      success: true,
      analytics: {
        last7Days: chartData,
        totalLeads: leads?.length || 0
      }
    });
  } catch (error: any) {
    console.error('[Campaign Analytics] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CONSULTANT INFO (Quem assume leads quentes)
// ============================================================================

/**
 * PUT /api/campaigns/:campaignId/client-contact
 * Salva dados do consultor (quem recebe notificação e assume leads quentes)
 * Aceita tanto os nomes antigos (clientContactName) quanto novos (consultantName) para compatibilidade
 */
router.put('/campaigns/:campaignId/client-contact', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    // Aceita tanto nomes antigos quanto novos para compatibilidade
    const consultantName = req.body.consultantName || req.body.clientContactName;
    const consultantPhone = req.body.consultantPhone || req.body.clientWhatsappNumber;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    if (!consultantName || !consultantPhone) {
      res.status(400).json({ error: 'consultantName and consultantPhone are required' });
      return;
    }

    // Validar formato do número de WhatsApp
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]+$/;
    if (!phoneRegex.test(consultantPhone)) {
      res.status(400).json({ error: 'Invalid WhatsApp number format' });
      return;
    }

    // Atualizar campanha com dados do consultor
    const { data, error } = await supabase
      .from('cluster_campaigns')
      .update({
        consultant_name: consultantName,
        consultant_phone: consultantPhone,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) {
      console.error('[Consultant Info] Update error:', error);
      res.status(500).json({ error: 'Failed to save consultant information' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Consultant information saved successfully',
      data: {
        consultantName: data.consultant_name,
        consultantPhone: data.consultant_phone,
        // Manter compatibilidade com UI antiga
        clientContactName: data.consultant_name,
        clientWhatsappNumber: data.consultant_phone
      }
    });

  } catch (error: any) {
    console.error('[Consultant Info] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// LEAD HANDOFFS & BILLING
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/lead-handoffs
 * Retorna relatório de leads quentes transferidos para cobrança
 */
router.get('/campaigns/:campaignId/lead-handoffs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { billing_status, handoff_status } = req.query;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, client_contact_name, client_whatsapp_number')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Query builder
    let query = supabase
      .from('lead_handoffs')
      .select(`
        id,
        lead_username,
        lead_full_name,
        lead_email,
        lead_phone,
        lead_followers_count,
        handoff_reason,
        interest_score,
        interest_signals,
        handoff_status,
        notification_sent_at,
        notification_status,
        billable,
        billing_amount_cents,
        billing_status,
        billed_at,
        billing_notes,
        created_at,
        updated_at
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    // Filtros opcionais
    if (billing_status) {
      query = query.eq('billing_status', billing_status);
    }

    if (handoff_status) {
      query = query.eq('handoff_status', handoff_status);
    }

    const { data: handoffs, error: handoffsError } = await query;

    if (handoffsError) {
      console.error('[Lead Handoffs] Query error:', handoffsError);
      res.status(500).json({ error: 'Failed to fetch lead handoffs' });
      return;
    }

    // Calcular estatísticas de billing
    const stats = {
      total_handoffs: handoffs?.length || 0,
      billable_handoffs: handoffs?.filter(h => h.billable).length || 0,
      non_billable_handoffs: handoffs?.filter(h => !h.billable).length || 0,

      // Por status de billing
      pending_billing: handoffs?.filter(h => h.billing_status === 'pending' && h.billable).length || 0,
      billed: handoffs?.filter(h => h.billing_status === 'billed').length || 0,
      waived: handoffs?.filter(h => h.billing_status === 'waived').length || 0,
      disputed: handoffs?.filter(h => h.billing_status === 'disputed').length || 0,

      // Por status de handoff
      sent_successfully: handoffs?.filter(h => h.handoff_status === 'sent').length || 0,
      acknowledged: handoffs?.filter(h => h.handoff_status === 'acknowledged').length || 0,
      converted: handoffs?.filter(h => h.handoff_status === 'converted').length || 0,
      lost: handoffs?.filter(h => h.handoff_status === 'lost').length || 0,

      // Valores monetários
      total_amount_cents: handoffs?.reduce((sum, h) => sum + (h.billable ? h.billing_amount_cents : 0), 0) || 0,
      billed_amount_cents: handoffs?.filter(h => h.billing_status === 'billed').reduce((sum, h) => sum + h.billing_amount_cents, 0) || 0,
      pending_amount_cents: handoffs?.filter(h => h.billing_status === 'pending' && h.billable).reduce((sum, h) => sum + h.billing_amount_cents, 0) || 0,

      // Taxa de conversão
      conversion_rate: handoffs && handoffs.length > 0
        ? ((handoffs.filter(h => h.handoff_status === 'converted').length / handoffs.length) * 100).toFixed(2)
        : '0.00',

      // Notificação
      notifications_sent: handoffs?.filter(h => h.notification_status === 'sent').length || 0,
      notifications_failed: handoffs?.filter(h => h.notification_status === 'failed').length || 0
    };

    // Valores formatados em reais
    const formattedStats = {
      ...stats,
      total_amount_brl: `R$ ${(stats.total_amount_cents / 100).toFixed(2)}`,
      billed_amount_brl: `R$ ${(stats.billed_amount_cents / 100).toFixed(2)}`,
      pending_amount_brl: `R$ ${(stats.pending_amount_cents / 100).toFixed(2)}`
    };

    // Formatar handoffs com valores em reais
    const formattedHandoffs = handoffs?.map(h => ({
      ...h,
      billing_amount_brl: `R$ ${(h.billing_amount_cents / 100).toFixed(2)}`,
      interest_score_percent: h.interest_score ? `${(h.interest_score * 100).toFixed(0)}%` : '0%'
    })) || [];

    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.campaign_name,
        client_contact_name: campaign.client_contact_name,
        client_whatsapp_number: campaign.client_whatsapp_number
      },
      stats: formattedStats,
      handoffs: formattedHandoffs,
      filters: {
        billing_status: billing_status || 'all',
        handoff_status: handoff_status || 'all'
      }
    });

  } catch (error: any) {
    console.error('[Lead Handoffs] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/lead-handoffs/:handoffId/billing
 * Atualiza status de billing de um handoff específico
 */
router.patch('/campaigns/:campaignId/lead-handoffs/:handoffId/billing', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, handoffId } = req.params;
    const { billing_status, billing_notes, billed_at } = req.body;

    if (!campaignId || !handoffId) {
      res.status(400).json({ error: 'campaignId and handoffId are required' });
      return;
    }

    const validBillingStatuses = ['pending', 'billed', 'waived', 'disputed'];
    if (billing_status && !validBillingStatuses.includes(billing_status)) {
      res.status(400).json({ error: 'Invalid billing_status. Must be: pending, billed, waived, or disputed' });
      return;
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (billing_status) {
      updateData.billing_status = billing_status;
    }

    if (billing_notes !== undefined) {
      updateData.billing_notes = billing_notes;
    }

    if (billing_status === 'billed' && !billed_at) {
      updateData.billed_at = new Date().toISOString();
    } else if (billed_at) {
      updateData.billed_at = billed_at;
    }

    const { data, error } = await supabase
      .from('lead_handoffs')
      .update(updateData)
      .eq('id', handoffId)
      .eq('campaign_id', campaignId)
      .select()
      .single();

    if (error) {
      console.error('[Update Billing] Error:', error);
      res.status(500).json({ error: 'Failed to update billing status' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Handoff not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Billing status updated successfully',
      handoff: {
        id: data.id,
        billing_status: data.billing_status,
        billing_notes: data.billing_notes,
        billed_at: data.billed_at,
        billing_amount_brl: `R$ ${(data.billing_amount_cents / 100).toFixed(2)}`
      }
    });

  } catch (error: any) {
    console.error('[Update Billing] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/lead-handoffs/:handoffId/status
 * Atualiza status de conversão de um handoff (acknowledged, converted, lost)
 */
router.patch('/campaigns/:campaignId/lead-handoffs/:handoffId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, handoffId } = req.params;
    const { handoff_status } = req.body;

    if (!campaignId || !handoffId) {
      res.status(400).json({ error: 'campaignId and handoffId are required' });
      return;
    }

    const validStatuses = ['pending', 'sent', 'acknowledged', 'converted', 'lost'];
    if (!handoff_status || !validStatuses.includes(handoff_status)) {
      res.status(400).json({
        error: 'Invalid handoff_status. Must be: pending, sent, acknowledged, converted, or lost'
      });
      return;
    }

    const { data, error } = await supabase
      .from('lead_handoffs')
      .update({
        handoff_status,
        updated_at: new Date().toISOString()
      })
      .eq('id', handoffId)
      .eq('campaign_id', campaignId)
      .select()
      .single();

    if (error) {
      console.error('[Update Handoff Status] Error:', error);
      res.status(500).json({ error: 'Failed to update handoff status' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Handoff not found' });
      return;
    }

    res.json({
      success: true,
      message: `Handoff status updated to ${handoff_status}`,
      handoff: {
        id: data.id,
        handoff_status: data.handoff_status,
        lead_username: data.lead_username,
        updated_at: data.updated_at
      }
    });

  } catch (error: any) {
    console.error('[Update Handoff Status] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// META AUDIENCE EXPORT
// ============================================================================

/**
 * GET /api/campaigns/:id/export-meta-audience
 * Exporta leads da campanha no formato Meta Custom Audience
 *
 * Formato CSV compatível com Meta Ads Manager:
 * - phone: formato E.164 (+5511999999999)
 * - email: lowercase
 * - fn: first name lowercase
 * - ln: last name lowercase
 * - country: código 2 letras (BR)
 * - ig: instagram username sem @
 */
router.get('/campaigns/:id/export-meta-audience', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const format = req.query.format || 'csv'; // csv ou json

    if (!id) {
      res.status(400).json({ error: 'Campaign ID is required' });
      return;
    }

    console.log(`\n📊 [META EXPORT] Exportando audiência da campanha: ${id}`);

    // Buscar leads da campanha com dados do instagram_leads
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select(`
        lead_id,
        fit_score,
        outreach_channel,
        instagram_leads (
          id,
          username,
          full_name,
          whatsapp_number,
          email,
          phone,
          city,
          state
        )
      `)
      .eq('campaign_id', id);

    if (leadsError) {
      console.error('[META EXPORT] Error fetching leads:', leadsError);
      res.status(500).json({ error: 'Failed to fetch campaign leads' });
      return;
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      res.status(404).json({ error: 'No leads found for this campaign' });
      return;
    }

    console.log(`   ✅ ${campaignLeads.length} leads encontrados`);

    // Processar leads para formato Meta
    const metaAudience = campaignLeads
      .filter((cl: any) => cl.instagram_leads) // Filtrar leads válidos
      .map((cl: any) => {
        const lead = cl.instagram_leads;

        // Parsear nome completo
        const nameParts = (lead.full_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Formatar telefone para E.164
        let phone = lead.whatsapp_number || lead.phone || '';
        if (phone) {
          // Remover tudo que não é número
          phone = phone.replace(/\D/g, '');
          // Adicionar código do país se não tiver
          if (phone.length === 11 || phone.length === 10) {
            phone = '55' + phone;
          }
          // Adicionar +
          if (!phone.startsWith('+')) {
            phone = '+' + phone;
          }
        }

        // Username sem @
        const igUsername = (lead.username || '').replace('@', '').toLowerCase();

        return {
          phone: phone || '',
          email: (lead.email || '').toLowerCase().trim(),
          fn: firstName.toLowerCase(),
          ln: lastName.toLowerCase(),
          country: 'br',
          ct: (lead.city || '').toLowerCase().replace(/\s+/g, ''),
          st: (lead.state || '').toLowerCase(),
          ig: igUsername,
          // Campos extras (não usados pelo Meta, mas úteis)
          _fit_score: cl.fit_score,
          _channel: cl.outreach_channel
        };
      })
      .filter((row: any) => row.phone || row.email || row.ig); // Pelo menos 1 identificador

    console.log(`   ✅ ${metaAudience.length} leads válidos para Meta`);

    // Estatísticas
    const stats = {
      total_leads: campaignLeads.length,
      valid_for_meta: metaAudience.length,
      with_phone: metaAudience.filter((r: any) => r.phone).length,
      with_email: metaAudience.filter((r: any) => r.email).length,
      with_instagram: metaAudience.filter((r: any) => r.ig).length
    };

    console.log(`   📊 Stats: ${JSON.stringify(stats)}`);

    if (format === 'json') {
      res.json({
        success: true,
        campaign_id: id,
        stats,
        data: metaAudience
      });
      return;
    }

    // Gerar CSV
    const csvHeaders = ['phone', 'email', 'fn', 'ln', 'country', 'ct', 'st'];
    const csvRows = metaAudience.map((row: any) =>
      csvHeaders.map(h => {
        const val = row[h] || '';
        // Escapar aspas e envolver em aspas se tiver vírgula
        if (val.includes(',') || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // Buscar nome da campanha para o arquivo
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('campaign_name')
      .eq('id', id)
      .single();

    const fileName = `meta_audience_${(campaign?.campaign_name || id).replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);

    console.log(`   ✅ CSV gerado: ${fileName}`);

  } catch (error: any) {
    console.error('[META EXPORT] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/meta-audience-stats
 * Retorna estatísticas da audiência Meta sem baixar o CSV
 */
router.get('/campaigns/:id/meta-audience-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          COUNT(*) as total_leads,
          COUNT(il.whatsapp_number) FILTER (WHERE il.whatsapp_number IS NOT NULL AND il.whatsapp_number != '') as with_phone,
          COUNT(il.email) FILTER (WHERE il.email IS NOT NULL AND il.email != '') as with_email,
          COUNT(il.username) as with_instagram,
          COUNT(*) FILTER (
            WHERE il.whatsapp_number IS NOT NULL
            OR il.email IS NOT NULL
            OR il.username IS NOT NULL
          ) as valid_for_meta
        FROM campaign_leads cl
        JOIN instagram_leads il ON cl.lead_id = il.id
        WHERE cl.campaign_id = '${id}'
      `
    });

    if (error) throw error;

    const stats = data?.[0] || {
      total_leads: 0,
      with_phone: 0,
      with_email: 0,
      with_instagram: 0,
      valid_for_meta: 0
    };

    res.json({
      success: true,
      campaign_id: id,
      stats: {
        total_leads: parseInt(stats.total_leads) || 0,
        with_phone: parseInt(stats.with_phone) || 0,
        with_email: parseInt(stats.with_email) || 0,
        with_instagram: parseInt(stats.with_instagram) || 0,
        valid_for_meta: parseInt(stats.valid_for_meta) || 0,
        meta_match_rate: stats.total_leads > 0
          ? Math.round((parseInt(stats.valid_for_meta) / parseInt(stats.total_leads)) * 100)
          : 0
      }
    });

  } catch (error: any) {
    console.error('[META STATS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leads/export-meta-audience
 * Exporta leads diretamente por critérios (hashtags, nicho) - antes de alocar em campanha
 *
 * Body:
 * - hashtags: string[] - lista de hashtags para filtrar
 * - limit: number - máximo de leads (default 2000)
 * - minFollowers: number - mínimo de seguidores
 * - maxFollowers: number - máximo de seguidores
 * - requireWhatsapp: boolean - apenas leads com WhatsApp
 */
router.post('/leads/export-meta-audience', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      hashtags = [],
      limit = 2000,
      minFollowers = 0,
      maxFollowers = 1000000,
      requireWhatsapp = false,
      format = 'csv',
      metaFormat = 'custom' // 'custom' (full) ou 'lookalike' (phone/email only)
    } = req.body;

    console.log(`\n📊 [META EXPORT LEADS] Exportando leads por critérios`);
    console.log(`   Hashtags: ${hashtags.length > 0 ? hashtags.join(', ') : 'todas'}`);
    console.log(`   Limit: ${limit}, Followers: ${minFollowers}-${maxFollowers}`);

    // Query base para leads na zona ativa
    let query = supabase
      .from('instagram_leads')
      .select('id, username, full_name, whatsapp_number, email, phone, city, state, followers_count')
      .gte('captured_at', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString())
      .gte('followers_count', minFollowers)
      .lte('followers_count', maxFollowers)
      .order('followers_count', { ascending: false })
      .limit(limit);

    // Filtrar por WhatsApp se solicitado
    if (requireWhatsapp) {
      query = query.not('whatsapp_number', 'is', null);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[META EXPORT LEADS] Error:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
      return;
    }

    if (!leads || leads.length === 0) {
      res.status(404).json({ error: 'No leads found with criteria' });
      return;
    }

    // Se hashtags especificadas, filtrar leads que possuem essas hashtags
    let filteredLeads = leads;
    if (hashtags.length > 0) {
      const hashtagsLower = hashtags.map((h: string) => h.toLowerCase().replace('#', ''));

      // Buscar lead_ids que possuem as hashtags
      const { data: leadHashtags } = await supabase
        .from('lead_hashtags')
        .select('lead_id')
        .in('hashtag', hashtagsLower);

      if (leadHashtags && leadHashtags.length > 0) {
        const leadIdsWithHashtags = new Set(leadHashtags.map((lh: any) => lh.lead_id));
        filteredLeads = leads.filter((l: any) => leadIdsWithHashtags.has(l.id));
      }
    }

    console.log(`   ✅ ${filteredLeads.length} leads encontrados`);

    // Processar para formato Meta
    const metaAudience = filteredLeads
      .map((lead: any) => {
        const nameParts = (lead.full_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        let phone = lead.whatsapp_number || lead.phone || '';
        if (phone) {
          phone = phone.replace(/\D/g, '');
          if (phone.length === 11 || phone.length === 10) {
            phone = '55' + phone;
          }
          if (!phone.startsWith('+')) {
            phone = '+' + phone;
          }
        }

        const igUsername = (lead.username || '').replace('@', '').toLowerCase();

        return {
          phone: phone || '',
          email: (lead.email || '').toLowerCase().trim(),
          fn: firstName.toLowerCase(),
          ln: lastName.toLowerCase(),
          country: 'br',
          ct: (lead.city || '').toLowerCase().replace(/\s+/g, ''),
          st: (lead.state || '').toLowerCase(),
          ig: igUsername
        };
      })
      .filter((row: any) => row.phone || row.email || row.ig);

    console.log(`   ✅ ${metaAudience.length} leads válidos para Meta`);

    const stats = {
      total_leads: filteredLeads.length,
      valid_for_meta: metaAudience.length,
      with_phone: metaAudience.filter((r: any) => r.phone).length,
      with_email: metaAudience.filter((r: any) => r.email).length,
      with_instagram: metaAudience.filter((r: any) => r.ig).length
    };

    if (format === 'json') {
      res.json({ success: true, stats, data: metaAudience });
      return;
    }

    // Gerar CSV baseado no formato
    // Lookalike: apenas phone e email (mais discreto, menos dados)
    // Custom: todos os campos (melhor match rate)
    const csvHeaders = metaFormat === 'lookalike'
      ? ['phone', 'email']
      : ['phone', 'email', 'fn', 'ln', 'country', 'ct', 'st'];

    const csvRows = metaAudience.map((row: any) =>
      csvHeaders.map(h => {
        const val = row[h] || '';
        if (val.includes(',') || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const formatSuffix = metaFormat === 'lookalike' ? 'lookalike' : 'custom';
    const fileName = `meta_${formatSuffix}_${limit}_leads_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);

    console.log(`   ✅ CSV gerado: ${fileName} (${metaAudience.length} leads, formato: ${metaFormat})`);

  } catch (error: any) {
    console.error('[META EXPORT LEADS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leads/meta-audience-stats
 * Estatísticas rápidas dos leads disponíveis para Meta
 */
router.get('/leads/meta-audience-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          COUNT(*) as total_leads,
          COUNT(whatsapp_number) FILTER (WHERE whatsapp_number IS NOT NULL AND whatsapp_number != '') as with_phone,
          COUNT(email) FILTER (WHERE email IS NOT NULL AND email != '') as with_email,
          COUNT(username) as with_instagram,
          COUNT(*) FILTER (
            WHERE whatsapp_number IS NOT NULL
            OR email IS NOT NULL
            OR username IS NOT NULL
          ) as valid_for_meta
        FROM instagram_leads
        WHERE captured_at >= CURRENT_DATE - INTERVAL '45 days'
      `
    });

    if (error) throw error;

    const stats = data?.[0] || {};

    res.json({
      success: true,
      source: 'instagram_leads (zona ativa 45 dias)',
      stats: {
        total_leads: parseInt(stats.total_leads) || 0,
        with_phone: parseInt(stats.with_phone) || 0,
        with_email: parseInt(stats.with_email) || 0,
        with_instagram: parseInt(stats.with_instagram) || 0,
        valid_for_meta: parseInt(stats.valid_for_meta) || 0,
        meta_match_rate: stats.total_leads > 0
          ? Math.round((parseInt(stats.valid_for_meta) / parseInt(stats.total_leads)) * 100)
          : 0
      }
    });

  } catch (error: any) {
    console.error('[META LEADS STATS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WHAPI PARTNER API - GERENCIAMENTO DE CANAIS
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/whatsapp/channel
 * Cria um canal WhatsApp via Partner API para a campanha
 */
router.post('/campaigns/:campaignId/whatsapp/channel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, whapi_channel_uuid')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Verificar se já tem canal
    if (campaign.whapi_channel_uuid) {
      res.status(400).json({
        error: 'Campaign already has a WhatsApp channel',
        channelId: campaign.whapi_channel_uuid
      });
      return;
    }

    // Criar canal via Partner API
    const partnerService = getWhapiPartnerService();
    const result = await partnerService.createChannelForCampaign(campaignId, campaign.campaign_name);

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Failed to create channel' });
      return;
    }

    res.json({
      success: true,
      channel: {
        id: result.channel!.id,
        name: result.channel!.name,
        status: result.channel!.status,
        apiUrl: result.channel!.apiUrl
      },
      message: 'Canal criado com sucesso. Agora gere o QR Code para conectar o WhatsApp.'
    });

  } catch (error: any) {
    console.error('[Partner API] Error creating WhatsApp channel:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/whatsapp/qr
 * Obtém QR Code para conectar o WhatsApp da campanha
 */
router.get('/campaigns/:campaignId/whatsapp/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    // Buscar canal da campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, whapi_channel_uuid')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (!campaign.whapi_channel_uuid) {
      res.status(400).json({
        error: 'Campaign does not have a WhatsApp channel. Create one first.',
        createUrl: `/api/campaigns/${campaignId}/whatsapp/channel`
      });
      return;
    }

    // Buscar token do canal
    const { data: channel, error: channelError } = await supabase
      .from('whapi_channels')
      .select('api_token, status, phone_number')
      .eq('channel_id', campaign.whapi_channel_uuid)
      .single();

    if (channelError || !channel) {
      res.status(404).json({ error: 'WhatsApp channel not found in database' });
      return;
    }

    // Se já tem telefone conectado, não precisa de QR
    if (channel.phone_number && channel.status === 'active') {
      res.json({
        connected: true,
        phone: channel.phone_number,
        message: 'WhatsApp já está conectado'
      });
      return;
    }

    // Obter QR Code
    const partnerService = getWhapiPartnerService();
    const qrResult = await partnerService.getChannelQRCode(channel.api_token);

    if (!qrResult.success) {
      // Verificar se já está conectado
      const statusResult = await partnerService.getChannelStatus(channel.api_token);

      if (statusResult.connected) {
        // Atualizar banco com telefone
        if (statusResult.phone) {
          await supabase
            .from('whapi_channels')
            .update({
              phone_number: statusResult.phone,
              status: 'active',
              last_connected_at: new Date().toISOString()
            })
            .eq('channel_id', campaign.whapi_channel_uuid);
        }

        res.json({
          connected: true,
          phone: statusResult.phone,
          message: 'WhatsApp já está conectado'
        });
        return;
      }

      res.status(500).json({ error: qrResult.error || 'Failed to generate QR code' });
      return;
    }

    res.json({
      connected: false,
      qrCode: qrResult.qrCode,
      message: 'Escaneie o QR Code com o WhatsApp do cliente'
    });

  } catch (error: any) {
    console.error('[Partner API] Error getting QR code:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:campaignId/whatsapp/status
 * Verifica status da conexão WhatsApp da campanha
 */
router.get('/campaigns/:campaignId/whatsapp/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    // Buscar canal da campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, whapi_channel_uuid')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (!campaign.whapi_channel_uuid) {
      res.json({
        hasChannel: false,
        connected: false,
        message: 'Campanha não tem canal WhatsApp configurado'
      });
      return;
    }

    // Buscar token do canal
    const { data: channel, error: channelError } = await supabase
      .from('whapi_channels')
      .select('api_token, status, phone_number, name')
      .eq('channel_id', campaign.whapi_channel_uuid)
      .single();

    if (channelError || !channel) {
      res.json({
        hasChannel: true,
        channelId: campaign.whapi_channel_uuid,
        connected: false,
        error: 'Canal não encontrado no banco local'
      });
      return;
    }

    // Verificar status real na Whapi
    const partnerService = getWhapiPartnerService();
    const statusResult = await partnerService.getChannelStatus(channel.api_token);

    // Atualizar banco se conectado
    if (statusResult.connected && statusResult.phone && channel.status !== 'active') {
      await supabase
        .from('whapi_channels')
        .update({
          phone_number: statusResult.phone,
          status: 'active',
          last_connected_at: new Date().toISOString()
        })
        .eq('channel_id', campaign.whapi_channel_uuid);
    }

    res.json({
      hasChannel: true,
      channelId: campaign.whapi_channel_uuid,
      channelName: channel.name,
      connected: statusResult.connected,
      phone: statusResult.phone || channel.phone_number,
      localStatus: channel.status
    });

  } catch (error: any) {
    console.error('[Partner API] Error checking status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/whatsapp/webhook
 * Configura webhook do canal WhatsApp da campanha
 */
router.post('/campaigns/:campaignId/whatsapp/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { webhookUrl } = req.body;

    // URL padrão do whapi-worker
    const defaultWebhookUrl = process.env.WHAPI_WEBHOOK_URL || 'https://yourdomain.com/api/whapi/webhook';
    const finalWebhookUrl = webhookUrl || defaultWebhookUrl;

    // Buscar canal da campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, whapi_channel_uuid')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign || !campaign.whapi_channel_uuid) {
      res.status(404).json({ error: 'Campaign or WhatsApp channel not found' });
      return;
    }

    // Buscar token do canal
    const { data: channel } = await supabase
      .from('whapi_channels')
      .select('api_token')
      .eq('channel_id', campaign.whapi_channel_uuid)
      .single();

    if (!channel) {
      res.status(404).json({ error: 'Channel token not found' });
      return;
    }

    // Configurar webhook
    const partnerService = getWhapiPartnerService();
    const result = await partnerService.configureChannelWebhook(channel.api_token, finalWebhookUrl);

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Failed to configure webhook' });
      return;
    }

    res.json({
      success: true,
      webhookUrl: finalWebhookUrl,
      message: 'Webhook configurado com sucesso'
    });

  } catch (error: any) {
    console.error('[Partner API] Error configuring webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/whatsapp/activate
 * Ativa canal para produção (trial -> live)
 */
router.post('/campaigns/:campaignId/whatsapp/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    // Buscar canal da campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, whapi_channel_uuid')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign || !campaign.whapi_channel_uuid) {
      res.status(404).json({ error: 'Campaign or WhatsApp channel not found' });
      return;
    }

    // Ativar canal
    const partnerService = getWhapiPartnerService();
    const result = await partnerService.activateChannelForProduction(campaign.whapi_channel_uuid);

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Failed to activate channel' });
      return;
    }

    res.json({
      success: true,
      message: 'Canal ativado para produção (modo LIVE)'
    });

  } catch (error: any) {
    console.error('[Partner API] Error activating channel:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/partner/channels
 * Lista todos os canais do Partner Account
 */
router.get('/whapi/partner/channels', async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerService = getWhapiPartnerService();
    const result = await partnerService.listChannels({ projectId: process.env.WHAPI_PROJECT_ID || 'zQk0Fsp90x1jGVnqsKZ0' });

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Failed to list channels' });
      return;
    }

    res.json({
      success: true,
      total: result.total,
      channels: result.channels
    });

  } catch (error: any) {
    console.error('[Partner API] Error listing channels:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/partner/sync
 * Sincroniza canais da Whapi com o banco local
 */
router.post('/whapi/partner/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const partnerService = getWhapiPartnerService();
    const result = await partnerService.syncChannelsWithDatabase();

    res.json({
      success: true,
      synced: result.synced,
      errors: result.errors
    });

  } catch (error: any) {
    console.error('[Partner API] Error syncing channels:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DELETE CAMPAIGN - Exclusão completa de campanha
// ============================================================================

/**
 * DELETE /api/campaigns/:campaignId
 * Exclui completamente uma campanha e todos os dados relacionados
 * CUIDADO: Esta ação é irreversível!
 */
router.delete('/campaigns/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    console.log(`\n🗑️ [DELETE CAMPAIGN] Iniciando exclusão da campanha ${campaignId}`);

    // Verificar se campanha existe
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
      return;
    }

    console.log(`📋 Campanha encontrada: ${campaign.campaign_name}`);

    // Deletar em ordem para respeitar foreign keys
    // 1. campaign_documents (documentos embedados)
    const { error: docsError } = await supabase
      .from('campaign_documents')
      .delete()
      .eq('campaign_id', campaignId);
    if (docsError) console.warn('⚠️ Erro ao deletar documents:', docsError.message);
    else console.log('✓ campaign_documents deletados');

    // 2. campaign_briefing
    const { error: briefingError } = await supabase
      .from('campaign_briefing')
      .delete()
      .eq('campaign_id', campaignId);
    if (briefingError) console.warn('⚠️ Erro ao deletar briefing:', briefingError.message);
    else console.log('✓ campaign_briefing deletado');

    // 3. campaign_leads (leads alocados na campanha)
    const { error: leadsError } = await supabase
      .from('campaign_leads')
      .delete()
      .eq('campaign_id', campaignId);
    if (leadsError) console.warn('⚠️ Erro ao deletar campaign_leads:', leadsError.message);
    else console.log('✓ campaign_leads deletados');

    // 4. campaign_subclusters
    const { error: subclustersError } = await supabase
      .from('campaign_subclusters')
      .delete()
      .eq('campaign_id', campaignId);
    if (subclustersError) console.warn('⚠️ Erro ao deletar subclusters:', subclustersError.message);
    else console.log('✓ campaign_subclusters deletados');

    // 5. aic_conversations (conversas da campanha)
    const { error: convsError } = await supabase
      .from('aic_conversations')
      .delete()
      .eq('campaign_id', campaignId);
    if (convsError) console.warn('⚠️ Erro ao deletar conversations:', convsError.message);
    else console.log('✓ aic_conversations deletadas');

    // 6. aic_message_queue (mensagens na fila)
    const { error: queueError } = await supabase
      .from('aic_message_queue')
      .delete()
      .eq('campaign_id', campaignId);
    if (queueError) console.warn('⚠️ Erro ao deletar message_queue:', queueError.message);
    else console.log('✓ aic_message_queue deletada');

    // 7. aic_client_journeys (jornadas do cliente)
    const { error: journeysError } = await supabase
      .from('aic_client_journeys')
      .delete()
      .eq('campaign_id', campaignId);
    if (journeysError) console.warn('⚠️ Erro ao deletar journeys:', journeysError.message);
    else console.log('✓ aic_client_journeys deletadas');

    // 8. instagram_accounts (contas IG vinculadas)
    const { error: igError } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('campaign_id', campaignId);
    if (igError) console.warn('⚠️ Erro ao deletar instagram_accounts:', igError.message);
    else console.log('✓ instagram_accounts deletadas');

    // 9. Finalmente, deletar a campanha principal
    const { error: campaignError } = await supabase
      .from('cluster_campaigns')
      .delete()
      .eq('id', campaignId);

    if (campaignError) {
      console.error('❌ Erro ao deletar campanha:', campaignError);
      res.status(500).json({
        success: false,
        message: 'Erro ao excluir campanha: ' + campaignError.message
      });
      return;
    }

    console.log(`✅ Campanha "${campaign.campaign_name}" excluída com sucesso!\n`);

    res.json({
      success: true,
      message: `Campanha "${campaign.campaign_name}" excluída com sucesso`
    });

  } catch (error: any) {
    console.error('❌ [DELETE CAMPAIGN] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
