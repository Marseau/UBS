/**
 * Deterministic Intent Detector Service
 * Ordem rígida: Comandos → Dicionário → Regex → LLM fallback
 * Baseado na OS: Sincronizar Intenções e Evitar Mistura
 */

import { FlowType, FlowLockDecision, IntentDetectionResult, EnhancedConversationContext } from '../types/flow-lock.types';

export class DeterministicIntentDetectorService {
  private readonly COMMAND_PATTERNS = {
    // Comandos diretos e numéricos
    confirm: /^(confirmo|confirma|sim|ok|1|yes|concordo)$/i,
    cancel_flow: /^(cancelar|cancela|sair|parar|stop|não|nao|2)$/i,
    reschedule_id: /^remarcar\s+(\d+)/i,
    cancel_id: /^cancelar\s+(\d+)/i,
    slot_selection: /^[1-5]$/,
    
    // Comandos operacionais prioritários (ordem crítica: cancel antes de booking)
    cancel_appointment: /\b(cancelar|cancela)\b.*(consulta|agendamento|horário)\b|\bcancelar\b.*\bagenda(mento)?\b|\bcancel\b/i,
    reschedule: /\bremarcar\b|\breagenda(r|mento)?\b/i,
    
    // Booking request (prioridade sobre business_hours)
    booking_request: /\b(agendar|marcar|reservar|tem\s+horário|consigo\s+um\s+horário)\b|\b(terça|quarta|quinta|sexta|sábado|domingo|amanhã|hoje)\b.*\b(às\s+\d+h?|\d+:\d+|de\s+manhã|de\s+tarde|à\s+noite)\b|\b\d{1,2}\/\d{1,2}\b|\bquero\s+(marcar|agendar)\b/i,
    
    // Comandos institucionais
    address_query: /\b(qual\s+(o\s+)?)?endereço(\s+de\s+vocês)?(\s+completo)?\b|\blocal(ização)?\b|\baonde\b|\bchegar\b|\bonde\s+(fica(m)?|é)\b|\bcomo\s+chegar\b|\bponto\s+de\s+referência\b|\bperto\s+de\b|\bfica\s+na\b|\bna\s+rua\b|\bna\s+avenida\b|\bmapa\b|\bgoogle\s+maps\b|\bpin\s+no\s+mapa\b|\bCEP\b/i,
    hours_query: /\bhor[aá]rio\b|\bfunciona(mento)?\b|\baberto\b|\bque horas\b|\bate.*horas\b/i,
    policy_query: /\bpol[íi]tica\b|\bregra\b|\bcancelamento\b/i,
    payment_query: /\b(formas?\s+de\s+pagamento|meios?\s+de\s+pagamento|como\s+(posso\s+)?pagar)\b|\baceita(m)?\s+(cartão|crédito|débito)\b|\b(cartão|crédito|débito|parcelar|contactless)\b|\b(pix|boleto|dinheiro|transferência)\b/i,
    pricing_query: /\b(quanto custa|pre[çc]o|valor|custa|qual.*valor)\b/i,
    handoff_query: /\batendente\b|\bhumano\b|\bpessoa\b|\btransferir\b|\bfalar com\b|\batendimento\b/i
  };

  private readonly HIGH_VALUE_REGEX = {
    explicit_booking: /\b(agendar|marcar|consulta|horário|disponível)\b/i,
    explicit_pricing: /\b(quanto custa|preço|valor|tabela|qual.*valor|custa)\b/i,
    explicit_services: /\b(serviços|atendimentos|procedimentos|fazem|oferece)\b/i,
    explicit_availability: /\b(disponibilidade|vaga|horários livres)\b/i
  };

  /**
   * Detecção principal com ordem rigorosa
   */
  async detectIntent(
    message: string, 
    context: EnhancedConversationContext,
    tenantConfig?: any
  ): Promise<IntentDetectionResult> {
    const startTime = Date.now();
    const normalizedMessage = message.trim().toLowerCase();
    
    // FASE 1: Comandos diretos (maior prioridade)
    const commandResult = this.detectDirectCommands(normalizedMessage, context);
    if (commandResult) {
      return this.buildResult(commandResult, 'command', message, startTime, context);
    }

    // FASE 2: Dicionário determinístico por tenant/domain
    if (tenantConfig) {
      const dictionaryResult = this.detectByDictionary(normalizedMessage, tenantConfig, context);
      if (dictionaryResult) {
        return this.buildResult(dictionaryResult, 'dictionary', message, startTime, context);
      }
    }

    // FASE 3: Regex de alto valor
    const regexResult = this.detectByHighValueRegex(normalizedMessage, context);
    if (regexResult) {
      return this.buildResult(regexResult, 'regex', message, startTime, context);
    }

    // FASE 4: LLM fallback (apenas se anteriores falharam)
    const llmResult = await this.detectByLLMFallback(message, context);
    return this.buildResult(llmResult, 'llm', message, startTime, context);
  }

  /**
   * FASE 1: Detecção de comandos diretos e numéricos
   */
  private detectDirectCommands(message: string, context: EnhancedConversationContext): string | null {
    // Prioridade absoluta: comandos de confirmação/cancelamento
    if (this.COMMAND_PATTERNS.confirm.test(message)) {
      return context.flow_lock?.active_flow === 'booking' ? 'booking_confirm' : 'general_confirm';
    }
    
    if (this.COMMAND_PATTERNS.cancel_flow.test(message)) {
      return context.flow_lock?.active_flow ? 'flow_cancel' : 'general_cancel';
    }

    // Seleção de slot numérico (apenas se em booking)
    if (this.COMMAND_PATTERNS.slot_selection.test(message) && context.flow_lock?.active_flow === 'booking') {
      return 'slot_selection';
    }

    // Comandos operacionais com ID
    const rescheduleMatch = message.match(this.COMMAND_PATTERNS.reschedule_id);
    if (rescheduleMatch) {
      return 'reschedule';
    }

    const cancelMatch = message.match(this.COMMAND_PATTERNS.cancel_id);
    if (cancelMatch) {
      return 'cancel';
    }

    // Comandos operacionais prioritários (cancelamento tem prioridade máxima)
    if (this.COMMAND_PATTERNS.cancel_appointment.test(message)) return 'cancel';
    if (this.COMMAND_PATTERNS.reschedule.test(message)) return 'reschedule';
    
    // Booking request (prioridade sobre business_hours)
    if (this.COMMAND_PATTERNS.booking_request.test(message)) return 'booking';
    
    // Comandos institucionais (sempre permitidos, não mudam fluxo)
    if (this.COMMAND_PATTERNS.address_query.test(message)) return 'address';
    if (this.COMMAND_PATTERNS.hours_query.test(message)) return 'business_hours';
    if (this.COMMAND_PATTERNS.policy_query.test(message)) return 'policies';
    // Desambiguação: pricing tem prioridade sobre payments em frases mistas
    if (this.COMMAND_PATTERNS.pricing_query.test(message)) return 'pricing';
    if (this.COMMAND_PATTERNS.payment_query.test(message)) return 'payments';
    if (this.COMMAND_PATTERNS.handoff_query.test(message)) return 'handoff';

    return null;
  }

  /**
   * FASE 2: Dicionário determinístico por tenant
   */
  private detectByDictionary(message: string, tenantConfig: any, context: EnhancedConversationContext): string | null {
    // Implementar fuzzy match com serviços do tenant
    const services = tenantConfig.services || [];
    
    for (const service of services) {
      const serviceName = service.name?.toLowerCase() || '';
      if (serviceName && message.includes(serviceName)) {
        return this.isOperationalIntent(message) ? 'services' : 'pricing';
      }
    }

    // Fuzzy match com políticas e informações do tenant
    const policies = tenantConfig.policies || {};
    if (policies.address && message.includes('endereço')) return 'institutional_address';
    if (policies.hours && (message.includes('horário') || message.includes('funciona'))) return 'institutional_hours';

    return null;
  }

  /**
   * FASE 3: Regex de alto valor
   */
  private detectByHighValueRegex(message: string, context: EnhancedConversationContext): string | null {
    // Prioridade por hierarquia: cancel/reschedule > booking > services/pricing > institutional

    // Cancelamento/Reagendamento (prioridade máxima)
    if (this.COMMAND_PATTERNS.reschedule.test(message)) return 'reschedule';
    if (this.COMMAND_PATTERNS.cancel_appointment.test(message)) return 'cancel';

    // Booking explícito
    if (this.HIGH_VALUE_REGEX.explicit_booking.test(message)) return 'booking';
    if (this.HIGH_VALUE_REGEX.explicit_availability.test(message)) return 'booking';

    // Pricing/Serviços
    if (this.HIGH_VALUE_REGEX.explicit_pricing.test(message)) return 'pricing';
    if (this.HIGH_VALUE_REGEX.explicit_services.test(message)) return 'services';

    return null;
  }

  /**
   * FASE 4: LLM fallback com prompt restritivo
   */
  private async detectByLLMFallback(message: string, context: EnhancedConversationContext): Promise<string> {
    // Implementar chamada OpenAI com prompt extremamente restritivo
    // Por ora, retornar intent conservativo baseado em heurísticas
    
    if (this.hasGreetingPattern(message)) return 'greeting';
    if (this.hasOnboardingNeed(message, context)) return 'onboarding';
    
    return 'general';
  }

  /**
   * Verifica se mensagem indica intenção operacional clara
   */
  private isOperationalIntent(message: string): boolean {
    const operationalKeywords = ['agendar', 'marcar', 'disponível', 'horário', 'quando', 'amanhã', 'hoje'];
    return operationalKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Verifica necessidade de onboarding (apenas se não há intenção operacional)
   */
  private hasOnboardingNeed(message: string, context: EnhancedConversationContext): boolean {
    // Regra: onboarding só se não há intent operacional E falta dados básicos
    if (this.isOperationalIntent(message)) return false;
    
    // TODO: Verificar se user tem nome/email/gênero no banco
    return false;
  }

  /**
   * Patterns de saudação básica
   */
  private hasGreetingPattern(message: string): boolean {
    const greetingPatterns = /^(oi|olá|hello|hi|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+aí|opa|salve)([,.!?\s].*)?$/i;
    return greetingPatterns.test(message);
  }

  /**
   * Constrói resultado padronizado
   */
  private buildResult(
    intent: string, 
    method: 'command' | 'dictionary' | 'regex' | 'llm',
    rawInput: string,
    startTime: number,
    context: EnhancedConversationContext
  ): IntentDetectionResult {
    const processingTime = Date.now() - startTime;
    const currentFlow = context.flow_lock?.active_flow || null;
    
    return {
      intent,
      confidence: method === 'command' ? 1.0 : method === 'dictionary' ? 0.9 : method === 'regex' ? 0.8 : 0.6,
      decision_method: method,
      allowed_by_flow_lock: this.isIntentAllowedByFlowLock(intent, context),
      current_flow: currentFlow,
      metadata: {
        raw_input: rawInput,
        processing_time_ms: processingTime,
        flow_override_attempted: false,
        deterministic_match: method !== 'llm' ? intent : undefined
      }
    };
  }

  /**
   * Verifica se intent é permitido pelo flow lock atual
   */
  private isIntentAllowedByFlowLock(intent: string, context: EnhancedConversationContext): boolean {
    const currentFlow = context.flow_lock?.active_flow;
    
    // Se não há flow ativo, qualquer intent é permitido
    if (!currentFlow) return true;
    
    // Comandos de cancelamento sempre permitidos
    if (intent.includes('cancel') || intent.includes('flow_cancel')) return true;
    
    // Comandos institucionais sempre permitidos (não mudam fluxo)
    if (intent.startsWith('institutional_')) return true;
    
    // Comandos relacionados ao fluxo atual
    if (currentFlow === 'booking' && (
      intent === 'slot_selection' || 
      intent === 'booking_confirm' ||
      intent.startsWith('booking_')
    )) {
      return true;
    }
    
    // Por padrão, bloquear mudança de fluxo
    return false;
  }
}