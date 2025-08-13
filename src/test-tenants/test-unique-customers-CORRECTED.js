#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA TOTAL_UNIQUE_CUSTOMERS - VERSÃO CORRIGIDA
 * 
 * Usa users + user_tenants como fonte correta
 * Filtra por período de criação do usuário
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analisar estrutura das tabelas users e user_tenants
 */
async function analyzeUserTables() {
    console.log('🔍 Analisando estrutura das tabelas users e user_tenants');
    
    try {
        // Sample da tabela users
        const { data: usersSample, error: usersError } = await supabase
            .from('users')
            .select('*')
            .limit(3);
            
        // Sample da tabela user_tenants
        const { data: userTenantsSample, error: userTenantsError } = await supabase
            .from('user_tenants')
            .select('*')
            .limit(3);
            
        console.log('📊 ESTRUTURA DA TABELA USERS:');
        if (usersError) {
            console.log(`   ❌ Erro: ${usersError.message}`);
        } else if (usersSample && usersSample.length > 0) {
            console.log('   Campos:', Object.keys(usersSample[0]).join(', '));
            console.log('   Sample:', JSON.stringify(usersSample[0], null, 2));
        } else {
            console.log('   📭 Tabela vazia');
        }
        
        console.log('\n📊 ESTRUTURA DA TABELA USER_TENANTS:');
        if (userTenantsError) {
            console.log(`   ❌ Erro: ${userTenantsError.message}`);
        } else if (userTenantsSample && userTenantsSample.length > 0) {
            console.log('   Campos:', Object.keys(userTenantsSample[0]).join(', '));
            console.log('   Sample:', JSON.stringify(userTenantsSample[0], null, 2));
        } else {
            console.log('   📭 Tabela vazia');
        }
        
        return {
            users_available: !usersError && usersSample?.length > 0,
            user_tenants_available: !userTenantsError && userTenantsSample?.length > 0,
            users_fields: usersSample && usersSample.length > 0 ? Object.keys(usersSample[0]) : [],
            user_tenants_fields: userTenantsSample && userTenantsSample.length > 0 ? Object.keys(userTenantsSample[0]) : []
        };
        
    } catch (error) {
        console.error('💥 Erro na análise:', error.message);
        return null;
    }
}

/**
 * Calcular unique customers CORRIGIDO usando users + user_tenants
 */
async function calculateUniqueCustomersCorrect(tenantId, periodDays) {
    console.log(`👥 UNIQUE CUSTOMERS CORRETO para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Query JOIN entre users e user_tenants
        const { data: uniqueCustomers, error } = await supabase
            .from('user_tenants')
            .select(`
                user_id,
                created_at,
                users (
                    id,
                    created_at,
                    name,
                    email
                )
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (error) {
            console.error(`   ❌ Erro na query JOIN: ${error.message}`);
            
            // Fallback: Query separadas
            console.log('   🔄 Tentando query separadas...');
            
            const { data: userTenantRelations, error: relationError } = await supabase
                .from('user_tenants')
                .select('user_id, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (relationError) {
                throw new Error(`Erro nas user_tenants: ${relationError.message}`);
            }
            
            if (!userTenantRelations || userTenantRelations.length === 0) {
                console.log('   📭 Nenhum user_tenant encontrado no período');
                return {
                    unique_customers: 0,
                    period_days: periodDays,
                    method: 'user_tenants_fallback'
                };
            }
            
            const uniqueUserIds = [...new Set(userTenantRelations.map(ut => ut.user_id))];
            
            console.log(`   👥 ${uniqueUserIds.length} clientes únicos encontrados`);
            console.log(`   📊 ${userTenantRelations.length} registros user_tenants no período`);
            
            return {
                unique_customers: uniqueUserIds.length,
                period_days: periodDays,
                total_relations: userTenantRelations.length,
                method: 'user_tenants_fallback'
            };
        }
        
        if (!uniqueCustomers || uniqueCustomers.length === 0) {
            console.log('   📭 Nenhum customer encontrado no período');
            return {
                unique_customers: 0,
                period_days: periodDays,
                method: 'join_query'
            };
        }
        
        // Extrair user_ids únicos
        const uniqueUserIds = [...new Set(uniqueCustomers.map(uc => uc.user_id))];
        
        console.log(`   👥 ${uniqueUserIds.length} clientes únicos encontrados`);
        console.log(`   📊 ${uniqueCustomers.length} registros user_tenants no período`);
        
        // Mostrar sample de clientes
        if (uniqueCustomers.length > 0) {
            console.log('   🔍 Sample de clientes:');
            uniqueCustomers.slice(0, 3).forEach((customer, index) => {
                const userName = customer.users?.name || 'N/A';
                const userEmail = customer.users?.email || 'N/A';
                console.log(`      ${index + 1}. ${userName} (${userEmail}) - ${customer.user_id.substring(0, 8)}`);
            });
        }
        
        return {
            unique_customers: uniqueUserIds.length,
            period_days: periodDays,
            total_relations: uniqueCustomers.length,
            method: 'join_query'
        };
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error.message}`);
        return {
            unique_customers: 0,
            period_days: periodDays,
            error: error.message,
            method: 'error'
        };
    }
}

/**
 * Comparar com implementação antiga (appointments)
 */
async function compareWithOldImplementation(tenantId) {
    console.log(`🔄 Comparando com implementação antiga para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Implementação antiga (appointments)
        const { data: appointmentUsers, error: appointmentError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .not('user_id', 'is', null);
            
        const oldCount = appointmentError ? 0 : new Set(appointmentUsers?.map(a => a.user_id) || []).size;
        
        // Implementação nova (user_tenants)
        const { data: userTenantUsers, error: userTenantError } = await supabase
            .from('user_tenants')
            .select('user_id')
            .eq('tenant_id', tenantId);
            
        const newCount = userTenantError ? 0 : new Set(userTenantUsers?.map(ut => ut.user_id) || []).size;
        
        console.log(`   📊 COMPARAÇÃO:`);
        console.log(`      Método antigo (appointments): ${oldCount} clientes`);
        console.log(`      Método novo (user_tenants): ${newCount} clientes`);
        console.log(`      Diferença: ${newCount - oldCount} (${newCount > oldCount ? 'novo maior' : newCount < oldCount ? 'antigo maior' : 'iguais'})`);
        
        return {
            old_method: oldCount,
            new_method: newCount,
            difference: newCount - oldCount
        };
        
    } catch (error) {
        console.error(`   💥 Erro na comparação: ${error.message}`);
        return null;
    }
}

/**
 * Executar testes completos
 */
async function runTests() {
    console.log('🧪 TESTE TOTAL_UNIQUE_CUSTOMERS - VERSÃO CORRIGIDA');
    console.log('='.repeat(70));
    
    try {
        // 1. Analisar estrutura das tabelas
        console.log('ETAPA 1: Análise da estrutura das tabelas');
        console.log('-'.repeat(50));
        const tableAnalysis = await analyzeUserTables();
        
        if (!tableAnalysis) {
            console.log('❌ Não foi possível analisar as tabelas');
            return;
        }
        
        if (!tableAnalysis.user_tenants_available) {
            console.log('❌ Tabela user_tenants não disponível ou vazia');
            return;
        }
        
        // 2. Buscar tenants
        console.log('\nETAPA 2: Busca de tenants ativos');
        console.log('-'.repeat(50));
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 ${tenants.length} tenants ativos encontrados:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        // 3. Testar cada tenant
        console.log('\nETAPA 3: Teste da métrica corrigida por tenant/período');
        console.log('-'.repeat(50));
        
        const periods = [7, 30, 90];
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            results[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Comparar implementações
            const comparison = await compareWithOldImplementation(tenant.id);
            if (comparison) {
                results[tenant.id].comparison = comparison;
            }
            
            // Testar cada período
            for (const periodDays of periods) {
                const result = await calculateUniqueCustomersCorrect(tenant.id, periodDays);
                results[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo do tenant
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      7d:  ${results[tenant.id].periods['7d'].unique_customers} clientes`);
            console.log(`      30d: ${results[tenant.id].periods['30d'].unique_customers} clientes`);
            console.log(`      90d: ${results[tenant.id].periods['90d'].unique_customers} clientes`);
        }
        
        // 4. Relatório final
        console.log('\n📈 RELATÓRIO FINAL - UNIQUE CUSTOMERS CORRIGIDO');
        console.log('='.repeat(70));
        
        console.log('✅ CORREÇÕES APLICADAS:');
        console.log('   ✅ Fonte: users + user_tenants (não appointments)');
        console.log('   ✅ Período: Filtro por created_at em user_tenants');
        console.log('   ✅ Lógica: user_ids únicos no período por tenant');
        
        console.log('\n📊 RESULTADOS POR TENANT:');
        Object.entries(results).forEach(([tenantId, data]) => {
            console.log(`\n   🏢 ${data.name}:`);
            console.log(`      7d: ${data.periods['7d'].unique_customers} | 30d: ${data.periods['30d'].unique_customers} | 90d: ${data.periods['90d'].unique_customers}`);
            if (data.comparison) {
                console.log(`      Novo vs Antigo: ${data.comparison.new_method} vs ${data.comparison.old_method} (diff: ${data.comparison.difference})`);
            }
        });
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n💡 PRÓXIMO PASSO: Aplicar correção no script base');
        
        return results;
        
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
    calculateUniqueCustomersCorrect,
    analyzeUserTables,
    compareWithOldImplementation
};