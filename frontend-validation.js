const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class FrontendValidator {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.results = {
            pages: [],
            errors: [],
            screenshots: []
        };
        this.browser = null;
        this.page = null;
    }

    async init() {
        console.log('🚀 Iniciando validação do frontend...');
        
        // Tentar diferentes configurações
        const launchConfigs = [
            {
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            {
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            {
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            },
            {
                headless: false,
                executablePath: '/usr/bin/google-chrome',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        ];

        for (let i = 0; i < launchConfigs.length; i++) {
            try {
                console.log(`🔄 Tentativa ${i + 1}/${launchConfigs.length} de iniciar browser...`);
                
                this.browser = await puppeteer.launch(launchConfigs[i]);
                this.page = await this.browser.newPage();
                await this.page.setViewport({ width: 1920, height: 1080 });
                
                console.log('✅ Browser iniciado com sucesso');
                return true;
                
            } catch (error) {
                console.warn(`⚠️ Tentativa ${i + 1} falhou:`, error.message);
                
                if (this.browser) {
                    try {
                        await this.browser.close();
                    } catch (closeError) {
                        // Ignorar erros de fechamento
                    }
                }
                
                if (i === launchConfigs.length - 1) {
                    console.error('❌ Todas as tentativas falharam');
                    return false;
                }
                
                // Aguardar antes da próxima tentativa
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        return false;
    }

    async validatePage(url, pageName) {
        console.log(`\n📄 Validando: ${pageName}`);
        
        try {
            await this.page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
            });
            
            // Screenshot
            const screenshotPath = `./validation-screenshots/${pageName}.png`;
            await this.page.screenshot({ path: screenshotPath });
            this.results.screenshots.push(screenshotPath);
            
            // Verificar se página carregou
            const title = await this.page.title();
            const urlActual = this.page.url();
            
            this.results.pages.push({
                name: pageName,
                url: url,
                actualUrl: urlActual,
                title: title,
                status: 'success'
            });
            
            console.log(`✅ ${pageName} - ${title}`);
            
        } catch (error) {
            console.error(`❌ Erro em ${pageName}:`, error.message);
            this.results.errors.push({
                page: pageName,
                url: url,
                error: error.message
            });
        }
    }

    async runValidation() {
        if (!await this.init()) {
            console.log('❌ Não foi possível iniciar o browser. Verifique se o Chrome está instalado.');
            return;
        }
        
        try {
            // Criar diretório para screenshots
            await fs.mkdir('./validation-screenshots', { recursive: true });
            
            // Páginas para validar
            const pages = [
                { url: `${this.baseUrl}/`, name: 'Home' },
                { url: `${this.baseUrl}/login.html`, name: 'Login' },
                { url: `${this.baseUrl}/register.html`, name: 'Register' },
                { url: `${this.baseUrl}/dashboard.html`, name: 'Dashboard' },
                { url: `${this.baseUrl}/appointments.html`, name: 'Appointments' },
                { url: `${this.baseUrl}/customers.html`, name: 'Customers' },
                { url: `${this.baseUrl}/services.html`, name: 'Services' },
                { url: `${this.baseUrl}/analytics.html`, name: 'Analytics' },
                { url: `${this.baseUrl}/settings.html`, name: 'Settings' },
                { url: `${this.baseUrl}/billing.html`, name: 'Billing' }
            ];
            
            for (const page of pages) {
                await this.validatePage(page.url, page.name);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await this.generateReport();
            
        } catch (error) {
            console.error('❌ Erro durante validação:', error);
        } finally {
            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (closeError) {
                    console.warn('⚠️ Erro ao fechar browser:', closeError.message);
                }
            }
        }
    }

    async generateReport() {
        console.log('\n📊 GERANDO RELATÓRIO...\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalPages: this.results.pages.length,
                successfulPages: this.results.pages.filter(p => p.status === 'success').length,
                errors: this.results.errors.length,
                screenshots: this.results.screenshots.length
            },
            details: this.results
        };
        
        // Salvar relatório JSON
        await fs.writeFile('./frontend-validation-report.json', JSON.stringify(report, null, 2));
        
        // Gerar relatório HTML
        const htmlReport = this.generateHTMLReport(report);
        await fs.writeFile('./frontend-validation-report.html', htmlReport);
        
        console.log(' Relatórios gerados:');
        console.log('  - frontend-validation-report.json');
        console.log('  - frontend-validation-report.html');
        console.log('  - Screenshots em: ./validation-screenshots/');
        
        this.printSummary(report);
    }

    generateHTMLReport(report) {
        return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Validação Frontend - UBS</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .card h3 { margin: 0 0 10px 0; color: #333; }
        .card .number { font-size: 2em; font-weight: bold; color: #007bff; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .page { background: #d4edda; border: 1px solid #c3e6cb; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Relatório de Validação Frontend - UBS</h1>
            <p>Gerado em: ${new Date(report.timestamp).toLocaleString('pt-BR')}</p>
        </div>
        
        <div class="summary">
            <div class="card">
                <h3>Páginas Validadas</h3>
                <div class="number">${report.summary.totalPages}</div>
            </div>
            <div class="card">
                <h3>Páginas com Sucesso</h3>
                <div class="number">${report.summary.successfulPages}</div>
            </div>
            <div class="card">
                <h3>Erros</h3>
                <div class="number">${report.summary.errors}</div>
            </div>
            <div class="card">
                <h3>Screenshots</h3>
                <div class="number">${report.summary.screenshots}</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📄 Páginas Validadas</h2>
            ${report.details.pages.map(page => `
                <div class="page">
                    <strong>${page.name}</strong><br>
                    URL: ${page.url}<br>
                    Título: ${page.title}<br>
                    Status: ${page.status}
                </div>
            `).join('')}
        </div>
        
        ${report.details.errors.length > 0 ? `
        <div class="section">
            <h2>❌ Erros Encontrados</h2>
            ${report.details.errors.map(error => `
                <div class="error">
                    <strong>${error.page}</strong><br>
                    URL: ${error.url}<br>
                    Erro: ${error.error}
                </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
</body>
</html>`;
    }

    printSummary(report) {
        console.log('\n📋 RESUMO DA VALIDAÇÃO:');
        console.log('='.repeat(50));
        console.log(` Páginas validadas: ${report.summary.totalPages}`);
        console.log(`✅ Páginas com sucesso: ${report.summary.successfulPages}`);
        console.log(`❌ Erros: ${report.summary.errors}`);
        console.log(`📸 Screenshots: ${report.summary.screenshots}`);
        
        if (report.summary.errors > 0) {
            console.log('\n❌ ERROS ENCONTRADOS:');
            report.details.errors.forEach(error => {
                console.log(`  • ${error.page}: ${error.error}`);
            });
        }
        
        console.log('\n✅ Validação concluída!');
    }
}

// Executar validação
async function main() {
    const validator = new FrontendValidator();
    await validator.runValidation();
}

main().catch(console.error);