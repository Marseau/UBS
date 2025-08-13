#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA TOTAL_UNIQUE_CUSTOMERS
 * 
 * Valida o cálculo de clientes únicos por tenant
 * Analisa diferentes fontes de dados de clientes
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Análise de fonte de dados de clientes
 */
async function analyzeCustomerDataSources(tenantId) {
    console.log(`🔍 Analisando fontes de dados de clientes para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // 1. Clientes via appointments
        const { data: appointmentUsers, error: appointmentError } = await supabase
            .from('appointments')
            .select('user_id, created_at, status')
            .eq('tenant_id', tenantId)
            .not('user_id', 'is', null);
            
        if (appointmentError) throw appointmentError;
        
        // 2. Clientes via conversation_history
        const { data: conversationUsers, error: conversationError } = await supabase
            .from('conversation_history')
            .select('conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .not('conversation_context', 'is', null);
            
        if (conversationError) throw conversationError;
        
        // 3. Clientes via users (se existir relação direta)
        const { data: directUsers, error: directError } = await supabase
            .from('users')
            .select('id, created_at')
            .limit(5); // Sample para verificar estrutura
            
        if (directError) throw directError;
        
        // Análise dos dados
        const uniqueAppointmentUsers = new Set(appointmentUsers?.map(a => a.user_id) || []);
        const uniqueConversationUsers = new Set();
        
        conversationUsers?.forEach(conv => {
            const userId = conv.conversation_context?.user_id;
            if (userId) uniqueConversationUsers.add(userId);
        });
        
        console.log(`   📊 FONTES DE CLIENTES:`);
        console.log(`      Via appointments: ${uniqueAppointmentUsers.size} clientes únicos`);
        console.log(`      Via conversations: ${uniqueConversationUsers.size} clientes únicos`);
        console.log(`      Tabela users: ${directUsers?.length} registros (sample)`);
        
        // Interseção entre fontes
        const intersection = new Set([...uniqueAppointmentUsers].filter(x => uniqueConversationUsers.has(x)));
        const appointmentOnly = new Set([...uniqueAppointmentUsers].filter(x => !uniqueConversationUsers.has(x)));
        const conversationOnly = new Set([...uniqueConversationUsers].filter(x => !uniqueAppointmentUsers.has(x)));
        
        console.log(`   🔄 OVERLAP ENTRE FONTES:`);
        console.log(`      Em ambas: ${intersection.size}`);
        console.log(`      Só appointments: ${appointmentOnly.size}`);
        console.log(`      Só conversations: ${conversationOnly.size}`);
        
        // Verificar alguns status de appointments
        if (appointmentUsers?.length > 0) {
            const statusCount = {};
            appointmentUsers.forEach(apt => {
                statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
            });
            
            console.log(`   📈 STATUS DOS APPOINTMENTS:`);
            Object.entries(statusCount).forEach(([status, count]) => {
                console.log(`      ${status}: ${count}`);
            });
        }
        
        return {
            appointment_users: uniqueAppointmentUsers.size,
            conversation_users: uniqueConversationUsers.size,
            intersection: intersection.size,
            appointment_only: appointmentOnly.size,
            conversation_only: conversationOnly.size
        };
        
    } catch (error) {
        console.error(`   💥 Erro na análise: ${error.message}`);
        throw error;
    }
}

/**
 * Testar métrica atual (sem período)
 */
async function testCurrentImplementation(tenantId) {
    console.log(`🧪 Testando implementação atual para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { data: uniqueUsers, error } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .not('user_id', 'is', null);
        
        if (error) throw error;
        
        const uniqueCount = new Set(uniqueUsers?.map(u => u.user_id) || []).size;
        
        console.log(`   ✅ Implementação atual: ${uniqueCount} clientes únicos`);
        console.log(`   📝 Método: appointments.user_id únicos`);
        console.log(`   ⚠️  SEM filtro de período - dados históricos completos`);
        
        return { count: uniqueCount };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Propor implementação com período
 */
async function testWithPeriodFilter(tenantId, periodDays) {
    console.log(`📅 Testando com filtro de período ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Clientes com appointments no período
        const { data: periodAppointments, error: appointmentError } = await supabase
            .from('appointments')
            .select('user_id, created_at, status')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('user_id', 'is', null);
            
        if (appointmentError) throw appointmentError;
        
        // Clientes com conversas no período 
        const { data: periodConversations, error: conversationError } = await supabase
            .from('conversation_history')
            .select('conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null);
            
        if (conversationError) throw conversationError;
        
        // Unificar clientes únicos do período
        const periodUsers = new Set();
        
        periodAppointments?.forEach(apt => {
            if (apt.user_id) periodUsers.add(apt.user_id);
        });
        
        periodConversations?.forEach(conv => {
            const userId = conv.conversation_context?.user_id;
            if (userId) periodUsers.add(userId);
        });
        
        const appointmentOnlyCount = new Set(periodAppointments?.map(a => a.user_id) || []).size;
        const conversationOnlyCount = new Set();
        periodConversations?.forEach(conv => {
            const userId = conv.conversation_context?.user_id;
            if (userId) conversationOnlyCount.add(userId);
        });
        
        console.log(`   📊 CLIENTES NO PERÍODO ${periodDays}d:`);
        console.log(`      Via appointments: ${appointmentOnlyCount}`);
        console.log(`      Via conversations: ${conversationOnlyCount.size}`);
        console.log(`      TOTAL ÚNICO: ${periodUsers.size}`);
        
        return {
            period_days: periodDays,
            appointment_customers: appointmentOnlyCount,
            conversation_customers: conversationOnlyCount.size,
            total_unique: periodUsers.size
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Executar todos os testes
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA TOTAL_UNIQUE_CUSTOMERS');
    console.log('='.repeat(70));
    
    try {
        // Buscar tenants para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`)
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            // 1. Análise de fontes
            const sourceAnalysis = await analyzeCustomerDataSources(tenant.id);
            
            // 2. Teste implementação atual
            const currentResult = await testCurrentImplementation(tenant.id);
            
            // 3. Teste com períodos
            const periods = [7, 30, 90];
            for (const period of periods) {
                await testWithPeriodFilter(tenant.id, period);
            }
        }
        
        console.log('\n📈 ANÁLISE DA MÉTRICA:');
        console.log('='.repeat(60));
        console.log('❌ PROBLEMA 1: Sem filtro de período - dados históricos');
        console.log('❌ PROBLEMA 2: Fonte única (appointments) pode ser limitada');
        console.log('❌ PROBLEMA 3: Não diferencia por status de appointment');
        console.log('');
        console.log('💡 RECOMENDAÇÕES:');
        console.log('✅ Adicionar filtro de período (7d/30d/90d)');
        console.log('✅ Unificar fontes: appointments + conversations');
        console.log('✅ Considerar status de appointments válidos');
        console.log('✅ Métrica deveria ser "active_customers" no período');
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { 
    analyzeCustomerDataSources, 
    testCurrentImplementation,
    testWithPeriodFilter 
};