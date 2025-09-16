/**
 * Testes unitários para o OutcomeAnalyzer
 * Testa análise de outcomes de conversação
 */

import { jest } from '@jest/globals';
import { OutcomeAnalyzer } from '../services/outcome-analyzer.service';

describe('OutcomeAnalyzer', () => {
  let outcomeAnalyzer: OutcomeAnalyzer;
  let consoleSpy: jest.SpiedFunction<typeof console.log>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    outcomeAnalyzer = new OutcomeAnalyzer();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('maybeDeriveOutcome', () => {
    const baseInput = {
      tenant_id: 'tenant123',
      session_id: 'session456',
      context: {},
      reply: 'Test reply'
    };

    describe('Intents de confirmação explícita', () => {
      it('retorna outcome final para intent "confirm"', async () => {
        const input = {
          ...baseInput,
          intent: 'confirm',
          decision_method: 'regex' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_confirmed',
          reason: 'explicit_confirm_intent'
        });
      });

      it('retorna outcome final para intent "appointment_confirmed"', async () => {
        const input = {
          ...baseInput,
          intent: 'appointment_confirmed',
          decision_method: 'llm' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_confirmed',
          reason: 'explicit_confirm_intent'
        });
      });
    });

    describe('Intents de cancelamento explícito', () => {
      it('retorna outcome final para intent "cancel"', async () => {
        const input = {
          ...baseInput,
          intent: 'cancel',
          decision_method: 'regex' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_cancelled',
          reason: 'explicit_cancel_intent'
        });
      });

      it('retorna outcome final para intent "appointment_cancelled"', async () => {
        const input = {
          ...baseInput,
          intent: 'appointment_cancelled',
          decision_method: 'llm' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_cancelled',
          reason: 'explicit_cancel_intent'
        });
      });
    });

    describe('Flow Lock completou agendamento', () => {
      it('retorna outcome final quando Flow Lock completa booking', async () => {
        const input = {
          ...baseInput,
          intent: null,
          decision_method: 'flow_lock' as const,
          context: {
            flow_lock: {
              active_flow: 'appointment_booking',
              flow_state: {
                appointment_confirmed: true
              }
            }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_confirmed',
          reason: 'flow_lock_booking_completed'
        });
      });

      it('não retorna outcome quando Flow Lock não está completo', async () => {
        const input = {
          ...baseInput,
          intent: null,
          decision_method: 'flow_lock' as const,
          context: {
            flow_lock: {
              active_flow: 'appointment_booking',
              flow_state: {
                appointment_confirmed: false
              }
            }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toBeNull();
      });
    });

    describe('Intents de despedida/encerramento', () => {
      it('retorna outcome final para intent "goodbye"', async () => {
        // Mock baixo número de turns para não detectar abandono
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(3);

        const input = {
          ...baseInput,
          intent: 'goodbye',
          decision_method: 'regex' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'conversation_ended',
          reason: 'explicit_goodbye_intent'
        });
      });

      it('retorna outcome final para intent "end_conversation"', async () => {
        const input = {
          ...baseInput,
          intent: 'end_conversation',
          decision_method: 'llm' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'conversation_ended',
          reason: 'explicit_goodbye_intent'
        });
      });
    });

    describe('Intents de reagendamento', () => {
      it('retorna outcome final para intent "reschedule_confirmed"', async () => {
        const input = {
          ...baseInput,
          intent: 'reschedule_confirmed',
          decision_method: 'regex' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'appointment_rescheduled',
          reason: 'explicit_reschedule_intent'
        });
      });
    });

    describe('Análise específica por domínio', () => {
      it('analisa outcome para domínio healthcare', async () => {
        // Mock getSessionTurnCount para retornar valor baixo
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(3);

        const input = {
          ...baseInput,
          intent: 'schedule_appointment',
          decision_method: 'llm' as const,
          context: {
            tenant_config: { domain: 'healthcare' },
            appointment_data: { confirmed: true }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'medical_appointment_scheduled',
          reason: 'healthcare_appointment_confirmed'
        });
      });

      it('analisa outcome para emergência em healthcare', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(1);

        const input = {
          ...baseInput,
          intent: 'emergency',
          decision_method: 'llm' as const,
          context: {
            tenant_config: { domain: 'healthcare' }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'emergency_redirected',
          reason: 'urgent_care_escalation'
        });
      });

      it('analisa outcome para domínio beauty', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(2);

        const input = {
          ...baseInput,
          intent: 'book_service',
          decision_method: 'regex' as const,
          context: {
            tenant_config: { domain: 'beauty' },
            service_data: { confirmed: true }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'beauty_service_booked',
          reason: 'beauty_service_confirmed'
        });
      });

      it('analisa outcome para domínio legal', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(4);

        const input = {
          ...baseInput,
          intent: 'legal_consultation',
          decision_method: 'llm' as const,
          context: {
            tenant_config: { domain: 'legal' },
            consultation_data: { confirmed: true }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'legal_consultation_scheduled',
          reason: 'legal_consultation_confirmed'
        });
      });

      it('analisa outcome para domínio education', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(2);

        const input = {
          ...baseInput,
          intent: 'schedule_class',
          decision_method: 'regex' as const,
          context: {
            tenant_config: { domain: 'education' },
            class_data: { confirmed: true }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'class_scheduled',
          reason: 'education_class_confirmed'
        });
      });
    });

    describe('Abandono por múltiplas tentativas', () => {
      it('detecta abandono após muitos turns sem progresso', async () => {
        // Mock alto número de turns
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(15);

        const input = {
          ...baseInput,
          intent: 'availability',
          decision_method: 'llm' as const,
          context: {} // Sem flow_lock ativo
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toEqual({
          final: true,
          value: 'conversation_abandoned',
          reason: 'high_turn_count_no_progress'
        });
      });

      it('não detecta abandono quando há flow_lock ativo', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(15);

        const input = {
          ...baseInput,
          intent: null,
          decision_method: 'flow_lock' as const,
          context: {
            flow_lock: { active_flow: 'appointment_booking' }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toBeNull(); // Não deve detectar abandono se há flow ativo
      });
    });

    describe('Casos sem outcome final', () => {
      it('retorna null para intents ongoing', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(3);

        const input = {
          ...baseInput,
          intent: 'availability',
          decision_method: 'llm' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toBeNull();
      });

      it('retorna null para domínio não reconhecido', async () => {
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockResolvedValue(2);

        const input = {
          ...baseInput,
          intent: 'schedule_appointment',
          decision_method: 'llm' as const,
          context: {
            tenant_config: { domain: 'unknown_domain' },
            appointment_data: { confirmed: true }
          }
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toBeNull();
      });
    });

    describe('Tratamento de erros', () => {
      it('falha graciosamente e retorna null em caso de erro', async () => {
        // Simula erro no getSessionTurnCount
        jest.spyOn(outcomeAnalyzer as any, 'getSessionTurnCount').mockRejectedValue(new Error('Database error'));

        const input = {
          ...baseInput,
          intent: 'test_intent',
          decision_method: 'llm' as const
        };

        const result = await outcomeAnalyzer.maybeDeriveOutcome(input);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ [OUTCOME-ANALYZER] Erro na análise:',
          expect.any(Error)
        );
      });
    });
  });

  describe('getSessionTurnCount (método privado)', () => {
    it('retorna número aleatório como placeholder', async () => {
      // Testa o comportamento atual do placeholder
      const count = await (outcomeAnalyzer as any).getSessionTurnCount('test-session');

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThan(15);
    });

    it('retorna 0 em caso de erro', async () => {
      // Simula erro interno
      const originalRandom = Math.random;
      Math.random = () => {
        throw new Error('Math.random error');
      };

      const count = await (outcomeAnalyzer as any).getSessionTurnCount('test-session');

      expect(count).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ [OUTCOME-ANALYZER] Erro ao contar turns:',
        expect.any(Error)
      );

      // Restore original
      Math.random = originalRandom;
    });
  });
});