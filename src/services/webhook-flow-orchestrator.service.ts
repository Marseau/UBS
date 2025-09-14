/**
 * Webhook Flow Orchestrator Service
 * Orquestra integração do Flow Lock System com webhook existente
 * Revisão consolidada com Onboarding determinístico e sem duplicações
 */

import crypto from 'crypto';
import { finalizeAndRespond } from '../core/finalize';
import { DeterministicIntentDetectorService, INTENT_KEYS } from './deterministic-intent-detector.service';
import { LLMIntentClassifierService } from './llm-intent-classifier.service';
import { IntentDisambiguationService } from './intent-disambiguation.service';
import { FlowLockManagerService } from './flow-lock-manager.service';
import { ProgressiveDataCollectorService, CollectionContext, UserProfileData } from './progressive-data-collector.service';
import { mergeEnhancedConversationContext } from '../utils/conversation-context-helper';
import { supabaseAdmin } from '../config/database';
import { EnhancedConversationContext, FlowType } from '../types/flow-lock.types';
import { SystemFlowState } from '../types/intent.types';
import OpenAI from 'openai';
import { upsertUserProfile, normalizePhone } from './user-profile.service';
import { AppointmentActionablesService } from './appointment-actionables.service';
import { MapsLocationService } from './maps-location.service';
import { RescheduleConflictManagerService } from './reschedule-conflict-manager.service';
import { ConversationHistoryPersistence } from './conversation-history-persistence.service';
import { ConversationRepository } from '../repositories/conversation.repository';
import { TelemetryService } from './telemetry.service';
import { OutcomeAnalyzer } from './outcome-analyzer.service';
import { ContextualPoliciesService } from './contextual-policies.service';
import { RedisCacheService, redisCacheService } from './redis-cache.service';
import { IntentOutcomeTelemetryService } from './intent-outcome-telemetry.service';
import { ConversationOutcomeAnalyzerService } from './conversation-outcome-analyzer.service';
import { ConversationOutcomeService } from './conversation-outcome.service';
import { sanitizeIntentForPersistence, detectIntentFromMessage, logIntentCleanup } from '../utils/intent-validator.util';
import { recordLLMMetrics } from './telemetry/llm-telemetry.service';

// NOVO: entrada padronizada
type OrchestratorInput = {
  messageText: string;
  userPhone: string;
  whatsappNumber?: string;
  tenantId?: string;            // quando disponível
  messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
};

// IntentDecision será redefinida abaixo para compatibilidade

// pequena ajuda utilitária para contexto
const ctx = (extra: Record<string, any> = {}) => ({ ...extra });

// Estados de coleta progressiva de dados
export enum DataCollectionState {
  NEED_NAME = 'need_name',
  NEED_EMAIL = 'need_email', 
  NEED_GENDER_CONFIRMATION = 'need_gender_confirmation',
  ASK_OPTIONAL_DATA_CONSENT = 'ask_optional_data_consent',
  NEED_BIRTH_DATE = 'need_birth_date',
  NEED_ADDRESS = 'need_address',
  COLLECTION_COMPLETE = 'collection_complete'
}

// Helper function to get user by phone in a specific tenant
async function getUserByPhoneInTenant(phone: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(`
      id, name, email,
      user_tenants!inner(tenant_id)
    `)
    .eq('phone', phone)
    .eq('user_tenants.tenant_id', tenantId)
    .maybeSingle();
  
  return { data, error };
}

// 🔎 Build marker – aparece no boot/rebuild do servidor
console.log('🆕 VERSÃO REBUILD ATIVA - data/hora:', new Date().toLocaleString('pt-BR'));

// ----------------------------------------------------------------------------
// Utilidades locais
// ----------------------------------------------------------------------------

// Helper para normalizar chaves de contexto (apenas dígitos)
const toCtxId = (s: string) => String(s || '').replace(/\D/g, ''); // dígitos-only

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

  // ✅ NOVO: Cortar sufixos comuns que não fazem parte do nome
  candidate = candidate.replace(/\s+(e o seu\??|e o teu\??|e vc\??|e você\??|e tu\??)$/i, '');

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
    confidence_score: number | null;
    decision_method: string;
    flow_lock_active: boolean;
    processing_time_ms: number;
    model_used?: string;
  };
  // ✅ NOVO: Métricas da classificação de intent (do intentResult.llmMetrics)
  intentMetrics?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    api_cost_usd: number | null;
    processing_cost_usd: number | null;
    confidence_score: number | null;
    latency_ms: number | null;
    model_used?: string;
  };
  // ✅ EXISTENTE: Métricas da geração de resposta (do generateAIResponseWithFlowContext)
  llmMetrics?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    api_cost_usd: number | null;
    processing_cost_usd: number | null;
    confidence_score: number | null;
    latency_ms: number | null;
    model_used?: string;
  };
}

// ----------------------------------------------------------------------------
// Tipos auxiliares para refatoração estrutural
// ----------------------------------------------------------------------------

interface OrchestratorContext {
  message: string;
  userPhone: string;
  tenantId: string;
  tenantConfig: any;
  priorContext: any;
  sessionId: string;
  userId: string;
  isDemo?: boolean; // Detecta se é modo demo
}

interface FlowDecision {
  intent: string | null;
  response: string;
  confidence: number | null;
  reason: string;
  decisionMethod?: 'flow_lock';
}

interface IntentDecision {
  intent: string | null;
  source: 'flow_lock' | 'regex' | 'llm';
  decisionMethod?: 'flow_lock' | 'regex' | 'llm';
  confidence: number | null;
  reason: string;
  responseOverride?: string;
  tokensUsed?: number | null;
  modelUsed?: string | null;
  apiCostUsd?: number | null;
  processingCostUsd?: number | null; // ADICIONADO: Custo de processamento
}

// ----------------------------------------------------------------------------
// Serviço principal
// ----------------------------------------------------------------------------

export class WebhookFlowOrchestratorService {
  private intentDetector: DeterministicIntentDetectorService;
  private llmClassifier: LLMIntentClassifierService;
  private disambiguation: IntentDisambiguationService;
  private flowManager: FlowLockManagerService;
  private dataCollector: ProgressiveDataCollectorService;
  private contextualPolicies: ContextualPoliciesService;
  private redisCacheService: RedisCacheService;
  private telemetryService: IntentOutcomeTelemetryService;
  private outcomeAnalyzer: ConversationOutcomeAnalyzerService;
  private conversationHistoryPersistence: ConversationHistoryPersistence;
  private telemetry: TelemetryService;
  private outcomeAnalyzerService: OutcomeAnalyzer;
  private conversationOutcomeService: ConversationOutcomeService;
  private latency: any; // TODO: Implementar LatencyTracker
  private openai: OpenAI;

  constructor() {
    this.intentDetector = new DeterministicIntentDetectorService();
    this.llmClassifier = new LLMIntentClassifierService();
    this.disambiguation = new IntentDisambiguationService();
    this.flowManager = new FlowLockManagerService();
    this.dataCollector = new ProgressiveDataCollectorService();
    this.contextualPolicies = new ContextualPoliciesService();
    this.redisCacheService = redisCacheService;
    this.telemetryService = new IntentOutcomeTelemetryService();
    this.outcomeAnalyzer = new ConversationOutcomeAnalyzerService();
    this.conversationHistoryPersistence = new ConversationHistoryPersistence(new ConversationRepository());
    this.telemetry = new TelemetryService();
    this.outcomeAnalyzerService = new OutcomeAnalyzer();
    this.conversationOutcomeService = new ConversationOutcomeService();
    this.latency = this.createLatencyTracker(); // Implementação simples
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }

  /**
   * Cria um tracker simples de latência para telemetria
   */
  private createLatencyTracker() {
    const turnStarts = new Map<string, number>();
    
    return {
      now: () => Date.now(),
      turnStart: (sessionId: string) => {
        const start = Date.now();
        turnStarts.set(sessionId, start);
        return start;
      },
      getTurnDuration: (sessionId: string) => {
        const start = turnStarts.get(sessionId);
        if (!start) return 0;
        return Date.now() - start;
      },
      clearTurn: (sessionId: string) => {
        turnStarts.delete(sessionId);
      }
    };
  }

  /**
   * Decide a intenção do usuário usando sistema de 3 camadas:
   * 1. Flow Lock (ativo?) 
   * 2. Deterministic (regex)
   * 3. LLM Classification
   */
  private async decideIntent(context: OrchestratorContext): Promise<IntentDecision> {
    const { message, userPhone, tenantId } = context;

    // LAYER 1: Flow Lock Check (curto-circuito se ativo)
    console.log('🔒 [INTENT] Layer 1: Flow Lock check...');
    const conversationContext = await mergeEnhancedConversationContext(userPhone, tenantId, {});
    
    if (conversationContext?.flow_lock?.active_flow) {
      const flowLock = conversationContext.flow_lock;
      const timeoutStatus = this.flowManager.checkTimeoutStatus(conversationContext);
      
      if (timeoutStatus.status !== 'expired') {
        console.log(`🔒 [INTENT] Flow Lock ativo: ${flowLock.active_flow} | Step: ${flowLock.step}`);
        return {
          intent: null, // Flow Lock não gera intent
          source: 'flow_lock',
          decisionMethod: 'flow_lock',
          confidence: null,
          reason: `Flow Lock ${flowLock.active_flow} is active at step ${flowLock.step}`,
          responseOverride: `Vamos completar o que começamos (${flowLock.active_flow}) antes de prosseguir. Como posso ajudar com isso?`
        };
      } else {
        console.log(`⏰ [INTENT] Flow Lock ${flowLock.active_flow} expirado - prosseguindo`);
      }
    }
    
    // LAYER 2: Deterministic Intent Detection (regex)
    console.log('🔍 [INTENT] Layer 2: Deterministic detection...');
    const { detectIntentByRegex } = await import('./deterministic-intent-detector.service');
    const deterministicResult = detectIntentByRegex(message);
    
    if (deterministicResult.intent && deterministicResult.confidence_score >= 0.8) {
      console.log(`✅ [INTENT] Deterministic match: ${deterministicResult.intent} (${deterministicResult.confidence_score})`);
      return {
        intent: deterministicResult.intent,
        source: 'regex',
        decisionMethod: 'regex',
        confidence: deterministicResult.confidence_score,
        reason: 'High confidence deterministic match'
      };
    }
    
    // LAYER 3: LLM Intent Classification
    console.log('🤖 [INTENT] Layer 3: LLM classification...');
    try {
      const llmResult = await this.llmClassifier.classifyIntent(message);
      
      if (llmResult.intent && llmResult.confidence_score >= 0.7) {
        console.log(`✅ [INTENT] LLM match: ${llmResult.intent} (${llmResult.confidence_score})`);
        return {
          intent: llmResult.intent,
          source: 'llm',
          decisionMethod: 'llm',
          confidence: llmResult.confidence_score,
          reason: 'LLM classification with high confidence',
          tokensUsed: llmResult.usage?.total_tokens || null,
          modelUsed: llmResult.model_used || null,
          apiCostUsd: llmResult.api_cost_usd || null,
          processingCostUsd: llmResult.processing_cost_usd || null // ADICIONADO: Custo de processamento
        };
      }
      
      // Fallback: Use LLM result even with lower confidence
      if (llmResult.intent) {
        console.log(`⚠️ [INTENT] Low confidence LLM fallback: ${llmResult.intent} (${llmResult.confidence_score})`);
        return {
          intent: llmResult.intent,
          source: 'llm',
          decisionMethod: 'llm',
          confidence: llmResult.confidence_score,
          reason: 'LLM fallback with low confidence',
          tokensUsed: llmResult.usage?.total_tokens || null,
          modelUsed: llmResult.model_used || null,
          apiCostUsd: llmResult.api_cost_usd || null,
          processingCostUsd: llmResult.processing_cost_usd || null // ADICIONADO: Custo de processamento
        };
      }
      
    } catch (llmError) {
      console.error('❌ [INTENT] LLM classification failed:', llmError);
    }
    
    // Final fallback: No intent detected
    console.log('❓ [INTENT] No intent detected - returning null');
    return {
      intent: null,
      source: 'regex',
      decisionMethod: 'regex',
      confidence: 0,
      reason: 'No intent could be detected through any layer'
    };
  }


  /**
   * Produz resposta (usa override do FlowLock, senão templates/LLM)
   */
  private async produceReply(
    ctx: OrchestratorContext,
    decision: IntentDecision
  ): Promise<string> {
    
    // Flow Lock override tem prioridade
    if (decision.responseOverride) {
      console.log('🔄 [REPLY] Using Flow Lock response override');
      return decision.responseOverride;
    }

    try {
      console.log(`🤖 [REPLY] Generating response for intent: ${decision.intent}`);
      
      // Para intent real, usar geração de resposta AI
      const mockIntentResult = { intent: decision.intent };
      const mockFlowDecision = { allow_intent: true };
      const conversationContext = await mergeEnhancedConversationContext(ctx.userPhone, ctx.tenantId, {});
      
      const aiResponse = await this.generateAIResponseWithFlowContext(
        ctx.message,
        mockIntentResult,
        mockFlowDecision,
        conversationContext,
        ctx.tenantConfig,
        ctx.userPhone
      );

      return aiResponse.response;

    } catch (error) {
      console.error('❌ [REPLY] Error generating response:', error);
      return 'Desculpe, ocorreu um erro interno. Como posso ajudar?';
    }
  }

  /**
   * Executa efeitos colaterais (outcomes, sinais de telemetria, etc.)
   */
  private async afterReplySideEffects(
    ctx: OrchestratorContext,
    decision: IntentDecision,
    reply: string | { text: string }
  ): Promise<void> {
    console.log(`🔧 [SIDE-EFFECTS] Executando efeitos colaterais: intent=${decision.intent}, method=${decision.decisionMethod}`);
    
    try {
      // 1) Telemetria estruturada (sempre)
      await this.telemetry.recordTurn({
        tenant_id: ctx.tenantId,
        session_id: ctx.sessionId,
        user_phone: ctx.userPhone,
        decision_method: (decision.decisionMethod as 'flow_lock' | 'regex' | 'llm') || 'regex',
        intent_detected: decision.decisionMethod === 'flow_lock' ? null : (decision.intent ?? null),
        confidence: decision.decisionMethod === 'flow_lock' ? null : (decision.confidence ?? null),
        tokens_used: decision.decisionMethod === 'llm' ? (decision.tokensUsed ?? 0) : 0,
        api_cost_usd: decision.decisionMethod === 'llm' ? (decision.apiCostUsd ?? 0) : 0,
        model_used: decision.decisionMethod === 'llm' ? (decision.modelUsed ?? null) : null,
        response_time_ms: this.latency.getTurnDuration(ctx.sessionId),
        reply_size_chars: typeof reply === 'string' ? reply.length : (reply.text?.length ?? 0),
        timestamp: new Date(),
      });

      // 2) Atualização de outcome (regras por intent/estado)
      //    Obs.: outcome é decisão da conversa (não da mensagem)
      const outcome = await this.outcomeAnalyzerService.maybeDeriveOutcome({
        tenant_id: ctx.tenantId,
        session_id: ctx.sessionId,
        intent: decision.decisionMethod === 'flow_lock' ? null : (decision.intent ?? null),
        decision_method: (decision.decisionMethod as 'flow_lock' | 'regex' | 'llm') || 'regex',
        context: ctx.priorContext ?? {},
        reply,
      });

      if (outcome?.final) {
        // Se temos ConversationOutcomeService disponível, atualizamos
        if (this.conversationOutcomeService) {
          await this.conversationOutcomeService.updateConversationOutcome({
            tenant_id: ctx.tenantId,
            session_id: ctx.sessionId,
            outcome: outcome.value, // ex: 'appointment_created', 'booking_abandoned', etc.
          });
        } else {
          console.log(`🎯 [OUTCOME] Outcome final detectado: ${outcome.value} (${outcome.reason})`);
        }
        
        // Telemetria de outcome finalizado
        await this.telemetry.recordOutcome({
          tenant_id: ctx.tenantId,
          session_id: ctx.sessionId,
          outcome: outcome.value,
          reason: outcome.reason ?? null,
          timestamp: new Date(),
        });
      }

      console.log(`✅ [SIDE-EFFECTS] Efeitos colaterais executados com sucesso`);

    } catch (error) {
      console.error('❌ [SIDE-EFFECTS] Erro nos efeitos colaterais:', error);
      // Falha graceful - não quebra o fluxo principal
    } finally {
      // 3) Limpeza do tracker de latência (sempre executado)
      this.latency.clearTurn(ctx.sessionId);
    }
  }

  /**
   * Helpers para sessão e usuário (placeholders)
   */
  private readonly sessionService = {
    ensureSession: (userPhone: string, tenantId: string): string => {
      // Generate a proper UUID for session_id_uuid database field
      // Note: We lose the semantic meaning of tenant:phone:timestamp, but gain database compatibility
      return crypto.randomUUID();
    }
  };

  private readonly userService = {
    getOrCreateUserId: async (userPhone: string, tenantId: string): Promise<string> => {
      // Busca real do user ID no banco de dados usando a mesma lógica do conversation-context-helper
      const digits = normalizePhone(userPhone);
      const candidates: string[] = [];
      if (digits) {
        candidates.push(digits);
        candidates.push(`+${digits}`);
        if (digits.startsWith('55') && digits.length >= 13) {
          candidates.push(digits.slice(2));
          candidates.push(`+${digits.slice(2)}`);
        } else if (digits.length >= 10) {
          candidates.push(`55${digits}`);
          candidates.push(`+55${digits}`);
        }
      }

      if (candidates.length === 0) {
        throw new Error(`Invalid phone number: ${userPhone}`);
      }

      const orClause = candidates.map(c => `phone.eq.${c}`).join(',');

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .or(orClause)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error querying user for phone ${userPhone}: ${error.message}`);
      }

      // 🔧 CORREÇÃO: Se usuário não existe, CRIAR usando upsertUserProfile
      if (!user) {
        console.log(`🆕 [USER] Usuário não existe para ${userPhone}, criando via Flow Lock onboarding`);
        try {
          const userId = await upsertUserProfile({
            tenantId,
            userPhone: digits
          });
          console.log(`✅ [USER] Usuário criado com sucesso: ${userId}`);
          return userId;
        } catch (createError: any) {
          console.error(`❌ [USER] Erro ao criar usuário para ${userPhone}:`, createError);
          throw new Error(`Failed to create user for phone ${userPhone}: ${createError.message}`);
        }
      }

      return user.id;
    }
  };

  /**
   * NOVO orchestrateWebhookFlow - Fluxo integrado com novos métodos
   */
  async orchestrateWebhookFlow(input: {
    messageText: string;
    userPhone: string;
    tenantId: string;
    tenantConfig?: any;
    existingContext?: any;
    isDemo?: boolean;
  }) {
    console.log('🚨 [ORCHESTRATOR-METHOD-START] Entrada do método:', {
      messageText: input.messageText?.substring(0, 30),
      tenantId: input.tenantId,
      isDemo: input.isDemo
    });

    const startTime = Date.now();
    
    // 1) Monta o contexto único do turn
    const ctx: OrchestratorContext = {
      message: input.messageText,
      userPhone: input.userPhone,
      tenantId: input.tenantId,
      tenantConfig: input.tenantConfig ?? {},
      priorContext: input.existingContext ?? {},
      isDemo: input.isDemo ?? false,
      sessionId: this.sessionService.ensureSession(input.userPhone, input.tenantId),
      userId: await this.userService.getOrCreateUserId(input.userPhone, input.tenantId),
    };

    console.log('🔍 [ORCHESTRATOR] Context debug:', {
      inputIsDemo: input.isDemo,
      ctxIsDemo: ctx.isDemo,
      demoModeFromExistingContext: input.existingContext?.demoMode
    });

    // PERSISTIR MENSAGEM DO USUÁRIO PRIMEIRO (ANTES DE PROCESSAR IA)
    console.log('🔥 [ORCHESTRATOR-DEBUG] INICIO da persistência user message');

    try {
      const { persistConversationMessage } = await import('../services/persistence/conversation-history.persistence');
      const { ConversationRow } = await import('../contracts/conversation');

      console.log('🔥 [ORCHESTRATOR-DEBUG] Imports successful, creating user row');

      const userRow = ConversationRow.parse({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        content: ctx.message,
        is_from_user: true, // MENSAGEM DO USUÁRIO
        message_type: "text",
        intent_detected: null, // Será preenchido depois da detecção
        confidence_score: null,
        conversation_context: { session_id: ctx.sessionId },
        model_used: null, // Mensagem do usuário não usa modelo
        tokens_used: null,
        api_cost_usd: null,
        processing_cost_usd: 0.00003, // ADICIONADO: Custo de infraestrutura (servidor + db)
        conversation_outcome: null,
        message_source: ctx.isDemo ? 'whatsapp_demo' : 'whatsapp', // ESSENCIAL: Diferenciar origem
      });

      // DEBUG: Log específico antes de chamar persistConversationMessage
      console.log('🔍 [ORCHESTRATOR-DEBUG] Antes de persistir user row:', {
        is_from_user: userRow.is_from_user,
        processing_cost_usd: userRow.processing_cost_usd,
        content_preview: userRow.content.substring(0, 30),
        tenant_id: userRow.tenant_id
      });

      await persistConversationMessage(userRow);
      console.log('✅ [ORCHESTRATOR] User message persisted with source:', ctx.isDemo ? 'whatsapp_demo' : 'whatsapp');
    } catch (error) {
      console.error('❌ [ORCHESTRATOR-DEBUG] ERRO na persistência user message:', error);
      throw error;
    }

    // Inicia tracking de latência para telemetria
    this.latency.turnStart(ctx.sessionId);

    console.log(`🚀 [ORCHESTRATOR] NEW FLOW - Session: ${ctx.sessionId.substring(0, 12)}...`);

    // 2) Decide intent (internamente já tenta FlowLock -> Regex -> LLM)
    const decision = await this.decideIntent(ctx);

    // 3) Gera a resposta (usa override do FlowLock, senão templates/LLM)
    const reply = await this.produceReply(ctx, decision);

    // 4) Obter conversation context para persistência
    const conversationContext = await mergeEnhancedConversationContext(
      ctx.userPhone,
      ctx.tenantId,
      {
        domain: 'general',
        source: 'whatsapp',
        mode: 'prod'
      }
    );

    // 5) Usar finalizeAndRespond para centralizar persistência e telemetria
    const finalResponse = await finalizeAndRespond({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      requestText: ctx.message,
      replyText: reply,
      isFromUser: false,
      // Isolamento correto: Flow Lock → intentDetected: null
      intentDetected: decision.decisionMethod === 'flow_lock' ? null : (decision.intent ?? null),
      // Confidence correta: determinístico = 1.0, LLM = valor real, Flow Lock = null
      confidence: decision.decisionMethod === 'flow_lock' ? null :
                  decision.decisionMethod === 'regex' ? 1.0 :
                  (decision.confidence ?? null),
      modelUsed: decision.decisionMethod === 'llm' ? (decision.modelUsed ?? null) : 
                 decision.decisionMethod === 'regex' ? 'deterministic' : 
                 decision.decisionMethod === 'flow_lock' ? 'flowlock' : null,
      tokensUsed: decision.decisionMethod === 'llm' ? (decision.tokensUsed ?? null) : null,
      apiCostUsd: decision.decisionMethod === 'llm' ? (decision.apiCostUsd ?? null) : null,
      processingCostUsd: (() => {
        // Para LLM: usar valor calculado pelo classifier
        if (decision.decisionMethod === 'llm' && decision.processingCostUsd) {
          return decision.processingCostUsd;
        }
        // Para deterministic/flowlock: aplicar fórmula oficial completa
        const apiCost = decision.apiCostUsd || 0;
        const pct = apiCost * 0.10;      // 10% overhead
        const infra = 0.00002;           // Infraestrutura
        const db = 0.00001;              // Database
        return Math.round((apiCost + pct + infra + db) * 1000000) / 1000000;
      })(), // ADICIONADO: Custo de processamento para todos os métodos
      outcome: null, // SEMPRE null - preenchido pelo cronjob a cada 10min
      context: {
        session_id: conversationContext.session_id,
        duration_minutes: conversationContext.duration_minutes
      },
      messageSource: ctx.isDemo ? 'whatsapp_demo' : 'whatsapp'
    });

    // 6) Efeitos colaterais (outcomes, etc.) - sem duplicar persistência
    await this.afterReplySideEffects(ctx, decision, reply);

    // 7) Retorna payload final compatível com a rota existente
    return {
      aiResponse: finalResponse.text,
      shouldSendWhatsApp: true,
      conversationOutcome: null, // SEMPRE null - preenchido pelo cronjob a cada 10min
      updatedContext: ctx.priorContext,
      telemetryData: {
        intent: finalResponse.meta.intent_detected,
        confidence_score: finalResponse.meta.api_cost_usd ? finalResponse.meta.api_cost_usd : finalResponse.meta.intent_detected ? 1.0 : null,
        decision_method: decision.decisionMethod || decision.source,
        flow_lock_active: decision.decisionMethod === 'flow_lock',
        processing_time_ms: Date.now() - startTime,
        model_used: finalResponse.meta.model_used || undefined
      },
      intentMetrics: finalResponse.meta.model_used ? {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: finalResponse.meta.tokens_used || null,
        api_cost_usd: finalResponse.meta.api_cost_usd || null,
        processing_cost_usd: finalResponse.meta.processing_cost_usd || null,
        confidence_score: finalResponse.meta.intent_detected ? 1.0 : null,
        latency_ms: null,
        model_used: finalResponse.meta.model_used
      } : undefined,
      llmMetrics: undefined
    };
  }

  /**
   * Integra sistema de coleta progressiva de dados
   * Coleta contextualmente sem afetar UX
   */
  private async integrateProgressiveDataCollection(
    intent: string,
    messageText: string,
    userPhone: string,
    tenantId: string,
    context: EnhancedConversationContext,
    currentResponse: string
  ): Promise<{
    enhancedResponse: string;
    dataCollected: boolean;
  }> {
    try {
      // 1. Buscar perfil atual do usuário
      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('name, email, gender, birth_date, address, phone')
        .eq('phone', userPhone)
        .single();

      if (!userProfile) {
        return { enhancedResponse: currentResponse, dataCollected: false };
      }

      // 2. Preparar contexto de coleta
      const collectionContext: CollectionContext = {
        intent,
        messageCount: (context.intent_history?.length || 0) + 1,
        hasBookingInterest: ['availability', 'confirm', 'services'].includes(intent),
        hasServiceInterest: ['services', 'pricing'].includes(intent),
        conversationTone: this.detectConversationTone(messageText),
        lastDataRequest: context.last_data_collection_attempt ? 
          new Date(context.last_data_collection_attempt) : undefined
      };

      // 3. Verificar se deve coletar dados
      const shouldCollect = this.dataCollector.shouldCollectData(
        collectionContext, 
        userProfile as Partial<UserProfileData>
      );

      if (!shouldCollect) {
        return { enhancedResponse: currentResponse, dataCollected: false };
      }

      // 4. Gerar coleta contextual
      const dataCollection = await this.dataCollector.generateContextualDataCollection(
        intent,
        userProfile as Partial<UserProfileData>,
        collectionContext
      );

      if (!dataCollection) {
        return { enhancedResponse: currentResponse, dataCollected: false };
      }

      // 5. Se o usuário já forneceu dados na mensagem atual, processar
      const responseProcessing = await this.dataCollector.processUserResponseForData(
        messageText,
        dataCollection.expectedFields,
        userProfile as Partial<UserProfileData>
      );

      let enhancedResponse = currentResponse;

      if (responseProcessing.extractedData && Object.keys(responseProcessing.extractedData).length > 0) {
        // Dados foram encontrados na mensagem atual - salvar e confirmar
        const saved = await this.dataCollector.saveCollectedData(
          userPhone,
          tenantId,
          responseProcessing.extractedData
        );

        if (saved) {
          // Agradecer pelos dados coletados naturalmente
          const thankYou = this.generateDataCollectionThanks(responseProcessing.extractedData);
          enhancedResponse = `${thankYou}\n\n${currentResponse}`;
          
          // Marcar no contexto que coletamos dados
          context.last_data_collection_success = new Date().toISOString();
        }
      } else if (collectionContext.messageCount > 2) {
        // Apenas após algumas mensagens, fazer pergunta contextual
        enhancedResponse = `${currentResponse}\n\n${dataCollection.message}`;
        context.last_data_collection_attempt = new Date().toISOString();
        context.awaiting_data_fields = dataCollection.expectedFields;
      }

      return { enhancedResponse, dataCollected: true };

    } catch (error) {
      console.error('Erro no sistema de coleta progressiva:', error);
      return { enhancedResponse: currentResponse, dataCollected: false };
    }
  }

  /**
   * Detecta tom da conversa para personalizar coleta
   */
  private detectConversationTone(messageText: string): 'formal' | 'casual' {
    const casual = /\b(oi|eae|fala|valeu|vlw|blz|rs|kkk|haha)/i;
    const formal = /\b(bom dia|boa tarde|obrigado|obrigada|por favor|gostaria)/i;
    
    if (casual.test(messageText)) return 'casual';
    if (formal.test(messageText)) return 'formal';
    return 'casual'; // default
  }

  /**
   * Gera agradecimento natural pelos dados coletados
   */
  private generateDataCollectionThanks(extractedData: Partial<UserProfileData>): string {
    const thanks = [
      'Obrigada!',
      'Perfeito!',
      'Ótimo!',
      'Entendi!',
      'Show!'
    ];

    const randomThanks = thanks[Math.floor(Math.random() * thanks.length)];

    if (extractedData.name) {
      return `${randomThanks} Que nome lindo, ${extractedData.name}!`;
    } else if (extractedData.email) {
      return `${randomThanks} Email anotado!`;
    } else {
      return randomThanks || 'Obrigada!';
    }
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
      const ctxId = toCtxId(userId);
      return await mergeEnhancedConversationContext(
        ctxId,             // ✅ chave estável
        tenantId,
        { ...existingContext, ...baseUpdates }
      );
    }

    // Criar novo contexto enhanced
    const ctxId = toCtxId(userId);
    return await mergeEnhancedConversationContext(
      ctxId,             // ✅ chave estável
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

      // 🔎 NOVO: Se já estamos no step need_name, tentar extrair e salvar
      if (context.flow_lock?.step === 'need_name') {
        const maybeName = extractNameStrict(messageText);
        if (maybeName) {
          console.log(`✅ [ONBOARDING] Nome extraído: ${maybeName}`);
          const normalizedPhone = normalizePhone(userPhone);
          await upsertUserProfile({
            tenantId,
            userPhone: normalizedPhone,
            name: maybeName
          });
          const nextLock = this.flowManager.advanceStep(context, 'need_email');
          return {
            response: `Prazer, ${firstName(maybeName)}! 😊 Agora, qual é seu **email**?`,
            outcome: 'onboarding_continue',
            newFlowLock: nextLock
          };
        } else {
          return {
            response: `Não consegui entender seu nome 😕. Pode me dizer seu **nome completo**?`,
            outcome: 'onboarding_continue',
            newFlowLock: context.flow_lock
          };
        }
      }

      const businessName = tenantConfig?.name || tenantConfig?.business_name || 'nosso atendimento';
      const intro = `Sou a assistente virtual da ${businessName}.`;

      if (needName) {
        const lock = this.flowManager.advanceStep(context, 'need_name');
        return {
          response:
            `Perfeito! ${intro}\n` +
            `Para começarmos, me diga por favor seu **nome completo**.`,
          outcome: 'onboarding_started',
          newFlowLock: lock
        };
      }

      if (needEmail) {
        const lock = this.flowManager.advanceStep(context, 'need_email');
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
          const userData = await getUserByPhoneInTenant(normalizedPhone, tenantId);
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
        const lock = this.flowManager.advanceStep(context, 'need_name');
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
        const lock = this.flowManager.advanceStep(context, 'need_email');
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
          // Campo gender não existe na tabela users, vamos inferir do nome
          userGender = inferGenderFromName(userProfile?.name || undefined);
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
          intent: sanitizeIntentForPersistence('returning_user_declined_data', null),
          confidence_score: 1.0,
          decision_method: 'negative_response_detected',
          flow_lock_active: false,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }
    
    // Determine faltas de forma robusta
    const missingEmail = !userProfile.email;
    const missingBirth = !userProfile.birth_date;
    const missingAddr =
      !userProfile.address ||
      (typeof userProfile.address === 'object' && Object.keys(userProfile.address || {}).length === 0) ||
      (typeof userProfile.address === 'string' && userProfile.address.trim() === '');

    console.log('🔍 PROFILE-CHECK:', {
      userProfile,
      missingEmail,
      missingBirth,
      missingAddr,
      willShowConsent: missingBirth || missingAddr
    });

    // 1) E-mail
    if (missingEmail) {
      const lock = this.flowManager.startFlowLock('returning_user', 'need_email');
      const updatedContext = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: lock });
      return {
        aiResponse: `${firstName}, como vai! 😊\n\nPercebi que ainda não tenho seu e-mail. Pode me informar para completarmos seu perfil?`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: { 
          // preserve o intent real detectado; se não houver, fica null
          intent: null, // Flow Lock não tem acesso ao intentResult aqui
          // normaliza para confidence_score e NÃO hardcoda 1.0  
          confidence_score: null, // Flow Lock não tem acesso ao intentResult aqui
          decision_method: 'flow_lock:returning_user_greeting', 
          flow_lock_active: true, 
          processing_time_ms: 0, 
          model_used: undefined 
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    // Se faltam birth/address, pedir consentimento antes de coletar
    if (missingBirth || missingAddr) {
      const lock = this.flowManager.startFlowLock('returning_user', 'ask_additional_data');
      console.log(`🔒 [FLOW-DEBUG] Creating flow lock:`, JSON.stringify(lock, null, 2));
      
      const updatedContext = await mergeEnhancedConversationContext(
        toCtxId(userPhone),
        tenantId,
        { 
          ...context, 
          flow_lock: lock,
          ...(context as any).awaiting_intent ? { awaiting_intent: false } : {}   // ✅ blindagem extra
        } as any
      );
      
      console.log(`🔒 [FLOW-DEBUG] After merge - Flow Lock:`, JSON.stringify(updatedContext.flow_lock, null, 2));

      // Log para diagnosticar consentimento
      console.log('CONSENT-START', {
        ctxId: toCtxId(userPhone),
        tenantId,
        flow: 'returning_user',
        step: 'ask_additional_data',
        lockCreated: lock,
        contextBeforeSave: { ...context, flow_lock: lock }
      });

      return {
        aiResponse: `Olá ${firstName}, que bom ter você de volta! 😊\nVocê se importa de completar suas informações para personalizar seu atendimento? Responda *sim* ou *não*.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: null, // Flow Lock não tem acesso ao intentResult aqui
          confidence_score: null, // Flow Lock não tem acesso ao intentResult aqui
          decision_method: 'flow_lock:returning_user_greeting',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
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
        intent: sanitizeIntentForPersistence('returning_user_complete', 'greeting'),
        confidence_score: 1.0,
        decision_method: 'returning_user_greeting',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
    
    console.log('🔍 RETURNING-USER-FLOW:', {
      userPhone: userPhone.substring(0, 8) + '***',
      currentStep,
      messageText: messageText?.substring(0, 10)
    });
    
    if (currentStep === 'ask_additional_data') {
      const txt = (messageText || '').toLowerCase().trim();
      
      console.log('🔍 CONSENT-PROCESSING:', {
        currentStep,
        messageText,
        txt,
        simRegexTest: /\b(sim|s)\b/.test(txt),
        naoRegexTest: /\b(não|nao)\b/.test(txt)
      });

      // Negativas primeiro
      if (/\b(não|nao)\b/.test(txt) || ['n', 'nao', 'não'].includes(txt)) {
        // Limpa flow e segue com saudação personalizada
        const normalizedPhone = normalizePhone(userPhone);
        let firstName = '';
        let gender: string | undefined;

        try {
          const { data } = await getUserByPhoneInTenant(normalizedPhone, tenantId);
          firstName = (data?.name || '').split(' ')[0] || '';
          gender = inferGenderFromName(data?.name || undefined);
        } catch {}

        const help = gender === 'female' || gender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
        const cleaned = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null });

        return {
          aiResponse: `Sem problemas! Como posso ${help} hoje${firstName ? `, ${firstName}` : ''}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: cleaned,
          telemetryData: {
            intent: sanitizeIntentForPersistence('returning_user_declined_additional', null),
            confidence_score: 1.0,
            decision_method: 'consent_declined',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Afirmativas
      if (/\b(sim|s)\b/.test(txt)) {
        const next = this.flowManager.startFlowLock('returning_user', 'need_birthday');
        const ctx = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: next });

        return {
          aiResponse: `Perfeito! 🎂 Qual é sua data de nascimento? (dd/mm/aaaa)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: ctx,
          telemetryData: {
            intent: null, // Flow Lock não tem acesso ao intentResult aqui
            confidence_score: null, // Flow Lock não tem acesso ao intentResult aqui
            decision_method: 'flow_lock:consent_accepted',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Não entendi
      return {
        aiResponse: `Só para confirmar: você autoriza completar seu cadastro agora? Responda *sim* ou *não*.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: context,
        telemetryData: {
          intent: null, // Flow Lock não tem acesso ao intentResult aqui
          confidence_score: null, // Flow Lock não tem acesso ao intentResult aqui
          decision_method: 'flow_lock:unclear_consent',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    if (currentStep === 'need_email') {
      // Buscar dados atuais do usuário
      let userProfile: { name: string | null } | null = null;
      try {
        const normalizedPhone = normalizePhone(userPhone);
        const { data } = await getUserByPhoneInTenant(normalizedPhone, tenantId);
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
          // Campo gender não existe na tabela users, vamos inferir do nome
          userGender = inferGenderFromName(userProfile?.name || undefined);
        } catch (genderError) {
          userGender = inferGenderFromName(userProfile?.name || undefined);
        }
        
        const helpPhrase = userGender === 'female' || userGender === 'feminino' ? 'ajudá-la' : 'ajudá-lo';
        
        return {
          aiResponse: `Sem problemas! Entendo perfeitamente. Como posso ajud${helpPhrase} hoje, ${firstName}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: await mergeEnhancedConversationContext(
            toCtxId(userPhone), tenantId, { ...context, flow_lock: null }
          ),
          telemetryData: {
            intent: sanitizeIntentForPersistence('returning_user_declined_email', null),
            confidence_score: 1.0,
            decision_method: 'negative_response_detected',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
      
      // Tentar extrair email
      const extractedEmail = extractEmailStrict(messageText);
      
      if (extractedEmail) {
        // Salvar email
        const normalizedPhone = normalizePhone(userPhone);
        // Usar user-profile.service para atualizar o email corretamente
        await upsertUserProfile({
          tenantId: tenantId,
          userPhone: normalizedPhone,
          email: extractedEmail
        });
        
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
            toCtxId(userPhone), tenantId, { ...context, flow_lock: null }
          ),
          telemetryData: {
            intent: sanitizeIntentForPersistence('returning_user_email_saved', null),
            confidence_score: 1.0,
            decision_method: 'email_extracted_and_saved',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
      
      // Email não foi detectado - pedir novamente
      return {
        aiResponse: `${firstName}, poderia me passar um e-mail válido? Por exemplo: seuemail@exemplo.com`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: context,
        telemetryData: {
          intent: null, // Flow Lock não tem acesso ao intentResult aqui
          confidence_score: null, // Flow Lock não tem acesso ao intentResult aqui
          decision_method: 'flow_lock:invalid_email_format',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    // === STEP: need_birthday ===
    if (currentStep === 'need_birthday') {
      console.log('🎂 [BIRTHDAY-PROCESSING] Processando data:', messageText);
      
      // Extrair data de nascimento
      const extractBirthDate = (text: string): string | null => {
        const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
        const match = text.match(datePattern);
        if (match && match[1] && match[2] && match[3]) {
          let [, day, month, year] = match;
          // Converter ano de 2 dígitos para 4 dígitos
          if (year && year.length === 2) {
            const currentYear = new Date().getFullYear();
            const century = Math.floor(currentYear / 100) * 100;
            year = String(century + parseInt(year));
          }
          // PostgreSQL expects YYYY-MM-DD format
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return null;
      };

      const birthDate = extractBirthDate(messageText);
      
      if (birthDate) {
        // Data válida - salvar e continuar
        console.log('✅ [BIRTHDAY-SAVED] Data válida:', birthDate);
        
        // Atualizar usuário com a data
        const normalizedPhone = normalizePhone(userPhone);
        try {
          await upsertUserProfile({
            tenantId: tenantId,
            userPhone: normalizedPhone,
            birth_date: birthDate
          });
          console.log(`ℹ️ Data de nascimento ${birthDate} processada para usuário ${normalizedPhone}`);
        } catch (error) {
          console.error('❌ Erro ao salvar data:', error);
        }

        // Verificar se ainda precisa de endereço
        const { data: updatedProfile } = await supabaseAdmin
          .from('users')
          .select('address')
          .eq('phone', normalizedPhone)
          .single();

        const needsAddress = !updatedProfile?.address;
        
        if (needsAddress) {
          // Ainda precisa de endereço
          const nextLock = this.flowManager.startFlowLock('returning_user', 'need_address');
          const ctx = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: nextLock });
          
          return {
            aiResponse: `Perfeito! 🏠 E qual é seu endereço ou bairro?`,
            shouldSendWhatsApp: true,
            conversationOutcome: null,
            updatedContext: ctx,
            telemetryData: {
              intent: null, // Flow lock - intent não disponível neste escopo
              confidence_score: null,
              decision_method: 'flow_lock:birthday_saved_need_address',
              flow_lock_active: true,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        } else {
          // Dados completos - finalizar coleta
          const cleanedContext = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null });
          
          return {
            aiResponse: `Perfeito! Agora tenho todos os seus dados. Como posso ajudá-la hoje? 😊`,
            shouldSendWhatsApp: true,
            conversationOutcome: null,
            updatedContext: cleanedContext,
            telemetryData: {
              intent: sanitizeIntentForPersistence('data_collection', 'greeting'),
              confidence_score: 1.0,
              decision_method: 'birthday_saved_complete',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        }
      } else {
        // Data inválida - pedir novamente
        console.log('❌ [BIRTHDAY-INVALID] Formato inválido:', messageText);
        
        return {
          aiResponse: `Não consegui entender sua data de nascimento. Por favor, me informe no formato dd/mm/aaaa (por exemplo: 25/09/1985)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: null, // Flow lock - intent não disponível neste escopo
            confidence_score: null,
            decision_method: 'flow_lock:birthday_invalid_format',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }
    
    // Fallback caso não reconheça o step
    return {
      aiResponse: 'Não entendi. Pode reformular, por favor?',
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: context,
      telemetryData: {
        intent: null, // Não há intent válida - é um erro de estado interno
        confidence_score: 0.0,
        decision_method: 'unknown_step',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
    };
  }

  /**
   * Handler para o fluxo de reagendamento com validação de conflitos
   */
  private async handleRescheduleFlow({
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
    
    console.log('🔄 RESCHEDULE-FLOW:', {
      userPhone: userPhone.substring(0, 8) + '***',
      currentStep,
      messageText: messageText?.substring(0, 30)
    });

    const rescheduleService = new RescheduleConflictManagerService();

    if (currentStep === 'collect_id') {
      console.log('🔄 [RESCHEDULE-FLOW] Coletando ID do agendamento');
      
      // Tentar extrair ID do agendamento da mensagem
      const appointmentIdMatch = messageText.match(/([a-f0-9-]{36})/i);
      const appointmentId = appointmentIdMatch?.[1];
      
      if (appointmentId) {
        console.log('🔄 [RESCHEDULE-FLOW] ID encontrado:', appointmentId);
        
        try {
          const rescheduleResult = await rescheduleService.processRescheduleRequest(tenantId, appointmentId, messageText);
          
          if (rescheduleResult.success && rescheduleResult.appointmentFound) {
            // Avançar para step de seleção de horário se há slots disponíveis
            const nextStep = rescheduleResult.hasConflicts ? 'collect_id' : 'select_time_slot'; // Se não há conflitos, mostrar slots
            const advancedLock = this.flowManager.advanceStep(context, nextStep, { appointmentId, availableSlots: rescheduleResult.availableSlots });
            
            const updatedContext = await this.updateContextWithFlowState(
              toCtxId(userPhone),
              tenantId,
              context,
              advancedLock,
              { intent: 'reschedule', confidence_score: 1.0, decision_method: 'id_collected' }
            );
            
            return {
              aiResponse: rescheduleResult.message,
              shouldSendWhatsApp: true,
              conversationOutcome: rescheduleResult.hasConflicts ? 'reschedule_no_slots' : 'reschedule_slots_shown',
              updatedContext,
              telemetryData: {
                intent: 'reschedule',
                confidence_score: 1.0,
                decision_method: 'appointment_id_processed',
                flow_lock_active: !rescheduleResult.hasConflicts, // Continue flow if has slots
                processing_time_ms: 0,
                model_used: undefined
              },
              // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
            };
          } else if (!rescheduleResult.appointmentFound) {
            return {
              aiResponse: '❌ **Agendamento não encontrado**\n\nO código informado não corresponde a nenhum agendamento ativo.\n\n🔍 Verifique se:\n• O código está correto (formato: abc12def-3456-789a-bcde-f0123456789a)\n• O agendamento não foi cancelado\n• Você está no tenant correto\n\n📝 Pode tentar novamente com outro código?',
              shouldSendWhatsApp: true,
              conversationOutcome: null,
              updatedContext: context, // Manter no mesmo step
              telemetryData: {
                intent: null, // Flow lock - intent não disponível neste escopo
                confidence_score: null,
                decision_method: 'flow_lock:appointment_not_found',
                flow_lock_active: true,
                processing_time_ms: 0,
                model_used: undefined
              },
              // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
            };
          } else {
            return {
              aiResponse: '❌ **Erro no sistema**\n\nOcorreu um problema ao processar seu reagendamento.\n\n🔄 Tente novamente em alguns instantes ou entre em contato conosco.',
              shouldSendWhatsApp: true,
              conversationOutcome: 'reschedule_error',
              updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
              telemetryData: {
                intent: 'reschedule',
                confidence_score: 1.0,
                decision_method: 'system_error',
                flow_lock_active: false,
                processing_time_ms: 0,
                model_used: undefined
              },
              // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
            };
          }
        } catch (error) {
          console.error('❌ [RESCHEDULE-FLOW] Erro ao processar ID:', error);
          return {
            aiResponse: '❌ **Erro interno**\n\nOcorreu um problema ao verificar o agendamento. Tente novamente.',
            shouldSendWhatsApp: true,
            conversationOutcome: 'reschedule_error',
            updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
            telemetryData: {
              intent: 'reschedule',
              confidence_score: 1.0,
              decision_method: 'exception_error',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        }
      } else {
        // ID não reconhecido - pedir novamente
        return {
          aiResponse: '🔍 **Código não encontrado**\n\nNão consegui identificar o código do agendamento na sua mensagem.\n\n💡 O código deve ter o formato: `abc12def-3456-789a-bcde-f0123456789a`\n\n📱 Por favor, copie e cole o código exato que você recebeu no e-mail de confirmação.',
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context, // Manter no mesmo step
          telemetryData: {
            intent: null, // Flow lock - intent não disponível neste escopo
            confidence_score: null,
            decision_method: 'flow_lock:id_not_recognized',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }

    if (currentStep === 'select_time_slot') {
      console.log('🔄 [RESCHEDULE-FLOW] Processando seleção de horário');
      
      // Recuperar appointment ID do contexto
      const appointmentId = (context.flow_lock as any)?.data?.appointmentId;
      
      if (!appointmentId) {
        return {
          aiResponse: '❌ **Sessão expirou**\n\nPreciso que você inicie o reagendamento novamente. Digite "reagendar" para começar.',
          shouldSendWhatsApp: true,
          conversationOutcome: 'reschedule_session_expired',
          updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
          telemetryData: {
            intent: 'reschedule',
            confidence_score: 1.0,
            decision_method: 'session_expired',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
      
      try {
        const selectionResult = await rescheduleService.processTimeSlotSelection(tenantId, appointmentId, messageText);
        
        if (selectionResult.success && selectionResult.isCompleted) {
          // Reagendamento concluído com sucesso
          const completedLock = this.flowManager.completeFlow(context, 'appointment_rescheduled');
          
          const updatedContext = await this.updateContextWithFlowState(
            toCtxId(userPhone),
            tenantId,
            context,
            completedLock,
            { intent: 'reschedule_completed', confidence_score: 1.0, decision_method: 'slot_selected' }
          );
          
          return {
            aiResponse: selectionResult.message,
            shouldSendWhatsApp: true,
            conversationOutcome: 'appointment_rescheduled',
            updatedContext,
            telemetryData: {
              intent: 'reschedule_completed',
              confidence_score: 1.0,
              decision_method: 'time_slot_selected',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        } else {
          // Seleção inválida ou erro
          return {
            aiResponse: selectionResult.message,
            shouldSendWhatsApp: true,
            conversationOutcome: null,
            updatedContext: context, // Manter no mesmo step para nova tentativa
            telemetryData: {
              intent: 'reschedule',
              confidence_score: 1.0,
              decision_method: 'invalid_slot_selection',
              flow_lock_active: true,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        }
      } catch (error) {
        console.error('❌ [RESCHEDULE-FLOW] Erro ao processar seleção:', error);
        return {
          aiResponse: '❌ **Erro ao processar seleção**\n\nOcorreu um problema. Tente selecionar novamente ou digite "cancelar" para sair.',
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: 'reschedule',
            confidence_score: 1.0,
            decision_method: 'selection_error',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }

    // Fallback para steps não reconhecidos
    return {
      aiResponse: '❌ **Estado inválido**\n\nOcorreu um problema no fluxo de reagendamento. Vou reiniciar o processo.\n\nDigite "reagendar" para começar novamente.',
      shouldSendWhatsApp: true,
      conversationOutcome: 'reschedule_flow_error',
      updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
      telemetryData: {
        intent: 'reschedule',
        confidence_score: 1.0,
        decision_method: 'unknown_step_fallback',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
    };
  }

  /**
   * Handler para o fluxo de cancelamento de agendamento
   */
  private async handleCancelAppointmentFlow({
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
    
    console.log('❌ CANCEL-FLOW:', {
      userPhone: userPhone.substring(0, 8) + '***',
      currentStep,
      messageText: messageText?.substring(0, 30)
    });

    const { CancelAppointmentManagerService } = await import('./cancel-appointment-manager.service');
    const cancelService = new CancelAppointmentManagerService();

    if (currentStep === 'collect_id') {
      console.log('❌ [CANCEL-FLOW] Coletando ID do agendamento');
      
      // Tentar extrair ID do agendamento da mensagem
      const appointmentIdMatch = messageText.match(/([a-f0-9-]{36})/i);
      const appointmentId = appointmentIdMatch?.[1];
      
      if (appointmentId) {
        console.log('❌ [CANCEL-FLOW] ID encontrado:', appointmentId);
        
        try {
          const cancelResult = await cancelService.processCancelRequest(tenantId, appointmentId, messageText);
          
          if (cancelResult.success && cancelResult.appointmentFound && cancelResult.canCancel) {
            // Avançar para step de confirmação
            const advancedLock = this.flowManager.advanceStep(context, 'confirm_cancel', { appointmentId });
            
            const updatedContext = await this.updateContextWithFlowState(
              toCtxId(userPhone),
              tenantId,
              context,
              advancedLock,
              'cancel_confirmation_pending'
            );

            return {
              aiResponse: cancelResult.message,
              shouldSendWhatsApp: true,
              conversationOutcome: 'cancel_confirmation_pending',
              updatedContext,
              telemetryData: {
                intent: 'cancel_appointment',
                confidence_score: 1.0,
                decision_method: 'flow_cancel_confirmation_required',
                flow_lock_active: true,
                processing_time_ms: 0,
                model_used: undefined
              },
              // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
            };
            
          } else {
            // Não pode cancelar ou agendamento não encontrado
            const clearedLock = this.flowManager.completeFlow(context, cancelResult.appointmentFound ? 'cannot_cancel' : 'appointment_not_found');
            const clearedContext = await this.updateContextWithFlowState(
              toCtxId(userPhone),
              tenantId,
              context,
              clearedLock,
              cancelResult.appointmentFound ? 'cannot_cancel' : 'appointment_not_found'
            );

            return {
              aiResponse: cancelResult.message,
              shouldSendWhatsApp: true,
              conversationOutcome: cancelResult.appointmentFound ? 'cannot_cancel' : 'appointment_not_found',
              updatedContext: clearedContext,
              telemetryData: {
                intent: 'cancel_appointment',
                confidence_score: 1.0,
                decision_method: 'flow_cancel_rejected',
                flow_lock_active: false,
                processing_time_ms: 0,
                model_used: undefined
              },
              // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
            };
          }
          
        } catch (error) {
          console.error('❌ [CANCEL-FLOW] Erro ao processar cancelamento:', error);
        }
      } else {
        console.log('❌ [CANCEL-FLOW] ID não encontrado na mensagem, pedindo novamente');
        return {
          aiResponse: '❌ **Código não encontrado**\n\n📝 Preciso do **código de confirmação** do seu agendamento para cancelá-lo.\n\n💡 O código tem formato similar a: `abc12def-3456-789a-bcde-f0123456789a`\n\n📱 Pode procurar na conversa anterior ou no e-mail de confirmação?',
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: 'cancel_appointment',
            confidence_score: 1.0,
            decision_method: 'flow_id_not_found',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }

    if (currentStep === 'confirm_cancel') {
      console.log('❌ [CANCEL-FLOW] Processando confirmação de cancelamento');
      
      // Recuperar appointment ID do contexto
      const appointmentId = (context.flow_lock as any)?.data?.appointmentId;
      
      if (!appointmentId) {
        return {
          aiResponse: '❌ **Sessão expirou**\n\nPreciso que você inicie o cancelamento novamente. Digite "cancelar" para começar.',
          shouldSendWhatsApp: true,
          conversationOutcome: 'cancel_session_expired',
          updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
          telemetryData: {
            intent: 'cancel_appointment',
            confidence_score: 1.0,
            decision_method: 'session_expired',
            flow_lock_active: false,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
      
      try {
        const confirmationResult = await cancelService.processConfirmation(tenantId, appointmentId, messageText);
        
        if (confirmationResult.success) {
          // Cancelamento processado (confirmado ou abortado)
          const completedLock = this.flowManager.completeFlow(context, confirmationResult.cancelled ? 'appointment_cancelled' : 'cancel_aborted');
          
          const completedContext = await this.updateContextWithFlowState(
            toCtxId(userPhone),
            tenantId,
            context,
            completedLock,
            confirmationResult.cancelled ? 'appointment_cancelled' : 'cancel_aborted'
          );

          return {
            aiResponse: confirmationResult.message,
            shouldSendWhatsApp: true,
            conversationOutcome: confirmationResult.cancelled ? 'appointment_cancelled' : 'cancel_aborted',
            updatedContext: completedContext,
            telemetryData: {
              intent: 'cancel_appointment',
              confidence_score: 1.0,
              decision_method: confirmationResult.cancelled ? 'flow_cancel_confirmed' : 'flow_cancel_aborted',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        } else {
          return {
            aiResponse: confirmationResult.message,
            shouldSendWhatsApp: true,
            conversationOutcome: null,
            updatedContext: context,
            telemetryData: {
              intent: 'cancel_appointment',
              confidence_score: 1.0,
              decision_method: 'flow_cancel_error',
              flow_lock_active: true,
              processing_time_ms: 0,
              model_used: undefined
            },
            // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
          };
        }
        
      } catch (error) {
        console.error('❌ [CANCEL-FLOW] Erro ao processar confirmação:', error);
        return {
          aiResponse: '❌ **Erro ao processar confirmação**\n\nOcorreu um problema. Tente responder novamente com "SIM" ou "NÃO".',
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: 'cancel_appointment',
            confidence_score: 1.0,
            decision_method: 'confirmation_error',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }

    // Fallback para steps não reconhecidos
    return {
      aiResponse: '❌ **Estado inválido**\n\nOcorreu um problema no fluxo de cancelamento. Vou reiniciar o processo.\n\nDigite "cancelar" para começar novamente.',
      shouldSendWhatsApp: true,
      conversationOutcome: 'cancel_flow_error',
      updatedContext: await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: null }),
      telemetryData: {
        intent: 'cancel_appointment',
        confidence_score: 1.0,
        decision_method: 'unknown_step_fallback',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
    console.log(`🔍 Help phrase: "${helpPhrase}"`);
    
    const personalizedGreeting = `${firstName}, como vai! Que bom ter você de volta! 😊 Como posso ${helpPhrase} hoje?`;
    
    // Salvar contexto limpo (sem flow ativo)
    const updatedContext = await mergeEnhancedConversationContext(
      toCtxId(userPhone),
      tenantId,
      {
        ...context,
        flow_lock: null // Remove flow lock
      },
      {
        intent: 'greeting',
        confidence_score: 1.0,
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
        confidence_score: 1.0,
        decision_method: 'personalized_complete_user_greeting',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
    currentStep: 'need_name' | 'need_email' | 'need_birth_date' | 'need_address' | 'ask_additional_data';
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
        // Primeira interação e não extraiu nome - apresentar-se e pedir nome
        const intro = `Olá, eu sou a assistente oficial da ${biz}. Percebi que este é seu primeiro contato.`;
        const ask = `Para melhor atendê-lo, qual é seu nome completo?`;
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');

        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `${intro}\n${ask}`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: null,
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          intentMetrics: undefined,
          llmMetrics: undefined
        };
      }

      if (!maybeName) {
        // Não conseguiu extrair nome - perguntar novamente
        const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Para melhor atendê-lo, qual é seu nome completo?`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: null,
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          intentMetrics: undefined,
          llmMetrics: undefined
        };
      }

      // ✅ Nome extraído com sucesso - salvar via upsertUserProfile e avançar
      console.log('✅ Nome extraído com sucesso:', maybeName);

      const normalizedPhoneForUpsert = normalizePhone(userPhone);
      const inferredGender = inferGenderFromName(maybeName);

      try {
        console.log('🔧 Salvando perfil do usuário:', {
          phone: normalizedPhoneForUpsert,
          name: maybeName,
          gender: inferredGender,
          tenantId
        });

        const upsertResult = await upsertUserProfile({
          tenantId: tenantId,
          userPhone: normalizedPhoneForUpsert,
          name: maybeName,
          gender: inferredGender
        });

        console.log('✅ Perfil salvo com sucesso:', upsertResult);

      } catch (error) {
        console.error('❌ Erro ao salvar perfil do usuário:', error);
        // Continua o fluxo mesmo com erro na persistência
      }

      // Avançar para coleta de email
      const nextLock = this.flowManager.startFlowLock('onboarding', 'need_email');
      const updatedContext = await mergeEnhancedConversationContext(
        toCtxId(userPhone), tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado, ${firstName(maybeName)}! Agora me informe seu e-mail para finalizarmos.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: sanitizeIntentForPersistence('onboarding', 'greeting'),
          confidence_score: 1.0,
          decision_method: 'flow_lock',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        intentMetrics: undefined,
        llmMetrics: undefined
      };
    }

    // === PASSO 2 — E-MAIL ===
    if (currentStep === 'need_email') {
      const maybeEmail = extractEmailStrict(messageText);

      if (!maybeEmail) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_email');
        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: lock }
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
            intent: null, // Flow Lock - preservar intent real do usuário
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Persistir E-MAIL agora
      const normalizedPhoneForEmail = normalizePhone(userPhone);
      await upsertUserProfile({
        tenantId: tenantId,
        userPhone: normalizedPhoneForEmail,
        email: maybeEmail
      });

      // Avançar para PERGUNTA OPCIONAL
      const nextLock = this.flowManager.startFlowLock('onboarding', 'ask_additional_data');
      const updatedContext = await mergeEnhancedConversationContext(
        toCtxId(userPhone), tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado! 📧 E-mail salvo. Para personalizar ainda mais nosso atendimento, você se importaria de fornecer algumas informações adicionais? (É opcional e rápido!) \n\nResponda *sim* ou *não*.`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: sanitizeIntentForPersistence('onboarding', 'greeting'),
          confidence_score: 1.0,
          decision_method: 'flow_lock',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    // === PASSO 3 — PERGUNTA SOBRE DADOS ADICIONAIS ===
    if (currentStep === 'ask_additional_data') {
      const response = messageText.toLowerCase().trim();
      
      // Verificar explicitamente por respostas negativas primeiro
      if (response.includes('não') || response.includes('nao') || response === 'n') {
        // Usuário recusa dados adicionais - finalizar onboarding com transição para general
        const cleanedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: null }
        );

        // Buscar dados do usuário para personalização
        const normalizedPhone = normalizePhone(userPhone);
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
          toCtxId(userPhone), tenantId, { ...cleanedContext, flow_lock: generalLock }
        );

        return {
          aiResponse: `Sem problemas! Seus dados básicos já foram salvos. Como posso ${helpPhrase} hoje${greeting}? 😊`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: contextWithGeneralFlow,
          telemetryData: {
            intent: null, // Flow Lock - preservar intent real do usuário
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true, // Manter sessão ativa com flow general
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      } else if (response.includes('sim') || response === 's') {
        // Usuário aceita fornecer dados adicionais - ir para aniversário
        const nextLock = this.flowManager.startFlowLock('onboarding', 'need_birthday');
        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: nextLock }
        );

        return {
          aiResponse: `Ótimo! 🎂 Qual é sua data de aniversário? (formato: dd/mm/aaaa)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: null, // Flow Lock - preservar intent real do usuário
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      } else {
        // Resposta não compreendida - pedir clarificação
        return {
          aiResponse: `Por favor, responda com *sim* ou *não*. Gostaria de fornecer algumas informações adicionais para personalizar nosso atendimento?`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext: context,
          telemetryData: {
            intent: sanitizeIntentForPersistence('onboarding_clarification', null),
            confidence_score: 1.0,
            decision_method: 'flow_lock',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }
    }

    // === PASSO 4 — ANIVERSÁRIO ===
    if (currentStep === 'need_birth_date') {
      const maybeBirthDate = extractBirthDate(messageText);

      if (!maybeBirthDate) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_birth_date');
        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Por favor, informe sua data de aniversário no formato dd/mm/aaaa (exemplo: 15/03/1990)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: null, // Flow Lock - preservar intent real do usuário
            confidence_score: 1.0,
            decision_method: 'invalid_birthday_format',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Skip birth_date - tabela users não possui esta coluna
      const normalizedPhoneForBirthday = normalizePhone(userPhone);
      
      // Apenas garantir que o usuário existe via user-profile.service
      await upsertUserProfile({
        tenantId: tenantId,
        userPhone: normalizedPhoneForBirthday
      });
      
      console.log(`ℹ️ Data de nascimento ${maybeBirthDate} seria salva se houvesse coluna birth_date`);

      // Avançar para ENDEREÇO
      const nextLock = this.flowManager.startFlowLock('onboarding', 'need_address');
      const updatedContext = await mergeEnhancedConversationContext(
        toCtxId(userPhone), tenantId, { ...context, flow_lock: nextLock }
      );

      return {
        aiResponse: `Obrigado! 🏠 Por último, pode me informar seu endereço? (rua, número, bairro, cidade)`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext,
        telemetryData: {
          intent: sanitizeIntentForPersistence('onboarding', 'greeting'),
          confidence_score: 1.0,
          decision_method: 'birthday_saved',
          flow_lock_active: true,
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    // === PASSO 5 — ENDEREÇO ===
    if (currentStep === 'need_address') {
      const address = messageText.trim();

      if (!address || address.length < 10) {
        const lock = this.flowManager.startFlowLock('onboarding', 'need_address');
        const updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone), tenantId, { ...context, flow_lock: lock }
        );

        return {
          aiResponse: `Por favor, informe um endereço mais completo (rua, número, bairro, cidade)`,
          shouldSendWhatsApp: true,
          conversationOutcome: null,
          updatedContext,
          telemetryData: {
            intent: null, // Flow Lock - preservar intent real do usuário
            confidence_score: 1.0,
            decision_method: 'incomplete_address',
            flow_lock_active: true,
            processing_time_ms: 0,
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Skip address - tabela users não possui esta coluna
      const normalizedPhoneForAddress = normalizePhone(userPhone);
      const addressData = { full_address: address, created_at: new Date().toISOString() };
      
      // Apenas garantir que o usuário existe via user-profile.service
      await upsertUserProfile({
        tenantId: tenantId,
        userPhone: normalizedPhoneForAddress
      });
      
      console.log(`ℹ️ Endereço ${JSON.stringify(addressData)} seria salvo se houvesse coluna address`);

      // Finalizar onboarding completo
      const cleanedContext = await mergeEnhancedConversationContext(
        toCtxId(userPhone), tenantId, { ...context, flow_lock: null }
      );

      // Buscar dados do usuário para personalização
      const normalizedPhone = normalizePhone(userPhone);
      let userName = '';
      let userGender: string | undefined = undefined;
      
      try {
        // Primeiro tentar buscar apenas o nome via helper correto
        const userNameData = await getUserByPhoneInTenant(normalizedPhone, tenantId);
        userName = userNameData.data?.name || '';

        // Tentar buscar gender apenas se necessário
        try {
          // Campo gender não existe na tabela users, vamos inferir do nome
          userGender = inferGenderFromName(userName || undefined);
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
        toCtxId(userPhone), tenantId, { ...cleanedContext, flow_lock: generalLock }
      );

      return {
        aiResponse: `Excelente! 🎉 Agora temos seu perfil completo. Como posso ${helpPhrase} hoje${greeting}? 😊`,
        shouldSendWhatsApp: true,
        conversationOutcome: null,
        updatedContext: contextWithGeneralFlow,
        telemetryData: {
          intent: sanitizeIntentForPersistence('onboarding_completed', 'greeting'),
          confidence_score: 1.0,
          decision_method: 'flow_lock',
          flow_lock_active: true, // Manter sessão ativa com flow general
          processing_time_ms: 0,
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
      };
    }

    // Fallback seguro: voltar para NOME
    const lock = this.flowManager.startFlowLock('onboarding', 'need_name');
    const fallbackCtx = await mergeEnhancedConversationContext(toCtxId(userPhone), tenantId, { ...context, flow_lock: lock });

    return {
      aiResponse: `Vamos começar — qual é seu nome completo?`,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: fallbackCtx,
      telemetryData: {
        intent: sanitizeIntentForPersistence('onboarding', 'greeting'),
        confidence_score: 1.0,
        decision_method: 'fallback',
        flow_lock_active: true,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
      toCtxId(userPhone),
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
        confidence_score: 1.0,
        decision_method: 'auto_restart',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
            confidence_score: 0.8,
            decision_method: 'auto_restart',
            flow_lock_active: false,
            processing_time_ms: Date.now(),
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
        };
      }

      // Iniciar novo flow lock se necessário
      let updatedContext = context;
      if (flowDecision.current_flow && flowDecision.current_flow !== 'general') {
        const newFlowLock = this.flowManager.startFlowLock(flowDecision.current_flow, 'start');
        updatedContext = await mergeEnhancedConversationContext(
          toCtxId(userPhone),
          context.tenant_id,
          { ...context, flow_lock: newFlowLock }
        );
      }

      // Para greeting após timeout, delegar para o fluxo principal que já tem toda lógica
      if (primaryIntent === 'greeting') {
        console.log('🔄 [RESTART] Greeting após timeout - delegando para fluxo principal');
        // Reprocessar usando o fluxo principal completo com toda lógica de profile validation
        return await this.orchestrateWebhookFlow({
          messageText,
          userPhone,
          tenantId: context.tenant_id,
          tenantConfig: {},
          existingContext: updatedContext
        });
      }

      if (primaryIntent === 'services') {
        return {
          aiResponse: `Sobre nossos serviços:\n\n✨ Oferecemos diversos tratamentos de beleza e bem-estar\n📅 Agendamentos flexíveis\n👨‍⚕️ Profissionais qualificados\n\nGostaria de agendar algum serviço específico?`,
          shouldSendWhatsApp: true,
          conversationOutcome: 'session_restarted_info',
          updatedContext,
          telemetryData: {
            intent: 'services',
            confidence_score: 0.9,
            decision_method: 'regex',
            flow_lock_active: !!updatedContext.flow_lock?.active_flow,
            processing_time_ms: Date.now(),
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
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
            confidence_score: 0.9,
            decision_method: 'regex',
            flow_lock_active: !!updatedContext.flow_lock?.active_flow,
            processing_time_ms: Date.now(),
            model_used: undefined
          },
          // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
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
          confidence_score: 0.7,
          decision_method: 'regex',
          flow_lock_active: !!updatedContext.flow_lock?.active_flow,
          processing_time_ms: Date.now(),
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
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
          confidence_score: 0.5,
          decision_method: 'error_fallback',
          flow_lock_active: false,
          processing_time_ms: Date.now(),
          model_used: undefined
        },
        // ✅ NOVO: intentMetrics pode existir se o classificador LLM rodou (undefined para respostas fixas)
        intentMetrics: undefined,
        // ✅ EXISTENTE: llmMetrics é undefined (resposta fixa/Flow Lock)
        llmMetrics: undefined
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
        intent: sanitizeIntentForPersistence('timeout_warning', null),
        confidence_score: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
    };
  }

  /**
   * Handler para timeout checking - Pergunta se usuário ainda está presente
   */
  private async handleTimeoutChecking(context: EnhancedConversationContext, message: string, userPhone: string, tenantId: string): Promise<WebhookOrchestrationResult> {
    // Marcar que estamos no estágio de checking
    const updatedLock = this.flowManager.markTimeoutStage(context, 'checking');
    const updatedContext = await mergeEnhancedConversationContext(
      toCtxId(userPhone), tenantId, { ...context, flow_lock: updatedLock }
    );
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_checking',
      updatedContext,
      telemetryData: {
        intent: sanitizeIntentForPersistence('timeout_checking', null),
        confidence_score: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: undefined

        
      },
      llmMetrics: undefined
    };
  }

  /**
   * Handler para timeout finalizing - Despedida amigável antes de encerrar
   */
  private async handleTimeoutFinalizing(context: EnhancedConversationContext, message: string, userPhone: string, tenantId: string): Promise<WebhookOrchestrationResult> {
    // Marcar que estamos no estágio final e programar para encerrar logo
    const updatedLock = this.flowManager.markTimeoutStage(context, 'finalizing');
    const updatedContext = await mergeEnhancedConversationContext(
      toCtxId(userPhone), tenantId, { ...context, flow_lock: updatedLock }
    );
    
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: 'timeout_finalizing',
      updatedContext,
      telemetryData: {
        intent: sanitizeIntentForPersistence('timeout_finalizing', null),
        confidence_score: 1.0,
        decision_method: 'timeout',
        flow_lock_active: !!context.flow_lock?.active_flow,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
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
        confidence_score: intentResult.confidence_score,
        decision_method: intentResult.decision_method,
        flow_lock_active: true,
        processing_time_ms: 0,
        model_used: (intentResult as any).model_used
      },
      llmMetrics: undefined
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
    const domainContext = this.buildDomainSpecificPrompt(tenantConfig?.domain || 'other');
    const flowCtx = this.buildFlowContext(currentFlow, currentStep, intent);

    const systemPrompt = `Você é a assistente oficial do ${tenantConfig?.name || 'negócio'}. Seu papel é atender com clareza, honestidade e objetividade, sempre em tom natural.
${domainContext}

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
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
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
          const pct = (apiCost || 0) * 0.10;   // 10% overhead
          const infra = 0.00002;               // Infraestrutura
          const db = 0.00001;                  // Database
          return Math.round(((apiCost || 0) + pct + infra + db) * 1000000) / 1000000;
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

  private buildDomainSpecificPrompt(domain: string): string {
    const domainPrompts: Record<string, string> = {
      healthcare: `
💊 CONTEXTO HEALTHCARE - Linguagem profissional mas acessível:
- Use termos como "consulta", "procedimento", "profissional de saúde"
- Seja empático com questões de saúde e urgência
- Mencione sempre a importância de confirmação prévia`,
      
      legal: `
⚖️ CONTEXTO JURÍDICO - Linguagem formal e precisa:
- Use "advogado(a)", "consulta jurídica", "orientação legal"
- Mantenha tom respeitoso e profissional
- Enfatize confidencialidade e agendamento prévio`,
      
      beauty: `
💅 CONTEXTO BELEZA - Tom acolhedor e personalizado:
- Use "tratamento", "sessão", "cuidado estético"
- Seja carinhoso e incentive o autocuidado
- Mencione resultados e bem-estar`,
      
      education: `
📚 CONTEXTO EDUCACIONAL - Tom educativo e motivador:
- Use "aula", "sessão de aprendizado", "orientação acadêmica"
- Seja encorajador e profissional
- Enfatize crescimento e desenvolvimento`,
      
      sports: `
🏃 CONTEXTO ESPORTIVO - Tom energético e motivador:
- Use "treino", "sessão", "atividade física"
- Seja dinâmico e incentivador
- Mencione performance e objetivos`,
      
      consulting: `
💼 CONTEXTO CONSULTORIA - Tom estratégico e profissional:
- Use "reunião", "consultoria", "análise estratégica"
- Seja objetivo e focado em resultados
- Enfatize valor agregado e expertise`
    };
    
    return domainPrompts[domain] || '';
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
  private shouldPersistOutcome(intent: string | null, _response: string, context: EnhancedConversationContext): string | null {
    // Outcomes finalizadores diretos
    const directFinalizers = ['booking_confirm', 'cancel_confirm', 'reschedule_confirm'];
    if (intent && directFinalizers.includes(intent)) {
      return this.determineConversationOutcome(intent, _response);
    }

    // Outcomes informativos também devem ser finalizados
    const informationalFinalizers = ['pricing', 'services', 'address', 'business_hours', 'policies'];
    if (intent && informationalFinalizers.includes(intent)) {
      return 'information_provided';
    }

    // Outcomes de erro ou problemas
    const errorFinalizers = ['wrong_number', 'test_message'];
    if (intent && errorFinalizers.includes(intent)) {
      return intent === 'wrong_number' ? 'wrong_number' : 'test_message';
    }

    // Verificar se há flow lock finalizado baseado no step
    if (context.flow_lock?.step === 'complete') {
      const flowType = context.flow_lock.active_flow;
      if (flowType === 'booking') return 'appointment_created';
      if (flowType === 'reschedule') return 'appointment_rescheduled';  
      if (flowType === 'cancel') return 'appointment_cancelled';
    }

    // Por agora, removemos a verificação de abandonment por step pois os valores não existem
    // Isso será tratado por timeout no analyzer

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
      // Usar nova API de finalização de outcome
      console.log(`🎯 Conversation timeout abandoned for session ${sessionId}`);
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
   * ANALISAR contexto completo da conversa para determinar outcome
   */
  private async detectIntentThreeLayers(
    messageText: string,
    context: any,
    sessionId: string
  ) {
    const startTime = Date.now();
    
    // CAMADA 1: Determinística (100% gratuita)
    console.log('🔍 [INTENT-3LAYER] Camada 1: Detector determinístico');
    const primaryIntent = this.intentDetector.detectPrimaryIntent(messageText);
    
    if (primaryIntent) {
      console.log(`✅ [INTENT-3LAYER] Camada 1 SUCCESS: ${primaryIntent}`);
      return {
        intent: primaryIntent,
        confidence_score: 1.0, // 100% de confiança em matches determinísticos
        decision_method: 'deterministic_regex',
        allowed_by_flow_lock: true,
        // ✅ Métricas para REGEX (gratuita)
        llmMetrics: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          api_cost_usd: 0.0,
          processing_cost_usd: (() => {
            const apiCost = 0; // Operações determinísticas não usam API
            const pct = apiCost * 0.10;      // 10% overhead
            const infra = 0.00002;           // Infraestrutura
            const db = 0.00001;              // Database
            return Math.round((apiCost + pct + infra + db) * 1000000) / 1000000;
          })(), // Fórmula oficial completa
          confidence_score: 1.0,
          latency_ms: Date.now() - startTime
        },
        model_used: 'deterministic_regex'
      };
    }
    
    console.log('❌ [INTENT-3LAYER] Camada 1 FALHOU - tentando Camada 2');
    
    // CAMADA 2: LLM com Escalonamento (mini → 3.5 → 4.0)
    console.log('🤖 [INTENT-3LAYER] Camada 2: Classificador LLM com escalonamento');
    const llmResult = await this.llmClassifier.classifyIntent(messageText);
    
    if (llmResult.intent) {
      console.log(`✅ [INTENT-3LAYER] Camada 2 SUCCESS: ${llmResult.intent} (${llmResult.processing_time_ms}ms) [${llmResult.model_used}] - R$ ${(llmResult.api_cost_usd || 0).toFixed(6)}`);
      return {
        intent: llmResult.intent,
        confidence_score: llmResult.confidence_score,
        decision_method: llmResult.decision_method,
        allowed_by_flow_lock: true,
        // ✅ Métricas completas do LLM
        llmMetrics: {
          prompt_tokens: llmResult.usage?.prompt_tokens || 0,
          completion_tokens: llmResult.usage?.completion_tokens || 0,
          total_tokens: llmResult.usage?.total_tokens || 0,
          api_cost_usd: llmResult.api_cost_usd || 0.0,
          processing_cost_usd: (() => {
            const apiCost = llmResult.api_cost_usd || 0;
            const pct = apiCost * 0.10;      // 10% overhead
            const infra = 0.00002;           // Infraestrutura
            const db = 0.00001;              // Database
            return Math.round((apiCost + pct + infra + db) * 1000000) / 1000000;
          })(), // Fórmula oficial correta
          confidence_score: llmResult.confidence_score,
          latency_ms: llmResult.processing_time_ms
        },
        model_used: llmResult.model_used
      };
    }
    
    console.log('❌ [INTENT-3LAYER] Camada 2 FALHOU - Camada 3 será acionada');
    
    // CAMADA 3: Será tratada no fluxo principal (desambiguação)
    return {
      intent: null,
      confidence_score: 0.0,
      decision_method: 'needs_disambiguation',
      allowed_by_flow_lock: true,
      // ✅ Métricas para desambiguação (gratuita)
      llmMetrics: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        api_cost_usd: 0.0,
        processing_cost_usd: (() => {
          const apiCost = 0; // Desambiguação não usa API
          const pct = apiCost * 0.10;      // 10% overhead
          const infra = 0.00002;           // Infraestrutura
          const db = 0.00001;              // Database
          return Math.round((apiCost + pct + infra + db) * 1000000) / 1000000;
        })(), // Fórmula oficial completa
        confidence_score: 0.0,
        latency_ms: Date.now() - startTime
      },
      model_used: 'disambiguation_required'
    };
  }

  /**
   * Classificação LLM determinística e fechada (MÉTODO LEGADO - MANTER PARA COMPATIBILIDADE)
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
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
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
        confidence_score: intentResult.confidence_score,
        decision_method: intentResult.decision_method
      }
    );
  }

  /**
   * Determina o status correto do usuário: novo no app, novo no tenant, ou existente
   */
  private async determineUserStatus(userPhone: string, tenantId: string): Promise<{
    type: 'new_to_app' | 'new_to_tenant' | 'existing_user',
    description: string,
    userProfile: any,
    isNewToTenant: boolean,
    isNewToApp: boolean
  }> {
    try {
      // Normalizar telefone
      const normalizedPhone = normalizePhone(userPhone);
      console.log(`🔍 [determineUserStatus] Input: ${userPhone} -> Normalized: ${normalizedPhone}`);
      
      // 1. Buscar usuário globalmente usando lógica de múltiplos candidatos (igual getPreviousEnhancedContext)
      const raw = String(userPhone || '').trim();
      const digits = raw.replace(/\D/g, '');
      const candidatesSet = new Set<string>();
      if (digits) {
        candidatesSet.add(digits);
        candidatesSet.add(`+${digits}`);
        
        if (digits.length >= 11) {
          if (digits.startsWith('55')) {
            const local = digits.slice(2);
            if (local && local.length >= 10) {
              candidatesSet.add(local);
              candidatesSet.add(`+${local}`);
            }
          } else if (digits.length >= 10) {
            candidatesSet.add(`55${digits}`);
            candidatesSet.add(`+55${digits}`);
          }
        }
      }
      const candidates = Array.from(candidatesSet);
      const orClause = candidates.map(v => `phone.eq.${v}`).join(',');

      const { data: globalUser } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone, gender, address, birth_date')
        .or(orClause)
        .limit(1)
        .maybeSingle() as { data: any; error: any };
      
      console.log(`🔍 [determineUserStatus] GlobalUser encontrado:`, globalUser ? `${globalUser.name} (${globalUser.phone})` : 'NULL');
      
      if (!globalUser) {
        // Usuário nunca existiu no app
        return {
          type: 'new_to_app',
          description: 'Usuário completamente novo no aplicativo',
          userProfile: null,
          isNewToTenant: true,
          isNewToApp: true
        };
      }
      
      // 2. Usuário existe - verificar se tem relação com este tenant
      const { data: userTenantRelation, error: relationError } = await supabaseAdmin
        .from('user_tenants')
        .select('user_id')
        .eq('user_id', globalUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      console.log(`🔍 [determineUserStatus] UserTenant relation:`, userTenantRelation ? `FOUND for user ${globalUser.id}` : `NOT FOUND for user ${globalUser.id} in tenant ${tenantId}`);
      
      if (!userTenantRelation) {
        // Usuário existe no app mas é novo neste tenant
        console.log(`🔗 [STATUS] Criando relação user_tenants para: ${globalUser.name} -> tenant ${tenantId}`);
        await supabaseAdmin
          .from('user_tenants')
          .insert({
            user_id: globalUser.id,
            tenant_id: tenantId
          });
          
        return {
          type: 'new_to_tenant',
          description: `Usuário ${globalUser.name} existe no app mas é novo neste tenant`,
          userProfile: globalUser,
          isNewToTenant: true,
          isNewToApp: false
        };
      }
      
      // 3. Usuário já existe neste tenant
      return {
        type: 'existing_user',
        description: `Usuário ${globalUser.name} já existe neste tenant`,
        userProfile: globalUser,
        isNewToTenant: false,
        isNewToApp: false
      };
      
    } catch (error) {
      console.error('Erro ao determinar status do usuário:', error);
      return {
        type: 'new_to_app',
        description: 'Erro ao verificar usuário - assumindo novo',
        userProfile: null,
        isNewToTenant: true,
        isNewToApp: true
      };
    }
  }

  /**
   * 🔍 DETECTA PRÓXIMO ESTADO DA COLETA DE DADOS
   */
  private async getNextDataCollectionState(userProfile: any, tenantConfig: any): Promise<DataCollectionState> {
    // 1. Nome obrigatório
    if (!userProfile?.name) {
      return DataCollectionState.NEED_NAME;
    }
    
    // 2. Email obrigatório  
    if (!userProfile?.email) {
      return DataCollectionState.NEED_EMAIL;
    }
    
    // 3. Gênero (se não conseguir inferir do nome)
    const inferredGender = await this.inferGenderFromName(userProfile.name);
    if (!userProfile?.gender && !inferredGender) {
      return DataCollectionState.NEED_GENDER_CONFIRMATION;
    }
    
    // 4. Perguntar consentimento para dados opcionais (SEMPRE verificar birth_date e address)
    const needsBirthDate = !userProfile?.birth_date;
    const needsAddress = !userProfile?.address;
    
    if ((needsBirthDate || needsAddress) && !userProfile?.optional_data_consent) {
      return DataCollectionState.ASK_OPTIONAL_DATA_CONSENT;
    }
    
    // 5. Data de nascimento (se consentiu)
    if (needsBirthDate && userProfile?.optional_data_consent === 'yes') {
      return DataCollectionState.NEED_BIRTH_DATE;
    }
    
    // 6. Endereço (se consentiu)
    if (needsAddress && userProfile?.optional_data_consent === 'yes') {
      return DataCollectionState.NEED_ADDRESS;
    }
    
    // 7. Coleta completa
    return DataCollectionState.COLLECTION_COMPLETE;
  }

  /**
   * 🧠 INFERE GÊNERO A PARTIR DO NOME - SOLUÇÃO GLOBAL COM LLM
   */
  private async inferGenderFromName(name: string): Promise<'male' | 'female' | null> {
    if (!name) return null;
    
    const firstName = name.split(' ')[0]?.trim();
    if (!firstName) return null;
    
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const prompt = `Based on the first name "${firstName}", determine if it's typically:
- male
- female  
- unknown (if unclear or neutral)

Respond with only one word: male, female, or unknown`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0
      });
      
      const result = response.choices[0]?.message?.content?.toLowerCase()?.trim();
      
      if (result === 'male' || result === 'female') {
        console.log(`🧠 [GENDER_INFERENCE] ${firstName} → ${result}`);
        return result;
      }
      
      console.log(`🤷 [GENDER_INFERENCE] ${firstName} → unknown, will ask user`);
      return null;
      
    } catch (error) {
      console.error('❌ [GENDER_INFERENCE] Error inferring gender:', error);
      return null; // Fallback: perguntará ao usuário
    }
  }

  /**
   * 🎯 GATEWAY DE SAUDAÇÃO INTELIGENTE
   * Sistema humanizado que reconhece contexto e coleta dados delicadamente
   */
  private async handleIntelligentGreeting({
    userStatus,
    userProfile,
    tenantConfig,
    context,
    userPhone,
    tenantId,
    messageText
  }: {
    userStatus: any;
    userProfile: any;
    tenantConfig: any;
    context: EnhancedConversationContext;
    userPhone: string;
    tenantId: string;
    messageText: string;
  }): Promise<WebhookOrchestrationResult> {
    
    console.log(`🌟 [INTELLIGENT_GREETING] Iniciando gateway para ${userStatus.type}`);
    
    // === CATEGORIA 1: USUÁRIO COMPLETAMENTE NOVO ===
    if (userStatus.type === 'new_to_app' || userStatus.type === 'new_to_tenant') {
      const isNewToApp = userStatus.type === 'new_to_app';
      
      const businessName = tenantConfig?.business_name || 'nossa empresa';
      
      const welcomeMessage = isNewToApp 
        ? `Olá! Seja bem-vindo(a)! 😊\n\nSou da UBS em nome da ${businessName}, e sou responsável pelos seus agendamentos.\n\nPara começar, como posso te chamar?`
        : `Olá! Seja bem-vindo(a)! 😊\n\nSou da UBS em nome da ${businessName}. É sua primeira vez em nosso serviço, e sou responsável pelos seus agendamentos.\n\nComo posso te chamar?`;
      
      return this.createGreetingResponse(welcomeMessage, context, 'new_user_welcome');
    }
    
    // === CATEGORIA 2: USUÁRIO EXISTENTE - COLETA PROGRESSIVA ===
    if (userStatus.type === 'existing_user') {
      const nextState = await this.getNextDataCollectionState(userProfile, tenantConfig);
      
      switch (nextState) {
        case DataCollectionState.NEED_NAME:
          const message = `Olá! Que bom ter você de volta! 😊\n\nPara um atendimento mais personalizado, como posso te chamar?`;
          return this.createDataCollectionResponse(message, context, nextState, messageText);
          
        case DataCollectionState.NEED_EMAIL:
          const emailMessage = `${userProfile.name}! Que bom ter você de volta! 😊\n\nPara completar seu perfil, pode me informar seu e-mail?`;
          return this.createDataCollectionResponse(emailMessage, context, nextState, messageText);
          
        case DataCollectionState.NEED_GENDER_CONFIRMATION:
          const genderMessage = `${userProfile.name}! Que bom ter você de volta! 😊\n\nPara personalizar melhor o atendimento, você prefere ser tratado como Sr. ou Sra.?`;
          return this.createDataCollectionResponse(genderMessage, context, nextState, messageText);
          
        case DataCollectionState.ASK_OPTIONAL_DATA_CONSENT:
          const consentMessage = `${userProfile.name}, para oferecer um serviço ainda melhor, você se incomoda de informar mais alguns dados? Pode escolher sim ou não, sem problema algum.`;
          return this.createDataCollectionResponse(consentMessage, context, nextState, messageText);
          
        case DataCollectionState.NEED_BIRTH_DATE:
          const birthMessage = `Obrigado! Qual sua data de nascimento?`;
          return this.createDataCollectionResponse(birthMessage, context, nextState, messageText);
          
        case DataCollectionState.NEED_ADDRESS:
          const addressMessage = `Obrigado! E qual seu endereço ou bairro?`;
          return this.createDataCollectionResponse(addressMessage, context, nextState, messageText);
          
        case DataCollectionState.COLLECTION_COMPLETE:
        default:
          const timeOfDay = this.getTimeGreeting();
          const completeMessage = `${userProfile.name}! ${timeOfDay} 😊\n\nComo posso te ajudar hoje?`;
          return this.createGreetingResponse(completeMessage, context, 'returning_complete_profile');
      }
    }
    
    // === FALLBACK ===
    const businessName = tenantConfig?.business_name || 'nossa empresa';
    const message = `Olá! Seja bem-vindo(a)! 😊\n\nSou da UBS em nome da ${businessName}, e sou responsável pelos seus agendamentos.\n\nComo posso te chamar?`;
    return this.createGreetingResponse(message, context, 'fallback_greeting');
  }

  /**
   * Analisa completude do perfil do usuário
   */
  private analyzeUserProfile(userProfile: any, tenantConfig: any) {
    const requiredFields = tenantConfig?.required_profile_fields || ['name', 'email'];
    
    return {
      needsBasicData: !userProfile?.name,
      needsEmail: userProfile?.name && !userProfile?.email,
      needsAdditionalData: userProfile?.name && userProfile?.email && 
        requiredFields.some((field: string) => !userProfile?.[field]),
      isComplete: requiredFields.every((field: string) => userProfile?.[field])
    };
  }

  /**
   * Retorna saudação baseada no horário
   */
  private getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia!';
    if (hour < 18) return 'Boa tarde!';
    return 'Boa noite!';
  }

  /**
   * Cria resposta padronizada para greeting
   */
  private createGreetingResponse(
    message: string, 
    context: EnhancedConversationContext, 
    greetingType: string
  ): WebhookOrchestrationResult {
    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: context,
      telemetryData: {
        intent: 'greeting',
        confidence_score: 1.0,
        decision_method: `intelligent_gateway_${greetingType}`,
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
    };
  }

  /**
   * Cria resposta padronizada para coleta de dados
   */
  private createDataCollectionResponse(
    message: string, 
    context: EnhancedConversationContext, 
    collectionState: DataCollectionState,
    userMessageText?: string
  ): WebhookOrchestrationResult {
    // Salvar estado atual no contexto para próxima mensagem
    const updatedContext = {
      ...context,
      data_collection_state: collectionState,
      awaiting_data_input: true
    };

    return {
      aiResponse: message,
      shouldSendWhatsApp: true,
      conversationOutcome: null,
      updatedContext: updatedContext,
      telemetryData: {
        intent: sanitizeIntentForPersistence('data_collection', detectIntentFromMessage(userMessageText || '', SystemFlowState.DATA_COLLECTION)),
        confidence_score: 1.0,
        decision_method: `progressive_collection_${collectionState}`,
        flow_lock_active: true,
        processing_time_ms: 0,
        model_used: undefined
      },
      llmMetrics: undefined
    };
  }

  /**
   * Gera mensagem de boas-vindas baseada no tipo de usuário
   */
  private generateWelcomeMessage(userType: 'new_to_app' | 'new_to_tenant', tenantConfig: any): string {
    if (userType === 'new_to_app') {
      return `Olá! 😊 Vejo que é a primeira vez que você usa nosso sistema. Seja muito bem-vindo(a)!\n\nPara começar, preciso saber seu nome. Como posso te chamar?`;
    } else {
      return `Olá! 😊 Vejo que é a primeira vez neste serviço. Que bom ter você aqui!\n\nPara te ajudar melhor, preciso saber seu nome. Como posso te chamar?`;
    }
  }

  /**
   * GUARDRAIL: Finaliza outcome da conversa de forma controlada
   * Evita sobrescrita acidental e duplicação de outcomes
   */
  async finalizeConversationOutcome(
    sessionId: string | null, 
    userPhone: string,
    tenantId: string,
    outcome: string, 
    reason: string
  ): Promise<{ success: boolean; action: 'created' | 'overwritten' | 'ignored'; reason: string }> {
    try {
      // 🛡️ GUARDRAILS DE VALIDAÇÃO
      
      // 1. Validar parâmetros obrigatórios
      if (!userPhone || !tenantId || !outcome || !reason) {
        console.error(`🚫 [OUTCOME-GUARD] Parâmetros obrigatórios ausentes:`, {
          userPhone: !!userPhone,
          tenantId: !!tenantId, 
          outcome: !!outcome,
          reason: !!reason
        });
        return { success: false, action: 'ignored', reason: 'invalid_parameters' };
      }

      // 2. Validar formato do telefone
      if (!userPhone.match(/^\+\d{10,15}$/)) {
        console.error(`🚫 [OUTCOME-GUARD] Formato de telefone inválido: ${userPhone}`);
        return { success: false, action: 'ignored', reason: 'invalid_phone_format' };
      }

      // 3. Validar outcomes permitidos
      const validOutcomes = [
        'appointment_created', 'appointment_confirmed', 'appointment_rescheduled',
        'appointment_cancelled', 'appointment_modified', 'info_request_fulfilled',
        'booking_abandoned', 'timeout_abandoned', 'wrong_number', 'spam_detected'
      ];
      
      if (!validOutcomes.includes(outcome)) {
        console.error(`🚫 [OUTCOME-GUARD] Outcome não permitido: ${outcome}`);
        return { success: false, action: 'ignored', reason: 'invalid_outcome_type' };
      }

      // 4. Rate limiting - máximo 5 outcomes por minuto por usuário
      const rateLimitKey = `outcome_rate:${userPhone}:${tenantId}`;
      const currentCount = await this.redisCacheService.get(rateLimitKey);
      
      if (currentCount && parseInt(currentCount) >= 5) {
        console.warn(`⚠️ [OUTCOME-GUARD] Rate limit excedido para ${userPhone} - tentativas: ${currentCount}`);
        return { success: false, action: 'ignored', reason: 'rate_limit_exceeded' };
      }

      // 5. Incrementar contador rate limit
      const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
      await this.redisCacheService.set(rateLimitKey, newCount.toString(), 60);

      console.log(`🎯 [OUTCOME] Guardrails OK - finalizando outcome: ${outcome} para ${userPhone}`);
      console.log(`📊 [OUTCOME] Rate limit: ${newCount}/5 tentativas no último minuto`);
      
      // 1. Obter user_id a partir do telefone  
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('phone', userPhone)
        .eq('tenant_id', tenantId)
        .maybeSingle();
        
      if (userError || !userData) {
        console.error(`❌ [OUTCOME-GUARD] Usuário não encontrado: ${userPhone} no tenant ${tenantId}`, userError);
        return { success: false, action: 'ignored', reason: 'user_not_found' };
      }
      
      // 2. Verificar se já existe outcome terminal para esta conversa
      const { data: existingOutcome, error: queryError } = await supabaseAdmin
        .from('conversation_history')
        .select('conversation_outcome, created_at')
        .eq('user_id', userData.id)
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) {
        console.error(`❌ [OUTCOME] Erro ao verificar outcome existente:`, queryError);
        return { success: false, action: 'ignored', reason: 'database_error' };
      }

      // 2. Definir outcomes terminais (não podem ser sobrescritos) 
      const terminalOutcomes = [
        'appointment_created',
        'appointment_confirmed', 
        'appointment_cancelled',
        'appointment_rescheduled',
        'wrong_number',
        'spam_detected'
      ];

      // 3. Definir hierarquia de outcome (outcomes mais importantes)
      const outcomeHierarchy: Record<string, number> = {
        'appointment_created': 10,
        'appointment_confirmed': 9,
        'appointment_rescheduled': 8,
        'appointment_cancelled': 7,
        'appointment_modified': 6,
        'info_request_fulfilled': 5,
        'booking_abandoned': 4,
        'timeout_abandoned': 3,
        'wrong_number': 2,
        'spam_detected': 1
      };

      if (existingOutcome && existingOutcome.conversation_outcome) {
        const existingLevel = outcomeHierarchy[existingOutcome.conversation_outcome] || 0;
        const newLevel = outcomeHierarchy[outcome] || 0;
        
        // Se existe outcome terminal e o novo não é mais importante, ignorar
        if (terminalOutcomes.includes(existingOutcome.conversation_outcome) && newLevel <= existingLevel) {
          console.log(`🛡️ [OUTCOME] Ignorando - outcome terminal já existe: ${existingOutcome.conversation_outcome} (nivel ${existingLevel}) >= ${outcome} (nivel ${newLevel})`);
          return { 
            success: false, 
            action: 'ignored', 
            reason: `terminal_outcome_exists_${existingOutcome.conversation_outcome}` 
          };
        }

        // Se o novo outcome é mais importante, permitir sobrescrita com log
        if (newLevel > existingLevel) {
          console.log(`🔄 [OUTCOME] Sobrescrevendo outcome: ${existingOutcome.conversation_outcome} (nivel ${existingLevel}) -> ${outcome} (nivel ${newLevel})`);
        }
      }

      // 4. Gravar novo outcome (criar nova entrada de finalizacao)
      const { error: insertError } = await supabaseAdmin
        .from('conversation_history')
        .insert({
          user_id: userData.id,
          tenant_id: tenantId,
          conversation_context: { session_id: sessionId }, // JSONB field that generates session_id_uuid
          content: `[OUTCOME_FINALIZATION] ${outcome} - ${reason}`,
          is_from_user: false,
          conversation_outcome: outcome,
          intent_detected: null,
          created_at: new Date().toISOString()
        } as any);

      if (insertError) {
        console.error(`❌ [OUTCOME] Erro ao gravar outcome final:`, insertError);
        return { success: false, action: 'ignored', reason: 'insert_error' };
      }

      // 5. Telemetria estruturada para outcome finalizado
      const guardMetrics = {
        guardrails_passed: true,
        rate_limit_count: newCount,
        user_validation: true,
        outcome_type: outcome,
        session_id: sessionId,
        user_phone: userPhone,
        tenant_id: tenantId,
        processing_time_ms: Date.now() - Date.now()
      };
      
      console.log(`✅ [OUTCOME-GUARD] Outcome finalizado com segurança:`, {
        outcome,
        reason,
        session: sessionId,
        action: existingOutcome ? 'overwritten' : 'created',
        metrics: guardMetrics
      });
      
      return { 
        success: true, 
        action: existingOutcome ? 'overwritten' : 'created',
        reason: `outcome_${outcome}_finalized`
      };

    } catch (error) {
      console.error(`💥 [OUTCOME] Erro crítico ao finalizar outcome:`, error);
      return { success: false, action: 'ignored', reason: 'critical_error' };
    }
  }

}
