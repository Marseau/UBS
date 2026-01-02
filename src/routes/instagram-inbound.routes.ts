/**
 * Instagram Inbound Routes
 *
 * Endpoints para processar leads que entraram em contato espontaneamente via Instagram
 */

import { Router, Request, Response } from 'express';
import { instagramInboundLeadHandler } from '../services/instagram-inbound-lead-handler.service';

const router = Router();

/**
 * POST /api/instagram-inbound/process
 * Processar lead inbound do Instagram
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { campaign_id, username, message_text, sender_id } = req.body;

    // Validação
    if (!campaign_id || !username || !message_text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_id, username, message_text',
      });
    }

    console.log(`📨 [API] Processando Instagram inbound: ${username}`);

    // Processar lead
    const result = await instagramInboundLeadHandler.handleInboundLead({
      campaign_id,
      username,
      message_text,
      sender_id,
    });

    if (result.success) {
      console.log(`✅ [API] Lead processado: ${result.lead_id}`);
    } else {
      console.error(`❌ [API] Erro ao processar lead: ${result.error}`);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[API Instagram Inbound] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/instagram-inbound/check-lead
 * Verificar se lead já existe (helper para workflows)
 */
router.post('/check-lead', async (req: Request, res: Response) => {
  try {
    const { campaign_id, username } = req.body;

    if (!campaign_id || !username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_id, username',
      });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: lead, error } = await supabase
      .from('instagram_leads')
      .select('id, username, source, first_contact_type')
      .eq('campaign_id', campaign_id)
      .eq('username', username)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return res.json({
      success: true,
      exists: !!lead,
      lead: lead || null,
    });
  } catch (error: any) {
    console.error('[API Instagram Inbound] Erro ao verificar lead:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
