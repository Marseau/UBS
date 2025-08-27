/**
 * Webhook Flow Orchestrator Service
 * Orquestra integração do Flow Lock System com webhook existente
 * Baseado na OS: Sincronizar Intenções e Evitar Mistura
 */

import { DeterministicIntentDetectorService, detectIntents, INTENT_KEYS, detectIntentByRegex } from './deterministic-intent-detector.service';
import { FlowLockManagerService } from './flow-lock-manager.service';
import { ConversationOutcomeAnalyzerService } from './conversation-outcome-analyzer.service';

const SYSTEM_STANDARD_RESPONSES: string[] = [
  'Só para confirmar: você quer *serviços*, *preços* ou *horários*?',
  'Infelizmente neste momento não possuo esta informação no sistema.'
];
import { mergeEnhancedConversationContext } from '../utils/conversation-context-helper';
import { EnhancedConversationContext, FlowType, FlowStep } from '../types/flow-lock.types';
import OpenAI from 'openai';
import { MODELS, getModelForContext } from '../utils/ai-models';

export interface WebhookOrchestrationResult {
  aiResponse: string;
  shouldSendWhatsApp: boolean;
  conversationOutcome: string | null; // null se conversa em andamento
  updatedContext: EnhancedConversationContext;
  telemetryData: {
    intent: string | null;
    confidence: number;
    decision_method: string;
    flow_lock_active: boolean;
    processing_time_ms: number;
    model_used?: string; // 🚀 Modelo usado nas métricas LLM
  };
  llmMetrics?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    api_cost_usd: number | null;
    processing_cost_usd: number | null;
    confidence_score: number | null;
    latency_ms: number | null;
  };
}

// Resolve opções simples de desambiguação (pt-BR)
function resolveDisambiguationChoice(text: string): string | null {
  const t = (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(servicos?|lista|catalogo)/i.test(t)) return 'services';
  if (/(precos?|preco|valores?|quanto|orcamento)/i.test(t)) return 'pricing';
  if (/(horarios?|agenda|disponivel|amanha|hoje|quando)/i.test(t)) return 'availability';
  return null;
}

export class WebhookFlowOrchestratorService {
  private intentDetector: DeterministicIntentDetectorService;
  private flowManager: FlowLockManagerService;
  private outcomeAnalyzer: ConversationOutcomeAnalyzerService;
  private openai: OpenAI;

  constructor() {
    this.intentDetector = new DeterministicIntentDetectorService();
    this.flowManager = new FlowLockManagerService();
    this.outcomeAnalyzer = new ConversationOutcomeAnalyzerService();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }

  /**
   * Processamento principal do webhook com Flow Lock
   */
  async orchestrateWebhookFlow(
    messageText: string,
    userId: string,
    tenantId: string,
    tenantConfig: any,
    existingContext?: any
  ): Promise<WebhookOrchestrationResult> {
    const startTime = Date.now();

    try {
      // 1. Resolver contexto enhanced (com flow_lock)
      const context = await this.resolveEnhancedContext(
        userId, 
        tenantId, 
        tenantConfig,
        existingContext
      );

      // 2. Verificar timeout de fluxo ativo
      const timeoutStatus = this.flowManager.checkTimeoutStatus(context);
      if (timeoutStatus.status === 'expired') {
        return await this.handleExpiredFlow(context, timeoutStatus.message || '');
      }
      if (timeoutStatus.status === 'warning') {
        return this.handleFlowWarning(context, timeoutStatus.message || '');
      }

      // 2.5. Se estamos aguardando escolha de intenção (desambiguação), resolva primeiro
      if (context && (context as any).awaiting_intent === true) {
        const choice = resolveDisambiguationChoice(messageText);
        if (choice) {
          // limpamos a flag no contexto e seguimos com a intent resolvida
          const updatedCtx = await mergeEnhancedConversationContext(
            userId,
            tenantId,
            context,
            { intent: choice, decision_method: 'llm', confidence: 1.0 }
          );
          return await this.orchestrateWebhookFlow(messageText, userId, tenantId, tenantConfig, updatedCtx);
        } else {
          // ainda ambíguo → pergunta novamente, sem efeitos colaterais
          return {
            aiResponse: 'Só para confirmar: você quer *serviços*, *preços* ou *horários*?',
            shouldSendWhatsApp: true,
            conversationOutcome: null,
            updatedContext: context,
            telemetryData: {
              intent: null,
              confidence: 0,
              decision_method: 'disambiguation_pending',
              flow_lock_active: !!context.flow_lock?.active_flow,
              processing_time_ms: 0,
              model_used: 'disambiguation' // 🚀 Modelo de desambiguação para telemetry
            }
          };
        }
      }

      // 3. Detecção de intenção - Camadas Regex → LLM
      const first = detectIntentByRegex(messageText);
      let finalIntent = first.intent;
      let finalConfidence = first.confidence;
      let decision_method: 'regex' | 'llm' = first.decision_method;

      if (!finalIntent) {
        try {
          const llm = await this.classifyIntentWithLLMFallback(messageText);
          // Se LLM retornar 'null' (unknown), mantemos null (NÃO forçar 'general')
          finalIntent = (llm?.intent as any) ?? null;
          finalConfidence = (typeof llm?.confidence === 'number') ? llm.confidence : 0.0;
          decision_method = 'llm';
        } catch {
          finalIntent = null;
          finalConfidence = 0.0;
          decision_method = 'llm';
        }
      }

      // se ainda null → desambiguação (camada 3)
      if (!finalIntent) {
        const updatedCtx = await mergeEnhancedConversationContext(
          userId,
          tenantId,
          context,
          { intent: 'unknown', confidence: 0, decision_method: 'llm' }
        );

        return {
          aiResponse: 'Só para confirmar: você quer *serviços*, *preços* ou *horários*?',
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: updatedCtx,
          telemetryData: {
            intent: null,
            confidence: 0,
            decision_method: 'disambiguation',
            flow_lock_active: !!updatedCtx.flow_lock?.active_flow,
            processing_time_ms: Date.now() - startTime,
            model_used: 'disambiguation' // 🚀 Modelo de desambiguação para telemetry
          }
        };
      }
      
      // ✅ ADAPTER: Converter para formato esperado pelo resto do código
      const intentResult = {
        intent: finalIntent,
        confidence: finalConfidence,
        decision_method: decision_method,
        allowed_by_flow_lock: true
      } as const;

      // 🚨 CORREÇÃO: SEMPRE usar OpenAI para gerar respostas reais e capturar métricas LLM
      // Removido curto-circuito determinístico que impedia uso do OpenAI

      // 4. Verificar se intenção é permitida pelo flow lock
      if (!intentResult.allowed_by_flow_lock) {
        return this.handleBlockedIntent(context, intentResult);
      }

      // 5. Determinar novo fluxo baseado na intenção
      const targetFlow = this.mapIntentToFlow(intentResult.intent);
      const flowDecision = this.flowManager.canStartNewFlow(context, targetFlow);

      // 6. 🚨 CORREÇÃO CRÍTICA: Sempre usar OpenAI para gerar resposta real
      // Flow Lock apenas gerencia estado, OpenAI gera TODAS as respostas
      console.log('🔍 ORQUESTRADOR DEBUG - Antes de chamar generateAIResponseWithFlowContext:', {
        intent: intentResult.intent,
        flowLock: context.flow_lock?.active_flow,
        messageText: messageText.substring(0, 50)
      });
      
      const result = await this.generateAIResponseWithFlowContext(
        messageText,
        intentResult,
        flowDecision,
        context,
        tenantConfig
      );
      
      console.log('🔍 ORQUESTRADOR DEBUG - Resultado generateAIResponseWithFlowContext:', {
        hasLLMMetrics: !!result.llmMetrics,
        outcome: result.outcome,
        responseLength: result.response.length
      });

      // 7. Atualizar contexto com novo estado
      const updatedContext = await this.updateContextWithFlowState(
        userId,
        tenantId,
        context,
        result.newFlowLock,
        intentResult
      );

      // 🚨 CORREÇÃO: Só persistir outcome se conversa finalizada
      const finalOutcome = this.shouldPersistOutcome(intentResult.intent, result.response, updatedContext);
      console.log('🔧 OUTCOME PERSISTENCE CHECK:', {
        intent: intentResult.intent,
        shouldPersist: finalOutcome !== null,
        outcome: finalOutcome
      });

      return {
        aiResponse: result.response,
        shouldSendWhatsApp: true,
        conversationOutcome: finalOutcome, // null se conversa em andamento
        llmMetrics: result.llmMetrics, // 🚨 CORREÇÃO: Incluir métricas LLM no retorno
        updatedContext,
        telemetryData: {
          intent: finalIntent,              // pode ser null — e assim deve ficar
          confidence: finalConfidence,
          decision_method,
          flow_lock_active: !!updatedContext.flow_lock?.active_flow,
          processing_time_ms: Date.now() - startTime,
          model_used: result.llmMetrics?.model_used || 'unknown' // 🚀 Incluir modelo usado no telemetry
        }
      };

    } catch (error) {
      console.error('Webhook orchestration error:', error);
      
      // Fallback para sistema legado
      return {
        aiResponse: 'Desculpe, ocorreu um erro. Tente novamente.',
        shouldSendWhatsApp: true,
        conversationOutcome: 'error',
        updatedContext: await this.resolveEnhancedContext(userId, tenantId, tenantConfig, existingContext),
        telemetryData: {
          intent: 'error',
          confidence: 0,
          decision_method: 'error',
          flow_lock_active: false,
          processing_time_ms: Date.now() - startTime,
          model_used: 'error' // 🚀 Modelo de erro para telemetry
        },
        llmMetrics: {
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
          api_cost_usd: null,
          processing_cost_usd: null,
          confidence_score: null,
          latency_ms: null
        }
      };
    }
  }

  /**
   * Resolve contexto enhanced (backward compatible)
   */
  private async resolveEnhancedContext(
    userId: string,
    tenantId: string,
    tenantConfig: any,
    existingContext?: any
  ): Promise<EnhancedConversationContext> {
    
    const baseUpdates = {
      tenant_id: tenantId,
      domain: tenantConfig.domain || 'general',
      source: 'whatsapp' as const,
      mode: 'prod' as const
    };

    // Se já temos contexto legado, converter para enhanced
    if (existingContext) {
      return await mergeEnhancedConversationContext(
        userId,
        tenantId,
        { ...existingContext, ...baseUpdates }
      );
    }

    // Criar novo contexto enhanced
    return await mergeEnhancedConversationContext(
      userId,
      tenantId,
      baseUpdates
    );
  }

  /**
   * Mapeia intent para flow type
   */
  private mapIntentToFlow(intent: string | null): FlowType {
    if (!intent) return null;
    const flowMap: Record<string, FlowType> = {
      'onboarding': 'onboarding',
      'booking': 'booking',
      'booking_confirm': 'booking',
      'slot_selection': 'booking',
      'reschedule': 'reschedule',
      'reschedule_confirm': 'reschedule', 
      'cancel': 'cancel',
      'cancel_confirm': 'cancel',
      'pricing': 'pricing',
      'services': 'pricing',
      'flow_cancel': null,
      'greeting': null
    };

    // Intents institucionais não criam fluxo
    if (intent.startsWith('institutional_')) return null;

    return flowMap[intent] || null;
  }

  /**
   * Executa ação do fluxo baseada na decisão
   */
  private async executeFlowAction(
    messageText: string,
    intentResult: any,
    flowDecision: any,
    context: EnhancedConversationContext,
    tenantConfig: any
  ): Promise<{ response: string; outcome: string; newFlowLock?: any }> {

    const intent = intentResult.intent;
    const currentFlow = context.flow_lock?.active_flow;
    const currentStep = context.flow_lock?.step;

    // === COMANDO DIRETOS (prioridade máxima) ===
    
    if (intent === 'flow_cancel') {
      const abandonedLock = this.flowManager.abandonFlow(context, 'user_requested');
      return {
        response: 'Cancelado. Como posso ajudar?',
        outcome: 'flow_cancelled',
        newFlowLock: abandonedLock
      };
    }

    if (intent === 'booking_confirm' && currentFlow === 'booking') {
      const completedLock = this.flowManager.completeFlow(context, 'appointment_booked');
      return {
        response: '✅ Agendamento confirmado! Você receberá um lembrete por email.',
        outcome: 'appointment_booked',
        newFlowLock: completedLock
      };
    }

    if (intent === 'slot_selection' && currentFlow === 'booking') {
      const nextLock = this.flowManager.advanceStep(context, 'confirm', { selectedSlot: messageText });
      return {
        response: `Confirma agendamento no horário ${messageText}? Digite "confirmo" para finalizar.`,
        outcome: 'booking_slot_selected',
        newFlowLock: nextLock
      };
    }

    // === FLUXOS OPERACIONAIS ===

    if (intent === 'booking') {
      if (!flowDecision.allow_intent) {
        return {
          response: flowDecision.suggested_response,
          outcome: 'booking_blocked_by_flow',
          newFlowLock: context.flow_lock
        };
      }

      const bookingLock = this.flowManager.startFlowLock('booking', 'collect_service');
      return {
        response: 'Perfeito! Para qual serviço você gostaria de agendar?',
        outcome: 'booking_started',
        newFlowLock: bookingLock
      };
    }

    if (intent === 'reschedule') {
      const rescheduleLock = this.flowManager.startFlowLock('reschedule', 'collect_id');
      return {
        response: 'Vamos reagendar! Qual o ID do seu agendamento atual?',
        outcome: 'reschedule_started',
        newFlowLock: rescheduleLock
      };
    }

    if (intent === 'cancel') {
      const cancelLock = this.flowManager.startFlowLock('cancel', 'collect_id');
      return {
        response: 'Para cancelar, preciso do ID do agendamento. Qual é?',
        outcome: 'cancel_started',
        newFlowLock: cancelLock
      };
    }

    if (intent === 'pricing') {
      const pricingLock = this.flowManager.startFlowLock('pricing', 'start');
      const response = this.generatePricingResponse(tenantConfig);
      return {
        response: response + ' Gostaria de agendar algum serviço?',
        outcome: this.determineConversationOutcome('pricing', response), // ✅ CORREÇÃO: usar mapping correto
        newFlowLock: pricingLock
      };
    }

    if (intent === 'onboarding') {
      if (!flowDecision.allow_intent) {
        return {
          response: flowDecision.suggested_response,
          outcome: 'onboarding_blocked_by_flow',
          newFlowLock: context.flow_lock
        };
      }

      const onboardingLock = this.flowManager.startFlowLock('onboarding', 'collect_email');
      return {
        response: 'Olá! Para melhor atendê-lo, qual seu email?',
        outcome: 'onboarding_started', 
        newFlowLock: onboardingLock
      };
    }

    // === INTENTS INSTITUCIONAIS (não alteram fluxo) ===

    if (intent.startsWith('institutional_')) {
      const response = this.generateInstitutionalResponse(intent, tenantConfig);
      return {
        response,
        outcome: 'institutional_info_provided',
        newFlowLock: context.flow_lock // Manter fluxo atual
      };
    }

    // === FALLBACKS ===

    if (intent === 'greeting') {
      return {
        response: 'Olá! Como posso ajudá-lo?',
        outcome: null as any, // 🚨 CORREÇÃO: greeting não finaliza conversa
        newFlowLock: null
      };
    }

    // General fallback - conversa ainda em andamento
    return {
      response: '🚨 FALLBACK: executeFlowAction - Não entendi. Pode reformular?',
      outcome: null as any, // 🚨 CORREÇÃO: fallback não finaliza conversa
      newFlowLock: context.flow_lock
    };
  }

  /**
   * Atualiza contexto com novo estado do flow
   */
  private async updateContextWithFlowState(
    userId: string,
    tenantId: string,
    currentContext: EnhancedConversationContext,
    newFlowLock: any,
    intentResult: any
  ): Promise<EnhancedConversationContext> {
    
    return await mergeEnhancedConversationContext(
      userId,
      tenantId,
      {
        ...currentContext,
        flow_lock: newFlowLock || currentContext.flow_lock
      },
      {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        decision_method: intentResult.decision_method
      }
    );
  }

  /**
   * Handlers especiais
   */
  
  private async handleExpiredFlow(context: EnhancedConversationContext, message: string): Promise<WebhookOrchestrationResult> {
    const cleanedContext = await mergeEnhancedConversationContext(
      'temp-user',
      context.tenant_id,
      { ...context, flow_lock: null }
    );
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_expired',
      updatedContext: cleanedContext,
      telemetryData: {
        intent: 'timeout_expired',
        confidence: 1.0,
        decision_method: 'timeout',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: 'timeout' // 🚀 Modelo de timeout para telemetry
      }
    };
  }

  private handleFlowWarning(context: EnhancedConversationContext, message: string): WebhookOrchestrationResult {
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_warning',
      updatedContext: context,
      telemetryData: {
        intent: 'timeout_warning',
        confidence: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: 'timeout_warning' // 🚀 Modelo de warning para telemetry
      }
    };
  }

  private handleBlockedIntent(context: EnhancedConversationContext, intentResult: any): WebhookOrchestrationResult {
    const currentFlow = context.flow_lock?.active_flow;
    const message = `Vamos terminar ${currentFlow} primeiro. Como posso continuar ajudando?`;
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'intent_blocked_by_flow_lock',
      updatedContext: context,
      telemetryData: {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        decision_method: intentResult.decision_method,
        flow_lock_active: true,
        processing_time_ms: 0,
        model_used: 'blocked' // 🚀 Modelo de intent bloqueado para telemetry
      }
    };
  }

  /**
   * Geradores de resposta
   */
  
  private generatePricingResponse(tenantConfig: any): string {
    const services = tenantConfig?.services || [];
    if (services.length === 0) {
      return 'Entre em contato para informações sobre preços.';
    }

    let response = '💰 Nossos preços:\n\n';
    services.slice(0, 5).forEach((service: any) => {
      response += `• ${service.name}: R$ ${service.price}\n`;
    });
    
    return response;
  }

  private generateInstitutionalResponse(intent: string, tenantConfig: any): string {
    const policies = tenantConfig?.policies || {};
    
    const responses: Record<string, string> = {
      'institutional_address': policies.address || 'Consulte nosso site para endereço.',
      'institutional_hours': policies.hours || 'Segunda a sexta, 8h às 18h.',
      'institutional_policy': policies.cancellation || 'Cancelamentos com 24h de antecedência.',
      'institutional_payment': 'Aceitamos dinheiro, cartão e PIX.',
      'institutional_contact': tenantConfig?.phone || 'Entre em contato pelo WhatsApp.'
    };

    return responses[intent] || 'Informação não disponível no momento.';
  }

  /**
   * 🚨 MÉTODO CRÍTICO: Gera resposta via OpenAI com contexto do Flow Lock
   * Flow Lock apenas gerencia estado, OpenAI gera TODAS as respostas
   */
  private async generateAIResponseWithFlowContext(
    messageText: string,
    intentResult: any,
    flowDecision: any,
    context: EnhancedConversationContext,
    tenantConfig: any
  ): Promise<{ response: string; outcome: string; newFlowLock?: any; llmMetrics?: any }> {
    
    const intent = intentResult.intent;
    const currentFlow: string | null = context.flow_lock?.active_flow || null;
    const currentStep: string | null = context.flow_lock?.step || null;

    // === COMANDOS DIRETOS COM FLOW LOCK (sem OpenAI) ===
    
    if (intent === 'flow_cancel') {
      const abandonedLock = this.flowManager.abandonFlow(context, 'user_requested');
      return {
        response: 'Cancelado. Como posso ajudar?',
        outcome: 'flow_cancelled',
        newFlowLock: abandonedLock
      };
    }

    if (intent === 'booking_confirm' && currentFlow === 'booking') {
      const completedLock = this.flowManager.completeFlow(context, 'appointment_booked');
      return {
        response: '✅ Agendamento confirmado! Você receberá um lembrete por email.',
        outcome: 'appointment_booked',
        newFlowLock: completedLock
      };
    }

    if (intent === 'slot_selection' && currentFlow === 'booking') {
      const nextLock = this.flowManager.advanceStep(context, 'confirm', { selectedSlot: messageText });
      return {
        response: `Confirma agendamento no horário ${messageText}? Digite "confirmo" para finalizar.`,
        outcome: 'booking_slot_selected',
        newFlowLock: nextLock
      };
    }

    // === USAR OPENAI PARA TODAS AS OUTRAS RESPOSTAS ===
    console.log('🚨 MÉTODO CHAMADO: generateAIResponseWithFlowContext');
    console.log('🔍 DEBUG - Entrando no bloco OpenAI:', { intent, currentFlow, currentStep });
    const startTime = Date.now();
    
    try {
      // Construir contexto para OpenAI
      const businessInfo = this.buildBusinessContext(tenantConfig);
      const flowContext = this.buildFlowContext(currentFlow, currentStep, intent);
      
      const systemPrompt = `Você é a assistente oficial do ${tenantConfig.name || 'negócio'}. Seu papel é atender com clareza, honestidade e objetividade, sempre em tom natural.

⚠️ REGRAS DE HONESTIDADE ABSOLUTA - OBRIGATÓRIAS:
- NUNCA invente dados. NUNCA prometa retorno. NUNCA mencione atendente humano.
- Para informações inexistentes (endereço, horários, pagamento, políticas) use SEMPRE a frase exata: "Infelizmente neste momento não possuo esta informação no sistema."
- Use APENAS dados reais do sistema. Zero invenções. Zero promessas.
- PROIBIDO inventar: horários, endereços, formas de pagamento, telefones, políticas.

${businessInfo}

🎯 DADOS PERMITIDOS (somente se existirem):
- Serviços com preços reais
- Agendamentos confirmados  
- Profissionais cadastrados

🚫 DADOS PROIBIDOS (sempre usar frase padrão):
- Horários de funcionamento
- Endereço/localização  
- Formas de pagamento
- Contatos telefônicos
- Políticas não confirmadas

IMPORTANTE: Responda APENAS com a mensagem honesta para o cliente. Se não souber, use exatamente: "Infelizmente neste momento não possuo esta informação no sistema."`;

      const userPrompt = `Mensagem do cliente: "${messageText}"
Intenção detectada: ${intent}`;

      console.log('🤖 Chamando OpenAI com fallback escalonado...');
      
      // Função para calcular confidence do modelo
      const calculateConfidence = (completion: any): number => {
        try {
          if (!completion.choices[0]?.logprobs?.content) {
            const finishReason = completion.choices[0]?.finish_reason;
            switch (finishReason) {
              case 'stop': return 0.85;
              case 'length': return 0.60;
              case 'content_filter': return 0.30;
              default: return 0.50;
            }
          }

          const logprobs = completion.choices[0].logprobs.content;
          if (!logprobs || logprobs.length === 0) return 0.70;

          const avgLogprob = logprobs.reduce((sum: number, token: any) => {
            return sum + (token.logprob || -2.0);
          }, 0) / logprobs.length;

          const confidence = Math.max(0.1, Math.min(0.99, Math.exp(avgLogprob / -2.0)));
          return Math.round(confidence * 100) / 100;
        } catch (error) {
          return 0.70;
        }
      };
      
      // Sistema de fallback escalonado usando configuração centralizada
      // 🚀 CORREÇÃO: Ordem correta por custo (mais barato → mais caro)
      // gpt-4o-mini ($0.00075) → gpt-3.5-turbo ($0.0035) → gpt-4 ($0.09)
      const models = [MODELS.FAST, MODELS.BALANCED, MODELS.STRICT] as const;
      let completion: any = null;
      let modelUsed: string = MODELS.FAST; // Começar com o mais barato
      let finalConfidenceScore = 0;
      
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        
        try {
          console.log(`🎯 Tentando modelo: ${model}`);
          
          completion = await this.openai.chat.completions.create({
            model: model as any,
            temperature: 0.7,
            max_tokens: 300,
            logprobs: true,
            top_logprobs: 3,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          });
          
          const text = completion.choices?.[0]?.message?.content ?? '';
          
          // 📊 Calcular confidence score apenas para métricas (não para fallback)
          finalConfidenceScore = calculateConfidence(completion);
          console.log(`📊 Confidence ${model}: ${finalConfidenceScore}`);
          
          // 🔍 Validação objetiva da resposta (substitui threshold artificial)
          const { valid, validationScore } = this.validateAIResponse(text, messageText, intentResult);
          
          if (valid || i === models.length - 1) {
            modelUsed = model as string;
            console.log(`✅ Modelo escolhido: ${model} (validation: ${valid ? 'PASS' : 'FAIL-LAST'}, confidence: ${finalConfidenceScore})`);
            
            // 🚀 CRÍTICO: Capturar métricas apenas do modelo vencedor
            const usage = completion.usage || {};
            const apiCost = this.calculateOpenAICost(usage, model);
            
            console.log(`💰 Métricas do modelo vencedor: tokens=${usage.total_tokens}, cost=${apiCost}, model=${model}`);
            break;
          }
          
          console.log(`⚠️ Resposta não passou na validação, tentando próximo modelo...`);
          
        } catch (error: any) {
          console.error(`❌ Erro no modelo ${model}:`, {
            message: error?.message || 'Erro desconhecido',
            status: error?.status || error?.response?.status,
            statusText: error?.response?.statusText,
            code: error?.code,
            type: error?.type,
            param: error?.param,
            errorDetails: error?.error || error?.response?.data,
            stack: error?.stack?.substring(0, 500) // Truncar stack trace
          });
          
          // Detectar tipos específicos de erro da OpenAI API
          if (error?.status === 400) {
            console.log(`🚨 API Error 400 (Bad Request) - Possível problema com parâmetros do modelo ${model}`);
          } else if (error?.status === 401) {
            console.log(`🚨 API Error 401 (Unauthorized) - Problema de autenticação`);
          } else if (error?.status === 403) {
            console.log(`🚨 API Error 403 (Forbidden) - Modelo ${model} pode não estar disponível para sua conta`);
          } else if (error?.status === 429) {
            console.log(`🚨 API Error 429 (Rate Limit) - Rate limit atingido no modelo ${model}`);
          } else if (error?.status === 500 || error?.status === 502 || error?.status === 503) {
            console.log(`🚨 API Error ${error.status} - Erro interno da OpenAI no modelo ${model}`);
          } else if (error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
            console.log(`🚨 Network Error - Problema de conectividade com OpenAI (${error.code})`);
          } else {
            console.log(`🚨 Erro não identificado no modelo ${model} - Type: ${error?.type || 'unknown'}`);
          }
          
          if (i === models.length - 1) {
            throw error; // Re-throw no último modelo
          }
          console.log(`🔄 Tentando próximo modelo...`);
        }
      }

      // Verificar se temos uma completion válida
      if (!completion) {
        throw new Error('Nenhum modelo conseguiu gerar resposta');
      }

      const aiResponse = completion.choices[0]?.message?.content?.trim() || '🚨 FALLBACK: generateAIResponseWithFlowContext - Não entendi. Pode reformular?';
      const latencyMs = Date.now() - startTime;

      // Usar a função de confidence já definida
      const aiConfidenceScore = calculateConfidence(completion);
      console.log(`🔍 Final confidence score: ${aiConfidenceScore} com modelo: ${modelUsed}`);

      // ✅ CAPTURAR MÉTRICAS LLM COM VALIDAÇÃO
      const usage = completion.usage;
      const apiCost = this.calculateOpenAICost(usage, modelUsed);
      
      // ✅ VALIDAÇÃO: Verificar se usage está disponível
      if (!usage || !usage.total_tokens) {
        console.warn('⚠️ OpenAI usage data não disponível', { usage, completion });
      }
      
      // ✅ CALCULAR PROCESSING COST de forma mais realista
      const calculateProcessingCost = (apiCost: number | null): number => {
        if (!apiCost) return 0.00001; // Custo mínimo para operações sem API
        
        // ✅ LÓGICA REALISTA: 10% do custo da API + custo fixo de infraestrutura
        const percentageCost = apiCost * 0.10; // 10% do custo da API
        const infrastructureCost = 0.00002; // Custo fixo de infraestrutura (Supabase, Redis, etc.)
        const databaseCost = 0.00001; // Custo de 2 INSERTs na conversation_history
        
        return Math.round((percentageCost + infrastructureCost + databaseCost) * 100000) / 100000;
      };
      
      const llmMetrics = {
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        api_cost_usd: apiCost,
        processing_cost_usd: (() => {
          if (!apiCost) return 0.00001; // custo mínimo
          const percentageCost = apiCost * 0.10; // 10% do custo da API
          const infrastructureCost = 0.00002; // custo fixo de infraestrutura
          const databaseCost = 0.00001; // custo de inserts no conversation_history
          return Math.round((apiCost + percentageCost + infrastructureCost + databaseCost) * 100000) / 100000;
        })(),
        confidence_score: aiConfidenceScore,
        latency_ms: latencyMs,
        model_used: modelUsed // 🚀 Incluir modelo usado no fallback
      };

      console.log('✅ OpenAI respondeu:', {
        intent,
        model: modelUsed,
        tokens: usage?.total_tokens,
        confidence: aiConfidenceScore,
        latency: latencyMs,
        cost: llmMetrics.api_cost_usd
      });

      // Determinar novo estado do Flow Lock baseado na intenção
      const newFlowLock = this.determineNewFlowState(intent, currentFlow, context);
      
      // 🚨 CORREÇÃO CRÍTICA: Outcome será determinado pelo shouldPersistOutcome, não aqui
      // generateAIResponseWithFlowContext não deve determinar outcomes
      const outcome = null as any; // AI responses não finalizam conversas por si só

      return {
        response: aiResponse,
        outcome,
        newFlowLock,
        llmMetrics
      };

    } catch (error: any) {
      console.error('❌ Erro ao chamar OpenAI:', error);
      console.error('❌ Stack trace:', error?.stack);
      console.error('❌ Error details:', { message: error?.message, code: error?.code, status: error?.status });
      
      // Fallback para resposta determinística
      return await this.executeFlowAction(
        messageText,
        intentResult,
        flowDecision,
        context,
        tenantConfig
      );
    }
  }

  /**
   * Constrói contexto do negócio para OpenAI
   */
  private buildBusinessContext(tenantConfig: any): string {
    const services = tenantConfig?.services?.slice(0, 5) || [];
    const policies = tenantConfig?.policies || {};
    
    let context = `SOBRE O NEGÓCIO:
- Nome: ${tenantConfig.name || 'Não informado'}
- Tipo: ${tenantConfig.domain || 'Serviços gerais'}`;

    if (services.length > 0) {
      context += `\n- Serviços: ${services.map((s: any) => `${s.name} (R$ ${s.price})`).join(', ')}`;
    }

    if (policies.address) {
      context += `\n- Endereço: ${policies.address}`;
    }

    if (policies.hours) {
      context += `\n- Horário: ${policies.hours}`;
    }

    return context;
  }

  /**
   * Constrói contexto do fluxo atual para OpenAI
   */
  private buildFlowContext(currentFlow: string | null, currentStep: string | null, intent: string | null): string {
    if (!currentFlow) {
      return `O cliente está iniciando uma nova conversa. Intenção detectada: ${intent}`;
    }

    return `O cliente está no meio de um fluxo de ${currentFlow}, etapa: ${currentStep || 'inicial'}. Intenção detectada: ${intent}`;
  }

  /**
   * Calcula custo estimado da chamada OpenAI
   */
  private calculateOpenAICost(usage: any, model?: string): number | null {
    if (!usage || !usage.prompt_tokens || !usage.completion_tokens) {
      return null;
    }

    // 💰 CUSTOS CORRETOS POR MODELO (por 1K tokens)
    const modelCosts: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4o': { prompt: 0.005, completion: 0.015 }
    };

    // Detectar modelo atual ou usar fallback genérico
    const costs = modelCosts[model || 'gpt-4'] || modelCosts['gpt-4'];
    
    const promptCost = (usage.prompt_tokens / 1000) * costs!.prompt;
    const completionCost = (usage.completion_tokens / 1000) * costs!.completion;
    
    return Math.round((promptCost + completionCost) * 1000000) / 1000000; // 6 casas decimais para precisão
  }

  /**
   * Valida resposta do AI usando critérios simples e objetivos
   * 🚀 CORREÇÃO: Se tem resposta válida, aceita. Se não tem, escala.
   */
  private validateAIResponse(text: string, userMessage: string, intentResult: any): { valid: boolean; validationScore: number } {
    // ✅ VALIDAÇÃO SIMPLES: Resposta não-vazia = válida
    const hasValidResponse = !!(text && text.trim().length > 0);
    
    // ✅ CHECK BÁSICO: Não contém padrões óbvios de erro
    const errorPatterns = [
      /\[erro\]/i,
      /\[error\]/i,
      /undefined/i,
      /null$/i,
      /^error:/i,
      /^failed:/i
    ];
    
    const hasErrorPattern = errorPatterns.some(pattern => pattern.test(text));
    
    // ✅ LÓGICA SIMPLES: Tem resposta válida E não tem erro = aceita
    const valid = hasValidResponse && !hasErrorPattern;
    const validationScore = valid ? 1.0 : 0.0;

    return { valid, validationScore };
  }

  /**
   * Determina novo estado do Flow Lock baseado na intenção
   */
  private determineNewFlowState(intent: string | null, currentFlow: string | null, context: EnhancedConversationContext): any {
    const targetFlow = this.mapIntentToFlow(intent);
    
    if (!targetFlow) {
      return context.flow_lock; // Manter estado atual
    }

    // Iniciar novo fluxo se não há fluxo ativo
    if (!currentFlow) {
      return this.flowManager.startFlowLock(targetFlow, 'start');
    }

    // Continuar fluxo atual
    return context.flow_lock;
  }

  /**
   * Detecta se a conversa está finalizada e deve persistir outcome
   * Retorna null se conversa ainda está em andamento
   */
  private shouldPersistOutcome(intent: string | null, response: string, context: EnhancedConversationContext): string | null {
    // 🚨 CORREÇÃO CRÍTICA: Outcome deve ser NULL para conversas em andamento
    // Só persistir quando conversa REALMENTE finaliza
    
    // 1. INTENTS FINALIZADORES EXPLÍCITOS - apenas confirmações que criam/modificam appointments
    const trulyFinalizingIntents = [
      'booking_confirm', 'cancel_confirm', 'reschedule_confirm'
    ];
    
    if (intent && trulyFinalizingIntents.includes(intent)) {
      return this.determineConversationOutcome(intent, response);
    }
    
    // 2. TIMEOUT DE INATIVIDADE - só será processado pelo cronjob, não aqui
    // Removida lógica de timeout pois será handled pelo ConversationOutcomeProcessor
    
    // 3. TODAS AS OUTRAS INTERAÇÕES - conversa ainda em andamento
    // Includes: greeting, pricing, booking, address, business_hours, etc.
    // Essas são interações dentro da conversa, não o fim dela
    return null;
  }

  /**
   * Determina outcome da conversa baseado na intenção e resposta
   * APENAS para intents que realmente finalizam conversa
   */
  private determineConversationOutcome(intent: string | null, response: string): string {
    // Mapear APENAS intents finalizadores para outcomes válidos
    const finalizingOutcomeMap: Record<string, string> = {
      'booking_confirm': 'appointment_created',
      'cancel_confirm': 'appointment_cancelled', 
      'reschedule_confirm': 'appointment_modified'
    };

    // Se não é um intent finalizador, isso é um erro de lógica
    if (!intent || !finalizingOutcomeMap[intent]) {
      console.error(`🚨 ERRO: determineConversationOutcome chamado para intent não-finalizador: ${intent}`);
      return 'error';
    }

    return finalizingOutcomeMap[intent];
  }

  /**
   * DETECTAR OUTCOME QUANDO CONVERSA FINALIZA
   * APENAS análise - persistência é responsabilidade do cronjob
   */
  async checkAndPersistConversationOutcome(
    sessionId: string,
    trigger: 'timeout' | 'flow_completion' | 'appointment_action' | 'user_exit' = 'flow_completion'
  ): Promise<void> {
    try {
      // APENAS analisar - SEM persistir (responsabilidade do cronjob)
      const analysis = await this.outcomeAnalyzer.analyzeConversationOutcome(sessionId, trigger);
      
      if (analysis) {
        console.log(`🎯 Conversation outcome analyzed: ${analysis.outcome} (${analysis.confidence}) - will be persisted by cronjob`);
      }
    } catch (error) {
      console.error('❌ Failed to check conversation outcome:', error);
    }
  }

  /**
   * EXECUTAR ANÁLISE PERIÓDICA DE CONVERSAS FINALIZADAS
   * Deve ser chamado por cronjob para processar conversas abandonadas por timeout
   */
  async processFinishedConversations(): Promise<void> {
    try {
      await this.outcomeAnalyzer.checkForFinishedConversations();
    } catch (error) {
      console.error('❌ Failed to process finished conversations:', error);
    }
  }

  /**
   * 🚨 FUNÇÃO REMOVIDA: tryDeterministicResponse
   * Todas as respostas devem usar OpenAI para capturar métricas LLM corretas
   */

  /**
   * CLASSIFICAÇÃO DE INTENTS COM SISTEMA DE FALLBACK LLM
   * Usa o mesmo sistema de fallback: 3.5-turbo → 4o-mini → 4
   */
  private async classifyIntentWithLLMFallback(messageText: string): Promise<{ intent: string | null; confidence: number } | null> {
    console.log('🎯 Iniciando classificação de intent com fallback LLM...');

    // Intents permitidos (baseado no ai-complex.service.js original)
    const ALLOWED_INTENTS = [
      'greeting', 'booking', 'pricing',
      'address', 'business_hours', 'services',
      'flow_cancel', 'my_appointments'
    ];

    const systemPrompt = `Classifique a intenção do usuário usando APENAS as opções abaixo:

${ALLOWED_INTENTS.join(', ')}

Instruções:
- Responda APENAS com o nome da intenção
- Se não se encaixar em nenhuma categoria, não responda nada
- Seja preciso e conciso

Exemplos:
- "Olá" → greeting
- "Quero marcar" → booking  
- "Quanto custa?" → pricing
- "Onde vocês ficam?" → address
- "Que horas abrem?" → business_hours
- "Quais serviços?" → services
- "Cancelar" → flow_cancel
- "Meus agendamentos" → my_appointments

Opções válidas: ${ALLOWED_INTENTS.join(', ')}`;

    // Sistema de fallback usando configuração centralizada
    // 🚀 CORREÇÃO: Ordem correta por custo (mais barato → mais caro)
    // gpt-4o-mini ($0.00075) → gpt-3.5-turbo ($0.0035) → gpt-4 ($0.09)
    const models = [MODELS.FAST, MODELS.BALANCED, MODELS.STRICT] as const;
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      
      try {
        console.log(`🎯 Tentando classificar intent com modelo: ${model}`);
        
        const completion = await this.openai.chat.completions.create({
          model: model as any,
          temperature: 0,
          max_tokens: 8,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: messageText }
          ]
        });

        const raw = (completion.choices?.[0]?.message?.content || '').trim().toLowerCase();
        const intent = raw.replace(/[^a-z_]/g, ''); // sanitiza

        // 🔍 Validação objetiva: intent deve estar na lista permitida
        const isValidIntent = ALLOWED_INTENTS.includes(intent as any);
        
        if (isValidIntent || i === models.length - 1) {
          // Calcular confidence apenas para métricas (não para fallback)
          const confidence = intent === 'general' ? 0.5 : 0.8;
          
          console.log(`✅ Intent classificado: ${intent} (modelo: ${model}, valid: ${isValidIntent ? 'PASS' : 'FAIL-LAST'}, confidence: ${confidence})`);
          
          if (isValidIntent) {
            // 🚀 CRÍTICO: Log do modelo vencedor para classificação
            console.log(`💡 Intent classificado pelo modelo vencedor: ${model} (${intent}, confidence: ${confidence})`);
            return { intent, confidence };
          } else {
            // Último modelo e intent inválido
            console.log(`❌ Último modelo ${model} retornou intent inválido: ${intent}`);
            return null;
          }
        }
        
        console.log(`⚠️ Intent inválido: ${intent}, tentando próximo modelo...`)
        
      } catch (error: any) {
        console.error(`❌ Erro no modelo ${model} para classificação de intent:`, {
          message: error?.message || 'Erro desconhecido',
          status: error?.status || error?.response?.status,
          statusText: error?.response?.statusText,
          code: error?.code,
          type: error?.type,
          param: error?.param,
          errorDetails: error?.error || error?.response?.data
        });
        
        // Detectar tipos específicos de erro da OpenAI API para classificação
        if (error?.status === 403) {
          console.log(`🚨 CLASSIFICAÇÃO - Modelo ${model} pode não estar disponível (Error 403)`);
        } else if (error?.status === 429) {
          console.log(`🚨 CLASSIFICAÇÃO - Rate limit atingido no modelo ${model}`);
        } else if (error?.status === 400) {
          console.log(`🚨 CLASSIFICAÇÃO - Parâmetros inválidos para modelo ${model}`);
        }
        
        if (i === models.length - 1) {
          throw error; // Re-throw no último modelo
        }
        console.log(`🔄 Tentando próximo modelo para classificação...`);
      }
    }

    return null;
  }

}