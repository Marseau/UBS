/**
 * Flow Lock Manager Service
 * Gerencia locks de fluxo por sessão com timeout automático
 * Implementa OS: Sincronizar Intenções e Evitar Mistura
 */

import { FlowType, FlowStep, FlowLock, FlowLockDecision, EnhancedConversationContext } from '../types/flow-lock.types';

export class FlowLockManagerService {
  private readonly FLOW_TIMEOUTS = {
    // Timeouts específicos por tipo de fluxo (em ms)
    onboarding: 120000,   // 2 min
    booking: 300000,      // 5 min  
    reschedule: 180000,   // 3 min
    cancel: 60000,        // 1 min
    pricing: 90000,       // 1.5 min
    institutional: 30000, // 30s
    handoff: 300000,      // 5 min
    general: 60000        // 1 min
  };

  private readonly STEP_TIMEOUTS = {
    // Timeouts por etapa (padrão: 60s + 30s aviso + 30s encerramento)
    default: 60000,       // 1 min para resposta
    warning: 30000,       // 30s aviso de encerramento  
    final: 30000          // 30s final antes de encerrar
  };

  /**
   * Inicia novo flow lock
   */
  startFlowLock(flowType: FlowType, step: FlowStep = 'start'): FlowLock {
    const now = new Date();
    const timeoutMs = this.FLOW_TIMEOUTS[flowType as keyof typeof this.FLOW_TIMEOUTS] || 120000;
    
    return {
      active_flow: flowType,
      step,
      expires_at: new Date(now.getTime() + timeoutMs).toISOString(),
      created_at: now.toISOString(),
      priority: this.getFlowPriority(flowType),
      step_data: {}
    };
  }

  /**
   * Verifica se pode iniciar novo fluxo
   */
  canStartNewFlow(context: EnhancedConversationContext, newFlowType: FlowType): FlowLockDecision {
    const currentLock = context.flow_lock;
    const now = new Date();

    // Se não há lock atual, pode iniciar qualquer fluxo
    if (!currentLock || !currentLock.active_flow) {
      return {
        allow_intent: true,
        current_flow: newFlowType,
        current_step: 'start',
        suggested_response: '',
        action: 'continue',
        expires_at: new Date(now.getTime() + this.getFlowTimeout(newFlowType)).toISOString()
      };
    }

    // Verificar se lock atual expirou
    if (new Date(currentLock.expires_at) <= now) {
      return {
        allow_intent: true,
        current_flow: newFlowType,
        current_step: 'start', 
        suggested_response: 'Sessão anterior expirou. Vamos começar novamente.',
        action: 'continue',
        expires_at: new Date(now.getTime() + this.getFlowTimeout(newFlowType)).toISOString()
      };
    }

    // Verificar prioridade do novo fluxo vs atual
    const currentPriority = this.getFlowPriorityScore(currentLock.active_flow);
    const newPriority = this.getFlowPriorityScore(newFlowType);

    // Permitir apenas se nova prioridade for maior
    if (newPriority > currentPriority) {
      return {
        allow_intent: true,
        current_flow: newFlowType,
        current_step: 'start',
        suggested_response: `Interrompendo ${currentLock.active_flow} para atender ${newFlowType}.`,
        action: 'continue',
        expires_at: new Date(now.getTime() + this.getFlowTimeout(newFlowType)).toISOString()
      };
    }

    // Bloquear mudança de fluxo
    return {
      allow_intent: false,
      current_flow: currentLock.active_flow,
      current_step: currentLock.step,
      suggested_response: this.getFlowBlockMessage(currentLock.active_flow, newFlowType),
      action: 'continue',
      expires_at: currentLock.expires_at
    };
  }

  /**
   * Avança para próximo step do fluxo atual
   */
  advanceStep(context: EnhancedConversationContext, nextStep: FlowStep, stepData?: Record<string, any>): FlowLock {
    const currentLock = context.flow_lock;
    if (!currentLock?.active_flow) {
      throw new Error('Não há fluxo ativo para avançar step');
    }

    const now = new Date();
    const remainingTime = new Date(currentLock.expires_at).getTime() - now.getTime();
    const newTimeout = Math.max(remainingTime, this.STEP_TIMEOUTS.default);

    return {
      ...currentLock,
      step: nextStep,
      expires_at: new Date(now.getTime() + newTimeout).toISOString(),
      step_data: { ...currentLock.step_data, ...stepData }
    };
  }

  /**
   * Completa fluxo atual
   */
  completeFlow(context: EnhancedConversationContext, outcome: string): FlowLock | null {
    const currentLock = context.flow_lock;
    if (!currentLock?.active_flow) return null;

    // Limpar lock - fluxo concluído
    return {
      ...currentLock,
      active_flow: null,
      step: 'complete',
      step_data: { ...currentLock.step_data, outcome }
    };
  }

  /**
   * Abandona fluxo atual (timeout ou cancelamento)
   */
  abandonFlow(context: EnhancedConversationContext, reason: string): FlowLock | null {
    const currentLock = context.flow_lock;
    if (!currentLock?.active_flow) return null;

    return {
      ...currentLock,
      active_flow: null,
      step: 'abandoned',
      step_data: { ...currentLock.step_data, abandon_reason: reason }
    };
  }

  /**
   * Verifica se flow está próximo do timeout
   */
  checkTimeoutStatus(context: EnhancedConversationContext): { status: 'active' | 'warning' | 'expired', message?: string } {
    const currentLock = context.flow_lock;
    if (!currentLock?.active_flow) return { status: 'active' };

    const now = new Date();
    const expiresAt = new Date(currentLock.expires_at);
    const timeLeft = expiresAt.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return { 
        status: 'expired', 
        message: 'Sessão expirada. Digite algo para começar novamente.' 
      };
    }

    if (timeLeft <= this.STEP_TIMEOUTS.warning) {
      return { 
        status: 'warning', 
        message: `Você ainda está aí? Vou encerrar em ${Math.ceil(timeLeft / 1000)} segundos se não responder.` 
      };
    }

    return { status: 'active' };
  }

  /**
   * Obtém timeout para tipo de fluxo
   */
  private getFlowTimeout(flowType: FlowType): number {
    if (!flowType) return this.FLOW_TIMEOUTS.general;
    return this.FLOW_TIMEOUTS[flowType as keyof typeof this.FLOW_TIMEOUTS] || this.FLOW_TIMEOUTS.general;
  }

  /**
   * Determina prioridade do fluxo
   */
  private getFlowPriority(flowType: FlowType): 'high' | 'medium' | 'low' {
    const highPriority: FlowType[] = ['cancel', 'reschedule', 'handoff'];
    const mediumPriority: FlowType[] = ['booking', 'onboarding'];
    
    if (!flowType) return 'low';
    if (highPriority.includes(flowType)) return 'high';
    if (mediumPriority.includes(flowType)) return 'medium';
    return 'low';
  }

  /**
   * Score numérico de prioridade (para comparações)
   */
  private getFlowPriorityScore(flowType: FlowType): number {
    if (!flowType) return 0;
    
    const scores: Record<string, number> = {
      'cancel': 10,
      'reschedule': 9,
      'handoff': 8,
      'booking': 5,
      'onboarding': 4,
      'pricing': 3,
      'institutional': 2,
      'greeting': 1,
      'general': 0
    };
    
    return scores[flowType] || 0;
  }

  /**
   * Mensagem quando fluxo é bloqueado
   */
  private getFlowBlockMessage(currentFlow: FlowType, attemptedFlow: FlowType): string {
    const messages: Record<string, string> = {
      booking: "Vamos terminar seu agendamento primeiro. Em qual horário você prefere?",
      onboarding: "Preciso de algumas informações suas antes. Qual seu nome completo?",
      reschedule: "Vamos finalizar o reagendamento. Confirma a nova data?",
      cancel: "Confirma o cancelamento do agendamento?",
      pricing: "Te mostro os preços. Algum serviço te interessa para agendar?"
    };
    
    return messages[currentFlow as string] || `Vamos terminar o que começamos (${currentFlow}) antes de prosseguir.`;
  }

  /**
   * Aplica regras de next_flow_hint
   */
  applyNextFlowHint(context: EnhancedConversationContext): FlowType {
    const currentLock = context.flow_lock;
    if (!currentLock?.next_flow_hint) return null;

    // Regras condicionais para hints
    if (currentLock.next_flow_hint === 'booking' && currentLock.active_flow === 'pricing') {
      // Se completou pricing, sugerir booking
      return 'booking';
    }

    return currentLock.next_flow_hint;
  }
}