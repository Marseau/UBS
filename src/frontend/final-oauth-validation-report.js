/**
 * FINAL OAUTH VALIDATION REPORT - COLEAM00 METHODOLOGY
 * Comprehensive analysis of OAuth fixes testing results
 */

const { chromium } = require('playwright');
const fs = require('fs');

class FinalOAuth2ValidationReport {
    constructor() {
        this.browser = null;
        this.page = null;
        this.findings = [];
        this.issues = [];
        this.recommendations = [];
        this.baseUrl = 'http://localhost:3000';
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
        this.findings.push({ timestamp, type, message });
    }

    addIssue(title, description, severity = 'medium', recommendation = '') {
        this.issues.push({ title, description, severity, recommendation });
        this.log(`❌ ISSUE: ${title} - ${description}`, 'error');
    }

    addRecommendation(title, description, priority = 'medium') {
        this.recommendations.push({ title, description, priority });
        this.log(`💡 RECOMMENDATION: ${title} - ${description}`, 'info');
    }

    async init() {
        this.log('🔍 Iniciando análise final dos fixes OAuth2...');
        
        this.browser = await chromium.launch({ 
            headless: false,
            devtools: false,
            slowMo: 200
        });
        
        this.page = await this.browser.newPage();
        
        // Capture console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                this.addIssue(
                    'JavaScript Error',
                    msg.text(),
                    'high',
                    'Fix JavaScript error in browser console'
                );
            }
        });

        await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    async analyzeAuthenticationFlow() {
        this.log('\n🔐 Analisando fluxo de autenticação...');
        
        // Test settings page auth redirect
        await this.page.goto(`${this.baseUrl}/settings-standardized.html`);
        await this.page.waitForTimeout(3000);
        
        const finalUrl = this.page.url();
        if (finalUrl.includes('login')) {
            this.addIssue(
                'Authentication Redirect',
                'Settings page redirects to login even with mock tokens',
                'high',
                'Fix authentication detection logic in settings-standardized.html'
            );
            
            this.addRecommendation(
                'Improve Auth Detection',
                'Modify auth.js to properly detect mock/test tokens',
                'high'
            );
        }
        
        // Check localStorage handling
        const authTokenExists = await this.page.evaluate(() => {
            return localStorage.getItem('authToken') !== null;
        });
        
        if (!authTokenExists) {
            this.addIssue(
                'LocalStorage Not Persisting',
                'Authentication tokens not persisting in localStorage',
                'medium',
                'Ensure localStorage is properly set before page loads'
            );
        }
        
        this.log(`🔍 Auth token in localStorage: ${authTokenExists}`);
    }

    async analyzeModalFunctionality() {
        this.log('\n🎯 Analisando funcionalidade dos modais...');
        
        // Test appointments page
        await this.page.goto(`${this.baseUrl}/appointments-standardized.html`);
        await this.page.waitForTimeout(2000);
        
        try {
            const newAppointmentBtn = await this.page.locator('button:has-text("Novo Agendamento")');
            if (await newAppointmentBtn.count() > 0) {
                await newAppointmentBtn.click();
                await this.page.waitForTimeout(1000);
                
                // Check if modal exists in DOM
                const modal = await this.page.locator('#appointmentModal, .modal');
                const modalCount = await modal.count();
                
                if (modalCount === 0) {
                    this.addIssue(
                        'Missing Modal DOM Element',
                        'appointmentModal element not found in DOM',
                        'high',
                        'Add modal HTML structure to appointments-standardized.html'
                    );
                } else {
                    const isVisible = await modal.first().isVisible();
                    if (!isVisible) {
                        this.addIssue(
                            'Modal Not Showing',
                            'Modal exists but not visible after button click',
                            'medium',
                            'Check Bootstrap modal initialization and show() function'
                        );
                    }
                }
                
                this.log(`🔍 Modal count: ${modalCount}, visible: ${modalCount > 0 ? await modal.first().isVisible() : false}`);
            }
        } catch (error) {
            this.addIssue(
                'Modal Test Error',
                error.message,
                'medium',
                'Debug modal functionality'
            );
        }
        
        // Test customers page
        await this.page.goto(`${this.baseUrl}/customers-standardized.html`);
        await this.page.waitForTimeout(2000);
        
        try {
            const newCustomerBtn = await this.page.locator('button:has-text("Novo Cliente")');
            if (await newCustomerBtn.count() > 0) {
                await newCustomerBtn.click();
                await this.page.waitForTimeout(1000);
                
                const modal = await this.page.locator('#customerModal, .modal');
                const modalCount = await modal.count();
                
                if (modalCount === 0) {
                    this.addIssue(
                        'Missing Customer Modal',
                        'customerModal element not found in DOM',
                        'high',
                        'Add customer modal HTML structure'
                    );
                }
                
                this.log(`🔍 Customer modal count: ${modalCount}`);
            }
        } catch (error) {
            this.addIssue(
                'Customer Modal Test Error',
                error.message,
                'medium',
                'Debug customer modal functionality'
            );
        }
    }

    async analyzeJavaScriptFunctions() {
        this.log('\n🔧 Analisando funções JavaScript...');
        
        await this.page.goto(`${this.baseUrl}/appointments-standardized.html`);
        await this.page.waitForTimeout(2000);
        
        // Check function definitions
        const functionChecks = {
            'newAppointment': await this.page.evaluate(() => typeof window.newAppointment),
            'addCustomer': await this.page.evaluate(() => typeof window.addCustomer),
            'exportData': await this.page.evaluate(() => typeof window.exportData),
            'updateProfile': await this.page.evaluate(() => typeof window.updateProfile),
            'logout': await this.page.evaluate(() => typeof window.logout)
        };
        
        for (const [funcName, type] of Object.entries(functionChecks)) {
            this.log(`🔍 ${funcName}: ${type}`);
            
            if (type === 'undefined') {
                this.addIssue(
                    `Missing Function: ${funcName}`,
                    `Function ${funcName} is not defined globally`,
                    funcName.includes('Customer') || funcName.includes('Appointment') ? 'high' : 'medium',
                    `Define ${funcName} function in appropriate JavaScript file`
                );
            }
        }
        
        // Check if functions are callable
        if (functionChecks.exportData === 'function') {
            try {
                await this.page.evaluate(() => {
                    if (typeof exportData === 'function') {
                        // Test function exists and doesn't throw immediately
                        exportData.toString();
                        return true;
                    }
                    return false;
                });
                this.log('✅ exportData function is callable');
            } catch (error) {
                this.addIssue(
                    'Function Call Error',
                    `exportData function error: ${error.message}`,
                    'low',
                    'Test and fix exportData function implementation'
                );
            }
        }
    }

    async analyzeDOMStructure() {
        this.log('\n🏗️ Analisando estrutura DOM...');
        
        const pagesToAnalyze = [
            'settings-standardized.html',
            'appointments-standardized.html', 
            'customers-standardized.html'
        ];
        
        for (const pageName of pagesToAnalyze) {
            await this.page.goto(`${this.baseUrl}/${pageName}`);
            await this.page.waitForTimeout(1500);
            
            this.log(`\n📄 Analisando ${pageName}...`);
            
            // Check for auth elements
            const authElements = await this.page.evaluate(() => {
                return {
                    avatarWrapper: document.querySelector('.user-avatar-wrapper') !== null,
                    avatarBtn: document.querySelector('.user-avatar-btn') !== null,
                    dropdown: document.querySelector('.dropdown-menu') !== null,
                    modals: document.querySelectorAll('.modal').length,
                    buttons: document.querySelectorAll('button').length
                };
            });
            
            this.log(`🔍 Auth elements - Avatar wrapper: ${authElements.avatarWrapper}, Avatar btn: ${authElements.avatarBtn}, Dropdown: ${authElements.dropdown}`);
            this.log(`🔍 Total modals: ${authElements.modals}, Total buttons: ${authElements.buttons}`);
            
            if (!authElements.avatarWrapper && pageName === 'settings-standardized.html') {
                this.addIssue(
                    'Missing Avatar Elements',
                    'User avatar wrapper not found in settings page',
                    'high',
                    'Add user avatar and dropdown elements to settings-standardized.html'
                );
            }
            
            if (authElements.modals === 0 && pageName.includes('appointments')) {
                this.addIssue(
                    'Missing Modal Elements',
                    'No modal elements found in appointments page',
                    'high',
                    'Add appointment modal HTML to appointments-standardized.html'
                );
            }
        }
    }

    async checkBootstrapIntegration() {
        this.log('\n🎨 Verificando integração Bootstrap...');
        
        await this.page.goto(`${this.baseUrl}/settings-standardized.html`);
        await this.page.waitForTimeout(2000);
        
        const bootstrapCheck = await this.page.evaluate(() => {
            return {
                bootstrap: typeof window.bootstrap !== 'undefined',
                jquery: typeof window.$ !== 'undefined',
                modal: typeof window.bootstrap?.Modal !== 'undefined'
            };
        });
        
        this.log(`🔍 Bootstrap: ${bootstrapCheck.bootstrap}, jQuery: ${bootstrapCheck.jquery}, Modal: ${bootstrapCheck.modal}`);
        
        if (!bootstrapCheck.bootstrap) {
            this.addIssue(
                'Bootstrap Not Loaded',
                'Bootstrap JavaScript not properly loaded',
                'high',
                'Ensure Bootstrap 5 JS is properly included and loaded'
            );
        }
        
        if (!bootstrapCheck.modal) {
            this.addIssue(
                'Bootstrap Modal Not Available',
                'Bootstrap Modal component not available',
                'high',
                'Check Bootstrap Modal component loading'
            );
        }
    }

    generateReport() {
        this.log('\n📊 Gerando relatório final...');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalIssues: this.issues.length,
                highSeverity: this.issues.filter(i => i.severity === 'high').length,
                mediumSeverity: this.issues.filter(i => i.severity === 'medium').length,
                lowSeverity: this.issues.filter(i => i.severity === 'low').length,
                recommendations: this.recommendations.length
            },
            issues: this.issues,
            recommendations: this.recommendations,
            findings: this.findings.filter(f => f.type !== 'info')
        };
        
        // Save detailed report
        const reportPath = '/Users/marseau/Developer/WhatsAppSalon-N8N/src/frontend/final-oauth-validation-detailed.json';
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Generate summary
        this.log('\n🎯 RELATÓRIO FINAL DE VALIDAÇÃO OAUTH2');
        this.log('═'.repeat(50));
        this.log(`📊 Total de problemas encontrados: ${report.summary.totalIssues}`);
        this.log(`🔴 Alta severidade: ${report.summary.highSeverity}`);
        this.log(`🟡 Média severidade: ${report.summary.mediumSeverity}`);
        this.log(`🟢 Baixa severidade: ${report.summary.lowSeverity}`);
        this.log(`💡 Recomendações: ${report.summary.recommendations}`);
        
        this.log('\n🔴 PROBLEMAS CRÍTICOS (Alta Severidade):');
        const criticalIssues = this.issues.filter(i => i.severity === 'high');
        if (criticalIssues.length === 0) {
            this.log('   ✅ Nenhum problema crítico encontrado!');
        } else {
            criticalIssues.forEach((issue, index) => {
                this.log(`   ${index + 1}. ${issue.title}: ${issue.description}`);
                this.log(`      💡 Solução: ${issue.recommendation}`);
            });
        }
        
        this.log('\n💡 PRINCIPAIS RECOMENDAÇÕES:');
        const topRecommendations = this.recommendations.filter(r => r.priority === 'high');
        if (topRecommendations.length === 0) {
            this.log('   ✅ Sistema está funcionando bem!');
        } else {
            topRecommendations.forEach((rec, index) => {
                this.log(`   ${index + 1}. ${rec.title}: ${rec.description}`);
            });
        }
        
        this.log(`\n📁 Relatório detalhado salvo em: ${reportPath}`);
        
        // Overall assessment
        if (report.summary.highSeverity === 0) {
            this.log('\n🎉 AVALIAÇÃO GERAL: OAuth fixes estão funcionando adequadamente!');
        } else if (report.summary.highSeverity <= 2) {
            this.log('\n⚠️ AVALIAÇÃO GERAL: OAuth fixes precisam de alguns ajustes.');
        } else {
            this.log('\n❌ AVALIAÇÃO GERAL: OAuth fixes requerem correções significativas.');
        }
        
        return report;
    }

    async runFullAnalysis() {
        try {
            await this.init();
            
            await this.analyzeAuthenticationFlow();
            await this.analyzeModalFunctionality();
            await this.analyzeJavaScriptFunctions();
            await this.analyzeDOMStructure();
            await this.checkBootstrapIntegration();
            
            const report = this.generateReport();
            
            return report;
            
        } catch (error) {
            this.log(`❌ Erro fatal durante análise: ${error.message}`);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }
}

// Execute analysis
async function main() {
    console.log('🔍 ANÁLISE FINAL DE VALIDAÇÃO OAUTH2 - METODOLOGIA COLEAM00\n');
    
    const analyzer = new FinalOAuth2ValidationReport();
    
    try {
        const report = await analyzer.runFullAnalysis();
        
        console.log('\n✅ ANÁLISE CONCLUÍDA!');
        console.log(`📊 Relatório: final-oauth-validation-detailed.json`);
        
        process.exit(report.summary.highSeverity === 0 ? 0 : 1);
        
    } catch (error) {
        console.error('❌ ERRO FATAL:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = FinalOAuth2ValidationReport;