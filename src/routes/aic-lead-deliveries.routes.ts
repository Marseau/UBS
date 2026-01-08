/**
 * AIC Lead Deliveries Routes
 * Gerencia entregas de leads quentes (base de faturamento variavel)
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database';

const router = Router();

/**
 * POST /api/aic/lead-deliveries
 * Registra uma nova entrega de lead quente (AI Agent encaminhou)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      campaign_id,
      lead_whatsapp,
      lead_name,
      lead_email,
      lead_instagram,
      delivered_to,
      delivery_value = 10.00,
      notes
    } = req.body;

    if (!campaign_id || !lead_whatsapp) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e lead_whatsapp sao obrigatorios'
      });
    }

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .insert({
        campaign_id,
        lead_whatsapp,
        lead_name,
        lead_email,
        lead_instagram,
        delivered_to,
        delivery_value,
        notes,
        status: 'entregue',
        delivered_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Lead Deliveries] Erro ao registrar entrega:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao registrar entrega',
        error: error.message
      });
    }

    console.log(`[Lead Deliveries] Lead entregue: ${lead_whatsapp} -> ${delivered_to}`);

    return res.status(201).json({
      success: true,
      message: 'Lead entregue registrado',
      delivery
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * PATCH /api/aic/lead-deliveries/:id/status
 * Atualiza status do lead (Admin/Representante)
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, updated_by, notes, meeting_scheduled_at, meeting_happened_at, meeting_notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status e obrigatorio'
      });
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_by,
      updated_at: new Date().toISOString()
    };

    if (notes) updateData.notes = notes;
    if (meeting_scheduled_at) updateData.meeting_scheduled_at = meeting_scheduled_at;
    if (meeting_happened_at) updateData.meeting_happened_at = meeting_happened_at;
    if (meeting_notes) updateData.meeting_notes = meeting_notes;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar status',
        error: error.message
      });
    }

    console.log(`[Lead Deliveries] Status atualizado: ${id} -> ${status}`);

    return res.json({
      success: true,
      message: 'Status atualizado',
      delivery
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * PATCH /api/aic/lead-deliveries/:id/link-user
 * Vincula auth_user_id ao lead (quando cliente cria conta)
 */
router.patch('/:id/link-user', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { auth_user_id } = req.body;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .update({
        auth_user_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao vincular usuario',
        error: error.message
      });
    }

    return res.json({ success: true, delivery });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * PATCH /api/aic/lead-deliveries/:id/link-contract
 * Vincula contract_id ao lead (quando assina contrato)
 */
router.patch('/:id/link-contract', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contract_id } = req.body;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .update({
        contract_id,
        status: 'contrato_assinado',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao vincular contrato',
        error: error.message
      });
    }

    return res.json({ success: true, delivery });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * GET /api/aic/lead-deliveries
 * Lista entregas (com filtros)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { campaign_id, status, email, whatsapp, limit = 100 } = req.query;

    let query = supabase
      .from('aic_lead_deliveries')
      .select('*, cluster_campaigns(campaign_name, nicho_principal)')
      .order('delivered_at', { ascending: false })
      .limit(Number(limit));

    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    if (status) query = query.eq('status', status);
    if (email) query = query.eq('lead_email', email);
    if (whatsapp) query = query.eq('lead_whatsapp', whatsapp);

    const { data: deliveries, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao listar entregas',
        error: error.message
      });
    }

    return res.json({
      success: true,
      count: deliveries?.length || 0,
      deliveries
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * GET /api/aic/lead-deliveries/by-email/:email
 * Busca lead por email (para smartRedirect)
 */
router.get('/by-email/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .select('*')
      .eq('lead_email', email)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !delivery) {
      return res.json({
        success: true,
        found: false,
        delivery: null
      });
    }

    return res.json({
      success: true,
      found: true,
      delivery
    });

  } catch (error) {
    return res.json({
      success: true,
      found: false,
      delivery: null
    });
  }
});

/**
 * GET /api/aic/lead-deliveries/by-whatsapp/:whatsapp
 * Busca lead por whatsapp (para smartRedirect)
 */
router.get('/by-whatsapp/:whatsapp', async (req: Request, res: Response) => {
  try {
    const { whatsapp } = req.params;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .select('*')
      .eq('lead_whatsapp', whatsapp)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !delivery) {
      return res.json({
        success: true,
        found: false,
        delivery: null
      });
    }

    return res.json({
      success: true,
      found: true,
      delivery
    });

  } catch (error) {
    return res.json({
      success: true,
      found: false,
      delivery: null
    });
  }
});

/**
 * GET /api/aic/lead-deliveries/billing/:campaign_id
 * Relatorio de faturamento por campanha
 */
router.get('/billing/:campaign_id', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.params;

    const { data: deliveries, error } = await supabase
      .from('aic_lead_deliveries')
      .select('id, lead_name, lead_whatsapp, delivered_at, delivery_value, status')
      .eq('campaign_id', campaign_id)
      .order('delivered_at', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao gerar relatorio',
        error: error.message
      });
    }

    const total_leads = deliveries?.length || 0;
    const total_value = deliveries?.reduce((sum, d) => sum + (d.delivery_value || 10), 0) || 0;
    const converted = deliveries?.filter(d => d.status === 'convertido').length || 0;

    return res.json({
      success: true,
      campaign_id,
      total_leads,
      total_value,
      converted,
      conversion_rate: total_leads > 0 ? ((converted / total_leads) * 100).toFixed(1) : 0,
      deliveries
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

export default router;
