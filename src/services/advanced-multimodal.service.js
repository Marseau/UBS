"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedMultiModalService = void 0;
const openai_1 = __importDefault(require("openai"));
const advanced_intent_recognition_service_1 = require("./advanced-intent-recognition.service");
class AdvancedMultiModalService {
    constructor() {
        this.openai = null;
        this.cache = new Map();
        this.cacheTTL = 300000;
        if (process.env.OPENAI_API_KEY) {
            this.openai = new openai_1.default({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
        this.intentService = new advanced_intent_recognition_service_1.AdvancedIntentRecognitionService();
        this.metrics = this.initializeMetrics();
    }
    async processContent(content) {
        const startTime = Date.now();
        try {
            const cacheKey = this.generateCacheKey(content);
            const cached = this.getCachedResult(cacheKey);
            if (cached) {
                return cached;
            }
            let analysis;
            switch (content.type) {
                case 'text':
                    analysis = await this.processText(content);
                    break;
                case 'audio':
                    analysis = await this.processAudio(content);
                    break;
                case 'image':
                    analysis = await this.processImage(content);
                    break;
                case 'video':
                    analysis = await this.processVideo(content);
                    break;
                case 'document':
                    analysis = await this.processDocument(content);
                    break;
                default:
                    throw new Error(`Unsupported content type: ${content.type}`);
            }
            analysis.processingTime = Date.now() - startTime;
            this.setCachedResult(cacheKey, analysis);
            this.updateMetrics(content.type, analysis.processingTime, true);
            return analysis;
        }
        catch (error) {
            this.updateMetrics(content.type, Date.now() - startTime, false);
            throw error;
        }
    }
    async processText(content) {
        const text = typeof content.content === 'string' ? content.content : content.content.toString('utf-8');
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.extractEntitiesFromText(text),
            this.analyzeTextForBusiness(text),
            this.analyzeTextEmotion(text)
        ]);
        return {
            contentId: content.id,
            contentType: 'text',
            primaryAnalysis: text,
            businessContext,
            emotionalAnalysis,
            entities,
            confidence: 0.95,
            processingTime: 0
        };
    }
    async processAudio(content, options) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const transcription = await this.transcribeAudio(buffer, content.mimeType, options);
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.extractEntitiesFromText(transcription),
            this.analyzeTextForBusiness(transcription),
            this.analyzeAudioEmotion(buffer, transcription, options)
        ]);
        return {
            contentId: content.id,
            contentType: 'audio',
            primaryAnalysis: transcription,
            transcription,
            businessContext,
            emotionalAnalysis,
            entities,
            confidence: 0.88,
            processingTime: 0
        };
    }
    async processImage(content, options) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const [visualDescription, ocrText, entities] = await Promise.all([
            this.analyzeImageVisually(buffer, content.mimeType, options),
            this.extractTextFromImage(buffer, content.mimeType, options),
            this.extractEntitiesFromImage(buffer, content.mimeType)
        ]);
        const combinedText = `${visualDescription}\n${ocrText}`.trim();
        const [businessContext, emotionalAnalysis] = await Promise.all([
            this.analyzeTextForBusiness(combinedText),
            this.analyzeImageEmotion(combinedText)
        ]);
        return {
            contentId: content.id,
            contentType: 'image',
            primaryAnalysis: visualDescription,
            ocrText,
            visualDescription,
            businessContext,
            emotionalAnalysis,
            entities,
            confidence: 0.82,
            processingTime: 0
        };
    }
    async processVideo(content, options) {
        const basicAnalysis = `Vídeo recebido (${content.mimeType}). Processamento completo de vídeo requer recursos adicionais.`;
        return {
            contentId: content.id,
            contentType: 'video',
            primaryAnalysis: basicAnalysis,
            businessContext: {
                relevantServices: [],
                suggestedActions: ['Revisar vídeo manualmente'],
                urgencyLevel: 'medium',
                requiresHumanReview: true,
                contextualInsights: ['Conteúdo em vídeo requer análise manual']
            },
            emotionalAnalysis: {
                tone: 'neutral',
                confidence: 0.5,
                emotionalKeywords: [],
                sentimentScore: 0
            },
            entities: [],
            confidence: 0.6,
            processingTime: 0
        };
    }
    async processDocument(content, options) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const extractedText = await this.extractTextFromDocument(buffer, content.mimeType, options);
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.extractEntitiesFromText(extractedText),
            this.analyzeDocumentForBusiness(extractedText, content.mimeType),
            this.analyzeTextEmotion(extractedText)
        ]);
        return {
            contentId: content.id,
            contentType: 'document',
            primaryAnalysis: extractedText,
            ocrText: extractedText,
            businessContext,
            emotionalAnalysis,
            entities,
            confidence: 0.90,
            processingTime: 0
        };
    }
    async enhanceIntentWithMultiModal(textIntent, multiModalContent, context) {
        const analyses = await Promise.all(multiModalContent.map(content => this.processContent(content)));
        const enhancedEntities = this.combineEntities([
            ...textIntent.entities,
            ...analyses.flatMap(a => a.entities)
        ]);
        const combinedBusinessContext = this.combineBusinessContext(analyses.map(a => a.businessContext).filter(Boolean));
        const requiresHumanReview = analyses.some(a => a.businessContext?.requiresHumanReview ||
            a.confidence < 0.7 ||
            a.warnings && a.warnings.length > 0);
        const multiModalConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
        const enhancedConfidence = (textIntent.confidence + multiModalConfidence) / 2;
        const recommendedAction = this.determineRecommendedAction(textIntent, combinedBusinessContext, enhancedEntities);
        return {
            originalIntent: textIntent,
            multiModalEnhancement: analyses[0] || {
                contentId: 'combined',
                contentType: 'text',
                primaryAnalysis: 'Multi-modal enhancement',
                entities: enhancedEntities,
                confidence: multiModalConfidence,
                processingTime: 0
            },
            enhancedEntities,
            confidence: enhancedConfidence,
            recommendedAction,
            requiresHumanReview
        };
    }
    async extractEntities(analysis) {
        return analysis.entities;
    }
    async analyzeBusinessContext(analysis, domain) {
        if (analysis.businessContext) {
            return analysis.businessContext;
        }
        return this.analyzeTextForBusiness(analysis.primaryAnalysis, domain);
    }
    async analyzeEmotion(content) {
        switch (content.type) {
            case 'text':
                return this.analyzeTextEmotion(content.content.toString());
            case 'audio':
                const transcription = await this.transcribeAudio(content.content instanceof Buffer ? content.content : Buffer.from(content.content), content.mimeType);
                return this.analyzeAudioEmotion(content.content instanceof Buffer ? content.content : Buffer.from(content.content), transcription);
            case 'image':
                const description = await this.analyzeImageVisually(content.content instanceof Buffer ? content.content : Buffer.from(content.content), content.mimeType);
                return this.analyzeImageEmotion(description);
            default:
                return {
                    tone: 'neutral',
                    confidence: 0.5,
                    emotionalKeywords: [],
                    sentimentScore: 0
                };
        }
    }
    async detectLanguage(text) {
        if (!this.openai) {
            return this.detectLanguageFallback(text);
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{
                        role: 'user',
                        content: `Detect the language of this text and respond with just the language code (e.g., 'pt', 'en', 'es'): "${text.substring(0, 200)}"`
                    }],
                max_tokens: 10,
                temperature: 0
            });
            return response.choices[0]?.message?.content?.trim().toLowerCase() || 'pt';
        }
        catch (error) {
            return this.detectLanguageFallback(text);
        }
    }
    async translateContent(text, targetLanguage) {
        if (!this.openai) {
            return `[Tradução para ${targetLanguage} não disponível: OpenAI não configurado] ${text}`;
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{
                        role: 'user',
                        content: `Translate the following text to ${targetLanguage}: "${text}"`
                    }],
                max_tokens: Math.min(1000, text.length * 2),
                temperature: 0.3
            });
            return response.choices[0]?.message?.content || text;
        }
        catch (error) {
            console.error('Translation error:', error);
            return text;
        }
    }
    getCapabilities() {
        return {
            supportedFormats: {
                audio: ['audio/wav', 'audio/mp3', 'audio/m4a', 'audio/ogg'],
                image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
                video: ['video/mp4', 'video/mov', 'video/avi'],
                document: ['application/pdf', 'text/plain', 'application/msword']
            },
            maxFileSize: {
                audio: 25 * 1024 * 1024,
                image: 20 * 1024 * 1024,
                video: 100 * 1024 * 1024,
                document: 50 * 1024 * 1024
            },
            features: {
                transcription: !!this.openai,
                translation: !!this.openai,
                ocr: !!this.openai,
                emotionDetection: true,
                objectDetection: !!this.openai,
                faceDetection: false
            }
        };
    }
    getMetrics() {
        return { ...this.metrics };
    }
    reset() {
        this.cache.clear();
        this.metrics = this.initializeMetrics();
    }
    async transcribeAudio(buffer, mimeType, options) {
        if (!this.openai) {
            return `[Áudio recebido - Transcrição não disponível: OpenAI não configurado]`;
        }
        try {
            const audioFile = new File([buffer], 'audio.wav', { type: mimeType });
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                language: 'pt',
                response_format: 'text',
                temperature: 0.0
            });
            return transcription || '[Não foi possível transcrever o áudio]';
        }
        catch (error) {
            console.error('Audio transcription error:', error);
            return `[Erro na transcrição do áudio: ${error}]`;
        }
    }
    async analyzeImageVisually(buffer, mimeType, options) {
        if (!this.openai) {
            return `[Imagem recebida - Análise visual não disponível: OpenAI não configurado]`;
        }
        try {
            const base64Image = buffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-vision-preview',
                messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analise esta imagem detalhadamente. Descreva o que você vê, incluindo objetos, pessoas, texto visível, e qualquer contexto relevante para atendimento ao cliente.'
                            },
                            {
                                type: 'image_url',
                                image_url: { url: dataUrl, detail: 'high' }
                            }
                        ]
                    }],
                max_tokens: 500,
                temperature: 0.3
            });
            return response.choices[0]?.message?.content || '[Não foi possível analisar a imagem]';
        }
        catch (error) {
            console.error('Image analysis error:', error);
            return `[Erro na análise da imagem: ${error}]`;
        }
    }
    async extractTextFromImage(buffer, mimeType, options) {
        if (!options?.performOCR || !this.openai) {
            return '';
        }
        try {
            const base64Image = buffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-vision-preview',
                messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extraia todo o texto visível nesta imagem. Retorne apenas o texto, preservando a formatação quando possível.'
                            },
                            {
                                type: 'image_url',
                                image_url: { url: dataUrl, detail: 'high' }
                            }
                        ]
                    }],
                max_tokens: 1000,
                temperature: 0
            });
            return response.choices[0]?.message?.content || '';
        }
        catch (error) {
            console.error('OCR error:', error);
            return '';
        }
    }
    async extractTextFromDocument(buffer, mimeType, options) {
        if (mimeType.includes('text/plain')) {
            return buffer.toString('utf-8');
        }
        else if (mimeType.includes('pdf')) {
            return '[Documento PDF recebido - Extração de texto requer processamento adicional]';
        }
        else {
            return '[Documento recebido - Tipo não suportado para extração automática]';
        }
    }
    async extractEntitiesFromText(text) {
        const context = this.createDummyContext();
        const intent = await this.intentService.recognizeIntent(text, context);
        return intent.entities.map(entity => ({
            ...entity,
            source: 'text'
        }));
    }
    async extractEntitiesFromImage(buffer, mimeType) {
        return [];
    }
    async analyzeTextForBusiness(text, domain) {
        const urgencyKeywords = ['urgente', 'emergência', 'rápido', 'socorro'];
        const serviceKeywords = ['agendar', 'marcar', 'consulta', 'appointment', 'booking'];
        const hasUrgency = urgencyKeywords.some(keyword => text.toLowerCase().includes(keyword));
        const hasServiceRequest = serviceKeywords.some(keyword => text.toLowerCase().includes(keyword));
        return {
            relevantServices: hasServiceRequest ? ['agendamento'] : [],
            suggestedActions: hasServiceRequest ? ['create_appointment'] : ['send_information'],
            businessDomain: domain,
            urgencyLevel: hasUrgency ? 'high' : 'medium',
            requiresHumanReview: hasUrgency,
            contextualInsights: [
                hasServiceRequest ? 'Cliente solicita agendamento' : 'Solicitação de informações',
                hasUrgency ? 'Situação urgente detectada' : 'Situação normal'
            ]
        };
    }
    async analyzeDocumentForBusiness(text, mimeType) {
        const documentTypes = {
            'application/pdf': 'PDF',
            'application/msword': 'Word',
            'text/plain': 'Texto'
        };
        return {
            relevantServices: ['document_review'],
            suggestedActions: ['review_document', 'extract_information'],
            urgencyLevel: 'medium',
            requiresHumanReview: true,
            contextualInsights: [
                `Documento ${documentTypes[mimeType] || 'desconhecido'} recebido`,
                'Requer análise manual detalhada'
            ]
        };
    }
    async analyzeTextEmotion(text) {
        const positiveWords = ['obrigado', 'ótimo', 'excelente', 'adorei', 'perfeito', 'satisfeito'];
        const negativeWords = ['ruim', 'péssimo', 'problema', 'reclamação', 'insatisfeito', 'frustrado'];
        const urgentWords = ['urgente', 'emergência', 'socorro', 'ajuda'];
        const positive = positiveWords.filter(word => text.toLowerCase().includes(word)).length;
        const negative = negativeWords.filter(word => text.toLowerCase().includes(word)).length;
        const urgent = urgentWords.filter(word => text.toLowerCase().includes(word)).length;
        let tone = 'neutral';
        let sentimentScore = 0;
        if (urgent > 0) {
            tone = 'concerned';
            sentimentScore = -0.3;
        }
        else if (negative > positive) {
            tone = 'negative';
            sentimentScore = -0.7;
        }
        else if (positive > negative) {
            tone = 'positive';
            sentimentScore = 0.7;
        }
        return {
            tone,
            confidence: Math.min(0.9, (positive + negative + urgent) * 0.2 + 0.5),
            emotionalKeywords: [...positiveWords, ...negativeWords, ...urgentWords].filter(word => text.toLowerCase().includes(word)),
            sentimentScore
        };
    }
    async analyzeAudioEmotion(buffer, transcription, options) {
        return this.analyzeTextEmotion(transcription);
    }
    async analyzeImageEmotion(description) {
        return this.analyzeTextEmotion(description);
    }
    combineEntities(entities) {
        const combined = new Map();
        entities.forEach(entity => {
            const key = `${entity.type}-${entity.value.toLowerCase()}`;
            const existing = combined.get(key);
            if (!existing || entity.confidence > existing.confidence) {
                combined.set(key, entity);
            }
        });
        return Array.from(combined.values());
    }
    combineBusinessContext(contexts) {
        if (contexts.length === 0) {
            return {
                relevantServices: [],
                suggestedActions: [],
                urgencyLevel: 'low',
                requiresHumanReview: false,
                contextualInsights: []
            };
        }
        const combined = {
            relevantServices: [...new Set(contexts.flatMap(c => c.relevantServices))],
            suggestedActions: [...new Set(contexts.flatMap(c => c.suggestedActions))],
            urgencyLevel: contexts.some(c => c.urgencyLevel === 'high') ? 'high' :
                contexts.some(c => c.urgencyLevel === 'medium') ? 'medium' : 'low',
            requiresHumanReview: contexts.some(c => c.requiresHumanReview),
            contextualInsights: [...new Set(contexts.flatMap(c => c.contextualInsights))]
        };
        if (contexts.length > 0 && contexts[0].businessDomain) {
            combined.businessDomain = contexts[0].businessDomain;
        }
        return combined;
    }
    determineRecommendedAction(intent, businessContext, entities) {
        if (businessContext.urgencyLevel === 'high') {
            return 'escalate_to_human';
        }
        if (intent.type === 'booking_request') {
            return 'create_appointment';
        }
        if (intent.type === 'emergency') {
            return 'emergency_response';
        }
        if (businessContext.requiresHumanReview) {
            return 'human_review';
        }
        return 'continue_conversation';
    }
    generateCacheKey(content) {
        const hash = this.simpleHash(content.content.toString().substring(0, 1000));
        return `${content.type}-${content.mimeType}-${hash}`;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    getCachedResult(key) {
        const entry = this.cache.get(key);
        if (entry) {
            if (Date.now() - entry.processingTime < this.cacheTTL) {
                return entry;
            }
            else {
                this.cache.delete(key);
            }
        }
        return null;
    }
    setCachedResult(key, analysis) {
        this.cache.set(key, analysis);
        if (this.cache.size > 100) {
            const entries = Array.from(this.cache.entries());
            entries.slice(0, 50).forEach(([key]) => this.cache.delete(key));
        }
    }
    detectLanguageFallback(text) {
        const portugueseWords = ['que', 'com', 'para', 'uma', 'você', 'não', 'por', 'mais', 'como'];
        const foundWords = portugueseWords.filter(word => text.toLowerCase().includes(word)).length;
        return foundWords > 2 ? 'pt' : 'en';
    }
    createDummyContext() {
        return {
            sessionId: 'multimodal-analysis',
            userId: 'system',
            tenantId: 'system',
            phoneNumber: '+0000000000',
            conversationHistory: [],
            lastInteraction: new Date()
        };
    }
    initializeMetrics() {
        return {
            totalProcessed: 0,
            processingTime: { avg: 0, min: 0, max: 0 },
            successRate: 1,
            byContentType: {},
            errors: []
        };
    }
    updateMetrics(contentType, processingTime, success) {
        this.metrics.totalProcessed++;
        if (this.metrics.totalProcessed === 1) {
            this.metrics.processingTime = { avg: processingTime, min: processingTime, max: processingTime };
        }
        else {
            this.metrics.processingTime.avg =
                (this.metrics.processingTime.avg * (this.metrics.totalProcessed - 1) + processingTime) / this.metrics.totalProcessed;
            this.metrics.processingTime.min = Math.min(this.metrics.processingTime.min, processingTime);
            this.metrics.processingTime.max = Math.max(this.metrics.processingTime.max, processingTime);
        }
        if (!this.metrics.byContentType[contentType]) {
            this.metrics.byContentType[contentType] = { count: 0, avgTime: 0, successRate: 1 };
        }
        const typeMetrics = this.metrics.byContentType[contentType];
        typeMetrics.count++;
        typeMetrics.avgTime = (typeMetrics.avgTime * (typeMetrics.count - 1) + processingTime) / typeMetrics.count;
        typeMetrics.successRate = success ?
            (typeMetrics.successRate * (typeMetrics.count - 1) + 1) / typeMetrics.count :
            (typeMetrics.successRate * (typeMetrics.count - 1)) / typeMetrics.count;
        const successCount = this.metrics.totalProcessed * this.metrics.successRate + (success ? 1 : 0) - 1;
        this.metrics.successRate = successCount / this.metrics.totalProcessed;
    }
}
exports.AdvancedMultiModalService = AdvancedMultiModalService;
exports.default = AdvancedMultiModalService;
//# sourceMappingURL=advanced-multimodal.service.js.map