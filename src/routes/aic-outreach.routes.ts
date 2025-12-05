/**
 * AIC Outreach Routes
 *
 * Endpoints para:
 * - Tracking de leads da landing page
 * - Validação de WhatsApp
 * - Fallback para Instagram DM
 * - Estatísticas de outreach
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/aic/outreach/landing-page-click
 * Registra click no botão WhatsApp da landing page
 * Chamado via JavaScript quando usuário clica no botão
 */
router.post('/landing-page-click', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      campaign_id,
      phone,
      name,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      landing_url,
      instagram_post_id
    } = req.body;

    if (!campaign_id || !phone) {
      res.status(400).json({
        success: false,
        error: 'campaign_id e phone são obrigatórios'
      });
      return;
    }

    const { data, error } = await supabase.rpc('register_landing_page_lead', {
      p_campaign_id: campaign_id,
      p_phone: phone,
      p_name: name || null,
      p_utm_source: utm_source || null,
      p_utm_medium: utm_medium || null,
      p_utm_campaign: utm_campaign || null,
      p_utm_content: utm_content || null,
      p_landing_url: landing_url || null,
      p_instagram_post_id: instagram_post_id || null
    });

    if (error) {
      console.error('Erro ao registrar lead landing page:', error);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const result = data?.[0] || data;

    res.json({
      success: true,
      data: {
        lead_id: result?.lead_id,
        is_new: result?.is_new,
        was_cold_outreach: result?.was_cold_outreach,
        message: result?.was_cold_outreach
          ? 'Lead convertido de outreach frio!'
          : result?.is_new
            ? 'Novo lead registrado'
            : 'Lead existente atualizado'
      }
    });
  } catch (error) {
    console.error('Erro landing-page-click:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/outreach/identify-source
 * Identifica a origem de um lead quando recebe mensagem
 */
router.post('/identify-source', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaign_id, phone, message_text } = req.body;

    if (!campaign_id || !phone) {
      res.status(400).json({
        success: false,
        error: 'campaign_id e phone são obrigatórios'
      });
      return;
    }

    const { data, error } = await supabase.rpc('identify_lead_source', {
      p_campaign_id: campaign_id,
      p_phone: phone,
      p_message_text: message_text || null
    });

    if (error) {
      console.error('Erro ao identificar fonte:', error);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const result = data?.[0] || data;

    res.json({
      success: true,
      data: {
        lead_id: result?.lead_id,
        source_type: result?.source_type,
        was_contacted_before: result?.was_contacted_before,
        contact_history: result?.contact_history,
        // Contexto para o AI Agent
        ai_context: getAIContext(result?.source_type, result?.was_contacted_before)
      }
    });
  } catch (error) {
    console.error('Erro identify-source:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/outreach/eligible-leads/:campaignId
 * Retorna leads elegíveis para outreach
 */
router.get('/eligible-leads/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const minHours = parseInt(req.query.min_hours as string) || 24;

    const { data, error } = await supabase.rpc('get_eligible_leads_for_outreach', {
      p_campaign_id: campaignId,
      p_limit: limit,
      p_min_hours_between_contacts: minHours
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: {
        leads: data || [],
        count: data?.length || 0
      }
    });
  } catch (error) {
    console.error('Erro eligible-leads:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/outreach/phones-to-validate/:campaignId
 * Retorna telefones que precisam de validação WhatsApp
 */
router.get('/phones-to-validate/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const { data, error } = await supabase.rpc('get_phones_to_validate', {
      p_campaign_id: campaignId,
      p_limit: limit
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: {
        phones: data || [],
        count: data?.length || 0
      }
    });
  } catch (error) {
    console.error('Erro phones-to-validate:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/outreach/validate-phone
 * Registra resultado de validação de telefone WhatsApp
 */
router.post('/validate-phone', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, phone, is_valid, error: validationError } = req.body;

    if (!lead_id || !phone || is_valid === undefined) {
      res.status(400).json({
        success: false,
        error: 'lead_id, phone e is_valid são obrigatórios'
      });
      return;
    }

    const { data, error } = await supabase.rpc('validate_lead_phone', {
      p_lead_id: lead_id,
      p_phone: phone,
      p_is_valid: is_valid,
      p_error: validationError || null
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Erro validate-phone:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/outreach/instagram-dm-queue/:campaignId
 * Retorna leads para fallback via Instagram DM (sem WhatsApp válido)
 */
router.get('/instagram-dm-queue/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const { data, error } = await supabase.rpc('get_leads_for_instagram_dm', {
      p_campaign_id: campaignId,
      p_limit: limit
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: {
        leads: data || [],
        count: data?.length || 0,
        note: 'Leads sem WhatsApp válido - usar Instagram DM'
      }
    });
  } catch (error) {
    console.error('Erro instagram-dm-queue:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/outreach/stats/:campaignId
 * Estatísticas de outreach da campanha
 */
router.get('/stats/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    const { data, error } = await supabase.rpc('get_campaign_outreach_stats', {
      p_campaign_id: campaignId
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const stats = data?.[0] || data;

    res.json({
      success: true,
      data: {
        ...stats,
        funnel: {
          total: stats?.total_leads || 0,
          contacted: stats?.contacted || 0,
          replied: stats?.replied || 0,
          converted: stats?.converted || 0
        }
      }
    });
  } catch (error) {
    console.error('Erro stats:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/outreach/add-phone
 * Adiciona telefone adicional a um lead
 */
router.post('/add-phone', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, phone } = req.body;

    if (!lead_id || !phone) {
      res.status(400).json({
        success: false,
        error: 'lead_id e phone são obrigatórios'
      });
      return;
    }

    const { data, error } = await supabase.rpc('add_phone_to_lead', {
      p_lead_id: lead_id,
      p_phone: phone
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Erro add-phone:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/outreach/opt-out
 * Lead opta por não receber mais mensagens
 */
router.post('/opt-out', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, campaign_id } = req.body;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'phone é obrigatório'
      });
      return;
    }

    const { data, error } = await supabase.rpc('lead_opt_out', {
      p_phone: phone,
      p_campaign_id: campaign_id || null
    });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({
      success: true,
      data: {
        affected_leads: data,
        message: `${data} lead(s) marcado(s) como opt-out`
      }
    });
  } catch (error) {
    console.error('Erro opt-out:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * Gera contexto para o AI Agent baseado na origem do lead
 */
function getAIContext(sourceType: string | null, wasContactedBefore: boolean): string {
  const contexts: Record<string, string> = {
    'landing_page': 'Este lead veio da landing page clicando no botão WhatsApp. Está quente e interessado. Seja direto e objetivo.',
    'instagram_post': 'Este lead veio de uma publicação do Instagram. Mencione o conteúdo que ele viu e conecte com a oferta.',
    'cold_outreach_reply': 'IMPORTANTE: Este lead está respondendo ao nosso outreach! Ele demonstrou interesse. Agradeça e avance a conversa.',
    'returning_lead': 'Lead que já conversou antes. Consulte o histórico para dar continuidade.',
    'organic_existing': 'Já tínhamos este lead cadastrado mas nunca contatamos. Trate como novo contato.',
    'organic_new': 'Prospect completamente novo. Descubra como ele chegou até nós e qualifique.'
  };

  const defaultContext = 'Prospect completamente novo. Descubra como ele chegou até nós e qualifique.';
  let context: string = contexts[sourceType || 'organic_new'] || defaultContext;

  if (wasContactedBefore && sourceType !== 'cold_outreach_reply') {
    context += ' Já entramos em contato antes - verifique histórico.';
  }

  return context;
}

export default router;
