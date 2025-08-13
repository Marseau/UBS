"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiModalCoreService = void 0;
const openai_1 = __importDefault(require("openai"));
const advanced_intent_recognition_service_1 = require("./advanced-intent-recognition.service");
const multimodal_helpers_service_1 = require("./multimodal-helpers.service");
class MultiModalCoreService {
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
        this.helpers = new multimodal_helpers_service_1.MultiModalHelpers();
        this.metrics = this.helpers.initializeMetrics();
    }
    async processContent(content) {
        const startTime = Date.now();
        try {
            const cacheKey = this.helpers.generateCacheKey(content);
            const cached = this.getCachedResult(cacheKey);
            if (cached) {
                console.log(`📋 Cache hit para conteúdo ${content.type}: ${content.id}`);
                return cached;
            }
            let analysis;
            console.log(`🔄 Processando conteúdo ${content.type}: ${content.id}`);
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
                    throw new Error(`Tipo de conteúdo não suportado: ${content.type}`);
            }
            analysis.processingTime = Date.now() - startTime;
            this.setCachedResult(cacheKey, analysis);
            this.helpers.updateMetrics(this.metrics, content.type, analysis.processingTime, true);
            console.log(`✅ Processamento concluído em ${analysis.processingTime}ms`);
            return analysis;
        }
        catch (error) {
            this.helpers.updateMetrics(this.metrics, content.type, Date.now() - startTime, false);
            console.error(`❌ Erro no processamento: ${error}`);
            throw error;
        }
    }
    async processText(content) {
        const text = typeof content.content === 'string' ? content.content : content.content.toString('utf-8');
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.helpers.extractEntitiesFromText(text),
            this.helpers.analyzeTextForBusiness(text),
            this.helpers.analyzeTextEmotion(text)
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
    async processAudio(content) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const transcription = await this.helpers.transcribeAudio(buffer, content.mimeType);
        if (!transcription || transcription.includes('[Áudio recebido')) {
            return {
                contentId: content.id,
                contentType: 'audio',
                primaryAnalysis: transcription || 'Áudio não pôde ser processado',
                transcription,
                businessContext: {
                    relevantServices: [],
                    suggestedActions: ['human_review'],
                    urgencyLevel: 'medium',
                    requiresHumanReview: true,
                    contextualInsights: ['Áudio requer análise manual']
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
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.helpers.extractEntitiesFromText(transcription),
            this.helpers.analyzeTextForBusiness(transcription),
            this.helpers.analyzeTextEmotion(transcription)
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
    async processImage(content) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const [visualDescription, ocrText] = await Promise.all([
            this.helpers.analyzeImageVisually(buffer, content.mimeType),
            this.helpers.extractTextFromImage(buffer, content.mimeType)
        ]);
        const combinedText = `${visualDescription}\n${ocrText}`.trim();
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.helpers.extractEntitiesFromText(combinedText),
            this.helpers.analyzeTextForBusiness(combinedText),
            this.helpers.analyzeTextEmotion(combinedText)
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
    async processVideo(content) {
        const basicAnalysis = `Vídeo recebido (${content.mimeType}). Processamento completo de vídeo requer recursos adicionais.`;
        return {
            contentId: content.id,
            contentType: 'video',
            primaryAnalysis: basicAnalysis,
            businessContext: {
                relevantServices: [],
                suggestedActions: ['human_review'],
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
    async processDocument(content) {
        const buffer = content.content instanceof Buffer ? content.content : Buffer.from(content.content);
        const extractedText = await this.helpers.extractTextFromDocument(buffer, content.mimeType);
        const [entities, businessContext, emotionalAnalysis] = await Promise.all([
            this.helpers.extractEntitiesFromText(extractedText),
            this.helpers.analyzeDocumentForBusiness(extractedText, content.mimeType),
            this.helpers.analyzeTextEmotion(extractedText)
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
        console.log(`🔄 Aprimorando intent com ${multiModalContent.length} conteúdos multi-modal`);
        const analyses = await Promise.all(multiModalContent.map(content => this.processContent(content)));
        const enhancedEntities = this.helpers.combineEntities([
            ...textIntent.entities,
            ...analyses.flatMap(a => a.entities)
        ]);
        const combinedBusinessContext = this.helpers.combineBusinessContext(analyses.map(a => a.businessContext).filter(Boolean));
        const requiresHumanReview = analyses.some(a => a.businessContext?.requiresHumanReview ||
            a.confidence < 0.7 ||
            a.warnings && a.warnings.length > 0);
        const multiModalConfidence = analyses.length > 0 ?
            analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length : 0;
        const enhancedConfidence = multiModalConfidence > 0 ?
            (textIntent.confidence + multiModalConfidence) / 2 : textIntent.confidence;
        const recommendedAction = this.helpers.determineRecommendedAction(textIntent, combinedBusinessContext, enhancedEntities);
        console.log(`✅ Intent aprimorado: confiança ${enhancedConfidence.toFixed(2)}, ação: ${recommendedAction}`);
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
        return this.helpers.analyzeTextForBusiness(analysis.primaryAnalysis, domain);
    }
    async analyzeEmotion(content) {
        const analysis = await this.processContent(content);
        return analysis.emotionalAnalysis || {
            tone: 'neutral',
            confidence: 0.5,
            emotionalKeywords: [],
            sentimentScore: 0
        };
    }
    async detectLanguage(text) {
        return this.helpers.detectLanguageFallback(text);
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
        this.metrics = this.helpers.initializeMetrics();
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
}
exports.MultiModalCoreService = MultiModalCoreService;
//# sourceMappingURL=multimodal-core.service.js.map