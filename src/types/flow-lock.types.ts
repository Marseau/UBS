/**
 * Flow Lock System - Tipos e interfaces para sincronização de intenções
 * Baseado na Ordem de Serviço: Sincronizar Intenções e Evitar Mistura
 */

export type FlowType = 
  | 'onboarding' 
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
  | 'confirm'
  | 'complete'
  | 'abandoned';

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
  
  // Estatísticas de intent
  intent_history: {
    intent: string;
    confidence: number;
    timestamp: string;
    decision_method: 'command' | 'dictionary' | 'regex' | 'llm';
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