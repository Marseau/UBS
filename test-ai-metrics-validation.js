const { DemoTokenValidator } = require('./dist/utils/demo-token-validator');
const axios = require('axios');

async function testAIMetricsPersistence() {
    console.log('🧪 Testando persistência das métricas de IA...');
    
    const validator = new DemoTokenValidator();
    const token = 'eyJzb3VyY2UiOiJ0ZXN0X3N1aXRlIiwidGVuYW50SWQiOiJkMDMyZDg1My1kOWM4LTRlODQtOTAzMy1jMDc1NzE3OTBhNTIiLCJ0aW1lc3RhbXAiOjE3NTYwNzU5Nzc3MzYsImV4cGlyZXNJbiI6MzAwMDAwfS5jMmVmY2NiMWY2NjM1YmI5MWIwM2M4MWQzNzQzNGM4YjZkMDk3NWE5MmUxYjVhMDc3Mzg3MjkxNzdkNzM1YWRk';

    const baseURL = 'http://localhost:3000/api/whatsapp/webhook/v3';
    
    // Domínios para teste: beauty e healthcare
    const testData = [
        {
            domain: 'beauty',
            phone: '5511999000001',
            conversations: [
                [
                    'Oi, gostaria de agendar um corte de cabelo',
                    'Qual o preço dos serviços de manicure?',
                    'Vocês fazem design de sobrancelha?',
                    'Que horas vocês abrem?',
                    'Posso agendar para amanhã às 14h?',
                    'Muito obrigada pelas informações!'
                ],
                [
                    'Preciso fazer uma escova progressiva',
                    'Quanto tempo demora o procedimento?',
                    'Vocês usam produtos sem formol?',
                    'Qual o valor do tratamento?',
                    'Posso pagar no cartão?',
                    'Vou agendar para a próxima semana'
                ]
            ]
        },
        {
            domain: 'healthcare',
            phone: '5511999000002', 
            conversations: [
                [
                    'Preciso agendar uma consulta médica',
                    'Trabalham com convênio Unimed?',
                    'Qual a especialidade do Dr. Silva?',
                    'Tem horário disponível hoje?',
                    'Quanto custa a consulta particular?',
                    'Vou confirmar o agendamento'
                ],
                [
                    'Gostaria de remarcar minha consulta',
                    'Podem fazer exames laboratoriais?',
                    'Preciso de um atestado médico',
                    'Qual o horário de funcionamento?',
                    'Fazem telemedicina?',
                    'Obrigado pelos esclarecimentos'
                ]
            ]
        }
    ];

    for (const domainData of testData) {
        console.log(`\n📱 Testando domínio: ${domainData.domain} - Phone: ${domainData.phone}`);
        
        for (let convIndex = 0; convIndex < domainData.conversations.length; convIndex++) {
            console.log(`\n💬 Conversa ${convIndex + 1}:`);
            const messages = domainData.conversations[convIndex];
            
            for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
                const message = messages[msgIndex];
                console.log(`   ${msgIndex + 1}. USER: ${message}`);
                
                try {
                    const response = await axios.post(baseURL, {
                        entry: [{
                            id: "123456789",
                            changes: [{
                                value: {
                                    messaging_product: "whatsapp",
                                    metadata: {
                                        display_phone_number: "15550123456",
                                        phone_number_id: "test_phone_id"
                                    },
                                    messages: [{
                                        from: domainData.phone,
                                        id: `msg_${domainData.domain}_${convIndex}_${msgIndex}_${Date.now()}`,
                                        timestamp: Math.floor(Date.now() / 1000).toString(),
                                        text: { body: message },
                                        type: "text"
                                    }]
                                },
                                field: "messages"
                            }]
                        }]
                    }, {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-demo-token': token
                        }
                    });
                    
                    console.log(`      ✅ Resposta IA recebida (${response.status})`);
                    
                    // Aguarda 1 segundo entre mensagens
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`      ❌ Erro na mensagem ${msgIndex + 1}:`, error.response?.data || error.message);
                }
            }
            
            // Aguarda 2 segundos entre conversas
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log('\n✅ Teste de população concluído!');
    console.log('📊 Agora verificando persistência das métricas...');
    
    // Verificar métricas no BD
    await checkMetricsInDatabase();
}

async function checkMetricsInDatabase() {
    const { supabaseAdmin } = require('./dist/config/database');
    
    try {
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('content, is_from_user, tokens_used, api_cost_usd, confidence_score, processing_cost_usd, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('❌ Erro ao consultar BD:', error);
            return;
        }
        
        console.log('\n📊 VALIDAÇÃO DAS MÉTRICAS:');
        console.log('='.repeat(80));
        
        let userMessagesWithMetrics = 0;
        let aiMessagesWithoutMetrics = 0;
        let correctUserMessages = 0;
        let correctAiMessages = 0;
        
        data.forEach((row, i) => {
            const userType = row.is_from_user ? 'USER' : 'AI  ';
            const hasMetrics = row.tokens_used !== null || row.api_cost_usd !== null || row.confidence_score !== null;
            
            console.log(`${i+1}. [${userType}] ${row.content?.substring(0, 40)}...`);
            console.log(`   tokens: ${row.tokens_used}, cost: ${row.api_cost_usd}, confidence: ${row.confidence_score}`);
            
            if (row.is_from_user && hasMetrics) {
                userMessagesWithMetrics++;
                console.log(`   ❌ ERRO: Mensagem USER tem métricas!`);
            } else if (row.is_from_user && !hasMetrics) {
                correctUserMessages++;
                console.log(`   ✅ CORRETO: Mensagem USER sem métricas`);
            } else if (!row.is_from_user && !hasMetrics) {
                aiMessagesWithoutMetrics++;
                console.log(`   ❌ ERRO: Mensagem AI sem métricas!`);
            } else if (!row.is_from_user && hasMetrics) {
                correctAiMessages++;
                console.log(`   ✅ CORRETO: Mensagem AI com métricas`);
            }
            console.log('');
        });
        
        console.log('='.repeat(80));
        console.log('📊 RESULTADO FINAL:');
        console.log(`✅ Mensagens USER corretas (sem métricas): ${correctUserMessages}`);
        console.log(`✅ Mensagens AI corretas (com métricas): ${correctAiMessages}`);
        console.log(`❌ Mensagens USER com métricas (ERRO): ${userMessagesWithMetrics}`);
        console.log(`❌ Mensagens AI sem métricas (ERRO): ${aiMessagesWithoutMetrics}`);
        
        if (userMessagesWithMetrics === 0 && aiMessagesWithoutMetrics === 0) {
            console.log('\n🎉 PERFEITO! Todas as métricas estão corretas!');
        } else {
            console.log('\n⚠️  Há problemas na persistência das métricas!');
        }
        
    } catch (error) {
        console.error('❌ Erro na validação:', error);
    }
}

// Executar teste
if (require.main === module) {
    testAIMetricsPersistence().catch(console.error);
}