/**
 * Types and interfaces shared across webhook modules
 */

export type UserContext = 'novo_user' | 'novo_no_tenant' | 'existente';

export interface WebhookMessage {
  messageText: string;
  userPhone: string;
  whatsappNumber?: string;
  tenantId?: string;
  messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
  isDemo?: boolean;
}

export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

// ===== INTENT ALLOWLIST - Apenas UserIntents reais =====
export const ALLOWED_INTENTS = new Set<string>([
  'greeting',
  'services',
  'pricing',
  'availability',
  'my_appointments',
  'address',
  'business_hours',
  'cancel_appointment',  // Corrigido: 'cancel' → 'cancel_appointment'
  'reschedule',
  'confirm',
  'booking',             // Adicionado: core intent
  'error',
  'unknown',
  'general_inquiry'      // Fallback
]);

/**
 * Mapeia intent detectado para um conversation_outcome válido.
 */
export function mapIntentToConversationOutcome(
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

/**
 * Helper para determinar contexto de usuário (novo, novo_no_tenant, existente)
 */
export async function determineUserContext(user: any, tenantId: string): Promise<UserContext> {
  if (!user) return 'novo_user';
  if (user && !(user.tenants || []).includes(tenantId)) return 'novo_no_tenant';
  return 'existente';
}