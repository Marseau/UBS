const axios = require('axios');

async function testNewCalculation() {
    console.log('🧪 Testando novo cálculo de processing_cost_usd...');
    
    const baseURL = 'http://localhost:3000/api/whatsapp-v3/webhook';
    
    // Aguardar servidor ficar totalmente pronto
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
        // Obter token de demo
        const tokenResponse = await axios.get('http://localhost:3000/api/whatsapp-v3/webhook/generate-demo-token');
        const demoToken = tokenResponse.data.token;
        console.log('✅ Token obtido');
        
        // Buscar tenant real para usar no teste
        const { supabaseAdmin } = require('./dist/config/database');
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain')
            .eq('domain', 'beauty')
            .limit(1);
            
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        const tenant = tenants[0];
        console.log(`📋 Usando tenant: ${tenant.business_name} (${tenant.id})`);
        
        // Teste com mensagem
        const payload = {
            tenantId: tenant.id,
            message: 'Olá, preciso agendar um corte de cabelo para hoje',
            domain: tenant.domain,
            demoToken: demoToken
        };
        
        console.log('📤 Enviando mensagem...');
        const response = await axios.post(baseURL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
            console.log('✅ Mensagem processada');
            
            // Aguardar persistência
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verificar resultado no banco
            console.log('🔍 Verificando resultado no banco...');
            const { data, error } = await supabaseAdmin
                .from('conversation_history')
                .select('content, is_from_user, tokens_used, api_cost_usd, processing_cost_usd, created_at')
                .order('created_at', { ascending: false })
                .limit(2);
                
            if (error) {
                console.error('❌ Erro BD:', error);
                return;
            }
            
            // Encontrar mensagem AI
            const aiMessage = data.find(msg => !msg.is_from_user);
            if (aiMessage) {
                const ratio = aiMessage.processing_cost_usd / aiMessage.api_cost_usd;
                console.log('\n📊 RESULTADO:');
                console.log(`   API Cost: $${aiMessage.api_cost_usd}`);
                console.log(`   Processing Cost: $${aiMessage.processing_cost_usd}`);
                console.log(`   Ratio: ${ratio.toFixed(6)}`);
                console.log(`   Tokens: ${aiMessage.tokens_used}`);
                
                if (ratio < 0.05) {
                    console.log('\n🎉 SUCESSO! Novo cálculo funcionando!');
                    console.log('✅ Processing cost agora baseado em:');
                    console.log('   • Custo base de infraestrutura ($0.0001)');
                    console.log('   • Complexidade por token ($0.000001/token)');
                    console.log('   • Penalidade por latência > 1s');
                } else if (ratio === 0.1) {
                    console.log('\n❌ AINDA USANDO CÁLCULO ANTIGO (10%)');
                } else {
                    console.log('\n🤔 Ratio inesperado, analisando...');
                }
            } else {
                console.log('❌ Mensagem AI não encontrada');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro:', error.response?.data || error.message);
    }
}

testNewCalculation().catch(console.error);