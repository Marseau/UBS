const { logger } = require('../utils/logger');

/**
 * WhatsApp Rate Limiter Service
 * Implements Meta's rate limiting requirements:
 * - 80 messages per second per phone number
 * - 1000 conversations per 24 hours (tier-based)
 * - Quota enforcement and monitoring
 */
class WhatsAppRateLimiterService {
    constructor() {
        // Meta's official rate limits
        this.limits = {
            messagesPerSecond: 80,          // Per phone number ID
            conversationsPerDay: 1000,      // Tier 1 (can be upgraded)
            burstAllowance: 10,             // Allow short bursts above rate
            quotaResetHours: 24             // Daily quota reset
        };

        // In-memory tracking (Redis recommended for production)
        this.messageTracking = new Map();      // phone_number -> message timestamps
        this.conversationTracking = new Map(); // phone_number -> conversation data
        this.quotaTracking = new Map();        // phone_number -> daily quota usage
        
        // Cleanup intervals
        this.setupCleanupTimers();
        
        logger.info('WhatsApp Rate Limiter initialized', {
            messagesPerSecond: this.limits.messagesPerSecond,
            conversationsPerDay: this.limits.conversationsPerDay
        });
    }

    /**
     * Check if a message can be sent within rate limits
     * @param {string} phoneNumberId - WhatsApp Business Phone Number ID
     * @param {string} recipientPhone - Recipient phone number
     * @param {string} messageType - Type of message (text, template, interactive)
     * @returns {Promise<{allowed: boolean, reason?: string, retryAfter?: number}>}
     */
    async checkMessageRateLimit(phoneNumberId, recipientPhone, messageType = 'text') {
        try {
            // Check per-second message rate limit
            const messageRateCheck = await this.checkMessageRate(phoneNumberId);
            if (!messageRateCheck.allowed) {
                return messageRateCheck;
            }

            // Check daily conversation quota
            const quotaCheck = await this.checkConversationQuota(phoneNumberId);
            if (!quotaCheck.allowed) {
                return quotaCheck;
            }

            // Check recipient-specific limits (spam prevention)
            const recipientCheck = await this.checkRecipientLimits(recipientPhone);
            if (!recipientCheck.allowed) {
                return recipientCheck;
            }

            // All checks passed
            return { allowed: true };

        } catch (error) {
            logger.error('Error checking WhatsApp rate limits:', error);
            // Fail open for service availability (log for monitoring)
            return { 
                allowed: true, 
                warning: 'Rate limit check failed - allowing message'
            };
        }
    }

    /**
     * Track a sent message for rate limiting
     * @param {string} phoneNumberId - WhatsApp Business Phone Number ID
     * @param {string} recipientPhone - Recipient phone number
     * @param {string} messageType - Type of message
     * @param {object} conversationData - Conversation metadata
     */
    async trackSentMessage(phoneNumberId, recipientPhone, messageType, conversationData = {}) {
        try {
            const now = Date.now();

            // Track message rate
            this.trackMessageRate(phoneNumberId, now);

            // Track conversation if this starts a new conversation
            if (conversationData.isNewConversation) {
                this.trackConversation(phoneNumberId, recipientPhone, conversationData);
            }

            // Track recipient interaction
            this.trackRecipientMessage(recipientPhone, now, messageType);

            logger.debug('WhatsApp message tracked', {
                phoneNumberId,
                recipientPhone: this.maskPhoneNumber(recipientPhone),
                messageType,
                isNewConversation: conversationData.isNewConversation
            });

        } catch (error) {
            logger.error('Error tracking WhatsApp message:', error);
        }
    }

    /**
     * Check per-second message rate limit (80 msgs/sec per phone number)
     */
    async checkMessageRate(phoneNumberId) {
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        
        // Get messages sent in the last second
        const recentMessages = this.getRecentMessages(phoneNumberId, oneSecondAgo);
        
        if (recentMessages.length >= this.limits.messagesPerSecond) {
            // Check if we can allow burst (short allowance above rate)
            const burstWindow = now - 500; // 500ms burst window
            const burstMessages = recentMessages.filter(ts => ts > burstWindow);
            
            if (burstMessages.length >= this.limits.messagesPerSecond + this.limits.burstAllowance) {
                const retryAfter = Math.ceil((recentMessages[0] + 1000 - now) / 1000);
                
                logger.warn('WhatsApp message rate limit exceeded', {
                    phoneNumberId,
                    messagesInLastSecond: recentMessages.length,
                    limit: this.limits.messagesPerSecond,
                    retryAfter
                });

                return {
                    allowed: false,
                    reason: 'MESSAGE_RATE_LIMIT_EXCEEDED',
                    retryAfter,
                    details: {
                        limit: this.limits.messagesPerSecond,
                        current: recentMessages.length,
                        window: '1 second'
                    }
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Check daily conversation quota (1000 conversations/24h)
     */
    async checkConversationQuota(phoneNumberId) {
        const now = Date.now();
        const quotaData = this.quotaTracking.get(phoneNumberId) || {
            conversations: 0,
            resetTime: now + (this.limits.quotaResetHours * 60 * 60 * 1000)
        };

        // Reset quota if 24 hours have passed
        if (now >= quotaData.resetTime) {
            quotaData.conversations = 0;
            quotaData.resetTime = now + (this.limits.quotaResetHours * 60 * 60 * 1000);
            this.quotaTracking.set(phoneNumberId, quotaData);
        }

        // Check if quota exceeded
        if (quotaData.conversations >= this.limits.conversationsPerDay) {
            const resetIn = Math.ceil((quotaData.resetTime - now) / (60 * 60 * 1000));
            
            logger.warn('WhatsApp conversation quota exceeded', {
                phoneNumberId,
                conversations: quotaData.conversations,
                limit: this.limits.conversationsPerDay,
                resetInHours: resetIn
            });

            return {
                allowed: false,
                reason: 'CONVERSATION_QUOTA_EXCEEDED',
                retryAfter: resetIn * 3600, // seconds
                details: {
                    limit: this.limits.conversationsPerDay,
                    current: quotaData.conversations,
                    resetInHours: resetIn
                }
            };
        }

        return { allowed: true };
    }

    /**
     * Check recipient-specific limits (spam prevention)
     */
    async checkRecipientLimits(recipientPhone) {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        const recipientData = this.getRecipientData(recipientPhone);
        const recentMessages = recipientData.messages.filter(msg => msg.timestamp > oneHourAgo);

        // Limit: 10 messages per hour per recipient (spam prevention)
        const messagesPerHourLimit = 10;
        
        if (recentMessages.length >= messagesPerHourLimit) {
            logger.warn('Recipient message limit exceeded', {
                recipientPhone: this.maskPhoneNumber(recipientPhone),
                messagesInLastHour: recentMessages.length,
                limit: messagesPerHourLimit
            });

            return {
                allowed: false,
                reason: 'RECIPIENT_LIMIT_EXCEEDED',
                retryAfter: 3600, // 1 hour
                details: {
                    limit: messagesPerHourLimit,
                    current: recentMessages.length,
                    window: '1 hour'
                }
            };
        }

        return { allowed: true };
    }

    /**
     * Track message rate for phone number
     */
    trackMessageRate(phoneNumberId, timestamp) {
        const messages = this.messageTracking.get(phoneNumberId) || [];
        messages.push(timestamp);
        
        // Keep only last 2 seconds of data for efficiency
        const twoSecondsAgo = timestamp - 2000;
        const filteredMessages = messages.filter(ts => ts > twoSecondsAgo);
        
        this.messageTracking.set(phoneNumberId, filteredMessages);
    }

    /**
     * Track conversation for quota management
     */
    trackConversation(phoneNumberId, recipientPhone, conversationData) {
        const quotaData = this.quotaTracking.get(phoneNumberId) || {
            conversations: 0,
            resetTime: Date.now() + (this.limits.quotaResetHours * 60 * 60 * 1000)
        };

        quotaData.conversations++;
        this.quotaTracking.set(phoneNumberId, quotaData);

        // Log conversation for billing integration
        logger.info('WhatsApp conversation tracked', {
            phoneNumberId,
            recipientPhone: this.maskPhoneNumber(recipientPhone),
            conversationType: conversationData.type || 'business_initiated',
            quotaUsed: quotaData.conversations,
            quotaLimit: this.limits.conversationsPerDay
        });
    }

    /**
     * Track recipient message history
     */
    trackRecipientMessage(recipientPhone, timestamp, messageType) {
        const recipientData = this.getRecipientData(recipientPhone);
        recipientData.messages.push({
            timestamp,
            messageType
        });

        // Keep only last 24 hours of data
        const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
        recipientData.messages = recipientData.messages.filter(msg => msg.timestamp > oneDayAgo);
    }

    /**
     * Get recent messages for phone number
     */
    getRecentMessages(phoneNumberId, sinceTimestamp) {
        const messages = this.messageTracking.get(phoneNumberId) || [];
        return messages.filter(ts => ts > sinceTimestamp);
    }

    /**
     * Get recipient data with lazy initialization
     */
    getRecipientData(recipientPhone) {
        if (!this.conversationTracking.has(recipientPhone)) {
            this.conversationTracking.set(recipientPhone, {
                messages: [],
                firstContact: Date.now()
            });
        }
        return this.conversationTracking.get(recipientPhone);
    }

    /**
     * Get current rate limit statistics
     */
    getRateLimitStats(phoneNumberId) {
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        const recentMessages = this.getRecentMessages(phoneNumberId, oneSecondAgo);
        
        const quotaData = this.quotaTracking.get(phoneNumberId) || {
            conversations: 0,
            resetTime: now + (this.limits.quotaResetHours * 60 * 60 * 1000)
        };

        return {
            phoneNumberId,
            messagesLastSecond: recentMessages.length,
            messageRateLimit: this.limits.messagesPerSecond,
            messageRateUsage: (recentMessages.length / this.limits.messagesPerSecond) * 100,
            conversationsToday: quotaData.conversations,
            conversationQuota: this.limits.conversationsPerDay,
            quotaUsage: (quotaData.conversations / this.limits.conversationsPerDay) * 100,
            quotaResetIn: Math.max(0, Math.ceil((quotaData.resetTime - now) / (60 * 60 * 1000))),
            timestamp: now
        };
    }

    /**
     * Update conversation quota limits (for tier upgrades)
     */
    updateQuotaLimits(phoneNumberId, newLimit) {
        this.limits.conversationsPerDay = newLimit;
        
        logger.info('WhatsApp conversation quota updated', {
            phoneNumberId,
            newLimit,
            previousLimit: this.limits.conversationsPerDay
        });
    }

    /**
     * Setup cleanup timers for memory management
     */
    setupCleanupTimers() {
        // Clean old message tracking data every 5 minutes
        setInterval(() => {
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000);
            
            for (const [phoneNumberId, messages] of this.messageTracking.entries()) {
                const filteredMessages = messages.filter(ts => ts > fiveMinutesAgo);
                if (filteredMessages.length === 0) {
                    this.messageTracking.delete(phoneNumberId);
                } else {
                    this.messageTracking.set(phoneNumberId, filteredMessages);
                }
            }
        }, 5 * 60 * 1000);

        // Clean old recipient data every hour
        setInterval(() => {
            const now = Date.now();
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            
            for (const [recipientPhone, data] of this.conversationTracking.entries()) {
                data.messages = data.messages.filter(msg => msg.timestamp > oneDayAgo);
                if (data.messages.length === 0 && data.firstContact < oneDayAgo) {
                    this.conversationTracking.delete(recipientPhone);
                }
            }
        }, 60 * 60 * 1000);
    }

    /**
     * Mask phone number for privacy in logs
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.slice(0, 3) + '*'.repeat(phoneNumber.length - 6) + phoneNumber.slice(-3);
    }

    /**
     * Reset all rate limiting data (for testing)
     */
    reset() {
        this.messageTracking.clear();
        this.conversationTracking.clear();
        this.quotaTracking.clear();
        logger.info('WhatsApp rate limiter reset completed');
    }

    /**
     * Health check for monitoring
     */
    healthCheck() {
        return {
            status: 'healthy',
            trackingEntries: {
                messages: this.messageTracking.size,
                conversations: this.conversationTracking.size,
                quotas: this.quotaTracking.size
            },
            limits: this.limits,
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WhatsAppRateLimiterService();