const { execSync } = require('child_process');

// Cores para output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    title: (msg) => console.log(`\n${colors.cyan}${'='.repeat(50)}\n${msg}\n${'='.repeat(50)}${colors.reset}`)
};

async function checkCloudflareStatus() {
    log.title('VERIFICAÇÃO DO STATUS DO CLOUDFLARE');
    
    // 1. Verificar se o Wrangler está instalado
    console.log('\n🔧 Verificando instalação do Wrangler...');
    try {
        const version = execSync('wrangler --version', { encoding: 'utf8' }).trim();
        log.success(`Wrangler instalado: ${version}`);
    } catch (error) {
        log.error('Wrangler não está instalado');
        log.info('Para instalar: npm install -g wrangler');
        return;
    }
    
    // 2. Verificar autenticação
    console.log('\n🔑 Verificando autenticação...');
    try {
        const whoami = execSync('wrangler whoami', { encoding: 'utf8' }).trim();
        log.success('Autenticado no Cloudflare');
        log.info(`Usuário: ${whoami}`);
    } catch (error) {
        log.error('Não autenticado no Cloudflare');
        log.info('Execute: wrangler login');
        return;
    }
    
    // 3. Listar contas
    console.log('\n📋 Informações da conta...');
    try {
        const accounts = execSync('wrangler account list', { encoding: 'utf8' }).trim();
        log.success('Contas encontradas:');
        console.log(accounts);
    } catch (error) {
        log.error('Erro ao listar contas:', error.message);
    }
    
    // 4. Listar zonas DNS
    console.log('\n🌐 Zonas DNS...');
    try {
        const zones = execSync('wrangler d1 list', { encoding: 'utf8' }).trim();
        log.success('Zonas DNS encontradas:');
        console.log(zones);
    } catch (error) {
        log.warning('Erro ao listar zonas DNS:', error.message);
    }
    
    // 5. Listar Workers
    console.log('\n⚡ Workers...');
    try {
        const workers = execSync('wrangler workers list', { encoding: 'utf8' }).trim();
        log.success('Workers encontrados:');
        console.log(workers);
    } catch (error) {
        log.warning('Erro ao listar workers:', error.message);
    }
    
    // 6. Verificar configurações de SSL/TLS
    console.log('\n🔒 Configurações SSL/TLS...');
    try {
        const ssl = execSync('wrangler ssl list', { encoding: 'utf8' }).trim();
        log.success('Configurações SSL:');
        console.log(ssl);
    } catch (error) {
        log.warning('Erro ao verificar SSL:', error.message);
    }
    
    // 7. Verificar analytics
    console.log('\n📊 Analytics...');
    try {
        const analytics = execSync('wrangler analytics', { encoding: 'utf8' }).trim();
        log.success('Dados de analytics:');
        console.log(analytics);
    } catch (error) {
        log.warning('Erro ao obter analytics:', error.message);
    }
    
    log.title('VERIFICAÇÃO CONCLUÍDA');
    console.log('\n💡 Próximos passos:');
    console.log('1. Se não estiver autenticado: wrangler login');
    console.log('2. Para configurar DNS: wrangler d1 execute <zone-id> --command="..."');
    console.log('3. Para deploy: wrangler deploy');
    console.log('4. Para logs: wrangler tail');
}

// Executar verificação
checkCloudflareStatus().catch(console.error); 