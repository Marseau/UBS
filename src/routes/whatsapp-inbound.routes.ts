/**
 * WhatsApp Inbound Routes
 *
 * Endpoints para processar contatos que entraram em contato espontaneamente via WhatsApp
 */

import { Router, Request, Response } from 'express';
import { whatsappInboundLeadHandler } from '../services/whatsapp-inbound-lead-handler.service';

const router = Router();

/**
 * POST /api/whatsapp-inbound/process
 * Processar contato inbound do WhatsApp
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { campaign_id, phone, name, message_text } = req.body;

    // Validação
    if (!campaign_id || !phone || !message_text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_id, phone, message_text',
      });
    }

    console.log(`💬 [API] Processando WhatsApp inbound: ${phone}`);

    // Processar contato
    const result = await whatsappInboundLeadHandler.handleInboundLead({
      campaign_id,
      phone,
      name: name || 'Cliente',
      message_text,
    });

    if (result.success) {
      console.log(`✅ [API] Contato processado: ${result.contact_id}`);
    } else {
      console.error(`❌ [API] Erro ao processar contato: ${result.error}`);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[API WhatsApp Inbound] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/whatsapp-inbound/check-contact
 * Verificar se contato já existe (helper para workflows)
 */
router.post('/check-contact', async (req: Request, res: Response) => {
  try {
    const { campaign_id, phone } = req.body;

    if (!campaign_id || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_id, phone',
      });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: contact, error } = await supabase
      .from('aic_whatsapp_contacts')
      .select('id, phone, source, first_contact_type')
      .eq('campaign_id', campaign_id)
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return res.json({
      success: true,
      exists: !!contact,
      contact: contact || null,
    });
  } catch (error: any) {
    console.error('[API WhatsApp Inbound] Erro ao verificar contato:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
