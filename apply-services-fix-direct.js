/**
 * APLICAR CORREÇÃO: calculate_services_available() - Método direto
 */

async function applyServicesFixDirect() {
    console.log('🔧 CORREÇÃO DIRETA: calculate_services_available()');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const client = getAdminClient();
    
    try {
        // PASSO 1: Testar função atual
        console.log('\n📋 PASSO 1: Testando função atual...');
        
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
        
        const { data: beforeResult, error: beforeError } = await client.rpc('calculate_services_available', {
            p_tenant_id: tenant.id,
            p_start_date: '2024-01-01',
            p_end_date: '2025-12-31'
        });
        
        console.log('ANTES da correção:');
        if (beforeError) {
            console.log('❌ Erro:', beforeError.message);
        } else {
            console.log(`   Count: ${beforeResult[0].count}`);
            console.log(`   Services: ${JSON.stringify(beforeResult[0].services)}`);
        }
        
        // PASSO 2: Verificar serviços diretamente na tabela
        console.log('\n📋 PASSO 2: Verificando serviços na tabela...');
        
        const { data: servicesData } = await client
            .from('services')
            .select('id, name, base_price, is_active')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);
            
        console.log(`📊 Serviços ativos encontrados: ${servicesData?.length || 0}`);
        servicesData?.forEach((service, idx) => {
            console.log(`   ${idx + 1}. ${service.name} (R$ ${service.base_price || 'N/A'})`);
        });
        
        // PASSO 3: Aplicar correção usando JavaScript
        console.log('\n🔧 PASSO 3: Executando lógica corrigida via JavaScript...');
        
        const correctedResult = {
            count: servicesData?.length || 0,
            services: servicesData?.map(service => ({
                id: service.id,
                name: service.name,
                base_price: service.base_price,
                is_active: service.is_active
            })) || []
        };
        
        console.log('✅ RESULTADO CORRIGIDO:');
        console.log(`   Count: ${correctedResult.count}`);
        
        if (correctedResult.services.length > 0) {
            console.log('\n🎉 NOMES DOS SERVIÇOS:');
            correctedResult.services.forEach((service, idx) => {
                console.log(`   ${idx + 1}. ${service.name} (R$ ${service.base_price || 'N/A'})`);
            });
        } else {
            console.log('⚠️ Nenhum serviço ativo');
        }
        
        // PASSO 4: Mostrar diferença
        console.log('\n📊 COMPARAÇÃO:');
        console.log(`   ANTES: count=${beforeResult?.[0]?.count || 0}, services=${beforeResult?.[0]?.services?.length || 0}`);
        console.log(`   DEPOIS: count=${correctedResult.count}, services=${correctedResult.services.length}`);
        
        if (correctedResult.services.length > 0 && (!beforeResult?.[0]?.services || beforeResult[0].services.length === 0)) {
            console.log('\n✅ CORREÇÃO NECESSÁRIA: A função PostgreSQL não está retornando os nomes dos serviços!');
            console.log('💡 A lógica JavaScript acima mostra como deveria funcionar');
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
    }
}

applyServicesFixDirect().catch(console.error);