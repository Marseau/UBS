"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserIdentificationService = void 0;

const database_1 = require("../config/database");

/**
 * User Identification Service
 * 
 * Handles intelligent user identification for WhatsApp messages when tenant is found
 * but user relationship doesn't exist. Covers multiple scenarios:
 * 
 * 1. Existing user with new phone number
 * 2. New prospect/lead
 * 3. First-time legitimate user
 * 4. Spam/bot detection
 */
class UserIdentificationService {
    constructor() {
        this.spamPatterns = [
            /\b(bitcoin|crypto|investment|loan|money)\b/i,
            /\b(click here|link|www\.|http)/i,
            /\b(winner|congratulations|prize|free money)\b/i,
            /\b(urgent|limited time|act now)\b/i
        ];
        
        this.businessKeywords = new Map([
            ['beauty', ['cabelo', 'unha', 'manicure', 'corte', 'coloração', 'salão', 'beleza', 'agendamento', 'horário']],
            ['healthcare', ['consulta', 'médico', 'terapia', 'psicólogo', 'saúde', 'sessão', 'tratamento']],
            ['legal', ['advogado', 'jurídico', 'processo', 'consulta legal', 'direito', 'contrato']],
            ['education', ['aula', 'professor', 'ensino', 'reforço', 'tutoring', 'estudo', 'matéria']],
            ['sports', ['treino', 'academia', 'personal', 'exercício', 'fitness', 'musculação']],
            ['consulting', ['consultoria', 'negócio', 'empresa', 'estratégia', 'gestão']]
        ]);
    }

    /**
     * Main identification method
     * Returns user type and recommended action
     */
    async identifyUser(phoneNumber, message, tenantConfig, contacts) {
        try {
            console.log(`🔍 Identifying user: ${phoneNumber} for tenant: ${tenantConfig.businessName}`);
            
            // 1. Check if user exists with different phone
            const existingUser = await this.findExistingUser(phoneNumber, message, tenantConfig, contacts);
            if (existingUser) {
                return {
                    type: 'existing_user_new_phone',
                    userId: existingUser.id,
                    userData: existingUser,
                    action: 'link_new_phone',
                    confidence: existingUser.confidence,
                    message: `Olá ${existingUser.name}! Notei que você está usando um novo número. Vou atualizar seu cadastro.`
                };
            }

            // 2. Spam detection
            const spamCheck = await this.detectSpam(phoneNumber, message, tenantConfig);
            if (spamCheck.isSpam) {
                return {
                    type: 'spam',
                    action: 'polite_disconnect',
                    confidence: spamCheck.confidence,
                    reason: spamCheck.reason,
                    message: 'Olá! Obrigado por entrar em contato. Parece que você pode ter se conectado ao número errado. Pedimos desculpas por qualquer inconveniente. Tenha um bom dia! 😊'
                };
            }

            // 3. Business intent analysis
            const intentAnalysis = await this.analyzeBusinessIntent(message, tenantConfig);
            
            if (intentAnalysis.hasBusinessIntent) {
                return {
                    type: 'legitimate_prospect',
                    action: 'start_engagement',
                    confidence: intentAnalysis.confidence,
                    intent: intentAnalysis.intent,
                    message: this.generateWelcomeMessage(tenantConfig, intentAnalysis.intent)
                };
            }

            // 4. Generic new user (low business intent)
            return {
                type: 'new_user_unknown_intent',
                action: 'gentle_qualification',
                confidence: 0.5,
                message: this.generateQualificationMessage(tenantConfig)
            };

        } catch (error) {
            console.error('Error in user identification:', error);
            return {
                type: 'identification_error',
                action: 'default_response',
                confidence: 0.1,
                message: `Olá! Bem-vindo ao ${tenantConfig.businessName}. Como posso ajudá-lo hoje?`
            };
        }
    }

    /**
     * Try to find existing user by name, email or previous interactions
     */
    async findExistingUser(phoneNumber, message, tenantConfig, contacts) {
        try {
            const contact = contacts?.find(c => c.wa_id === phoneNumber);
            const whatsappName = contact?.profile?.name;
            
            if (!whatsappName || whatsappName.length < 2) {
                return null;
            }

            // Search for users with similar names in this tenant
            const { data: potentialUsers, error } = await database_1.supabase
                .from('users')
                .select(`
                    id, name, email, phone, created_at,
                    user_tenants!inner(tenant_id, is_onboarded)
                `)
                .eq('user_tenants.tenant_id', tenantConfig.id)
                .ilike('name', `%${whatsappName}%`);

            if (error || !potentialUsers?.length) {
                return null;
            }

            // Calculate similarity scores
            for (const user of potentialUsers) {
                const nameSimilarity = this.calculateNameSimilarity(whatsappName, user.name);
                
                if (nameSimilarity > 0.7) {
                    console.log(`✅ Found potential existing user: ${user.name} (${nameSimilarity} similarity)`);
                    return {
                        ...user,
                        confidence: nameSimilarity,
                        oldPhone: user.phone
                    };
                }
            }

            return null;
            
        } catch (error) {
            console.error('Error finding existing user:', error);
            return null;
        }
    }

    /**
     * Detect spam messages
     */
    async detectSpam(phoneNumber, message, tenantConfig) {
        try {
            const messageText = message.text?.body?.toLowerCase() || '';
            
            // 1. Pattern-based spam detection
            for (const pattern of this.spamPatterns) {
                if (pattern.test(messageText)) {
                    console.warn(`🚫 Spam detected by pattern: ${pattern} for phone: ${phoneNumber}`);
                    return {
                        isSpam: true,
                        confidence: 0.9,
                        reason: 'suspicious_pattern'
                    };
                }
            }

            // 2. Check message frequency (rate limiting)
            const recentMessages = await this.getRecentMessageCount(phoneNumber, tenantConfig.id);
            if (recentMessages > 5) {
                console.warn(`🚫 Spam detected by rate limiting: ${recentMessages} messages for phone: ${phoneNumber}`);
                return {
                    isSpam: true,
                    confidence: 0.8,
                    reason: 'rate_limit_exceeded'
                };
            }

            // 3. Message length analysis
            if (messageText.length > 500) {
                return {
                    isSpam: true,
                    confidence: 0.7,
                    reason: 'message_too_long'
                };
            }

            // 4. Suspicious characters
            const suspiciousChars = (messageText.match(/[^\w\s\u00C0-\u017F.,!?]/g) || []).length;
            if (suspiciousChars > 10) {
                return {
                    isSpam: true,
                    confidence: 0.6,
                    reason: 'suspicious_characters'
                };
            }

            return {
                isSpam: false,
                confidence: 0.9,
                reason: 'clean_message'
            };
            
        } catch (error) {
            console.error('Error in spam detection:', error);
            return {
                isSpam: false,
                confidence: 0.5,
                reason: 'detection_error'
            };
        }
    }

    /**
     * Analyze if message has business intent
     */
    async analyzeBusinessIntent(message, tenantConfig) {
        try {
            const messageText = message.text?.body?.toLowerCase() || '';
            const domain = tenantConfig.domain;
            
            // Get keywords for this business domain
            const domainKeywords = this.businessKeywords.get(domain) || [];
            
            let matchCount = 0;
            let matchedKeywords = [];
            
            // Check for domain-specific keywords
            for (const keyword of domainKeywords) {
                if (messageText.includes(keyword.toLowerCase())) {
                    matchCount++;
                    matchedKeywords.push(keyword);
                }
            }

            // Check for general business intents
            const generalBusinessWords = [
                'agendar', 'marcar', 'horário', 'disponível', 'preço', 'valor', 
                'quanto custa', 'serviço', 'atendimento', 'informação'
            ];

            for (const word of generalBusinessWords) {
                if (messageText.includes(word)) {
                    matchCount++;
                    matchedKeywords.push(word);
                }
            }

            const hasBusinessIntent = matchCount > 0;
            const confidence = Math.min(matchCount * 0.3, 1.0);

            let intent = 'general_inquiry';
            if (matchedKeywords.some(k => ['agendar', 'marcar', 'horário'].includes(k))) {
                intent = 'booking_request';
            } else if (matchedKeywords.some(k => ['preço', 'valor', 'quanto'].includes(k))) {
                intent = 'price_inquiry';
            } else if (matchedKeywords.some(k => ['informação', 'serviço'].includes(k))) {
                intent = 'service_inquiry';
            }

            return {
                hasBusinessIntent,
                confidence,
                intent,
                matchedKeywords
            };
            
        } catch (error) {
            console.error('Error analyzing business intent:', error);
            return {
                hasBusinessIntent: false,
                confidence: 0.1,
                intent: 'unknown'
            };
        }
    }

    /**
     * Generate appropriate welcome message based on intent
     */
    generateWelcomeMessage(tenantConfig, intent) {
        const businessName = tenantConfig.businessName;
        const domain = tenantConfig.domain;
        
        const domainEmojis = {
            'beauty': '💄',
            'healthcare': '🏥',
            'legal': '⚖️',
            'education': '📚',
            'sports': '💪',
            'consulting': '💼'
        };
        
        const emoji = domainEmojis[domain] || '✨';
        
        switch (intent) {
            case 'booking_request':
                return `${emoji} Olá! Bem-vindo ao ${businessName}! Vou verificar nossa disponibilidade para você. Que tipo de serviço gostaria de agendar?`;
            
            case 'price_inquiry':
                return `${emoji} Olá! Bem-vindo ao ${businessName}! Ficarei feliz em informar nossos preços. Sobre qual serviço gostaria de saber?`;
            
            case 'service_inquiry':
                return `${emoji} Olá! Bem-vindo ao ${businessName}! Vou te contar sobre nossos serviços. O que especificamente gostaria de saber?`;
            
            default:
                return `${emoji} Olá! Bem-vindo ao ${businessName}! Como posso ajudá-lo hoje?`;
        }
    }

    /**
     * Generate gentle qualification message for unknown intent
     */
    generateQualificationMessage(tenantConfig) {
        const businessName = tenantConfig.businessName;
        return `Olá! Obrigado por entrar em contato com ${businessName}. ` +
               `Para que eu possa ajudá-lo da melhor forma, poderia me dizer como chegou até nós e no que posso ajudá-lo?`;
    }

    /**
     * Calculate name similarity between two strings
     */
    calculateNameSimilarity(name1, name2) {
        if (!name1 || !name2) return 0;
        
        const n1 = name1.toLowerCase().trim();
        const n2 = name2.toLowerCase().trim();
        
        if (n1 === n2) return 1.0;
        
        // Simple substring matching
        if (n1.includes(n2) || n2.includes(n1)) {
            return 0.8;
        }
        
        // Check for partial word matches
        const words1 = n1.split(' ');
        const words2 = n2.split(' ');
        
        let matches = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1.length > 2 && word2.length > 2 && 
                    (word1.includes(word2) || word2.includes(word1))) {
                    matches++;
                }
            }
        }
        
        return matches > 0 ? Math.min(matches * 0.4, 0.7) : 0;
    }

    /**
     * Get recent message count for rate limiting
     */
    async getRecentMessageCount(phoneNumber, tenantId) {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const { data, error } = await database_1.supabase
                .from('conversation_history')
                .select('id')
                .eq('phone_number', phoneNumber)
                .eq('tenant_id', tenantId)
                .gte('created_at', oneHourAgo.toISOString());
            
            return data?.length || 0;
            
        } catch (error) {
            console.error('Error getting recent message count:', error);
            return 0;
        }
    }

    /**
     * Link new phone number to existing user
     */
    async linkNewPhoneToUser(userId, newPhoneNumber, tenantId) {
        try {
            // Update user's primary phone number
            const { error: updateError } = await database_1.supabase
                .from('users')
                .update({ 
                    phone: newPhoneNumber,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (updateError) {
                console.error('Error updating user phone:', updateError);
                return false;
            }

            // Log the phone number change
            await database_1.supabase
                .from('user_phone_history')
                .insert({
                    user_id: userId,
                    old_phone: null, // We don't store the old one for privacy
                    new_phone: newPhoneNumber,
                    tenant_id: tenantId,
                    change_reason: 'whatsapp_identification',
                    created_at: new Date().toISOString()
                });

            console.log(`✅ Successfully linked new phone ${newPhoneNumber} to user ${userId}`);
            return true;
            
        } catch (error) {
            console.error('Error linking new phone to user:', error);
            return false;
        }
    }

    /**
     * Log spam attempt for analysis
     */
    async logSpamAttempt(phoneNumber, message, tenantId, reason) {
        try {
            await database_1.supabase
                .from('whatsapp_spam_attempts')
                .insert({
                    phone_number: phoneNumber,
                    tenant_id: tenantId,
                    message_content: message.text?.body || 'non-text message',
                    spam_reason: reason,
                    message_type: message.type || 'unknown',
                    detected_at: new Date().toISOString()
                });
            
            console.log(`🚫 Spam attempt logged: ${phoneNumber} - ${reason}`);
            
        } catch (error) {
            console.error('Error logging spam attempt:', error);
        }
    }

    /**
     * Health check for the identification service
     */
    async healthCheck() {
        try {
            return {
                status: 'healthy',
                details: {
                    spam_patterns: this.spamPatterns.length,
                    business_domains: this.businessKeywords.size,
                    database_connection: 'ok'
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

exports.UserIdentificationService = UserIdentificationService;
exports.default = UserIdentificationService;
//# sourceMappingURL=user-identification.service.js.map