/**
 * COMPREHENSIVE METRICS VALIDATION TABLE
 * 
 * Script para gerar tabela completa comparando:
 * - Valores brutos calculados diretamente dos dados
 * - Sistema principal (metric_data)
 * - Sistema validado (metricas_validadas)
 * 
 * Gera CSV completo e output no console para análise imediata
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Períodos para análise
const PERIODS = ['7d', '30d', '90d'];

// Lista completa de métricas para validação
const METRICS_TO_VALIDATE = [
    'total_conversations',
    'total_appointments', 
    'monthly_revenue',
    'new_customers',
    'appointment_success_rate',
    'avg_minutes_per_conversation',
    'total_professionals',
    'services_available',
    'cancellation_rate',
    'reschedule_rate',
    'no_show_rate',
    'avg_cost_per_appointment_usd',
    'total_cost_usd',
    'ai_interaction_rate',
    'customer_recurrence_rate',
    'spam_rate',
    'information_requests_rate',
    'total_unique_customers',
    'ai_failure_rate'
];

/**
 * Calcula data de início baseada no período
 */
function getStartDate(period) {
    const now = new Date();
    const days = parseInt(period.replace('d', ''));
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return startDate.toISOString();
}

/**
 * Calcula métricas brutas diretamente dos dados
 */
async function calculateRawMetrics(tenantId, period) {
    const startDate = getStartDate(period);
    const metrics = {};

    try {
        // 1. Total Conversations
        const { data: conversations } = await supabase
            .from('conversations')
            .select('id, created_at, status, outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_conversations = conversations?.length || 0;

        // 2. Total Appointments  
        const { data: appointments } = await supabase
            .from('appointments')
            .select('id, created_at, status, scheduled_date, price')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_appointments = appointments?.length || 0;

        // 3. Monthly Revenue (soma dos appointments com status completed)
        const completedAppointments = appointments?.filter(apt => 
            apt.status === 'completed' && apt.price
        ) || [];
        
        const totalRevenue = completedAppointments.reduce((sum, apt) => sum + (apt.price || 0), 0);
        metrics.monthly_revenue = totalRevenue;

        // 4. New Customers (unique customer_phone_number)
        const { data: uniqueCustomers } = await supabase
            .from('conversations')
            .select('customer_phone_number')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        const uniquePhones = new Set(uniqueCustomers?.map(c => c.customer_phone_number) || []);
        metrics.new_customers = uniquePhones.size;
        metrics.total_unique_customers = uniquePhones.size;

        // 5. Appointment Success Rate
        const scheduledAppointments = appointments?.filter(apt => 
            apt.status === 'scheduled' || apt.status === 'completed'
        ) || [];
        const completedCount = appointments?.filter(apt => apt.status === 'completed')?.length || 0;
        
        metrics.appointment_success_rate = scheduledAppointments.length > 0 ? 
            (completedCount / scheduledAppointments.length) * 100 : 0;

        // 6. Cancellation Rate
        const cancelledCount = appointments?.filter(apt => apt.status === 'cancelled')?.length || 0;
        metrics.cancellation_rate = appointments.length > 0 ? 
            (cancelledCount / appointments.length) * 100 : 0;

        // 7. Reschedule Rate (aproximação baseada em rescheduled status)
        const rescheduledCount = appointments?.filter(apt => apt.status === 'rescheduled')?.length || 0;
        metrics.reschedule_rate = appointments.length > 0 ? 
            (rescheduledCount / appointments.length) * 100 : 0;

        // 8. No Show Rate
        const noShowCount = appointments?.filter(apt => apt.status === 'no_show')?.length || 0;
        metrics.no_show_rate = appointments.length > 0 ? 
            (noShowCount / appointments.length) * 100 : 0;

        // 9. Average Cost per Appointment
        metrics.avg_cost_per_appointment_usd = completedAppointments.length > 0 ? 
            totalRevenue / completedAppointments.length : 0;

        // 10. Total Cost USD (soma de todos os appointments)
        metrics.total_cost_usd = totalRevenue;

        // 11. Professionals (via user_tenants)
        const { data: professionals } = await supabase
            .from('user_tenants')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('role', 'professional');
        
        metrics.total_professionals = professionals?.length || 0;

        // 12. Services Available (via services table)
        const { data: services } = await supabase
            .from('services')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'active');
        
        metrics.services_available = services?.length || 0;

        // 13. Avg Minutes per Conversation (baseado em conversation_history)
        const { data: conversationHistory } = await supabase
            .from('conversation_history')
            .select('conversation_id, created_at')
            .in('conversation_id', conversations?.map(c => c.id) || []);

        // Calcula duração média das conversas
        const conversationDurations = {};
        conversationHistory?.forEach(msg => {
            const convId = msg.conversation_id;
            if (!conversationDurations[convId]) {
                conversationDurations[convId] = {
                    start: new Date(msg.created_at),
                    end: new Date(msg.created_at)
                };
            } else {
                const msgDate = new Date(msg.created_at);
                if (msgDate < conversationDurations[convId].start) {
                    conversationDurations[convId].start = msgDate;
                }
                if (msgDate > conversationDurations[convId].end) {
                    conversationDurations[convId].end = msgDate;
                }
            }
        });

        const avgMinutes = Object.values(conversationDurations).reduce((sum, conv) => {
            const durationMs = conv.end.getTime() - conv.start.getTime();
            return sum + (durationMs / (1000 * 60)); // Convert to minutes
        }, 0);

        metrics.avg_minutes_per_conversation = Object.keys(conversationDurations).length > 0 ? 
            avgMinutes / Object.keys(conversationDurations).length : 0;

        // 14. AI Interaction Rate (conversations com outcome 'ai_handled')
        const aiHandledCount = conversations?.filter(c => c.outcome === 'ai_handled')?.length || 0;
        metrics.ai_interaction_rate = conversations.length > 0 ? 
            (aiHandledCount / conversations.length) * 100 : 0;

        // 15. Customer Recurrence Rate (customers que fizeram mais de 1 appointment)
        const customerAppointments = {};
        appointments?.forEach(apt => {
            // Assumindo que customer_id ou phone está disponível
            const customerId = apt.customer_id || apt.customer_phone_number;
            if (customerId) {
                customerAppointments[customerId] = (customerAppointments[customerId] || 0) + 1;
            }
        });
        
        const recurringCustomers = Object.values(customerAppointments).filter(count => count > 1).length;
        metrics.customer_recurrence_rate = Object.keys(customerAppointments).length > 0 ? 
            (recurringCustomers / Object.keys(customerAppointments).length) * 100 : 0;

        // 16. Spam Rate (conversations com outcome 'spam')
        const spamCount = conversations?.filter(c => c.outcome === 'spam')?.length || 0;
        metrics.spam_rate = conversations.length > 0 ? 
            (spamCount / conversations.length) * 100 : 0;

        // 17. Information Requests Rate (conversations com outcome 'information')
        const infoCount = conversations?.filter(c => c.outcome === 'information_request')?.length || 0;
        metrics.information_requests_rate = conversations.length > 0 ? 
            (infoCount / conversations.length) * 100 : 0;

        // 18. AI Failure Rate (conversations com outcome 'ai_failed')
        const aiFailedCount = conversations?.filter(c => c.outcome === 'ai_failed')?.length || 0;
        metrics.ai_failure_rate = conversations.length > 0 ? 
            (aiFailedCount / conversations.length) * 100 : 0;

    } catch (error) {
        console.error(`Erro calculando métricas brutas para tenant ${tenantId}:`, error.message);
    }

    return metrics;
}

/**
 * Busca métricas do sistema principal
 */
async function getMainSystemMetrics(tenantId, period) {
    const { data, error } = await supabase
        .from('metric_data')
        .select('metric_type, value')
        .eq('tenant_id', tenantId)
        .eq('period', period)
        .gte('created_at', getStartDate('1d')); // Últimas 24h

    if (error) {
        console.error(`Erro buscando métricas principais para tenant ${tenantId}:`, error.message);
        return {};
    }

    const metrics = {};
    data?.forEach(metric => {
        metrics[metric.metric_type] = parseFloat(metric.value) || 0;
    });

    return metrics;
}

/**
 * Busca métricas do sistema validado
 */
async function getValidatedSystemMetrics(tenantId, period) {
    const { data, error } = await supabase
        .from('metricas_validadas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('periodo', period)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data?.length) {
        console.error(`Erro buscando métricas validadas para tenant ${tenantId}:`, error?.message);
        return {};
    }

    const metrics = data[0];
    
    // Mapear campos do sistema validado
    return {
        total_conversations: metrics.total_conversations || 0,
        total_appointments: metrics.total_appointments || 0,
        monthly_revenue: metrics.monthly_revenue || 0,
        new_customers: metrics.new_customers || 0,
        appointment_success_rate: metrics.appointment_success_rate || 0,
        avg_minutes_per_conversation: metrics.avg_minutes_per_conversation || 0,
        total_professionals: metrics.total_professionals || 0,
        services_available: metrics.services_available || 0,
        cancellation_rate: metrics.cancellation_rate || 0,
        reschedule_rate: metrics.reschedule_rate || 0,
        no_show_rate: metrics.no_show_rate || 0,
        avg_cost_per_appointment_usd: metrics.avg_cost_per_appointment_usd || 0,
        total_cost_usd: metrics.total_cost_usd || 0,
        ai_interaction_rate: metrics.ai_interaction_rate || 0,
        customer_recurrence_rate: metrics.customer_recurrence_rate || 0,
        spam_rate: metrics.spam_rate || 0,
        information_requests_rate: metrics.information_requests_rate || 0,
        total_unique_customers: metrics.total_unique_customers || 0,
        ai_failure_rate: metrics.ai_failure_rate || 0
    };
}

/**
 * Determina status da comparação entre valores
 */
function getComparisonStatus(raw, main, validated) {
    const tolerance = 0.01; // 1% de tolerância
    
    // Se todos os valores são iguais (ou próximos)
    if (Math.abs(raw - main) <= tolerance && Math.abs(raw - validated) <= tolerance) {
        return '✅ MATCH';
    }
    
    // Se apenas raw e main coincidem
    if (Math.abs(raw - main) <= tolerance) {
        return '⚠️  MAIN_OK';
    }
    
    // Se apenas raw e validated coincidem
    if (Math.abs(raw - validated) <= tolerance) {
        return '⚠️  VALIDATED_OK';
    }
    
    // Se main e validated coincidem mas diferem do raw
    if (Math.abs(main - validated) <= tolerance) {
        return '❌ SYSTEMS_MATCH_RAW_DIFF';
    }
    
    // Se todos diferem
    return '🔥 ALL_DIFFERENT';
}

/**
 * Gera tabela comparativa completa
 */
async function generateComprehensiveTable() {
    console.log('🔍 INICIANDO ANÁLISE COMPARATIVA COMPLETA DE MÉTRICAS\n');
    console.log('📊 Buscando todos os tenants ativos...\n');

    // Buscar todos os tenants
    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'active')
        .limit(10); // Limitando a 10 para teste inicial

    if (!tenants?.length) {
        console.log('❌ Nenhum tenant ativo encontrado');
        return;
    }

    console.log(`✅ Encontrados ${tenants.length} tenants ativos\n`);

    const results = [];
    const csvData = [];
    
    // Headers CSV
    csvData.push([
        'Métrica',
        'Tenant',
        'Business_Name', 
        'Período',
        'Valor_Bruto',
        'Sistema_Principal',
        'Sistema_Validado',
        'Status',
        'Diferença_Raw_Main',
        'Diferença_Raw_Validated',
        'Timestamp'
    ]);

    for (const tenant of tenants) {
        console.log(`\n🔄 Processando Tenant: ${tenant.business_name} (${tenant.id})`);
        
        for (const period of PERIODS) {
            console.log(`  📅 Período: ${period}`);
            
            // Calcular métricas brutas
            const rawMetrics = await calculateRawMetrics(tenant.id, period);
            
            // Buscar métricas dos sistemas
            const mainMetrics = await getMainSystemMetrics(tenant.id, period);
            const validatedMetrics = await getValidatedSystemMetrics(tenant.id, period);
            
            // Comparar cada métrica
            for (const metricName of METRICS_TO_VALIDATE) {
                const raw = rawMetrics[metricName] || 0;
                const main = mainMetrics[metricName] || 0;
                const validated = validatedMetrics[metricName] || 0;
                
                const status = getComparisonStatus(raw, main, validated);
                const diffRawMain = Math.abs(raw - main);
                const diffRawValidated = Math.abs(raw - validated);
                
                const result = {
                    metric: metricName,
                    tenant: tenant.id,
                    business_name: tenant.business_name,
                    period,
                    raw_value: Number(raw.toFixed(2)),
                    main_system: Number(main.toFixed(2)),
                    validated_system: Number(validated.toFixed(2)),
                    status,
                    diff_raw_main: Number(diffRawMain.toFixed(2)),
                    diff_raw_validated: Number(diffRawValidated.toFixed(2))
                };
                
                results.push(result);
                
                // Adicionar ao CSV
                csvData.push([
                    metricName,
                    tenant.id,
                    tenant.business_name,
                    period,
                    raw,
                    main,
                    validated,
                    status,
                    diffRawMain,
                    diffRawValidated,
                    new Date().toISOString()
                ]);
            }
        }
    }

    // Gerar relatório no console
    console.log('\n' + '='.repeat(120));
    console.log('📈 RELATÓRIO COMPARATIVO COMPLETO DE MÉTRICAS');
    console.log('='.repeat(120));

    // Agrupar por status para relatório resumido
    const statusSummary = {};
    results.forEach(result => {
        if (!statusSummary[result.status]) {
            statusSummary[result.status] = [];
        }
        statusSummary[result.status].push(result);
    });

    console.log('\n📊 RESUMO POR STATUS:');
    Object.keys(statusSummary).forEach(status => {
        console.log(`${status}: ${statusSummary[status].length} casos`);
    });

    // Mostrar casos problemáticos
    console.log('\n🔥 CASOS PROBLEMÁTICOS (Diferenças significativas):');
    const problematicCases = results.filter(r => 
        r.status.includes('DIFFERENT') || r.status.includes('SYSTEMS_MATCH_RAW_DIFF')
    );

    if (problematicCases.length > 0) {
        console.log('\n| Métrica | Tenant | Período | Bruto | Principal | Validado | Status |');
        console.log('|---------|--------|---------|-------|-----------|----------|--------|');
        
        problematicCases.slice(0, 20).forEach(case_ => { // Mostrar apenas primeiros 20
            console.log(`| ${case_.metric} | ${case_.tenant.substring(0, 8)}... | ${case_.period} | ${case_.raw_value} | ${case_.main_system} | ${case_.validated_system} | ${case_.status} |`);
        });
        
        if (problematicCases.length > 20) {
            console.log(`... e mais ${problematicCases.length - 20} casos problemáticos`);
        }
    } else {
        console.log('✅ Nenhum caso problemático encontrado!');
    }

    // Salvar CSV
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 'T' + new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const filename = `COMPREHENSIVE-METRICS-COMPARISON-${timestamp}.csv`;
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 ARQUIVO CSV SALVO: ${filename}`);
    console.log(`📁 Total de registros: ${csvData.length - 1}`);
    console.log(`🔍 Total de tenants: ${tenants.length}`);
    console.log(`📊 Total de métricas: ${METRICS_TO_VALIDATE.length}`);
    console.log(`📅 Total de períodos: ${PERIODS.length}`);

    // Estatísticas finais
    const totalComparisons = results.length;
    const matchingCases = results.filter(r => r.status === '✅ MATCH').length;
    const accuracyRate = ((matchingCases / totalComparisons) * 100).toFixed(2);
    
    console.log('\n📈 ESTATÍSTICAS FINAIS:');
    console.log(`✅ Casos perfeitos: ${matchingCases}/${totalComparisons} (${accuracyRate}%)`);
    console.log(`⚠️  Casos com diferenças: ${totalComparisons - matchingCases}`);
    
    console.log('\n' + '='.repeat(120));
    console.log('🎯 ANÁLISE COMPLETA FINALIZADA');
    console.log('='.repeat(120));

    return {
        results,
        summary: statusSummary,
        filename,
        stats: {
            total_comparisons: totalComparisons,
            matching_cases: matchingCases,
            accuracy_rate: accuracyRate
        }
    };
}

/**
 * Função principal
 */
async function main() {
    try {
        const startTime = Date.now();
        
        console.log('🚀 INICIANDO GERAÇÃO DE TABELA COMPARATIVA COMPLETA\n');
        
        const analysis = await generateComprehensiveTable();
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n⏱️  Tempo total de execução: ${duration}s`);
        console.log(`📊 Análise disponível em: ${analysis.filename}`);
        
    } catch (error) {
        console.error('❌ Erro na execução:', error);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = {
    generateComprehensiveTable,
    calculateRawMetrics,
    getMainSystemMetrics,
    getValidatedSystemMetrics
};