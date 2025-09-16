import { ConversationRepository } from '../repositories/conversation.repository';
import { conversationLogger, extractConversationContext } from '../utils/logger';

export class ConversationHistoryPersistence {
  private logger = conversationLogger('conversation-persistence');
  constructor(private readonly repo: ConversationRepository) {}

  /**
   * Aplica regras de idempotência (hash de conteúdo por sessão)
   * e normaliza campos antes de persistir.
   */
  async saveMessage(msg: {
    tenant_id: string;
    user_id: string;
    is_from_user: boolean;
    content: string;
    message_type: 'text' | 'media' | 'system';
    conversation_context: {
      session_id: string;
      duration_minutes?: number;
    }; // JSONB field - session_id_uuid is auto-generated from session_id
    intent_detected: string | null;
    confidence_score: number | null;
    tokens_used: number;
    api_cost_usd: number;
    processing_cost_usd: number;
    model_used: string | null;
    decision_method: 'flow_lock' | 'regex' | 'llm' | null;
    message_source?: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api'; // Origem da mensagem
    created_at: Date;
  }) {
    // Extract session_id from conversation_context
    const sessionId = msg.conversation_context?.session_id;
    if (!sessionId) {
      throw new Error('conversation_context.session_id is required');
    }
    
    // Idempotência básica: evita duplicar mesma resposta no mesmo ms
    const exists = await this.repo.existsSamePayloadWithinWindow(
      sessionId,
      msg.content,
      1500 /* ms */
    );
    if (exists) {
      this.logger.persistence('Message ignored - idempotent', {
        sessionId,
        tenantId: msg.tenant_id,
        userId: msg.user_id,
        messageSource: msg.message_source,
        contentLength: msg.content.length,
        operation: 'duplicate_prevention',
        success: true
      });
      return;
    }
    
    const conversationContext = {
      conversationId: `conv_${msg.tenant_id}_${sessionId}`,
      sessionId,
      tenantId: msg.tenant_id,
      userId: msg.user_id,
      messageSource: msg.message_source as any
    };

    const traceOperation = this.logger.startConversationTrace('saveMessage', conversationContext);

    try {
      const startTime = Date.now();
      await this.repo.insertMessage(msg);
      const queryTimeMs = Date.now() - startTime;

      // Log successful persistence with telemetry data
      this.logger.persistence('Message saved successfully', {
        ...conversationContext,
        intent: msg.intent_detected || undefined,
        confidence: msg.confidence_score || undefined,
        model_used: msg.model_used || undefined,
        decision_method: msg.decision_method,
        tokens_used: msg.tokens_used,
        api_cost_usd: msg.api_cost_usd,
        processing_cost_usd: msg.processing_cost_usd,
        contentLength: msg.content.length,
        messageType: msg.message_type,
        isFromUser: msg.is_from_user,
        queryTimeMs,
        operation: 'insert_message',
        success: true
      });

      traceOperation({ success: true, metadata: { queryTimeMs, intent: msg.intent_detected } });
    } catch (error) {
      this.logger.conversationError(error as Error, {
        ...conversationContext,
        operation: 'insert_message',
        contentLength: msg.content?.length,
        messageType: msg.message_type,
        intent: msg.intent_detected || undefined,
        decision_method: msg.decision_method
      });

      traceOperation({ success: false, error: (error as Error).message });
      throw error;
    }
  }
}