/**
 * Clear and Repopulate Metrics Script
 * Universal Booking System - COLEAM00 Methodology
 * 
 * Executa limpeza controlada das tabelas de métricas e reexecução dos serviços
 * otimizados para repopulação completa do sistema.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Simple logger
const logger = {
    info: (msg, data) => console.log(`🔥 ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    error: (msg, error) => console.error(`❌ ${msg}`, error),
    warn: (msg, data) => console.warn(`⚠️  ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    success: (msg) => console.log(`✅ ${msg}`)
};

class MetricsCleanAndRepopulateService {
    constructor() {
        this.logger = logger;
        
        // Verificar variáveis de ambiente
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
        }
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    /**
     * PHASE 1: Verificar estado atual das tabelas
     */
    async analyzeCurrentState() {
        this.logger.info('📊 FASE 1 - ANÁLISE DO ESTADO ATUAL');
        
        try {
            // 1. Verificar tenant_metrics
            const { count: tenantCount, error: tenantError } = await this.supabase
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });
                
            if (tenantError) throw tenantError;
            
            // 2. Verificar platform_metrics  
            const { count: platformCount, error: platformError } = await this.supabase
                .from('platform_metrics')
                .select('*', { count: 'exact', head: true });
                
            if (platformError) throw platformError;
            
            // 3. Sample de estrutura
            const { data: tenantSample } = await this.supabase
                .from('tenant_metrics')
                .select('*')
                .limit(1);
                
            const { data: platformSample } = await this.supabase
                .from('platform_metrics')
                .select('*')
                .limit(1);
            
            const state = {
                tenant_metrics: {
                    count: tenantCount || 0,
                    structure: tenantSample?.[0] ? Object.keys(tenantSample[0]) : []
                },
                platform_metrics: {
                    count: platformCount || 0,
                    structure: platformSample?.[0] ? Object.keys(platformSample[0]) : []
                }
            };
            
            this.logger.info('Estado atual das tabelas:', state);
            
            return state;
            
        } catch (error) {
            this.logger.error('Erro ao analisar estado atual:', error);
            throw error;
        }
    }

    /**
     * PHASE 2: Backup de segurança dos dados existentes
     */
    async createBackup() {
        this.logger.info('💾 FASE 2 - CRIANDO BACKUP DE SEGURANÇA');
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // 1. Backup tenant_metrics
            const { data: tenantData, error: tenantError } = await this.supabase
                .from('tenant_metrics')
                .select('*');
                
            if (tenantError) throw tenantError;
            
            // 2. Backup platform_metrics
            const { data: platformData, error: platformError } = await this.supabase
                .from('platform_metrics')
                .select('*');
                
            if (platformError) throw platformError;
            
            // 3. Salvar backups em arquivos
            const fs = require('fs');
            const backupDir = `./backup-metrics-${timestamp}`;
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            fs.writeFileSync(
                `${backupDir}/tenant_metrics_backup.json`, 
                JSON.stringify(tenantData, null, 2)
            );
            
            fs.writeFileSync(
                `${backupDir}/platform_metrics_backup.json`, 
                JSON.stringify(platformData, null, 2)
            );
            
            this.logger.success(`Backup criado em: ${backupDir}`);
            this.logger.info('Dados salvos:', {
                tenant_records: tenantData?.length || 0,
                platform_records: platformData?.length || 0
            });
            
            return {
                backupDir,
                tenantRecords: tenantData?.length || 0,
                platformRecords: platformData?.length || 0
            };
            
        } catch (error) {
            this.logger.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    /**
     * PHASE 3: Limpeza controlada das tabelas
     */
    async cleanMetricsTables() {
        this.logger.info('🧹 FASE 3 - LIMPEZA CONTROLADA DAS TABELAS');
        
        try {
            // 1. Limpar tenant_metrics
            this.logger.info('Limpando tenant_metrics...');
            const { error: tenantDeleteError } = await this.supabase
                .from('tenant_metrics')
                .delete()
                .not('id', 'is', null); // Deleta todos os registros
                
            if (tenantDeleteError) throw tenantDeleteError;
            
            // 2. Limpar platform_metrics
            this.logger.info('Limpando platform_metrics...');
            const { error: platformDeleteError } = await this.supabase
                .from('platform_metrics')
                .delete()
                .not('id', 'is', null); // Deleta todos os registros
                
            if (platformDeleteError) throw platformDeleteError;
            
            // 3. Verificar limpeza
            const { count: tenantCountAfter } = await this.supabase
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });
                
            const { count: platformCountAfter } = await this.supabase
                .from('platform_metrics')
                .select('*', { count: 'exact', head: true });
            
            this.logger.success('Limpeza concluída:');
            this.logger.info('Registros restantes:', {
                tenant_metrics: tenantCountAfter || 0,
                platform_metrics: platformCountAfter || 0
            });
            
            return {
                tenant_cleaned: tenantCountAfter === 0,
                platform_cleaned: platformCountAfter === 0
            };
            
        } catch (error) {
            this.logger.error('Erro durante limpeza:', error);
            throw error;
        }
    }

    /**
     * PHASE 4: Executar repopulação via serviços otimizados
     */
    async repopulateMetrics() {
        this.logger.info('🔄 FASE 4 - REPOPULAÇÃO VIA SERVIÇOS OTIMIZADOS');
        
        try {
            const { spawn } = require('child_process');
            
            // 1. Build do projeto para garantir dist atualizado
            this.logger.info('Compilando projeto...');
            await this.runCommand('npm', ['run', 'build']);
            
            // 2. Executar metrics:comprehensive
            this.logger.info('Executando cálculo abrangente de métricas...');
            await this.runCommand('npm', ['run', 'metrics:comprehensive']);
            
            // 3. Executar aggregação da plataforma
            this.logger.info('Executando agregação da plataforma...');
            await this.runCommand('npm', ['run', 'metrics:platform-agg']);
            
            this.logger.success('Repopulação concluída com sucesso!');
            
            return { success: true };
            
        } catch (error) {
            this.logger.error('Erro durante repopulação:', error);
            throw error;
        }
    }

    /**
     * Helper: Executar comandos de sistema
     */
    runCommand(command, args) {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const process = spawn(command, args, { stdio: 'inherit' });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Comando falhou com código: ${code}`));
                }
            });
        });
    }

    /**
     * PHASE 5: Verificar resultado final
     */
    async validateResult() {
        this.logger.info('✅ FASE 5 - VALIDAÇÃO DO RESULTADO');
        
        try {
            // 1. Verificar se as tabelas foram repopuladas
            const { count: tenantCount } = await this.supabase
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });
                
            const { count: platformCount } = await this.supabase
                .from('platform_metrics')
                .select('*', { count: 'exact', head: true });
            
            // 2. Sample de dados para verificar qualidade
            const { data: recentTenant } = await this.supabase
                .from('tenant_metrics')
                .select('*')
                .order('calculated_at', { ascending: false })
                .limit(1);
                
            const { data: recentPlatform } = await this.supabase
                .from('platform_metrics')
                .select('*')
                .order('calculation_date', { ascending: false })
                .limit(1);
            
            const result = {
                tenant_metrics: {
                    count: tenantCount || 0,
                    latest: recentTenant?.[0]?.calculated_at || 'N/A'
                },
                platform_metrics: {
                    count: platformCount || 0,
                    latest: recentPlatform?.[0]?.calculation_date || 'N/A'
                }
            };
            
            this.logger.success('Validação concluída:');
            this.logger.info('Estado final:', result);
            
            const success = (tenantCount > 0 && platformCount > 0);
            
            if (success) {
                this.logger.success('🎉 REPOPULAÇÃO REALIZADA COM SUCESSO!');
            } else {
                this.logger.warn('⚠️  Atenção: Algumas tabelas podem estar vazias');
            }
            
            return { success, result };
            
        } catch (error) {
            this.logger.error('Erro durante validação:', error);
            throw error;
        }
    }

    /**
     * Executar processo completo
     */
    async execute() {
        this.logger.info('🚀 INICIANDO LIMPEZA E REPOPULAÇÃO DE MÉTRICAS');
        this.logger.info('Metodologia: COLEAM00 - Context Engineering');
        
        try {
            const results = {};
            
            // Fase 1: Análise
            results.analysis = await this.analyzeCurrentState();
            
            // Fase 2: Backup
            results.backup = await this.createBackup();
            
            // Fase 3: Limpeza
            results.cleaning = await this.cleanMetricsTables();
            
            // Fase 4: Repopulação  
            results.repopulation = await this.repopulateMetrics();
            
            // Fase 5: Validação
            results.validation = await this.validateResult();
            
            this.logger.success('✅ PROCESSO CONCLUÍDO COM SUCESSO!');
            
            return results;
            
        } catch (error) {
            this.logger.error('💥 ERRO CRÍTICO NO PROCESSO:', error);
            throw error;
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const service = new MetricsCleanAndRepopulateService();
    
    service.execute()
        .then((results) => {
            console.log('\n🎯 RESUMO FINAL:');
            console.log('- Backup criado:', results.backup.backupDir);
            console.log('- Tenant metrics:', results.validation.result.tenant_metrics.count);
            console.log('- Platform metrics:', results.validation.result.platform_metrics.count);
            console.log('\n✅ Limpeza e repopulação concluídas!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ ERRO FATAL:', error);
            process.exit(1);
        });
}

module.exports = { MetricsCleanAndRepopulateService };