"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionDispatcherService = void 0;
const function_registry_service_1 = require("./function-registry.service");
const function_executor_service_1 = require("../function-executor.service");
class ActionDispatcherService {
    constructor() {
        this.activePlans = new Map();
        this.middleware = [];
        this.registry = new function_registry_service_1.FunctionRegistryService();
        this.executor = new function_executor_service_1.FunctionExecutorService();
        this.initializeMiddleware();
    }
    async dispatch(functionCall, context) {
        const registeredFunction = this.registry.getFunctionByName(functionCall.name, context.tenantConfig?.domain);
        if (!registeredFunction) {
            return {
                success: false,
                message: `Function '${functionCall.name}' not found for domain '${context.tenantConfig?.domain}'`,
                shouldContinue: false
            };
        }
        return this.executeWithMiddleware(registeredFunction, functionCall, context);
    }
    async dispatchPlan(functionCalls, context, options = {}) {
        const plan = this.createExecutionPlan(functionCalls, context, options);
        return this.executePlan(plan);
    }
    createExecutionPlan(functionCalls, context, options) {
        const planId = this.generatePlanId();
        const steps = [];
        functionCalls.forEach((call, index) => {
            const registeredFunction = this.registry.getFunctionByName(call.name, context.tenantConfig?.domain);
            if (registeredFunction) {
                steps.push({
                    id: `step_${index}`,
                    function: registeredFunction,
                    args: JSON.parse(call.arguments),
                    dependencies: this.calculateDependencies(call, functionCalls, index),
                    priority: this.calculatePriority(registeredFunction)
                });
            }
        });
        const plan = {
            id: planId,
            functions: steps,
            context,
            parallelExecution: options.parallel || false,
            timeoutMs: options.timeoutMs || 30000,
            retryPolicy: {
                maxRetries: 3,
                backoffMs: 1000,
                backoffMultiplier: 2,
                retryableErrors: ['timeout', 'network', 'rate_limit'],
                ...options.retryPolicy
            }
        };
        this.activePlans.set(planId, plan);
        return plan;
    }
    async executePlan(plan) {
        console.log(`🚀 Executing plan ${plan.id} with ${plan.functions.length} steps`);
        const startTime = Date.now();
        const results = [];
        const failedSteps = [];
        const actions = [];
        try {
            if (plan.parallelExecution) {
                const promises = plan.functions.map(step => this.executeStep(step, plan.context));
                const stepResults = await Promise.allSettled(promises);
                stepResults.forEach((result, index) => {
                    const step = plan.functions[index];
                    if (!step)
                        return;
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                        if (!result.value.success) {
                            failedSteps.push(step.id);
                        }
                    }
                    else {
                        results.push({
                            stepId: step.id,
                            functionName: step.function.name,
                            success: false,
                            error: result.reason?.message || 'Unknown error',
                            duration: 0,
                            retryCount: 0
                        });
                        failedSteps.push(step.id);
                    }
                });
            }
            else {
                const sortedSteps = this.topologicalSort(plan.functions);
                for (const step of sortedSteps) {
                    const result = await this.executeStep(step, plan.context);
                    results.push(result);
                    if (!result.success) {
                        failedSteps.push(step.id);
                        if (!result.result?.shouldContinue) {
                            break;
                        }
                    }
                    if (result.success && result.result?.data?.actions) {
                        actions.push(...result.result.data.actions);
                    }
                }
            }
            const totalDuration = Date.now() - startTime;
            const success = failedSteps.length === 0;
            console.log(`${success ? '✅' : '❌'} Plan ${plan.id} completed in ${totalDuration}ms`);
            return {
                planId: plan.id,
                success,
                results,
                totalDuration,
                failedSteps,
                actions
            };
        }
        finally {
            this.activePlans.delete(plan.id);
        }
    }
    async executeStep(step, context) {
        const startTime = Date.now();
        let retryCount = 0;
        let lastError;
        const functionCall = {
            name: step.function.name,
            arguments: JSON.stringify(step.args)
        };
        while (retryCount <= (step.function.metadata.rateLimit?.requests ?? 3)) {
            try {
                const result = await this.executeWithMiddleware(step.function, functionCall, context);
                return {
                    stepId: step.id,
                    functionName: step.function.name,
                    success: result.success,
                    result,
                    duration: Date.now() - startTime,
                    retryCount
                };
            }
            catch (error) {
                retryCount++;
                lastError = error instanceof Error ? error.message : 'Unknown error';
                if (retryCount <= 3) {
                    const backoffMs = Math.pow(2, retryCount - 1) * 1000;
                    console.warn(`⚠️  Step ${step.id} failed, retrying in ${backoffMs}ms (attempt ${retryCount})`);
                    await this.sleep(backoffMs);
                }
            }
        }
        return {
            stepId: step.id,
            functionName: step.function.name,
            success: false,
            error: lastError || 'Unknown error',
            duration: Date.now() - startTime,
            retryCount
        };
    }
    async executeWithMiddleware(func, call, context) {
        const allMiddleware = [
            ...this.middleware,
            ...(func.middleware || [])
        ].sort((a, b) => b.priority - a.priority);
        let index = 0;
        const next = async () => {
            if (index < allMiddleware.length) {
                const middleware = allMiddleware[index++];
                if (middleware) {
                    return middleware.execute(JSON.parse(call.arguments), context, next);
                }
                return next();
            }
            else {
                return this.executor.executeFunction(call, func, context);
            }
        };
        return next();
    }
    calculateDependencies(call, allCalls, index) {
        const dependencies = [];
        if (call.name.includes('book') && index > 0) {
            for (let i = 0; i < index; i++) {
                if (allCalls[i].name.includes('check') || allCalls[i].name.includes('availability')) {
                    dependencies.push(`step_${i}`);
                }
            }
        }
        return dependencies;
    }
    calculatePriority(func) {
        if (func.category === 'booking')
            return 90;
        if (func.category === 'inquiry')
            return 80;
        if (func.category === 'consultation')
            return 70;
        return 50;
    }
    topologicalSort(steps) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (step) => {
            if (visiting.has(step.id)) {
                throw new Error(`Circular dependency detected involving ${step.id}`);
            }
            if (visited.has(step.id))
                return;
            visiting.add(step.id);
            step.dependencies.forEach(depId => {
                const depStep = steps.find(s => s.id === depId);
                if (depStep)
                    visit(depStep);
            });
            visiting.delete(step.id);
            visited.add(step.id);
            sorted.push(step);
        };
        steps.forEach(step => {
            if (!visited.has(step.id)) {
                visit(step);
            }
        });
        return sorted;
    }
    initializeMiddleware() {
        this.middleware.push({
            name: 'rate-limiting',
            priority: 95,
            execute: async (args, context, next) => {
                return next();
            }
        });
        this.middleware.push({
            name: 'authentication',
            priority: 90,
            execute: async (args, context, next) => {
                return next();
            }
        });
        this.middleware.push({
            name: 'metrics',
            priority: 10,
            execute: async (args, context, next) => {
                const start = Date.now();
                try {
                    const result = await next();
                    this.recordMetric('function_success', Date.now() - start);
                    return result;
                }
                catch (error) {
                    this.recordMetric('function_error', Date.now() - start);
                    throw error;
                }
            }
        });
    }
    recordMetric(metric, value) {
        console.debug(`📊 Metric: ${metric} = ${value}`);
    }
    generatePlanId() {
        return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getRegistry() {
        return this.registry;
    }
    getExecutor() {
        return this.executor;
    }
    getActivePlansCount() {
        return this.activePlans.size;
    }
}
exports.ActionDispatcherService = ActionDispatcherService;
//# sourceMappingURL=action-dispatcher.service.js.map