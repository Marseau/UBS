/**
 * USER INTENT SYSTEM - Intenções Reais do Usuário
 * APENAS intenções que o usuário pode expressar diretamente
 * Estados de sistema/flow movidos para SystemFlowState
 */

// ✅ ENUM PURO: Apenas intents reais de negócio (sem flow states)
export type BusinessIntent =
  | 'greeting' | 'services' | 'pricing' | 'availability' | 'my_appointments'
  | 'address' | 'payments' | 'business_hours' | 'cancel' | 'reschedule'
  | 'confirm' | 'modify_appointment' | 'policies' | 'wrong_number'
  | 'booking_abandoned' | 'appointment_inquiry' | 'booking';

/**
 * SYSTEM FLOW STATES - Estados do Sistema de Conversação
 * Estados internos que o sistema gerencia (NÃO são intenções do usuário)
 */
export enum SystemFlowState {
  // Data Collection States
  DATA_COLLECTION = 'data_collection',
  
  // Onboarding Flow States  
  ONBOARDING = 'onboarding',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  ONBOARDING_CLARIFICATION = 'onboarding_clarification',
  
  // Returning User Flow States
  RETURNING_USER_NEED_EMAIL = 'returning_user_need_email',
  RETURNING_USER_CONSENT = 'returning_user_consent',
  RETURNING_USER_COMPLETE = 'returning_user_complete',
  RETURNING_USER_CONSENT_GRANTED = 'returning_user_consent_granted',
  RETURNING_USER_CONSENT_CLARIFY = 'returning_user_consent_clarify',
  RETURNING_USER_DECLINED_ADDITIONAL = 'returning_user_declined_additional',
  RETURNING_USER_DECLINED_DATA = 'returning_user_declined_data',
  RETURNING_USER_DECLINED_EMAIL = 'returning_user_declined_email',
  RETURNING_USER_EMAIL_SAVED = 'returning_user_email_saved',
  RETURNING_USER_INVALID_EMAIL = 'returning_user_invalid_email',
  RETURNING_USER_FALLBACK = 'returning_user_fallback',
  
  // Booking Flow States
  BOOKING_ABANDONED = 'booking_abandoned',
  RESCHEDULE_COMPLETED = 'reschedule_completed',
  
  // System Management States
  SYSTEM_CLARIFICATION = 'system_clarification',
  DISAMBIGUATION_REQUEST = 'disambiguation_request',
  
  // Timeout Management States
  TIMEOUT_WARNING = 'timeout_warning',
  TIMEOUT_CHECKING = 'timeout_checking',
  TIMEOUT_FINALIZING = 'timeout_finalizing'
}

// Backward compatibility aliases
export type MessageIntent = BusinessIntent;
export type IntentKey = BusinessIntent;
export type UserIntent = BusinessIntent; // Para compatibilidade

// Unified type for all possible values (intents + flow states) 
export type UnifiedIntent = BusinessIntent | SystemFlowState;

// Utility types
export const VALID_INTENTS: BusinessIntent[] = [
  'greeting', 'services', 'pricing', 'availability', 'my_appointments',
  'address', 'payments', 'business_hours', 'cancel', 'reschedule',
  'confirm', 'modify_appointment', 'policies', 'wrong_number',
  'booking_abandoned', 'appointment_inquiry', 'booking'
];
export const VALID_FLOW_STATES = Object.values(SystemFlowState) as string[];
export const ALL_VALID_TYPES = [...VALID_INTENTS, ...VALID_FLOW_STATES];

// Intent categories para intenções reais do usuário
export const INTENT_CATEGORIES = {
  BOOKING_ACTIONS: [
    'booking', 'cancel', 'reschedule', 'confirm', 'availability', 'my_appointments',
    'modify_appointment', 'appointment_inquiry'
  ] as BusinessIntent[],
  INFORMATIONAL: [
    'greeting', 'services', 'pricing', 'address', 'business_hours',
    'payments', 'policies'
  ] as BusinessIntent[],
  SYSTEM: [
    'wrong_number', 'booking_abandoned'
  ] as BusinessIntent[]
} as const;

// Flow state categories para estados do sistema
export const FLOW_STATE_CATEGORIES = {
  ONBOARDING_STATES: [
    SystemFlowState.ONBOARDING,
    SystemFlowState.ONBOARDING_COMPLETED,
    SystemFlowState.ONBOARDING_CLARIFICATION
  ],
  RETURNING_USER_STATES: [
    SystemFlowState.RETURNING_USER_NEED_EMAIL,
    SystemFlowState.RETURNING_USER_CONSENT,
    SystemFlowState.RETURNING_USER_COMPLETE,
    SystemFlowState.RETURNING_USER_CONSENT_GRANTED,
    SystemFlowState.RETURNING_USER_CONSENT_CLARIFY,
    SystemFlowState.RETURNING_USER_DECLINED_ADDITIONAL,
    SystemFlowState.RETURNING_USER_DECLINED_DATA,
    SystemFlowState.RETURNING_USER_DECLINED_EMAIL,
    SystemFlowState.RETURNING_USER_EMAIL_SAVED,
    SystemFlowState.RETURNING_USER_INVALID_EMAIL,
    SystemFlowState.RETURNING_USER_FALLBACK
  ],
  BOOKING_STATES: [
    SystemFlowState.BOOKING_ABANDONED,
    SystemFlowState.RESCHEDULE_COMPLETED
  ],
  SYSTEM_MANAGEMENT_STATES: [
    SystemFlowState.SYSTEM_CLARIFICATION,
    SystemFlowState.DISAMBIGUATION_REQUEST,
    SystemFlowState.DATA_COLLECTION,
    SystemFlowState.TIMEOUT_WARNING,
    SystemFlowState.TIMEOUT_CHECKING,
    SystemFlowState.TIMEOUT_FINALIZING
  ]
} as const;

// Validation helpers
export function isValidIntent(intent: string): intent is BusinessIntent {
  return VALID_INTENTS.includes(intent as BusinessIntent);
}

export function isValidFlowState(state: string): state is SystemFlowState {
  return VALID_FLOW_STATES.includes(state);
}

export function isValidType(value: string): value is UnifiedIntent {
  return ALL_VALID_TYPES.includes(value);
}

// Priority order para detecção determinística (APENAS intenções reais)
export const INTENT_PRIORITY: BusinessIntent[] = [
  // Core business intents primeiro (independente da frequência)
  'booking',                       // CORE: Criar agendamento
  'appointment_inquiry',           // CORE: Agendar (genérico)
  'reschedule',                    // CORE: Reagendar
  'cancel',                        // CORE: Cancelar
  'confirm',                       // CORE: Confirmar
  'availability',                  // CORE: Ver disponibilidade

  // Customer information intents
  'greeting',                      // Cumprimento inicial
  'services',                      // Serviços
  'pricing',                       // Preços
  'address',                       // Endereço
  'business_hours',                // Horário funcionamento
  'my_appointments',               // Meus agendamentos

  // System fallbacks
  'wrong_number'                   // fallback técnico
];