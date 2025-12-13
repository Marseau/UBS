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
// WHAPI (CANAL BACKUP)
// ============================================================================

/**
 * POST /api/whapi/sessions/:sessionId/configure
 * Configura credenciais Whapi para uma sessao existente
 */
router.post('/whapi/sessions/:sessionId/configure', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    const { whapiToken, whapiChannelId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    if (!whapiToken) {
      res.status(400).json({ error: 'whapiToken is required' });
      return;
    }

    // Atualizar sessao com credenciais Whapi
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({
        whapi_token: whapiToken,
        whapi_channel_id: whapiChannelId || null,
        whapi_status: 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error('[Campaign Credentials] Error configuring Whapi:', error);
      res.status(500).json({ error: 'Failed to configure Whapi' });
      return;
    }

    res.json({ success: true, message: 'Whapi credentials configured' });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error configuring Whapi:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/sessions/:sessionId/qr
 * Gera QR Code via Whapi para canal backup
 */
router.post('/whapi/sessions/:sessionId/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    // Buscar sessao com credenciais Whapi
    const { data: session, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select('id, campaign_id, whapi_token, whapi_channel_id, whapi_status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Se nao tem token Whapi configurado, usar o global (da AIC)
    const whapiToken = session.whapi_token || process.env.WHAPI_TOKEN;

    if (!whapiToken) {
      res.status(400).json({ error: 'Whapi token not configured' });
      return;
    }

    // Criar cliente Whapi com o token
    const { default: WhapiClientService } = await import('../services/whapi-client.service');
    const whapiClient = new WhapiClientService({
      token: whapiToken,
      channelId: session.whapi_channel_id || undefined
    });

    // Obter QR Code
    const qrCode = await whapiClient.getQRCode();

    if (!qrCode) {
      // Se nao tem QR, pode ja estar conectado
      const channelInfo = await whapiClient.getChannelInfo();
      if (channelInfo?.status === 'connected') {
        // Atualizar status
        await supabase
          .from('whatsapp_sessions')
          .update({
            whapi_status: 'connected',
            whapi_last_activity_at: new Date().toISOString()
          })
          .eq('id', sessionId);

        res.json({ connected: true, message: 'Whapi already connected' });
        return;
      }

      res.status(500).json({ error: 'Could not generate QR Code' });
      return;
    }

    // Salvar QR no banco
    await supabase
      .from('whatsapp_sessions')
      .update({
        whapi_qr_code_data: qrCode,
        whapi_qr_generated_at: new Date().toISOString(),
        whapi_status: 'qr_pending'
      })
      .eq('id', sessionId);

    res.json({
      qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`,
      expiresIn: 60 // segundos
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error generating Whapi QR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/sessions/:sessionId/status
 * Verifica status da conexao Whapi
 */
router.get('/whapi/sessions/:sessionId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    // Buscar sessao
    const { data: session, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select('id, whapi_token, whapi_channel_id, whapi_status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const whapiToken = session.whapi_token || process.env.WHAPI_TOKEN;

    if (!whapiToken) {
      res.json({ status: 'not_configured', connected: false });
      return;
    }

    // Verificar status via API Whapi
    const { default: WhapiClientService } = await import('../services/whapi-client.service');
    const whapiClient = new WhapiClientService({
      token: whapiToken,
      channelId: session.whapi_channel_id || undefined
    });

    const channelInfo = await whapiClient.getChannelInfo();
    const isConnected = channelInfo?.status === 'connected';

    // Atualizar status no banco se mudou
    if (isConnected && session.whapi_status !== 'connected') {
      await supabase
        .from('whatsapp_sessions')
        .update({
          whapi_status: 'connected',
          whapi_last_activity_at: new Date().toISOString()
        })
        .eq('id', sessionId);
    }

    res.json({
      status: isConnected ? 'connected' : session.whapi_status || 'disconnected',
      connected: isConnected,
      channelInfo: channelInfo || null
    });
  } catch (error: any) {
    console.error('[Campaign Credentials] Error checking Whapi status:', error);
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
 */
router.get('/campaigns/available', async (req: Request, res: Response): Promise<void> => {
  try {
    // Buscar todas as campanhas que nao estao com status 'approved' ou 'active'
    const { data: campaigns, error } = await supabase
      .from('cluster_campaigns')
      .select(`
        id,
        campaign_name,
        nicho_principal,
        business_name,
        cluster_status,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(50);

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
 */
router.get('/campaigns/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    const { data: campaign, error } = await supabase
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
        created_at
      `)
      .eq('id', campaignId)
      .single();

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
 */
router.post('/campaigns/:campaignId/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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
 */
router.get('/campaigns/:campaignId/credentials-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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
 */
router.get('/campaigns/:campaignId/briefing', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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
      res.json(null);
      return;
    }

    res.json(briefing);
  } catch (error: any) {
    console.error('[Campaign Credentials] Error getting briefing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaignId/briefing
 * Cria ou atualiza o briefing de uma campanha
 */
router.post('/campaigns/:campaignId/briefing', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    const briefingData = req.body;

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
    }

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
 */
router.get('/campaigns/:campaignId/briefing/context', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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
 * PATCH /api/campaigns/:campaignId/briefing/approve
 * Aprova o briefing de uma campanha
 */
router.patch('/campaigns/:campaignId/briefing/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    const { approvedBy } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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

import { campaignDocumentProcessor, DocumentUpload } from '../services/campaign-document-processor.service';
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
 */
router.post('/campaigns/:campaignId/documents', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
 */
router.get('/campaigns/:campaignId/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
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
 */
router.delete('/campaigns/:campaignId/documents/:title', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, title } = req.params;

    if (!campaignId || !title) {
      res.status(400).json({ error: 'campaignId and title are required' });
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
 */
router.post('/campaigns/:campaignId/documents/:title/reprocess', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, title } = req.params;
    const { maxTokens, overlapTokens } = req.body;

    if (!campaignId || !title) {
      res.status(400).json({ error: 'campaignId and title are required' });
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

export default router;
