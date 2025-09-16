/**
 * WhatsApp Webhook V3 Routes - REFATORADO
 * Versão simplificada que usa a nova arquitetura modular
 * Mantém 100% compatibilidade com interface externa
 */

import express from 'express';
import webhookMainRouter from './webhook/webhook-main.routes';

const router = express.Router();

// ===== Contexto de usuário helper (mantido para compatibilidade) =====
async function determineUserContext(user: any, tenantId: string) {
  if (!user) return 'novo_user';
  if (user && !(user.tenants || []).includes(tenantId)) return 'novo_no_tenant';
  return 'existente';
}

// ===== MAPEAMENTO DE INTENTS (preservado da versão original) =====
const ALLOWED_INTENTS = new Set<string>([
  'greeting',
  'services',
  'pricing',
  'availability',
  'my_appointments',
  'address',
  'business_hours',
  'cancel_appointment',
  'reschedule',
  'confirm',
  'booking',
  'error',
  'unknown',
  'general_inquiry'
]);

/**
 * Mapeia intent detectado para conversation_outcome válido
 * (Preservado da lógica original)
 */
function mapIntentToConversationOutcome(
  intent: string | undefined,
  text: string,
  shouldSendWhatsApp: boolean
): string {
  const DEFAULT_OUTCOME = 'info_request_fulfilled';

  if (!intent) {
    console.log('🔧 MAP DEBUG: No intent, retornando info_request_fulfilled');
    return DEFAULT_OUTCOME;
  }

  // Padrões diretos no texto
  const isCancel = /cancelar\s+([0-9a-fA-F-]{8,})/i.test(text);
  const isReschedule = /remarcar\s+([0-9a-fA-F-]{8,})/i.test(text);

  if (shouldSendWhatsApp && isCancel) {
    console.log('🔧 MAP DEBUG: appointment_cancelled');
    return 'appointment_cancelled';
  }
  if (shouldSendWhatsApp && isReschedule) {
    console.log('🔧 MAP DEBUG: appointment_rescheduled');
    return 'appointment_rescheduled';
  }

  switch (intent) {
    case 'my_appointments':   return 'appointment_inquiry';
    case 'services':          return 'service_inquiry';
    case 'pricing':           return 'price_inquiry';
    case 'address':           return 'location_inquiry';
    case 'business_hours':    return 'business_hours_inquiry';
    case 'booking':           return shouldSendWhatsApp ? 'appointment_created' : 'appointment_inquiry';
    case 'reschedule':        return 'appointment_modified';
    case 'cancel':            return 'appointment_cancelled';
    case 'confirm':           return 'appointment_confirmed';
    case 'personal_info':     return 'appointment_inquiry';
    case 'greeting':
    case 'policies':
    case 'payments':
    case 'handoff':
    case 'general':
    default:                  return DEFAULT_OUTCOME;
  }
}

// ===== USAR ROUTER MODULAR =====
router.use('/', webhookMainRouter);

// ===== Endpoint de Health Check =====
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'whatsapp-webhook-v3-refactored',
    timestamp: new Date().toISOString(),
    version: '2.0.0-modular'
  });
});

// ===== Endpoint de Status para Debug =====
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    architecture: 'modular',
    components: {
      orchestrator: 'OrchestratorCoreService',
      intent_detection: 'IntentDetectionOrchestrator',
      data_collection: 'DataCollectionOrchestrator',
      response_generation: 'ResponseGenerationOrchestrator',
      telemetry: 'TelemetryOrchestrator'
    },
    features: {
      regex_llm_escalation: true,
      deterministic_onboarding: true,
      real_data_only: true,
      demo_parity: true,
      flow_lock_system: true
    }
  });
});

export default router;

// Exportar funções utilitárias para compatibilidade
export {
  determineUserContext,
  ALLOWED_INTENTS,
  mapIntentToConversationOutcome
};