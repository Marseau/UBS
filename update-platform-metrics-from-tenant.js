/**
 * ATUALIZAR PLATFORM_METRICS BASEADO EM TENANT_METRICS
 * Reagregar métricas da plataforma a partir das métricas individuais dos tenants
 */

const { supabaseAdmin } = require('./src/config/database');

class PlatformMetricsUpdater {
    async updatePlatformMetrics() {
        console.log('🏢 ATUALIZANDO PLATFORM_METRICS BASEADO EM TENANT_METRICS\n');

        try {
            // 1. Calcular métricas agregadas para cada período
            const periods = [7, 30, 90];
            
            for (const periodDays of periods) {
                console.log(`📊 Calculando métricas da plataforma para ${periodDays} dias...`);
                
                const aggregatedMetrics = await this.aggregateTenantMetrics(periodDays);
                await this.savePlatformMetrics(periodDays, aggregatedMetrics);
                
                console.log(`✅ Métricas da plataforma salvas para ${periodDays} dias`);
            }

            // 2. Validar resultados
            await this.validatePlatformMetrics();

        } catch (error) {
            console.error('❌ Erro na atualização:', error.message);
        }
    }

    async aggregateTenantMetrics(periodDays) {
        console.log(`   🔍 Agregando métricas de tenants para ${periodDays} dias...`);

        // Buscar todas as métricas dos tenants para este período
        const { data: tenantMetrics, error } = await supabaseAdmin
            .from('tenant_metrics')
            .select('tenant_id, metric_data')
            .eq('metric_type', 'conversation_outcome_based')
            .eq('period', `${periodDays}d`)
            .order('calculated_at', { ascending: false });

        if (error) {
            throw new Error(`Erro ao buscar tenant_metrics: ${error.message}`);
        }

        console.log(`   📈 Encontradas métricas de ${tenantMetrics.length} tenants`);

        // Agregar dados
        let totalConversations = 0;
        let totalBillableConversations = 0;
        let totalAppointments = 0;
        let totalRealisticAppointments = 0;
        let totalEstimatedRevenue = 0;
        let totalTokens = 0;
        let totalApiCost = 0;

        // Agregação de outcomes e status
        const platformOutcomes = {};
        const platformAppointmentStatus = {};

        tenantMetrics.forEach(tenant => {
            const data = tenant.metric_data;
            
            totalConversations += data.total_conversations || 0;
            totalBillableConversations += data.billable_conversations || 0;
            totalAppointments += data.total_appointments || 0;
            totalRealisticAppointments += data.realistic_appointments || 0;
            totalEstimatedRevenue += data.estimated_revenue_brl || 0;
            totalTokens += data.total_tokens || 0;
            totalApiCost += data.total_api_cost || 0;

            // Agregar outcomes
            if (data.outcome_distribution) {
                Object.entries(data.outcome_distribution).forEach(([outcome, count]) => {
                    platformOutcomes[outcome] = (platformOutcomes[outcome] || 0) + count;
                });
            }

            // Agregar status de appointments
            if (data.appointment_status_distribution) {
                Object.entries(data.appointment_status_distribution).forEach(([status, count]) => {
                    platformAppointmentStatus[status] = (platformAppointmentStatus[status] || 0) + count;
                });
            }
        });

        // Calcular métricas derivadas
        const conversionRate = totalConversations > 0 ? 
            (totalBillableConversations / totalConversations * 100) : 0;

        const operationalEfficiency = totalConversations > 0 ? 
            (totalAppointments / totalConversations * 100) : 0;

        const spamRate = totalConversations > 0 ? 
            ((platformOutcomes['spam_detected'] || 0) / totalConversations * 100) : 0;

        // Calcular taxa de cancelamento (cancelled + no_show)
        const cancelledAppointments = (platformAppointmentStatus['cancelled'] || 0) + 
                                     (platformAppointmentStatus['no_show'] || 0);
        const cancellationRate = totalAppointments > 0 ? 
            (cancelledAppointments / totalAppointments * 100) : 0;

        // Estimativa de MRR baseado na cobrança por conversa
        // R$ 0,25 por conversa * conversas cobráveis * 30 dias
        const estimatedMRR = (totalBillableConversations * 0.25 * 30) / periodDays;

        return {
            period_days: periodDays,
            calculation_date: new Date().toISOString().split('T')[0],
            data_source: 'tenant_metrics_aggregation',
            
            // Métricas principais
            total_conversations: totalConversations,
            total_billable_conversations: totalBillableConversations,
            total_appointments: totalAppointments,
            total_realistic_appointments: totalRealisticAppointments,
            active_tenants: tenantMetrics.length,
            
            // Métricas financeiras
            total_revenue: totalEstimatedRevenue,
            platform_mrr: parseFloat(estimatedMRR.toFixed(2)),
            estimated_monthly_revenue: parseFloat((totalEstimatedRevenue * 30 / periodDays).toFixed(2)),
            
            // Métricas de performance
            operational_efficiency_pct: parseFloat(conversionRate.toFixed(2)),
            spam_rate_pct: parseFloat(spamRate.toFixed(2)),
            cancellation_rate_pct: parseFloat(cancellationRate.toFixed(2)),
            
            // Métricas técnicas
            total_tokens: totalTokens,
            total_api_cost_usd: totalApiCost,
            total_chat_minutes: Math.round(totalTokens / 4), // Estimativa: 4 tokens = 1 minuto
            total_ai_interactions: totalConversations, // Cada conversa é uma interação
            
            // Distribuições
            outcome_distribution: platformOutcomes,
            appointment_status_distribution: platformAppointmentStatus,
            
            // Índices de saúde da plataforma
            platform_health_score: this.calculateHealthScore(conversionRate, spamRate, cancellationRate),
            receita_uso_ratio: totalConversations > 0 ? 
                parseFloat((totalEstimatedRevenue / totalConversations).toFixed(2)) : 0,
            
            // Análise de distorção (tenants usando mais do que pagam)
            tenants_above_usage: 0, // Calculado posteriormente se necessário
            tenants_below_usage: 0,
            revenue_usage_distortion_index: 0
        };
    }

    calculateHealthScore(conversionRate, spamRate, cancellationRate) {
        // Score de 0-100 baseado nas métricas principais
        let score = 100;
        
        // Penalizar spam alto (ideal < 5%)
        if (spamRate > 10) score -= 20;
        else if (spamRate > 5) score -= 10;
        
        // Penalizar cancelamento alto (ideal < 15%)
        if (cancellationRate > 25) score -= 20;
        else if (cancellationRate > 15) score -= 10;
        
        // Bonificar conversão alta (ideal > 30%)
        if (conversionRate > 35) score += 10;
        else if (conversionRate < 20) score -= 15;
        
        return Math.max(0, Math.min(100, score));
    }

    async savePlatformMetrics(periodDays, metrics) {
        // Deletar métricas antigas deste período
        await supabaseAdmin
            .from('platform_metrics')
            .delete()
            .eq('period_days', periodDays)
            .eq('data_source', 'tenant_metrics_aggregation');

        // Inserir novas métricas
        const { error } = await supabaseAdmin
            .from('platform_metrics')
            .insert({
                calculation_date: metrics.calculation_date,
                period_days: metrics.period_days,
                data_source: metrics.data_source,
                total_revenue: metrics.total_revenue,
                total_appointments: metrics.total_appointments,
                total_customers: metrics.total_realistic_appointments, // Usar appointments como proxy
                total_ai_interactions: metrics.total_ai_interactions,
                active_tenants: metrics.active_tenants,
                platform_mrr: metrics.platform_mrr,
                total_chat_minutes: metrics.total_chat_minutes,
                total_conversations: metrics.total_conversations,
                total_valid_conversations: metrics.total_billable_conversations,
                total_spam_conversations: metrics.outcome_distribution?.spam_detected || 0,
                receita_uso_ratio: metrics.receita_uso_ratio,
                operational_efficiency_pct: metrics.operational_efficiency_pct,
                spam_rate_pct: metrics.spam_rate_pct,
                cancellation_rate_pct: metrics.cancellation_rate_pct,
                revenue_usage_distortion_index: metrics.revenue_usage_distortion_index,
                platform_health_score: metrics.platform_health_score,
                tenants_above_usage: metrics.tenants_above_usage,
                tenants_below_usage: metrics.tenants_below_usage
            });

        if (error) {
            throw new Error(`Erro ao salvar platform_metrics: ${error.message}`);
        }
    }

    async validatePlatformMetrics() {
        console.log('\n🔍 VALIDANDO PLATFORM_METRICS ATUALIZADOS:\n');

        const { data: platformMetrics, error } = await supabaseAdmin
            .from('platform_metrics')
            .select('*')
            .eq('data_source', 'tenant_metrics_aggregation')
            .order('created_at', { ascending: false })
            .limit(3);

        if (error) {
            console.log('❌ Erro na validação:', error.message);
            return;
        }

        console.log('📊 PLATFORM_METRICS ATUALIZADOS:');
        platformMetrics.forEach((metric, index) => {
            console.log(`   ${index + 1}. Período: ${metric.period_days} dias`);
            console.log(`      💬 Conversas: ${metric.total_conversations} (${metric.total_valid_conversations} cobráveis)`);
            console.log(`      📅 Appointments: ${metric.total_appointments}`);
            console.log(`      🏢 Tenants ativos: ${metric.active_tenants}`);
            console.log(`      💰 MRR: R$ ${metric.platform_mrr}`);
            console.log(`      🎯 Conversão: ${metric.operational_efficiency_pct}%`);
            console.log(`      🚫 Spam: ${metric.spam_rate_pct}%`);
            console.log(`      ❌ Cancelamento: ${metric.cancellation_rate_pct}%`);
            console.log(`      ❤️ Health Score: ${metric.platform_health_score}`);
            console.log('');
        });

        console.log('✅ PLATFORM_METRICS REAGREGADO COM BASE EM TENANT_METRICS!');
        console.log('🎯 As métricas agora refletem os dados de conversation_outcome');
        console.log('💰 Sistema pronto para cobrança por conversa baseada em outcomes');
    }
}

// Executar atualização
async function runUpdate() {
    const updater = new PlatformMetricsUpdater();
    
    try {
        await updater.updatePlatformMetrics();
    } catch (error) {
        console.error('❌ Erro geral:', error);
    } finally {
        process.exit(0);
    }
}

// Verificar se está sendo executado diretamente
if (require.main === module) {
    runUpdate();
}

module.exports = { PlatformMetricsUpdater };