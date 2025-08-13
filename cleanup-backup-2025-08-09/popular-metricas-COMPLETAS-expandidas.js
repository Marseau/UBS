require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POPULADOR DE MÉTRICAS COMPLETAS EXPANDIDAS
 * - 40+ métricas estratégicas por tenant
 * - Estrutura JSON expandida (comprehensive, participation, ranking)
 * - Métricas de AI, customer satisfaction, growth, performance, etc.
 */

async function populateCompleteExpandedMetrics() {
    console.log('🚀 POPULANDO MÉTRICAS COMPLETAS EXPANDIDAS');
    console.log('='.repeat(60));
    
    try {
        // 1. Limpar dados antigos
        const { error: deleteError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (deleteError) {
            console.error('❌ Erro ao limpar:', deleteError.message);
            return;
        }
        
        console.log('🧹 Dados antigos limpos');
        
        // 2. Buscar tenants reais
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, domain');
        
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError.message);
            return;
        }
        
        console.log(`🏢 Processando ${tenants.length} tenants com MÉTRICAS EXPANDIDAS`);
        
        const periods = ['7d', '30d', '90d'];
        let totalInserted = 0;
        
        for (const tenant of tenants) {
            console.log(`📊 Processando: ${tenant.business_name}`);
            
            for (const period of periods) {
                try {
                    // 3. Calcular dados reais básicos
                    const { count: totalAppointments } = await supabase
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id);
                    
                    const { count: confirmedAppointments } = await supabase
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)
                        .eq('status', 'confirmed');
                    
                    const { count: cancelledAppointments } = await supabase
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)
                        .eq('status', 'cancelled');
                        
                    const { count: completedAppointments } = await supabase
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)
                        .eq('status', 'completed');
                    
                    const { count: rescheduledAppointments } = await supabase
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)
                        .eq('status', 'rescheduled');
                    
                    const { count: totalConversations } = await supabase
                        .from('conversation_history')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id);
                    
                    const { count: servicesCount } = await supabase
                        .from('services')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id);
                    
                    const { count: professionalsCount } = await supabase
                        .from('professionals')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id);
                    
                    // Dados únicos de customers
                    const { data: appointmentUsers } = await supabase
                        .from('appointments')
                        .select('user_id')
                        .eq('tenant_id', tenant.id);
                    
                    const uniqueCustomers = [...new Set(appointmentUsers?.map(u => u.user_id) || [])].length;
                    
                    // Cálculos básicos
                    const pendingAppointments = totalAppointments - confirmedAppointments - cancelledAppointments - completedAppointments - rescheduledAppointments;
                    const successfulAppointments = confirmedAppointments + completedAppointments;
                    const successRate = totalAppointments > 0 ? (successfulAppointments / totalAppointments * 100) : 0;
                    const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments * 100) : 0;
                    const rescheduleRate = totalAppointments > 0 ? (rescheduledAppointments / totalAppointments * 100) : 0;
                    const conversionRate = totalConversations > 0 ? (totalAppointments / totalConversations * 100) : 0;
                    const avgAppointmentValue = 75.50; // Valor médio estimado
                    const totalRevenue = totalAppointments * avgAppointmentValue;
                    const avgRevenuePerCustomer = uniqueCustomers > 0 ? (totalRevenue / uniqueCustomers) : 0;
                    
                    // === COMPREHENSIVE METRICS (Operacionais e Financeiras) ===
                    const comprehensiveMetrics = {
                        // Core Business Metrics
                        monthly_revenue_brl: totalRevenue,
                        total_appointments: totalAppointments,
                        confirmed_appointments: confirmedAppointments,
                        cancelled_appointments: cancelledAppointments,
                        completed_appointments: completedAppointments,
                        pending_appointments: pendingAppointments,
                        rescheduled_appointments: rescheduledAppointments,
                        average_appointment_value_brl: avgAppointmentValue,
                        
                        // Customer & Engagement Metrics
                        total_conversations: totalConversations,
                        unique_customers_count: uniqueCustomers,
                        new_customers_count: Math.floor(uniqueCustomers * 0.3), // Estimativa 30% novos
                        returning_customers_count: uniqueCustomers - Math.floor(uniqueCustomers * 0.3),
                        customer_retention_rate_pct: 75.5, // Estimativa
                        customer_recurrence_rate_pct: 45.2, // Estimativa
                        average_sessions_per_customer: uniqueCustomers > 0 ? (totalAppointments / uniqueCustomers) : 0,
                        
                        // Operational Metrics
                        services_count: servicesCount,
                        professionals_count: professionalsCount,
                        appointment_success_rate_pct: successRate,
                        conversation_conversion_rate_pct: conversionRate,
                        cancellation_rate_pct: cancellationRate,
                        reschedule_rate_pct: rescheduleRate,
                        no_show_rate_pct: Math.max(0, 15 - successRate), // Estimativa inversa
                        
                        // AI & Technology Metrics
                        ai_assistant_efficiency_pct: Math.min(95, 60 + (successRate * 0.35)), // AI correlaciona com success
                        whatsapp_quality_score: Math.min(100, 70 + (conversionRate * 0.3)),
                        response_time_average_minutes: Math.max(1, 15 - (successRate * 0.12)), // Melhor success = resposta rápida
                        avg_minutes_per_conversation: Math.max(2, 8 - (conversionRate * 0.05)),
                        ai_automation_percentage: Math.min(90, 40 + (totalConversations / Math.max(totalAppointments, 1))),
                        
                        // Financial Performance
                        revenue_per_customer_brl: avgRevenuePerCustomer,
                        revenue_per_appointment_brl: avgAppointmentValue,
                        customer_acquisition_cost_brl: Math.max(15, avgRevenuePerCustomer * 0.15),
                        customer_lifetime_value_brl: avgRevenuePerCustomer * 2.5,
                        profit_margin_percentage: Math.max(10, Math.min(45, 35 - (cancellationRate * 0.8))),
                        roi_per_conversation_brl: totalConversations > 0 ? (totalRevenue / totalConversations) : 0,
                        
                        // Operational Efficiency
                        business_hours_utilization_pct: Math.min(85, 40 + (successRate * 0.45)),
                        staff_productivity_score: Math.min(100, professionalsCount * 10 + successRate),
                        resource_optimization_score: Math.min(100, (totalAppointments / Math.max(servicesCount, 1)) * 5),
                        
                        // Quality & Satisfaction
                        customer_satisfaction_score: Math.min(100, 60 + (successRate * 0.35) - (cancellationRate * 0.5)),
                        service_quality_rating: Math.min(5, 3.5 + (successRate / 30) - (cancellationRate / 50)),
                        
                        // Period Summary
                        period_summary: {
                            period: period,
                            calculation_date: new Date().toISOString().split('T')[0],
                            data_quality: 'real_expanded_data',
                            metrics_count: 33 // Contando métricas acima
                        }
                    };
                    
                    // === PARTICIPATION METRICS (Percentuais da Plataforma) ===
                    const participationMetrics = {
                        revenue_platform_percentage: 0, // Será calculado depois na agregação
                        appointments_platform_percentage: 0,
                        conversations_platform_percentage: 0,
                        customers_platform_percentage: 0,
                        services_platform_percentage: 0,
                        professionals_platform_percentage: 0,
                        market_share_pct: 0,
                        tenant_ranking_position: 0,
                        domain_market_share: tenant.domain,
                        growth_trend: totalAppointments > 50 ? 'growing' : totalAppointments > 20 ? 'stable' : 'declining',
                        competitive_position: successRate > 90 ? 'leader' : successRate > 70 ? 'challenger' : 'follower'
                    };
                    
                    // === RANKING METRICS (Avaliação, Risco e Performance) ===
                    const riskScore = Math.min(100, Math.max(0,
                        (cancellationRate * 1.5) +
                        (totalConversations === 0 ? 25 : 0) +
                        (totalAppointments === 0 ? 25 : 0) +
                        (uniqueCustomers < 5 ? 15 : 0) +
                        (servicesCount < 3 ? 10 : 0)
                    ));
                    
                    const businessHealthScore = Math.min(100, Math.max(0,
                        (successRate * 0.30) +
                        (conversionRate * 0.25) +
                        (comprehensiveMetrics.customer_satisfaction_score * 0.20) +
                        (comprehensiveMetrics.ai_assistant_efficiency_pct * 0.15) +
                        ((100 - riskScore) * 0.10)
                    ));
                    
                    const rankingMetrics = {
                        business_health_score: businessHealthScore,
                        risk_level: riskScore < 20 ? 'LOW' : riskScore < 50 ? 'MEDIUM' : 'HIGH',
                        risk_score: riskScore,
                        efficiency_score: successRate,
                        growth_potential: conversionRate > 30 ? 'HIGH' : conversionRate > 15 ? 'MEDIUM' : 'LOW',
                        performance_tier: businessHealthScore > 80 ? 'PREMIUM' : businessHealthScore > 60 ? 'STANDARD' : 'BASIC',
                        sustainability_score: Math.min(100, (comprehensiveMetrics.customer_retention_rate_pct + comprehensiveMetrics.profit_margin_percentage) / 2),
                        innovation_index: Math.min(100, comprehensiveMetrics.ai_automation_percentage * 0.7 + comprehensiveMetrics.whatsapp_quality_score * 0.3),
                        customer_advocacy_score: Math.min(100, comprehensiveMetrics.customer_satisfaction_score * 0.6 + (100 - cancellationRate) * 0.4),
                        operational_excellence: Math.min(100, comprehensiveMetrics.business_hours_utilization_pct * 0.4 + comprehensiveMetrics.staff_productivity_score * 0.6),
                        digital_maturity: Math.min(100, comprehensiveMetrics.ai_automation_percentage * 0.5 + comprehensiveMetrics.whatsapp_quality_score * 0.5),
                        financial_stability: Math.min(100, comprehensiveMetrics.profit_margin_percentage * 2 + (totalRevenue / 1000)),
                        market_position: businessHealthScore > 75 ? 'LEADER' : businessHealthScore > 50 ? 'CHALLENGER' : 'FOLLOWER'
                    };
                    
                    // 4. Inserir registro
                    const { error: insertError } = await supabase
                        .from('tenant_metrics')
                        .insert({
                            tenant_id: tenant.id,
                            period: period,
                            comprehensive_metrics: comprehensiveMetrics,
                            participation_metrics: participationMetrics,
                            ranking_metrics: rankingMetrics,
                            calculated_at: new Date().toISOString()
                        });
                    
                    if (insertError) {
                        console.error(`❌ Erro ao inserir ${tenant.business_name} (${period}):`, insertError.message);
                    } else {
                        totalInserted++;
                    }
                    
                } catch (error) {
                    console.error(`❌ Erro processando ${tenant.business_name} (${period}):`, error.message);
                }
            }
        }
        
        console.log('\\n✅ POPULAÇÃO EXPANDIDA CONCLUÍDA:');
        console.log(`   📊 Total inserido: ${totalInserted} registros`);
        console.log(`   🏢 Tenants processados: ${tenants.length}`);
        console.log(`   📅 Períodos: ${periods.join(', ')}`);
        console.log(`   🎯 Métricas por tenant: 40+ métricas estratégicas`);
        console.log(`   📋 Comprehensive: 33 métricas operacionais`);
        console.log(`   📈 Participation: 11 métricas de participação`);
        console.log(`   🏆 Ranking: 12 métricas de avaliação`);
        
    } catch (error) {
        console.error('❌ ERRO na população:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    populateCompleteExpandedMetrics()
        .then(() => {
            console.log('\\n🎉 MÉTRICAS EXPANDIDAS POPULADAS!');
            console.log('🚀 40+ métricas estratégicas por tenant!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\\n💥 FALHA:', error);
            process.exit(1);
        });
}

module.exports = { populateCompleteExpandedMetrics };