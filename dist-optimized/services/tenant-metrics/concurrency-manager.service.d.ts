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
    failures: Array<{
        item: any;
        error: Error;
    }>;
    processingTime: number;
    batchSize: number;
}
export declare class ConcurrencyManagerService {
    private logger;
    private config;
    private stats;
    private activePromises;
    private processingQueue;
    private circuitBreakerFailures;
    private lastCircuitBreakerReset;
    private processingTimes;
    constructor(logger: Logger, config?: Partial<ConcurrencyConfig>);
    processWithConcurrency<T, R>(items: T[], processor: (item: T) => Promise<R>, options?: Partial<ConcurrencyConfig>): Promise<BatchResult<R>>;
    private processItemWithRetry;
    private executeBatchWithLimit;
    private createBatches;
    private calculateOptimalConcurrency;
    private calculateOptimalBatchSize;
    private shouldOpenCircuitBreaker;
    private openCircuitBreaker;
    private updateProcessingTime;
    getStats(): ProcessingStats;
    private startMonitoring;
    private optimizeConfiguration;
    private sleep;
    resetStats(): void;
}
