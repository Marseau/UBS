/**
 * Validated Metrics Calculator Service
 * Implementação das 23 métricas validadas dos scripts de teste
 * 
 * @version 1.0.0
 * @author UBS Team
 */

import { Logger } from 'winston';
import { getAdminClient } from '../../config/database';
import { Database } from '../../types/database.types';

export interface ValidatedMetricsResult {
    // Primary Business Metrics (4)
    monthly_revenue: number;
    new_customers: number;
    appointment_success_rate: number;
    no_show_impact: {
        impact_percentage: number;
        lost_revenue: number;
        no_show_count: number;
        total_appointments: number;
        total_potential_revenue: number;
    };

    // Conversation Outcome Metrics (4)
    information_rate: {
        percentage: number;
        info_conversations: number;
        total_conversations: number;
    };
    spam_rate: {
        percentage: number;
        spam_conversations: number;
        total_conversations: number;
    };
    reschedule_rate: {
        percentage: number;
        reschedule_conversations: number;
        total_conversations: number;
    };
    cancellation_rate: {
        percentage: number;
        cancelled_conversations: number;
        total_conversations: number;
    };

    // Complementary Metrics (11)
    avg_minutes_per_conversation: {
        minutes: number;
        total_minutes: number;
        total_conversations: number;
    };
    total_system_cost_usd: {
        total_cost_usd: number;
        api_cost_usd: number;
        processing_cost_usd: number;
        total_conversations: number;
    };
    ai_failure_rate: {
        failure_percentage: number;
        failed_conversations: number;
        total_conversations: number;
    };
    confidence_score: {
        avg_confidence: number;
        total_conversations: number;
    };
    total_unique_customers: {
        count: number;
    };
    services_available: {
        services: string[];
        count: number;
    };
    total_professionals: {
        count: number;
    };
    monthly_platform_cost_brl: {
        cost_brl: number;
        period_days: number;
    };
    ai_interaction_7d: {
        system_messages_total: number;
        period_days: number;
    };
    ai_interaction_30d: {
        system_messages_total: number;
        period_days: number;
    };
    ai_interaction_90d: {
        system_messages_total: number;
        period_days: number;
    };

    // Historical Metrics (3)
    historical_6months_conversations: {
        month_0: number; month_1: number; month_2: number;
        month_3: number; month_4: number; month_5: number;
    };
    historical_6months_revenue: {
        month_0: number; month_1: number; month_2: number;
        month_3: number; month_4: number; month_5: number;
    };
    historical_6months_customers: {
        month_0: number; month_1: number; month_2: number;
        month_3: number; month_4: number; month_5: number;
    };

    // Tenant Outcomes (21 metrics = 7 categories × 3 periods)
    tenant_outcomes: {
        period_7d: {
            agendamentos: number; remarcados: number; informativos: number;
            cancelados: number; modificados: number; falhaIA: number; spam: number;
        };
        period_30d: {
            agendamentos: number; remarcados: number; informativos: number;
            cancelados: number; modificados: number; falhaIA: number; spam: number;
        };
        period_90d: {
            agendamentos: number; remarcados: number; informativos: number;
            cancelados: number; modificados: number; falhaIA: number; spam: number;
        };
    };
}

export class ValidatedMetricsCalculatorService {
    private client = getAdminClient();

    constructor(private logger: Logger) {
        this.logger.info('Validated Metrics Calculator Service initialized');
    }

    /**
     * Calcula todas as 23 métricas validadas para um tenant
     */
    async calculateValidatedMetrics(
        tenantId: string,
        period: '7d' | '30d' | '90d'
    ): Promise<ValidatedMetricsResult> {
        const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        try {
            this.logger.info('Calculating validated metrics', { tenantId, period });

            // Calcular todas as métricas em paralelo para performance
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
                // Primary Business Metrics
                monthly_revenue: monthlyRevenue,
                new_customers: newCustomers,
                appointment_success_rate: appointmentSuccessRate,
                no_show_impact: noShowImpact,

                // Conversation Outcome Metrics
                ...conversationMetrics,

                // Complementary Metrics
                ...complementaryMetrics,

                // Historical Metrics
                ...historicalMetrics,

                // Tenant Outcomes
                tenant_outcomes: tenantOutcomes
            };

        } catch (error) {
            this.logger.error('Error calculating validated metrics', {
                tenantId,
                period,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * 1. Monthly Revenue - Baseada em appointments completed/confirmed
     */
    private async calculateMonthlyRevenue(tenantId: string, periodDays: number): Promise<number> {
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
     * 2. New Customers - Baseada em user_tenants + users
     */
    private async calculateNewCustomers(tenantId: string, periodDays: number): Promise<number> {
        const { data, error } = await this.client
            .from('user_tenants')
            .select('user_id, first_interaction')
            .eq('tenant_id', tenantId)
            .gte('first_interaction', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        // Contar clientes únicos novos
        const uniqueCustomers = new Set(data?.map(ut => ut.user_id) || []);
        return uniqueCustomers.size;
    }

    /**
     * 3. Appointment Success Rate - Baseada em conversation_outcome
     */
    private async calculateAppointmentSuccessRate(tenantId: string, periodDays: number): Promise<number> {
        const { data, error } = await this.client
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        const outcomes = data || [];
        const successOutcomes = ['appointment_created', 'appointment_confirmed'];
        const excludeOutcomes = ['wrong_number', 'spam_detected', 'appointment_noshow_followup'];

        const validOutcomes = outcomes.filter(o => o.conversation_outcome && !excludeOutcomes.includes(o.conversation_outcome));
        const successCount = outcomes.filter(o => o.conversation_outcome && successOutcomes.includes(o.conversation_outcome)).length;

        return validOutcomes.length > 0 ? (successCount / validOutcomes.length) * 100 : 0;
    }

    /**
     * 4. No-Show Impact - Baseada em appointments com status no_show
     */
    private async calculateNoShowImpact(tenantId: string, periodDays: number): Promise<ValidatedMetricsResult['no_show_impact']> {
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
    private async calculateConversationMetrics(tenantId: string, periodDays: number): Promise<{
        information_rate: ValidatedMetricsResult['information_rate'];
        spam_rate: ValidatedMetricsResult['spam_rate'];
        reschedule_rate: ValidatedMetricsResult['reschedule_rate'];
        cancellation_rate: ValidatedMetricsResult['cancellation_rate'];
    }> {
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
        const infoConversations = outcomes.filter(o => o.conversation_outcome && infoOutcomes.includes(o.conversation_outcome)).length;

        // Spam Rate  
        const spamOutcomes = ['wrong_number', 'spam_detected'];
        const spamConversations = outcomes.filter(o => o.conversation_outcome && spamOutcomes.includes(o.conversation_outcome)).length;

        // Reschedule Rate
        const rescheduleOutcomes = ['appointment_rescheduled', 'appointment_modified'];
        const rescheduleConversations = outcomes.filter(o => o.conversation_outcome && rescheduleOutcomes.includes(o.conversation_outcome)).length;

        // Cancellation Rate
        const cancellationOutcomes = ['appointment_cancelled'];
        const cancelledConversations = outcomes.filter(o => o.conversation_outcome && cancellationOutcomes.includes(o.conversation_outcome)).length;

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
    private async calculateComplementaryMetrics(tenantId: string, periodDays: number): Promise<{
        avg_minutes_per_conversation: ValidatedMetricsResult['avg_minutes_per_conversation'];
        total_system_cost_usd: ValidatedMetricsResult['total_system_cost_usd'];
        ai_failure_rate: ValidatedMetricsResult['ai_failure_rate'];
        confidence_score: ValidatedMetricsResult['confidence_score'];
        total_unique_customers: ValidatedMetricsResult['total_unique_customers'];
        services_available: ValidatedMetricsResult['services_available'];
        total_professionals: ValidatedMetricsResult['total_professionals'];
        monthly_platform_cost_brl: ValidatedMetricsResult['monthly_platform_cost_brl'];
        ai_interaction_7d: ValidatedMetricsResult['ai_interaction_7d'];
        ai_interaction_30d: ValidatedMetricsResult['ai_interaction_30d'];
        ai_interaction_90d: ValidatedMetricsResult['ai_interaction_90d'];
    }> {
        // Buscar dados de conversation_history
        const { data: conversations, error: convError } = await this.client
            .from('conversation_history')
            .select('created_at, api_cost_usd, processing_cost_usd, confidence_score, conversation_outcome, conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

        if (convError) throw convError;

        const conversationsData = conversations || [];

        // Average Minutes per Conversation - usando conversation_id do conversation_context
        const sessionDurations = new Map<string, { start: Date, end: Date }>();
        const uniqueSessions = new Set<string>();
        
        conversationsData.forEach(conv => {
            const conversationContext = conv.conversation_context as any;
            const conversationId = conversationContext?.conversation_id;
            if (conversationId && conv.created_at) {
                uniqueSessions.add(conversationId);
                const timestamp = new Date(conv.created_at);
                
                if (!sessionDurations.has(conversationId)) {
                    sessionDurations.set(conversationId, { start: timestamp, end: timestamp });
                } else {
                    const existing = sessionDurations.get(conversationId)!;
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
        const failedConversations = conversationsData.filter(conv => conv.conversation_outcome && aiFailureOutcomes.includes(conv.conversation_outcome)).length;

        // Confidence Score
        const validConfidenceScores = conversationsData.filter(conv => conv.confidence_score && conv.confidence_score > 0);
        const avgConfidence = validConfidenceScores.length > 0 
            ? validConfidenceScores.reduce((sum, conv) => sum + (conv.confidence_score || 0), 0) / validConfidenceScores.length
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
            // Total Unique Customers
            this.client.from('user_tenants').select('user_id').eq('tenant_id', tenantId),
            // Services Available
            this.client.from('services').select('name').eq('tenant_id', tenantId).eq('is_active', true),
            // Total Professionals
            this.client.from('professionals').select('id').eq('tenant_id', tenantId),
            // Monthly Platform Cost BRL
            this.client.from('subscription_payments').select('amount').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()),
            // AI Interaction 7d
            this.client.from('conversation_history').select('id').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
            // AI Interaction 30d
            this.client.from('conversation_history').select('id').eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            // AI Interaction 90d
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
    private async calculateHistoricalMetrics(tenantId: string): Promise<{
        historical_6months_conversations: ValidatedMetricsResult['historical_6months_conversations'];
        historical_6months_revenue: ValidatedMetricsResult['historical_6months_revenue'];
        historical_6months_customers: ValidatedMetricsResult['historical_6months_customers'];
    }> {
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

            const uniqueSessions = new Set(convData?.map(c => {
                const context = c.conversation_context as any;
                return context?.conversation_id;
            }).filter(Boolean) || []);
            (monthsData.conversations as any)[`month_${i}`] = uniqueSessions.size;

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
            (monthsData.revenue as any)[`month_${i}`] = monthRevenue;

            // Customers
            const { data: custData } = await this.client
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('created_at', monthStart.toISOString())
                .lt('created_at', monthEnd.toISOString());

            const uniqueCustomers = new Set(custData?.map(c => c.user_id) || []);
            (monthsData.customers as any)[`month_${i}`] = uniqueCustomers.size;
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
    private async calculateTenantOutcomes(tenantId: string): Promise<ValidatedMetricsResult['tenant_outcomes']> {
        const periods = [7, 30, 90];
        const outcomes = {
            period_7d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 },
            period_30d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 },
            period_90d: { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 }
        };

        for (let i = 0; i < periods.length; i++) {
            const periodDays = periods[i]!; // Non-null assertion - sabemos que existe
            const periodKey = `period_${periodDays}d` as keyof typeof outcomes;

            const { data } = await this.client
                .from('conversation_history')
                .select('conversation_outcome')
                .eq('tenant_id', tenantId)
                .gte('created_at', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString());

            const conversationOutcomes = data || [];

            outcomes[periodKey] = {
                agendamentos: conversationOutcomes.filter(c => ['appointment_created', 'appointment_confirmed'].includes(c.conversation_outcome || '')).length,
                remarcados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_rescheduled').length,
                informativos: conversationOutcomes.filter(c => 
                    ['info_request_fulfilled', 'price_inquiry', 'business_hours_inquiry', 'location_inquiry', 
                     'appointment_inquiry', 'appointment_noshow_followup'].includes(c.conversation_outcome || '')
                ).length,
                cancelados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_cancelled').length,
                modificados: conversationOutcomes.filter(c => c.conversation_outcome === 'appointment_modified').length,
                falhaIA: conversationOutcomes.filter(c => 
                    ['booking_abandoned', 'timeout_abandoned', 'conversation_timeout'].includes(c.conversation_outcome || '')
                ).length,
                spam: conversationOutcomes.filter(c => c.conversation_outcome && ['wrong_number', 'spam_detected'].includes(c.conversation_outcome)).length
            };
        }

        return outcomes;
    }

    /**
     * Salvar métricas validadas na tabela tenant_metrics
     */
    async saveValidatedMetrics(
        tenantId: string,
        period: '7d' | '30d' | '90d',
        metrics: ValidatedMetricsResult
    ): Promise<void> {
        const { error } = await this.client
            .from('tenant_metrics')
            .upsert({
                tenant_id: tenantId,
                metric_type: 'validated_metrics',
                period: period,
                calculated_at: new Date().toISOString(),
                metric_data: metrics as any,
                metricas_validadas: metrics as any
            }, {
                onConflict: 'tenant_id,metric_type,period'
            });

        if (error) throw error;

        this.logger.info('Validated metrics saved successfully', {
            tenantId,
            period,
            metricsCount: Object.keys(metrics).length
        });
    }
}