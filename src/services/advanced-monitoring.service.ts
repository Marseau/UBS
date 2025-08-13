/**
 * ADVANCED MONITORING SERVICE
 * 
 * Sistema avançado de monitoramento para o ambiente de produção
 * - Alertas para falhas críticas
 * - Dashboard de performance em tempo real
 * - Métricas de health check automáticas
 * - Monitoramento de recursos (CPU, memória, Redis)
 * - Alertas para degradação de performance
 */

import { getAdminClient } from "../config/database";
import type { Database } from "../types/database.types";

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    memory: ComponentHealth;
    cpu: ComponentHealth;
    cron_jobs: ComponentHealth;
  };
  metrics: {
    response_time_avg: number;
    error_rate: number;
    throughput: number;
    uptime: number;
  };
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'down';
  response_time?: number;
  details?: string;
  last_check: string;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: string;
  resolved?: boolean;
  resolved_at?: string;
}

export class AdvancedMonitoringService {
  private client = getAdminClient();
  private alerts: Alert[] = [];
  private healthHistory: SystemHealth[] = [];
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;

  /**
   * Inicializar sistema de monitoramento
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Advanced Monitoring Service...');
    
    try {
      // Configurar intervalos de monitoramento
      await this.startPerformanceMonitoring();
      await this.startResourceMonitoring();
      await this.startHealthChecks();
      
      this.isRunning = true;
      console.log('✅ Advanced Monitoring Service initialized successfully');
      console.log('📊 Performance metrics collection active');
      console.log('🔔 Alerting system enabled');
      console.log('💚 Health checks running every 60 seconds');
      
    } catch (error) {
      console.error('❌ Failed to initialize monitoring service:', error);
      throw error;
    }
  }

  /**
   * Monitoramento de performance em tempo real
   */
  private async startPerformanceMonitoring(): Promise<void> {
    // Coletar métricas a cada 30 segundos
    setInterval(async () => {
      try {
        const health = await this.collectSystemHealth();
        this.healthHistory.push(health);
        
        // Manter apenas últimas 100 entradas (50 minutos de histórico)
        if (this.healthHistory.length > 100) {
          this.healthHistory = this.healthHistory.slice(-100);
        }
        
        // Verificar se precisa gerar alertas
        await this.checkForAlerts(health);
        
      } catch (error) {
        console.error('❌ Error collecting performance metrics:', error);
        await this.generateAlert('critical', 'monitoring', 'Failed to collect performance metrics');
      }
    }, 30000);
  }

  /**
   * Monitoramento de recursos do sistema
   */
  private async startResourceMonitoring(): Promise<void> {
    setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Verificar uso de memória (alerta se > 500MB RSS)
        if (memoryUsage.rss > 500 * 1024 * 1024) {
          await this.generateAlert('warning', 'memory', 
            `High memory usage: ${(memoryUsage.rss / 1024 / 1024).toFixed(0)}MB RSS`);
        }
        
        // Verificar uso de memória crítico (alerta se > 1GB RSS)
        if (memoryUsage.rss > 1024 * 1024 * 1024) {
          await this.generateAlert('critical', 'memory', 
            `Critical memory usage: ${(memoryUsage.rss / 1024 / 1024).toFixed(0)}MB RSS`);
        }
        
      } catch (error) {
        console.error('❌ Error monitoring resources:', error);
      }
    }, 60000); // A cada minuto
  }

  /**
   * Health checks automáticos
   */
  private async startHealthChecks(): Promise<void> {
    setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        console.error('❌ Error performing health checks:', error);
        await this.generateAlert('critical', 'health-checks', 'Health check system failed');
      }
    }, 60000); // A cada minuto
  }

  /**
   * Coletar métricas de saúde do sistema
   */
  private async collectSystemHealth(): Promise<SystemHealth> {
    const timestamp = new Date().toISOString();
    
    // Health checks para cada componente
    const database = await this.checkDatabaseHealth();
    const redis = await this.checkRedisHealth();
    const memory = await this.checkMemoryHealth();
    const cpu = await this.checkCpuHealth();
    const cronJobs = await this.checkCronJobsHealth();
    
    // Métricas gerais de performance
    const metrics = await this.calculatePerformanceMetrics();
    
    // Status geral do sistema
    const componentStatuses = [database.status, redis.status, memory.status, cpu.status, cronJobs.status];
    const overallStatus = componentStatuses.includes('critical') ? 'critical' :
                         componentStatuses.includes('degraded') ? 'degraded' : 'healthy';
    
    return {
      status: overallStatus,
      timestamp,
      components: {
        database,
        redis,
        memory,
        cpu,
        cron_jobs: cronJobs
      },
      metrics
    };
  }

  /**
   * Verificar saúde do banco de dados
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const start = Date.now();
    
    try {
      // Teste de conectividade simples
      const { data, error } = await this.client
        .from('tenants')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - start;
      
      if (error) {
        return {
          status: 'critical',
          response_time: responseTime,
          details: `Database error: ${error.message}`,
          last_check: new Date().toISOString()
        };
      }
      
      // Avaliar performance
      const status = responseTime > 2000 ? 'degraded' : 
                    responseTime > 5000 ? 'critical' : 'healthy';
      
      return {
        status,
        response_time: responseTime,
        details: `Query completed in ${responseTime}ms`,
        last_check: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'critical',
        response_time: Date.now() - start,
        details: `Database connection failed: ${error}`,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Verificar saúde do Redis/Cache
   */
  private async checkRedisHealth(): Promise<ComponentHealth> {
    const start = Date.now();
    
    try {
      // Como não temos Redis configurado, assumir como degraded por padrão
      const responseTime = Date.now() - start;
      
      return {
        status: 'degraded',
        response_time: responseTime,
        details: 'Redis not configured - using fallback caching',
        last_check: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'critical',
        response_time: Date.now() - start,
        details: `Cache system error: ${error}`,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Verificar uso de memória
   */
  private async checkMemoryHealth(): Promise<ComponentHealth> {
    const memoryUsage = process.memoryUsage();
    const rssGB = memoryUsage.rss / 1024 / 1024 / 1024;
    
    const status = rssGB > 1 ? 'critical' : 
                  rssGB > 0.5 ? 'degraded' : 'healthy';
    
    return {
      status,
      details: `RSS: ${rssGB.toFixed(2)}GB, Heap: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`,
      last_check: new Date().toISOString()
    };
  }

  /**
   * Verificar uso de CPU
   */
  private async checkCpuHealth(): Promise<ComponentHealth> {
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Converter para segundos
    
    const status = cpuPercent > 80 ? 'critical' : 
                  cpuPercent > 50 ? 'degraded' : 'healthy';
    
    return {
      status,
      details: `CPU usage estimation: ${cpuPercent.toFixed(1)}%`,
      last_check: new Date().toISOString()
    };
  }

  /**
   * Verificar saúde dos cron jobs
   */
  private async checkCronJobsHealth(): Promise<ComponentHealth> {
    try {
      // Verificar se o serviço global de cron está ativo
      const cronService = (global as any).tenantMetricsCronService;
      
      if (!cronService) {
        return {
          status: 'critical',
          details: 'Optimized cron service not initialized',
          last_check: new Date().toISOString()
        };
      }
      
      // Obter estatísticas do serviço
      const stats = cronService.getServiceStats();
      
      const status = stats.errors > 5 ? 'critical' : 
                    stats.errors > 2 ? 'degraded' : 'healthy';
      
      return {
        status,
        details: `Success rate: ${stats.successRate}%, Errors: ${stats.errors}, Processed: ${stats.totalTenantsProcessed}`,
        last_check: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'critical',
        details: `Cron jobs health check failed: ${error}`,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Calcular métricas de performance
   */
  private async calculatePerformanceMetrics(): Promise<SystemHealth['metrics']> {
    const uptime = process.uptime();
    
    // Métricas baseadas no histórico
    const recentHealth = this.healthHistory.slice(-10); // Últimas 10 entradas
    
    const avgResponseTime = recentHealth.length > 0 ? 
      recentHealth.reduce((sum, h) => sum + (h.components.database.response_time || 0), 0) / recentHealth.length : 0;
    
    const errorRate = recentHealth.length > 0 ?
      recentHealth.filter(h => h.status === 'critical').length / recentHealth.length * 100 : 0;
    
    const throughput = recentHealth.length > 0 ? 
      recentHealth.reduce((sum, h) => sum + (h.metrics?.throughput || 0), 0) / recentHealth.length : 0;
    
    return {
      response_time_avg: Math.round(avgResponseTime),
      error_rate: Math.round(errorRate * 100) / 100,
      throughput: Math.round(throughput),
      uptime: Math.round(uptime)
    };
  }

  /**
   * Verificar se deve gerar alertas
   */
  private async checkForAlerts(health: SystemHealth): Promise<void> {
    // Alert para status crítico do sistema
    if (health.status === 'critical') {
      await this.generateAlert('critical', 'system', 'System in critical state');
    }
    
    // Alert para componentes específicos
    for (const [component, componentHealth] of Object.entries(health.components)) {
      if (componentHealth.status === 'critical') {
        await this.generateAlert('critical', component, 
          `Component ${component} is critical: ${componentHealth.details}`);
      }
    }
    
    // Alert para métricas degradadas
    if (health.metrics.response_time_avg > 2000) {
      await this.generateAlert('warning', 'performance', 
        `High response time: ${health.metrics.response_time_avg}ms average`);
    }
    
    if (health.metrics.error_rate > 5) {
      await this.generateAlert('warning', 'reliability', 
        `High error rate: ${health.metrics.error_rate}%`);
    }
  }

  /**
   * Gerar alerta
   */
  private async generateAlert(level: Alert['level'], component: string, message: string): Promise<void> {
    // Evitar spam - verificar se já existe alerta similar nos últimos 5 minutos
    const recentAlerts = this.alerts.filter(alert => 
      alert.component === component && 
      alert.message === message &&
      !alert.resolved &&
      new Date().getTime() - new Date(alert.timestamp).getTime() < 5 * 60 * 1000
    );
    
    if (recentAlerts.length > 0) {
      return; // Alert duplicado
    }
    
    const alert: Alert = {
      id: `${Date.now()}-${component}-${level}`,
      level,
      component,
      message,
      timestamp: new Date().toISOString(),
      resolved: false
    };
    
    this.alerts.push(alert);
    
    // Log do alerta
    const levelEmoji = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${levelEmoji} [${level.toUpperCase()}] ${component}: ${message}`);
    
    // Manter apenas últimos 100 alertas
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Realizar health checks completos
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const health = await this.collectSystemHealth();
      
      // Log status geral periodicamente
      if (health.status !== 'healthy') {
        console.log(`🔍 [MONITORING] System status: ${health.status}`);
        console.log(`   Database: ${health.components.database.status} (${health.components.database.response_time}ms)`);
        console.log(`   Memory: ${health.components.memory.status} (${health.components.memory.details})`);
        console.log(`   Cron Jobs: ${health.components.cron_jobs.status}`);
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  /**
   * Obter status atual do sistema
   */
  async getSystemStatus(): Promise<SystemHealth> {
    return await this.collectSystemHealth();
  }

  /**
   * Obter alertas ativos
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Obter histórico de saúde
   */
  getHealthHistory(limit: number = 50): SystemHealth[] {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Resolver alerta
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolved_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Obter métricas de performance agregadas
   */
  getPerformanceMetrics(): {
    current: SystemHealth['metrics'];
    trend: 'improving' | 'stable' | 'degrading';
    uptime_formatted: string;
  } {
    const currentHealth = this.healthHistory[this.healthHistory.length - 1];
    if (!currentHealth) {
      return {
        current: { response_time_avg: 0, error_rate: 0, throughput: 0, uptime: 0 },
        trend: 'stable',
        uptime_formatted: '0s'
      };
    }
    
    // Calcular tendência baseada nas últimas 10 entradas
    const recent = this.healthHistory.slice(-10);
    const older = this.healthHistory.slice(-20, -10);
    
    const recentAvg = recent.length > 0 ? 
      recent.reduce((sum, h) => sum + h.metrics.response_time_avg, 0) / recent.length : 0;
    const olderAvg = older.length > 0 ? 
      older.reduce((sum, h) => sum + h.metrics.response_time_avg, 0) / older.length : recentAvg;
    
    const trend = recentAvg < olderAvg * 0.9 ? 'improving' : 
                  recentAvg > olderAvg * 1.1 ? 'degrading' : 'stable';
    
    // Formatar uptime
    const uptimeSeconds = currentHealth.metrics.uptime;
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted = `${hours}h ${minutes}m`;
    
    return {
      current: currentHealth.metrics,
      trend,
      uptime_formatted: uptimeFormatted
    };
  }

  /**
   * Parar monitoramento
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    console.log('✅ Advanced Monitoring Service shut down');
  }
}

export default AdvancedMonitoringService;