/**
 * ADVANCED MONITORING ROUTES
 * 
 * Endpoints para sistema de monitoramento avançado
 * - Status do sistema em tempo real
 * - Alertas ativos e histórico
 * - Métricas de performance
 * - Health checks de componentes
 */

import { Router, Request, Response } from 'express';
import AdvancedMonitoringService from '../services/advanced-monitoring.service';

const router = Router();

// Instância global do serviço de monitoramento
let monitoringService: AdvancedMonitoringService;

/**
 * GET /api/monitoring/status
 * Retorna status atual do sistema
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized',
        status: 'unavailable'
      });
    }

    const systemStatus = await monitoringService.getSystemStatus();

    return res.json({
      success: true,
      data: systemStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting system status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Retorna alertas ativos
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized'
      });
    }

    const activeAlerts = monitoringService.getActiveAlerts();
    const alertCounts = {
      critical: activeAlerts.filter(a => a.level === 'critical').length,
      warning: activeAlerts.filter(a => a.level === 'warning').length,
      info: activeAlerts.filter(a => a.level === 'info').length
    };

    return res.json({
      success: true,
      data: {
        active_alerts: activeAlerts,
        counts: alertCounts,
        total: activeAlerts.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting alerts:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/monitoring/alerts/:id/resolve
 * Resolver um alerta específico
 */
router.post('/alerts/:id/resolve', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized'
      });
    }

    const alertId = req.params.id;
    if (!alertId) {
      return res.status(400).json({
        success: false,
        error: 'Alert ID is required'
      });
    }
    
    const resolved = monitoringService.resolveAlert(alertId);

    if (resolved) {
      return res.json({
        success: true,
        message: 'Alert resolved successfully',
        alert_id: alertId,
        resolved_at: new Date().toISOString()
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
        alert_id: alertId
      });
    }

  } catch (error) {
    console.error('❌ Error resolving alert:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/monitoring/performance
 * Retorna métricas de performance e tendências
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized'
      });
    }

    const performanceMetrics = monitoringService.getPerformanceMetrics();
    const healthHistory = monitoringService.getHealthHistory(20); // Últimos 20 pontos

    return res.json({
      success: true,
      data: {
        current_metrics: performanceMetrics.current,
        trend: performanceMetrics.trend,
        uptime: performanceMetrics.uptime_formatted,
        history: healthHistory.map(h => ({
          timestamp: h.timestamp,
          status: h.status,
          response_time: h.metrics.response_time_avg,
          error_rate: h.metrics.error_rate,
          throughput: h.metrics.throughput
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting performance metrics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get performance metrics',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/monitoring/health
 * Health check endpoint simples para load balancers
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Monitoring service not initialized'
      });
    }

    const systemStatus = await monitoringService.getSystemStatus();
    const activeAlerts = monitoringService.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.level === 'critical');

    const isHealthy = systemStatus.status === 'healthy' && criticalAlerts.length === 0;
    const statusCode = isHealthy ? 200 : (systemStatus.status === 'critical' ? 503 : 200);

    return res.status(statusCode).json({
      status: systemStatus.status,
      healthy: isHealthy,
      uptime: systemStatus.metrics.uptime,
      critical_alerts: criticalAlerts.length,
      response_time_avg: systemStatus.metrics.response_time_avg,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(503).json({
      status: 'error',
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/components
 * Status detalhado de todos os componentes
 */
router.get('/components', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized'
      });
    }

    const systemStatus = await monitoringService.getSystemStatus();

    return res.json({
      success: true,
      data: {
        system_status: systemStatus.status,
        components: systemStatus.components,
        last_check: systemStatus.timestamp,
        summary: {
          healthy: Object.values(systemStatus.components).filter(c => c.status === 'healthy').length,
          degraded: Object.values(systemStatus.components).filter(c => c.status === 'degraded').length,
          critical: Object.values(systemStatus.components).filter(c => c.status === 'critical').length,
          down: Object.values(systemStatus.components).filter(c => c.status === 'down').length,
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting component status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get component status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/monitoring/dashboard
 * Dados consolidados para dashboard de monitoramento
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Monitoring service not initialized'
      });
    }

    const systemStatus = await monitoringService.getSystemStatus();
    const activeAlerts = monitoringService.getActiveAlerts();
    const performanceMetrics = monitoringService.getPerformanceMetrics();
    const healthHistory = monitoringService.getHealthHistory(10);

    const dashboardData = {
      overview: {
        system_status: systemStatus.status,
        uptime: performanceMetrics.uptime_formatted,
        trend: performanceMetrics.trend,
        last_update: systemStatus.timestamp
      },
      alerts: {
        total_active: activeAlerts.length,
        critical: activeAlerts.filter(a => a.level === 'critical').length,
        warning: activeAlerts.filter(a => a.level === 'warning').length,
        info: activeAlerts.filter(a => a.level === 'info').length,
        recent: activeAlerts.slice(-5) // 5 alertas mais recentes
      },
      performance: {
        response_time_avg: performanceMetrics.current.response_time_avg,
        error_rate: performanceMetrics.current.error_rate,
        throughput: performanceMetrics.current.throughput,
        trend: performanceMetrics.trend
      },
      components: systemStatus.components,
      history: healthHistory.slice(-10).map(h => ({
        timestamp: h.timestamp,
        status: h.status,
        response_time: h.metrics.response_time_avg
      }))
    };

    return res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting dashboard data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/monitoring/initialize
 * Inicializar sistema de monitoramento (admin only)
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    if (monitoringService) {
      return res.json({
        success: true,
        message: 'Monitoring service already initialized',
        status: 'running'
      });
    }

    monitoringService = new AdvancedMonitoringService();
    await monitoringService.initialize();

    // Armazenar globalmente para acesso por outros serviços
    (global as any).advancedMonitoringService = monitoringService;

    return res.json({
      success: true,
      message: 'Advanced monitoring service initialized successfully',
      features: [
        'Real-time performance monitoring',
        'Automated alerting system',
        'Component health checks',
        'Resource monitoring',
        'Performance trend analysis'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error initializing monitoring service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initialize monitoring service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Middleware para carregar serviço de monitoramento se já existir
router.use((req: Request, res: Response, next) => {
  if (!monitoringService && (global as any).advancedMonitoringService) {
    monitoringService = (global as any).advancedMonitoringService;
  }
  next();
});

export default router;