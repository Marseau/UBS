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
 * GET /api/landing/active-campaign
 * Retorna a campanha ativa/test/inbound_only mais recente (para LP institucional)
 */
router.get('/active-campaign', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // inbound_only: campanha que responde inbound mas não faz outreach
    const { data, error } = await supabase
      .from('cluster_campaigns')
      .select('id')
      .in('status', ['active', 'test', 'inbound_only'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      res.json({ success: false, campaignId: null });
      return;
    }

    res.json({ success: true, campaignId: data.id });
  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao buscar campanha ativa:', error);
    res.json({ success: false, campaignId: null });
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
      .in('cluster_campaigns.status', ['active', 'test', 'inbound_only']);

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

// =====================================================
// ENDPOINTS PARA LEADS SEM INSTAGRAM (NoIG)
// =====================================================

/**
 * GET /api/landing/noig/by-phone/:phone
 * Identifica lead noig pelo número de WhatsApp
 * Usado pelo AI Agent para saber se é lead sem contexto
 *
 * Response:
 * {
 *   success: boolean,
 *   found: boolean,
 *   lead?: {
 *     id: string,
 *     name: string,
 *     email: string,
 *     whatsapp: string,
 *     campaign_id: string,
 *     campaign_name: string,
 *     status: string,
 *     conversation_context: object,
 *     created_at: string
 *   }
 * }
 */
router.get('/noig/by-phone/:phone', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;

    if (!phone) {
      res.status(400).json({ success: false, error: 'phone é obrigatório' });
      return;
    }

    // Limpar telefone (só números)
    const phoneClean = phone.replace(/\D/g, '');

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Buscar em campaign_leads_noig
    // Tenta match exato e também com variações (com/sem DDI)
    const { data, error } = await supabase
      .from('campaign_leads_noig')
      .select(`
        id,
        name,
        email,
        whatsapp,
        campaign_id,
        status,
        conversation_context,
        qualification_score,
        instagram_acquired,
        instagram_username,
        created_at,
        updated_at,
        cluster_campaigns!inner(campaign_name, whapi_channel_uuid)
      `)
      .or(`whatsapp.eq.${phoneClean},whatsapp.eq.55${phoneClean},whatsapp.like.%${phoneClean.slice(-9)}`)
      .eq('instagram_acquired', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Não encontrado não é erro - apenas não é lead noig
      res.json({
        success: true,
        found: false,
        lead: null
      });
      return;
    }

    res.json({
      success: true,
      found: true,
      lead: {
        id: data.id,
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp,
        campaign_id: data.campaign_id,
        campaign_name: (data.cluster_campaigns as any)?.campaign_name || '',
        status: data.status,
        conversation_context: data.conversation_context || {},
        qualification_score: data.qualification_score || 0,
        instagram_acquired: data.instagram_acquired,
        instagram_username: data.instagram_username,
        created_at: data.created_at
      }
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao buscar lead noig:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/landing/noig/update-context
 * Atualiza o conversation_context de um lead noig
 * Chamado pelo AI Agent para salvar informações coletadas
 *
 * Body:
 * {
 *   lead_id: string,
 *   context: {
 *     ramo?: string,
 *     objetivo?: string,
 *     dor_principal?: string,
 *     ticket_medio?: string,
 *     tem_instagram?: boolean,
 *     instagram_informado?: string,
 *     interesse_level?: string,
 *     proximo_passo?: string,
 *     notas?: string[]
 *   },
 *   status?: string, // 'contacted', 'engaged', 'qualifying', 'qualified'
 *   qualification_score?: number // 0-100
 * }
 */
router.post('/noig/update-context', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, context, status, qualification_score } = req.body;

    if (!lead_id) {
      res.status(400).json({ success: false, error: 'lead_id é obrigatório' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Buscar contexto atual para merge
    const { data: current } = await supabase
      .from('campaign_leads_noig')
      .select('conversation_context')
      .eq('id', lead_id)
      .single();

    // Merge do contexto (preserva dados anteriores)
    const mergedContext = {
      ...(current?.conversation_context || {}),
      ...(context || {})
    };

    // Se tem notas, fazer append
    if (context?.notas && Array.isArray(context.notas)) {
      const existingNotas = (current?.conversation_context as any)?.notas || [];
      mergedContext.notas = [...existingNotas, ...context.notas];
    }

    // Preparar update
    const updateData: any = {
      conversation_context: mergedContext,
      updated_at: new Date().toISOString()
    };

    if (status) {
      updateData.status = status;
      if (status === 'contacted' && !current) {
        updateData.first_contact_at = new Date().toISOString();
      }
      updateData.last_contact_at = new Date().toISOString();
    }

    if (qualification_score !== undefined) {
      updateData.qualification_score = qualification_score;
      if (qualification_score >= 70) {
        updateData.status = 'qualified';
        updateData.qualified_at = new Date().toISOString();
        updateData.qualified_by = 'agent';
      }
    }

    // Atualizar
    const { error } = await supabase
      .from('campaign_leads_noig')
      .update(updateData)
      .eq('id', lead_id);

    if (error) {
      console.error('[Landing Lead Route] Erro ao atualizar contexto:', error);
      res.status(500).json({ success: false, error: 'Erro ao atualizar contexto' });
      return;
    }

    console.log(`[Landing Lead Route] Contexto atualizado para lead noig ${lead_id}`);

    res.json({
      success: true,
      updated: true
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao atualizar contexto:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/landing/noig/convert
 * Converte lead noig para lead completo (com Instagram)
 * Chama a função SQL convert_noig_to_instagram_lead
 *
 * Body:
 * {
 *   lead_id: string,
 *   instagram_username: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   converted: boolean,
 *   new_lead_id?: string, // ID em instagram_leads
 *   message?: string
 * }
 */
router.post('/noig/convert', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, instagram_username } = req.body;

    if (!lead_id || !instagram_username) {
      res.status(400).json({
        success: false,
        error: 'lead_id e instagram_username são obrigatórios'
      });
      return;
    }

    // Normalizar username
    const username = instagram_username.replace(/^@/, '').toLowerCase().trim();

    if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
      res.status(400).json({ success: false, error: 'Instagram username inválido' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Chamar função SQL de conversão
    const { data, error } = await supabase.rpc('convert_noig_to_instagram_lead', {
      p_noig_id: lead_id,
      p_instagram_username: username
    });

    if (error) {
      console.error('[Landing Lead Route] Erro ao converter lead:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao converter lead'
      });
      return;
    }

    const newLeadId = data;

    console.log(`[Landing Lead Route] Lead noig ${lead_id} convertido -> instagram_lead ${newLeadId}`);

    // Disparar pipeline de enriquecimento para o novo lead (IP interno do N8N)
    fetch('http://192.168.15.6:5678/webhook/new-lead-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    }).catch(err => console.error(`[Landing Lead Route] Erro ao disparar pipeline:`, err.message));

    res.json({
      success: true,
      converted: true,
      new_lead_id: newLeadId,
      message: `Lead convertido com sucesso. Username: @${username}`
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao converter lead:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/landing/noig/deliver
 * Entrega lead noig ao cliente (marca como entregue e cria registro de cobrança)
 * Este é o momento em que o lead quente é passado para o cliente via WhatsApp
 *
 * Body:
 * {
 *   lead_id: string,
 *   delivery_value?: number (default: 10.00),
 *   notes?: string,
 *   auto_invoice?: boolean (default: true)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   delivered: boolean,
 *   delivery?: { id, lead_name, lead_whatsapp, ... },
 *   invoice?: { id, invoice_number, amount, ... }
 * }
 */
router.post('/noig/deliver', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, delivery_value = 10.00, notes, auto_invoice = true } = req.body;

    if (!lead_id) {
      res.status(400).json({ success: false, error: 'lead_id é obrigatório' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // 1. Buscar lead noig
    const { data: noigLead, error: fetchError } = await supabase
      .from('campaign_leads_noig')
      .select(`
        id,
        campaign_id,
        name,
        email,
        whatsapp,
        status,
        conversation_context,
        qualification_score,
        instagram_acquired,
        instagram_username,
        cluster_campaigns!inner(campaign_name)
      `)
      .eq('id', lead_id)
      .single();

    if (fetchError || !noigLead) {
      res.status(404).json({ success: false, error: 'Lead não encontrado' });
      return;
    }

    // 2. Verificar se já foi entregue
    if (noigLead.status === 'delivered') {
      res.status(400).json({ success: false, error: 'Lead já foi entregue anteriormente' });
      return;
    }

    // 3. Criar registro em aic_lead_deliveries
    const deliveredAt = new Date().toISOString();
    const { data: delivery, error: deliveryError } = await supabase
      .from('aic_lead_deliveries')
      .insert({
        campaign_id: noigLead.campaign_id,
        lead_whatsapp: noigLead.whatsapp,
        lead_name: noigLead.name,
        lead_email: noigLead.email,
        lead_instagram: noigLead.instagram_acquired ? noigLead.instagram_username : null,
        delivery_value,
        notes: notes || `Lead NoIG qualificado. Score: ${noigLead.qualification_score || 'N/A'}`,
        status: 'entregue',
        delivered_at: deliveredAt
      })
      .select()
      .single();

    if (deliveryError) {
      console.error('[Landing Lead Route] Erro ao criar delivery:', deliveryError);
      res.status(500).json({ success: false, error: 'Erro ao registrar entrega' });
      return;
    }

    // 4. Atualizar status do lead noig
    await supabase
      .from('campaign_leads_noig')
      .update({
        status: 'delivered',
        updated_at: deliveredAt
      })
      .eq('id', lead_id);

    console.log(`[Landing Lead Route] Lead NoIG ${lead_id} entregue: delivery ${delivery.id}`);

    // 5. Criar fatura automaticamente (se solicitado)
    let invoice: { id: string; invoice_number: string; amount: number; due_date: string; status: string } | null = null;
    if (auto_invoice && delivery_value > 0) {
      try {
        // Gerar número da fatura sequencial por campanha
        const { count } = await supabase
          .from('aic_campaign_payments')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', noigLead.campaign_id)
          .eq('type', 'lead_invoice');

        const sequenceNum = (count || 0) + 1;
        const invoiceNumber = `LEAD-${noigLead.campaign_id.slice(0, 6).toUpperCase()}-${String(sequenceNum).padStart(4, '0')}`;

        // Vencimento em 5 dias
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        const { data: invoiceData, error: invoiceError } = await supabase
          .from('aic_campaign_payments')
          .insert({
            campaign_id: noigLead.campaign_id,
            delivery_id: delivery.id,
            type: 'lead_invoice',
            invoice_number: invoiceNumber,
            description: `Lead Quente: ${noigLead.name} (Qualificado via conversa)`,
            amount: delivery_value,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending'
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('[Landing Lead Route] Erro ao criar fatura:', invoiceError);
        } else {
          invoice = invoiceData;
          console.log(`[Landing Lead Route] Fatura criada: ${invoiceNumber} - R$ ${delivery_value}`);
        }
      } catch (invoiceErr) {
        console.error('[Landing Lead Route] Erro ao criar fatura automática:', invoiceErr);
      }
    }

    res.status(201).json({
      success: true,
      delivered: true,
      delivery: {
        id: delivery.id,
        campaign_id: delivery.campaign_id,
        lead_name: delivery.lead_name,
        lead_whatsapp: delivery.lead_whatsapp,
        lead_email: delivery.lead_email,
        lead_instagram: delivery.lead_instagram,
        delivery_value: delivery.delivery_value,
        delivered_at: delivery.delivered_at
      },
      invoice: invoice ? {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        due_date: invoice.due_date,
        status: invoice.status
      } : null,
      message: auto_invoice && invoice ? 'Lead entregue e fatura criada' : 'Lead entregue com sucesso'
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao entregar lead noig:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * GET /api/landing/noig/pending/:campaignId
 * Lista leads noig pendentes de uma campanha
 * Útil para dashboard e relatórios
 */
router.get('/noig/pending/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { status, limit = '50' } = req.query;

    if (!campaignId) {
      res.status(400).json({ success: false, error: 'campaignId é obrigatório' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    let query = supabase
      .from('campaign_leads_noig')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('instagram_acquired', false)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string));

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Erro ao buscar leads' });
      return;
    }

    res.json({
      success: true,
      count: data?.length || 0,
      leads: data || []
    });

  } catch (error: any) {
    console.error('[Landing Lead Route] Erro ao listar leads noig:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
