/**
 * ConversationHistoryPersistence - Sistema de Persistência de Conversas
 * 
 * Responsabilidades:
 * - Salvar conversas user+assistant em conversation_history
 * - Manter session_id consistente através da conversa
 * - Logging estruturado para auditoria
 * - Performance otimizada com bulk inserts
 * 
 * PR-3: IMPLEMENTAÇÃO COMPLETA - Dual inserts user+assistant com session_id/intent/outcome tracking
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger';

export interface ConversationMessage {
  sessionId: string;
  userPhone: string;
  tenantId: string;
  content: string;
  isFromUser: boolean;
  messageSource: string;
  intent?: string;
  outcome?: string;
  phoneNumberId?: string;
  conversationContext?: any;
  modelUsed?: string;
  timestamp?: string;
}

export interface PersistenceResult {
  success: boolean;
  insertedRecords: number;
  sessionId: string;
  timestamp: string;
  error?: string;
}

export interface ConversationHistoryRecord {
  id?: string;
  user_phone: string;
  tenant_id: string;
  content: string;
  is_from_user: boolean;
  message_source: string;
  session_id_uuid: string;
  intent?: string;
  outcome?: string;
  phone_number_id?: string;
  conversation_context?: any;
  model_used?: string;
  created_at?: string;
}

export class ConversationHistoryPersistence {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      logger.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Supabase configuration required for ConversationHistoryPersistence');
    }
    
    logger.info('✅ ConversationHistoryPersistence initialized with Supabase connection');
  }

  /**
   * Persiste par de mensagens (user + assistant) atomicamente
   * IMPLEMENTAÇÃO REAL PR-3: Dual inserts com session_id/intent/outcome tracking
   */
  async persistConversationPair(
    userMessage: ConversationMessage,
    assistantMessage: ConversationMessage
  ): Promise<PersistenceResult> {
    const timestamp = new Date().toISOString();
    
    try {
      logger.info('💾 Persisting conversation pair', {
        sessionId: userMessage.sessionId.substring(0, 8) + '...',
        userPhone: userMessage.userPhone.substring(0, 8) + '...',
        tenantId: userMessage.tenantId.substring(0, 8) + '...'
      });

      // Construir records para inserção
      const userRecord: ConversationHistoryRecord = {
        user_phone: userMessage.userPhone,
        tenant_id: userMessage.tenantId,
        content: userMessage.content,
        is_from_user: true,
        message_source: userMessage.messageSource,
        session_id_uuid: userMessage.sessionId,
        intent: userMessage.intent,
        outcome: null as any, // NEVER persist outcome in user messages
        phone_number_id: userMessage.phoneNumberId,
        conversation_context: userMessage.conversationContext,
        model_used: undefined, // User messages não têm model_used
        created_at: timestamp
      };

      const assistantRecord: ConversationHistoryRecord = {
        user_phone: assistantMessage.userPhone,
        tenant_id: assistantMessage.tenantId,
        content: assistantMessage.content,
        is_from_user: false,
        message_source: assistantMessage.messageSource,
        session_id_uuid: assistantMessage.sessionId,
        intent: assistantMessage.intent,
        outcome: null as any, // Outcome will be set ONLY when conversation is finished via ConversationOutcomeAnalyzerService
        phone_number_id: assistantMessage.phoneNumberId,
        conversation_context: assistantMessage.conversationContext,
        model_used: assistantMessage.modelUsed || 'gpt-4',
        created_at: timestamp
      };

      // Inserção atômica de ambos os records
      const { data, error } = await this.supabase
        .from('conversation_history')
        .insert([userRecord, assistantRecord])
        .select();

      if (error) {
        logger.error('❌ Failed to persist conversation pair', {
          error: error.message,
          sessionId: userMessage.sessionId.substring(0, 8) + '...'
        });

        return {
          success: false,
          insertedRecords: 0,
          sessionId: userMessage.sessionId,
          timestamp,
          error: error.message
        };
      }

      logger.info('✅ Conversation pair persisted successfully', {
        sessionId: userMessage.sessionId.substring(0, 8) + '...',
        insertedRecords: data?.length || 2,
        timestamp
      });

      return {
        success: true,
        insertedRecords: data?.length || 2,
        sessionId: userMessage.sessionId,
        timestamp
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('💥 Conversation pair persistence failed', {
        error: errorMessage,
        sessionId: userMessage.sessionId.substring(0, 8) + '...'
      });

      return {
        success: false,
        insertedRecords: 0,
        sessionId: userMessage.sessionId,
        timestamp,
        error: errorMessage
      };
    }
  }

  /**
   * Persiste única mensagem na conversation_history
   * IMPLEMENTAÇÃO REAL PR-3: Single insert com session_id/intent/outcome tracking
   */
  async persistSingleMessage(message: ConversationMessage): Promise<PersistenceResult> {
    const timestamp = new Date().toISOString();
    
    try {
      logger.info('💾 Persisting single message', {
        sessionId: message.sessionId.substring(0, 8) + '...',
        userPhone: message.userPhone.substring(0, 8) + '...',
        isFromUser: message.isFromUser,
        contentLength: message.content.length
      });

      const record: ConversationHistoryRecord = {
        user_phone: message.userPhone,
        tenant_id: message.tenantId,
        content: message.content,
        is_from_user: message.isFromUser,
        message_source: message.messageSource,
        session_id_uuid: message.sessionId,
        intent: message.intent,
        outcome: null as any, // Outcome will be set ONLY when conversation is finished via ConversationOutcomeAnalyzerService
        phone_number_id: message.phoneNumberId,
        conversation_context: message.conversationContext,
        model_used: message.isFromUser ? undefined : (message.modelUsed || 'gpt-4'),
        created_at: timestamp
      };

      const { data, error } = await this.supabase
        .from('conversation_history')
        .insert([record])
        .select();

      if (error) {
        logger.error('❌ Failed to persist single message', {
          error: error.message,
          sessionId: message.sessionId.substring(0, 8) + '...'
        });

        return {
          success: false,
          insertedRecords: 0,
          sessionId: message.sessionId,
          timestamp,
          error: error.message
        };
      }

      logger.info('✅ Single message persisted successfully', {
        sessionId: message.sessionId.substring(0, 8) + '...',
        insertedRecords: data?.length || 1,
        timestamp
      });

      return {
        success: true,
        insertedRecords: data?.length || 1,
        sessionId: message.sessionId,
        timestamp
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('💥 Single message persistence failed', {
        error: errorMessage,
        sessionId: message.sessionId.substring(0, 8) + '...'
      });

      return {
        success: false,
        insertedRecords: 0,
        sessionId: message.sessionId,
        timestamp,
        error: errorMessage
      };
    }
  }

  /**
   * Obtém histórico de conversa por session_id
   * IMPLEMENTAÇÃO REAL PR-3: Query otimizada com session_id tracking
   */
  async getConversationHistory(sessionId: string, limit: number = 20): Promise<ConversationMessage[]> {
    try {
      logger.info('📋 Fetching conversation history', {
        sessionId: sessionId.substring(0, 8) + '...',
        limit
      });

      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('*')
        .eq('session_id_uuid', sessionId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        logger.error('❌ Failed to fetch conversation history', {
          error: error.message,
          sessionId: sessionId.substring(0, 8) + '...'
        });
        return [];
      }

      const history: ConversationMessage[] = (data || []).map((record: any) => ({
        sessionId: record.session_id_uuid,
        userPhone: record.user_phone,
        tenantId: record.tenant_id,
        content: record.content,
        isFromUser: record.is_from_user,
        messageSource: record.message_source,
        intent: record.intent,
        outcome: record.outcome,
        phoneNumberId: record.phone_number_id,
        conversationContext: record.conversation_context,
        modelUsed: record.model_used,
        timestamp: record.created_at
      }));

      logger.info('✅ Conversation history fetched successfully', {
        sessionId: sessionId.substring(0, 8) + '...',
        recordCount: history.length
      });

      return history;

    } catch (error) {
      logger.error('💥 Conversation history fetch failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return [];
    }
  }

  /**
   * Gera ou reutiliza session_id para conversa
   * IMPLEMENTAÇÃO REAL PR-3: Session lifecycle management com persistência
   */
  async getOrCreateSessionId(userPhone: string, tenantId: string): Promise<string> {
    try {
      logger.info('🔄 Getting or creating session ID', {
        userPhone: userPhone.substring(0, 8) + '...',
        tenantId: tenantId.substring(0, 8) + '...'
      });

      // Buscar session_id ativa nas últimas 2 horas
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('session_id_uuid')
        .eq('user_phone', userPhone)
        .eq('tenant_id', tenantId)
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        logger.warn('⚠️ Failed to fetch recent session, creating new one', {
          error: error.message,
          userPhone: userPhone.substring(0, 8) + '...'
        });
      }

      // Se encontrou session recente, reutilizar
      if (data && data.length > 0) {
        const existingSessionId = data[0].session_id_uuid;
        logger.info('♻️ Reusing existing session ID', {
          sessionId: existingSessionId.substring(0, 8) + '...',
          userPhone: userPhone.substring(0, 8) + '...'
        });
        return existingSessionId;
      }

      // Criar novo session_id
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info('✨ Created new session ID', {
        sessionId: newSessionId.substring(0, 8) + '...',
        userPhone: userPhone.substring(0, 8) + '...'
      });

      return newSessionId;

    } catch (error) {
      logger.error('💥 Session ID generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userPhone: userPhone.substring(0, 8) + '...'
      });

      // Fallback: Sempre gerar novo ID em caso de erro
      const fallbackSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return fallbackSessionId;
    }
  }

  /**
   * Obtém estatísticas de persistência para analytics
   * IMPLEMENTAÇÃO REAL PR-3: Métricas detalhadas de conversation_history
   */
  async getPersistenceStats(): Promise<any> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('is_from_user, created_at')
        .gte('created_at', today + 'T00:00:00');

      if (error) {
        logger.error('❌ Failed to fetch persistence stats', { error: error.message });
        return null;
      }

      const userMessages = data?.filter((r: any) => r.is_from_user).length || 0;
      const assistantMessages = data?.filter((r: any) => !r.is_from_user).length || 0;
      const totalMessages = data?.length || 0;

      return {
        todayStats: {
          userMessages,
          assistantMessages,
          totalMessages,
          conversationPairs: Math.min(userMessages, assistantMessages)
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Persistence stats failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
}