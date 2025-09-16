/**
 * Centralized Type Definitions Index
 *
 * This file exports all type definitions from a single location to:
 * - Prevent duplication
 * - Ensure consistency
 * - Simplify imports
 * - Provide better IDE support
 */

// === Core System Types ===
export * from './orchestrator.types';
export * from './webhook.types';
export * from './flow-lock.types';
export * from './intent.types';

// === Database Types ===
export * from './database.types';

// === Metrics & Analytics Types ===
export type {
  PlatformMetricsRequest,
  PlatformMetricsResponse,
  TenantMetricsRequest,
  TenantMetricsResponse,
  BaseMetricRequest,
  ApiResponse
} from './unified-metrics.types';

// === Service Types ===
export * from './billing-cron.types';
export * from './unified-cron.types';

// === Re-export commonly used types for convenience ===
export type {
  // Orchestrator
  OrchestratorInput,
  OrchestratorResult,
  UserContext,
  TenantContext,
  TelemetryData,
  OnboardingStep,
  FlowDecision,
  OrchestratorContext,
  UserDataExtractionResult,
  OnboardingFlowResult,
  WebhookOrchestrationResult
} from './orchestrator.types';

// Export enum separately to avoid conflicts
export { DataCollectionState } from './orchestrator.types';

export type {
  // Webhook
  WebhookMessage,
  WebhookResponse
} from './webhook.types';

export type {
  // Flow Lock & Intent
  EnhancedConversationContext,
  FlowType,
  IntentDetectionResult
} from './flow-lock.types';

/**
 * Message Source Types - Standardized across the system
 */
export type MessageSource = 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';

/**
 * Common Response Types
 */
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Enhanced Logging Context Type for standardized logging with tracing
 * Unifies with StructuredLoggerService for consistent logging across system
 */
export interface LogContext {
  // Service identification
  service: string;
  method: string;

  // Tracing and session tracking
  conversationId?: string;  // For end-to-end tracing of conversations
  traceId?: string;        // For distributed tracing
  sessionId?: string;      // WhatsApp session or user session
  requestId?: string;      // HTTP request ID

  // User and tenant context
  userId?: string;
  tenantId?: string;
  userPhone?: string;      // For WhatsApp conversations
  messageSource?: MessageSource;

  // Operation context
  operationType?: string;   // e.g., 'onboarding', 'appointment_booking'
  intent?: string;         // Detected user intent
  flowState?: string;      // Current conversation flow state

  // Performance and metrics
  duration?: number;       // Operation duration in ms
  confidence?: number;     // AI confidence score
  model_used?: string;     // AI model used
  batchSize?: number;      // For batch operations
  success?: boolean;       // Operation success flag

  // Additional metadata
  timestamp?: string;      // ISO timestamp
  level?: 'debug' | 'info' | 'warn' | 'error';
  error?: string;          // Error message
  [key: string]: any;      // Allow additional properties
}