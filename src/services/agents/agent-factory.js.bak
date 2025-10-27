"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFactory = void 0;
const legal_agent_1 = require("./legal-agent");
const healthcare_agent_1 = require("./healthcare-agent");
const education_agent_1 = require("./education-agent");
const beauty_agent_1 = require("./beauty-agent");
const sports_agent_1 = require("./sports-agent");
const consulting_agent_1 = require("./consulting-agent");
const general_agent_1 = require("./general-agent");
const other_agent_1 = require("./other-agent");
class AgentFactory {
    constructor() {
        this.agents = new Map();
        this.initializeAgents();
    }
    initializeAgents() {
        this.agents.set('legal', new legal_agent_1.LegalAgent().getAgent());
        this.agents.set('healthcare', new healthcare_agent_1.HealthcareAgent().getAgent());
        this.agents.set('education', new education_agent_1.EducationAgent().getAgent());
        this.agents.set('beauty', new beauty_agent_1.BeautyAgent().getAgent());
        this.agents.set('sports', new sports_agent_1.SportsAgent().getAgent());
        this.agents.set('consulting', new consulting_agent_1.ConsultingAgent().getAgent());
        this.agents.set('other', new other_agent_1.OtherAgent().getAgent());
        console.log('🤖 AI Agents initialized for all business domains');
    }
    getAgent(domain) {
        const agent = this.agents.get(domain);
        if (!agent) {
            console.warn(`⚠️  No agent found for domain: ${domain}, using general agent`);
            return this.agents.get('other');
        }
        return agent;
    }
    getAllAgents() {
        return new Map(this.agents);
    }
    getAgentCapabilities(domain) {
        const agent = this.getAgent(domain);
        return agent.capabilities || [];
    }
    getAgentFunctions(domain) {
        const agent = this.getAgent(domain);
        return agent.functions || [];
    }
    hasSpecializedAgent(domain) {
        return this.agents.has(domain) && domain !== 'other';
    }
    getSupportedDomains() {
        return Array.from(this.agents.keys());
    }
}
exports.AgentFactory = AgentFactory;
//# sourceMappingURL=agent-factory.js.map