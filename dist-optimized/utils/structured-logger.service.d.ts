export interface LogContext {
    tenantId?: string;
    userId?: string;
    requestId?: string;
    operationType?: string;
    duration?: number;
    batchSize?: number;
    success?: boolean;
    error?: string;
    [key: string]: any;
}
export interface LoggerConfig {
    level: string;
    enableConsole: boolean;
    enableFile: boolean;
    maxFiles: number;
    maxSize: string;
    format: 'json' | 'simple';
    includeTimestamp: boolean;
    includeLevel: boolean;
    includeMetadata: boolean;
}
export declare class StructuredLoggerService {
    private logger;
    private config;
    private logCounts;
    private startTime;
    constructor(serviceName: string, config?: Partial<LoggerConfig>);
    private createLogger;
    error(message: string, context?: LogContext, error?: Error): void;
    warn(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    performance(operationType: string, duration: number, context?: LogContext): void;
    tenant(message: string, tenantId: string, context?: LogContext): void;
    batch(message: string, batchInfo: {
        batchSize: number;
        processed: number;
        success: number;
        failures: number;
        duration: number;
    }, context?: LogContext): void;
    database(operation: string, duration: number, context?: LogContext): void;
    cache(operation: 'hit' | 'miss' | 'set' | 'clear', key: string, duration?: number, context?: LogContext): void;
    log(level: string, message: string, context?: LogContext): void;
    child(defaultContext: LogContext): StructuredLoggerService;
    startTimer(operationType: string, context?: LogContext): () => void;
    systemResources(): void;
    getStats(): {
        totalLogs: number;
        logsByLevel: {
            [key: string]: number;
        };
        uptime: number;
        averageLogsPerSecond: number;
    };
    setLevel(level: string): void;
    flush(): Promise<void>;
    close(): Promise<void>;
    private incrementLogCount;
    private parseSize;
    private startStatsReporting;
}
