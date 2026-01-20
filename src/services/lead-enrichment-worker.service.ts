/**
 * Lead Enrichment Worker Service
 *
 * Worker BullMQ para processar enriquecimento de leads de QUALQUER fonte:
 * - landing: Leads da landing page
 * - inbound_whatsapp: Leads que mandaram mensagem via WhatsApp
 * - inbound_instagram: Leads que mandaram DM no Instagram
 * - scraper: Leads do scraper de hashtags
 * - manual: Leads adicionados manualmente
 *
 * Pipeline de processamento:
 * 1. Scraping do perfil Instagram (se username disponivel)
 * 2. Enriquecimento de dados (email, telefone, localizacao, etc.)
 * 3. Extracao de hashtags
 * 4. Trigger de embedding via N8N
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { LeadEnrichmentJob } from './queue-manager.service';
import { scrapeInstagramProfile } from './instagram-scraper-single.service';
import { enrichSingleLead } from './instagram-lead-enrichment.service';
import { triggerLeadEmbedding } from './lead-embedding-webhook.service';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// =====================================================
// TIPOS
// =====================================================

interface ProcessResult {
  success: boolean;
  leadId: string;
  username: string;
  source: string;
  stages: {
    scraping: boolean;
    enrichment: boolean;
    embedding: boolean;
  };
  error?: string;
}

// =====================================================
// WORKER
// =====================================================

export class LeadEnrichmentWorker {
  private worker: Worker<LeadEnrichmentJob> | null = null;
  private connection: IORedis;

  constructor() {
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
  }

  /**
   * Inicia o worker
   */
  start(): void {
    if (this.worker) {
      console.log('[LeadEnrichmentWorker] Worker ja esta rodando');
      return;
    }

    this.worker = new Worker<LeadEnrichmentJob>(
      'lead-enrichment',
      async (job: Job<LeadEnrichmentJob>) => {
        return this.processJob(job);
      },
      {
        connection: this.connection,
        concurrency: 3, // Processar 3 leads simultaneamente
        limiter: {
          max: 10,
          duration: 60000, // Max 10 jobs por minuto (evitar rate limiting)
        },
      }
    );

    // Event handlers
    this.worker.on('completed', (job, result) => {
      console.log(`[LeadEnrichmentWorker] Job ${job.id} completed: @${result.username} (${result.source})`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[LeadEnrichmentWorker] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('[LeadEnrichmentWorker] Worker error:', error.message);
    });

    console.log('[LeadEnrichmentWorker] Worker iniciado com sucesso');
  }

  /**
   * Para o worker
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[LeadEnrichmentWorker] Worker parado');
    }
  }

  /**
   * Processa um job de enriquecimento
   */
  private async processJob(job: Job<LeadEnrichmentJob>): Promise<ProcessResult> {
    const { leadId, username, source, campaignId } = job.data;

    const result: ProcessResult = {
      success: false,
      leadId,
      username,
      source,
      stages: {
        scraping: false,
        enrichment: false,
        embedding: false,
      },
    };

    try {
      console.log(`\n[LeadEnrichmentWorker] Processando @${username} (${source}) - Job ${job.id}`);

      // 1. SCRAPING DO PERFIL
      if (username) {
        console.log(`[LeadEnrichmentWorker] Etapa 1: Scraping do perfil @${username}...`);

        const profileData = await scrapeInstagramProfile(username);

        if (profileData) {
          result.stages.scraping = true;

          // Atualizar dados do scraping
          const { error: updateError } = await supabase
            .from('instagram_leads')
            .update({
              full_name: profileData.full_name || undefined,
              bio: profileData.bio || undefined,
              followers_count: profileData.followers_count || undefined,
              following_count: profileData.following_count || undefined,
              posts_count: profileData.posts_count || undefined,
              profile_pic_url: profileData.profile_pic_url || undefined,
              is_business: profileData.is_business_account || false,
              is_verified: profileData.is_verified || false,
              external_url: profileData.website || undefined,
              category: profileData.business_category || undefined,
              needs_scraping: false,
              scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);

          if (updateError) {
            console.error(`[LeadEnrichmentWorker] Erro ao salvar scraping:`, updateError.message);
          } else {
            console.log(`[LeadEnrichmentWorker] Scraping concluido para @${username}`);
          }
        } else {
          console.log(`[LeadEnrichmentWorker] Perfil nao encontrado ou privado: @${username}`);

          // Marcar como processado mesmo sem sucesso
          await supabase
            .from('instagram_leads')
            .update({
              needs_scraping: false,
              scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);
        }
      }

      // 2. ENRIQUECIMENTO
      console.log(`[LeadEnrichmentWorker] Etapa 2: Enriquecimento...`);

      // Buscar lead atualizado para enriquecimento
      const { data: leadForEnrichment } = await supabase
        .from('instagram_leads')
        .select('id, username, full_name, bio, external_url, hashtags_bio, hashtags_posts, segment')
        .eq('id', leadId)
        .single();

      if (leadForEnrichment) {
        try {
          const enrichmentResult = await enrichSingleLead({
            id: leadForEnrichment.id,
            username: leadForEnrichment.username,
            full_name: leadForEnrichment.full_name,
            bio: leadForEnrichment.bio,
            website: leadForEnrichment.external_url,
            hashtags_bio: leadForEnrichment.hashtags_bio,
            hashtags_posts: leadForEnrichment.hashtags_posts,
            segment: leadForEnrichment.segment,
          });

          if (enrichmentResult.sources.length > 0) {
            result.stages.enrichment = true;

            // Preparar dados para update
            const updateData: Record<string, any> = {
              enriched: true,
              enriched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Flags para integracao com workflow N8N "Embedar Leads Pendentes"
              dado_enriquecido: true,
              hashtags_extracted: true,
              hashtags_ready_for_embedding: true,
              url_enriched: !leadForEnrichment.external_url || enrichmentResult.url_enriched,
            };

            // Adicionar dados enriquecidos
            const e = enrichmentResult.enriched;
            if (e.full_name) updateData.full_name = e.full_name;
            if (e.first_name) updateData.first_name = e.first_name;
            if (e.last_name) updateData.last_name = e.last_name;
            if (e.profession) updateData.profession = e.profession;
            if (e.email) updateData.email = e.email;
            if (e.phone) updateData.phone = e.phone;
            if (e.city) updateData.city = e.city;
            if (e.state) updateData.state = e.state;
            if (e.address) updateData.address = e.address;
            if (e.zip_code) updateData.zip_code = e.zip_code;
            if (e.business_category) updateData.business_category = e.business_category;
            if (e.hashtags_bio && e.hashtags_bio.length > 0) {
              updateData.hashtags_bio = e.hashtags_bio;
            }

            // Salvar WhatsApp number se encontrado
            if (e.whatsapp_numbers && e.whatsapp_numbers.length > 0) {
              const firstWhatsapp = e.whatsapp_numbers[0];
              if (firstWhatsapp) {
                updateData.whatsapp_number = firstWhatsapp.number;
              }
              updateData.whatsapp_numbers_history = e.whatsapp_numbers;
            }

            // Atualizar no banco
            const { error: enrichError } = await supabase
              .from('instagram_leads')
              .update(updateData)
              .eq('id', leadId);

            if (enrichError) {
              console.error(`[LeadEnrichmentWorker] Erro ao salvar enriquecimento:`, enrichError.message);
            } else {
              console.log(`[LeadEnrichmentWorker] Enriquecimento concluido (fontes: ${enrichmentResult.sources.join(', ')})`);
            }
          } else {
            console.log(`[LeadEnrichmentWorker] Sem dados novos no enriquecimento`);

            // Mesmo sem dados novos, marcar as flags para permitir embedding
            await supabase
              .from('instagram_leads')
              .update({
                dado_enriquecido: true,
                hashtags_extracted: true,
                hashtags_ready_for_embedding: true,
                url_enriched: !leadForEnrichment.external_url,
                updated_at: new Date().toISOString(),
              })
              .eq('id', leadId);
          }
        } catch (enrichError: any) {
          console.error(`[LeadEnrichmentWorker] Erro no enriquecimento:`, enrichError.message);
        }
      }

      // 3. EMBEDDING
      console.log(`[LeadEnrichmentWorker] Etapa 3: Disparando embedding...`);

      try {
        await triggerLeadEmbedding(leadId, username, 'insert', `enrichment-worker-${source}`);
        result.stages.embedding = true;
        console.log(`[LeadEnrichmentWorker] Webhook de embedding disparado`);
      } catch (embedError: any) {
        console.error(`[LeadEnrichmentWorker] Erro ao disparar embedding:`, embedError.message);
      }

      // Determinar sucesso geral
      result.success = result.stages.scraping || result.stages.enrichment;

      console.log(`[LeadEnrichmentWorker] Processamento concluido para @${username} - scrape=${result.stages.scraping} enrich=${result.stages.enrichment} embed=${result.stages.embedding}`);

      return result;

    } catch (error: any) {
      console.error(`[LeadEnrichmentWorker] Erro ao processar @${username}:`, error.message);
      result.error = error.message;
      throw error; // Re-throw para BullMQ marcar como falha e fazer retry
    }
  }
}

// =====================================================
// SINGLETON E HELPERS
// =====================================================

let workerInstance: LeadEnrichmentWorker | null = null;

export function getLeadEnrichmentWorker(): LeadEnrichmentWorker {
  if (!workerInstance) {
    workerInstance = new LeadEnrichmentWorker();
  }
  return workerInstance;
}

/**
 * Helper para enfileirar um lead para enriquecimento
 * Pode ser chamado de qualquer lugar do sistema
 */
export async function enqueueLeadForEnrichment(
  leadId: string,
  username: string,
  source: 'landing' | 'inbound_whatsapp' | 'inbound_instagram' | 'scraper' | 'manual',
  campaignId?: string,
  priority: number = 5
): Promise<string> {
  // Import dinamico para evitar circular dependency
  const { queueManager } = await import('./queue-manager.service');

  return queueManager.enqueueLeadEnrichment({
    leadId,
    username,
    source,
    campaignId,
    priority,
  }, priority);
}

export default LeadEnrichmentWorker;
