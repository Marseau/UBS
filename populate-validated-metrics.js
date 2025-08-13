/**
 * Script para popular campo metricas_validadas nas tabelas tenant_metrics e platform_metrics
 * Baseado nos scripts de teste validados da pasta src/test-tenants
 * 
 * @version 1.0.0
 * @author UBS Team
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple logger para o script
const logger = {
    info: (msg, data) => console.log(`🔥 ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    error: (msg, error) => console.error(`❌ ${msg}`, error),
    warn: (msg, data) => console.warn(`⚠️ ${msg}`, data ? JSON.stringify(data, null, 2) : '')
};

class ValidatedMetricsPopulator {
    constructor() {
        this.logger = logger;
        this.client = client;
    }

    /**
     * Popular métricas validadas para todos os tenants
     */
    async populateAllValidatedMetrics() {
        try {
            this.logger.info('🚀 Iniciando população das métricas validadas...');
            
            // 1. Obter lista de tenants ativos
            const { data: tenants, error: tenantsError } = await this.client
                .from('tenants')
                .select('id, name')
                .eq('status', 'active');

            if (tenantsError) throw tenantsError;

            this.logger.info(`📊 Encontrados ${tenants.length} tenants ativos para processamento`);

            // 2. Processar cada tenant para os 3 períodos
            const results = {
                success: 0,
                errors: 0,
                details: []
            };

            for (const tenant of tenants) {
                try {
                    for (const period of ['7d', '30d', '90d']) {
                        this.logger.info(`🔄 Calculando métricas validadas para tenant ${tenant.name} - período ${period}`);
                        
                        const metrics = await this.calculateTenantValidatedMetrics(tenant.id, period);
                        await this.saveTenantValidatedMetrics(tenant.id, period, metrics);
                        
                        results.success++;
                        results.details.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            period: period,
                            status: 'success',
                            metrics_count: Object.keys(metrics).length
                        });
                    }
                } catch (error) {
                    this.logger.error(`❌ Erro processando tenant ${tenant.name}:`, error.message);
                    results.errors++;
                    results.details.push({
                        tenant_id: tenant.id,
                        tenant_name: tenant.name,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            // 3. Agregar métricas da plataforma
            this.logger.info('🔄 Agregando métricas da plataforma...');
            await this.aggregatePlatformValidatedMetrics();

            this.logger.info('✅ População das métricas validadas concluída!', {
                successCount: results.success,
                errorCount: results.errors,
                totalTenants: tenants.length
            });

            return results;

        } catch (error) {
            this.logger.error('💥 Erro na população das métricas validadas:', error);
            throw error;
        }
    }

    /**
     * Calcula as 23 métricas validadas para um tenant
     */
    async calculateTenantValidatedMetrics(tenantId, period) {
        const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Calcular todas as métricas em paralelo
        const [
            monthlyRevenue,
            newCustomers,
            appointmentSuccessRate,
            noShowImpact,
            conversationMetrics,
            complementaryMetrics,
            historicalMetrics,
            tenantOutcomes
        ] = await Promise.all([
            this.calculateMonthlyRevenue(tenantId, periodDays),
            this.calculateNewCustomers(tenantId, periodDays),
            this.calculateAppointmentSuccessRate(tenantId, periodDays),
            this.calculateNoShowImpact(tenantId, periodDays),
            this.calculateConversationMetrics(tenantId, periodDays),
            this.calculateComplementaryMetrics(tenantId, periodDays),
            this.calculateHistoricalMetrics(tenantId),
            this.calculateTenantOutcomes(tenantId)
        ]);

        return {
            // Primary Business Metrics (4)
            monthly_revenue: monthlyRevenue,
            new_customers: newCustomers,
            appointment_success_rate: appointmentSuccessRate,
            no_show_impact: noShowImpact,

            // Conversation Outcome Metrics (4)
            ...conversationMetrics,

            // Complementary Metrics (11)
            ...complementaryMetrics,

            // Historical Metrics (3)
            ...historicalMetrics,

            // Tenant Outcomes (21 métricas = 7 categorias × 3 períodos)
            tenant_outcomes: tenantOutcomes,

            // Metadata
            calculation_metadata: {
                calculation_date: new Date().toISOString().split('T')[0],
                period: period,
                tenant_id: tenantId,
                data_source: 'validated_test_scripts'
            }
        };
    }

    /**
     * 1. Monthly Revenue - appointments completed/confirmed
     */
    async calculateMonthlyRevenue(tenantId, periodDays) {
        const { data, error } = await this.client
            .from('appointments')
            .select('final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .in('status', ['completed', 'confirmed'])
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        return data?.reduce((sum, apt) => {
            const revenue = apt.final_price || apt.quoted_price || 0;
            return sum + parseFloat(revenue.toString());
        }, 0) || 0;
    }

    /**
     * 2. New Customers - user_tenants + users
     */
    async calculateNewCustomers(tenantId, periodDays) {
        const { data, error } = await this.client
            .from('user_tenants')
            .select('user_id, first_interaction')
            .eq('tenant_id', tenantId)
            .gte('first_interaction', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        const uniqueCustomers = new Set(data?.map(ut => ut.user_id) || []);
        return uniqueCustomers.size;
    }

    /**
     * 3. Appointment Success Rate - conversation_outcome
     */
    async calculateAppointmentSuccessRate(tenantId, periodDays) {
        const { data, error } = await this.client
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        const outcomes = data || [];
        const successOutcomes = ['appointment_created', 'appointment_confirmed'];
        const excludeOutcomes = ['wrong_number', 'spam_detected', 'appointment_noshow_followup'];

        const validOutcomes = outcomes.filter(o => !excludeOutcomes.includes(o.conversation_outcome));
        const successCount = outcomes.filter(o => successOutcomes.includes(o.conversation_outcome)).length;

        return validOutcomes.length > 0 ? (successCount / validOutcomes.length) * 100 : 0;
    }

    /**
     * 4. No-Show Impact - appointments no_show
     */
    async calculateNoShowImpact(tenantId, periodDays) {
        const { data, error } = await this.client
            .from('appointments')
            .select('status, final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        const appointments = data || [];
        const noShowAppointments = appointments.filter(apt => apt.status === 'no_show');
        const totalPotentialRevenue = appointments.reduce((sum, apt) => {
            const revenue = apt.final_price || apt.quoted_price || 0;
            return sum + parseFloat(revenue.toString());
        }, 0);
        
        const lostRevenue = noShowAppointments.reduce((sum, apt) => {
            const revenue = apt.final_price || apt.quoted_price || 0;
            return sum + parseFloat(revenue.toString());
        }, 0);

        return {
            impact_percentage: appointments.length > 0 ? (noShowAppointments.length / appointments.length) * 100 : 0,
            lost_revenue: lostRevenue,
            no_show_count: noShowAppointments.length,
            total_appointments: appointments.length,
            total_potential_revenue: totalPotentialRevenue
        };
    }

    /**
     * Conversation Outcome Metrics (4 métricas)
     */
    async calculateConversationMetrics(tenantId, periodDays) {
        const { data, error } = await this.client
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        const outcomes = data || [];
        const totalConversations = outcomes.length;

        // Information Rate
        const infoOutcomes = ['info_request_fulfilled', 'business_hours_inquiry', 'price_inquiry', 'location_inquiry', 'appointment_inquiry'];
        const infoConversations = outcomes.filter(o => infoOutcomes.includes(o.conversation_outcome)).length;

        // Spam Rate
        const spamOutcomes = ['wrong_number', 'spam_detected'];
        const spamConversations = outcomes.filter(o => spamOutcomes.includes(o.conversation_outcome)).length;

        // Reschedule Rate
        const rescheduleOutcomes = ['appointment_rescheduled', 'appointment_modified'];
        const rescheduleConversations = outcomes.filter(o => rescheduleOutcomes.includes(o.conversation_outcome)).length;

        // Cancellation Rate
        const cancellationOutcomes = ['appointment_cancelled'];
        const cancelledConversations = outcomes.filter(o => cancellationOutcomes.includes(o.conversation_outcome)).length;

        return {
            information_rate: {
                percentage: totalConversations > 0 ? (infoConversations / totalConversations) * 100 : 0,
                info_conversations: infoConversations,
                total_conversations: totalConversations
            },
            spam_rate: {
                percentage: totalConversations > 0 ? (spamConversations / totalConversations) * 100 : 0,
                spam_conversations: spamConversations,
                total_conversations: totalConversations
            },
            reschedule_rate: {
                percentage: totalConversations > 0 ? (rescheduleConversations / totalConversations) * 100 : 0,
                reschedule_conversations: rescheduleConversations,
                total_conversations: totalConversations
            },
            cancellation_rate: {
                percentage: totalConversations > 0 ? (cancelledConversations / totalConversations) * 100 : 0,
                cancelled_conversations: cancelledConversations,
                total_conversations: totalConversations
            }
        };
    }

    /**
     * Complementary Metrics (11 métricas)
     */
    async calculateComplementaryMetrics(tenantId, periodDays) {
        // Buscar dados de conversation_history
        const { data: conversations } = await this.client
            .from('conversation_history')
            .select('created_at, api_cost_usd, processing_cost_usd, confidence_score, conversation_outcome, conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        const conversationsData = conversations || [];

        // Average Minutes per Conversation - usando conversation_id do conversation_context
        const sessionDurations = new Map();
        const uniqueSessions = new Set();
        
        conversationsData.forEach(conv => {
            const conversationId = conv.conversation_context?.conversation_id;
            if (conversationId) {
                uniqueSessions.add(conversationId);
                const timestamp = new Date(conv.created_at);
                
                if (!sessionDurations.has(conversationId)) {
                    sessionDurations.set(conversationId, { start: timestamp, end: timestamp });
                } else {
                    const existing = sessionDurations.get(conversationId);
                    if (timestamp < existing.start) existing.start = timestamp;
                    if (timestamp > existing.end) existing.end = timestamp;
                }
            }
        });

        let totalMinutes = 0;
        sessionDurations.forEach(({ start, end }) => {
            const duration = (end.getTime() - start.getTime()) / (1000 * 60);
            totalMinutes += Math.max(0, duration);
        });

        // Total System Cost USD
        const totalApiCost = conversationsData.reduce((sum, conv) => sum + (conv.api_cost_usd || 0), 0);
        const totalProcessingCost = conversationsData.reduce((sum, conv) => sum + (conv.processing_cost_usd || 0), 0);

        // AI Failure Rate
        const aiFailureOutcomes = ['timeout_abandoned', 'conversation_timeout'];
        const failedConversations = conversationsData.filter(conv => aiFailureOutcomes.includes(conv.conversation_outcome)).length;

        // Confidence Score
        const validConfidenceScores = conversationsData.filter(conv => conv.confidence_score && conv.confidence_score > 0);
        const avgConfidence = validConfidenceScores.length > 0 
            ? validConfidenceScores.reduce((sum, conv) => sum + conv.confidence_score, 0) / validConfidenceScores.length
            : 0;

        // Buscar dados de outras tabelas
        const [
            { data: customers },
            { data: services },
            { data: professionals },
            { data: subscriptionPayments },
            { data: ai7d },
            { data: ai30d },
            { data: ai90d }
        ] = await Promise.all([
            this.client.from('user_tenants').select('user_id').eq('tenant_id', tenantId),
            this.client.from('services').select('name').eq('tenant_id', tenantId),
            this.client.from('professionals').select('id').eq('tenant_id', tenantId),
            this.client.from('subscription_payments').select('amount').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()),
            this.client.from('conversation_history').select('id').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
            this.client.from('conversation_history').select('id').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            this.client.from('conversation_history').select('id').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        const uniqueCustomersCount = new Set(customers?.map(c => c.user_id) || []).size;
        const servicesList = services?.map(s => s.name) || [];
        const platformCostBrl = subscriptionPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;

        return {
            avg_minutes_per_conversation: {
                minutes: uniqueSessions.size > 0 ? totalMinutes / uniqueSessions.size : 0,
                total_minutes: totalMinutes,
                total_conversations: uniqueSessions.size
            },
            total_system_cost_usd: {
                total_cost_usd: totalApiCost + totalProcessingCost,
                api_cost_usd: totalApiCost,
                processing_cost_usd: totalProcessingCost,
                total_conversations: conversationsData.length
            },
            ai_failure_rate: {
                failure_percentage: conversationsData.length > 0 ? (failedConversations / conversationsData.length) * 100 : 0,
                failed_conversations: failedConversations,
                total_conversations: conversationsData.length
            },
            confidence_score: {
                avg_confidence: avgConfidence,
                total_conversations: validConfidenceScores.length
            },
            total_unique_customers: {
                count: uniqueCustomersCount
            },
            services_available: {
                services: servicesList,
                count: servicesList.length
            },
            total_professionals: {
                count: professionals?.length || 0
            },
            monthly_platform_cost_brl: {
                cost_brl: platformCostBrl,
                period_days: periodDays
            },
            ai_interaction_7d: {
                system_messages_total: ai7d?.length || 0,
                period_days: 7
            },
            ai_interaction_30d: {
                system_messages_total: ai30d?.length || 0,
                period_days: 30
            },
            ai_interaction_90d: {
                system_messages_total: ai90d?.length || 0,
                period_days: 90
            }
        };
    }

    /**
     * Historical Metrics - 6 meses (3 métricas)
     */
    async calculateHistoricalMetrics(tenantId) {
        const monthsData = {
            conversations: { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 },
            revenue: { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 },
            customers: { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 }
        };

        // Calcular para os 6 meses anteriores (excluindo mês atual)
        for (let i = 0; i < 6; i++) {
            const monthStart = new Date();
            monthStart.setMonth(monthStart.getMonth() - (i + 1));
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const monthEnd = new Date();
            monthEnd.setMonth(monthEnd.getMonth() - i);
            monthEnd.setDate(1);
            monthEnd.setHours(0, 0, 0, 0);

            // Conversations - usando conversation_id do conversation_context
            const { data: convData } = await this.client
                .from('conversation_history')
                .select('conversation_context')
                .eq('tenant_id', tenantId)
                .gte('created_at', monthStart.toISOString())
                .lt('created_at', monthEnd.toISOString());

            const uniqueSessions = new Set(convData?.map(c => c.conversation_context?.conversation_id).filter(Boolean) || []);
            monthsData.conversations[`month_${i}`] = uniqueSessions.size;

            // Revenue
            const { data: aptData } = await this.client
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenantId)
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', monthStart.toISOString())
                .lt('created_at', monthEnd.toISOString());

            const monthRevenue = aptData?.reduce((sum, apt) => {
                const revenue = apt.final_price || apt.quoted_price || 0;
                return sum + parseFloat(revenue.toString());
            }, 0) || 0;
            monthsData.revenue[`month_${i}`] = monthRevenue;

            // Customers
            const { data: custData } = await this.client
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('created_at', monthStart.toISOString())
                .lt('created_at', monthEnd.toISOString());

            const uniqueCustomers = new Set(custData?.map(c => c.user_id) || []);
            monthsData.customers[`month_${i}`] = uniqueCustomers.size;
        }

        return {
            historical_6months_conversations: monthsData.conversations,
            historical_6months_revenue: monthsData.revenue,
            historical_6months_customers: monthsData.customers
        };
    }

    /**
     * Tenant Outcomes - 21 métricas (7 categorias × 3 períodos)
     */
    async calculateTenantOutcomes(tenantId) {
        const periods = [7, 30, 90];
        const outcomes = {
            period_7d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 },
            period_30d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 },
            period_90d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 }
        };

        for (let i = 0; i < periods.length; i++) {
            const periodDays = periods[i];
            const periodKey = `period_${periodDays}d`;

            const { data } = await this.client
                .from('conversation_history')
                .select('conversation_outcome')
                .eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

            const conversationOutcomes = data || [];

            outcomes[periodKey] = {
                agendamentos: conversationOutcomes.filter(c => ['appointment_created', 'appointment_confirmed'].includes(c.conversation_outcome)).length,
                remarcados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_rescheduled').length,
                informativos: conversationOutcomes.filter(c => 
                    ['info_request_fulfilled', 'price_inquiry', 'business_hours_inquiry', 'location_inquiry', 
                     'appointment_inquiry', 'appointment_noshow_followup'].includes(c.conversation_outcome)
                ).length,
                cancelados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_cancelled').length,
                modificados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_modified').length,
                falhaIA: conversationOutcomes.filter(c => 
                    ['booking_abandoned', 'timeout_abandoned', 'conversation_timeout'].includes(c.conversation_outcome)
                ).length,
                spam: conversationOutcomes.filter(c => ['wrong_number', 'spam_detected'].includes(c.conversation_outcome)).length
            };
        }

        return outcomes;
    }

    /**
     * Salvar métricas validadas na tenant_metrics
     */
    async saveTenantValidatedMetrics(tenantId, period, metrics) {
        const { error } = await this.client
            .from('tenant_metrics')
            .upsert({
                tenant_id: tenantId,
                metric_type: 'validated_metrics',
                period: period,
                calculated_at: new Date().toISOString(),
                metric_data: {},
                metricas_validadas: metrics
            });

        if (error) throw error;
    }

    /**
     * Agregar métricas da plataforma
     */
    async aggregatePlatformValidatedMetrics() {
        for (const period of ['7d', '30d', '90d']) {
            try {
                const calculationDate = new Date().toISOString().split('T')[0];
                
                // Buscar todas as métricas validadas dos tenants para o período
                const { data: tenantMetrics, error } = await this.client
                    .from('tenant_metrics')
                    .select('tenant_id, metricas_validadas')
                    .eq('metric_type', 'validated_metrics')
                    .eq('period', period)
                    .gte('calculated_at', `${calculationDate} 00:00:00`)
                    .lte('calculated_at', `${calculationDate} 23:59:59`)
                    .not('metricas_validadas', 'is', null);

                if (error) throw error;

                const validTenantMetrics = tenantMetrics?.filter(tm => 
                    tm.metricas_validadas && Object.keys(tm.metricas_validadas).length > 0
                ) || [];

                if (validTenantMetrics.length === 0) {
                    this.logger.warn(`⚠️ Nenhuma métrica validada encontrada para período ${period}`);
                    continue;
                }

                // Agregar métricas da plataforma
                const platformMetrics = this.aggregateValidatedMetrics(validTenantMetrics, period);

                // Salvar na platform_metrics
                const { error: saveError } = await this.client
                    .from('platform_metrics')
                    .upsert({
                        calculation_date: calculationDate,
                        period: period,
                        data_source: 'validated_metrics_aggregation',
                        comprehensive_metrics: {},
                        participation_metrics: {},
                        ranking_metrics: {},
                        metricas_validadas: platformMetrics
                    });

                if (saveError) throw saveError;

                this.logger.info(`✅ Métricas da plataforma agregadas para período ${period}`, {
                    tenantsProcessed: validTenantMetrics.length,
                    totalRevenue: platformMetrics.total_monthly_revenue
                });

            } catch (error) {
                this.logger.error(`❌ Erro agregando período ${period}:`, error);
            }
        }
    }

    /**
     * Função de agregação das métricas da plataforma
     */
    aggregateValidatedMetrics(tenantMetrics, period) {
        // Implementar lógica de agregação similar ao PlatformAggregationValidatedService
        // Por brevidade, implementação simplificada
        let totalRevenue = 0;
        let totalNewCustomers = 0;
        let totalAppointments = 0;
        let activeTenants = 0;

        tenantMetrics.forEach(tm => {
            const metrics = tm.metricas_validadas;
            totalRevenue += metrics.monthly_revenue || 0;
            totalNewCustomers += metrics.new_customers || 0;
            if (metrics.no_show_impact) {
                totalAppointments += metrics.no_show_impact.total_appointments || 0;
            }
            if (metrics.monthly_revenue > 0 || metrics.new_customers > 0) {
                activeTenants++;
            }
        });

        return {
            total_monthly_revenue: totalRevenue,
            total_new_customers: totalNewCustomers,
            total_appointments: totalAppointments,
            active_tenants: activeTenants,
            calculation_metadata: {
                calculation_date: new Date().toISOString().split('T')[0],
                period: period,
                tenants_processed: tenantMetrics.length,
                data_source: 'validated_metrics_aggregation'
            }
        };
    }
}

// Executar população das métricas validadas
async function main() {
    try {
        const populator = new ValidatedMetricsPopulator();
        const results = await populator.populateAllValidatedMetrics();
        
        console.log('\n🎉 POPULAÇÃO DAS MÉTRICAS VALIDADAS CONCLUÍDA!');
        console.log(`✅ Sucessos: ${results.success}`);
        console.log(`❌ Erros: ${results.errors}`);
        
        process.exit(0);
    } catch (error) {
        console.error('💥 Erro na execução:', error);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { ValidatedMetricsPopulator };