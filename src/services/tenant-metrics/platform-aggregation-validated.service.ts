/**
 * Platform Aggregation Service for Validated Metrics
 * Agrega as 23 métricas validadas dos tenants para platform_metrics
 * 
 * @version 1.0.0
 * @author UBS Team
 */

import { Logger } from 'winston';
import { getAdminClient } from '../../config/database';
import { ValidatedMetricsResult } from './validated-metrics-calculator.service';
import { Database } from '../../types/database.types';

export interface PlatformValidatedMetrics {
    // Aggregated Primary Business Metrics
    total_monthly_revenue: number;
    total_new_customers: number;
    avg_appointment_success_rate: number;
    total_no_show_impact: {
        total_impact_percentage: number;
        total_lost_revenue: number;
        total_no_show_count: number;
        total_appointments: number;
        total_potential_revenue: number;
    };

    // Aggregated Conversation Metrics
    platform_information_rate: {
        avg_percentage: number;
        total_info_conversations: number;
        total_conversations: number;
    };
    platform_spam_rate: {
        avg_percentage: number;
        total_spam_conversations: number;
        total_conversations: number;
    };
    platform_reschedule_rate: {
        avg_percentage: number;
        total_reschedule_conversations: number;
        total_conversations: number;
    };
    platform_cancellation_rate: {
        avg_percentage: number;
        total_cancelled_conversations: number;
        total_conversations: number;
    };

    // Aggregated Complementary Metrics
    platform_avg_minutes_per_conversation: {
        avg_minutes: number;
        total_minutes: number;
        total_conversations: number;
    };
    platform_total_system_cost_usd: {
        total_cost_usd: number;
        total_api_cost_usd: number;
        total_processing_cost_usd: number;
        total_conversations: number;
    };
    platform_ai_failure_rate: {
        avg_failure_percentage: number;
        total_failed_conversations: number;
        total_conversations: number;
    };
    platform_confidence_score: {
        platform_avg_confidence: number;
        total_conversations: number;
    };
    platform_total_unique_customers: {
        total_count: number;
    };
    platform_services_available: {
        all_services: string[];
        total_count: number;
    };
    platform_total_professionals: {
        total_count: number;
    };
    platform_monthly_cost_brl: {
        total_cost_brl: number;
        period_days: number;
    };
    platform_ai_interactions: {
        total_7d: number;
        total_30d: number;
        total_90d: number;
    };

    // Aggregated Historical Metrics
    platform_historical_6months: {
        conversations: {
            total_month_0: number; total_month_1: number; total_month_2: number;
            total_month_3: number; total_month_4: number; total_month_5: number;
        };
        revenue: {
            total_month_0: number; total_month_1: number; total_month_2: number;
            total_month_3: number; total_month_4: number; total_month_5: number;
        };
        customers: {
            total_month_0: number; total_month_1: number; total_month_2: number;
            total_month_3: number; total_month_4: number; total_month_5: number;
        };
    };

    // Aggregated Tenant Outcomes
    platform_tenant_outcomes: {
        period_7d: {
            total_agendamentos: number; total_remarcados: number; total_informativos: number;
            total_cancelados: number; total_modificados: number; total_falhaIA: number; total_spam: number;
        };
        period_30d: {
            total_agendamentos: number; total_remarcados: number; total_informativos: number;
            total_cancelados: number; total_modificados: number; total_falhaIA: number; total_spam: number;
        };
        period_90d: {
            total_agendamentos: number; total_remarcados: number; total_informativos: number;
            total_cancelados: number; total_modificados: number; total_falhaIA: number; total_spam: number;
        };
    };

    // Metadata
    calculation_metadata: {
        calculation_date: string;
        period: string;
        tenants_processed: number;
        active_tenants: number;
        data_source: string;
    };
}

export class PlatformAggregationValidatedService {
    private client = getAdminClient();

    constructor(private logger: Logger) {
        this.logger.info('Platform Aggregation Validated Service initialized');
    }

    /**
     * Agrega todas as métricas validadas dos tenants para platform_metrics
     */
    async aggregateValidatedPlatformMetrics(
        period: '7d' | '30d' | '90d',
        calculationDate?: string
    ): Promise<PlatformValidatedMetrics> {
        const finalDate = calculationDate || new Date().toISOString().split('T')[0];
        try {
            this.logger.info('Starting platform aggregation for validated metrics', { period, calculationDate: finalDate });

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
                tm.tenant_id && 
                tm.metricas_validadas && 
                Object.keys(tm.metricas_validadas).length > 0
            ) || [];

            this.logger.info('Found tenant metrics for aggregation', {
                period,
                tenants: validTenantMetrics.length
            });

            if (validTenantMetrics.length === 0) {
                throw new Error(`No validated metrics found for period ${period} on ${finalDate}`);
            }

            // Realizar agregação de todas as métricas
            const aggregatedMetrics = this.aggregateAllValidatedMetrics(validTenantMetrics, period);

            // Salvar métricas agregadas
            await this.savePlatformValidatedMetrics(aggregatedMetrics, finalDate!);

            return aggregatedMetrics;

        } catch (error) {
            this.logger.error('Error aggregating platform validated metrics', {
                period,
                calculationDate,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Agrega todas as métricas validadas dos tenants
     */
    private aggregateAllValidatedMetrics(
        tenantMetrics: { tenant_id: string | null; metricas_validadas: any }[],
        period: '7d' | '30d' | '90d'
    ): PlatformValidatedMetrics {
        const tenantsCount = tenantMetrics.length;
        let activeTenants = 0;

        // Inicializar contadores
        let totalRevenue = 0;
        let totalNewCustomers = 0;
        let totalSuccessRates = 0;
        let validSuccessRates = 0;

        // No-Show aggregation
        let totalLostRevenue = 0;
        let totalNoShowCount = 0;
        let totalAppointments = 0;
        let totalPotentialRevenue = 0;

        // Conversation metrics
        let totalInfoConversations = 0;
        let totalSpamConversations = 0;
        let totalRescheduleConversations = 0;
        let totalCancelledConversations = 0;
        let totalConversations = 0;

        // Complementary metrics
        let totalMinutes = 0;
        let totalConversationSessions = 0;
        let totalCostUsd = 0;
        let totalApiCostUsd = 0;
        let totalProcessingCostUsd = 0;
        let totalFailedConversations = 0;
        let totalConfidenceScore = 0;
        let validConfidenceScores = 0;
        let totalUniqueCustomers = 0;
        let allServices = new Set<string>();
        let totalProfessionals = 0;
        let totalPlatformCostBrl = 0;
        let totalAI7d = 0;
        let totalAI30d = 0;
        let totalAI90d = 0;

        // Historical aggregations
        const historicalConversations = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        const historicalRevenue = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        const historicalCustomers = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };

        // Tenant outcomes aggregation
        const outcomes7d = { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 };
        const outcomes30d = { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 };
        const outcomes90d = { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 };

        // Processar cada tenant
        tenantMetrics.forEach(tm => {
            const metrics = tm.metricas_validadas as ValidatedMetricsResult;
            
            // Verificar se tenant está ativo
            const isActive = metrics.monthly_revenue > 0 || 
                           metrics.new_customers > 0 || 
                           metrics.total_unique_customers.count > 0;
            if (isActive) activeTenants++;

            // Primary Business Metrics
            totalRevenue += metrics.monthly_revenue || 0;
            totalNewCustomers += metrics.new_customers || 0;
            
            if (metrics.appointment_success_rate && metrics.appointment_success_rate > 0) {
                totalSuccessRates += metrics.appointment_success_rate;
                validSuccessRates++;
            }

            // No-Show Impact
            if (metrics.no_show_impact) {
                totalLostRevenue += metrics.no_show_impact.lost_revenue || 0;
                totalNoShowCount += metrics.no_show_impact.no_show_count || 0;
                totalAppointments += metrics.no_show_impact.total_appointments || 0;
                totalPotentialRevenue += metrics.no_show_impact.total_potential_revenue || 0;
            }

            // Conversation Metrics
            if (metrics.information_rate) {
                totalInfoConversations += metrics.information_rate.info_conversations || 0;
            }
            if (metrics.spam_rate) {
                totalSpamConversations += metrics.spam_rate.spam_conversations || 0;
            }
            if (metrics.reschedule_rate) {
                totalRescheduleConversations += metrics.reschedule_rate.reschedule_conversations || 0;
            }
            if (metrics.cancellation_rate) {
                totalCancelledConversations += metrics.cancellation_rate.cancelled_conversations || 0;
                totalConversations = Math.max(totalConversations, metrics.cancellation_rate.total_conversations || 0);
            }

            // Complementary Metrics
            if (metrics.avg_minutes_per_conversation) {
                totalMinutes += metrics.avg_minutes_per_conversation.total_minutes || 0;
                totalConversationSessions += metrics.avg_minutes_per_conversation.total_conversations || 0;
            }

            if (metrics.total_system_cost_usd) {
                totalCostUsd += metrics.total_system_cost_usd.total_cost_usd || 0;
                totalApiCostUsd += metrics.total_system_cost_usd.api_cost_usd || 0;
                totalProcessingCostUsd += metrics.total_system_cost_usd.processing_cost_usd || 0;
            }

            if (metrics.ai_failure_rate) {
                totalFailedConversations += metrics.ai_failure_rate.failed_conversations || 0;
            }

            if (metrics.confidence_score) {
                totalConfidenceScore += metrics.confidence_score.avg_confidence || 0;
                if (metrics.confidence_score.avg_confidence > 0) validConfidenceScores++;
            }

            totalUniqueCustomers += metrics.total_unique_customers?.count || 0;

            if (metrics.services_available?.services) {
                metrics.services_available.services.forEach(service => allServices.add(service));
            }

            totalProfessionals += metrics.total_professionals?.count || 0;
            totalPlatformCostBrl += metrics.monthly_platform_cost_brl?.cost_brl || 0;

            // AI Interactions
            totalAI7d += metrics.ai_interaction_7d?.system_messages_total || 0;
            totalAI30d += metrics.ai_interaction_30d?.system_messages_total || 0;
            totalAI90d += metrics.ai_interaction_90d?.system_messages_total || 0;

            // Historical Metrics
            if (metrics.historical_6months_conversations) {
                Object.keys(historicalConversations).forEach(month => {
                    (historicalConversations as any)[month] += metrics.historical_6months_conversations[month as keyof typeof metrics.historical_6months_conversations] || 0;
                });
            }

            if (metrics.historical_6months_revenue) {
                Object.keys(historicalRevenue).forEach(month => {
                    (historicalRevenue as any)[month] += metrics.historical_6months_revenue[month as keyof typeof metrics.historical_6months_revenue] || 0;
                });
            }

            if (metrics.historical_6months_customers) {
                Object.keys(historicalCustomers).forEach(month => {
                    (historicalCustomers as any)[month] += metrics.historical_6months_customers[month as keyof typeof metrics.historical_6months_customers] || 0;
                });
            }

            // Tenant Outcomes
            if (metrics.tenant_outcomes) {
                // 7d
                outcomes7d.agendamentos += metrics.tenant_outcomes.period_7d.agendamentos || 0;
                outcomes7d.remarcados += metrics.tenant_outcomes.period_7d.remarcados || 0;
                outcomes7d.informativos += metrics.tenant_outcomes.period_7d.informativos || 0;
                outcomes7d.cancelados += metrics.tenant_outcomes.period_7d.cancelados || 0;
                outcomes7d.modificados += metrics.tenant_outcomes.period_7d.modificados || 0;
                outcomes7d.falhaIA += metrics.tenant_outcomes.period_7d.falhaIA || 0;
                outcomes7d.spam += metrics.tenant_outcomes.period_7d.spam || 0;

                // 30d
                outcomes30d.agendamentos += metrics.tenant_outcomes.period_30d.agendamentos || 0;
                outcomes30d.remarcados += metrics.tenant_outcomes.period_30d.remarcados || 0;
                outcomes30d.informativos += metrics.tenant_outcomes.period_30d.informativos || 0;
                outcomes30d.cancelados += metrics.tenant_outcomes.period_30d.cancelados || 0;
                outcomes30d.modificados += metrics.tenant_outcomes.period_30d.modificados || 0;
                outcomes30d.falhaIA += metrics.tenant_outcomes.period_30d.falhaIA || 0;
                outcomes30d.spam += metrics.tenant_outcomes.period_30d.spam || 0;

                // 90d
                outcomes90d.agendamentos += metrics.tenant_outcomes.period_90d.agendamentos || 0;
                outcomes90d.remarcados += metrics.tenant_outcomes.period_90d.remarcados || 0;
                outcomes90d.informativos += metrics.tenant_outcomes.period_90d.informativos || 0;
                outcomes90d.cancelados += metrics.tenant_outcomes.period_90d.cancelados || 0;
                outcomes90d.modificados += metrics.tenant_outcomes.period_90d.modificados || 0;
                outcomes90d.falhaIA += metrics.tenant_outcomes.period_90d.falhaIA || 0;
                outcomes90d.spam += metrics.tenant_outcomes.period_90d.spam || 0;
            }
        });

        // Construir resultado agregado
        const aggregatedResult: PlatformValidatedMetrics = {
            // Primary Business Metrics
            total_monthly_revenue: totalRevenue,
            total_new_customers: totalNewCustomers,
            avg_appointment_success_rate: validSuccessRates > 0 ? totalSuccessRates / validSuccessRates : 0,
            
            total_no_show_impact: {
                total_impact_percentage: totalAppointments > 0 ? (totalNoShowCount / totalAppointments) * 100 : 0,
                total_lost_revenue: totalLostRevenue,
                total_no_show_count: totalNoShowCount,
                total_appointments: totalAppointments,
                total_potential_revenue: totalPotentialRevenue
            },

            // Conversation Metrics
            platform_information_rate: {
                avg_percentage: totalConversations > 0 ? (totalInfoConversations / totalConversations) * 100 : 0,
                total_info_conversations: totalInfoConversations,
                total_conversations: totalConversations
            },
            platform_spam_rate: {
                avg_percentage: totalConversations > 0 ? (totalSpamConversations / totalConversations) * 100 : 0,
                total_spam_conversations: totalSpamConversations,
                total_conversations: totalConversations
            },
            platform_reschedule_rate: {
                avg_percentage: totalConversations > 0 ? (totalRescheduleConversations / totalConversations) * 100 : 0,
                total_reschedule_conversations: totalRescheduleConversations,
                total_conversations: totalConversations
            },
            platform_cancellation_rate: {
                avg_percentage: totalConversations > 0 ? (totalCancelledConversations / totalConversations) * 100 : 0,
                total_cancelled_conversations: totalCancelledConversations,
                total_conversations: totalConversations
            },

            // Complementary Metrics
            platform_avg_minutes_per_conversation: {
                avg_minutes: totalConversationSessions > 0 ? totalMinutes / totalConversationSessions : 0,
                total_minutes: totalMinutes,
                total_conversations: totalConversationSessions
            },
            platform_total_system_cost_usd: {
                total_cost_usd: totalCostUsd,
                total_api_cost_usd: totalApiCostUsd,
                total_processing_cost_usd: totalProcessingCostUsd,
                total_conversations: totalConversationSessions
            },
            platform_ai_failure_rate: {
                avg_failure_percentage: totalConversations > 0 ? (totalFailedConversations / totalConversations) * 100 : 0,
                total_failed_conversations: totalFailedConversations,
                total_conversations: totalConversations
            },
            platform_confidence_score: {
                platform_avg_confidence: validConfidenceScores > 0 ? totalConfidenceScore / validConfidenceScores : 0,
                total_conversations: validConfidenceScores
            },
            platform_total_unique_customers: {
                total_count: totalUniqueCustomers
            },
            platform_services_available: {
                all_services: Array.from(allServices),
                total_count: allServices.size
            },
            platform_total_professionals: {
                total_count: totalProfessionals
            },
            platform_monthly_cost_brl: {
                total_cost_brl: totalPlatformCostBrl,
                period_days: period === '7d' ? 7 : period === '30d' ? 30 : 90
            },
            platform_ai_interactions: {
                total_7d: totalAI7d,
                total_30d: totalAI30d,
                total_90d: totalAI90d
            },

            // Historical Metrics
            platform_historical_6months: {
                conversations: {
                    total_month_0: historicalConversations.month_0,
                    total_month_1: historicalConversations.month_1,
                    total_month_2: historicalConversations.month_2,
                    total_month_3: historicalConversations.month_3,
                    total_month_4: historicalConversations.month_4,
                    total_month_5: historicalConversations.month_5
                },
                revenue: {
                    total_month_0: historicalRevenue.month_0,
                    total_month_1: historicalRevenue.month_1,
                    total_month_2: historicalRevenue.month_2,
                    total_month_3: historicalRevenue.month_3,
                    total_month_4: historicalRevenue.month_4,
                    total_month_5: historicalRevenue.month_5
                },
                customers: {
                    total_month_0: historicalCustomers.month_0,
                    total_month_1: historicalCustomers.month_1,
                    total_month_2: historicalCustomers.month_2,
                    total_month_3: historicalCustomers.month_3,
                    total_month_4: historicalCustomers.month_4,
                    total_month_5: historicalCustomers.month_5
                }
            },

            // Tenant Outcomes
            platform_tenant_outcomes: {
                period_7d: {
                    total_agendamentos: outcomes7d.agendamentos,
                    total_remarcados: outcomes7d.remarcados,
                    total_informativos: outcomes7d.informativos,
                    total_cancelados: outcomes7d.cancelados,
                    total_modificados: outcomes7d.modificados,
                    total_falhaIA: outcomes7d.falhaIA,
                    total_spam: outcomes7d.spam
                },
                period_30d: {
                    total_agendamentos: outcomes30d.agendamentos,
                    total_remarcados: outcomes30d.remarcados,
                    total_informativos: outcomes30d.informativos,
                    total_cancelados: outcomes30d.cancelados,
                    total_modificados: outcomes30d.modificados,
                    total_falhaIA: outcomes30d.falhaIA,
                    total_spam: outcomes30d.spam
                },
                period_90d: {
                    total_agendamentos: outcomes90d.agendamentos,
                    total_remarcados: outcomes90d.remarcados,
                    total_informativos: outcomes90d.informativos,
                    total_cancelados: outcomes90d.cancelados,
                    total_modificados: outcomes90d.modificados,
                    total_falhaIA: outcomes90d.falhaIA,
                    total_spam: outcomes90d.spam
                }
            },

            // Metadata
            calculation_metadata: {
                calculation_date: new Date().toISOString().split('T')[0]!,
                period: period,
                tenants_processed: tenantsCount,
                active_tenants: activeTenants,
                data_source: 'validated_metrics_aggregation'
            }
        };

        return aggregatedResult;
    }

    /**
     * Salva métricas agregadas na tabela platform_metrics
     */
    private async savePlatformValidatedMetrics(
        metrics: PlatformValidatedMetrics,
        calculationDate: string
    ): Promise<void> {
        const { error } = await this.client
            .from('platform_metrics')
            .upsert({
                calculation_date: calculationDate,
                period: metrics.calculation_metadata.period,
                data_source: 'validated_metrics_aggregation',
                comprehensive_metrics: {},
                participation_metrics: {},
                ranking_metrics: {},
                metricas_validadas: metrics as any
            }, {
                onConflict: 'calculation_date,period'
            });

        if (error) throw error;

        this.logger.info('Platform validated metrics saved successfully', {
            calculationDate,
            period: metrics.calculation_metadata.period,
            tenantsProcessed: metrics.calculation_metadata.tenants_processed,
            totalRevenue: metrics.total_monthly_revenue
        });
    }

    /**
     * Executar agregação para todos os períodos
     */
    async aggregateAllPeriods(calculationDate?: string): Promise<{
        sevenDays: PlatformValidatedMetrics;
        thirtyDays: PlatformValidatedMetrics;
        ninetyDays: PlatformValidatedMetrics;
    }> {
        const targetDate = calculationDate || new Date().toISOString().split('T')[0];

        this.logger.info('Starting aggregation for all periods - validated metrics', { targetDate });

        const [sevenDays, thirtyDays, ninetyDays] = await Promise.all([
            this.aggregateValidatedPlatformMetrics('7d', targetDate),
            this.aggregateValidatedPlatformMetrics('30d', targetDate),
            this.aggregateValidatedPlatformMetrics('90d', targetDate)
        ]);

        return { sevenDays, thirtyDays, ninetyDays };
    }
}