import { FunctionCall, FunctionResult, ConversationContext, Action } from '../../types/ai.types';
import { FunctionRegistryService, RegisteredFunction } from './function-registry.service';
import { FunctionExecutorService } from '../function-executor.service';
export interface ExecutionPlan {
    id: string;
    functions: ExecutionStep[];
    context: ConversationContext;
    parallelExecution: boolean;
    timeoutMs: number;
    retryPolicy: RetryPolicy;
}
export interface ExecutionStep {
    id: string;
    function: RegisteredFunction;
    args: any;
    dependencies: string[];
    priority: number;
}
export interface RetryPolicy {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
    retryableErrors: string[];
}
export interface ExecutionResult {
    planId: string;
    success: boolean;
    results: StepResult[];
    totalDuration: number;
    failedSteps: string[];
    actions: Action[];
}
export interface StepResult {
    stepId: string;
    functionName: string;
    success: boolean;
    result?: FunctionResult;
    error?: string;
    duration: number;
    retryCount: number;
}
export declare class ActionDispatcherService {
    private registry;
    private executor;
    private activePlans;
    private middleware;
    constructor();
    dispatch(functionCall: FunctionCall, context: ConversationContext): Promise<FunctionResult>;
    dispatchPlan(functionCalls: FunctionCall[], context: ConversationContext, options?: {
        parallel?: boolean;
        timeoutMs?: number;
        retryPolicy?: Partial<RetryPolicy>;
    }): Promise<ExecutionResult>;
    private createExecutionPlan;
    private executePlan;
    private executeStep;
    private executeWithMiddleware;
    private calculateDependencies;
    private calculatePriority;
    private topologicalSort;
    private initializeMiddleware;
    private recordMetric;
    private generatePlanId;
    private sleep;
    getRegistry(): FunctionRegistryService;
    getExecutor(): FunctionExecutorService;
    getActivePlansCount(): number;
}
//# sourceMappingURL=action-dispatcher.service.d.ts.map