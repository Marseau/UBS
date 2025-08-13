import { SupabaseClient } from '@supabase/supabase-js';
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
export declare class DatabasePoolManagerService {
    private logger;
    private config;
    private connections;
    private waitingQueue;
    private stats;
    private isInitialized;
    private healthCheckInterval?;
    private reapInterval?;
    private supabaseUrl;
    private supabaseKey;
    constructor(logger: Logger, config?: Partial<PoolConfig>);
    initialize(): Promise<void>;
    acquire(): Promise<SupabaseClient>;
    release(client: SupabaseClient): Promise<void>;
    withConnection<T>(operation: (client: SupabaseClient) => Promise<T>): Promise<T>;
    withBatch<T, R>(items: T[], operation: (client: SupabaseClient, item: T) => Promise<R>, batchSize?: number): Promise<R[]>;
    getStats(): PoolStats;
    healthCheck(): Promise<{
        healthy: boolean;
        totalConnections: number;
        activeConnections: number;
        averageResponseTime?: number;
        errors: string[];
    }>;
    close(): Promise<void>;
    private createConnection;
    private destroyConnection;
    private getAvailableConnection;
    private findConnectionByClient;
    private markConnectionInUse;
    private markConnectionIdle;
    private waitForConnection;
    private startConnectionReaper;
    private reapIdleConnections;
    private startHealthMonitoring;
    private updateStats;
    private updateAcquireTime;
    private updateQueryTime;
    private generateConnectionId;
}
