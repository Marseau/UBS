/**
 * Obter Detalhes Reais dos Tenants Testados
 * Mostra nomes dos tenants e métricas para 7, 30 e 90 dias
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// IDs dos tenants testados
const TESTED_TENANT_IDS = [
    'c3aa73f8-db80-40db-a9c4-73718a0fee34',  // Tenant da análise inicial
    '33b8c488-5aa9-4891-b335-701d10296681'   // Tenant com mais dados
];

/**
 * Obter nomes dos tenants
 */
async function getTenantNames() {
    console.log('🏢 NOMES DOS TENANTS TESTADOS');
    console.log('=' .repeat(50));

    const { data: tenants, error } = await supabase
        .from('tenants')
        .select('id, name, business_name, domain, status, subscription_plan, created_at')
        .in('id', TESTED_TENANT_IDS);

    if (error) {
        console.error('❌ Erro ao buscar nomes dos tenants:', error.message);
        return [];
    }

    tenants.forEach((tenant, index) => {
        console.log(`\n${index + 1}. 🏪 ${tenant.name || 'Sem Nome'}`);
        console.log(`   📧 Business: ${tenant.business_name || 'N/A'}`);
        console.log(`   🌐 Domínio: ${tenant.domain || 'N/A'}`);
        console.log(`   📅 Criado: ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`);
        console.log(`   📊 Status: ${tenant.status || 'N/A'}`);
        console.log(`   💳 Plano: ${tenant.subscription_plan || 'N/A'}`);
        console.log(`   🔑 ID: ${tenant.id}`);
    });

    return tenants;
}

/**
 * Calcular métricas para um período específico
 */
async function calculateTenantMetrics(tenantId, tenantName, days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Buscar appointments
    const { data: appointments } = await supabase
        .from('appointments')
        .select('id, status, quoted_price, final_price, user_id, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

    // Buscar conversations
    const { data: conversations } = await supabase
        .from('conversation_history')
        .select('id, conversation_outcome, conversation_context, confidence_score, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

    // Buscar billing
    const { data: billing } = await supabase
        .from('conversation_billing')
        .select('id, total_amount_brl, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

    // Calcular métricas de appointments
    const totalAppointments = appointments?.length || 0;
    const completedAppointments = appointments?.filter(a => a.status === 'completed').length || 0;
    const cancelledAppointments = appointments?.filter(a => a.status === 'cancelled').length || 0;
    const confirmedAppointments = appointments?.filter(a => a.status === 'confirmed').length || 0;
    
    const totalRevenue = appointments
        ?.filter(a => a.status === 'completed' && a.final_price)
        .reduce((sum, a) => sum + (a.final_price || 0), 0) || 0;
    
    const quotedRevenue = appointments
        ?.filter(a => a.quoted_price)
        .reduce((sum, a) => sum + (a.quoted_price || 0), 0) || 0;
    
    const uniqueCustomers = appointments 
        ? new Set(appointments.map(a => a.user_id)).size 
        : 0;

    const successRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;

    // Calcular métricas de conversations
    const totalConversations = conversations?.length || 0;
    const billableConversations = conversations?.filter(c => 
        c.conversation_outcome && c.conversation_outcome !== 'spam'
    ).length || 0;

    // Contar outcomes
    const outcomes = {};
    conversations?.forEach(conv => {
        if (conv.conversation_outcome) {
            outcomes[conv.conversation_outcome] = (outcomes[conv.conversation_outcome] || 0) + 1;
        }
    });

    const appointmentCreatedCount = outcomes['appointment_created'] || 0;
    const conversionRate = totalConversations > 0 ? (appointmentCreatedCount / totalConversations) * 100 : 0;

    // Calcular duração das conversas
    let totalChatMinutes = 0;
    conversations?.forEach(conv => {
        if (conv.conversation_context && typeof conv.conversation_context === 'object') {
            const context = conv.conversation_context;
            if (context.duration_minutes) {
                totalChatMinutes += parseFloat(context.duration_minutes) || 0;
            }
        }
    });

    const avgConversationDuration = totalConversations > 0 ? totalChatMinutes / totalConversations : 0;

    // Métricas de billing
    const billingRecords = billing?.length || 0;
    const billingRevenue = billing?.reduce((sum, b) => sum + (b.total_amount_brl || 0), 0) || 0;

    return {
        period: `${days} dias`,
        // Appointments
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        confirmedAppointments,
        totalRevenue,
        quotedRevenue,
        uniqueCustomers,
        successRate,
        // Conversations
        totalConversations,
        billableConversations,
        conversionRate,
        totalChatMinutes,
        avgConversationDuration,
        outcomes,
        // Billing
        billingRecords,
        billingRevenue,
        // Cross-validation
        appointmentConversationRatio: totalConversations > 0 ? (totalAppointments / totalConversations) * 100 : 0
    };
}

/**
 * Mostrar métricas detalhadas para um tenant
 */
async function showTenantMetrics(tenant) {
    console.log(`\n\n📊 MÉTRICAS DETALHADAS - ${tenant.name || tenant.business_name || 'Tenant'}`);
    console.log('=' .repeat(70));
    console.log(`🏪 Nome: ${tenant.name}`);
    console.log(`📧 Business: ${tenant.business_name}`);
    console.log(`🌐 Domínio: ${tenant.domain}`);
    console.log(`🔑 ID: ${tenant.id}`);

    // Calcular para os 3 períodos
    const periods = [7, 30, 90];
    const metricsData = [];

    for (const days of periods) {
        const metrics = await calculateTenantMetrics(tenant.id, tenant.name, days);
        metricsData.push(metrics);
        
        console.log(`\n⏰ PERÍODO: ${days} DIAS`);
        console.log('-' .repeat(30));
        
        // Appointments
        console.log(`📅 Appointments:`);
        console.log(`   Total: ${metrics.totalAppointments}`);
        console.log(`   Completed: ${metrics.completedAppointments} (${metrics.successRate.toFixed(1)}%)`);
        console.log(`   Confirmed: ${metrics.confirmedAppointments}`);
        console.log(`   Cancelled: ${metrics.cancelledAppointments}`);
        console.log(`   Clientes únicos: ${metrics.uniqueCustomers}`);
        
        // Revenue
        console.log(`💰 Receita:`);
        console.log(`   Realizada: R$ ${metrics.totalRevenue.toFixed(2)}`);
        console.log(`   Cotada: R$ ${metrics.quotedRevenue.toFixed(2)}`);
        
        // Conversations
        console.log(`💬 Conversas:`);
        console.log(`   Total: ${metrics.totalConversations}`);
        console.log(`   Faturáveis: ${metrics.billableConversations}`);
        console.log(`   Taxa conversão: ${metrics.conversionRate.toFixed(1)}%`);
        console.log(`   Duração média: ${metrics.avgConversationDuration.toFixed(1)} min`);
        console.log(`   Total chat: ${metrics.totalChatMinutes.toFixed(1)} min`);
        
        // Outcomes
        if (Object.keys(metrics.outcomes).length > 0) {
            console.log(`   Outcomes: ${JSON.stringify(metrics.outcomes)}`);
        }
        
        // Billing
        console.log(`🧾 Billing:`);
        console.log(`   Registros: ${metrics.billingRecords}`);
        console.log(`   Receita billing: R$ ${metrics.billingRevenue.toFixed(2)}`);
        
        // Cross-validation
        console.log(`🔍 Cross-validation:`);
        console.log(`   Ratio appointments/conversations: ${metrics.appointmentConversationRatio.toFixed(1)}%`);
    }

    // Tabela comparativa
    console.log(`\n📈 COMPARATIVO POR PERÍODO`);
    console.log('-' .repeat(70));
    console.log('| Métrica                  | 7 dias  | 30 dias | 90 dias |');
    console.log('|--------------------------|---------|---------|---------|');
    console.log(`| Appointments             | ${metricsData[0].totalAppointments.toString().padEnd(7)} | ${metricsData[1].totalAppointments.toString().padEnd(7)} | ${metricsData[2].totalAppointments.toString().padEnd(7)} |`);
    console.log(`| Receita (R$)             | ${metricsData[0].totalRevenue.toFixed(0).padEnd(7)} | ${metricsData[1].totalRevenue.toFixed(0).padEnd(7)} | ${metricsData[2].totalRevenue.toFixed(0).padEnd(7)} |`);
    console.log(`| Conversas                | ${metricsData[0].totalConversations.toString().padEnd(7)} | ${metricsData[1].totalConversations.toString().padEnd(7)} | ${metricsData[2].totalConversations.toString().padEnd(7)} |`);
    console.log(`| Taxa Sucesso (%)         | ${metricsData[0].successRate.toFixed(1).padEnd(7)} | ${metricsData[1].successRate.toFixed(1).padEnd(7)} | ${metricsData[2].successRate.toFixed(1).padEnd(7)} |`);
    console.log(`| Taxa Conversão (%)       | ${metricsData[0].conversionRate.toFixed(1).padEnd(7)} | ${metricsData[1].conversionRate.toFixed(1).padEnd(7)} | ${metricsData[2].conversionRate.toFixed(1).padEnd(7)} |`);
    console.log(`| Clientes Únicos          | ${metricsData[0].uniqueCustomers.toString().padEnd(7)} | ${metricsData[1].uniqueCustomers.toString().padEnd(7)} | ${metricsData[2].uniqueCustomers.toString().padEnd(7)} |`);
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 ANÁLISE DETALHADA DOS TENANTS TESTADOS');
        console.log('Context Engineering COLEAM00 - Métricas Reais por Período');
        console.log('=' .repeat(60));

        // Obter nomes dos tenants
        const tenants = await getTenantNames();
        
        if (tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }

        // Mostrar métricas detalhadas para cada tenant
        for (const tenant of tenants) {
            await showTenantMetrics(tenant);
        }

        console.log('\n\n✅ ANÁLISE COMPLETA');
        console.log('Os dados acima são 100% reais extraídos diretamente do banco de dados');
        console.log('Estes são os tenants que foram validados durante os testes do sistema de métricas');

    } catch (error) {
        console.error('💥 Erro durante análise:', error.message);
        process.exit(1);
    }
}

// Executar
main();