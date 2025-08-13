/**
 * TESTE: calculate_services_available() - Lista simples de serviços
 */

async function testServicesAvailableSimple() {
    console.log('🧪 TESTE: Lista de serviços disponíveis');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const fs = require('fs');
    const client = getAdminClient();
    
    try {
        // PASSO 1: Aplicar correção
        console.log('🔧 Aplicando correção...');
        
        const sqlFix = fs.readFileSync('./fix-calculate-services-available-simple.sql', 'utf8');
        
        // Executar cada comando SQL separadamente
        const commands = sqlFix.split(';').filter(cmd => cmd.trim());
        
        for (const command of commands) {
            if (command.trim().startsWith('--') || !command.trim()) continue;
            
            try {
                await client.rpc('sql', { query: command + ';' });
            } catch (err) {
                // Ignorar erros de DROP IF EXISTS
                if (!err.message.includes('does not exist')) {
                    console.log('⚠️ Erro SQL:', err.message);
                }
            }
        }
        
        console.log('✅ Correção aplicada');
        
        // PASSO 2: Buscar um tenant para teste
        const { data: tenant } = await client
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active')
            .limit(1)
            .single();
            
        if (!tenant) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`\n🎯 Testando com: ${tenant.business_name}`);
        
        // PASSO 3: Testar função
        const { data: result, error: testError } = await client.rpc('calculate_services_available', {
            p_tenant_id: tenant.id,
            p_start_date: '2024-01-01',
            p_end_date: '2025-12-31'
        });
        
        if (testError) {
            console.log('❌ Erro:', testError);
        } else {
            console.log('\n✅ RESULTADO:');
            console.log(`   Count: ${result[0].count}`);
            console.log(`   Services: ${JSON.stringify(result[0].services)}`);
            
            if (result[0].services.length > 0) {
                console.log('\n📋 LISTA DE SERVIÇOS DISPONÍVEIS:');
                result[0].services.forEach((serviceName, idx) => {
                    console.log(`   ${idx + 1}. ${serviceName}`);
                });
                console.log('\n🎉 SUCESSO: Função retorna lista de nomes!');
            } else {
                console.log('⚠️ Nenhum serviço disponível no período');
            }
        }
        
        // PASSO 4: Comparar com busca direta
        console.log('\n🔍 COMPARAÇÃO com busca direta:');
        
        const { data: directServices } = await client
            .from('services')
            .select('name')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true)
            .order('name');
            
        const directNames = directServices?.map(s => s.name) || [];
        
        console.log(`   Direto da tabela: ${directNames.length} serviços`);
        console.log(`   Via função: ${result[0]?.count || 0} serviços`);
        
        if (JSON.stringify(directNames.sort()) === JSON.stringify(result[0]?.services?.sort())) {
            console.log('✅ PERFEITO: Resultados idênticos!');
        } else {
            console.log('⚠️ DIFERENÇA encontrada');
            console.log(`   Direto: ${JSON.stringify(directNames)}`);
            console.log(`   Função: ${JSON.stringify(result[0]?.services)}`);
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
    }
}

testServicesAvailableSimple().catch(console.error);