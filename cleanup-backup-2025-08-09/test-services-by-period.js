#!/usr/bin/env node

/**
 * TESTE SERVICES_AVAILABLE POR PERÍODO
 * 
 * Mostra nomes dos serviços existentes por tenant por período
 * para validação da implementação corrigida
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular serviços disponíveis por período (igual ao script base)
 */
async function calculateServicesAvailableByPeriod(tenantId, periodDays) {
    console.log(`🛠️ SERVICES_AVAILABLE ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const currentPeriodEnd = new Date();
        const cutoffDate = new Date(currentPeriodEnd);
        cutoffDate.setDate(cutoffDate.getDate() - periodDays);
        
        console.log(`   📅 Serviços criados ATÉ: ${currentPeriodEnd.toISOString().split('T')[0]} (final do período ${periodDays}d)`);
        
        // Buscar serviços ativos criados ATÉ o final do período
        const { data: services, error } = await supabase
            .from('services')
            .select('name, created_at')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .lte('created_at', currentPeriodEnd.toISOString())
            .order('name');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { services: [], count: 0 };
        }
        
        if (!services || services.length === 0) {
            console.log('   📭 Nenhum serviço ativo encontrado');
            return { services: [], count: 0 };
        }
        
        // Extrair apenas os nomes
        const serviceNames = services.map(service => service.name);
        
        console.log(`   🛠️ ${serviceNames.length} serviços disponíveis:`);
        serviceNames.forEach((name, index) => {
            const createdDate = new Date(services[index].created_at).toISOString().split('T')[0];
            console.log(`      ${index + 1}. ${name} (criado: ${createdDate})`);
        });
        
        return {
            services: serviceNames,
            count: serviceNames.length,
            period_days: periodDays
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { services: [], count: 0 };
    }
}

/**
 * Gerar relatório completo por tenant por período
 */
async function generateServicesPeriodsReport() {
    console.log('📊 RELATÓRIO SERVICES_AVAILABLE POR TENANT POR PERÍODO');
    console.log('='.repeat(80));
    
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
        
        console.log(`📊 ${tenants.length} tenants para análise:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const periods = [7, 30, 90];
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(80));
            
            results[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Calcular para cada período
            for (const periodDays of periods) {
                const result = await calculateServicesAvailableByPeriod(tenant.id, periodDays);
                results[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo do tenant
            const d7 = results[tenant.id].periods['7d'];
            const d30 = results[tenant.id].periods['30d'];
            const d90 = results[tenant.id].periods['90d'];
            
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      7d:  ${d7.count} serviços`);
            console.log(`      30d: ${d30.count} serviços`);
            console.log(`      90d: ${d90.count} serviços`);
            
            // Verificar lógica crescente (deve ser 90d >= 30d >= 7d)
            const logicaCorreta = d90.count >= d30.count && d30.count >= d7.count;
            console.log(`      Lógica crescente: ${logicaCorreta ? '✅ CORRETA' : '❌ INCORRETA'}`);
        }
        
        // Tabela consolidada por período
        console.log('\n📋 TABELA CONSOLIDADA - SERVICES_AVAILABLE POR PERÍODO');
        console.log('='.repeat(80));
        console.log('TENANT                    | 7d   | 30d  | 90d  ');
        console.log('-'.repeat(80));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const d7 = String(data.periods['7d'].count).padStart(4);
            const d30 = String(data.periods['30d'].count).padStart(4);
            const d90 = String(data.periods['90d'].count).padStart(4);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90}`);
        });
        
        // Lista detalhada de serviços por tenant
        console.log('\n📋 LISTA DETALHADA DE SERVIÇOS POR TENANT (90d)');
        console.log('='.repeat(80));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const services90d = data.periods['90d'].services;
            
            console.log(`\n🏢 ${data.name}: ${services90d.length} serviços`);
            if (services90d.length > 0) {
                services90d.forEach((service, index) => {
                    console.log(`   ${index + 1}. ${service}`);
                });
            } else {
                console.log('   (nenhum serviço ativo)');
            }
        });
        
        // Estatísticas
        console.log('\n📊 ESTATÍSTICAS GERAIS:');
        const tenantCount = Object.keys(results).length;
        
        const avg7d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['7d'].count, 0) / tenantCount);
        const avg30d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['30d'].count, 0) / tenantCount);
        const avg90d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['90d'].count, 0) / tenantCount);
        
        console.log(`   Médias de serviços por tenant:`);
        console.log(`     7d:  ${avg7d} serviços`);
        console.log(`     30d: ${avg30d} serviços`);
        console.log(`     90d: ${avg90d} serviços`);
        
        const totalServices90d = Object.values(results).reduce((sum, tenant) => sum + tenant.periods['90d'].count, 0);
        console.log(`\n   Total de serviços na plataforma (90d): ${totalServices90d}`);
        
        console.log('\n✅ RELATÓRIO CONCLUÍDO');
        console.log('\n💡 VALIDAÇÃO:');
        console.log('   - Verifique se a lógica crescente está correta (90d >= 30d >= 7d)');
        console.log('   - Confirme se os serviços listados estão corretos para cada tenant');
        console.log('   - Analise se as datas de criação fazem sentido para os períodos');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO RELATÓRIO:', error);
        process.exit(1);
    }
}

// Executar relatório
if (require.main === module) {
    generateServicesPeriodsReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateServicesAvailableByPeriod, generateServicesPeriodsReport };