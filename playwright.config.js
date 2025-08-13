// =====================================================
// CONFIGURAÇÃO PLAYWRIGHT PARA FRONTEND INTEGRITY
// Testes visuais, snapshots e verificações automáticas
// =====================================================

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 60000,
    
    // Configuração de screenshots e snapshots
    expect: {
        toHaveScreenshot: {
            threshold: 0.3, // 30% de diferença tolerada
            mode: 'pixel',
            animations: 'disabled' // Desabilitar animações para consistência
        },
        toMatchSnapshot: {
            threshold: 0.2,
            maxDiffPixels: 100
        }
    },
    
    // Configuração global de testes
    use: {
        baseURL: 'http://localhost:3000',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        
        // Headers padrão para todas as requisições
        extraHTTPHeaders: {
            'Accept': 'application/json, text/html',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
    },

    // Projetos para diferentes browsers e dispositivos
    projects: [
        {
            name: 'chromium-desktop',
            use: { 
                ...devices['Desktop Chrome'],
                viewport: { width: 1920, height: 1080 }
            },
        },
        {
            name: 'webkit-desktop', 
            use: { 
                ...devices['Desktop Safari'],
                viewport: { width: 1366, height: 768 }
            },
        },
        {
            name: 'firefox-desktop',
            use: { 
                ...devices['Desktop Firefox'],
                viewport: { width: 1440, height: 900 }
            },
        },
        {
            name: 'mobile-chrome',
            use: { 
                ...devices['Pixel 5']
            },
        },
        {
            name: 'tablet-safari',
            use: { 
                ...devices['iPad Pro']
            },
        }
    ],

    // Configuração de reporters
    reporter: [
        ['html', { 
            outputFolder: 'test-results/html-report',
            open: 'never'
        }],
        ['json', { 
            outputFile: 'test-results/results.json' 
        }],
        ['junit', { 
            outputFile: 'test-results/junit.xml' 
        }],
        ['github'] // Para GitHub Actions
    ],

    // Configuração de workers para performance
    workers: process.env.CI ? 2 : undefined,
    
    // Retry configuration
    retries: process.env.CI ? 2 : 0,
    
    // Global setup e teardown
    globalSetup: './tests/setup/global-setup.js',
    globalTeardown: './tests/setup/global-teardown.js',

    // Output directory
    outputDir: 'test-results/artifacts',

    // Web Server para testes locais
    webServer: process.env.CI ? undefined : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120000
    }
});