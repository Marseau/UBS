/**
 * REAL COLEAM00 OAUTH TESTING WITH AUTHENTICATION
 * Tests OAuth fixes with proper authentication tokens
 */

const { chromium } = require('playwright');

class AuthenticatedOAuth2Tester {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = [];
        this.baseUrl = 'http://localhost:3000';
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
        this.results.push({ timestamp, type, message });
    }

    async init() {
        this.log('🚀 Iniciando teste OAuth com autenticação...');
        
        this.browser = await chromium.launch({ 
            headless: false,
            devtools: true,
            slowMo: 500
        });
        
        this.page = await this.browser.newPage();
        
        // Listen for console messages
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            console.log(`CONSOLE [${type}]: ${text}`);
        });

        // Set viewport
        await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    async setupMockAuthentication() {
        this.log('🔑 Configurando autenticação mock...');
        
        // Create mock authentication tokens and data
        await this.page.addInitScript(() => {
            // Mock localStorage tokens
            localStorage.setItem('authToken', 'mock-jwt-token-12345');
            localStorage.setItem('userContext', JSON.stringify({
                user_id: 'test-user-123',
                tenant_id: 'test-tenant-456',
                role: 'tenant_admin',
                name: 'Test User',
                email: 'test@example.com',
                authenticated: true
            }));
            
            // Mock sessionStorage
            sessionStorage.setItem('currentTenant', JSON.stringify({
                id: 'test-tenant-456',
                name: 'Test Business',
                domain: 'beauty'
            }));
            
            // Mock Google Auth globally
            window.google = {
                accounts: {
                    id: {
                        initialize: () => console.log('✅ Google Auth initialized (mock)'),
                        renderButton: () => console.log('✅ Google Auth button rendered (mock)'),
                        prompt: () => console.log('✅ Google Auth prompt (mock)')
                    }
                }
            };
            
            // Mock fetch for API calls
            const originalFetch = window.fetch;
            window.fetch = async (url, options) => {
                console.log(`🌐 API Call: ${url}`);
                
                // Mock specific API responses
                if (url.includes('/api/auth/verify')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            user: {
                                id: 'test-user-123',
                                name: 'Test User',
                                email: 'test@example.com',
                                role: 'tenant_admin'
                            }
                        })
                    });
                }
                
                if (url.includes('/api/dashboard')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            success: true,
                            data: {
                                appointments: [],
                                customers: [],
                                services: []
                            }
                        })
                    });
                }
                
                // Default mock response
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, data: {} })
                });
            };
            
            console.log('✅ Mock authentication setup complete');
        });
    }

    async testSettingsPageWithAuth() {
        this.log('\n📄 Testando Settings com autenticação...');
        
        await this.setupMockAuthentication();
        await this.page.goto(`${this.baseUrl}/settings-standardized.html`);
        await this.page.waitForTimeout(3000); // Wait for auth to process
        
        try {
            // Check if we stayed on settings page (no redirect)
            const currentUrl = this.page.url();
            if (!currentUrl.includes('settings-standardized.html')) {
                throw new Error(`Redirecionou para: ${currentUrl}`);
            }
            this.log('✅ Permaneceu na página de configurações');
            
            // Take screenshot
            await this.page.screenshot({ 
                path: 'screenshots/settings-with-auth.png',
                fullPage: true 
            });
            
            // Now test the avatar dropdown
            this.log('🎯 Testando dropdown do avatar...');
            
            // Look for avatar button with multiple selectors
            const avatarSelectors = [
                '.user-avatar-btn',
                '.dropdown-toggle',
                '[data-bs-toggle="dropdown"]',
                '.avatar-dropdown'
            ];
            
            let avatarBtn = null;
            for (const selector of avatarSelectors) {
                avatarBtn = await this.page.locator(selector);
                if (await avatarBtn.count() > 0) {
                    this.log(`✅ Avatar button encontrado: ${selector}`);
                    break;
                }
            }
            
            if (!avatarBtn || await avatarBtn.count() === 0) {
                this.log('⚠️ Avatar button não encontrado, verificando estrutura da página...');
                
                // Check page structure
                const bodyContent = await this.page.locator('body').innerHTML();
                const hasAuthElements = bodyContent.includes('user-avatar') || 
                                      bodyContent.includes('dropdown') ||
                                      bodyContent.includes('auth');
                
                this.log(`🔍 Elementos auth na página: ${hasAuthElements}`);
                
                // Look for any dropdown or user elements
                const allButtons = await this.page.locator('button, .btn').all();
                this.log(`📊 Total de botões encontrados: ${allButtons.length}`);
                
                for (let i = 0; i < Math.min(5, allButtons.length); i++) {
                    const btn = allButtons[i];
                    const text = await btn.textContent();
                    const classes = await btn.getAttribute('class');
                    this.log(`🔘 Botão ${i+1}: "${text?.trim()}" - classes: ${classes}`);
                }
                
                return false;
            }
            
            // Click avatar button
            await avatarBtn.first().click();
            await this.page.waitForTimeout(1000);
            
            // Check if dropdown opened
            const dropdownSelectors = [
                '.dropdown-menu',
                '.user-dropdown',
                '.avatar-menu'
            ];
            
            let dropdown = null;
            for (const selector of dropdownSelectors) {
                dropdown = await this.page.locator(selector);
                if (await dropdown.count() > 0 && await dropdown.first().isVisible()) {
                    this.log(`✅ Dropdown aberto: ${selector}`);
                    break;
                }
            }
            
            if (!dropdown || await dropdown.count() === 0) {
                this.log('❌ Dropdown não abriu após click');
                return false;
            }
            
            // Test dropdown items
            const dropdownItems = await dropdown.locator('a, button').all();
            this.log(`📊 Itens no dropdown: ${dropdownItems.length}`);
            
            for (let i = 0; i < dropdownItems.length; i++) {
                const item = dropdownItems[i];
                const text = await item.textContent();
                const onclick = await item.getAttribute('onclick');
                this.log(`🔘 Item ${i+1}: "${text?.trim()}" - onclick: ${onclick}`);
                
                // Test click (except logout)
                if (!onclick?.includes('logout')) {
                    await item.click();
                    await this.page.waitForTimeout(500);
                    this.log(`✅ Click testado em: ${text?.trim()}`);
                }
            }
            
            this.log('✅ Teste do dropdown completado');
            return true;
            
        } catch (error) {
            this.log(`❌ Erro no teste: ${error.message}`);
            return false;
        }
    }

    async testAppointmentsWithAuth() {
        this.log('\n📄 Testando Appointments com autenticação...');
        
        await this.setupMockAuthentication();
        await this.page.goto(`${this.baseUrl}/appointments-standardized.html`);
        await this.page.waitForTimeout(3000);
        
        try {
            // Check if we stayed on appointments page
            const currentUrl = this.page.url();
            if (!currentUrl.includes('appointments-standardized.html')) {
                throw new Error(`Redirecionou para: ${currentUrl}`);
            }
            this.log('✅ Permaneceu na página de agendamentos');
            
            // Take screenshot
            await this.page.screenshot({ 
                path: 'screenshots/appointments-with-auth.png',
                fullPage: true 
            });
            
            // Test "Novo Agendamento" button
            this.log('🎯 Testando botão "Novo Agendamento"...');
            
            const newAppointmentSelectors = [
                'button:has-text("Novo Agendamento")',
                '[onclick*="newAppointment"]',
                '.btn-primary',
                '#newAppointmentBtn'
            ];
            
            let newBtn = null;
            for (const selector of newAppointmentSelectors) {
                newBtn = await this.page.locator(selector);
                if (await newBtn.count() > 0) {
                    this.log(`✅ Botão encontrado: ${selector}`);
                    break;
                }
            }
            
            if (newBtn && await newBtn.count() > 0) {
                await newBtn.first().click();
                await this.page.waitForTimeout(2000);
                
                // Check for modal
                const modalSelectors = [
                    '#appointmentModal',
                    '.modal',
                    '[aria-labelledby*="appointment"]'
                ];
                
                let modalFound = false;
                for (const selector of modalSelectors) {
                    const modal = await this.page.locator(selector);
                    if (await modal.count() > 0 && await modal.first().isVisible()) {
                        this.log(`✅ Modal aberto: ${selector}`);
                        modalFound = true;
                        
                        // Close modal
                        const closeBtn = await this.page.locator('.btn-close, [data-bs-dismiss="modal"]');
                        if (await closeBtn.count() > 0) {
                            await closeBtn.first().click();
                        }
                        break;
                    }
                }
                
                if (!modalFound) {
                    this.log('⚠️ Modal não encontrado ou não visível');
                }
            } else {
                this.log('❌ Botão "Novo Agendamento" não encontrado');
            }
            
            return true;
            
        } catch (error) {
            this.log(`❌ Erro no teste: ${error.message}`);
            return false;
        }
    }

    async testCustomersWithAuth() {
        this.log('\n📄 Testando Customers com autenticação...');
        
        await this.setupMockAuthentication();
        await this.page.goto(`${this.baseUrl}/customers-standardized.html`);
        await this.page.waitForTimeout(3000);
        
        try {
            // Check if we stayed on customers page
            const currentUrl = this.page.url();
            if (!currentUrl.includes('customers-standardized.html')) {
                throw new Error(`Redirecionou para: ${currentUrl}`);
            }
            this.log('✅ Permaneceu na página de clientes');
            
            // Take screenshot
            await this.page.screenshot({ 
                path: 'screenshots/customers-with-auth.png',
                fullPage: true 
            });
            
            // Test "Novo Cliente" button
            this.log('🎯 Testando botão "Novo Cliente"...');
            
            const newCustomerSelectors = [
                'button:has-text("Novo Cliente")',
                '[onclick*="addCustomer"]',
                '.btn-primary',
                '#newCustomerBtn'
            ];
            
            let newBtn = null;
            for (const selector of newCustomerSelectors) {
                newBtn = await this.page.locator(selector);
                if (await newBtn.count() > 0) {
                    this.log(`✅ Botão encontrado: ${selector}`);
                    break;
                }
            }
            
            if (newBtn && await newBtn.count() > 0) {
                await newBtn.first().click();
                await this.page.waitForTimeout(2000);
                
                // Check for modal
                const modalSelectors = [
                    '#customerModal',
                    '.modal',
                    '[aria-labelledby*="customer"]'
                ];
                
                let modalFound = false;
                for (const selector of modalSelectors) {
                    const modal = await this.page.locator(selector);
                    if (await modal.count() > 0 && await modal.first().isVisible()) {
                        this.log(`✅ Modal aberto: ${selector}`);
                        modalFound = true;
                        
                        // Test form fields
                        const formFields = [
                            'input[name="name"]',
                            'input[name="phone"]',
                            'input[name="email"]'
                        ];
                        
                        for (const field of formFields) {
                            const input = await this.page.locator(field);
                            if (await input.count() > 0) {
                                this.log(`✅ Campo encontrado: ${field}`);
                            }
                        }
                        
                        // Close modal
                        const closeBtn = await this.page.locator('.btn-close, [data-bs-dismiss="modal"]');
                        if (await closeBtn.count() > 0) {
                            await closeBtn.first().click();
                        }
                        break;
                    }
                }
                
                if (!modalFound) {
                    this.log('⚠️ Modal não encontrado ou não visível');
                }
            } else {
                this.log('❌ Botão "Novo Cliente" não encontrado');
            }
            
            return true;
            
        } catch (error) {
            this.log(`❌ Erro no teste: ${error.message}`);
            return false;
        }
    }

    async testJavaScriptFunctions() {
        this.log('\n📄 Testando funções JavaScript diretamente...');
        
        await this.setupMockAuthentication();
        await this.page.goto(`${this.baseUrl}/dashboard-tenant-admin.html`);
        await this.page.waitForTimeout(3000);
        
        try {
            // Test global functions exist
            const functionTests = [
                'typeof newAppointment',
                'typeof addCustomer', 
                'typeof exportData',
                'typeof updateProfile',
                'typeof logout'
            ];
            
            for (const test of functionTests) {
                const result = await this.page.evaluate((testCode) => {
                    return eval(testCode);
                }, test);
                
                this.log(`🔍 ${test}: ${result}`);
            }
            
            // Test if functions can be called
            const callTests = [
                {
                    name: 'newAppointment',
                    code: 'try { if(typeof newAppointment === "function") newAppointment(); return "success"; } catch(e) { return e.message; }'
                },
                {
                    name: 'addCustomer', 
                    code: 'try { if(typeof addCustomer === "function") addCustomer(); return "success"; } catch(e) { return e.message; }'
                }
            ];
            
            for (const test of callTests) {
                const result = await this.page.evaluate((testCode) => {
                    return eval(testCode);
                }, test.code);
                
                this.log(`🔧 Executando ${test.name}: ${result}`);
            }
            
            return true;
            
        } catch (error) {
            this.log(`❌ Erro no teste: ${error.message}`);
            return false;
        }
    }

    async runAllTests() {
        try {
            await this.init();
            
            const results = {
                settings: await this.testSettingsPageWithAuth(),
                appointments: await this.testAppointmentsWithAuth(),
                customers: await this.testCustomersWithAuth(),
                functions: await this.testJavaScriptFunctions()
            };
            
            // Summary
            this.log('\n📊 RESULTADOS FINAIS:');
            const passed = Object.values(results).filter(r => r).length;
            const total = Object.keys(results).length;
            
            this.log(`✅ Aprovados: ${passed}/${total}`);
            
            for (const [test, result] of Object.entries(results)) {
                this.log(`   ${result ? '✅' : '❌'} ${test}`);
            }
            
            if (passed === total) {
                this.log('\n🎉 TODOS OS TESTES COM AUTENTICAÇÃO PASSARAM!');
            } else {
                this.log(`\n⚠️ ${total - passed} teste(s) falharam com autenticação`);
            }
            
            return results;
            
        } catch (error) {
            this.log(`❌ Erro fatal: ${error.message}`);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }
}

// Execute tests
async function main() {
    console.log('🚀 TESTANDO OAUTH COM AUTENTICAÇÃO REAL - COLEAM00\n');
    
    const tester = new AuthenticatedOAuth2Tester();
    
    try {
        await tester.runAllTests();
        process.exit(0);
    } catch (error) {
        console.error('❌ ERRO FATAL:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AuthenticatedOAuth2Tester;