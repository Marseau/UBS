/**
 * Testes unitários para o TelemetryService
 * Testa funcionalidade de telemetria estruturada
 */

import { jest } from '@jest/globals';
import { TelemetryService } from '../services/telemetry.service';

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;
  let consoleSpy: jest.SpiedFunction<typeof console.log>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    telemetryService = new TelemetryService();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recordTurn', () => {
    it('registra evento de turn com dados completos', async () => {
      const turnEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        user_phone: '+5511999999999',
        decision_method: 'llm' as const,
        intent_detected: 'pricing',
        confidence: 0.85,
        tokens_used: 500,
        api_cost_usd: 0.01,
        model_used: 'gpt-4o-mini',
        response_time_ms: 1500,
        reply_size_chars: 120,
        timestamp: new Date('2025-01-01T10:00:00Z')
      };

      await telemetryService.recordTurn(turnEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📊 [TELEMETRY-TURN]',
        expect.objectContaining({
          tenant_id: 'tenant123',
          session_id: 'session456',
          decision_method: 'llm',
          intent: 'pricing',
          confidence: 0.85,
          tokens: 500,
          cost: 0.01,
          response_time: 1500,
          reply_size: 120,
          timestamp: '2025-01-01T10:00:00.000Z'
        })
      );
    });

    it('registra evento de turn para flow_lock (sem métricas LLM)', async () => {
      const turnEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        user_phone: '+5511999999999',
        decision_method: 'flow_lock' as const,
        intent_detected: null,
        confidence: null,
        tokens_used: 0,
        api_cost_usd: 0,
        model_used: null,
        response_time_ms: 800,
        reply_size_chars: 50,
        timestamp: new Date('2025-01-01T10:00:00Z')
      };

      await telemetryService.recordTurn(turnEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📊 [TELEMETRY-TURN]',
        expect.objectContaining({
          decision_method: 'flow_lock',
          intent: null,
          confidence: null,
          tokens: 0,
          cost: 0
        })
      );
    });

    it('falha graciosamente em caso de erro', async () => {
      // Simula erro no console.log
      consoleSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      const turnEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        user_phone: '+5511999999999',
        decision_method: 'regex' as const,
        intent_detected: 'greeting',
        confidence: 0.95,
        tokens_used: 0,
        api_cost_usd: 0,
        model_used: null,
        response_time_ms: 300,
        reply_size_chars: 25,
        timestamp: new Date()
      };

      // Não deve lançar erro
      await expect(telemetryService.recordTurn(turnEvent)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ [TELEMETRY] Erro ao registrar turn:',
        expect.any(Error)
      );
    });
  });

  describe('recordOutcome', () => {
    it('registra evento de outcome com sucesso', async () => {
      const outcomeEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        outcome: 'appointment_confirmed',
        reason: 'explicit_confirm_intent',
        timestamp: new Date('2025-01-01T10:05:00Z')
      };

      await telemetryService.recordOutcome(outcomeEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        '🎯 [TELEMETRY-OUTCOME]',
        expect.objectContaining({
          tenant_id: 'tenant123',
          session_id: 'session456',
          outcome: 'appointment_confirmed',
          reason: 'explicit_confirm_intent',
          timestamp: '2025-01-01T10:05:00.000Z'
        })
      );
    });

    it('registra outcome sem reason', async () => {
      const outcomeEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        outcome: 'conversation_abandoned',
        reason: null,
        timestamp: new Date('2025-01-01T10:05:00Z')
      };

      await telemetryService.recordOutcome(outcomeEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        '🎯 [TELEMETRY-OUTCOME]',
        expect.objectContaining({
          outcome: 'conversation_abandoned',
          reason: null
        })
      );
    });

    it('falha graciosamente em caso de erro', async () => {
      consoleSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      const outcomeEvent = {
        tenant_id: 'tenant123',
        session_id: 'session456',
        outcome: 'test_outcome',
        reason: 'test_reason',
        timestamp: new Date()
      };

      await expect(telemetryService.recordOutcome(outcomeEvent)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ [TELEMETRY] Erro ao registrar outcome:',
        expect.any(Error)
      );
    });
  });

  describe('recordMetrics', () => {
    it('registra métricas agregadas', async () => {
      const metrics = {
        tenant_id: 'tenant123',
        period: '1h' as const,
        total_turns: 45,
        total_llm_calls: 12,
        total_cost_usd: 0.25,
        avg_response_time_ms: 1200,
        top_intents: [
          { intent: 'pricing', count: 15 },
          { intent: 'availability', count: 10 },
          { intent: 'greeting', count: 8 }
        ],
        timestamp: new Date('2025-01-01T11:00:00Z')
      };

      await telemetryService.recordMetrics(metrics);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📈 [TELEMETRY-METRICS]',
        expect.objectContaining({
          tenant_id: 'tenant123',
          period: '1h',
          summary: {
            turns: 45,
            llm_calls: 12,
            cost: 0.25,
            avg_response_time: 1200
          },
          top_intents: [
            { intent: 'pricing', count: 15 },
            { intent: 'availability', count: 10 },
            { intent: 'greeting', count: 8 }
          ],
          timestamp: '2025-01-01T11:00:00.000Z'
        })
      );
    });

    it('falha graciosamente em caso de erro', async () => {
      consoleSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      const metrics = {
        tenant_id: 'tenant123',
        period: '1d' as const,
        total_turns: 100,
        total_llm_calls: 25,
        total_cost_usd: 0.50,
        avg_response_time_ms: 1000,
        top_intents: [],
        timestamp: new Date()
      };

      await expect(telemetryService.recordMetrics(metrics)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ [TELEMETRY] Erro ao registrar métricas:',
        expect.any(Error)
      );
    });
  });
});