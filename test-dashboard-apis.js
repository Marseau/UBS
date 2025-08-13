#!/usr/bin/env node

/**
 * Script para testar todos os endpoints do dashboard e verificar se os dados estão sendo retornados corretamente
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

const endpoints = [
    {
        name: 'KPIs (30 dias)',
        url: '/api/super-admin/kpis?period=30',
        checkData: (data) => data && data.data && data.data.kpis && typeof data.data.kpis.mrrPlatform === 'object'
    },
    {
        name: 'Scatter Plot',
        url: '/api/super-admin/scatter-plot',
        checkData: (data) => data && Array.isArray(data.data)
    },
    {
        name: 'Appointment Status',
        url: '/api/super-admin/appointment-status',
        checkData: (data) => data && data.data && (Array.isArray(data.data) || (data.data.labels && data.data.data))
    },
    {
        name: 'Tenant Risk Assessment',
        url: '/api/super-admin/tenant-risk-assessment',
        checkData: (data) => data && data.data && (Array.isArray(data.data) || typeof data.data.totalTenants === 'number')
    },
    {
        name: 'Growth Trends',
        url: '/api/super-admin/growth-trends',
        checkData: (data) => data && data.data && (data.data.growth_data || data.data.trends)
    },
    {
        name: 'Profitability Analysis',
        url: '/api/super-admin/profitability-analysis',
        checkData: (data) => data && data.data
    },
    {
        name: 'Conversation Analytics',
        url: '/api/super-admin/conversation-analytics',
        checkData: (data) => data && data.data
    },
    {
        name: 'Tenant List',
        url: '/api/super-admin/tenant-list',
        checkData: (data) => data && Array.isArray(data.data)
    }
];

async function testEndpoint(endpoint) {
    try {
        console.log(`\n🔍 Testando: ${endpoint.name}`);
        console.log(`   URL: ${endpoint.url}`);
        
        const response = await fetch(`${BASE_URL}${endpoint.url}`);
        
        if (!response.ok) {
            console.log(`   ❌ HTTP ${response.status}: ${response.statusText}`);
            return false;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            console.log(`   ❌ API retornou success: false`);
            console.log(`   📝 Mensagem: ${data.message || 'Sem mensagem'}`);
            return false;
        }
        
        if (!endpoint.checkData(data)) {
            console.log(`   ⚠️  Dados retornados não correspondem ao formato esperado`);
            console.log(`   📊 Dados recebidos:`, JSON.stringify(data, null, 2).substring(0, 200) + '...');
            return false;
        }
        
        console.log(`   ✅ Sucesso! Dados retornados no formato correto`);
        
        // Mostrar informação relevante dos dados
        if (endpoint.name === 'KPIs (30 dias)') {
            const kpis = data.data.kpis;
            console.log(`   📊 MRR: ${kpis.mrrPlatform.formatted}, Tenants Ativos: ${kpis.activeTenants.formatted}`);
        } else if (endpoint.name.includes('List') || endpoint.name.includes('Plot') || endpoint.name.includes('Status')) {
            console.log(`   📈 Registros retornados: ${Array.isArray(data.data) ? data.data.length : 'N/A'}`);
        }
        
        return true;
        
    } catch (error) {
        console.log(`   ❌ Erro na requisição: ${error.message}`);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Iniciando testes de verificação do Dashboard Super Admin');
    console.log('=' * 70);
    
    let successCount = 0;
    let totalCount = endpoints.length;
    
    for (const endpoint of endpoints) {
        const success = await testEndpoint(endpoint);
        if (success) successCount++;
        
        // Pequena pausa entre requisições
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '=' * 70);
    console.log(`📊 RESUMO DOS TESTES`);
    console.log(`✅ Sucessos: ${successCount}/${totalCount}`);
    console.log(`❌ Falhas: ${totalCount - successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
        console.log('\n🎉 TODOS OS TESTES PASSARAM! Dashboard funcionando corretamente.');
        console.log('📈 Todos os gráficos e KPIs devem estar sendo exibidos no dashboard.');
    } else {
        console.log('\n⚠️  Alguns endpoints apresentaram problemas.');
        console.log('🔧 Verifique os logs acima para mais detalhes.');
    }
    
    console.log('\n💡 Para visualizar o dashboard completo, acesse:');
    console.log(`   🌐 ${BASE_URL}/dashboard-standardized`);
}

// Verificar se o servidor está rodando primeiro
async function checkServer() {
    try {
        const response = await fetch(`${BASE_URL}/api/health`);
        if (response.ok) {
            console.log('✅ Servidor está rodando');
            return true;
        }
    } catch (error) {
        console.log('❌ Servidor não está rodando ou não acessível');
        console.log('🔧 Execute: npm run dev');
        return false;
    }
}

async function main() {
    const serverRunning = await checkServer();
    if (serverRunning) {
        await runAllTests();
    }
}

main().catch(console.error);