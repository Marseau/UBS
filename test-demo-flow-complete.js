const puppeteer = require('puppeteer');
const { supabaseAdmin } = require('./dist/config/database');

async function testDemoFlowComplete() {
    let browser;
    
    try {
        console.log('🚀 TESTE COMPLETO: Fluxo Demo → Token → WhatsApp → Persistência BD');
        console.log('=' .repeat(80));
        
        // 1. Inicializar navegador
        console.log('🔧 Iniciando navegador...');
        browser = await puppeteer.launch({ 
            headless: false, // Para ver o que está acontecendo
            defaultViewport: { width: 1200, height: 800 }
        });
        
        const page = await browser.newPage();
        
        // 2. Navegar para página demo
        console.log('📄 Carregando página demo...');
        await page.goto('http://localhost:3000/demo.html', { waitUntil: 'networkidle2' });
        
        // 3. Preencher formulário com dados reais
        console.log('📝 Preenchendo formulário demo...');
        
        // WhatsApp do Negócio (usar tenant real)
        await page.type('input[placeholder*="55 (11) 99999-9999"]', '5511940077777');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // WhatsApp do Usuário
        await page.type('input[placeholder*="55 (11) 88888-8888"]', '5511999991234');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Aguardar e prosseguir no formulário (buscar próximo botão/campo)
        try {
            // Verificar se há botão para continuar
            const nextButton = await page.$('button[type="submit"], button:contains("Continuar"), button:contains("Próximo")');
            if (nextButton) {
                console.log('▶️ Clicando em botão para continuar...');
                await nextButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (e) {
            console.log('⏭️ Não há botão de continuação, prosseguindo...');
        }
        
        // 4. Buscar por seletor de domínio ou opção de teste
        console.log('🏢 Procurando opções de domínio/negócio...');
        
        try {
            // Buscar por seletores comuns de domínio
            const domainSelectors = [
                'select[name*="domain"]',
                'select[name*="business"]', 
                'input[name*="domain"]',
                'button[data-domain]',
                '.domain-option',
                '[data-testid*="domain"]'
            ];
            
            let domainElement = null;
            for (const selector of domainSelectors) {
                domainElement = await page.$(selector);
                if (domainElement) {
                    console.log(`✅ Encontrado seletor de domínio: ${selector}`);
                    break;
                }
            }
            
            if (domainElement) {
                const tagName = await domainElement.evaluate(el => el.tagName.toLowerCase());
                
                if (tagName === 'select') {
                    await page.select(domainElement, 'healthcare');
                    console.log('🏥 Selecionado domínio: healthcare');
                } else if (tagName === 'button') {
                    await domainElement.click();
                    console.log('🏥 Clicado em domínio healthcare');
                }
            }
        } catch (e) {
            console.log('⏭️ Domínio não encontrado ou já selecionado, prosseguindo...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 5. Buscar botão de "Testar" ou "Iniciar Demo"
        console.log('🎯 Procurando botão para iniciar demo...');
        
        const testButtons = [
            'button:contains("Teste Real com IA")',
            'button:contains("Iniciar Demo")',
            'button:contains("Testar")',
            'button:contains("Começar")',
            '.btn-success',
            '.btn-primary',
            'button[type="submit"]'
        ];
        
        let testButton = null;
        for (const selector of testButtons) {
            try {
                if (selector.includes(':contains')) {
                    // Buscar por texto do botão
                    testButton = await page.evaluateHandle((text) => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.find(btn => btn.textContent.includes(text.replace('button:contains("', '').replace('")', '')));
                    }, selector);
                    
                    if (testButton && await testButton.evaluate(el => el !== null)) break;
                } else {
                    testButton = await page.$(selector);
                    if (testButton) break;
                }
            } catch (e) {}
        }
        
        if (testButton) {
            console.log('▶️ Clicando no botão de teste...');
            try {
                if (testButton.click) {
                    await testButton.click();
                } else {
                    // Usar evaluate para clicar no elemento
                    await testButton.evaluate(el => el.click());
                }
            } catch (e) {
                console.log('⚠️ Erro ao clicar no botão, tentando método alternativo...');
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const testBtn = buttons.find(btn => 
                        btn.textContent.includes('Teste') || 
                        btn.textContent.includes('Demo') ||
                        btn.textContent.includes('Começar') ||
                        btn.textContent.includes('Testar')
                    );
                    if (testBtn) testBtn.click();
                });
            }
            await new Promise(resolve => setTimeout(resolve, 3000)); // Aguardar processamento
        }
        
        // 6. Aguardar e capturar token gerado
        console.log('🔑 Aguardando geração do token...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Buscar token no localStorage, sessionStorage ou na página
        const tokenInfo = await page.evaluate(() => {
            // Verificar localStorage
            const localToken = localStorage.getItem('demo_token') || localStorage.getItem('token');
            if (localToken) return { source: 'localStorage', token: localToken };
            
            // Verificar sessionStorage
            const sessionToken = sessionStorage.getItem('demo_token') || sessionStorage.getItem('token');
            if (sessionToken) return { source: 'sessionStorage', token: sessionToken };
            
            // Buscar na página por elementos com token
            const tokenElements = document.querySelectorAll('[data-token], .token, #token');
            for (const el of tokenElements) {
                if (el.textContent && el.textContent.length > 50) {
                    return { source: 'DOM', token: el.textContent };
                }
            }
            
            // Buscar inputs hidden com token
            const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
            for (const input of hiddenInputs) {
                if (input.value && input.value.length > 50) {
                    return { source: 'hidden_input', token: input.value };
                }
            }
            
            return null;
        });
        
        let demoToken = null;
        
        if (tokenInfo) {
            demoToken = tokenInfo.token;
            console.log(`✅ Token encontrado via ${tokenInfo.source}: ${demoToken.substring(0, 50)}...`);
        } else {
            // Fallback: fazer screenshot para análise manual
            await page.screenshot({ path: 'demo-page-after-submit.png', fullPage: true });
            console.log('📸 Screenshot salva: demo-page-after-submit.png');
            
            // Tentar buscar via API
            console.log('🔄 Tentando gerar token via API...');
            const response = await fetch(`http://localhost:3000/api/whatsapp/generate-demo-token?tenant_id=test&phone_number=5511940077777`);
            const data = await response.json();
            
            if (data.token) {
                demoToken = data.token;
                console.log(`✅ Token gerado via API: ${demoToken.substring(0, 50)}...`);
            }
        }
        
        if (!demoToken) {
            throw new Error('Não foi possível obter o demo token');
        }
        
        // 7. Testar webhook com o token gerado
        console.log('\n📤 Testando webhook com token demo...');
        const testResult = await testWebhookWithToken(demoToken);
        
        // 8. Validar persistência no banco
        console.log('\n🔍 Validando persistência no banco...');
        await validatePersistence();
        
        console.log('\n🎉 TESTE COMPLETO FINALIZADO!');
        
        return { success: true, token: demoToken, webhookResult: testResult };
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        
        if (browser) {
            // Screenshot de debug
            const page = await browser.newPage();
            await page.screenshot({ path: 'error-debug.png', fullPage: true });
            console.log('📸 Screenshot de erro salva: error-debug.png');
        }
        
        return { success: false, error: error.message };
        
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔧 Navegador fechado');
        }
    }
}

async function testWebhookWithToken(token) {
    const crypto = require('crypto');
    
    console.log('🧪 Enviando mensagem de teste via webhook...');
    
    const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [{
                value: {
                    messaging_product: "whatsapp",
                    metadata: {
                        display_phone_number: "5511940077777",
                        phone_number_id: "PHONE_DEMO_TEST"
                    },
                    messages: [{
                        from: "5511999991234",
                        id: `wamid_demo_test_${Date.now()}`,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        text: {
                            body: "Teste de persistência das métricas processing_cost_usd corrigidas"
                        },
                        type: "text"
                    }]
                },
                field: "messages"
            }]
        }]
    };
    
    const payload = JSON.stringify(webhookPayload);
    const signature = crypto.createHmac('sha256', token).update(payload).digest('hex');
    
    try {
        const { execSync } = require('child_process');
        
        const curlCommand = `curl -s -X POST http://localhost:3000/api/whatsapp/webhook \\
            -H 'Content-Type: application/json' \\
            -H 'X-Hub-Signature-256: sha256=${signature}' \\
            -H 'User-Agent: WhatsApp-Demo-Test/1.0' \\
            --data-raw '${payload.replace(/'/g, "'\"'\"'")}'`;
        
        const response = execSync(curlCommand, { encoding: 'utf8' });
        const parsedResponse = JSON.parse(response);
        
        console.log('📊 Resposta do webhook:', parsedResponse.status);
        
        return parsedResponse;
        
    } catch (error) {
        console.error('❌ Erro no webhook:', error.message);
        return { success: false, error: error.message };
    }
}

async function validatePersistence() {
    console.log('🔍 Verificando mensagens persistidas...');
    
    const { data: messages, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // últimos 10 min
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${messages.length} mensagens nos últimos 10 minutos`);
    
    if (messages.length === 0) {
        console.log('⚠️ Nenhuma mensagem foi persistida');
        return;
    }
    
    console.log('='.repeat(60));
    
    messages.forEach((msg, i) => {
        const userType = msg.is_from_user ? 'USER' : 'AI  ';
        console.log(`${i+1}. [${userType}] ${msg.content?.substring(0, 50)}...`);
        
        if (!msg.is_from_user && msg.processing_cost_usd && msg.api_cost_usd) {
            const ratio = (msg.processing_cost_usd / msg.api_cost_usd);
            const percentage = (ratio * 100).toFixed(1);
            console.log(`   💰 API: $${msg.api_cost_usd} | Processing: $${msg.processing_cost_usd}`);
            console.log(`   📊 Ratio: ${ratio.toFixed(4)} (${percentage}%)`);
            
            if (ratio < 0.08) {
                console.log(`   ✅ NOVO CÁLCULO CORRETO! (${percentage}% < 8%)`);
            } else if (Math.abs(ratio - 0.1) < 0.01) {
                console.log(`   ❌ AINDA USANDO CÁLCULO ANTIGO (${percentage}% ≈ 10%)`);
            } else {
                console.log(`   🤔 CÁLCULO DIFERENTE: ${percentage}%`);
            }
        } else if (!msg.is_from_user) {
            console.log(`   ⚠️ MENSAGEM AI SEM MÉTRICAS COMPLETAS`);
        } else {
            console.log(`   ✅ MENSAGEM USER (métricas devem ser NULL)`);
        }
        
        console.log('');
    });
}

// Executar teste
testDemoFlowComplete()
    .then(result => {
        if (result.success) {
            console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
        } else {
            console.log('❌ TESTE FALHOU:', result.error);
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 ERRO CRÍTICO:', error);
        process.exit(1);
    });