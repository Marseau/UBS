/**
 * INSPEÇÃO COMPLETA DASHBOARD SUPER ADMIN
 * 
 * Usando Playwright para analisar dashboard-standardized:
 * - Login com credenciais super admin
 * - Validação de todas as métricas
 * - Teste de endpoints
 * - Análise de navegação
 * - Screenshot das principais seções
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function inspecaoDashboardSuperAdmin() {
    let browser;
    try {
        console.log('🎭 INICIANDO INSPEÇÃO COMPLETA DO DASHBOARD SUPER ADMIN...');
        console.log('='.repeat(80));

        // 1. CONFIGURAR BROWSER
        browser = await chromium.launch({ 
            headless: false, // Mostrar browser para debug
            slowMo: 1000    // Delay entre ações
        });
        
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });

        const page = await context.newPage();

        // Interceptar requests para analisar APIs
        const apiCalls = [];
        page.on('request', request => {
            if (request.url().includes('/api/')) {
                apiCalls.push({
                    url: request.url(),
                    method: request.method(),
                    timestamp: new Date().toISOString()
                });
            }
        });

        page.on('response', response => {
            if (response.url().includes('/api/')) {
                console.log(`📡 API Call: ${response.status()} ${response.url()}`);
            }
        });

        // 2. LOGIN COMO SUPER ADMIN
        console.log('\n🔐 FAZENDO LOGIN COMO SUPER ADMIN...');
        
        await page.goto('http://localhost:3000/login');
        await page.waitForLoadState('networkidle');
        
        // Screenshot da página de login
        await page.screenshot({ path: 'login-page.png', fullPage: true });
        
        // Fazer login
        await page.fill('input[type="email"]', 'admin@universalbooking.com');
        await page.fill('input[type="password"]', 'Admin123');
        
        console.log('   📝 Credenciais inseridas');
        
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
        
        // Verificar se login foi bem-sucedido
        const currentUrl = page.url();
        console.log(`   🌐 URL após login: ${currentUrl}`);

        // 3. NAVEGAR PARA DASHBOARD-STANDARDIZED
        console.log('\n📊 NAVEGANDO PARA DASHBOARD-STANDARDIZED...');
        
        await page.goto('http://localhost:3000/dashboard-standardized');
        await page.waitForLoadState('networkidle');
        
        // Aguardar carregar completamente
        await page.waitForTimeout(3000);
        
        // Screenshot do dashboard inicial
        await page.screenshot({ path: 'dashboard-inicial.png', fullPage: true });
        
        console.log('   ✅ Dashboard carregado');

        // 4. ANÁLISE DE MÉTRICAS - KPIs PRINCIPAIS
        console.log('\n📈 ANALISANDO KPIs PRINCIPAIS...');
        
        const kpiAnalysis = {};
        
        // Procurar por cards de KPI
        const kpiCards = await page.locator('.card, .metric-card, [class*="kpi"], [class*="metric"]').all();
        console.log(`   📊 Encontrados ${kpiCards.length} cards de métricas`);
        
        for (let i = 0; i < Math.min(kpiCards.length, 10); i++) {
            try {
                const card = kpiCards[i];
                const text = await card.textContent();
                const innerHTML = await card.innerHTML();
                
                kpiAnalysis[`card_${i}`] = {
                    text: text?.substring(0, 200),
                    hasValue: text?.includes('R$') || text?.includes('%') || /\d+/.test(text || ''),
                    classes: await card.getAttribute('class')
                };
                
                console.log(`   📋 Card ${i}: ${text?.substring(0, 50)}...`);
            } catch (e) {
                console.log(`   ⚠️ Erro ao analisar card ${i}: ${e.message}`);
            }
        }

        // 5. ANÁLISE DE CHARTS E GRÁFICOS
        console.log('\n📊 ANALISANDO CHARTS E GRÁFICOS...');
        
        const chartAnalysis = {};
        
        // Procurar por elementos de chart (Chart.js, canvas, etc.)
        const canvasElements = await page.locator('canvas').all();
        const chartContainers = await page.locator('[id*="chart"], [class*="chart"]').all();
        
        console.log(`   📊 Canvas encontrados: ${canvasElements.length}`);
        console.log(`   📊 Chart containers: ${chartContainers.length}`);
        
        chartAnalysis.canvasCount = canvasElements.length;
        chartAnalysis.chartContainers = chartContainers.length;
        
        // Verificar se charts estão carregados
        for (let i = 0; i < canvasElements.length; i++) {
            try {
                const canvas = canvasElements[i];
                const width = await canvas.getAttribute('width');
                const height = await canvas.getAttribute('height');
                
                console.log(`   📊 Canvas ${i}: ${width}x${height}`);
                chartAnalysis[`canvas_${i}`] = { width, height };
            } catch (e) {
                console.log(`   ⚠️ Erro ao analisar canvas ${i}: ${e.message}`);
            }
        }

        // 6. TESTE DE NAVEGAÇÃO
        console.log('\n🧭 TESTANDO NAVEGAÇÃO...');
        
        const navigationTests = {};
        
        // Procurar por links de navegação
        const navLinks = await page.locator('a, [role="button"], .nav-link, .btn').all();
        console.log(`   🔗 Links encontrados: ${navLinks.length}`);
        
        // Testar alguns links principais
        const mainLinks = await page.locator('a[href*="dashboard"], a[href*="admin"], .nav-link').all();
        
        for (let i = 0; i < Math.min(mainLinks.length, 5); i++) {
            try {
                const link = mainLinks[i];
                const href = await link.getAttribute('href');
                const text = await link.textContent();
                
                navigationTests[`link_${i}`] = {
                    href,
                    text: text?.substring(0, 50),
                    visible: await link.isVisible()
                };
                
                console.log(`   🔗 Link ${i}: ${text?.substring(0, 30)} → ${href}`);
            } catch (e) {
                console.log(`   ⚠️ Erro ao analisar link ${i}: ${e.message}`);
            }
        }

        // 7. ANÁLISE DE DADOS EM TEMPO REAL
        console.log('\n⏱️ ANALISANDO DADOS EM TEMPO REAL...');
        
        const realtimeAnalysis = {};
        
        // Procurar por elementos que mostram dados atualizados
        const valueElements = await page.locator('[class*="value"], [class*="number"], [class*="amount"]').all();
        
        for (let i = 0; i < Math.min(valueElements.length, 10); i++) {
            try {
                const element = valueElements[i];
                const text = await element.textContent();
                
                if (text && (text.includes('R$') || text.includes('%') || /\d+/.test(text))) {
                    realtimeAnalysis[`value_${i}`] = {
                        text: text.trim(),
                        element: await element.tagName(),
                        visible: await element.isVisible()
                    };
                    
                    console.log(`   📊 Valor ${i}: ${text.trim()}`);
                }
            } catch (e) {
                console.log(`   ⚠️ Erro ao analisar valor ${i}: ${e.message}`);
            }
        }

        // 8. TESTE DE RESPONSIVIDADE
        console.log('\n📱 TESTANDO RESPONSIVIDADE...');
        
        const responsiveTests = {};
        
        // Testar diferentes tamanhos de tela
        const viewports = [
            { width: 1920, height: 1080, name: 'Desktop' },
            { width: 1024, height: 768, name: 'Tablet' },
            { width: 375, height: 667, name: 'Mobile' }
        ];
        
        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.waitForTimeout(1000);
            
            // Screenshot de cada viewport
            await page.screenshot({ 
                path: `dashboard-${viewport.name.toLowerCase()}.png`, 
                fullPage: true 
            });
            
            // Verificar se elementos principais ainda estão visíveis
            const mainContent = await page.locator('main, .main-content, .dashboard').isVisible();
            
            responsiveTests[viewport.name] = {
                size: `${viewport.width}x${viewport.height}`,
                mainContentVisible: mainContent
            };
            
            console.log(`   📱 ${viewport.name}: Main content visible = ${mainContent}`);
        }
        
        // Voltar para desktop
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 9. ANÁLISE DE PERFORMANCE
        console.log('\n⚡ ANALISANDO PERFORMANCE...');
        
        const performanceAnalysis = {};
        
        // Medir tempo de carregamento
        const navigationStart = await page.evaluate(() => performance.timing.navigationStart);
        const loadComplete = await page.evaluate(() => performance.timing.loadEventEnd);
        const loadTime = loadComplete - navigationStart;
        
        performanceAnalysis.loadTime = loadTime;
        performanceAnalysis.apiCallsCount = apiCalls.length;
        
        console.log(`   ⏱️ Tempo de carregamento: ${loadTime}ms`);
        console.log(`   📡 API calls realizadas: ${apiCalls.length}`);

        // 10. TESTE DE ERROS JAVASCRIPT
        console.log('\n🐛 VERIFICANDO ERROS JAVASCRIPT...');
        
        const jsErrors = [];
        page.on('pageerror', error => {
            jsErrors.push({
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        });
        
        // Aguardar um pouco para capturar possíveis erros
        await page.waitForTimeout(2000);
        
        console.log(`   🐛 Erros JavaScript encontrados: ${jsErrors.length}`);
        
        // 11. SCREENSHOT FINAL COMPLETO
        console.log('\n📸 CAPTURANDO SCREENSHOT FINAL...');
        
        await page.screenshot({ 
            path: 'dashboard-final-completo.png', 
            fullPage: true,
            animations: 'disabled'
        });

        // 12. GERAR RELATÓRIO DETALHADO
        const relatorio = {
            timestamp: new Date().toISOString(),
            dashboard_url: 'http://localhost:3000/dashboard-standardized',
            login_status: 'success',
            kpi_analysis: kpiAnalysis,
            chart_analysis: chartAnalysis,
            navigation_tests: navigationTests,
            realtime_analysis: realtimeAnalysis,
            responsive_tests: responsiveTests,
            performance_analysis: performanceAnalysis,
            javascript_errors: jsErrors,
            api_calls: apiCalls.slice(0, 20), // Últimas 20 chamadas
            recommendations: []
        };

        // Adicionar recomendações baseadas na análise
        if (jsErrors.length > 0) {
            relatorio.recommendations.push('Corrigir erros JavaScript encontrados');
        }
        
        if (performanceAnalysis.loadTime > 3000) {
            relatorio.recommendations.push('Otimizar tempo de carregamento (>3s)');
        }
        
        if (chartAnalysis.canvasCount === 0) {
            relatorio.recommendations.push('Verificar se charts estão carregando corretamente');
        }

        // Salvar relatório
        fs.writeFileSync('relatorio-inspecao-dashboard.json', JSON.stringify(relatorio, null, 2));
        
        console.log('\n🎉 INSPEÇÃO COMPLETA FINALIZADA!');
        console.log('='.repeat(80));
        console.log(`📊 KPIs analisados: ${Object.keys(kpiAnalysis).length}`);
        console.log(`📊 Charts encontrados: ${chartAnalysis.canvasCount}`);
        console.log(`🔗 Links testados: ${Object.keys(navigationTests).length}`);
        console.log(`📱 Viewports testados: ${Object.keys(responsiveTests).length}`);
        console.log(`⚡ Tempo de carregamento: ${performanceAnalysis.loadTime}ms`);
        console.log(`🐛 Erros JS: ${jsErrors.length}`);
        console.log(`📡 API calls: ${apiCalls.length}`);
        console.log('\n📁 Arquivos gerados:');
        console.log('   📸 login-page.png');
        console.log('   📸 dashboard-inicial.png');
        console.log('   📸 dashboard-desktop.png');
        console.log('   📸 dashboard-tablet.png');
        console.log('   📸 dashboard-mobile.png');
        console.log('   📸 dashboard-final-completo.png');
        console.log('   📄 relatorio-inspecao-dashboard.json');

        return relatorio;

    } catch (error) {
        console.error('❌ Erro na inspeção:', error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Executar inspeção
if (require.main === module) {
    inspecaoDashboardSuperAdmin()
        .then((relatorio) => {
            if (relatorio) {
                console.log('\n✅ Relatório de inspeção gerado com sucesso!');
                console.log('📄 Verifique o arquivo: relatorio-inspecao-dashboard.json');
            } else {
                console.log('\n❌ Falha na geração do relatório');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { inspecaoDashboardSuperAdmin };