require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generateCompleteCSV() {
    console.log('📊 GERANDO CSV COMPLETO COM TODAS AS 27 MÉTRICAS...');
    
    // Buscar tenants
    const { data: tenants } = await supabase.from('tenants').select('id, name, domain');
    const tenantMap = {};
    tenants.forEach(tenant => { tenantMap[tenant.id] = tenant; });
    
    // Buscar métricas de hoje
    const today = new Date().toISOString().split('T')[0];
    const { data: allMetrics } = await supabase
        .from('tenant_metrics')
        .select('*')
        .gte('calculated_at', today)
        .order('tenant_id', { ascending: true })
        .order('period', { ascending: true });
    
    console.log(`✅ Encontrados ${allMetrics.length} registros`);
    
    // Helper para formatar números
    const formatNumber = (value, decimals = 2) => {
        if (value === null || value === undefined) return '0,00';
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return num.toFixed(decimals).replace('.', ',');
    };
    
    // Helper para extrair valor de objeto
    const extractValue = (obj, key) => {
        if (!obj || typeof obj !== 'object') return '0';
        return obj[key] !== undefined ? obj[key].toString() : '0';
    };
    
    // CABEÇALHO COMPLETO COM TODAS AS 27 MÉTRICAS
    const headers = [
        // Identificação (3)
        'Nome Tenant', 'Dominio', 'Periodo', 'Data Calculo',
        
        // 1. Métricas de Revenue (3)
        'Monthly Revenue Value', 'Monthly Revenue Currency', 'Monthly Revenue Change',
        
        // 2. AI Assistant Efficiency (6) 
        'AI Efficiency Percentage', 'AI Success Weighted', 'AI Neutral Weighted', 'AI Failure Weighted', 'AI Total Weighted', 'AI Avg Confidence',
        
        // 3. No Show Impact (5)
        'No Show Lost Revenue', 'No Show Count', 'No Show Impact Percentage', 'No Show Total Appointments', 'No Show Total Potential Revenue',
        
        // 4. Customer Recurrence (6)
        'Customer Total', 'Customer New', 'Customer Returning', 'Customer Recurrence Percentage', 'Customer Avg Visits', 'Customer Revenue From Returning',
        
        // 5-10. Conversation Outcomes (12) - 6 métricas x 2 campos cada
        'Conversion Rate Percentage', 'Conversion Count',
        'Information Rate Percentage', 'Information Count', 
        'AI Failure Rate Percentage', 'AI Failure Count',
        'Spam Rate Percentage', 'Spam Count',
        'Reschedule Rate Percentage', 'Reschedule Count',
        'Cancellation Rate Percentage', 'Cancellation Count',
        
        // 11-14. Novas métricas de conversa (12)
        'Avg Minutes Per Conversation', 'Total Minutes', 'Total Conversations (Minutes)',
        'Avg Messages Per Conversation', 'Total Messages', 'Total Conversations (Messages)',
        'Avg Cost USD Per Conversation', 'Total Cost USD', 'Total Conversations (Cost)',
        'Avg Confidence Per Conversation', 'Total Confidence', 'Total Conversations (Confidence)',
        
        // 15-17. Contadores (6)
        'Unique Customers Count', 'Services Count', 'Services Active Count', 'Professionals Count',
        
        // 18. Custo plataforma (2)
        'Monthly Platform Cost BRL', 'Platform Cost Period Days',
        
        // 19-21. Histórico 6 meses (18) - 6 campos x 3 métricas
        'Six Months Conversations M1', 'Six Months Conversations M2', 'Six Months Conversations M3', 'Six Months Conversations M4', 'Six Months Conversations M5', 'Six Months Conversations M6',
        'Six Months Revenue M1', 'Six Months Revenue M2', 'Six Months Revenue M3', 'Six Months Revenue M4', 'Six Months Revenue M5', 'Six Months Revenue M6',
        'Six Months Customers M1', 'Six Months Customers M2', 'Six Months Customers M3', 'Six Months Customers M4', 'Six Months Customers M5', 'Six Months Customers M6'
    ];
    
    console.log(`📋 Cabeçalho criado com ${headers.length} colunas`);
    
    let csvContent = headers.join(';') + '\n';
    
    for (const metric of allMetrics) {
        const data = metric.metric_data || {};
        const tenant = tenantMap[metric.tenant_id] || {};
        
        const row = [
            // Identificação
            tenant.name || 'N/A',
            tenant.domain || 'N/A', 
            metric.period || '',
            new Date(metric.calculated_at).toLocaleString('pt-BR'),
            
            // Monthly Revenue
            formatNumber(data.monthly_revenue?.value || 0),
            data.monthly_revenue?.currency || 'BRL',
            formatNumber(data.monthly_revenue?.change_percent || 0),
            
            // AI Assistant Efficiency
            formatNumber(data.ai_assistant_efficiency?.efficiency_percentage || 0),
            formatNumber(data.ai_assistant_efficiency?.success_weighted || 0),
            formatNumber(data.ai_assistant_efficiency?.neutral_weighted || 0),
            formatNumber(data.ai_assistant_efficiency?.failure_weighted || 0),
            formatNumber(data.ai_assistant_efficiency?.total_weighted || 0),
            formatNumber(data.ai_assistant_efficiency?.avg_confidence_score || 0),
            
            // No Show Impact
            formatNumber(data.no_show_impact?.lost_revenue || 0),
            data.no_show_impact?.no_show_count || '0',
            formatNumber(data.no_show_impact?.impact_percentage || 0),
            data.no_show_impact?.total_appointments || '0',
            formatNumber(data.no_show_impact?.total_potential_revenue || 0),
            
            // Customer Recurrence
            data.customer_recurrence?.total_customers || '0',
            data.customer_recurrence?.new_customers || '0',
            data.customer_recurrence?.returning_customers || '0',
            formatNumber(data.customer_recurrence?.recurrence_percentage || 0),
            formatNumber(data.customer_recurrence?.avg_visits_per_customer || 0),
            formatNumber(data.customer_recurrence?.revenue_from_returning || 0),
            
            // Conversation Outcomes (6 métricas)
            formatNumber(data.conversion_rate?.percentage || 0),
            data.conversion_rate?.converted_conversations || '0',
            formatNumber(data.information_rate?.percentage || 0),
            data.information_rate?.info_conversations || '0',
            formatNumber(data.ai_failure_rate?.percentage || 0),
            data.ai_failure_rate?.failed_conversations || '0',
            formatNumber(data.spam_rate?.percentage || 0),
            data.spam_rate?.spam_conversations || '0',
            formatNumber(data.reschedule_rate?.percentage || 0),
            data.reschedule_rate?.reschedule_conversations || '0',
            formatNumber(data.cancellation_rate?.percentage || 0),
            data.cancellation_rate?.cancelled_conversations || '0',
            
            // Novas métricas de conversa
            formatNumber(data.avg_minutes_per_conversation?.minutes || 0),
            formatNumber(data.avg_minutes_per_conversation?.total_minutes || 0),
            data.avg_minutes_per_conversation?.total_conversations || '0',
            formatNumber(data.avg_messages_per_conversation?.messages || 0),
            data.avg_messages_per_conversation?.total_messages || '0',
            data.avg_messages_per_conversation?.total_conversations || '0',
            formatNumber(data.avg_cost_usd_per_conversation?.cost_usd || 0, 6),
            formatNumber(data.avg_cost_usd_per_conversation?.total_cost_usd || 0, 6),
            data.avg_cost_usd_per_conversation?.total_conversations || '0',
            formatNumber(data.avg_confidence_per_conversation?.confidence || 0, 3),
            formatNumber(data.avg_confidence_per_conversation?.total_confidence || 0),
            data.avg_confidence_per_conversation?.total_conversations || '0',
            
            // Contadores
            extractValue(data.unique_customers_count, 'count'),
            extractValue(data.services_count, 'count'),
            extractValue(data.services_count, 'active_count'),
            extractValue(data.professionals_count, 'count'),
            
            // Custo plataforma
            formatNumber(data.monthly_platform_cost_brl?.cost_brl || 0),
            data.monthly_platform_cost_brl?.period_days || '0',
            
            // Histórico 6 meses - Conversations
            data.six_months_conversations?.month_1 || '0',
            data.six_months_conversations?.month_2 || '0',
            data.six_months_conversations?.month_3 || '0',
            data.six_months_conversations?.month_4 || '0',
            data.six_months_conversations?.month_5 || '0',
            data.six_months_conversations?.month_6 || '0',
            
            // Histórico 6 meses - Revenue
            formatNumber(data.six_months_revenue?.month_1 || 0),
            formatNumber(data.six_months_revenue?.month_2 || 0),
            formatNumber(data.six_months_revenue?.month_3 || 0),
            formatNumber(data.six_months_revenue?.month_4 || 0),
            formatNumber(data.six_months_revenue?.month_5 || 0),
            formatNumber(data.six_months_revenue?.month_6 || 0),
            
            // Histórico 6 meses - Customers
            data.six_months_customers?.month_1 || '0',
            data.six_months_customers?.month_2 || '0',
            data.six_months_customers?.month_3 || '0',
            data.six_months_customers?.month_4 || '0',
            data.six_months_customers?.month_5 || '0',
            data.six_months_customers?.month_6 || '0'
        ];
        
        csvContent += row.join(';') + '\n';
    }
    
    const filename = `TODAS-AS-METRICAS-${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}.csv`;
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV COMPLETO gerado: ${filename}`);
    console.log(`📊 Total colunas: ${headers.length}`);
    console.log(`📊 Total registros: ${allMetrics.length}`);
    
    // Contar métricas não-zeradas
    console.log('\n📈 MÉTRICAS COM DADOS:');
    const sample = allMetrics[0]?.metric_data || {};
    let metricasComDados = 0;
    Object.keys(sample).forEach(key => {
        const value = sample[key];
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
            metricasComDados++;
        }
    });
    console.log(`• ${metricasComDados} métricas com dados no primeiro registro`);
}

generateCompleteCSV().catch(console.error);