"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConcurrencyManagerService = void 0;
class ConcurrencyManagerService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = {
            maxConcurrency: this.calculateOptimalConcurrency(),
            batchSize: 50,
            queueTimeout: 30000,
            circuitBreakerThreshold: 10,
            adaptiveBatching: true,
            retryAttempts: 3,
            retryDelay: 1000,
            ...config
        };
        this.stats = {
            totalProcessed: 0,
            successCount: 0,
            failureCount: 0,
            averageProcessingTime: 0,
            currentConcurrency: 0,
            queueSize: 0,
            circuitBreakerOpen: false
        };
        this.activePromises = new Set();
        this.processingQueue = [];
        this.circuitBreakerFailures = 0;
        this.lastCircuitBreakerReset = Date.now();
        this.processingTimes = [];
        this.logger.info('Concurrency Manager initialized', {
            config: this.config,
            optimalConcurrency: this.config.maxConcurrency
        });
        this.startMonitoring();
    }
    async processWithConcurrency(items, processor, options) {
        const startTime = Date.now();
        const effectiveConfig = { ...this.config, ...options };
        this.logger.info('Starting batch processing', {
            itemCount: items.length,
            maxConcurrency: effectiveConfig.maxConcurrency,
            batchSize: effectiveConfig.batchSize
        });
        if (this.stats.circuitBreakerOpen) {
            throw new Error('Circuit breaker is open, processing temporarily disabled');
        }
        const results = {
            successes: [],
            failures: [],
            processingTime: 0,
            batchSize: items.length
        };
        try {
            const optimalBatchSize = this.calculateOptimalBatchSize(items.length);
            const batches = this.createBatches(items, optimalBatchSize);
            this.logger.debug('Processing strategy', {
                totalItems: items.length,
                batchCount: batches.length,
                optimalBatchSize,
                estimatedDuration: `${Math.round(batches.length * this.stats.averageProcessingTime / effectiveConfig.maxConcurrency / 1000)}s`
            });
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                if (!batch)
                    continue;
                const batchPromises = batch.map(item => this.processItemWithRetry(item, processor, effectiveConfig.retryAttempts, effectiveConfig.retryDelay));
                const batchResults = await this.executeBatchWithLimit(batchPromises, effectiveConfig.maxConcurrency);
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.successes.push(result.value);
                        this.stats.successCount++;
                    }
                    else {
                        results.failures.push({
                            item: batch?.[index] || null,
                            error: result.reason
                        });
                        this.stats.failureCount++;
                        this.circuitBreakerFailures++;
                    }
                });
                if (this.shouldOpenCircuitBreaker()) {
                    this.openCircuitBreaker();
                    break;
                }
                const processed = (i + 1) * (batch?.length || 0);
                const progress = Math.round((processed / items.length) * 100);
                this.logger.debug('Batch processing progress', {
                    batchIndex: i + 1,
                    batchSize: batch?.length || 0,
                    processed,
                    total: items.length,
                    progress: `${progress}%`,
                    successRate: `${Math.round((this.stats.successCount / (this.stats.successCount + this.stats.failureCount)) * 100)}%`
                });
            }
            results.processingTime = Date.now() - startTime;
            this.stats.totalProcessed += items.length;
            this.updateProcessingTime(results.processingTime);
            this.logger.info('Batch processing completed', {
                totalItems: items.length,
                successes: results.successes.length,
                failures: results.failures.length,
                processingTime: `${results.processingTime}ms`,
                successRate: `${Math.round((results.successes.length / items.length) * 100)}%`
            });
            return results;
        }
        catch (error) {
            this.logger.error('Error in batch processing', {
                error: error instanceof Error ? error.message : 'Unknown error',
                itemCount: items.length,
                processingTime: Date.now() - startTime
            });
            results.processingTime = Date.now() - startTime;
            throw error;
        }
    }
    async processItemWithRetry(item, processor, maxRetries, retryDelay) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                const result = await processor(item);
                const processingTime = Date.now() - startTime;
                this.updateProcessingTime(processingTime);
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (attempt < maxRetries) {
                    const delay = retryDelay * Math.pow(2, attempt - 1);
                    this.logger.warn('Processing attempt failed, retrying', {
                        attempt,
                        maxRetries,
                        delay: `${delay}ms`,
                        error: lastError.message
                    });
                    await this.sleep(delay);
                }
                else {
                    this.logger.error('All retry attempts failed', {
                        maxRetries,
                        error: lastError.message
                    });
                }
            }
        }
        throw lastError || new Error('Processing failed');
    }
    async executeBatchWithLimit(promises, maxConcurrency) {
        const results = [];
        for (let i = 0; i < promises.length; i += maxConcurrency) {
            const batch = promises.slice(i, i + maxConcurrency);
            this.stats.currentConcurrency = Math.min(batch.length, maxConcurrency);
            const batchResults = await Promise.allSettled(batch);
            results.push(...batchResults);
            if (i + maxConcurrency < promises.length) {
                await this.sleep(10);
            }
        }
        this.stats.currentConcurrency = 0;
        return results;
    }
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    calculateOptimalConcurrency() {
        const cpuCount = require('os').cpus().length;
        const memoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
        const baseConcurrency = Math.max(cpuCount * 2, 4);
        const memoryFactor = Math.min(Math.floor(memoryGB / 2), 20);
        const optimal = Math.min(baseConcurrency + memoryFactor, 50);
        this.logger.info('Calculated optimal concurrency', {
            cpuCount,
            memoryGB: Math.round(memoryGB),
            baseConcurrency,
            memoryFactor,
            optimal
        });
        return optimal;
    }
    calculateOptimalBatchSize(totalItems) {
        if (!this.config.adaptiveBatching) {
            return this.config.batchSize;
        }
        const averageTime = this.stats.averageProcessingTime || 1000;
        const successRate = this.stats.successCount / (this.stats.successCount + this.stats.failureCount + 1);
        let batchSize = this.config.batchSize;
        if (averageTime > 5000 || successRate < 0.9) {
            batchSize = Math.max(Math.floor(batchSize * 0.7), 10);
        }
        else if (averageTime < 2000 && successRate > 0.95) {
            batchSize = Math.min(Math.floor(batchSize * 1.3), 100);
        }
        batchSize = Math.min(batchSize, totalItems);
        this.logger.debug('Calculated optimal batch size', {
            originalBatchSize: this.config.batchSize,
            adaptiveBatchSize: batchSize,
            averageTime: `${averageTime}ms`,
            successRate: `${Math.round(successRate * 100)}%`,
            totalItems
        });
        return batchSize;
    }
    shouldOpenCircuitBreaker() {
        const recentFailures = this.circuitBreakerFailures;
        const timeSinceLastReset = Date.now() - this.lastCircuitBreakerReset;
        if (timeSinceLastReset > 5 * 60 * 1000) {
            this.circuitBreakerFailures = 0;
            this.lastCircuitBreakerReset = Date.now();
            return false;
        }
        return recentFailures >= this.config.circuitBreakerThreshold;
    }
    openCircuitBreaker() {
        this.stats.circuitBreakerOpen = true;
        this.logger.error('Circuit breaker opened due to high failure rate', {
            failures: this.circuitBreakerFailures,
            threshold: this.config.circuitBreakerThreshold,
            cooldownPeriod: '5 minutes'
        });
        setTimeout(() => {
            this.stats.circuitBreakerOpen = false;
            this.circuitBreakerFailures = 0;
            this.lastCircuitBreakerReset = Date.now();
            this.logger.info('Circuit breaker closed, processing resumed');
        }, 5 * 60 * 1000);
    }
    updateProcessingTime(time) {
        this.processingTimes.push(time);
        if (this.processingTimes.length > 100) {
            this.processingTimes.shift();
        }
        this.stats.averageProcessingTime =
            this.processingTimes.reduce((sum, t) => sum + t, 0) / this.processingTimes.length;
    }
    getStats() {
        return { ...this.stats };
    }
    startMonitoring() {
        setInterval(() => {
            const stats = this.getStats();
            this.logger.info('Concurrency Manager Stats', {
                ...stats,
                configuredMaxConcurrency: this.config.maxConcurrency,
                configuredBatchSize: this.config.batchSize
            });
            this.optimizeConfiguration();
        }, 2 * 60 * 1000);
    }
    optimizeConfiguration() {
        const stats = this.getStats();
        if (stats.averageProcessingTime < 1000 && stats.currentConcurrency === this.config.maxConcurrency) {
            this.config.maxConcurrency = Math.min(this.config.maxConcurrency + 5, 100);
            this.logger.info('Increased max concurrency for better utilization', {
                newMaxConcurrency: this.config.maxConcurrency
            });
        }
        if (stats.averageProcessingTime > 10000 && this.config.maxConcurrency > 10) {
            this.config.maxConcurrency = Math.max(this.config.maxConcurrency - 5, 10);
            this.logger.info('Decreased max concurrency due to high processing times', {
                newMaxConcurrency: this.config.maxConcurrency
            });
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    resetStats() {
        this.stats = {
            totalProcessed: 0,
            successCount: 0,
            failureCount: 0,
            averageProcessingTime: 0,
            currentConcurrency: 0,
            queueSize: 0,
            circuitBreakerOpen: false
        };
        this.processingTimes = [];
        this.circuitBreakerFailures = 0;
        this.lastCircuitBreakerReset = Date.now();
        this.logger.info('Concurrency Manager stats reset');
    }
}
exports.ConcurrencyManagerService = ConcurrencyManagerService;
//# sourceMappingURL=concurrency-manager.service.js.map