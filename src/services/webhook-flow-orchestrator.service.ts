/**
 * Webhook Flow Orchestrator Service
 * Orquestra integração do Flow Lock System com webhook existente
 * Baseado na OS: Sincronizar Intenções e Evitar Mistura
 */

import { DeterministicIntentDetectorService, detectIntents, INTENT_KEYS } from './deterministic-intent-detector.service';
import { FlowLockManagerService } from './flow-lock-manager.service';
import { ConversationOutcomeAnalyzerService } from './conversation-outcome-analyzer.service';
import { mergeEnhancedConversationContext } from '../utils/conversation-context-helper';
import { EnhancedConversationContext, FlowType, FlowStep } from '../types/flow-lock.types';
import OpenAI from 'openai';

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

      // 3. Detecção determinística de intenção
      const primary = this.intentDetector.detectPrimaryIntent(messageText); // string | null

      // 📊 LOG: após regex (camada 1)
      console.log('[INTENT] regex primary:', primary);

      let finalIntent: string | null = primary;

      if (!finalIntent) {
        // 📊 LOG: antes de chamar LLM (camada 2)
        console.log('[INTENT] Calling LLM (regex=null)');
        finalIntent = await this.classifyIntentWithLLM(messageText);
      }

      // 📊 LOG: após LLM (camada 2)  
      console.log('[INTENT] final:', finalIntent);

      // se ainda null → desambiguação (camada 3)
      if (!finalIntent) {
        // responder pergunta curta e marcar awaiting_intent = true
        // ...
      }
      
      // ✅ ADAPTER: Converter para formato esperado pelo resto do código
      const intentResult = {
        intent: finalIntent,
        confidence: finalIntent ? 0.95 : 0.0,
        decision_method: finalIntent === primary ? 'deterministic_regex' : 'llm_classification',
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
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          decision_method: intentResult.decision_method,
          flow_lock_active: !!updatedContext.flow_lock?.active_flow,
          processing_time_ms: Date.now() - startTime
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
          processing_time_ms: Date.now() - startTime
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
      'greeting': null,
      'general': null
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
        processing_time_ms: 0
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
        processing_time_ms: 0
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
        processing_time_ms: 0
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

      console.log('🤖 Chamando OpenAI para gerar resposta...');
      
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        temperature: 0.7,
        max_tokens: 300,
        logprobs: true,
        top_logprobs: 3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });

      const aiResponse = completion.choices[0]?.message?.content?.trim() || '🚨 FALLBACK: generateAIResponseWithFlowContext - Não entendi. Pode reformular?';
      const latencyMs = Date.now() - startTime;

      // Calcular confidence score baseado na resposta da IA
      const calculateAIConfidenceScore = (completion: any): number => {
        try {
          // Se não há logprobs, usar confiança baseada na finish_reason
          console.log('🔍 DEBUG LOGPROBS:', completion.choices[0]?.logprobs);
          if (!completion.choices[0]?.logprobs?.content) {
            const finishReason = completion.choices[0]?.finish_reason;
            console.log('🔍 DEBUG NO LOGPROBS, using finish_reason:', finishReason);
            switch (finishReason) {
              case 'stop': return 0.85; // Resposta completa
              case 'length': return 0.60; // Truncada por limite
              case 'content_filter': return 0.30; // Filtrada
              default: return 0.50; // Razão desconhecida
            }
          }

          // Calcular confidence médio dos tokens usando logprobs
          const logprobs = completion.choices[0].logprobs.content;
          if (!logprobs || logprobs.length === 0) return 0.70;

          const avgLogprob = logprobs.reduce((sum: number, token: any) => {
            return sum + (token.logprob || -2.0);
          }, 0) / logprobs.length;

          // Converter logprob para confidence (0-1)
          // logprobs são valores negativos, quanto maior (menos negativo) melhor
          // -0.5 = alta confiança (~0.9), -3.0 = baixa confiança (~0.3)
          const confidence = Math.max(0.1, Math.min(0.99, Math.exp(avgLogprob / -2.0)));
          
          return Math.round(confidence * 100) / 100; // 2 decimais
        } catch (error) {
          console.warn('Erro calculando AI confidence:', error);
          return 0.70; // Fallback seguro
        }
      };

      const aiConfidenceScore = calculateAIConfidenceScore(completion);
      console.log('🔍 DEBUG AI CONFIDENCE CALCULATED:', aiConfidenceScore);

      // ✅ CAPTURAR MÉTRICAS LLM COM VALIDAÇÃO
      const usage = completion.usage;
      const apiCost = this.calculateOpenAICost(usage);
      
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
        latency_ms: latencyMs
      };

      console.log('✅ OpenAI respondeu:', {
        intent,
        tokens: usage?.total_tokens,
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
  private buildFlowContext(currentFlow: string | null, currentStep: string | null, intent: string): string {
    if (!currentFlow) {
      return `O cliente está iniciando uma nova conversa. Intenção detectada: ${intent}`;
    }

    return `O cliente está no meio de um fluxo de ${currentFlow}, etapa: ${currentStep || 'inicial'}. Intenção detectada: ${intent}`;
  }

  /**
   * Calcula custo estimado da chamada OpenAI
   */
  private calculateOpenAICost(usage: any): number | null {
    if (!usage || !usage.prompt_tokens || !usage.completion_tokens) {
      return null;
    }

    const promptCost = (usage.prompt_tokens / 1000) * (parseFloat(process.env.OPENAI_PROMPT_COST_PER_1K || '0.03'));
    const completionCost = (usage.completion_tokens / 1000) * (parseFloat(process.env.OPENAI_COMPLETION_COST_PER_1K || '0.06'));
    
    return Math.round((promptCost + completionCost) * 100000) / 100000; // 5 casas decimais
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
    // 🔧 MODO VALIDAÇÃO: Persistir todas as mensagens para análise de intents
    if (process.env.ENABLE_INTENT_VALIDATION === 'true') {
      return this.determineConversationOutcome(intent, response, true);
    }
    
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
   * APENAS para intents que realmente finalizam conversa (ou modo validação)
   */
  private determineConversationOutcome(intent: string | null, response: string, isValidationMode: boolean = false): string {
    // 🔧 MODO VALIDAÇÃO: Persistir todas as mensagens para análise
    if (isValidationMode) {
      // Em modo validação, usar o intent como outcome para análise
      return `validation_${intent || 'null'}`;
    }
    
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
   * DETECTAR E PERSISTIR OUTCOME QUANDO CONVERSA FINALIZA
   * Chama ConversationOutcomeAnalyzerService para análise contextual
   */
  async checkAndPersistConversationOutcome(
    sessionId: string,
    trigger: 'timeout' | 'flow_completion' | 'appointment_action' | 'user_exit' = 'flow_completion'
  ): Promise<void> {
    try {
      // Usar o novo serviço de análise contextual
      const analysis = await this.outcomeAnalyzer.analyzeConversationOutcome(sessionId, trigger);
      
      if (analysis) {
        // Persistir outcome APENAS na última mensagem AI
        const success = await this.outcomeAnalyzer.persistOutcomeToFinalMessage(analysis);
        
        if (success) {
          console.log(`🎯 Conversation outcome persisted: ${analysis.outcome} (${analysis.confidence})`);
        }
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
   * Classificação LLM determinística e fechada
   * Usa temperature=0 e top_p=0 para máxima consistência
   */
  private async classifyIntentWithLLM(text: string): Promise<string | null> {
    const SYSTEM_PROMPT = `Você é um classificador de intenção. Classifique a mensagem do usuário em EXATAMENTE UMA das chaves abaixo e nada além disso.

INTENTS PERMITIDAS:
- greeting
- services
- pricing
- availability
- my_appointments
- address
- payments
- business_hours
- cancel
- reschedule
- confirm
- modify_appointment
- policies
- wrong_number
- test_message
- booking_abandoned
- noshow_followup

Regras:
1) Responda SOMENTE com JSON no formato: {"intent":"<uma-das-chaves>"}.
2) Se NÃO for possível classificar com segurança, responda exatamente: {"intent":null}.
3) Não explique. Não inclua texto extra. Sem sinônimos fora da lista.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        temperature: 0,
        top_p: 0,
        max_tokens: 20,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Mensagem do usuário (pt-BR):\n---\n${text}\n---\nClassifique.` }
        ]
      });

      const raw = completion.choices?.[0]?.message?.content?.trim() || '';
      let parsed: { intent: string | null } | null = null;
      try { parsed = JSON.parse(raw); } catch { return null; }

      if (!parsed || typeof parsed.intent === 'undefined') return null;
      if (parsed.intent === null) return null;

      // Validar contra a allowlist FINAL
      return INTENT_KEYS.includes(parsed.intent as any) ? parsed.intent : null;

    } catch (error) {
      console.error('❌ LLM intent classification failed:', error);
      return null;
    }
  }
}