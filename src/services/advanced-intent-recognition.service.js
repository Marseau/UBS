"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedIntentRecognitionService = void 0;
const intent_router_service_1 = require("./intent-router.service");
const openai_1 = __importDefault(require("openai"));
class AdvancedIntentRecognitionService {
    constructor() {
        this.cache = new Map();
        this.learningData = new Map();
        this.metrics = this.createEmptyMetrics();
        this.engines = [];
        this.intentRouter = new intent_router_service_1.IntentRouterService();
        this.initializeOpenAI();
        this.initializeEngines();
        this.initializeMetrics();
    }
    createEmptyMetrics() {
        return {
            totalRecognitions: 0,
            successfulRecognitions: 0,
            cacheHits: 0,
            averageProcessingTime: 0,
            intentAccuracy: new Map(),
            enginePerformance: new Map(),
            lastReset: Date.now()
        };
    }
    async recognizeIntent(message, context, options = {}) {
        const startTime = Date.now();
        const messageId = this.generateMessageId(message, context);
        try {
            if (!options.forceRefresh) {
                const cached = this.getCachedResult(messageId);
                if (cached) {
                    this.updateMetrics('cache_hit', Date.now() - startTime);
                    return cached.result;
                }
            }
            const engineResults = await this.runMultipleEngines(message, context, options);
            const ensembleResult = await this.applyEnsembleMethod(engineResults, context);
            const finalResult = await this.postProcessResult(ensembleResult, context);
            await this.storeLearningData(message, context, finalResult);
            this.cacheResult(messageId, finalResult, options.cacheTtl || 300000);
            this.updateMetrics('success', Date.now() - startTime);
            return finalResult;
        }
        catch (error) {
            console.error('Advanced intent recognition error:', error);
            this.updateMetrics('error', Date.now() - startTime);
            const fallbackIntent = await this.intentRouter.analyzeIntent(message, context);
            return this.enhanceBasicIntent(fallbackIntent, context);
        }
    }
    async routeWithAdvancedLogic(intent, context) {
        const startTime = Date.now();
        try {
            const primaryRoute = this.intentRouter.routeToDomain(intent, context);
            const advancedRules = await this.applyAdvancedRoutingRules(intent, context);
            const escalationDecision = await this.evaluateEscalationNeeds(intent, context);
            const actionRecommendations = await this.generateActionRecommendations(intent, context);
            const decision = {
                primaryDomain: primaryRoute,
                alternativeDomains: advancedRules.alternatives,
                escalationRequired: escalationDecision.required,
                escalationType: escalationDecision.type,
                confidence: intent.confidence,
                priority: this.calculatePriority(intent, context),
                suggestedActions: actionRecommendations,
                metadata: {
                    processingTime: Date.now() - startTime,
                    rulesApplied: advancedRules.rulesApplied,
                    confidenceFactors: this.getConfidenceFactors(intent)
                }
            };
            this.updateRoutingMetrics(decision);
            return decision;
        }
        catch (error) {
            console.error('Advanced routing error:', error);
            return {
                primaryDomain: context.tenantConfig?.domain || 'other',
                alternativeDomains: [],
                escalationRequired: false,
                escalationType: 'none',
                confidence: 0.5,
                priority: 'medium',
                suggestedActions: [],
                metadata: {
                    processingTime: Date.now() - startTime,
                    rulesApplied: [],
                    confidenceFactors: {}
                }
            };
        }
    }
    initializeEngines() {
        this.engines.push({
            name: 'pattern_based',
            weight: 0.3,
            execute: async (message, context) => {
                const result = await this.intentRouter.analyzeIntent(message, context);
                return this.enhanceBasicIntent(result, context);
            }
        });
        this.engines.push({
            name: 'openai_gpt',
            weight: 0.4,
            execute: async (message, context) => {
                return await this.recognizeWithOpenAI(message, context);
            }
        });
        this.engines.push({
            name: 'statistical',
            weight: 0.3,
            execute: async (message, context) => {
                return await this.recognizeWithStatisticalModel(message, context);
            }
        });
    }
    async runMultipleEngines(message, context, options) {
        const selectedEngines = options.engines || this.engines;
        const promises = selectedEngines.map(async (engine) => {
            try {
                const startTime = Date.now();
                const result = await engine.execute(message, context);
                const processingTime = Date.now() - startTime;
                return {
                    engineName: engine.name,
                    weight: engine.weight,
                    result,
                    processingTime,
                    success: true
                };
            }
            catch (error) {
                console.error(`Engine ${engine.name} failed:`, error);
                return {
                    engineName: engine.name,
                    weight: engine.weight,
                    result: this.getDefaultIntent(context),
                    processingTime: 0,
                    success: false
                };
            }
        });
        return await Promise.all(promises);
    }
    async applyEnsembleMethod(engineResults, context) {
        const intentVotes = new Map();
        engineResults.forEach(result => {
            if (!result.success)
                return;
            const intent = result.result;
            const weight = result.weight * (intent.confidence || 0.5);
            const existing = intentVotes.get(intent.type) || { score: 0, confidence: 0, count: 0 };
            intentVotes.set(intent.type, {
                score: existing.score + weight,
                confidence: existing.confidence + (intent.confidence || 0.5),
                count: existing.count + 1
            });
        });
        let bestIntent = 'other';
        let bestScore = 0;
        let totalConfidence = 0;
        let totalCount = 0;
        for (const [intentType, vote] of intentVotes.entries()) {
            const avgConfidence = vote.confidence / vote.count;
            const adjustedScore = vote.score * avgConfidence;
            if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                bestIntent = intentType;
                totalConfidence = avgConfidence;
                totalCount = vote.count;
            }
        }
        const allEntities = [];
        engineResults.forEach(result => {
            if (result.success && result.result.entities) {
                allEntities.push(...result.result.entities);
            }
        });
        const uniqueEntities = this.deduplicateEntities(allEntities);
        return {
            type: bestIntent,
            confidence: totalConfidence,
            entities: uniqueEntities,
            context: {
                businessDomain: context.tenantConfig?.domain,
                conversationTurn: context.conversationHistory.length,
                engineConsensus: totalCount,
                alternativeIntents: this.getAlternativeIntents(intentVotes, bestIntent)
            },
            metadata: {
                engines: engineResults.map(r => ({
                    name: r.engineName,
                    success: r.success,
                    processingTime: r.processingTime
                })),
                ensembleMethod: 'weighted_voting',
                totalProcessingTime: engineResults.reduce((sum, r) => sum + r.processingTime, 0)
            }
        };
    }
    async recognizeWithOpenAI(message, context) {
        if (!this.openai) {
            throw new Error('OpenAI not configured');
        }
        const prompt = this.buildAdvancedIntentPrompt(message, context);
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 500
        });
        const result = response.choices[0]?.message?.content;
        if (!result) {
            throw new Error('No result from OpenAI');
        }
        const parsed = this.parseOpenAIResponse(result);
        return {
            type: parsed.intent,
            confidence: parsed.confidence || 0.5,
            entities: parsed.entities || [],
            context: {
                businessDomain: context.tenantConfig?.domain,
                reasoning: parsed.reasoning
            },
            metadata: {
                engine: 'openai_gpt',
                model: 'gpt-4'
            }
        };
    }
    async recognizeWithStatisticalModel(message, context) {
        const intentScores = new Map();
        for (const [learnedMessage, entries] of this.learningData.entries()) {
            const similarity = this.calculateTextSimilarity(message, learnedMessage);
            if (similarity > 0.3) {
                entries.forEach(entry => {
                    const currentScore = intentScores.get(entry.intent) || 0;
                    intentScores.set(entry.intent, currentScore + (similarity * entry.confidence));
                });
            }
        }
        let bestIntent = 'other';
        let bestScore = 0;
        for (const [intent, score] of intentScores.entries()) {
            if (score > bestScore) {
                bestScore = score;
                bestIntent = intent;
            }
        }
        const entities = await this.extractEntitiesStatistical(message);
        return {
            type: bestIntent,
            confidence: Math.min(bestScore, 1.0),
            entities,
            context: {
                businessDomain: context.tenantConfig?.domain,
                method: 'statistical'
            },
            metadata: {
                engine: 'statistical',
                learningSamples: this.learningData.size
            }
        };
    }
    async applyAdvancedRoutingRules(intent, context) {
        const rules = [];
        const alternatives = [];
        const hour = new Date().getHours();
        if (hour < 8 || hour > 18) {
            rules.push('after_hours');
            if (intent.type === 'emergency') {
                alternatives.push('healthcare');
            }
        }
        const currentLoad = await this.getCurrentSystemLoad();
        if (currentLoad > 0.8) {
            rules.push('high_load');
            alternatives.push('other');
        }
        if (intent.type === 'emergency') {
            rules.push('emergency_priority');
            alternatives.push('healthcare');
        }
        if (intent.entities.some(e => e.value && e.value.toLowerCase().includes('advogado'))) {
            alternatives.push('legal');
            rules.push('legal_entity_detected');
        }
        return {
            alternatives,
            rulesApplied: rules
        };
    }
    async evaluateEscalationNeeds(intent, context) {
        if (intent.type === 'emergency') {
            return { required: true, type: 'immediate', reason: 'Emergency detected' };
        }
        if (intent.confidence < 0.6 && context.conversationHistory.length > 6) {
            return { required: true, type: 'human_review', reason: 'Low confidence after multiple turns' };
        }
        if (intent.type === 'escalation_request') {
            return { required: true, type: 'human_agent', reason: 'User requested human agent' };
        }
        const domainEscalation = this.checkDomainEscalation(intent, context);
        if (domainEscalation.required) {
            return domainEscalation;
        }
        return { required: false, type: 'none', reason: 'No escalation needed' };
    }
    async generateActionRecommendations(intent, context) {
        const recommendations = [];
        switch (intent.type) {
            case 'booking_request':
                recommendations.push({
                    action: 'check_availability',
                    priority: 'high',
                    description: 'Verify service availability'
                });
                break;
            case 'emergency':
                recommendations.push({
                    action: 'escalate_immediately',
                    priority: 'critical',
                    description: 'Immediate human intervention required'
                });
                break;
            case 'price_inquiry':
                recommendations.push({
                    action: 'provide_pricing',
                    priority: 'medium',
                    description: 'Display service pricing information'
                });
                break;
        }
        if (context.conversationHistory.length === 0) {
            recommendations.push({
                action: 'send_greeting',
                priority: 'low',
                description: 'Welcome new conversation'
            });
        }
        return recommendations;
    }
    initializeOpenAI() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new openai_1.default({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
    }
    initializeMetrics() {
        this.metrics = {
            totalRecognitions: 0,
            successfulRecognitions: 0,
            cacheHits: 0,
            averageProcessingTime: 0,
            intentAccuracy: new Map(),
            enginePerformance: new Map(),
            lastReset: Date.now()
        };
    }
    generateMessageId(message, context) {
        const content = message + context.sessionId + (context.tenantId || '');
        return Buffer.from(content).toString('base64').substring(0, 16);
    }
    getCachedResult(messageId) {
        const cached = this.cache.get(messageId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached;
        }
        if (cached) {
            this.cache.delete(messageId);
        }
        return null;
    }
    cacheResult(messageId, result, ttl) {
        this.cache.set(messageId, {
            result,
            expiresAt: Date.now() + ttl
        });
    }
    updateMetrics(outcome, processingTime) {
        this.metrics.totalRecognitions++;
        if (outcome === 'success') {
            this.metrics.successfulRecognitions++;
        }
        else if (outcome === 'cache_hit') {
            this.metrics.cacheHits++;
        }
        const total = this.metrics.averageProcessingTime * (this.metrics.totalRecognitions - 1);
        this.metrics.averageProcessingTime = (total + processingTime) / this.metrics.totalRecognitions;
    }
    updateRoutingMetrics(decision) {
        console.log('Routing decision made:', {
            domain: decision.primaryDomain,
            confidence: decision.confidence,
            escalation: decision.escalationRequired
        });
    }
    buildAdvancedIntentPrompt(message, context) {
        return `Analise esta mensagem e identifique a intenção do usuário com alta precisão.

Mensagem: "${message}"

Contexto:
- Domínio do negócio: ${context.tenantConfig?.domain || 'geral'}
- Histórico: ${context.conversationHistory.length} mensagens
- Tenant: ${context.tenantId}

Considere:
1. Contexto da conversa anterior
2. Domínio específico do negócio
3. Urgência e sentimento
4. Entidades mencionadas

Intents possíveis: booking_request, booking_cancel, booking_reschedule, booking_inquiry, service_inquiry, availability_check, price_inquiry, business_hours, location_inquiry, general_greeting, complaint, compliment, escalation_request, emergency, other

Retorne um JSON válido com:
{
  "intent": "tipo_da_intencao",
  "confidence": 0.95,
  "entities": [{"type": "service_name", "value": "exemplo", "confidence": 0.9}],
  "reasoning": "explicação da análise"
}`;
    }
    parseOpenAIResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return {
                intent: 'other',
                confidence: 0.5,
                entities: [],
                reasoning: 'Could not parse response'
            };
        }
        catch (error) {
            console.error('Error parsing OpenAI response:', error);
            return {
                intent: 'other',
                confidence: 0.5,
                entities: [],
                reasoning: 'Parse error'
            };
        }
    }
    enhanceBasicIntent(intent, context) {
        return {
            ...intent,
            metadata: {
                engine: 'pattern_based',
                enhanced: true
            }
        };
    }
    getDefaultIntent(context) {
        return {
            type: 'other',
            confidence: 0.3,
            entities: [],
            context: { businessDomain: context.tenantConfig?.domain },
            metadata: { engine: 'fallback' }
        };
    }
    deduplicateEntities(entities) {
        const seen = new Set();
        return entities.filter(entity => {
            const key = `${entity.type}:${entity.value}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    getAlternativeIntents(votes, excludeIntent) {
        return Array.from(votes.entries())
            .filter(([intent]) => intent !== excludeIntent)
            .sort(([, a], [, b]) => b.score - a.score)
            .slice(0, 3)
            .map(([intent]) => intent);
    }
    calculateTextSimilarity(text1, text2) {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];
        return intersection.length / union.length;
    }
    async extractEntitiesStatistical(message) {
        const entities = [];
        const patterns = {
            date: /(\d{1,2}\/\d{1,2}\/?\d{0,4}|hoje|amanhã|segunda|terça|quarta|quinta|sexta)/gi,
            time: /(\d{1,2}:\d{2}|\d{1,2}h\d{0,2}|manhã|tarde|noite)/gi,
            phone: /(\d{10,11}|\(\d{2}\)\s?\d{4,5}-?\d{4})/gi
        };
        Object.entries(patterns).forEach(([type, regex]) => {
            const matches = message.match(regex);
            if (matches) {
                matches.forEach(match => {
                    entities.push({
                        type: type,
                        value: match,
                        confidence: 0.7,
                        start: message.indexOf(match),
                        end: message.indexOf(match) + match.length
                    });
                });
            }
        });
        return entities;
    }
    calculatePriority(intent, context) {
        if (intent.type === 'emergency')
            return 'critical';
        if (intent.type === 'escalation_request')
            return 'high';
        if (intent.confidence > 0.8)
            return 'high';
        if (intent.confidence > 0.6)
            return 'medium';
        return 'low';
    }
    getConfidenceFactors(intent) {
        return {
            baseConfidence: intent.confidence,
            entityCount: intent.entities.length,
            engineConsensus: intent.context.engineConsensus || 0
        };
    }
    async getCurrentSystemLoad() {
        return Math.random() * 0.5 + 0.3;
    }
    checkDomainEscalation(intent, context) {
        if (context.tenantConfig?.domain === 'healthcare' && intent.confidence < 0.5) {
            return { required: true, type: 'medical_review', reason: 'Healthcare domain requires high confidence' };
        }
        return { required: false, type: 'none', reason: '' };
    }
    async storeLearningData(message, context, result) {
        const key = message.toLowerCase().trim();
        const entries = this.learningData.get(key) || [];
        entries.push({
            intent: result.type,
            confidence: result.confidence,
            context: context.tenantConfig?.domain || 'other',
            timestamp: Date.now()
        });
        if (entries.length > 10) {
            entries.splice(0, entries.length - 10);
        }
        this.learningData.set(key, entries);
    }
    async postProcessResult(result, context) {
        if (context.tenantConfig?.domain === 'healthcare' && result.type === 'booking_request') {
            result.confidence = Math.min(result.confidence + 0.1, 1.0);
        }
        return result;
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        this.initializeMetrics();
    }
    clearCache() {
        this.cache.clear();
    }
}
exports.AdvancedIntentRecognitionService = AdvancedIntentRecognitionService;
exports.default = AdvancedIntentRecognitionService;
//# sourceMappingURL=advanced-intent-recognition.service.js.map