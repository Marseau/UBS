/**
 * Rotas da API Whapi.cloud
 *
 * Endpoints para integração com WhatsApp via Whapi.cloud
 * - Webhook para receber mensagens e status
 * - Endpoints para envio de mensagens
 * - Endpoints para validação de números
 */

import { Router, Request, Response } from 'express';
import { getWhapiClient, WhapiWebhookPayload } from '../services/whapi-client.service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ============================================================================
// WEBHOOK ENDPOINT
// ============================================================================

/**
 * POST /api/whapi/webhook
 * Recebe eventos do Whapi.cloud (mensagens, status, etc.)
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body as WhapiWebhookPayload;

    // Log do webhook recebido
    console.log('[Whapi Webhook] Evento recebido:', {
      event: payload.event,
      channel: payload.channel_id,
      timestamp: new Date(payload.timestamp * 1000).toISOString()
    });

    // Processar webhook de forma assíncrona
    const whapiClient = getWhapiClient();
    whapiClient.processWebhook(payload).catch(err => {
      console.error('[Whapi Webhook] Erro no processamento:', err);
    });

    // Responder imediatamente para não bloquear
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Whapi Webhook] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/webhook
 * Verificação do webhook (alguns serviços fazem GET para validar)
 */
router.get('/webhook', (req: Request, res: Response): void => {
  // Verificação de challenge se necessário
  const challenge = req.query['hub.challenge'];
  if (challenge) {
    res.send(challenge);
    return;
  }

  res.json({
    status: 'active',
    message: 'Whapi webhook endpoint is ready'
  });
});

// ============================================================================
// ENVIO DE MENSAGENS
// ============================================================================

/**
 * POST /api/whapi/send/text
 * Envia mensagem de texto
 */
router.post('/send/text', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, body, previewUrl, quotedMessageId } = req.body;

    if (!to || !body) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, body'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendText({ to, body, previewUrl, quotedMessageId });

    if (result.sent) {
      res.json({
        success: true,
        message_id: result.message_id
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar texto:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/send/image
 * Envia imagem
 */
router.post('/send/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, mediaUrl, caption } = req.body;

    if (!to || !mediaUrl) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, mediaUrl'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendImage({ to, mediaUrl, caption });

    res.json({
      success: result.sent,
      message_id: result.message_id,
      error: result.error
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar imagem:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/send/document
 * Envia documento
 */
router.post('/send/document', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, mediaUrl, filename, caption } = req.body;

    if (!to || !mediaUrl) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, mediaUrl'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendDocument({ to, mediaUrl, filename, caption });

    res.json({
      success: result.sent,
      message_id: result.message_id,
      error: result.error
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar documento:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/send/audio
 * Envia áudio
 */
router.post('/send/audio', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, mediaUrl } = req.body;

    if (!to || !mediaUrl) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, mediaUrl'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendAudio({ to, mediaUrl });

    res.json({
      success: result.sent,
      message_id: result.message_id,
      error: result.error
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar áudio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/send/video
 * Envia vídeo
 */
router.post('/send/video', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, mediaUrl, caption } = req.body;

    if (!to || !mediaUrl) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, mediaUrl'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendVideo({ to, mediaUrl, caption });

    res.json({
      success: result.sent,
      message_id: result.message_id,
      error: result.error
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar vídeo:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/send/location
 * Envia localização
 */
router.post('/send/location', async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, latitude, longitude, name } = req.body;

    if (!to || latitude === undefined || longitude === undefined) {
      res.status(400).json({
        error: 'Campos obrigatórios: to, latitude, longitude'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendLocation(to, latitude, longitude, name);

    res.json({
      success: result.sent,
      message_id: result.message_id,
      error: result.error
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao enviar localização:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// VALIDAÇÃO DE NÚMEROS
// ============================================================================

/**
 * POST /api/whapi/check-number
 * Verifica se um número tem WhatsApp
 */
router.post('/check-number', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({
        error: 'Campo obrigatório: phone'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const contact = await whapiClient.checkNumber(phone);

    res.json({
      phone,
      has_whatsapp: contact?.status === 'valid',
      wa_id: contact?.wa_id,
      name: contact?.name
    });
  } catch (error: any) {
    if (error.message === 'RATE_LIMIT_EXCEEDED') {
      res.status(429).json({
        error: 'Rate limit exceeded. Aguarde antes de tentar novamente.'
      });
      return;
    }
    console.error('[Whapi] Erro ao verificar número:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/check-numbers
 * Verifica múltiplos números em lote
 */
router.post('/check-numbers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phones } = req.body;

    if (!phones || !Array.isArray(phones)) {
      res.status(400).json({
        error: 'Campo obrigatório: phones (array)'
      });
      return;
    }

    if (phones.length > 100) {
      res.status(400).json({
        error: 'Máximo de 100 números por requisição'
      });
      return;
    }

    const whapiClient = getWhapiClient();
    const contacts = await whapiClient.checkNumbers(phones);

    res.json({
      total: phones.length,
      results: contacts.map(c => ({
        phone: c.input,
        has_whatsapp: c.status === 'valid',
        wa_id: c.wa_id,
        name: c.name
      }))
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao verificar números:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CAMPANHAS
// ============================================================================

/**
 * POST /api/whapi/campaign/send
 * Envia campanha para lista de destinatários
 */
router.post('/campaign/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId, recipients, messageTemplate, delayMs } = req.body;

    if (!campaignId || !recipients || !messageTemplate) {
      res.status(400).json({
        error: 'Campos obrigatórios: campaignId, recipients, messageTemplate'
      });
      return;
    }

    // Registrar campanha
    await supabase
      .from('campaigns')
      .upsert({
        id: campaignId,
        message_template: messageTemplate,
        total_recipients: recipients.length,
        status: 'sending',
        started_at: new Date().toISOString()
      });

    // Enviar de forma assíncrona
    const whapiClient = getWhapiClient();

    // Iniciar envio em background
    whapiClient.sendCampaign(
      { id: campaignId, recipients, messageTemplate },
      {
        delayBetweenMessages: delayMs || 1500,
        onProgress: async (sent, total) => {
          await supabase
            .from('campaigns')
            .update({
              sent_count: sent,
              updated_at: new Date().toISOString()
            })
            .eq('id', campaignId);
        }
      }
    ).then(async results => {
      await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          sent_count: results.sent,
          failed_count: results.failed,
          completed_at: new Date().toISOString()
        })
        .eq('id', campaignId);
    }).catch(async error => {
      await supabase
        .from('campaigns')
        .update({
          status: 'failed',
          error: error.message
        })
        .eq('id', campaignId);
    });

    res.json({
      success: true,
      campaignId,
      message: 'Campanha iniciada. Acompanhe o progresso via /api/whapi/campaign/status'
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao iniciar campanha:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/campaign/status/:id
 * Obtém status de uma campanha
 */
router.get('/campaign/status/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      res.status(404).json({
        error: 'Campanha não encontrada'
      });
      return;
    }

    res.json(campaign);
  } catch (error: any) {
    console.error('[Whapi] Erro ao obter status da campanha:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// INFORMAÇÕES E STATUS
// ============================================================================

/**
 * GET /api/whapi/status
 * Obtém status da conexão com WhatsApp
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const whapiClient = getWhapiClient();
    const status = await whapiClient.getConnectionStatus();
    const channelInfo = await whapiClient.getChannelInfo();

    res.json({
      status,
      channel: channelInfo?.pushname || 'Unknown',
      phone: channelInfo?.phone || 'Unknown'
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao obter status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/chats
 * Lista chats recentes
 */
router.get('/chats', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const whapiClient = getWhapiClient();
    const chats = await whapiClient.getChats(limit, offset);

    res.json({
      total: chats.length,
      chats
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao listar chats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/whapi/messages/:chatId
 * Obtém mensagens de um chat
 */
router.get('/messages/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const chatId = req.params.chatId;
    if (!chatId) {
      res.status(400).json({ error: 'chatId é obrigatório' });
      return;
    }
    const limitStr = req.query.limit as string | undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const whapiClient = getWhapiClient();
    const messages = await whapiClient.getChatMessages(chatId, limit);

    res.json({
      chatId,
      total: messages.length,
      messages
    });
  } catch (error: any) {
    console.error('[Whapi] Erro ao obter mensagens:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whapi/chats/:chatId/read
 * Marca chat como lido
 */
router.post('/chats/:chatId/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const chatIdParam = req.params.chatId;
    if (!chatIdParam) {
      res.status(400).json({ error: 'chatId é obrigatório' });
      return;
    }

    const whapiClient = getWhapiClient();
    const success = await whapiClient.markAsRead(chatIdParam);

    res.json({ success });
  } catch (error: any) {
    console.error('[Whapi] Erro ao marcar como lido:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// VALIDAÇÃO COM PERSISTÊNCIA
// ============================================================================

/**
 * POST /api/whapi/validate-lead-phones
 * Valida os telefones de um lead e persiste o resultado no banco
 *
 * Body:
 * {
 *   "lead_id": "uuid-do-lead"
 * }
 *
 * Retorna:
 * {
 *   "success": true,
 *   "lead_id": "uuid",
 *   "phones_validated": 3,
 *   "with_whatsapp": 2,
 *   "without_whatsapp": 1,
 *   "phones_normalized": [
 *     { "number": "+5511999999999", "valid_whatsapp": true },
 *     { "number": "+5511888888888", "valid_whatsapp": true },
 *     { "number": "+5511777777777", "valid_whatsapp": false }
 *   ]
 * }
 */
router.post('/validate-lead-phones', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id } = req.body;

    if (!lead_id) {
      res.status(400).json({
        success: false,
        error: 'Campo obrigatório: lead_id'
      });
      return;
    }

    // 1. Buscar o lead e seus telefones normalizados
    const { data: lead, error: fetchError } = await supabase
      .from('instagram_leads')
      .select('id, username, phones_normalized')
      .eq('id', lead_id)
      .single();

    if (fetchError || !lead) {
      res.status(404).json({
        success: false,
        error: 'Lead não encontrado'
      });
      return;
    }

    // 2. Extrair telefones do array
    const phonesNormalized = lead.phones_normalized || [];

    // Verificar se já são objetos (já validados) ou strings (não validados)
    const phones: string[] = phonesNormalized.map((p: any) =>
      typeof p === 'string' ? p : p.number
    ).filter((p: string) => p);

    if (phones.length === 0) {
      res.status(200).json({
        success: true,
        lead_id,
        message: 'Lead não possui telefones para validar',
        phones_validated: 0,
        with_whatsapp: 0,
        without_whatsapp: 0,
        phones_normalized: []
      });
      return;
    }

    console.log(`[Whapi] Validando ${phones.length} telefones do lead ${lead_id} (@${lead.username})`);

    // 3. Validar cada telefone via Whapi
    const whapiClient = getWhapiClient();
    const validatedPhones: Array<{ number: string; valid_whatsapp: boolean }> = [];
    let withWhatsApp = 0;
    let withoutWhatsApp = 0;

    for (const phone of phones) {
      try {
        const contact = await whapiClient.checkNumber(phone);
        const hasWhatsApp = contact?.status === 'valid';

        validatedPhones.push({ number: phone, valid_whatsapp: hasWhatsApp });

        if (hasWhatsApp) {
          withWhatsApp++;
        } else {
          withoutWhatsApp++;
        }

        // Delay de 300ms entre verificações
        await new Promise(r => setTimeout(r, 300));
      } catch (error: any) {
        // Em caso de erro, marca como false (não validado)
        console.error(`[Whapi] Erro ao validar ${phone}:`, error.message);
        validatedPhones.push({ number: phone, valid_whatsapp: false });
        withoutWhatsApp++;
      }
    }

    // 4. Persistir no banco
    const { error: updateError } = await supabase
      .from('instagram_leads')
      .update({
        phones_normalized: validatedPhones,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead_id);

    if (updateError) {
      console.error(`[Whapi] Erro ao atualizar lead ${lead_id}:`, updateError);
      res.status(500).json({
        success: false,
        error: 'Erro ao persistir validação no banco',
        details: updateError.message
      });
      return;
    }

    console.log(`[Whapi] Lead ${lead_id} validado: ${withWhatsApp}/${phones.length} com WhatsApp`);

    res.status(200).json({
      success: true,
      lead_id,
      username: lead.username,
      phones_validated: phones.length,
      with_whatsapp: withWhatsApp,
      without_whatsapp: withoutWhatsApp,
      phones_normalized: validatedPhones
    });

  } catch (error: any) {
    console.error('[Whapi] Erro ao validar telefones do lead:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
