const { logger } = require('../utils/logger');

/**
 * Webhook Security Validator Middleware
 * Provides comprehensive security validation for WhatsApp webhooks
 */
class WebhookSecurityValidator {
    constructor() {
        this.security = {
            maxTimestampAge: 24 * 60 * 60, // 24 hours in seconds
            maxTimestampFuture: 5 * 60,    // 5 minutes future tolerance
            maxPayloadSize: 1024 * 1024,   // 1MB max payload
            
            // Dangerous patterns to detect
            dangerousPatterns: [
                // SQL Injection patterns
                /[';]|--|%27|%3B/gi,
                /\bunion\b.*\bselect\b/gi,
                /exec\s+(s|x)p\w+/gi,
                
                // XSS patterns
                /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /<iframe[\s\S]*?>/gi,
                
                // Command injection patterns
                /[|;&`$]/gi,
                /\.\.[\/\\]/gi,
                /\b(rm|cat|ls|ps|kill|nc|netcat|wget|curl)\s+/gi,
                
                // Path traversal
                /(\.\.[\/\\]){2,}/gi,
                /\/etc\/passwd/gi,
                /\/proc\/self\/environ/gi
            ]
        };
        
        logger.info('Webhook Security Validator initialized');
    }

    /**
     * Validate webhook timestamp
     */
    validateTimestamp(timestamp) {
        try {
            const messageTime = parseInt(timestamp);
            const currentTime = Math.floor(Date.now() / 1000);
            const timeDiff = currentTime - messageTime;
            
            // Check if timestamp is too old
            if (timeDiff > this.security.maxTimestampAge) {
                return {
                    valid: false,
                    reason: 'TIMESTAMP_TOO_OLD',
                    details: {
                        messageTime: new Date(messageTime * 1000).toISOString(),
                        ageDiff: Math.floor(timeDiff / 3600), // hours
                        maxAge: this.security.maxTimestampAge / 3600
                    }
                };
            }
            
            // Check if timestamp is too far in the future
            if (timeDiff < -this.security.maxTimestampFuture) {
                return {
                    valid: false,
                    reason: 'TIMESTAMP_TOO_FUTURE',
                    details: {
                        messageTime: new Date(messageTime * 1000).toISOString(),
                        futureDiff: Math.abs(timeDiff),
                        maxFuture: this.security.maxTimestampFuture
                    }
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                reason: 'TIMESTAMP_INVALID_FORMAT',
                details: { timestamp, error: error.message }
            };
        }
    }

    /**
     * Sanitize and validate message content
     */
    validateMessageContent(content) {
        if (!content || typeof content !== 'string') {
            return { valid: true, sanitized: content };
        }

        const issues = [];
        let sanitized = content;

        // Check for dangerous patterns
        for (const pattern of this.security.dangerousPatterns) {
            if (pattern.test(content)) {
                issues.push({
                    pattern: pattern.toString(),
                    matches: content.match(pattern)
                });
                
                // Sanitize by removing dangerous content
                sanitized = sanitized.replace(pattern, '[SANITIZED]');
            }
        }

        // Check content length
        if (content.length > 4096) { // WhatsApp max is 4096 chars
            issues.push({
                pattern: 'CONTENT_TOO_LONG',
                matches: [`Length: ${content.length}, Max: 4096`]
            });
            sanitized = sanitized.substring(0, 4096);
        }

        return {
            valid: issues.length === 0,
            issues,
            sanitized,
            originalLength: content.length,
            sanitizedLength: sanitized.length
        };
    }

    /**
     * Validate webhook payload structure
     */
    validatePayloadStructure(payload) {
        try {
            const issues = [];

            // Required fields validation
            if (!payload.object || payload.object !== 'whatsapp_business_account') {
                issues.push('Invalid or missing object field');
            }

            if (!payload.entry || !Array.isArray(payload.entry)) {
                issues.push('Invalid or missing entry array');
            }

            // Validate entry structure
            if (payload.entry) {
                for (let i = 0; i < payload.entry.length; i++) {
                    const entry = payload.entry[i];
                    
                    if (!entry.id) {
                        issues.push(`Entry ${i}: Missing id field`);
                    }
                    
                    if (!entry.changes || !Array.isArray(entry.changes)) {
                        issues.push(`Entry ${i}: Invalid or missing changes array`);
                    }
                    
                    // Validate changes structure
                    if (entry.changes) {
                        for (let j = 0; j < entry.changes.length; j++) {
                            const change = entry.changes[j];
                            
                            if (!change.field || !change.value) {
                                issues.push(`Entry ${i}, Change ${j}: Missing field or value`);
                            }
                            
                            // Validate messages if present
                            if (change.field === 'messages' && change.value.messages) {
                                for (let k = 0; k < change.value.messages.length; k++) {
                                    const message = change.value.messages[k];
                                    
                                    // Validate timestamp
                                    if (message.timestamp) {
                                        const timestampValidation = this.validateTimestamp(message.timestamp);
                                        if (!timestampValidation.valid) {
                                            issues.push(`Message ${k}: ${timestampValidation.reason}`);
                                        }
                                    }
                                    
                                    // Validate message content
                                    if (message.text && message.text.body) {
                                        const contentValidation = this.validateMessageContent(message.text.body);
                                        if (!contentValidation.valid) {
                                            issues.push(`Message ${k}: Suspicious content detected`);
                                            // Sanitize the content
                                            message.text.body = contentValidation.sanitized;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return {
                valid: issues.length === 0,
                issues,
                sanitizedPayload: payload
            };

        } catch (error) {
            return {
                valid: false,
                issues: [`Payload validation error: ${error.message}`],
                sanitizedPayload: null
            };
        }
    }

    /**
     * Express middleware function
     */
    middleware() {
        return (req, res, next) => {
            try {
                // Skip validation for GET requests (webhook verification)
                if (req.method === 'GET') {
                    return next();
                }

                const startTime = Date.now();

                // Validate payload size
                const payloadSize = JSON.stringify(req.body).length;
                if (payloadSize > this.security.maxPayloadSize) {
                    logger.warn('Webhook payload too large', {
                        size: payloadSize,
                        maxSize: this.security.maxPayloadSize
                    });
                    
                    return res.status(413).json({
                        error: 'Payload too large',
                        maxSize: this.security.maxPayloadSize
                    });
                }

                // Validate payload structure and content
                const validation = this.validatePayloadStructure(req.body);
                
                if (!validation.valid) {
                    logger.warn('Webhook security validation failed', {
                        issues: validation.issues,
                        payload: JSON.stringify(req.body).substring(0, 200)
                    });
                    
                    return res.status(400).json({
                        error: 'Invalid webhook payload',
                        issues: validation.issues
                    });
                }

                // Replace request body with sanitized version
                req.body = validation.sanitizedPayload;
                
                // Add security metadata to request
                req.securityValidation = {
                    validated: true,
                    issues: validation.issues,
                    validationTime: Date.now() - startTime
                };

                if (validation.issues.length > 0) {
                    logger.info('Webhook payload sanitized', {
                        issues: validation.issues.length,
                        validationTime: req.securityValidation.validationTime
                    });
                }

                next();

            } catch (error) {
                logger.error('Webhook security validation error:', error);
                
                // Fail securely - reject the request
                return res.status(500).json({
                    error: 'Security validation failed',
                    message: 'Request cannot be processed securely'
                });
            }
        };
    }

    /**
     * Health check for monitoring
     */
    healthCheck() {
        return {
            status: 'healthy',
            security: {
                patternsLoaded: this.security.dangerousPatterns.length,
                maxTimestampAge: this.security.maxTimestampAge,
                maxPayloadSize: this.security.maxPayloadSize
            },
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WebhookSecurityValidator();