const { logger } = require('../utils/logger');

/**
 * WhatsApp 24-Hour Message Window Validator
 * Enforces Meta's 24-hour messaging window policy:
 * - Business can only send messages within 24h of user's last message
 * - After 24h, only template messages are allowed
 * - Tracks conversation windows per user
 */
class MessageWindowValidator {
    constructor() {
        this.conversationWindows = new Map(); // phone -> last user message timestamp
        this.windowDurationMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        // Setup cleanup timer
        this.setupCleanupTimer();
        
        logger.info('WhatsApp 24-hour message window validator initialized');
    }

    /**
     * Validate if a message can be sent within the 24-hour window
     * @param {string} recipientPhone - Recipient phone number
     * @param {string} messageType - Type of message (text, template, interactive)
     * @param {boolean} isUserInitiated - Whether this is responding to a user message
     * @returns {Promise<{allowed: boolean, reason?: string, requiresTemplate?: boolean}>}
     */
    async validateMessageWindow(recipientPhone, messageType, isUserInitiated = false) {
        try {
            const now = Date.now();
            const lastUserMessage = this.conversationWindows.get(recipientPhone);

            // If no previous conversation, only allow if user initiated
            if (!lastUserMessage) {
                if (isUserInitiated) {
                    return { allowed: true };
                }
                
                // Business initiating first contact - requires template message
                if (messageType === 'template') {
                    return { allowed: true };
                }
                
                logger.warn('24h window violation: No previous conversation, template required', {
                    recipientPhone: this.maskPhoneNumber(recipientPhone),
                    messageType,
                    isUserInitiated
                });

                return {
                    allowed: false,
                    reason: 'NO_PREVIOUS_CONVERSATION',
                    requiresTemplate: true,
                    details: {
                        message: 'First contact requires template message or user initiation',
                        solution: 'Use approved template message for business-initiated contact'
                    }
                };
            }

            // Check if we're within the 24-hour window
            const timeSinceLastMessage = now - lastUserMessage;
            const isWithinWindow = timeSinceLastMessage <= this.windowDurationMs;

            if (isWithinWindow) {
                // Within 24h window - all message types allowed
                return { allowed: true };
            }

            // Outside 24h window - only template messages allowed
            if (messageType === 'template') {
                return { allowed: true };
            }

            const hoursExpired = Math.ceil(timeSinceLastMessage / (60 * 60 * 1000));
            
            logger.warn('24h window violation: Window expired, template required', {
                recipientPhone: this.maskPhoneNumber(recipientPhone),
                messageType,
                hoursExpired,
                lastUserMessage: new Date(lastUserMessage).toISOString()
            });

            return {
                allowed: false,
                reason: 'WINDOW_EXPIRED',
                requiresTemplate: true,
                details: {
                    hoursExpired,
                    lastUserMessage: new Date(lastUserMessage).toISOString(),
                    message: 'Conversation window expired, template message required',
                    solution: 'Use approved template message or wait for user to initiate'
                }
            };

        } catch (error) {
            logger.error('Error validating 24h message window:', error);
            // Fail open for service availability
            return { 
                allowed: true, 
                warning: 'Window validation failed - allowing message'
            };
        }
    }

    /**
     * Record user's incoming message to reset the 24-hour window
     * @param {string} senderPhone - Phone number of user who sent message
     * @param {number} timestamp - Timestamp of the message (optional, defaults to now)
     */
    recordUserMessage(senderPhone, timestamp = Date.now()) {
        try {
            this.conversationWindows.set(senderPhone, timestamp);
            
            logger.debug('24h window reset for user', {
                senderPhone: this.maskPhoneNumber(senderPhone),
                timestamp: new Date(timestamp).toISOString()
            });

        } catch (error) {
            logger.error('Error recording user message for window tracking:', error);
        }
    }

    /**
     * Get conversation window status for a phone number
     * @param {string} phoneNumber - Phone number to check
     * @returns {object} Window status information
     */
    getWindowStatus(phoneNumber) {
        const lastUserMessage = this.conversationWindows.get(phoneNumber);
        
        if (!lastUserMessage) {
            return {
                hasConversation: false,
                windowOpen: false,
                requiresTemplate: true,
                message: 'No previous conversation - template required for business initiation'
            };
        }

        const now = Date.now();
        const timeSinceLastMessage = now - lastUserMessage;
        const isWithinWindow = timeSinceLastMessage <= this.windowDurationMs;
        const timeRemaining = Math.max(0, this.windowDurationMs - timeSinceLastMessage);

        return {
            hasConversation: true,
            windowOpen: isWithinWindow,
            requiresTemplate: !isWithinWindow,
            lastUserMessage: new Date(lastUserMessage).toISOString(),
            timeSinceLastMessage: Math.ceil(timeSinceLastMessage / (60 * 60 * 1000)), // hours
            timeRemaining: Math.ceil(timeRemaining / (60 * 60 * 1000)), // hours
            windowExpiresAt: new Date(lastUserMessage + this.windowDurationMs).toISOString()
        };
    }

    /**
     * Middleware function for Express routes
     * @param {object} req - Express request object
     * @param {object} res - Express response object
     * @param {function} next - Express next function
     */
    middleware() {
        return async (req, res, next) => {
            try {
                // Skip validation for webhook endpoints (incoming messages)
                if (req.path.includes('/webhook')) {
                    return next();
                }

                // Extract message details from request
                const { to: recipientPhone, type: messageType } = req.body;
                
                if (!recipientPhone) {
                    return next(); // Skip if no recipient specified
                }

                // Validate 24-hour window
                const validation = await this.validateMessageWindow(
                    recipientPhone,
                    messageType || 'text'
                );

                if (!validation.allowed) {
                    return res.status(429).json({
                        error: 'Message window violation',
                        code: validation.reason,
                        details: validation.details,
                        requiresTemplate: validation.requiresTemplate,
                        windowStatus: this.getWindowStatus(recipientPhone),
                        timestamp: new Date().toISOString()
                    });
                }

                // Add window status to request for downstream use
                req.windowStatus = this.getWindowStatus(recipientPhone);
                next();

            } catch (error) {
                logger.error('Error in message window middleware:', error);
                // Continue on error to maintain service availability
                next();
            }
        };
    }

    /**
     * Express route handler to check window status
     * @param {object} req - Express request object
     * @param {object} res - Express response object
     */
    checkWindowStatusRoute() {
        return (req, res) => {
            try {
                const { phone } = req.params;
                
                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone number required',
                        example: '/api/whatsapp/window-status/5511999999999'
                    });
                }

                const windowStatus = this.getWindowStatus(phone);
                
                res.json({
                    phone: this.maskPhoneNumber(phone),
                    windowStatus,
                    currentTime: new Date().toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                });

            } catch (error) {
                logger.error('Error checking window status:', error);
                res.status(500).json({
                    error: 'Failed to check window status',
                    message: error.message
                });
            }
        };
    }

    /**
     * Setup cleanup timer to remove old conversation windows
     */
    setupCleanupTimer() {
        // Clean up expired windows every 6 hours
        setInterval(() => {
            const now = Date.now();
            const cutoffTime = now - (this.windowDurationMs * 2); // Keep for 48h for analysis
            
            let cleanedCount = 0;
            for (const [phone, lastMessage] of this.conversationWindows.entries()) {
                if (lastMessage < cutoffTime) {
                    this.conversationWindows.delete(phone);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.info('Cleaned up expired conversation windows', {
                    cleanedCount,
                    remainingWindows: this.conversationWindows.size
                });
            }
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    /**
     * Get all active conversation windows (for monitoring)
     */
    getActiveWindows() {
        const now = Date.now();
        const activeWindows = [];

        for (const [phone, lastMessage] of this.conversationWindows.entries()) {
            const timeSinceLastMessage = now - lastMessage;
            const isActive = timeSinceLastMessage <= this.windowDurationMs;
            
            activeWindows.push({
                phone: this.maskPhoneNumber(phone),
                lastMessage: new Date(lastMessage).toISOString(),
                hoursAgo: Math.ceil(timeSinceLastMessage / (60 * 60 * 1000)),
                isActive,
                status: isActive ? 'open' : 'expired'
            });
        }

        return activeWindows.sort((a, b) => a.hoursAgo - b.hoursAgo);
    }

    /**
     * Mask phone number for privacy in logs
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.slice(0, 3) + '*'.repeat(phoneNumber.length - 6) + phoneNumber.slice(-3);
    }

    /**
     * Reset all window data (for testing)
     */
    reset() {
        this.conversationWindows.clear();
        logger.info('Message window validator reset completed');
    }

    /**
     * Health check for monitoring
     */
    healthCheck() {
        const now = Date.now();
        let activeWindows = 0;
        let expiredWindows = 0;

        for (const [phone, lastMessage] of this.conversationWindows.entries()) {
            const timeSinceLastMessage = now - lastMessage;
            if (timeSinceLastMessage <= this.windowDurationMs) {
                activeWindows++;
            } else {
                expiredWindows++;
            }
        }

        return {
            status: 'healthy',
            totalWindows: this.conversationWindows.size,
            activeWindows,
            expiredWindows,
            windowDurationHours: this.windowDurationMs / (60 * 60 * 1000),
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new MessageWindowValidator();