/**
 * TESTE DE INSERÇÃO DIRETA
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function testeInsercao() {
    console.log('🔍 TESTE DE INSERÇÃO DIRETA\n');
    
    try {
        // 1. Pegar primeiro tenant e categoria
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .limit(1)
            .single();
        
        const { data: categoria } = await supabaseAdmin
            .from('service_categories')
            .select('*')
            .eq('tenant_id', tenant.id)
            .limit(1)
            .single();
        
        console.log('Tenant:', tenant.name);
        console.log('Categoria:', categoria?.name || 'N/A');
        
        // 2. Tentar inserir serviço
        console.log('\n📝 TENTANDO INSERIR SERVIÇO...');
        
        const servico = {
            id: uuidv4(),
            tenant_id: tenant.id,
            category_id: categoria?.id,
            name: 'Serviço Teste',
            description: 'Descrição teste',
            price: 100.00,
            duration_minutes: 60,
            is_active: true,
            created_at: new Date().toISOString()
        };
        
        console.log('Dados:', servico);
        
        const { data: srvData, error: srvError } = await supabaseAdmin
            .from('services')
            .insert(servico)
            .select();
        
        if (srvError) {
            console.log('❌ Erro:', srvError.message);
            console.log('Detalhes:', srvError);
            
            // Tentar sem campos opcionais
            console.log('\n📝 TENTANDO SEM CAMPOS OPCIONAIS...');
            
            const servicoMinimo = {
                tenant_id: tenant.id,
                category_id: categoria?.id,
                name: 'Serviço Mínimo',
                price: 50,
                duration_minutes: 30
            };
            
            const { data: minData, error: minError } = await supabaseAdmin
                .from('services')
                .insert(servicoMinimo)
                .select();
            
            if (minError) {
                console.log('❌ Erro mínimo:', minError.message);
            } else {
                console.log('✅ Sucesso!', minData);
            }
        } else {
            console.log('✅ Sucesso!', srvData);
        }
        
        // 3. Verificar se foi inserido
        console.log('\n📊 VERIFICANDO INSERÇÃO...');
        const { data: servicos, count } = await supabaseAdmin
            .from('services')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenant.id);
        
        console.log(`Total de serviços do tenant: ${count || 0}`);
        if (servicos && servicos.length > 0) {
            console.log('Serviços:', servicos.map(s => s.name).join(', '));
        }
        
    } catch (erro) {
        console.error('❌ Erro geral:', erro);
    }
}

// Executar
testeInsercao()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Erro fatal:', err);
        process.exit(1);
    });