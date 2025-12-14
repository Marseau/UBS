/**
 * GOOGLE CALENDAR OAUTH ROUTES
 *
 * Endpoints para configuração OAuth do Google Calendar por campanha AIC.
 *
 * Endpoints:
 * - POST /api/campaigns/:campaignId/google-calendar/auth/start - Iniciar fluxo OAuth
 * - GET  /api/campaigns/google-calendar/auth/callback - Callback OAuth do Google
 * - GET  /api/campaigns/:campaignId/google-calendar/auth/status - Status da autenticação
 * - POST /api/campaigns/:campaignId/google-calendar/auth/revoke - Revogar acesso
 * - POST /api/campaigns/:campaignId/google-calendar/config - Atualizar configurações
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  generateAuthUrl,
  handleOAuthCallback,
  checkOAuthStatus,
  revokeOAuthAccess
} from '../services/google-oauth.service';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONFIGURAÇÃO OAUTH
// ============================================================================

const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/campaigns/google-calendar/auth/callback'
};

// ============================================================================
// INICIAR FLUXO OAUTH
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/google-calendar/auth/start
 *
 * Gera URL de autenticação OAuth do Google para uma campanha
 *
 * Body: {}
 * Returns: { auth_url: string }
 */
router.post('/:campaignId/google-calendar/auth/start', async (req: Request, res: Response) => {
  try {
    const campaignIdParam = req.params.campaignId;

    if (!campaignIdParam) {
      return res.status(400).json({
        error: 'campaignId é obrigatório'
      });
    }
    const campaignId = String(campaignIdParam);

    // Validar campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Campanha não encontrada'
      });
    }

    // Verificar se client_id e client_secret estão configurados
    if (!GOOGLE_OAUTH_CONFIG.clientId || !GOOGLE_OAUTH_CONFIG.clientSecret) {
      return res.status(500).json({
        error: 'Google OAuth não configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'
      });
    }

    // Gerar URL de autenticação
    const authUrl = await generateAuthUrl(campaignId, GOOGLE_OAUTH_CONFIG);

    return res.json({
      success: true,
      auth_url: authUrl,
      campaign_id: campaignId,
      campaign_name: campaign.campaign_name
    });

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro ao iniciar OAuth:', error);
    return res.status(500).json({
      error: 'Erro ao gerar URL de autenticação',
      details: error.message
    });
  }
});

// ============================================================================
// CALLBACK OAUTH
// ============================================================================

/**
 * GET /api/campaigns/google-calendar/auth/callback
 *
 * Recebe callback do Google após autenticação OAuth
 *
 * Query params:
 * - code: Código de autorização do Google
 * - state: campaign_id passado no auth_url
 * - error: Erro se usuário negou permissão
 */
router.get('/google-calendar/auth/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    const campaignId = req.query.state as string | undefined;
    const oauthError = req.query.error;

    // Verificar se houve erro
    if (oauthError) {
      return res.status(400).send(`
        <html>
          <head><title>Autenticação Cancelada</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Autenticação Cancelada</h1>
            <p>Você cancelou a autorização do Google Calendar.</p>
            <p>Erro: ${oauthError}</p>
            <a href="/aic-campaigns" style="color: #4285f4;">Voltar para Campanhas</a>
          </body>
        </html>
      `);
    }

    // Validar parâmetros
    if (!code || !campaignId) {
      return res.status(400).send(`
        <html>
          <head><title>Erro</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Erro</h1>
            <p>Parâmetros inválidos no callback OAuth.</p>
            <a href="/aic-campaigns" style="color: #4285f4;">Voltar para Campanhas</a>
          </body>
        </html>
      `);
    }

    // Processar callback OAuth
    const result = await handleOAuthCallback(code, campaignId, GOOGLE_OAUTH_CONFIG);

    if (!result.success) {
      return res.status(500).send(`
        <html>
          <head><title>Erro na Autenticação</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Erro na Autenticação</h1>
            <p>Não foi possível salvar as credenciais do Google Calendar.</p>
            <p>Erro: ${result.error}</p>
            <a href="/aic-campaigns" style="color: #4285f4;">Voltar para Campanhas</a>
          </body>
        </html>
      `);
    }

    // Sucesso!
    return res.send(`
      <html>
        <head>
          <title>Google Calendar Conectado</title>
          <meta http-equiv="refresh" content="3;url=/aic-campaigns/${campaignId}">
        </head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>✅ Google Calendar Conectado com Sucesso!</h1>
          <p>Sua campanha agora pode agendar reuniões automaticamente.</p>
          <p style="color: #666;">Redirecionando em 3 segundos...</p>
          <a href="/aic-campaigns/${campaignId}" style="color: #4285f4;">Ir para Campanha</a>
        </body>
      </html>
    `);

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro no callback:', error);
    return res.status(500).send(`
      <html>
        <head><title>Erro</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Erro Interno</h1>
          <p>Erro ao processar autenticação.</p>
          <p>Detalhes: ${error.message}</p>
          <a href="/aic-campaigns" style="color: #4285f4;">Voltar para Campanhas</a>
        </body>
      </html>
    `);
  }
});

// ============================================================================
// STATUS DA AUTENTICAÇÃO
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/google-calendar/auth/status
 *
 * Retorna status da autenticação OAuth de uma campanha
 *
 * Returns: {
 *   configured: boolean,
 *   status: 'pending' | 'active' | 'expired' | 'error' | 'revoked',
 *   needs_reauth: boolean,
 *   error_message?: string
 * }
 */
router.get('/:campaignId/google-calendar/auth/status', async (req: Request, res: Response) => {
  try {
    const campaignIdParam = req.params.campaignId;

    if (!campaignIdParam) {
      return res.status(400).json({
        error: 'campaignId é obrigatório'
      });
    }
    const campaignId = String(campaignIdParam);

    const status = await checkOAuthStatus(campaignId);

    return res.json({
      success: true,
      campaign_id: campaignId,
      ...status
    });

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro ao verificar status:', error);
    return res.status(500).json({
      error: 'Erro ao verificar status OAuth',
      details: error.message
    });
  }
});

// ============================================================================
// REVOGAR ACESSO
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/google-calendar/auth/revoke
 *
 * Revoga acesso OAuth do Google Calendar para uma campanha
 *
 * Body: {}
 * Returns: { success: boolean }
 */
router.post('/:campaignId/google-calendar/auth/revoke', async (req: Request, res: Response) => {
  try {
    const campaignIdParam = req.params.campaignId;

    if (!campaignIdParam) {
      return res.status(400).json({
        error: 'campaignId é obrigatório'
      });
    }
    const campaignId = String(campaignIdParam);

    const result = await revokeOAuthAccess(campaignId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      message: 'Acesso ao Google Calendar revogado com sucesso'
    });

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro ao revogar acesso:', error);
    return res.status(500).json({
      error: 'Erro ao revogar acesso OAuth',
      details: error.message
    });
  }
});

// ============================================================================
// ATUALIZAR CONFIGURAÇÕES
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/google-calendar/config
 *
 * Atualiza configurações de agendamento da campanha
 *
 * Body: {
 *   google_calendar_id?: string,
 *   working_hours_start?: number,
 *   working_hours_end?: number,
 *   working_days?: number[],
 *   slot_duration_minutes?: number,
 *   buffer_between_meetings_minutes?: number,
 *   max_meetings_per_day?: number,
 *   send_calendar_invites?: boolean,
 *   send_reminder_24h?: boolean,
 *   send_reminder_1h?: boolean
 * }
 */
router.post('/:campaignId/google-calendar/config', async (req: Request, res: Response) => {
  try {
    const campaignIdParam = req.params.campaignId;
    if (!campaignIdParam) {
      return res.status(400).json({ error: 'campaignId é obrigatório' });
    }
    const campaignId = String(campaignIdParam);
    const config = req.body;

    // Validar campos permitidos
    const allowedFields = [
      'google_calendar_id',
      'working_hours_start',
      'working_hours_end',
      'working_days',
      'slot_duration_minutes',
      'buffer_between_meetings_minutes',
      'max_meetings_per_day',
      'send_calendar_invites',
      'send_reminder_24h',
      'send_reminder_1h'
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (config[field] !== undefined) {
        updateData[field] = config[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo válido fornecido para atualização'
      });
    }

    // Atualizar configurações
    const { error } = await supabase
      .from('campaign_google_calendar')
      .update(updateData)
      .eq('campaign_id', campaignId);

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      updated_fields: Object.keys(updateData)
    });

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro ao atualizar configurações:', error);
    return res.status(500).json({
      error: 'Erro ao atualizar configurações',
      details: error.message
    });
  }
});

// ============================================================================
// OBTER CONFIGURAÇÕES
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/google-calendar/config
 *
 * Retorna configurações de agendamento da campanha
 */
router.get('/:campaignId/google-calendar/config', async (req: Request, res: Response) => {
  try {
    const campaignIdParam = req.params.campaignId;
    if (!campaignIdParam) {
      return res.status(400).json({ error: 'campaignId é obrigatório' });
    }
    const campaignId = String(campaignIdParam);

    const { data, error } = await supabase
      .from('campaign_google_calendar')
      .select(`
        google_calendar_id,
        calendar_timezone,
        working_hours_start,
        working_hours_end,
        working_days,
        slot_duration_minutes,
        buffer_between_meetings_minutes,
        max_meetings_per_day,
        send_calendar_invites,
        send_reminder_24h,
        send_reminder_1h,
        oauth_status
      `)
      .eq('campaign_id', campaignId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Configurações não encontradas. Configure o Google Calendar primeiro.'
      });
    }

    return res.json({
      success: true,
      campaign_id: campaignId,
      config: data
    });

  } catch (error: any) {
    console.error('[OAUTH ROUTES] Erro ao buscar configurações:', error);
    return res.status(500).json({
      error: 'Erro ao buscar configurações',
      details: error.message
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
