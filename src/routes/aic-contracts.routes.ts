/**
 * AIC Contracts Routes
 * Gerencia contratos assinados digitalmente
 */

import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/database';
import { contractPDFService } from '../services/contract-pdf.service';
import { contractEmailService } from '../services/contract-email.service';
import { contractSecurityService } from '../services/contract-security.service';
import { clientJourneyService } from '../services/client-journey.service';

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

/**
 * POST /api/aic/contracts/:deliveryId/sign
 * Sign a contract electronically with PDF generation and email
 * Security: Validates signature data, generates integrity hash, logs access
 */
router.post('/:deliveryId/sign', async (req: Request, res: Response) => {
  try {
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) {
      return res.status(400).json({
        success: false,
        message: 'ID da proposta não informado'
      });
    }

    const signatureData = req.body;
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    console.log(`[AIC Contracts] Processing signature for delivery: ${deliveryId}`);

    // SECURITY: Validate signature data completeness
    const validation = contractSecurityService.validateSignatureData(signatureData);
    if (!validation.valid) {
      await contractSecurityService.logAccess({
        delivery_id: deliveryId,
        action: 'sign',
        ip_address: clientIP,
        user_agent: userAgent,
        success: false,
        error_message: validation.errors.join(', ')
      });
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos',
        errors: validation.errors
      });
    }

    // Get delivery data
    const { data: delivery, error: deliveryError } = await supabase
      .from('aic_lead_deliveries')
      .select('*, cluster_campaigns(*)')
      .eq('id', deliveryId)
      .single();

    if (deliveryError || !delivery) {
      console.error('[AIC Contracts] Delivery not found:', deliveryError);
      await contractSecurityService.logAccess({
        action: 'sign',
        ip_address: clientIP,
        success: false,
        error_message: 'Delivery nao encontrado'
      });
      return res.status(404).json({
        success: false,
        message: 'Proposta nao encontrada'
      });
    }

    // SECURITY: Check if token was already used (double-sign prevention)
    if (delivery.contract_token_used_at) {
      await contractSecurityService.logAccess({
        delivery_id: deliveryId,
        action: 'sign',
        ip_address: clientIP,
        success: false,
        error_message: 'Token ja utilizado'
      });
      return res.status(400).json({
        success: false,
        message: 'Este link ja foi utilizado para assinar o contrato'
      });
    }

    // Check if already signed
    if (delivery.status === 'contrato_assinado') {
      return res.status(400).json({
        success: false,
        message: 'Este contrato ja foi assinado',
        contract_id: delivery.signed_contract_id
      });
    }

    // Create contract record with security features
    const contractId = `AIC-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const signatureDate = new Date().toISOString();
    const contractValue = delivery.contract_value || 4000;
    const leadValue = delivery.lead_value || 10;

    // SECURITY: Generate integrity hash and verification code
    const integrityHash = contractSecurityService.generateIntegrityHash({
      client_name: signatureData.client_name,
      client_document: signatureData.client_document,
      contract_value: contractValue,
      lead_value: leadValue,
      signature_name: signatureData.signature_name,
      signature_date: signatureDate
    });
    const verificationCode = contractSecurityService.generateVerificationCode();

    const { data: contract, error: contractError } = await supabaseAdmin
      .from('aic_contracts')
      .insert({
        contract_id: contractId,
        delivery_id: deliveryId,
        campaign_id: delivery.campaign_id,
        // Dados do Contratante
        client_name: signatureData.client_name,
        client_document: signatureData.client_document,
        client_address: signatureData.client_address,
        client_email: signatureData.client_email,
        client_phone: signatureData.client_phone,
        client_representative: signatureData.client_representative,
        // Dados da Campanha (obrigatorios no formulario)
        project_name: signatureData.project_name,
        campaign_whatsapp: signatureData.campaign_whatsapp,
        target_niche: signatureData.target_niche,
        service_description: signatureData.service_description,
        target_audience: signatureData.target_audience,
        // Valores
        contract_value: contractValue,
        lead_value: leadValue,
        // Assinatura
        signature_name: signatureData.signature_name,
        signature_ip: clientIP,
        signature_user_agent: userAgent,
        signature_date: signatureDate,
        terms_accepted: true,
        terms_accepted_at: signatureData.terms_accepted_at,
        integrity_hash: integrityHash,
        verification_code: verificationCode,
        status: 'signed'
      })
      .select()
      .single();

    if (contractError) {
      console.error('[AIC Contracts] Error creating contract:', contractError);
      await contractSecurityService.logAccess({
        delivery_id: deliveryId,
        action: 'sign',
        ip_address: clientIP,
        success: false,
        error_message: 'Erro ao criar contrato: ' + contractError.message
      });
      return res.status(500).json({
        success: false,
        message: 'Erro ao criar contrato'
      });
    }

    // SECURITY: Invalidate token after successful signature
    await contractSecurityService.invalidateToken(deliveryId);

    // Update delivery status
    const { error: updateError } = await supabaseAdmin
      .from('aic_lead_deliveries')
      .update({
        status: 'contrato_assinado',
        signed_contract_id: contractId,
        contract_signed_at: signatureDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', deliveryId);

    if (updateError) {
      console.error('[AIC Contracts] Error updating delivery:', updateError);
    }

    // Log successful signature
    await contractSecurityService.logAccess({
      delivery_id: deliveryId,
      contract_id: contract.id,
      action: 'sign',
      ip_address: clientIP,
      user_agent: userAgent,
      success: true,
      metadata: { contract_id: contractId, verification_code: verificationCode }
    });

    // Generate PDF and send emails (async, don't wait)
    console.log('[AIC Contracts] Generating PDF...');
    let pdfUrl: string | undefined;

    try {
      const pdfResult = await contractPDFService.generateAndUpload({
        client_name: signatureData.client_name,
        client_document: signatureData.client_document,
        client_address: signatureData.client_address,
        client_representative: signatureData.client_representative,
        contract_id: contractId,
        contract_date: signatureDate,
        contract_value: delivery.contract_value || 4000,
        lead_value: delivery.lead_value || 10,
        signature_name: signatureData.signature_name,
        signature_ip: signatureData.signature_ip,
        signature_date: signatureDate,
        signature_user_agent: signatureData.signature_user_agent
      });

      pdfUrl = pdfResult.url;

      // Update contract with PDF URL
      if (pdfUrl) {
        await supabaseAdmin
          .from('aic_contracts')
          .update({ pdf_url: pdfUrl })
          .eq('id', contract.id);
      }

      // Send signed contract to client
      console.log('[AIC Contracts] Sending email to client...');
      await contractEmailService.sendSignedContractToClient({
        to: signatureData.client_email,
        toName: signatureData.client_name,
        campaignName: delivery.cluster_campaigns?.campaign_name || 'Campanha AIC',
        pdfBuffer: pdfResult.buffer,
        pdfFilename: pdfResult.filename,
        pdfUrl
      });

      // Send notification to admin
      console.log('[AIC Contracts] Sending notification to admin...');
      await contractEmailService.sendSignedNotification({
        clientName: signatureData.client_name,
        clientEmail: signatureData.client_email,
        contractId,
        campaignName: delivery.cluster_campaigns?.campaign_name || 'Campanha AIC',
        signedAt: signatureDate,
        signatureIp: signatureData.signature_ip,
        pdfUrl
      });

    } catch (pdfError) {
      console.error('[AIC Contracts] Error generating PDF or sending email:', pdfError);
      // Don't fail the request - contract is already signed
    }

    console.log(`[AIC Contracts] Contract signed successfully: ${contractId}`);

    // =========================================
    // CLIENT JOURNEY: Link contract & create campaign
    // =========================================
    try {
      // Check if there's an existing journey for this delivery
      const existingJourney = await clientJourneyService.getJourneyByDeliveryId(deliveryId);

      if (existingJourney) {
        console.log(`[AIC Contracts] Linking contract to journey ${existingJourney.id}...`);

        // Link contract and create campaign automatically
        // Usa dados do formulario do contrato (obrigatorios)
        const journeyResult = await clientJourneyService.linkContractAndCreateCampaign(
          existingJourney.id,
          contract.id,
          {
            client_name: signatureData.client_name,
            client_email: signatureData.client_email,
            client_phone: signatureData.client_phone,
            client_document: signatureData.client_document,
            client_company: signatureData.client_company,
            // Dados da campanha do formulario (obrigatorios)
            project_name: signatureData.project_name || `Campanha ${signatureData.client_name}`,
            campaign_whatsapp: signatureData.campaign_whatsapp,
            target_niche: signatureData.target_niche,
            service_description: signatureData.service_description,
            target_audience: signatureData.target_audience,
            contract_value: delivery.contract_value || 4000,
            lead_value: delivery.lead_value || 10
          }
        );

        if (journeyResult.success) {
          console.log(`[AIC Contracts] Journey updated, campaign created: ${journeyResult.journey?.campaign_id}`);
        } else {
          console.error(`[AIC Contracts] Failed to update journey: ${journeyResult.message}`);
        }
      } else {
        console.log(`[AIC Contracts] No existing journey for delivery ${deliveryId}, creating one...`);

        // Create new journey with contract data (usando dados do formulario)
        const createResult = await clientJourneyService.createJourney({
          delivery_id: deliveryId,
          client_name: signatureData.client_name,
          client_email: signatureData.client_email,
          client_phone: signatureData.client_phone,
          client_document: signatureData.client_document,
          client_company: signatureData.client_company,
          proposal_data: {
            project_name: signatureData.project_name || `Campanha ${signatureData.client_name}`,
            campaign_whatsapp: signatureData.campaign_whatsapp,
            target_niche: signatureData.target_niche,
            service_description: signatureData.service_description,
            target_audience: signatureData.target_audience,
            contract_value: delivery.contract_value || 4000,
            lead_value: delivery.lead_value || 10,
            campaign_duration_days: 30,
            target_leads: 2000
          }
        });

        if (createResult.success && createResult.journey) {
          // Now link contract and create campaign
          const linkResult = await clientJourneyService.linkContractAndCreateCampaign(
            createResult.journey.id,
            contract.id,
            {
              client_name: signatureData.client_name,
              client_email: signatureData.client_email,
              client_phone: signatureData.client_phone,
              client_document: signatureData.client_document,
              client_company: signatureData.client_company,
              project_name: signatureData.project_name || `Campanha ${signatureData.client_name}`,
              campaign_whatsapp: signatureData.campaign_whatsapp,
              target_niche: signatureData.target_niche,
              service_description: signatureData.service_description,
              target_audience: signatureData.target_audience,
              contract_value: delivery.contract_value || 4000,
              lead_value: delivery.lead_value || 10
            }
          );

          if (linkResult.success) {
            console.log(`[AIC Contracts] New journey created and campaign set up: ${linkResult.journey?.campaign_id}`);
          }
        }
      }
    } catch (journeyError) {
      console.error('[AIC Contracts] Error updating journey:', journeyError);
      // Don't fail the request - contract is already signed
    }

    return res.json({
      success: true,
      message: 'Contrato assinado com sucesso',
      contract_id: contractId,
      pdf_url: pdfUrl
    });

  } catch (error) {
    console.error('[AIC Contracts] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar assinatura'
    });
  }
});

/**
 * POST /api/aic/contracts/:deliveryId/send-link
 * Send contract signing link via email
 */
router.post('/:deliveryId/send-link', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;

    // Get delivery data
    const { data: delivery, error: deliveryError } = await supabase
      .from('aic_lead_deliveries')
      .select('*, cluster_campaigns(*)')
      .eq('id', deliveryId)
      .single();

    if (deliveryError || !delivery) {
      return res.status(404).json({
        success: false,
        message: 'Proposta nao encontrada'
      });
    }

    if (!delivery.lead_email) {
      return res.status(400).json({
        success: false,
        message: 'Email do cliente nao informado'
      });
    }

    // Generate contract link
    const baseUrl = process.env.APP_BASE_URL || 'https://aic.ubs.app.br';
    const contractLink = `${baseUrl}/aic-contrato-prestacao-servicos.html?token=${delivery.contract_token}`;

    // Send email
    const sent = await contractEmailService.sendContractLink({
      to: delivery.lead_email,
      toName: delivery.lead_name || 'Cliente',
      contractLink,
      campaignName: delivery.cluster_campaigns?.campaign_name || 'Campanha AIC',
      expiresInDays: 7
    });

    if (!sent) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar email'
      });
    }

    // Update delivery
    await supabase
      .from('aic_lead_deliveries')
      .update({
        contract_link_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deliveryId);

    return res.json({
      success: true,
      message: 'Link enviado com sucesso',
      contract_link: contractLink
    });

  } catch (error) {
    console.error('[AIC Contracts] Error sending link:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar link do contrato'
    });
  }
});

export default router;
