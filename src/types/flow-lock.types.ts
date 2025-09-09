/**
 * Flow Lock System - Tipos e interfaces para sincronização de intenções
 * Baseado na Ordem de Serviço: Sincronizar Intenções e Evitar Mistura
 */

export type FlowType = 
  | 'onboarding' 
  | 'returning_user'
  | 'pricing' 
  | 'booking' 
  | 'reschedule' 
  | 'cancel' 
  | 'institutional' 
  | 'handoff' 
  | 'greeting' 
  | 'general'
  | null;

export type FlowStep = 
  | 'start'
  | 'collect_service' 
  | 'collect_datetime'
  | 'collect_id'
  | 'collect_email'
  | 'collect_gender'
  | 'collect_confirmation'
  | 'show_slots'
  | 'select_time_slot'
  | 'confirm_cancel'
  | 'confirm'
  | 'complete'
  | 'abandoned'
  | 'need_name'
  | 'need_email'
  | 'need_gender'
  | 'ask_additional_data'
  | 'need_birthday'
  | 'need_birth_date'
  | 'need_address'
  | 'finish';

export type FlowPriority = 'high' | 'medium' | 'low';

export interface FlowLock {
  active_flow: FlowType;
  step: FlowStep;
  expires_at: string;
  created_at: string;
  priority: FlowPriority;
  next_flow_hint?: FlowType;
  step_data?: Record<string, any>;
}

export interface EnhancedConversationContext {
  // Campos existentes (compatibilidade)
  session_id: string;
  session_started_at: string;
  last_message_at: string;
  duration_ms: number;
  duration_minutes: number;
  message_count: number;
  tenant_id: string;
  domain: string;
  source: 'whatsapp' | 'demo';
  mode: 'demo' | 'prod';
  
  // Extensões para Flow Lock
  flow_lock?: FlowLock | null;
  
  // Sistema de Coleta Progressiva de Dados
  last_data_collection_attempt?: string;
  last_data_collection_success?: string;
  awaiting_data_fields?: string[];
  data_collection_state?: string;
  awaiting_data_input?: boolean;
  
  // Estatísticas de intent
  intent_history: {
    intent: string | null;
    confidence: number;
    timestamp: string;
    decision_method: 'command' | 'dictionary' | 'regex' | 'llm' | 'none';
  }[];
  
  // Compatibilidade legada
  chat_duration?: number;
  platform?: string;
  timestamp?: string;
}

export interface IntentDetectionResult {
  intent: string;
  confidence: number;
  decision_method: 'command' | 'dictionary' | 'regex' | 'llm';
  allowed_by_flow_lock: boolean;
  current_flow: FlowType;
  metadata: {
    raw_input: string;
    processing_time_ms: number;
    flow_override_attempted?: boolean;
    deterministic_match?: string;
  };
}

export interface FlowLockDecision {
  allow_intent: boolean;
  current_flow: FlowType;
  current_step: FlowStep;
  suggested_response: string;
  action: 'continue' | 'abort' | 'timeout' | 'complete';
  expires_at: string;
}