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

// ==== INTENTS ALLOWLIST (sem outcomes) ====
const ALLOWED_INTENTS = new Set([
  'greeting','services','pricing','availability','my_appointments','address','payments',
  'business_hours','cancel','reschedule','confirm','modify_appointment','policies',
  'wrong_number','test_message','booking_abandoned','noshow_followup'
]);

function clamp(num, min, max) { return Math.max(min, Math.min(max, num)); }

// Normalização conservadora para LLM
function normalizeLLMConfidence(raw) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0.6;
  // corta topos: nunca 1.0; nunca <0.3
  return clamp(raw, 0.3, 0.85);
}

exports.classifyIntentWithLLM = async function classifyIntentWithLLM(openai, model, text) {
  const system = [
    'Você é um CLASSIFICADOR DE INTENÇÃO em um SaaS de agendamento.',
    'Responda com APENAS UMA chave EXATA dentre as opções válidas.',
    'Se não tiver certeza, retorne exatamente: "unknown".',
    '',
    'PADRÕES ESPECIAIS:',
    '- Adiamento/postpone → "booking_abandoned"',
    '- Agradecimentos/elogios → "greeting"',
    '- Requisitos/procedimentos (docs, tempo) → "services"',
    '- Contexto empresarial genérico → "services"',
    '',
    'EXEMPLOS:',
    '- "Entendi, vou verificar e retorno" → booking_abandoned',
    '- "Obrigada pela flexibilidade!" → greeting',
    '- "É necessário experiência prévia?" → services',
    '- "Que documentos preciso levar?" → services',
    '- "Vou enviar o contrato por email" → services',
    '',
    'Opções válidas:',
    Array.from(ALLOWED_INTENTS).join(', ')
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 8,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ]
  });

  const raw = (completion.choices?.[0]?.message?.content || '').trim().toLowerCase();
  const intent = raw.replace(/[^a-z_]/g, ''); // sanitiza
  
  if (intent === 'unknown') return { intent: null, confidence: 0.0, decision_method: 'llm' };
  if (!ALLOWED_INTENTS.has(intent)) return { intent: null, confidence: 0.0, decision_method: 'llm' };

  return { intent, confidence: normalizeLLMConfidence(completion?.usage?.prompt_tokens ? 0.7 : 0.6), decision_method: 'llm' };
};
class AIService {
    constructor() {
        this.config = {
            openaiApiKey: process.env.OPENAI_API_KEY || '',
            model: process.env.OPENAI_MODEL || 'gpt-4',
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
                messages: [
                  { role: 'system', content: 'Você é um classificador de intenção estrito. Responda apenas em JSON válido e use somente intents permitidas.' },
                  { role: 'user', content: intentPrompt }
                ],
                temperature: 0,
                top_p: 0,
                max_tokens: 100
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
        return `Você é um CLASSIFICADOR DE INTENÇÃO em um sistema de agendamento de serviços (SaaS).
Analise a mensagem do usuário no CONTEXTO DA CONVERSA e escolha EXATAMENTE UMA das intenções abaixo.

INTENTS PERMITIDAS:
- ${ALLOWED_INTENTS.join('\n- ')}

Regras obrigatórias:
1) Responda APENAS em JSON válido, sem texto extra.
2) Formato exato: {"intent": "<uma-das-chaves-ou-null>", "confidence": 0.0}
3) Se não tiver certeza, use {"intent": null, "confidence": 0.0}.
4) Nunca invente intenções fora da lista.
5) Nunca retorne múltiplas intenções.

Mensagem do usuário (pt-BR):
"${message}"

Domínio do negócio: ${context.tenantConfig?.domain || 'geral'}

Exemplos:
Usuário: "Tenho disponibilidade na próxima semana"
→ {"intent":"availability","confidence":0.9}

Usuário: "Não compareci ontem, quero remarcar"
→ {"intent":"noshow_followup","confidence":0.95}

Usuário: "Quais serviços vocês oferecem?"
→ {"intent":"services","confidence":0.95}`;
    }
    parseIntentResult(result) {
        try {
            const parsed = JSON.parse(result);
            const intent = (parsed && typeof parsed.intent !== 'undefined') ? parsed.intent : null;
            const inAllowlist = intent && ALLOWED_INTENTS.includes(intent);
            return {
                type: inAllowlist ? intent : 'other',
                confidence: (inAllowlist ? (parsed.confidence || 0.7) : 0.3),
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