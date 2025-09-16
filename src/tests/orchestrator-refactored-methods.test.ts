/**
 * Testes unitários para os métodos refatorados do WebhookFlowOrchestrator
 * Testa: persistMessage, afterReplySideEffects e integração com novos services
 */

import { jest } from '@jest/globals';
import { WebhookFlowOrchestratorService } from '../services/webhook-flow-orchestrator.service';
import { ConversationHistoryPersistence } from '../services/conversation-history-persistence.service';
import { TelemetryService } from '../services/telemetry.service';
import { OutcomeAnalyzer } from '../services/outcome-analyzer.service';

// Mock dos serviços
jest.mock('../services/conversation-history-persistence.service');
jest.mock('../services/telemetry.service');
jest.mock('../services/outcome-analyzer.service');

describe('WebhookFlowOrchestrator - Métodos Refatorados', () => {
  let orchestrator: WebhookFlowOrchestratorService;
  let mockPersistence: jest.Mocked<ConversationHistoryPersistence>;
  let mockTelemetry: jest.Mocked<TelemetryService>;
  let mockOutcomeAnalyzer: jest.Mocked<OutcomeAnalyzer>;

  beforeEach(() => {
    // Reset dos mocks
    jest.clearAllMocks();
    
    // Criar instância do orchestrator
    orchestrator = new WebhookFlowOrchestratorService();
    
    // Acessar os mocks dos serviços privados
    mockPersistence = (orchestrator as any).conversationHistoryPersistence;
    mockTelemetry = (orchestrator as any).telemetry;
    mockOutcomeAnalyzer = (orchestrator as any).outcomeAnalyzerService;
  });

  describe('persistMessage', () => {
    const mockContext = {
      tenantId: 'tenant123',
      userId: 'user456',
      sessionId: 'session789',
      message: 'test message',
      userPhone: '+5511999999999',
      tenantConfig: {},
      priorContext: {}
    };

    it('não persiste intent/confidence quando decision_method é flow_lock', async () => {
      const decision = {
        intent: 'some_intent',
        confidence: 0.8,
        decisionMethod: 'flow_lock' as const,
        source: 'flow_lock' as const,
        reason: 'flow active',
        tokensUsed: 100,
        apiCostUsd: 0.01,
        modelUsed: 'gpt-4'
      };

      await (orchestrator as any).persistMessage(mockContext, decision, 'Hello!');

      expect(mockPersistence.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant123',
          user_id: 'user456',
          session_id_uuid: 'session789',
          intent_detected: null, // ✅ Deve ser null para flow_lock
          confidence_score: null, // ✅ Deve ser null para flow_lock
          tokens_used: 0, // ✅ Deve ser 0 para flow_lock
          api_cost_usd: 0, // ✅ Deve ser 0 para flow_lock
          model_used: null, // ✅ Deve ser null para flow_lock
          decision_method: 'flow_lock',
          content: 'Hello!'
        })
      );
    });

    it('persiste métricas completas quando decision_method é llm', async () => {
      const decision = {
        intent: 'pricing',
        confidence: 0.85,
        decisionMethod: 'llm' as const,
        source: 'llm' as const,
        reason: 'llm classification',
        tokensUsed: 555,
        apiCostUsd: 0.012,
        modelUsed: 'gpt-4o-mini'
      };

      await (orchestrator as any).persistMessage(mockContext, decision, { text: 'Posso ajudar com preços!' });

      expect(mockPersistence.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_detected: 'pricing', // ✅ Deve manter o intent para LLM
          confidence_score: 0.85, // ✅ Deve manter a confidence para LLM
          tokens_used: 555, // ✅ Deve persistir tokens usados
          api_cost_usd: 0.012, // ✅ Deve persistir custo da API
          model_used: 'gpt-4o-mini', // ✅ Deve persistir modelo usado
          decision_method: 'llm',
          content: 'Posso ajudar com preços!'
        })
      );
    });

    it('persiste intent mas não métricas LLM quando decision_method é regex', async () => {
      const decision = {
        intent: 'greeting',
        confidence: 0.95,
        decisionMethod: 'regex' as const,
        source: 'regex' as const,
        reason: 'regex match',
        tokensUsed: undefined,
        apiCostUsd: undefined,
        modelUsed: undefined
      };

      await (orchestrator as any).persistMessage(mockContext, decision, 'Olá! Como posso ajudar?');

      expect(mockPersistence.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_detected: 'greeting', // ✅ Deve manter o intent para regex
          confidence_score: 0.95, // ✅ Deve manter a confidence para regex
          tokens_used: 0, // ✅ Deve ser 0 para regex (sem LLM)
          api_cost_usd: 0, // ✅ Deve ser 0 para regex (sem LLM)
          model_used: null, // ✅ Deve ser null para regex (sem LLM)
          decision_method: 'regex'
        })
      );
    });
  });

  describe('afterReplySideEffects', () => {
    const mockContext = {
      tenantId: 'tenant123',
      userId: 'user456',
      sessionId: 'session789',
      message: 'test message',
      userPhone: '+5511999999999',
      tenantConfig: {},
      priorContext: {}
    };

    beforeEach(() => {
      // Mock do latency tracker
      (orchestrator as any).latency = {
        getTurnDuration: jest.fn().mockReturnValue(1500),
        clearTurn: jest.fn()
      };
    });

    it('registra telemetria para todos os tipos de decision', async () => {
      const decision = {
        intent: 'availability',
        confidence: 0.7,
        decisionMethod: 'llm' as const,
        source: 'llm' as const,
        reason: 'llm classification',
        tokensUsed: 350,
        apiCostUsd: 0.008,
        modelUsed: 'gpt-4o-mini'
      };

      await (orchestrator as any).afterReplySideEffects(mockContext, decision, 'Temos horários disponíveis!');

      expect(mockTelemetry.recordTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant123',
          session_id: 'session789',
          user_phone: '+5511999999999',
          decision_method: 'llm',
          intent_detected: 'availability',
          confidence: 0.7,
          tokens_used: 350,
          api_cost_usd: 0.008,
          model_used: 'gpt-4o-mini',
          response_time_ms: 1500,
          reply_size_chars: 27
        })
      );
    });

    it('não registra intent/confidence para flow_lock na telemetria', async () => {
      const decision = {
        intent: 'some_intent',
        confidence: 0.8,
        decisionMethod: 'flow_lock' as const,
        source: 'flow_lock' as const,
        reason: 'flow active'
      };

      await (orchestrator as any).afterReplySideEffects(mockContext, decision, 'Continuing flow...');

      expect(mockTelemetry.recordTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_detected: null, // ✅ Deve ser null para flow_lock
          confidence: null, // ✅ Deve ser null para flow_lock
          tokens_used: 0,
          api_cost_usd: 0,
          model_used: null
        })
      );
    });

    it('executa análise de outcome e registra quando final', async () => {
      const decision = {
        intent: 'confirm',
        confidence: 0.9,
        decisionMethod: 'regex' as const,
        source: 'regex' as const,
        reason: 'confirmation detected'
      };

      // Mock do outcome analyzer retornando outcome final
      mockOutcomeAnalyzer.maybeDeriveOutcome.mockResolvedValue({
        final: true,
        value: 'appointment_confirmed',
        reason: 'explicit_confirm_intent'
      });

      await (orchestrator as any).afterReplySideEffects(mockContext, decision, 'Agendamento confirmado!');

      // Verifica se a análise foi chamada
      expect(mockOutcomeAnalyzer.maybeDeriveOutcome).toHaveBeenCalledWith({
        tenant_id: 'tenant123',
        session_id: 'session789',
        intent: 'confirm',
        decision_method: 'regex',
        context: {},
        reply: 'Agendamento confirmado!'
      });

      // Verifica se o outcome foi registrado na telemetria
      expect(mockTelemetry.recordOutcome).toHaveBeenCalledWith({
        tenant_id: 'tenant123',
        session_id: 'session789',
        outcome: 'appointment_confirmed',
        reason: 'explicit_confirm_intent',
        timestamp: expect.any(Date)
      });
    });

    it('não registra outcome quando análise retorna null', async () => {
      const decision = {
        intent: 'availability',
        confidence: 0.7,
        decisionMethod: 'llm' as const,
        source: 'llm' as const,
        reason: 'ongoing conversation'
      };

      // Mock do outcome analyzer retornando null (sem outcome final)
      mockOutcomeAnalyzer.maybeDeriveOutcome.mockResolvedValue(null);

      await (orchestrator as any).afterReplySideEffects(mockContext, decision, 'Como posso ajudar mais?');

      expect(mockOutcomeAnalyzer.maybeDeriveOutcome).toHaveBeenCalled();
      expect(mockTelemetry.recordOutcome).not.toHaveBeenCalled();
    });

    it('limpa o tracker de latência após execução', async () => {
      const decision = {
        intent: 'greeting',
        confidence: 0.95,
        decisionMethod: 'regex' as const,
        source: 'regex' as const,
        reason: 'greeting detected'
      };

      mockOutcomeAnalyzer.maybeDeriveOutcome.mockResolvedValue(null);

      await (orchestrator as any).afterReplySideEffects(mockContext, decision, 'Olá!');

      expect((orchestrator as any).latency.clearTurn).toHaveBeenCalledWith('session789');
    });

    it('falha graciosamente em caso de erro sem quebrar o fluxo', async () => {
      const decision = {
        intent: 'test',
        confidence: 0.5,
        decisionMethod: 'llm' as const,
        source: 'llm' as const,
        reason: 'test'
      };

      // Simula erro na telemetria
      mockTelemetry.recordTurn.mockRejectedValue(new Error('Telemetry failed'));

      // Não deve lançar erro
      await expect((orchestrator as any).afterReplySideEffects(mockContext, decision, 'test'))
        .resolves.not.toThrow();

      // Ainda deve tentar limpar a latência
      expect((orchestrator as any).latency.clearTurn).toHaveBeenCalledWith('session789');
    });
  });

  describe('Integração - Latency Tracker', () => {
    it('cria tracker de latência corretamente', () => {
      const latency = (orchestrator as any).createLatencyTracker();

      expect(latency).toHaveProperty('now');
      expect(latency).toHaveProperty('turnStart');
      expect(latency).toHaveProperty('getTurnDuration');
      expect(latency).toHaveProperty('clearTurn');
    });

    it('tracker calcula duração corretamente', () => {
      const latency = (orchestrator as any).createLatencyTracker();
      const sessionId = 'test-session';

      const start = latency.turnStart(sessionId);
      expect(start).toBeGreaterThan(0);

      // Simula passagem de tempo
      jest.spyOn(Date, 'now').mockReturnValue(start + 1000);

      const duration = latency.getTurnDuration(sessionId);
      expect(duration).toBe(1000);

      latency.clearTurn(sessionId);
      expect(latency.getTurnDuration(sessionId)).toBe(0);
    });
  });
});