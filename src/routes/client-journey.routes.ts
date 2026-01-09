/**
 * Client Journey Routes
 * APIs para gerenciar a jornada do cliente AIC
 */

import { Router, Request, Response } from 'express';
import { clientJourneyService, JourneyStep } from '../services/client-journey.service';
import { authenticateClient, ClientRequest } from '../middleware/client-auth.middleware';
import { clientInviteService } from '../services/client-invite.service';

const router = Router();

// Helper para obter parametro com validacao
function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new Error(`Parameter ${name} is required`);
  return value;
}

// ============================================
// ROTAS PUBLICAS (com token de acesso)
// ============================================

/**
 * GET /api/aic/journey/by-token/:token
 * Obter jornada por token de acesso (acesso publico)
 */
router.get('/by-token/:token', async (req: Request, res: Response) => {
  try {
    const token = getParam(req, 'token');

    const journey = await clientJourneyService.getJourneyByAccessToken(token);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada ou token expirado'
      });
    }

    // Calcular progresso e etapas
    const progress = clientJourneyService.getProgress(journey.current_step as JourneyStep);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as JourneyStep);

    return res.json({
      success: true,
      journey: {
        id: journey.id,
        client_name: journey.client_name,
        client_email: journey.client_email,
        current_step: journey.current_step,
        next_action_message: journey.next_action_message,
        next_action_url: journey.next_action_url,
        campaign_id: journey.campaign_id,
        proposal_data: journey.proposal_data,
        progress,
        steps
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching by token:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar jornada'
    });
  }
});

/**
 * GET /api/aic/journey/me
 * Obter jornada do cliente autenticado (via Supabase Auth)
 */
router.get('/me', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario nao autenticado'
      });
    }

    const journey = await clientJourneyService.getJourneyByUserId(userId);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma jornada encontrada para este usuario'
      });
    }

    // Calcular progresso e etapas
    const progress = clientJourneyService.getProgress(journey.current_step as JourneyStep);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as JourneyStep);

    return res.json({
      success: true,
      journey: {
        ...journey,
        progress,
        steps
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching user journey:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar jornada'
    });
  }
});

/**
 * POST /api/aic/journey/link-user
 * Vincular jornada ao usuario autenticado via access_token
 * Usado apos o cliente criar conta ou fazer login com convite
 */
router.post('/link-user', async (req: Request, res: Response) => {
  try {
    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(400).json({
        success: false,
        message: 'user_id e token sao obrigatorios'
      });
    }

    const result = await clientJourneyService.linkUserToJourney(token, user_id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Calcular progresso para retornar
    if (result.journey) {
      const progress = clientJourneyService.getProgress(result.journey.current_step as JourneyStep);
      const steps = clientJourneyService.getStepsWithStatus(result.journey.current_step as JourneyStep);

      return res.json({
        success: true,
        message: result.message,
        journey: {
          ...result.journey,
          progress,
          steps
        }
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error linking user:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao vincular usuario'
    });
  }
});

// ============================================
// ROTAS AUTENTICADAS (admin)
// ============================================

/**
 * POST /api/aic/journey
 * Criar nova jornada do cliente
 * Body pode incluir send_invite: true para enviar email automaticamente
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      delivery_id,
      client_name,
      client_email,
      client_phone,
      client_document,
      client_company,
      proposal_data,
      created_by,
      send_invite = false // Enviar convite por email
    } = req.body;

    if (!client_name || !client_email) {
      return res.status(400).json({
        success: false,
        message: 'Nome e email do cliente sao obrigatorios'
      });
    }

    const result = await clientJourneyService.createJourney({
      delivery_id,
      client_name,
      client_email: client_email.toLowerCase(),
      client_phone,
      client_document,
      client_company,
      proposal_data,
      created_by
    });

    if (!result.success || !result.journey) {
      return res.status(400).json(result);
    }

    // Gerar link de convite
    const invite_link = clientJourneyService.generateInviteLink(result.journey.access_token);

    // Enviar email de convite se solicitado
    let email_sent = false;
    let email_message = '';

    if (send_invite) {
      const inviteResult = await clientInviteService.sendInviteEmail({
        client_name,
        client_email: client_email.toLowerCase(),
        access_token: result.journey.access_token,
        journey_id: result.journey.id,
        project_name: proposal_data?.project_name,
        company_name: client_company
      });
      email_sent = inviteResult.email_sent || false;
      email_message = inviteResult.message;
    }

    return res.status(201).json({
      ...result,
      invite_link,
      email_sent,
      email_message: send_invite ? email_message : undefined
    });
  } catch (error) {
    console.error('[Journey Routes] Error creating journey:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar jornada'
    });
  }
});

/**
 * POST /api/aic/journey/:id/resend-invite
 * Reenviar email de convite para uma jornada existente
 */
router.post('/:id/resend-invite', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientInviteService.resendInvite(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error resending invite:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao reenviar convite'
    });
  }
});

/**
 * GET /api/aic/journey
 * Listar jornadas com filtros
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { current_step, client_email, campaign_id, limit, offset } = req.query;

    const journeys = await clientJourneyService.listJourneys({
      current_step: current_step as JourneyStep,
      client_email: client_email as string,
      campaign_id: campaign_id as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0
    });

    return res.json({
      success: true,
      journeys,
      count: journeys.length
    });
  } catch (error) {
    console.error('[Journey Routes] Error listing journeys:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar jornadas'
    });
  }
});

/**
 * GET /api/aic/journey/by-email/:email
 * Obter jornada por email do cliente
 */
router.get('/by-email/:email', async (req: Request, res: Response) => {
  try {
    const email = getParam(req, 'email');

    const journey = await clientJourneyService.getJourneyByEmail(email);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada'
      });
    }

    const progress = clientJourneyService.getProgress(journey.current_step as JourneyStep);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as JourneyStep);

    return res.json({
      success: true,
      journey: {
        ...journey,
        progress,
        steps
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching by email:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar jornada'
    });
  }
});

/**
 * GET /api/aic/journey/by-delivery/:deliveryId
 * Obter jornada por delivery_id
 */
router.get('/by-delivery/:deliveryId', async (req: Request, res: Response) => {
  try {
    const deliveryId = getParam(req, 'deliveryId');

    const journey = await clientJourneyService.getJourneyByDeliveryId(deliveryId);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada para esta entrega'
      });
    }

    const progress = clientJourneyService.getProgress(journey.current_step as JourneyStep);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as JourneyStep);

    return res.json({
      success: true,
      journey: {
        ...journey,
        progress,
        steps
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching by delivery:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar jornada'
    });
  }
});

/**
 * GET /api/aic/journey/:id
 * Obter jornada por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const journey = await clientJourneyService.getJourneyById(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada'
      });
    }

    const progress = clientJourneyService.getProgress(journey.current_step as JourneyStep);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as JourneyStep);

    return res.json({
      success: true,
      journey: {
        ...journey,
        progress,
        steps
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching journey:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar jornada'
    });
  }
});

/**
 * PATCH /api/aic/journey/:id/advance
 * Avancar para proxima etapa
 */
router.patch('/:id/advance', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const { target_step } = req.body;

    const result = await clientJourneyService.advanceStep(id, target_step);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error advancing step:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao avancar etapa'
    });
  }
});

/**
 * PATCH /api/aic/journey/:id/set-step
 * Definir etapa especifica (forcado)
 */
router.patch('/:id/set-step', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const { step, ...additionalData } = req.body;

    if (!step) {
      return res.status(400).json({
        success: false,
        message: 'Etapa nao informada'
      });
    }

    const result = await clientJourneyService.setStep(id, step as JourneyStep, additionalData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error setting step:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao definir etapa'
    });
  }
});

/**
 * POST /api/aic/journey/:id/link-contract
 * Vincular contrato e criar campanha automaticamente
 */
router.post('/:id/link-contract', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const {
      contract_id,
      client_name,
      client_email,
      client_phone,
      client_document,
      client_company,
      project_name,
      target_niche,
      service_description,
      target_audience,
      contract_value,
      lead_value
    } = req.body;

    if (!contract_id) {
      return res.status(400).json({
        success: false,
        message: 'ID do contrato nao informado'
      });
    }

    const result = await clientJourneyService.linkContractAndCreateCampaign(id, contract_id, {
      client_name,
      client_email,
      client_phone,
      client_document,
      client_company,
      project_name,
      target_niche,
      service_description,
      target_audience,
      contract_value,
      lead_value
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error linking contract:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao vincular contrato'
    });
  }
});

/**
 * POST /api/aic/journey/:id/notify-payment
 * Cliente notifica que realizou o pagamento (aguarda confirmacao do admin)
 */
router.post('/:id/notify-payment', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const { payment_proof, notified_at } = req.body;

    const journey = await clientJourneyService.getJourneyById(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada'
      });
    }

    // Atualizar journey com notificacao de pagamento
    // Nao muda o step ainda - admin precisa confirmar
    const { supabaseAdmin } = await import('../config/database');
    const { error } = await supabaseAdmin
      .from('aic_client_journeys')
      .update({
        payment_notified_at: notified_at || new Date().toISOString(),
        payment_proof: payment_proof || null,
        next_action_message: 'Pagamento em analise. Voce recebera um email quando confirmado.'
      })
      .eq('id', id);

    if (error) {
      console.error('[Journey Routes] Error notifying payment:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao notificar pagamento'
      });
    }

    // TODO: Enviar notificacao para admin via Telegram/Email

    console.log(`[Journey Routes] Payment notified for journey ${id}`);

    return res.json({
      success: true,
      message: 'Pagamento notificado com sucesso. Aguarde confirmacao.'
    });
  } catch (error) {
    console.error('[Journey Routes] Error notifying payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao notificar pagamento'
    });
  }
});

/**
 * POST /api/aic/journey/:id/confirm-payment
 * Confirmar pagamento (admin)
 */
router.post('/:id/confirm-payment', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientJourneyService.confirmPayment(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error confirming payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao confirmar pagamento'
    });
  }
});

/**
 * POST /api/aic/journey/:id/credentials-complete
 * Marcar credenciais como configuradas
 */
router.post('/:id/credentials-complete', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientJourneyService.markCredentialsComplete(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error marking credentials complete:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao marcar credenciais completas'
    });
  }
});

/**
 * POST /api/aic/journey/:id/briefing-complete
 * Marcar briefing como completo
 */
router.post('/:id/briefing-complete', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientJourneyService.markBriefingComplete(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error marking briefing complete:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao marcar briefing completo'
    });
  }
});

/**
 * POST /api/aic/journey/:id/activate-campaign
 * Ativar campanha
 */
router.post('/:id/activate-campaign', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientJourneyService.activateCampaign(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error activating campaign:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao ativar campanha'
    });
  }
});

/**
 * POST /api/aic/journey/:id/complete-campaign
 * Concluir campanha
 */
router.post('/:id/complete-campaign', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const result = await clientJourneyService.completeCampaign(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[Journey Routes] Error completing campaign:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao concluir campanha'
    });
  }
});

/**
 * GET /api/aic/journey/:id/can-access/:step
 * Verificar se pode acessar determinada etapa
 */
router.get('/:id/can-access/:step', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const step = getParam(req, 'step');

    const journey = await clientJourneyService.getJourneyById(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada'
      });
    }

    const canAccess = clientJourneyService.canAccessStep(
      journey.current_step as JourneyStep,
      step as JourneyStep
    );

    return res.json({
      success: true,
      can_access: canAccess,
      current_step: journey.current_step,
      requested_step: step
    });
  } catch (error) {
    console.error('[Journey Routes] Error checking access:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar acesso'
    });
  }
});

export default router;
