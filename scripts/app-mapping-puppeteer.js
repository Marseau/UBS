const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class AppMapper {
    constructor(config) {
        this.config = {
            baseUrl: config.baseUrl || 'http://localhost:3000',
            loginUrl: config.loginUrl || '/login',
            username: config.username,
            password: config.password,
            outputDir: config.outputDir || './app-mapping-results',
            screenshotDir: config.screenshotDir || './app-mapping-screenshots',
            delay: config.delay || 2000,
            viewport: config.viewport || { width: 1920, height: 1080 },
            ...config
        };
        
        this.browser = null;
        this.page = null;
        this.mapping = {
            timestamp: new Date().toISOString(),
            baseUrl: this.config.baseUrl,
            pages: [],
            navigation: [],
            errors: [],
            summary: {}
        };
    }

    async init() {
        console.log('🚀 Iniciando mapeamento do app...');
        
        // Criar diretórios de output
        await this.createDirectories();
        
        // Iniciar browser
        this.browser = await puppeteer.launch({
            headless: false, // false para debug visual
            defaultViewport: this.config.viewport,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        this.page = await this.browser.newPage();
        
        // Configurar interceptação de requests
        await this.setupRequestInterception();
        
        console.log('✅ Browser iniciado com sucesso');
    }

    async createDirectories() {
        const dirs = [this.config.outputDir, this.config.screenshotDir];
        
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`📁 Diretório criado: ${dir}`);
            } catch (error) {
                console.log(`⚠️ Diretório já existe: ${dir}`);
            }
        }
    }

    async setupRequestInterception() {
        await this.page.setRequestInterception(true);
        
        this.page.on('request', (request) => {
            // Log de requests para mapeamento
            this.mapping.navigation.push({
                type: 'request',
                url: request.url(),
                method: request.method(),
                timestamp: new Date().toISOString()
            });
            
            request.continue();
        });
        
        this.page.on('response', (response) => {
            // Log de responses para análise
            this.mapping.navigation.push({
                type: 'response',
                url: response.url(),
                status: response.status(),
                timestamp: new Date().toISOString()
            });
        });
    }

    async login() {
        console.log('🔐 Fazendo login...');
        
        try {
            await this.page.goto(`${this.config.baseUrl}${this.config.loginUrl}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Aguardar carregamento da página de login
            await this.page.waitForTimeout(this.config.delay);
            
            // Preencher credenciais
            await this.page.type('input[name="email"], input[name="username"], input[type="email"]', this.config.username);
            await this.page.type('input[name="password"], input[type="password"]', this.config.password);
            
            // Clicar no botão de login
            await this.page.click('button[type="submit"], input[type="submit"], .login-btn, #login-btn');
            
            // Aguardar redirecionamento
            await this.page.waitForTimeout(this.config.delay * 2);
            
            // Verificar se login foi bem-sucedido
            const currentUrl = this.page.url();
            if (currentUrl.includes('login') || currentUrl.includes('auth')) {
                throw new Error('Login falhou - ainda na página de login');
            }
            
            console.log('✅ Login realizado com sucesso');
            return true;
            
        } catch (error) {
            console.error('❌ Erro no login:', error.message);
            this.mapping.errors.push({
                type: 'login_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async mapPage(url, pageName) {
        console.log(`📄 Mapeando página: ${pageName} (${url})`);
        
        try {
            // Navegar para a página
            await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            await this.page.waitForTimeout(this.config.delay);
            
            // Extrair informações da página
            const pageInfo = await this.extractPageInfo(url, pageName);
            
            // Tirar screenshot
            const screenshotPath = await this.takeScreenshot(pageName);
            pageInfo.screenshot = screenshotPath;
            
            // Extrair links e navegação
            const links = await this.extractLinks();
            pageInfo.links = links;
            
            // Extrair formulários
            const forms = await this.extractForms();
            pageInfo.forms = forms;
            
            // Extrair elementos interativos
            const interactiveElements = await this.extractInteractiveElements();
            pageInfo.interactiveElements = interactiveElements;
            
            this.mapping.pages.push(pageInfo);
            
            console.log(`✅ Página mapeada: ${pageName}`);
            return pageInfo;
            
        } catch (error) {
            console.error(`❌ Erro ao mapear página ${pageName}:`, error.message);
            this.mapping.errors.push({
                type: 'page_mapping_error',
                page: pageName,
                url: url,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return null;
        }
    }

    async extractPageInfo(url, pageName) {
        const pageInfo = {
            name: pageName,
            url: url,
            title: '',
            description: '',
            elements: {},
            timestamp: new Date().toISOString()
        };
        
        // Extrair título
        pageInfo.title = await this.page.title();
        
        // Extrair meta description
        pageInfo.description = await this.page.$eval('meta[name="description"]', el => el?.content || '');
        
        // Contar elementos
        pageInfo.elements = await this.page.evaluate(() => {
            return {
                buttons: document.querySelectorAll('button').length,
                inputs: document.querySelectorAll('input').length,
                forms: document.querySelectorAll('form').length,
                links: document.querySelectorAll('a').length,
                images: document.querySelectorAll('img').length,
                tables: document.querySelectorAll('table').length,
                divs: document.querySelectorAll('div').length,
                spans: document.querySelectorAll('span').length
            };
        });
        
        return pageInfo;
    }

    async extractLinks() {
        return await this.page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links.map(link => ({
                text: link.textContent?.trim() || '',
                href: link.href,
                target: link.target || '_self',
                className: link.className || '',
                id: link.id || ''
            })).filter(link => 
                link.href && 
                !link.href.startsWith('javascript:') && 
                !link.href.startsWith('mailto:') &&
                !link.href.startsWith('tel:')
            );
        });
    }

    async extractForms() {
        return await this.page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));
            return forms.map(form => ({
                action: form.action || '',
                method: form.method || 'GET',
                id: form.id || '',
                className: form.className || '',
                inputs: Array.from(form.querySelectorAll('input')).map(input => ({
                    type: input.type || 'text',
                    name: input.name || '',
                    id: input.id || '',
                    placeholder: input.placeholder || '',
                    required: input.required || false
                }))
            }));
        });
    }

    async extractInteractiveElements() {
        return await this.page.evaluate(() => {
            const elements = [];
            
            // Botões
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
            buttons.forEach(btn => {
                elements.push({
                    type: 'button',
                    text: btn.textContent?.trim() || btn.value || '',
                    id: btn.id || '',
                    className: btn.className || '',
                    disabled: btn.disabled || false
                });
            });
            
            // Dropdowns/Selects
            const selects = Array.from(document.querySelectorAll('select'));
            selects.forEach(select => {
                elements.push({
                    type: 'select',
                    name: select.name || '',
                    id: select.id || '',
                    options: Array.from(select.options).map(opt => ({
                        value: opt.value,
                        text: opt.textContent?.trim() || ''
                    }))
                });
            });
            
            return elements;
        });
    }

    async takeScreenshot(pageName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${pageName}_${timestamp}.png`;
        const filepath = path.join(this.config.screenshotDir, filename);
        
        await this.page.screenshot({
            path: filepath,
            fullPage: true
        });
        
        console.log(`📸 Screenshot salvo: ${filepath}`);
        return filepath;
    }

    async discoverPages() {
        console.log('🔍 Descobrindo páginas do app...');
        
        const discoveredPages = new Set();
        const pagesToVisit = [`${this.config.baseUrl}/`];
        
        while (pagesToVisit.length > 0) {
            const currentUrl = pagesToVisit.shift();
            
            if (discoveredPages.has(currentUrl)) continue;
            discoveredPages.add(currentUrl);
            
            try {
                await this.page.goto(currentUrl, { waitUntil: 'networkidle2' });
                await this.page.waitForTimeout(this.config.delay);
                
                // Extrair links da página atual
                const links = await this.extractLinks();
                
                // Adicionar novos links à fila (apenas do mesmo domínio)
                for (const link of links) {
                    if (link.href.startsWith(this.config.baseUrl) && 
                        !discoveredPages.has(link.href) &&
                        !pagesToVisit.includes(link.href)) {
                        pagesToVisit.push(link.href);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Erro ao descobrir página ${currentUrl}:`, error.message);
            }
        }
        
        return Array.from(discoveredPages);
    }

    async generateReport() {
        console.log('📊 Gerando relatório...');
        
        // Estatísticas
        this.mapping.summary = {
            totalPages: this.mapping.pages.length,
            totalErrors: this.mapping.errors.length,
            totalScreenshots: this.mapping.pages.filter(p => p.screenshot).length,
            totalLinks: this.mapping.pages.reduce((sum, p) => sum + (p.links?.length || 0), 0),
            totalForms: this.mapping.pages.reduce((sum, p) => sum + (p.forms?.length || 0), 0),
            mappingDuration: new Date().toISOString()
        };
        
        // Salvar relatório JSON
        const reportPath = path.join(this.config.outputDir, 'app-mapping-report.json');
        await fs.writeFile(reportPath, JSON.stringify(this.mapping, null, 2));
        
        // Gerar relatório HTML
        await this.generateHTMLReport();
        
        console.log(`✅ Relatório salvo: ${reportPath}`);
    }

    async generateHTMLReport() {
        const htmlReport = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Mapeamento do App</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .summary-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .page-item { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 8px; }
        .screenshot { max-width: 100%; height: auto; border: 1px solid #ddd; }
        .error { background: #ffe6e6; color: #d63031; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .success { background: #e6ffe6; color: #00b894; padding: 10px; border-radius: 4px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Relatório de Mapeamento do App</h1>
        <p><strong>URL Base:</strong> ${this.config.baseUrl}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
    </div>
    
    <div class="summary">
        <div class="summary-card">
            <h3>📄 Páginas</h3>
            <p><strong>${this.mapping.summary.totalPages}</strong> páginas mapeadas</p>
        </div>
        <div class="summary-card">
            <h3>📸 Screenshots</h3>
            <p><strong>${this.mapping.summary.totalScreenshots}</strong> screenshots gerados</p>
        </div>
        <div class="summary-card">
            <h3>🔗 Links</h3>
            <p><strong>${this.mapping.summary.totalLinks}</strong> links encontrados</p>
        </div>
        <div class="summary-card">
            <h3>📝 Formulários</h3>
            <p><strong>${this.mapping.summary.totalForms}</strong> formulários mapeados</p>
        </div>
        <div class="summary-card">
            <h3>❌ Erros</h3>
            <p><strong>${this.mapping.summary.totalErrors}</strong> erros encontrados</p>
        </div>
    </div>
    
    <h2>📄 Páginas Mapeadas</h2>
    ${this.mapping.pages.map(page => `
        <div class="page-item">
            <h3>${page.name}</h3>
            <p><strong>URL:</strong> <a href="${page.url}" target="_blank">${page.url}</a></p>
            <p><strong>Título:</strong> ${page.title}</p>
            <p><strong>Elementos:</strong> ${page.elements.buttons} botões, ${page.elements.inputs} inputs, ${page.elements.links} links</p>
            ${page.screenshot ? `<img src="../app-mapping-screenshots/${path.basename(page.screenshot)}" class="screenshot" alt="Screenshot de ${page.name}">` : ''}
        </div>
    `).join('')}
    
    ${this.mapping.errors.length > 0 ? `
        <h2>❌ Erros Encontrados</h2>
        ${this.mapping.errors.map(error => `
            <div class="error">
                <strong>${error.type}:</strong> ${error.message}
                <br><small>${error.timestamp}</small>
            </div>
        `).join('')}
    ` : ''}
</body>
</html>`;
        
        const htmlPath = path.join(this.config.outputDir, 'app-mapping-report.html');
        await fs.writeFile(htmlPath, htmlReport);
        console.log(`✅ Relatório HTML salvo: ${htmlPath}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser fechado');
        }
    }

    async run() {
        try {
            await this.init();
            
            // Fazer login
            const loginSuccess = await this.login();
            if (!loginSuccess) {
                throw new Error('Falha no login - abortando mapeamento');
            }
            
            // Descobrir páginas automaticamente
            const discoveredPages = await this.discoverPages();
            console.log(`🔍 ${discoveredPages.length} páginas descobertas`);
            
            // Mapear cada página
            for (let i = 0; i < discoveredPages.length; i++) {
                const url = discoveredPages[i];
                const pageName = `page_${i + 1}_${url.split('/').pop() || 'home'}`;
                
                await this.mapPage(url, pageName);
                
                // Progresso
                console.log(`📈 Progresso: ${i + 1}/${discoveredPages.length}`);
            }
            
            // Gerar relatório
            await this.generateReport();
            
            console.log('🎉 Mapeamento concluído com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro durante mapeamento:', error);
            this.mapping.errors.push({
                type: 'mapping_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        } finally {
            await this.close();
        }
    }
}

// Configuração e execução
const config = {
    baseUrl: 'http://localhost:3000', // Ajuste para a URL do seu app
    loginUrl: '/login', // Ajuste para a rota de login
    username: 'seu_email@exemplo.com', // Substitua pelas suas credenciais
    password: 'sua_senha',
    outputDir: './app-mapping-results',
    screenshotDir: './app-mapping-screenshots',
    delay: 2000,
    viewport: { width: 1920, height: 1080 }
};

// Executar mapeamento
async function runMapping() {
    const mapper = new AppMapper(config);
    await mapper.run();
}

// Executar se chamado diretamente
if (require.main === module) {
    runMapping().catch(console.error);
}

module.exports = AppMapper; 