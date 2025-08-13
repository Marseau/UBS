"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentRouterService = void 0;
class IntentRouterService {
    constructor() {
        this.intentPatterns = new Map();
        this.entityExtractors = new Map();
        this.domainKeywords = new Map();
        this.initializeIntentPatterns();
        this.initializeEntityExtractors();
        this.initializeDomainKeywords();
    }
    async analyzeIntent(message, context, conversationHistory = []) {
        const normalizedMessage = this.normalizeMessage(message);
        const entities = await this.extractEntities(normalizedMessage);
        const intentResults = await this.matchIntentPatterns(normalizedMessage, entities, context);
        const contextBoostedResults = this.applyContextualBoosting(intentResults, context, conversationHistory);
        const bestIntent = this.selectBestIntent(contextBoostedResults);
        return {
            type: bestIntent.type,
            confidence: bestIntent.confidence,
            entities,
            context: {
                businessDomain: context.tenantConfig?.domain,
                conversationTurn: conversationHistory.length,
                previousIntent: context.currentIntent?.type,
                urgencyLevel: this.determineUrgency(normalizedMessage, entities),
                sentiment: this.analyzeSentiment(normalizedMessage)
            }
        };
    }
    routeToDomain(intent, context) {
        if (context.tenantConfig?.domain) {
            return context.tenantConfig.domain;
        }
        return this.inferDomainFromIntent(intent);
    }
    initializeIntentPatterns() {
        const patterns = {
            'booking_request': [
                {
                    keywords: ['agendar', 'marcar', 'reservar', 'consulta', 'horário', 'vaga'],
                    phrases: ['gostaria de agendar', 'quero marcar', 'preciso de um horário'],
                    weight: 1.0
                },
                {
                    keywords: ['quando', 'disponível', 'livre', 'posso'],
                    phrases: ['quando posso', 'tem vaga', 'está disponível'],
                    weight: 0.8
                }
            ],
            'booking_cancel': [
                {
                    keywords: ['cancelar', 'desmarcar', 'não posso', 'impedir'],
                    phrases: ['quero cancelar', 'preciso cancelar', 'não vou poder'],
                    weight: 1.0
                }
            ],
            'booking_reschedule': [
                {
                    keywords: ['remarcar', 'mudar', 'trocar', 'alterar', 'reagendar'],
                    phrases: ['quero remarcar', 'posso mudar', 'trocar horário'],
                    weight: 1.0
                }
            ],
            'booking_inquiry': [
                {
                    keywords: ['agendamento', 'marcado', 'reservado', 'confirmado'],
                    phrases: ['meu agendamento', 'está marcado', 'foi confirmado'],
                    weight: 1.0
                }
            ],
            'service_inquiry': [
                {
                    keywords: ['serviço', 'oferecer', 'fazer', 'tipos', 'trabalho'],
                    phrases: ['que serviços', 'fazem o que', 'tipos de'],
                    weight: 1.0
                }
            ],
            'availability_check': [
                {
                    keywords: ['disponível', 'livre', 'vago', 'horário', 'quando'],
                    phrases: ['tem horário', 'está livre', 'quando disponível'],
                    weight: 1.0
                }
            ],
            'price_inquiry': [
                {
                    keywords: ['preço', 'valor', 'custo', 'quanto', 'custa', 'orçamento'],
                    phrases: ['quanto custa', 'qual o preço', 'valor do'],
                    weight: 1.0
                }
            ],
            'business_hours': [
                {
                    keywords: ['horário', 'funcionamento', 'aberto', 'fechado', 'quando'],
                    phrases: ['horário de funcionamento', 'que horas', 'está aberto'],
                    weight: 1.0
                }
            ],
            'location_inquiry': [
                {
                    keywords: ['onde', 'endereço', 'localização', 'fica', 'local'],
                    phrases: ['onde fica', 'qual endereço', 'como chegar'],
                    weight: 1.0
                }
            ],
            'general_greeting': [
                {
                    keywords: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'hey'],
                    phrases: ['oi tudo bem', 'olá como vai', 'bom dia'],
                    weight: 1.0
                }
            ],
            'complaint': [
                {
                    keywords: ['reclamação', 'problema', 'ruim', 'péssimo', 'insatisfeito', 'reclamar'],
                    phrases: ['estou insatisfeito', 'foi péssimo', 'quero reclamar'],
                    weight: 1.0
                }
            ],
            'compliment': [
                {
                    keywords: ['ótimo', 'excelente', 'parabéns', 'obrigado', 'adorei', 'perfeito'],
                    phrases: ['foi ótimo', 'adorei o serviço', 'muito obrigado'],
                    weight: 1.0
                }
            ],
            'escalation_request': [
                {
                    keywords: ['gerente', 'responsável', 'supervisor', 'falar com', 'atendente'],
                    phrases: ['quero falar com', 'cadê o gerente', 'preciso de ajuda'],
                    weight: 1.0
                }
            ],
            'emergency': [
                {
                    keywords: ['urgente', 'emergência', 'socorro', 'ajuda', 'grave', 'crítico'],
                    phrases: ['é urgente', 'preciso de ajuda', 'emergência'],
                    weight: 1.0
                }
            ],
            'other': [
                {
                    keywords: [],
                    phrases: [],
                    weight: 0.1
                }
            ]
        };
        Object.entries(patterns).forEach(([intent, patternList]) => {
            this.intentPatterns.set(intent, patternList);
        });
    }
    initializeEntityExtractors() {
        this.entityExtractors.set('service_name', {
            patterns: [
                /(?:serviço|tratamento|consulta|aula|treino|sessão)\s+de\s+(\w+)/gi,
                /(?:fazer|quero|preciso)\s+(?:um|uma)?\s*(\w+)/gi
            ],
            processor: (matches) => matches.filter(m => m.length > 2)
        });
        this.entityExtractors.set('date', {
            patterns: [
                /(\d{1,2}\/\d{1,2}\/\d{4})/g,
                /(\d{1,2}\/\d{1,2})/g,
                /(hoje|amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo)/gi,
                /(próxima?\s+(?:segunda|terça|quarta|quinta|sexta|sábado|domingo))/gi
            ],
            processor: (matches) => matches.map(m => this.normalizeDate(m))
        });
        this.entityExtractors.set('time', {
            patterns: [
                /(\d{1,2}:\d{2})/g,
                /(\d{1,2}h\d{2})/g,
                /(\d{1,2}h)/g,
                /(manhã|tarde|noite|madrugada)/gi
            ],
            processor: (matches) => matches.map(m => this.normalizeTime(m))
        });
        this.entityExtractors.set('person_name', {
            patterns: [
                /(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÁÊÇÕ][a-záêçõ]+(?:\s+[A-ZÁÊÇÕ][a-záêçõ]+)*)/gi
            ],
            processor: (matches) => matches.filter(m => m.length > 1)
        });
        this.entityExtractors.set('phone_number', {
            patterns: [
                /(\(\d{2}\)\s?\d{4,5}-?\d{4})/g,
                /(\d{2}\s?\d{4,5}-?\d{4})/g,
                /(\d{10,11})/g
            ],
            processor: (matches) => matches.map(m => this.normalizePhone(m))
        });
        this.entityExtractors.set('urgency_level', {
            patterns: [
                /(urgente|emergência|prioridade|rápido|logo)/gi
            ],
            processor: (matches) => matches.map(m => this.mapUrgencyLevel(m))
        });
    }
    initializeDomainKeywords() {
        this.domainKeywords.set('healthcare', [
            'psicólogo', 'terapia', 'consulta', 'sessão', 'depressão', 'ansiedade',
            'psiquiatra', 'medicamento', 'tratamento', 'saúde mental'
        ]);
        this.domainKeywords.set('beauty', [
            'cabelo', 'corte', 'coloração', 'manicure', 'pedicure', 'unha',
            'maquiagem', 'sobrancelha', 'salão', 'beleza', 'estética'
        ]);
        this.domainKeywords.set('legal', [
            'advogado', 'processo', 'jurídico', 'contrato', 'consulta legal',
            'direito', 'lei', 'tribunal', 'ação', 'defesa'
        ]);
        this.domainKeywords.set('education', [
            'aula', 'professor', 'ensino', 'aprender', 'estudar', 'reforço',
            'tutoring', 'matéria', 'disciplina', 'curso', 'educação'
        ]);
        this.domainKeywords.set('sports', [
            'treino', 'academia', 'exercício', 'personal', 'fitness', 'musculação',
            'cardio', 'pilates', 'yoga', 'esporte', 'condicionamento'
        ]);
        this.domainKeywords.set('consulting', [
            'consultoria', 'negócio', 'empresa', 'estratégia', 'planejamento',
            'gestão', 'financeiro', 'marketing', 'vendas', 'operações'
        ]);
    }
    normalizeMessage(message) {
        return message
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    async extractEntities(message) {
        const entities = [];
        for (const [entityType, extractor] of this.entityExtractors.entries()) {
            const matches = [];
            for (const pattern of extractor.patterns) {
                const patternMatches = message.match(pattern);
                if (patternMatches) {
                    matches.push(...patternMatches);
                }
            }
            if (matches.length > 0) {
                const processedMatches = extractor.processor(matches);
                processedMatches.forEach((value, index) => {
                    const match = matches[index];
                    if (match) {
                        entities.push({
                            type: entityType,
                            value,
                            confidence: 0.8 - (index * 0.1),
                            start: message.indexOf(match),
                            end: message.indexOf(match) + match.length
                        });
                    }
                });
            }
        }
        return entities;
    }
    async matchIntentPatterns(message, entities, context) {
        const matches = [];
        for (const [intentType, patterns] of this.intentPatterns.entries()) {
            let maxScore = 0;
            for (const pattern of patterns) {
                let score = 0;
                const keywordMatches = pattern.keywords.filter(keyword => message.includes(keyword)).length;
                score += (keywordMatches / pattern.keywords.length) * 0.6;
                const phraseMatches = pattern.phrases.filter(phrase => message.includes(phrase)).length;
                score += (phraseMatches / Math.max(pattern.phrases.length, 1)) * 0.4;
                score *= pattern.weight;
                maxScore = Math.max(maxScore, score);
            }
            if (maxScore > 0.1) {
                matches.push({
                    type: intentType,
                    confidence: maxScore,
                    score: maxScore
                });
            }
        }
        return matches;
    }
    applyContextualBoosting(matches, context, conversationHistory) {
        return matches.map(match => {
            let boost = 0;
            if (context.currentIntent) {
                const intentFlow = this.getIntentFlow(context.currentIntent.type, match.type);
                boost += intentFlow;
            }
            if (conversationHistory.length === 0 && match.type === 'general_greeting') {
                boost += 0.3;
            }
            if (context.tenantConfig?.domain) {
                const domainBoost = this.getDomainBoost(match.type, context.tenantConfig.domain);
                boost += domainBoost;
            }
            return {
                ...match,
                confidence: Math.min(1.0, match.confidence + boost)
            };
        });
    }
    selectBestIntent(matches) {
        if (matches.length === 0) {
            return { type: 'other', confidence: 0.5, score: 0.5 };
        }
        matches.sort((a, b) => b.confidence - a.confidence);
        return matches[0];
    }
    inferDomainFromIntent(intent) {
        for (const [domain, keywords] of this.domainKeywords.entries()) {
            const hasKeyword = intent.entities.some(entity => keywords.some(keyword => entity.value.toLowerCase().includes(keyword.toLowerCase())));
            if (hasKeyword) {
                return domain;
            }
        }
        return 'other';
    }
    determineUrgency(message, entities) {
        const urgencyEntity = entities.find(e => e.type === 'urgency_level');
        if (urgencyEntity) {
            return urgencyEntity.value;
        }
        if (message.includes('urgente') || message.includes('emergência')) {
            return 'alta';
        }
        if (message.includes('rápido') || message.includes('logo')) {
            return 'media';
        }
        return 'baixa';
    }
    analyzeSentiment(message) {
        const positiveWords = ['bom', 'ótimo', 'excelente', 'obrigado', 'adorei', 'perfeito'];
        const negativeWords = ['ruim', 'péssimo', 'problema', 'reclamação', 'insatisfeito'];
        const positiveCount = positiveWords.filter(word => message.includes(word)).length;
        const negativeCount = negativeWords.filter(word => message.includes(word)).length;
        if (positiveCount > negativeCount)
            return 'positive';
        if (negativeCount > positiveCount)
            return 'negative';
        return 'neutral';
    }
    getIntentFlow(previousIntent, currentIntent) {
        const flows = {
            'general_greeting->service_inquiry': 0.2,
            'service_inquiry->price_inquiry': 0.3,
            'price_inquiry->booking_request': 0.4,
            'availability_check->booking_request': 0.5,
            'booking_request->booking_inquiry': 0.3
        };
        const flowKey = `${previousIntent}->${currentIntent}`;
        return flows[flowKey] || 0;
    }
    getDomainBoost(intentType, domain) {
        const domainBoosts = {
            'healthcare': {
                'booking_request': 0.2,
                'emergency': 0.3,
                'escalation_request': 0.1
            },
            'beauty': {
                'booking_request': 0.2,
                'service_inquiry': 0.1,
                'price_inquiry': 0.1
            },
            'legal': {
                'booking_request': 0.1,
                'emergency': 0.2,
                'escalation_request': 0.2
            },
            'education': {
                'booking_request': 0.2,
                'service_inquiry': 0.1
            },
            'sports': {
                'booking_request': 0.2,
                'service_inquiry': 0.1
            },
            'consulting': {
                'booking_request': 0.1,
                'service_inquiry': 0.2,
                'price_inquiry': 0.2
            },
            'other': {}
        };
        return domainBoosts[domain]?.[intentType] || 0;
    }
    normalizeDate(dateStr) {
        return dateStr.toLowerCase();
    }
    normalizeTime(timeStr) {
        return timeStr.replace('h', ':').padEnd(5, '0');
    }
    normalizePhone(phoneStr) {
        return phoneStr.replace(/\D/g, '');
    }
    mapUrgencyLevel(urgencyStr) {
        const mapping = {
            'urgente': 'alta',
            'emergência': 'alta',
            'prioridade': 'media',
            'rápido': 'media',
            'logo': 'media'
        };
        return mapping[urgencyStr.toLowerCase()] || 'baixa';
    }
}
exports.IntentRouterService = IntentRouterService;
exports.default = IntentRouterService;
//# sourceMappingURL=intent-router.service.js.map