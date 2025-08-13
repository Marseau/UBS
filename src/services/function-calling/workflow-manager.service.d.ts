import { ConversationContext } from '../../types/ai.types';
export interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    trigger: WorkflowTrigger;
    steps: WorkflowStep[];
    conditions: WorkflowCondition[];
    metadata: WorkflowMetadata;
}
export interface WorkflowTrigger {
    type: 'intent' | 'function_result' | 'time' | 'event' | 'manual';
    pattern: string | RegExp;
    conditions?: Record<string, any>;
}
export interface WorkflowStep {
    id: string;
    name: string;
    type: 'function_call' | 'condition' | 'parallel' | 'sequential' | 'webhook' | 'notification';
    config: StepConfig;
    dependencies: string[];
    onSuccess?: string | undefined;
    onFailure?: string | undefined;
    retryPolicy?: {
        maxRetries: number;
        delayMs: number;
    };
}
export interface StepConfig {
    functionName?: string;
    arguments?: Record<string, any>;
    condition?: string;
    webhook?: {
        url: string;
        method: string;
        headers?: Record<string, string>;
    };
    notification?: {
        type: 'whatsapp' | 'email' | 'sms';
        template: string;
        recipients: string[];
    };
}
export interface WorkflowCondition {
    id: string;
    expression: string;
    description: string;
}
export interface WorkflowMetadata {
    version: string;
    author: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
}
export interface WorkflowExecution {
    id: string;
    workflowId: string;
    context: ConversationContext;
    status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
    currentStep: string;
    startTime: Date;
    endTime?: Date;
    steps: WorkflowStepExecution[];
    variables: Record<string, any>;
    error?: string;
}
export interface WorkflowStepExecution {
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    result?: any;
    error?: string;
    retryCount: number;
}
export declare class WorkflowManagerService {
    private dispatcher;
    private registry;
    private workflows;
    private executions;
    constructor();
    registerWorkflow(workflow: WorkflowDefinition): boolean;
    executeWorkflow(workflowId: string, context: ConversationContext, initialVariables?: Record<string, any>): Promise<WorkflowExecution>;
    private executeWorkflowSteps;
    private executeStep;
    private executeFunctionCallStep;
    private executeConditionStep;
    private executeWebhookStep;
    private executeNotificationStep;
    private executeParallelStep;
    private executeSequentialStep;
    private resolveVariables;
    private evaluateCondition;
    private validateWorkflow;
    private initializeDefaultWorkflows;
    getWorkflow(workflowId: string): WorkflowDefinition | undefined;
    getExecution(executionId: string): WorkflowExecution | undefined;
    getAllWorkflows(): WorkflowDefinition[];
    getAllExecutions(): WorkflowExecution[];
    private generateExecutionId;
    private sleep;
}
//# sourceMappingURL=workflow-manager.service.d.ts.map