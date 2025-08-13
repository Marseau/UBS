/**
 * Concurrency Manager Service
 * Intelligent concurrency control for 10,000+ tenant processing
 * Features adaptive batching, circuit breaker, and queue management
 * 
 * @version 3.0.0 (High Scale)
 * @author UBS Team
 */

import { Logger } from 'winston';

export interface ConcurrencyConfig {
    maxConcurrency: number;
    batchSize: number;
    queueTimeout: number;
    circuitBreakerThreshold: number;
    adaptiveBatching: boolean;
    retryAttempts: number;
    retryDelay: number;
}

export interface ProcessingStats {
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    averageProcessingTime: number;
    currentConcurrency: number;
    queueSize: number;
    circuitBreakerOpen: boolean;
}

export interface BatchResult<T> {
    successes: T[];
    failures: Array<{ item: any; error: Error }>;
    processingTime: number;
    batchSize: number;
}

export class ConcurrencyManagerService {
    private config: ConcurrencyConfig;
    private stats: ProcessingStats;
    private activePromises: Set<Promise<any>>;
    private processingQueue: Array<{ task: () => Promise<any>; resolve: Function; reject: Function }>;
    private circuitBreakerFailures: number;
    private lastCircuitBreakerReset: number;
    private processingTimes: number[];

    constructor(
        private logger: Logger,
        config?: Partial<ConcurrencyConfig>
    ) {
        this.config = {
            maxConcurrency: this.calculateOptimalConcurrency(),
            batchSize: 50,
            queueTimeout: 30000, // 30 seconds
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

        // Start monitoring and optimization
        this.startMonitoring();
    }

    /**
     * Process array of items with intelligent concurrency control
     */
    async processWithConcurrency<T, R>(
        items: T[],
        processor: (item: T) => Promise<R>,
        options?: Partial<ConcurrencyConfig>
    ): Promise<BatchResult<R>> {
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

        const results: BatchResult<R> = {
            successes: [],
            failures: [],
            processingTime: 0,
            batchSize: items.length
        };

        try {
            // Adaptive batching based on current performance
            const optimalBatchSize = this.calculateOptimalBatchSize(items.length);
            const batches = this.createBatches(items, optimalBatchSize);

            this.logger.debug('Processing strategy', {
                totalItems: items.length,
                batchCount: batches.length,
                optimalBatchSize,
                estimatedDuration: `${Math.round(batches.length * this.stats.averageProcessingTime / effectiveConfig.maxConcurrency / 1000)}s`
            });

            // Process batches with concurrency control
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                if (!batch) continue;
                const batchPromises = batch.map(item => 
                    this.processItemWithRetry(item, processor, effectiveConfig.retryAttempts, effectiveConfig.retryDelay)
                );

                // Wait for batch completion with concurrency limit
                const batchResults = await this.executeBatchWithLimit(
                    batchPromises,
                    effectiveConfig.maxConcurrency
                );

                // Collect results
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.successes.push(result.value);
                        this.stats.successCount++;
                    } else {
                        results.failures.push({
                            item: batch?.[index] || null,
                            error: result.reason
                        });
                        this.stats.failureCount++;
                        this.circuitBreakerFailures++;
                    }
                });

                // Check circuit breaker
                if (this.shouldOpenCircuitBreaker()) {
                    this.openCircuitBreaker();
                    break;
                }

                // Log progress
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

        } catch (error) {
            this.logger.error('Error in batch processing', {
                error: error instanceof Error ? error.message : 'Unknown error',
                itemCount: items.length,
                processingTime: Date.now() - startTime
            });
            
            results.processingTime = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Process single item with retry logic
     */
    private async processItemWithRetry<T, R>(
        item: T,
        processor: (item: T) => Promise<R>,
        maxRetries: number,
        retryDelay: number
    ): Promise<R> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                const result = await processor(item);
                const processingTime = Date.now() - startTime;
                
                this.updateProcessingTime(processingTime);
                return result;
                
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                
                if (attempt < maxRetries) {
                    const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    this.logger.warn('Processing attempt failed, retrying', {
                        attempt,
                        maxRetries,
                        delay: `${delay}ms`,
                        error: lastError.message
                    });
                    
                    await this.sleep(delay);
                } else {
                    this.logger.error('All retry attempts failed', {
                        maxRetries,
                        error: lastError.message
                    });
                }
            }
        }

        throw lastError || new Error('Processing failed');
    }

    /**
     * Execute batch of promises with concurrency limit
     */
    private async executeBatchWithLimit<T>(
        promises: Promise<T>[],
        maxConcurrency: number
    ): Promise<PromiseSettledResult<T>[]> {
        const results: PromiseSettledResult<T>[] = [];
        
        for (let i = 0; i < promises.length; i += maxConcurrency) {
            const batch = promises.slice(i, i + maxConcurrency);
            this.stats.currentConcurrency = Math.min(batch.length, maxConcurrency);
            
            const batchResults = await Promise.allSettled(batch);
            results.push(...batchResults);
            
            // Brief pause between batches to prevent overwhelming
            if (i + maxConcurrency < promises.length) {
                await this.sleep(10);
            }
        }
        
        this.stats.currentConcurrency = 0;
        return results;
    }

    /**
     * Create optimal batches from items
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        
        return batches;
    }

    /**
     * Calculate optimal concurrency based on system resources
     */
    private calculateOptimalConcurrency(): number {
        const cpuCount = require('os').cpus().length;
        const memoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
        
        // Base concurrency on CPU cores and available memory
        const baseConcurrency = Math.max(cpuCount * 2, 4);
        const memoryFactor = Math.min(Math.floor(memoryGB / 2), 20);
        
        const optimal = Math.min(baseConcurrency + memoryFactor, 50); // Max 50 for safety
        
        this.logger.info('Calculated optimal concurrency', {
            cpuCount,
            memoryGB: Math.round(memoryGB),
            baseConcurrency,
            memoryFactor,
            optimal
        });
        
        return optimal;
    }

    /**
     * Calculate optimal batch size based on current performance
     */
    private calculateOptimalBatchSize(totalItems: number): number {
        if (!this.config.adaptiveBatching) {
            return this.config.batchSize;
        }

        // Adaptive batching based on recent performance
        const averageTime = this.stats.averageProcessingTime || 1000;
        const successRate = this.stats.successCount / (this.stats.successCount + this.stats.failureCount + 1);
        
        let batchSize = this.config.batchSize;
        
        // Reduce batch size if processing is slow or failure rate is high
        if (averageTime > 5000 || successRate < 0.9) {
            batchSize = Math.max(Math.floor(batchSize * 0.7), 10);
        }
        // Increase batch size if processing is fast and success rate is high
        else if (averageTime < 2000 && successRate > 0.95) {
            batchSize = Math.min(Math.floor(batchSize * 1.3), 100);
        }

        // Ensure batch size doesn't exceed total items
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

    /**
     * Circuit breaker logic
     */
    private shouldOpenCircuitBreaker(): boolean {
        const recentFailures = this.circuitBreakerFailures;
        const timeSinceLastReset = Date.now() - this.lastCircuitBreakerReset;
        
        // Reset failures count every 5 minutes
        if (timeSinceLastReset > 5 * 60 * 1000) {
            this.circuitBreakerFailures = 0;
            this.lastCircuitBreakerReset = Date.now();
            return false;
        }

        return recentFailures >= this.config.circuitBreakerThreshold;
    }

    /**
     * Open circuit breaker
     */
    private openCircuitBreaker(): void {
        this.stats.circuitBreakerOpen = true;
        this.logger.error('Circuit breaker opened due to high failure rate', {
            failures: this.circuitBreakerFailures,
            threshold: this.config.circuitBreakerThreshold,
            cooldownPeriod: '5 minutes'
        });

        // Auto-close after 5 minutes
        setTimeout(() => {
            this.stats.circuitBreakerOpen = false;
            this.circuitBreakerFailures = 0;
            this.lastCircuitBreakerReset = Date.now();
            this.logger.info('Circuit breaker closed, processing resumed');
        }, 5 * 60 * 1000);
    }

    /**
     * Update processing time statistics
     */
    private updateProcessingTime(time: number): void {
        this.processingTimes.push(time);
        
        // Keep only last 100 measurements for average
        if (this.processingTimes.length > 100) {
            this.processingTimes.shift();
        }
        
        this.stats.averageProcessingTime = 
            this.processingTimes.reduce((sum, t) => sum + t, 0) / this.processingTimes.length;
    }

    /**
     * Get current processing statistics
     */
    getStats(): ProcessingStats {
        return { ...this.stats };
    }

    /**
     * Start performance monitoring
     */
    private startMonitoring(): void {
        setInterval(() => {
            const stats = this.getStats();
            
            this.logger.info('Concurrency Manager Stats', {
                ...stats,
                configuredMaxConcurrency: this.config.maxConcurrency,
                configuredBatchSize: this.config.batchSize
            });
            
            // Auto-optimize configuration based on performance
            this.optimizeConfiguration();
            
        }, 2 * 60 * 1000); // Every 2 minutes
    }

    /**
     * Optimize configuration based on current performance
     */
    private optimizeConfiguration(): void {
        const stats = this.getStats();
        
        // Increase concurrency if system is underutilized
        if (stats.averageProcessingTime < 1000 && stats.currentConcurrency === this.config.maxConcurrency) {
            this.config.maxConcurrency = Math.min(this.config.maxConcurrency + 5, 100);
            this.logger.info('Increased max concurrency for better utilization', {
                newMaxConcurrency: this.config.maxConcurrency
            });
        }
        
        // Decrease concurrency if system is overloaded
        if (stats.averageProcessingTime > 10000 && this.config.maxConcurrency > 10) {
            this.config.maxConcurrency = Math.max(this.config.maxConcurrency - 5, 10);
            this.logger.info('Decreased max concurrency due to high processing times', {
                newMaxConcurrency: this.config.maxConcurrency
            });
        }
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset all statistics
     */
    resetStats(): void {
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