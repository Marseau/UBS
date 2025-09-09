/**
 * Intent Monitoring Routes
 * 
 * Endpoints para monitoramento de falhas em cascata nas camadas de detecção de intent
 */

import { Router } from 'express';
import { intentCascadeMonitor } from '../services/intent-cascade-monitor.service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Lazy initialization to prevent environment variable issues
let supabaseClient: any = null;
function getSupabaseClient() {
  if (!supabaseClient) {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string;
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('⚠️ [INTENT-MONITORING] Supabase credentials not available');
      return null;
    }
    
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * GET /api/intent-monitoring/health
 * Health check do sistema de monitoramento
 */
router.get('/health', async (req, res) => {
  try {
    const healthCheck = await intentCascadeMonitor.healthCheck();
    
    res.status(healthCheck.healthy ? 200 : 503).json({
      success: healthCheck.healthy,
      message: healthCheck.healthy 
        ? '✅ Intent monitoring system healthy' 
        : '⚠️ Intent monitoring system has issues',
      data: healthCheck.stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [INTENT-MONITORING] Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal error in monitoring health check',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intent-monitoring/stats/:tenantId
 * Estatísticas de monitoramento para um tenant específico
 */
router.get('/stats/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    if (!tenantId) {
      res.status(400).json({
        success: false,
        message: 'Tenant ID é obrigatório'
      });
      return;
    }

    const stats = await intentCascadeMonitor.getMonitoringStats(tenantId);
    
    if (!stats) {
      res.status(200).json({
        success: true,
        message: 'Nenhum dado de monitoramento encontrado para este tenant',
        data: null
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Estatísticas de monitoramento recuperadas com sucesso',
      data: {
        tenantId,
        timeWindow: '5 minutes',
        metrics: {
          totalMessages: stats.totalMessages,
          regexFailures: stats.regexFailures,
          llmFailures: stats.llmFailures,
          fallbackUsage: stats.fallbackUsage,
          overallFailureRate: `${(stats.failureRate * 100).toFixed(1)}%`,
          severityLevel: stats.severityLevel
        },
        performance: {
          regexFailureRate: `${((stats.regexFailures / stats.totalMessages) * 100).toFixed(1)}%`,
          llmFailureRate: `${((stats.llmFailures / stats.totalMessages) * 100).toFixed(1)}%`,
          fallbackUsageRate: `${((stats.fallbackUsage / stats.totalMessages) * 100).toFixed(1)}%`
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [INTENT-MONITORING] Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar estatísticas',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intent-monitoring/alerts
 * Lista alertas ativos do sistema
 */
router.get('/alerts', async (req, res) => {
  try {
    const { 
      tenantId, 
      severity, 
      status = 'active', 
      limit = '50',
      page = '1'
    } = req.query;

    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
      return;
    }

    let query = supabase
      .from('system_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtros opcionais
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    if (severity) {
      query = query.eq('severity_level', severity);
    }
    
    if (status) {
      query = query.eq('status', status);
    }

    // Paginação
    const limitNum = parseInt(limit as string);
    const pageNum = parseInt(page as string);
    const offset = (pageNum - 1) * limitNum;
    
    query = query.range(offset, offset + limitNum - 1);

    const { data: alerts, error } = await query;

    if (error) {
      console.error('❌ [INTENT-MONITORING] Database error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar alertas',
        error: error.message
      });
      return;
    }

    // Contar total para paginação
    let countQuery = supabase
      .from('system_alerts')
      .select('id', { count: 'exact', head: true });
    
    if (tenantId) countQuery = countQuery.eq('tenant_id', tenantId);
    if (severity) countQuery = countQuery.eq('severity_level', severity);
    if (status) countQuery = countQuery.eq('status', status);
    
    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('❌ [INTENT-MONITORING] Count error:', countError);
    }

    res.status(200).json({
      success: true,
      message: `${alerts?.length || 0} alertas encontrados`,
      data: {
        alerts: alerts || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum)
        },
        filters: {
          tenantId,
          severity,
          status
        }
      }
    });

  } catch (error) {
    console.error('❌ [INTENT-MONITORING] Alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar alertas',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/intent-monitoring/alerts/:alertId/resolve
 * Marca um alerta como resolvido
 */
router.put('/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolvedBy, resolutionNotes } = req.body;

    if (!alertId) {
      res.status(400).json({
        success: false,
        message: 'Alert ID é obrigatório'
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
      return;
    }

    const { data, error } = await supabase
      .from('system_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy || 'system',
        resolution_notes: resolutionNotes || 'Marked as resolved via API'
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      console.error('❌ [INTENT-MONITORING] Resolve error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao resolver alerta',
        error: error.message
      });
      return;
    }

    if (!data) {
      res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
      return;
    }

    console.log(`✅ [INTENT-MONITORING] Alert resolved: ${alertId} by ${resolvedBy || 'system'}`);

    res.status(200).json({
      success: true,
      message: 'Alerta marcado como resolvido',
      data: {
        alert: data,
        resolvedAt: data.resolved_at,
        resolvedBy: data.resolved_by
      }
    });

  } catch (error) {
    console.error('❌ [INTENT-MONITORING] Resolve error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao resolver alerta',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intent-monitoring/dashboard
 * Dashboard com métricas agregadas do sistema
 */
router.get('/dashboard', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
      return;
    }

    // Buscar alertas ativos por severidade
    const { data: alertsByStatus, error: statusError } = await supabase
      .from('system_alerts')
      .select('severity_level, status')
      .eq('alert_type', 'intent_cascade_failure')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // últimas 24h

    if (statusError) {
      console.error('❌ [INTENT-MONITORING] Dashboard query error:', statusError);
    }

    // Agregações
    const alertsData = alertsByStatus || [];
    const activeAlerts = alertsData.filter((a: any) => a.status === 'active');
    const criticalAlerts = activeAlerts.filter((a: any) => a.severity_level === 'critical');
    const highAlerts = activeAlerts.filter((a: any) => a.severity_level === 'high');
    const mediumAlerts = activeAlerts.filter((a: any) => a.severity_level === 'medium');

    // Health check do monitor
    const healthCheck = await intentCascadeMonitor.healthCheck();

    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        overview: {
          systemHealthy: healthCheck.healthy,
          monitoredTenants: healthCheck.stats.monitoredTenants || 0,
          totalFailures: healthCheck.stats.totalFailures || 0,
          criticalTenants: healthCheck.stats.criticalTenants || 0
        },
        alerts: {
          active: activeAlerts.length,
          critical: criticalAlerts.length,
          high: highAlerts.length,
          medium: mediumAlerts.length,
          total: alertsData.length
        },
        performance: {
          memoryUsage: healthCheck.stats.memoryUsage || '0 KB'
        },
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [INTENT-MONITORING] Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no dashboard',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;