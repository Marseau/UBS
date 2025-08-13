import { AIFunction, ConversationContext } from '../../types/ai.types';
import { BusinessDomain } from '../../types/database.types';
export interface RegisteredFunction extends AIFunction {
    id: string;
    domain: BusinessDomain | 'other';
    category: FunctionCategory;
    metadata: FunctionMetadata;
    middleware?: FunctionMiddleware[];
}
export interface FunctionMetadata {
    version: string;
    author: string;
    tags: string[];
    rateLimit?: {
        requests: number;
        windowMs: number;
    };
    permissions?: string[];
    deprecated?: boolean;
    replacedBy?: string;
}
export type FunctionCategory = 'booking' | 'inquiry' | 'consultation' | 'recommendation' | 'information' | 'management' | 'utility';
export interface FunctionMiddleware {
    name: string;
    priority: number;
    execute: (args: any, context: ConversationContext, next: Function) => Promise<any>;
}
export declare class FunctionRegistryService {
    private functions;
    private categories;
    private domains;
    private agentFactory;
    constructor();
    private initializeRegistry;
    getFunction(functionId: string): RegisteredFunction | undefined;
    getFunctionByName(name: string, domain?: BusinessDomain | 'other'): RegisteredFunction | undefined;
    getFunctionsByDomain(domain: BusinessDomain | 'other'): RegisteredFunction[];
    getFunctionsByCategory(category: FunctionCategory): RegisteredFunction[];
    searchFunctions(query: string): RegisteredFunction[];
    getAvailableFunctions(context: ConversationContext): RegisteredFunction[];
    registerFunction(func: RegisteredFunction): boolean;
    unregisterFunction(functionId: string): boolean;
    getStats(): RegistryStats;
    private categorizeFunction;
    private generateMetadata;
    private getDefaultRateLimit;
    private getDefaultMiddleware;
    private logRegistryStats;
}
export interface RegistryStats {
    totalFunctions: number;
    functionsByDomain: Record<string, number>;
    functionsByCategory: Record<string, number>;
    deprecatedFunctions: number;
    activeMiddleware: number;
}
//# sourceMappingURL=function-registry.service.d.ts.map