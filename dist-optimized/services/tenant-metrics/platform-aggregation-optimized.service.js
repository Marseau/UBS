"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAggregationOptimizedService = void 0;
const database_1 = require("../../config/database");
class PlatformAggregationOptimizedService {
    constructor(logger, cache, dbPool, config = {
        enableRealTimeAggregation: true,
        batchSize: 100,
        cacheTtl: 30 * 60 * 1000,
        parallelProcessing: true
    }) {
        this.logger = logger;
        this.cache = cache;
        this.dbPool = dbPool;
        this.config = config;
        this.client = (0, database_1.getAdminClient)();
        this.logger.info('Platform Aggregation Optimized Service initialized', {
            config: this.config
        });
    }
    async aggregatePlatformMetrics(period, forceRecalculation = false) {
        const startTime = Date.now();
        this.logger.info(`Starting platform aggregation for period ${period}`);
        const cacheKey = `platform_metrics_${period}_${new Date().toISOString().split('T')[0]}`;
        try {
            if (!forceRecalculation) {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    this.logger.info('Platform metrics served from cache', { period, cacheKey });
                    return cached;
                }
            }
            const platformMetrics = await this.dbPool.withConnection(async (client) => {
                return await this.performAggregation(client, period);
            });
            await this.savePlatformMetrics(platformMetrics);
            await this.cache.set(cacheKey, platformMetrics, this.config.cacheTtl);
            this.logger.info('Platform aggregation completed successfully', {
                period,
                activeTenants: platformMetrics.active_tenants,
                platformMrr: platformMetrics.platform_mrr,
                totalRevenue: platformMetrics.total_revenue,
                processingTime: `${Date.now() - startTime}ms`
            });
            return platformMetrics;
        }
        catch (error) {
            this.logger.error('Error in platform aggregation', {
                period,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async performAggregation(client, period) {
        try {
            const { data: aggregatedData, error: aggregationError } = await client
                .rpc('aggregate_platform_metrics_optimized', {
                p_period_type: period,
                p_calculation_date: new Date().toISOString().split('T')[0]
            });
            if (!aggregationError && aggregatedData) {
                return this.formatAggregationResult(aggregatedData, period);
            }
        }
        catch (error) {
            this.logger.info('PostgreSQL function not available, using manual aggregation', {
                period,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        return await this.fallbackManualAggregation(client, period);
    }
    async fallbackManualAggregation(client, period) {
        this.logger.info('Using manual aggregation fallback', { period });
        const { data: tenantMetrics, error } = await client
            .from('tenant_metrics')
            .select(`
                tenant_id,
                metric_data,
                calculated_at
            `)
            .eq('period', period)
            .eq('metric_type', 'comprehensive')
            .gte('calculated_at', this.getDateRangeStart(period))
            .order('calculated_at', { ascending: false });
        if (error)
            throw error;
        let totalRevenue = 0;
        let totalAppointments = 0;
        let totalCustomers = 0;
        let totalConversations = 0;
        let totalPlatformMrr = 0;
        const activeTenants = new Set();
        const allTenants = new Set();
        for (const metric of tenantMetrics) {
            const data = metric.metric_data;
            if (!data)
                continue;
            allTenants.add(metric.tenant_id);
            if (this.isTenantActive(data)) {
                activeTenants.add(metric.tenant_id);
            }
            totalRevenue += parseFloat(data.receita_total_periodo_brl || 0);
            totalAppointments += parseInt(data.agendamentos_confirmados || 0);
            totalCustomers += parseInt(data.clientes_unicos_periodo || 0);
            totalConversations += parseInt(data.conversas_periodo || 0);
            totalPlatformMrr += parseFloat(data.custo_plataforma_brl || 0);
        }
        const avgRevenuePerTenant = activeTenants.size > 0 ? totalRevenue / activeTenants.size : 0;
        const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        return {
            calculation_date: new Date().toISOString().split('T')[0],
            period_days: periodDays,
            data_source: 'tenant_metrics_aggregation',
            total_revenue: totalRevenue,
            total_appointments: totalAppointments,
            total_customers: totalCustomers,
            total_ai_interactions: totalConversations,
            active_tenants: activeTenants.size,
            platform_mrr: totalPlatformMrr,
            total_chat_minutes: null,
            total_conversations: totalConversations,
            total_valid_conversations: totalConversations,
            total_spam_conversations: null,
            receita_uso_ratio: totalPlatformMrr > 0 ? totalRevenue / totalPlatformMrr : 0,
            operational_efficiency_pct: null,
            spam_rate_pct: null,
            cancellation_rate_pct: null,
            revenue_usage_distortion_index: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }
    async savePlatformMetrics(metrics) {
        try {
            const { error } = await this.client
                .from('platform_metrics')
                .upsert({
                calculation_date: metrics.calculation_date,
                period_days: metrics.period_days,
                data_source: metrics.data_source,
                total_revenue: metrics.total_revenue,
                total_appointments: metrics.total_appointments,
                total_customers: metrics.total_customers,
                total_ai_interactions: metrics.total_ai_interactions,
                active_tenants: metrics.active_tenants,
                platform_mrr: metrics.platform_mrr,
                total_chat_minutes: metrics.total_chat_minutes,
                total_conversations: metrics.total_conversations,
                total_valid_conversations: metrics.total_valid_conversations,
                total_spam_conversations: metrics.total_spam_conversations,
                receita_uso_ratio: metrics.receita_uso_ratio,
                operational_efficiency_pct: metrics.operational_efficiency_pct,
                spam_rate_pct: metrics.spam_rate_pct,
                cancellation_rate_pct: metrics.cancellation_rate_pct,
                revenue_usage_distortion_index: metrics.revenue_usage_distortion_index,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (error)
                throw error;
            this.logger.info('Platform metrics saved successfully', {
                periodDays: metrics.period_days,
                activeTenants: metrics.active_tenants,
                totalRevenue: metrics.total_revenue
            });
        }
        catch (error) {
            this.logger.error('Error saving platform metrics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async aggregateAllPeriods(forceRecalculation = false) {
        this.logger.info('Starting aggregation for all periods');
        const [sevenDays, thirtyDays, ninetyDays] = await Promise.all([
            this.aggregatePlatformMetrics('7d', forceRecalculation),
            this.aggregatePlatformMetrics('30d', forceRecalculation),
            this.aggregatePlatformMetrics('90d', forceRecalculation)
        ]);
        return { sevenDays, thirtyDays, ninetyDays };
    }
    async getPlatformMetrics(period) {
        const cacheKey = `platform_metrics_${period}_${new Date().toISOString().split('T')[0]}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const { data, error } = await this.client
            .from('platform_metrics')
            .select('*')
            .eq('period_days', periodDays)
            .order('calculation_date', { ascending: false })
            .limit(1)
            .single();
        if (error || !data)
            return null;
        const platformMetrics = {
            id: data.id,
            calculation_date: data.calculation_date,
            period_days: data.period_days,
            data_source: data.data_source,
            total_revenue: data.total_revenue,
            total_appointments: data.total_appointments,
            total_customers: data.total_customers,
            total_ai_interactions: data.total_ai_interactions,
            active_tenants: data.active_tenants,
            platform_mrr: data.platform_mrr,
            total_chat_minutes: data.total_chat_minutes,
            total_conversations: data.total_conversations,
            total_valid_conversations: data.total_valid_conversations,
            total_spam_conversations: data.total_spam_conversations,
            receita_uso_ratio: data.receita_uso_ratio,
            operational_efficiency_pct: data.operational_efficiency_pct,
            spam_rate_pct: data.spam_rate_pct,
            cancellation_rate_pct: data.cancellation_rate_pct,
            revenue_usage_distortion_index: data.revenue_usage_distortion_index,
            created_at: data.created_at,
            updated_at: data.updated_at
        };
        await this.cache.set(cacheKey, platformMetrics, this.config.cacheTtl);
        return platformMetrics;
    }
    async triggerAggregation(periods) {
        const targetPeriods = periods || ['7d', '30d', '90d'];
        this.logger.info('Manual aggregation triggered', { periods: targetPeriods });
        for (const period of targetPeriods) {
            try {
                await this.aggregatePlatformMetrics(period, true);
            }
            catch (error) {
                this.logger.error(`Failed to aggregate period ${period}`, {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }
    formatAggregationResult(data, period) {
        const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        return {
            calculation_date: new Date().toISOString().split('T')[0],
            period_days: periodDays,
            data_source: 'postgresql_function',
            total_revenue: parseFloat(data.total_revenue || 0),
            total_appointments: parseInt(data.total_appointments || 0),
            total_customers: parseInt(data.total_customers || 0),
            total_ai_interactions: parseInt(data.total_ai_interactions || 0),
            active_tenants: parseInt(data.active_tenants || 0),
            platform_mrr: parseFloat(data.platform_mrr || 0),
            total_chat_minutes: parseInt(data.total_chat_minutes || 0),
            total_conversations: parseInt(data.total_conversations || 0),
            total_valid_conversations: parseInt(data.total_valid_conversations || 0),
            total_spam_conversations: parseInt(data.total_spam_conversations || 0),
            receita_uso_ratio: parseFloat(data.receita_uso_ratio || 0),
            operational_efficiency_pct: parseFloat(data.operational_efficiency_pct || 0),
            spam_rate_pct: parseFloat(data.spam_rate_pct || 0),
            cancellation_rate_pct: parseFloat(data.cancellation_rate_pct || 0),
            revenue_usage_distortion_index: parseFloat(data.revenue_usage_distortion_index || 0),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }
    getDateRangeStart(period) {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    }
    isTenantActive(data) {
        return (parseInt(data.conversas_periodo || 0) > 0 ||
            parseInt(data.agendamentos_confirmados || 0) > 0 ||
            parseFloat(data.receita_total_periodo_brl || 0) > 0);
    }
}
exports.PlatformAggregationOptimizedService = PlatformAggregationOptimizedService;
//# sourceMappingURL=platform-aggregation-optimized.service.js.map