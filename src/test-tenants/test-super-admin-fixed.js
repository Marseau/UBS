/**
 * TESTE: Sistema Super Admin após correções
 * Verifica se os erros de custo_plataforma foram resolvidos
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testSuperAdminAPIs() {
    console.log('🧪 TESTANDO SISTEMA SUPER ADMIN APÓS CORREÇÕES...\n');
    
    const tests = [
        {
            name: 'KPIs da Plataforma',
            url: `${BASE_URL}/api/super-admin/kpis?period=30`,
            expectedFields: ['receitaUsoRatio', 'mrrPlatform', 'activeTenants']
        },
        {
            name: 'Status do Sistema',
            url: `${BASE_URL}/api/super-admin/status`,
            expectedFields: ['system_status', 'last_calculation']
        },
        {
            name: 'Lista de Tenants',
            url: `${BASE_URL}/api/super-admin/tenant-list`,
            expectedFields: ['data', 'count']
        },
        {
            name: 'Revenue vs Usage Cost Chart',
            url: `${BASE_URL}/api/super-admin/charts/revenue-vs-usage-cost?period=30`,
            expectedFields: ['datasets', 'metadata']
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`🔍 Testando: ${test.name}`);
        
        try {
            const response = await axios.get(test.url, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            const success = response.status === 200;
            const hasData = response.data && response.data.success;
            const hasExpectedFields = test.expectedFields.every(field => 
                response.data.data && response.data.data.hasOwnProperty(field)
            );
            
            console.log(`   Status: ${response.status}`);
            console.log(`   Success: ${hasData ? '✅' : '❌'}`);
            console.log(`   Expected Fields: ${hasExpectedFields ? '✅' : '❌'}`);
            
            if (response.data.error) {
                console.log(`   ❌ Erro: ${response.data.error}`);
            }
            
            results.push({
                test: test.name,
                success: success && hasData && hasExpectedFields,
                status: response.status,
                error: response.data.error || null,
                data_preview: JSON.stringify(response.data).substring(0, 200) + '...'
            });
            
        } catch (error) {
            console.log(`   ❌ Falha: ${error.message}`);
            
            results.push({
                test: test.name,
                success: false,
                status: error.response?.status || 'N/A',
                error: error.message,
                data_preview: null
            });
        }
        
        console.log('');
    }
    
    // Relatório final
    console.log('=' * 60);
    console.log('📋 RELATÓRIO DE TESTES');
    console.log('=' * 60);
    
    const successCount = results.filter(r => r.success).length;
    const totalTests = results.length;
    
    console.log(`✅ Testes bem-sucedidos: ${successCount}/${totalTests}`);
    console.log(`❌ Testes falharam: ${totalTests - successCount}/${totalTests}`);
    
    if (successCount === totalTests) {
        console.log('\n🎉 TODOS OS TESTES PASSARAM - Sistema funcionando!');
    } else {
        console.log('\n⚠️ ALGUNS TESTES FALHARAM - Verificar logs acima');
        
        results.filter(r => !r.success).forEach(result => {
            console.log(`   • ${result.test}: ${result.error}`);
        });
    }
    
    return {
        totalTests,
        successCount,
        failureCount: totalTests - successCount,
        allPassed: successCount === totalTests,
        results
    };
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    testSuperAdminAPIs().then(summary => {
        console.log(`\n🏁 Testes finalizados: ${summary.allPassed ? 'SUCESSO' : 'FALHA'}`);
        process.exit(summary.allPassed ? 0 : 1);
    }).catch(error => {
        console.error('\n💥 Erro crítico nos testes:', error);
        process.exit(1);
    });
}

module.exports = { testSuperAdminAPIs };