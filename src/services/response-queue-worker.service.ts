/**
 * Response Queue Worker Service
 *
 * Processa a fila de respostas de outreach (Instagram DM + WhatsApp)
 * com controle de concorrência, rate limiting e overflow protection.
 *
 * Características:
 * - Máximo 3 workers simultâneos por padrão
 * - Respeita rate limits de cada canal/conta
 * - Retry automático com backoff exponencial
 * - Logging detalhado de processamento
 */

import { createClient } from '@supabase/supabase-js';
import { credentialsVault, RateLimitStatus } from './credentials-vault.service';
import { whatsappSessionManager } from './whatsapp-session-manager.service';
import { instagramClientDMService } from './instagram-client-dm.service';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TYPES
// ============================================================================

interface QueueItem {
  id: string;
  campaign_id: string;
  lead_id: string;
  channel: 'instagram_dm' | 'whatsapp';
  message_type: 'text' | 'template' | 'media';
  message_content: Record<string, unknown>;
  recipient_identifier: string;
  account_id: string | null;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  scheduled_for: string | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

interface WorkerStats {
  processed: number;
  successful: number;
  failed: number;
  retried: number;
  startedAt: Date;
  lastProcessedAt: Date | null;
}

interface WorkerConfig {
  maxConcurrent: number;
  pollIntervalMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  shutdownTimeoutMs: number;
}

type ProcessResult = {
  success: boolean;
  error?: string;
  messageId?: string;
};

// ============================================================================
// WORKER CLASS
// ============================================================================

class ResponseQueueWorker {
  private isRunning: boolean = false;
  private activeWorkers: number = 0;
  private stats: WorkerStats;
  private config: WorkerConfig;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private shutdownResolve: (() => void) | null = null;

  constructor() {
    this.config = {
      maxConcurrent: parseInt(process.env.QUEUE_MAX_CONCURRENT || '3'),
      pollIntervalMs: parseInt(process.env.QUEUE_POLL_INTERVAL_MS || '5000'),
      maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
      baseRetryDelayMs: parseInt(process.env.QUEUE_BASE_RETRY_DELAY_MS || '1000'),
      maxRetryDelayMs: parseInt(process.env.QUEUE_MAX_RETRY_DELAY_MS || '60000'),
      shutdownTimeoutMs: parseInt(process.env.QUEUE_SHUTDOWN_TIMEOUT_MS || '30000'),
    };

    this.stats = {
      processed: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      startedAt: new Date(),
      lastProcessedAt: null,
    };
  }

  // --------------------------------------------------------------------------
  // PUBLIC METHODS
  // --------------------------------------------------------------------------

  /**
   * Inicia o worker de processamento da fila
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[QueueWorker] Worker already running');
      return;
    }

    console.log('[QueueWorker] Starting response queue worker...');
    console.log(`[QueueWorker] Config: maxConcurrent=${this.config.maxConcurrent}, pollInterval=${this.config.pollIntervalMs}ms`);

    this.isRunning = true;
    this.stats.startedAt = new Date();

    this.poll();
  }

  /**
   * Para o worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[QueueWorker] Worker not running');
      return;
    }

    console.log('[QueueWorker] Stopping worker gracefully...');
    this.isRunning = false;

    // Cancel polling
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Wait for active workers to finish
    if (this.activeWorkers > 0) {
      console.log(`[QueueWorker] Waiting for ${this.activeWorkers} active workers to finish...`);

      this.shutdownPromise = new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
      });

      // Set timeout for shutdown
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), this.config.shutdownTimeoutMs);
      });

      try {
        await Promise.race([this.shutdownPromise, timeoutPromise]);
        console.log('[QueueWorker] All workers finished');
      } catch {
        console.warn('[QueueWorker] Shutdown timeout, some workers may still be processing');
      }
    }

    console.log('[QueueWorker] Worker stopped');
    console.log(`[QueueWorker] Final stats: processed=${this.stats.processed}, successful=${this.stats.successful}, failed=${this.stats.failed}`);
  }

  /**
   * Retorna estatísticas do worker
   */
  getStats(): WorkerStats & { isRunning: boolean; activeWorkers: number } {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      activeWorkers: this.activeWorkers,
    };
  }

  /**
   * Atualiza configuração do worker em runtime
   */
  updateConfig(newConfig: Partial<WorkerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[QueueWorker] Config updated:', this.config);
  }

  // --------------------------------------------------------------------------
  // PRIVATE METHODS - POLLING
  // --------------------------------------------------------------------------

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Check if we can process more items
      const availableSlots = this.config.maxConcurrent - this.activeWorkers;

      if (availableSlots > 0) {
        // Fetch items from queue
        const items = await this.fetchQueueItems(availableSlots);

        if (items.length > 0) {
          console.log(`[QueueWorker] Processing ${items.length} items (active: ${this.activeWorkers}/${this.config.maxConcurrent})`);

          // Process items concurrently
          for (const item of items) {
            this.processItem(item);
          }
        }
      }
    } catch (error) {
      console.error('[QueueWorker] Poll error:', error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimeout = setTimeout(() => this.poll(), this.config.pollIntervalMs);
    }
  }

  private async fetchQueueItems(limit: number): Promise<QueueItem[]> {
    const items: QueueItem[] = [];

    // Fetch items one by one using the atomic function
    for (let i = 0; i < limit; i++) {
      const { data, error } = await supabase.rpc('get_next_response_queue_item');

      if (error) {
        console.error('[QueueWorker] Error fetching queue item:', error);
        break;
      }

      if (data && data.length > 0) {
        items.push(data[0] as QueueItem);
      } else {
        // No more items available
        break;
      }
    }

    return items;
  }

  // --------------------------------------------------------------------------
  // PRIVATE METHODS - PROCESSING
  // --------------------------------------------------------------------------

  private async processItem(item: QueueItem): Promise<void> {
    this.activeWorkers++;

    try {
      console.log(`[QueueWorker] Processing item ${item.id} (channel: ${item.channel}, recipient: ${item.recipient_identifier})`);

      let result: ProcessResult;

      // Check rate limits before processing
      if (item.account_id) {
        const rateLimitStatus: RateLimitStatus = await credentialsVault.checkRateLimit(item.account_id);

        // Check if any action is allowed based on the channel
        const canProceed = item.channel === 'instagram_dm'
          ? rateLimitStatus.canDm
          : (rateLimitStatus.canFollow && rateLimitStatus.isWithinHours);

        if (!canProceed) {
          console.log(`[QueueWorker] Rate limit reached for account ${item.account_id}, rescheduling...`);
          await this.rescheduleItem(item, rateLimitStatus.reason || 'Rate limit exceeded');
          return;
        }
      }

      // Process based on channel
      switch (item.channel) {
        case 'whatsapp':
          result = await this.processWhatsAppMessage(item);
          break;
        case 'instagram_dm':
          result = await this.processInstagramDM(item);
          break;
        default:
          result = { success: false, error: `Unknown channel: ${item.channel}` };
      }

      // Handle result
      if (result.success) {
        await this.completeItem(item, result.messageId);
        this.stats.successful++;
      } else {
        await this.handleFailure(item, result.error || 'Unknown error');
      }

      this.stats.processed++;
      this.stats.lastProcessedAt = new Date();

    } catch (error) {
      console.error(`[QueueWorker] Error processing item ${item.id}:`, error);
      await this.handleFailure(item, error instanceof Error ? error.message : 'Unknown error');
      this.stats.processed++;
    } finally {
      this.activeWorkers--;

      // Check if we should resolve shutdown promise
      if (!this.isRunning && this.activeWorkers === 0 && this.shutdownResolve) {
        this.shutdownResolve();
      }
    }
  }

  private async processWhatsAppMessage(item: QueueItem): Promise<ProcessResult> {
    try {
      // Get session for the campaign
      const session = await whatsappSessionManager.getSessionByCampaign(item.campaign_id);

      if (!session) {
        return { success: false, error: 'WhatsApp session not found for campaign' };
      }

      if (session.status !== 'connected') {
        return { success: false, error: `WhatsApp session not connected (status: ${session.status})` };
      }

      // Extract message content
      const content = item.message_content as { text?: string; mediaUrl?: string; mediaType?: string };

      if (!content.text) {
        return { success: false, error: 'Message content missing text' };
      }

      // Send message via WhatsApp session manager
      const result = await whatsappSessionManager.sendMessage(
        session.id,
        item.recipient_identifier,
        content.text
      );

      if (result.success) {
        return { success: true, messageId: result.messageId };
      } else {
        return { success: false, error: result.error };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WhatsApp send error'
      };
    }
  }

  private async processInstagramDM(item: QueueItem): Promise<ProcessResult> {
    try {
      if (!item.account_id) {
        return { success: false, error: 'Instagram account_id not specified' };
      }

      // Get Instagram credentials
      const credentialsResult = await credentialsVault.getInstagramCredentials(
        item.account_id,
        'queue-worker',
        `Processing queue item ${item.id}`
      );

      if (!credentialsResult.success || !credentialsResult.credentials) {
        return { success: false, error: credentialsResult.error || 'Failed to retrieve Instagram credentials' };
      }

      // Extract message content
      const content = item.message_content as { text?: string };

      if (!content.text) {
        return { success: false, error: 'Message content missing text' };
      }

      // Usar o serviço de DM do cliente
      const result = await instagramClientDMService.sendDM(
        item.account_id,
        item.recipient_identifier,
        content.text
      );

      if (result.success) {
        // Incrementar ação no vault
        await credentialsVault.incrementAction(item.account_id, 'dm');
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Instagram DM send error'
      };
    }
  }

  // --------------------------------------------------------------------------
  // PRIVATE METHODS - STATUS UPDATES
  // --------------------------------------------------------------------------

  private async completeItem(item: QueueItem, messageId?: string): Promise<void> {
    const { error } = await supabase.rpc('complete_response_queue_item', {
      p_item_id: item.id,
      p_result: { messageId, completedAt: new Date().toISOString() }
    });

    if (error) {
      console.error(`[QueueWorker] Error completing item ${item.id}:`, error);
    } else {
      console.log(`[QueueWorker] Completed item ${item.id} (messageId: ${messageId})`);
    }
  }

  private async handleFailure(item: QueueItem, errorMessage: string): Promise<void> {
    if (item.attempts < item.max_attempts) {
      // Retry with exponential backoff
      const delay = this.calculateBackoff(item.attempts);
      await this.rescheduleItem(item, errorMessage, delay);
      this.stats.retried++;
    } else {
      // Mark as permanently failed
      const { error } = await supabase.rpc('fail_response_queue_item', {
        p_item_id: item.id,
        p_error: errorMessage
      });

      if (error) {
        console.error(`[QueueWorker] Error failing item ${item.id}:`, error);
      } else {
        console.log(`[QueueWorker] Permanently failed item ${item.id} after ${item.attempts} attempts: ${errorMessage}`);
      }

      this.stats.failed++;
    }
  }

  private async rescheduleItem(item: QueueItem, reason: string, delayMs?: number): Promise<void> {
    const scheduledFor = delayMs
      ? new Date(Date.now() + delayMs).toISOString()
      : new Date(Date.now() + this.config.baseRetryDelayMs).toISOString();

    const { error } = await supabase
      .from('outreach_response_queue')
      .update({
        status: 'pending',
        scheduled_for: scheduledFor,
        error_message: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      console.error(`[QueueWorker] Error rescheduling item ${item.id}:`, error);
    } else {
      console.log(`[QueueWorker] Rescheduled item ${item.id} for ${scheduledFor}: ${reason}`);
    }
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.baseRetryDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, this.config.maxRetryDelayMs);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const responseQueueWorker = new ResponseQueueWorker();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Adiciona um item à fila de respostas
 */
export async function enqueueResponse(params: {
  campaignId: string;
  leadId: string;
  channel: 'instagram_dm' | 'whatsapp';
  messageType?: 'text' | 'template' | 'media';
  messageContent: Record<string, unknown>;
  recipientIdentifier: string;
  accountId?: string;
  priority?: number;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; queueId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('enqueue_response', {
      p_campaign_id: params.campaignId,
      p_lead_id: params.leadId,
      p_channel: params.channel,
      p_message_type: params.messageType || 'text',
      p_message_content: params.messageContent,
      p_recipient_identifier: params.recipientIdentifier,
      p_account_id: params.accountId || null,
      p_priority: params.priority || 5,
      p_scheduled_for: params.scheduledFor?.toISOString() || null,
      p_metadata: params.metadata || {}
    });

    if (error) {
      console.error('[QueueWorker] Error enqueueing response:', error);
      return { success: false, error: error.message };
    }

    return { success: true, queueId: data as string };

  } catch (error) {
    console.error('[QueueWorker] Error enqueueing response:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Verifica o status da fila
 */
export async function getQueueStatus(campaignId?: string): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}> {
  try {
    const { data, error } = await supabase.rpc('check_response_queue_status', {
      p_campaign_id: campaignId || null
    });

    if (error) {
      console.error('[QueueWorker] Error checking queue status:', error);
      return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    }

    const status = data?.[0] || { pending: 0, processing: 0, completed: 0, failed: 0 };
    return {
      ...status,
      total: status.pending + status.processing + status.completed + status.failed
    };

  } catch (error) {
    console.error('[QueueWorker] Error checking queue status:', error);
    return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  }
}

/**
 * Limpa itens antigos da fila (completed/failed com mais de X dias)
 */
export async function cleanupOldQueueItems(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabase
      .from('outreach_response_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      console.error('[QueueWorker] Error cleaning up old items:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`[QueueWorker] Cleaned up ${count} old queue items`);
    return count;

  } catch (error) {
    console.error('[QueueWorker] Error cleaning up old items:', error);
    return 0;
  }
}
