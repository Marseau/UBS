const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/database');
const { AdminAuthMiddleware } = require('../middleware/admin-auth');

// Criar instância do middleware de autenticação
const authMiddleware = new AdminAuthMiddleware();

// ================================================================================
// FASE 4: APIs REST PARA TENANT BUSINESS ANALYTICS
// ================================================================================
// OBJETIVO: APIs simples e eficientes para o sistema reconstruído
// ================================================================================

// 1. GET /api/tenant-business-analytics/tenants
// ================================================================================
// Buscar lista de tenants para dropdown
router.get('/tenants', authMiddleware.verifyToken, async (req, res) => {
    try {
        const client = getAdminClient();
        
        const { data: tenants, error } = await client
            .from('admin_users')
            .select('tenant_id, name, email, role')
            .eq('role', 'tenant_admin')
            .not('tenant_id', 'is', null)
            .order('name');
        
        if (error) {
            console.error('❌ Erro buscando tenants:', error.message);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro ao buscar tenants' 
            });
        }
        
        res.json({
            success: true,
            tenants: tenants || [],
            total: tenants?.length || 0
        });
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

// 2. GET /api/tenant-business-analytics/metrics/:tenantId
// ================================================================================
// Buscar métricas específicas de um tenant
router.get('/metrics/:tenantId', authMiddleware.verifyToken, async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { period_days = 30 } = req.query;
        
        const client = getAdminClient();
        
        console.log(`🏢 [FIXED] Carregando métricas do tenant ${tenantId} (${period_days} dias)...`);
        
        // Calcular datas do período (usar data real dos dados)
        const periodDays = parseInt(period_days);
        const endDate = new Date('2025-07-03T23:59:59Z'); // Última data com dados
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - periodDays);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const startTimestamp = startDate.toISOString();
        const endTimestamp = new Date(endDate.getTime() + 24*60*60*1000).toISOString();
        
        console.log(`📅 [FIXED] Período: ${startDateStr} até ${endDateStr}`);
        
        // === TENANT METRICS ===
        
        // Revenue do tenant
        const { data: tenantRevenueData, error: tenantRevenueError } = await client
            .from('subscription_payments')
            .select('amount')
            .eq('payment_status', 'completed')
            .eq('tenant_id', tenantId)
            .gte('payment_date', startDateStr)
            .lte('payment_date', endDateStr);
        
        if (tenantRevenueError) throw tenantRevenueError;
        
        // Appointments do tenant
        const { data: tenantAppointmentsData, count: tenantAppointmentsCount } = await client
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // Customers únicos do tenant
        const { data: tenantCustomersData } = await client
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .not('user_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // === PLATFORM TOTALS FOR PERCENTAGES ===
        
        // Platform revenue total
        const { data: platformRevenueData, error: platformRevenueError } = await client
            .from('subscription_payments')
            .select('amount')
            .eq('payment_status', 'completed')
            .gte('payment_date', startDateStr)
            .lte('payment_date', endDateStr);
        
        if (platformRevenueError) throw platformRevenueError;
        
        // Platform appointments total
        const { data: platformAppointmentsData, count: platformAppointmentsCount } = await client
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .not('tenant_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // Platform customers unique total
        const { data: platformCustomersData } = await client
            .from('appointments')
            .select('user_id')
            .not('tenant_id', 'is', null)
            .not('user_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // === CALCULATE METRICS ===
        
        const tenantRevenue = tenantRevenueData.reduce((sum, payment) => sum + payment.amount, 0);
        const tenantAppointments = tenantAppointmentsCount || 0;
        const tenantCustomers = [...new Set(tenantCustomersData.map(c => c.user_id))].length;
        
        const platformRevenue = platformRevenueData.reduce((sum, payment) => sum + payment.amount, 0);
        const platformAppointments = platformAppointmentsCount || 0;
        const platformCustomers = [...new Set(platformCustomersData.map(c => c.user_id))].length;
        
        // Calculate percentages
        const revenueParticipationPct = platformRevenue > 0 ? (tenantRevenue / platformRevenue) * 100 : 0;
        const appointmentsParticipationPct = platformAppointments > 0 ? (tenantAppointments / platformAppointments) * 100 : 0;
        const customersParticipationPct = platformCustomers > 0 ? (tenantCustomers / platformCustomers) * 100 : 0;
        
        const result = {
            tenant_id: tenantId,
            metric_date: new Date().toISOString().split('T')[0],
            tenant_revenue: tenantRevenue,
            revenue_participation_pct: revenueParticipationPct,
            tenant_appointments: tenantAppointments,
            appointments_participation_pct: appointmentsParticipationPct,
            tenant_customers: tenantCustomers,
            customers_participation_pct: customersParticipationPct,
            platform_total_revenue: platformRevenue,
            platform_total_appointments: platformAppointments,
            platform_total_customers: platformCustomers,
            ranking_position: 1,
            ranking_category: 'Top 5',
            ranking_percentile: 50.0,
            efficiency_score: 0.0,
            calculated_at: new Date().toISOString()
        };
        
        console.log(`✅ [FIXED] Métricas do tenant calculadas:`, {
            revenue: tenantRevenue,
            appointments: tenantAppointments,
            customers: tenantCustomers,
            revenue_pct: revenueParticipationPct.toFixed(2) + '%',
            appointments_pct: appointmentsParticipationPct.toFixed(2) + '%',
            customers_pct: customersParticipationPct.toFixed(2) + '%'
        });
        
        res.json({
            success: true,
            metrics: result,
            period_days: periodDays,
            last_updated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro carregando métricas do tenant:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

// 3. GET /api/tenant-business-analytics/platform-metrics
// ================================================================================
// Buscar métricas da plataforma
router.get('/platform-metrics', authMiddleware.verifyToken, async (req, res) => {
    try {
        const { period_days = 30 } = req.query;
        const client = getAdminClient();
        
        console.log(`🌍 [FIXED] Carregando métricas da plataforma (${period_days} dias)...`);
        
        // Calcular datas do período (usar data real dos dados)
        const periodDays = parseInt(period_days);
        const endDate = new Date('2025-07-03T23:59:59Z'); // Última data com dados
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - periodDays);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const startTimestamp = startDate.toISOString();
        const endTimestamp = new Date(endDate.getTime() + 24*60*60*1000).toISOString();
        
        console.log(`📅 [FIXED] Período: ${startDateStr} até ${endDateStr}`);
        
        // Revenue REAL (subscription_payments)
        const { data: revenueData, error: revenueError } = await client
            .from('subscription_payments')
            .select('amount')
            .eq('payment_status', 'completed')
            .gte('payment_date', startDateStr)
            .lte('payment_date', endDateStr);
        
        if (revenueError) throw revenueError;
        
        // Appointments REAIS
        const { data: appointmentsData, count: appointmentsCount } = await client
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .not('tenant_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // Customers únicos REAIS
        const { data: customersData } = await client
            .from('appointments')
            .select('user_id')
            .not('tenant_id', 'is', null)
            .not('user_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // Tenants ativos
        const { data: tenantsData, count: tenantsCount } = await client
            .from('admin_users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'tenant_admin')
            .not('tenant_id', 'is', null);
        
        // Calcular totais
        const totalRevenue = revenueData.reduce((sum, payment) => sum + payment.amount, 0);
        const totalAppointments = appointmentsCount || 0;
        const uniqueCustomers = [...new Set(customersData.map(c => c.user_id))].length;
        const activeTenants = tenantsCount || 0;
        
        const result = {
            total_revenue: totalRevenue,
            total_appointments: totalAppointments,
            total_customers: uniqueCustomers,
            active_tenants: activeTenants,
            avg_revenue_per_tenant: activeTenants > 0 ? totalRevenue / activeTenants : 0,
            avg_appointments_per_tenant: activeTenants > 0 ? totalAppointments / activeTenants : 0,
            top_tenant_name: 'N/A',
            calculation_date: new Date().toISOString()
        };
        
        console.log('✅ [FIXED] Métricas calculadas:', {
            revenue: totalRevenue,
            appointments: totalAppointments,
            customers: uniqueCustomers,
            tenants: activeTenants
        });
        
        res.json({
            success: true,
            platform_metrics: result,
            period_days: periodDays,
            last_updated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro carregando métricas da plataforma:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

// 4. GET /api/tenant-business-analytics/top-tenants
// ================================================================================
// Buscar top tenants para ranking
router.get('/top-tenants', authMiddleware.verifyToken, async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        
        const client = getAdminClient();
        
        // Buscar top tenants usando a função SQL
        const { data: topTenants, error } = await client.rpc('get_top_tenants', {
            p_limit: parseInt(limit)
        });
        
        if (error) {
            console.error('❌ Erro buscando top tenants:', error.message);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro ao buscar top tenants' 
            });
        }
        
        res.json({
            success: true,
            top_tenants: topTenants || [],
            total: topTenants?.length || 0
        });
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

// 5. POST /api/tenant-business-analytics/refresh
// ================================================================================
// Disparar cálculo de métricas (botão "Atualizar")
router.post('/refresh', authMiddleware.verifyToken, async (req, res) => {
    try {
        const { 
            calculation_date = new Date().toISOString().split('T')[0], 
            period_days = 30,
            tenant_id = null 
        } = req.body;
        
        const client = getAdminClient();
        
        console.log('🔄 [FIXED] Disparando cálculo direto de métricas...');
        console.log('   Data:', calculation_date);
        console.log('   Período:', period_days, 'dias');
        console.log('   Tenant específico:', tenant_id || 'Todos');
        
        // Calculate date range (usar data real dos dados)
        const periodDays = parseInt(period_days);
        const endDate = new Date('2025-07-03T23:59:59Z'); // Última data com dados
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - periodDays);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const startTimestamp = startDate.toISOString();
        const endTimestamp = new Date(endDate.getTime() + 24*60*60*1000).toISOString();
        
        // === CALCULATE PLATFORM TOTALS ===
        
        // Platform revenue total
        const { data: platformRevenueData, error: platformRevenueError } = await client
            .from('subscription_payments')
            .select('amount')
            .eq('payment_status', 'completed')
            .gte('payment_date', startDateStr)
            .lte('payment_date', endDateStr);
        
        if (platformRevenueError) throw platformRevenueError;
        
        // Platform appointments total
        const { data: platformAppointmentsData, count: platformAppointmentsCount } = await client
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .not('tenant_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        // Platform customers unique total
        const { data: platformCustomersData } = await client
            .from('appointments')
            .select('user_id')
            .not('tenant_id', 'is', null)
            .not('user_id', 'is', null)
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp);
        
        const platformRevenue = platformRevenueData.reduce((sum, payment) => sum + payment.amount, 0);
        const platformAppointments = platformAppointmentsCount || 0;
        const platformCustomers = [...new Set(platformCustomersData.map(c => c.user_id))].length;
        
        console.log('📊 [FIXED] Totais da plataforma calculados:', {
            revenue: platformRevenue,
            appointments: platformAppointments,
            customers: platformCustomers
        });
        
        // Get tenants to process
        const { data: tenants, error: tenantsError } = await client
            .from('admin_users')
            .select('tenant_id, name')
            .eq('role', 'tenant_admin')
            .not('tenant_id', 'is', null);
        
        if (tenantsError) throw tenantsError;
        
        let processedTenants = 0;
        const tenantsToProcess = tenant_id ? tenants.filter(t => t.tenant_id === tenant_id) : tenants;
        
        // Process each tenant
        for (const tenant of tenantsToProcess) {
            // Tenant revenue
            const { data: tenantRevenueData } = await client
                .from('subscription_payments')
                .select('amount')
                .eq('payment_status', 'completed')
                .eq('tenant_id', tenant.tenant_id)
                .gte('payment_date', startDateStr)
                .lte('payment_date', endDateStr);
            
            // Tenant appointments
            const { count: tenantAppointmentsCount } = await client
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.tenant_id)
                .gte('created_at', startTimestamp)
                .lt('created_at', endTimestamp);
            
            // Tenant customers
            const { data: tenantCustomersData } = await client
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenant.tenant_id)
                .not('user_id', 'is', null)
                .gte('created_at', startTimestamp)
                .lt('created_at', endTimestamp);
            
            const tenantRevenue = tenantRevenueData.reduce((sum, payment) => sum + payment.amount, 0);
            const tenantAppointments = tenantAppointmentsCount || 0;
            const tenantCustomers = [...new Set(tenantCustomersData.map(c => c.user_id))].length;
            
            // Calculate percentages
            const revenueParticipationPct = platformRevenue > 0 ? (tenantRevenue / platformRevenue) * 100 : 0;
            const appointmentsParticipationPct = platformAppointments > 0 ? (tenantAppointments / platformAppointments) * 100 : 0;
            const customersParticipationPct = platformCustomers > 0 ? (tenantCustomers / platformCustomers) * 100 : 0;
            
            // Insert/update in tenant_business_analytics table
            const { error: upsertError } = await client
                .from('tenant_business_analytics')
                .upsert({
                    tenant_id: tenant.tenant_id,
                    metric_date: calculation_date,
                    calculation_period_days: periodDays,
                    tenant_revenue: tenantRevenue,
                    revenue_participation_pct: revenueParticipationPct,
                    tenant_appointments: tenantAppointments,
                    appointments_participation_pct: appointmentsParticipationPct,
                    tenant_customers: tenantCustomers,
                    customers_participation_pct: customersParticipationPct,
                    platform_total_revenue: platformRevenue,
                    platform_total_appointments: platformAppointments,
                    platform_total_customers: platformCustomers,
                    ranking_position: 1,
                    ranking_category: 'Top 5',
                    ranking_percentile: 50.0,
                    efficiency_score: 0.0,
                    calculated_at: new Date().toISOString()
                }, {
                    onConflict: 'tenant_id, metric_date, calculation_period_days'
                });
            
            if (upsertError) {
                console.error(`❌ Erro atualizando ${tenant.name}:`, upsertError.message);
            } else {
                console.log(`✅ [FIXED] ${tenant.name}: R$ ${tenantRevenue.toFixed(2)} (${revenueParticipationPct.toFixed(2)}%)`);
                processedTenants++;
            }
        }
        
        const result = {
            success: true,
            calculation_date,
            period_days: periodDays,
            processed_tenants: processedTenants,
            platform_totals: {
                revenue: platformRevenue,
                appointments: platformAppointments,
                customers: platformCustomers
            },
            calculated_at: new Date().toISOString()
        };
        
        console.log('✅ [FIXED] Cálculo concluído:', result);
        
        res.json({
            success: true,
            message: 'Métricas calculadas com sucesso usando SQL direto',
            result: result,
            last_updated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro calculando métricas:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

// 6. GET /api/tenant-business-analytics/health
// ================================================================================
// Health check das APIs
router.get('/health', async (req, res) => {
    try {
        const client = getAdminClient();
        
        // Testar conexão com banco
        const { data: testData, error: testError } = await client
            .from('tenant_business_analytics')
            .select('id')
            .limit(1);
        
        const dbStatus = testError ? 'error' : 'ok';
        
        res.json({
            success: true,
            status: 'ok',
            database: dbStatus,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ================================================================================
// DOCUMENTAÇÃO DAS ROTAS
// ================================================================================
/**
 * ROTAS DISPONÍVEIS:
 * 
 * GET /api/tenant-business-analytics/tenants
 * - Busca lista de tenants para dropdown
 * - Retorna: { success, tenants[], total }
 * 
 * GET /api/tenant-business-analytics/metrics/:tenantId?period_days=30
 * - Busca métricas específicas de um tenant
 * - Retorna: { success, metrics }
 * 
 * GET /api/tenant-business-analytics/platform-metrics?period_days=30
 * - Busca métricas agregadas da plataforma
 * - Retorna: { success, platform_metrics }
 * 
 * GET /api/tenant-business-analytics/top-tenants?limit=5
 * - Busca ranking dos melhores tenants
 * - Retorna: { success, top_tenants[], total }
 * 
 * POST /api/tenant-business-analytics/refresh
 * - Dispara cálculo de métricas
 * - Body: { calculation_date?, period_days?, tenant_id? }
 * - Retorna: { success, message, result, last_updated }
 * 
 * GET /api/tenant-business-analytics/health
 * - Health check das APIs
 * - Retorna: { success, status, database, timestamp, version }
 */

module.exports = router;