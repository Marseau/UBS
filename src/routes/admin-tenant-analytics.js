// src/routes/admin-tenant-analytics.js
const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/database');

// Middleware para log de requests
router.use((req, res, next) => {
    console.log(`[Admin Tenant Analytics] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// GET /api/admin/tenants - Listar todos os tenants
router.get('/tenants', async (req, res) => {
    try {
        const supabase = getAdminClient();
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, name, created_at')
            .order('business_name');

        if (error) throw error;

        res.json(tenants);
    } catch (error) {
        console.error('Erro ao buscar tenants:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET /api/admin/tenant/:tenantId/business-analytics
router.get('/tenant/:tenantId/business-analytics', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { period = 30 } = req.query;
        
        const supabase = getAdminClient();
        
        // Buscar métricas da tabela
        const { data: metrics, error } = await supabase
            .from('tenant_business_analytics_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('calculation_period_days', parseInt(period))
            .eq('metric_date', new Date().toISOString().split('T')[0])
            .single();

        if (error) {
            // Se não encontrar dados, calcular em tempo real
            const { data: realTimeMetrics } = await supabase.rpc(
                'get_tenant_business_analytics',
                [tenantId, parseInt(period)]
            );
            
            if (realTimeMetrics && realTimeMetrics.length > 0) {
                return res.json(realTimeMetrics[0]);
            }
        }

        if (metrics) {
            return res.json(metrics);
        }

        res.status(404).json({ error: 'Métricas não encontradas' });
    } catch (error) {
        console.error('Erro ao buscar métricas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST /api/admin/refresh-tenant-analytics
router.post('/refresh-tenant-analytics', async (req, res) => {
    try {
        const { tenant_id, period_days = 30 } = req.body;
        
        const supabase = getAdminClient();
        
        // Executar função de refresh
        const { data, error } = await supabase.rpc(
            'refresh_tenant_analytics',
            [tenant_id, period_days]
        );

        if (error) {
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar métricas:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao atualizar métricas',
            error: error.message 
        });
    }
});

module.exports = router;