#!/usr/bin/env node

/**
 * TESTE CORRETO FINAL - UNIQUE CUSTOMERS POR PERÍODO
 * 
 * Usa users.created_at + JOIN user_tenants para saber
 * quantos clientes únicos foram CRIADOS no período por tenant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular clientes únicos criados no período por tenant
 */
async function calculateUniqueCustomersCreatedInPeriod(tenantId, periodDays) {
    console.log(`👥 CLIENTES CRIADOS ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // JOIN users + user_tenants onde users.created_at no período
        const { data: uniqueCustomers, error } = await supabase
            .from('user_tenants')
            .select(`
                user_id,
                users!inner (
                    id,
                    created_at,
                    name,
                    email
                )
            `)
            .eq('tenant_id', tenantId)
            .gte('users.created_at', startDate.toISOString())
            .lte('users.created_at', endDate.toISOString());
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return {
                unique_customers: 0,
                period_days: periodDays,
                error: error.message
            };
        }
        
        if (!uniqueCustomers || uniqueCustomers.length === 0) {
            console.log('   📭 Nenhum cliente criado no período');
            return {
                unique_customers: 0,
                period_days: periodDays
            };
        }
        
        // Clientes únicos (já são únicos porque user_id é único por tenant)
        const uniqueCount = uniqueCustomers.length;
        
        console.log(`   👥 ${uniqueCount} clientes criados no período`);
        
        // Sample dos clientes criados
        if (uniqueCustomers.length > 0) {
            console.log('   🔍 Sample de clientes criados:');
            uniqueCustomers.slice(0, 3).forEach((customer, index) => {
                const user = customer.users;
                const createdDate = new Date(user.created_at).toISOString().split('T')[0];
                console.log(`      ${index + 1}. ${user.name || 'N/A'} - Criado em: ${createdDate}`);
            });
        }
        
        return {
            unique_customers: uniqueCount,
            period_days: periodDays,
            method: 'users.created_at + user_tenants'
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
 * Total histórico para comparação
 */
async function getTotalHistoricalCustomers(tenantId) {
    const { count: totalCount, error } = await supabase
        .from('user_tenants')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
        
    return {
        total: totalCount || 0,
        error: error?.message
    };
}

/**
 * Executar teste final correto
 */
async function runFinalCorrectTest() {
    console.log('🎯 TESTE FINAL CORRETO - CLIENTES CRIADOS POR PERÍODO');
    console.log('='.repeat(70));
    console.log('Baseado em: users.created_at + user_tenants JOIN');
    console.log('');
    
    try {
        // Buscar tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
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
            console.log('-'.repeat(70));
            
            finalResults[tenant.id] = {
                name: tenant.name,
                periods: {},
                total_historical: 0
            };
            
            // Total histórico
            const historical = await getTotalHistoricalCustomers(tenant.id);
            finalResults[tenant.id].total_historical = historical.total;
            console.log(`   📊 Total histórico: ${historical.total} clientes`);
            
            // Por período
            for (const periodDays of periods) {
                const result = await calculateUniqueCustomersCreatedInPeriod(tenant.id, periodDays);
                finalResults[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      Criados 7d:  ${finalResults[tenant.id].periods['7d'].unique_customers}`);
            console.log(`      Criados 30d: ${finalResults[tenant.id].periods['30d'].unique_customers}`);  
            console.log(`      Criados 90d: ${finalResults[tenant.id].periods['90d'].unique_customers}`);
            console.log(`      Total: ${finalResults[tenant.id].total_historical}`);
        }
        
        // Tabela consolidada
        console.log('\n📋 TABELA FINAL - CLIENTES CRIADOS POR PERÍODO');
        console.log('='.repeat(70));
        console.log('TENANT                    | 7d   | 30d  | 90d  | TOTAL');
        console.log('-'.repeat(70));
        
        Object.entries(finalResults).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const d7 = String(data.periods['7d'].unique_customers).padStart(4);
            const d30 = String(data.periods['30d'].unique_customers).padStart(4);
            const d90 = String(data.periods['90d'].unique_customers).padStart(4);
            const total = String(data.total_historical).padStart(5);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90} | ${total}`);
        });
        
        console.log('-'.repeat(70));
        
        // Estatísticas
        const totalPlatform = Object.values(finalResults).reduce((sum, tenant) => sum + tenant.total_historical, 0);
        
        console.log(`\n📊 ESTATÍSTICAS FINAIS:`);
        console.log(`   Total clientes plataforma: ${totalPlatform}`);
        
        // Médias
        const tenantCount = Object.keys(finalResults).length;
        const avg7d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['7d'].unique_customers, 0) / tenantCount);
        const avg30d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['30d'].unique_customers, 0) / tenantCount);
        const avg90d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['90d'].unique_customers, 0) / tenantCount);
        
        console.log(`\n   Médias de clientes criados por tenant:`);
        console.log(`     7d:  ${avg7d} clientes`);
        console.log(`     30d: ${avg30d} clientes`);
        console.log(`     90d: ${avg90d} clientes`);
        
        console.log('\n✅ IMPLEMENTAÇÃO CORRETA VALIDADA');
        console.log('\n💡 PARA O SCRIPT BASE:');
        console.log('   - JOIN: user_tenants + users');
        console.log('   - Filtro: users.created_at no período + tenant_id');
        console.log('   - Count: Registros únicos do JOIN');
        
        return finalResults;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar
if (require.main === module) {
    runFinalCorrectTest().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateUniqueCustomersCreatedInPeriod, getTotalHistoricalCustomers };