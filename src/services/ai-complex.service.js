"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const openai_1 = __importDefault(require("openai"));
const ai_types_1 = require("../types/ai.types");
const agent_factory_1 = require("./agents/agent-factory");
const memory_service_1 = require("./memory.service");
const media_processor_service_1 = require("./media-processor.service");
const { ConversationOutcomeService } = require("./conversation-outcome.service");
class AIService {
    constructor() {
        this.config = {
            openaiApiKey: process.env.OPENAI_API_KEY || '',
            model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
            temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
            maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
            timeout: parseInt(process.env.AI_TIMEOUT || '30000'),
            retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '3'),
            memoryTtl: parseInt(process.env.AI_MEMORY_TTL || '3600'),
            enableFunctionCalling: process.env.AI_ENABLE_FUNCTIONS !== 'false',
            enableMultiModal: process.env.AI_ENABLE_MULTIMODAL !== 'false',
            logLevel: process.env.AI_LOG_LEVEL || 'info'
        };
        if (!this.config.openaiApiKey) {
            console.warn('⚠️  OpenAI API key not configured. AI features will be disabled.');
            return;
        }
        this.openai = new openai_1.default({
            apiKey: this.config.openaiApiKey,
            timeout: this.config.timeout
        });
        this.agentFactory = new agent_factory_1.AgentFactory();
        this.memoryService = new memory_service_1.MemoryService(this.config.memoryTtl);
        this.mediaProcessor = new media_processor_service_1.MediaProcessorService(this.openai);
        this.conversationOutcomeService = new ConversationOutcomeService();
        console.log('🤖 AI Service initialized with model:', this.config.model);
    }
    async processMessage(message, context, media) {
        try {
            if (!this.openai) {
                throw new ai_types_1.AIError('OpenAI not configured', 'NO_OPENAI_CONFIG');
            }
            const memory = await this.memoryService.getMemoryManager(context.sessionId);
            await memory.updateContext(context);
            let enrichedMessage = message;
            if (media && media.length > 0 && this.config.enableMultiModal) {
                enrichedMessage = await this.processMediaContent(message, media);
            }
            const intent = await this.recognizeIntent(enrichedMessage, context);
            const agent = this.agentFactory.getAgent(context.tenantConfig?.domain || 'other');
            const messages = await this.buildConversationMessages(enrichedMessage, context, agent);
            const aiResponse = await this.getAIResponse(messages, agent, context);
            const functionResults = await this.processFunctionCalls(aiResponse, context);
            const response = {
                message: aiResponse.message || '',
                intent,
                functionCalls: aiResponse.function_call ? [aiResponse.function_call] : [],
                confidence: this.calculateConfidence(aiResponse, intent),
                shouldEscalate: this.shouldEscalate(enrichedMessage, intent, context),
                suggestedActions: this.generateSuggestedActions(intent, context),
                context: this.extractResponseContext(functionResults)
            };
            const updatedContext = await this.updateConversationHistory(context, enrichedMessage, response, memory);
            
            // 🎯 INTEGRAÇÃO: Detectar e marcar outcome automaticamente
            if (context.conversationId && context.tenantId && context.userId && context.phoneNumber) {
                await this.conversationOutcomeService.detectAndMarkOutcome(
                    context.conversationId,
                    enrichedMessage,
                    intent?.name || 'unknown',
                    response.confidence,
                    context.tenantId,
                    context.userId,
                    context.phoneNumber
                );
            }
            
            const actions = await this.generateActions(response, updatedContext);
            return {
                response,
                updatedContext,
                actions
            };
        }
        catch (error) {
            console.error('❌ Error processing AI message:', error);
            const fallbackResponse = {
                message: 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato diretamente conosco.',
                confidence: 0,
                shouldEscalate: true,
                context: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
            return {
                response: fallbackResponse,
                updatedContext: context,
                actions: [{
                        type: 'escalate_to_human',
                        payload: { reason: 'ai_error', error: error instanceof Error ? error.message : 'Unknown error' },
                        priority: 'high'
                    }]
            };
        }
    }
    async processMediaContent(message, media) {
        const mediaAnalysis = [];
        for (const item of media) {
            try {
                let analysis = '';
                switch (item.type) {
                    case 'image':
                        analysis = await this.mediaProcessor.processImage(item.content, item.mimeType);
                        mediaAnalysis.push(`[Imagem analisada: ${analysis}]`);
                        break;
                    case 'audio':
                        analysis = await this.mediaProcessor.processAudio(item.content, item.mimeType);
                        mediaAnalysis.push(`[Áudio transcrito: ${analysis}]`);
                        break;
                    case 'document':
                        analysis = await this.mediaProcessor.extractText(item.content, item.mimeType);
                        mediaAnalysis.push(`[Documento analisado: ${analysis}]`);
                        break;
                }
            }
            catch (error) {
                console.error(`Error processing ${item.type}:`, error);
                mediaAnalysis.push(`[Erro ao processar ${item.type}]`);
            }
        }
        return mediaAnalysis.length > 0
            ? `${message}\n\n${mediaAnalysis.join('\n')}`
            : message;
    }
    async recognizeIntent(message, context) {
        try {
            const intentPrompt = this.buildIntentRecognitionPrompt(message, context);
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: intentPrompt }],
                temperature: 0.3,
                max_tokens: 200
            });
            const result = response.choices[0]?.message?.content;
            if (!result) {
                throw new ai_types_1.AIError('No intent recognition result', 'NO_INTENT_RESULT');
            }
            return this.parseIntentResult(result);
        }
        catch (error) {
            console.error('Error recognizing intent:', error);
            return {
                type: 'other',
                confidence: 0.5,
                entities: [],
                context: {}
            };
        }
    }
    async buildConversationMessages(message, context, agent) {
        const messages = [];
        messages.push({
            role: 'system',
            content: this.buildSystemPrompt(agent, context)
        });
        const recentHistory = context.conversationHistory.slice(-10);
        for (const historyMessage of recentHistory) {
            if (historyMessage.role !== 'system') {
                messages.push({
                    role: historyMessage.role,
                    content: historyMessage.content
                });
            }
        }
        messages.push({
            role: 'user',
            content: message
        });
        return messages;
    }
    async getAIResponse(messages, agent, context) {
        const functions = this.config.enableFunctionCalling ?
            agent.functions.map(f => this.convertToOpenAIFunction(f)) : undefined;
        const response = await this.openai.chat.completions.create({
            model: agent.model || this.config.model,
            messages,
            temperature: agent.temperature || this.config.temperature,
            max_tokens: agent.maxTokens || this.config.maxTokens,
            functions,
            function_call: functions && functions.length > 0 ? 'auto' : undefined
        });
        const choice = response.choices[0];
        if (!choice) {
            throw new ai_types_1.AIError('No response from OpenAI', 'NO_RESPONSE');
        }
        return {
            message: choice.message?.content || undefined,
            function_call: choice.message?.function_call ? {
                name: choice.message.function_call.name,
                arguments: choice.message.function_call.arguments || '{}'
            } : undefined
        };
    }
    async processFunctionCalls(aiResponse, context) {
        const results = [];
        if (aiResponse.function_call) {
            try {
                const agent = this.agentFactory.getAgent(context.tenantConfig?.domain || 'other');
                const functionDef = agent.functions.find(f => f.name === aiResponse.function_call.name);
                if (!functionDef) {
                    throw new ai_types_1.FunctionCallError(aiResponse.function_call.name, 'Function not found');
                }
                const args = JSON.parse(aiResponse.function_call.arguments);
                const result = await functionDef.handler(args, context);
                results.push(result);
            }
            catch (error) {
                console.error('Error executing function call:', error);
                results.push({
                    success: false,
                    message: error instanceof Error ? error.message : 'Function execution failed',
                    shouldContinue: true
                });
            }
        }
        return results;
    }
    buildSystemPrompt(agent, context) {
        const tenant = context.tenantConfig;
        const user = context.userProfile;
        let prompt = agent.systemPrompt;
        if (tenant) {
            prompt += `\n\nCONTEXTO DO NEGÓCIO:
- Nome: ${tenant.businessName}
- Domínio: ${tenant.domain}
- Serviços disponíveis: ${tenant.services.map(s => s.name).join(', ')}`;
            if (tenant.aiSettings.greetingMessage) {
                prompt += `\n- Mensagem de saudação padrão: ${tenant.aiSettings.greetingMessage}`;
            }
        }
        if (user) {
            prompt += `\n\nCONTEXTO DO USUÁRIO:
- Nome: ${user.preferredName || user.name || 'não informado'}
- Agendamentos anteriores: ${user.previousAppointments.length}
- Idioma: ${user.language}
- Timezone: ${user.timezone}`;
        }
        prompt += `\n\nCONTEXTO TEMPORAL:
- Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: tenant?.businessHours.timezone })}
- Timezone do negócio: ${tenant?.businessHours.timezone || 'America/Sao_Paulo'}`;
        return prompt;
    }
    buildIntentRecognitionPrompt(message, context) {
        return `Analise a seguinte mensagem e identifique a intenção do usuário.

Mensagem: "${message}"

Contexto do negócio: ${context.tenantConfig?.domain || 'geral'}

Possíveis intenções:
- booking_request: solicitar agendamento
- booking_cancel: cancelar agendamento  
- booking_reschedule: reagendar agendamento
- booking_inquiry: perguntar sobre agendamento existente
- service_inquiry: perguntar sobre serviços
- availability_check: verificar disponibilidade
- price_inquiry: perguntar sobre preços
- business_hours: perguntar sobre horários de funcionamento
- location_inquiry: perguntar sobre localização
- general_greeting: cumprimento geral
- complaint: reclamação
- compliment: elogio
- escalation_request: solicitar atendimento humano
- emergency: emergência
- other: outras intenções

Retorne APENAS um JSON no formato:
{
  "intent": "tipo_da_intencao",
  "confidence": 0.95,
  "entities": [
    {"type": "service_name", "value": "exemplo", "confidence": 0.9}
  ]
}`;
    }
    parseIntentResult(result) {
        try {
            const parsed = JSON.parse(result);
            return {
                type: parsed.intent || 'other',
                confidence: parsed.confidence || 0.5,
                entities: parsed.entities || [],
                context: {}
            };
        }
        catch (error) {
            console.error('Error parsing intent result:', error);
            return {
                type: 'other',
                confidence: 0.5,
                entities: [],
                context: {}
            };
        }
    }
    convertToOpenAIFunction(func) {
        const properties = {};
        const required = [];
        for (const param of func.parameters) {
            properties[param.name] = {
                type: param.type,
                description: param.description
            };
            if (param.enum) {
                properties[param.name].enum = param.enum;
            }
            if (param.required) {
                required.push(param.name);
            }
        }
        return {
            name: func.name,
            description: func.description,
            parameters: {
                type: 'object',
                properties,
                required
            }
        };
    }
    calculateConfidence(aiResponse, intent) {
        let confidence = intent.confidence;
        if (aiResponse.function_call) {
            confidence = Math.min(confidence + 0.2, 1.0);
        }
        if (aiResponse.message && aiResponse.message.length < 20) {
            confidence = Math.max(confidence - 0.1, 0.1);
        }
        return Math.round(confidence * 100) / 100;
    }
    shouldEscalate(message, intent, context) {
        if (intent.type === 'emergency')
            return true;
        if (intent.type === 'escalation_request')
            return true;
        const recentMessages = context.conversationHistory.slice(-6);
        const aiResponses = recentMessages.filter(m => m.role === 'assistant');
        if (aiResponses.length >= 3 && intent.confidence < 0.6)
            return true;
        const escalationTriggers = context.tenantConfig?.aiSettings.escalationTriggers || [];
        const lowerMessage = message.toLowerCase();
        return escalationTriggers.some(trigger => lowerMessage.includes(trigger.toLowerCase()));
    }
    generateSuggestedActions(intent, context) {
        const actions = [];
        switch (intent.type) {
            case 'booking_request':
                actions.push('Verificar disponibilidade', 'Confirmar detalhes do serviço');
                break;
            case 'service_inquiry':
                actions.push('Mostrar lista de serviços', 'Explicar preços');
                break;
            case 'availability_check':
                actions.push('Consultar agenda', 'Sugerir horários');
                break;
            default:
                actions.push('Continuar conversa');
        }
        return actions;
    }
    extractResponseContext(functionResults) {
        const context = {};
        for (const result of functionResults) {
            if (result.success && result.data) {
                Object.assign(context, result.data);
            }
        }
        return context;
    }
    async updateConversationHistory(context, userMessage, aiResponse, memory) {
        const userMsg = {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: userMessage,
            timestamp: new Date()
        };
        const assistantMsg = {
            id: `msg_${Date.now()}_assistant`,
            role: 'assistant',
            content: aiResponse.message,
            timestamp: new Date()
        };
        const updatedHistory = [
            ...context.conversationHistory,
            userMsg,
            assistantMsg
        ];
        const trimmedHistory = updatedHistory.slice(-50);
        const updatedContext = {
            ...context,
            conversationHistory: trimmedHistory,
            currentIntent: aiResponse.intent,
            lastInteraction: new Date()
        };
        await memory.updateContext(updatedContext);
        return updatedContext;
    }
    async generateActions(response, context) {
        const actions = [];
        if (response.message) {
            actions.push({
                type: 'send_message',
                payload: {
                    message: response.message,
                    phoneNumber: context.phoneNumber
                },
                priority: 'high'
            });
        }
        if (response.shouldEscalate) {
            actions.push({
                type: 'escalate_to_human',
                payload: {
                    reason: response.intent?.type || 'unknown',
                    context: response.context
                },
                priority: 'high'
            });
        }
        actions.push({
            type: 'log_interaction',
            payload: {
                userId: context.userId,
                tenantId: context.tenantId,
                intent: response.intent?.type,
                confidence: response.confidence,
                message: response.message,
                timestamp: new Date()
            },
            priority: 'low'
        });
        return actions;
    }
    async healthCheck() {
        const details = {
            openai_configured: !!this.config.openaiApiKey,
            model: this.config.model,
            functions_enabled: this.config.enableFunctionCalling,
            multimodal_enabled: this.config.enableMultiModal
        };
        if (this.openai) {
            try {
                const response = await this.openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Test' }],
                    max_tokens: 5
                });
                details.openai_api_status = 'connected';
                details.openai_model_available = !!response.choices[0];
            }
            catch (error) {
                details.openai_api_status = 'error';
                details.openai_error = error instanceof Error ? error.message : 'Unknown error';
            }
        }
        else {
            details.openai_api_status = 'not_configured';
        }
        const status = details.openai_configured && details.openai_api_status === 'connected'
            ? 'healthy'
            : 'degraded';
        return { status, details };
    }
}
exports.AIService = AIService;
exports.default = AIService;
//# sourceMappingURL=ai-complex.service.js.map