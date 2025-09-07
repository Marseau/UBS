/**
 * Teste do ContextualPoliciesService
 * Foco: registrar auditoria com session_id_uuid ao aplicar uma policy
 */

import { ContextualPoliciesService } from '../contextual-policies.service';
import { IntentKey } from '../deterministic-intent-detector.service';

// ───────────────────────────────────────────────────────────────────────────────
// Mocks: Redis e Supabase
// ───────────────────────────────────────────────────────────────────────────────

// Mock do Redis: chaves básicas usadas no serviço
jest.mock('../../config/redis-production.config', () => {
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  };
  return {
    RedisProductionConfig: {
      getRedisInstance: () => mockRedis,
    },
  };
});

// Mock do Supabase Admin
const insertSpy = jest.fn().mockResolvedValue({ error: null });
const selectChain = {
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({
    data: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Bloquear fora do horário',
        intent: 'availability',
        priority: 1,
        enabled: true,
        tenant_scoped: true,
        business_policy_conditions: [
          // sem condição para simplificar o teste de fluxo (poderia simular time/day aqui)
        ],
        business_policy_actions: [
          { id: 'a1', type: 'block', target: null, message: 'Fora do expediente', metadata_json: null },
          { id: 'a2', type: 'add_context', target: null, message: null, metadata_json: { policy: 'out_of_hours' } },
        ],
      },
    ],
    error: null,
  }),
};
const fromChain = {
  select: jest.fn(() => selectChain),
  insert: insertSpy,
};

jest.mock('../../config/database', () => ({
  supabaseAdmin: {
    // RPCs usadas no serviço
    rpc: jest.fn((fnName: string) => {
      if (fnName === 'get_user_context_complete') {
        return Promise.resolve({
          data: [
            {
              user_id: '22222222-2222-2222-2222-222222222222',
              name: 'Cliente Teste',
              email: 'cli@teste.com',
              phone: '+5511999990000',
              is_new_user: false,
              total_appointments: 3,
              last_appointment_time: null,
              last_interaction_time: new Date().toISOString(),
              vip_status: false,
              cancelled_count: 0,
              noshow_count: 0,
              avg_days_between_appointments: 30,
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        });
      }
      if (fnName === 'get_tenant_timezone') {
        return Promise.resolve({ data: 'America/Sao_Paulo', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: jest.fn((_table: string) => fromChain),
  },
}));

// ───────────────────────────────────────────────────────────────────────────────
// Caso de teste
// ───────────────────────────────────────────────────────────────────────────────

describe('ContextualPoliciesService - auditoria com session_id_uuid', () => {
  const service = new ContextualPoliciesService();

  it('deve aplicar policy e registrar auditoria com session_id_uuid', async () => {
    const intent = 'availability' as IntentKey;
    const userPhone = '+5511999990000';
    const tenantId = '33333333-3333-3333-3333-333333333333';
    const sessionId = '44444444-4444-4444-4444-444444444444';

    // Contexto mínimo exigido pelo service
    const conversationContext: any = {
      flow_lock: { active_flow: 'idle', step: null },
      tenant_config: {
        business_rules: { working_hours: { monday: [], tuesday: [] } },
      },
    };

    const decision = await service.applyPolicies(
      intent,
      userPhone,
      tenantId,
      conversationContext,
      'quero marcar horário',
      sessionId
    );

    // 1) Decisão esperada (policy aplicada com "block")
    expect(decision.allowIntent).toBe(false);
    expect(decision.actionRequired).toBe('block');
    expect(decision.suggestedResponse).toBe('Fora do expediente');

    // 2) Auditoria: validar insert na tabela policy_applications com session_id_uuid
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0]; // primeiro argumento do insert

    expect(payload).toHaveProperty('policy_id', '11111111-1111-1111-1111-111111111111');
    expect(payload).toHaveProperty('tenant_id', tenantId);
    expect(payload).toHaveProperty('user_phone', userPhone);
    expect(payload).toHaveProperty('intent', intent);
    expect(payload).toHaveProperty('decision_action', 'block');
    expect(payload).toHaveProperty('reason_code'); // POLICY_BLOCK_<policyId>
    expect(payload).toHaveProperty('session_id_uuid', sessionId);
    expect(typeof payload.applied_at).toBe('string');
  });
});