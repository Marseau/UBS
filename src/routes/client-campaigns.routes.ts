/**
 * Client Campaigns Routes
 * APIs para gerenciar campanhas do cliente AIC
 * Modelo multi-campanha: cliente pode ter N campanhas
 */

import { Router, Request, Response } from 'express';
import { authenticateClient, ClientRequest } from '../middleware/client-auth.middleware';
import { supabaseAdmin } from '../config/database';

const router = Router();

// Mapeamento de current_step para status de grupo
const STEP_TO_GROUP: Record<string, string> = {
  'proposta_enviada': 'setup',
  'proposta_visualizada': 'setup',
  'contrato_enviado': 'setup',
  'contrato_assinado': 'setup',
  'pagamento_pendente': 'pending',
  'pagamento_confirmado': 'setup',
  'credenciais_pendente': 'setup',
  'credenciais_ok': 'setup',
  'briefing_pendente': 'setup',
  'briefing_completo': 'setup',
  'onboarding_pendente': 'setup',
  'onboarding_completo': 'setup',
  'campanha_ativa': 'active',
  'campanha_concluida': 'completed'
};

// Mapeamento de step para progresso
const STEP_TO_PROGRESS: Record<string, number> = {
  'proposta_enviada': 10,
  'proposta_visualizada': 15,
  'contrato_enviado': 25,
  'contrato_assinado': 35,
  'pagamento_pendente': 40,
  'pagamento_confirmado': 50,
  'credenciais_pendente': 55,
  'credenciais_ok': 60,
  'briefing_pendente': 65,
  'briefing_completo': 70,
  'onboarding_pendente': 80,
  'onboarding_completo': 90,
  'campanha_ativa': 95,
  'campanha_concluida': 100
};

/**
 * GET /api/aic/campaigns/me
 * Lista campanhas do cliente autenticado
 */
router.get('/me', authenticateClient, async (req: ClientRequest, res: Response) => {
  try {
    const userId = req.clientUser?.id;
    const userEmail = req.clientUser?.email;

    if (!userId && !userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Usuario nao autenticado'
      });
    }

    // Buscar jornadas do usuario (por auth_user_id ou email)
    let query = supabaseAdmin
      .from('aic_client_journeys')
      .select(`
        id,
        client_name,
        client_email,
        client_company,
        current_step,
        campaign_id,
        proposal_data,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    // Filtrar por usuario ou email
    if (userId) {
      query = query.eq('auth_user_id', userId);
    } else if (userEmail) {
      query = query.eq('client_email', userEmail.toLowerCase());
    }

    const { data: journeys, error } = await query;

    if (error) {
      console.error('[Client Campaigns] Error fetching campaigns:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar campanhas'
      });
    }

    // Buscar info adicional das campanhas (cluster_campaigns)
    const campaignIds = journeys
      ?.filter(j => j.campaign_id)
      .map(j => j.campaign_id) || [];

    let campaignDetails: Record<string, any> = {};

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabaseAdmin
        .from('cluster_campaigns')
        .select('id, campaign_name, project_name, onboarding_status, pipeline_status')
        .in('id', campaignIds);

      if (campaigns) {
        campaignDetails = campaigns.reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Formatar resposta
    const campaigns = journeys?.map(j => {
      const campaignInfo = j.campaign_id ? campaignDetails[j.campaign_id] : null;
      const step = j.current_step || 'proposta_enviada';

      return {
        id: j.id,
        campaign_name: campaignInfo?.campaign_name ||
                       campaignInfo?.project_name ||
                       j.proposal_data?.project_name ||
                       `Campanha ${j.client_company || j.client_name}`,
        client_name: j.client_name,
        client_email: j.client_email,
        client_company: j.client_company,
        current_step: step,
        status_group: STEP_TO_GROUP[step] || 'setup',
        progress: STEP_TO_PROGRESS[step] || 10,
        campaign_id: j.campaign_id,
        onboarding_status: campaignInfo?.onboarding_status,
        pipeline_status: campaignInfo?.pipeline_status,
        created_at: j.created_at,
        updated_at: j.updated_at
      };
    }) || [];

    return res.json({
      success: true,
      campaigns,
      count: campaigns.length
    });
  } catch (error) {
    console.error('[Client Campaigns] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar campanhas'
    });
  }
});

/**
 * GET /api/aic/campaigns/all
 * Lista todas campanhas (admin)
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const { status, client_id, limit = '100', offset = '0' } = req.query;

    // Buscar todas as jornadas
    let query = supabaseAdmin
      .from('aic_client_journeys')
      .select(`
        id,
        client_name,
        client_email,
        client_phone,
        client_company,
        current_step,
        campaign_id,
        auth_user_id,
        proposal_data,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit as string, 10))
      .range(
        parseInt(offset as string, 10),
        parseInt(offset as string, 10) + parseInt(limit as string, 10) - 1
      );

    // Filtrar por client_id (journey id) se fornecido
    if (client_id) {
      query = query.eq('id', client_id);
    }

    const { data: journeys, error } = await query;

    if (error) {
      console.error('[Client Campaigns] Error fetching all campaigns:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar campanhas'
      });
    }

    // Buscar info adicional das campanhas
    const campaignIds = journeys
      ?.filter(j => j.campaign_id)
      .map(j => j.campaign_id) || [];

    let campaignDetails: Record<string, any> = {};

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabaseAdmin
        .from('cluster_campaigns')
        .select('id, campaign_name, project_name, onboarding_status, pipeline_status, outreach_enabled')
        .in('id', campaignIds);

      if (campaigns) {
        campaignDetails = campaigns.reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Formatar resposta
    let campaigns = journeys?.map(j => {
      const campaignInfo = j.campaign_id ? campaignDetails[j.campaign_id] : null;
      const step = j.current_step || 'proposta_enviada';

      return {
        id: j.id,
        campaign_name: campaignInfo?.campaign_name ||
                       campaignInfo?.project_name ||
                       j.proposal_data?.project_name ||
                       `Campanha ${j.client_company || j.client_name}`,
        client_id: j.id, // journey id como client_id para filtro
        client_name: j.client_name,
        client_email: j.client_email,
        client_phone: j.client_phone,
        client_company: j.client_company,
        current_step: step,
        status_group: STEP_TO_GROUP[step] || 'setup',
        progress: STEP_TO_PROGRESS[step] || 10,
        campaign_id: j.campaign_id,
        auth_user_id: j.auth_user_id,
        onboarding_status: campaignInfo?.onboarding_status,
        pipeline_status: campaignInfo?.pipeline_status,
        outreach_enabled: campaignInfo?.outreach_enabled,
        created_at: j.created_at,
        updated_at: j.updated_at
      };
    }) || [];

    // Filtrar por status se fornecido
    if (status) {
      campaigns = campaigns.filter(c => c.status_group === status);
    }

    return res.json({
      success: true,
      campaigns,
      count: campaigns.length
    });
  } catch (error) {
    console.error('[Client Campaigns] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar campanhas'
    });
  }
});

/**
 * GET /api/aic/campaigns/:id
 * Obter detalhes de uma campanha (journey + cluster_campaign)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar journey
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('*')
      .eq('id', id)
      .single();

    if (journeyError || !journey) {
      return res.status(404).json({
        success: false,
        message: 'Campanha nao encontrada'
      });
    }

    // Buscar cluster_campaign se existir
    let campaignDetails: any = null;
    if (journey.campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from('cluster_campaigns')
        .select('*')
        .eq('id', journey.campaign_id)
        .single();

      campaignDetails = campaign;
    }

    const step = journey.current_step || 'proposta_enviada';

    return res.json({
      success: true,
      campaign: {
        // Dados da journey
        id: journey.id,
        client_name: journey.client_name,
        client_email: journey.client_email,
        client_phone: journey.client_phone,
        client_document: journey.client_document,
        client_company: journey.client_company,
        current_step: step,
        status_group: STEP_TO_GROUP[step] || 'setup',
        progress: STEP_TO_PROGRESS[step] || 10,

        // Dados da campanha
        campaign_id: journey.campaign_id,
        campaign_name: campaignDetails?.campaign_name ||
                       campaignDetails?.project_name ||
                       journey.proposal_data?.project_name ||
                       `Campanha ${journey.client_company || journey.client_name}`,

        // Proposta
        proposal_data: journey.proposal_data,
        contract_id: journey.contract_id,

        // Timestamps
        proposta_enviada_at: journey.proposta_enviada_at,
        proposta_visualizada_at: journey.proposta_visualizada_at,
        contrato_enviado_at: journey.contrato_enviado_at,
        contrato_assinado_at: journey.contrato_assinado_at,
        pagamento_pendente_at: journey.pagamento_pendente_at,
        pagamento_confirmado_at: journey.pagamento_confirmado_at,
        briefing_pendente_at: journey.briefing_pendente_at,
        briefing_completo_at: journey.briefing_completo_at,
        campanha_ativa_at: journey.campanha_ativa_at,
        campanha_concluida_at: journey.campanha_concluida_at,

        // Dados da cluster_campaign
        cluster_campaign: campaignDetails ? {
          id: campaignDetails.id,
          campaign_name: campaignDetails.campaign_name,
          project_name: campaignDetails.project_name,
          business_name: campaignDetails.business_name,
          service_description: campaignDetails.service_description,
          target_audience: campaignDetails.target_audience,
          onboarding_status: campaignDetails.onboarding_status,
          pipeline_status: campaignDetails.pipeline_status,
          outreach_enabled: campaignDetails.outreach_enabled,
          total_leads_in_campaign: campaignDetails.total_leads_in_campaign
        } : null,

        created_at: journey.created_at,
        updated_at: journey.updated_at
      }
    });
  } catch (error) {
    console.error('[Client Campaigns] Error fetching campaign:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar campanha'
    });
  }
});

export default router;
