const { logger } = require('../utils/logger');

/**
 * Rate Limiter Service for Google Calendar API
 * Implements exponential backoff and retry logic according to Google's guidelines
 */
class RateLimiterService {
    constructor() {
        this.requestCounts = new Map(); // Track requests per calendar
        this.quotaLimits = {
            requestsPerSecond: 10,      // Conservative limit
            requestsPerMinute: 600,     // Google's default quota
            requestsPerDay: 1000000     // Google's default daily quota
        };
        this.backoffConfig = {
            baseDelay: 1000,            // 1 second base delay
            maxDelay: 30000,            // 30 seconds max delay
            maxRetries: 5,              // Maximum retry attempts
            jitterFactor: 0.1           // Add randomness to prevent thundering herd
        };
    }

    /**
     * Execute a Google Calendar API operation with exponential backoff
     * @param {Function} operation - The API operation to execute
     * @param {string} calendarId - Calendar identifier for rate tracking
     * @param {object} context - Context for logging and error handling
     * @returns {Promise<any>} - Operation result
     */
    async executeWithBackoff(operation, calendarId = 'primary', context = {}) {
        let attempt = 0;
        let lastError = null;

        while (attempt <= this.backoffConfig.maxRetries) {
            try {
                // Check rate limits before executing
                await this.checkRateLimit(calendarId);

                // Execute the operation
                const result = await operation();
                
                // Track successful request
                this.trackRequest(calendarId, true);
                
                // Log success if this was a retry
                if (attempt > 0) {
                    logger.info(`Google Calendar operation succeeded after ${attempt} retries`, {
                        calendarId,
                        operation: context.operation || 'unknown',
                        attempts: attempt + 1
                    });
                }

                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                // Track failed request
                this.trackRequest(calendarId, false);

                // Log the error attempt
                logger.warn(`Google Calendar operation failed, attempt ${attempt}`, {
                    calendarId,
                    operation: context.operation || 'unknown',
                    error: error.message,
                    errorCode: error.code,
                    attempt,
                    maxRetries: this.backoffConfig.maxRetries
                });

                // Check if we should retry
                if (!this.shouldRetry(error, attempt)) {
                    break;
                }

                // Calculate delay with exponential backoff and jitter
                const delay = this.calculateDelay(attempt);
                
                logger.info(`Backing off for ${delay}ms before retry`, {
                    calendarId,
                    attempt,
                    delay
                });

                await this.sleep(delay);
            }
        }

        // All retries exhausted, throw the last error
        logger.error(`Google Calendar operation failed after ${attempt} attempts`, {
            calendarId,
            operation: context.operation || 'unknown',
            error: lastError.message,
            errorCode: lastError.code,
            totalAttempts: attempt
        });

        throw this.enhanceError(lastError, attempt);
    }

    /**
     * Check if the current request rate is within limits
     * @param {string} calendarId - Calendar identifier
     */
    async checkRateLimit(calendarId) {
        const now = Date.now();
        const requests = this.getRequestHistory(calendarId);
        
        // Clean old request records
        this.cleanOldRequests(requests, now);

        // Check per-second limit
        const recentRequests = requests.filter(req => now - req.timestamp < 1000);
        if (recentRequests.length >= this.quotaLimits.requestsPerSecond) {
            const delay = 1000 - (now - recentRequests[0].timestamp);
            logger.warn(`Rate limit approaching, throttling requests`, {
                calendarId,
                recentRequests: recentRequests.length,
                limit: this.quotaLimits.requestsPerSecond,
                delay
            });
            await this.sleep(delay);
        }

        // Check per-minute limit
        const minuteRequests = requests.filter(req => now - req.timestamp < 60000);
        if (minuteRequests.length >= this.quotaLimits.requestsPerMinute) {
            throw new Error(`Rate limit exceeded: ${minuteRequests.length} requests in the last minute`);
        }
    }

    /**
     * Determine if an error warrants a retry
     * @param {Error} error - The error that occurred
     * @param {number} attempt - Current attempt number
     * @returns {boolean} - Whether to retry
     */
    shouldRetry(error, attempt) {
        // Don't retry if we've exceeded max attempts
        if (attempt > this.backoffConfig.maxRetries) {
            return false;
        }

        // Retry on these error codes
        const retryableCodes = [
            429,    // Too Many Requests
            500,    // Internal Server Error
            502,    // Bad Gateway
            503,    // Service Unavailable
            504,    // Gateway Timeout
            401     // Unauthorized (token might be expired)
        ];

        const errorCode = this.extractErrorCode(error);
        return retryableCodes.includes(errorCode);
    }

    /**
     * Calculate exponential backoff delay with jitter
     * @param {number} attempt - Current attempt number (1-based)
     * @returns {number} - Delay in milliseconds
     */
    calculateDelay(attempt) {
        // Exponential backoff: baseDelay * 2^(attempt-1)
        const exponentialDelay = this.backoffConfig.baseDelay * Math.pow(2, attempt - 1);
        
        // Cap at maximum delay
        const cappedDelay = Math.min(exponentialDelay, this.backoffConfig.maxDelay);
        
        // Add jitter to prevent thundering herd
        const jitter = cappedDelay * this.backoffConfig.jitterFactor * Math.random();
        
        return Math.floor(cappedDelay + jitter);
    }

    /**
     * Track a request for rate limiting purposes
     * @param {string} calendarId - Calendar identifier
     * @param {boolean} success - Whether the request was successful
     */
    trackRequest(calendarId, success) {
        const requests = this.getRequestHistory(calendarId);
        requests.push({
            timestamp: Date.now(),
            success
        });

        // Keep only recent requests (last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentRequests = requests.filter(req => req.timestamp > oneHourAgo);
        this.requestCounts.set(calendarId, recentRequests);
    }

    /**
     * Get request history for a calendar
     * @param {string} calendarId - Calendar identifier
     * @returns {Array} - Array of request records
     */
    getRequestHistory(calendarId) {
        return this.requestCounts.get(calendarId) || [];
    }

    /**
     * Clean old requests from tracking
     * @param {Array} requests - Array of request records
     * @param {number} now - Current timestamp
     */
    cleanOldRequests(requests, now) {
        const oneHourAgo = now - (60 * 60 * 1000);
        const recentRequests = requests.filter(req => req.timestamp > oneHourAgo);
        
        // Update the array in place
        requests.splice(0, requests.length, ...recentRequests);
    }

    /**
     * Extract error code from various error formats
     * @param {Error} error - The error object
     * @returns {number} - HTTP status code
     */
    extractErrorCode(error) {
        if (error.code) return parseInt(error.code);
        if (error.status) return parseInt(error.status);
        if (error.response && error.response.status) return parseInt(error.response.status);
        if (error.message && error.message.includes('429')) return 429;
        if (error.message && error.message.includes('500')) return 500;
        return 0; // Unknown error
    }

    /**
     * Enhance error with retry information
     * @param {Error} error - Original error
     * @param {number} attempts - Number of attempts made
     * @returns {Error} - Enhanced error
     */
    enhanceError(error, attempts) {
        const enhancedError = new Error(
            `Google Calendar API failed after ${attempts} attempts: ${error.message}`
        );
        enhancedError.originalError = error;
        enhancedError.attempts = attempts;
        enhancedError.code = error.code;
        enhancedError.isRateLimitError = this.extractErrorCode(error) === 429;
        return enhancedError;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current rate limit statistics
     * @param {string} calendarId - Calendar identifier
     * @returns {object} - Rate limit statistics
     */
    getRateLimitStats(calendarId) {
        const requests = this.getRequestHistory(calendarId);
        const now = Date.now();
        
        const lastSecond = requests.filter(req => now - req.timestamp < 1000);
        const lastMinute = requests.filter(req => now - req.timestamp < 60000);
        const lastHour = requests.filter(req => now - req.timestamp < 3600000);
        
        return {
            calendarId,
            requestsLastSecond: lastSecond.length,
            requestsLastMinute: lastMinute.length,
            requestsLastHour: lastHour.length,
            successRate: {
                lastMinute: lastMinute.length > 0 ? 
                    lastMinute.filter(req => req.success).length / lastMinute.length : 1,
                lastHour: lastHour.length > 0 ? 
                    lastHour.filter(req => req.success).length / lastHour.length : 1
            },
            quotaUsage: {
                perSecond: (lastSecond.length / this.quotaLimits.requestsPerSecond) * 100,
                perMinute: (lastMinute.length / this.quotaLimits.requestsPerMinute) * 100
            }
        };
    }

    /**
     * Reset rate limiting data (useful for testing)
     */
    reset() {
        this.requestCounts.clear();
        logger.info('Rate limiter reset completed');
    }

    /**
     * Health check for the rate limiter service
     * @returns {object} - Health status and configuration
     */
    healthCheck() {
        return {
            status: 'healthy',
            quotas: this.quotaLimits,
            backoffConfig: this.backoffConfig,
            trackedCalendars: this.requestCounts.size,
            timestamp: new Date().toISOString()
        };
    }
}

// Export singleton instance
module.exports = new RateLimiterService();