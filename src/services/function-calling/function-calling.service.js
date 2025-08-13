"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionCallingService = void 0;
const function_registry_service_1 = require("./function-registry.service");
const action_dispatcher_service_1 = require("./action-dispatcher.service");
const workflow_manager_service_1 = require("./workflow-manager.service");
class FunctionCallingService {
    constructor(config = {}) {
        this.cache = new Map();
        this.activeExecutions = new Set();
        this.config = {
            enableWorkflows: true,
            enableParallelExecution: true,
            maxConcurrentExecutions: 10,
            defaultTimeoutMs: 30000,
            enableMetrics: true,
            enableCaching: false,
            ...config
        };
        this.registry = new function_registry_service_1.FunctionRegistryService();
        this.dispatcher = new action_dispatcher_service_1.ActionDispatcherService();
        this.workflowManager = new workflow_manager_service_1.WorkflowManagerService();
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            averageExecutionTime: 0,
            functionUsage: {},
            workflowsExecuted: 0,
            activeExecutions: 0
        };
        this.initializeService();
    }
    initializeService() {
        console.log('🔧 Initializing Function Calling Service...');
        if (this.config.enableCaching) {
            this.startCacheCleanup();
        }
        if (this.config.enableMetrics) {
            this.startMetricsCollection();
        }
        console.log('✅ Function Calling Service initialized');
        this.logConfiguration();
    }
    async executeFunction(functionCall, context, options = {}) {
        const executionId = this.generateExecutionId();
        const startTime = Date.now();
        try {
            if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
                return {
                    success: false,
                    message: 'Maximum concurrent executions reached. Please try again later.',
                    shouldContinue: true
                };
            }
            this.activeExecutions.add(executionId);
            this.stats.totalCalls++;
            this.stats.activeExecutions = this.activeExecutions.size;
            if (options.useCache && this.config.enableCaching) {
                const cachedResult = this.getCachedResult(functionCall, context);
                if (cachedResult) {
                    console.log(`📋 Using cached result for ${functionCall.name}`);
                    this.updateStats(true, Date.now() - startTime, functionCall.name);
                    return cachedResult;
                }
            }
            console.log(`🚀 Executing function: ${functionCall.name}`);
            const result = await this.dispatcher.dispatch(functionCall, context);
            if (this.config.enableCaching && result.success && options.useCache) {
                this.cacheResult(functionCall, context, result);
            }
            this.updateStats(result.success, Date.now() - startTime, functionCall.name);
            console.log(`${result.success ? '✅' : '❌'} Function ${functionCall.name} ${result.success ? 'completed' : 'failed'}`);
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Function execution error for ${functionCall.name}:`, error);
            this.updateStats(false, Date.now() - startTime, functionCall.name);
            return {
                success: false,
                message: `Execution error: ${errorMessage}`,
                shouldContinue: false
            };
        }
        finally {
            this.activeExecutions.delete(executionId);
            this.stats.activeExecutions = this.activeExecutions.size;
        }
    }
    async executeFunctions(functionCalls, context, options = {}) {
        console.log(`🚀 Executing ${functionCalls.length} functions ${options.parallel ? 'in parallel' : 'sequentially'}`);
        const result = await this.dispatcher.dispatchPlan(functionCalls, context, {
            parallel: options.parallel || this.config.enableParallelExecution,
            timeoutMs: options.timeoutMs || this.config.defaultTimeoutMs
        });
        result.results.forEach(stepResult => {
            this.updateStats(stepResult.success, stepResult.duration, stepResult.functionName);
        });
        return result;
    }
    async executeWorkflow(workflowId, context, variables = {}) {
        if (!this.config.enableWorkflows) {
            throw new Error('Workflows are disabled in configuration');
        }
        console.log(`🌊 Executing workflow: ${workflowId}`);
        const execution = await this.workflowManager.executeWorkflow(workflowId, context, variables);
        this.stats.workflowsExecuted++;
        console.log(`${execution.status === 'completed' ? '✅' : '❌'} Workflow ${workflowId} ${execution.status}`);
        return execution;
    }
    getAvailableFunctions(context) {
        return this.registry.getAvailableFunctions(context);
    }
    searchFunctions(query, domain) {
        const allResults = this.registry.searchFunctions(query);
        if (domain) {
            return allResults.filter(func => func.domain === domain);
        }
        return allResults;
    }
    getFunctionsByCategory(category) {
        return this.registry.getFunctionsByCategory(category);
    }
    registerFunction(func) {
        return this.registry.registerFunction(func);
    }
    registerWorkflow(workflow) {
        return this.workflowManager.registerWorkflow(workflow);
    }
    getStats() {
        return { ...this.stats };
    }
    getRegistryStats() {
        return this.registry.getStats();
    }
    resetStats() {
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            averageExecutionTime: 0,
            functionUsage: {},
            workflowsExecuted: 0,
            activeExecutions: this.activeExecutions.size
        };
        console.log('📊 Statistics reset');
    }
    updateStats(success, duration, functionName) {
        if (success) {
            this.stats.successfulCalls++;
        }
        else {
            this.stats.failedCalls++;
        }
        const totalCalls = this.stats.successfulCalls + this.stats.failedCalls;
        this.stats.averageExecutionTime =
            (this.stats.averageExecutionTime * (totalCalls - 1) + duration) / totalCalls;
        this.stats.functionUsage[functionName] = (this.stats.functionUsage[functionName] || 0) + 1;
    }
    generateCacheKey(functionCall, context) {
        const hashData = {
            functionName: functionCall.name,
            arguments: functionCall.arguments,
            tenantId: context.tenantId,
            domain: context.tenantConfig?.domain
        };
        return btoa(JSON.stringify(hashData)).replace(/[^a-zA-Z0-9]/g, '');
    }
    getCachedResult(functionCall, context) {
        const key = this.generateCacheKey(functionCall, context);
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        if (Date.now() - cached.timestamp.getTime() > cached.ttlMs) {
            this.cache.delete(key);
            return null;
        }
        return cached.result;
    }
    cacheResult(functionCall, context, result) {
        const key = this.generateCacheKey(functionCall, context);
        let ttlMs = 60000;
        if (functionCall.name.includes('availability')) {
            ttlMs = 30000;
        }
        else if (functionCall.name.includes('info') || functionCall.name.includes('get')) {
            ttlMs = 300000;
        }
        this.cache.set(key, {
            key,
            result,
            timestamp: new Date(),
            ttlMs
        });
    }
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            let removedCount = 0;
            for (const [key, cached] of this.cache.entries()) {
                if (now - cached.timestamp.getTime() > cached.ttlMs) {
                    this.cache.delete(key);
                    removedCount++;
                }
            }
            if (removedCount > 0) {
                console.log(`🧹 Cleaned up ${removedCount} expired cache entries`);
            }
        }, 60000);
    }
    startMetricsCollection() {
        setInterval(() => {
            if (this.config.enableMetrics) {
                console.log('📊 Function Calling Metrics:', {
                    totalCalls: this.stats.totalCalls,
                    successRate: this.stats.totalCalls > 0
                        ? ((this.stats.successfulCalls / this.stats.totalCalls) * 100).toFixed(2) + '%'
                        : '0%',
                    avgExecutionTime: Math.round(this.stats.averageExecutionTime) + 'ms',
                    activeExecutions: this.stats.activeExecutions,
                    topFunctions: Object.entries(this.stats.functionUsage)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([name, count]) => `${name}: ${count}`)
                });
            }
        }, 300000);
    }
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    logConfiguration() {
        console.log('⚙️  Function Calling Configuration:', {
            enableWorkflows: this.config.enableWorkflows,
            enableParallelExecution: this.config.enableParallelExecution,
            maxConcurrentExecutions: this.config.maxConcurrentExecutions,
            defaultTimeoutMs: this.config.defaultTimeoutMs,
            enableMetrics: this.config.enableMetrics,
            enableCaching: this.config.enableCaching
        });
    }
    cleanup() {
        this.cache.clear();
        this.activeExecutions.clear();
        console.log('🧹 Function Calling Service cleaned up');
    }
}
exports.FunctionCallingService = FunctionCallingService;
//# sourceMappingURL=function-calling.service.js.map