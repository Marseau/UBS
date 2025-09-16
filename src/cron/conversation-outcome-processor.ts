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
import { conversationLogger } from '../utils/logger';
import { WebhookFlowOrchestratorService } from '../services/webhook-flow-orchestrator.service';

export class ConversationOutcomeProcessor {
  private orchestrator: WebhookFlowOrchestratorService;
  private isProcessing: boolean = false;
  private logger = conversationLogger('conversation-outcome-processor');

  constructor() {
    this.orchestrator = new WebhookFlowOrchestratorService();
  }

  /**
   * INICIAR CRONJOB
   * Executa a cada 10 minutos para processar conversas finalizadas
   */
  start(): void {
    // Executar a cada 10 minutos: */10 * * * *
    cron.schedule('*/10 * * * *', async () => {
      if (this.isProcessing) {
        this.logger.warn('⚠️ Conversation outcome processing already in progress, skipping...', {
          service: 'conversation-outcome-processor',
          method: 'start',
          operationType: 'cron_skip'
        });
        return;
      }

      this.isProcessing = true;
      
      try {
        this.logger.conversation('🔄 Starting conversation outcome processing...', {
          service: 'conversation-outcome-processor',
          method: 'start',
          operationType: 'cron_start'
        });
        const startTime = Date.now();
        
        await this.orchestrator.processFinishedConversations();
        
        const duration = Date.now() - startTime;
        this.logger.conversation(`✅ Conversation outcome processing completed in ${duration}ms`, {
          service: 'conversation-outcome-processor',
          method: 'start',
          operationType: 'cron_complete',
          duration
        });
        
      } catch (error) {
        this.logger.conversationError(error as Error, {
          service: 'conversation-outcome-processor',
          method: 'start',
          operationType: 'cron_error'
        });
      } finally {
        this.isProcessing = false;
      }
    });

    this.logger.conversation('🚀 Conversation outcome processor cronjob started (every 15 minutes)', {
      service: 'conversation-outcome-processor',
      method: 'start',
      operationType: 'cron_scheduled'
    });
  }

  /**
   * PARAR CRONJOB
   */
  stop(): void {
    cron.getTasks().forEach(task => (task as any).destroy());
    this.logger.conversation('🛑 Conversation outcome processor cronjob stopped', {
      service: 'conversation-outcome-processor',
      method: 'stop',
      operationType: 'cron_stopped'
    });
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
      this.logger.conversation('🔧 Manual conversation outcome processing triggered...', {
        service: 'conversation-outcome-processor',
        method: 'processNow',
        operationType: 'manual_trigger'
      });
      const startTime = Date.now();
      
      await this.orchestrator.processFinishedConversations();
      
      const duration = Date.now() - startTime;
      this.logger.conversation(`✅ Manual processing completed in ${duration}ms`, {
        service: 'conversation-outcome-processor',
        method: 'processNow',
        operationType: 'manual_complete',
        duration
      });
      
    } finally {
      this.isProcessing = false;
    }
  }
}

// Singleton instance
export const conversationOutcomeProcessor = new ConversationOutcomeProcessor();