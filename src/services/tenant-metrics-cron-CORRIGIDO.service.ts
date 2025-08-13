/**
 * Tenant Metrics Cron Service - VERSÃO CORRIGIDA PARA 4 CAMPOS JSON
 * Popula os 4 campos JSON conforme arquitetura UBS: comprehensive_metrics, participation_metrics, ranking_metrics, metric_data
 * 
 * @version 3.0.0 CORRIGIDO
 * @author UBS Team - Context Engineering COLEAM00
 */

import * as cron from 'node-cron';
import { getAdminClient } from '../config/database';
import { TenantMetricsService } from './tenant-metrics.service';
import { BusinessDomain } from '../types/database.types';

export class TenantMetricsCronService {
    private tenantMetricsService: TenantMetricsService;
    private client = getAdminClient();
    private isInitialized = false;

    constructor() {
        this.tenantMetricsService = new TenantMetricsService();
    }

    /**
     * Execute manual metrics update for testing
     */
    public async executeManualMetricsUpdate(): Promise<void> {
        console.log('🔧 Manual trigger: Tenant metrics calculation started');
        try {
            await this.calculateHistoricalMetrics();
            console.log('✅ Manual tenant metrics update completed');
        } catch (error) {
            console.error('❌ Manual tenant metrics update failed:', error);
            throw error;
        }
    }

    /**
     * MÉTODO PRINCIPAL: Execute historical metrics calculation
     * ✅ CORRIGIDO: Agora popula todos os 4 campos JSON
     */
    public async executeHistoricalMetricsCalculation(): Promise<void> {
        console.log('📊 🎯 INICIANDO CÁLCULO HISTÓRICO - VERSÃO CORRIGIDA 4 CAMPOS JSON');
        console.log('='.repeat(80));
        
        try {
            await this.calculateHistoricalMetrics();
            console.log('✅ Cálculo de métricas históricas CONCLUÍDO com 4 campos JSON populados');
        } catch (error) {
            console.error('❌ Erro no cálculo de métricas históricas:', error);
            throw error;
        }
    }

    /**
     * Initialize all cron jobs
     */
    initialize(): void {
        if (this.isInitialized) {
            console.log('⚠️ Tenant Metrics Cron Service already initialized');
            return;
        }

        console.log('🕐 Initializing Tenant Metrics Cron Service...');

        // Daily metrics calculation (4 AM) - Main job for dashboard data
        cron.schedule('0 4 * * *', async () => {
            console.log('🔄 Running daily historical metrics calculation...');
            await this.calculateHistoricalMetrics();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        // Weekly risk assessment (Sunday 3 AM)
        cron.schedule('0 3 * * 0', async () => {
            console.log('🔄 Running weekly risk assessment...');
            await this.calculateWeeklyRiskAssessment();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        // Monthly evolution metrics (1st day of month, 2 AM)
        cron.schedule('0 2 1 * *', async () => {
            console.log('🔄 Running monthly evolution metrics...');
            await this.calculateMonthlyEvolution();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        // Cleanup old metrics (Daily at 1 AM)
        cron.schedule('0 1 * * *', async () => {
            console.log('🧹 Cleaning up old tenant metrics...');
            await this.cleanupOldMetrics();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        // Manual trigger for immediate calculation (for testing)
        if (process.env.NODE_ENV === 'development') {
            console.log('🔧 Development mode: Adding manual trigger endpoints');
            this.setupManualTriggers();
            
            // For development, also run metrics calculation every hour
            cron.schedule('0 * * * *', async () => {
                console.log('🔄 [DEV] Running hourly historical metrics calculation...');
                await this.calculateHistoricalMetrics();
            }, {
                scheduled: true,
                timezone: 'America/Sao_Paulo'
            });
            console.log('🔧 [DEV] Added hourly historical metrics calculation for development');
        }

        this.isInitialized = true;
        console.log('✅ Tenant Metrics Cron Service initialized successfully');
    }

    /**
     * Calculate historical metrics for all tenants - Main dashboard data source
     * ✅ CORRIGIDO: Agora popula os 4 campos JSON corretamente
     */
    async calculateHistoricalMetrics(): Promise<void> {
        console.log('📊 Starting historical metrics calculation for dashboard data...');
        
        try {
            // Get all active tenants
            const tenants = await this.getActiveTenants();
            console.log(`📈 Processing historical metrics for ${tenants.length} tenants`);

            // Process each period type for complete historical data
            const periods = ['7d', '30d', '90d'];
            
            for (const period of periods) {
                console.log(`⏰ Processing period: ${period}`);
                
                // Calculate platform metrics first (needed for participation calculations)
                await this.calculatePlatformMetrics(period);
                
                // Calculate tenant metrics in parallel with concurrency control
                const tenantPromises = tenants.map(tenant => 
                    this.calculateTenantHistoricalMetrics(tenant.id, period)
                );
                
                await this.executeWithConcurrency(tenantPromises, 5);
                
                // Calculate rankings after all tenant metrics are done
                await this.calculateTenantRankings(period);
                
                console.log(`✅ Period ${period} processing completed`);
            }
            
            // Calculate risk assessments for all tenants
            const riskPromises = tenants.map(tenant => 
                this.calculateRiskAssessment(tenant.id)
            );
            await this.executeWithConcurrency(riskPromises, 3);
            
            console.log('✅ Historical metrics calculation completed - Dashboard data updated');
            
        } catch (error) {
            console.error('❌ Error in historical metrics calculation:', error);
            throw error;
        }
    }

    /**
     * Calculate weekly risk assessment for all tenants
     */
    async calculateWeeklyRiskAssessment(): Promise<void> {
        try {
            console.log('🔍 Starting weekly risk assessment...');
            
            const activeTenants = await this.getActiveTenants();
            console.log(`🔍 Assessing risk for ${activeTenants.length} active tenants`);

            const promises = activeTenants.map(async (tenant) => {
                try {
                    console.log(`🔄 Calculating risk assessment for tenant: ${tenant.id}`);
                    
                    // Calculate risk assessment for different periods
                    await Promise.all([
                        this.tenantMetricsService.calculateRiskAssessmentMetric(tenant.id, '7d'),
                        this.tenantMetricsService.calculateRiskAssessmentMetric(tenant.id, '30d'),
                        this.tenantMetricsService.calculateRiskAssessmentMetric(tenant.id, '90d')
                    ]);
                    
                    console.log(`✅ Risk assessment calculated for tenant: ${tenant.id}`);
                } catch (error) {
                    console.error(`❌ Error calculating risk assessment for tenant ${tenant.id}:`, error);
                }
            });

            await this.executeWithConcurrency(promises, 3);
            
            console.log('✅ Weekly risk assessment completed');
        } catch (error) {
            console.error('❌ Error in weekly risk assessment:', error);
        }
    }

    /**
     * Calculate monthly evolution metrics for all tenants
     */
    async calculateMonthlyEvolution(): Promise<void> {
        try {
            console.log('📈 Starting monthly evolution metrics...');
            
            const activeTenants = await this.getActiveTenants();
            console.log(`📈 Calculating evolution for ${activeTenants.length} active tenants`);

            const promises = activeTenants.map(async (tenant) => {
                try {
                    console.log(`🔄 Calculating evolution metrics for tenant: ${tenant.id}`);
                    
                    // Calculate evolution metrics for different periods
                    await Promise.all([
                        this.tenantMetricsService.calculateEvolutionMetric(tenant.id, '30d'),
                        this.tenantMetricsService.calculateEvolutionMetric(tenant.id, '90d')
                    ]);
                    
                    console.log(`✅ Evolution metrics calculated for tenant: ${tenant.id}`);
                } catch (error) {
                    console.error(`❌ Error calculating evolution metrics for tenant ${tenant.id}:`, error);
                }
            });

            await this.executeWithConcurrency(promises, 2);
            
            console.log('✅ Monthly evolution metrics completed');
        } catch (error) {
            console.error('❌ Error in monthly evolution calculation:', error);
        }
    }

    /**
     * Clean up old metrics
     */
    async cleanupOldMetrics(): Promise<void> {
        try {
            console.log('🧹 Starting metrics cleanup...');
            
            await this.tenantMetricsService.cleanOldMetrics();
            
            console.log('✅ Metrics cleanup completed');
        } catch (error) {
            console.error('❌ Error in metrics cleanup:', error);
        }
    }

    /**
     * Manual trigger for immediate calculation (development only)
     */
    private setupManualTriggers(): void {
        // These would be exposed as admin endpoints in development
        console.log('🔧 Manual triggers available:');
        console.log('   - POST /api/admin/metrics/calculate-daily');
        console.log('   - POST /api/admin/metrics/calculate-risk');
        console.log('   - POST /api/admin/metrics/calculate-evolution');
        console.log('   - POST /api/admin/metrics/cleanup');
    }

    /**
     * Manual trigger methods for admin endpoints
     */
    async triggerDailyCalculation(): Promise<void> {
        console.log('🔧 Manual trigger: Historical metrics calculation');
        await this.calculateHistoricalMetrics();
    }

    async triggerRiskAssessment(): Promise<void> {
        console.log('🔧 Manual trigger: Risk assessment');
        await this.calculateWeeklyRiskAssessment();
    }

    async triggerEvolutionCalculation(): Promise<void> {
        console.log('🔧 Manual trigger: Evolution metrics');
        await this.calculateMonthlyEvolution();
    }

    async triggerCleanup(): Promise<void> {
        console.log('🔧 Manual trigger: Cleanup');
        await this.cleanupOldMetrics();
    }

    /**
     * Calculate metrics for a specific tenant (admin trigger)
     */
    async calculateMetricsForTenant(tenantId: string): Promise<void> {
        try {
            console.log(`🔧 Manual calculation for tenant: ${tenantId}`);
            
            await this.tenantMetricsService.calculateAllMetrics(tenantId);
            
            console.log(`✅ All metrics calculated for tenant: ${tenantId}`);
        } catch (error) {
            console.error(`❌ Error calculating metrics for tenant ${tenantId}:`, error);
            throw error;
        }
    }

    /**
     * Get all active tenants
     */
    private async getActiveTenants(): Promise<Array<{ id: string; business_name: string; business_domain?: BusinessDomain }>> {
        try {
            const { data: tenants, error } = await this.client
                .from('tenants')
                .select('id, business_name')
                .eq('status', 'active')
                .order('created_at', { ascending: true });

            if (error) {
                throw error;
            }

            return tenants || [];
        } catch (error) {
            console.error('Error getting active tenants:', error);
            throw error;
        }
    }

    /**
     * Execute promises with concurrency control
     */
    private async executeWithConcurrency<T>(promises: Promise<T>[], concurrency: number): Promise<T[]> {
        const results: T[] = [];
        
        for (let i = 0; i < promises.length; i += concurrency) {
            const batch = promises.slice(i, i + concurrency);
            const batchResults = await Promise.allSettled(batch);
            
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results[i + index] = result.value;
                } else {
                    console.error(`Batch item ${i + index} failed:`, result.reason);
                }
            });
        }
        
        return results;
    }

    /**
     * Get metrics calculation status
     */
    async getCalculationStatus(): Promise<any> {
        try {
            const client = getAdminClient();
            
            // Get last calculation times for each metric type using RPC
            const { data: lastCalculations } = await (client as any)
                .rpc('get_metrics_calculation_status');

            const status: any = {};
            
            if (lastCalculations && Array.isArray(lastCalculations)) {
                lastCalculations.forEach((item: any) => {
                    status[item.metric_type] = {
                        lastCalculated: item.calculated_at,
                        hoursAgo: Math.floor((Date.now() - new Date(item.calculated_at).getTime()) / (1000 * 60 * 60))
                    };
                });
            }

            return {
                initialized: this.isInitialized,
                lastCalculations: status,
                nextScheduled: {
                    daily: 'Every day at 4:00 AM',
                    weekly: 'Every Sunday at 3:00 AM',
                    monthly: '1st day of each month at 2:00 AM',
                    cleanup: 'Every day at 1:00 AM'
                }
            };
        } catch (error) {
            console.error('Error getting calculation status:', error);
            return { 
                error: 'Failed to get status',
                initialized: this.isInitialized,
                lastCalculations: {},
                nextScheduled: {
                    daily: 'Every day at 4:00 AM',
                    weekly: 'Every Sunday at 3:00 AM',
                    monthly: '1st day of each month at 2:00 AM',
                    cleanup: 'Every day at 1:00 AM'
                }
            };
        }
    }

    /**
     * Calculate platform-wide metrics for a given period
     */
    private async calculatePlatformMetrics(periodType: string): Promise<void> {
        const dateRange = this.getDateRange(periodType);
        
        try {
            console.log(`📊 Calculating platform metrics for ${periodType}`);
            
            // Get platform totals using database function
            const platformTotals = await this.getPlatformTotals(dateRange);
            
            // Get domain distribution using database function
            const domainDistribution = await this.getDomainDistribution(dateRange);
            
            // Calculate platform growth rate
            const previousPeriodRange = this.getPreviousPeriodRange(periodType);
            const previousPlatformTotals = await this.getPlatformTotals(previousPeriodRange);
            
            const platformGrowthRate = this.calculateGrowthRate(
                platformTotals.total_revenue,
                previousPlatformTotals.total_revenue
            );
            
            // Calculate platform health score using database function
            const platformHealthScore = await this.calculatePlatformHealthScore(periodType);
            
            // Store calculated metrics in a temporary table or cache for now
            // TODO: Create proper historical metrics tables after schema is updated
            console.log(`📈 Platform metrics for ${periodType}:`, {
                period_type: periodType,
                period_start: dateRange.start.toISOString().split('T')[0],
                period_end: dateRange.end.toISOString().split('T')[0],
                total_tenants: platformTotals.total_tenants,
                active_tenants: platformTotals.active_tenants,
                total_revenue: platformTotals.total_revenue,
                total_appointments: platformTotals.total_appointments,
                total_customers: platformTotals.total_customers,
                total_conversations: platformTotals.total_conversations,
                platform_growth_rate: platformGrowthRate,
                platform_health_score: platformHealthScore,
                domain_distribution: domainDistribution
            });
                
            console.log(`✅ Platform metrics calculated for ${periodType}`);
            
        } catch (error) {
            console.error(`❌ Error calculating platform metrics for ${periodType}:`, error);
            throw error;
        }
    }

    /**
     * Calculate tenant-specific historical metrics
     * ✅ CORRIGIDO: Agora popula os 4 campos JSON corretamente
     */
    private async calculateTenantHistoricalMetrics(tenantId: string, periodType: string): Promise<void> {
        const dateRange = this.getDateRange(periodType);
        
        try {
            console.log(`📊 🎯 CALCULANDO TENANT METRICS CORRIGIDO - ${tenantId} - ${periodType}`);
            
            // ✅ IMPLEMENTAÇÃO INTEGRADA: Usar PostgreSQL functions implementadas
            let tenantMetrics: any;
            
            try {
                console.log(`🔄 Calling PostgreSQL function get_tenant_metrics_for_period for ${tenantId}`);
                
                const startDate = dateRange.start.toISOString().split('T')[0];
                const endDate = dateRange.end.toISOString().split('T')[0];
                
                const { data, error } = await (this.client as any)
                    .rpc('get_tenant_metrics_for_period', {
                        p_tenant_id: tenantId,
                        p_start_date: startDate,
                        p_end_date: endDate,
                        p_period_type: periodType
                    });
                    
                if (error) {
                    console.error(`❌ PostgreSQL function error for ${tenantId}:`, error.message);
                    throw error;
                }
                
                if (!data) {
                    console.log(`⚠️ PostgreSQL function returned null for ${tenantId}`);
                    tenantMetrics = {
                        total_revenue: 0,
                        total_appointments: 0,
                        total_customers: 0,
                        new_customers: 0,
                        success_rate: 0,
                        appointment_success_rate: 0,
                        monthly_revenue: 0,
                        confirmed_appointments: 0,
                        cancelled_appointments: 0,
                        completed_appointments: 0,
                        pending_appointments: 0,
                        returning_customers: 0,
                        average_value: 0,
                        total_services: 0,
                        most_popular_service: '',
                        service_utilization_rate: 0,
                        total_conversations: 0,
                        ai_success_rate: 0,
                        avg_response_time: 0,
                        conversion_rate: 0,
                        booking_conversion_rate: 0
                    };
                } else {
                    const metricsData = data as any;
                    console.log(`✅ PostgreSQL function success for ${tenantId}:`);
                    console.log(`   💰 Revenue: R$ ${metricsData.monthly_revenue || 0}`);
                    console.log(`   👥 Customers: ${metricsData.new_customers || 0}`);
                    console.log(`   📊 Success Rate: ${metricsData.appointment_success_rate || 0}%`);
                    console.log(`   📅 Appointments: ${metricsData.total_appointments || 0}`);
                    
                    // Map PostgreSQL function result to expected format
                    tenantMetrics = {
                        total_revenue: metricsData.monthly_revenue || 0,
                        total_appointments: metricsData.total_appointments || 0,
                        total_customers: metricsData.new_customers || 0,
                        new_customers: metricsData.new_customers || 0,
                        success_rate: metricsData.appointment_success_rate || 0,
                        appointment_success_rate: metricsData.appointment_success_rate || 0,
                        monthly_revenue: metricsData.monthly_revenue || 0,
                        confirmed_appointments: metricsData.confirmed_appointments || 0,
                        cancelled_appointments: metricsData.cancelled_appointments || 0,
                        completed_appointments: metricsData.completed_appointments || 0,
                        pending_appointments: metricsData.pending_appointments || 0,
                        returning_customers: metricsData.returning_customers || 0,
                        average_value: metricsData.average_value || 0,
                        total_services: metricsData.total_services || 0,
                        most_popular_service: metricsData.most_popular_service || '',
                        service_utilization_rate: metricsData.service_utilization_rate || 0,
                        total_conversations: metricsData.total_conversations || 0,
                        ai_success_rate: metricsData.ai_success_rate || 0,
                        avg_response_time: metricsData.avg_response_time || 0,
                        conversion_rate: metricsData.conversion_rate || 0,
                        booking_conversion_rate: metricsData.booking_conversion_rate || 0
                    };
                }
            } catch (rpcError) {
                console.error(`❌ CRITICAL ERROR: RPC call failed for ${tenantId}:`, rpcError);
                throw rpcError; // Não usar fallback - force using PostgreSQL functions
            }
            
            // Get platform totals for participation calculation  
            const platformTotals = await this.getPlatformTotals(dateRange);
            
            // Calculate participation percentages
            const revenueParticipation = platformTotals.total_revenue > 0 ? 
                (tenantMetrics.total_revenue / platformTotals.total_revenue) * 100 : 0;
            const appointmentsParticipation = platformTotals.total_appointments > 0 ? 
                (tenantMetrics.total_appointments / platformTotals.total_appointments) * 100 : 0;
            const customersParticipation = platformTotals.total_customers > 0 ? 
                (tenantMetrics.total_customers / platformTotals.total_customers) * 100 : 0;
            
            // Calculate growth rates
            const previousPeriodRange = this.getPreviousPeriodRange(periodType);
            const previousMetrics = await this.getTenantMetrics(tenantId, previousPeriodRange);
            
            const revenueGrowthRate = this.calculateGrowthRate(tenantMetrics.total_revenue, previousMetrics.total_revenue);
            const appointmentsGrowthRate = this.calculateGrowthRate(tenantMetrics.total_appointments, previousMetrics.total_appointments);
            const customersGrowthRate = this.calculateGrowthRate(tenantMetrics.total_customers, previousMetrics.total_customers);
            
            // Calculate business health and risk scores using database functions
            const businessHealthScore = await this.calculateBusinessHealthScore(tenantId, tenantMetrics, periodType);
            const riskScore = await this.calculateRiskScore(tenantId, tenantMetrics, periodType);
            const riskLevel = this.getRiskLevel(riskScore);
            
            // ✅ CRIAR OS 4 OBJETOS JSON ESTRUTURADOS CONFORME UBS
            const comprehensiveMetrics = {
                // Métricas operacionais básicas
                total_revenue: tenantMetrics.total_revenue,
                monthly_revenue_brl: tenantMetrics.monthly_revenue,
                total_appointments: tenantMetrics.total_appointments,
                confirmed_appointments: tenantMetrics.confirmed_appointments,
                cancelled_appointments: tenantMetrics.cancelled_appointments,
                completed_appointments: tenantMetrics.completed_appointments,
                pending_appointments: tenantMetrics.pending_appointments,
                total_customers: tenantMetrics.total_customers,
                new_customers_count: tenantMetrics.new_customers,
                returning_customers: tenantMetrics.returning_customers,
                average_appointment_value: tenantMetrics.average_value,
                appointment_success_rate: tenantMetrics.appointment_success_rate,
                total_services: tenantMetrics.total_services,
                service_utilization_rate: tenantMetrics.service_utilization_rate,
                most_popular_service: tenantMetrics.most_popular_service,
                total_conversations: tenantMetrics.total_conversations,
                ai_success_rate: tenantMetrics.ai_success_rate,
                ai_efficiency: tenantMetrics.ai_success_rate,
                avg_response_time: tenantMetrics.avg_response_time,
                conversion_rate: tenantMetrics.conversion_rate,
                booking_conversion_rate: tenantMetrics.booking_conversion_rate,
                business_health_score: businessHealthScore
            };
            
            const participationMetrics = {
                // Percentuais de participação na plataforma
                revenue_platform_percentage: revenueParticipation,
                appointments_platform_percentage: appointmentsParticipation,
                customers_platform_percentage: customersParticipation,
                platform_market_share: Math.max(revenueParticipation, appointmentsParticipation, customersParticipation),
                relative_performance_score: businessHealthScore,
                growth_vs_platform: {
                    revenue_growth: revenueGrowthRate,
                    appointments_growth: appointmentsGrowthRate,
                    customers_growth: customersGrowthRate
                }
            };
            
            const rankingMetrics = {
                // Scores e rankings comparativos
                overall_score: businessHealthScore,
                revenue_rank_score: Math.floor(revenueParticipation * 10), 
                appointments_rank_score: Math.floor(appointmentsParticipation * 10),
                customer_satisfaction_score: tenantMetrics.ai_success_rate,
                efficiency_score: tenantMetrics.service_utilization_rate,
                growth_momentum_score: Math.floor((revenueGrowthRate + appointmentsGrowthRate + customersGrowthRate) / 3),
                risk_level: riskLevel,
                risk_score: riskScore,
                competitive_position: businessHealthScore >= 80 ? 'Leader' : businessHealthScore >= 60 ? 'Competitor' : 'Challenger'
            };
            
            // Dados brutos para compatibilidade (metric_data original)
            const metricDataRaw = {
                ...tenantMetrics,
                period_type: periodType,
                period_start: dateRange.start.toISOString().split('T')[0],
                period_end: dateRange.end.toISOString().split('T')[0],
                appointments_growth_rate: appointmentsGrowthRate,
                revenue_growth_rate: revenueGrowthRate,
                customer_growth_rate: customersGrowthRate,
                revenue_platform_percentage: revenueParticipation,
                appointments_platform_percentage: appointmentsParticipation,
                customers_platform_percentage: customersParticipation,
                business_health_score: businessHealthScore,
                risk_level: riskLevel,
                risk_score: riskScore,
                calculated_at: new Date().toISOString()
            };
            
            // ✅ SALVAR TODOS OS 4 CAMPOS JSON NA BASE
            await this.saveMetricsToDatabaseCORRIGIDO({
                tenant_id: tenantId,
                metric_type: 'comprehensive',
                period: periodType,
                comprehensive_metrics: comprehensiveMetrics,
                participation_metrics: participationMetrics,
                ranking_metrics: rankingMetrics,
                metric_data: metricDataRaw
            });
                
            // Calculate time series data for charts
            await this.calculateTenantTimeSeries(tenantId, periodType, dateRange);
                
            console.log(`✅ 🎯 TENANT METRICS CORRIGIDO - 4 CAMPOS JSON POPULADOS para ${tenantId} - ${periodType}`);
            console.log(`   📊 comprehensive_metrics: ${Object.keys(comprehensiveMetrics).length} campos`);
            console.log(`   📈 participation_metrics: ${Object.keys(participationMetrics).length} campos`);
            console.log(`   🏆 ranking_metrics: ${Object.keys(rankingMetrics).length} campos`);
            console.log(`   🗃️ metric_data: ${Object.keys(metricDataRaw).length} campos`);
            
        } catch (error) {
            console.error(`❌ Error calculating tenant metrics for ${tenantId} - ${periodType}:`, error);
            throw error;
        }
    }

    /**
     * Save metrics to database - VERSÃO CORRIGIDA PARA 4 CAMPOS JSON
     * ✅ CORRIGIDO: Agora popula todos os 4 campos JSON
     */
    private async saveMetricsToDatabaseCORRIGIDO(metrics: {
        tenant_id: string;
        metric_type: string;
        period: string;
        comprehensive_metrics: any;
        participation_metrics: any;
        ranking_metrics: any;
        metric_data: any;
    }): Promise<void> {
        try {
            const client = getAdminClient();
            
            console.log(`💾 🎯 SALVANDO MÉTRICAS CORRIGIDAS - 4 CAMPOS JSON para tenant ${metrics.tenant_id}`);
            
            // ✅ Upsert metrics into tenant_metrics table COM OS 4 CAMPOS JSON
            const { error } = await client
                .from('tenant_metrics')
                .upsert({
                    tenant_id: metrics.tenant_id,
                    metric_type: metrics.metric_type,
                    period: metrics.period,
                    // ✅ POPULANDO OS 4 CAMPOS JSON OBRIGATÓRIOS
                    comprehensive_metrics: metrics.comprehensive_metrics,
                    participation_metrics: metrics.participation_metrics,
                    ranking_metrics: metrics.ranking_metrics,
                    metric_data: metrics.metric_data,
                    // Timestamps
                    calculated_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error(`❌ Erro ao salvar métricas corrigidas:`, error);
                throw error;
            }

            console.log(`✅ 🎯 MÉTRICAS SALVAS COM SUCESSO - 4 CAMPOS JSON para tenant ${metrics.tenant_id} - ${metrics.period}`);
            console.log(`   ✅ comprehensive_metrics: ${Object.keys(metrics.comprehensive_metrics).length} propriedades`);
            console.log(`   ✅ participation_metrics: ${Object.keys(metrics.participation_metrics).length} propriedades`);
            console.log(`   ✅ ranking_metrics: ${Object.keys(metrics.ranking_metrics).length} propriedades`);
            console.log(`   ✅ metric_data: ${Object.keys(metrics.metric_data).length} propriedades`);
            
        } catch (error) {
            console.error('❌ Error saving metrics to database:', error);
            throw error;
        }
    }

    /**
     * Calculate tenant time series data for charts
     */
    private async calculateTenantTimeSeries(tenantId: string, periodType: string, dateRange: { start: Date; end: Date }): Promise<void> {
        try {
            // Generate date points based on period type (sample a few key dates for performance)
            const datePoints = this.generateDatePoints(dateRange, periodType).slice(0, 10); // Limit to 10 sample points
            
            console.log(`📈 Calculating time series for ${tenantId} - ${periodType} (${datePoints.length} points)`);
            
            for (const datePoint of datePoints) {
                // Get daily metrics for this date using database functions
                const dailyMetrics = await this.getDailyMetrics(tenantId, datePoint);
                const platformDailyMetrics = await this.getPlatformDailyMetrics(datePoint);
                
                // Log time series data (will be stored in proper tables once schema is updated)
                console.log(`📊 ${datePoint.toISOString().split('T')[0]}:`, {
                    tenant_id: tenantId,
                    period_type: periodType,
                    date_point: datePoint.toISOString().split('T')[0],
                    daily_revenue: dailyMetrics.revenue,
                    daily_appointments: dailyMetrics.appointments,
                    daily_customers: dailyMetrics.customers,
                    daily_conversations: dailyMetrics.conversations,
                    service_breakdown: dailyMetrics.service_breakdown,
                    platform_daily_revenue: platformDailyMetrics.revenue,
                    platform_daily_appointments: platformDailyMetrics.appointments,
                    platform_daily_customers: platformDailyMetrics.customers
                });
            }
            
            console.log(`✅ Time series data calculated for ${tenantId} - ${periodType}`);
            
        } catch (error) {
            console.error(`❌ Error calculating time series for ${tenantId} - ${periodType}:`, error);
            throw error;
        }
    }

    /**
     * Calculate tenant rankings after all metrics are processed
     */
    private async calculateTenantRankings(periodType: string): Promise<void> {
        try {
            console.log(`🏆 Calculating tenant rankings for ${periodType}`);
            
            // Get all active tenants for ranking calculation
            const tenants = await this.getActiveTenants();
            
            // Calculate metrics for all tenants and rank them
            const tenantMetrics: Array<{
                tenant_id: string;
                tenant_name: string;
                total_revenue: number;
                total_appointments: number;
                total_customers: number;
            }> = [];
            
            for (const tenant of tenants) {
                const dateRange = this.getDateRange(periodType);
                const metrics = await this.getTenantMetrics(tenant.id, dateRange);
                
                tenantMetrics.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.business_name,
                    total_revenue: metrics.total_revenue || 0,
                    total_appointments: metrics.total_appointments || 0,
                    total_customers: metrics.total_customers || 0
                });
            }
            
            // Calculate rankings
            const revenueRanked = [...tenantMetrics].sort((a, b) => b.total_revenue - a.total_revenue);
            const appointmentsRanked = [...tenantMetrics].sort((a, b) => b.total_appointments - a.total_appointments);
            const customersRanked = [...tenantMetrics].sort((a, b) => b.total_customers - a.total_customers);
            
            // Log rankings
            console.log(`🏆 Revenue Rankings for ${periodType}:`, 
                revenueRanked.slice(0, 5).map((t, i) => `${i+1}. ${t.tenant_name}: R$ ${t.total_revenue}`)
            );
            console.log(`🏆 Appointments Rankings for ${periodType}:`, 
                appointmentsRanked.slice(0, 5).map((t, i) => `${i+1}. ${t.tenant_name}: ${t.total_appointments}`)
            );
            console.log(`🏆 Customers Rankings for ${periodType}:`, 
                customersRanked.slice(0, 5).map((t, i) => `${i+1}. ${t.tenant_name}: ${t.total_customers}`)
            );
            
            console.log(`✅ Rankings calculated for ${periodType}`);
            
        } catch (error) {
            console.error(`❌ Error calculating rankings for ${periodType}:`, error);
            throw error;
        }
    }

    /**
     * Calculate risk assessment for tenant
     */
    private async calculateRiskAssessment(tenantId: string): Promise<void> {
        try {
            console.log(`⚠️ Calculating risk assessment for ${tenantId}`);
            
            const today = new Date();
            const dateRange = this.getDateRange('30d'); // Use 30d for risk assessment
            
            // Get current metrics using database function
            const metrics = await this.getTenantMetrics(tenantId, dateRange);
            
            // Calculate individual risk factors
            const revenueDeclineRisk = await this.calculateRevenueDeclineRisk(tenantId);
            const appointmentCancellationRisk = this.calculateAppointmentCancellationRisk(metrics);
            const customerChurnRisk = await this.calculateCustomerChurnRisk(tenantId);
            const aiPerformanceRisk = this.calculateAIPerformanceRisk(metrics);
            
            // Calculate overall risk score
            const overallRiskScore = Math.min(100, 
                revenueDeclineRisk + appointmentCancellationRisk + customerChurnRisk + aiPerformanceRisk
            );
            
            const riskLevel = this.getRiskLevel(overallRiskScore);
            
            // Generate risk factors and recommendations
            const riskFactors = this.generateRiskFactors(metrics, {
                revenueDeclineRisk,
                appointmentCancellationRisk,
                customerChurnRisk,
                aiPerformanceRisk
            });
            
            const recommendations = this.generateRecommendations(riskFactors, overallRiskScore);
            
            // Log risk assessment (will be stored in proper tables once schema is updated)
            console.log(`⚠️ Risk assessment for ${tenantId}:`, {
                tenant_id: tenantId,
                assessment_date: today.toISOString().split('T')[0],
                revenue_decline_risk: revenueDeclineRisk,
                appointment_cancellation_risk: appointmentCancellationRisk,
                customer_churn_risk: customerChurnRisk,
                ai_performance_risk: aiPerformanceRisk,
                overall_risk_score: overallRiskScore,
                risk_level: riskLevel,
                risk_factors: riskFactors,
                recommendations: recommendations
            });
                
            console.log(`✅ Risk assessment calculated for ${tenantId}`);
            
        } catch (error) {
            console.error(`❌ Error calculating risk assessment for ${tenantId}:`, error);
            throw error;
        }
    }

    // Helper methods for date calculations
    private getDateRange(period: string): { start: Date; end: Date } {
        const end = new Date();
        const start = new Date();
        
        switch (period) {
            case '7d':
                start.setDate(end.getDate() - 7);
                break;
            case '30d':
                start.setDate(end.getDate() - 30);
                break;
            case '90d':
                start.setDate(end.getDate() - 90);
                break;
            default:
                start.setDate(end.getDate() - 30);
        }
        
        return { start, end };
    }

    private getPreviousPeriodRange(period: string): { start: Date; end: Date } {
        const currentRange = this.getDateRange(period);
        const duration = currentRange.end.getTime() - currentRange.start.getTime();
        
        const end = new Date(currentRange.start.getTime());
        const start = new Date(currentRange.start.getTime() - duration);
        
        return { start, end };
    }

    private calculateGrowthRate(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }

    private getRiskLevel(riskScore: number): string {
        if (riskScore >= 80) return 'Alto Risco';
        if (riskScore >= 60) return 'Risco Médio';
        if (riskScore >= 40) return 'Baixo Risco';
        return 'Saudável';
    }

    private generateDatePoints(dateRange: { start: Date; end: Date }, periodType: string): Date[] {
        const points: Date[] = [];
        const current = new Date(dateRange.start);
        
        while (current <= dateRange.end) {
            points.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return points;
    }

    // Database query methods - implement with actual database queries
    private async getPlatformTotals(dateRange: { start: Date; end: Date }): Promise<any> {
        try {
            console.log(`🌐 getPlatformTotals calling PostgreSQL function`);
            
            const { data: result, error } = await (this.client as any)
                .rpc('get_platform_totals', {
                    p_start_date: dateRange.start.toISOString().split('T')[0],
                    p_end_date: dateRange.end.toISOString().split('T')[0]
                });
            
            if (error) {
                console.error(`❌ Error in getPlatformTotals:`, error);
                throw error;
            }
            
            if (!result) {
                console.log(`⚠️ getPlatformTotals: No data returned`);
                return {
                    total_tenants: 0,
                    active_tenants: 0,
                    total_revenue: 0,
                    total_appointments: 0,
                    total_customers: 0,
                    total_conversations: 0
                };
            }
            
            const platformResult = result as any;
            console.log(`✅ getPlatformTotals success: R$ ${platformResult.total_revenue || 0}`);
            
            return {
                total_tenants: platformResult.total_tenants || 0,
                active_tenants: platformResult.active_tenants || 0,
                total_revenue: platformResult.total_revenue || 0,
                total_appointments: platformResult.total_appointments || 0,
                total_customers: platformResult.total_customers || 0,
                total_conversations: platformResult.total_conversations || 0
            };
        } catch (error) {
            console.error(`❌ CRITICAL ERROR in getPlatformTotals:`, error);
            throw error; // Force using PostgreSQL functions - no fallback
        }
    }

    private async getDomainDistribution(dateRange: { start: Date; end: Date }): Promise<any> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('get_domain_distribution', {
                    start_date: dateRange.start.toISOString().split('T')[0],
                    end_date: dateRange.end.toISOString().split('T')[0]
                });
            
            if (error) throw error;
            
            return result || {};
        } catch (error) {
            console.error('Error getting domain distribution:', error);
            return {};
        }
    }

    private async calculatePlatformHealthScore(periodType: string): Promise<number> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('calculate_platform_health_score', {
                    period_type: periodType
                });
            
            if (error) throw error;
            
            return (typeof result === 'number' ? result : result?.[0] || 75);
        } catch (error) {
            console.error('Error calculating platform health score:', error);
            return 75;
        }
    }

    private async getTenantMetrics(tenantId: string, dateRange: { start: Date; end: Date }): Promise<any> {
        try {
            console.log(`📊 getTenantMetrics calling PostgreSQL function for ${tenantId}`);
            
            const { data: result, error } = await (this.client as any)
                .rpc('get_tenant_metrics_for_period', {
                    p_tenant_id: tenantId,
                    p_start_date: dateRange.start.toISOString().split('T')[0],
                    p_end_date: dateRange.end.toISOString().split('T')[0],
                    p_period_type: '30d' // default period
                });
            
            if (error) {
                console.error(`❌ Error in getTenantMetrics for ${tenantId}:`, error);
                throw error;
            }
            
            if (!result) {
                console.log(`⚠️ getTenantMetrics: No data returned for ${tenantId}`);
                return {
                    total_appointments: 0,
                    confirmed_appointments: 0,
                    cancelled_appointments: 0,
                    completed_appointments: 0,
                    pending_appointments: 0,
                    total_revenue: 0,
                    monthly_revenue: 0,
                    average_value: 0,
                    total_customers: 0,
                    new_customers: 0,
                    returning_customers: 0,
                    total_services: 0,
                    most_popular_service: '',
                    service_utilization_rate: 0,
                    total_conversations: 0,
                    ai_success_rate: 0,
                    avg_response_time: 0,
                    conversion_rate: 0,
                    booking_conversion_rate: 0,
                    appointment_success_rate: 0
                };
            }
            
            const metricsResult = result as any;
            console.log(`✅ getTenantMetrics success for ${tenantId}: R$ ${metricsResult.monthly_revenue || 0}`);
            
            return {
                total_appointments: metricsResult.total_appointments || 0,
                confirmed_appointments: metricsResult.confirmed_appointments || 0,
                cancelled_appointments: metricsResult.cancelled_appointments || 0,
                completed_appointments: metricsResult.completed_appointments || 0,
                pending_appointments: metricsResult.pending_appointments || 0,
                total_revenue: metricsResult.monthly_revenue || 0,
                monthly_revenue: metricsResult.monthly_revenue || 0,
                average_value: metricsResult.average_value || 0,
                total_customers: metricsResult.new_customers || 0,
                new_customers: metricsResult.new_customers || 0,
                returning_customers: metricsResult.returning_customers || 0,
                total_services: metricsResult.total_services || 0,
                most_popular_service: metricsResult.most_popular_service || '',
                service_utilization_rate: metricsResult.service_utilization_rate || 0,
                total_conversations: metricsResult.total_conversations || 0,
                ai_success_rate: metricsResult.ai_success_rate || 0,
                avg_response_time: metricsResult.avg_response_time || 0,
                conversion_rate: metricsResult.conversion_rate || 0,
                booking_conversion_rate: metricsResult.booking_conversion_rate || 0,
                appointment_success_rate: metricsResult.appointment_success_rate || 0
            };
        } catch (error) {
            console.error(`❌ CRITICAL ERROR in getTenantMetrics for ${tenantId}:`, error);
            throw error; // Force using PostgreSQL functions - no fallback
        }
    }

    private async calculateBusinessHealthScore(tenantId: string, metrics: any, periodType: string): Promise<number> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('calculate_business_health_score', {
                    p_tenant_id: tenantId,
                    p_period_type: periodType
                });
            
            if (error) throw error;
            
            return (typeof result === 'number' ? result : result?.[0] || 75);
        } catch (error) {
            console.error('Error calculating business health score:', error);
            return 75;
        }
    }

    private async calculateRiskScore(tenantId: string, metrics: any, periodType: string): Promise<number> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('calculate_risk_score', {
                    p_tenant_id: tenantId,
                    p_period_type: periodType
                });
            
            if (error) throw error;
            
            return (typeof result === 'number' ? result : result?.[0] || 25);
        } catch (error) {
            console.error('Error calculating risk score:', error);
            return 25;
        }
    }

    private async getDailyMetrics(tenantId: string, date: Date): Promise<any> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('get_daily_metrics', {
                    tenant_id: tenantId,
                    target_date: date.toISOString().split('T')[0]
                });
            
            if (error) throw error;
            
            return result?.[0] || {
                revenue: 0,
                appointments: 0,
                customers: 0,
                conversations: 0,
                service_breakdown: {}
            };
        } catch (error) {
            console.error('Error getting daily metrics:', error);
            return {
                revenue: 0,
                appointments: 0,
                customers: 0,
                conversations: 0,
                service_breakdown: {}
            };
        }
    }

    private async getPlatformDailyMetrics(date: Date): Promise<any> {
        try {
            const { data: result, error } = await (this.client as any)
                .rpc('get_platform_daily_metrics', {
                    target_date: date.toISOString().split('T')[0]
                });
            
            if (error) throw error;
            
            return result?.[0] || {
                revenue: 0,
                appointments: 0,
                customers: 0
            };
        } catch (error) {
            console.error('Error getting platform daily metrics:', error);
            return {
                revenue: 0,
                appointments: 0,
                customers: 0
            };
        }
    }

    // Risk calculation methods
    private async calculateRevenueDeclineRisk(tenantId: string): Promise<number> {
        // Calculate revenue decline risk based on recent trends
        const currentPeriod = this.getDateRange('30d');
        const previousPeriod = this.getPreviousPeriodRange('30d');
        
        const currentRevenue = await this.getTenantMetrics(tenantId, currentPeriod);
        const previousRevenue = await this.getTenantMetrics(tenantId, previousPeriod);
        
        const growthRate = this.calculateGrowthRate(currentRevenue.total_revenue, previousRevenue.total_revenue);
        
        if (growthRate < -20) return 30;
        if (growthRate < -10) return 20;
        if (growthRate < 0) return 10;
        return 0;
    }

    private calculateAppointmentCancellationRisk(metrics: any): number {
        const cancellationRate = metrics.total_appointments > 0 ? 
            (metrics.cancelled_appointments / metrics.total_appointments) : 0;
        
        if (cancellationRate > 0.3) return 25;
        if (cancellationRate > 0.2) return 15;
        if (cancellationRate > 0.1) return 10;
        return 0;
    }

    private async calculateCustomerChurnRisk(tenantId: string): Promise<number> {
        const currentPeriod = this.getDateRange('30d');
        const previousPeriod = this.getPreviousPeriodRange('30d');
        
        const currentCustomers = await this.getTenantMetrics(tenantId, currentPeriod);
        const previousCustomers = await this.getTenantMetrics(tenantId, previousPeriod);
        
        const customerGrowthRate = this.calculateGrowthRate(currentCustomers.total_customers, previousCustomers.total_customers);
        
        if (customerGrowthRate < -15) return 20;
        if (customerGrowthRate < -5) return 10;
        if (customerGrowthRate < 0) return 5;
        return 0;
    }

    private calculateAIPerformanceRisk(metrics: any): number {
        const aiSuccessRate = metrics.ai_success_rate || 0;
        
        if (aiSuccessRate < 50) return 25;
        if (aiSuccessRate < 70) return 15;
        if (aiSuccessRate < 80) return 5;
        return 0;
    }

    private generateRiskFactors(metrics: any, riskScores: any): any {
        const factors: { [key: string]: any } = {};
        
        if (riskScores.revenueDeclineRisk > 0) {
            factors['revenue_decline'] = {
                score: riskScores.revenueDeclineRisk,
                description: 'Revenue em declínio nos últimos períodos'
            };
        }
        
        if (riskScores.appointmentCancellationRisk > 0) {
            factors['high_cancellation'] = {
                score: riskScores.appointmentCancellationRisk,
                description: 'Alta taxa de cancelamento de agendamentos'
            };
        }
        
        if (riskScores.customerChurnRisk > 0) {
            factors['customer_churn'] = {
                score: riskScores.customerChurnRisk,
                description: 'Redução na base de clientes'
            };
        }
        
        if (riskScores.aiPerformanceRisk > 0) {
            factors['ai_performance'] = {
                score: riskScores.aiPerformanceRisk,
                description: 'Baixa performance do sistema de IA'
            };
        }
        
        return factors;
    }

    private generateRecommendations(riskFactors: any, overallRiskScore: number): string[] {
        const recommendations: string[] = [];
        
        if (riskFactors.revenue_decline) {
            recommendations.push('Revisar estratégias de preço e promoções');
            recommendations.push('Analisar satisfação dos clientes');
        }
        
        if (riskFactors.high_cancellation) {
            recommendations.push('Implementar política de confirmação de agendamentos');
            recommendations.push('Melhorar comunicação com clientes');
        }
        
        if (riskFactors.customer_churn) {
            recommendations.push('Criar programa de fidelidade');
            recommendations.push('Implementar pesquisa de satisfação');
        }
        
        if (riskFactors.ai_performance) {
            recommendations.push('Revisar configurações do sistema de IA');
            recommendations.push('Treinar equipe para melhor uso da plataforma');
        }
        
        if (overallRiskScore >= 80) {
            recommendations.push('Agendar reunião urgente com equipe de suporte');
        }
        
        return recommendations;
    }

    /**
     * Stop all cron jobs
     */
    destroy(): void {
        if (this.isInitialized) {
            console.log('🛑 Stopping Tenant Metrics Cron Service...');
            // Note: node-cron doesn't have a destroy method, we would need to keep track of individual jobs
            this.isInitialized = false;
            console.log('✅ Tenant Metrics Cron Service stopped');
        }
    }
}

export default TenantMetricsCronService;