import { ConversationContext } from "../types/ai.types";
export declare class AIActionExecutorService {
  private functionExecutor;
  private actionCache;
  private retryQueue;
  private healthMetrics;
  private workflows;
  constructor();
  executeAction(
    action: AIAction,
    context: ConversationContext,
    options?: ExecutionOptions,
  ): Promise<ActionResult>;
  executeActionsParallel(
    actions: AIAction[],
    context: ConversationContext,
    options?: ParallelExecutionOptions,
  ): Promise<ParallelActionResult>;
  private executeWithMonitoring;
  private executeBookingAction;
  private executeEscalationAction;
  private executeAssessmentAction;
  private executeNotificationAction;
  private executeQueryAction;
  private executeCalculationAction;
  private executeValidationAction;
  private executeCompositeAction;
  private executeGenericAction;
  private initializeWorkflows;
  private generateActionId;
  private initializeHealthMetrics;
  private updateMetrics;
  private updateExecutionTime;
  private createFailureResult;
  private validateActionPrerequisites;
  private getCachedResult;
  private cacheResult;
  private generateCacheKey;
  private checkServiceAvailability;
  private createBooking;
  private logEscalation;
  private executeHumanEscalation;
  private assessUrgency;
  private assessRisk;
  private performGenericAssessment;
  private sendNotification;
  private queryAvailability;
  private queryBookingHistory;
  private executeGenericQuery;
  private performCalculation;
  private performBusinessValidation;
  private getFunctionDefinition;
  private createActionMonitor;
  getHealthMetrics(): HealthMetrics;
  resetMetrics(): void;
  clearCaches(): void;
}
export interface AIAction {
  type: ActionType;
  functionName?: string;
  parameters: Record<string, any>;
  priority?: "low" | "medium" | "high";
  metadata?: Record<string, any>;
}
export type ActionType =
  | "booking"
  | "assessment"
  | "escalation"
  | "notification"
  | "query"
  | "calculation"
  | "validation"
  | "composite";
export interface ExecutionOptions {
  useCache?: boolean;
  cacheTtl?: number;
  forceRefresh?: boolean;
  enableRetry?: boolean;
  timeout?: number;
  metadata?: Record<string, any>;
}
export interface ParallelExecutionOptions {
  maxConcurrency?: number;
  stopOnFirstFailure?: boolean;
  individual?: ExecutionOptions;
}
export interface ActionResult {
  actionId: string;
  type: ActionType;
  success: boolean;
  message: string;
  shouldContinue: boolean;
  data?: any;
  executionTime?: number;
}
export interface ParallelActionResult {
  actionId: string;
  results: ActionResult[];
  errors: ActionError[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    executionTime: number;
  };
}
export interface ActionError {
  action: AIAction;
  error: any;
  timestamp: Date;
}
interface HealthMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  averageExecutionTime: number;
  actionsByType: Record<
    string,
    {
      total: number;
      successful: number;
      failed: number;
    }
  >;
  lastReset: number;
}
export {};
//# sourceMappingURL=ai-action-executor.service.d.ts.map
