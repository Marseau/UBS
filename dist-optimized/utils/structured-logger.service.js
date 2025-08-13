"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuredLoggerService = void 0;
const winston_1 = __importStar(require("winston"));
const path_1 = __importDefault(require("path"));
class StructuredLoggerService {
    constructor(serviceName, config) {
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
        this.info('Structured Logger initialized', {
            serviceName,
            config: this.config,
            pid: process.pid,
            nodeVersion: process.version
        });
        this.startStatsReporting();
    }
    createLogger(serviceName) {
        const transports = [];
        if (this.config.enableConsole) {
            transports.push(new winston_1.default.transports.Console({
                format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.errors({ stack: true }), this.config.format === 'json' ?
                    winston_1.format.json() :
                    winston_1.format.printf(({ timestamp, level, message, ...meta }) => {
                        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                        return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
                    }))
            }));
        }
        if (this.config.enableFile) {
            transports.push(new winston_1.default.transports.File({
                filename: path_1.default.join('logs', `${serviceName}.log`),
                format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.errors({ stack: true }), winston_1.format.json()),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));
            transports.push(new winston_1.default.transports.File({
                filename: path_1.default.join('logs', `${serviceName}-error.log`),
                level: 'error',
                format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.errors({ stack: true }), winston_1.format.json()),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));
            transports.push(new winston_1.default.transports.File({
                filename: path_1.default.join('logs', `${serviceName}-performance.log`),
                format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.json(), (0, winston_1.format)((info) => {
                    if (info.duration !== undefined || info.operationType) {
                        return info;
                    }
                    return false;
                })()),
                maxsize: this.parseSize(this.config.maxSize),
                maxFiles: 5
            }));
        }
        return winston_1.default.createLogger({
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
    error(message, context, error) {
        this.incrementLogCount('error');
        const logData = {
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
    warn(message, context) {
        this.incrementLogCount('warn');
        this.logger.warn({
            message,
            ...context,
            timestamp: new Date().toISOString()
        });
    }
    info(message, context) {
        this.incrementLogCount('info');
        this.logger.info({
            message,
            ...context,
            timestamp: new Date().toISOString()
        });
    }
    debug(message, context) {
        if (this.logger.isDebugEnabled()) {
            this.incrementLogCount('debug');
            this.logger.debug({
                message,
                ...context,
                timestamp: new Date().toISOString()
            });
        }
    }
    performance(operationType, duration, context) {
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
    tenant(message, tenantId, context) {
        this.info(message, {
            ...context,
            tenantId,
            logType: 'tenant-operation'
        });
    }
    batch(message, batchInfo, context) {
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
    database(operation, duration, context) {
        this.performance('database-operation', duration, {
            message: `Database: ${operation}`,
            databaseOperation: operation,
            ...context,
            logType: 'database'
        });
    }
    cache(operation, key, duration, context) {
        this.debug(`Cache ${operation}: ${key}`, {
            cacheOperation: operation,
            cacheKey: key,
            duration,
            ...context,
            logType: 'cache'
        });
    }
    log(level, message, context) {
        if (this.logger.isLevelEnabled(level)) {
            this.incrementLogCount(level);
            this.logger.log(level, {
                message,
                ...context,
                timestamp: new Date().toISOString()
            });
        }
    }
    child(defaultContext) {
        const childLogger = Object.create(this);
        const originalLogger = this.logger;
        childLogger.logger = originalLogger.child(defaultContext);
        return childLogger;
    }
    startTimer(operationType, context) {
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
    systemResources() {
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
    getStats() {
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
    setLevel(level) {
        this.logger.level = level;
        this.config.level = level;
        this.info('Log level changed', {
            newLevel: level,
            previousLevel: this.config.level
        });
    }
    async flush() {
        return new Promise((resolve) => {
            if (this.logger.transports) {
                let pendingFlushes = 0;
                this.logger.transports.forEach((transport) => {
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
            }
            else {
                resolve();
            }
        });
    }
    async close() {
        await this.flush();
        this.logger.close();
        console.log('Structured Logger closed successfully');
    }
    incrementLogCount(level) {
        const current = this.logCounts.get(level) || 0;
        this.logCounts.set(level, current + 1);
    }
    parseSize(sizeStr) {
        const size = parseInt(sizeStr);
        const unit = sizeStr.slice(-1).toLowerCase();
        switch (unit) {
            case 'k': return size * 1024;
            case 'm': return size * 1024 * 1024;
            case 'g': return size * 1024 * 1024 * 1024;
            default: return size;
        }
    }
    startStatsReporting() {
        setInterval(() => {
            const stats = this.getStats();
            this.info('Logger statistics', {
                ...stats,
                logType: 'logger-stats'
            });
        }, 5 * 60 * 1000);
        setInterval(() => {
            this.systemResources();
        }, 2 * 60 * 1000);
    }
}
exports.StructuredLoggerService = StructuredLoggerService;
//# sourceMappingURL=structured-logger.service.js.map