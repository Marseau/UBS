/**
 * DESCOBRIR ESTRUTURA REAL DA TABELA SERVICES
 */

const { supabaseAdmin } = require('./dist/config/database.js');

async function descobrirEstrutura() {
    console.log('🔍 DESCOBRINDO ESTRUTURA DA TABELA SERVICES\n');
    
    try {
        // Tentar inserir vazio para ver campos obrigatórios
        const { error } = await supabaseAdmin
            .from('services')
            .insert({})
            .select();
        
        console.log('Erro ao inserir vazio:', error?.message);
        console.log('\nIsso indica que tenant_id é obrigatório.\n');
        
        // Pegar um tenant
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .limit(1)
            .single();
        
        // Tentar com apenas tenant_id
        const { error: error2 } = await supabaseAdmin
            .from('services')
            .insert({ tenant_id: tenant.id })
            .select();
        
        console.log('Erro com apenas tenant_id:', error2?.message);
        
        // Tentar com tenant_id e name
        const { error: error3 } = await supabaseAdmin
            .from('services')
            .insert({ 
                tenant_id: tenant.id,
                name: 'Teste'
            })
            .select();
        
        console.log('\nErro com tenant_id + name:', error3?.message);
        
        // Se ainda houver erro, adicionar duration_minutes
        if (error3) {
            const { data, error: error4 } = await supabaseAdmin
                .from('services')
                .insert({ 
                    tenant_id: tenant.id,
                    name: 'Teste Serviço',
                    duration_minutes: 60
                })
                .select();
            
            console.log('\nCom tenant_id + name + duration_minutes:');
            console.log('Erro:', error4?.message || 'Nenhum');
            
            if (data) {
                console.log('✅ SUCESSO! Estrutura mínima encontrada.');
                console.log('Dados inseridos:', data);
                
                // Deletar teste
                await supabaseAdmin
                    .from('services')
                    .delete()
                    .eq('id', data[0].id);
            }
        }
        
    } catch (erro) {
        console.error('❌ Erro geral:', erro);
    }
}

// Executar
descobrirEstrutura()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Erro fatal:', err);
        process.exit(1);
    });