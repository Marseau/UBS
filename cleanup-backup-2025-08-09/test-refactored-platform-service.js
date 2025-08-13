#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mock do serviço refatorado para teste
class PlatformAggregationServiceTest {
    constructor() {
        this.client = supabase;
    }

    groupMetricsByType(metrics) {
        const grouped = {};
        metrics.forEach(metric => {
            if (!grouped[metric.metric_type]) {
                grouped[metric.metric_type] = [];
            }
            grouped[metric.metric_type].push(metric);
        });
        return grouped;
    }

    calculatePlatformMRR(custoMetrics) {
        let total = 0;
        let contributors = 0;

        custoMetrics.forEach(metric => {
            const data = metric.metric_data || {};
            const custo = parseFloat(data.custo_total_plataforma || 0);
            if (custo > 0) {
                total += custo;
                contributors++;
            }
        });

        console.log(`💰 Platform MRR: R$ ${total.toFixed(2)} (${contributors}/${custoMetrics.length} tenants)`);
        return { total, contributors };
    }

    calculateOperationalMetrics(comprehensiveMetrics) {
        let total_revenue = 0;
        let total_appointments = 0;
        let total_chat_minutes = 0;
        let total_new_customers = 0;
        let total_sessions = 0;
        let total_professionals = 0;
        let total_services = 0;
        let active_tenants = 0;

        comprehensiveMetrics.forEach(metric => {
            const data = metric.metric_data || {};
            
            total_revenue += parseFloat(data.monthly_revenue_brl || 0);
            total_appointments += parseInt(data.total_appointments || 0);
            total_chat_minutes += parseFloat(data.total_chat_minutes || 0);
            total_new_customers += parseInt(data.new_customers_count || 0);
            total_sessions += parseInt(data.unique_sessions_count || 0);
            total_professionals += parseInt(data.professionals_count || 0);
            total_services += parseInt(data.services_count || 0);

            if (parseInt(data.total_appointments || 0) > 0) {
                active_tenants++;
            }
        });

        console.log(`📊 Operacional: ${active_tenants} tenants ativos, ${total_appointments} appointments`);
        return {
            total_revenue,
            total_appointments,
            total_chat_minutes,
            total_new_customers,
            total_sessions,
            total_professionals,
            total_services,
            active_tenants
        };
    }

    calculatePerformanceMetrics(comprehensiveMetrics) {
        const averages = {};
        const fields = [
            'appointment_success_rate',
            'whatsapp_quality_score',
            'customer_satisfaction_score',
            'conversation_conversion_rate',
            'customer_retention_rate',
            'customer_recurrence_rate',
            'ai_assistant_efficiency',
            'response_time_average',
            'business_hours_utilization',
            'avg_minutes_per_conversation',
            'customer_acquisition_cost',
            'profit_margin_percentage',
            'revenue_per_customer',
            'revenue_per_appointment',
            'roi_per_conversation'
        ];

        fields.forEach(field => {
            const validValues = comprehensiveMetrics
                .map(m => parseFloat(m.metric_data?.[field] || 0))
                .filter(v => v > 0);
            
            averages[field] = validValues.length > 0 ? 
                validValues.reduce((sum, val) => sum + val, 0) / validValues.length : 0;
        });

        console.log(`📈 Performance: ${averages.appointment_success_rate?.toFixed(1)}% success rate`);
        return {
            avg_appointment_success_rate: averages.appointment_success_rate,
            avg_whatsapp_quality_score: averages.whatsapp_quality_score,
            avg_customer_satisfaction_score: averages.customer_satisfaction_score,
            avg_conversion_rate: averages.conversation_conversion_rate,
            avg_customer_retention_rate: averages.customer_retention_rate,
            avg_customer_recurrence_rate: averages.customer_recurrence_rate,
            avg_ai_assistant_efficiency: averages.ai_assistant_efficiency,
            avg_response_time: averages.response_time_average,
            avg_business_hours_utilization: averages.business_hours_utilization,
            avg_minutes_per_conversation: averages.avg_minutes_per_conversation,
            avg_customer_acquisition_cost: averages.customer_acquisition_cost,
            avg_profit_margin_percentage: averages.profit_margin_percentage,
            avg_revenue_per_customer: averages.revenue_per_customer,
            avg_revenue_per_appointment: averages.revenue_per_appointment,
            avg_roi_per_conversation: averages.roi_per_conversation
        };
    }

    calculateCostMetrics(billingMetrics) {
        let total_cost_usd = 0;
        let total_billable_conversations = 0;
        const efficiencies = [];
        const spamRates = [];
        const costPerConversations = [];

        billingMetrics.forEach(metric => {
            const data = metric.metric_data || {};
            
            total_cost_usd += parseFloat(data.total_cost_usd || 0);
            total_billable_conversations += parseInt(data.billable_conversations || 0);

            if (parseFloat(data.efficiency_pct || 0) > 0) {
                efficiencies.push(parseFloat(data.efficiency_pct));
            }
            if (parseFloat(data.spam_rate_pct || 0) >= 0) {
                spamRates.push(parseFloat(data.spam_rate_pct));
            }
            if (parseFloat(data.avg_cost_per_conversation || 0) > 0) {
                costPerConversations.push(parseFloat(data.avg_cost_per_conversation));
            }
        });

        const avg_efficiency_pct = efficiencies.length > 0 ? 
            efficiencies.reduce((sum, val) => sum + val, 0) / efficiencies.length : 0;
        
        const avg_spam_rate_pct = spamRates.length > 0 ? 
            spamRates.reduce((sum, val) => sum + val, 0) / spamRates.length : 0;

        const avg_cost_per_conversation = costPerConversations.length > 0 ? 
            costPerConversations.reduce((sum, val) => sum + val, 0) / costPerConversations.length : 0;

        console.log(`💸 Custo: $${total_cost_usd.toFixed(2)} USD, ${total_billable_conversations} conversas`);
        return {
            total_cost_usd,
            avg_cost_per_conversation,
            total_billable_conversations,
            avg_efficiency_pct,
            avg_spam_rate_pct
        };
    }

    calculateValidationMetrics(revenueMetrics) {
        let total_revenue = 0;
        let total_appointments = 0;
        let unique_customers = 0;

        revenueMetrics.forEach(metric => {
            const data = metric.metric_data || {};
            total_revenue += parseFloat(data.total_revenue || 0);
            total_appointments += parseInt(data.total_appointments || 0);
            unique_customers += parseInt(data.unique_customers || 0);
        });

        console.log(`🔍 Validação: R$ ${total_revenue.toFixed(2)} (${revenueMetrics.length} tenants)`);
        return { total_revenue, total_appointments, unique_customers };
    }

    calculateDerivedMetrics(platformMrrData, operationalData, performanceData) {
        const revenue_platform_ratio = platformMrrData.total > 0 ? 
            operationalData.total_revenue / platformMrrData.total : 0;

        const avg_revenue_per_tenant = operationalData.active_tenants > 0 ? 
            operationalData.total_revenue / operationalData.active_tenants : 0;

        const avg_appointments_per_tenant = operationalData.active_tenants > 0 ? 
            operationalData.total_appointments / operationalData.active_tenants : 0;

        const avg_sessions_per_tenant = operationalData.active_tenants > 0 ? 
            operationalData.total_sessions / operationalData.active_tenants : 0;

        const avg_customers_per_tenant = operationalData.active_tenants > 0 ? 
            operationalData.total_new_customers / operationalData.active_tenants : 0;

        const platform_utilization_score = (
            (performanceData.avg_appointment_success_rate * 0.3) +
            (performanceData.avg_customer_satisfaction_score * 0.25) +
            (performanceData.avg_ai_assistant_efficiency * 0.25) +
            ((100 - performanceData.avg_spam_rate_pct) * 0.2)
        ) * 0.01 * 100;

        console.log(`📊 Derivadas: ${revenue_platform_ratio.toFixed(2)}x ratio, score ${platform_utilization_score.toFixed(1)}`);
        return {
            revenue_platform_ratio,
            avg_revenue_per_tenant,
            avg_appointments_per_tenant,
            avg_sessions_per_tenant,
            avg_customers_per_tenant,
            platform_utilization_score
        };
    }

    calculateDataQuality(validationData, operationalData) {
        if (operationalData.total_revenue === 0 || validationData.total_revenue === 0) {
            return 85.0;
        }

        const difference = Math.abs(operationalData.total_revenue - validationData.total_revenue);
        const percentDiff = (difference / operationalData.total_revenue) * 100;

        if (percentDiff < 1) return 98.0;
        if (percentDiff < 5) return 95.0;
        if (percentDiff < 10) return 90.0;
        if (percentDiff < 20) return 85.0;
        return 75.0;
    }

    async aggregatePlatformMetricsFromTenants(period = '30d') {
        const startTime = Date.now();
        console.log(`🔄 [REFACTORED TEST] Agregando métricas da plataforma - período: ${period}`);
        
        try {
            const targetDate = new Date().toISOString().split('T')[0];
            
            // 1. BUSCAR TODAS AS MÉTRICAS DOS TENANTS
            console.log('📊 1. Buscando dados de tenant_metrics...');
            const { data: allTenantMetrics, error: allError } = await this.client
                .from('tenant_metrics')
                .select('tenant_id, metric_type, metric_data, calculated_at')
                .eq('period', period)
                .order('calculated_at', { ascending: false });

            if (allError) {
                throw new Error(`Erro ao buscar tenant_metrics: ${allError.message}`);
            }

            if (!allTenantMetrics || allTenantMetrics.length === 0) {
                throw new Error(`Nenhuma tenant_metrics encontrada para período ${period}`);
            }

            // 2. AGRUPAR MÉTRICAS POR TIPO
            const metricsByType = this.groupMetricsByType(allTenantMetrics);
            const tenantIds = new Set(allTenantMetrics.map(m => m.tenant_id));
            
            console.log(`📋 Tipos encontrados: ${Object.keys(metricsByType).join(', ')}`);
            console.log(`🏢 Tenants únicos: ${tenantIds.size}`);

            // 3. CALCULAR PLATFORM MRR (custo_plataforma)
            const platformMrrData = this.calculatePlatformMRR(metricsByType['custo_plataforma'] || []);
            
            // 4. CALCULAR MÉTRICAS OPERACIONAIS (comprehensive)
            const operationalData = this.calculateOperationalMetrics(metricsByType['comprehensive'] || []);
            
            // 5. CALCULAR MÉTRICAS DE PERFORMANCE (comprehensive)
            const performanceData = this.calculatePerformanceMetrics(metricsByType['comprehensive'] || []);
            
            // 6. CALCULAR MÉTRICAS DE CUSTO (conversation_billing)
            const costData = this.calculateCostMetrics(metricsByType['conversation_billing'] || []);
            
            // 7. VALIDAÇÃO CRUZADA (revenue_tenant)
            const validationData = this.calculateValidationMetrics(metricsByType['revenue_tenant'] || []);
            
            // 8. MÉTRICAS CALCULADAS/DERIVADAS
            const derivedData = this.calculateDerivedMetrics(platformMrrData, operationalData, performanceData);
            
            // 9. CONSTRUIR RESULTADO FINAL
            const aggregatedMetrics = {
                // METADATA
                calculation_date: targetDate,
                period: period,
                tenants_processed: operationalData.active_tenants,
                total_tenants: tenantIds.size,
                data_quality_score: this.calculateDataQuality(validationData, operationalData),
                
                // PLATFORM MRR
                platform_mrr: platformMrrData.total,
                
                // RECEITA
                total_revenue: operationalData.total_revenue,
                revenue_per_customer: performanceData.avg_revenue_per_customer,
                revenue_per_appointment: performanceData.avg_revenue_per_appointment,
                total_revenue_validation: validationData.total_revenue,
                roi_per_conversation: performanceData.avg_roi_per_conversation,
                
                // OPERACIONAIS
                active_tenants: operationalData.active_tenants,
                total_appointments: operationalData.total_appointments,
                total_chat_minutes: operationalData.total_chat_minutes,
                total_new_customers: operationalData.total_new_customers,
                total_sessions: operationalData.total_sessions,
                total_professionals: operationalData.total_professionals,
                total_services: operationalData.total_services,
                
                // PERFORMANCE
                avg_appointment_success_rate: performanceData.avg_appointment_success_rate,
                avg_whatsapp_quality_score: performanceData.avg_whatsapp_quality_score,
                avg_customer_satisfaction_score: performanceData.avg_customer_satisfaction_score,
                avg_conversion_rate: performanceData.avg_conversion_rate,
                avg_customer_retention_rate: performanceData.avg_customer_retention_rate,
                avg_customer_recurrence_rate: performanceData.avg_customer_recurrence_rate,
                
                // EFICIÊNCIA
                avg_ai_assistant_efficiency: performanceData.avg_ai_assistant_efficiency,
                avg_response_time: performanceData.avg_response_time,
                avg_business_hours_utilization: performanceData.avg_business_hours_utilization,
                avg_minutes_per_conversation: performanceData.avg_minutes_per_conversation,
                
                // CUSTO
                avg_customer_acquisition_cost: performanceData.avg_customer_acquisition_cost,
                avg_profit_margin_percentage: performanceData.avg_profit_margin_percentage,
                total_platform_cost_usd: costData.total_cost_usd,
                avg_cost_per_conversation: costData.avg_cost_per_conversation,
                
                // QUALIDADE
                total_billable_conversations: costData.total_billable_conversations,
                avg_efficiency_pct: costData.avg_efficiency_pct,
                avg_spam_rate_pct: costData.avg_spam_rate_pct,
                
                // DERIVADAS
                revenue_platform_ratio: derivedData.revenue_platform_ratio,
                avg_revenue_per_tenant: derivedData.avg_revenue_per_tenant,
                avg_appointments_per_tenant: derivedData.avg_appointments_per_tenant,
                avg_sessions_per_tenant: derivedData.avg_sessions_per_tenant,
                avg_customers_per_tenant: derivedData.avg_customers_per_tenant,
                platform_utilization_score: derivedData.platform_utilization_score
            };

            const executionTime = Date.now() - startTime;
            
            console.log('');
            console.log('✅ AGREGAÇÃO REFATORADA CONCLUÍDA:');
            console.log(`   💰 Platform MRR: R$ ${aggregatedMetrics.platform_mrr.toFixed(2)}`);
            console.log(`   💵 Receita Total: R$ ${aggregatedMetrics.total_revenue.toFixed(2)}`);
            console.log(`   🔍 Receita Validação: R$ ${aggregatedMetrics.total_revenue_validation.toFixed(2)}`);
            console.log(`   🏢 Tenants Ativos: ${aggregatedMetrics.active_tenants}`);
            console.log(`   📅 Total Appointments: ${aggregatedMetrics.total_appointments}`);
            console.log(`   💬 Total Sessions: ${aggregatedMetrics.total_sessions}`);
            console.log(`   👥 Total Customers: ${aggregatedMetrics.total_new_customers}`);
            console.log(`   👨‍💼 Total Professionals: ${aggregatedMetrics.total_professionals}`);
            console.log(`   🛎️ Total Services: ${aggregatedMetrics.total_services}`);
            console.log(`   💸 Total Cost USD: $${aggregatedMetrics.total_platform_cost_usd.toFixed(2)}`);
            console.log(`   📊 Ratio Receita/Plataforma: ${aggregatedMetrics.revenue_platform_ratio.toFixed(2)}x`);
            console.log(`   📈 Success Rate: ${aggregatedMetrics.avg_appointment_success_rate.toFixed(1)}%`);
            console.log(`   🎯 Utilization Score: ${aggregatedMetrics.platform_utilization_score.toFixed(1)}`);
            console.log(`   ✅ Qualidade Dados: ${aggregatedMetrics.data_quality_score.toFixed(1)}%`);
            console.log(`   ⏱️ Tempo execução: ${executionTime}ms`);
            console.log('');

            return aggregatedMetrics;

        } catch (error) {
            console.error('❌ Erro na agregação:', error);
            throw error;
        }
    }
}

async function testRefactoredPlatformService() {
    console.log('🧪 TESTE DO SERVIÇO PLATFORM_AGGREGATION REFATORADO');
    console.log('='.repeat(60));
    
    try {
        const service = new PlatformAggregationServiceTest();
        
        // Testar para 30d
        const result = await service.aggregatePlatformMetricsFromTenants('30d');
        
        console.log('📊 RESULTADO FINAL DA AGREGAÇÃO:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
        
    } catch (error) {
        console.error('💥 Erro no teste:', error);
    }
}

// Executar teste
testRefactoredPlatformService();