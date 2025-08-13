#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA NEW_CUSTOMERS
 * 
 * Testa o cálculo de novos clientes cadastrados no período
 * usando users + user_tenants + filtro created_at
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular new_customers para um tenant e período
 */
async function calculateNewCustomers(tenantId, periodDays) {
    console.log(`👥 Testando NEW_CUSTOMERS para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Buscar novos usuários cadastrados no período que estão vinculados ao tenant
        const { data: newUsers, error } = await supabase
            .from('users')
            .select(`
                id,
                created_at,
                user_tenants!inner(tenant_id)
            `)
            .eq('user_tenants.tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
        
        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }
        
        const currentCount = newUsers?.length || 0;
        
        // Calcular período anterior para % change
        const previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - periodDays);
        
        const { data: previousUsers, error: prevError } = await supabase
            .from('users')
            .select(`
                id,
                created_at,
                user_tenants!inner(tenant_id)
            `)
            .eq('user_tenants.tenant_id', tenantId)
            .gte('created_at', previousStartDate.toISOString())
            .lt('created_at', startDate.toISOString());
        
        if (prevError) {
            console.error(`   ⚠️ Erro período anterior: ${prevError.message}`);
        }
        
        const previousCount = previousUsers?.length || 0;
        
        // Calcular % change
        const changePercent = previousCount > 0 
            ? ((currentCount - previousCount) / previousCount) * 100 
            : currentCount > 0 ? 100 : 0;
        
        const result = {
            count: currentCount,
            change_percent: Math.round(changePercent * 100) / 100
        };
        
        console.log(`   ✅ Resultado: ${currentCount} novos clientes (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
        
        // Mostrar detalhes dos usuários encontrados
        if (newUsers && newUsers.length > 0) {
            console.log(`   📋 Detalhes dos novos usuários:`);
            newUsers.slice(0, 5).forEach((user, index) => {
                console.log(`      ${index + 1}. ${user.id.substring(0, 8)} - ${user.created_at.split('T')[0]}`);
            });
            if (newUsers.length > 5) {
                console.log(`      ... e mais ${newUsers.length - 5} usuários`);
            }
        }
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants e períodos
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA NEW_CUSTOMERS');
    console.log('='.repeat(50));
    
    try {
        // Buscar alguns tenants ativos para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        console.log('');
        
        // Testar cada tenant com diferentes períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(40));
            
            for (const periodDays of periods) {
                try {
                    await calculateNewCustomers(tenant.id, periodDays);
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
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

module.exports = { calculateNewCustomers };