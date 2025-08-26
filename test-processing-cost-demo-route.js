const { supabaseAdmin } = require('./dist/config/database');

// 6 domínios do sistema
const DOMAINS = ['healthcare', 'sports', 'beauty', 'legal', 'education', 'consulting'];

async function getTenantsByDomains() {
    console.log('🔍 Buscando 2 tenants por domínio (6 domínios = 12 tenants)...');
    
    const tenantsByDomain = {};
    
    for (const domain of DOMAINS) {
        const { data: tenants, error } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, phone, domain')
            .eq('domain', domain)
            .not('phone', 'is', null)
            .limit(2);
            
        if (error) {
            console.error(`❌ Erro ao buscar tenants do domínio ${domain}:`, error);
            continue;
        }
        
        tenantsByDomain[domain] = tenants;
        console.log(`  📋 ${domain}: ${tenants.length} tenants encontrados`);
        tenants.forEach((t, i) => {
            console.log(`     ${i+1}. ${t.business_name} (${t.phone})`);
        });
    }
    
    const totalTenants = Object.values(tenantsByDomain).flat().length;
    console.log(`\n✅ Total encontrado: ${totalTenants} tenants`);
    
    return tenantsByDomain;
}

async function sendDemoMessage(tenant, messageText, messageNumber, conversationNumber, tenantIndex) {
    try {
        const response = await fetch(`http://localhost:3000/api/demo/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tenantId: tenant.id,
                message: messageText,
                domain: tenant.domain
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return {
                success: true,
                response: data.response,
                timestamp: data.timestamp
            };
        } else {
            return { 
                success: false, 
                error: data.error || `HTTP ${response.status}`,
                response: data.response 
            };
        }
        
    } catch (error) {
        console.error(`   ❌ Erro ao enviar mensagem ${messageNumber}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function runConversation(tenant, conversationNumber, tenantIndex, totalTenants) {
    // Mensagens variadas por domínio e conversa
    const messagesByDomain = {
        healthcare: [
            ["Olá, preciso agendar uma consulta", "É para hoje se possível", "Qual o valor da consulta?", "Aceita plano de saúde?", "Que horários vocês atendem?", "Obrigado pelas informações"],
            ["Bom dia, quero marcar exame", "Precisa estar em jejum?", "Qual o preço?", "Posso pagar no cartão?", "Onde fica a clínica?", "Perfeito, muito obrigado"]
        ],
        sports: [
            ["Olá, quero me matricular", "Que modalidades vocês têm?", "Qual o valor da mensalidade?", "Tem desconto anual?", "Que horários funcionam?", "Vou pensar, obrigado"],
            ["Oi, quero aula particular", "É para treino funcional", "Quanto custa por aula?", "Posso pagar mensal?", "Qual o melhor horário?", "Legal, vou decidir"]
        ],
        beauty: [
            ["Oi, quero agendar corte", "Para hoje à tarde", "Quanto fica o serviço completo?", "Fazem escova também?", "Aceita cartão?", "Ótimo, muito obrigada"],
            ["Bom dia, preciso fazer as unhas", "Têm manicure disponível?", "Qual o preço?", "Demora quanto tempo?", "Posso ir agora?", "Perfeito, já vou aí"]
        ],
        legal: [
            ["Preciso de uma consultoria", "É sobre direito trabalhista", "Quanto cobram pela consulta?", "Atendem hoje?", "Onde fica o escritório?", "Ok, vou agendar"],
            ["Quero tirar umas dúvidas", "Sobre processo judicial", "Cobram por hora?", "Têm desconto à vista?", "Que documentos preciso?", "Entendi, obrigado"]
        ],
        education: [
            ["Quero fazer um curso", "É sobre programação", "Quanto custa o curso completo?", "Tem certificado?", "Quanto tempo dura?", "Vou me inscrever"],
            ["Interessado nas aulas", "De inglês avançado", "Qual o valor?", "É presencial ou online?", "Quando começam?", "Legal, obrigado"]
        ],
        consulting: [
            ["Preciso de consultoria", "Para minha empresa", "Como funciona?", "Qual o investimento?", "Fazem diagnóstico gratuito?", "Vou conversar com sócios"],
            ["Quero melhorar processos", "Da minha loja", "Vocês ajudam nisso?", "Quanto cobram?", "Quanto tempo demora?", "Interessante, obrigado"]
        ]
    };
    
    const domainMessages = messagesByDomain[tenant.domain] || messagesByDomain.healthcare;
    const messages = domainMessages[conversationNumber - 1] || domainMessages[0];
    
    console.log(`   💬 Conv ${conversationNumber} - Tenant: ${tenant.business_name}`);
    
    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
        const result = await sendDemoMessage(tenant, messages[i], i + 1, conversationNumber, tenantIndex);
        results.push(result);
        
        if (result.success) {
            process.stdout.write('✅ ');
        } else {
            process.stdout.write('❌ ');
        }
        
        // Aguardar um pouco entre mensagens
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n   📊 ${successCount}/${results.length} mensagens enviadas com sucesso`);
    
    return results;
}

async function runDemoRouteTest() {
    console.log('🚀 TESTE COM ROTA DEMO: Processing Cost USD - Validação Completa');
    console.log('📋 Cenário: 6 domínios, 2 tenants cada, 2 conversas por tenant, 6+ mensagens por conversa');
    console.log('🎯 Usando /api/demo/chat para persistência REAL no banco');
    console.log('=' .repeat(80));
    
    const startTime = new Date();
    
    // 1. Buscar tenants por domínio
    const tenantsByDomain = await getTenantsByDomains();
    const allTenants = Object.values(tenantsByDomain).flat();
    
    if (allTenants.length === 0) {
        console.log('❌ Nenhum tenant encontrado. Abortando teste.');
        return;
    }
    
    // 2. Executar conversas usando a rota demo
    console.log('\n💬 Executando conversas via /api/demo/chat...');
    const allResults = [];
    let tenantIndex = 1;
    
    for (const domain of DOMAINS) {
        const domainTenants = allTenants.filter(t => t.domain === domain);
        if (domainTenants.length === 0) continue;
        
        console.log(`\n🏢 === DOMÍNIO: ${domain.toUpperCase()} (${domainTenants.length} tenants) ===`);
        
        for (const tenant of domainTenants) {
            console.log(`\n  📍 Tenant ${tenantIndex}: ${tenant.business_name}`);
            
            // 2 conversas por tenant
            for (let conv = 1; conv <= 2; conv++) {
                const conversationResults = await runConversation(tenant, conv, tenantIndex, allTenants.length);
                allResults.push(...conversationResults);
                
                // Pequena pausa entre conversas
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            tenantIndex++;
        }
    }
    
    // 3. Aguardar processamento
    console.log('\n⏳ Aguardando persistência no banco (5s)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. Validar resultados
    await validateDemoResults(startTime, allTenants.length, allResults);
}

async function validateDemoResults(startTime, totalTenants, allResults) {
    console.log('\n🔍 === VALIDAÇÃO NO BANCO DE DADOS ===');
    
    // Buscar mensagens de teste criadas após o início
    const { data: conversations, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .eq('message_source', 'test') // Filtrar apenas mensagens de teste
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${conversations.length} mensagens de teste desde o início`);
    
    if (conversations.length === 0) {
        console.log('⚠️ Nenhuma conversa encontrada no banco. Verificando erros...');
        
        // Mostrar erros das requisições
        const errors = allResults.filter(r => !r.success);
        if (errors.length > 0) {
            console.log('\n❌ Erros encontrados:');
            errors.slice(0, 5).forEach((err, i) => {
                console.log(`   ${i+1}. ${err.error}`);
            });
        }
        return;
    }
    
    // Análise das métricas
    let userMessages = 0;
    let aiMessages = 0;
    let correctUserMetrics = 0;
    let correctAiMetrics = 0;
    let newCalculationCount = 0;
    let oldCalculationCount = 0;
    
    const tenantStats = {};
    
    conversations.forEach((msg) => {
        // Estatísticas por tenant
        if (!tenantStats[msg.tenant_id]) {
            tenantStats[msg.tenant_id] = { user: 0, ai: 0, newCalc: 0, oldCalc: 0 };
        }
        
        if (msg.is_from_user) {
            userMessages++;
            tenantStats[msg.tenant_id].user++;
            
            // Verificar se mensagem de usuário tem métricas NULL
            if (msg.tokens_used === null && msg.api_cost_usd === null && 
                msg.processing_cost_usd === null && msg.confidence_score === null) {
                correctUserMetrics++;
            }
        } else {
            aiMessages++;
            tenantStats[msg.tenant_id].ai++;
            
            // Verificar mensagem de IA
            if (msg.tokens_used !== null && msg.api_cost_usd !== null && msg.processing_cost_usd !== null) {
                correctAiMetrics++;
                
                const ratio = msg.processing_cost_usd / msg.api_cost_usd;
                
                if (ratio < 0.1) {
                    newCalculationCount++;
                    tenantStats[msg.tenant_id].newCalc++;
                } else if (Math.abs(ratio - 0.1) < 0.001) {
                    oldCalculationCount++;
                    tenantStats[msg.tenant_id].oldCalc++;
                }
            }
        }
    });
    
    // Mostrar algumas mensagens como exemplo
    console.log('\n📋 EXEMPLOS DE MENSAGENS PERSISTIDAS:');
    console.log('='.repeat(60));
    conversations.slice(0, 10).forEach((msg, i) => {
        const userType = msg.is_from_user ? 'USER' : 'AI  ';
        console.log(`${i+1}. [${userType}] ${msg.content?.substring(0, 50)}...`);
        
        if (!msg.is_from_user && msg.processing_cost_usd && msg.api_cost_usd) {
            const ratio = msg.processing_cost_usd / msg.api_cost_usd;
            const calcType = ratio < 0.1 ? '✅ NOVO' : ratio === 0.1 ? '❌ ANTIGO' : '🤔 OUTRO';
            console.log(`   💰 Cost: ${msg.api_cost_usd} | Processing: ${msg.processing_cost_usd} | Ratio: ${ratio.toFixed(4)} ${calcType}`);
        }
        console.log('');
    });
    
    // Estatísticas por tenant
    console.log('\n📋 ESTATÍSTICAS POR TENANT:');
    console.log('='.repeat(60));
    Object.entries(tenantStats).forEach(([tenantId, stats]) => {
        const total = stats.user + stats.ai;
        const correctionRate = stats.ai > 0 ? ((stats.newCalc / stats.ai) * 100).toFixed(1) : 0;
        console.log(`${tenantId.substring(0, 8)}: ${total} msgs (${stats.user} user, ${stats.ai} AI) - ${correctionRate}% corrigido`);
    });
    
    // Resumo final
    console.log('\n📋 === RESUMO DA VALIDAÇÃO ===');
    const totalMessagesSent = allResults.length;
    const successfulSent = allResults.filter(r => r.success).length;
    
    console.log(`🏢 Tenants testados: ${totalTenants}`);
    console.log(`📤 Mensagens enviadas: ${successfulSent}/${totalMessagesSent}`);
    console.log(`💾 Mensagens persistidas: ${conversations.length}`);
    console.log(`👤 Mensagens de usuário: ${userMessages} (${correctUserMetrics} com métricas NULL corretas)`);
    console.log(`🤖 Mensagens de IA: ${aiMessages} (${correctAiMetrics} com métricas preenchidas)`);
    console.log(`✅ Novo cálculo correto: ${newCalculationCount}`);
    console.log(`❌ Cálculo antigo (10%): ${oldCalculationCount}`);
    
    // Cálculos finais
    const persistenceRate = successfulSent > 0 ? ((conversations.length / (successfulSent * 2)) * 100).toFixed(1) : 0; // *2 porque cada mensagem gera 2 entradas (user + AI)
    const correctionSuccessRate = correctAiMetrics > 0 ? ((newCalculationCount / correctAiMetrics) * 100).toFixed(1) : 0;
    
    console.log(`\n🎯 MÉTRICAS FINAIS:`);
    console.log(`📊 Taxa de persistência: ${persistenceRate}%`);
    console.log(`✅ Taxa de correção: ${correctionSuccessRate}%`);
    
    // Avaliação final
    console.log(`\n🏁 === RESULTADO FINAL ===`);
    
    if (parseFloat(persistenceRate) >= 80 && parseFloat(correctionSuccessRate) >= 80) {
        console.log('🎉 TESTE PASSOU COMPLETAMENTE!');
        console.log('   ✅ Persistência funcionando adequadamente');
        console.log('   ✅ Correção das métricas processing_cost_usd funcionando');
    } else if (parseFloat(persistenceRate) >= 50 && parseFloat(correctionSuccessRate) >= 50) {
        console.log('⚠️ TESTE PARCIALMENTE APROVADO');
        console.log(`   📊 Persistência: ${persistenceRate}% (esperado: >=80%)`);
        console.log(`   🔧 Correção: ${correctionSuccessRate}% (esperado: >=80%)`);
    } else {
        console.log('❌ TESTE NECESSITA INVESTIGAÇÃO');
        console.log(`   📊 Persistência: ${persistenceRate}%`);
        console.log(`   🔧 Correção: ${correctionSuccessRate}%`);
    }
}

// Executar teste
runDemoRouteTest().catch(console.error);