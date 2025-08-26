const crypto = require('crypto');
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
    
    // Verificar se temos tenants suficientes
    const totalTenants = Object.values(tenantsByDomain).flat().length;
    console.log(`\n✅ Total encontrado: ${totalTenants} tenants`);
    
    if (totalTenants < 12) {
        console.log(`⚠️ Menos de 12 tenants encontrados. Prosseguindo com ${totalTenants}.`);
    }
    
    return tenantsByDomain;
}

async function generateDemoTokenForTenant(tenant) {
    try {
        const response = await fetch(`http://localhost:3000/api/whatsapp/generate-demo-token?tenant_id=${tenant.id}&phone_number=${encodeURIComponent(tenant.phone)}`);
        const data = await response.json();
        
        if (!data.token) {
            throw new Error('Token não gerado');
        }
        
        return data.token;
    } catch (error) {
        console.error(`❌ Erro ao gerar token para ${tenant.business_name}:`, error);
        return null;
    }
}

async function sendWhatsAppMessage(tenant, token, userPhone, messageText, messageNumber, conversationNumber) {
    const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [{
                value: {
                    messaging_product: "whatsapp",
                    metadata: {
                        display_phone_number: tenant.phone,
                        phone_number_id: `PHONE_${tenant.id.substring(0, 8)}`
                    },
                    messages: [{
                        from: userPhone,
                        id: `wamid_massive_${tenant.id}_conv${conversationNumber}_msg${messageNumber}_${Date.now()}`,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        text: {
                            body: messageText
                        },
                        type: "text"
                    }]
                },
                field: "messages"
            }]
        }]
    };
    
    const payload = JSON.stringify(webhookPayload);
    
    // Gerar assinatura HMAC usando o demo token
    const signature = crypto
        .createHmac('sha256', token)
        .update(payload)
        .digest('hex');
    
    try {
        const { execSync } = require('child_process');
        
        const curlCommand = `curl -s -X POST http://localhost:3000/api/whatsapp/webhook \
            -H 'Content-Type: application/json' \
            -H 'X-Hub-Signature-256: sha256=${signature}' \
            -H 'User-Agent: WhatsApp-Testing/1.0' \
            --data-raw '${payload.replace(/'/g, "'\"'\"'")}'`;
        
        const response = execSync(curlCommand, { encoding: 'utf8' });
        const parsedResponse = JSON.parse(response);
        
        if (parsedResponse.status === 'success') {
            return {
                success: true,
                response: parsedResponse.response,
                telemetry: parsedResponse.telemetry
            };
        } else {
            return { success: false, error: parsedResponse.response };
        }
        
    } catch (error) {
        console.error(`   ❌ Erro ao enviar mensagem ${messageNumber}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function runConversation(tenant, token, conversationNumber, tenantIndex, totalTenants) {
    const userPhone = `+55119999${String(tenantIndex).padStart(2, '0')}${String(conversationNumber).padStart(2, '0')}${String(Math.floor(Math.random() * 10))}`;
    
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
    
    console.log(`   💬 Conv ${conversationNumber} - Cliente: ${userPhone}`);
    
    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
        const result = await sendWhatsAppMessage(tenant, token, userPhone, messages[i], i + 1, conversationNumber);
        results.push(result);
        
        if (result.success) {
            process.stdout.write('✅ ');
        } else {
            process.stdout.write('❌ ');
        }
        
        // Aguardar um pouco entre mensagens para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n   📊 ${successCount}/${results.length} mensagens enviadas com sucesso`);
    
    return results;
}

async function runMassiveTest() {
    console.log('🚀 TESTE MASSIVO: Processing Cost USD - Validação Completa');
    console.log('📋 Cenário: 6 domínios, 2 tenants cada, 2 conversas por tenant, 6+ mensagens por conversa');
    console.log('=' .repeat(80));
    
    const startTime = new Date();
    
    // 1. Buscar tenants por domínio
    const tenantsByDomain = await getTenantsByDomains();
    const allTenants = Object.values(tenantsByDomain).flat();
    
    if (allTenants.length === 0) {
        console.log('❌ Nenhum tenant encontrado. Abortando teste.');
        return;
    }
    
    // 2. Gerar tokens para todos os tenants
    console.log('\n🔑 Gerando tokens demo para todos os tenants...');
    for (let i = 0; i < allTenants.length; i++) {
        const tenant = allTenants[i];
        tenant.demoToken = await generateDemoTokenForTenant(tenant);
        if (tenant.demoToken) {
            console.log(`   ✅ ${tenant.business_name} (${tenant.domain})`);
        } else {
            console.log(`   ❌ ${tenant.business_name} (${tenant.domain})`);
        }
    }
    
    // Filtrar apenas tenants com token válido
    const validTenants = allTenants.filter(t => t.demoToken);
    console.log(`\n📊 ${validTenants.length}/${allTenants.length} tenants com tokens válidos`);
    
    if (validTenants.length === 0) {
        console.log('❌ Nenhum tenant com token válido. Abortando.');
        return;
    }
    
    // 3. Executar conversas massivas
    console.log('\n💬 Executando conversas massivas...');
    const allResults = [];
    let tenantIndex = 1;
    
    for (const domain of DOMAINS) {
        const domainTenants = validTenants.filter(t => t.domain === domain);
        if (domainTenants.length === 0) continue;
        
        console.log(`\n🏢 === DOMÍNIO: ${domain.toUpperCase()} (${domainTenants.length} tenants) ===`);
        
        for (const tenant of domainTenants) {
            console.log(`\n  📍 Tenant ${tenantIndex}: ${tenant.business_name}`);
            
            // 2 conversas por tenant
            for (let conv = 1; conv <= 2; conv++) {
                const conversationResults = await runConversation(tenant, tenant.demoToken, conv, tenantIndex, validTenants.length);
                allResults.push(...conversationResults);
            }
            
            tenantIndex++;
        }
    }
    
    // 4. Aguardar processamento assíncrono
    console.log('\n⏳ Aguardando processamento assíncrono completo (10s)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 5. Validar resultados no banco
    await validateMassiveResults(startTime, validTenants.length, allResults.length);
}

async function validateMassiveResults(startTime, totalTenants, totalMessagesSent) {
    console.log('\n🔍 === VALIDAÇÃO MASSIVA NO BANCO DE DADOS ===');
    
    // Buscar conversas criadas após o início do teste
    const { data: conversations, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${conversations.length} mensagens desde o início do teste`);
    
    if (conversations.length === 0) {
        console.log('⚠️ Nenhuma conversa encontrada no banco. Verificando motivos...');
        return;
    }
    
    // Análise detalhada das métricas
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
    
    // Estatísticas por tenant
    console.log('\n📋 ESTATÍSTICAS POR TENANT:');
    console.log('='.repeat(60));
    Object.entries(tenantStats).forEach(([tenantId, stats]) => {
        const total = stats.user + stats.ai;
        const correctionRate = stats.ai > 0 ? ((stats.newCalc / stats.ai) * 100).toFixed(1) : 0;
        console.log(`${tenantId.substring(0, 8)}: ${total} msgs (${stats.user} user, ${stats.ai} AI) - ${correctionRate}% corrigido`);
    });
    
    // Resumo geral
    console.log('\n📋 === RESUMO GERAL DA VALIDAÇÃO ===');
    console.log(`🏢 Tenants testados: ${totalTenants}`);
    console.log(`📤 Mensagens enviadas: ${totalMessagesSent}`);
    console.log(`💾 Mensagens persistidas: ${conversations.length}`);
    console.log(`👤 Mensagens de usuário: ${userMessages} (${correctUserMetrics} com métricas NULL corretas)`);
    console.log(`🤖 Mensagens de IA: ${aiMessages} (${correctAiMetrics} com métricas preenchidas)`);
    console.log(`✅ Novo cálculo correto: ${newCalculationCount}`);
    console.log(`❌ Cálculo antigo (10%): ${oldCalculationCount}`);
    
    // Cálculos de taxa de sucesso
    const persistenceRate = totalMessagesSent > 0 ? ((conversations.length / totalMessagesSent) * 100).toFixed(1) : 0;
    const correctionSuccessRate = correctAiMetrics > 0 ? ((newCalculationCount / correctAiMetrics) * 100).toFixed(1) : 0;
    
    console.log(`\n🎯 MÉTRICAS FINAIS:`);
    console.log(`📊 Taxa de persistência: ${persistenceRate}%`);
    console.log(`✅ Taxa de correção: ${correctionSuccessRate}%`);
    
    // Avaliação final
    console.log(`\n🏁 === RESULTADO FINAL ===`);
    
    if (persistenceRate >= 80 && correctionSuccessRate >= 80) {
        console.log('🎉 TESTE MASSIVO PASSOU COMPLETAMENTE!');
        console.log('   ✅ Persistência funcionando adequadamente');
        console.log('   ✅ Correção das métricas funcionando adequadamente');
    } else if (persistenceRate >= 50 && correctionSuccessRate >= 50) {
        console.log('⚠️ TESTE MASSIVO PARCIALMENTE APROVADO');
        console.log(`   📊 Persistência: ${persistenceRate}% (esperado: >=80%)`);
        console.log(`   🔧 Correção: ${correctionSuccessRate}% (esperado: >=80%)`);
    } else {
        console.log('❌ TESTE MASSIVO FALHOU');
        console.log(`   📊 Persistência: ${persistenceRate}% (muito baixo)`);
        console.log(`   🔧 Correção: ${correctionSuccessRate}% (muito baixo)`);
    }
    
    return {
        totalTenants,
        totalMessagesSent,
        totalPersisted: conversations.length,
        persistenceRate: parseFloat(persistenceRate),
        correctionSuccessRate: parseFloat(correctionSuccessRate),
        userMessages,
        aiMessages,
        newCalculationCount,
        oldCalculationCount
    };
}

// Executar teste massivo
runMassiveTest().catch(console.error);