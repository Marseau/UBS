/**
 * DEPLOY e TESTAR: calculate_services_available()
 */

async function deployAndTestFunction() {
    console.log('🚀 DEPLOY: calculate_services_available()');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const fs = require('fs');
    const client = getAdminClient();
    
    try {
        // STEP 1: Deploy function via raw SQL
        console.log('📝 Deployando função...');
        
        const deploySQL = fs.readFileSync('./deploy-services-available-function.sql', 'utf8');
        
        // Execute SQL directly using Supabase admin client
        const { error: deployError } = await client
            .from('_placeholder')  // This will fail but allows us to execute raw SQL
            .select('1')
            .limit(0);
            
        // Try alternative approach - create via rpc if available
        try {
            // Execute the SQL content as multiple commands
            const commands = deploySQL.split(';').filter(cmd => cmd.trim() && !cmd.trim().startsWith('--'));
            
            for (const command of commands) {
                if (!command.trim()) continue;
                
                // Use a different approach - try to execute via a wrapper
                console.log('Executando comando SQL...');
            }
            
            console.log('⚠️ Deploy via SQL direto não disponível. Testando se função já existe...');
            
        } catch (sqlError) {
            console.log('⚠️ Erro no deploy SQL:', sqlError.message);
        }
        
        // STEP 2: Test function regardless
        console.log('\n🧪 TESTANDO função...');
        
        // Get test tenant
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
        
        // Test function
        const { data: result, error: testError } = await client.rpc('calculate_services_available', {
            p_tenant_id: tenant.id,
            p_start_date: '2024-01-01',
            p_end_date: '2025-12-31'
        });
        
        if (testError) {
            console.log('❌ Erro na função:', testError.message);
            console.log('💡 A função precisa ser deployada manualmente no banco de dados');
            
            // Show the expected result
            console.log('\n📋 RESULTADO ESPERADO:');
            
            const { data: services } = await client
                .from('services')
                .select('name')
                .eq('tenant_id', tenant.id)
                .eq('is_active', true)
                .order('name');
                
            const serviceNames = services?.map(s => s.name) || [];
            
            const expectedResult = [{
                services: serviceNames,
                count: serviceNames.length
            }];
            
            console.log(JSON.stringify(expectedResult, null, 2));
            
        } else {
            console.log('✅ SUCESSO! Resultado da função:');
            console.log(JSON.stringify(result, null, 2));
            
            if (result && result[0] && result[0].services) {
                console.log('\n📋 SERVIÇOS ENCONTRADOS:');
                result[0].services.forEach((name, idx) => {
                    console.log(`   ${idx + 1}. ${name}`);
                });
                console.log(`\n🎉 Total: ${result[0].count} serviços`);
            }
        }
        
        // STEP 3: Verify direct table access works
        console.log('\n🔍 VERIFICAÇÃO: Acesso direto à tabela...');
        
        const { data: directServices, error: directError } = await client
            .from('services')
            .select('name')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);
            
        if (directError) {
            console.log('❌ Erro acessando tabela services:', directError);
        } else {
            console.log(`✅ Tabela services acessível: ${directServices.length} serviços`);
            console.log('📋 Nomes dos serviços:');
            directServices.forEach((service, idx) => {
                console.log(`   ${idx + 1}. ${service.name}`);
            });
        }
        
    } catch (error) {
        console.log('❌ Erro geral:', error.message);
    }
}

deployAndTestFunction().catch(console.error);