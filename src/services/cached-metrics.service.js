/**
 * P3-001: Cached Metrics Service
 * 
 * High-performance metrics calculation with intelligent caching
 */

const { getCacheService } = require('./redis-cache.service');
const { createClient } = require('@supabase/supabase-js');

class CachedMetricsService {
    constructor() {
        this.cache = getCacheService();
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Calculation complexity levels determine TTL
        this.complexityLevels = {
            SIMPLE: { ttl: 300, description: 'Basic counts and sums' },
            MODERATE: { ttl: 600, description: 'Aggregations with grouping' },
            COMPLEX: { ttl: 1200, description: 'Multi-table joins and calculations' },
            HEAVY: { ttl: 1800, description: 'Advanced analytics and trends' }
        };
    }
    
    // Dashboard metrics with caching
    async getDashboardMetrics(tenantId, period = 30) {
        const cacheKey = `dashboard_metrics:${tenantId}:${period}`;
        
        // Try cache first
        const cached = await this.cache.getMetricsCalculation('dashboard', { tenantId, period });
        if (cached) {
            console.log(`🎯 Dashboard metrics cache HIT for tenant ${tenantId}`);
            return cached;
        }
        
        console.log(`💫 Dashboard metrics cache MISS for tenant ${tenantId}, calculating...`);
        
        try {
            const metrics = await this.calculateDashboardMetrics(tenantId, period);
            
            // Cache the result
            await this.cache.cacheMetricsCalculation('dashboard', { tenantId, period }, metrics);
            
            return metrics;
            
        } catch (error) {
            console.error('❌ Dashboard metrics calculation failed:', error.message);
            throw error;
        }
    }
    
    async calculateDashboardMetrics(tenantId, period = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - period);
        
        // Parallel queries for better performance
        const [appointments, conversations, revenue] = await Promise.all([
            this.getAppointmentMetrics(tenantId, startDate),
            this.getConversationMetrics(tenantId, startDate),
            this.getRevenueMetrics(tenantId, startDate)
        ]);
        
        return {
            period: period,
            calculatedAt: new Date().toISOString(),
            tenantId: tenantId,
            metrics: {
                appointments: appointments,
                conversations: conversations,
                revenue: revenue,
                summary: this.calculateSummaryMetrics(appointments, conversations, revenue)
            }
        };
    }
    
    async getAppointmentMetrics(tenantId, startDate) {
        const { data, error } = await this.supabase
            .from('appointments')
            .select('id, status, total_price, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString());
            
        if (error) throw error;
        
        const total = data?.length || 0;
        const confirmed = data?.filter(a => a.status === 'confirmed').length || 0;
        const completed = data?.filter(a => a.status === 'completed').length || 0;
        const cancelled = data?.filter(a => a.status === 'cancelled').length || 0;
        
        return {
            total,
            confirmed,
            completed,
            cancelled,
            conversionRate: total > 0 ? (completed / total * 100).toFixed(2) : 0,
            cancellationRate: total > 0 ? (cancelled / total * 100).toFixed(2) : 0
        };
    }
    
    async getConversationMetrics(tenantId, startDate) {
        const { data, error } = await this.supabase
            .from('conversation_history')
            .select('id, message_type, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString());
            
        if (error) throw error;
        
        const total = data?.length || 0;
        const bookingRequests = data?.filter(c => c.message_type === 'booking_request').length || 0;
        
        return {
            total,
            bookingRequests,
            avgPerDay: total > 0 ? (total / 30).toFixed(1) : 0
        };
    }
    
    async getRevenueMetrics(tenantId, startDate) {
        const { data, error } = await this.supabase
            .from('appointments')
            .select('total_price, status, created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('created_at', startDate.toISOString());
            
        if (error) throw error;
        
        const totalRevenue = data?.reduce((sum, apt) => sum + (apt.total_price || 0), 0) || 0;
        const transactionCount = data?.length || 0;
        const avgTransactionValue = transactionCount > 0 ? (totalRevenue / transactionCount) : 0;
        
        return {
            total: totalRevenue,
            transactionCount,
            avgTransactionValue: parseFloat(avgTransactionValue.toFixed(2))
        };
    }
    
    calculateSummaryMetrics(appointments, conversations, revenue) {
        const conversionRate = conversations.bookingRequests > 0 
            ? (appointments.completed / conversations.bookingRequests * 100).toFixed(2)
            : 0;
            
        return {
            conversionRate,
            revenuePerAppointment: appointments.completed > 0 
                ? (revenue.total / appointments.completed).toFixed(2)
                : 0,
            bookingEfficiency: conversations.total > 0 
                ? (appointments.total / conversations.total * 100).toFixed(2)
                : 0
        };
    }
    
    // Platform-wide metrics with heavy caching
    async getPlatformMetrics(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = await this.cache.getPlatformMetrics();
            if (cached) {
                console.log('🎯 Platform metrics cache HIT');
                return cached;
            }
        }
        
        console.log('💫 Platform metrics cache MISS, calculating...');
        
        try {
            const metrics = await this.calculatePlatformMetrics();
            await this.cache.cachePlatformMetrics(metrics);
            return metrics;
        } catch (error) {
            console.error('❌ Platform metrics calculation failed:', error.message);
            throw error;
        }
    }
    
    async calculatePlatformMetrics() {
        const [tenants, users, appointments, conversations, revenue] = await Promise.all([
            this.getTenantStats(),
            this.getUserStats(),
            this.getAllAppointmentStats(),
            this.getAllConversationStats(),
            this.getAllRevenueStats()
        ]);
        
        return {
            calculatedAt: new Date().toISOString(),
            platform: {
                tenants,
                users,
                appointments,
                conversations,
                revenue,
                kpis: this.calculatePlatformKPIs(tenants, users, appointments, conversations, revenue)
            }
        };
    }
    
    async getTenantStats() {
        const { data, error } = await this.supabase
            .from('tenants')
            .select('id, status, subscription_plan, domain');
            
        if (error) throw error;
        
        return {
            total: data?.length || 0,
            active: data?.filter(t => t.status === 'active').length || 0,
            trial: data?.filter(t => t.status === 'trial').length || 0,
            byDomain: this.groupByField(data, 'domain'),
            byPlan: this.groupByField(data, 'subscription_plan')
        };
    }
    
    async getUserStats() {
        const { data, error } = await this.supabase
            .from('users')
            .select('id, created_at');
            
        if (error) throw error;
        
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        
        return {
            total: data?.length || 0,
            newLast30Days: data?.filter(u => new Date(u.created_at) > last30Days).length || 0
        };
    }
    
    async getAllAppointmentStats() {
        const { data, error } = await this.supabase
            .from('appointments')
            .select('id, status, total_price, created_at');
            
        if (error) throw error;
        
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const recent = data?.filter(a => new Date(a.created_at) > last30Days) || [];
        
        return {
            total: data?.length || 0,
            last30Days: recent.length,
            byStatus: this.groupByField(data, 'status'),
            recentRevenue: recent
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + (a.total_price || 0), 0)
        };
    }
    
    async getAllConversationStats() {
        const { data, error } = await this.supabase
            .from('conversation_history')
            .select('id, message_type, created_at');
            
        if (error) throw error;
        
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        
        return {
            total: data?.length || 0,
            last30Days: data?.filter(c => new Date(c.created_at) > last30Days).length || 0,
            byType: this.groupByField(data, 'message_type')
        };
    }
    
    async getAllRevenueStats() {
        const { data, error } = await this.supabase
            .from('appointments')
            .select('total_price, created_at')
            .eq('status', 'completed');
            
        if (error) throw error;
        
        const totalRevenue = data?.reduce((sum, a) => sum + (a.total_price || 0), 0) || 0;
        
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const recentRevenue = data
            ?.filter(a => new Date(a.created_at) > last30Days)
            .reduce((sum, a) => sum + (a.total_price || 0), 0) || 0;
        
        return {
            total: totalRevenue,
            last30Days: recentRevenue,
            avgPerTransaction: data?.length > 0 ? (totalRevenue / data.length) : 0
        };
    }
    
    calculatePlatformKPIs(tenants, users, appointments, conversations, revenue) {
        return {
            mrr: revenue.last30Days, // Simplified MRR calculation
            activeTenantsPercent: tenants.total > 0 ? (tenants.active / tenants.total * 100).toFixed(2) : 0,
            avgRevenuePerTenant: tenants.active > 0 ? (revenue.last30Days / tenants.active).toFixed(2) : 0,
            conversationToAppointmentRate: conversations.last30Days > 0 ? 
                (appointments.last30Days / conversations.last30Days * 100).toFixed(2) : 0,
            userGrowthRate: users.total > 0 ? (users.newLast30Days / users.total * 100).toFixed(2) : 0
        };
    }
    
    groupByField(data, field) {
        if (!data) return {};
        
        return data.reduce((acc, item) => {
            const value = item[field] || 'unknown';
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
    }
    
    // Analytics with trend calculation and caching
    async getAnalyticsTrends(tenantId, metric, period = 90) {
        const cacheKey = `trends:${tenantId}:${metric}:${period}`;
        
        const cached = await this.cache.getMetricsCalculation('trends', { tenantId, metric, period });
        if (cached) {
            console.log(`🎯 Trends cache HIT for ${metric}`);
            return cached;
        }
        
        console.log(`💫 Trends cache MISS for ${metric}, calculating...`);
        
        try {
            const trends = await this.calculateTrends(tenantId, metric, period);
            await this.cache.cacheMetricsCalculation('trends', { tenantId, metric, period }, trends);
            return trends;
        } catch (error) {
            console.error('❌ Trends calculation failed:', error.message);
            throw error;
        }
    }
    
    async calculateTrends(tenantId, metric, period) {
        // This would implement trend analysis
        // For now, return a simplified structure
        return {
            metric,
            period,
            trend: 'stable',
            change: '+5.2%',
            dataPoints: Array.from({ length: 30 }, (_, i) => ({
                date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                value: Math.floor(Math.random() * 100) + 50
            }))
        };
    }
    
    // Cache management methods
    async warmUpCache() {
        console.log('🔥 Warming up metrics cache...');
        
        try {
            // Get list of active tenants
            const { data: tenants } = await this.supabase
                .from('tenants')
                .select('id')
                .eq('status', 'active');
            
            if (tenants) {
                // Warm up dashboard metrics for each tenant
                for (const tenant of tenants.slice(0, 5)) { // Limit to first 5 for performance
                    await this.getDashboardMetrics(tenant.id);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                }
            }
            
            // Warm up platform metrics
            await this.getPlatformMetrics();
            
            console.log('✅ Metrics cache warming completed');
            
        } catch (error) {
            console.error('❌ Cache warming failed:', error.message);
        }
    }
    
    async invalidateAllMetrics() {
        await this.cache.invalidateMetricsCache();
        await this.cache.invalidatePattern('platform:*');
        console.log('🗑️  All metrics cache invalidated');
    }
    
    async getMetricsHealth() {
        const cacheStats = this.cache.getCacheStats();
        const redisInfo = await this.cache.getRedisInfo();
        
        return {
            cache: cacheStats,
            redis: redisInfo.status,
            complexityLevels: this.complexityLevels,
            lastCalculation: new Date().toISOString()
        };
    }
}

// Singleton instance
let cachedMetricsInstance = null;

function getCachedMetricsService() {
    if (!cachedMetricsInstance) {
        cachedMetricsInstance = new CachedMetricsService();
    }
    return cachedMetricsInstance;
}

module.exports = {
    CachedMetricsService,
    getCachedMetricsService
};