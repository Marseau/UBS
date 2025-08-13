const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');

/**
 * WhatsApp Spam Prevention Service
 * Implements comprehensive spam prevention and message frequency controls
 * Ensures compliance with Meta's anti-spam policies
 */
class WhatsAppSpamPreventionService {
    constructor() {
        // Spam detection thresholds
        this.spamThresholds = {
            // Message frequency limits per recipient
            maxMessagesPerHour: 10,
            maxMessagesPerDay: 50,
            maxMessagesPerWeek: 200,
            
            // Content-based detection
            duplicateMessageThreshold: 3, // Same message to different users
            similarityThreshold: 0.85,    // Content similarity threshold
            
            // Behavioral patterns
            rapidFireThreshold: 5,        // Messages within 30 seconds
            rapidFireWindow: 30000,       // 30 seconds in ms
            
            // User engagement thresholds
            minResponseRate: 0.1,         // 10% response rate minimum
            maxComplaintRate: 0.05,       // 5% complaint rate maximum
            
            // Template message limits
            maxTemplatesPerDay: 100,
            templateFrequencyLimit: 3600000 // 1 hour between same templates
        };

        // Spam detection tracking
        this.messageFrequency = new Map();     // phone -> frequency data
        this.contentFingerprints = new Map();  // content hash -> usage count
        this.templateTracking = new Map();     // template -> usage data
        this.userEngagement = new Map();       // phone -> engagement metrics
        
        // Auto-cleanup timers
        this.setupCleanupTimers();
        
        logger.info('WhatsApp Spam Prevention Service initialized', {
            thresholds: this.spamThresholds
        });
    }

    /**
     * Analyze message for spam characteristics before sending
     * @param {string} tenantId - Tenant ID
     * @param {string} recipientPhone - Recipient phone number
     * @param {object} messageData - Message content and metadata
     * @returns {Promise<{allowed: boolean, riskLevel: string, reasons: string[]}>}
     */
    async analyzeMessageForSpam(tenantId, recipientPhone, messageData) {
        try {
            const {
                content = '',
                messageType = 'text',
                isTemplate = false,
                templateName = null
            } = messageData;

            const analysis = {
                allowed: true,
                riskLevel: 'low',
                reasons: [],
                recommendations: []
            };

            // Check message frequency limits
            const frequencyCheck = await this.checkMessageFrequency(recipientPhone);
            if (!frequencyCheck.allowed) {
                analysis.allowed = false;
                analysis.riskLevel = 'high';
                analysis.reasons.push(frequencyCheck.reason);
            }

            // Check for content-based spam indicators
            const contentCheck = await this.checkContentSpamIndicators(content, messageType);
            if (contentCheck.riskLevel === 'high') {
                analysis.allowed = false;
                analysis.riskLevel = 'high';
                analysis.reasons.push(...contentCheck.reasons);
            } else if (contentCheck.riskLevel === 'medium') {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push(...contentCheck.recommendations);
            }

            // Check template message patterns
            if (isTemplate && templateName) {
                const templateCheck = await this.checkTemplateSpamPatterns(templateName, recipientPhone);
                if (!templateCheck.allowed) {
                    analysis.allowed = false;
                    analysis.riskLevel = 'high';
                    analysis.reasons.push(templateCheck.reason);
                }
            }

            // Check recipient engagement history
            const engagementCheck = await this.checkRecipientEngagement(tenantId, recipientPhone);
            if (engagementCheck.riskLevel === 'high') {
                analysis.riskLevel = 'high';
                analysis.recommendations.push('Consider reducing message frequency to this recipient');
            }

            // Check for rapid-fire messaging
            const rapidFireCheck = this.checkRapidFirePattern(recipientPhone);
            if (!rapidFireCheck.allowed) {
                analysis.allowed = false;
                analysis.riskLevel = 'high';
                analysis.reasons.push(rapidFireCheck.reason);
            }

            // Log high-risk attempts
            if (analysis.riskLevel === 'high') {
                logger.warn('High-risk message detected', {
                    tenantId,
                    recipientPhone: this.maskPhoneNumber(recipientPhone),
                    riskLevel: analysis.riskLevel,
                    reasons: analysis.reasons,
                    messageType
                });

                // Store spam attempt for analysis
                await this.recordSpamAttempt(tenantId, recipientPhone, messageData, analysis);
            }

            return analysis;

        } catch (error) {
            logger.error('Error analyzing message for spam:', error);
            // Fail open for service availability
            return {
                allowed: true,
                riskLevel: 'unknown',
                reasons: ['Analysis failed - message allowed'],
                error: error.message
            };
        }
    }

    /**
     * Check message frequency limits per recipient
     */
    async checkMessageFrequency(recipientPhone) {
        try {
            const now = Date.now();
            const recipientData = this.getRecipientFrequencyData(recipientPhone);

            // Clean old entries
            this.cleanOldFrequencyEntries(recipientData, now);

            // Count messages in different time windows
            const oneHourAgo = now - (60 * 60 * 1000);
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

            const messagesLastHour = recipientData.messages.filter(ts => ts > oneHourAgo).length;
            const messagesLastDay = recipientData.messages.filter(ts => ts > oneDayAgo).length;
            const messagesLastWeek = recipientData.messages.filter(ts => ts > oneWeekAgo).length;

            // Check against thresholds
            if (messagesLastHour >= this.spamThresholds.maxMessagesPerHour) {
                return {
                    allowed: false,
                    reason: 'HOURLY_FREQUENCY_LIMIT_EXCEEDED',
                    details: {
                        count: messagesLastHour,
                        limit: this.spamThresholds.maxMessagesPerHour,
                        window: '1 hour'
                    }
                };
            }

            if (messagesLastDay >= this.spamThresholds.maxMessagesPerDay) {
                return {
                    allowed: false,
                    reason: 'DAILY_FREQUENCY_LIMIT_EXCEEDED',
                    details: {
                        count: messagesLastDay,
                        limit: this.spamThresholds.maxMessagesPerDay,
                        window: '24 hours'
                    }
                };
            }

            if (messagesLastWeek >= this.spamThresholds.maxMessagesPerWeek) {
                return {
                    allowed: false,
                    reason: 'WEEKLY_FREQUENCY_LIMIT_EXCEEDED',
                    details: {
                        count: messagesLastWeek,
                        limit: this.spamThresholds.maxMessagesPerWeek,
                        window: '1 week'
                    }
                };
            }

            return { allowed: true };

        } catch (error) {
            logger.error('Error checking message frequency:', error);
            return { allowed: true, error: error.message };
        }
    }

    /**
     * Check content for spam indicators
     */
    async checkContentSpamIndicators(content, messageType) {
        try {
            const analysis = {
                riskLevel: 'low',
                reasons: [],
                recommendations: []
            };

            if (!content || messageType !== 'text') {
                return analysis;
            }

            const normalizedContent = content.toLowerCase().trim();

            // Check for spam keywords
            const spamKeywords = [
                'grátis', 'free', 'promoção urgente', 'últimas vagas',
                'clique aqui', 'click here', 'limited time', 'act now',
                'ganhe dinheiro', 'make money', '$$$', 'garantido'
            ];

            const foundSpamKeywords = spamKeywords.filter(keyword => 
                normalizedContent.includes(keyword.toLowerCase())
            );

            if (foundSpamKeywords.length >= 3) {
                analysis.riskLevel = 'high';
                analysis.reasons.push('MULTIPLE_SPAM_KEYWORDS');
            } else if (foundSpamKeywords.length >= 1) {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push('Consider rewording to avoid spam keywords');
            }

            // Check for excessive capitalization
            const capitalRatio = (content.match(/[A-Z]/g) || []).length / content.length;
            if (capitalRatio > 0.5 && content.length > 20) {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push('Reduce excessive capitalization');
            }

            // Check for excessive exclamation marks
            const exclamationCount = (content.match(/!/g) || []).length;
            if (exclamationCount > 3) {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push('Reduce excessive exclamation marks');
            }

            // Check for duplicate content
            const contentHash = this.generateContentHash(normalizedContent);
            const duplicateCount = this.contentFingerprints.get(contentHash) || 0;
            
            if (duplicateCount >= this.spamThresholds.duplicateMessageThreshold) {
                analysis.riskLevel = 'high';
                analysis.reasons.push('DUPLICATE_CONTENT_DETECTED');
            }

            // Check message length (very short or very long messages)
            if (content.length < 10) {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push('Message too short - consider adding more context');
            } else if (content.length > 1000) {
                analysis.riskLevel = 'medium';
                analysis.recommendations.push('Message too long - consider breaking into multiple messages');
            }

            return analysis;

        } catch (error) {
            logger.error('Error checking content spam indicators:', error);
            return { riskLevel: 'unknown', error: error.message };
        }
    }

    /**
     * Check template message spam patterns
     */
    async checkTemplateSpamPatterns(templateName, recipientPhone) {
        try {
            const now = Date.now();
            const templateKey = `${templateName}:${recipientPhone}`;
            const lastSent = this.templateTracking.get(templateKey);

            // Check frequency limit for same template to same recipient
            if (lastSent && (now - lastSent) < this.spamThresholds.templateFrequencyLimit) {
                const remainingTime = Math.ceil((this.spamThresholds.templateFrequencyLimit - (now - lastSent)) / 60000);
                
                return {
                    allowed: false,
                    reason: 'TEMPLATE_FREQUENCY_LIMIT_EXCEEDED',
                    details: {
                        templateName,
                        lastSent: new Date(lastSent).toISOString(),
                        retryAfterMinutes: remainingTime
                    }
                };
            }

            return { allowed: true };

        } catch (error) {
            logger.error('Error checking template spam patterns:', error);
            return { allowed: true, error: error.message };
        }
    }

    /**
     * Check recipient engagement patterns
     */
    async checkRecipientEngagement(tenantId, recipientPhone) {
        try {
            // Get engagement data from database
            const { data, error } = await supabase
                .from('conversation_history')
                .select('role, created_at, confidence_score')
                .eq('tenant_id', tenantId)
                .eq('phone_number', recipientPhone)
                .gte('created_at', new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString()) // Last 30 days
                .order('created_at', { ascending: true });

            if (error) {
                logger.error('Error getting engagement data:', error);
                return { riskLevel: 'unknown' };
            }

            if (!data || data.length === 0) {
                return { riskLevel: 'low' }; // New contact
            }

            const businessMessages = data.filter(msg => msg.role === 'assistant').length;
            const userMessages = data.filter(msg => msg.role === 'user').length;
            
            const responseRate = businessMessages > 0 ? userMessages / businessMessages : 0;
            const avgConfidence = data.reduce((sum, msg) => sum + (msg.confidence_score || 0), 0) / data.length;

            // Analyze engagement quality
            if (responseRate < this.spamThresholds.minResponseRate && businessMessages > 10) {
                return {
                    riskLevel: 'high',
                    reason: 'LOW_ENGAGEMENT_RATE',
                    details: {
                        responseRate: Math.round(responseRate * 100),
                        threshold: Math.round(this.spamThresholds.minResponseRate * 100),
                        businessMessages,
                        userMessages
                    }
                };
            }

            if (avgConfidence < 0.3 && data.length > 5) {
                return {
                    riskLevel: 'medium',
                    reason: 'LOW_CONFIDENCE_INTERACTIONS',
                    details: { avgConfidence }
                };
            }

            return { riskLevel: 'low' };

        } catch (error) {
            logger.error('Error checking recipient engagement:', error);
            return { riskLevel: 'unknown', error: error.message };
        }
    }

    /**
     * Check for rapid-fire messaging patterns
     */
    checkRapidFirePattern(recipientPhone) {
        try {
            const now = Date.now();
            const rapidFireWindow = now - this.spamThresholds.rapidFireWindow;
            const recipientData = this.getRecipientFrequencyData(recipientPhone);

            const recentMessages = recipientData.messages.filter(ts => ts > rapidFireWindow);

            if (recentMessages.length >= this.spamThresholds.rapidFireThreshold) {
                return {
                    allowed: false,
                    reason: 'RAPID_FIRE_MESSAGING_DETECTED',
                    details: {
                        messagesInWindow: recentMessages.length,
                        threshold: this.spamThresholds.rapidFireThreshold,
                        windowSeconds: this.spamThresholds.rapidFireWindow / 1000
                    }
                };
            }

            return { allowed: true };

        } catch (error) {
            logger.error('Error checking rapid-fire pattern:', error);
            return { allowed: true, error: error.message };
        }
    }

    /**
     * Track sent message for spam analysis
     */
    async trackSentMessage(recipientPhone, messageData) {
        try {
            const now = Date.now();
            const {
                content = '',
                messageType = 'text',
                isTemplate = false,
                templateName = null
            } = messageData;

            // Track message frequency
            const recipientData = this.getRecipientFrequencyData(recipientPhone);
            recipientData.messages.push(now);

            // Track content fingerprint
            if (content && messageType === 'text') {
                const contentHash = this.generateContentHash(content.toLowerCase().trim());
                const currentCount = this.contentFingerprints.get(contentHash) || 0;
                this.contentFingerprints.set(contentHash, currentCount + 1);
            }

            // Track template usage
            if (isTemplate && templateName) {
                const templateKey = `${templateName}:${recipientPhone}`;
                this.templateTracking.set(templateKey, now);
            }

            logger.debug('Message tracked for spam analysis', {
                recipientPhone: this.maskPhoneNumber(recipientPhone),
                messageType,
                isTemplate,
                templateName
            });

        } catch (error) {
            logger.error('Error tracking sent message for spam analysis:', error);
        }
    }

    /**
     * Record spam attempt for analysis and monitoring
     */
    async recordSpamAttempt(tenantId, recipientPhone, messageData, analysis) {
        try {
            const { data, error } = await supabase
                .from('whatsapp_spam_attempts')
                .insert({
                    tenant_id: tenantId,
                    phone_number: recipientPhone,
                    message_type: messageData.messageType || 'text',
                    content_preview: (messageData.content || '').substring(0, 100),
                    risk_level: analysis.riskLevel,
                    spam_reasons: analysis.reasons,
                    recommendations: analysis.recommendations,
                    was_blocked: !analysis.allowed,
                    metadata: {
                        content_length: (messageData.content || '').length,
                        is_template: messageData.isTemplate || false,
                        template_name: messageData.templateName,
                        analysis_timestamp: new Date().toISOString()
                    }
                });

            if (error) {
                logger.error('Error recording spam attempt:', error);
            }

        } catch (error) {
            logger.error('Error recording spam attempt:', error);
        }
    }

    /**
     * Get recipient frequency data with lazy initialization
     */
    getRecipientFrequencyData(recipientPhone) {
        if (!this.messageFrequency.has(recipientPhone)) {
            this.messageFrequency.set(recipientPhone, {
                messages: [],
                firstContact: Date.now()
            });
        }
        return this.messageFrequency.get(recipientPhone);
    }

    /**
     * Clean old frequency entries to manage memory
     */
    cleanOldFrequencyEntries(recipientData, now) {
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        recipientData.messages = recipientData.messages.filter(ts => ts > oneWeekAgo);
    }

    /**
     * Generate content hash for duplicate detection
     */
    generateContentHash(content) {
        // Simple hash function for content fingerprinting
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    /**
     * Setup cleanup timers for memory management
     */
    setupCleanupTimers() {
        // Clean old frequency data every hour
        setInterval(() => {
            const now = Date.now();
            const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

            for (const [phone, data] of this.messageFrequency.entries()) {
                data.messages = data.messages.filter(ts => ts > oneWeekAgo);
                if (data.messages.length === 0 && data.firstContact < oneWeekAgo) {
                    this.messageFrequency.delete(phone);
                }
            }

            logger.debug('Spam prevention data cleanup completed', {
                trackingEntries: this.messageFrequency.size,
                contentFingerprints: this.contentFingerprints.size
            });
        }, 60 * 60 * 1000); // 1 hour

        // Clean old content fingerprints every 6 hours
        setInterval(() => {
            // Keep only most frequent content (simple cleanup strategy)
            const sortedContent = Array.from(this.contentFingerprints.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 1000); // Keep top 1000

            this.contentFingerprints.clear();
            sortedContent.forEach(([hash, count]) => {
                this.contentFingerprints.set(hash, count);
            });
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    /**
     * Get spam prevention statistics
     */
    getSpamStats() {
        const now = Date.now();
        let totalMessages = 0;
        let activeRecipients = 0;

        for (const [phone, data] of this.messageFrequency.entries()) {
            const recentMessages = data.messages.filter(ts => ts > (now - 24 * 60 * 60 * 1000));
            totalMessages += recentMessages.length;
            if (recentMessages.length > 0) activeRecipients++;
        }

        return {
            trackingEntries: this.messageFrequency.size,
            contentFingerprints: this.contentFingerprints.size,
            templateTracking: this.templateTracking.size,
            activeRecipients24h: activeRecipients,
            totalMessages24h: totalMessages,
            thresholds: this.spamThresholds
        };
    }

    /**
     * Mask phone number for privacy
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.slice(0, 3) + '*'.repeat(phoneNumber.length - 6) + phoneNumber.slice(-3);
    }

    /**
     * Reset all spam tracking data (for testing)
     */
    reset() {
        this.messageFrequency.clear();
        this.contentFingerprints.clear();
        this.templateTracking.clear();
        this.userEngagement.clear();
        logger.info('Spam prevention data reset completed');
    }

    /**
     * Health check for monitoring
     */
    healthCheck() {
        return {
            status: 'healthy',
            ...this.getSpamStats(),
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WhatsAppSpamPreventionService();