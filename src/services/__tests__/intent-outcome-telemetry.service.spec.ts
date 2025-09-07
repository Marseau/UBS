/**
 * Teste de Integração - IntentOutcomeTelemetryService
 * Testes reais com Redis e Supabase (sem mocks)
 * Foco: validar captura de métricas Intent vs Outcome
 */

import { IntentOutcomeTelemetryService } from '../intent-outcome-telemetry.service';
import { v4 as uuidv4 } from 'uuid';

describe('IntentOutcomeTelemetryService - Integration Tests', () => {
  let service: IntentOutcomeTelemetryService;
  let testTenantId: string;
  let testSessionId: string;
  let testUserPhone: string;

  beforeEach(() => {
    service = new IntentOutcomeTelemetryService();
    testTenantId = '62727346-9068-4b22-b6bb-34bfffd29d45'; // Tenant real válido
    testSessionId = uuidv4();
    testUserPhone = '+5511999990000';
  });

  describe('Fluxo completo Intent → Outcome', () => {
    it('deve registrar intent, outcome e calcular métricas corretamente', async () => {
      // 1. Registrar intent
      await service.recordIntentDetected(
        testTenantId,
        testSessionId,
        testUserPhone,
        'availability'
      );

      // 2. Aguardar 1 segundo para simular tempo de processamento
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Registrar outcome
      await service.recordOutcomeFinalized(testSessionId, 'appointment_created');

      // 4. Aguardar para garantir persistência
      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. Calcular métricas
      const metrics = await service.getConversionMetrics(testTenantId, 1);

      // 6. Validar estrutura das métricas
      expect(metrics).toEqual({
        total_intents: expect.any(Number),
        total_outcomes: expect.any(Number),
        conversion_rate: expect.any(Number),
        avg_conversion_time_seconds: expect.any(Number),
        abandonment_rate: expect.any(Number),
        top_intents: expect.any(Array),
        top_outcomes: expect.any(Array)
      });

      // 7. Validar que houve pelo menos 1 intent registrado
      expect(metrics.total_intents).toBeGreaterThan(0);
      
      console.log('✅ [TEST] Métricas calculadas:', {
        total_intents: metrics.total_intents,
        total_outcomes: metrics.total_outcomes,
        conversion_rate: `${metrics.conversion_rate}%`,
        avg_conversion_time: `${metrics.avg_conversion_time_seconds}s`
      });
    }, 10000); // Timeout de 10 segundos
  });

  describe('Fluxo de abandono', () => {
    it('deve registrar intent abandonado corretamente', async () => {
      const abandonedSessionId = uuidv4();

      // 1. Registrar intent
      await service.recordIntentDetected(
        testTenantId,
        abandonedSessionId,
        testUserPhone,
        'reschedule'
      );

      // 2. Simular abandono
      await service.recordConversationAbandoned(abandonedSessionId, 'intent_only');

      // 3. Aguardar persistência
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. Calcular métricas
      const metrics = await service.getConversionMetrics(testTenantId, 1);

      // 5. Validar que abandono foi registrado
      expect(metrics.abandonment_rate).toBeGreaterThan(0);
      
      console.log('⚠️ [TEST] Abandono registrado - Taxa:', `${metrics.abandonment_rate}%`);
    }, 10000);
  });

  describe('Validação de parâmetros', () => {
    it('deve funcionar com diferentes tipos de intent e outcome', async () => {
      const intents = ['availability', 'reschedule', 'cancel', 'info_request'];
      const outcomes = ['appointment_created', 'appointment_rescheduled', 'appointment_cancelled', 'info_request_fulfilled'];
      
      // Registrar múltiplos intents
      for (let i = 0; i < intents.length; i++) {
        const sessionId = uuidv4();
        const intent = intents[i]!; // Non-null assertion
        const outcome = outcomes[i]!; // Non-null assertion

        await service.recordIntentDetected(testTenantId, sessionId, testUserPhone, intent);
        
        // 50% dos casos finalizar outcome, 50% abandonar
        if (i % 2 === 0) {
          await service.recordOutcomeFinalized(sessionId, outcome);
        } else {
          await service.recordConversationAbandoned(sessionId, 'intent_only');
        }
      }

      // Aguardar persistência
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Calcular métricas finais
      const metrics = await service.getConversionMetrics(testTenantId, 1);
      
      console.log('📊 [TEST] Métricas finais com múltiplos intents:', {
        total_intents: metrics.total_intents,
        conversion_rate: `${metrics.conversion_rate}%`,
        top_intents: metrics.top_intents.slice(0, 3),
        top_outcomes: metrics.top_outcomes.slice(0, 3)
      });

      // Validar que temos dados
      expect(metrics.total_intents).toBeGreaterThan(0);
      expect(metrics.top_intents.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Performance e concorrência', () => {
    it('deve processar múltiplas sessões simultâneas', async () => {
      const concurrentSessions = 5;
      const promises: Promise<void>[] = [];

      // Criar múltiplas sessões simultâneas
      for (let i = 0; i < concurrentSessions; i++) {
        const sessionId = uuidv4();
        const phone = `+551199999${String(i).padStart(4, '0')}`;
        
        const promise = (async () => {
          await service.recordIntentDetected(testTenantId, sessionId, phone, 'availability');
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1000)); // Random delay
          await service.recordOutcomeFinalized(sessionId, 'appointment_created');
        })();
        
        promises.push(promise);
      }

      // Aguardar todas as sessões
      await Promise.all(promises);
      
      // Aguardar persistência
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Validar métricas
      const metrics = await service.getConversionMetrics(testTenantId, 1);
      
      console.log('🚀 [TEST] Processamento concorrente:', {
        sessions_processed: concurrentSessions,
        total_recorded: metrics.total_intents,
        conversion_rate: `${metrics.conversion_rate}%`
      });

      expect(metrics.total_intents).toBeGreaterThanOrEqual(concurrentSessions);
    }, 20000);
  });
});