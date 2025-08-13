#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA SERVICES_AVAILABLE
 * 
 * Verifica estrutura da tabela services e valida
 * que devemos retornar NOMES dos serviços, não contagem
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analisar estrutura da tabela services
 */
async function analyzeServicesTable() {
    console.log('🔍 Analisando estrutura da tabela services');
    
    try {
        // Sample da tabela services para ver estrutura
        const { data: servicesSample, error: servicesError } = await supabase
            .from('services')
            .select('*')
            .limit(5);
            
        if (servicesError) {
            console.log(`   ❌ Erro: ${servicesError.message}`);
            return null;
        }
        
        if (!servicesSample || servicesSample.length === 0) {
            console.log('   📭 Tabela services vazia');
            return null;
        }
        
        console.log('📊 ESTRUTURA DA TABELA SERVICES:');
        console.log('   Campos:', Object.keys(servicesSample[0]).join(', '));
        console.log('   Sample:', JSON.stringify(servicesSample[0], null, 2));
        
        return {
            available: true,
            fields: Object.keys(servicesSample[0]),
            sample_count: servicesSample.length
        };
        
    } catch (error) {
        console.error('💥 Erro na análise:', error.message);
        return null;
    }
}

/**
 * Testar implementação atual (contagem)
 */
async function testCurrentImplementation(tenantId) {
    console.log(`🧪 Testando implementação atual para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { count: totalCount, error: totalError } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);
        
        const { count: activeCount, error: activeError } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
        
        if (totalError || activeError) {
            console.error(`   ❌ Erro: ${totalError?.message || activeError?.message}`);
            return null;
        }
        
        console.log(`   📊 Implementação atual:`);
        console.log(`      Total serviços: ${totalCount || 0}`);
        console.log(`      Serviços ativos: ${activeCount || 0}`);
        console.log(`   ❌ PROBLEMA: Retorna contagens, não nomes dos serviços`);
        
        return {
            total_count: totalCount || 0,
            active_count: activeCount || 0,
            method: 'current_wrong'
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Implementação CORRETA - retornar nomes dos serviços
 */
async function calculateServicesAvailableCorrect(tenantId) {
    console.log(`✅ SERVICES_AVAILABLE CORRETO para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Buscar serviços ativos com nomes e detalhes
        const { data: services, error } = await supabase
            .from('services')
            .select(`
                id,
                name,
                description,
                price,
                duration_minutes,
                is_active,
                category
            `)
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return {
                services: [],
                count: 0,
                error: error.message
            };
        }
        
        if (!services || services.length === 0) {
            console.log('   📭 Nenhum serviço ativo encontrado');
            return {
                services: [],
                count: 0
            };
        }
        
        console.log(`   🛠️ ${services.length} serviços ativos encontrados:`);
        services.forEach((service, index) => {
            console.log(`      ${index + 1}. ${service.name} - R$${service.price} (${service.duration_minutes}min)`);
        });
        
        // Retornar lista de serviços (não contagem)
        const servicesList = services.map(service => ({
            id: service.id,
            name: service.name,
            description: service.description,
            price: service.price,
            duration_minutes: service.duration_minutes,
            category: service.category
        }));
        
        return {
            services: servicesList,
            count: services.length,
            method: 'correct_with_names'
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return {
            services: [],
            count: 0,
            error: error.message
        };
    }
}

/**
 * Executar todos os testes
 */
async function runServicesTests() {
    console.log('🧪 TESTE DA MÉTRICA SERVICES_AVAILABLE');
    console.log('='.repeat(70));
    
    try {
        // 1. Analisar estrutura da tabela
        console.log('ETAPA 1: Análise da estrutura da tabela services');
        console.log('-'.repeat(50));
        const tableAnalysis = await analyzeServicesTable();
        
        if (!tableAnalysis) {
            console.log('❌ Não foi possível analisar a tabela services');
            return;
        }
        
        // 2. Buscar tenants para teste
        console.log('\nETAPA 2: Busca de tenants ativos');
        console.log('-'.repeat(50));
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(3); // Teste com 3 tenants apenas
        
        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        // 3. Testar cada tenant
        console.log('\nETAPA 3: Comparação implementação atual vs correta');
        console.log('-'.repeat(50));
        
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            results[tenant.id] = {
                name: tenant.name,
                current: null,
                correct: null
            };
            
            // Implementação atual (contagem)
            const currentResult = await testCurrentImplementation(tenant.id);
            results[tenant.id].current = currentResult;
            
            // Implementação correta (nomes)
            const correctResult = await calculateServicesAvailableCorrect(tenant.id);
            results[tenant.id].correct = correctResult;
            
            // Comparação
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      Atual (errado): ${currentResult?.total_count || 0} total, ${currentResult?.active_count || 0} ativos`);
            console.log(`      Correto: ${correctResult?.count || 0} serviços com nomes`);
            
            if (correctResult?.services && correctResult.services.length > 0) {
                console.log(`      Exemplo: "${correctResult.services[0].name}"`);
            }
        }
        
        console.log('\n📈 ANÁLISE DA MÉTRICA:');
        console.log('='.repeat(60));
        console.log('❌ PROBLEMAS DA IMPLEMENTAÇÃO ATUAL:');
        console.log('   ❌ Nome: "total_services_available" → deveria ser "services_available"');
        console.log('   ❌ Retorno: { count, active_count } → deveria ser lista de serviços');
        console.log('   ❌ Dados: Apenas contagem → deveria incluir nomes, preços, durações');
        
        console.log('\n✅ IMPLEMENTAÇÃO CORRETA:');
        console.log('   ✅ Nome: "services_available"');
        console.log('   ✅ Retorno: { services: [...], count }');
        console.log('   ✅ Dados: Lista completa com nomes, preços, durações');
        console.log('   ✅ Filtro: Apenas serviços ativos (is_active = true)');
        
        console.log('\n💡 ESTRUTURA DE RETORNO RECOMENDADA:');
        console.log(`   {
     services: [
       { id, name, description, price, duration_minutes, category }
     ],
     count: number
   }`);
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runServicesTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { 
    calculateServicesAvailableCorrect,
    analyzeServicesTable,
    testCurrentImplementation
};