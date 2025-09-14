/**
 * Intent Detection Orchestrator
 * Centraliza a lógica de detecção de intenções usando Regex + LLM escalonável
 */

import { DeterministicIntentDetectorService, INTENT_KEYS } from '../deterministic-intent-detector.service';
import { LLMIntentClassifierService } from '../llm-intent-classifier.service';
import { IntentDisambiguationService } from '../intent-disambiguation.service';
import { detectIntentFromMessage, sanitizeIntentForPersistence } from '../../utils/intent-validator.util';
import { FlowLockManagerService } from '../flow-lock-manager.service';
import { EnhancedConversationContext } from '../../types/flow-lock.types';

export interface IntentDetectionResult {
  intent: string | null;
  confidence: number;
  decision_method: 'command' | 'dictionary' | 'regex' | 'llm' | 'none';
  processing_time_ms: number;
  allowed_by_flow_lock: boolean;
  current_flow?: string;
}

export class IntentDetectionOrchestrator {
  private deterministicDetector: DeterministicIntentDetectorService;
  private llmClassifier: LLMIntentClassifierService;
  private disambiguationService: IntentDisambiguationService;
  private flowLockManager: FlowLockManagerService;

  constructor() {
    this.deterministicDetector = new DeterministicIntentDetectorService();
    this.llmClassifier = new LLMIntentClassifierService();
    this.disambiguationService = new IntentDisambiguationService();
    this.flowLockManager = new FlowLockManagerService();
  }

  /**
   * Detecção de intent usando estratégia escalonável Regex → LLM
   */
  async detectIntent(
    messageText: string,
    context: EnhancedConversationContext
  ): Promise<IntentDetectionResult> {
    const startTime = Date.now();

    try {
      // 1. Tentar detecção determinística primeiro (Regex + Commands)
      const deterministicIntents = this.deterministicDetector.detectIntents(messageText);

      if (deterministicIntents.length > 0) {
        const primaryIntent = deterministicIntents[0]; // First intent has highest priority
        const flowValidation = await this.validateWithFlowLock(
          primaryIntent as string,
          context
        );

        return {
          intent: sanitizeIntentForPersistence(primaryIntent) ?? null,
          confidence: 0.9, // High confidence for regex matches
          decision_method: 'regex',
          processing_time_ms: Date.now() - startTime,
          allowed_by_flow_lock: flowValidation.allowed,
          current_flow: flowValidation.current_flow ?? undefined
        };
      }

      // 2. Fallback para LLM se necessário
      const llmResult = await this.llmClassifier.classifyIntent(messageText);

      const flowValidation = await this.validateWithFlowLock(
        llmResult.intent,
        context
      );

      return {
        intent: sanitizeIntentForPersistence(llmResult.intent) ?? null,
        confidence: llmResult.confidence_score || 0.5,
        decision_method: 'llm',
        processing_time_ms: Date.now() - startTime,
        allowed_by_flow_lock: flowValidation.allowed,
        current_flow: flowValidation.current_flow ?? undefined
      };

    } catch (error) {
      console.error('❌ Intent detection failed:', error);

      return {
        intent: 'general_inquiry',
        confidence: 0.1,
        decision_method: 'none',
        processing_time_ms: Date.now() - startTime,
        allowed_by_flow_lock: true,
        current_flow: 'general'
      };
    }
  }

  /**
   * Valida intent com Flow Lock System
   */
  private async validateWithFlowLock(
    intent: string | null,
    context: EnhancedConversationContext
  ): Promise<{ allowed: boolean; current_flow: string | null }> {
    if (!intent || !context.flow_lock) {
      return { allowed: true, current_flow: null };
    }

    // Verificar se intent é permitido no fluxo atual
    // Simplificado - assumir permitido por enquanto
    const isAllowed = true;

    return {
      allowed: isAllowed,
      current_flow: context.flow_lock.active_flow
    };
  }

  /**
   * Resolver desambiguação simples de intents
   */
  resolveDisambiguation(messageText: string): string | null {
    const normalizedText = messageText
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (/(servicos?|lista|catalogo)/i.test(normalizedText)) return 'services';
    if (/(precos?|preco|valores?|quanto|orcamento)/i.test(normalizedText)) return 'pricing';
    if (/(horarios?|agenda|disponivel|amanha|hoje|quando)/i.test(normalizedText)) return 'availability';

    return null;
  }
}