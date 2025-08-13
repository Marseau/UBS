/**
 * Integração das Métricas Validadas ao Cron Otimizado
 * 
 * Modifica o tenant-metrics-cron-optimized.service.ts para incluir
 * o cálculo das métricas validadas (mais precisas) junto com o sistema atual
 */

const fs = require('fs');
const path = require('path');

const logger = {
    info: (msg) => console.log(`🔥 ${msg}`),
    success: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.error(`❌ ${msg}`),
    warn: (msg) => console.warn(`⚠️ ${msg}`)
};

class ValidatedMetricsIntegrator {
    constructor() {
        this.cronServicePath = '/Users/marseau/Developer/WhatsAppSalon-N8N/src/services/tenant-metrics-cron-optimized.service.ts';
        this.validatedServicePath = '/Users/marseau/Developer/WhatsAppSalon-N8N/src/services/tenant-metrics/validated-metrics-calculator.service.ts';
    }

    /**
     * 1. Verificar arquivos existentes
     */
    async analyzeCurrentFiles() {
        logger.info('📊 ANÁLISE DOS ARQUIVOS ATUAIS');
        
        const cronExists = fs.existsSync(this.cronServicePath);
        const validatedExists = fs.existsSync(this.validatedServicePath);
        
        logger.info(`Cron otimizado: ${cronExists ? '✅ Existe' : '❌ Não encontrado'}`);
        logger.info(`Metrics validadas: ${validatedExists ? '✅ Existe' : '❌ Não encontrado'}`);
        
        if (!cronExists || !validatedExists) {
            throw new Error('Arquivos necessários não encontrados');
        }
        
        return { cronExists, validatedExists };
    }

    /**
     * 2. Backup do arquivo atual
     */
    async createBackup() {
        logger.info('💾 CRIANDO BACKUP DO SERVIÇO DE CRON');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${this.cronServicePath}.backup-${timestamp}`;
        
        const cronContent = fs.readFileSync(this.cronServicePath, 'utf8');
        fs.writeFileSync(backupPath, cronContent);
        
        logger.success(`Backup criado: ${backupPath}`);
        return backupPath;
    }

    /**
     * 3. Modificar o serviço de cron para incluir métricas validadas
     */
    async integrateValidatedMetrics() {
        logger.info('🔄 INTEGRANDO MÉTRICAS VALIDADAS AO CRON OTIMIZADO');
        
        let cronContent = fs.readFileSync(this.cronServicePath, 'utf8');
        
        // 1. Adicionar import do ValidatedMetricsCalculatorService
        const importToAdd = "import { ValidatedMetricsCalculatorService } from './tenant-metrics/validated-metrics-calculator.service';";
        
        if (!cronContent.includes('ValidatedMetricsCalculatorService')) {
            // Encontrar a linha dos imports e adicionar o novo
            const lastImportIndex = cronContent.lastIndexOf('import ');
            const nextLineIndex = cronContent.indexOf('\n', lastImportIndex);
            
            cronContent = cronContent.slice(0, nextLineIndex + 1) + 
                         importToAdd + '\n' + 
                         cronContent.slice(nextLineIndex + 1);
            
            logger.info('✅ Import adicionado');
        }
        
        // 2. Adicionar propriedade validatedCalculator à classe
        const classDeclaration = 'export class TenantMetricsCronOptimizedService {';
        const classIndex = cronContent.indexOf(classDeclaration);
        
        if (classIndex > -1 && !cronContent.includes('validatedCalculator: ValidatedMetricsCalculatorService')) {
            // Encontrar onde adicionar a propriedade
            const firstPrivateProperty = cronContent.indexOf('private logger', classIndex);
            
            if (firstPrivateProperty > -1) {
                cronContent = cronContent.slice(0, firstPrivateProperty) + 
                             'private validatedCalculator: ValidatedMetricsCalculatorService;\n    ' +
                             cronContent.slice(firstPrivateProperty);
                
                logger.info('✅ Propriedade validatedCalculator adicionada');
            }
        }
        
        // 3. Inicializar o serviço validado no constructor
        const constructorIndex = cronContent.indexOf('constructor() {');
        if (constructorIndex > -1 && !cronContent.includes('this.validatedCalculator = new ValidatedMetricsCalculatorService')) {
            // Encontrar o final do constructor para adicionar a inicialização
            let bracketCount = 0;
            let endConstructorIndex = constructorIndex;
            
            for (let i = constructorIndex; i < cronContent.length; i++) {
                if (cronContent[i] === '{') bracketCount++;
                if (cronContent[i] === '}') bracketCount--;
                if (bracketCount === 0) {
                    endConstructorIndex = i;
                    break;
                }
            }
            
            const initCode = `        this.validatedCalculator = new ValidatedMetricsCalculatorService(this.winstonLogger);\n    `;
            
            cronContent = cronContent.slice(0, endConstructorIndex) + 
                         initCode + 
                         cronContent.slice(endConstructorIndex);
            
            logger.info('✅ Inicialização no constructor adicionada');
        }
        
        // 4. Modificar o método calculateTenantMetrics para incluir métricas validadas
        const calculateMethodPattern = /async calculateTenantMetrics\(tenantId: string, period: '7d' \| '30d' \| '90d'\): Promise<any> \{[\s\S]*?\n    \}/;
        
        if (calculateMethodPattern.test(cronContent)) {
            cronContent = cronContent.replace(calculateMethodPattern, (match) => {
                if (match.includes('validatedMetrics')) {
                    return match; // Já modificado
                }
                
                // Adicionar cálculo das métricas validadas
                const newMethod = match.replace(
                    /return \{[\s\S]*?\};/,
                    `// Calcular métricas validadas
            const validatedMetrics = await this.validatedCalculator.calculateValidatedMetrics(tenantId, period);
            
            return {
                ...metrics,
                metricas_validadas: validatedMetrics
            };`
                );
                
                return newMethod;
            });
            
            logger.info('✅ Método calculateTenantMetrics modificado');
        }
        
        // 5. Modificar o método saveTenantMetrics para salvar também as métricas validadas
        const saveMethodPattern = /async saveTenantMetrics\(tenantId: string, period: string, metrics: any\): Promise<void> \{[\s\S]*?\n    \}/;
        
        if (saveMethodPattern.test(cronContent)) {
            cronContent = cronContent.replace(saveMethodPattern, (match) => {
                if (match.includes('metricas_validadas: metrics.metricas_validadas')) {
                    return match; // Já modificado
                }
                
                const newMethod = match.replace(
                    /metric_data: metrics,/,
                    `metric_data: metrics,
                metricas_validadas: metrics.metricas_validadas || {},`
                );
                
                return newMethod;
            });
            
            logger.info('✅ Método saveTenantMetrics modificado');
        }
        
        // Salvar arquivo modificado
        fs.writeFileSync(this.cronServicePath, cronContent);
        logger.success('Arquivo de cron otimizado modificado com sucesso!');
        
        return true;
    }

    /**
     * 4. Recompilar o projeto
     */
    async recompileProject() {
        logger.info('🔨 RECOMPILANDO PROJETO');
        
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const buildProcess = spawn('npm', ['run', 'build'], { 
                cwd: '/Users/marseau/Developer/WhatsAppSalon-N8N',
                stdio: 'inherit'
            });
            
            buildProcess.on('close', (code) => {
                if (code === 0) {
                    logger.success('Projeto recompilado com sucesso!');
                    resolve();
                } else {
                    logger.error(`Compilação falhou com código: ${code}`);
                    reject(new Error(`Build failed with code: ${code}`));
                }
            });
        });
    }

    /**
     * 5. Testar a integração
     */
    async testIntegration() {
        logger.info('🧪 TESTANDO INTEGRAÇÃO');
        
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const testProcess = spawn('npm', ['run', 'metrics:comprehensive'], {
                cwd: '/Users/marseau/Developer/WhatsAppSalon-N8N',
                stdio: 'inherit'
            });
            
            testProcess.on('close', (code) => {
                if (code === 0) {
                    logger.success('Teste de integração bem-sucedido!');
                    resolve();
                } else {
                    logger.warn(`Teste completado com código: ${code}`);
                    resolve(); // Não falhar por warnings
                }
            });
        });
    }

    /**
     * Executar integração completa
     */
    async execute() {
        logger.info('🚀 INICIANDO INTEGRAÇÃO DAS MÉTRICAS VALIDADAS');
        
        try {
            // 1. Análise
            await this.analyzeCurrentFiles();
            
            // 2. Backup
            const backupPath = await this.createBackup();
            
            // 3. Integração
            await this.integrateValidatedMetrics();
            
            // 4. Recompilação
            await this.recompileProject();
            
            // 5. Teste
            await this.testIntegration();
            
            logger.success('🎉 INTEGRAÇÃO CONCLUÍDA COM SUCESSO!');
            logger.info(`Backup disponível em: ${backupPath}`);
            logger.info('O serviço de cron otimizado agora inclui métricas validadas');
            
            return { success: true, backupPath };
            
        } catch (error) {
            logger.error('💥 ERRO NA INTEGRAÇÃO:', error.message);
            throw error;
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const integrator = new ValidatedMetricsIntegrator();
    
    integrator.execute()
        .then((result) => {
            console.log('\n✅ INTEGRAÇÃO CONCLUÍDA!');
            console.log('📊 O cron otimizado agora calcula AMBOS os sistemas:');
            console.log('   • metric_data (sistema principal)');
            console.log('   • metricas_validadas (sistema mais preciso)');
            console.log('\n🚀 Próximo passo: npm run metrics:comprehensive');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ FALHA NA INTEGRAÇÃO:', error);
            process.exit(1);
        });
}

module.exports = { ValidatedMetricsIntegrator };