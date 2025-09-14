/**
 * Types and interfaces for the webhook flow orchestrator
 */

export type OrchestratorInput = {
    messageText: string;
    userPhone: string;
    whatsappNumber?: string;
    tenantId?: string;
    messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
};

export interface WebhookOrchestrationResult {
    success: boolean;
    response?: string;
    shouldSendWhatsApp?: boolean;
    error?: string;
    metadata?: {
        intent?: string;
        confidence?: number;
        flow_state?: string;
        processing_time_ms?: number;
    };
    updatedContext?: {
        tenant_id?: string;
        user_id?: string;
        session_id?: string;
        flow_state?: string;
    };
}

export interface OrchestratorContext {
    tenantId: string;
    userId: string;
    sessionId: string;
    message: string;
    userPhone: string;
    isDemo: boolean;
    messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
}

export interface FlowDecision {
    shouldContinue: boolean;
    response?: string;
    nextState?: string;
    metadata?: Record<string, any>;
}

export interface IntentDecision {
    intent: string | null;
    confidence: number;
    method: 'regex' | 'llm' | 'hybrid';
    processing_cost_usd?: number;
    api_cost_usd?: number;
    tokens_used?: number;
}

// Estados de coleta progressiva de dados
export enum DataCollectionState {
    IDLE = 'idle',
    AWAITING_NAME = 'awaiting_name',
    AWAITING_EMAIL = 'awaiting_email',
    AWAITING_GENDER = 'awaiting_gender',
    COMPLETED = 'completed'
}

export interface UserDataExtractionResult {
    name?: string;
    email?: string;
    gender?: string;
    birthDate?: string;
    extractedSuccessfully: boolean;
    nextState?: DataCollectionState;
}

export interface OnboardingFlowResult {
    shouldContinue: boolean;
    response: string;
    nextState?: DataCollectionState;
    isCompleted: boolean;
    extractedData?: UserDataExtractionResult;
}