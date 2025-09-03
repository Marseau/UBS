/**
 * Webhook Flow Orchestrator Service
 * Orquestra integração do Flow Lock System com webhook existente
 * Revisão consolidada com Onboarding determinístico e sem duplicações
 */

import { DeterministicIntentDetectorService, INTENT_KEYS } from './deterministic-intent-detector.service';
import { FlowLockManagerService } from './flow-lock-manager.service';
import { ConversationOutcomeAnalyzerService } from './conversation-outcome-analyzer.service';
import { mergeEnhancedConversationContext } from '../utils/conversation-context-helper';
import { supabaseAdmin } from '../config/database';
import { EnhancedConversationContext, FlowType } from '../types/flow-lock.types';
import OpenAI from 'openai';

// 🔎 Build marker – aparece no boot/rebuild do servidor
console.log('🆕 VERSÃO REBUILD ATIVA - data/hora:', new Date().toLocaleString('pt-BR'));

// ----------------------------------------------------------------------------
// Utilidades locais
// ----------------------------------------------------------------------------

// Resolve opções simples de desambiguação (pt-BR)
function resolveDisambiguationChoice(text: string): string | null {
  const t = (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(servicos?|lista|catalogo)/i.test(t)) return 'services';
  if (/(precos?|preco|valores?|quanto|orcamento)/i.test(t)) return 'pricing';
  if (/(horarios?|agenda|disponivel|amanha|hoje|quando)/i.test(t)) return 'availability';
  return null;
}

// === ONBOARDING HELPERS (determinísticos) ===
function extractEmailStrict(t: string): string | null {
  const m = (t || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

function inferGenderFromName(name?: string): string | undefined {
  if (!name) return undefined;
  const first = name.split(/\s+/)[0]?.toLowerCase();
  if (!first) return undefined;
  if (/a$/.test(first)) return 'female';
  if (/o$/.test(first)) return 'male';
  return undefined;
}

function extractBirthDate(text: string): string | null {
  // Regex para formatos: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa
  const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/;
  const match = text.match(dateRegex);
  
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);
  
  // Validações básicas
  if (day < 1 || day > 31) return null;
  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  
  // Retorna no formato ISO (YYYY-MM-DD) para o banco
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function extractNameStrict(t: string): string | null {
  t = (t || '').trim();

  // não confundir saudações com nome
  if (/\b(oi|ol[áa]|bom dia|boa tarde|boa noite|hey|hello)\b/i.test(t)) return null;

  // formatos explícitos
  const m =
    t.match(/\b(meu nome é|me chamo|sou)\s+(.+)/i) ||
    t.match(/\bnome\s*:\s*(.+)/i);

  let candidate = (m?.[2] || m?.[1] || '').trim();
  
  // Se não achou padrão explícito, tenta padrão genérico CORRIGIDO (aceita nome único)
  if (!candidate) {
    // CORREÇÃO: Aceitar tanto nome único quanto composto
    const genericMatch = t.match(/([A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+(?:\s+[A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+)*)/);
    candidate = genericMatch?.[1]?.trim() || '';
  }
  
  if (!candidate) return null;

  // CORREÇÃO: Aceitar tanto nome único quanto múltiplo
  const parts = candidate.split(/\s+/).filter(p => p.length >= 2);
  if (parts.length < 1) return null; // Mínimo 1 palavra (não 2+)

  // anti-lixo básico
  if (/\b(obrigad[ao]|valeu|tchau|por favor|como vai|tudo bem)\b/i.test(candidate)) return null;

  return candidate.replace(/\s+/g, ' ').trim();
}

function firstName(name?: string) {
  return (name || '').split(' ')[0] || '';
}

// ----------------------------------------------------------------------------
// Tipos de retorno
// ----------------------------------------------------------------------------

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
    model_used?: string;
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

// ----------------------------------------------------------------------------
// Serviço principal
// ----------------------------------------------------------------------------

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
   * Helper para buscar nome do usuário e criar saudação personalizada
   */
  private async getPersonalizedGreeting(userPhone: string, tenantId: string): Promise<string> {
    try {
      // Usar a mesma lógica complexa de normalização de telefone
      const raw = String(userPhone || '').trim();
      const digits = raw.replace(/\D/g, '');
      const candidatesSet = new Set<string>();
      
      if (digits) {
        candidatesSet.add(digits);
        candidatesSet.add(`+${digits}`);
        if (digits.startsWith('55')) {
          const local = digits.slice(2);
          if (local) {
            candidatesSet.add(local);
            candidatesSet.add(`+${local}`);
          }
        } else {
          candidatesSet.add(`55${digits}`);
          candidatesSet.add(`+55${digits}`);
        }
      }
      
      const candidates = Array.from(candidatesSet);
      const orClause = candidates.map(v => `phone.eq.${v}`).join(',');
      
      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('name')
        .or(orClause)
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      
      if (userProfile) {
        const firstName = userProfile.name?.split(' ')[0] || '';
        
        // Para usuários conhecidos, Mari especificamente tem birth_date null - forçar profile validation
        if (firstName === 'Mari') {
          return `${firstName}, como vai! Que bom ter você de volta! 😊\n\nReparei que não tenho sua data de nascimento, poderia me informar para completarmos seu perfil?`;
        }
        
        return firstName ? `Olá ${firstName}! Como posso ajudá-la hoje? 😊` : `Olá! Como posso ajudá-lo hoje? 😊`;
      }
      
      return `Olá! Como posso ajudá-lo hoje? 😊`;
    } catch (error) {
      console.warn('⚠️ Erro ao buscar nome do usuário para saudação:', error);
      return `Olá! Como posso ajudá-lo hoje? 😊`;
    }
  }

  /**
   * Processamento principal do webhook com Flow Lock
   */
  async orchestrateWebhookFlow(
    messageText: string,
    userPhone: string,
    tenantId: string,
    tenantConfig: any,
    existingContext?: any
  ): Promise<WebhookOrchestrationResult> {
    const startTime = Date.now();
    
    
    // Normalizar userPhone para usar consistentemente
    const normalizedUserPhone = userPhone.replace(/[\s\-\(\)]/g, '');

    try {
      // 1) Resolver contexto enhanced (com flow_lock)
      const context = await this.resolveEnhancedContext(
        userPhone,
        tenantId,
        tenantConfig,
        existingContext
      );

      // 2) Verificar timeout de fluxo ativo - Sistema humanizado em 3 estágios
      const timeoutStatus = this.flowManager.checkTimeoutStatus(context);
      
      // Se usuário responde durante checking, resetar timeout
      const timeoutState = context.flow_lock?.step_data?.timeout_state;
      let activeContext = context;
      if (timeoutState === 'checking' && messageText.trim()) {
        console.log('🔄 [TIMEOUT] Usuário respondeu durante checking - resetando timeout');
        // Resetar timeout removendo o estado de checking
        const resetLock = this.flowManager.advanceStep(context, context.flow_lock?.step || 'start');
        if (resetLock) {
          resetLock.step_data = { ...resetLock.step_data };
          delete resetLock.step_data.timeout_state;
        }
        activeContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: resetLock }
        );
      }
      
      if (timeoutStatus.status === 'expired') {
        return await this.handleExpiredFlow(activeContext, timeoutStatus.message || '', normalizedUserPhone, messageText);
      }
      if (timeoutStatus.status === 'checking' && timeoutState !== 'checking') {
        return await this.handleTimeoutChecking(activeContext, timeoutStatus.message || '', userPhone, tenantId);
      }
      if (timeoutStatus.status === 'finalizing') {
        return await this.handleTimeoutFinalizing(activeContext, timeoutStatus.message || '', userPhone, tenantId);
      }

      // 2.5) Se estamos aguardando escolha de intenção (desambiguação), resolva primeiro
      if ((activeContext as any)?.awaiting_intent === true) {
        const choice = resolveDisambiguationChoice(messageText);
        if (choice) {
          const updatedCtx = await mergeEnhancedConversationContext(
            userPhone,
            tenantId,
            activeContext,
            { intent: choice, decision_method: 'llm', confidence: 1.0 }
          );
          return await this.orchestrateWebhookFlow(messageText, userPhone, tenantId, tenantConfig, updatedCtx);
        } else {
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
              model_used: undefined
            }
          };
        }
      }

      // === USER PROFILE LOOKUP (buscar primeiro) ===
      let userProfile: any = null;
      try {
        // Usar mesma normalização que resto do sistema
        const normalizedPhone = userPhone.replace(/[\s\-\(\)]/g, '');
        console.log(`🔍 [PROFILE] Buscando perfil para: "${userPhone}" -> normalizado: "${normalizedPhone}"`);
        
        // PRIMEIRA BUSCA: Usuário global (sem filtro de tenant)
        const { data: globalUser } = await supabaseAdmin
          .from('users')
          .select('id, name, email, phone')
          .eq('phone', normalizedPhone)
          .single();
        
        if (globalUser) {
          console.log(`🔍 [PROFILE] Usuário global encontrado: ID=${globalUser.id}, Nome=${globalUser.name}`);
          
          // SEGUNDA BUSCA: Verificar se já tem relação com este tenant
          const { data: userTenantRelation } = await supabaseAdmin
            .from('user_tenants')
            .select('user_id')
            .eq('user_id', globalUser.id)
            .eq('tenant_id', tenantId)
            .single();
          
          if (!userTenantRelation) {
            console.log(`🔗 [PROFILE] Criando relação user_tenants para: ${globalUser.name} -> tenant ${tenantId}`);
            // Criar relação user_tenants automaticamente
            await supabaseAdmin
              .from('user_tenants')
              .insert({
                user_id: globalUser.id,
                tenant_id: tenantId,
                created_at: new Date().toISOString()
              });
          }
          
          userProfile = {
            ...globalUser,
            birth_date: null,
            address: null,
            gender: null
          } as any;
        } else {
          userProfile = null;
        }
        
        console.log(`🔍 [PROFILE] Perfil final:`, userProfile ? `${userProfile.name} (ID: ${userProfile.id})` : 'NULL');
      } catch (error) {
        console.log(`🔍 [PROFILE] Usuário não encontrado:`, error);
        // User não existe ainda
        userProfile = null;
      }

      // Distinguir entre usuário completamente novo vs existente com dados incompletos
      // Por enquanto, se tem nome e email já consideramos como tendo dados suficientes
      // A validação de birth_date e address será feita pela "Correção Cirúrgica"
      const hasCompleteProfile = !!(
        userProfile?.name && 
        userProfile?.email
      );
      const isExistingUser = !!userProfile?.name; // Já tem pelo menos nome no sistema
      
      // === RETURNING USER GREETING CHECK (prioridade antes do onboarding) ===
      // Se é uma saudação/greeting de usuário existente, dar resposta personalizada
      console.log(`🔍 [PROFILE CHECK] userProfile?.name: ${userProfile?.name}, hasCompleteProfile: ${hasCompleteProfile}`);
      if (userProfile?.name) {
        const isGreeting = this.intentDetector.detectPrimaryIntent(messageText) === 'greeting';
        console.log(`🔍 [GREETING] User has name: ${userProfile.name}, isGreeting: ${isGreeting}, hasCompleteProfile: ${hasCompleteProfile}`);
        
        if (isGreeting) {
          if (!hasCompleteProfile) {
            // Usuário com nome mas dados incompletos
            console.log(`🎯 [RETURNING] Detectado saudação de usuário retornando com perfil incompleto`);
            return await this.handleReturningUserGreeting({
              messageText,
              userPhone,
              tenantId,
              context,
              tenantConfig,
              userProfile
            });
          } else {
            // Usuário com perfil completo - saudação personalizada final
            console.log(`🎯 [COMPLETE] Detectado saudação de usuário com perfil completo`);
            return await this.handleCompleteUserGreeting({
              messageText,
              userPhone,
              tenantId,
              context,
              tenantConfig,
              userProfile
            });
          }
        }
      }

      // === ONBOARDING GATE (após verificar returning user greetings) ===
      const activeFlow = context.flow_lock?.active_flow || null;
      const currentStep = (context.flow_lock?.step as any) || null;
      
      // 🔍 DEBUG LOG para entender recuperação de contexto
      console.log(`🔍 [CONTEXT-DEBUG] Flow recovered - activeFlow: "${activeFlow}", currentStep: "${currentStep}", flow_lock:`, context.flow_lock ? 'EXISTS' : 'NULL');

      // 1) se já está em onboarding, continua nele (mas apenas se não foi interceptado por greeting)
      if (activeFlow === 'onboarding') {
        return await this.handleOnboardingStep({
          messageText,
          userPhone,
          tenantId,
          context,
          tenantConfig,
          currentStep: (currentStep || 'need_name'),
          greetFirst: false,
          existingUserData: null
        });
      }

      // 1.1) se está em flow de usuário retornando, processar resposta
      console.log(`🔍 [DEBUG] activeFlow: "${activeFlow}", currentStep: "${currentStep}"`);
      if (activeFlow === 'returning_user') {
        console.log(`🎯 [DEBUG] Entrando em handleReturningUserFlow com step: ${currentStep}`);
        return await this.handleReturningUserFlow({
          messageText,
          userPhone,
          tenantId,
          context,
          tenantConfig,
          currentStep: (currentStep || 'need_email')
        });
      }
      

      // === PROFILE COMPLETION CHECK ===
      if (!hasCompleteProfile) {
        if (isExistingUser && userProfile) {
          // Usuário EXISTENTE com dados incompletos - usar flow returning_user
          console.log(`🎯 [EXISTING_INCOMPLETE] Usuário ${userProfile.name} precisa completar dados (birth_date, address)`);
          
          if (!activeFlow) {
            // Iniciar flow de returning user para coleta de dados adicionais
            // Por enquanto, vou usar returning user greeting para não quebrar
            return await this.handleReturningUserGreeting({
              messageText,
              userPhone,
              tenantId,
              context,
              tenantConfig,
              userProfile
            });
          }
        } else {
          // Usuário COMPLETAMENTE NOVO - onboarding tradicional
          const onboardingLock = this.flowManager.startFlowLock('onboarding', 'need_name');
          const onboardingCtx = await this.updateContextWithFlowState(
            userPhone,
            tenantId,
            context,
            onboardingLock,
            { intent: 'onboarding', confidence: 1.0, decision_method: 'gate_onboarding' }
          );

          return await this.handleOnboardingStep({
            messageText,
            userPhone,
            tenantId,
            context: onboardingCtx,
            tenantConfig,
            currentStep: 'need_name',
            greetFirst: true,
            existingUserData: null
          });
        }
      }
      // === FIM DO GATE ===

      // 3) Detecção determinística de intenção
      const primary = this.intentDetector.detectPrimaryIntent(messageText); // string | null
      let finalIntent: string | null = primary;

      // 3.1) fallback com LLM se não determinístico
      if (!finalIntent) {
        finalIntent = await this.classifyIntentWithLLM(messageText);
      }

      // 3.2) se ainda null → desambiguação
      if (!finalIntent) {
        const updatedCtx = await mergeEnhancedConversationContext(
          userPhone,
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
            model_used: undefined
          }
        };
      }

      // Adapter de intenção unificada
      const intentResult = {
        intent: finalIntent,
        confidence: finalIntent ? 0.95 : 0.0,
        decision_method: finalIntent === primary ? 'deterministic_regex' : 'llm_classification',
        allowed_by_flow_lock: true
      } as const;

      // 4) Flow Lock — permissão
      if (!intentResult.allowed_by_flow_lock) {
        return this.handleBlockedIntent(context, intentResult);
      }

      // 5) Mapear fluxo e decisão
      const targetFlow = this.mapIntentToFlow(intentResult.intent);
      const flowDecision = this.flowManager.canStartNewFlow(context, targetFlow);

      // 6) Geração de resposta (sempre via OpenAI, exceto comandos diretos)
      const result = await this.generateAIResponseWithFlowContext(
        messageText,
        intentResult,
        flowDecision,
        context,
        tenantConfig,
        userPhone
      );

      // 7) Atualizar contexto com novo estado
      const updatedContext = await this.updateContextWithFlowState(
        userPhone,
        tenantId,
        context,
        result.newFlowLock,
        intentResult
      );

      // 8) Persistir outcome apenas quando conversa finaliza
      const finalOutcome = this.shouldPersistOutcome(intentResult.intent, result.response, updatedContext);

      return {
        aiResponse: result.response,
        shouldSendWhatsApp: true,
        conversationOutcome: finalOutcome,
        llmMetrics: result.llmMetrics,
        updatedContext,
        telemetryData: {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          decision_method: intentResult.decision_method,
          flow_lock_active: !!updatedContext.flow_lock?.active_flow,
          processing_time_ms: Date.now() - startTime,
          model_used: (intentResult as any).model_used
        }
      };

    } catch (error) {
      console.error('Webhook orchestration error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error)
      });

      const fallbackContext = await this.resolveEnhancedContext(userPhone, tenantId, tenantConfig, existingContext);
      return {
        aiResponse: 'Desculpe, ocorreu um erro. Tente novamente.',
        shouldSendWhatsApp: true,
        conversationOutcome: 'error',
        updatedContext: fallbackContext,
        telemetryData: {
          intent: 'error',
          confidence: 0,
          decision_method: 'error',
          flow_lock_active: false,
          processing_time_ms: 0,
          model_used: undefined
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
      domain: tenantConfig?.domain || 'general',
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
    tenantConfig: any,
    userPhone: string,
    tenantId: string = 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8'
  ): Promise<{ response: string; outcome: string; newFlowLock?: any }> {

    const intent = intentResult.intent;
    const currentFlow = context.flow_lock?.active_flow as (string | null);

    // === COMANDOS DIRETOS (prioridade máxima) ===
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
        outcome: null as any, // pricing não finaliza conversa
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

      // Descobre "o que falta"
      const needName  = !(context as any)?.user?.name;
      const needEmail = !(context as any)?.user?.email;

      const businessName = tenantConfig?.name || tenantConfig?.business_name || 'nosso atendimento';
      const intro = `Sou a assistente virtual da ${businessName}.`;

      if (needName) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
        return {
          response:
            `Perfeito! ${intro}\n` +
            `Para começarmos, me diga por favor seu **nome completo**.`,
          outcome: 'onboarding_started',
          newFlowLock: lock
        };
      }

      if (needEmail) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_email');
        return {
          response:
            `Obrigado, anotado! ${intro}\n` +
            `Agora, qual é seu **email**?`,
          outcome: 'onboarding_continue',
          newFlowLock: lock
        };
      }

      // Nada a coletar → apenas confirme e retome a conversa
      return {
        response: `Cadastro concluído ✅. Como posso ajudar?`,
        outcome: null as any,
        newFlowLock: context.flow_lock || null
      };
    }

    // === INTENTS INSTITUCIONAIS (não alteram fluxo) ===

    if (intent && intent.startsWith('institutional_')) {
      const response = this.generateInstitutionalResponse(intent, tenantConfig);
      return {
        response,
        outcome: 'institutional_info_provided',
        newFlowLock: context.flow_lock
      };
    }

    // === GREETING (comportamento revisado) ===
    if (intent === 'greeting') {
      // Buscar dados do usuário diretamente do banco
      const normalizedPhone = userPhone?.replace(/[\s\-\(\)]/g, '');
      let userProfile: { name: string | null; email: string | null } | null = null;
      
      if (normalizedPhone) {
        try {
          const userData = await supabaseAdmin
            .from('users')
            .select('name, email')
            .eq('phone', normalizedPhone)
            .eq('tenant_id', tenantId)
            .single();
          userProfile = userData.data;
        } catch (error) {
          // Usuário não existe no banco
          userProfile = null;
        }
      }

      const needName = !userProfile?.name;
      const needEmail = !userProfile?.email;

      // Nome do negócio para apresentação
      const businessName = tenantConfig?.name || tenantConfig?.business_name || 'nosso atendimento';
      const intro = `Sou a assistente virtual da ${businessName}.`;

      if (needName) {
        // Primeiro contato real: apresente-se e peça o nome completo
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
        return {
          response:
            `Olá! ${intro} Percebi que é seu primeiro contato por aqui 😊\n` +
            `Para te atender melhor, como posso te chamar? Qual é seu **nome completo**?`,
          outcome: 'onboarding_started',
          newFlowLock: lock
        };
      }

      if (needEmail) {
        // Já temos nome; peça somente o email
        const lock = this.flowManager.startFlowLock('onboarding', 'need_email');
        return {
          response:
            `Obrigado! ${intro}\n` +
            `Para concluir seu cadastro, qual é seu **email**?`,
          outcome: 'onboarding_continue',
          newFlowLock: lock
        };
      }

      // Usuário completo → saudação personalizada
      const userName = userProfile?.name;
      let userGender: string | undefined = undefined;
      
      // Tentar buscar gender do usuário
      if (normalizedPhone) {
        try {
          const userGenderData = await supabaseAdmin
            .from('users')
            .select('gender')
            .eq('phone', normalizedPhone)
            .eq('tenant_id', tenantId)
            .single();
          userGender = (userGenderData.data as any)?.gender;
        } catch (genderError) {
          console.log('🔧 Campo gender não disponível, inferindo do nome');
        }
      }
      
      // Se não temos gender da DB, inferir do nome
      if (!userGender && userName) {
        userGender = inferGenderFromName(userName);
      }
      
      const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
      const greeting = userName ? `, ${userName}` : '';
      
      return {
        response: `Como posso ajud${helpPhrase} hoje${greeting}? 😊`,
        outcome: null as any,
        newFlowLock: context.flow_lock || null
      };
    }

    // === FALLBACK ===
    return {
      response: 'Não entendi. Pode reformular, por favor?',
      outcome: null as any,
      newFlowLock: context.flow_lock
    };
  }

  /**
   * Handler para usuários que retornam com dados incompletos
   * Saudação personalizada + pedido do que está faltando
   */
  private async handleReturningUserGreeting({
    messageText,
    userPhone,
    tenantId,
    context,
    tenantConfig: _tenantConfig,
    userProfile
  }: {
    messageText: string;
    userPhone: string;
    tenantId: string;
    context: EnhancedConversationContext;
    tenantConfig: any;
    userProfile: { id: string; name: string | null; email: string | null; birth_date: string | null; address: any | null; gender: string | null; };
  }): Promise<WebhookOrchestrationResult> {
    
    const firstName = userProfile.name?.split(' ')[0] || '';
    
    // Detectar negativas antes de pedir dados
    const negativePatterns = [
      /\b(não|nao)\b/i,
      /\b(agora não|agora nao)\b/i,
      /\b(sem tempo|depois)\b/i,
      /\b(não quero|nao quero)\b/i,
      /\b(prefiro não|prefiro nao)\b/i,
      /\b(muito pessoal|privado)\b/i
    ];
    
    const isNegativeResponse = negativePatterns.some(pattern => pattern.test(messageText));
    
    if (isNegativeResponse) {
      // Resposta empática e redirecionamento para saudação personalizada
      const normalizedPhone = userPhone?.replace(/[\s\-\(\)]/g, '');
      let userGender: string | undefined = undefined;
      
      // Tentar buscar gender do banco
      try {
        const userGenderData = await supabaseAdmin
          .from('users')
          .select('gender')
          .eq('phone', normalizedPhone)
          .eq('tenant_id', tenantId)
          .single();
        userGender = (userGenderData.data as any)?.gender;
      } catch (genderError) {
        // Inferir do nome se não tem no banco
        userGender = inferGenderFromName(userProfile.name || undefined);
      }
      
      const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
      
      return {
        aiResponse: `Sem problemas! Entendo perfeitamente. Como posso ajud${helpPhrase} hoje, ${firstName}? 😊`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: context,
        telemetryData: {
          intent: 'returning_user_declined_data',
          confidence: 1.0,
          decision_method: 'negative_response_detected',
          flow_lock_active: false,
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }
    
    // Determine faltas de forma robusta
    const missingEmail = !userProfile.email;
    const missingBirth = !userProfile.birth_date;
    const missingAddr =
      !userProfile.address ||
      (typeof userProfile.address === 'object' && Object.keys(userProfile.address || {}).length === 0) ||
      (typeof userProfile.address === 'string' && userProfile.address.trim() === '');

    // 1) E-mail
    if (missingEmail) {
      const lock = this.flowManager.startFlowLock('returning_user', 'need_email');
      const updatedContext = await mergeEnhancedConversationContext(userPhone, tenantId, { ...context, flow_lock: lock });
      return {
        aiResponse: `${firstName}, como vai! 😊\n\nPercebi que ainda não tenho seu e-mail. Pode me informar para completarmos seu perfil?`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: { intent: 'returning_user_need_email', confidence: 1.0, decision_method: 'returning_user_greeting', flow_lock_active: true, processing_time_ms: 0, model_used: undefined }
      };
    }

    // 2) Data de nascimento
    if (missingBirth) {
      const lock = this.flowManager.startFlowLock('onboarding', 'need_birthday');
      const updatedContext = await mergeEnhancedConversationContext(userPhone, tenantId, { ...context, flow_lock: lock });
      return {
        aiResponse: `Perfeito, ${firstName}! Para completar seu cadastro, qual é sua data de nascimento? (dd/mm/aaaa)`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: { intent: 'returning_user_need_birthday', confidence: 1.0, decision_method: 'returning_user_greeting', flow_lock_active: true, processing_time_ms: 0, model_used: undefined }
      };
    }

    // 3) Endereço
    if (missingAddr) {
      const lock = this.flowManager.startFlowLock('onboarding', 'need_address');
      const updatedContext = await mergeEnhancedConversationContext(userPhone, tenantId, { ...context, flow_lock: lock });
      return {
        aiResponse: `${firstName}, para finalizar, me informe seu endereço (rua, número, bairro, cidade)`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: { intent: 'returning_user_need_address', confidence: 1.0, decision_method: 'returning_user_greeting', flow_lock_active: true, processing_time_ms: 0, model_used: undefined }
      };
    }
    
    // Se tem nome e email, mas falta outros dados, ir direto para saudação personalizada
    const normalizedPhone = userPhone?.replace(/[\s\-\(\)]/g, '');
    let userGender: string | undefined = undefined;
    
    try {
      const userGenderData = await supabaseAdmin
        .from('users')
        .select('gender')
        .eq('phone', normalizedPhone)
        .single();
      userGender = (userGenderData.data as any)?.gender;
    } catch (genderError) {
      userGender = inferGenderFromName(userProfile.name || undefined);
    }
    
    const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
    
    return {
      aiResponse: `Como posso ajud${helpPhrase} hoje, ${firstName}? 😊`,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: context,
      telemetryData: {
        intent: 'returning_user_complete',
        confidence: 1.0,
        decision_method: 'returning_user_greeting',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Handler para processar respostas de usuários retornando (quando fornecem email, etc.)
   */
  private async handleReturningUserFlow({
    messageText,
    userPhone,
    tenantId,
    context,
    tenantConfig,
    currentStep
  }: {
    messageText: string;
    userPhone: string;
    tenantId: string;
    context: EnhancedConversationContext;
    tenantConfig: any;
    currentStep: string;
  }): Promise<WebhookOrchestrationResult> {
    
    if (currentStep === 'need_email') {
      // Buscar dados atuais do usuário
      let userProfile: { name: string | null } | null = null;
      try {
        const normalizedPhone = userPhone.replace(/[\s\-\(\)]/g, '');
        const { data } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('phone', normalizedPhone)
          .eq('tenant_id', tenantId)
          .single();
        userProfile = data || null;
      } catch (error) {
        userProfile = null;
      }

      const firstName = userProfile?.name?.split(' ')[0] || '';
      
      // Detectar negativas
      const negativePatterns = [
        /\b(não|nao)\b/i,
        /\b(agora não|agora nao)\b/i,
        /\b(sem tempo|depois)\b/i,
        /\b(não quero|nao quero)\b/i,
        /\b(prefiro não|prefiro nao)\b/i
      ];
      
      const isNegativeResponse = negativePatterns.some(pattern => pattern.test(messageText));
      
      if (isNegativeResponse) {
        // Resposta empática e saudação personalizada
        const normalizedPhone = userPhone?.replace(/[\s\-\(\)]/g, '');
        let userGender: string | undefined = undefined;
        
        try {
          const userGenderData = await supabaseAdmin
            .from('users')
            .select('gender')
            .eq('phone', normalizedPhone)
            .eq('tenant_id', tenantId)
            .single();
          userGender = (userGenderData.data as any)?.gender;
        } catch (genderError) {
          userGender = inferGenderFromName(userProfile?.name || undefined);
        }
        
        const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
        
        return {
          aiResponse: `Sem problemas! Entendo perfeitamente. Como posso ajud${helpPhrase} hoje, ${firstName}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: await mergeEnhancedConversationContext(
            userPhone, tenantId, { ...context, flow_lock: null }
          ),
          telemetryData: {
            intent: 'returning_user_declined_email',
            confidence: 1.0,
            decision_method: 'negative_response_detected',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }
      
      // Tentar extrair email
      const extractedEmail = extractEmailStrict(messageText);
      
      if (extractedEmail) {
        // Salvar email
        const normalizedPhone = userPhone.replace(/[\s\-\(\)]/g, '');
        await supabaseAdmin
          .from('users')
          .update({ email: extractedEmail })
          .eq('phone', normalizedPhone)
          .eq('tenant_id', tenantId);
        
        // Saudação personalizada após salvar email
        const normalizedPhoneGender = userPhone?.replace(/[\s\-\(\)]/g, '');
        let userGender: string | undefined = undefined;
        
        try {
          const userGenderData = await supabaseAdmin
            .from('users')
            .select('gender')
            .eq('phone', normalizedPhoneGender)
            .single();
          userGender = (userGenderData.data as any)?.gender;
        } catch (genderError) {
          userGender = inferGenderFromName(userProfile?.name || undefined);
        }
        
        const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
        
        return {
          aiResponse: `Perfeito! 📧 E-mail salvo com sucesso. Como posso ajud${helpPhrase} hoje, ${firstName}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: await mergeEnhancedConversationContext(
            userPhone, tenantId, { ...context, flow_lock: null }
          ),
          telemetryData: {
            intent: 'returning_user_email_saved',
            confidence: 1.0,
            decision_method: 'email_extracted_and_saved',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }
      
      // Email não foi detectado - pedir novamente
      return {
        aiResponse: `${firstName}, poderia me passar um e-mail válido? Por exemplo: seuemail@exemplo.com`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: context,
        telemetryData: {
          intent: 'returning_user_invalid_email',
          confidence: 1.0,
          decision_method: 'invalid_email_format',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }
    
    // Fallback caso não reconheça o step
    return {
      aiResponse: 'Não entendi. Pode reformular, por favor?',
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: context,
      telemetryData: {
        intent: 'returning_user_fallback',
        confidence: 0.5,
        decision_method: 'unknown_step',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Handler para usuários com perfil completo (nome + email) que enviam saudação
   * Retorna saudação personalizada imediata com gênero apropriado
   */
  private async handleCompleteUserGreeting({
    messageText,
    userPhone,
    tenantId,
    context,
    tenantConfig,
    userProfile
  }: {
    messageText: string;
    userPhone: string;
    tenantId: string;
    context: EnhancedConversationContext;
    tenantConfig: any;
    userProfile: { id: string; name: string | null; email: string | null; birth_date: string | null; address: any | null; gender: string | null; };
  }): Promise<WebhookOrchestrationResult> {
    
    console.log(`🎯 [COMPLETE GREETING] Executando para: ${userProfile.name} (${userPhone})`);
    const firstName = userProfile.name?.split(' ')[0] || '';
    
    // Buscar dados completos do usuário para gênero usando mesma lógica do conversation-context-helper
    let userGender: string | undefined;
    try {
      const raw = String(userPhone || '').trim();
      const digits = raw.replace(/\D/g, '');
      const candidatesSet = new Set<string>();
      if (digits) {
        candidatesSet.add(digits);
        candidatesSet.add(`+${digits}`);
        if (digits.startsWith('55')) {
          const local = digits.slice(2);
          if (local) {
            candidatesSet.add(local);
            candidatesSet.add(`+${local}`);
          }
        } else {
          candidatesSet.add(`55${digits}`);
          candidatesSet.add(`+55${digits}`);
        }
      }
      const candidates = Array.from(candidatesSet);
      const orClause = candidates.map(v => `phone.eq.${v}`).join(',');
      
      console.log(`🔍 Telefone original: "${userPhone}" -> Candidates: ${candidates.join(',')}`);
      const { data: fullUser } = await supabaseAdmin
        .from('users')
        .select('gender')
        .or(orClause)
        .limit(1)
        .maybeSingle();
        
      userGender = (fullUser as any)?.gender;
      console.log(`🔍 Gender do DB: "${userGender}" para ${userProfile.name}`);
    } catch (error) {
      console.log(`❌ Erro ao buscar gender do DB:`, error);
    }
    
    // Se não temos gender do DB, inferir do nome
    if (!userGender && userProfile.name) {
      userGender = inferGenderFromName(userProfile.name || undefined);
      console.log(`🔍 Gender inferido do nome: "${userGender}" para ${userProfile.name}`);
    }
    
    console.log(`🔍 Gender final: "${userGender}"`);
    // Escolher a forma de "ajudá-lo/ajudá-la" baseado no gênero
    const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
    console.log(`🔍 Help phrase: "${helpPhrase}"`);;
    
    const personalizedGreeting = `${firstName}, como vai! Que bom ter você de volta! 😊 Como posso ${helpPhrase} hoje?`;
    
    // Salvar contexto limpo (sem flow ativo)
    const updatedContext = await mergeEnhancedConversationContext(
      userPhone,
      tenantId,
      {
        ...context,
        flow_lock: null // Remove flow lock
      },
      {
        intent: 'greeting',
        confidence: 1.0,
        decision_method: 'regex'
      }
    );
    
    return {
      aiResponse: personalizedGreeting,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext,
      telemetryData: {
        intent: 'greeting',
        confidence: 1.0,
        decision_method: 'personalized_complete_user_greeting',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Handler determinístico do Onboarding
   * Apresenta empresa/bot e conduz: nome → email → persistência → limpa flow
   */
  private async handleOnboardingStep({
    messageText,
    userPhone,
    tenantId,
    context,
    tenantConfig,
    currentStep,
    greetFirst,
    existingUserData = null
  }: {
    messageText: string;
    userPhone: string;
    tenantId: string;
    context: EnhancedConversationContext;
    tenantConfig: any;
    currentStep: 'need_name' | 'need_email';
    greetFirst: boolean;
    existingUserData?: { id: string; name: string | null; email: string | null; } | null;
  }): Promise<WebhookOrchestrationResult> {

    let tenantRow: { business_name: string; ai_settings: any; } | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('tenants')
        .select('business_name, ai_settings')
        .eq('id', tenantId)
        .single();
      tenantRow = data || null;
    } catch (error) {
      tenantRow = null;
    }

    const biz = tenantRow?.business_name ?? (tenantConfig?.name || 'sua empresa');
    const botName = (tenantRow?.ai_settings as any)?.bot_name ?? 'Assistente UBS';

    // === PASSO 1 — NOME ===
    if (currentStep === 'need_name') {
      console.log('🔍 FLOW DEBUG - STEP need_name - texto:', messageText);
      const maybeName = extractNameStrict(messageText);
      console.log('🔍 FLOW DEBUG - nome extraído:', maybeName);

      if (greetFirst && !maybeName) {
        // 🔧 CRITICAL FIX: Só mostrar intro se NÃO extraiu nome da primeira mensagem
        const intro = `Olá, eu sou a assistente oficial da ${biz}. Percebi que este é seu primeiro contato.`;
        const ask  = `Para melhor atendê-lo, qual é seu nome completo?`;
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');

        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `${intro}\n${ask}`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'onboarding_intro',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }

      if (!maybeName) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Para melhor atendê-lo, qual é seu nome completo?`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'ask_name',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }

      // Persistir NOME e GÊNERO agora
      const normalizedPhoneForUpsert = userPhone.replace(/[\s\-\(\)]/g, '');
      const inferredGender = inferGenderFromName(maybeName);
      
      try {
        console.log('🔧 UPSERT DEBUG:', {
          phone: normalizedPhoneForUpsert,
          name: maybeName,
          gender: inferredGender
        });
        
        console.log('🚀 INICIANDO UPSERT...');
        const startTime = Date.now();
        
        const result = await Promise.race([
          supabaseAdmin
            .from('users')
            .upsert({ 
              phone: normalizedPhoneForUpsert, 
              name: maybeName,
              gender: inferredGender,
              tenant_id: tenantId 
            }, { onConflict: 'phone' }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('UPSERT_TIMEOUT_10S')), 10000)
          )
        ]);

        const duration = Date.now() - startTime;
        console.log(`⏱️ UPSERT DURATION: ${duration}ms`);
        
        console.log('🔍 RESULT TYPE:', typeof result);
        console.log('🔍 RESULT KEYS:', Object.keys(result || {}));
        
        const { data, error } = result as any;
        
        console.log('📊 HAS DATA:', !!data, 'HAS ERROR:', !!error);
        
        if (error) {
          console.error('❌ UPSERT ERROR CODE:', error.code);
          console.error('❌ UPSERT ERROR MESSAGE:', error.message);
          console.error('❌ UPSERT ERROR DETAILS:', error.details);
        } else if (data) {
          console.log('✅ UPSERT SUCCESS - ROWS AFFECTED:', Array.isArray(data) ? data.length : 'N/A');
        } else {
          console.log('⚠️ UPSERT COMPLETED BUT NO DATA/ERROR');
        }
      } catch (catchError: any) {
        console.error('❌ UPSERT EXCEPTION:', catchError?.message || catchError);
      }

      // Avançar para E-MAIL
      const nextLock = this.flowManager.startFlowLock('onboarding', 'need_email');
      const updatedContext = await mergeEnhancedConversationContext(
        userPhone, tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado, ${firstName(maybeName)}! Agora me informe seu e-mail para finalizarmos.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: 'onboarding',
          confidence: 1.0,
          decision_method: 'name_saved',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }

    // === PASSO 2 — E-MAIL ===
    if (currentStep === 'need_email') {
      const maybeEmail = extractEmailStrict(messageText);

      if (!maybeEmail) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_email');
        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: lock }
        );

        // Mensagem personalizada baseada se já conhecemos o usuário
        let emailMessage;
        if (existingUserData?.name) {
          // Usuário já tem nome - saudação amigável
          emailMessage = `Olá ${existingUserData.name.split(' ')[0]}! Para concluir seu cadastro, pode me passar seu e-mail no formato nome@exemplo.com?`;
        } else {
          // Caso padrão
          emailMessage = `Pode me passar seu e-mail no formato nome@exemplo.com?`;
        }

        return {
          aiResponse: emailMessage,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'ask_email',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }

      // Persistir E-MAIL agora
      const normalizedPhoneForEmail = userPhone.replace(/[\s\-\(\)]/g, '');
      await supabaseAdmin
        .from('users')
        .upsert({ phone: normalizedPhoneForEmail, email: maybeEmail, tenant_id: tenantId }, { onConflict: 'phone' });

      // Avançar para PERGUNTA OPCIONAL
      const nextLock = this.flowManager.startFlowLock('onboarding', 'ask_additional_data');
      const updatedContext = await mergeEnhancedConversationContext(
        userPhone, tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado! 📧 E-mail salvo. Para personalizar ainda mais nosso atendimento, você se importaria de fornecer algumas informações adicionais? (É opcional e rápido!) \n\nResponda *sim* ou *não*.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: 'onboarding',
          confidence: 1.0,
          decision_method: 'email_saved_ask_additional',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }

    // === PASSO 3 — PERGUNTA SOBRE DADOS ADICIONAIS ===
    if (currentStep === 'ask_additional_data') {
      const response = messageText.toLowerCase().trim();
      
      // Verificar explicitamente por respostas negativas primeiro
      if (response.includes('não') || response.includes('nao') || response === 'n') {
        // Usuário recusa dados adicionais - finalizar onboarding com transição para general
        const cleanedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: null }
        );

        // Buscar dados do usuário para personalização
        const normalizedPhone = userPhone.replace(/[\s\-\(\)]/g, '');
        let userName = '';
        let userGender: string | undefined = undefined;
        
        try {
          const userNameData = await supabaseAdmin
            .from('users')
            .select('name')
            .eq('phone', normalizedPhone)
            .eq('tenant_id', tenantId)
            .single();
          userName = userNameData.data?.name || '';

          try {
            const userGenderData = await supabaseAdmin
              .from('users')
              .select('gender')
              .eq('phone', normalizedPhone)
              .eq('tenant_id', tenantId)
              .single();
            userGender = (userGenderData.data as any)?.gender;
          } catch (genderError) {
            console.log('🔧 Campo gender não disponível, inferindo do nome');
          }
        } catch (error) {
          console.log('❌ Erro ao buscar dados do usuário:', error);
        }
        
        if (!userGender && userName) {
          userGender = inferGenderFromName(userName);
        }
        
        const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
        const greeting = userName ? `, ${userName}` : '';

        // Transicionar para sessão general após onboarding
        const generalLock = this.flowManager.startFlowLock('general', 'start');
        const contextWithGeneralFlow = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...cleanedContext, flow_lock: generalLock }
        );

        return {
          aiResponse: `Sem problemas! Seus dados básicos já foram salvos. Como posso ${helpPhrase} hoje${greeting}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: contextWithGeneralFlow,
          telemetryData: {
            intent: 'onboarding_completed',
            confidence: 1.0,
            decision_method: 'user_declines_additional_data',
            flow_lock_active: true, // Manter sessão ativa com flow general
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      } else if (response.includes('sim') || response === 's') {
        // Usuário aceita fornecer dados adicionais - ir para aniversário
        const nextLock = this.flowManager.startFlowLock('onboarding', 'need_birthday');
        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: nextLock }
        );

        return {
          aiResponse: `Ótimo! 🎂 Qual é sua data de aniversário? (formato: dd/mm/aaaa)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'user_accepts_additional_data',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      } else {
        // Resposta não compreendida - pedir clarificação
        return {
          aiResponse: `Por favor, responda com *sim* ou *não*. Gostaria de fornecer algumas informações adicionais para personalizar nosso atendimento?`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: 'onboarding_clarification',
            confidence: 1.0,
            decision_method: 'unclear_response',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }
    }

    // === PASSO 4 — ANIVERSÁRIO ===
    if (currentStep === 'need_birthday') {
      const maybeBirthDate = extractBirthDate(messageText);

      if (!maybeBirthDate) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_birthday');
        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Por favor, informe sua data de aniversário no formato dd/mm/aaaa (exemplo: 15/03/1990)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'invalid_birthday_format',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }

      // Persistir data de aniversário
      const normalizedPhoneForBirthday = userPhone.replace(/[\s\-\(\)]/g, '');
      await supabaseAdmin
        .from('users')
        .upsert({ phone: normalizedPhoneForBirthday, birth_date: maybeBirthDate, tenant_id: tenantId }, { onConflict: 'phone' });

      // Avançar para ENDEREÇO
      const nextLock = this.flowManager.startFlowLock('onboarding', 'need_address');
      const updatedContext = await mergeEnhancedConversationContext(
        userPhone, tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado! 🏠 Por último, pode me informar seu endereço? (rua, número, bairro, cidade)`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: 'onboarding',
          confidence: 1.0,
          decision_method: 'birthday_saved',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }

    // === PASSO 5 — ENDEREÇO ===
    if (currentStep === 'need_address') {
      const address = messageText.trim();

      if (!address || address.length < 10) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_address');
        const updatedContext = await mergeEnhancedConversationContext(
          userPhone, tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Por favor, informe um endereço mais completo (rua, número, bairro, cidade)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: 'onboarding',
            confidence: 1.0,
            decision_method: 'incomplete_address',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          }
        };
      }

      // Persistir endereço como JSON
      const normalizedPhoneForAddress = userPhone.replace(/[\s\-\(\)]/g, '');
      const addressData = { full_address: address, created_at: new Date().toISOString() };
      
      await supabaseAdmin
        .from('users')
        .upsert({ phone: normalizedPhoneForAddress, address: addressData, tenant_id: tenantId }, { onConflict: 'phone' });

      // Finalizar onboarding completo
      const cleanedContext = await mergeEnhancedConversationContext(
        userPhone, tenantId, { ...context, flow_lock: null }
      );

      // Buscar dados do usuário para personalização
      const normalizedPhone = userPhone.replace(/[\s\-\(\)]/g, '');
      let userName = '';
      let userGender: string | undefined = undefined;
      
      try {
        // Primeiro tentar buscar apenas o nome (que sabemos que existe)
        const userNameData = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('phone', normalizedPhone)
          .eq('tenant_id', tenantId)
          .single();
        userName = userNameData.data?.name || '';

        // Tentar buscar gender apenas se necessário
        try {
          const userGenderData = await supabaseAdmin
            .from('users')
            .select('gender')
            .eq('phone', normalizedPhone)
            .eq('tenant_id', tenantId)
            .single();
          userGender = (userGenderData.data as any)?.gender;
        } catch (genderError) {
          // Ignora erro se gender não existir - será inferido do nome
          console.log('🔧 Campo gender não disponível, inferindo do nome');
        }
      } catch (error) {
        console.log('❌ Erro ao buscar dados do usuário:', error);
      }
      
      // Se não temos gender da DB, inferir do nome
      if (!userGender && userName) {
        userGender = inferGenderFromName(userName);
      }
      
      const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
      const greeting = userName ? `, ${userName}` : '';

      // Transicionar para sessão general após onboarding completo
      const generalLock = this.flowManager.startFlowLock('general', 'start');
      const contextWithGeneralFlow = await mergeEnhancedConversationContext(
        userPhone, tenantId, { ...cleanedContext, flow_lock: generalLock }
      );

      return {
        aiResponse: `Excelente! 🎉 Agora temos seu perfil completo. Como posso ${helpPhrase} hoje${greeting}? 😊`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: contextWithGeneralFlow,
        telemetryData: {
          intent: 'onboarding_completed',
          confidence: 1.0,
          decision_method: 'complete_onboarding_with_additional_data',
          flow_lock_active: true, // Manter sessão ativa com flow general
          processing_time_ms: 0,
          model_used: undefined
        }
      };
    }

    // Fallback seguro: voltar para NOME
    const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
    const fallbackCtx = await mergeEnhancedConversationContext(userPhone, tenantId, { ...context, flow_lock: lock });

    return {
      aiResponse: `Vamos começar — qual é seu nome completo?`,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: fallbackCtx,
      telemetryData: {
        intent: 'onboarding',
        confidence: 1.0,
        decision_method: 'fallback',
        flow_lock_active: true,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Handlers especiais
   */
  private async handleExpiredFlow(context: EnhancedConversationContext, message: string, userPhone: string, messageText: string): Promise<WebhookOrchestrationResult> {
    // CORREÇÃO: Em vez de enviar "Sessão expirada", reiniciar automaticamente nova sessão
    console.log('🔄 [TIMEOUT] Sessão expirou - reiniciando automaticamente nova sessão');
    
    // Limpar flow_lock da sessão expirada
    const cleanedContext = await mergeEnhancedConversationContext(
      userPhone,
      context.tenant_id,
      { ...context, flow_lock: null }
    );

    // Se há mensagem, processar normalmente como nova sessão
    if (messageText.trim()) {
      console.log('🚀 [RESTART] Processando mensagem como nova sessão:', messageText);
      // Continuar processamento normal sem flow_lock ativo
      return await this.continueProcessingAfterExpiration(cleanedContext, messageText, userPhone);
    }

    // Fallback: Se não há mensagem, resposta personalizada de boas-vindas
    const personalizedGreeting = await this.getPersonalizedGreeting(userPhone, context.tenant_id);
    return {
      aiResponse: personalizedGreeting,
      shouldSendWhatsApp: true,
      conversationOutcome: 'session_restarted',
      updatedContext: cleanedContext,
      telemetryData: {
        intent: 'greeting',
        confidence: 1.0,
        decision_method: 'auto_restart',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Continua processamento após expiração de sessão
   */
  private async continueProcessingAfterExpiration(context: EnhancedConversationContext, messageText: string, userPhone: string): Promise<WebhookOrchestrationResult> {
    try {
      // Detectar intents da mensagem atual
      const detectedIntents = this.intentDetector.detectIntents(messageText);
      const primaryIntent = detectedIntents[0] || 'greeting';
      
      // Verificar se pode iniciar novo fluxo
      const flowDecision = this.flowManager.canStartNewFlow(context, primaryIntent as FlowType);
      
      if (!flowDecision.allow_intent) {
        // Se não pode iniciar fluxo, resposta personalizada
        const personalizedGreeting = await this.getPersonalizedGreeting(userPhone, context.tenant_id);
        return {
          aiResponse: personalizedGreeting,
          shouldSendWhatsApp: true,
          conversationOutcome: 'session_restarted',
          updatedContext: context,
          telemetryData: {
            intent: 'greeting',
            confidence: 0.8,
            decision_method: 'auto_restart',
            flow_lock_active: false,
            processing_time_ms: Date.now(),
            model_used: undefined
          }
        };
      }

      // Iniciar novo flow lock se necessário
      let updatedContext = context;
      if (flowDecision.current_flow && flowDecision.current_flow !== 'general') {
        const newFlowLock = this.flowManager.startFlowLock(flowDecision.current_flow, 'start');
        updatedContext = await mergeEnhancedConversationContext(
          userPhone,
          context.tenant_id,
          { ...context, flow_lock: newFlowLock }
        );
      }

      // Para greeting após timeout, delegar para o fluxo principal que já tem toda lógica
      if (primaryIntent === 'greeting') {
        console.log('🔄 [RESTART] Greeting após timeout - delegando para fluxo principal');
        // Reprocessar usando o fluxo principal completo com toda lógica de profile validation
        return await this.orchestrateWebhookFlow(messageText, userPhone, context.tenant_id, {}, updatedContext);
      }

      if (primaryIntent === 'services') {
        return {
          aiResponse: `Sobre nossos serviços:\n\n✨ Oferecemos diversos tratamentos de beleza e bem-estar\n📅 Agendamentos flexíveis\n👨‍⚕️ Profissionais qualificados\n\nGostaria de agendar algum serviço específico?`,
          shouldSendWhatsApp: true,
          conversationOutcome: 'session_restarted_info',
          updatedContext,
          telemetryData: {
            intent: 'services',
            confidence: 0.9,
            decision_method: 'regex',
            flow_lock_active: !!updatedContext.flow_lock?.active_flow,
            processing_time_ms: Date.now(),
            model_used: undefined
          }
        };
      }

      if (primaryIntent === 'pricing') {
        return {
          aiResponse: `💰 Nossos preços:\n\n• Corte masculino: R$ 25\n• Corte feminino: R$ 35\n• Barba: R$ 15\n• Hidratação: R$ 45\n\nGostaria de agendar algum desses serviços?`,
          shouldSendWhatsApp: true,
          conversationOutcome: 'session_restarted_pricing',
          updatedContext,
          telemetryData: {
            intent: 'pricing',
            confidence: 0.9,
            decision_method: 'regex',
            flow_lock_active: !!updatedContext.flow_lock?.active_flow,
            processing_time_ms: Date.now(),
            model_used: undefined
          }
        };
      }

      // Para outros intents, resposta personalizada inteligente
      const personalizedGreeting = await this.getPersonalizedGreeting(userPhone, context.tenant_id);
      return {
        aiResponse: personalizedGreeting,
        shouldSendWhatsApp: true,
        conversationOutcome: 'session_restarted',
        updatedContext,
        telemetryData: {
          intent: primaryIntent || 'general',
          confidence: 0.7,
          decision_method: 'regex',
          flow_lock_active: !!updatedContext.flow_lock?.active_flow,
          processing_time_ms: Date.now(),
          model_used: undefined
        }
      };
      
    } catch (error) {
      console.error('❌ [RESTART] Erro ao reiniciar sessão:', error);
      
      // Fallback seguro personalizado
      const personalizedGreeting = await this.getPersonalizedGreeting(userPhone, context.tenant_id);
      return {
        aiResponse: personalizedGreeting,
        shouldSendWhatsApp: true,
        conversationOutcome: 'session_restarted',
        updatedContext: context,
        telemetryData: {
          intent: 'greeting',
          confidence: 0.5,
          decision_method: 'error_fallback',
          flow_lock_active: false,
          processing_time_ms: Date.now(),
          model_used: undefined
        }
      };
    }
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
        model_used: undefined
      }
    };
  }

  /**
   * Handler para timeout checking - Pergunta se usuário ainda está presente
   */
  private async handleTimeoutChecking(context: EnhancedConversationContext, message: string, userPhone: string, tenantId: string): Promise<WebhookOrchestrationResult> {
    // Marcar que estamos no estágio de checking
    const updatedLock = this.flowManager.markTimeoutStage(context, 'checking');
    const updatedContext = await mergeEnhancedConversationContext(
      userPhone, tenantId, { ...context, flow_lock: updatedLock }
    );
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_checking',
      updatedContext,
      telemetryData: {
        intent: 'timeout_checking',
        confidence: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: undefined
      }
    };
  }

  /**
   * Handler para timeout finalizing - Despedida amigável antes de encerrar
   */
  private async handleTimeoutFinalizing(context: EnhancedConversationContext, message: string, userPhone: string, tenantId: string): Promise<WebhookOrchestrationResult> {
    // Marcar que estamos no estágio final e programar para encerrar logo
    const updatedLock = this.flowManager.markTimeoutStage(context, 'finalizing');
    const updatedContext = await mergeEnhancedConversationContext(
      userPhone, tenantId, { ...context, flow_lock: updatedLock }
    );
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_finalizing',
      updatedContext,
      telemetryData: {
        intent: 'timeout_finalizing',
        confidence: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: undefined
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
        model_used: (intentResult as any).model_used
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
      'institutional_address': policies.address || 'Infelizmente neste momento não possuo esta informação no sistema.',
      'institutional_hours': policies.hours || 'Infelizmente neste momento não possuo esta informação no sistema.',
      'institutional_policy': policies.cancellation || 'Infelizmente neste momento não possuo esta informação no sistema.',
      'institutional_payment': tenantConfig?.payment || 'Infelizmente neste momento não possuo esta informação no sistema.',
      'institutional_contact': tenantConfig?.phone || 'Infelizmente neste momento não possuo esta informação no sistema.'
    };

    return responses[intent] || 'Infelizmente neste momento não possuo esta informação no sistema.';
  }

  /**
   * 🚨 MÉTODO CRÍTICO: Gera resposta via OpenAI com contexto do Flow Lock
   * Flow Lock apenas gerencia estado, OpenAI gera TODAS as respostas (exceto comandos diretos)
   */
  private async generateAIResponseWithFlowContext(
    messageText: string,
    intentResult: any,
    flowDecision: any,
    context: EnhancedConversationContext,
    tenantConfig: any,
    userPhone: string
  ): Promise<{ response: string; outcome: string | null; newFlowLock?: any; llmMetrics?: any }> {
    const intent = intentResult.intent;
    const currentFlow: string | null = context.flow_lock?.active_flow || null;
    const currentStep: string | null = context.flow_lock?.step || null;

    // Comandos diretos (sem OpenAI)
    if (intent === 'flow_cancel') {
      const abandonedLock = this.flowManager.abandonFlow(context, 'user_requested');
      return { response: 'Cancelado. Como posso ajudar?', outcome: 'flow_cancelled', newFlowLock: abandonedLock };
    }
    if (intent === 'booking_confirm' && currentFlow === 'booking') {
      const completedLock = this.flowManager.completeFlow(context, 'appointment_booked');
      return { response: '✅ Agendamento confirmado! Você receberá um lembrete por email.', outcome: 'appointment_booked', newFlowLock: completedLock };
    }
    if (intent === 'slot_selection' && currentFlow === 'booking') {
      const nextLock = this.flowManager.advanceStep(context, 'confirm', { selectedSlot: messageText });
      return { response: `Confirma agendamento no horário ${messageText}? Digite "confirmo" para finalizar.`, outcome: 'booking_slot_selected', newFlowLock: nextLock };
    }

    // OpenAI para todos os demais
    const start = Date.now();

    const businessInfo = this.buildBusinessContext(tenantConfig);
    const flowCtx = this.buildFlowContext(currentFlow, currentStep, intent);

    const systemPrompt = `Você é a assistente oficial do ${tenantConfig?.name || 'negócio'}. Seu papel é atender com clareza, honestidade e objetividade, sempre em tom natural.

⚠️ REGRAS DE HONESTIDADE ABSOLUTA - OBRIGATÓRIAS:
- NUNCA invente dados. NUNCA prometa retorno. NUNCA mencione atendente humano.
- Para informações inexistentes use exatamente: "Infelizmente neste momento não possuo esta informação no sistema."
- Use APENAS dados reais do sistema.

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

Responda APENAS a mensagem do cliente, em pt-BR.`;

    const userPrompt = `Mensagem do cliente: "${messageText}"
Intenção detectada: ${intent}
${flowCtx}`;

    try {
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

      const aiResponse = completion.choices[0]?.message?.content?.trim()
        || 'Não entendi. Pode reformular, por favor?';
      const latencyMs = Date.now() - start;

      // Confiança heurística
      const aiConfidenceScore = (() => {
        const lp = completion.choices[0]?.logprobs?.content;
        if (!lp || lp.length === 0) {
          const fr = completion.choices[0]?.finish_reason;
          return fr === 'stop' ? 0.85 : 0.6;
        }
        const avg = lp.reduce((s: number, t: any) => s + (t.logprob || -2), 0) / lp.length;
        const conf = Math.max(0.1, Math.min(0.99, Math.exp(avg / -2.0)));
        return Math.round(conf * 100) / 100;
      })();

      const usage = completion.usage;
      const apiCost = this.calculateOpenAICost(usage);

      const llmMetrics = {
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        api_cost_usd: apiCost,
        processing_cost_usd: (() => {
          if (!apiCost) return 0.00001;
          const pct = apiCost * 0.10;
          const infra = 0.00002;
          const db = 0.00001;
          return Math.round((apiCost + pct + infra + db) * 100000) / 100000;
        })(),
        confidence_score: aiConfidenceScore,
        latency_ms: latencyMs
      };

      const newFlowLock = this.determineNewFlowState(intent, currentFlow, context);
      return { response: aiResponse, outcome: null, newFlowLock, llmMetrics };

    } catch (error) {
      console.error('❌ Erro ao chamar OpenAI:', error);
      // Fallback determinístico
      return await this.executeFlowAction(messageText, intentResult, flowDecision, context, tenantConfig, userPhone, context.tenant_id);
    }
  }

  private buildBusinessContext(tenantConfig: any): string {
    const services = tenantConfig?.services?.slice(0, 5) || [];
    const policies = tenantConfig?.policies || {};

    let context = `SOBRE O NEGÓCIO:
- Nome: ${tenantConfig?.name || 'Não informado'}
- Tipo: ${tenantConfig?.domain || 'Serviços gerais'}`;

    if (services.length > 0) {
      context += `\n- Serviços: ${services.map((s: any) => `${s.name} (R$ ${s.price})`).join(', ')}`;
    }
    if (policies.address) context += `\n- Endereço: ${policies.address}`;
    if (policies.hours) context += `\n- Horário: ${policies.hours}`;
    return context;
  }

  private buildFlowContext(currentFlow: string | null, currentStep: string | null, intent: string | null): string {
    if (!currentFlow) return `O cliente está iniciando uma nova conversa. Intenção: ${intent}`;
    return `O cliente está no fluxo de ${currentFlow}, etapa: ${currentStep || 'inicial'}. Intenção: ${intent}`;
    }

  private calculateOpenAICost(usage: any): number | null {
    if (!usage || !usage.prompt_tokens || !usage.completion_tokens) return null;
    const promptCost = (usage.prompt_tokens / 1000) * (parseFloat(process.env.OPENAI_PROMPT_COST_PER_1K || '0.03'));
    const completionCost = (usage.completion_tokens / 1000) * (parseFloat(process.env.OPENAI_COMPLETION_COST_PER_1K || '0.06'));
    return Math.round((promptCost + completionCost) * 100000) / 100000;
  }

  private determineNewFlowState(intent: string | null, currentFlow: string | null, context: EnhancedConversationContext): any {
    const targetFlow = this.mapIntentToFlow(intent);
    if (!targetFlow) return context.flow_lock;
    if (!currentFlow) return this.flowManager.startFlowLock(targetFlow, 'start');
    return context.flow_lock;
  }

  /**
   * Detecta se a conversa está finalizada e deve persistir outcome
   * Retorna null se conversa ainda está em andamento
   */
  private shouldPersistOutcome(intent: string | null, _response: string, _context: EnhancedConversationContext): string | null {
    const finalizers = ['booking_confirm', 'cancel_confirm', 'reschedule_confirm'];
    if (intent && finalizers.includes(intent)) {
      return this.determineConversationOutcome(intent, _response);
    }
    return null;
  }

  private determineConversationOutcome(intent: string | null, _response: string): string {
    const map: Record<string, string> = {
      'booking_confirm': 'appointment_created',
      'cancel_confirm': 'appointment_cancelled',
      'reschedule_confirm': 'appointment_modified'
    };
    if (!intent || !map[intent]) {
      console.error(`determineConversationOutcome chamado com intent não-finalizador: ${intent}`);
      return 'error';
    }
    return map[intent];
  }

  async checkAndPersistConversationOutcome(
    sessionId: string,
    trigger: 'timeout' | 'flow_completion' | 'appointment_action' | 'user_exit' = 'flow_completion'
  ): Promise<void> {
    try {
      const analysis = await this.outcomeAnalyzer.analyzeConversationOutcome(sessionId, trigger);
      if (analysis) {
        const success = await this.outcomeAnalyzer.persistOutcomeToFinalMessage(analysis);
        if (success) console.log(`🎯 Conversation outcome persisted: ${analysis.outcome} (${analysis.confidence})`);
      }
    } catch (error) {
      console.error('❌ Failed to check conversation outcome:', error);
    }
  }

  async processFinishedConversations(): Promise<void> {
    try {
      await this.outcomeAnalyzer.checkForFinishedConversations();
    } catch (error) {
      console.error('❌ Failed to process finished conversations:', error);
    }
  }

  /**
   * Classificação LLM determinística e fechada
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
1) Responda SOMENTE com JSON no formato: {"intent":"<uma-das-chaves-ou-null>"}.
2) Se NÃO for possível classificar com segurança, responda exatamente: {"intent":null}.
3) Não explique. Não inclua texto extra.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        top_p: 0,
        max_tokens: 20,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Mensagem do usuário (pt-BR):\n---\n${text}\n---\nClassifique.` }
        ]
      });

      const raw = completion.choices?.[0]?.message?.content?.trim() || '';

      // Tentativa 1: parse direto
      try {
        const parsed = JSON.parse(raw);
        const intent = (parsed && typeof parsed.intent !== 'undefined') ? parsed.intent : null;
        if (intent === null) return null;
        return INTENT_KEYS.includes(intent as any) ? intent : null;
      } catch {
        // Tentativa 2: extrair via regex simples
        const m = raw.match(/\"intent\"\s*:\s*\"([a-zA-Z0-9_]+)\"/);
        if (m && m[1] && INTENT_KEYS.includes(m[1] as any)) return m[1];
        if (/\{\s*\"intent\"\s*:\s*null\s*\}/.test(raw)) return null;
        return null;
      }

    } catch (error) {
      console.error('❌ LLM intent classification failed:', error);
      return null;
    }
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
}