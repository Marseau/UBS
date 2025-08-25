/**
 * CONVERSATION OUTCOME PROCESSOR - CRONJOB
 * 
 * Executa periodicamente para:
 * 1. Detectar conversas que finalizaram por timeout
 * 2. Analisar contexto completo das conversas
 * 3. Persistir outcome APENAS na última mensagem AI
 * 
 * Execução recomendada: A cada 15 minutos
 */

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { WebhookFlowOrchestratorService } from '../services/webhook-flow-orchestrator.service';

export class ConversationOutcomeProcessor {
  private orchestrator: WebhookFlowOrchestratorService;
  private isProcessing: boolean = false;

  constructor() {
    this.orchestrator = new WebhookFlowOrchestratorService();
  }

  /**
   * INICIAR CRONJOB
   * Executa a cada 15 minutos para processar conversas finalizadas
   */
  start(): void {
    // Executar a cada 15 minutos: */15 * * * *
    cron.schedule('*/15 * * * *', async () => {
      if (this.isProcessing) {
        logger.info('⚠️ Conversation outcome processing already in progress, skipping...');
        return;
      }

      this.isProcessing = true;
      
      try {
        logger.info('🔄 Starting conversation outcome processing...');
        const startTime = Date.now();
        
        await this.orchestrator.processFinishedConversations();
        
        const duration = Date.now() - startTime;
        logger.info(`✅ Conversation outcome processing completed in ${duration}ms`);
        
      } catch (error) {
        logger.error('❌ Failed to process conversation outcomes', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        this.isProcessing = false;
      }
    });

    logger.info('🚀 Conversation outcome processor cronjob started (every 15 minutes)');
  }

  /**
   * PARAR CRONJOB
   */
  stop(): void {
    cron.getTasks().forEach(task => (task as any).destroy());
    logger.info('🛑 Conversation outcome processor cronjob stopped');
  }

  /**
   * EXECUTAR PROCESSAMENTO MANUAL (para testes)
   */
  async processNow(): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Conversation outcome processing already in progress');
    }

    this.isProcessing = true;
    
    try {
      logger.info('🔧 Manual conversation outcome processing triggered...');
      const startTime = Date.now();
      
      await this.orchestrator.processFinishedConversations();
      
      const duration = Date.now() - startTime;
      logger.info(`✅ Manual processing completed in ${duration}ms`);
      
    } finally {
      this.isProcessing = false;
    }
  }
}

// Singleton instance
export const conversationOutcomeProcessor = new ConversationOutcomeProcessor();