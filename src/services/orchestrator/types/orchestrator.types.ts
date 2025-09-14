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
  COLLECTION_COMPLETE = 'collection_complete'
}

export interface OnboardingStep {
  state: DataCollectionState;
  prompt: string;
  validation?: (input: string) => boolean | string;
  nextState?: DataCollectionState;
}