"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionExecutorService = void 0;
class FunctionExecutorService {
    constructor() {
        this.executionHistory = new Map();
        this.rateLimits = new Map();
    }
    async executeFunction(functionCall, functionDef, context) {
        const executionId = this.generateExecutionId();
        try {
            const rateLimitCheck = await this.checkRateLimit(functionDef.name, context.userId);
            if (!rateLimitCheck.allowed) {
                return {
                    success: false,
                    message: `Rate limit exceeded. Try again in ${rateLimitCheck.resetIn} seconds.`,
                    shouldContinue: true
                };
            }
            const validationResult = await this.validateParameters(functionCall, functionDef);
            if (!validationResult.isValid) {
                return {
                    success: false,
                    message: `Invalid parameters: ${validationResult.errors.join(', ')}`,
                    shouldContinue: true
                };
            }
            const args = JSON.parse(functionCall.arguments);
            const execution = {
                id: executionId,
                functionName: functionDef.name,
                arguments: args,
                context: context,
                startTime: Date.now(),
                status: 'executing'
            };
            this.addToExecutionHistory(context.sessionId, execution);
            const result = await functionDef.handler(args, context);
            execution.endTime = Date.now();
            execution.status = result.success ? 'completed' : 'failed';
            execution.result = result;
            execution.duration = execution.endTime - execution.startTime;
            await this.updateRateLimit(functionDef.name, context.userId);
            await this.logFunctionExecution(execution);
            return result;
        }
        catch (error) {
            console.error(`Function execution error for ${functionDef.name}:`, error);
            const execution = this.getExecutionById(context.sessionId, executionId);
            if (execution) {
                execution.endTime = Date.now();
                execution.status = 'error';
                execution.error = error instanceof Error ? error.message : 'Unknown error';
                execution.duration = execution.endTime - execution.startTime;
            }
            return {
                success: false,
                message: this.getErrorMessage(functionDef.name, error),
                shouldContinue: true
            };
        }
    }
    async executeFunctionChain(functionCalls, functions, context) {
        const results = [];
        for (const call of functionCalls) {
            const functionDef = functions.find(f => f.name === call.name);
            if (!functionDef) {
                results.push({
                    success: false,
                    message: `Function ${call.name} not found`,
                    shouldContinue: true
                });
                continue;
            }
            const result = await this.executeFunction(call, functionDef, context);
            results.push(result);
            if (!result.success && !result.shouldContinue) {
                break;
            }
        }
        return results;
    }
    async validateParameters(functionCall, functionDef) {
        const errors = [];
        try {
            const args = JSON.parse(functionCall.arguments);
            for (const param of functionDef.parameters) {
                if (param.required && !(param.name in args)) {
                    errors.push(`Missing required parameter: ${param.name}`);
                }
                if (param.name in args) {
                    const value = args[param.name];
                    const typeError = this.validateParameterType(value, param);
                    if (typeError) {
                        errors.push(typeError);
                    }
                }
            }
            return {
                isValid: errors.length === 0,
                errors
            };
        }
        catch (error) {
            return {
                isValid: false,
                errors: ['Invalid JSON in function arguments']
            };
        }
    }
    validateParameterType(value, param) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type) {
            return `Parameter ${param.name} expected ${param.type}, got ${actualType}`;
        }
        if (param.enum && !param.enum.includes(value)) {
            return `Parameter ${param.name} must be one of: ${param.enum.join(', ')}`;
        }
        return null;
    }
    async checkRateLimit(functionName, userId) {
        const key = `${functionName}:${userId}`;
        const limit = this.rateLimits.get(key);
        const now = Date.now();
        const rateLimits = {
            'book_': { requests: 10, windowMs: 60000 },
            'check_': { requests: 30, windowMs: 60000 },
            'calculate_': { requests: 20, windowMs: 60000 },
            'default': { requests: 50, windowMs: 60000 }
        };
        const limitConfig = Object.entries(rateLimits)
            .find(([prefix]) => functionName.startsWith(prefix))?.[1] || rateLimits.default;
        if (!limit) {
            this.rateLimits.set(key, {
                requests: 1,
                windowStart: now,
                windowMs: limitConfig?.windowMs || 60000,
                maxRequests: limitConfig?.requests || 10
            });
            return { allowed: true };
        }
        if (now - limit.windowStart > limit.windowMs) {
            limit.requests = 1;
            limit.windowStart = now;
            return { allowed: true };
        }
        if (limit.requests >= limit.maxRequests) {
            const resetIn = Math.ceil((limit.windowStart + limit.windowMs - now) / 1000);
            return {
                allowed: false,
                resetIn
            };
        }
        return { allowed: true };
    }
    async updateRateLimit(functionName, userId) {
        const key = `${functionName}:${userId}`;
        const limit = this.rateLimits.get(key);
        if (limit) {
            limit.requests++;
        }
    }
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    addToExecutionHistory(sessionId, execution) {
        const history = this.executionHistory.get(sessionId) || [];
        history.push(execution);
        if (history.length > 50) {
            history.splice(0, history.length - 50);
        }
        this.executionHistory.set(sessionId, history);
    }
    getExecutionById(sessionId, executionId) {
        const history = this.executionHistory.get(sessionId) || [];
        return history.find(exec => exec.id === executionId);
    }
    async logFunctionExecution(execution) {
        try {
            console.log('Function execution logged:', {
                id: execution.id,
                functionName: execution.functionName,
                status: execution.status,
                duration: execution.duration
            });
        }
        catch (error) {
            console.error('Failed to log function execution:', error);
        }
    }
    getErrorMessage(functionName, error) {
        const errorMessages = {
            'book_': 'Erro ao realizar agendamento. Tente novamente ou entre em contato conosco.',
            'check_': 'Erro ao verificar informações. Tente novamente em alguns instantes.',
            'calculate_': 'Erro no cálculo. Verifique os dados fornecidos.',
            'assess_': 'Erro na avaliação. Tente novamente com informações atualizadas.',
            'get_': 'Erro ao buscar informações. Tente novamente.',
            'create_': 'Erro ao criar. Verifique os dados e tente novamente.',
            'track_': 'Erro no acompanhamento. Tente novamente.',
            'provide_': 'Erro ao fornecer informações. Entre em contato para suporte.',
            'handle_': 'Erro no processamento. Nossa equipe foi notificada.'
        };
        const errorMessage = Object.entries(errorMessages)
            .find(([prefix]) => functionName.startsWith(prefix))?.[1];
        return errorMessage || 'Erro temporário no sistema. Tente novamente ou entre em contato conosco.';
    }
    getExecutionStats(sessionId) {
        if (sessionId) {
            const history = this.executionHistory.get(sessionId) || [];
            return this.calculateStats(history);
        }
        const allExecutions = Array.from(this.executionHistory.values()).flat();
        return this.calculateStats(allExecutions);
    }
    calculateStats(executions) {
        const total = executions.length;
        const successful = executions.filter(e => e.status === 'completed').length;
        const failed = executions.filter(e => e.status === 'failed').length;
        const errors = executions.filter(e => e.status === 'error').length;
        const durations = executions
            .filter(e => e.duration !== undefined)
            .map(e => e.duration);
        const avgDuration = durations.length > 0
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length
            : 0;
        const functionCounts = {};
        executions.forEach(e => {
            functionCounts[e.functionName] = (functionCounts[e.functionName] || 0) + 1;
        });
        return {
            total,
            successful,
            failed,
            errors,
            successRate: total > 0 ? (successful / total) * 100 : 0,
            avgDuration: Math.round(avgDuration),
            functionUsage: functionCounts
        };
    }
    clearExecutionHistory(sessionId) {
        this.executionHistory.delete(sessionId);
    }
    clearRateLimits() {
        this.rateLimits.clear();
    }
}
exports.FunctionExecutorService = FunctionExecutorService;
exports.default = FunctionExecutorService;
//# sourceMappingURL=function-executor.service.js.map