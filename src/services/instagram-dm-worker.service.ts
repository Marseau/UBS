/**
 * Instagram DM Worker Service
 *
 * Worker BullMQ para processar fila de DMs do Instagram
 * Processa mensagens de forma controlada com rate limiting e retry automático
 *
 * ENVIO VIA PUPPETEER - usa instagram-client-dm.service para automação real
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { InstagramDMJob } from './queue-manager.service';
import { createClient } from '@supabase/supabase-js';
import { instagramClientDMService } from './instagram-client-dm.service';

export class InstagramDMWorker {
  private worker: Worker<InstagramDMJob>;
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
    this.worker = new Worker<InstagramDMJob>(
      'instagram-dm',
      async (job: Job<InstagramDMJob>) => {
        return this.processInstagramDM(job);
      },
      {
        connection,
        concurrency: parseInt(process.env.INSTAGRAM_DM_CONCURRENCY || '3'), // Processar até 3 DMs simultaneamente
        limiter: {
          max: parseInt(process.env.INSTAGRAM_DM_RATE_LIMIT_MAX || '10'), // Max 10 DMs
          duration: parseInt(process.env.INSTAGRAM_DM_RATE_LIMIT_DURATION || '60000'), // Por 60 segundos
        },
      }
    );

    // Event listeners
    this.worker.on('completed', (job) => {
      console.log(`✅ [Instagram DM Worker] Job ${job.id} completed - Lead: ${job.data.leadUsername}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ [Instagram DM Worker] Job ${job?.id} failed - Lead: ${job?.data.leadUsername}`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('❌ [Instagram DM Worker] Worker error:', err);
    });

    console.log('✅ Instagram DM Worker initialized');
    console.log(`📊 Concurrency: ${process.env.INSTAGRAM_DM_CONCURRENCY || '3'}`);
    console.log(`⏱️ Rate Limit: ${process.env.INSTAGRAM_DM_RATE_LIMIT_MAX || '10'} DMs per ${process.env.INSTAGRAM_DM_RATE_LIMIT_DURATION || '60000'}ms`);
  }

  /**
   * Processar job de Instagram DM
   *
   * NOTA: conversationId aqui é o campaign_lead_id (vem do Cold Outreach Unified)
   */
  private async processInstagramDM(job: Job<InstagramDMJob>): Promise<void> {
    const { conversationId, leadUsername, messageText, campaignId } = job.data;

    console.log(`📨 [Instagram DM Worker] Processing job ${job.id}`);
    console.log(`   Lead: @${leadUsername}`);
    console.log(`   Campaign: ${campaignId || 'N/A'}`);
    console.log(`   Message: ${messageText.substring(0, 50)}...`);

    try {
      // 1. Buscar instagram_account_id da campanha
      let instagramAccountId: string | null = null;
      let leadId: string | null = null;

      if (campaignId) {
        const { data: campaign, error: campaignError } = await this.supabase
          .from('cluster_campaigns')
          .select('instagram_account_id')
          .eq('id', campaignId)
          .single();

        if (campaignError) {
          console.warn(`   ⚠️  Campanha não encontrada: ${campaignId}`);
        } else if (campaign) {
          instagramAccountId = (campaign as { instagram_account_id: string | null }).instagram_account_id;
        }

        // Buscar lead_id do campaign_lead (conversationId = campaign_lead_id)
        const { data: campaignLead } = await this.supabase
          .from('campaign_leads')
          .select('lead_id')
          .eq('id', conversationId)
          .single();

        if (campaignLead) {
          leadId = (campaignLead as { lead_id: string }).lead_id;
        }
      }

      if (!instagramAccountId) {
        throw new Error(`Instagram account not configured for campaign: ${campaignId}`);
      }

      console.log(`   📱 Conta Instagram: ${instagramAccountId}`);

      // 2. Enviar DM via Puppeteer (instagram-client-dm.service)
      const result = await instagramClientDMService.sendDM(
        instagramAccountId,
        leadUsername,
        messageText
      );

      if (!result.success) {
        // Se rate limit, não fazer retry imediato
        if (result.rateLimitHit) {
          console.log(`   ⏳ Rate limit - job será reagendado automaticamente`);
          throw new Error(`Rate limit: ${result.error}`);
        }
        throw new Error(result.error || 'Failed to send DM');
      }

      console.log(`   ✅ DM enviada com sucesso! MessageId: ${result.messageId}`);

      // 3. Registrar DM enviado no banco
      if (leadId) {
        const { error: insertError } = await this.supabase
          .from('instagram_dm_outreach')
          .insert({
            lead_id: leadId,
            username: leadUsername,
            message_text: messageText,
            message_generated_by: 'gpt-4o',
            sent_at: new Date().toISOString(),
            delivery_status: 'sent',
          });

        if (insertError) {
          console.error('   ⚠️  Error inserting DM outreach:', insertError.message);
        }
      }

      // 4. Atualizar status do campaign_lead para 'sent'
      const { error: updateError } = await this.supabase
        .from('campaign_leads')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (updateError) {
        console.error('   ⚠️  Error updating campaign_lead status:', updateError.message);
      }

      console.log(`✅ [Instagram DM Worker] Job ${job.id} completed - @${leadUsername}`);
    } catch (error: any) {
      console.error(`❌ [Instagram DM Worker] Error processing job ${job.id}:`, error.message);

      // Atualizar status para 'failed' se erro definitivo
      if (!error.message.includes('Rate limit')) {
        await this.supabase
          .from('campaign_leads')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }

      throw error; // Throw para acionar retry do BullMQ
    }
  }

  /**
   * Fechar worker (graceful shutdown)
   */
  async close(): Promise<void> {
    await this.worker.close();
    console.log('✅ Instagram DM Worker closed');
  }
}

// Export singleton instance
let workerInstance: InstagramDMWorker | null = null;

export function getInstagramDMWorker(): InstagramDMWorker {
  if (!workerInstance) {
    workerInstance = new InstagramDMWorker();
  }
  return workerInstance;
}
