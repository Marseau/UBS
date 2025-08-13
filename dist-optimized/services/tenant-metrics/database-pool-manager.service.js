"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabasePoolManagerService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class DatabasePoolManagerService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = {
            minConnections: 5,
            maxConnections: 50,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000,
            reapIntervalMillis: 10000,
            createRetryIntervalMillis: 1000,
            createTimeoutMillis: 10000,
            destroyTimeoutMillis: 5000,
            ...config
        };
        this.connections = new Map();
        this.waitingQueue = [];
        this.isInitialized = false;
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            pendingRequests: 0,
            successfulConnections: 0,
            failedConnections: 0,
            averageAcquireTime: 0,
            averageQueryTime: 0
        };
        this.supabaseUrl = process.env.SUPABASE_URL || '';
        this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (!this.supabaseUrl || !this.supabaseKey) {
            throw new Error('Missing required Supabase configuration');
        }
        this.logger.info('Database Pool Manager initialized', {
            config: this.config,
            supabaseUrl: this.supabaseUrl.substring(0, 20) + '...'
        });
    }
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('Database pool already initialized');
            return;
        }
        try {
            this.logger.info('Initializing database connection pool', {
                minConnections: this.config.minConnections,
                maxConnections: this.config.maxConnections
            });
            const initialConnections = Math.min(this.config.minConnections, 10);
            const connectionPromises = [];
            for (let i = 0; i < initialConnections; i++) {
                connectionPromises.push(this.createConnection());
            }
            await Promise.allSettled(connectionPromises);
            this.startConnectionReaper();
            this.startHealthMonitoring();
            this.isInitialized = true;
            this.updateStats();
            this.logger.info('Database pool initialized successfully', {
                initialConnections: this.connections.size,
                stats: this.stats
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize database pool', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async acquire() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        try {
            const connection = this.getAvailableConnection();
            if (connection) {
                this.markConnectionInUse(connection);
                this.updateAcquireTime(Date.now() - startTime);
                return connection.client;
            }
            if (this.connections.size < this.config.maxConnections) {
                const newConnection = await this.createConnection();
                this.markConnectionInUse(newConnection);
                this.updateAcquireTime(Date.now() - startTime);
                return newConnection.client;
            }
            return await this.waitForConnection(startTime);
        }
        catch (error) {
            this.stats.failedConnections++;
            this.logger.error('Failed to acquire database connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                poolSize: this.connections.size,
                pendingRequests: this.waitingQueue.length
            });
            throw error;
        }
    }
    async release(client) {
        try {
            const connection = this.findConnectionByClient(client);
            if (!connection) {
                this.logger.warn('Attempted to release unknown connection');
                return;
            }
            this.markConnectionIdle(connection);
            if (this.waitingQueue.length > 0) {
                const waiter = this.waitingQueue.shift();
                if (waiter) {
                    this.markConnectionInUse(connection);
                    waiter.resolve(connection.client);
                    this.updateAcquireTime(Date.now() - waiter.timestamp);
                }
            }
            this.updateStats();
        }
        catch (error) {
            this.logger.error('Error releasing connection', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async withConnection(operation) {
        const startTime = Date.now();
        let client = null;
        try {
            client = await this.acquire();
            const result = await operation(client);
            this.updateQueryTime(Date.now() - startTime);
            return result;
        }
        finally {
            if (client) {
                await this.release(client);
            }
        }
    }
    async withBatch(items, operation, batchSize = 10) {
        const results = [];
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchPromises = batch.map(item => this.withConnection(client => operation(client, item)));
            const batchResults = await Promise.allSettled(batchPromises);
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
                else {
                    this.logger.error('Batch operation failed', {
                        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
                    });
                    throw result.reason;
                }
            }
        }
        return results;
    }
    getStats() {
        this.updateStats();
        return { ...this.stats };
    }
    async healthCheck() {
        const errors = [];
        const startTime = Date.now();
        try {
            const testResult = await this.withConnection(async (client) => {
                const { data, error } = await client.from('tenants').select('id').limit(1);
                if (error)
                    throw error;
                return data;
            });
            const responseTime = Date.now() - startTime;
            const stats = this.getStats();
            const healthy = stats.totalConnections > 0 &&
                responseTime < 5000 &&
                errors.length === 0;
            return {
                healthy,
                totalConnections: stats.totalConnections,
                activeConnections: stats.activeConnections,
                averageResponseTime: responseTime,
                errors
            };
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown error');
            return {
                healthy: false,
                totalConnections: this.stats.totalConnections,
                activeConnections: this.stats.activeConnections,
                errors
            };
        }
    }
    async close() {
        this.logger.info('Closing database connection pool', {
            totalConnections: this.connections.size
        });
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.reapInterval) {
            clearInterval(this.reapInterval);
        }
        this.waitingQueue.forEach(waiter => {
            waiter.reject(new Error('Connection pool is shutting down'));
        });
        this.waitingQueue.length = 0;
        const closePromises = Array.from(this.connections.values()).map(conn => this.destroyConnection(conn));
        await Promise.allSettled(closePromises);
        this.connections.clear();
        this.isInitialized = false;
        this.logger.info('Database connection pool closed successfully');
    }
    async createConnection() {
        const connectionId = this.generateConnectionId();
        try {
            const client = (0, supabase_js_1.createClient)(this.supabaseUrl, this.supabaseKey, {
                db: {
                    schema: 'public'
                },
                auth: {
                    persistSession: false
                },
                global: {
                    headers: {
                        'x-connection-id': connectionId
                    }
                }
            });
            const { error } = await client.from('tenants').select('id').limit(1);
            if (error && !error.message.includes('relation') && !error.message.includes('permission')) {
                throw error;
            }
            const connection = {
                client,
                id: connectionId,
                created: Date.now(),
                lastUsed: Date.now(),
                inUse: false,
                queryCount: 0
            };
            this.connections.set(connectionId, connection);
            this.stats.successfulConnections++;
            this.logger.debug('Database connection created', {
                connectionId,
                totalConnections: this.connections.size
            });
            return connection;
        }
        catch (error) {
            this.stats.failedConnections++;
            this.logger.error('Failed to create database connection', {
                connectionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async destroyConnection(connection) {
        try {
            this.connections.delete(connection.id);
            this.logger.debug('Database connection destroyed', {
                connectionId: connection.id,
                lifespan: Date.now() - connection.created,
                queryCount: connection.queryCount
            });
        }
        catch (error) {
            this.logger.error('Error destroying connection', {
                connectionId: connection.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    getAvailableConnection() {
        for (const connection of this.connections.values()) {
            if (!connection.inUse) {
                return connection;
            }
        }
        return null;
    }
    findConnectionByClient(client) {
        for (const connection of this.connections.values()) {
            if (connection.client === client) {
                return connection;
            }
        }
        return null;
    }
    markConnectionInUse(connection) {
        connection.inUse = true;
        connection.lastUsed = Date.now();
        connection.queryCount++;
    }
    markConnectionIdle(connection) {
        connection.inUse = false;
        connection.lastUsed = Date.now();
    }
    async waitForConnection(startTime) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.waitingQueue.findIndex(w => w.resolve === resolve);
                if (index !== -1) {
                    this.waitingQueue.splice(index, 1);
                }
                reject(new Error('Connection acquire timeout'));
            }, this.config.acquireTimeoutMillis);
            this.waitingQueue.push({
                resolve: (client) => {
                    clearTimeout(timeout);
                    resolve(client);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
                timestamp: startTime
            });
            this.stats.pendingRequests = this.waitingQueue.length;
        });
    }
    startConnectionReaper() {
        this.reapInterval = setInterval(() => {
            this.reapIdleConnections();
        }, this.config.reapIntervalMillis);
    }
    reapIdleConnections() {
        const now = Date.now();
        const connectionsToReap = [];
        for (const connection of this.connections.values()) {
            const idleTime = now - connection.lastUsed;
            if (!connection.inUse &&
                idleTime > this.config.idleTimeoutMillis &&
                this.connections.size > this.config.minConnections) {
                connectionsToReap.push(connection);
            }
        }
        connectionsToReap.forEach(conn => {
            this.destroyConnection(conn);
        });
        if (connectionsToReap.length > 0) {
            this.logger.debug('Reaped idle connections', {
                reaped: connectionsToReap.length,
                remaining: this.connections.size
            });
        }
    }
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.healthCheck();
                const stats = this.getStats();
                this.logger.info('Database pool health check', {
                    ...health,
                    ...stats
                });
                if (stats.totalConnections < this.config.minConnections) {
                    const needed = this.config.minConnections - stats.totalConnections;
                    for (let i = 0; i < needed; i++) {
                        try {
                            await this.createConnection();
                        }
                        catch (error) {
                            this.logger.warn('Failed to create connection during health check', {
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        }
                    }
                }
            }
            catch (error) {
                this.logger.error('Health check failed', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 30000);
    }
    updateStats() {
        let active = 0;
        let idle = 0;
        for (const connection of this.connections.values()) {
            if (connection.inUse) {
                active++;
            }
            else {
                idle++;
            }
        }
        this.stats.totalConnections = this.connections.size;
        this.stats.activeConnections = active;
        this.stats.idleConnections = idle;
        this.stats.pendingRequests = this.waitingQueue.length;
    }
    updateAcquireTime(time) {
        this.stats.averageAcquireTime =
            (this.stats.averageAcquireTime * 0.9) + (time * 0.1);
    }
    updateQueryTime(time) {
        this.stats.averageQueryTime =
            (this.stats.averageQueryTime * 0.9) + (time * 0.1);
    }
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.DatabasePoolManagerService = DatabasePoolManagerService;
//# sourceMappingURL=database-pool-manager.service.js.map