/**
 * Instagram Official DM Routes
 *
 * Rotas para envio de DMs com conta oficial do cliente
 * Integrado com rate limiting centralizado (instagram_dm_sessions)
 */

import express, { Request, Response } from 'express';
import {
  sendOfficialDM,
  checkSessionCanSend,
  getSessionForCampaign,
  resetSessionCounters,
  listActiveSessions
} from '../services/instagram-official-dm.service';

const router = express.Router();

/**
 * POST /api/instagram/official-dm/send
 *
 * Envia DM personalizado via conta oficial
 *
 * Body:
 * {
 *   session_id: "uuid",
 *   campaign_id: "uuid" (opcional),
 *   lead: {
 *     username: "@leadusername",
 *     full_name: "Nome Completo",
 *     business_category: "Estética",
 *     segment: "Manicure",
 *     has_phone: true,
 *     has_email: false
 *   }
 * }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { session_id, campaign_id, lead } = req.body;

    // Validação
    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id é obrigatório'
      });
    }

    if (!lead || !lead.username) {
      return res.status(400).json({
        success: false,
        error: 'lead.username é obrigatório'
      });
    }

    console.log(`📨 [API] Enviando DM para @${lead.username} via sessão ${session_id.substring(0, 8)}...`);

    // Enviar DM
    const result = await sendOfficialDM(session_id, lead, campaign_id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error_message,
        rate_limit_status: result.rate_limit_status
      });
    }

    return res.status(200).json({
      success: true,
      sent_at: result.sent_at,
      message_text: result.message_text,
      session_id: result.session_id,
      rate_limit_status: result.rate_limit_status
    });

  } catch (error: any) {
    console.error('❌ Erro ao enviar DM:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/instagram/official-dm/session/:id/status
 *
 * Verifica status de rate limit de uma sessão
 */
router.get('/session/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    const rateLimitStatus = await checkSessionCanSend(id);

    return res.status(200).json({
      success: true,
      session_id: id,
      rate_limit: rateLimitStatus
    });

  } catch (error: any) {
    console.error('❌ Erro ao verificar status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/instagram/official-dm/campaign/:id/session
 *
 * Obtém sessão associada a uma campanha com status de rate limit
 */
router.get('/campaign/:id/session', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Campaign ID is required' });
    }

    const sessionInfo = await getSessionForCampaign(id);

    if (!sessionInfo.session_id) {
      return res.status(404).json({
        success: false,
        error: sessionInfo.reason
      });
    }

    return res.status(200).json({
      success: true,
      session: sessionInfo
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar sessão:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/instagram/official-dm/sessions
 *
 * Lista todas as sessões ativas com status
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await listActiveSessions();

    return res.status(200).json({
      success: true,
      count: sessions.length,
      sessions
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar sessões:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/instagram/official-dm/reset-counters
 *
 * Reseta contadores de rate limit (chamado por cron)
 */
router.post('/reset-counters', async (req: Request, res: Response) => {
  try {
    const result = await resetSessionCounters();

    return res.status(200).json({
      success: true,
      hourly_resets: result.hourly_resets,
      daily_resets: result.daily_resets
    });

  } catch (error: any) {
    console.error('❌ Erro ao resetar contadores:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
