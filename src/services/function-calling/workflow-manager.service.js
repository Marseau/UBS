"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowManagerService = void 0;
const action_dispatcher_service_1 = require("./action-dispatcher.service");
class WorkflowManagerService {
    constructor() {
        this.workflows = new Map();
        this.executions = new Map();
        this.dispatcher = new action_dispatcher_service_1.ActionDispatcherService();
        this.registry = this.dispatcher.getRegistry();
        this.initializeDefaultWorkflows();
    }
    registerWorkflow(workflow) {
        if (this.workflows.has(workflow.id)) {
            console.warn(`⚠️  Workflow ${workflow.id} already exists`);
            return false;
        }
        const validation = this.validateWorkflow(workflow);
        if (!validation.isValid) {
            console.error(`❌ Invalid workflow ${workflow.id}:`, validation.errors);
            return false;
        }
        this.workflows.set(workflow.id, workflow);
        console.log(`✅ Registered workflow: ${workflow.id}`);
        return true;
    }
    async executeWorkflow(workflowId, context, initialVariables = {}) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        if (!workflow.metadata.isActive) {
            throw new Error(`Workflow ${workflowId} is not active`);
        }
        const execution = {
            id: this.generateExecutionId(),
            workflowId,
            context,
            status: 'running',
            currentStep: workflow.steps[0]?.id || '',
            startTime: new Date(),
            steps: workflow.steps.map(step => ({
                stepId: step.id,
                status: 'pending',
                retryCount: 0
            })),
            variables: { ...initialVariables }
        };
        this.executions.set(execution.id, execution);
        console.log(`🚀 Starting workflow execution: ${execution.id}`);
        try {
            await this.executeWorkflowSteps(execution, workflow);
            execution.status = 'completed';
            execution.endTime = new Date();
            console.log(`✅ Workflow execution completed: ${execution.id}`);
        }
        catch (error) {
            execution.status = 'failed';
            execution.endTime = new Date();
            execution.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Workflow execution failed: ${execution.id}`, error);
        }
        return execution;
    }
    async executeWorkflowSteps(execution, workflow) {
        const visited = new Set();
        let currentStepId = workflow.steps[0]?.id;
        while (currentStepId && !visited.has(currentStepId)) {
            visited.add(currentStepId);
            execution.currentStep = currentStepId;
            const step = workflow.steps.find(s => s.id === currentStepId);
            if (!step) {
                throw new Error(`Step ${currentStepId} not found in workflow`);
            }
            const stepExecution = execution.steps.find(s => s.stepId === currentStepId);
            if (!stepExecution) {
                throw new Error(`Step execution ${currentStepId} not found`);
            }
            console.log(`🔧 Executing step: ${step.name} (${currentStepId})`);
            try {
                stepExecution.status = 'running';
                stepExecution.startTime = new Date();
                const result = await this.executeStep(step, execution);
                stepExecution.status = 'completed';
                stepExecution.endTime = new Date();
                stepExecution.result = result;
                currentStepId = result.success ? step.onSuccess : step.onFailure;
                if (result.data) {
                    execution.variables = { ...execution.variables, ...result.data };
                }
            }
            catch (error) {
                stepExecution.status = 'failed';
                stepExecution.endTime = new Date();
                stepExecution.error = error instanceof Error ? error.message : 'Unknown error';
                if (step.retryPolicy && stepExecution.retryCount < step.retryPolicy.maxRetries) {
                    stepExecution.retryCount++;
                    stepExecution.status = 'pending';
                    if (step.retryPolicy.delayMs > 0) {
                        await this.sleep(step.retryPolicy.delayMs);
                    }
                    visited.delete(currentStepId);
                    continue;
                }
                currentStepId = step.onFailure;
                if (!currentStepId) {
                    throw error;
                }
            }
        }
    }
    async executeStep(step, execution) {
        switch (step.type) {
            case 'function_call':
                return this.executeFunctionCallStep(step, execution);
            case 'condition':
                return this.executeConditionStep(step, execution);
            case 'webhook':
                return this.executeWebhookStep(step, execution);
            case 'notification':
                return this.executeNotificationStep(step, execution);
            case 'parallel':
                return this.executeParallelStep(step, execution);
            case 'sequential':
                return this.executeSequentialStep(step, execution);
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }
    async executeFunctionCallStep(step, execution) {
        if (!step.config.functionName) {
            throw new Error('Function name is required for function_call step');
        }
        const functionCall = {
            name: step.config.functionName,
            arguments: JSON.stringify(this.resolveVariables(step.config.arguments || {}, execution.variables))
        };
        const result = await this.dispatcher.dispatch(functionCall, execution.context);
        return {
            success: result.success,
            data: result.data,
            message: result.message
        };
    }
    async executeConditionStep(step, execution) {
        if (!step.config.condition) {
            throw new Error('Condition is required for condition step');
        }
        const conditionResult = this.evaluateCondition(step.config.condition, execution.variables);
        return {
            success: conditionResult,
            message: `Condition ${conditionResult ? 'passed' : 'failed'}: ${step.config.condition}`
        };
    }
    async executeWebhookStep(step, execution) {
        if (!step.config.webhook) {
            throw new Error('Webhook config is required for webhook step');
        }
        try {
            const response = await fetch(step.config.webhook.url, {
                method: step.config.webhook.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...step.config.webhook.headers
                },
                body: JSON.stringify(execution.variables)
            });
            const data = await response.json();
            return {
                success: response.ok,
                data,
                message: `Webhook ${response.ok ? 'succeeded' : 'failed'}: ${response.status}`
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Webhook error: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async executeNotificationStep(step, execution) {
        if (!step.config.notification) {
            throw new Error('Notification config is required for notification step');
        }
        console.log(`📢 Sending ${step.config.notification.type} notification:`, {
            template: step.config.notification.template,
            recipients: step.config.notification.recipients,
            variables: execution.variables
        });
        return {
            success: true,
            message: 'Notification sent successfully'
        };
    }
    async executeParallelStep(step, execution) {
        return {
            success: true,
            message: 'Parallel execution completed'
        };
    }
    async executeSequentialStep(step, execution) {
        return {
            success: true,
            message: 'Sequential execution completed'
        };
    }
    resolveVariables(args, variables) {
        const resolved = {};
        for (const [key, value] of Object.entries(args)) {
            if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
                const varName = value.slice(2, -2).trim();
                resolved[key] = variables[varName] || value;
            }
            else {
                resolved[key] = value;
            }
        }
        return resolved;
    }
    evaluateCondition(condition, variables) {
        try {
            let evaluatedCondition = condition;
            for (const [key, value] of Object.entries(variables)) {
                evaluatedCondition = evaluatedCondition.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), JSON.stringify(value));
            }
            return eval(evaluatedCondition);
        }
        catch (error) {
            console.warn(`⚠️  Condition evaluation failed: ${condition}`, error);
            return false;
        }
    }
    validateWorkflow(workflow) {
        const errors = [];
        if (!workflow.id)
            errors.push('Workflow ID is required');
        if (!workflow.name)
            errors.push('Workflow name is required');
        if (!workflow.steps || workflow.steps.length === 0)
            errors.push('At least one step is required');
        const stepIds = new Set(workflow.steps.map(s => s.id));
        for (const step of workflow.steps) {
            for (const depId of step.dependencies) {
                if (!stepIds.has(depId)) {
                    errors.push(`Step ${step.id} depends on non-existent step: ${depId}`);
                }
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    initializeDefaultWorkflows() {
        const bookingWorkflow = {
            id: 'booking_flow',
            name: 'Standard Booking Flow',
            description: 'Standard workflow for processing booking requests',
            trigger: {
                type: 'intent',
                pattern: 'booking_request'
            },
            steps: [
                {
                    id: 'check_availability',
                    name: 'Check Availability',
                    type: 'function_call',
                    config: {
                        functionName: 'check_availability',
                        arguments: {
                            service_name: '{{service_name}}',
                            date: '{{preferred_date}}',
                            time: '{{preferred_time}}'
                        }
                    },
                    dependencies: [],
                    onSuccess: 'create_booking',
                    onFailure: 'suggest_alternatives'
                },
                {
                    id: 'create_booking',
                    name: 'Create Booking',
                    type: 'function_call',
                    config: {
                        functionName: 'book_service',
                        arguments: {
                            service_id: '{{service_id}}',
                            date: '{{confirmed_date}}',
                            time: '{{confirmed_time}}',
                            client_name: '{{client_name}}',
                            phone: '{{phone}}'
                        }
                    },
                    dependencies: ['check_availability'],
                    onSuccess: 'send_confirmation',
                    onFailure: 'handle_booking_error'
                },
                {
                    id: 'send_confirmation',
                    name: 'Send Confirmation',
                    type: 'notification',
                    config: {
                        notification: {
                            type: 'whatsapp',
                            template: 'booking_confirmation',
                            recipients: ['{{phone}}']
                        }
                    },
                    dependencies: ['create_booking'],
                    onSuccess: undefined,
                    onFailure: undefined
                }
            ],
            conditions: [],
            metadata: {
                version: '1.0.0',
                author: 'system',
                tags: ['booking', 'default'],
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true
            }
        };
        this.registerWorkflow(bookingWorkflow);
    }
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    getAllWorkflows() {
        return Array.from(this.workflows.values());
    }
    getAllExecutions() {
        return Array.from(this.executions.values());
    }
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.WorkflowManagerService = WorkflowManagerService;
//# sourceMappingURL=workflow-manager.service.js.map