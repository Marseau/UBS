"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionRegistryService = void 0;
const agent_factory_1 = require("../agents/agent-factory");
class FunctionRegistryService {
    constructor() {
        this.functions = new Map();
        this.categories = new Map();
        this.domains = new Map();
        this.agentFactory = new agent_factory_1.AgentFactory();
        this.initializeRegistry();
    }
    initializeRegistry() {
        console.log('🔧 Initializing Function Registry...');
        const allAgents = this.agentFactory.getAllAgents();
        allAgents.forEach((agent, domain) => {
            const domainFunctions = [];
            agent.functions.forEach((func, index) => {
                const registeredFunction = {
                    ...func,
                    id: `${domain}_${func.name}_${index}`,
                    domain,
                    category: this.categorizeFunction(func.name),
                    metadata: this.generateMetadata(func, domain),
                    middleware: this.getDefaultMiddleware(func.name)
                };
                this.functions.set(registeredFunction.id, registeredFunction);
                domainFunctions.push(registeredFunction.id);
                const category = registeredFunction.category;
                if (!this.categories.has(category)) {
                    this.categories.set(category, []);
                }
                this.categories.get(category).push(registeredFunction.id);
            });
            this.domains.set(domain, domainFunctions);
        });
        console.log(`✅ Function Registry initialized with ${this.functions.size} functions`);
        this.logRegistryStats();
    }
    getFunction(functionId) {
        return this.functions.get(functionId);
    }
    getFunctionByName(name, domain) {
        if (domain) {
            const domainFunctions = this.domains.get(domain) || [];
            for (const functionId of domainFunctions) {
                const func = this.functions.get(functionId);
                if (func && func.name === name) {
                    return func;
                }
            }
        }
        else {
            for (const func of this.functions.values()) {
                if (func.name === name) {
                    return func;
                }
            }
        }
        return undefined;
    }
    getFunctionsByDomain(domain) {
        const functionIds = this.domains.get(domain) || [];
        return functionIds.map(id => this.functions.get(id)).filter(Boolean);
    }
    getFunctionsByCategory(category) {
        const functionIds = this.categories.get(category) || [];
        return functionIds.map(id => this.functions.get(id)).filter(Boolean);
    }
    searchFunctions(query) {
        const results = [];
        const searchTerm = query.toLowerCase();
        for (const func of this.functions.values()) {
            if (func.name.toLowerCase().includes(searchTerm) ||
                func.description.toLowerCase().includes(searchTerm) ||
                func.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
                results.push(func);
            }
        }
        return results.sort((a, b) => {
            const aExact = a.name.toLowerCase() === searchTerm;
            const bExact = b.name.toLowerCase() === searchTerm;
            if (aExact && !bExact)
                return -1;
            if (!aExact && bExact)
                return 1;
            return 0;
        });
    }
    getAvailableFunctions(context) {
        const domain = context.tenantConfig?.domain || 'other';
        const functions = this.getFunctionsByDomain(domain);
        return functions.filter(func => {
            if (func.metadata.deprecated)
                return false;
            if (func.metadata.permissions && func.metadata.permissions.length > 0) {
                return true;
            }
            return true;
        });
    }
    registerFunction(func) {
        if (this.functions.has(func.id)) {
            console.warn(`⚠️  Function ${func.id} already exists`);
            return false;
        }
        this.functions.set(func.id, func);
        if (!this.categories.has(func.category)) {
            this.categories.set(func.category, []);
        }
        this.categories.get(func.category).push(func.id);
        if (!this.domains.has(func.domain)) {
            this.domains.set(func.domain, []);
        }
        this.domains.get(func.domain).push(func.id);
        console.log(`✅ Registered function: ${func.id}`);
        return true;
    }
    unregisterFunction(functionId) {
        const func = this.functions.get(functionId);
        if (!func)
            return false;
        this.functions.delete(functionId);
        const categoryFunctions = this.categories.get(func.category);
        if (categoryFunctions) {
            const index = categoryFunctions.indexOf(functionId);
            if (index > -1) {
                categoryFunctions.splice(index, 1);
            }
        }
        const domainFunctions = this.domains.get(func.domain);
        if (domainFunctions) {
            const index = domainFunctions.indexOf(functionId);
            if (index > -1) {
                domainFunctions.splice(index, 1);
            }
        }
        console.log(`🗑️  Unregistered function: ${functionId}`);
        return true;
    }
    getStats() {
        const stats = {
            totalFunctions: this.functions.size,
            functionsByDomain: {},
            functionsByCategory: {},
            deprecatedFunctions: 0,
            activeMiddleware: 0
        };
        this.domains.forEach((functions, domain) => {
            stats.functionsByDomain[domain] = functions.length;
        });
        this.categories.forEach((functions, category) => {
            stats.functionsByCategory[category] = functions.length;
        });
        for (const func of this.functions.values()) {
            if (func.metadata.deprecated) {
                stats.deprecatedFunctions++;
            }
            if (func.middleware && func.middleware.length > 0) {
                stats.activeMiddleware += func.middleware.length;
            }
        }
        return stats;
    }
    categorizeFunction(name) {
        if (name.includes('book') || name.includes('schedule') || name.includes('appointment')) {
            return 'booking';
        }
        if (name.includes('check') || name.includes('availability') || name.includes('inquiry')) {
            return 'inquiry';
        }
        if (name.includes('consult') || name.includes('advice') || name.includes('assess')) {
            return 'consultation';
        }
        if (name.includes('suggest') || name.includes('recommend') || name.includes('tips')) {
            return 'recommendation';
        }
        if (name.includes('info') || name.includes('get') || name.includes('provide')) {
            return 'information';
        }
        if (name.includes('cancel') || name.includes('update') || name.includes('manage')) {
            return 'management';
        }
        return 'utility';
    }
    generateMetadata(func, domain) {
        return {
            version: '1.0.0',
            author: 'system',
            tags: [domain, this.categorizeFunction(func.name)],
            rateLimit: this.getDefaultRateLimit(func.name),
            permissions: [],
            deprecated: false
        };
    }
    getDefaultRateLimit(name) {
        if (name.includes('book') || name.includes('schedule')) {
            return { requests: 5, windowMs: 60000 };
        }
        if (name.includes('check') || name.includes('availability')) {
            return { requests: 20, windowMs: 60000 };
        }
        return { requests: 10, windowMs: 60000 };
    }
    getDefaultMiddleware(name) {
        const middleware = [];
        middleware.push({
            name: 'logging',
            priority: 100,
            execute: async (args, context, next) => {
                console.log(`🔧 Executing function: ${name}`);
                const start = Date.now();
                try {
                    const result = await next();
                    console.log(`✅ Function ${name} completed in ${Date.now() - start}ms`);
                    return result;
                }
                catch (error) {
                    console.error(`❌ Function ${name} failed after ${Date.now() - start}ms:`, error);
                    throw error;
                }
            }
        });
        if (name.includes('book') || name.includes('schedule')) {
            middleware.push({
                name: 'booking-validation',
                priority: 90,
                execute: async (args, context, next) => {
                    if (!args.date || !args.time) {
                        throw new Error('Date and time are required for booking functions');
                    }
                    return next();
                }
            });
        }
        return middleware;
    }
    logRegistryStats() {
        const stats = this.getStats();
        console.log('📊 Function Registry Stats:');
        console.log(`  Total Functions: ${stats.totalFunctions}`);
        console.log('  By Domain:', stats.functionsByDomain);
        console.log('  By Category:', stats.functionsByCategory);
        console.log(`  Deprecated: ${stats.deprecatedFunctions}`);
        console.log(`  Active Middleware: ${stats.activeMiddleware}`);
    }
}
exports.FunctionRegistryService = FunctionRegistryService;
//# sourceMappingURL=function-registry.service.js.map