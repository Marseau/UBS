/**
 * Tipos centralizados para o sistema de orquestração
 * Mantém compatibilidade com interfaces existentes
 */

export interface OrchestratorInput {
  messageText: string;
  userPhone: string;
  whatsappNumber?: string;
  tenantId?: string;
  isDemo?: boolean;
  messageSource?: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
}

export interface OrchestratorResult {
  success: boolean;
  aiResponse: string;
  intent?: string | null;
  conversationOutcome?: string | null;
  telemetryData?: TelemetryData;
  error?: string;
}

export interface TelemetryData {
  intent: string | null;
  decision_method: 'command' | 'dictionary' | 'regex' | 'llm' | 'none';
  confidence: number;
  processing_time_ms: number;
  model_used?: string;
  tokens_used?: number;
  api_cost_usd?: number;
  processing_cost_usd?: number;
}

export interface UserContext {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  gender?: string;
  isNewUser: boolean;
  needsOnboarding: boolean;
  onboardingStep?: string;
}

export interface TenantContext {
  id: string;
  name: string;
  domain: string;
  phone: string;
  business_name?: string;
}

// Estados de coleta progressiva de dados
export enum DataCollectionState {
  NEED_NAME = 'need_name',
  NEED_EMAIL = 'need_email',
  NEED_GENDER_CONFIRMATION = 'need_gender_confirmation',
  ASK_OPTIONAL_DATA_CONSENT = 'ask_optional_data_consent',
  NEED_BIRTH_DATE = 'need_birth_date',
  NEED_ADDRESS = 'need_address',
  COLLECTION_COMPLETE = 'collection_complete',
  // Additional states used in the codebase
  COMPLETED = 'completed',
  AWAITING_NAME = 'awaiting_name',
  AWAITING_EMAIL = 'awaiting_email',
  AWAITING_GENDER = 'awaiting_gender',
  IDLE = 'idle'
}

export interface OnboardingStep {
  state: DataCollectionState;
  prompt: string;
  validation?: (input: string) => boolean | string;
  nextState?: DataCollectionState;
}

// Additional types needed by orchestrator services
export interface FlowDecision {
  intent?: string | null;
  response: string;
  confidence?: number | null;
  reason?: string;
  decisionMethod?: 'flow_lock';
  shouldContinue: boolean;
  metadata?: any;
}

export interface OrchestratorContext {
  message: string;
  userPhone: string;
  tenantId: string;
  tenantConfig?: any;
  priorContext?: any;
  sessionId: string;
  userId: string;
  isDemo?: boolean;
}

export interface UserDataExtractionResult {
  extractedSuccessfully: boolean;
  name?: string;
  email?: string;
  gender?: string;
  birthDate?: string;
}

export interface OnboardingFlowResult {
  success: boolean;
  response: string;
  isComplete: boolean;
  shouldContinue: boolean;
  extractedData?: UserDataExtractionResult;
  nextState?: DataCollectionState;
  error?: string;
  aiMetrics?: {
    model_used: string;
    tokens: number;
    api_cost_usd: number;
    processing_time_ms: number;
  };
}

export interface WebhookOrchestrationResult {
  success: boolean;
  aiResponse: string;
  response: string; // Alias for aiResponse
  shouldSendWhatsApp: boolean;
  conversationOutcome: string | null;
  updatedContext: any; // EnhancedConversationContext
  error?: string;
  metadata?: any;
  telemetryData: {
    intent: string | null;
    confidence_score: number | null;
    decision_method: string;
    flow_lock_active: boolean;
    processing_time_ms: number;
    model_used?: string;
  };
  intentMetrics?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    api_cost_usd: number | null;
    processing_cost_usd: number | null;
    confidence_score: number | null;
    latency_ms: number | null;
    model_used?: string;
  };
  llmMetrics?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    api_cost_usd: number | null;
    processing_cost_usd: number | null;
    confidence_score: number | null;
    latency_ms: number | null;
    model_used?: string;
  };
}