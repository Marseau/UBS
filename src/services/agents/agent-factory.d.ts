import { AIAgent, AIFunction } from '../../types/ai.types';
import { BusinessDomain } from '../../types/database.types';
export declare class AgentFactory {
    private agents;
    constructor();
    private initializeAgents;
    getAgent(domain: BusinessDomain | 'other'): AIAgent;
    getAllAgents(): Map<BusinessDomain | 'other', AIAgent>;
    getAgentCapabilities(domain: BusinessDomain | 'other'): string[];
    getAgentFunctions(domain: BusinessDomain | 'other'): AIFunction[];
    hasSpecializedAgent(domain: BusinessDomain | 'other'): boolean;
    getSupportedDomains(): (BusinessDomain | 'other')[];
}
//# sourceMappingURL=agent-factory.d.ts.map