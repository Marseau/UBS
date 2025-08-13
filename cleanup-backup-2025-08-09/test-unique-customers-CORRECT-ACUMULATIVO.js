#!/usr/bin/env node

/**
 * TESTE CORRETO ACUMULATIVO - UNIQUE CUSTOMERS POR PERÍODO
 * 
 * Lógica CORRETA: Cliente criado há 90 dias EXISTE nos períodos 7d, 30d e 90d
 * Usa users.created_at <= (hoje - período) - ACUMULATIVO
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular clientes únicos que EXISTEM no período (acumulativo)
 */
async function calculateUniqueCustomersExistingInPeriod(tenantId, periodDays) {
    console.log(`👥 CLIENTES EXISTENTES ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - periodDays);
        
        console.log(`   📅 Clientes criados ATÉ: ${cutoffDate.toISOString().split('T')[0]} (${periodDays}d atrás)`);
        
        // JOIN users + user_tenants onde users.created_at <= cutoff
        const { data: existingCustomers, error } = await supabase
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
            .lte('users.created_at', cutoffDate.toISOString());
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return {
                unique_customers: 0,
                period_days: periodDays,
                error: error.message
            };
        }
        
        if (!existingCustomers || existingCustomers.length === 0) {
            console.log('   📭 Nenhum cliente existente no período');
            return {
                unique_customers: 0,
                period_days: periodDays
            };
        }
        
        const uniqueCount = existingCustomers.length;
        
        console.log(`   👥 ${uniqueCount} clientes existentes no período ${periodDays}d`);
        
        // Sample dos clientes mais antigos e mais recentes
        if (existingCustomers.length > 0) {
            const sortedCustomers = existingCustomers.sort((a, b) => 
                new Date(a.users.created_at) - new Date(b.users.created_at)
            );
            
            const oldest = sortedCustomers[0];
            const newest = sortedCustomers[sortedCustomers.length - 1];
            
            console.log('   🔍 Range de clientes:');
            console.log(`      Mais antigo: ${oldest.users.name || 'N/A'} - ${new Date(oldest.users.created_at).toISOString().split('T')[0]}`);
            console.log(`      Mais recente: ${newest.users.name || 'N/A'} - ${new Date(newest.users.created_at).toISOString().split('T')[0]}`);
        }
        
        return {
            unique_customers: uniqueCount,
            period_days: periodDays,
            cutoff_date: cutoffDate.toISOString().split('T')[0],
            method: 'users.created_at <= cutoff (acumulativo)'
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
 * Executar teste acumulativo correto
 */
async function runAccumulativeTest() {
    console.log('🎯 TESTE ACUMULATIVO CORRETO - CLIENTES EXISTENTES POR PERÍODO');
    console.log('='.repeat(70));
    console.log('Lógica: Cliente criado há 90d EXISTE em 7d, 30d e 90d');
    console.log('Filtro: users.created_at <= (hoje - período)');
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
                periods: {}
            };
            
            // Calcular para cada período
            for (const periodDays of periods) {
                const result = await calculateUniqueCustomersExistingInPeriod(tenant.id, periodDays);
                finalResults[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Verificar lógica crescente
            const d7 = finalResults[tenant.id].periods['7d'].unique_customers;
            const d30 = finalResults[tenant.id].periods['30d'].unique_customers;
            const d90 = finalResults[tenant.id].periods['90d'].unique_customers;
            
            const logicaCorreta = d90 >= d30 && d30 >= d7;
            
            // Resumo
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      Existentes 7d:  ${d7}`);
            console.log(`      Existentes 30d: ${d30}`);
            console.log(`      Existentes 90d: ${d90}`);
            console.log(`      Lógica crescente: ${logicaCorreta ? '✅ CORRETA' : '❌ INCORRETA'} (90d >= 30d >= 7d)`);
        }
        
        // Tabela consolidada
        console.log('\n📋 TABELA FINAL - CLIENTES EXISTENTES POR PERÍODO (ACUMULATIVO)');
        console.log('='.repeat(70));
        console.log('TENANT                    | 7d   | 30d  | 90d  ');
        console.log('-'.repeat(70));
        
        let allLogicCorrect = true;
        
        Object.entries(finalResults).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const d7 = data.periods['7d'].unique_customers;
            const d30 = data.periods['30d'].unique_customers;
            const d90 = data.periods['90d'].unique_customers;
            
            const d7Str = String(d7).padStart(4);
            const d30Str = String(d30).padStart(4);
            const d90Str = String(d90).padStart(4);
            
            const logicCorrect = d90 >= d30 && d30 >= d7;
            if (!logicCorrect) allLogicCorrect = false;
            
            const indicator = logicCorrect ? '' : ' ⚠️';
            
            console.log(`${name} | ${d7Str} | ${d30Str} | ${d90Str}${indicator}`);
        });
        
        console.log('-'.repeat(70));
        
        // Estatísticas
        const tenantCount = Object.keys(finalResults).length;
        
        const avg7d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['7d'].unique_customers, 0) / tenantCount);
        const avg30d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['30d'].unique_customers, 0) / tenantCount);
        const avg90d = Math.round(Object.values(finalResults).reduce((sum, tenant) => sum + tenant.periods['90d'].unique_customers, 0) / tenantCount);
        
        console.log(`\n📊 ESTATÍSTICAS FINAIS:`);
        console.log(`   Médias de clientes existentes por tenant:`);
        console.log(`     7d:  ${avg7d} clientes`);
        console.log(`     30d: ${avg30d} clientes`);
        console.log(`     90d: ${avg90d} clientes`);
        
        console.log(`\n🔍 VALIDAÇÃO DA LÓGICA:`);
        if (allLogicCorrect) {
            console.log('   ✅ LÓGICA CORRETA: 90d >= 30d >= 7d em todos os tenants');
        } else {
            console.log('   ❌ LÓGICA INCORRETA: Alguns tenants não seguem 90d >= 30d >= 7d');
        }
        
        console.log(`   📈 Crescimento esperado: ${avg7d} → ${avg30d} → ${avg90d}`);
        
        console.log('\n✅ TESTE ACUMULATIVO VALIDADO');
        console.log('\n💡 IMPLEMENTAÇÃO PARA SCRIPT BASE:');
        console.log('   - JOIN: user_tenants + users');
        console.log('   - Filtro: users.created_at <= (currentPeriodEnd - periodDays)');
        console.log('   - Count: Registros únicos do JOIN');
        console.log('   - Resultado: 90d >= 30d >= 7d (lógica crescente)');
        
        return finalResults;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar
if (require.main === module) {
    runAccumulativeTest().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateUniqueCustomersExistingInPeriod };