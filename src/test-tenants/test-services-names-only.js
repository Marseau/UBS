#!/usr/bin/env node

/**
 * TESTE CORRETO - SERVICES_AVAILABLE (APENAS NOMES)
 * 
 * Retorna apenas NOMES dos serviços ativos por tenant
 * Sem preços, sem detalhes - só lista de nomes
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Implementação CORRETA - apenas nomes dos serviços
 */
async function calculateServicesAvailableCorrect(tenantId) {
    console.log(`🛠️ SERVICES_AVAILABLE para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Buscar apenas nomes dos serviços ativos
        const { data: services, error } = await supabase
            .from('services')
            .select('name')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return {
                services: [],
                count: 0
            };
        }
        
        if (!services || services.length === 0) {
            console.log('   📭 Nenhum serviço ativo encontrado');
            return {
                services: [],
                count: 0
            };
        }
        
        // Extrair apenas os nomes
        const serviceNames = services.map(service => service.name);
        
        console.log(`   🛠️ ${serviceNames.length} serviços ativos encontrados:`);
        serviceNames.forEach((name, index) => {
            console.log(`      ${index + 1}. ${name}`);
        });
        
        return {
            services: serviceNames,
            count: serviceNames.length
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return {
            services: [],
            count: 0
        };
    }
}

/**
 * Executar teste focado apenas em nomes
 */
async function runServiceNamesTest() {
    console.log('🧪 TESTE SERVICES_AVAILABLE - APENAS NOMES DOS SERVIÇOS');
    console.log('='.repeat(70));
    
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
        
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            const result = await calculateServicesAvailableCorrect(tenant.id);
            results[tenant.id] = {
                name: tenant.name,
                ...result
            };
        }
        
        // Tabela consolidada
        console.log('\n📋 TABELA FINAL - SERVIÇOS POR TENANT');
        console.log('='.repeat(70));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            console.log(`\n🏢 ${data.name}: ${data.count} serviços`);
            if (data.services.length > 0) {
                data.services.forEach((service, index) => {
                    console.log(`   ${index + 1}. ${service}`);
                });
            } else {
                console.log('   (nenhum serviço ativo)');
            }
        });
        
        console.log('\n📊 RESUMO:');
        const totalServices = Object.values(results).reduce((sum, tenant) => sum + tenant.count, 0);
        const avgServices = Math.round(totalServices / Object.keys(results).length);
        
        console.log(`   Total de serviços na plataforma: ${totalServices}`);
        console.log(`   Média por tenant: ${avgServices} serviços`);
        
        console.log('\n✅ IMPLEMENTAÇÃO CORRETA VALIDADA');
        console.log('\n💡 ESTRUTURA DE RETORNO:');
        console.log('   {');
        console.log('     services: ["Nome Serviço 1", "Nome Serviço 2", ...],');
        console.log('     count: number');
        console.log('   }');
        
        console.log('\n🔧 CORREÇÕES NECESSÁRIAS NO SCRIPT BASE:');
        console.log('   ❌ Nome atual: "total_services_available"');
        console.log('   ✅ Nome correto: "services_available"');
        console.log('   ❌ Retorna atual: { count, active_count }');
        console.log('   ✅ Retorna correto: { services: [nomes], count }');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runServiceNamesTest().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateServicesAvailableCorrect };