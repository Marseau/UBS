const axios = require('axios');

async function quickProcessingCostTest() {
    console.log('🧪 Teste rápido do novo cálculo de processing_cost_usd...');
    
    const baseURL = 'http://localhost:3000/api/whatsapp-v3/webhook';
    
    // Primeiro, buscar token de demo válido
    try {
        const tokenResponse = await axios.get('http://localhost:3000/api/whatsapp-v3/webhook/generate-demo-token');
        const demoToken = tokenResponse.data.token;
        console.log('✅ Token obtido:', demoToken.substring(0, 20) + '...');
        
        // Teste com uma mensagem simples
        const testMessage = 'Olá, preciso de ajuda para agendar um horário';
        
        const payload = {
            tenantId: '123e4567-e89b-12d3-a456-426614174000', // tenant de teste
            message: testMessage,
            domain: 'beauty',
            demoToken: demoToken
        };
        
        console.log('📤 Enviando mensagem de teste...');
        const response = await axios.post(baseURL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
            console.log('✅ Mensagem processada com sucesso');
            
            // Aguardar persistência
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verificar no banco
            await checkLatestMessage();
        }
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('❌ Endpoint de token não encontrado - servidor foi reiniciado?');
            console.log('🔧 Testando direto no banco...');
            await checkLatestMessage();
        } else {
            console.error('❌ Erro:', error.message);
        }
    }
}

async function checkLatestMessage() {
    const { supabaseAdmin } = require('./dist/config/database');
    
    try {
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('content, is_from_user, tokens_used, api_cost_usd, processing_cost_usd, created_at')
            .order('created_at', { ascending: false })
            .limit(2);
            
        if (error) {
            console.error('❌ Erro no BD:', error);
            return;
        }
        
        if (data.length > 0) {
            const latestAI = data.find(msg => !msg.is_from_user);
            if (latestAI && latestAI.api_cost_usd && latestAI.processing_cost_usd) {
                const ratio = latestAI.processing_cost_usd / latestAI.api_cost_usd;
                console.log(`\n📊 ANÁLISE DA MENSAGEM MAIS RECENTE:`);
                console.log(`   API Cost: $${latestAI.api_cost_usd}`);
                console.log(`   Processing Cost: $${latestAI.processing_cost_usd}`);
                console.log(`   Ratio: ${ratio.toFixed(4)} ${ratio < 0.05 ? '✅ NOVO CÁLCULO' : ratio === 0.1 ? '❌ CÁLCULO ANTIGO' : '🤔 OUTRO'}`);
                console.log(`   Timestamp: ${latestAI.created_at}`);
                
                if (ratio < 0.05) {
                    console.log('\n🎉 SUCESSO! O novo cálculo está funcionando!');
                } else if (ratio === 0.1) {
                    console.log('\n⚠️  AINDA USANDO CÁLCULO ANTIGO - Servidor precisa ser reiniciado');
                } else {
                    console.log('\n🤔 Ratio inesperado - investigar');
                }
            } else {
                console.log('\n❌ Não encontrou mensagem AI recente com métricas');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro na consulta:', error);
    }
}

quickProcessingCostTest().catch(console.error);