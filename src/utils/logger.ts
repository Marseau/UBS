/**
 * Central Logger Wrapper - Conversation Tracing Extension
 *
 * Extends the existing StructuredLoggerService with conversation-specific features:
 * - Conversation ID tracing for end-to-end request tracking
 * - Standardized context for all conversation flows
 * - Integration with telemetry data for AI operations
 * - Consistent logging across all services
 *
 * Usage:
 * ```typescript
 * import { conversationLogger } from '@/utils/logger';
 *
 * const logger = conversationLogger('orchestrator-service');
 * logger.conversation('User started onboarding', {
 *   conversationId: 'conv_123',
 *   tenantId: 'tenant_456',
 *   userPhone: '+1234567890'
 * });
 * ```
 */

import { randomUUID } from 'crypto';
import { StructuredLoggerService } from './structured-logger.service';
import { LogContext, MessageSource } from '../types';

/**
 * Enhanced logger class for conversation-specific logging
 */
export class ConversationLogger extends StructuredLoggerService {
  private defaultConversationContext: Partial<LogContext>;

  constructor(serviceName: string, defaultContext?: Partial<LogContext>) {
    super(serviceName, {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true,
      enableFile: true,
      format: 'json'
    });

    this.defaultConversationContext = defaultContext || {};
  }

  /**
   * Log conversation events with automatic tracing
   */
  conversation(message: string, context: Partial<LogContext> = {}): void {
    const enrichedContext: LogContext = {
      service: this.defaultConversationContext.service || 'conversation',
      method: this.defaultConversationContext.method || 'process',
      timestamp: new Date().toISOString(),
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      ...this.defaultConversationContext,
      ...context,
      logType: 'conversation'
    };

    this.info(`💬 ${message}`, enrichedContext);
  }

  /**
   * Log AI operations with telemetry integration
   */
  aiOperation(
    operation: string,
    context: Partial<LogContext> & {
      intent?: string;
      confidence?: number;
      model_used?: string;
      tokens_used?: number;
      cost_usd?: number;
    }
  ): void {
    const enrichedContext: LogContext = {
      service: 'ai-service',
      method: operation,
      timestamp: new Date().toISOString(),
      operationType: 'ai_processing',
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      ...this.defaultConversationContext,
      ...context,
      logType: 'ai-operation'
    };

    this.info(`🤖 AI Operation: ${operation}`, enrichedContext);
  }

  /**
   * Log onboarding flow steps with state tracking
   */
  onboarding(
    step: string,
    context: Partial<LogContext> & {
      flowState?: string;
      dataCollected?: string[];
      isComplete?: boolean;
    }
  ): void {
    const enrichedContext: LogContext = {
      service: 'onboarding-service',
      method: 'processStep',
      timestamp: new Date().toISOString(),
      operationType: 'onboarding',
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      ...this.defaultConversationContext,
      ...context,
      logType: 'onboarding'
    };

    this.info(`📝 Onboarding: ${step}`, enrichedContext);
  }

  /**
   * Log appointment operations
   */
  appointment(
    action: string,
    context: Partial<LogContext> & {
      appointmentId?: string;
      appointmentDate?: string;
      serviceType?: string;
    }
  ): void {
    const enrichedContext: LogContext = {
      service: 'appointment-service',
      method: action,
      timestamp: new Date().toISOString(),
      operationType: 'appointment_management',
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      ...this.defaultConversationContext,
      ...context,
      logType: 'appointment'
    };

    this.info(`📅 Appointment: ${action}`, enrichedContext);
  }

  /**
   * Log webhook processing with source tracking
   */
  webhook(
    message: string,
    context: Partial<LogContext> & {
      messageSource?: MessageSource;
      webhookType?: string;
      processingTimeMs?: number;
    }
  ): void {
    const enrichedContext: LogContext = {
      service: 'webhook-service',
      method: 'processMessage',
      timestamp: new Date().toISOString(),
      operationType: 'webhook_processing',
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      duration: context.processingTimeMs,
      ...this.defaultConversationContext,
      ...context,
      logType: 'webhook'
    };

    this.info(`📨 Webhook: ${message}`, enrichedContext);
  }

  /**
   * Log database persistence operations
   */
  persistence(
    operation: string,
    context: Partial<LogContext> & {
      table?: string;
      recordId?: string;
      recordsAffected?: number;
      queryTimeMs?: number;
    }
  ): void {
    const enrichedContext: LogContext = {
      service: 'persistence-service',
      method: operation,
      timestamp: new Date().toISOString(),
      operationType: 'database_operation',
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      duration: context.queryTimeMs,
      ...this.defaultConversationContext,
      ...context,
      logType: 'persistence'
    };

    this.info(`💾 DB: ${operation}`, enrichedContext);
  }

  /**
   * Log errors with conversation context
   */
  conversationError(
    error: Error | string,
    context: Partial<LogContext> = {}
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const enrichedContext: LogContext = {
      service: this.defaultConversationContext.service || 'unknown',
      method: this.defaultConversationContext.method || 'error',
      timestamp: new Date().toISOString(),
      conversationId: this.generateConversationId(context),
      traceId: this.generateTraceId(context),
      error: errorMessage,
      stack: errorStack,
      success: false,
      ...this.defaultConversationContext,
      ...context,
      logType: 'conversation-error'
    };

    this.error(`❌ Conversation Error: ${errorMessage}`, enrichedContext, error instanceof Error ? error : undefined);
  }

  /**
   * Create a child logger with conversation context
   */
  withConversation(conversationContext: {
    conversationId: string;
    tenantId?: string;
    userId?: string;
    userPhone?: string;
    messageSource?: MessageSource;
  }): ConversationLogger {
    return new ConversationLogger(
      this.defaultConversationContext.service || 'unknown',
      {
        ...this.defaultConversationContext,
        ...conversationContext
      }
    );
  }

  /**
   * Start a conversation trace - returns function to end trace with metrics
   */
  startConversationTrace(
    operation: string,
    context: Partial<LogContext> = {}
  ): (result?: { success?: boolean; error?: string; metadata?: any }) => void {
    const startTime = Date.now();
    const conversationId = this.generateConversationId(context);
    const traceId = this.generateTraceId(context);

    this.conversation(`Started: ${operation}`, {
      ...context,
      conversationId,
      traceId,
      operationType: operation
    });

    return (result = {}) => {
      const duration = Date.now() - startTime;

      this.conversation(`Completed: ${operation}`, {
        ...context,
        ...result.metadata,
        conversationId,
        traceId,
        duration,
        success: result.success !== false,
        error: result.error,
        operationType: operation
      });

      // Also log performance metrics
      this.performance(`conversation-${operation}`, duration, {
        ...context,
        conversationId,
        traceId,
        success: result.success !== false
      });
    };
  }

  // Private helper methods
  private generateConversationId(context: Partial<LogContext>): string {
    if (context.conversationId) return context.conversationId;
    if (context.sessionId) return `conv_${context.sessionId}`;
    if (context.userPhone && context.tenantId) {
      return `conv_${context.tenantId}_${context.userPhone.replace(/\+/g, '')}`;
    }
    return `conv_${randomUUID()}`;
  }

  private generateTraceId(context: Partial<LogContext>): string {
    if (context.traceId) return context.traceId;
    if (context.requestId) return `trace_${context.requestId}`;
    return `trace_${randomUUID()}`;
  }
}

// Singleton instances for common use cases
export const systemLogger = new ConversationLogger('system', {
  service: 'system',
  method: 'operation'
});

export const orchestratorLogger = new ConversationLogger('orchestrator', {
  service: 'orchestrator',
  method: 'process'
});

export const webhookLogger = new ConversationLogger('webhook', {
  service: 'webhook',
  method: 'process'
});

export const persistenceLogger = new ConversationLogger('persistence', {
  service: 'persistence',
  method: 'save'
});

/**
 * Factory function to create service-specific loggers
 */
export function conversationLogger(
  serviceName: string,
  defaultContext?: Partial<LogContext>
): ConversationLogger {
  return new ConversationLogger(serviceName, {
    service: serviceName,
    method: 'process',
    ...defaultContext
  });
}

/**
 * Helper function to extract conversation context from request/input
 */
export function extractConversationContext(input: {
  userPhone?: string;
  tenantId?: string;
  sessionId?: string;
  messageSource?: MessageSource;
  isDemo?: boolean;
}): Partial<LogContext> {
  return {
    userPhone: input.userPhone,
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    messageSource: input.messageSource || (input.isDemo ? 'whatsapp_demo' : 'whatsapp')
  };
}

export default conversationLogger;