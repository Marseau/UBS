// Configuração para mapeamento automático do app
module.exports = {
    // Configurações básicas
    baseUrl: 'http://localhost:3000', // URL base do seu app
    loginUrl: '/login', // Rota de login
    
    // Credenciais (SUBSTITUA pelas suas)
    username: 'seu_email@exemplo.com',
    password: 'sua_senha',
    
    // Diretórios de output
    outputDir: './app-mapping-results',
    screenshotDir: './app-mapping-screenshots',
    
    // Configurações de timing
    delay: 2000, // Delay entre ações (ms)
    timeout: 30000, // Timeout para navegação (ms)
    
    // Viewport do browser
    viewport: { 
        width: 1920, 
        height: 1080 
    },
    
    // Configurações do browser
    browser: {
        headless: false, // false para ver o browser em ação
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    },
    
    // Seletores personalizados para login (ajuste conforme seu app)
    selectors: {
        username: 'input[name="email"], input[name="username"], input[type="email"]',
        password: 'input[name="password"], input[type="password"]',
        loginButton: 'button[type="submit"], input[type="submit"], .login-btn, #login-btn'
    },
    
    // Páginas específicas para mapear (opcional - deixe vazio para descoberta automática)
    specificPages: [
        // '/dashboard',
        // '/appointments',
        // '/analytics',
        // '/settings'
    ],
    
    // Configurações de screenshot
    screenshot: {
        fullPage: true,
        quality: 90,
        format: 'png'
    },
    
    // Configurações de relatório
    report: {
        includeHTML: true,
        includeJSON: true,
        includeScreenshots: true
    }
}; 