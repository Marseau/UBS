import { FunctionCall, FunctionResult, ConversationContext } from '../../types/ai.types';
import { BusinessDomain } from '../../types/database.types';
import { RegisteredFunction, FunctionCategory } from './function-registry.service';
import { ExecutionResult } from './action-dispatcher.service';
import { WorkflowDefinition, WorkflowExecution } from './workflow-manager.service';
export interface FunctionCallingConfig {
    enableWorkflows: boolean;
    enableParallelExecution: boolean;
    maxConcurrentExecutions: number;
    defaultTimeoutMs: number;
    enableMetrics: boolean;
    enableCaching: boolean;
}
export interface FunctionCallingStat {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageExecutionTime: number;
    functionUsage: Record<string, number>;
    workflowsExecuted: number;
    activeExecutions: number;
}
export interface CachedResult {
    key: string;
    result: FunctionResult;
    timestamp: Date;
    ttlMs: number;
}
export declare class FunctionCallingService {
    private registry;
    private dispatcher;
    private workflowManager;
    private config;
    private cache;
    private stats;
    private activeExecutions;
    constructor(config?: Partial<FunctionCallingConfig>);
    private initializeService;
    executeFunction(functionCall: FunctionCall, context: ConversationContext, options?: {
        useCache?: boolean;
        timeoutMs?: number;
        priority?: 'low' | 'medium' | 'high';
    }): Promise<FunctionResult>;
    executeFunctions(functionCalls: FunctionCall[], context: ConversationContext, options?: {
        parallel?: boolean;
        continueOnError?: boolean;
        timeoutMs?: number;
    }): Promise<ExecutionResult>;
    executeWorkflow(workflowId: string, context: ConversationContext, variables?: Record<string, any>): Promise<WorkflowExecution>;
    getAvailableFunctions(context: ConversationContext): RegisteredFunction[];
    searchFunctions(query: string, domain?: BusinessDomain | 'other'): RegisteredFunction[];
    getFunctionsByCategory(category: FunctionCategory): RegisteredFunction[];
    registerFunction(func: RegisteredFunction): boolean;
    registerWorkflow(workflow: WorkflowDefinition): boolean;
    getStats(): FunctionCallingStat;
    getRegistryStats(): import("./function-registry.service").RegistryStats;
    resetStats(): void;
    private updateStats;
    private generateCacheKey;
    private getCachedResult;
    private cacheResult;
    private startCacheCleanup;
    private startMetricsCollection;
    private generateExecutionId;
    private logConfiguration;
    cleanup(): void;
}
//# sourceMappingURL=function-calling.service.d.ts.map