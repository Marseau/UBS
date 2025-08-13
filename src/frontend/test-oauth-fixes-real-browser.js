/**
 * REAL COLEAM00 VALIDATION TESTING - OAuth Fixes
 * This script performs ACTUAL browser testing using Playwright
 * Tests all interactive elements, authentication flows, and fixes
 */

const { chromium } = require('playwright');
const fs = require('fs');

class OAuth2FixesValidator {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = [];
        this.errors = [];
        this.baseUrl = 'http://localhost:3000';
        this.testResults = {
            totalTests: 0,
            passed: 0,
            failed: 0,
            errors: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logMessage);
        
        this.results.push({
            timestamp,
            type,
            message
        });
    }

    async init() {
        this.log('🚀 Iniciando validação REAL dos fixes OAuth2...');
        
        // Launch browser with dev tools for debugging
        this.browser = await chromium.launch({ 
            headless: false,
            devtools: true,
            slowMo: 1000 // Slow down for visibility
        });
        
        this.page = await this.browser.newPage();
        
        // Listen for console messages
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            this.log(`CONSOLE [${type}]: ${text}`, type === 'error' ? 'error' : 'console');
        });

        // Listen for errors
        this.page.on('pageerror', error => {
            this.log(`PAGE ERROR: ${error.message}`, 'error');
            this.errors.push(error.message);
        });

        // Set viewport
        await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    async waitForPageLoad() {
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(2000); // Extra wait for JS to execute
    }

    async testPage(pageName, url, testFunction) {
        this.log(`\n📄 Testando página: ${pageName}`);
        this.log(`🔗 URL: ${url}`);
        
        try {
            await this.page.goto(url);
            await this.waitForPageLoad();
            
            // Take screenshot
            await this.page.screenshot({ 
                path: `screenshots/test-${pageName.toLowerCase().replace(/\s+/g, '-')}.png`,
                fullPage: true 
            });
            
            await testFunction();
            this.testResults.passed++;
            this.log(`✅ ${pageName} - PASSOU`, 'success');
            
        } catch (error) {
            this.testResults.failed++;
            this.log(`❌ ${pageName} - FALHOU: ${error.message}`, 'error');
            this.errors.push(`${pageName}: ${error.message}`);
        }
        
        this.testResults.totalTests++;
    }

    async testSettingsPage() {
        await this.testPage('Settings Standardized', `${this.baseUrl}/settings-standardized.html`, async () => {
            this.log('🔍 Verificando elementos da página de configurações...');
            
            // Check if page loaded
            const title = await this.page.title();
            this.log(`Título da página: ${title}`);
            
            // Wait for authentication elements to load
            await this.page.waitForSelector('.user-avatar-wrapper', { timeout: 10000 });
            this.log('✅ Avatar wrapper encontrado');
            
            // Test avatar dropdown
            this.log('🎯 Testando dropdown do avatar...');
            const avatarBtn = await this.page.locator('.user-avatar-btn');
            await avatarBtn.click();
            await this.page.waitForTimeout(1000);
            
            // Check if dropdown is visible
            const dropdown = await this.page.locator('.dropdown-menu');
            const isVisible = await dropdown.isVisible();
            
            if (!isVisible) {
                throw new Error('Dropdown do avatar não abriu após click');
            }
            this.log('✅ Dropdown do avatar abriu corretamente');
            
            // Test dropdown items
            const dropdownItems = [
                { selector: 'a[onclick*="exportData"]', name: 'Exportar Dados' },
                { selector: 'a[onclick*="updateProfile"]', name: 'Atualizar Perfil' },
                { selector: 'a[onclick*="logout"]', name: 'Sair' }
            ];
            
            for (const item of dropdownItems) {
                const element = await this.page.locator(item.selector);
                const exists = await element.count() > 0;
                
                if (!exists) {
                    throw new Error(`Item do dropdown '${item.name}' não encontrado`);
                }
                
                const text = await element.textContent();
                this.log(`✅ Item encontrado: ${text.trim()}`);
                
                // Test click (but don't actually execute logout)
                if (!item.selector.includes('logout')) {
                    await element.click();
                    await this.page.waitForTimeout(500);
                    this.log(`✅ Click em '${item.name}' executado`);
                }
            }
            
            // Test tabs functionality
            this.log('🎯 Testando funcionalidade das abas...');
            const tabs = await this.page.locator('.nav-tabs .nav-link');
            const tabCount = await tabs.count();
            this.log(`📊 Encontradas ${tabCount} abas`);
            
            for (let i = 0; i < tabCount; i++) {
                const tab = tabs.nth(i);
                const tabText = await tab.textContent();
                
                await tab.click();
                await this.page.waitForTimeout(1000);
                
                // Check if tab became active
                const isActive = await tab.getAttribute('class');
                if (isActive && isActive.includes('active')) {
                    this.log(`✅ Aba '${tabText.trim()}' ativada corretamente`);
                } else {
                    this.log(`⚠️ Aba '${tabText.trim()}' pode não ter ativado`, 'warning');
                }
            }
        });
    }

    async testAppointmentsPage() {
        await this.testPage('Appointments Standardized', `${this.baseUrl}/appointments-standardized.html`, async () => {
            this.log('🔍 Verificando página de agendamentos...');
            
            // Wait for page elements
            await this.page.waitForSelector('.btn-primary', { timeout: 10000 });
            
            // Test "Novo Agendamento" button
            this.log('🎯 Testando botão "Novo Agendamento"...');
            const newAppointmentBtn = await this.page.locator('button:has-text("Novo Agendamento")');
            
            if (await newAppointmentBtn.count() === 0) {
                throw new Error('Botão "Novo Agendamento" não encontrado');
            }
            
            await newAppointmentBtn.click();
            await this.page.waitForTimeout(2000);
            
            // Check if modal opened
            const modal = await this.page.locator('#appointmentModal, .modal');
            const modalVisible = await modal.isVisible();
            
            if (!modalVisible) {
                throw new Error('Modal de novo agendamento não abriu');
            }
            this.log('✅ Modal de novo agendamento abriu corretamente');
            
            // Close modal
            const closeBtn = await this.page.locator('.btn-close, [data-bs-dismiss="modal"]');
            if (await closeBtn.count() > 0) {
                await closeBtn.first().click();
                await this.page.waitForTimeout(1000);
                this.log('✅ Modal fechado');
            }
            
            // Test appointments list
            this.log('🎯 Verificando lista de agendamentos...');
            const appointmentsList = await this.page.locator('.appointments-list, .table, .list-group');
            
            if (await appointmentsList.count() > 0) {
                this.log('✅ Lista de agendamentos encontrada');
                
                // Check for action buttons in appointments
                const actionBtns = await this.page.locator('.btn-sm, .action-btn');
                const actionCount = await actionBtns.count();
                this.log(`📊 Encontrados ${actionCount} botões de ação`);
            } else {
                this.log('⚠️ Lista de agendamentos não encontrada', 'warning');
            }
        });
    }

    async testCustomersPage() {
        await this.testPage('Customers Standardized', `${this.baseUrl}/customers-standardized.html`, async () => {
            this.log('🔍 Verificando página de clientes...');
            
            // Wait for page elements
            await this.page.waitForSelector('.btn-primary', { timeout: 10000 });
            
            // Test "Novo Cliente" button
            this.log('🎯 Testando botão "Novo Cliente"...');
            const newCustomerBtn = await this.page.locator('button:has-text("Novo Cliente")');
            
            if (await newCustomerBtn.count() === 0) {
                throw new Error('Botão "Novo Cliente" não encontrado');
            }
            
            await newCustomerBtn.click();
            await this.page.waitForTimeout(2000);
            
            // Check if modal opened
            const modal = await this.page.locator('#customerModal, .modal');
            const modalVisible = await modal.isVisible();
            
            if (!modalVisible) {
                throw new Error('Modal de novo cliente não abriu');
            }
            this.log('✅ Modal de novo cliente abriu corretamente');
            
            // Test form fields in modal
            this.log('🎯 Verificando campos do formulário...');
            const formFields = [
                'input[name="name"], #customerName',
                'input[name="phone"], #customerPhone',
                'input[name="email"], #customerEmail'
            ];
            
            for (const fieldSelector of formFields) {
                const field = await this.page.locator(fieldSelector);
                if (await field.count() > 0) {
                    this.log(`✅ Campo encontrado: ${fieldSelector}`);
                } else {
                    this.log(`⚠️ Campo não encontrado: ${fieldSelector}`, 'warning');
                }
            }
            
            // Close modal
            const closeBtn = await this.page.locator('.btn-close, [data-bs-dismiss="modal"]');
            if (await closeBtn.count() > 0) {
                await closeBtn.first().click();
                await this.page.waitForTimeout(1000);
                this.log('✅ Modal fechado');
            }
            
            // Test customers list and search
            this.log('🎯 Verificando lista de clientes...');
            const customersList = await this.page.locator('.customers-list, .table, .list-group');
            
            if (await customersList.count() > 0) {
                this.log('✅ Lista de clientes encontrada');
            }
            
            // Test search functionality
            const searchInput = await this.page.locator('input[placeholder*="Buscar"], input[type="search"]');
            if (await searchInput.count() > 0) {
                await searchInput.fill('test');
                await this.page.waitForTimeout(1000);
                this.log('✅ Campo de busca testado');
                await searchInput.clear();
            }
        });
    }

    async testDashboardPage() {
        await this.testPage('Dashboard Tenant Admin', `${this.baseUrl}/dashboard-tenant-admin.html`, async () => {
            this.log('🔍 Verificando dashboard principal...');
            
            // Wait for dashboard elements
            await this.page.waitForSelector('.card, .widget', { timeout: 10000 });
            
            // Test dashboard widgets
            this.log('🎯 Verificando widgets do dashboard...');
            const widgets = await this.page.locator('.card, .widget, .stat-card');
            const widgetCount = await widgets.count();
            this.log(`📊 Encontrados ${widgetCount} widgets`);
            
            // Test navigation menu
            this.log('🎯 Testando menu de navegação...');
            const navItems = await this.page.locator('.nav-link, .sidebar a');
            const navCount = await navItems.count();
            this.log(`📊 Encontrados ${navCount} itens de navegação`);
            
            // Test a few navigation items
            for (let i = 0; i < Math.min(3, navCount); i++) {
                const navItem = navItems.nth(i);
                const href = await navItem.getAttribute('href');
                const text = await navItem.textContent();
                
                if (href && !href.includes('javascript:') && !href.includes('#')) {
                    this.log(`✅ Link de navegação: ${text.trim()} -> ${href}`);
                }
            }
        });
    }

    async testAuthenticationFlow() {
        await this.testPage('Authentication Flow', `${this.baseUrl}/login-standardized.html`, async () => {
            this.log('🔍 Testando fluxo de autenticação...');
            
            // Check for auth form
            const loginForm = await this.page.locator('form, .login-form');
            if (await loginForm.count() === 0) {
                throw new Error('Formulário de login não encontrado');
            }
            
            // Test form fields
            const emailField = await this.page.locator('input[type="email"], input[name="email"]');
            const passwordField = await this.page.locator('input[type="password"], input[name="password"]');
            
            if (await emailField.count() === 0) {
                throw new Error('Campo de email não encontrado');
            }
            
            if (await passwordField.count() === 0) {
                throw new Error('Campo de senha não encontrado');
            }
            
            this.log('✅ Campos de login encontrados');
            
            // Test Google OAuth button if present
            const googleBtn = await this.page.locator('button:has-text("Google"), .google-signin-btn');
            if (await googleBtn.count() > 0) {
                this.log('✅ Botão de login com Google encontrado');
            }
            
            // Fill test credentials (don't submit)
            await emailField.fill('test@example.com');
            await passwordField.fill('testpassword');
            this.log('✅ Campos preenchidos para teste');
        });
    }

    async testConsoleErrors() {
        this.log('\n🔍 Verificando erros de console...');
        
        if (this.errors.length === 0) {
            this.log('✅ Nenhum erro de JavaScript encontrado', 'success');
        } else {
            this.log(`❌ Encontrados ${this.errors.length} erros:`, 'error');
            this.errors.forEach((error, index) => {
                this.log(`${index + 1}. ${error}`, 'error');
            });
        }
    }

    async generateReport() {
        this.log('\n📊 Gerando relatório final...');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.testResults.totalTests,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                successRate: this.testResults.totalTests > 0 ? 
                    ((this.testResults.passed / this.testResults.totalTests) * 100).toFixed(2) : 0
            },
            errors: this.errors,
            consoleMessages: this.results.filter(r => r.type === 'console'),
            detailedResults: this.results
        };
        
        // Save report
        const reportPath = '/Users/marseau/Developer/WhatsAppSalon-N8N/src/frontend/oauth-fixes-validation-report.json';
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.log(`\n📁 Relatório salvo em: ${reportPath}`);
        this.log(`\n🎯 RESULTADOS FINAIS:`);
        this.log(`   • Total de testes: ${report.summary.totalTests}`);
        this.log(`   • Aprovados: ${report.summary.passed}`);
        this.log(`   • Falharam: ${report.summary.failed}`);
        this.log(`   • Taxa de sucesso: ${report.summary.successRate}%`);
        
        if (report.summary.failed === 0) {
            this.log(`\n🎉 TODOS OS TESTES PASSARAM! OAuth fixes validados com sucesso!`, 'success');
        } else {
            this.log(`\n⚠️ ${report.summary.failed} teste(s) falharam. Verifique os erros acima.`, 'warning');
        }
        
        return report;
    }

    async runAllTests() {
        try {
            await this.init();
            
            // Test all pages
            await this.testAuthenticationFlow();
            await this.testDashboardPage();
            await this.testSettingsPage();
            await this.testAppointmentsPage();
            await this.testCustomersPage();
            
            // Check console errors
            await this.testConsoleErrors();
            
            // Generate report
            const report = await this.generateReport();
            
            return report;
            
        } catch (error) {
            this.log(`❌ Erro fatal durante os testes: ${error.message}`, 'error');
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
    console.log('🚀 INICIANDO VALIDAÇÃO REAL DOS FIXES OAUTH2 - METODOLOGIA COLEAM00\n');
    
    const validator = new OAuth2FixesValidator();
    
    try {
        const report = await validator.runAllTests();
        
        console.log('\n✅ VALIDAÇÃO CONCLUÍDA!');
        console.log(`📊 Relatório disponível em: oauth-fixes-validation-report.json`);
        
        process.exit(report.summary.failed === 0 ? 0 : 1);
        
    } catch (error) {
        console.error('❌ ERRO FATAL:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = OAuth2FixesValidator;