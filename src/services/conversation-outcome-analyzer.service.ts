/**
 * CONVERSATION OUTCOME ANALYZER SERVICE
 * 
 * Responsável por analisar o contexto COMPLETO da conversa e determinar
 * o outcome correto baseado no fluxo inteiro, não apenas mensagens individuais.
 * 
 * REGRA CRÍTICA: conversation_outcome DEVE ser persistido APENAS na última mensagem
 * da conversa, após análise contextual completa.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export interface ConversationContext {
  sessionId: string;
  tenantId: string;
  userPhone: string;
  messages: ConversationMessage[];
  startTime: string;
  endTime?: string;
  totalDuration?: number;
  hasActiveFlow?: boolean;
  appointmentCreated?: boolean;
  lastIntent?: string;
}

export interface ConversationMessage {
  id: string;
  content: string;
  isFromUser: boolean;
  intent?: string;
  createdAt: string;
  conversationContext?: any;
}

export interface OutcomeAnalysis {
  outcome: string;
  confidence: number;
  reasoning: string;
  triggeredBy: 'timeout' | 'flow_completion' | 'appointment_action' | 'user_exit' | 'system_decision';
  finalMessageId: string;
}

/**
 * OS 16 OUTCOMES VÁLIDOS (conforme conversation_outcome_check constraint)
 */
export const VALID_OUTCOMES = [
  'appointment_created',        // Criou novo agendamento ✅
  'info_request_fulfilled',     // Só queria informação 📋
  'business_hours_inquiry',     // Perguntou horário funcionamento 🕐
  'price_inquiry',             // Perguntou preços 💰
  'location_inquiry',          // Perguntou endereço 📍
  'booking_abandoned',         // Começou agendar mas desistiu 🔄
  'timeout_abandoned',         // Não respondeu em 60s ⏰
  'wrong_number',             // Número errado ❌
  'spam_detected',            // Spam/bot 🚫
  'test_message',             // Mensagem de teste 🧪
  'appointment_rescheduled',   // Remarcou agendamento existente 📅
  'appointment_cancelled',     // Cancelou agendamento existente ❌
  'appointment_confirmed',     // Confirmou agendamento existente ✅
  'appointment_inquiry',       // Perguntou sobre agendamento existente ❓
  'appointment_modified',      // Alterou detalhes do agendamento 🔧
  'appointment_noshow_followup' // Justificou/seguiu após no_show 📞
] as const;

export type ConversationOutcome = typeof VALID_OUTCOMES[number];

export class ConversationOutcomeAnalyzerService {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * ANÁLISE CONTEXTUAL COMPLETA - Ponto de entrada principal
   * Analisa toda a conversa e determina se deve persistir outcome
   */
  async analyzeConversationOutcome(
    sessionId: string,
    trigger: 'timeout' | 'flow_completion' | 'appointment_action' | 'user_exit' = 'flow_completion'
  ): Promise<OutcomeAnalysis | null> {
    try {
      logger.info('🔍 Analyzing conversation outcome', {
        sessionId: sessionId.substring(0, 8) + '...',
        trigger
      });

      // 1. BUSCAR CONTEXTO COMPLETO DA CONVERSA
      const context = await this.getConversationContext(sessionId);
      if (!context || context.messages.length === 0) {
        logger.warn('⚠️ No conversation context found', { sessionId });
        return null;
      }

      // 2. VERIFICAR SE JÁ TEM OUTCOME PERSISTIDO
      const hasOutcome = context.messages.some(msg => 
        !msg.isFromUser && msg.conversationContext?.conversation_outcome
      );
      
      if (hasOutcome) {
        logger.info('✅ Conversation already has outcome, skipping analysis');
        return null;
      }

      // 3. ANALISAR PADRÕES DA CONVERSA
      const analysis = await this.performContextualAnalysis(context, trigger);
      
      if (!analysis) {
        logger.info('⚠️ Conversation not ready for outcome determination');
        return null;
      }

      logger.info('🎯 Conversation outcome determined', {
        outcome: analysis.outcome,
        confidence: analysis.confidence,
        trigger: analysis.triggeredBy
      });

      return analysis;

    } catch (error) {
      logger.error('❌ Failed to analyze conversation outcome', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId
      });
      return null;
    }
  }

  /**
   * PERSISTIR OUTCOME NA ÚLTIMA MENSAGEM
   * REGRA: A última mensagem da conversa deve ter o outcome (AI ou usuário)
   */
  async persistOutcomeToFinalMessage(analysis: OutcomeAnalysis): Promise<boolean> {
    try {
      logger.info('💾 Persisting outcome to final message', {
        messageId: analysis.finalMessageId,
        outcome: analysis.outcome
      });

      // Atualizar a ÚLTIMA mensagem da conversa com o outcome
      const { error } = await this.supabase
        .from('conversation_history')
        .update({ 
          conversation_outcome: analysis.outcome
        })
        .eq('id', analysis.finalMessageId); // Não filtrar por is_from_user

      if (error) {
        logger.error('❌ Failed to persist outcome', {
          error: error.message,
          messageId: analysis.finalMessageId
        });
        return false;
      }

      logger.info('✅ Outcome persisted successfully', {
        messageId: analysis.finalMessageId,
        outcome: analysis.outcome
      });

      return true;

    } catch (error) {
      logger.error('❌ Error persisting outcome', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * BUSCAR CONTEXTO COMPLETO DA CONVERSA
   */
  private async getConversationContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('id, content, is_from_user, intent_detected, created_at, conversation_context, tenant_id, user_id')
        .eq('session_id_uuid', sessionId)
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        return null;
      }

      const messages: ConversationMessage[] = data.map((row: any) => ({
        id: row.id,
        content: row.content,
        isFromUser: row.is_from_user,
        intent: row.intent_detected,
        createdAt: row.created_at,
        conversationContext: row.conversation_context
      }));

      const firstMessage = data[0];
      const lastMessage = data[data.length - 1];
      const startTime = firstMessage.created_at;
      const endTime = lastMessage.created_at;
      const totalDuration = new Date(endTime).getTime() - new Date(startTime).getTime();

      return {
        sessionId,
        tenantId: firstMessage.tenant_id,
        userPhone: firstMessage.user_id, // user_id será usado como identificador
        messages,
        startTime,
        endTime,
        totalDuration,
        lastIntent: messages.filter(m => m.isFromUser).pop()?.intent
      };

    } catch (error) {
      logger.error('❌ Failed to get conversation context', { error });
      return null;
    }
  }

  /**
   * ANÁLISE CONTEXTUAL INTELIGENTE
   * Determina outcome baseado no FLUXO COMPLETO da conversa
   */
  private async performContextualAnalysis(
    context: ConversationContext, 
    trigger: string
  ): Promise<OutcomeAnalysis | null> {
    
    const userMessages = context.messages.filter(m => m.isFromUser);
    const aiMessages = context.messages.filter(m => !m.isFromUser);
    
    // CORREÇÃO: Usar a ÚLTIMA mensagem da conversa (não necessariamente AI)
    const lastMessage = context.messages[context.messages.length - 1];
    
    if (!lastMessage) {
      return null;
    }

    // 1. DETECTAR APPOINTMENT ACTIONS
    const appointmentOutcome = this.detectAppointmentOutcome(context);
    if (appointmentOutcome) {
      return {
        outcome: appointmentOutcome,
        confidence: 0.95,
        reasoning: 'Appointment action detected in conversation flow',
        triggeredBy: 'appointment_action',
        finalMessageId: lastMessage.id
      };
    }

    // 2. DETECTAR INFO REQUESTS ESPECÍFICOS
    const infoOutcome = this.detectInfoRequestOutcome(context);
    if (infoOutcome) {
      return {
        outcome: infoOutcome,
        confidence: 0.85,
        reasoning: 'Specific info request pattern detected',
        triggeredBy: trigger as any,
        finalMessageId: lastMessage.id
      };
    }

    // 3. DETECTAR ABANDONO POR TIMEOUT
    if (trigger === 'timeout') {
      const hasBookingIntent = userMessages.some(m => 
        m.intent === 'booking' || m.content.toLowerCase().includes('agendar')
      );
      
      return {
        outcome: hasBookingIntent ? 'booking_abandoned' : 'timeout_abandoned',
        confidence: 0.8,
        reasoning: `Conversation abandoned after ${context.totalDuration}ms`,
        triggeredBy: 'timeout',
        finalMessageId: lastMessage.id
      };
    }

    // 4. DETECTAR OUTROS PADRÕES
    const otherOutcome = this.detectOtherPatterns(context);
    if (otherOutcome) {
      return {
        outcome: otherOutcome,
        confidence: 0.7,
        reasoning: 'Pattern-based outcome detection',
        triggeredBy: trigger as any,
        finalMessageId: lastMessage.id
      };
    }

    // 5. DEFAULT: INFO REQUEST GENÉRICO
    return {
      outcome: 'info_request_fulfilled',
      confidence: 0.6,
      reasoning: 'Default outcome for completed conversation',
      triggeredBy: trigger as any,
      finalMessageId: lastMessage.id
    };
  }

  /**
   * DETECTAR OUTCOMES RELACIONADOS A APPOINTMENTS
   */
  private detectAppointmentOutcome(context: ConversationContext): ConversationOutcome | null {
    const allMessages = context.messages.map(m => m.content.toLowerCase()).join(' ');
    
    // Appointment created - procurar confirmação de criação
    if (allMessages.includes('agendamento criado') || allMessages.includes('agendado com sucesso')) {
      return 'appointment_created';
    }
    
    // Appointment cancelled
    if (allMessages.includes('cancelado') || allMessages.includes('cancelar agendamento')) {
      return 'appointment_cancelled';
    }
    
    // Appointment rescheduled
    if (allMessages.includes('remarcar') || allMessages.includes('alterar horário')) {
      return 'appointment_rescheduled';
    }
    
    // Appointment inquiry
    if (allMessages.includes('meu agendamento') || allMessages.includes('consultar agendamento')) {
      return 'appointment_inquiry';
    }

    return null;
  }

  /**
   * DETECTAR OUTCOMES DE INFO REQUESTS ESPECÍFICOS
   */
  private detectInfoRequestOutcome(context: ConversationContext): ConversationOutcome | null {
    const allMessages = context.messages.filter(m => m.isFromUser)
      .map(m => m.content.toLowerCase()).join(' ');
    
    // Price inquiry
    if (allMessages.match(/\b(preço|valor|quanto custa|tabela|orçamento)\b/)) {
      return 'price_inquiry';
    }
    
    // Location inquiry  
    if (allMessages.match(/\b(endereço|onde fica|localização|como chegar)\b/)) {
      return 'location_inquiry';
    }
    
    // Business hours inquiry
    if (allMessages.match(/\b(horário|funciona|abre|fecha|funcionamento)\b/)) {
      return 'business_hours_inquiry';
    }

    return null;
  }

  /**
   * DETECTAR OUTROS PADRÕES (spam, wrong number, etc.)
   */
  private detectOtherPatterns(context: ConversationContext): ConversationOutcome | null {
    const firstUserMessage = context.messages.find(m => m.isFromUser)?.content.toLowerCase() || '';
    
    // Spam detection
    if (firstUserMessage.length < 3 || firstUserMessage.match(/^[0-9]+$/)) {
      return 'spam_detected';
    }
    
    // Wrong number
    if (firstUserMessage.includes('número errado') || firstUserMessage.includes('engano')) {
      return 'wrong_number';
    }
    
    // Test message
    if (firstUserMessage.match(/^(teste|test|oi|olá)$/)) {
      return 'test_message';
    }

    return null;
  }

  /**
   * VERIFICAR SE CONVERSA ESTÁ FINALIZADA
   * (para ser chamado periodicamente)
   */
  async checkForFinishedConversations(): Promise<void> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Buscar sessões sem outcome nas últimas 10 minutos (última mensagem pode ser do usuário OU da IA)
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('session_id_uuid, created_at')
        .is('conversation_outcome', null)
        .lt('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        logger.warn('⚠️ No sessions fetched for outcome scan', { error });
        return;
      }

      // Deduplicar por sessão (ignorar nulos)
      const uniqueSessions = [...new Set(
        data
          .map((row: any) => row.session_id_uuid)
          .filter((s: string | null) => !!s)
      )];

      logger.info(`🔍 Checking ${uniqueSessions.length} sessions for timeout outcomes`);

      for (const sessionId of uniqueSessions) {
        const analysis = await this.analyzeConversationOutcome(sessionId as string, 'timeout');
        if (analysis) {
          await this.persistOutcomeToFinalMessage(analysis);
        }
      }

    } catch (error) {
      logger.error('❌ Failed to check finished conversations', { error });
    }
  }
}