export interface OutcomeAnalysisInput {
  tenant_id: string;
  session_id: string;
  intent: string | null;
  decision_method: 'flow_lock' | 'regex' | 'llm';
  context: Record<string, any>;
  reply: any;
}

export interface OutcomeResult {
  final: boolean;
  value: string;
  reason?: string;
}

export class OutcomeAnalyzer {
  /**
   * Analisa se a conversa chegou a um outcome final baseado no intent e contexto
   */
  async maybeDeriveOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    try {
      console.log(`🎯 [OUTCOME-ANALYZER] Analisando outcome: intent=${input.intent}, method=${input.decision_method}`);

      // Regra 1: Intents de confirmação explícita
      if (input.intent === 'confirm' || input.intent === 'appointment_confirmed') {
        return { 
          final: true, 
          value: 'appointment_confirmed', 
          reason: 'explicit_confirm_intent' 
        };
      }

      // Regra 2: Intents de cancelamento explícito
      if (input.intent === 'cancel' || input.intent === 'appointment_cancelled') {
        return { 
          final: true, 
          value: 'appointment_cancelled', 
          reason: 'explicit_cancel_intent' 
        };
      }

      // Regra 3: Flow Lock completou agendamento
      if (input.decision_method === 'flow_lock' && input.context?.flow_lock?.active_flow === 'appointment_booking') {
        const flowState = input.context.flow_lock?.flow_state;
        if (flowState?.appointment_confirmed === true) {
          return {
            final: true,
            value: 'appointment_confirmed',
            reason: 'flow_lock_booking_completed'
          };
        }
      }

      // Regra 4: Abandono após múltiplas tentativas sem progresso
      const sessionTurns = await this.getSessionTurnCount(input.session_id);
      if (sessionTurns > 10 && !input.context?.flow_lock?.active_flow) {
        return {
          final: true,
          value: 'conversation_abandoned',
          reason: 'high_turn_count_no_progress'
        };
      }

      // Regra 5: Intent de despedida/encerramento
      if (input.intent === 'goodbye' || input.intent === 'end_conversation') {
        return {
          final: true,
          value: 'conversation_ended',
          reason: 'explicit_goodbye_intent'
        };
      }

      // Regra 6: Intent de reagendamento completado
      if (input.intent === 'reschedule_confirmed') {
        return {
          final: true,
          value: 'appointment_rescheduled',
          reason: 'explicit_reschedule_intent'
        };
      }

      // Regra 7: Análise baseada no contexto de domínio
      const domainOutcome = await this.analyzeDomainSpecificOutcome(input);
      if (domainOutcome) {
        return domainOutcome;
      }

      console.log(`🎯 [OUTCOME-ANALYZER] Nenhum outcome final detectado para session=${input.session_id}`);
      return null;

    } catch (error) {
      console.error('❌ [OUTCOME-ANALYZER] Erro na análise:', error);
      return null; // Falha graceful
    }
  }

  /**
   * Análise específica por domínio de negócio
   */
  private async analyzeDomainSpecificOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    const tenantDomain = input.context?.tenant_config?.domain;

    switch (tenantDomain) {
      case 'healthcare':
        return this.analyzeHealthcareOutcome(input);
      
      case 'beauty':
        return this.analyzeBeautyOutcome(input);
      
      case 'legal':
        return this.analyzeLegalOutcome(input);
      
      case 'education':
        return this.analyzeEducationOutcome(input);
      
      default:
        return null;
    }
  }

  /**
   * Análise específica para domínio de saúde
   */
  private async analyzeHealthcareOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    // Exemplo: consulta médica agendada
    if (input.intent === 'schedule_appointment' && input.context?.appointment_data?.confirmed) {
      return {
        final: true,
        value: 'medical_appointment_scheduled',
        reason: 'healthcare_appointment_confirmed'
      };
    }

    // Exemplo: emergência redirecionada
    if (input.intent === 'emergency' || input.intent === 'urgent_care') {
      return {
        final: true,
        value: 'emergency_redirected',
        reason: 'urgent_care_escalation'
      };
    }

    return null;
  }

  /**
   * Análise específica para domínio de beleza
   */
  private async analyzeBeautyOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    // Exemplo: serviço de beleza agendado
    if (input.intent === 'book_service' && input.context?.service_data?.confirmed) {
      return {
        final: true,
        value: 'beauty_service_booked',
        reason: 'beauty_service_confirmed'
      };
    }

    return null;
  }

  /**
   * Análise específica para domínio jurídico
   */
  private async analyzeLegalOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    // Exemplo: consulta jurídica agendada
    if (input.intent === 'legal_consultation' && input.context?.consultation_data?.confirmed) {
      return {
        final: true,
        value: 'legal_consultation_scheduled',
        reason: 'legal_consultation_confirmed'
      };
    }

    return null;
  }

  /**
   * Análise específica para domínio de educação
   */
  private async analyzeEducationOutcome(input: OutcomeAnalysisInput): Promise<OutcomeResult | null> {
    // Exemplo: aula ou curso agendado
    if (input.intent === 'schedule_class' && input.context?.class_data?.confirmed) {
      return {
        final: true,
        value: 'class_scheduled',
        reason: 'education_class_confirmed'
      };
    }

    return null;
  }

  /**
   * Conta o número de turns na sessão (simulado - implementar com query real)
   */
  private async getSessionTurnCount(sessionId: string): Promise<number> {
    try {
      // TODO: Implementar query real para contar turns na sessão
      // const { count } = await supabaseAdmin
      //   .from('conversation_history')
      //   .select('*', { count: 'exact', head: true })
      //   .eq('session_id_uuid', sessionId);
      // return count || 0;

      // Por enquanto, retorna um valor simulado
      return Math.floor(Math.random() * 15); // 0-14 turns
    } catch (error) {
      console.error('❌ [OUTCOME-ANALYZER] Erro ao contar turns:', error);
      return 0;
    }
  }

  /**
   * Verifica se houve progresso recente na sessão
   */
  private async hasRecentProgress(sessionId: string): Promise<boolean> {
    try {
      // TODO: Implementar lógica para verificar progresso
      // - Últimas mensagens tiveram intent detection?
      // - Houve avanço no flow_lock?
      // - Dados foram coletados?
      
      return false; // Placeholder
    } catch (error) {
      console.error('❌ [OUTCOME-ANALYZER] Erro ao verificar progresso:', error);
      return false;
    }
  }
}