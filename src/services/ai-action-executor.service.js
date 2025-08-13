"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIActionExecutorService = void 0;
const function_executor_service_1 = require("./function-executor.service");
class AIActionExecutorService {
    constructor() {
        this.actionCache = new Map();
        this.retryQueue = new Map();
        this.workflows = new Map();
        this.functionExecutor = new function_executor_service_1.FunctionExecutorService();
        this.healthMetrics = this.initializeHealthMetrics();
        this.initializeWorkflows();
    }
    async executeAction(action, context, options = {}) {
        const actionId = this.generateActionId();
        const startTime = Date.now();
        try {
            if (options.useCache && !options.forceRefresh) {
                const cached = this.getCachedResult(action, context);
                if (cached) {
                    this.updateMetrics('cache_hit', action.type);
                    return cached.result;
                }
            }
            const validation = await this.validateActionPrerequisites(action, context);
            if (!validation.isValid) {
                return this.createFailureResult(actionId, validation.errors.join(', '), action);
            }
            const result = await this.executeWithMonitoring(action, context, options, actionId);
            if (result.success && options.useCache) {
                this.cacheResult(action, context, result, options.cacheTtl || 300000);
            }
            this.updateMetrics(result.success ? 'success' : 'failure', action.type);
            this.updateExecutionTime(action.type, Date.now() - startTime);
            return result;
        }
        catch (error) {
            console.error(`AI Action execution error:`, error);
            this.updateMetrics('error', action.type);
            return this.createFailureResult(actionId, error instanceof Error ? error.message : 'Unknown error', action);
        }
    }
    async executeActionsParallel(actions, context, options = {}) {
        const actionId = this.generateActionId();
        const startTime = Date.now();
        try {
            const promises = actions.map(action => this.executeAction(action, context, options.individual || {}));
            const results = await Promise.allSettled(promises);
            const successful = [];
            const errors = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successful.push(result.value);
                }
                else {
                    const action = actions[index];
                    if (action) {
                        errors.push({
                            action,
                            error: result.reason,
                            timestamp: new Date()
                        });
                    }
                }
            });
            return {
                actionId,
                results: successful,
                errors,
                summary: {
                    total: actions.length,
                    successful: successful.filter(r => r.success).length,
                    failed: successful.filter(r => !r.success).length + errors.length,
                    executionTime: Date.now() - startTime
                }
            };
        }
        catch (error) {
            console.error('Parallel action execution error:', error);
            const firstAction = actions[0];
            const errors = firstAction ? [{ action: firstAction, error: error, timestamp: new Date() }] : [];
            return {
                actionId,
                results: [],
                errors,
                summary: {
                    total: actions.length,
                    successful: 0,
                    failed: actions.length,
                    executionTime: Date.now() - startTime
                }
            };
        }
    }
    async executeWithMonitoring(action, context, options, actionId) {
        const monitor = this.createActionMonitor(action, context, actionId);
        try {
            monitor.start();
            let result;
            switch (action.type) {
                case 'booking':
                    result = await this.executeBookingAction(action, context);
                    break;
                case 'assessment':
                    result = await this.executeAssessmentAction(action, context);
                    break;
                case 'escalation':
                    result = await this.executeEscalationAction(action, context);
                    break;
                case 'notification':
                    result = await this.executeNotificationAction(action, context);
                    break;
                case 'query':
                    result = await this.executeQueryAction(action, context);
                    break;
                case 'calculation':
                    result = await this.executeCalculationAction(action, context);
                    break;
                case 'validation':
                    result = await this.executeValidationAction(action, context);
                    break;
                case 'composite':
                    result = await this.executeCompositeAction(action, context, options);
                    break;
                default:
                    result = await this.executeGenericAction(action, context);
            }
            monitor.complete(result);
            return result;
        }
        catch (error) {
            monitor.error(error);
            throw error;
        }
    }
    async executeBookingAction(action, context) {
        const { parameters } = action;
        const availability = await this.checkServiceAvailability(parameters.serviceId, parameters.date, parameters.time, context.tenantId);
        if (!availability.available) {
            return {
                actionId: this.generateActionId(),
                type: action.type,
                success: false,
                message: `Service not available: ${availability.reason}`,
                shouldContinue: true,
                data: { availability }
            };
        }
        const booking = await this.createBooking({
            serviceId: parameters.serviceId,
            userId: context.userId,
            tenantId: context.tenantId,
            date: parameters.date,
            time: parameters.time,
            notes: parameters.notes,
            phoneNumber: context.phoneNumber
        });
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: booking.success,
            message: booking.success ? 'Booking created successfully' : booking.message,
            shouldContinue: true,
            data: { booking: booking.data }
        };
    }
    async executeEscalationAction(action, context) {
        const { parameters } = action;
        await this.logEscalation({
            sessionId: context.sessionId,
            userId: context.userId,
            tenantId: context.tenantId,
            phoneNumber: context.phoneNumber,
            type: parameters.type || 'human',
            urgency: parameters.urgency || 'normal',
            reason: parameters.reason
        });
        const escalationResult = await this.executeHumanEscalation(parameters, context);
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: escalationResult.success,
            message: escalationResult.message,
            shouldContinue: false,
            data: { escalation: escalationResult }
        };
    }
    async executeAssessmentAction(action, context) {
        const { parameters } = action;
        const assessmentType = parameters.type || 'general';
        let assessmentResult;
        switch (assessmentType) {
            case 'urgency':
                assessmentResult = await this.assessUrgency(parameters.input, context);
                break;
            case 'risk':
                assessmentResult = await this.assessRisk(parameters.input, context);
                break;
            default:
                assessmentResult = await this.performGenericAssessment(parameters.input, context);
        }
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: true,
            message: `${assessmentType} assessment completed`,
            shouldContinue: true,
            data: { assessment: assessmentResult }
        };
    }
    async executeNotificationAction(action, context) {
        const { parameters } = action;
        const notification = {
            type: parameters.type || 'info',
            message: parameters.message,
            recipient: parameters.recipient || context.phoneNumber
        };
        const result = await this.sendNotification(notification, context);
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: result.success,
            message: result.message,
            shouldContinue: true,
            data: { notification: result }
        };
    }
    async executeQueryAction(action, context) {
        const { parameters } = action;
        let queryResult;
        switch (parameters.type) {
            case 'availability':
                queryResult = await this.queryAvailability(parameters, context);
                break;
            case 'booking_history':
                queryResult = await this.queryBookingHistory(parameters, context);
                break;
            default:
                queryResult = await this.executeGenericQuery(parameters, context);
        }
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: true,
            message: 'Query executed successfully',
            shouldContinue: true,
            data: { query: queryResult }
        };
    }
    async executeCalculationAction(action, context) {
        const { parameters } = action;
        const calculationResult = await this.performCalculation(parameters, context);
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: true,
            message: 'Calculation completed',
            shouldContinue: true,
            data: { calculation: calculationResult }
        };
    }
    async executeValidationAction(action, context) {
        const { parameters } = action;
        const validationResult = await this.performBusinessValidation(parameters, context);
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: validationResult.isValid,
            message: validationResult.isValid ? 'Validation passed' : validationResult.errors.join(', '),
            shouldContinue: true,
            data: { validation: validationResult }
        };
    }
    async executeCompositeAction(action, context, options) {
        const { parameters } = action;
        const subActions = parameters.actions;
        if (!Array.isArray(subActions) || subActions.length === 0) {
            return {
                actionId: this.generateActionId(),
                type: action.type,
                success: false,
                message: 'No sub-actions defined for composite action',
                shouldContinue: true
            };
        }
        const results = [];
        for (const subAction of subActions) {
            const result = await this.executeAction(subAction, context, options);
            results.push(result);
            if (!result.success && parameters.stopOnFirstFailure) {
                break;
            }
        }
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: failed === 0 || !parameters.requireAllSuccess,
            message: `Composite action completed: ${successful} successful, ${failed} failed`,
            shouldContinue: true,
            data: {
                subResults: results,
                summary: { total: results.length, successful, failed }
            }
        };
    }
    async executeGenericAction(action, context) {
        const functionCall = {
            name: action.functionName || action.type,
            arguments: JSON.stringify(action.parameters || {})
        };
        const functionDef = await this.getFunctionDefinition(functionCall.name, context);
        if (!functionDef) {
            return {
                actionId: this.generateActionId(),
                type: action.type,
                success: false,
                message: `Function ${functionCall.name} not found`,
                shouldContinue: true
            };
        }
        const result = await this.functionExecutor.executeFunction(functionCall, functionDef, context);
        return {
            actionId: this.generateActionId(),
            type: action.type,
            success: result.success,
            message: result.message || 'Function executed',
            shouldContinue: result.shouldContinue,
            data: result.data
        };
    }
    initializeWorkflows() {
        this.workflows.set('booking', {
            name: 'booking',
            description: 'Complete booking process',
            steps: [
                {
                    name: 'validate_input',
                    action: { type: 'validation', parameters: {} },
                    continueOnFailure: false
                },
                {
                    name: 'check_availability',
                    action: { type: 'query', parameters: { type: 'availability' } },
                    continueOnFailure: false
                },
                {
                    name: 'create_booking',
                    action: { type: 'booking', parameters: {} },
                    continueOnFailure: false
                }
            ]
        });
    }
    generateActionId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    initializeHealthMetrics() {
        return {
            totalActions: 0,
            successfulActions: 0,
            failedActions: 0,
            averageExecutionTime: 0,
            actionsByType: {},
            lastReset: Date.now()
        };
    }
    updateMetrics(outcome, actionType) {
        this.healthMetrics.totalActions++;
        if (outcome === 'success' || outcome === 'cache_hit') {
            this.healthMetrics.successfulActions++;
        }
        else {
            this.healthMetrics.failedActions++;
        }
        if (!this.healthMetrics.actionsByType[actionType]) {
            this.healthMetrics.actionsByType[actionType] = { total: 0, successful: 0, failed: 0 };
        }
        this.healthMetrics.actionsByType[actionType].total++;
        if (outcome === 'success' || outcome === 'cache_hit') {
            this.healthMetrics.actionsByType[actionType].successful++;
        }
        else {
            this.healthMetrics.actionsByType[actionType].failed++;
        }
    }
    updateExecutionTime(actionType, duration) {
        const total = this.healthMetrics.totalActions;
        const current = this.healthMetrics.averageExecutionTime;
        this.healthMetrics.averageExecutionTime = ((current * (total - 1)) + duration) / total;
    }
    createFailureResult(actionId, message, action) {
        return {
            actionId,
            type: action.type,
            success: false,
            message,
            shouldContinue: true
        };
    }
    async validateActionPrerequisites(action, context) {
        return { isValid: true, errors: [] };
    }
    getCachedResult(action, context) {
        const key = this.generateCacheKey(action, context);
        const cached = this.actionCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached;
        }
        return null;
    }
    cacheResult(action, context, result, ttl) {
        const key = this.generateCacheKey(action, context);
        this.actionCache.set(key, {
            result,
            expiresAt: Date.now() + ttl
        });
    }
    generateCacheKey(action, context) {
        return `${action.type}_${context.tenantId}_${JSON.stringify(action.parameters)}`;
    }
    async checkServiceAvailability(serviceId, date, time, tenantId) {
        return { available: true, reason: null };
    }
    async createBooking(bookingData) {
        return { success: true, data: { id: 'booking_123', ...bookingData }, message: 'Booking created' };
    }
    async logEscalation(escalationData) {
        console.log('Escalation logged:', escalationData);
    }
    async executeHumanEscalation(parameters, context) {
        return { success: true, message: 'Transferred to human agent' };
    }
    async assessUrgency(input, context) {
        return { level: 'medium', score: 0.6 };
    }
    async assessRisk(input, context) {
        return { level: 'low', score: 0.2 };
    }
    async performGenericAssessment(input, context) {
        return { type: 'general', result: 'assessment_complete' };
    }
    async sendNotification(notification, context) {
        return { success: true, message: 'Notification sent' };
    }
    async queryAvailability(parameters, context) {
        return { available_slots: ['09:00', '10:00', '14:00'], date: parameters.date };
    }
    async queryBookingHistory(parameters, context) {
        return { bookings: [], total: 0 };
    }
    async executeGenericQuery(parameters, context) {
        return { result: 'query_executed' };
    }
    async performCalculation(parameters, context) {
        return { result: 100, type: parameters.type || 'generic' };
    }
    async performBusinessValidation(parameters, context) {
        return { isValid: true, errors: [] };
    }
    async getFunctionDefinition(functionName, context) {
        return null;
    }
    createActionMonitor(action, context, actionId) {
        return {
            start: () => console.log(`🎬 Action ${actionId} started: ${action.type}`),
            complete: (result) => console.log(`✅ Action ${actionId} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`),
            error: (error) => console.error(`❌ Action ${actionId} error:`, error)
        };
    }
    getHealthMetrics() {
        return { ...this.healthMetrics };
    }
    resetMetrics() {
        this.healthMetrics = this.initializeHealthMetrics();
    }
    clearCaches() {
        this.actionCache.clear();
        this.retryQueue.clear();
    }
}
exports.AIActionExecutorService = AIActionExecutorService;
//# sourceMappingURL=ai-action-executor.service.js.map