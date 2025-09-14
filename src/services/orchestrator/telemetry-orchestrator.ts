/**
 * Telemetry Orchestrator
 * Centraliza coleta e persistência de métricas e telemetria
 */

import { TelemetryService } from '../telemetry.service';
import { ConversationHistoryPersistence } from '../conversation-history-persistence.service';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { recordLLMMetrics } from '../telemetry/llm-telemetry.service';
import { TelemetryData } from './types/orchestrator.types';
import { EnhancedConversationContext } from '../../types/flow-lock.types';
import * as crypto from 'crypto';

export interface TelemetryContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  messageText: string;
  aiResponse: string;
  conversationContext: EnhancedConversationContext;
  messageSource?: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api'; // Origem da mensagem
}

export class TelemetryOrchestrator {
  private telemetryService: TelemetryService;
  private conversationPersistence: ConversationHistoryPersistence;
  private conversationRepository: ConversationRepository;

  constructor() {
    try {
      this.telemetryService = new TelemetryService();
      this.conversationRepository = new ConversationRepository();
      this.conversationPersistence = new ConversationHistoryPersistence(this.conversationRepository);
      console.log('✅ [TELEMETRY] TelemetryOrchestrator initialized successfully');
    } catch (error) {
      console.error('❌ [TELEMETRY] Failed to initialize TelemetryOrchestrator:', error);
      throw error;
    }
  }

  /**
   * Coletar e persistir telemetria completa da conversa
   */
  async recordTelemetry(
    context: TelemetryContext,
    telemetryData: TelemetryData,
    conversationOutcome: string | null
  ): Promise<void> {
    const {
      sessionId,
      userId,
      tenantId,
      messageText,
      aiResponse,
      conversationContext,
      messageSource
    } = context;

    console.log('🔍 [TELEMETRY] Recording telemetry:', {
      sessionId,
      userId,
      tenantId,
      messageLength: messageText?.length,
      responseLength: aiResponse?.length,
      outcome: conversationOutcome
    });

    // Validar dados críticos
    if (!userId) {
      console.error('❌ [TELEMETRY] Missing userId - skipping telemetry recording');
      return;
    }

    if (!tenantId) {
      console.error('❌ [TELEMETRY] Missing tenantId - skipping telemetry recording');
      return;
    }

    try {
      console.log('🔍 [TELEMETRY] Step 1: Saving user message...');
      // 1. Persistir mensagem do usuário
      await this.conversationPersistence.saveMessage({
        tenant_id: tenantId,
        user_id: userId,
        is_from_user: true,
        content: messageText,
        message_type: 'text',
        conversation_context: {
          session_id: sessionId,
          duration_minutes: conversationContext.duration_minutes
        },
        intent_detected: telemetryData.intent || null,
        confidence_score: telemetryData.confidence,
        tokens_used: telemetryData.tokens_used || 0,
        api_cost_usd: telemetryData.api_cost_usd || 0,
        processing_cost_usd: telemetryData.processing_cost_usd || 0,
        model_used: telemetryData.model_used || null,
        decision_method: telemetryData.decision_method === 'llm' ? 'llm' : 'regex',
        message_source: messageSource || 'whatsapp', // Usar messageSource do contexto ou default 'whatsapp'
        created_at: new Date()
      });

      // 2. Persistir resposta da IA
      await this.conversationPersistence.saveMessage({
        tenant_id: tenantId,
        user_id: userId,
        is_from_user: false,
        content: aiResponse,
        message_type: 'text',
        conversation_context: {
          session_id: sessionId,
          duration_minutes: conversationContext.duration_minutes
        },
        intent_detected: telemetryData.intent || null,
        confidence_score: telemetryData.confidence,
        tokens_used: telemetryData.tokens_used || 0,
        api_cost_usd: telemetryData.api_cost_usd || 0,
        processing_cost_usd: telemetryData.processing_cost_usd || 0,
        model_used: telemetryData.model_used || 'deterministic',
        decision_method: telemetryData.decision_method === 'llm' ? 'llm' : 'regex',
        message_source: messageSource || 'whatsapp', // Usar messageSource do contexto ou default 'whatsapp'
        created_at: new Date()
      });

      // 3. Registrar métricas de LLM se aplicável
      if (telemetryData.decision_method === 'llm' && telemetryData.model_used) {
        await recordLLMMetrics({
          messageId: `${sessionId}_${Date.now()}`, // Generate unique message ID
          tenantId: tenantId,
          sessionId: sessionId,
          modelUsed: telemetryData.model_used,
          tokensUsed: telemetryData.tokens_used || 0,
          apiCostUsd: telemetryData.api_cost_usd || 0,
          intent: telemetryData.intent || undefined
        });
      }

      // 4. Atualizar contexto da conversa
      await this.updateConversationContext(conversationContext, telemetryData);

      console.log(`✅ [TELEMETRY] Metrics recorded for session ${sessionId}`);

    } catch (error) {
      console.error('❌ [TELEMETRY] Failed to record telemetry:');
      console.error('❌ [TELEMETRY] Error details:', error);
      console.error('❌ [TELEMETRY] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ [TELEMETRY] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      // Não propagar erro para não quebrar o fluxo principal
    }
  }

  /**
   * Calcular custos de processamento baseado no modelo e tokens
   * Para regex/deterministic: só infra+db (sem API costs)
   * Para LLM: API cost + infra+db
   */
  calculateProcessingCosts(
    model: string | null,
    tokens: number | null,
    processingTimeMs: number
  ): { api_cost_usd: number; processing_cost_usd: number } {
    let apiCost = 0;

    // Se é LLM, calcular custos de API
    if (model && tokens) {
      const modelCosts: Record<string, { input: number; output: number }> = {
        'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
        'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
        'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 }
      };

      const modelCostConfig = modelCosts[model] ?? modelCosts['gpt-3.5-turbo']!;
      const inputCost = modelCostConfig!.input;
      const outputCost = modelCostConfig!.output;

      // Estimativa de tokens de entrada vs saída (70%/30%)
      const inputTokens = Math.round(tokens * 0.7);
      const outputTokens = Math.round(tokens * 0.3);

      apiCost = (inputTokens * inputCost) + (outputTokens * outputCost);
    }

    // Custos de infraestrutura SEMPRE existem (independente do método)
    const pct = apiCost * 0.10;          // 10% overhead (só se houver API cost)
    const infra = 0.00002;               // Infraestrutura (servidor, cache, etc.)
    const db = 0.00001;                  // Database operations
    const processingCost = apiCost + pct + infra + db;

    return {
      api_cost_usd: Math.round(apiCost * 1000000) / 1000000, // 6 casas decimais
      processing_cost_usd: Math.round(processingCost * 1000000) / 1000000
    };
  }

  /**
   * Criar dados de telemetria padronizados
   */
  createTelemetryData(
    intent: string | null,
    decisionMethod: TelemetryData['decision_method'],
    confidence: number,
    processingTimeMs: number,
    model?: string,
    tokens?: number
  ): TelemetryData {
    // SEMPRE calcular custos - mesmo para regex (infra + db)
    const costs = this.calculateProcessingCosts(
      model || null,
      tokens || null,
      processingTimeMs
    );

    return {
      intent,
      decision_method: decisionMethod,
      confidence,
      processing_time_ms: processingTimeMs,
      model_used: model,
      tokens_used: tokens,
      api_cost_usd: costs.api_cost_usd,
      processing_cost_usd: costs.processing_cost_usd
    };
  }

  /**
   * Atualizar contexto da conversa com novos dados
   */
  private async updateConversationContext(
    context: EnhancedConversationContext,
    telemetryData: TelemetryData
  ): Promise<void> {
    // Adicionar intent ao histórico
    context.intent_history.push({
      intent: telemetryData.intent,
      confidence: telemetryData.confidence,
      timestamp: new Date().toISOString(),
      decision_method: telemetryData.decision_method
    });

    // Limitar histórico a últimos 10 intents
    if (context.intent_history.length > 10) {
      context.intent_history = context.intent_history.slice(-10);
    }

    // Atualizar contadores
    context.message_count += 1;
    context.last_message_at = new Date().toISOString();
    context.duration_ms = new Date().getTime() - new Date(context.session_started_at).getTime();
    context.duration_minutes = Math.round(context.duration_ms / (1000 * 60));

    // Persistir contexto atualizado (implementar conforme necessário)
    // await this.persistConversationContext(context);
  }

  /**
   * Gerar ID de sessão único (formato UUID)
   */
  generateSessionId(_userId: string, _tenantId: string): string {
    // Usar crypto.randomUUID() para gerar UUID v4 válido
    return crypto.randomUUID();
  }

  /**
   * Verificar se deve finalizar sessão baseado em inatividade
   */
  shouldEndSession(lastMessageAt: string, maxInactivityMinutes: number = 30): boolean {
    const lastMessage = new Date(lastMessageAt).getTime();
    const now = new Date().getTime();
    const inactivityMs = now - lastMessage;
    const inactivityMinutes = inactivityMs / (1000 * 60);

    return inactivityMinutes > maxInactivityMinutes;
  }
}