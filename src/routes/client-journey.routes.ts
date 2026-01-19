/**
 * Client Journey Routes
 * APIs para gerenciar a jornada do cliente AIC
 */

import { Router, Request, Response } from 'express';
import { clientJourneyService, JourneyStep } from '../services/client-journey.service';
import { authenticateClient, ClientRequest } from '../middleware/client-auth.middleware';
import { clientInviteService } from '../services/client-invite.service';
import { proposalPDFService } from '../services/proposal-pdf.service';
import { getWhapiPartnerService } from '../services/whapi-partner.service';

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
    const journeyId = req.query.journey as string || req.query.campaign as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario nao autenticado'
      });
    }

    let journey;
    if (journeyId) {
      // Buscar jornada especifica (verificando que pertence ao usuario)
      journey = await clientJourneyService.getJourneyByIdAndUser(journeyId, userId);
    } else {
      // Buscar jornada padrao do usuario
      journey = await clientJourneyService.getJourneyByUserId(userId);
    }

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
 * POST /api/aic/journey/advance
 * Avancar jornada do cliente autenticado (aceitar proposta, etc.)
 * Usado pelo frontend do cliente para acoes como accept_proposal
 */
router.post('/advance', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const { action, ip, journey_id } = req.body;
    const journeyIdFromQuery = req.query.journey as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario nao autenticado'
      });
    }

    // Buscar jornada do usuario (suporta multi-campanha)
    const targetJourneyId = journey_id || journeyIdFromQuery;
    let journey;

    if (targetJourneyId) {
      // Buscar jornada especifica do usuario
      journey = await clientJourneyService.getJourneyByIdAndUser(targetJourneyId, userId);
    } else {
      // Buscar primeira jornada do usuario
      journey = await clientJourneyService.getJourneyByUserId(userId);
    }

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada'
      });
    }

    // Processar acao
    if (action === 'accept_proposal') {
      // Verificar se esta no step correto
      if (journey.current_step !== 'proposta_enviada' && journey.current_step !== 'proposta_visualizada') {
        return res.status(400).json({
          success: false,
          message: 'Proposta ja foi aceita ou etapa invalida'
        });
      }

      // Gerar PDF da proposta aceita e fazer upload para B2
      const clientIp = ip || req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const acceptedAt = new Date().toISOString();

      try {
        const proposalId = `PROPOSTA-${journey.id.slice(0, 8).toUpperCase()}-${Date.now()}`;

        console.log(`[Journey] Generating proposal PDF for: ${proposalId}`);

        const pdf = await proposalPDFService.generateAndUpload({
          client_name: journey.client_name,
          client_email: journey.client_email,
          client_company: journey.client_company,
          proposal_id: proposalId,
          contract_value: (journey as unknown as { contract_value?: number }).contract_value || journey.proposal_data?.contract_value || 4000,
          lead_value: (journey as unknown as { lead_value?: number }).lead_value || journey.proposal_data?.lead_value || 10,
          accepted_at: acceptedAt,
          accepted_ip: String(clientIp)
        });

        // Atualizar jornada com URL do PDF e avancar step
        const { supabaseAdmin } = await import('../config/database');
        const { error: updateError } = await supabaseAdmin
          .from('aic_client_journeys')
          .update({
            proposal_pdf_url: pdf.url || null,
            proposta_aceita_at: acceptedAt,
            current_step: 'proposta_visualizada',
            next_action_message: 'Proposta aceita! Aguarde o envio do contrato.',
            updated_at: acceptedAt
          })
          .eq('id', journey.id);

        if (updateError) {
          console.error('[Journey] Error updating journey after proposal accept:', updateError);
        } else {
          console.log(`[Journey] Proposal accepted for journey ${journey.id}, PDF URL: ${pdf.url}`);
        }

      } catch (pdfError) {
        console.error('[Journey] Error generating proposal PDF:', pdfError);
        // Continua mesmo sem PDF - aceite ainda e valido
      }

      // Buscar jornada atualizada
      const updatedJourney = await clientJourneyService.getJourneyById(journey.id);
      const progress = clientJourneyService.getProgress(updatedJourney?.current_step as JourneyStep || journey.current_step);
      const steps = clientJourneyService.getStepsWithStatus(updatedJourney?.current_step as JourneyStep || journey.current_step);

      return res.json({
        success: true,
        message: 'Proposta aceita com sucesso',
        journey: {
          ...(updatedJourney || journey),
          progress,
          steps
        }
      });
    }

    // Acao desconhecida
    return res.status(400).json({
      success: false,
      message: `Acao desconhecida: ${action}`
    });

  } catch (error) {
    console.error('[Journey Routes] Error in advance action:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar acao'
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
      current_step,
      contract_value,
      lead_value,
      send_invite = false // Enviar convite por email
    } = req.body;

    if (!client_name || !client_email) {
      return res.status(400).json({
        success: false,
        message: 'Nome e email do cliente sao obrigatorios'
      });
    }

    // Extrair auth_user_id do token se presente (cliente autenticado criando própria jornada)
    let authUserId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const { supabaseAdmin } = await import('../config/database');
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        authUserId = user?.id || null;
        console.log('[Journey Routes] auth_user_id extraído do token:', authUserId);
      } catch (e) {
        console.log('[Journey Routes] Não foi possível extrair user do token:', e);
      }
    }

    const result = await clientJourneyService.createJourney({
      delivery_id,
      client_name,
      client_email: client_email.toLowerCase(),
      client_phone,
      client_document,
      client_company,
      proposal_data: {
        ...proposal_data,
        contract_value: contract_value || proposal_data?.contract_value,
        lead_value: lead_value || proposal_data?.lead_value
      },
      created_by,
      current_step: current_step || 'proposta_enviada',
      auth_user_id: authUserId || undefined  // Vincular ao usuário autenticado
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

// ============================================
// CREDENCIAIS (Portal do Cliente)
// (ANTES de /:id para evitar conflito de rota)
// ============================================

/**
 * GET /api/aic/journey/credentials
 * Obter credenciais da campanha do cliente autenticado
 */
router.get('/credentials', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const journeyId = req.query.journey_id as string;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar jornada do usuario
    let journeyQuery = supabaseAdmin
      .from('aic_client_journeys')
      .select('id, campaign_id')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null);

    if (journeyId) {
      journeyQuery = journeyQuery.eq('id', journeyId);
    }

    const { data: journey, error: journeyError } = await journeyQuery.single();

    if (journeyError || !journey?.campaign_id) {
      return res.json({
        success: true,
        credentials: { whatsapp: null, instagram: null }
      });
    }

    // Buscar credenciais WhatsApp via cluster_campaigns
    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('whapi_channel_uuid')
      .eq('id', journey.campaign_id)
      .single();

    let whatsappData: { phone: string; name: string; status: string } | null = null;
    if (campaign?.whapi_channel_uuid) {
      const { data: channel } = await supabaseAdmin
        .from('whapi_channels')
        .select('phone_number, name, status')
        .eq('id', campaign.whapi_channel_uuid)
        .single();

      if (channel) {
        whatsappData = {
          phone: channel.phone_number,
          name: channel.name,
          status: channel.status
        };
      }
    }

    // Buscar credenciais Instagram
    const { data: igAccount } = await supabaseAdmin
      .from('instagram_accounts')
      .select('instagram_username, status')
      .eq('campaign_id', journey.campaign_id)
      .single();

    const instagramData = igAccount ? {
      username: igAccount.instagram_username,
      status: igAccount.status
    } : null;

    return res.json({
      success: true,
      credentials: {
        whatsapp: whatsappData,
        instagram: instagramData
      }
    });

  } catch (error) {
    console.error('[Journey Routes] Error fetching credentials:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar credenciais' });
  }
});

/**
 * POST /api/aic/journey/credentials/whatsapp
 * Criar canal WhatsApp via Whapi Partner API
 * Retorna QR Code para o cliente escanear
 */
router.post('/credentials/whatsapp', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const { phone } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Numero de telefone obrigatorio' });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar jornada do usuario
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('id, campaign_id, client_name')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null)
      .single();

    if (journeyError || !journey?.campaign_id) {
      return res.status(404).json({ success: false, message: 'Jornada nao encontrada' });
    }

    // Verificar se campanha ja tem canal WhatsApp
    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('whapi_channel_uuid, campaign_name')
      .eq('id', journey.campaign_id)
      .single();

    let channelId = campaign?.whapi_channel_uuid;
    let channelToken: string | undefined;

    if (channelId) {
      // Verificar se canal existente tem token real ou e placeholder
      const { data: existingChannel } = await supabaseAdmin
        .from('whapi_channels')
        .select('api_token, status')
        .eq('id', channelId)
        .single();

      if (existingChannel?.api_token && existingChannel.api_token !== 'pending_configuration') {
        // Canal ja existe com token real - apenas atualizar telefone
        await supabaseAdmin
          .from('whapi_channels')
          .update({
            phone_number: phone,
            updated_at: new Date().toISOString()
          })
          .eq('id', channelId);

        channelToken = existingChannel.api_token;
        console.log(`[Journey Routes] Canal existente atualizado: ${channelId}`);
      } else {
        // Canal existe mas sem token real - precisa criar na Whapi
        channelId = null; // Forcar criacao
      }
    }

    // Se nao tem canal ou canal sem token, criar via Partner API
    if (!channelId) {
      const partnerService = getWhapiPartnerService();
      const channelName = `AIC - ${campaign?.campaign_name || journey.client_name}`;

      console.log(`[Journey Routes] Criando canal Whapi: ${channelName}`);

      const createResult = await partnerService.createChannel({
        name: channelName,
        projectId: process.env.WHAPI_PROJECT_ID || 'zQk0Fsp90x1jGVnqsKZ0',
        phone: phone.replace(/\D/g, '')
      });

      if (!createResult.success || !createResult.channel) {
        console.error('[Journey Routes] Erro ao criar canal Whapi:', createResult.error);
        return res.status(500).json({
          success: false,
          message: `Erro ao criar canal WhatsApp: ${createResult.error || 'Erro desconhecido'}`
        });
      }

      // Salvar canal no banco
      const { data: newChannel, error: channelError } = await supabaseAdmin
        .from('whapi_channels')
        .insert({
          id: createResult.channel.id,
          name: createResult.channel.name,
          channel_id: createResult.channel.id,
          phone_number: phone,
          api_token: createResult.channel.token,
          status: 'pending_qr', // Aguardando QR Code scan
          rate_limit_hourly: 20,
          rate_limit_daily: 120,
          notes: `Criado via Partner API para campanha ${journey.campaign_id}`
        })
        .select('id')
        .single();

      if (channelError) {
        console.error('[Journey Routes] Erro ao salvar canal no banco:', channelError);
        // Canal foi criado na Whapi mas nao salvou - tentar com ID gerado
        const { data: retryChannel, error: retryError } = await supabaseAdmin
          .from('whapi_channels')
          .insert({
            name: createResult.channel.name,
            channel_id: createResult.channel.id,
            phone_number: phone,
            api_token: createResult.channel.token,
            status: 'pending_qr',
            rate_limit_hourly: 20,
            rate_limit_daily: 120
          })
          .select('id')
          .single();

        if (retryError) {
          return res.status(500).json({ success: false, message: 'Erro ao salvar canal no banco' });
        }
        channelId = retryChannel.id;
      } else {
        channelId = newChannel.id;
      }

      channelToken = createResult.channel.token;

      // Vincular ao campaign
      await supabaseAdmin
        .from('cluster_campaigns')
        .update({ whapi_channel_uuid: channelId })
        .eq('id', journey.campaign_id);

      console.log(`[Journey Routes] Canal criado e vinculado: ${channelId}`);
    }

    // Obter QR Code para conexao
    let qrCode: string | undefined;
    if (channelToken) {
      const partnerService = getWhapiPartnerService();
      const qrResult = await partnerService.getChannelQRCode(channelToken);

      if (qrResult.success && qrResult.qrCode) {
        qrCode = qrResult.qrCode;
      } else {
        console.log('[Journey Routes] QR Code nao disponivel (canal pode ja estar conectado)');
      }
    }

    return res.json({
      success: true,
      message: qrCode ? 'Canal criado! Escaneie o QR Code para conectar.' : 'Canal configurado com sucesso',
      channel_id: channelId,
      qr_code: qrCode,
      needs_qr_scan: !!qrCode
    });

  } catch (error) {
    console.error('[Journey Routes] Error saving WhatsApp credentials:', error);
    return res.status(500).json({ success: false, message: 'Erro ao salvar WhatsApp' });
  }
});

/**
 * GET /api/aic/journey/credentials/whatsapp/qr
 * Obter QR Code do canal WhatsApp
 */
router.get('/credentials/whatsapp/qr', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar jornada e canal do usuario
    const { data: journey } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('campaign_id')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null)
      .single();

    if (!journey?.campaign_id) {
      return res.status(404).json({ success: false, message: 'Campanha nao encontrada' });
    }

    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('whapi_channel_uuid')
      .eq('id', journey.campaign_id)
      .single();

    if (!campaign?.whapi_channel_uuid) {
      return res.status(404).json({ success: false, message: 'Canal WhatsApp nao configurado' });
    }

    const { data: channel } = await supabaseAdmin
      .from('whapi_channels')
      .select('api_token, status')
      .eq('id', campaign.whapi_channel_uuid)
      .single();

    if (!channel?.api_token || channel.api_token === 'pending_configuration') {
      return res.status(400).json({ success: false, message: 'Canal sem token configurado' });
    }

    // Se ja esta conectado, nao precisa de QR
    if (channel.status === 'active' || channel.status === 'connected') {
      return res.json({
        success: true,
        connected: true,
        message: 'Canal ja esta conectado'
      });
    }

    // Obter QR Code
    const partnerService = getWhapiPartnerService();
    const qrResult = await partnerService.getChannelQRCode(channel.api_token);

    if (!qrResult.success) {
      return res.json({
        success: false,
        error: qrResult.error || 'QR Code nao disponivel'
      });
    }

    return res.json({
      success: true,
      qr_code: qrResult.qrCode,
      connected: false
    });

  } catch (error) {
    console.error('[Journey Routes] Error getting QR code:', error);
    return res.status(500).json({ success: false, message: 'Erro ao obter QR Code' });
  }
});

/**
 * GET /api/aic/journey/credentials/whatsapp/status
 * Verificar status de conexao do canal WhatsApp
 */
router.get('/credentials/whatsapp/status', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar jornada e canal do usuario
    const { data: journey } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('campaign_id')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null)
      .single();

    if (!journey?.campaign_id) {
      return res.status(404).json({ success: false, message: 'Campanha nao encontrada' });
    }

    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('whapi_channel_uuid')
      .eq('id', journey.campaign_id)
      .single();

    if (!campaign?.whapi_channel_uuid) {
      return res.json({
        success: true,
        configured: false,
        connected: false,
        status: 'not_configured'
      });
    }

    const { data: channel } = await supabaseAdmin
      .from('whapi_channels')
      .select('api_token, status, phone_number')
      .eq('id', campaign.whapi_channel_uuid)
      .single();

    if (!channel?.api_token || channel.api_token === 'pending_configuration') {
      return res.json({
        success: true,
        configured: false,
        connected: false,
        status: 'pending_token'
      });
    }

    // Verificar status real na Whapi
    const partnerService = getWhapiPartnerService();
    const statusResult = await partnerService.getChannelStatus(channel.api_token);

    // Atualizar status no banco se conectou
    if (statusResult.connected && channel.status !== 'active') {
      await supabaseAdmin
        .from('whapi_channels')
        .update({
          status: 'active',
          phone_number: statusResult.phone || channel.phone_number,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign.whapi_channel_uuid);
    }

    return res.json({
      success: true,
      configured: true,
      connected: statusResult.connected,
      status: statusResult.connected ? 'connected' : 'disconnected',
      phone: statusResult.phone || channel.phone_number
    });

  } catch (error) {
    console.error('[Journey Routes] Error checking WhatsApp status:', error);
    return res.status(500).json({ success: false, message: 'Erro ao verificar status' });
  }
});

/**
 * POST /api/aic/journey/credentials/instagram
 * Salvar credenciais Instagram do cliente
 */
router.post('/credentials/instagram', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const { username, password } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username obrigatorio' });
    }

    const { supabaseAdmin } = await import('../config/database');
    const crypto = require('crypto');

    // Buscar jornada do usuario
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('id, campaign_id, client_name')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null)
      .single();

    if (journeyError || !journey?.campaign_id) {
      return res.status(404).json({ success: false, message: 'Jornada nao encontrada' });
    }

    // Verificar se ja existe conta Instagram para esta campanha
    const { data: existingAccount } = await supabaseAdmin
      .from('instagram_accounts')
      .select('id')
      .eq('campaign_id', journey.campaign_id)
      .single();

    // Preparar dados de criptografia para senha
    // Colunas encrypted_password, encryption_iv, encryption_tag sao NOT NULL
    let encryptedData: { encrypted_password: string; encryption_iv: string; encryption_tag: string };

    if (password && password !== '********') {
      // Criptografar senha fornecida
      // Usar SHA-256 para garantir chave de exatamente 32 bytes
      const rawKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-for-dev';
      const encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      encryptedData = {
        encrypted_password: encrypted,
        encryption_iv: iv.toString('hex'),
        encryption_tag: authTag.toString('hex')
      };
    } else {
      // Usar placeholder para campos obrigatorios
      encryptedData = {
        encrypted_password: 'pending_configuration',
        encryption_iv: 'pending',
        encryption_tag: 'pending'
      };
    }

    if (existingAccount) {
      // Atualizar conta existente
      const updateData: Record<string, unknown> = {
        instagram_username: username.replace('@', ''),
        updated_at: new Date().toISOString()
      };

      // Só atualizar criptografia se foi fornecida senha real
      if (password && password !== '********') {
        Object.assign(updateData, encryptedData);
      }

      const { error: updateError } = await supabaseAdmin
        .from('instagram_accounts')
        .update(updateData)
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('[Journey Routes] Error updating Instagram account:', updateError);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar conta Instagram' });
      }
    } else {
      // Criar nova conta - todos os campos NOT NULL sao obrigatorios
      const { error: insertError } = await supabaseAdmin
        .from('instagram_accounts')
        .insert({
          campaign_id: journey.campaign_id,
          account_name: `IG - ${journey.client_name}`,
          instagram_username: username.replace('@', ''),
          status: 'pending_verification',
          max_dms_per_day: 80,
          max_follows_per_day: 100,
          max_unfollows_per_day: 50,
          max_follows_per_hour: 15,
          allowed_hours_start: 9,
          allowed_hours_end: 18,
          allowed_days: [1, 2, 3, 4, 5],
          encrypted_password: encryptedData.encrypted_password,
          encryption_iv: encryptedData.encryption_iv,
          encryption_tag: encryptedData.encryption_tag
        });

      if (insertError) {
        console.error('[Journey Routes] Error creating Instagram account:', insertError);
        return res.status(500).json({ success: false, message: 'Erro ao criar conta Instagram' });
      }
    }

    return res.json({
      success: true,
      message: 'Instagram salvo com sucesso'
    });

  } catch (error) {
    console.error('[Journey Routes] Error saving Instagram credentials:', error);
    return res.status(500).json({ success: false, message: 'Erro ao salvar Instagram' });
  }
});

/**
 * POST /api/aic/journey/complete-credentials
 * Marcar credenciais como completas (cliente autenticado)
 */
router.post('/complete-credentials', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario nao autenticado' });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar jornada do usuario
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('id, campaign_id')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null)
      .single();

    if (journeyError || !journey) {
      return res.status(404).json({ success: false, message: 'Jornada nao encontrada' });
    }

    // Verificar se ambas credenciais foram configuradas
    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('whapi_channel_uuid')
      .eq('id', journey.campaign_id)
      .single();

    const { data: igAccount } = await supabaseAdmin
      .from('instagram_accounts')
      .select('id')
      .eq('campaign_id', journey.campaign_id)
      .single();

    if (!campaign?.whapi_channel_uuid || !igAccount) {
      return res.status(400).json({
        success: false,
        message: 'Configure WhatsApp e Instagram antes de continuar'
      });
    }

    // Atualizar jornada
    const { error: updateError } = await supabaseAdmin
      .from('aic_client_journeys')
      .update({
        current_step: 'briefing_pendente',
        credenciais_ok_at: new Date().toISOString(),
        briefing_pendente_at: new Date().toISOString(),
        next_action_message: 'Preencher briefing da campanha',
        next_action_url: '/cliente/briefing',
        updated_at: new Date().toISOString()
      })
      .eq('id', journey.id);

    if (updateError) {
      console.error('[Journey Routes] Error updating journey:', updateError);
      return res.status(500).json({ success: false, message: 'Erro ao atualizar jornada' });
    }

    return res.json({
      success: true,
      message: 'Credenciais configuradas com sucesso',
      nextStep: '/cliente/briefing'
    });

  } catch (error) {
    console.error('[Journey Routes] Error completing credentials:', error);
    return res.status(500).json({ success: false, message: 'Erro ao completar credenciais' });
  }
});

// ============================================
// LEADS ENTREGUES (Portal do Cliente)
// (ANTES de /:id para evitar conflito de rota)
// ============================================

/**
 * GET /api/aic/journey/leads/delivered
 * Listar leads entregues para o cliente autenticado
 * Filtro opcional: ?campaign_id=UUID
 */
router.get('/leads/delivered', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const campaignIdFilter = req.query.campaign_id as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario nao autenticado'
      });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar campanhas do usuario atraves das jornadas
    const { data: journeys, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('campaign_id')
      .eq('auth_user_id', userId)
      .not('campaign_id', 'is', null);

    if (journeyError) {
      console.error('[Journey Routes] Error fetching user journeys:', journeyError);
      return res.status(500).json({ success: false, message: 'Erro ao buscar campanhas' });
    }

    const campaignIds = journeys?.map(j => j.campaign_id).filter(Boolean) || [];

    if (campaignIds.length === 0) {
      return res.json({
        success: true,
        leads: [],
        total: 0,
        message: 'Nenhuma campanha encontrada para este usuario'
      });
    }

    // Aplicar filtro de campanha se fornecido
    let targetCampaigns = campaignIds;
    if (campaignIdFilter && campaignIds.includes(campaignIdFilter)) {
      targetCampaigns = [campaignIdFilter];
    }

    // Buscar leads entregues das campanhas do cliente
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('aic_lead_deliveries')
      .select(`
        id,
        campaign_id,
        lead_name,
        lead_whatsapp,
        lead_email,
        lead_instagram,
        delivery_value,
        meeting_scheduled_at,
        invoice_id,
        created_at
      `)
      .in('campaign_id', targetCampaigns)
      .order('created_at', { ascending: false });

    if (leadsError) {
      console.error('[Journey Routes] Error fetching delivered leads:', leadsError);
      return res.status(500).json({ success: false, message: 'Erro ao buscar leads' });
    }

    return res.json({
      success: true,
      leads: leads || [],
      total: leads?.length || 0
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching delivered leads:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar leads entregues'
    });
  }
});

// ============================================
// PAGAMENTOS UNIFICADOS POR CAMPANHA
// (Movido para ANTES de /:id para evitar conflito de rota)
// ============================================

/**
 * GET /api/aic/journey/payments
 * Listar todos os pagamentos agrupados por campanha
 */
router.get('/payments', async (req: Request, res: Response) => {
  try {
    const { campaign_id, status, type } = req.query;
    const { supabaseAdmin } = await import('../config/database');

    let query = supabaseAdmin
      .from('aic_campaign_payments')
      .select(`
        *,
        campaign:cluster_campaigns(id, campaign_name, nicho_principal),
        journey:aic_client_journeys(id, client_name, client_email)
      `)
      .order('due_date', { ascending: true });

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (type) {
      query = query.eq('type', type);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error('[Journey Routes] Error fetching payments:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar pagamentos' });
    }

    // Agrupar por campanha
    const grouped: Record<string, any> = {};
    for (const payment of payments || []) {
      const campId = payment.campaign_id;
      if (!grouped[campId]) {
        grouped[campId] = {
          campaign_id: campId,
          campaign_name: payment.campaign?.campaign_name || 'Campanha',
          nicho: payment.campaign?.nicho_principal,
          payments: [],
          totals: {
            total: 0,
            confirmed: 0,
            pending: 0
          }
        };
      }

      // Adicionar nome do cliente no payment para o frontend
      const paymentWithClient = {
        ...payment,
        journey_client_name: payment.journey?.client_name || null
      };
      grouped[campId].payments.push(paymentWithClient);

      // Calcular totais
      const amount = parseFloat(payment.amount) || 0;
      grouped[campId].totals.total += amount;
      if (payment.status === 'confirmed') {
        grouped[campId].totals.confirmed += amount;
      } else if (payment.status !== 'cancelled' && payment.status !== 'rejected') {
        grouped[campId].totals.pending += amount;
      }
    }

    return res.json({
      success: true,
      campaigns: Object.values(grouped),
      total_payments: payments?.length || 0
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching payments:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar pagamentos' });
  }
});

/**
 * GET /api/aic/journey/payments/pending
 * Listar pagamentos pendentes de validacao (submitted)
 */
router.get('/payments/pending', async (req: Request, res: Response) => {
  try {
    const { supabaseAdmin } = await import('../config/database');

    const { data: payments, error } = await supabaseAdmin
      .from('aic_campaign_payments')
      .select(`
        *,
        campaign:cluster_campaigns(id, campaign_name),
        journey:aic_client_journeys(id, client_name, client_email)
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('[Journey Routes] Error fetching pending payments:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar pagamentos' });
    }

    return res.json({
      success: true,
      payments: payments || [],
      count: payments?.length || 0
    });
  } catch (error) {
    console.error('[Journey Routes] Error fetching pending payments:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar pagamentos' });
  }
});

/**
 * POST /api/aic/journey/payments/create-invoice
 * Criar fatura de leads para uma campanha
 */
router.post('/payments/create-invoice', async (req: Request, res: Response) => {
  try {
    const { campaign_id, delivery_id, amount, description, due_date } = req.body;
    const { supabaseAdmin } = await import('../config/database');

    if (!campaign_id || !amount) {
      return res.status(400).json({ success: false, message: 'campaign_id e amount sao obrigatorios' });
    }

    // Gerar numero da fatura
    const { count } = await supabaseAdmin
      .from('aic_campaign_payments')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'lead_invoice');

    const invoiceNumber = `INV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data: invoice, error } = await supabaseAdmin
      .from('aic_campaign_payments')
      .insert({
        campaign_id,
        delivery_id: delivery_id || null,
        type: 'lead_invoice',
        invoice_number: invoiceNumber,
        description: description || 'Fatura de leads entregues',
        amount,
        due_date: due_date || new Date().toISOString().split('T')[0],
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('[Journey Routes] Error creating invoice:', error);
      return res.status(500).json({ success: false, message: 'Erro ao criar fatura' });
    }

    return res.json({
      success: true,
      invoice,
      message: `Fatura ${invoiceNumber} criada com sucesso`
    });
  } catch (error) {
    console.error('[Journey Routes] Error creating invoice:', error);
    return res.status(500).json({ success: false, message: 'Erro ao criar fatura' });
  }
});

/**
 * POST /api/aic/journey/payments/:id/confirm
 * Confirmar um pagamento especifico
 */
router.post('/payments/:id/confirm', async (req: Request, res: Response) => {
  try {
    const paymentId = getParam(req, 'id');
    const { confirmed_by } = req.body;
    const { supabaseAdmin } = await import('../config/database');

    // Buscar o pagamento
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('aic_campaign_payments')
      .select('*, journey:aic_client_journeys(id, current_step)')
      .eq('id', paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ success: false, message: 'Pagamento nao encontrado' });
    }

    // Atualizar o pagamento
    const { error: updateError } = await supabaseAdmin
      .from('aic_campaign_payments')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmed_by || 'admin'
      })
      .eq('id', paymentId);

    if (updateError) {
      console.error('[Journey Routes] Error confirming payment:', updateError);
      return res.status(500).json({ success: false, message: 'Erro ao confirmar pagamento' });
    }

    // Verificar se todas as parcelas do contrato foram pagas
    if (payment.type === 'contract_installment' && payment.journey_id) {
      const { data: allPayments } = await supabaseAdmin
        .from('aic_campaign_payments')
        .select('status')
        .eq('campaign_id', payment.campaign_id)
        .eq('type', 'contract_installment');

      const allConfirmed = allPayments?.every(p => p.status === 'confirmed');

      if (allConfirmed) {
        // Atualizar journey para pagamento_confirmado
        await supabaseAdmin
          .from('aic_client_journeys')
          .update({
            current_step: 'pagamento_confirmado',
            next_action_message: 'Pagamento confirmado! Configure suas credenciais.'
          })
          .eq('id', payment.journey_id);
      }

      // Atualizar total_paid na journey
      const { data: confirmedPayments } = await supabaseAdmin
        .from('aic_campaign_payments')
        .select('amount')
        .eq('campaign_id', payment.campaign_id)
        .eq('type', 'contract_installment')
        .eq('status', 'confirmed');

      const totalPaid = confirmedPayments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;

      await supabaseAdmin
        .from('aic_client_journeys')
        .update({ total_paid: totalPaid })
        .eq('id', payment.journey_id);
    }

    console.log(`[Journey Routes] Payment ${paymentId} confirmed`);

    return res.json({
      success: true,
      message: 'Pagamento confirmado com sucesso'
    });
  } catch (error) {
    console.error('[Journey Routes] Error confirming payment:', error);
    return res.status(500).json({ success: false, message: 'Erro ao confirmar pagamento' });
  }
});

/**
 * POST /api/aic/journey/payments/:id/reject
 * Rejeitar um pagamento
 */
router.post('/payments/:id/reject', async (req: Request, res: Response) => {
  try {
    const paymentId = getParam(req, 'id');
    const { reason } = req.body;
    const { supabaseAdmin } = await import('../config/database');

    // Buscar pagamento para resetar status
    const { data: payment } = await supabaseAdmin
      .from('aic_campaign_payments')
      .select('journey_id')
      .eq('id', paymentId)
      .single();

    const { error } = await supabaseAdmin
      .from('aic_campaign_payments')
      .update({
        status: 'pending', // Volta para pendente para o cliente reenviar
        rejection_reason: reason || 'Comprovante invalido',
        payment_proof_url: null,
        submitted_at: null
      })
      .eq('id', paymentId);

    if (error) {
      console.error('[Journey Routes] Error rejecting payment:', error);
      return res.status(500).json({ success: false, message: 'Erro ao rejeitar pagamento' });
    }

    // Atualizar journey se for parcela de contrato
    if (payment?.journey_id) {
      await supabaseAdmin
        .from('aic_client_journeys')
        .update({
          current_step: 'contrato_assinado',
          next_action_message: `Pagamento rejeitado: ${reason || 'Comprovante invalido'}. Por favor, envie novamente.`,
          payment_submitted_at: null,
          payment_proof_url: null
        })
        .eq('id', payment.journey_id);
    }

    return res.json({
      success: true,
      message: 'Pagamento rejeitado. Cliente sera notificado.'
    });
  } catch (error) {
    console.error('[Journey Routes] Error rejecting payment:', error);
    return res.status(500).json({ success: false, message: 'Erro ao rejeitar pagamento' });
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
 * POST /api/aic/journey/submit-payment
 * Cliente envia comprovante de pagamento (self-service)
 * Aceita journey_id via query ?journey=ID ou body { journey_id }
 * Atualiza a tabela aic_journey_payments e a journey
 */
router.post('/submit-payment', async (req: Request, res: Response) => {
  try {
    const journeyId = req.query.journey as string || req.body.journey_id;
    const { payment_proof_url, payment_notes, installment_number } = req.body;

    if (!journeyId) {
      return res.status(400).json({
        success: false,
        message: 'ID da jornada é obrigatório'
      });
    }

    const journey = await clientJourneyService.getJourneyById(journeyId);
    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada não encontrada'
      });
    }

    const { supabaseAdmin } = await import('../config/database');

    // Buscar próxima parcela pendente ou a especificada
    let query = supabaseAdmin
      .from('aic_journey_payments')
      .select('*')
      .eq('journey_id', journeyId)
      .eq('status', 'pending')
      .order('installment_number', { ascending: true });

    if (installment_number) {
      query = query.eq('installment_number', installment_number);
    }

    const { data: pendingPayments, error: fetchError } = await query.limit(1);

    if (fetchError || !pendingPayments || pendingPayments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma parcela pendente encontrada'
      });
    }

    const payment = pendingPayments[0];

    // Atualizar a parcela com o comprovante
    const { error: updateError } = await supabaseAdmin
      .from('aic_journey_payments')
      .update({
        status: 'submitted',
        payment_proof_url: payment_proof_url || null,
        payment_notes: payment_notes || null,
        submitted_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    if (updateError) {
      console.error('[Journey Routes] Error updating payment:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar comprovante'
      });
    }

    // Atualizar journey para pagamento_pendente (compatibilidade)
    await supabaseAdmin
      .from('aic_client_journeys')
      .update({
        payment_submitted_at: new Date().toISOString(),
        payment_proof_url: payment_proof_url || null,
        payment_notes: payment_notes || null,
        payment_amount: payment.amount,
        payment_installment: payment.installment_number,
        current_step: 'pagamento_pendente',
        next_action_message: 'Pagamento em análise. Você receberá uma notificação quando confirmado.'
      })
      .eq('id', journeyId);

    // SINCRONIZAR: Atualizar também aic_campaign_payments (para o dashboard financeiro)
    // Buscar a journey para pegar o campaign_id
    const { data: journeyForSync } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('campaign_id')
      .eq('id', journeyId)
      .single();

    if (journeyForSync?.campaign_id) {
      // Atualizar o pagamento correspondente em aic_campaign_payments
      const { error: syncError } = await supabaseAdmin
        .from('aic_campaign_payments')
        .update({
          status: 'submitted',
          payment_proof_url: payment_proof_url || null,
          payment_notes: payment_notes || null,
          submitted_at: new Date().toISOString()
        })
        .eq('campaign_id', journeyForSync.campaign_id)
        .eq('type', 'contract_installment')
        .eq('installment_number', payment.installment_number)
        .eq('status', 'pending');

      if (syncError) {
        console.warn('[Journey Routes] Warning: Could not sync to aic_campaign_payments:', syncError);
      } else {
        console.log(`[Journey Routes] Synced payment to aic_campaign_payments for campaign ${journeyForSync.campaign_id}`);
      }
    }

    console.log(`[Journey Routes] Payment submitted for journey ${journeyId}: R$ ${payment.amount} (parcela ${payment.installment_number})`);

    return res.json({
      success: true,
      message: 'Comprovante enviado com sucesso. Aguarde a confirmação.',
      payment: {
        id: payment.id,
        amount: payment.amount,
        installment: payment.installment_number,
        due_date: payment.due_date
      }
    });
  } catch (error) {
    console.error('[Journey Routes] Error submitting payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar comprovante'
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
