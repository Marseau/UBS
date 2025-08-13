const { logger } = require('../utils/logger');

/**
 * WhatsApp Retry Logic Service
 * Implements exponential backoff retry logic for WhatsApp API calls
 * Handles transient failures and ensures reliable message delivery
 */
class WhatsAppRetryLogicService {
    constructor() {
        // Retry configuration
        this.retryConfig = {
            maxRetries: 5,              // Maximum number of retry attempts
            baseDelay: 1000,            // Base delay in milliseconds (1 second)
            maxDelay: 30000,            // Maximum delay between retries (30 seconds)
            backoffMultiplier: 2,       // Exponential backoff multiplier
            jitter: true,               // Add randomness to prevent thundering herd
            
            // Retryable HTTP status codes
            retryableStatusCodes: [
                429, // Too Many Requests (rate limiting)
                500, // Internal Server Error
                502, // Bad Gateway
                503, // Service Unavailable
                504, // Gateway Timeout
                408, // Request Timeout
            ],
            
            // Retryable error patterns
            retryableErrors: [
                'ECONNRESET',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'ENOTFOUND',
                'EAI_AGAIN',
                'NETWORK_ERROR',
                'TIMEOUT_ERROR'
            ]
        };

        // Retry attempt tracking
        this.retryAttempts = new Map(); // operation_id -> retry data
        this.circuitBreaker = new Map(); // endpoint -> circuit breaker state
        
        // Cleanup old retry attempts periodically
        this.setupCleanupTimer();
        
        logger.info('WhatsApp Retry Logic Service initialized', {
            maxRetries: this.retryConfig.maxRetries,
            baseDelay: this.retryConfig.baseDelay,
            maxDelay: this.retryConfig.maxDelay
        });
    }

    /**
     * Execute operation with retry logic and exponential backoff
     * @param {function} operation - Async operation to execute
     * @param {object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const {
            operationId = this.generateOperationId(),
            context = {},
            maxRetries = this.retryConfig.maxRetries,
            baseDelay = this.retryConfig.baseDelay,
            description = 'WhatsApp API operation'
        } = options;

        let lastError;
        let attempt = 0;

        // Check circuit breaker before starting
        if (this.isCircuitBreakerOpen(context.endpoint)) {
            throw new Error(`Circuit breaker is open for endpoint: ${context.endpoint}`);
        }

        // Track retry attempt
        this.trackRetryAttempt(operationId, {
            description,
            context,
            startTime: Date.now(),
            maxRetries
        });

        while (attempt <= maxRetries) {
            try {
                logger.debug('Executing operation attempt', {
                    operationId,
                    attempt: attempt + 1,
                    maxRetries: maxRetries + 1,
                    description
                });

                // Execute the operation
                const result = await operation();

                // Success - reset circuit breaker and cleanup
                this.recordSuccess(context.endpoint);
                this.completeRetryAttempt(operationId, true, attempt);

                if (attempt > 0) {
                    logger.info('Operation succeeded after retries', {
                        operationId,
                        totalAttempts: attempt + 1,
                        description
                    });
                }

                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    logger.warn('Non-retryable error encountered', {
                        operationId,
                        attempt,
                        error: error.message,
                        description
                    });
                    break;
                }

                // Record failure for circuit breaker
                this.recordFailure(context.endpoint);

                // If this was the last attempt, don't wait
                if (attempt > maxRetries) {
                    break;
                }

                // Calculate delay with exponential backoff and jitter
                const delay = this.calculateDelay(attempt, baseDelay);

                logger.warn('Operation failed, retrying after delay', {
                    operationId,
                    attempt,
                    nextAttempt: attempt + 1,
                    delayMs: delay,
                    error: error.message,
                    description
                });

                // Update retry tracking
                this.updateRetryAttempt(operationId, attempt, error, delay);

                // Wait before retrying
                await this.sleep(delay);
            }
        }

        // All attempts failed
        this.completeRetryAttempt(operationId, false, attempt);

        logger.error('Operation failed after all retry attempts', {
            operationId,
            totalAttempts: attempt,
            finalError: lastError.message,
            description
        });

        // Enhance error with retry information
        const enhancedError = new Error(
            `Operation failed after ${attempt} attempts: ${lastError.message}`
        );
        enhancedError.originalError = lastError;
        enhancedError.attempts = attempt;
        enhancedError.operationId = operationId;
        enhancedError.isRetryExhausted = true;

        throw enhancedError;
    }

    /**
     * Wrapper for WhatsApp API calls with retry logic
     * @param {function} apiCall - WhatsApp API call function
     * @param {object} requestData - Request data
     * @param {string} endpoint - API endpoint for circuit breaker
     * @returns {Promise<any>} API response
     */
    async executeWhatsAppApiCall(apiCall, requestData, endpoint = 'messages') {
        return this.executeWithRetry(
            async () => {
                try {
                    const response = await apiCall(requestData);
                    
                    // Log successful API call
                    logger.debug('WhatsApp API call successful', {
                        endpoint,
                        status: response.status || 'success'
                    });

                    return response;

                } catch (error) {
                    // Enhance error with more context
                    if (error.response) {
                        const enhancedError = new Error(
                            `WhatsApp API error: ${error.response.status} - ${error.response.statusText}`
                        );
                        enhancedError.status = error.response.status;
                        enhancedError.response = error.response;
                        enhancedError.originalError = error;
                        throw enhancedError;
                    }
                    throw error;
                }
            },
            {
                operationId: this.generateOperationId(),
                context: { endpoint, requestData },
                description: `WhatsApp API call to ${endpoint}`
            }
        );
    }

    /**
     * Check if an error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if error is retryable
     */
    isRetryableError(error) {
        // Check HTTP status codes
        if (error.status && this.retryConfig.retryableStatusCodes.includes(error.status)) {
            return true;
        }

        // Check error codes/messages
        const errorMessage = error.message || '';
        const errorCode = error.code || '';

        for (const retryableError of this.retryConfig.retryableErrors) {
            if (errorMessage.includes(retryableError) || errorCode === retryableError) {
                return true;
            }
        }

        // Check for specific WhatsApp API errors that are retryable
        if (errorMessage.includes('rate limit') || 
            errorMessage.includes('temporarily unavailable') ||
            errorMessage.includes('service unavailable')) {
            return true;
        }

        return false;
    }

    /**
     * Calculate delay with exponential backoff and jitter
     * @param {number} attempt - Current attempt number (1-based)
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt, baseDelay) {
        // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
        let delay = baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);

        // Cap at maximum delay
        delay = Math.min(delay, this.retryConfig.maxDelay);

        // Add jitter to prevent thundering herd
        if (this.retryConfig.jitter) {
            // Add ±25% jitter
            const jitterRange = delay * 0.25;
            const jitter = (Math.random() - 0.5) * 2 * jitterRange;
            delay = Math.max(0, delay + jitter);
        }

        return Math.round(delay);
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique operation ID
     * @returns {string} Unique operation ID
     */
    generateOperationId() {
        return `wa_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Track retry attempt
     */
    trackRetryAttempt(operationId, data) {
        this.retryAttempts.set(operationId, {
            ...data,
            attempts: [],
            status: 'in_progress'
        });
    }

    /**
     * Update retry attempt with failure data
     */
    updateRetryAttempt(operationId, attempt, error, delay) {
        const retryData = this.retryAttempts.get(operationId);
        if (retryData) {
            retryData.attempts.push({
                attempt,
                error: error.message,
                status: error.status || null,
                timestamp: new Date().toISOString(),
                nextDelayMs: delay
            });
        }
    }

    /**
     * Complete retry attempt (success or final failure)
     */
    completeRetryAttempt(operationId, success, totalAttempts) {
        const retryData = this.retryAttempts.get(operationId);
        if (retryData) {
            retryData.status = success ? 'success' : 'failed';
            retryData.totalAttempts = totalAttempts;
            retryData.endTime = Date.now();
            retryData.duration = retryData.endTime - retryData.startTime;

            // Keep for analysis, will be cleaned up later
            logger.debug('Retry attempt completed', {
                operationId,
                success,
                totalAttempts,
                duration: retryData.duration
            });
        }
    }

    /**
     * Circuit breaker implementation
     */
    isCircuitBreakerOpen(endpoint) {
        if (!endpoint) return false;

        const breakerData = this.circuitBreaker.get(endpoint);
        if (!breakerData) return false;

        const now = Date.now();
        
        // Check if circuit breaker should reset
        if (breakerData.openUntil && now > breakerData.openUntil) {
            this.circuitBreaker.delete(endpoint);
            return false;
        }

        return breakerData.isOpen;
    }

    /**
     * Record successful operation for circuit breaker
     */
    recordSuccess(endpoint) {
        if (!endpoint) return;

        const breakerData = this.circuitBreaker.get(endpoint);
        if (breakerData) {
            breakerData.consecutiveFailures = 0;
            breakerData.isOpen = false;
            breakerData.openUntil = null;
        }
    }

    /**
     * Record failed operation for circuit breaker
     */
    recordFailure(endpoint) {
        if (!endpoint) return;

        const breakerData = this.circuitBreaker.get(endpoint) || {
            consecutiveFailures: 0,
            isOpen: false,
            openUntil: null
        };

        breakerData.consecutiveFailures++;

        // Open circuit breaker after 5 consecutive failures
        if (breakerData.consecutiveFailures >= 5) {
            breakerData.isOpen = true;
            breakerData.openUntil = Date.now() + (5 * 60 * 1000); // 5 minutes

            logger.warn('Circuit breaker opened for endpoint', {
                endpoint,
                consecutiveFailures: breakerData.consecutiveFailures,
                openUntilTimestamp: breakerData.openUntil
            });
        }

        this.circuitBreaker.set(endpoint, breakerData);
    }

    /**
     * Get retry statistics
     */
    getRetryStatistics() {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);

        let totalOperations = 0;
        let successfulOperations = 0;
        let failedOperations = 0;
        let retriedOperations = 0;
        let totalRetryAttempts = 0;
        let totalDuration = 0;

        for (const [operationId, data] of this.retryAttempts.entries()) {
            if (data.startTime > last24Hours) {
                totalOperations++;
                
                if (data.status === 'success') {
                    successfulOperations++;
                } else if (data.status === 'failed') {
                    failedOperations++;
                }

                if (data.attempts && data.attempts.length > 0) {
                    retriedOperations++;
                    totalRetryAttempts += data.attempts.length;
                }

                if (data.duration) {
                    totalDuration += data.duration;
                }
            }
        }

        const circuitBreakerStats = {
            openCircuits: 0,
            totalEndpoints: this.circuitBreaker.size
        };

        for (const [endpoint, data] of this.circuitBreaker.entries()) {
            if (data.isOpen) {
                circuitBreakerStats.openCircuits++;
            }
        }

        return {
            period: '24 hours',
            totalOperations,
            successfulOperations,
            failedOperations,
            retriedOperations,
            totalRetryAttempts,
            successRate: totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0,
            retryRate: totalOperations > 0 ? (retriedOperations / totalOperations) * 100 : 0,
            averageDuration: totalOperations > 0 ? totalDuration / totalOperations : 0,
            circuitBreaker: circuitBreakerStats,
            config: this.retryConfig
        };
    }

    /**
     * Get current retry attempts (for monitoring)
     */
    getCurrentRetryAttempts() {
        const current = [];
        const now = Date.now();

        for (const [operationId, data] of this.retryAttempts.entries()) {
            if (data.status === 'in_progress' || (now - data.startTime) < 300000) { // Last 5 minutes
                current.push({
                    operationId,
                    description: data.description,
                    status: data.status,
                    attempts: data.attempts ? data.attempts.length : 0,
                    duration: data.endTime ? data.endTime - data.startTime : now - data.startTime,
                    context: data.context
                });
            }
        }

        return current.sort((a, b) => b.duration - a.duration);
    }

    /**
     * Setup cleanup timer for old retry data
     */
    setupCleanupTimer() {
        // Clean up old retry attempts every hour
        setInterval(() => {
            const now = Date.now();
            const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
            let cleanedCount = 0;

            for (const [operationId, data] of this.retryAttempts.entries()) {
                if (data.startTime < cutoffTime) {
                    this.retryAttempts.delete(operationId);
                    cleanedCount++;
                }
            }

            // Clean up expired circuit breakers
            for (const [endpoint, data] of this.circuitBreaker.entries()) {
                if (data.openUntil && now > data.openUntil && data.consecutiveFailures === 0) {
                    this.circuitBreaker.delete(endpoint);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.debug('Cleaned up old retry data', {
                    cleanedCount,
                    remainingAttempts: this.retryAttempts.size,
                    circuitBreakers: this.circuitBreaker.size
                });
            }
        }, 60 * 60 * 1000); // 1 hour
    }

    /**
     * Reset circuit breaker for endpoint (manual intervention)
     */
    resetCircuitBreaker(endpoint) {
        this.circuitBreaker.delete(endpoint);
        logger.info('Circuit breaker manually reset', { endpoint });
    }

    /**
     * Reset all retry tracking data (for testing)
     */
    reset() {
        this.retryAttempts.clear();
        this.circuitBreaker.clear();
        logger.info('Retry logic service reset completed');
    }

    /**
     * Health check for monitoring
     */
    healthCheck() {
        const stats = this.getRetryStatistics();
        
        return {
            status: 'healthy',
            retryAttempts: this.retryAttempts.size,
            circuitBreakers: this.circuitBreaker.size,
            openCircuits: stats.circuitBreaker.openCircuits,
            last24hStats: {
                successRate: Math.round(stats.successRate),
                retryRate: Math.round(stats.retryRate),
                totalOperations: stats.totalOperations
            },
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WhatsAppRetryLogicService();