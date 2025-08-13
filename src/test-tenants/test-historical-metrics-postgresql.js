const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * TESTE DAS 3 MÉTRICAS HISTÓRICAS - SIMULAÇÃO POSTGRESQL
 * 
 * Simula as PostgreSQL functions para Historical Metrics (6 meses):
 * 1. historical_6months_conversations - Conversas por mês (session_id)
 * 2. historical_6months_revenue - Receita por mês (appointments completed)
 * 3. historical_6months_customers - Clientes por mês (user_tenants.first_interaction)
 */

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 1. HISTORICAL_6MONTHS_CONVERSATIONS
 * Baseado em: conversation_history.created_at + unique session_id
 */
async function calculateHistorical6MonthsConversations(tenantId, startDate, endDate) {
    console.log(`📅 HISTORICAL_6MONTHS_CONVERSATIONS para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const now = new Date();
        const monthlyData = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        
        // Buscar todos os dados dos últimos 6 meses
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', sixMonthsAgo.toISOString())
            .lt('created_at', now.toISOString())
            .not('conversation_context', 'is', null);

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        // Processar por mês (month_0 = mais recente)
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - (monthOffset + 1), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            // Filtrar conversas do mês e contar sessões únicas
            const monthSessions = new Set();
            conversations?.forEach(conv => {
                const convDate = new Date(conv.created_at);
                if (convDate >= monthStart && convDate <= monthEnd) {
                    const sessionId = conv.conversation_context?.session_id;
                    if (sessionId) monthSessions.add(sessionId);
                }
            });
            
            monthlyData[`month_${monthOffset}`] = monthSessions.size;
        }

        const result = {
            conversations: monthlyData
        };

        console.log(`   ✅ Conversas 6 meses:`, Object.values(monthlyData));
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 2. HISTORICAL_6MONTHS_REVENUE  
 * Baseado em: appointments.start_time + status='completed' + final_price
 */
async function calculateHistorical6MonthsRevenue(tenantId, startDate, endDate) {
    console.log(`💰 HISTORICAL_6MONTHS_REVENUE para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const now = new Date();
        const monthlyData = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        
        // Buscar appointments dos últimos 6 meses (APENAS completed)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price, start_time, status')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')  // ✅ CHAVE: Apenas completed
            .gte('start_time', sixMonthsAgo.toISOString())
            .lt('start_time', now.toISOString())
            .order('start_time');

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        // Processar por mês (month_0 = mais recente)
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - (monthOffset + 1), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            // Filtrar appointments do mês e somar receita
            let monthRevenue = 0;
            appointments?.forEach(apt => {
                const aptDate = new Date(apt.start_time);
                if (aptDate >= monthStart && aptDate <= monthEnd) {
                    // Script validado: final_price OR quoted_price OR 0
                    const price = apt.final_price || apt.quoted_price || 0;
                    monthRevenue += price;
                }
            });
            
            // Arredondar para 2 casas decimais (como no script)
            monthlyData[`month_${monthOffset}`] = Math.round(monthRevenue * 100) / 100;
        }

        const result = monthlyData;

        console.log(`   ✅ Receita 6 meses:`, Object.values(monthlyData));
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 3. HISTORICAL_6MONTHS_CUSTOMERS
 * Baseado em: user_tenants.first_interaction + unique user_id
 */
async function calculateHistorical6MonthsCustomers(tenantId, startDate, endDate) {
    console.log(`👥 HISTORICAL_6MONTHS_CUSTOMERS para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const now = new Date();
        const monthlyData = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        
        // Buscar user_tenants dos últimos 6 meses por first_interaction
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        
        const { data: userTenants, error } = await supabase
            .from('user_tenants')
            .select('user_id, first_interaction')
            .eq('tenant_id', tenantId)
            .gte('first_interaction', sixMonthsAgo.toISOString())
            .lt('first_interaction', now.toISOString());

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        // Processar por mês (month_0 = mais recente)  
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - (monthOffset + 1), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            // Filtrar users do mês e contar únicos
            const monthUsers = new Set();
            userTenants?.forEach(userTenant => {
                const firstInteractionDate = new Date(userTenant.first_interaction);
                if (firstInteractionDate >= monthStart && firstInteractionDate <= monthEnd) {
                    monthUsers.add(userTenant.user_id);
                }
            });
            
            monthlyData[`month_${monthOffset}`] = monthUsers.size;
        }

        const result = monthlyData;

        console.log(`   ✅ Clientes 6 meses:`, Object.values(monthlyData));
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Testar todas as 3 métricas históricas
 */
async function testHistoricalMetrics() {
    console.log('🧪 TESTANDO HISTORICAL METRICS - 3 POSTGRESQL FUNCTIONS SIMULADAS');
    console.log('='.repeat(75));
    
    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const startDate = '2025-02-01'; // Dummy - funções calculam automaticamente
    const endDate = '2025-08-07';   // Dummy - funções calculam automaticamente

    try {
        console.log(`\n🏢 TESTE TENANT: ${testTenantId.substring(0, 8)}`);
        console.log('-'.repeat(60));

        // Test 1: Historical 6 Months Conversations
        console.log('\n📅 1. HISTORICAL_6MONTHS_CONVERSATIONS');
        console.log('-'.repeat(45));
        const conversationsData = await calculateHistorical6MonthsConversations(testTenantId, startDate, endDate);

        // Test 2: Historical 6 Months Revenue  
        console.log('\n💰 2. HISTORICAL_6MONTHS_REVENUE');
        console.log('-'.repeat(45));
        const revenueData = await calculateHistorical6MonthsRevenue(testTenantId, startDate, endDate);

        // Test 3: Historical 6 Months Customers
        console.log('\n👥 3. HISTORICAL_6MONTHS_CUSTOMERS');
        console.log('-'.repeat(45));
        const customersData = await calculateHistorical6MonthsCustomers(testTenantId, startDate, endDate);

        // Summary
        console.log('\n' + '='.repeat(75));
        console.log('🎉 TESTE HISTORICAL METRICS CONCLUÍDO');
        
        console.log('\n📊 RESUMO DAS 3 MÉTRICAS HISTÓRICAS (6 MESES):');
        const convArray = Object.values(conversationsData[0]?.conversations || {});
        const revArray = Object.values(revenueData[0] || {});
        const custArray = Object.values(customersData[0] || {});
        
        console.log(`📅 Conversas: [${convArray.join(', ')}] = ${convArray.reduce((a,b) => a+b, 0)} total`);
        console.log(`💰 Receita: [${revArray.join(', ')}] = R$ ${revArray.reduce((a,b) => a+b, 0).toFixed(2)} total`);
        console.log(`👥 Clientes: [${custArray.join(', ')}] = ${custArray.reduce((a,b) => a+b, 0)} total`);
        
        console.log('\n✅ FUNÇÕES POSTGRESQL PRONTAS PARA CRIAÇÃO');
        console.log('   📅 Conversations: unique session_id por mês (conversation_history.created_at)');
        console.log('   💰 Revenue: soma final_price de appointments completed (start_time)');
        console.log('   👥 Customers: unique user_id por mês (user_tenants.first_interaction)');
        console.log('   🔄 Formato: {month_0, month_1, ..., month_5} (month_0 = mais recente)');

        return {
            conversations: conversationsData[0],
            revenue: revenueData[0],
            customers: customersData[0]
        };

    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (require.main === module) {
    testHistoricalMetrics().then(() => {
        console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO');
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = {
    calculateHistorical6MonthsConversations,
    calculateHistorical6MonthsRevenue,
    calculateHistorical6MonthsCustomers
};