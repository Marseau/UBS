#!/usr/bin/env node

/**
 * TESTE SERVICES_AVAILABLE - LÓGICA CORRIGIDA
 * 
 * Valida que a lógica acumulativa está funcionando corretamente
 * Serviços criados em 29/7 devem aparecer apenas no período 7d
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular serviços disponíveis com lógica corrigida
 */
async function calculateServicesAvailableCorrected(tenantId, periodDays) {
    console.log(`🛠️ SERVICES_AVAILABLE CORRETO ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const currentPeriodEnd = new Date();
        const cutoffDate = new Date(currentPeriodEnd);
        cutoffDate.setDate(cutoffDate.getDate() - periodDays);
        
        console.log(`   📅 Serviços criados ATÉ: ${cutoffDate.toISOString().split('T')[0]} (${periodDays}d atrás)`);
        
        // Buscar serviços ativos criados ATÉ a data de corte
        const { data: services, error } = await supabase
            .from('services')
            .select('name, created_at')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .lte('created_at', cutoffDate.toISOString())
            .order('name');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { services: [], count: 0 };
        }
        
        if (!services || services.length === 0) {
            console.log('   📭 Nenhum serviço encontrado (correto se criados após a data de corte)');
            return { services: [], count: 0 };
        }
        
        const serviceNames = services.map(service => service.name);
        
        console.log(`   🛠️ ${serviceNames.length} serviços encontrados:`);
        serviceNames.forEach((name, index) => {
            const createdDate = new Date(services[index].created_at).toISOString().split('T')[0];
            console.log(`      ${index + 1}. ${name} (criado: ${createdDate})`);
        });
        
        return {
            services: serviceNames,
            count: serviceNames.length,
            cutoff_date: cutoffDate.toISOString().split('T')[0]
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { services: [], count: 0 };
    }
}

/**
 * Verificar datas de criação dos serviços
 */
async function verifyServiceCreationDates(tenantId) {
    console.log(`📅 Verificando datas de criação para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { data: services, error } = await supabase
            .from('services')
            .select('name, created_at')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        if (!services || services.length === 0) {
            console.log('   📭 Nenhum serviço encontrado');
            return null;
        }
        
        const firstService = services[0];
        const lastService = services[services.length - 1];
        
        console.log(`   📊 ${services.length} serviços ativos:`);
        console.log(`   📅 Primeiro criado: ${new Date(firstService.created_at).toISOString().split('T')[0]} (${firstService.name})`);
        console.log(`   📅 Último criado: ${new Date(lastService.created_at).toISOString().split('T')[0]} (${lastService.name})`);
        
        return {
            total_services: services.length,
            first_created: firstService.created_at,
            last_created: lastService.created_at
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Teste da lógica corrigida
 */
async function testCorrectedLogic() {
    console.log('🧪 TESTE SERVICES_AVAILABLE - LÓGICA CORRIGIDA');
    console.log('='.repeat(70));
    console.log('Hoje: 6/8/2025 | Serviços criados: 29/7/2025');
    console.log('Esperado: 7d = serviços | 30d = 0 | 90d = 0');
    console.log('');
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(3);
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const periods = [7, 30, 90];
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(70));
            
            // Verificar datas de criação
            await verifyServiceCreationDates(tenant.id);
            
            results[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Testar cada período
            for (const periodDays of periods) {
                const result = await calculateServicesAvailableCorrected(tenant.id, periodDays);
                results[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo e validação
            const d7 = results[tenant.id].periods['7d'];
            const d30 = results[tenant.id].periods['30d'];
            const d90 = results[tenant.id].periods['90d'];
            
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      7d:  ${d7.count} serviços`);
            console.log(`      30d: ${d30.count} serviços`);
            console.log(`      90d: ${d90.count} serviços`);
            
            // Validação da lógica esperada
            const logicaEsperada = d7.count > 0 && d30.count === 0 && d90.count === 0;
            console.log(`      Lógica esperada: ${logicaEsperada ? '✅ CORRETA' : '❌ INCORRETA'}`);
            
            if (!logicaEsperada) {
                console.log(`      ⚠️  Esperado: 7d > 0, 30d = 0, 90d = 0`);
                console.log(`      ❌ Obtido: 7d = ${d7.count}, 30d = ${d30.count}, 90d = ${d90.count}`);
            }
        }
        
        // Tabela final corrigida
        console.log('\n📋 TABELA FINAL - LÓGICA ACUMULATIVA CORRIGIDA');
        console.log('='.repeat(70));
        console.log('TENANT                    | 7d   | 30d  | 90d  ');
        console.log('-'.repeat(70));
        
        let allCorrect = true;
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const d7 = data.periods['7d'].count;
            const d30 = data.periods['30d'].count;
            const d90 = data.periods['90d'].count;
            
            const d7Str = String(d7).padStart(4);
            const d30Str = String(d30).padStart(4);
            const d90Str = String(d90).padStart(4);
            
            const isCorrect = d7 > 0 && d30 === 0 && d90 === 0;
            if (!isCorrect) allCorrect = false;
            
            const indicator = isCorrect ? '' : ' ⚠️';
            
            console.log(`${name} | ${d7Str} | ${d30Str} | ${d90Str}${indicator}`);
        });
        
        console.log('-'.repeat(70));
        
        console.log('\n🔍 VALIDAÇÃO FINAL:');
        if (allCorrect) {
            console.log('   ✅ LÓGICA CORRIGIDA: Todos os tenants seguem o padrão esperado');
            console.log('   ✅ 7d > 0 (serviços existem)');
            console.log('   ✅ 30d = 0 (serviços não existiam há 30 dias)');
            console.log('   ✅ 90d = 0 (serviços não existiam há 90 dias)');
        } else {
            console.log('   ❌ LÓGICA AINDA INCORRETA: Alguns tenants não seguem o padrão');
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    testCorrectedLogic().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateServicesAvailableCorrected, testCorrectedLogic };