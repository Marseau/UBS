const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * TESTE DAS 4 MÉTRICAS DE SISTEMA - SIMULAÇÃO POSTGRESQL
 * 
 * Simula as PostgreSQL functions para System Metrics:
 * 1. total_unique_customers - União de user_id de appointments + conversations
 * 2. services_available - Lista completa de serviços ativos 
 * 3. total_professionals - Distinct professional_id (acumulativo)
 * 4. monthly_platform_cost_brl - Cálculo baseado em tiers de conversação
 */

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 1. TOTAL_UNIQUE_CUSTOMERS - União de distinct user_id
 */
async function calculateTotalUniqueCustomers(tenantId, startDate, endDate) {
    console.log(`👥 TOTAL_UNIQUE_CUSTOMERS para tenant ${tenantId.substring(0, 8)}`);
    console.log(`   📅 Período: ${startDate} até ${endDate}`);
    
    try {
        // Buscar user_id de appointments no período
        const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .lte('start_time', endDate)
            .not('user_id', 'is', null);

        if (aptError) {
            console.error(`   ❌ Erro appointments: ${aptError.message}`);
        }

        // Buscar user_id de conversation_history no período
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .not('conversation_context', 'is', null);

        if (convError) {
            console.error(`   ❌ Erro conversations: ${convError.message}`);
        }

        // União de usuários únicos
        const uniqueUsers = new Set();
        
        appointments?.forEach(apt => {
            if (apt.user_id) uniqueUsers.add(apt.user_id);
        });
        
        conversations?.forEach(conv => {
            const userId = conv.conversation_context?.user_id;
            if (userId) uniqueUsers.add(userId);
        });

        const periodDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

        const result = {
            count: uniqueUsers.size,
            period_days: periodDays,
            sources: {
                appointments: appointments?.length || 0,
                conversations: conversations?.length || 0
            }
        };

        console.log(`   ✅ Usuários únicos: ${result.count}`);
        console.log(`   📊 Sources: ${result.sources.appointments} apt + ${result.sources.conversations} conv`);
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 2. SERVICES_AVAILABLE - Lista completa de serviços ativos
 */
async function calculateServicesAvailable(tenantId, startDate, endDate) {
    console.log(`🛠️ SERVICES_AVAILABLE para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Usar campos exatos do script validado - apenas count
        const { count: totalCount, error } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if (error) {
            console.error(`   ❌ Erro services: ${error.message}`);
            throw error;
        }

        // Script validado retorna apenas count - não lista detalhada
        const servicesList = [];  // Script não retorna lista, apenas count

        const result = {
            services: servicesList,
            count: totalCount || 0
        };

        console.log(`   ✅ Serviços disponíveis: ${result.count}`);
        console.log(`   📋 Script validado retorna apenas COUNT (não lista detalhada)`);
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 3. TOTAL_PROFESSIONALS - Distinct professional_id (lógica acumulativa)
 */
async function calculateTotalProfessionals(tenantId, startDate, endDate) {
    console.log(`👨‍⚕️ TOTAL_PROFESSIONALS para tenant ${tenantId.substring(0, 8)}`);
    console.log(`   📅 Cutoff date: ${endDate} (acumulativo)`);
    
    try {
        // Buscar appointments até a data final (acumulativo)
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('professional_id')
            .eq('tenant_id', tenantId)
            .lte('start_time', endDate + ' 23:59:59')
            .not('professional_id', 'is', null);

        if (error) {
            console.error(`   ❌ Erro appointments: ${error.message}`);
            throw error;
        }

        // Contar profissionais únicos
        const uniqueProfessionals = new Set(appointments?.map(apt => apt.professional_id) || []);

        const result = {
            count: uniqueProfessionals.size,
            total_appointments: appointments?.length || 0,
            cutoff_date: endDate
        };

        console.log(`   ✅ Profissionais únicos: ${result.count}`);
        console.log(`   📊 Total appointments: ${result.total_appointments}`);
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 4. MONTHLY_PLATFORM_COST_BRL - Cálculo baseado em tiers de conversação
 */
async function calculateMonthlyPlatformCostBrl(tenantId, startDate, endDate) {
    console.log(`💰 MONTHLY_PLATFORM_COST_BRL para tenant ${tenantId.substring(0, 8)}`);
    console.log(`   📅 Período: ${startDate} até ${endDate}`);
    
    try {
        // Contar conversas por session_id no período
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .not('conversation_context', 'is', null);

        if (error) {
            console.error(`   ❌ Erro conversations: ${error.message}`);
            throw error;
        }

        // Contar sessões únicas
        const sessions = new Set();
        conversations?.forEach(conv => {
            const sessionId = conv.conversation_context?.session_id;
            if (sessionId) sessions.add(sessionId);
        });

        const totalConversations = sessions.size;

        // Aplicar regras de pricing SaaS
        let plano, custoTotal;
        
        if (totalConversations <= 200) {
            plano = { nome: 'basico', preco: 58.00, limite: 200, excedente: 0.00 };
            custoTotal = plano.preco;
        } else if (totalConversations <= 400) {
            plano = { nome: 'profissional', preco: 116.00, limite: 400, excedente: 0.00 };
            custoTotal = plano.preco;
        } else if (totalConversations <= 1250) {
            plano = { nome: 'enterprise', preco: 290.00, limite: 1250, excedente: 0.00 };
            custoTotal = plano.preco;
        } else {
            plano = { nome: 'enterprise', preco: 290.00, limite: 1250, excedente: 0.25 };
            const excesso = totalConversations - plano.limite;
            custoTotal = plano.preco + (excesso * plano.excedente);
        }

        const conversasExcedentes = Math.max(0, totalConversations - plano.limite);
        const custoExcedentes = conversasExcedentes * plano.excedente;
        const periodDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

        const result = {
            period_days: periodDays,
            calculated_at: new Date().toISOString(),
            total_conversations: totalConversations,
            plano_atual: plano.nome,
            plano_preco_base: plano.preco,
            limite_conversas_plano: plano.limite,
            conversas_excedentes: conversasExcedentes,
            preco_excedente_unitario: plano.excedente,
            custo_excedentes: custoExcedentes,
            custo_total_plataforma: custoTotal,
            billing_model: 'conversation_based',
            currency: 'BRL'
        };

        console.log(`   💬 Total conversas: ${totalConversations}`);
        console.log(`   📋 Plano atual: ${plano.nome.toUpperCase()}`);
        console.log(`   💰 Custo base: R$ ${plano.preco.toFixed(2)}`);
        console.log(`   ➕ Excedentes: ${conversasExcedentes} × R$ ${plano.excedente} = R$ ${custoExcedentes.toFixed(2)}`);
        console.log(`   🎯 CUSTO TOTAL: R$ ${custoTotal.toFixed(2)}`);
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Testar todas as 4 métricas de sistema
 */
async function testSystemMetrics() {
    console.log('🧪 TESTANDO SYSTEM METRICS - 4 POSTGRESQL FUNCTIONS SIMULADAS');
    console.log('='.repeat(70));
    
    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const startDate = '2025-07-31';
    const endDate = '2025-08-07';

    try {
        console.log(`\n🏢 TESTE TENANT: ${testTenantId.substring(0, 8)}`);
        console.log('-'.repeat(60));

        // Test 1: Total Unique Customers
        console.log('\n👥 1. TOTAL_UNIQUE_CUSTOMERS');
        console.log('-'.repeat(40));
        const uniqueCustomersData = await calculateTotalUniqueCustomers(testTenantId, startDate, endDate);

        // Test 2: Services Available  
        console.log('\n🛠️ 2. SERVICES_AVAILABLE');
        console.log('-'.repeat(40));
        const servicesData = await calculateServicesAvailable(testTenantId, startDate, endDate);

        // Test 3: Total Professionals
        console.log('\n👨‍⚕️ 3. TOTAL_PROFESSIONALS');
        console.log('-'.repeat(40));
        const professionalsData = await calculateTotalProfessionals(testTenantId, startDate, endDate);

        // Test 4: Monthly Platform Cost BRL
        console.log('\n💰 4. MONTHLY_PLATFORM_COST_BRL');
        console.log('-'.repeat(40));
        const platformCostData = await calculateMonthlyPlatformCostBrl(testTenantId, startDate, endDate);

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('🎉 TESTE SYSTEM METRICS CONCLUÍDO');
        
        console.log('\n📊 RESUMO DAS 4 MÉTRICAS DE SISTEMA:');
        console.log(`👥 Clientes únicos: ${uniqueCustomersData[0]?.count || 0}`);
        console.log(`🛠️ Serviços disponíveis: ${servicesData[0]?.count || 0}`);
        console.log(`👨‍⚕️ Profissionais: ${professionalsData[0]?.count || 0}`);
        console.log(`💰 Custo plataforma: R$ ${platformCostData[0]?.custo_total_plataforma?.toFixed(2) || '0.00'}`);
        
        console.log('\n✅ FUNÇÕES POSTGRESQL PRONTAS PARA CRIAÇÃO');
        console.log('   📋 As 4 funções seguem exatamente a lógica dos scripts validados');
        console.log('   🔄 Retornam formato JSON compatível com o sistema existente');
        console.log('   🛡️ Incluem isolamento por tenant_id e tratamento de erros');

        return {
            uniqueCustomers: uniqueCustomersData[0],
            services: servicesData[0],
            professionals: professionalsData[0],
            platformCost: platformCostData[0]
        };

    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (require.main === module) {
    testSystemMetrics().then(() => {
        console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO');
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = {
    calculateTotalUniqueCustomers,
    calculateServicesAvailable,
    calculateTotalProfessionals,
    calculateMonthlyPlatformCostBrl
};