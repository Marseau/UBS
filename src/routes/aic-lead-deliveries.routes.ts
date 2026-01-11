/**
 * AIC Lead Deliveries Routes
 * Gerencia entregas de leads quentes (base de faturamento variavel)
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database';
import { clientJourneyService } from '../services/client-journey.service';

const router = Router();

/**
 * POST /api/aic/lead-deliveries
 * Registra uma nova entrega de lead quente (AI Agent encaminhou)
 * Cria fatura automaticamente na tabela aic_campaign_payments
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
      delivery_type = 'interesse_confirmado',
      notes,
      auto_invoice = true // Criar fatura automaticamente (padrao: true)
    } = req.body;

    if (!campaign_id || !lead_whatsapp) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e lead_whatsapp sao obrigatorios'
      });
    }

    const deliveredAt = new Date().toISOString();

    // 1. Criar registro da entrega
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
        delivered_at: deliveredAt
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

    // 2. Criar fatura automaticamente
    let invoice = null;
    if (auto_invoice && delivery_value > 0) {
      try {
        // Gerar numero da fatura sequencial por campanha
        const { count } = await supabase
          .from('aic_campaign_payments')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign_id)
          .eq('type', 'lead_invoice');

        const sequenceNum = (count || 0) + 1;
        const invoiceNumber = `LEAD-${campaign_id.slice(0, 6).toUpperCase()}-${String(sequenceNum).padStart(4, '0')}`;

        // Definir vencimento (5 dias uteis)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        // Descricao baseada no tipo de entrega
        const typeLabels: Record<string, string> = {
          'reuniao_marcada': 'Reuniao Marcada',
          'proposta_enviada': 'Proposta Enviada',
          'interesse_confirmado': 'Interesse Confirmado',
          'whatsapp_capturado': 'WhatsApp Capturado',
          'negociacao': 'Em Negociacao'
        };
        const typeLabel = typeLabels[delivery_type] || delivery_type;

        const { data: invoiceData, error: invoiceError } = await supabase
          .from('aic_campaign_payments')
          .insert({
            campaign_id,
            delivery_id: delivery.id,
            type: 'lead_invoice',
            invoice_number: invoiceNumber,
            description: `Lead Quente: ${lead_name} (${typeLabel})`,
            amount: delivery_value,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending'
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('[Lead Deliveries] Erro ao criar fatura:', invoiceError);
        } else {
          invoice = invoiceData;
          console.log(`[Lead Deliveries] Fatura criada: ${invoiceNumber} - R$ ${delivery_value}`);
        }
      } catch (invoiceErr) {
        console.error('[Lead Deliveries] Erro ao criar fatura automatica:', invoiceErr);
      }
    }

    return res.status(201).json({
      success: true,
      message: auto_invoice && invoice ? 'Lead entregue e fatura criada' : 'Lead entregue registrado',
      delivery,
      invoice
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
 * GET /api/aic/lead-deliveries/unseen-reunioes
 * Retorna contagem de reunioes de fechamento nao vistas (prospects AIC)
 */
router.get('/unseen-reunioes', async (_req: Request, res: Response) => {
  try {
    const { count, error } = await supabase
      .from('aic_lead_deliveries')
      .select('*', { count: 'exact', head: true })
      .is('campaign_id', null)  // Prospects AIC (reunioes de fechamento)
      .is('seen_at', null);     // Nao vistas

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao contar reunioes',
        error: error.message
      });
    }

    return res.json({
      success: true,
      unseen_count: count || 0
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro ao contar reunioes:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * PATCH /api/aic/lead-deliveries/:id/mark-seen
 * Marca uma reuniao como vista
 */
router.patch('/:id/mark-seen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .update({
        seen_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao marcar como visto',
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
 * PATCH /api/aic/lead-deliveries/mark-all-seen
 * Marca todas as reunioes de fechamento como vistas
 */
router.patch('/mark-all-seen', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('aic_lead_deliveries')
      .update({
        seen_at: new Date().toISOString()
      })
      .is('campaign_id', null)
      .is('seen_at', null)
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao marcar como vistas',
        error: error.message
      });
    }

    return res.json({
      success: true,
      marked_count: data?.length || 0
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * GET /api/aic/lead-deliveries/by-token/:token
 * Busca lead por contract_token (para pagina de contrato)
 */
router.get('/by-token/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const { data: delivery, error } = await supabase
      .from('aic_lead_deliveries')
      .select('*')
      .eq('contract_token', token)
      .single();

    if (error || !delivery) {
      return res.status(404).json({
        success: false,
        message: 'Link invalido ou expirado'
      });
    }

    // Se ja tem contrato assinado, nao permitir assinar novamente
    if (delivery.contract_id) {
      return res.json({
        success: true,
        found: true,
        already_signed: true,
        delivery: {
          id: delivery.id,
          lead_name: delivery.lead_name,
          lead_email: delivery.lead_email,
          contract_id: delivery.contract_id,
          status: delivery.status
        }
      });
    }

    return res.json({
      success: true,
      found: true,
      already_signed: false,
      delivery: {
        id: delivery.id,
        lead_name: delivery.lead_name,
        lead_email: delivery.lead_email,
        lead_whatsapp: delivery.lead_whatsapp,
        lead_instagram: delivery.lead_instagram,
        notes: delivery.notes,
        status: delivery.status
      }
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro ao buscar por token:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * POST /api/aic/lead-deliveries/:id/generate-contract-link
 * Gera/regenera link de contrato e atualiza status para contrato_enviado
 */
router.post('/:id/generate-contract-link', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { regenerate } = req.body;

    // Buscar delivery atual
    const { data: delivery, error: fetchError } = await supabase
      .from('aic_lead_deliveries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery nao encontrado'
      });
    }

    // Se ja tem contrato assinado, nao permitir gerar novo link
    if (delivery.contract_id) {
      return res.status(400).json({
        success: false,
        message: 'Este prospect ja assinou contrato'
      });
    }

    // Gerar novo token se necessario ou se solicitado regeneracao
    let token = delivery.contract_token;
    if (!token || regenerate) {
      const { data: updated, error: updateError } = await supabase
        .from('aic_lead_deliveries')
        .update({
          contract_token: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          contract_link_sent_at: new Date().toISOString(),
          status: 'contrato_enviado',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          success: false,
          message: 'Erro ao gerar link',
          error: updateError.message
        });
      }

      token = updated.contract_token;
    }

    // Construir URL completa - usa o novo contrato formal
    const baseUrl = process.env.AIC_BASE_URL || 'https://aic.ubs.app.br';
    const contractUrl = `${baseUrl}/aic-contrato-prestacao-servicos.html?token=${token}`;

    console.log(`[Lead Deliveries] Link de contrato gerado para ${delivery.lead_name}: ${contractUrl}`);

    return res.json({
      success: true,
      message: 'Link de contrato gerado',
      contract_url: contractUrl,
      token
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro ao gerar link:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * POST /api/aic/lead-deliveries/:id/sign-contract
 * Cria contrato e vincula ao delivery (chamado pela pagina de contrato)
 */
router.post('/:id/sign-contract', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      client_name,
      client_document,
      client_email,
      client_phone,
      client_company,
      project_name,
      target_niche,
      service_description,
      target_audience,
      terms_accepted,
      user_agent,
      auth_user_id
    } = req.body;

    // Buscar delivery
    const { data: delivery, error: fetchError } = await supabase
      .from('aic_lead_deliveries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery nao encontrado'
      });
    }

    // Se ja tem contrato, retornar erro
    if (delivery.contract_id) {
      return res.status(400).json({
        success: false,
        message: 'Este prospect ja possui contrato assinado',
        contract_id: delivery.contract_id
      });
    }

    // Capturar IP
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Criar contrato
    const { data: contract, error: contractError } = await supabase
      .from('aic_contracts')
      .insert({
        client_name,
        client_document,
        client_email,
        client_phone,
        client_company,
        project_name,
        target_niche,
        service_description,
        target_audience,
        terms_accepted: terms_accepted || true,
        terms_accepted_at: new Date().toISOString(),
        ip_address: typeof ip_address === 'string' ? ip_address : ip_address?.[0],
        user_agent,
        auth_user_id,
        status: 'signed'
      })
      .select()
      .single();

    if (contractError) {
      console.error('[Lead Deliveries] Erro ao criar contrato:', contractError);
      return res.status(500).json({
        success: false,
        message: 'Erro ao criar contrato',
        error: contractError.message
      });
    }

    // Vincular contrato ao delivery e atualizar status
    const { error: linkError } = await supabase
      .from('aic_lead_deliveries')
      .update({
        contract_id: contract.id,
        status: 'contrato_assinado',
        auth_user_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (linkError) {
      console.error('[Lead Deliveries] Erro ao vincular contrato:', linkError);
    }

    console.log(`[Lead Deliveries] Contrato ${contract.id} assinado para delivery ${id}`);

    // Enviar notificacao Telegram
    try {
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const telegramMessage = `🎉 *CONTRATO ASSINADO*\n\n` +
          `👤 ${client_name}\n` +
          `📧 ${client_email}\n` +
          `📱 ${client_phone || 'N/A'}\n\n` +
          `📋 Projeto: ${project_name}\n` +
          `🎯 Nicho: ${target_niche}\n\n` +
          `✅ Origem: Reunião de Fechamento\n` +
          `📝 Contrato ID: ${contract.id}`;

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: telegramMessage,
            parse_mode: 'Markdown'
          })
        });
      }
    } catch (telegramError) {
      console.warn('[Lead Deliveries] Erro ao enviar Telegram:', telegramError);
    }

    return res.status(201).json({
      success: true,
      message: 'Contrato assinado com sucesso',
      contract,
      delivery_id: id
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro ao assinar contrato:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
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

/**
 * POST /api/aic/lead-deliveries/proposal
 * Cria nova proposta para prospect (reuniao de fechamento) + cria jornada automaticamente
 * Este e o ponto de entrada para novos clientes AIC
 */
router.post('/proposal', async (req: Request, res: Response) => {
  try {
    const {
      lead_name,
      lead_email,
      lead_whatsapp,
      lead_instagram,
      lead_company,
      contract_value = 4000,
      lead_value = 10,
      project_name,
      target_niche,
      service_description,
      target_audience,
      notes,
      created_by
    } = req.body;

    if (!lead_name || !lead_email) {
      return res.status(400).json({
        success: false,
        message: 'lead_name e lead_email sao obrigatorios'
      });
    }

    // 1. Criar delivery (proposta) sem campaign_id
    const { data: delivery, error: deliveryError } = await supabase
      .from('aic_lead_deliveries')
      .insert({
        campaign_id: null, // Prospect, sem campanha ainda
        lead_whatsapp: lead_whatsapp || null,
        lead_name,
        lead_email: lead_email.toLowerCase(),
        lead_instagram,
        delivery_value: contract_value, // Valor do contrato vai para delivery_value
        status: 'entregue', // Status inicial
        delivered_at: new Date().toISOString(),
        notes
      })
      .select()
      .single();

    if (deliveryError) {
      console.error('[Lead Deliveries] Erro ao criar proposta:', deliveryError);
      return res.status(500).json({
        success: false,
        message: 'Erro ao criar proposta',
        error: deliveryError.message
      });
    }

    console.log(`[Lead Deliveries] Proposta criada: ${delivery.id} para ${lead_email}`);

    // 2. Criar jornada do cliente automaticamente
    const journeyResult = await clientJourneyService.createJourney({
      delivery_id: delivery.id,
      client_name: lead_name,
      client_email: lead_email.toLowerCase(),
      client_phone: lead_whatsapp,
      client_company: lead_company,
      proposal_data: {
        project_name: project_name || `Campanha ${lead_name}`,
        target_niche,
        service_description,
        target_audience,
        contract_value,
        lead_value,
        campaign_duration_days: 30,
        target_leads: 2000
      },
      created_by
    });

    if (journeyResult.success) {
      console.log(`[Lead Deliveries] Jornada criada: ${journeyResult.journey?.id}`);
    } else {
      console.error(`[Lead Deliveries] Erro ao criar jornada: ${journeyResult.message}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Proposta criada com sucesso',
      delivery,
      journey: journeyResult.journey,
      journey_url: journeyResult.journey
        ? `/aic/minha-jornada?token=${journeyResult.journey.access_token}`
        : null
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

/**
 * GET /api/aic/lead-deliveries/:id/journey
 * Retorna a jornada associada a este delivery
 */
router.get('/:id/journey', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da entrega e obrigatorio'
      });
    }

    const journey = await clientJourneyService.getJourneyByDeliveryId(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Jornada nao encontrada para esta entrega'
      });
    }

    const progress = clientJourneyService.getProgress(journey.current_step as any);
    const steps = clientJourneyService.getStepsWithStatus(journey.current_step as any);

    return res.json({
      success: true,
      journey: {
        ...journey,
        progress,
        steps
      }
    });

  } catch (error) {
    console.error('[Lead Deliveries] Erro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

export default router;
