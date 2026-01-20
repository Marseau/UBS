/**
 * Queue Manager Service
 *
 * Gerenciador central de filas com BullMQ
 * Gerencia múltiplas filas: Instagram DMs, WhatsApp Messages, etc.
 */

import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

// Tipos de jobs para cada fila
export interface InstagramDMJob {
  conversationId: string;
  leadUsername: string;
  messageText: string;
  campaignId?: string;
  priority?: number;
}

export interface WhatsAppMessageJob {
  tenantId: string;
  phoneNumber: string;
  messageText: string;
  mediaUrl?: string;
  priority?: number;
}

export interface LeadEnrichmentJob {
  leadId: string;
  username: string;
  source: 'landing' | 'inbound_whatsapp' | 'inbound_instagram' | 'scraper' | 'manual';
  campaignId?: string;
  priority?: number;
}

export class QueueManager {
  private static instance: QueueManager;
  private connection: IORedis;

  // Filas
  public instagramDMQueue: Queue<InstagramDMJob>;
  public whatsappMessageQueue: Queue<WhatsAppMessageJob>;
  public leadEnrichmentQueue: Queue<LeadEnrichmentJob>;

  private constructor() {
    // Configuração de conexão Redis
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Configuração padrão para todas as filas
    const defaultQueueOptions: QueueOptions = {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    };

    // Criar filas
    this.instagramDMQueue = new Queue<InstagramDMJob>(
      'instagram-dm',
      defaultQueueOptions
    );

    this.whatsappMessageQueue = new Queue<WhatsAppMessageJob>(
      'whatsapp-message',
      defaultQueueOptions
    );

    this.leadEnrichmentQueue = new Queue<LeadEnrichmentJob>(
      'lead-enrichment',
      defaultQueueOptions
    );

    console.log('✅ Queue Manager initialized');
    console.log('📨 Instagram DM Queue: Ready');
    console.log('💬 WhatsApp Message Queue: Ready');
    console.log('🔍 Lead Enrichment Queue: Ready');
  }

  /**
   * Singleton instance
   */
  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Enfileirar Instagram DM
   */
  async enqueueInstagramDM(
    data: InstagramDMJob,
    priority: number = 5
  ): Promise<string> {
    const job = await this.instagramDMQueue.add('send-dm', data, {
      priority,
    });

    console.log(`📨 [Instagram DM] Enfileirado job ${job.id} - Lead: ${data.leadUsername}`);
    return job.id!;
  }

  /**
   * Enfileirar mensagem WhatsApp
   */
  async enqueueWhatsAppMessage(
    data: WhatsAppMessageJob,
    priority: number = 5
  ): Promise<string> {
    const job = await this.whatsappMessageQueue.add('send-message', data, {
      priority,
    });

    console.log(`💬 [WhatsApp] Enfileirado job ${job.id} - Phone: ${data.phoneNumber}`);
    return job.id!;
  }

  /**
   * Enfileirar lead para enriquecimento
   * Funciona para qualquer fonte: landing, inbound_whatsapp, inbound_instagram, scraper, manual
   */
  async enqueueLeadEnrichment(
    data: LeadEnrichmentJob,
    priority: number = 5
  ): Promise<string> {
    const job = await this.leadEnrichmentQueue.add('enrich-lead', data, {
      priority,
      // Evitar duplicatas por leadId
      jobId: `enrich-${data.leadId}`,
    });

    console.log(`🔍 [Lead Enrichment] Enfileirado job ${job.id} - @${data.username} (source: ${data.source})`);
    return job.id!;
  }

  /**
   * Obter estatísticas das filas
   */
  async getQueueStats() {
    const instagramStats = {
      waiting: await this.instagramDMQueue.getWaitingCount(),
      active: await this.instagramDMQueue.getActiveCount(),
      completed: await this.instagramDMQueue.getCompletedCount(),
      failed: await this.instagramDMQueue.getFailedCount(),
      delayed: await this.instagramDMQueue.getDelayedCount(),
    };

    const whatsappStats = {
      waiting: await this.whatsappMessageQueue.getWaitingCount(),
      active: await this.whatsappMessageQueue.getActiveCount(),
      completed: await this.whatsappMessageQueue.getCompletedCount(),
      failed: await this.whatsappMessageQueue.getFailedCount(),
      delayed: await this.whatsappMessageQueue.getDelayedCount(),
    };

    const leadEnrichmentStats = {
      waiting: await this.leadEnrichmentQueue.getWaitingCount(),
      active: await this.leadEnrichmentQueue.getActiveCount(),
      completed: await this.leadEnrichmentQueue.getCompletedCount(),
      failed: await this.leadEnrichmentQueue.getFailedCount(),
      delayed: await this.leadEnrichmentQueue.getDelayedCount(),
    };

    return {
      instagram: instagramStats,
      whatsapp: whatsappStats,
      leadEnrichment: leadEnrichmentStats,
    };
  }

  /**
   * Limpar todas as filas (desenvolvimento/teste)
   */
  async clearAllQueues() {
    await this.instagramDMQueue.drain();
    await this.whatsappMessageQueue.drain();
    await this.leadEnrichmentQueue.drain();
    console.log('🧹 Todas as filas limpas');
  }

  /**
   * Fechar conexões (graceful shutdown)
   */
  async close() {
    await this.instagramDMQueue.close();
    await this.whatsappMessageQueue.close();
    await this.leadEnrichmentQueue.close();
    await this.connection.quit();
    console.log('✅ Queue Manager closed');
  }
}

// Export singleton instance
export const queueManager = QueueManager.getInstance();
