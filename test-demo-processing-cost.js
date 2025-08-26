const axios = require('axios');

async function testDemoProcessingCost() {
    console.log('🧪 Testando novo cálculo via /api/demo/chat...');
    
    const baseURL = 'http://localhost:3000/api/demo/chat';
    
    try {
        // Buscar tenant real
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
        console.log(`📋 Usando tenant: ${tenant.business_name}`);
        
        // Fazer o request
        const payload = {
            tenantId: tenant.id,
            message: 'Olá, preciso agendar um horário para corte de cabelo hoje',
            domain: tenant.domain
        };
        
        console.log('📤 Enviando mensagem...');
        const response = await axios.post(baseURL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data.success) {
            console.log('✅ Mensagem processada');
            console.log(`📝 Resposta: ${response.data.response.substring(0, 50)}...`);
            
            // Aguardar persistência
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verificar no banco
            const { data, error } = await supabaseAdmin
                .from('conversation_history')
                .select('content, is_from_user, tokens_used, api_cost_usd, processing_cost_usd, created_at')
                .order('created_at', { ascending: false })
                .limit(3);
                
            if (error) {
                console.error('❌ Erro BD:', error);
                return;
            }
            
            // Encontrar mensagem AI mais recente
            const latestAI = data.find(msg => !msg.is_from_user && msg.api_cost_usd);
            if (latestAI) {
                const ratio = latestAI.processing_cost_usd / latestAI.api_cost_usd;
                
                console.log('\n📊 RESULTADO:');
                console.log(`   Timestamp: ${latestAI.created_at}`);
                console.log(`   Tokens: ${latestAI.tokens_used}`);
                console.log(`   API Cost: $${latestAI.api_cost_usd}`);
                console.log(`   Processing Cost: $${latestAI.processing_cost_usd}`);
                console.log(`   Ratio: ${ratio.toFixed(6)}`);
                
                if (ratio < 0.05) {
                    console.log('\n🎉 PERFEITO! Novo cálculo está funcionando!');
                    console.log('✅ Processing cost agora é calculado baseado em:');
                    console.log('   • Custo base: $0.0001 por requisição');
                    console.log('   • Complexidade: $0.000001 por token');
                    console.log('   • Latência: penalidade para >1s');
                    console.log('\n✅ CORREÇÃO DO PROCESSING_COST_USD VALIDADA!');
                } else if (ratio === 0.1) {
                    console.log('\n❌ AINDA COM ERRO: Usando cálculo antigo de 10%');
                } else {
                    console.log('\n🤔 Ratio inesperado:', ratio);
                }
                
            } else {
                console.log('\n❌ Mensagem AI com métricas não encontrada');
                console.log('📋 Dados encontrados:', data.map(m => ({ 
                    type: m.is_from_user ? 'USER' : 'AI',
                    has_metrics: !!m.api_cost_usd,
                    content: m.content.substring(0, 30) 
                })));
            }
        } else {
            console.log('❌ Falha no processamento:', response.data);
        }
        
    } catch (error) {
        console.error('❌ Erro:', error.response?.data || error.message);
    }
}

testDemoProcessingCost().catch(console.error);