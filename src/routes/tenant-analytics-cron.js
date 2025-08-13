const express = require('express');
const router = express.Router();
const { tenantAnalyticsCronService } = require('../services/tenant-analytics-cron.service');
const { AdminAuthMiddleware } = require('../middleware/admin-auth');

// Criar instância do middleware de autenticação
const authMiddleware = new AdminAuthMiddleware();

// ================================================================================
// FASE 6: APIs para Gerenciar Cron Jobs do Tenant Analytics
// ================================================================================

// 1. GET /api/tenant-analytics-cron/status
// ================================================================================
// Verificar status dos cron jobs
router.get('/status', authMiddleware.verifyToken, async (req, res) => {
    try {
        const status = tenantAnalyticsCronService.getStatus();
        
        res.json({
            success: true,
            status: status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro ao obter status dos cron jobs:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter status dos cron jobs'
        });
    }
});

// 2. POST /api/tenant-analytics-cron/execute/:jobName
// ================================================================================
// Executar job específico manualmente
router.post('/execute/:jobName', authMiddleware.verifyToken, async (req, res) => {
    try {
        const { jobName } = req.params;
        
        console.log(`🔧 Execução manual solicitada para job: ${jobName}`);
        
        // Validar nome do job
        const validJobs = ['daily-metrics', 'hourly-health', 'weekly-cleanup'];
        if (!validJobs.includes(jobName)) {
            return res.status(400).json({
                success: false,
                error: `Job inválido. Jobs disponíveis: ${validJobs.join(', ')}`
            });
        }
        
        // Executar job
        await tenantAnalyticsCronService.forceExecution(jobName);
        
        res.json({
            success: true,
            message: `Job ${jobName} executado com sucesso`,
            executedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro ao executar job:', error);
        res.status(500).json({
            success: false,
            error: `Erro ao executar job: ${error.message}`
        });
    }
});

// 3. POST /api/tenant-analytics-cron/calculate-today
// ================================================================================
// Calcular métricas para hoje (atalho conveniente)
router.post('/calculate-today', authMiddleware.verifyToken, async (req, res) => {
    try {
        console.log('📊 Calculando métricas para hoje...');
        
        await tenantAnalyticsCronService.forceExecution('daily-metrics');
        
        res.json({
            success: true,
            message: 'Métricas de hoje calculadas com sucesso',
            calculatedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro ao calcular métricas de hoje:', error);
        res.status(500).json({
            success: false,
            error: `Erro ao calcular métricas: ${error.message}`
        });
    }
});

// 4. GET /api/tenant-analytics-cron/health
// ================================================================================
// Health check dos cron jobs
router.get('/health', authMiddleware.verifyToken, async (req, res) => {
    try {
        const status = tenantAnalyticsCronService.getStatus();
        
        // Verificar se há execuções recentes
        const lastExecution = status.lastExecution ? new Date(status.lastExecution) : null;
        const now = new Date();
        const hoursSinceLastExecution = lastExecution ? 
            (now - lastExecution) / (1000 * 60 * 60) : null;
        
        // Determinar health status
        let healthStatus = 'healthy';
        let warnings = [];
        
        if (!lastExecution) {
            healthStatus = 'warning';
            warnings.push('Nenhuma execução registrada ainda');
        } else if (hoursSinceLastExecution > 48) {
            healthStatus = 'unhealthy';
            warnings.push(`Última execução há ${Math.floor(hoursSinceLastExecution)} horas`);
        }
        
        if (status.executionStats.failedRuns > 0) {
            const failureRate = (status.executionStats.failedRuns / status.executionStats.totalRuns) * 100;
            if (failureRate > 10) {
                healthStatus = 'warning';
                warnings.push(`Taxa de falha: ${failureRate.toFixed(1)}%`);
            }
        }
        
        res.json({
            success: true,
            health: {
                status: healthStatus,
                activeJobs: status.activeJobs.length,
                lastExecution: status.lastExecution,
                hoursSinceLastExecution: hoursSinceLastExecution ? Math.floor(hoursSinceLastExecution) : null,
                executionStats: status.executionStats,
                warnings: warnings
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.status(500).json({
            success: false,
            health: { status: 'error' },
            error: error.message
        });
    }
});

// 5. GET /api/tenant-analytics-cron/schedule
// ================================================================================
// Obter informações de agendamento
router.get('/schedule', authMiddleware.verifyToken, async (req, res) => {
    try {
        const status = tenantAnalyticsCronService.getStatus();
        
        const schedule = {
            jobs: [
                {
                    name: 'daily-metrics',
                    description: 'Cálculo diário de métricas dos tenants',
                    schedule: '0 2 * * * (02:00 AM todos os dias)',
                    timezone: 'America/Sao_Paulo',
                    active: status.activeJobs.includes('daily-metrics'),
                    nextExecution: status.nextExecutions['daily-metrics']
                },
                {
                    name: 'hourly-health',
                    description: 'Verificação de saúde do sistema',
                    schedule: '0 * * * * (Todo início de hora)',
                    timezone: 'America/Sao_Paulo',
                    active: status.activeJobs.includes('hourly-health'),
                    nextExecution: status.nextExecutions['hourly-health']
                },
                {
                    name: 'weekly-cleanup',
                    description: 'Limpeza semanal de dados antigos',
                    schedule: '0 3 * * 0 (03:00 AM aos domingos)',
                    timezone: 'America/Sao_Paulo',
                    active: status.activeJobs.includes('weekly-cleanup'),
                    nextExecution: status.nextExecutions['weekly-cleanup']
                }
            ],
            isRunning: status.isRunning,
            totalJobs: status.activeJobs.length
        };
        
        res.json({
            success: true,
            schedule: schedule,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro ao obter agenda:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter informações de agendamento'
        });
    }
});

// ================================================================================
// DOCUMENTAÇÃO DAS ROTAS
// ================================================================================
/**
 * ROTAS DISPONÍVEIS:
 * 
 * GET /api/tenant-analytics-cron/status
 * - Status geral dos cron jobs
 * - Retorna: { success, status, timestamp }
 * 
 * POST /api/tenant-analytics-cron/execute/:jobName
 * - Executa job específico manualmente
 * - Jobs: daily-metrics, hourly-health, weekly-cleanup
 * - Retorna: { success, message, executedAt }
 * 
 * POST /api/tenant-analytics-cron/calculate-today
 * - Atalho para calcular métricas de hoje
 * - Retorna: { success, message, calculatedAt }
 * 
 * GET /api/tenant-analytics-cron/health
 * - Health check dos cron jobs
 * - Retorna: { success, health, timestamp }
 * 
 * GET /api/tenant-analytics-cron/schedule
 * - Informações de agendamento dos jobs
 * - Retorna: { success, schedule, timestamp }
 */

module.exports = router;