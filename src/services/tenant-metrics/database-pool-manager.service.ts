/**
 * Database Pool Manager Service
 * Optimized connection pooling for 10,000+ tenant scale
 * Features: Dynamic pool sizing, health monitoring, connection reuse
 * 
 * @version 3.0.0 (High Scale)
 * @author UBS Team
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger } from 'winston';

export interface PoolConfig {
    minConnections: number;
    maxConnections: number;
    acquireTimeoutMillis: number;
    idleTimeoutMillis: number;
    reapIntervalMillis: number;
    createRetryIntervalMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
}

export interface PoolStats {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    pendingRequests: number;
    successfulConnections: number;
    failedConnections: number;
    averageAcquireTime: number;
    averageQueryTime: number;
}

export interface ConnectionWrapper {
    client: SupabaseClient;
    id: string;
    created: number;
    lastUsed: number;
    inUse: boolean;
    queryCount: number;
}

export class DatabasePoolManagerService {
    private config: PoolConfig;
    private connections: Map<string, ConnectionWrapper>;
    private waitingQueue: Array<{
        resolve: (client: SupabaseClient) => void;
        reject: (error: Error) => void;
        timestamp: number;
    }>;
    private stats: PoolStats;
    private isInitialized: boolean;
    private healthCheckInterval?: NodeJS.Timeout;
    private reapInterval?: NodeJS.Timeout;
    private supabaseUrl: string;
    private supabaseKey: string;

    constructor(
        private logger: Logger,
        config?: Partial<PoolConfig>
    ) {
        this.config = {
            minConnections: 5,
            maxConnections: 50,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000, // 5 minutes
            reapIntervalMillis: 10000,  // 10 seconds
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

    /**
     * Initialize the connection pool
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('Database pool already initialized');
            return;
        }

        try {
            this.logger.info('Initializing database connection pool', {
                minConnections: this.config.minConnections,
                maxConnections: this.config.maxConnections
            });

            // Create initial connections
            const initialConnections = Math.min(this.config.minConnections, 10);
            const connectionPromises: any[] = [];

            for (let i = 0; i < initialConnections; i++) {
                connectionPromises.push(this.createConnection() as any);
            }

            await Promise.allSettled(connectionPromises);

            // Start maintenance routines
            this.startConnectionReaper();
            this.startHealthMonitoring();

            this.isInitialized = true;
            this.updateStats();

            this.logger.info('Database pool initialized successfully', {
                initialConnections: this.connections.size,
                stats: this.stats
            });

        } catch (error) {
            this.logger.error('Failed to initialize database pool', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Acquire a connection from the pool
     */
    async acquire(): Promise<SupabaseClient> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const startTime = Date.now();

        try {
            // Try to get an available connection immediately
            const connection = this.getAvailableConnection();
            if (connection) {
                this.markConnectionInUse(connection);
                this.updateAcquireTime(Date.now() - startTime);
                return connection.client;
            }

            // If we can create more connections, do so
            if (this.connections.size < this.config.maxConnections) {
                const newConnection = await this.createConnection();
                this.markConnectionInUse(newConnection);
                this.updateAcquireTime(Date.now() - startTime);
                return newConnection.client;
            }

            // Wait for an available connection
            return await this.waitForConnection(startTime);

        } catch (error) {
            this.stats.failedConnections++;
            this.logger.error('Failed to acquire database connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                poolSize: this.connections.size,
                pendingRequests: this.waitingQueue.length
            });
            throw error;
        }
    }

    /**
     * Release a connection back to the pool
     */
    async release(client: SupabaseClient): Promise<void> {
        try {
            const connection = this.findConnectionByClient(client);
            
            if (!connection) {
                this.logger.warn('Attempted to release unknown connection');
                return;
            }

            this.markConnectionIdle(connection);

            // Process waiting queue
            if (this.waitingQueue.length > 0) {
                const waiter = this.waitingQueue.shift();
                if (waiter) {
                    this.markConnectionInUse(connection);
                    waiter.resolve(connection.client);
                    this.updateAcquireTime(Date.now() - waiter.timestamp);
                }
            }

            this.updateStats();

        } catch (error) {
            this.logger.error('Error releasing connection', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Execute query with automatic connection management
     */
    async withConnection<T>(
        operation: (client: SupabaseClient) => Promise<T>
    ): Promise<T> {
        const startTime = Date.now();
        let client: SupabaseClient | null = null;

        try {
            client = await this.acquire();
            const result = await operation(client);
            
            this.updateQueryTime(Date.now() - startTime);
            return result;

        } finally {
            if (client) {
                await this.release(client);
            }
        }
    }

    /**
     * Execute batch operations with connection pooling
     */
    async withBatch<T, R>(
        items: T[],
        operation: (client: SupabaseClient, item: T) => Promise<R>,
        batchSize: number = 10
    ): Promise<R[]> {
        const results: R[] = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchPromises = batch.map(item => 
                this.withConnection(client => operation(client, item))
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    this.logger.error('Batch operation failed', {
                        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
                    });
                    throw result.reason;
                }
            }
        }

        return results;
    }

    /**
     * Get pool statistics
     */
    getStats(): PoolStats {
        this.updateStats();
        return { ...this.stats };
    }

    /**
     * Get pool health status
     */
    async healthCheck(): Promise<{
        healthy: boolean;
        totalConnections: number;
        activeConnections: number;
        averageResponseTime?: number;
        errors: string[];
    }> {
        const errors: string[] = [];
        const startTime = Date.now();

        try {
            // Test a simple query with a connection
            const testResult = await this.withConnection(async (client) => {
                const { data, error } = await client.from('tenants').select('id').limit(1);
                if (error) throw error;
                return data;
            });

            const responseTime = Date.now() - startTime;
            const stats = this.getStats();

            const healthy = 
                stats.totalConnections > 0 &&
                responseTime < 5000 &&
                errors.length === 0;

            return {
                healthy,
                totalConnections: stats.totalConnections,
                activeConnections: stats.activeConnections,
                averageResponseTime: responseTime,
                errors
            };

        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown error');
            
            return {
                healthy: false,
                totalConnections: this.stats.totalConnections,
                activeConnections: this.stats.activeConnections,
                errors
            };
        }
    }

    /**
     * Gracefully close all connections
     */
    async close(): Promise<void> {
        this.logger.info('Closing database connection pool', {
            totalConnections: this.connections.size
        });

        // Stop maintenance routines
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.reapInterval) {
            clearInterval(this.reapInterval);
        }

        // Reject all waiting requests
        this.waitingQueue.forEach(waiter => {
            waiter.reject(new Error('Connection pool is shutting down'));
        });
        this.waitingQueue.length = 0;

        // Close all connections
        const closePromises = Array.from(this.connections.values()).map(conn => 
            this.destroyConnection(conn)
        );

        await Promise.allSettled(closePromises);
        this.connections.clear();

        this.isInitialized = false;
        this.logger.info('Database connection pool closed successfully');
    }

    // Private methods
    private async createConnection(): Promise<ConnectionWrapper> {
        const connectionId = this.generateConnectionId();
        
        try {
            const client = createClient(this.supabaseUrl, this.supabaseKey, {
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

            // Test the connection
            const { error } = await client.from('tenants').select('id').limit(1);
            if (error && !error.message.includes('relation') && !error.message.includes('permission')) {
                throw error;
            }

            const connection: ConnectionWrapper = {
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

        } catch (error) {
            this.stats.failedConnections++;
            this.logger.error('Failed to create database connection', {
                connectionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private async destroyConnection(connection: ConnectionWrapper): Promise<void> {
        try {
            this.connections.delete(connection.id);
            
            this.logger.debug('Database connection destroyed', {
                connectionId: connection.id,
                lifespan: Date.now() - connection.created,
                queryCount: connection.queryCount
            });

        } catch (error) {
            this.logger.error('Error destroying connection', {
                connectionId: connection.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private getAvailableConnection(): ConnectionWrapper | null {
        for (const connection of this.connections.values()) {
            if (!connection.inUse) {
                return connection;
            }
        }
        return null;
    }

    private findConnectionByClient(client: SupabaseClient): ConnectionWrapper | null {
        for (const connection of this.connections.values()) {
            if (connection.client === client) {
                return connection;
            }
        }
        return null;
    }

    private markConnectionInUse(connection: ConnectionWrapper): void {
        connection.inUse = true;
        connection.lastUsed = Date.now();
        connection.queryCount++;
    }

    private markConnectionIdle(connection: ConnectionWrapper): void {
        connection.inUse = false;
        connection.lastUsed = Date.now();
    }

    private async waitForConnection(startTime: number): Promise<SupabaseClient> {
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

    private startConnectionReaper(): void {
        this.reapInterval = setInterval(() => {
            this.reapIdleConnections();
        }, this.config.reapIntervalMillis);
    }

    private reapIdleConnections(): void {
        const now = Date.now();
        const connectionsToReap: ConnectionWrapper[] = [];

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

    private startHealthMonitoring(): void {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.healthCheck();
                const stats = this.getStats();

                this.logger.info('Database pool health check', {
                    ...health,
                    ...stats
                });

                // Create new connections if below minimum
                if (stats.totalConnections < this.config.minConnections) {
                    const needed = this.config.minConnections - stats.totalConnections;
                    for (let i = 0; i < needed; i++) {
                        try {
                            await this.createConnection();
                        } catch (error) {
                            this.logger.warn('Failed to create connection during health check', {
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        }
                    }
                }

            } catch (error) {
                this.logger.error('Health check failed', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 30000); // Every 30 seconds
    }

    private updateStats(): void {
        let active = 0;
        let idle = 0;

        for (const connection of this.connections.values()) {
            if (connection.inUse) {
                active++;
            } else {
                idle++;
            }
        }

        this.stats.totalConnections = this.connections.size;
        this.stats.activeConnections = active;
        this.stats.idleConnections = idle;
        this.stats.pendingRequests = this.waitingQueue.length;
    }

    private updateAcquireTime(time: number): void {
        // Simple moving average
        this.stats.averageAcquireTime = 
            (this.stats.averageAcquireTime * 0.9) + (time * 0.1);
    }

    private updateQueryTime(time: number): void {
        // Simple moving average
        this.stats.averageQueryTime = 
            (this.stats.averageQueryTime * 0.9) + (time * 0.1);
    }

    private generateConnectionId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}