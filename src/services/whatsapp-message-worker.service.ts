/**
 * WhatsApp Message Worker Service
 *
 * Worker BullMQ para processar fila de mensagens WhatsApp
 * Processa mensagens de forma controlada com rate limiting e retry automático
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { WhatsAppMessageJob } from './queue-manager.service';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export class WhatsAppMessageWorker {
  private worker: Worker<WhatsAppMessageJob>;
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    // Configuração Redis (mesma do QueueManager)
    const connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    // Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Criar worker
    this.worker = new Worker<WhatsAppMessageJob>(
      'whatsapp-message',
      async (job: Job<WhatsAppMessageJob>) => {
        return this.processWhatsAppMessage(job);
      },
      {
        connection,
        concurrency: parseInt(process.env.WHATSAPP_MESSAGE_CONCURRENCY || '5'), // Processar até 5 mensagens simultaneamente
        limiter: {
          max: parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX || '20'), // Max 20 mensagens
          duration: parseInt(process.env.WHATSAPP_RATE_LIMIT_DURATION || '60000'), // Por 60 segundos
        },
      }
    );

    // Event listeners
    this.worker.on('completed', (job) => {
      console.log(`✅ [WhatsApp Worker] Job ${job.id} completed - Phone: ${job.data.phoneNumber}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ [WhatsApp Worker] Job ${job?.id} failed - Phone: ${job?.data.phoneNumber}`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('❌ [WhatsApp Worker] Worker error:', err);
    });

    console.log('✅ WhatsApp Message Worker initialized');
    console.log(`📊 Concurrency: ${process.env.WHATSAPP_MESSAGE_CONCURRENCY || '5'}`);
    console.log(`⏱️ Rate Limit: ${process.env.WHATSAPP_RATE_LIMIT_MAX || '20'} messages per ${process.env.WHATSAPP_RATE_LIMIT_DURATION || '60000'}ms`);
  }

  /**
   * Processar job de mensagem WhatsApp
   */
  private async processWhatsAppMessage(job: Job<WhatsAppMessageJob>): Promise<void> {
    const { tenantId, phoneNumber, messageText, mediaUrl } = job.data;

    console.log(`💬 [WhatsApp Worker] Processing job ${job.id}`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Message: ${messageText.substring(0, 50)}...`);
    console.log(`   Media: ${mediaUrl || 'None'}`);

    try {
      // 1. Buscar tenant no banco
      const { data: tenant, error: tenantError } = await this.supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (tenantError || !tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      // 2. Enviar mensagem via WhatsApp Business API
      await this.sendWhatsAppMessage(phoneNumber, messageText, mediaUrl);

      // 3. Registrar mensagem no banco (opcional, dependendo da arquitetura)
      // A tabela whatsapp_messages já pode estar sendo populada pelo webhook

      console.log(`✅ [WhatsApp Worker] Message sent successfully to ${phoneNumber}`);
    } catch (error: any) {
      console.error(`❌ [WhatsApp Worker] Error processing job ${job.id}:`, error.message);
      throw error; // Throw para acionar retry do BullMQ
    }
  }

  /**
   * Enviar mensagem via WhatsApp Business API
   */
  private async sendWhatsAppMessage(
    phoneNumber: string,
    message: string,
    mediaUrl?: string
  ): Promise<void> {
    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!whatsappToken || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
    }

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    // Payload base
    const payload: any = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
    };

    // Se tem mídia, enviar como mensagem de mídia
    if (mediaUrl) {
      payload.type = 'image'; // ou 'video', 'document', etc.
      payload.image = {
        link: mediaUrl,
        caption: message,
      };
    } else {
      // Mensagem de texto simples
      payload.type = 'text';
      payload.text = {
        body: message,
      };
    }

    try {
      console.log(`📤 [WhatsApp] Sending to ${phoneNumber}: ${message.substring(0, 50)}...`);

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        console.log(`✅ [WhatsApp] Message sent - ID: ${messageId}`);
      }
    } catch (error: any) {
      console.error('❌ [WhatsApp] Error sending message:', error.response?.data || error.message);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Fechar worker (graceful shutdown)
   */
  async close(): Promise<void> {
    await this.worker.close();
    console.log('✅ WhatsApp Message Worker closed');
  }
}

// Export singleton instance
let workerInstance: WhatsAppMessageWorker | null = null;

export function getWhatsAppMessageWorker(): WhatsAppMessageWorker {
  if (!workerInstance) {
    workerInstance = new WhatsAppMessageWorker();
  }
  return workerInstance;
}
