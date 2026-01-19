/**
 * Landing Lead Routes
 *
 * API para captura de leads da landing page
 *
 * Endpoints:
 * - POST /api/landing/capture - Captura lead e retorna WhatsApp para redirect
 * - GET /api/landing/campaign/:campaignId - Info da campanha para widget
 */

import { Router, Request, Response } from 'express';
import { getLandingLeadCaptureService, LandingLeadInput } from '../services/landing-lead-capture.service';

const router = Router();

/**
 * POST /api/landing/capture
 * Captura lead da landing page
 *
 * Body:
 * {
 *   campaignId: string,
 *   name: string,
 *   email: string,
 *   whatsapp: string,
 *   instagramUsername: string,
 *   utmParams?: { utm_source, utm_medium, utm_campaign, utm_content, utm_term }
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   isExistingLead: boolean,
 *   redirectWhatsapp: string,
 *   whatsappMessage: string,
 *   redirectUrl: string // URL completa do wa.me
 * }
 */
router.post('/capture', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, name, email, whatsapp, instagramUsername, utmParams } = req.body;

    // Validações
    if (!campaignId) {
      res.status(400).json({ success: false, error: 'campaignId é obrigatório' });
      return;
    }

    if (!name || !email || !whatsapp) {
      res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: name, email, whatsapp'
      });
      return;
    }

    // Validar formato do Instagram username (se fornecido)
    let username = '';
    if (instagramUsername) {
      username = instagramUsername.replace(/^@/, '').trim();
      if (username && !/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
        res.status(400).json({ success: false, error: 'Instagram username inválido' });
        return;
      }
    }

    // Validar formato do WhatsApp (números brasileiros)
    const whatsappClean = whatsapp.replace(/\D/g, '');
    if (whatsappClean.length < 10 || whatsappClean.length > 13) {
      res.status(400).json({ success: false, error: 'Número de WhatsApp inválido' });
      return;
    }

    // Capturar lead
    const service = getLandingLeadCaptureService();
    const result = await service.captureLead({
      campaignId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      whatsapp: whatsappClean,
      instagramUsername: username,
      utmParams
    });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    // Montar URL de redirect
    const redirectUrl = `https://wa.me/${result.redirectWhatsapp}?text=${encodeURIComponent(result.whatsappMessage || '')}`;

    res.json({
      success: true,
      isExistingLead: result.isExistingLead,
      leadId: result.leadId,
      redirectWhatsapp: result.redirectWhatsapp,
      whatsappMessage: result.whatsappMessage,
      redirectUrl
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao processar lead' });
  }
});

/**
 * GET /api/landing/campaign/:campaignId
 * Retorna info pública da campanha para configurar o widget
 *
 * Response:
 * {
 *   success: boolean,
 *   campaign: {
 *     id: string,
 *     name: string,
 *     hasWhatsapp: boolean
 *   }
 * }
 */
router.get('/campaign/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      res.status(400).json({ success: false, error: 'campaignId é obrigatório' });
      return;
    }

    // Usar o serviço para buscar info (não expõe WhatsApp diretamente)
    const service = getLandingLeadCaptureService();

    // Buscar campanha diretamente para info pública
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data, error } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, whapi_channel_uuid, status')
      .eq('id', campaignId)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Campanha não encontrada' });
      return;
    }

    res.json({
      success: true,
      campaign: {
        id: data.id,
        name: data.campaign_name,
        status: data.status,
        hasWhatsapp: !!data.whapi_channel_uuid
      }
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao buscar campanha:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/landing/check-lead
 * Verifica se um username já existe em alguma campanha ativa
 * (útil para verificação rápida sem capturar)
 *
 * Body:
 * {
 *   instagramUsername: string,
 *   campaignId?: string // opcional - se informado, verifica só nessa campanha
 * }
 */
router.post('/check-lead', async (req: Request, res: Response): Promise<void> => {
  try {
    const { instagramUsername, campaignId } = req.body;

    if (!instagramUsername) {
      res.status(400).json({ success: false, error: 'instagramUsername é obrigatório' });
      return;
    }

    const username = instagramUsername.replace(/^@/, '').toLowerCase().trim();

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Buscar lead
    let query = supabase
      .from('campaign_leads')
      .select(`
        id,
        campaign_id,
        status,
        instagram_leads!inner(username, full_name),
        cluster_campaigns!inner(campaign_name, status)
      `)
      .eq('instagram_leads.username', username)
      .eq('cluster_campaigns.status', 'active');

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Erro ao verificar lead' });
      return;
    }

    const exists = data && data.length > 0;

    res.json({
      success: true,
      exists,
      campaigns: exists ? data.map((d: any) => ({
        campaignId: d.campaign_id,
        campaignName: d.cluster_campaigns?.campaign_name,
        leadStatus: d.status
      })) : []
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao verificar lead:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
