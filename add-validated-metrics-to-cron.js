/**
 * Adiciona comando npm para executar AMBOS os sistemas de métricas
 * Cria wrapper que executa sistema principal + sistema validado
 */

const fs = require('fs');

const logger = {
    info: (msg) => console.log(`🔥 ${msg}`),
    success: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.error(`❌ ${msg}`)
};

async function addValidatedMetricsCommand() {
    logger.info('🔧 ADICIONANDO COMANDO PARA MÉTRICAS COMPLETAS (PRINCIPAL + VALIDADAS)');
    
    try {
        // 1. Ler package.json
        const packagePath = '/Users/marseau/Developer/WhatsAppSalon-N8N/package.json';
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        // 2. Adicionar novo comando que executa ambos os sistemas
        packageJson.scripts['metrics:complete'] = 'npm run metrics:comprehensive && node populate-validated-metrics.js';
        packageJson.scripts['metrics:validated-only'] = 'node populate-validated-metrics.js';
        
        // 3. Salvar package.json
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        
        logger.success('Comandos adicionados ao package.json:');
        logger.info('• npm run metrics:complete - Executa AMBOS os sistemas');
        logger.info('• npm run metrics:validated-only - Apenas sistema validado');
        
        return true;
        
    } catch (error) {
        logger.error(`Erro: ${error.message}`);
        return false;
    }
}

// Executar
addValidatedMetricsCommand()
    .then((success) => {
        if (success) {
            console.log('\n🎉 SOLUÇÃO IMPLEMENTADA!');
            console.log('\n📊 Para executar sistema completo:');
            console.log('npm run metrics:complete');
            console.log('\n🔍 Para validar apenas métricas validadas:');
            console.log('npm run metrics:validated-only');
        }
        process.exit(success ? 0 : 1);
    });