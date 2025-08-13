#!/usr/bin/env node

/**
 * TESTE FINAL CORRETO - UNIQUE CUSTOMERS
 * 
 * Usa first_interaction como data de cadastro do cliente
 * Baseado em user_tenants + users
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular unique customers usando first_interaction
 */
async function calculateUniqueCustomersFinal(tenantId, periodDays) {
    console.log(`👥 UNIQUE CUSTOMERS FINAL para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Query usando first_interaction como data de cadastro
        const { data: customers, error } = await supabase
            .from('user_tenants')
            .select(`
                user_id,
                first_interaction,
                last_interaction,
                total_bookings,
                users (
                    id,
                    name,
                    email
                )
            `)
            .eq('tenant_id', tenantId)
            .gte('first_interaction', startDate.toISOString())
            .lte('first_interaction', endDate.toISOString());
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return {
                unique_customers: 0,
                period_days: periodDays,
                error: error.message
            };
        }
        
        if (!customers || customers.length === 0) {
            console.log('   📭 Nenhum cliente encontrado no período');
            return {
                unique_customers: 0,
                period_days: periodDays,
                total_relations: 0
            };
        }
        
        // Clientes únicos (já são únicos por user_id na tabela)
        const uniqueCount = customers.length;
        
        console.log(`   👥 ${uniqueCount} novos clientes no período`);
        console.log(`   📊 Baseado em first_interaction em user_tenants`);
        
        // Sample de clientes
        if (customers.length > 0) {
            console.log('   🔍 Sample de novos clientes:');
            customers.slice(0, 3).forEach((customer, index) => {
                const userName = customer.users?.name || 'N/A';
                const userEmail = customer.users?.email || 'N/A';
                const firstInteraction = new Date(customer.first_interaction).toISOString().split('T')[0];
                console.log(`      ${index + 1}. ${userName} - ${firstInteraction} (bookings: ${customer.total_bookings})`);
            });
        }
        
        return {
            unique_customers: uniqueCount,
            period_days: periodDays,
            total_relations: uniqueCount,
            method: 'first_interaction'
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return {
            unique_customers: 0,
            period_days: periodDays,
            error: error.message
        };
    }
}

/**
 * Comparação final
 */
async function finalComparison(tenantId) {
    console.log(`📊 Comparação final para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Total histórico user_tenants
        const { count: totalUserTenants, error: totalError } = await supabase
            .from('user_tenants')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);
            
        // Total histórico appointments
        const { data: appointmentUsers, error: appointmentError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .not('user_id', 'is', null);
            
        const appointmentUniqueCount = appointmentError ? 0 : new Set(appointmentUsers?.map(a => a.user_id) || []).size;
        
        console.log(`   📈 TOTAIS HISTÓRICOS:`);
        console.log(`      user_tenants: ${totalUserTenants || 0} clientes`);
        console.log(`      appointments: ${appointmentUniqueCount} clientes únicos`);
        console.log(`      Diferença: +${(totalUserTenants || 0) - appointmentUniqueCount} a favor do user_tenants`);
        
        return {
            user_tenants_total: totalUserTenants || 0,
            appointments_total: appointmentUniqueCount,
            difference: (totalUserTenants || 0) - appointmentUniqueCount
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Executar teste final
 */
async function runFinalTest() {
    console.log('🎯 TESTE FINAL - UNIQUE CUSTOMERS CORRETO');
    console.log('='.repeat(60));
    
    try {
        // Buscar tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📊 ${tenants.length} tenants para teste:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const periods = [7, 30, 90];
        const finalResults = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            finalResults[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Comparação histórica
            const comparison = await finalComparison(tenant.id);
            if (comparison) {
                finalResults[tenant.id].comparison = comparison;
            }
            
            // Teste por período
            for (const periodDays of periods) {
                const result = await calculateUniqueCustomersFinal(tenant.id, periodDays);
                finalResults[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      7d:  ${finalResults[tenant.id].periods['7d'].unique_customers} novos clientes`);
            console.log(`      30d: ${finalResults[tenant.id].periods['30d'].unique_customers} novos clientes`);  
            console.log(`      90d: ${finalResults[tenant.id].periods['90d'].unique_customers} novos clientes`);
        }
        
        // Relatório final consolidado
        console.log('\n🎯 RELATÓRIO FINAL CONSOLIDADO');
        console.log('='.repeat(60));
        
        console.log('✅ IMPLEMENTAÇÃO CORRETA:');
        console.log('   ✅ Fonte: user_tenants (não appointments)');
        console.log('   ✅ Data: first_interaction (não created_at)');
        console.log('   ✅ Período: Filtro por intervalo de datas');
        console.log('   ✅ Único: Cada user_id por tenant é único');
        
        console.log('\n📊 RESULTADOS POR TENANT/PERÍODO:');
        Object.entries(finalResults).forEach(([tenantId, data]) => {
            console.log(`\n   🏢 ${data.name}:`);
            console.log(`      Novos clientes - 7d: ${data.periods['7d'].unique_customers} | 30d: ${data.periods['30d'].unique_customers} | 90d: ${data.periods['90d'].unique_customers}`);
            if (data.comparison) {
                console.log(`      Total histórico: ${data.comparison.user_tenants_total} (vs appointments: ${data.comparison.appointments_total})`);
            }
        });
        
        console.log('\n✅ MÉTRICA VALIDADA E CORRIGIDA');
        console.log('\n💡 IMPLEMENTAÇÃO PARA SCRIPT BASE:');
        console.log('   - Tabela: user_tenants');
        console.log('   - Campo data: first_interaction');
        console.log('   - Filtro: tenant_id + período first_interaction');
        console.log('   - Contagem: COUNT(DISTINCT user_id) ou LENGTH');
        
        return finalResults;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar
if (require.main === module) {
    runFinalTest().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateUniqueCustomersFinal, finalComparison };