/**
 * Whapi.cloud Client Service
 *
 * Serviço centralizado para todas as operações WhatsApp via Whapi.cloud API
 * Substitui a implementação anterior baseada em Puppeteer
 *
 * Documentação: https://whapi.cloud/docs
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface WhapiConfig {
  token: string;
  baseUrl?: string;
  channelId?: string;
}

export interface WhapiContact {
  input: string;
  wa_id?: string;
  status: 'valid' | 'invalid' | 'processing';
  name?: string;
}

export interface WhapiMessage {
  id: string;
  from: string;
  to: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'sticker';
  timestamp: number;
  body?: string;
  caption?: string;
  media_url?: string;
  mime_type?: string;
}

export interface WhapiSendResult {
  sent: boolean;
  message_id?: string;
  error?: string;
}

export interface WhapiWebhookPayload {
  event: string;
  channel_id: string;
  timestamp: number;
  data: {
    id: string;
    from: string;
    to: string;
    type: string;
    body?: string;
    caption?: string;
    media?: {
      url: string;
      mime_type: string;
      filename?: string;
    };
    timestamp: number;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
  };
}

export interface SendTextOptions {
  to: string;
  body: string;
  previewUrl?: boolean;
  quotedMessageId?: string;
}

export interface SendMediaOptions {
  to: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
}

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  language?: string;
  components?: any[];
}

// ============================================================================
// WHAPI CLIENT SERVICE
// ============================================================================

export class WhapiClientService {
  private client: AxiosInstance;
  private supabase: SupabaseClient;
  private config: WhapiConfig;
  private rateLimitDelay = 300; // ms entre requisições

  constructor(config: WhapiConfig) {
    this.config = {
      baseUrl: 'https://gate.whapi.cloud',
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Interceptor para logs
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        console.error('[Whapi] Erro na requisição:', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  // ==========================================================================
  // VALIDAÇÃO DE NÚMEROS
  // ==========================================================================

  /**
   * Verifica se um número tem WhatsApp
   */
  async checkNumber(phone: string): Promise<WhapiContact | null> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');

      const response = await this.client.post('/contacts', {
        blocking: 'wait',
        contacts: [cleanPhone]
      });

      const contact = response.data?.contacts?.[0];
      return contact || null;
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      console.error('[Whapi] Erro ao verificar número:', error.message);
      return null;
    }
  }

  /**
   * Verifica múltiplos números em lote
   */
  async checkNumbers(phones: string[]): Promise<WhapiContact[]> {
    try {
      const cleanPhones = phones.map(p => p.replace(/\D/g, ''));

      const response = await this.client.post('/contacts', {
        blocking: 'wait',
        contacts: cleanPhones
      });

      return response.data?.contacts || [];
    } catch (error: any) {
      console.error('[Whapi] Erro ao verificar números em lote:', error.message);
      return [];
    }
  }

  // ==========================================================================
  // ENVIO DE MENSAGENS
  // ==========================================================================

  /**
   * Envia mensagem de texto
   */
  async sendText(options: SendTextOptions): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(options.to);

      const response = await this.client.post('/messages/text', {
        typing_time: 0,
        to: chatId,
        body: options.body,
        preview_url: options.previewUrl ?? false,
        quoted: options.quotedMessageId
      });

      await this.logMessage('outbound', options.to, 'text', options.body);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia imagem
   */
  async sendImage(options: SendMediaOptions): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(options.to);

      const response = await this.client.post('/messages/image', {
        to: chatId,
        media: options.mediaUrl,
        caption: options.caption
      });

      await this.logMessage('outbound', options.to, 'image', options.caption);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia documento
   */
  async sendDocument(options: SendMediaOptions): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(options.to);

      const response = await this.client.post('/messages/document', {
        to: chatId,
        media: options.mediaUrl,
        filename: options.filename,
        caption: options.caption
      });

      await this.logMessage('outbound', options.to, 'document', options.filename);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia áudio
   */
  async sendAudio(options: SendMediaOptions): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(options.to);

      const response = await this.client.post('/messages/audio', {
        to: chatId,
        media: options.mediaUrl
      });

      await this.logMessage('outbound', options.to, 'audio');

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia vídeo
   */
  async sendVideo(options: SendMediaOptions): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(options.to);

      const response = await this.client.post('/messages/video', {
        to: chatId,
        media: options.mediaUrl,
        caption: options.caption
      });

      await this.logMessage('outbound', options.to, 'video', options.caption);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia localização
   */
  async sendLocation(to: string, latitude: number, longitude: number, name?: string): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(to);

      const response = await this.client.post('/messages/location', {
        to: chatId,
        latitude,
        longitude,
        name
      });

      await this.logMessage('outbound', to, 'location', `${latitude},${longitude}`);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Envia contato (vCard)
   */
  async sendContact(to: string, contactName: string, contactPhone: string): Promise<WhapiSendResult> {
    try {
      const chatId = this.formatChatId(to);

      const response = await this.client.post('/messages/contact', {
        to: chatId,
        name: contactName,
        phone: contactPhone
      });

      await this.logMessage('outbound', to, 'contact', contactName);

      return {
        sent: true,
        message_id: response.data?.id
      };
    } catch (error: any) {
      return {
        sent: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // ==========================================================================
  // GERENCIAMENTO DE CHAT
  // ==========================================================================

  /**
   * Obtém lista de chats
   */
  async getChats(limit = 50, offset = 0): Promise<any[]> {
    try {
      const response = await this.client.get('/chats', {
        params: { count: limit, offset }
      });
      return response.data?.chats || [];
    } catch (error: any) {
      console.error('[Whapi] Erro ao obter chats:', error.message);
      return [];
    }
  }

  /**
   * Obtém mensagens de um chat
   */
  async getChatMessages(chatId: string, limit = 50): Promise<WhapiMessage[]> {
    try {
      const response = await this.client.get(`/messages/list/${chatId}`, {
        params: { count: limit }
      });
      return response.data?.messages || [];
    } catch (error: any) {
      console.error('[Whapi] Erro ao obter mensagens:', error.message);
      return [];
    }
  }

  /**
   * Marca chat como lido
   */
  async markAsRead(chatId: string): Promise<boolean> {
    try {
      await this.client.post(`/chats/${chatId}/read`);
      return true;
    } catch (error: any) {
      console.error('[Whapi] Erro ao marcar como lido:', error.message);
      return false;
    }
  }

  // ==========================================================================
  // INFORMAÇÕES DO CANAL
  // ==========================================================================

  /**
   * Obtém informações do canal/número conectado
   */
  async getChannelInfo(): Promise<any> {
    try {
      const response = await this.client.get('/settings');
      return response.data;
    } catch (error: any) {
      console.error('[Whapi] Erro ao obter info do canal:', error.message);
      return null;
    }
  }

  /**
   * Obtém status da conexão
   */
  async getConnectionStatus(): Promise<'connected' | 'disconnected' | 'connecting'> {
    try {
      const response = await this.client.get('/health');
      return response.data?.status?.state || 'disconnected';
    } catch (error: any) {
      return 'disconnected';
    }
  }

  /**
   * Obtém QR Code para reconexão (se necessário)
   */
  async getQRCode(): Promise<string | null> {
    try {
      const response = await this.client.get('/settings/qr');
      return response.data?.qr || null;
    } catch (error: any) {
      console.error('[Whapi] Erro ao obter QR Code:', error.message);
      return null;
    }
  }

  // ==========================================================================
  // PROCESSAMENTO DE WEBHOOKS
  // ==========================================================================

  /**
   * Processa payload do webhook
   */
  async processWebhook(payload: WhapiWebhookPayload): Promise<void> {
    const { event, data } = payload;

    console.log(`[Whapi] Webhook recebido: ${event}`, {
      from: data.from,
      type: data.type
    });

    switch (event) {
      case 'messages':
      case 'message':
        await this.handleIncomingMessage(data);
        break;

      case 'message.any':
        // Mensagem de qualquer tipo
        await this.handleIncomingMessage(data);
        break;

      case 'message.ack':
      case 'ack':
        // Status de entrega/leitura
        await this.handleMessageAck(data);
        break;

      case 'chat':
        // Atualização de chat
        console.log('[Whapi] Chat atualizado:', data);
        break;

      default:
        console.log(`[Whapi] Evento não tratado: ${event}`);
    }
  }

  /**
   * Trata mensagem recebida
   */
  private async handleIncomingMessage(data: WhapiWebhookPayload['data']): Promise<void> {
    // Ignorar mensagens enviadas por nós
    if (data.from === 'status@broadcast') return;

    // Extrair informações
    const from = data.from.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const messageType = data.type;
    const messageBody = data.body || data.caption || '';

    // Log da mensagem
    await this.logMessage('inbound', from, messageType, messageBody, data.id);

    // Disparar evento para processamento pelo sistema
    // Aqui você pode integrar com seu sistema de filas/agentes
    await this.notifyNewMessage({
      messageId: data.id,
      from,
      type: messageType,
      body: messageBody,
      media: data.media,
      timestamp: data.timestamp
    });
  }

  /**
   * Trata confirmação de mensagem (delivered, read)
   */
  private async handleMessageAck(data: any): Promise<void> {
    const { id, status } = data;

    // Atualizar status no banco
    await this.supabase
      .from('whatsapp_messages')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('external_id', id);
  }

  /**
   * Notifica sistema sobre nova mensagem
   */
  private async notifyNewMessage(message: any): Promise<void> {
    // Salvar no banco para processamento
    await this.supabase
      .from('whatsapp_incoming_queue')
      .insert({
        external_id: message.messageId,
        from_number: message.from,
        message_type: message.type,
        message_body: message.body,
        media_url: message.media?.url,
        received_at: new Date(message.timestamp * 1000).toISOString(),
        status: 'pending'
      });
  }

  // ==========================================================================
  // UTILITÁRIOS
  // ==========================================================================

  /**
   * Formata número para chat ID do WhatsApp
   */
  private formatChatId(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
  }

  /**
   * Log de mensagem no banco de dados
   */
  private async logMessage(
    direction: 'inbound' | 'outbound',
    phone: string,
    type: string,
    content?: string,
    externalId?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('whatsapp_messages')
        .insert({
          direction,
          phone_number: phone,
          message_type: type,
          content,
          external_id: externalId,
          channel_id: this.config.channelId,
          created_at: new Date().toISOString()
        });
    } catch (error: any) {
      // Não falhar se o log falhar
      console.error('[Whapi] Erro ao logar mensagem:', error.message);
    }
  }

  /**
   * Delay para rate limiting
   */
  private async delay(ms: number = this.rateLimitDelay): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // CAMPANHAS E BULK MESSAGING
  // ==========================================================================

  /**
   * Envia mensagem em massa com rate limiting
   */
  async sendBulkMessages(
    recipients: string[],
    message: string,
    options?: {
      delayBetweenMessages?: number;
      onProgress?: (sent: number, total: number, errors: number) => void;
      onError?: (phone: string, error: string) => void;
    }
  ): Promise<{ sent: number; failed: number; errors: string[] }> {
    const results = { sent: 0, failed: 0, errors: [] as string[] };
    const delayMs = options?.delayBetweenMessages || 1000; // 1 segundo entre mensagens

    for (let i = 0; i < recipients.length; i++) {
      const phone = recipients[i];
      if (!phone) continue;

      try {
        const result = await this.sendText({ to: phone, body: message });

        if (result.sent) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${phone}: ${result.error || 'Unknown error'}`);
          options?.onError?.(phone, result.error || 'Unknown error');
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${phone}: ${error.message || 'Unknown error'}`);
        options?.onError?.(phone, error.message || 'Unknown error');
      }

      // Callback de progresso
      options?.onProgress?.(results.sent, recipients.length, results.failed);

      // Rate limiting
      if (i < recipients.length - 1) {
        await this.delay(delayMs);
      }
    }

    return results;
  }

  /**
   * Envia campanha personalizada
   */
  async sendCampaign(
    campaign: {
      id: string;
      recipients: Array<{ phone: string; name?: string; variables?: Record<string, string> }>;
      messageTemplate: string;
    },
    options?: {
      delayBetweenMessages?: number;
      onProgress?: (sent: number, total: number) => void;
    }
  ): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };
    const delayMs = options?.delayBetweenMessages || 1500;

    for (let i = 0; i < campaign.recipients.length; i++) {
      const recipient = campaign.recipients[i];
      if (!recipient) continue;

      // Substituir variáveis no template
      let personalizedMessage = campaign.messageTemplate;
      if (recipient.name) {
        personalizedMessage = personalizedMessage.replace(/\{nome\}/gi, recipient.name);
      }
      if (recipient.variables) {
        for (const [key, value] of Object.entries(recipient.variables)) {
          personalizedMessage = personalizedMessage.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
        }
      }

      // Enviar mensagem
      const result = await this.sendText({ to: recipient.phone, body: personalizedMessage });

      if (result.sent) {
        results.sent++;

        // Registrar envio da campanha
        await this.supabase
          .from('campaign_sends')
          .insert({
            campaign_id: campaign.id,
            phone_number: recipient.phone,
            message_id: result.message_id,
            status: 'sent',
            sent_at: new Date().toISOString()
          });
      } else {
        results.failed++;

        await this.supabase
          .from('campaign_sends')
          .insert({
            campaign_id: campaign.id,
            phone_number: recipient.phone,
            status: 'failed',
            error: result.error
          });
      }

      options?.onProgress?.(results.sent + results.failed, campaign.recipients.length);

      if (i < campaign.recipients.length - 1) {
        await this.delay(delayMs);
      }
    }

    return results;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let whapiClientInstance: WhapiClientService | null = null;

export function getWhapiClient(config?: WhapiConfig): WhapiClientService {
  if (!whapiClientInstance && config) {
    whapiClientInstance = new WhapiClientService(config);
  }

  if (!whapiClientInstance) {
    // Usar variáveis de ambiente como fallback
    whapiClientInstance = new WhapiClientService({
      token: process.env.WHAPI_TOKEN || '',
      channelId: process.env.WHAPI_CHANNEL_ID
    });
  }

  return whapiClientInstance;
}

export function resetWhapiClient(): void {
  whapiClientInstance = null;
}

export default WhapiClientService;
