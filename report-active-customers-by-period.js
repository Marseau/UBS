#!/usr/bin/env node

/**
 * RELATÓRIO CORRETO: CLIENTES ATIVOS POR PERÍODO
 * 
 * Quantos clientes EXISTEM/ESTIVERAM ATIVOS nos últimos 7d, 30d, 90d
 * Baseado em last_interaction ou atividade no período
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular clientes ATIVOS por período (que tiveram atividade)
 */
async function getActiveCustomersByPeriod(tenantId, periodDays) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - periodDays);
    
    try {
        // Método 1: Clientes com last_interaction no período
        const { count: lastInteractionCount, error: lastInteractionError } = await supabase
            .from('user_tenants')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('last_interaction', startDate.toISOString())
            .lte('last_interaction', endDate.toISOString());
        
        // Método 2: Clientes com appointments no período
        const { data: appointmentUsers, error: appointmentError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('user_id', 'is', null);
        
        const appointmentUniqueCount = appointmentError ? 0 : new Set(appointmentUsers?.map(a => a.user_id) || []).size;
        
        // Método 3: Clientes com conversas no período
        const { data: conversationUsers, error: conversationError } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null);
        
        const conversationUniqueUsers = new Set();
        conversationUsers?.forEach(conv => {
            const userId = conv.conversation_context?.user_id;
            if (userId) conversationUniqueUsers.add(userId);
        });
        
        // Total histórico para comparação
        const { count: totalHistorical, error: totalError } = await supabase
            .from('user_tenants')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);
        
        return {
            period_days: periodDays,
            method_1_last_interaction: lastInteractionCount || 0,
            method_2_appointments: appointmentUniqueCount,
            method_3_conversations: conversationUniqueUsers.size,
            total_historical: totalHistorical || 0,
            errors: {
                last_interaction: lastInteractionError?.message,
                appointments: appointmentError?.message,
                conversations: conversationError?.message,
                total: totalError?.message
            }
        };
        
    } catch (error) {
        return {
            period_days: periodDays,
            method_1_last_interaction: 0,
            method_2_appointments: 0,
            method_3_conversations: 0,
            total_historical: 0,
            error: error.message
        };
    }
}

/**
 * Gerar relatório de clientes ativos
 */
async function generateActiveCustomersReport() {
    console.log('📊 RELATÓRIO DE CLIENTES ATIVOS POR PERÍODO');
    console.log('='.repeat(80));
    console.log('ATENÇÃO: Clientes que ESTIVERAM ATIVOS no período (não novos)');
    console.log('');
    
    try {
        // Buscar tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📋 ${tenants.length} tenants ativos encontrados\n`);
        
        const periods = [7, 30, 90];
        const reportData = [];
        
        // Processar cada tenant
        for (const tenant of tenants) {
            console.log(`🏢 ${tenant.name} (${tenant.id.substring(0, 8)})`);
            console.log('-'.repeat(70));
            
            const tenantData = {
                id: tenant.id,
                name: tenant.name,
                periods: {}
            };
            
            // Calcular para cada período
            for (const periodDays of periods) {
                const result = await getActiveCustomersByPeriod(tenant.id, periodDays);
                tenantData.periods[`${periodDays}d`] = result;
                
                console.log(`   📊 ${periodDays}d:`);
                console.log(`      Last interaction: ${result.method_1_last_interaction}`);
                console.log(`      Com appointments: ${result.method_2_appointments}`);
                console.log(`      Com conversas:    ${result.method_3_conversations}`);
                console.log(`      Total histórico:  ${result.total_historical}`);
                console.log('');
            }
            
            reportData.push(tenantData);
        }
        
        // Tabela consolidada usando o método mais confiável
        console.log('📋 TABELA CONSOLIDADA - CLIENTES ATIVOS (APPOINTMENTS)');
        console.log('='.repeat(80));
        console.log('TENANT                    | 7d   | 30d  | 90d  | TOTAL');
        console.log('-'.repeat(80));
        
        reportData.forEach(tenant => {
            const name = tenant.name.padEnd(24);
            const d7 = String(tenant.periods['7d'].method_2_appointments).padStart(4);
            const d30 = String(tenant.periods['30d'].method_2_appointments).padStart(4);
            const d90 = String(tenant.periods['90d'].method_2_appointments).padStart(4);
            const total = String(tenant.periods['90d'].total_historical).padStart(5);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90} | ${total}`);
        });
        
        console.log('-'.repeat(80));
        
        // Tabela consolidada usando last_interaction
        console.log('\n📋 TABELA CONSOLIDADA - CLIENTES ATIVOS (LAST_INTERACTION)');
        console.log('='.repeat(80));
        console.log('TENANT                    | 7d   | 30d  | 90d  | TOTAL');
        console.log('-'.repeat(80));
        
        reportData.forEach(tenant => {
            const name = tenant.name.padEnd(24);
            const d7 = String(tenant.periods['7d'].method_1_last_interaction).padStart(4);
            const d30 = String(tenant.periods['30d'].method_1_last_interaction).padStart(4);
            const d90 = String(tenant.periods['90d'].method_1_last_interaction).padStart(4);
            const total = String(tenant.periods['90d'].total_historical).padStart(5);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90} | ${total}`);
        });
        
        console.log('-'.repeat(80));
        
        // Estatísticas
        const totalPlatformCustomers = reportData.reduce((sum, tenant) => sum + tenant.periods['90d'].total_historical, 0);
        
        console.log(`\n📊 ESTATÍSTICAS GERAIS:`);
        console.log(`   Total clientes plataforma: ${totalPlatformCustomers}`);
        
        // Médias por método
        const avgAppointments7d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['7d'].method_2_appointments, 0) / reportData.length);
        const avgAppointments30d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['30d'].method_2_appointments, 0) / reportData.length);
        const avgAppointments90d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['90d'].method_2_appointments, 0) / reportData.length);
        
        console.log(`\n   Média clientes ativos (appointments):`);
        console.log(`     7d:  ${avgAppointments7d} clientes`);
        console.log(`     30d: ${avgAppointments30d} clientes`);
        console.log(`     90d: ${avgAppointments90d} clientes`);
        
        const avgLastInteraction7d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['7d'].method_1_last_interaction, 0) / reportData.length);
        const avgLastInteraction30d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['30d'].method_1_last_interaction, 0) / reportData.length);
        const avgLastInteraction90d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['90d'].method_1_last_interaction, 0) / reportData.length);
        
        console.log(`\n   Média clientes ativos (last_interaction):`);
        console.log(`     7d:  ${avgLastInteraction7d} clientes`);
        console.log(`     30d: ${avgLastInteraction30d} clientes`);
        console.log(`     90d: ${avgLastInteraction90d} clientes`);
        
        console.log('\n💡 RECOMENDAÇÃO PARA A MÉTRICA:');
        console.log('   A métrica total_unique_customers deve usar APPOINTMENTS');
        console.log('   pois representa clientes que realmente tiveram atividade.');
        
        console.log('\n✅ RELATÓRIO CONCLUÍDO');
        
        return reportData;
        
    } catch (error) {
        console.error('💥 ERRO NO RELATÓRIO:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    generateActiveCustomersReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { getActiveCustomersByPeriod, generateActiveCustomersReport };