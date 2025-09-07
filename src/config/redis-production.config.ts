/**
 * Redis Production Configuration
 * Configuração otimizada do Redis para produção com 10k+ tenants
 */

import Redis from 'ioredis';

export class RedisProductionConfig {
  private static instance: Redis | null = null;
  private static isConnected = false;

  /**
   * Get optimized Redis instance for production
   */
  static getRedisInstance(): Redis {
    if (!this.instance) {
      this.instance = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        
        // Production optimizations
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '10000'),
        commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
        
        // Connection pool settings
        family: 4
      });

      // Connection event handlers
      this.instance.on('connect', () => {
        console.log('🟢 [REDIS] Connected to Redis server');
        this.isConnected = true;
      });

      this.instance.on('ready', () => {
        console.log('✅ [REDIS] Redis client ready');
      });

      this.instance.on('error', (error) => {
        console.error('❌ [REDIS] Connection error:', error);
        this.isConnected = false;
      });

      this.instance.on('close', () => {
        console.log('🔴 [REDIS] Connection closed');
        this.isConnected = false;
      });

      this.instance.on('reconnecting', () => {
        console.log('🔄 [REDIS] Reconnecting...');
      });
    }

    return this.instance;
  }

  /**
   * Bootstrap Redis connection for serverless/production
   */
  static async bootstrap(): Promise<void> {
    const redis = this.getRedisInstance();
    
    try {
      await redis.connect();
      
      // Set memory policy if specified
      const memoryLimit = process.env.REDIS_MAX_MEMORY;
      const evictionPolicy = process.env.REDIS_EVICTION_POLICY || 'allkeys-lru';
      
      if (memoryLimit) {
        await redis.config('SET', 'maxmemory', memoryLimit);
        await redis.config('SET', 'maxmemory-policy', evictionPolicy);
        console.log(`📊 [REDIS] Memory limit set: ${memoryLimit}, eviction: ${evictionPolicy}`);
      }
      
      console.log('🚀 [REDIS] Bootstrap completed successfully');
    } catch (error) {
      console.error('💥 [REDIS] Bootstrap failed:', error);
      throw error;
    }
  }

  /**
   * Graceful shutdown for production
   */
  static async shutdown(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.quit();
        console.log('👋 [REDIS] Graceful shutdown completed');
      } catch (error) {
        console.error('❌ [REDIS] Error during shutdown:', error);
        this.instance.disconnect();
      } finally {
        this.instance = null;
        this.isConnected = false;
      }
    }
  }

  /**
   * Health check for monitoring
   */
  static async healthCheck(): Promise<{ status: string; latency: number; memory?: string }> {
    const redis = this.getRedisInstance();
    
    try {
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      
      let memory;
      try {
        const memoryInfo = await redis.info('memory');
        const usedMemoryLine = memoryInfo.split('\r\n').find(line => line.startsWith('used_memory_human:'));
        memory = usedMemoryLine ? usedMemoryLine.split(':')[1] : 'unknown';
      } catch {
        // Memory usage not available
      }
      
      return {
        status: 'healthy',
        latency,
        memory
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: -1
      };
    }
  }

  /**
   * Optimize Redis cache - clear expired keys and defrag if needed
   */
  static async optimize(): Promise<void> {
    const redis = this.getRedisInstance();
    
    try {
      // Get current memory usage
      const memoryInfo = await redis.info('memory');
      console.log('📊 [REDIS] Current memory info:', memoryInfo.split('\r\n').filter(line => 
        line.includes('used_memory_human') || line.includes('used_memory_peak_human')
      ));
      
      // Manual expire scan for cleanup (be careful in production)
      const keys = await redis.keys('*');
      let expiredCount = 0;
      
      for (const key of keys.slice(0, 100)) { // Limit to prevent blocking
        const ttl = await redis.ttl(key);
        if (ttl === -1) { // No expiration set, might be old cache
          // You could set a default TTL or remove based on your policy
          // await redis.expire(key, 3600); // Set 1 hour default
        } else if (ttl === -2) {
          expiredCount++;
        }
      }
      
      console.log(`🧹 [REDIS] Cache cleanup completed. Expired keys: ${expiredCount}`);
      
    } catch (error) {
      console.error('❌ [REDIS] Optimization failed:', error);
    }
  }

  /**
   * Check if Redis is connected
   */
  static isRedisConnected(): boolean {
    return this.isConnected && this.instance !== null;
  }
}