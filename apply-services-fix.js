/**
 * APLICAR CORREÇÃO: calculate_services_available() PostgreSQL
 */

async function applyServicesFix() {
    console.log('🔧 APLICANDO CORREÇÃO: calculate_services_available()');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const fs = require('fs');
    
    const client = getAdminClient();
    
    try {
        // Ler o SQL de correção
        const sqlFix = fs.readFileSync('./fix-services-names-postgresql.sql', 'utf8');
        
        console.log('📝 Executando SQL...');
        
        // Executar SQL diretamente
        const { error } = await client.rpc('exec_sql', { sql: sqlFix });
        
        if (error) {
            console.log('❌ Erro executando via rpc:', error);
            
            // PLANO B: Executar linha por linha
            console.log('💡 PLANO B: Executando SQL diretamente...');
            
            const { error: dropError } = await client.rpc('calculate_services_available_drop');
            console.log('Drop result:', dropError ? dropError.message : 'OK');
            
            return;
        }
        
        console.log('✅ SQL executado com sucesso!');
        
        // TESTAR a função corrigida
        console.log('\n🧪 TESTANDO função corrigida...');
        
        // Pegar um tenant
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
        
        console.log(`🎯 Testando com: ${tenant.business_name}`);
        
        // Testar função
        const { data: result, error: testError } = await client.rpc('calculate_services_available', {
            p_tenant_id: tenant.id,
            p_start_date: '2024-01-01',
            p_end_date: '2025-12-31'
        });
        
        if (testError) {
            console.log('❌ Erro testando:', testError);
        } else {
            console.log('✅ RESULTADO:');
            console.log(`   Count: ${result[0].count}`);
            
            if (result[0].services && result[0].services.length > 0) {
                console.log('\n🎉 SUCESSO: Agora retorna os nomes dos serviços!');
                result[0].services.forEach((service, idx) => {
                    console.log(`   ${idx + 1}. ${service.name} (R$ ${service.base_price || 'N/A'})`);
                });
            } else {
                console.log('⚠️ Nenhum serviço ativo encontrado');
                console.log('Services data:', result[0].services);
            }
        }
        
    } catch (error) {
        console.log('❌ Erro geral:', error.message);
    }
}

applyServicesFix().catch(console.error);