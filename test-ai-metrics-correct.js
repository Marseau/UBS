const axios = require('axios');

async function testAIMetricsPersistence() {
    console.log('🧪 Testando persistência das métricas de IA...');
    console.log('📋 Usando 2 tenants reais de cada domínio (beauty e healthcare)');
    console.log('📋 2 conversas com no mínimo 6 mensagens por tenant');
    
    const baseURL = 'http://localhost:3000/api/demo/chat';
    
    // Primeiro, buscar tenants reais do banco
    console.log('🔍 Buscando tenants reais no banco de dados...');
    const realTenants = await getRealTenants();
    
    if (!realTenants || realTenants.beauty.length < 2 || realTenants.healthcare.length < 2) {
        console.log('❌ Não foi possível encontrar 2 tenants de cada domínio!');
        console.log('📋 Necessário: 2 beauty + 2 healthcare');
        console.log('📋 Encontrado:', realTenants);
        return;
    }
    
    console.log('✅ Tenants encontrados:');
    console.log(`   Beauty: ${realTenants.beauty.length} tenants`);
    console.log(`   Healthcare: ${realTenants.healthcare.length} tenants`);
    
async function getRealTenants() {
    const { supabaseAdmin } = require('./dist/config/database');
    
    try {
        // Buscar tenants beauty
        const { data: beautyTenants, error: beautyError } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain')
            .eq('domain', 'beauty')
            .eq('account_type', 'test')
            .limit(2);
            
        if (beautyError) {
            console.error('❌ Erro ao buscar tenants beauty:', beautyError);
            return null;
        }
        
        // Buscar tenants healthcare
        const { data: healthcareTenants, error: healthcareError } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain')
            .eq('domain', 'healthcare')
            .eq('account_type', 'test')
            .limit(2);
            
        if (healthcareError) {
            console.error('❌ Erro ao buscar tenants healthcare:', healthcareError);
            return null;
        }
        
        return {
            beauty: beautyTenants || [],
            healthcare: healthcareTenants || []
        };
        
    } catch (error) {
        console.error('❌ Erro na busca de tenants:', error);
        return null;
    }
}
    
    // Construir dados de teste com tenants reais
    // 2 conversas por tenant: conversa1 com 6 mensagens + conversa2 com 6 mensagens
    const testData = [];
    
    // Beauty tenants
    realTenants.beauty.forEach((tenant, index) => {
        // Conversa 1 para tenant beauty
        testData.push({
            domain: 'beauty',
            tenantId: tenant.id,
            businessName: tenant.business_name,
            conversationId: 1,
            messages: [
                'Oi, preciso agendar um corte de cabelo',
                'Qual o preço dos seus serviços?', 
                'Vocês fazem escova progressiva?',
                'Que horas vocês abrem amanhã?',
                'Posso agendar para as 14h?',
                'Obrigada pelas informações!'
            ]
        });
        
        // Conversa 2 para tenant beauty  
        testData.push({
            domain: 'beauty',
            tenantId: tenant.id,
            businessName: tenant.business_name,
            conversationId: 2,
            messages: [
                'Quero fazer as unhas',
                'Fazem design de sobrancelha?',
                'Quanto custa uma manicure completa?',
                'Aceitam cartão de crédito?',
                'Preciso remarcar meu horário',
                'Muito obrigada!'
            ]
        });
    });
    
    // Healthcare tenants
    realTenants.healthcare.forEach((tenant, index) => {
        // Conversa 1 para tenant healthcare
        testData.push({
            domain: 'healthcare',
            tenantId: tenant.id,
            businessName: tenant.business_name,
            conversationId: 1,
            messages: [
                'Preciso agendar consulta médica',
                'Vocês atendem convênio Unimed?',
                'Qual a especialidade do doutor?', 
                'Tem horário hoje à tarde?',
                'Quanto custa consulta particular?',
                'Vou confirmar o agendamento'
            ]
        });
        
        // Conversa 2 para tenant healthcare
        testData.push({
            domain: 'healthcare',
            tenantId: tenant.id,
            businessName: tenant.business_name,
            conversationId: 2,
            messages: [
                'Gostaria de remarcar consulta',
                'Fazem exames de sangue?',
                'Preciso de atestado médico',
                'Qual horário de funcionamento?', 
                'Atendem por telemedicina?',
                'Obrigado pelos esclarecimentos'
            ]
        });
    });
    
    console.log(`📊 Total de conversas: ${testData.length}`);
    console.log(`📊 Total de mensagens: ${testData.reduce((sum, conv) => sum + conv.messages.length, 0)}`);
    
    let successfulRequests = 0;
    let totalRequests = 0;
    
    for (const data of testData) {
        console.log(`\n📱 ${data.businessName} (${data.domain}) - Conversa ${data.conversationId}`);
        console.log(`   TenantId: ${data.tenantId}`);
        
        for (let i = 0; i < data.messages.length; i++) {
            const message = data.messages[i];
            console.log(`   ${i+1}. USER: ${message}`);
            totalRequests++;
            
            try {
                const payload = {
                    tenantId: data.tenantId,
                    message: message,
                    domain: data.domain
                };
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                const response = await axios.post(baseURL, payload, { headers });
                
                if (response.status === 200) {
                    console.log(`      ✅ Sucesso (${response.status})`);
                    successfulRequests++;
                } else {
                    console.log(`      ⚠️  Status: ${response.status}`);
                }
                
                // Aguardar entre mensagens para não sobrecarregar
                await new Promise(resolve => setTimeout(resolve, 800));
                
            } catch (error) {
                if (error.response) {
                    console.log(`      ❌ Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
                } else {
                    console.log(`      ❌ Erro: ${error.message}`);
                }
            }
        }
        
        // Pausa entre domínios
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`\n📊 RESULTADO DO ENVIO:`);
    console.log(`✅ Sucessos: ${successfulRequests}/${totalRequests}`);
    console.log(`❌ Falhas: ${totalRequests - successfulRequests}/${totalRequests}`);
    
    if (successfulRequests > 0) {
        console.log('\n⏳ Aguardando 3 segundos para persistência...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        await validateMetricsInDatabase(successfulRequests);
    } else {
        console.log('\n❌ Nenhuma mensagem foi processada com sucesso!');
        console.log('🔧 Verifique a validação do token demo no servidor');
    }
}

async function validateMetricsInDatabase(expectedNewMessages) {
    console.log('\n📊 VALIDANDO MÉTRICAS NO BANCO DE DADOS...');
    
    const { supabaseAdmin } = require('./dist/config/database');
    
    try {
        // Buscar mensagens mais recentes
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('content, is_from_user, tokens_used, api_cost_usd, confidence_score, processing_cost_usd, created_at')
            .order('created_at', { ascending: false })
            .limit(expectedNewMessages * 2); // USER + AI messages
        
        if (error) {
            console.error('❌ Erro ao consultar BD:', error);
            return;
        }
        
        console.log(`🔍 Analisando ${data.length} mensagens mais recentes...`);
        console.log('='.repeat(80));
        
        let correctUserMessages = 0;
        let correctAiMessages = 0;
        let incorrectUserMessages = 0;
        let incorrectAiMessages = 0;
        let newMessages = 0;
        
        // Considerar apenas mensagens dos últimos 2 minutos
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        data.forEach((row, i) => {
            const messageTime = new Date(row.created_at);
            const isRecent = messageTime > twoMinutesAgo;
            
            if (!isRecent) return; // Pular mensagens antigas
            
            newMessages++;
            const userType = row.is_from_user ? 'USER' : 'AI  ';
            const hasMetrics = row.tokens_used !== null || row.api_cost_usd !== null || row.confidence_score !== null;
            
            console.log(`${i+1}. [${userType}] ${row.content?.substring(0, 50)}...`);
            console.log(`   📊 tokens: ${row.tokens_used}, cost: ${row.api_cost_usd}, confidence: ${row.confidence_score}`);
            console.log(`   🕒 ${row.created_at}`);
            
            if (row.is_from_user && !hasMetrics) {
                correctUserMessages++;
                console.log(`   ✅ CORRETO: Mensagem USER sem métricas`);
            } else if (row.is_from_user && hasMetrics) {
                incorrectUserMessages++;
                console.log(`   ❌ ERRO: Mensagem USER tem métricas quando deveria ser null!`);
            } else if (!row.is_from_user && hasMetrics) {
                correctAiMessages++;
                console.log(`   ✅ CORRETO: Mensagem AI com métricas`);
            } else if (!row.is_from_user && !hasMetrics) {
                incorrectAiMessages++;
                console.log(`   ❌ ERRO: Mensagem AI sem métricas!`);
            }
            console.log('');
        });
        
        console.log('='.repeat(80));
        console.log(`📊 ANÁLISE FINAL (${newMessages} mensagens recentes):`);
        console.log(`✅ Mensagens USER corretas (sem métricas): ${correctUserMessages}`);
        console.log(`✅ Mensagens AI corretas (com métricas): ${correctAiMessages}`);
        console.log(`❌ Mensagens USER incorretas (com métricas): ${incorrectUserMessages}`);
        console.log(`❌ Mensagens AI incorretas (sem métricas): ${incorrectAiMessages}`);
        
        const totalCorrect = correctUserMessages + correctAiMessages;
        const totalIncorrect = incorrectUserMessages + incorrectAiMessages;
        
        if (totalIncorrect === 0 && totalCorrect > 0) {
            console.log('\n🎉 PERFEITO! Todas as métricas estão corretas!');
            console.log('✅ A correção do sistema de métricas funcionou!');
        } else if (totalCorrect > 0) {
            console.log(`\n⚠️  PARCIALMENTE CORRETO: ${totalCorrect} corretas, ${totalIncorrect} incorretas`);
            console.log('🔧 A correção precisa de ajustes adicionais');
        } else {
            console.log('\n❌ PROBLEMA GRAVE: Nenhuma métrica está correta!');
            console.log('🚨 A correção não funcionou - requer investigação');
        }
        
    } catch (error) {
        console.error('❌ Erro na validação do BD:', error);
    }
}

// Executar teste
if (require.main === module) {
    testAIMetricsPersistence().catch(console.error);
}