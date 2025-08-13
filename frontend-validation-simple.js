const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class SimpleFrontendValidator {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.results = {
            pages: [],
            errors: [],
            performance: [],
            accessibility: []
        };
    }

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const startTime = Date.now();
            
            const req = client.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;
                    
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data,
                        responseTime: responseTime,
                        contentLength: data.length
                    });
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async validatePage(url, pageName) {
        console.log(`\n📄 Validando: ${pageName}`);
        
        try {
            const response = await this.makeRequest(url);
            
            // Verificar status code
            if (response.statusCode !== 200) {
                throw new Error(`Status code: ${response.statusCode}`);
            }
            
            // Análise básica do HTML
            const htmlAnalysis = this.analyzeHTML(response.body, pageName);
            
            // Performance
            this.results.performance.push({
                page: pageName,
                url: url,
                responseTime: response.responseTime,
                contentLength: response.contentLength,
                statusCode: response.statusCode
            });
            
            // Acessibilidade básica
            if (htmlAnalysis.accessibilityIssues.length > 0) {
                this.results.accessibility.push({
                    page: pageName,
                    url: url,
                    issues: htmlAnalysis.accessibilityIssues
                });
            }
            
            this.results.pages.push({
                name: pageName,
                url: url,
                status: 'success',
                title: htmlAnalysis.title,
                accessibilityScore: htmlAnalysis.accessibilityScore,
                responseTime: response.responseTime
            });
            
            console.log(`✅ ${pageName} - ${htmlAnalysis.title} (${response.responseTime}ms)`);
            
        } catch (error) {
            console.error(`❌ Erro em ${pageName}:`, error.message);
            this.results.errors.push({
                page: pageName,
                url: url,
                error: error.message
            });
        }
    }

    analyzeHTML(html, pageName) {
        const analysis = {
            title: 'Sem título',
            accessibilityIssues: [],
            accessibilityScore: 100
        };
        
        try {
            // Extrair título
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                analysis.title = titleMatch[1].trim();
            } else {
                analysis.accessibilityIssues.push('Página sem tag <title>');
                analysis.accessibilityScore -= 10;
            }
            
            // Verificar imagens sem alt
            const imgMatches = html.match(/<img[^>]*>/gi) || [];
            const imagesWithoutAlt = imgMatches.filter(img => 
                !img.includes('alt=') && !img.includes('aria-label=')
            );
            
            if (imagesWithoutAlt.length > 0) {
                analysis.accessibilityIssues.push(`${imagesWithoutAlt.length} imagens sem alt ou aria-label`);
                analysis.accessibilityScore -= imagesWithoutAlt.length * 5;
            }
            
            // Verificar estrutura de headings
            const headings = html.match(/<h[1-6][^>]*>[^<]+<\/h[1-6]>/gi) || [];
            if (headings.length === 0) {
                analysis.accessibilityIssues.push('Página sem headings (h1-h6)');
                analysis.accessibilityScore -= 15;
            }
            
            // Verificar forms sem labels
            const formMatches = html.match(/<form[^>]*>.*?<\/form>/gis) || [];
            const inputMatches = html.match(/<input[^>]*>/gi) || [];
            const inputsWithoutLabel = inputMatches.filter(input => 
                !input.includes('aria-label=') && !input.includes('placeholder=')
            );
            
            if (inputsWithoutLabel.length > 0) {
                analysis.accessibilityIssues.push(`${inputsWithoutLabel.length} inputs sem aria-label ou placeholder`);
                analysis.accessibilityScore -= inputsWithoutLabel.length * 3;
            }
            
            // Verificar meta viewport
            if (!html.includes('viewport')) {
                analysis.accessibilityIssues.push('Meta viewport não encontrada (responsividade)');
                analysis.accessibilityScore -= 10;
            }
            
            // Verificar charset
            if (!html.includes('charset') && !html.includes('Content-Type')) {
                analysis.accessibilityIssues.push('Charset não especificado');
                analysis.accessibilityScore -= 5;
            }
            
            analysis.accessibilityScore = Math.max(0, analysis.accessibilityScore);
            
        } catch (error) {
            analysis.accessibilityIssues.push('Erro ao analisar HTML');
        }
        
        return analysis;
    }

    async runValidation() {
        console.log('🚀 Iniciando validação simples do frontend...');
        console.log(`📡 Conectando em: ${this.baseUrl}`);
        
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
            await new Promise(resolve => setTimeout(resolve, 500)); // Pausa entre requests
        }
        
        await this.generateReport();
    }

    async generateReport() {
        console.log('\n📊 GERANDO RELATÓRIO...\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalPages: this.results.pages.length,
                successfulPages: this.results.pages.filter(p => p.status === 'success').length,
                errors: this.results.errors.length,
                averageResponseTime: this.calculateAverageResponseTime(),
                averageAccessibilityScore: this.calculateAverageAccessibilityScore()
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
        
        this.printSummary(report);
    }

    calculateAverageResponseTime() {
        const times = this.results.performance.map(p => p.responseTime);
        return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    }

    calculateAverageAccessibilityScore() {
        const scores = this.results.pages.map(p => p.accessibilityScore || 0);
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
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
        .page { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 5px 0; border-radius: 4px; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; }
        .issue { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .score { font-weight: bold; }
        .score.good { color: #28a745; }
        .score.warning { color: #ffc107; }
        .score.bad { color: #dc3545; }
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
                <h3>Tempo Médio de Resposta</h3>
                <div class="number">${report.summary.averageResponseTime}ms</div>
            </div>
            <div class="card">
                <h3>Score de Acessibilidade</h3>
                <div class="number">${report.summary.averageAccessibilityScore}/100</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📄 Páginas Validadas</h2>
            ${report.details.pages.map(page => `
                <div class="page">
                    <strong>${page.name}</strong><br>
                    URL: ${page.url}<br>
                    Título: ${page.title}<br>
                    Tempo de Resposta: ${page.responseTime}ms<br>
                    Score de Acessibilidade: <span class="score ${page.accessibilityScore >= 80 ? 'good' : page.accessibilityScore >= 60 ? 'warning' : 'bad'}">${page.accessibilityScore}/100</span>
                </div>
            `).join('')}
        </div>
        
        ${report.details.accessibility.length > 0 ? `
        <div class="section">
            <h2>♿ Problemas de Acessibilidade</h2>
            ${report.details.accessibility.map(acc => `
                <div class="issue">
                    <strong>${acc.page}</strong><br>
                    ${acc.issues.map(issue => `• ${issue}`).join('<br>')}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
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
        console.log(`⚡ Tempo médio de resposta: ${report.summary.averageResponseTime}ms`);
        console.log(`♿ Score médio de acessibilidade: ${report.summary.averageAccessibilityScore}/100`);
        console.log(`❌ Erros: ${report.summary.errors}`);
        
        if (report.summary.errors > 0) {
            console.log('\n❌ ERROS ENCONTRADOS:');
            report.details.errors.forEach(error => {
                console.log(`  • ${error.page}: ${error.error}`);
            });
        }
        
        if (report.details.accessibility.length > 0) {
            console.log('\n♿ PROBLEMAS DE ACESSIBILIDADE:');
            report.details.accessibility.forEach(acc => {
                console.log(`  • ${acc.page}: ${acc.issues.length} problemas`);
            });
        }
        
        console.log('\n✅ Validação concluída!');
    }
}

// Executar validação
async function main() {
    const validator = new SimpleFrontendValidator();
    await validator.runValidation();
}

main().catch(console.error); 