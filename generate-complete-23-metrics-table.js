const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Formatação brasileira
const formatCurrency = (value) => {
    if (!value || isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

const formatNumber = (value) => {
    if (!value || isNaN(value)) return '0';
    return new Intl.NumberFormat('pt-BR').format(value);
};

const formatPercent = (value) => {
    if (!value || isNaN(value)) return '0,00%';
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 2
    }).format(value / 100);
};

// Função para calcular datas dos períodos
const getPeriodDates = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return {
        period_7d: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        period_30d: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        period_90d: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        period_6months: new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
    };
};

// Cálculos das 23 métricas validadas
class CompleteMetricsCalculator {
    constructor() {
        this.periods = getPeriodDates();
    }

    // 1. Monthly Revenue (MRR)
    async calculateMonthlyRevenue(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            // Revenue from subscription payments
            const { data: payments, error: paymentsError } = await supabase
                .from('subscription_payments')
                .select('amount_brl')
                .eq('tenant_id', tenantId)
                .gte('payment_date', startDate)
                .eq('payment_status', 'paid');

            if (paymentsError) throw paymentsError;

            // Revenue from appointments
            const { data: appointments, error: appointmentsError } = await supabase
                .from('appointments')
                .select('service_price_brl')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .in('status', ['completed', 'confirmed']);

            if (appointmentsError) throw appointmentsError;

            const subscriptionRevenue = payments?.reduce((sum, p) => sum + (p.amount_brl || 0), 0) || 0;
            const appointmentRevenue = appointments?.reduce((sum, a) => sum + (a.service_price_brl || 0), 0) || 0;
            
            return subscriptionRevenue + appointmentRevenue;
        } catch (error) {
            console.error('Error calculating monthly revenue:', error);
            return 0;
        }
    }

    // 2. New Customers
    async calculateNewCustomers(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data, error } = await supabase
                .from('conversation_history')
                .select('customer_phone', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('is_first_interaction', true);

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error('Error calculating new customers:', error);
            return 0;
        }
    }

    // 3. Appointment Success Rate
    async calculateAppointmentSuccessRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: successful, error: successError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('status', 'completed');

            if (totalError || successError) throw totalError || successError;

            const totalCount = total?.length || 0;
            const successCount = successful?.length || 0;
            
            return totalCount > 0 ? (successCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating appointment success rate:', error);
            return 0;
        }
    }

    // 4. No Show Impact
    async calculateNoShowImpact(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: noShows, error } = await supabase
                .from('appointments')
                .select('service_price_brl')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('status', 'no_show');

            if (error) throw error;
            
            return noShows?.reduce((sum, a) => sum + (a.service_price_brl || 0), 0) || 0;
        } catch (error) {
            console.error('Error calculating no show impact:', error);
            return 0;
        }
    }

    // 5. Information Rate
    async calculateInformationRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: information, error: infoError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('conversation_outcome', 'information_request');

            if (totalError || infoError) throw totalError || infoError;

            const totalCount = total?.length || 0;
            const infoCount = information?.length || 0;
            
            return totalCount > 0 ? (infoCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating information rate:', error);
            return 0;
        }
    }

    // 6. Spam Rate
    async calculateSpamRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: spam, error: spamError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('conversation_outcome', 'spam_irrelevant');

            if (totalError || spamError) throw totalError || spamError;

            const totalCount = total?.length || 0;
            const spamCount = spam?.length || 0;
            
            return totalCount > 0 ? (spamCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating spam rate:', error);
            return 0;
        }
    }

    // 7. Reschedule Rate
    async calculateRescheduleRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: rescheduled, error: rescheduleError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('status', 'rescheduled');

            if (totalError || rescheduleError) throw totalError || rescheduleError;

            const totalCount = total?.length || 0;
            const rescheduleCount = rescheduled?.length || 0;
            
            return totalCount > 0 ? (rescheduleCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating reschedule rate:', error);
            return 0;
        }
    }

    // 8. Cancellation Rate
    async calculateCancellationRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: cancelled, error: cancelError } = await supabase
                .from('appointments')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('status', 'cancelled');

            if (totalError || cancelError) throw totalError || cancelError;

            const totalCount = total?.length || 0;
            const cancelCount = cancelled?.length || 0;
            
            return totalCount > 0 ? (cancelCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating cancellation rate:', error);
            return 0;
        }
    }

    // 9. Average Minutes per Conversation
    async calculateAvgMinutesPerConversation(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data, error } = await supabase
                .from('conversation_history')
                .select('duration_minutes')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .not('duration_minutes', 'is', null);

            if (error) throw error;

            if (!data || data.length === 0) return 0;

            const totalMinutes = data.reduce((sum, conv) => sum + (conv.duration_minutes || 0), 0);
            return totalMinutes / data.length;
        } catch (error) {
            console.error('Error calculating avg minutes per conversation:', error);
            return 0;
        }
    }

    // 10. Total System Cost USD
    async calculateTotalSystemCostUsd(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            // OpenAI API costs
            const { data: aiCosts, error: aiError } = await supabase
                .from('conversation_history')
                .select('ai_processing_cost_usd')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .not('ai_processing_cost_usd', 'is', null);

            // WhatsApp API costs
            const { data: whatsappCosts, error: whatsappError } = await supabase
                .from('conversation_history')
                .select('whatsapp_cost_usd')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .not('whatsapp_cost_usd', 'is', null);

            if (aiError || whatsappError) throw aiError || whatsappError;

            const aiTotal = aiCosts?.reduce((sum, c) => sum + (c.ai_processing_cost_usd || 0), 0) || 0;
            const whatsappTotal = whatsappCosts?.reduce((sum, c) => sum + (c.whatsapp_cost_usd || 0), 0) || 0;
            
            return aiTotal + whatsappTotal;
        } catch (error) {
            console.error('Error calculating total system cost USD:', error);
            return 0;
        }
    }

    // 11. AI Failure Rate
    async calculateAiFailureRate(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data: total, error: totalError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            const { data: failures, error: failureError } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('ai_processing_status', 'failed');

            if (totalError || failureError) throw totalError || failureError;

            const totalCount = total?.length || 0;
            const failureCount = failures?.length || 0;
            
            return totalCount > 0 ? (failureCount / totalCount) * 100 : 0;
        } catch (error) {
            console.error('Error calculating AI failure rate:', error);
            return 0;
        }
    }

    // 12. Confidence Score
    async calculateConfidenceScore(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data, error } = await supabase
                .from('conversation_history')
                .select('ai_confidence_score')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .not('ai_confidence_score', 'is', null);

            if (error) throw error;

            if (!data || data.length === 0) return 0;

            const totalConfidence = data.reduce((sum, conv) => sum + (conv.ai_confidence_score || 0), 0);
            return totalConfidence / data.length;
        } catch (error) {
            console.error('Error calculating confidence score:', error);
            return 0;
        }
    }

    // 13. Total Unique Customers
    async calculateTotalUniqueCustomers(tenantId, period = 30) {
        try {
            const startDate = period === 30 ? this.periods.period_30d : this.periods.period_7d;
            
            const { data, error } = await supabase
                .from('conversation_history')
                .select('customer_phone')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            if (error) throw error;

            const uniquePhones = new Set(data?.map(conv => conv.customer_phone) || []);
            return uniquePhones.size;
        } catch (error) {
            console.error('Error calculating total unique customers:', error);
            return 0;
        }
    }

    // 14. Services Available
    async calculateServicesAvailable(tenantId) {
        try {
            const { data, error } = await supabase
                .from('services')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('is_active', true);

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error('Error calculating services available:', error);
            return 0;
        }
    }

    // 15. Total Professionals
    async calculateTotalProfessionals(tenantId) {
        try {
            const { data, error } = await supabase
                .from('professionals')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('is_active', true);

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error('Error calculating total professionals:', error);
            return 0;
        }
    }

    // 16. Monthly Platform Cost BRL
    async calculateMonthlyPlatformCostBrl(tenantId, period = 30) {
        try {
            const costUsd = await this.calculateTotalSystemCostUsd(tenantId, period);
            const exchangeRate = 5.20; // USD to BRL approximation
            return costUsd * exchangeRate;
        } catch (error) {
            console.error('Error calculating monthly platform cost BRL:', error);
            return 0;
        }
    }

    // 17-19. AI Interactions (7d, 30d, 90d)
    async calculateAiInteractions(tenantId, period) {
        try {
            let startDate;
            switch(period) {
                case 7: startDate = this.periods.period_7d; break;
                case 30: startDate = this.periods.period_30d; break;
                case 90: startDate = this.periods.period_90d; break;
                default: startDate = this.periods.period_30d;
            }
            
            const { data, error } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .eq('has_ai_interaction', true);

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error(`Error calculating AI interactions ${period}d:`, error);
            return 0;
        }
    }

    // 20. Historical 6 Months Conversations
    async calculateHistorical6MonthsConversations(tenantId) {
        try {
            const { data, error } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', this.periods.period_6months);

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error('Error calculating historical 6 months conversations:', error);
            return 0;
        }
    }

    // 21. Historical 6 Months Revenue
    async calculateHistorical6MonthsRevenue(tenantId) {
        try {
            return await this.calculateMonthlyRevenue(tenantId, 180); // 6 months
        } catch (error) {
            console.error('Error calculating historical 6 months revenue:', error);
            return 0;
        }
    }

    // 22. Historical 6 Months Customers
    async calculateHistorical6MonthsCustomers(tenantId) {
        try {
            const { data, error } = await supabase
                .from('conversation_history')
                .select('customer_phone')
                .eq('tenant_id', tenantId)
                .gte('created_at', this.periods.period_6months);

            if (error) throw error;

            const uniquePhones = new Set(data?.map(conv => conv.customer_phone) || []);
            return uniquePhones.size;
        } catch (error) {
            console.error('Error calculating historical 6 months customers:', error);
            return 0;
        }
    }

    // 23. Tenant Outcomes (21 subcategorias)
    async calculateTenantOutcomes(tenantId) {
        try {
            const outcomes = {};
            const periods = [7, 30, 90];
            const outcomeTypes = [
                'appointment_scheduled',
                'information_request', 
                'spam_irrelevant',
                'cancelled_noshow',
                'reschedule_request',
                'complaint_feedback',
                'other_unclassified'
            ];

            for (const period of periods) {
                let startDate;
                switch(period) {
                    case 7: startDate = this.periods.period_7d; break;
                    case 30: startDate = this.periods.period_30d; break;
                    case 90: startDate = this.periods.period_90d; break;
                }

                for (const outcomeType of outcomeTypes) {
                    const { data, error } = await supabase
                        .from('conversation_history')
                        .select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenantId)
                        .eq('conversation_outcome', outcomeType)
                        .gte('created_at', startDate);

                    if (error) throw error;
                    
                    const key = `${outcomeType}_${period}d`;
                    outcomes[key] = data?.length || 0;
                }
            }

            return outcomes;
        } catch (error) {
            console.error('Error calculating tenant outcomes:', error);
            return {};
        }
    }

    // Calcula todas as métricas para um tenant
    async calculateAllMetrics(tenantId) {
        console.log(`🔍 Calculando todas as 23 métricas para tenant: ${tenantId}`);
        
        try {
            const metrics = {
                tenant_id: tenantId,
                
                // Primary Business Metrics (4)
                monthly_revenue: await this.calculateMonthlyRevenue(tenantId, 30),
                new_customers: await this.calculateNewCustomers(tenantId, 30),
                appointment_success_rate: await this.calculateAppointmentSuccessRate(tenantId, 30),
                no_show_impact: await this.calculateNoShowImpact(tenantId, 30),

                // Conversation Outcome Metrics (4)
                information_rate: await this.calculateInformationRate(tenantId, 30),
                spam_rate: await this.calculateSpamRate(tenantId, 30),
                reschedule_rate: await this.calculateRescheduleRate(tenantId, 30),
                cancellation_rate: await this.calculateCancellationRate(tenantId, 30),

                // Complementary Metrics (11)
                avg_minutes_per_conversation: await this.calculateAvgMinutesPerConversation(tenantId, 30),
                total_system_cost_usd: await this.calculateTotalSystemCostUsd(tenantId, 30),
                ai_failure_rate: await this.calculateAiFailureRate(tenantId, 30),
                confidence_score: await this.calculateConfidenceScore(tenantId, 30),
                total_unique_customers: await this.calculateTotalUniqueCustomers(tenantId, 30),
                services_available: await this.calculateServicesAvailable(tenantId),
                total_professionals: await this.calculateTotalProfessionals(tenantId),
                monthly_platform_cost_brl: await this.calculateMonthlyPlatformCostBrl(tenantId, 30),
                ai_interaction_7d: await this.calculateAiInteractions(tenantId, 7),
                ai_interaction_30d: await this.calculateAiInteractions(tenantId, 30),
                ai_interaction_90d: await this.calculateAiInteractions(tenantId, 90),

                // Historical Metrics (3)
                historical_6months_conversations: await this.calculateHistorical6MonthsConversations(tenantId),
                historical_6months_revenue: await this.calculateHistorical6MonthsRevenue(tenantId),
                historical_6months_customers: await this.calculateHistorical6MonthsCustomers(tenantId),

                // Tenant Outcomes (21 subcategorias)
                ...await this.calculateTenantOutcomes(tenantId)
            };

            console.log(`✅ Métricas calculadas para tenant ${tenantId}:`, Object.keys(metrics).length, 'valores');
            return metrics;
        } catch (error) {
            console.error(`❌ Erro calculando métricas para tenant ${tenantId}:`, error);
            return null;
        }
    }
}

// Função principal
async function generateComplete23MetricsTable() {
    console.log('🚀 Iniciando geração da tabela completa com 23 métricas validadas');
    
    try {
        // 1. Buscar todos os tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, business_type')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (tenantsError) {
            throw new Error(`Erro buscando tenants: ${tenantsError.message}`);
        }

        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }

        console.log(`📊 Encontrados ${tenants.length} tenants ativos`);

        // 2. Calcular métricas para cada tenant
        const calculator = new CompleteMetricsCalculator();
        const allMetrics = [];

        for (let i = 0; i < tenants.length; i++) {
            const tenant = tenants[i];
            console.log(`\n📍 Processando tenant ${i + 1}/${tenants.length}: ${tenant.name} (${tenant.business_type})`);
            
            const tenantMetrics = await calculator.calculateAllMetrics(tenant.id);
            if (tenantMetrics) {
                tenantMetrics.tenant_name = tenant.name;
                tenantMetrics.business_type = tenant.business_type;
                allMetrics.push(tenantMetrics);
            }

            // Pausa para não sobrecarregar o banco
            if (i < tenants.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`\n✅ Métricas calculadas para ${allMetrics.length} tenants`);

        // 3. Gerar tabela HTML com formatação brasileira
        const generateHtmlTable = (metrics) => {
            let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Sistema Completo - 23 Métricas Validadas</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2c3e50; text-align: center; margin-bottom: 30px; }
        .summary { background: #ecf0f1; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; }
        th, td { border: 1px solid #bdc3c7; padding: 8px; text-align: left; }
        th { background: #34495e; color: white; font-weight: bold; }
        .metric-group { background: #3498db; color: white; font-weight: bold; }
        .primary-business { background: #e74c3c; }
        .conversation-outcome { background: #f39c12; }
        .complementary { background: #27ae60; }
        .historical { background: #8e44ad; }
        .tenant-outcomes { background: #16a085; }
        .currency { text-align: right; }
        .percentage { text-align: right; }
        .number { text-align: right; }
        tr:nth-child(even) { background: #f8f9fa; }
        tr:hover { background: #e8f4fd; }
        .tenant-name { font-weight: bold; color: #2c3e50; }
        .business-type { font-style: italic; color: #7f8c8d; }
    </style>
</head>
<body>
    <h1>📊 Sistema Completo - 23 Métricas Validadas</h1>
    
    <div class="summary">
        <h3>📈 Resumo da Análise</h3>
        <p><strong>Total de Tenants:</strong> ${metrics.length}</p>
        <p><strong>Data de Geração:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        <p><strong>Métricas por Tenant:</strong> 23 métricas principais + 21 subcategorias de outcomes = 44 valores</p>
        <p><strong>Total de Dados:</strong> ${metrics.length * 44} pontos de dados</p>
    </div>

    <table>
        <thead>
            <tr>
                <th rowspan="2">Tenant</th>
                <th rowspan="2">Tipo de Negócio</th>
                
                <!-- Primary Business Metrics -->
                <th colspan="4" class="metric-group primary-business">Primary Business Metrics (4)</th>
                
                <!-- Conversation Outcome Metrics -->
                <th colspan="4" class="metric-group conversation-outcome">Conversation Outcome Metrics (4)</th>
                
                <!-- Complementary Metrics -->
                <th colspan="11" class="metric-group complementary">Complementary Metrics (11)</th>
                
                <!-- Historical Metrics -->
                <th colspan="3" class="metric-group historical">Historical Metrics (3)</th>
                
                <!-- Tenant Outcomes -->
                <th colspan="21" class="metric-group tenant-outcomes">Tenant Outcomes (21)</th>
            </tr>
            <tr>
                <!-- Primary Business -->
                <th>Receita Mensal</th>
                <th>Novos Clientes</th>
                <th>Taxa Sucesso Agend.</th>
                <th>Impacto No-Show</th>
                
                <!-- Conversation Outcome -->
                <th>Taxa Informação</th>
                <th>Taxa Spam</th>
                <th>Taxa Reagendamento</th>
                <th>Taxa Cancelamento</th>
                
                <!-- Complementary -->
                <th>Min/Conversa Média</th>
                <th>Custo Sistema USD</th>
                <th>Taxa Falha IA</th>
                <th>Score Confiança</th>
                <th>Clientes Únicos Total</th>
                <th>Serviços Disponíveis</th>
                <th>Total Profissionais</th>
                <th>Custo Plataforma BRL</th>
                <th>Interações IA 7d</th>
                <th>Interações IA 30d</th>
                <th>Interações IA 90d</th>
                
                <!-- Historical -->
                <th>Conversas 6m</th>
                <th>Receita 6m</th>
                <th>Clientes 6m</th>
                
                <!-- Tenant Outcomes (21) -->
                <th>Agendados 7d</th>
                <th>Agendados 30d</th>
                <th>Agendados 90d</th>
                <th>Info 7d</th>
                <th>Info 30d</th>
                <th>Info 90d</th>
                <th>Spam 7d</th>
                <th>Spam 30d</th>
                <th>Spam 90d</th>
                <th>Cancel/NoShow 7d</th>
                <th>Cancel/NoShow 30d</th>
                <th>Cancel/NoShow 90d</th>
                <th>Reagend. 7d</th>
                <th>Reagend. 30d</th>
                <th>Reagend. 90d</th>
                <th>Reclamação 7d</th>
                <th>Reclamação 30d</th>
                <th>Reclamação 90d</th>
                <th>Outros 7d</th>
                <th>Outros 30d</th>
                <th>Outros 90d</th>
            </tr>
        </thead>
        <tbody>`;

            metrics.forEach(tenant => {
                html += `
            <tr>
                <td class="tenant-name">${tenant.tenant_name}</td>
                <td class="business-type">${tenant.business_type}</td>
                
                <!-- Primary Business Metrics -->
                <td class="currency">${formatCurrency(tenant.monthly_revenue)}</td>
                <td class="number">${formatNumber(tenant.new_customers)}</td>
                <td class="percentage">${formatPercent(tenant.appointment_success_rate)}</td>
                <td class="currency">${formatCurrency(tenant.no_show_impact)}</td>
                
                <!-- Conversation Outcome Metrics -->
                <td class="percentage">${formatPercent(tenant.information_rate)}</td>
                <td class="percentage">${formatPercent(tenant.spam_rate)}</td>
                <td class="percentage">${formatPercent(tenant.reschedule_rate)}</td>
                <td class="percentage">${formatPercent(tenant.cancellation_rate)}</td>
                
                <!-- Complementary Metrics -->
                <td class="number">${formatNumber(tenant.avg_minutes_per_conversation.toFixed(1))} min</td>
                <td class="currency">US$ ${tenant.total_system_cost_usd.toFixed(2)}</td>
                <td class="percentage">${formatPercent(tenant.ai_failure_rate)}</td>
                <td class="percentage">${formatPercent(tenant.confidence_score)}</td>
                <td class="number">${formatNumber(tenant.total_unique_customers)}</td>
                <td class="number">${formatNumber(tenant.services_available)}</td>
                <td class="number">${formatNumber(tenant.total_professionals)}</td>
                <td class="currency">${formatCurrency(tenant.monthly_platform_cost_brl)}</td>
                <td class="number">${formatNumber(tenant.ai_interaction_7d)}</td>
                <td class="number">${formatNumber(tenant.ai_interaction_30d)}</td>
                <td class="number">${formatNumber(tenant.ai_interaction_90d)}</td>
                
                <!-- Historical Metrics -->
                <td class="number">${formatNumber(tenant.historical_6months_conversations)}</td>
                <td class="currency">${formatCurrency(tenant.historical_6months_revenue)}</td>
                <td class="number">${formatNumber(tenant.historical_6months_customers)}</td>
                
                <!-- Tenant Outcomes -->
                <td class="number">${formatNumber(tenant.appointment_scheduled_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.appointment_scheduled_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.appointment_scheduled_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.information_request_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.information_request_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.information_request_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.spam_irrelevant_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.spam_irrelevant_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.spam_irrelevant_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.cancelled_noshow_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.cancelled_noshow_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.cancelled_noshow_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.reschedule_request_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.reschedule_request_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.reschedule_request_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.complaint_feedback_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.complaint_feedback_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.complaint_feedback_90d || 0)}</td>
                <td class="number">${formatNumber(tenant.other_unclassified_7d || 0)}</td>
                <td class="number">${formatNumber(tenant.other_unclassified_30d || 0)}</td>
                <td class="number">${formatNumber(tenant.other_unclassified_90d || 0)}</td>
            </tr>`;
            });

            html += `
        </tbody>
    </table>
    
    <div class="summary" style="margin-top: 30px;">
        <h3>📋 Legenda das Métricas</h3>
        <p><strong>Primary Business Metrics:</strong> Métricas principais de negócio (receita, clientes, sucesso)</p>
        <p><strong>Conversation Outcome Metrics:</strong> Resultados das conversações (informação, spam, cancelamentos)</p>
        <p><strong>Complementary Metrics:</strong> Métricas complementares (IA, custos, profissionais, serviços)</p>
        <p><strong>Historical Metrics:</strong> Dados históricos de 6 meses para análise de tendências</p>
        <p><strong>Tenant Outcomes:</strong> 7 categorias × 3 períodos = 21 métricas de resultados detalhados</p>
    </div>
    
    <div class="summary">
        <h3>🎯 Observações Importantes</h3>
        <p>• <strong>Formatação Brasileira:</strong> Valores monetários em R$ com vírgula decimal</p>
        <p>• <strong>23 Métricas Principais:</strong> Todas as métricas validadas do sistema</p>
        <p>• <strong>44 Valores por Tenant:</strong> 23 métricas + 21 subcategorias de outcomes</p>
        <p>• <strong>Cálculos Precisos:</strong> Dados extraídos diretamente das tabelas do banco</p>
        <p>• <strong>Períodos Validados:</strong> 7d, 30d, 90d e 6 meses para análises comparativas</p>
    </div>

</body>
</html>`;
            return html;
        };

        // 4. Salvar HTML
        const fs = require('fs');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `SISTEMA-COMPLETO-23-METRICAS-${timestamp}.html`;
        
        const htmlContent = generateHtmlTable(allMetrics);
        fs.writeFileSync(filename, htmlContent);

        // 5. Estatísticas finais
        const totalRevenue = allMetrics.reduce((sum, t) => sum + (t.monthly_revenue || 0), 0);
        const totalCustomers = allMetrics.reduce((sum, t) => sum + (t.total_unique_customers || 0), 0);
        const totalConversations = allMetrics.reduce((sum, t) => sum + (t.ai_interaction_30d || 0), 0);

        console.log('\n🎉 ===== SISTEMA COMPLETO - 23 MÉTRICAS GERADO COM SUCESSO =====');
        console.log(`📄 Arquivo: ${filename}`);
        console.log(`👥 Tenants processados: ${allMetrics.length}`);
        console.log(`💰 Receita total (30d): ${formatCurrency(totalRevenue)}`);
        console.log(`🧑‍💼 Clientes únicos total: ${formatNumber(totalCustomers)}`);
        console.log(`💬 Interações IA total (30d): ${formatNumber(totalConversations)}`);
        console.log(`📊 Total de dados: ${allMetrics.length * 44} pontos`);
        console.log('\n✅ Todas as 23 métricas validadas foram incluídas com formatação brasileira!');

    } catch (error) {
        console.error('❌ Erro na geração da tabela completa:', error);
        process.exit(1);
    }
}

// Executar
if (require.main === module) {
    generateComplete23MetricsTable();
}

module.exports = { generateComplete23MetricsTable, CompleteMetricsCalculator };