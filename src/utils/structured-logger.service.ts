/**
 * Structured Logger Service
 * High-performance logging with Winston for 10,000+ tenant scale
 * Features: JSON structured logs, multiple transports, performance optimization
 * 
 * @version 3.0.0 (High Scale)
 * @author UBS Team
 */

import winston, { Logger, format } from 'winston';
import path from 'path';

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

export class StructuredLoggerService {
    private logger: Logger;
    private config: LoggerConfig;
    private logCounts: Map<string, number>;
    private startTime: number;

    constructor(serviceName: string, config?: Partial<LoggerConfig>) {
        this.config = {
            level: process.env.LOG_LEVEL || 'info',
            enableConsole: true,
            enableFile: true,
            maxFiles: 10,
            maxSize: '20m',
            format: 'json',
            includeTimestamp: true,
            includeLevel: true,
            includeMetadata: true,
            ...config
        };

        this.logCounts = new Map();
        this.startTime = Date.now();

        this.logger = this.createLogger(serviceName);
        
        // Log service initialization
        this.info('Structured Logger initialized', {
            serviceName,
            config: this.config,
            pid: process.pid,
            nodeVersion: process.version
        });

        // Start periodic stats reporting
        this.startStatsReporting();
    }

    /**
     * Create Winston logger with optimized configuration
     */
    private createLogger(serviceName: string): Logger {
        const transports: winston.transport[] = [];

        // Console transport for development and debugging
        if (this.config.enableConsole) {
            transports.push(new winston.transports.Console({
                format: format.combine(
                    format.timestamp(),
                    format.errors({ stack: true }),
                    this.config.format === 'json' ? 
                        format.json() : 
                        format.printf(({ timestamp, level, message, ...meta }) => {
                            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                            return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
                        })
                )
            }));
        }

        // File transport for persistent logging
        if (this.config.enableFile) {
            // Main application log
            transports.push(new winston.transports.File({
                filename: path.join('logs', `${serviceName}.log`),
                format: format.combine(
                    format.timestamp(),
                    format.errors({ stack: true }),
                    format.json()
                ),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));

            // Error-only log
            transports.push(new winston.transports.File({
                filename: path.join('logs', `${serviceName}-error.log`),
                level: 'error',
                format: format.combine(
                    format.timestamp(),
                    format.errors({ stack: true }),
                    format.json()
                ),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));

            // Performance log for metrics
            transports.push(new winston.transports.File({
                filename: path.join('logs', `${serviceName}-performance.log`),
                format: format.combine(
                    format.timestamp(),
                    format.json(),
                    format((info) => {
                        // Only log entries with performance metrics
                        if (info.duration !== undefined || info.operationType) {
                            return info;
                        }
                        return false;
                    })()
                ),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: 5
            }));
        }

        return winston.createLogger({
            level: this.config.level,
            defaultMeta: {
                service: serviceName,
                environment: process.env.NODE_ENV || 'development',
                hostname: require('os').hostname(),
                pid: process.pid
            },
            transports,
            exitOnError: false,
            handleExceptions: true,
            handleRejections: true
        });
    }

    /**
     * Log error with context
     */
    error(message: string, context?: LogContext, error?: Error): void {
        this.incrementLogCount('error');
        
        const logData: any = {
            message,
            ...context,
            timestamp: new Date().toISOString()
        };

        if (error) {
            logData.error = error.message;
            logData.stack = error.stack;
            logData.errorType = error.constructor.name;
        }

        this.logger.error(logData);
    }

    /**
     * Log warning with context
     */
    warn(message: string, context?: LogContext): void {
        this.incrementLogCount('warn');
        
        this.logger.warn({
            message,
            ...context,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log info with context
     */
    info(message: string, context?: LogContext): void {
        this.incrementLogCount('info');
        
        this.logger.info({
            message,
            ...context,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log debug with context
     */
    debug(message: string, context?: LogContext): void {
        if (this.logger.isDebugEnabled()) {
            this.incrementLogCount('debug');
            
            this.logger.debug({
                message,
                ...context,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Log performance metrics
     */
    performance(operationType: string, duration: number, context?: LogContext): void {
        this.incrementLogCount('performance');
        
        this.logger.info({
            message: `Performance: ${operationType}`,
            operationType,
            duration,
            ...context,
            timestamp: new Date().toISOString(),
            logType: 'performance'
        });
    }

    /**
     * Log tenant-specific operations
     */
    tenant(message: string, tenantId: string, context?: LogContext): void {
        this.info(message, {
            ...context,
            tenantId,
            logType: 'tenant-operation'
        });
    }

    /**
     * Log batch processing operations
     */
    batch(message: string, batchInfo: {
        batchSize: number;
        processed: number;
        success: number;
        failures: number;
        duration: number;
    }, context?: LogContext): void {
        this.performance('batch-processing', batchInfo.duration, {
            message,
            batchSize: batchInfo.batchSize,
            processed: batchInfo.processed,
            successCount: batchInfo.success,
            failures: batchInfo.failures,
            successRate: Math.round((batchInfo.success / batchInfo.processed) * 100),
            ...context,
            logType: 'batch-operation'
        });
    }

    /**
     * Log database operations
     */
    database(operation: string, duration: number, context?: LogContext): void {
        this.performance('database-operation', duration, {
            message: `Database: ${operation}`,
            databaseOperation: operation,
            ...context,
            logType: 'database'
        });
    }

    /**
     * Log cache operations
     */
    cache(operation: 'hit' | 'miss' | 'set' | 'clear', key: string, duration?: number, context?: LogContext): void {
        this.debug(`Cache ${operation}: ${key}`, {
            cacheOperation: operation,
            cacheKey: key,
            duration,
            ...context,
            logType: 'cache'
        });
    }

    /**
     * Log with custom level and context
     */
    log(level: string, message: string, context?: LogContext): void {
        if (this.logger.isLevelEnabled(level)) {
            this.incrementLogCount(level);
            
            this.logger.log(level, {
                message,
                ...context,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Create child logger with default context
     */
    child(defaultContext: LogContext): StructuredLoggerService {
        const childLogger = Object.create(this);
        const originalLogger = this.logger;
        
        childLogger.logger = originalLogger.child(defaultContext);
        return childLogger;
    }

    /**
     * Start timed operation
     */
    startTimer(operationType: string, context?: LogContext): () => void {
        const startTime = Date.now();
        
        this.debug(`Starting: ${operationType}`, {
            operationType,
            ...context,
            logType: 'timer-start'
        });

        return () => {
            const duration = Date.now() - startTime;
            this.performance(operationType, duration, context);
        };
    }

    /**
     * Log system resource usage
     */
    systemResources(): void {
        const usage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.debug('System resources', {
            memory: {
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(usage.external / 1024 / 1024) + 'MB',
                rss: Math.round(usage.rss / 1024 / 1024) + 'MB'
            },
            cpu: {
                user: Math.round(cpuUsage.user / 1000) + 'ms',
                system: Math.round(cpuUsage.system / 1000) + 'ms'
            },
            uptime: Math.round(process.uptime()) + 's',
            logType: 'system-resources'
        });
    }

    /**
     * Get logging statistics
     */
    getStats(): {
        totalLogs: number;
        logsByLevel: { [key: string]: number };
        uptime: number;
        averageLogsPerSecond: number;
    } {
        const totalLogs = Array.from(this.logCounts.values()).reduce((sum, count) => sum + count, 0);
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const averageLogsPerSecond = uptime > 0 ? Math.round(totalLogs / uptime) : 0;

        return {
            totalLogs,
            logsByLevel: Object.fromEntries(this.logCounts.entries()),
            uptime,
            averageLogsPerSecond
        };
    }

    /**
     * Set log level dynamically
     */
    setLevel(level: string): void {
        this.logger.level = level;
        this.config.level = level;
        
        this.info('Log level changed', {
            newLevel: level,
            previousLevel: this.config.level
        });
    }

    /**
     * Flush all pending log writes
     */
    async flush(): Promise<void> {
        return new Promise((resolve) => {
            if (this.logger.transports) {
                let pendingFlushes = 0;
                
                this.logger.transports.forEach((transport: any) => {
                    if (transport.flush) {
                        pendingFlushes++;
                        transport.flush(() => {
                            pendingFlushes--;
                            if (pendingFlushes === 0) {
                                resolve();
                            }
                        });
                    }
                });
                
                if (pendingFlushes === 0) {
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }

    /**
     * Close logger and cleanup resources
     */
    async close(): Promise<void> {
        await this.flush();
        this.logger.close();
        
        console.log('Structured Logger closed successfully');
    }

    // Private helper methods
    private incrementLogCount(level: string): void {
        const current = this.logCounts.get(level) || 0;
        this.logCounts.set(level, current + 1);
    }

    private parseSize(sizeStr: string): number {
        const size = parseInt(sizeStr);
        const unit = sizeStr.slice(-1).toLowerCase();
        
        switch (unit) {
            case 'k': return size * 1024;
            case 'm': return size * 1024 * 1024;
            case 'g': return size * 1024 * 1024 * 1024;
            default: return size;
        }
    }

    private startStatsReporting(): void {
        // Report stats every 5 minutes
        setInterval(() => {
            const stats = this.getStats();
            this.info('Logger statistics', {
                ...stats,
                logType: 'logger-stats'
            });
        }, 5 * 60 * 1000);

        // Report system resources every 2 minutes
        setInterval(() => {
            this.systemResources();
        }, 2 * 60 * 1000);
    }
}