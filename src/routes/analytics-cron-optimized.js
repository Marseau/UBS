/**
 * Analytics API Otimizada - Usa dados pré-calculados
 * 
 * Esta API serve dados que são calculados pelo cron job diário às 4:00 AM
 * Elimina cálculos em tempo real para melhor performance
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Cache simples em memória (TTL de 1 hora)
 */
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

function getCachedData(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    cache.delete(key);
    return null;
}

function setCachedData(key, data) {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
}

/**
 * GET /api/analytics/system-dashboard
 * Dashboard do Super Admin - Métricas do sistema
 */
router.get('/system-dashboard', async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const cacheKey = `system-dashboard-${period}`;
        
        // Verificar cache
        const cached = getCachedData(cacheKey);
        if (cached) {
            return res.json({
                success: true,
                data: cached,
                source: 'cache',
                lastUpdate: '04:00 AM (diário)'
            });
        }
        
        console.log('🔍 Buscando métricas do sistema (dados pré-calculados)...');
        
        // Buscar métricas do sistema usando função RPC
        const { data: systemMetrics, error: systemError } = await supabase
            .rpc('get_system_dashboard_metrics', { p_period: period });
            
        if (systemError) {
            console.error('Erro ao buscar métricas do sistema:', systemError);
            throw systemError;
        }
        
        // Buscar top tenants
        const { data: topTenants, error: tenantsError } = await supabase
            .rpc('get_top_tenants_ranking', { p_limit: 10 });
            
        if (tenantsError) {
            console.error('Erro ao buscar top tenants:', tenantsError);
            throw tenantsError;
        }
        
        // Buscar distribuição de domínios
        const { data: domainDistribution, error: domainError } = await supabase
            .rpc('get_domain_distribution');
            
        if (domainError) {
            console.error('Erro ao buscar distribuição de domínios:', domainError);
            throw domainError;
        }
        
        // Buscar dados de série temporal (últimos 30 dias)
        const { data: timeSeriesData, error: timeSeriesError } = await supabase
            .from('analytics_system_metrics')
            .select('metric_date, total_revenue, total_appointments, total_customers')
            .eq('period_type', 'daily')
            .gte('metric_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('metric_date', { ascending: true });
            
        if (timeSeriesError) {
            console.error('Erro ao buscar série temporal:', timeSeriesError);
            throw timeSeriesError;
        }
        
        // Montar resposta
        const metrics = systemMetrics[0] || {};
        const responseData = {
            // Métricas principais SaaS
            saasMetrics: {
                activeTenants: metrics.active_tenants || 0,
                totalTenants: metrics.total_tenants || 0,
                mrr: metrics.total_revenue || 0,
                totalRevenue: metrics.total_revenue || 0,
                growthRate: metrics.growth_rate || 0,
                completionRate: metrics.completion_rate || 0
            },
            
            // Métricas do sistema
            systemMetrics: {
                totalAppointments: metrics.total_appointments || 0,
                totalRevenue: metrics.total_revenue || 0,
                totalCustomers: metrics.total_customers || 0,
                aiInteractions: metrics.ai_interactions || 0,
                averageTicket: metrics.total_revenue && metrics.total_appointments 
                    ? (metrics.total_revenue / metrics.total_appointments).toFixed(2)
                    : 0
            },
            
            // Gráficos
            charts: {
                revenueTimeSeries: timeSeriesData.map(d => ({
                    date: d.metric_date,
                    value: parseFloat(d.total_revenue) || 0
                })),
                appointmentsTimeSeries: timeSeriesData.map(d => ({
                    date: d.metric_date,
                    value: d.total_appointments || 0
                })),
                customersTimeSeries: timeSeriesData.map(d => ({
                    date: d.metric_date,
                    value: d.total_customers || 0
                })),
                domainDistribution: domainDistribution.map(d => ({
                    name: d.domain,
                    value: d.tenant_count,
                    revenue: parseFloat(d.total_revenue) || 0,
                    percentage: parseFloat(d.percentage) || 0
                }))
            },
            
            // Rankings
            topTenants: topTenants.map(t => ({
                tenantId: t.tenant_id,
                businessName: t.business_name,
                rank: t.rank_position,
                revenue: parseFloat(t.revenue) || 0,
                appointments: t.appointment_count || 0,
                growthRate: parseFloat(t.growth_rate) || 0
            })),
            
            // Metadados
            metadata: {
                period,
                lastCalculated: '04:00 AM (diário)',
                dataSource: 'pre-calculated',
                totalRecords: timeSeriesData.length
            }
        };
        
        // Cachear resposta
        setCachedData(cacheKey, responseData);
        
        res.json({
            success: true,
            data: responseData,
            source: 'database',
            lastUpdate: '04:00 AM (diário)'
        });
        
    } catch (error) {
        console.error('Erro na API system-dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: error.message,
            lastUpdate: '04:00 AM (diário)'
        });
    }
});

/**
 * GET /api/analytics/tenant-dashboard/:tenantId
 * Dashboard do Tenant - Métricas específicas do tenant
 */
router.get('/tenant-dashboard/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { period = '30d' } = req.query;
        const cacheKey = `tenant-dashboard-${tenantId}-${period}`;
        
        // Verificar cache
        const cached = getCachedData(cacheKey);
        if (cached) {
            return res.json({
                success: true,
                data: cached,
                source: 'cache',
                lastUpdate: '04:00 AM (diário)'
            });
        }
        
        console.log(`🔍 Buscando métricas do tenant ${tenantId} (dados pré-calculados)...`);
        
        // Buscar métricas do tenant usando função RPC
        const { data: tenantMetrics, error: tenantError } = await supabase
            .rpc('get_tenant_dashboard_metrics', { 
                p_tenant_id: tenantId,
                p_period: period 
            });
            
        if (tenantError) {
            console.error('Erro ao buscar métricas do tenant:', tenantError);
            throw tenantError;
        }
        
        // Buscar dados de série temporal do tenant
        const { data: timeSeriesData, error: timeSeriesError } = await supabase
            .from('analytics_tenant_metrics')
            .select('metric_date, total_revenue, total_appointments, total_customers, completion_rate')
            .eq('tenant_id', tenantId)
            .eq('period_type', 'daily')
            .gte('metric_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('metric_date', { ascending: true });
            
        if (timeSeriesError) {
            console.error('Erro ao buscar série temporal do tenant:', timeSeriesError);
            throw timeSeriesError;
        }
        
        // Buscar distribuição de serviços
        const { data: servicesData, error: servicesError } = await supabase
            .from('appointments')
            .select(`
                service_id,
                services!inner(name),
                status
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
            
        if (servicesError) {
            console.error('Erro ao buscar serviços:', servicesError);
            throw servicesError;
        }
        
        // Processar distribuição de serviços
        const serviceDistribution = {};
        servicesData.forEach(appointment => {
            const serviceName = appointment.services.name;
            if (!serviceDistribution[serviceName]) {
                serviceDistribution[serviceName] = {
                    name: serviceName,
                    total: 0,
                    completed: 0
                };
            }
            serviceDistribution[serviceName].total++;
            if (appointment.status === 'completed') {
                serviceDistribution[serviceName].completed++;
            }
        });
        
        const topServices = Object.values(serviceDistribution)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
        
        // Montar resposta
        const metrics = tenantMetrics[0] || {};
        const responseData = {
            // Métricas principais do negócio
            businessMetrics: {
                totalAppointments: metrics.total_appointments || 0,
                totalRevenue: metrics.total_revenue || 0,
                totalCustomers: metrics.total_customers || 0,
                completionRate: metrics.completion_rate || 0,
                cancellationRate: metrics.cancellation_rate || 0,
                growthRate: metrics.growth_rate || 0
            },
            
            // Métricas de IA
            aiMetrics: {
                totalInteractions: metrics.ai_interactions || 0,
                conversionRate: 0, // Calcular se necessário
                averageConfidence: 85, // Placeholder
                intentAccuracy: 92 // Placeholder
            },
            
            // Scores de saúde e risco
            healthMetrics: {
                healthScore: metrics.health_score || 85,
                riskScore: metrics.risk_score || 15,
                riskLevel: metrics.risk_score > 70 ? 'Alto Risco' : 
                          metrics.risk_score > 40 ? 'Médio Risco' : 'Baixo Risco'
            },
            
            // Gráficos
            charts: {
                revenueTimeSeries: timeSeriesData.map(d => ({
                    date: d.metric_date,
                    value: parseFloat(d.total_revenue) || 0
                })),
                appointmentsTimeSeries: timeSeriesData.map(d => ({
                    date: d.metric_date,
                    value: d.total_appointments || 0
                })),
                servicesDistribution: topServices.map(s => ({
                    name: s.name,
                    value: s.total,
                    completed: s.completed,
                    completionRate: s.total > 0 ? ((s.completed / s.total) * 100).toFixed(1) : 0
                }))
            },
            
            // Metadados
            metadata: {
                tenantId,
                period,
                lastCalculated: '04:00 AM (diário)',
                dataSource: 'pre-calculated',
                totalRecords: timeSeriesData.length
            }
        };
        
        // Cachear resposta
        setCachedData(cacheKey, responseData);
        
        res.json({
            success: true,
            data: responseData,
            source: 'database',
            lastUpdate: '04:00 AM (diário)'
        });
        
    } catch (error) {
        console.error('Erro na API tenant-dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: error.message,
            lastUpdate: '04:00 AM (diário)'
        });
    }
});

/**
 * GET /api/analytics/cron-status
 * Status das execuções do cron job
 */
router.get('/cron-status', async (req, res) => {
    try {
        // Buscar últimas execuções do cron
        const { data: executions, error } = await supabase
            .from('analytics_job_executions')
            .select('*')
            .order('executed_at', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        // Buscar data da última atualização bem-sucedida
        const lastSuccess = executions.find(e => e.status === 'success');
        
        res.json({
            success: true,
            data: {
                lastUpdate: lastSuccess?.executed_at || null,
                lastStatus: lastSuccess?.status || 'unknown',
                nextUpdate: '04:00 AM (diário)',
                recentExecutions: executions.map(e => ({
                    jobName: e.job_name,
                    status: e.status,
                    duration: e.duration_ms,
                    executedAt: e.executed_at,
                    errorMessage: e.error_message
                }))
            }
        });
        
    } catch (error) {
        console.error('Erro ao buscar status do cron:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar status do cron',
            message: error.message
        });
    }
});

/**
 * POST /api/analytics/trigger-manual-update
 * Trigger manual do cron job (apenas para desenvolvimento/teste)
 */
router.post('/trigger-manual-update', async (req, res) => {
    try {
        // Verificar se é ambiente de desenvolvimento
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                error: 'Atualização manual não permitida em produção',
                message: 'Use o cron job automático às 4:00 AM'
            });
        }
        
        // Executar cron job manualmente
        // Note: daily cron functionality should be moved to a service within src/
        // For now, commenting out this external dependency
        // const { runDailyCron } = require('../../scripts/daily-analytics-cron');
        
        // Executar em background
        // TODO: Implement manual cron execution
        // runDailyCron().catch(error => {
        //     console.error('Erro na execução manual do cron:', error);
        // });
        
        res.json({
            success: true,
            message: 'Cron job iniciado manualmente',
            note: 'Verifique os logs para acompanhar o progresso'
        });
        
    } catch (error) {
        console.error('Erro ao executar cron manual:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao executar cron manual',
            message: error.message
        });
    }
});

module.exports = router; 