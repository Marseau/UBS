/**
 * AIC Contracts Routes
 * Gerencia contratos assinados digitalmente
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database';

const router = Router();

/**
 * POST /api/aic/contracts
 * Cria um novo contrato assinado digitalmente
 */
router.post('/', async (req: Request, res: Response) => {
  try {
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
      terms_accepted_at,
      user_agent,
      auth_user_id
    } = req.body;

    // Validar campos obrigatórios
    if (!client_name || !client_email || !project_name || !target_niche) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: client_name, client_email, project_name, target_niche'
      });
    }

    // Capturar IP do cliente
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Inserir contrato
    const { data: contract, error } = await supabase
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
        terms_accepted_at: terms_accepted_at || new Date().toISOString(),
        ip_address: typeof ip_address === 'string' ? ip_address : ip_address?.[0],
        user_agent,
        auth_user_id,
        status: 'signed'
      })
      .select()
      .single();

    if (error) {
      console.error('[AIC Contracts] Erro ao criar contrato:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao salvar contrato',
        error: error.message
      });
    }

    console.log(`[AIC Contracts] Contrato criado: ${contract.id} para ${client_email}`);

    // Enviar notificação via Telegram (opcional, se configurado)
    try {
      const telegramMessage = `📝 *Novo Contrato AIC Assinado*\n\n` +
        `👤 Cliente: ${client_name}\n` +
        `📧 Email: ${client_email}\n` +
        `📱 Telefone: ${client_phone || 'N/A'}\n` +
        `🏢 Empresa: ${client_company || 'N/A'}\n\n` +
        `📋 Projeto: ${project_name}\n` +
        `🎯 Nicho: ${target_niche}\n\n` +
        `✅ Assinado em: ${new Date().toLocaleString('pt-BR')}`;

      // Enviar para Telegram se configurado
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
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
      console.warn('[AIC Contracts] Erro ao enviar notificação Telegram:', telegramError);
    }

    return res.status(201).json({
      success: true,
      message: 'Contrato assinado com sucesso',
      contract
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro inesperado:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * GET /api/aic/contracts/:id
 * Busca um contrato específico
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: contract, error } = await supabase
      .from('aic_contracts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !contract) {
      return res.status(404).json({
        success: false,
        message: 'Contrato não encontrado'
      });
    }

    return res.json({
      success: true,
      contract
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro ao buscar contrato:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * GET /api/aic/contracts
 * Lista contratos (admin)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, email, limit = 50 } = req.query;

    let query = supabase
      .from('aic_contracts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (status) {
      query = query.eq('status', status);
    }

    if (email) {
      query = query.eq('client_email', email);
    }

    const { data: contracts, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao listar contratos',
        error: error.message
      });
    }

    return res.json({
      success: true,
      count: contracts?.length || 0,
      contracts
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro ao listar contratos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * GET /api/aic/contracts/:id/briefing
 * Verifica status do briefing vinculado ao contrato
 */
router.get('/:id/briefing', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar briefing vinculado ao contrato
    const { data: briefing, error } = await supabase
      .from('aic_contract_briefings')
      .select('*')
      .eq('contract_id', id)
      .single();

    if (error || !briefing) {
      return res.json({
        success: true,
        completion_percentage: 0,
        briefing: null
      });
    }

    return res.json({
      success: true,
      completion_percentage: briefing.completion_percentage || 0,
      briefing
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro ao buscar briefing:', error);
    return res.json({
      success: true,
      completion_percentage: 0,
      briefing: null
    });
  }
});

/**
 * GET /api/aic/contracts/:id/onboarding
 * Verifica status do onboarding vinculado ao contrato
 */
router.get('/:id/onboarding', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar onboarding vinculado ao contrato
    const { data: onboarding, error } = await supabase
      .from('aic_contract_onboardings')
      .select('*')
      .eq('contract_id', id)
      .single();

    if (error || !onboarding) {
      return res.json({
        success: true,
        whatsapp_connected: false,
        instagram_saved: false,
        onboarding: null
      });
    }

    return res.json({
      success: true,
      whatsapp_connected: onboarding.whatsapp_connected || false,
      instagram_saved: onboarding.instagram_saved || false,
      onboarding
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro ao buscar onboarding:', error);
    return res.json({
      success: true,
      whatsapp_connected: false,
      instagram_saved: false,
      onboarding: null
    });
  }
});

/**
 * PATCH /api/aic/contracts/:id
 * Atualiza status do contrato (vincular campanha, etc.)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, campaign_id } = req.body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (status) {
      updateData.status = status;
    }

    if (campaign_id) {
      updateData.campaign_id = campaign_id;
    }

    const { data: contract, error } = await supabase
      .from('aic_contracts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar contrato',
        error: error.message
      });
    }

    return res.json({
      success: true,
      message: 'Contrato atualizado',
      contract
    });

  } catch (error) {
    console.error('[AIC Contracts] Erro ao atualizar contrato:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

export default router;
