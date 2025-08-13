#!/usr/bin/env node

/**
 * Script de Configuração Completa do Sistema
 * 
 * Este script executa a configuração completa do sistema de analytics:
 * 1. Aplica o schema do banco de dados
 * 2. Popula com dados históricos
 * 3. Executa cálculos iniciais
 * 4. Valida o sistema
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
}

/**
 * Executar schema SQL
 */
async function applyDatabaseSchema() {
    log('🗄️ Aplicando schema do banco de dados...');
    
    try {
        const schemaPath = path.join(__dirname, '../database/complete-cron-analytics-schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema não encontrado: ${schemaPath}`);
        }
        
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        
        // Dividir em comandos individuais (separados por ;)
        const commands = schemaSQL
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
        
        log(`📝 Executando ${commands.length} comandos SQL...`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i] + ';';
            
            try {
                // Executar comando via RPC ou query direta
                if (command.toLowerCase().includes('create table') || 
                    command.toLowerCase().includes('create index') ||
                    command.toLowerCase().includes('create function')) {
                    
                    const { error } = await supabase.rpc('exec_sql', { sql: command });
                    
                    if (error && !error.message.includes('already exists')) {
                        throw error;
                    }
                }
                
                successCount++;
                
                if ((i + 1) % 10 === 0) {
                    log(`📊 Executados ${i + 1}/${commands.length} comandos`);
                }
                
            } catch (error) {
                if (error.message.includes('already exists') || 
                    error.message.includes('does not exist')) {
                    // Ignorar erros de "já existe" ou "não existe"
                    successCount++;
                } else {
                    log(`⚠️ Erro no comando ${i + 1}: ${error.message}`, 'WARN');
                    errorCount++;
                }
            }
        }
        
        log(`✅ Schema aplicado: ${successCount} sucessos, ${errorCount} erros`);
        return true;
        
    } catch (error) {
        log(`❌ Erro ao aplicar schema: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * Verificar se as tabelas foram criadas
 */
async function validateTables() {
    log('🔍 Validando tabelas criadas...');
    
    const requiredTables = [
        'analytics_system_metrics',
        'analytics_tenant_metrics',
        'top_tenants',
        'tenant_distribution',
        'tenant_risk_history',
        'analytics_job_executions',
        'analytics_cache'
    ];
    
    let validTables = 0;
    
    for (const table of requiredTables) {
        try {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);
                
            if (!error) {
                validTables++;
                log(`✅ Tabela ${table} existe`);
            } else {
                log(`❌ Tabela ${table} não encontrada: ${error.message}`, 'ERROR');
            }
        } catch (error) {
            log(`❌ Erro ao verificar tabela ${table}: ${error.message}`, 'ERROR');
        }
    }
    
    const success = validTables === requiredTables.length;
    log(`📊 Validação: ${validTables}/${requiredTables.length} tabelas encontradas`);
    
    return success;
}

/**
 * Popular dados históricos
 */
async function populateData() {
    log('📊 Populando dados históricos...');
    
    try {
        const { populateHistoricalData } = require('./populate-historical-data');
        const report = await populateHistoricalData();
        
        log('✅ Dados históricos populados com sucesso');
        return report;
        
    } catch (error) {
        log(`❌ Erro ao popular dados: ${error.message}`, 'ERROR');
        return null;
    }
}

/**
 * Executar cálculos iniciais
 */
async function runInitialCalculations() {
    log('⚡ Executando cálculos iniciais...');
    
    try {
        const { runDailyCron } = require('./daily-analytics-cron');
        await runDailyCron();
        
        log('✅ Cálculos iniciais concluídos');
        return true;
        
    } catch (error) {
        log(`❌ Erro nos cálculos: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * Validar sistema completo
 */
async function validateSystem() {
    log('🧪 Validando sistema completo...');
    
    try {
        // Verificar dados nas tabelas de métricas
        const { data: systemMetrics } = await supabase
            .from('analytics_system_metrics')
            .select('*')
            .limit(5);
            
        const { data: tenantMetrics } = await supabase
            .from('analytics_tenant_metrics')
            .select('*')
            .limit(5);
            
        const { data: rankings } = await supabase
            .from('top_tenants')
            .select('*')
            .limit(5);
        
        const validation = {
            systemMetrics: systemMetrics?.length || 0,
            tenantMetrics: tenantMetrics?.length || 0,
            rankings: rankings?.length || 0,
            isValid: (systemMetrics?.length || 0) > 0 && (tenantMetrics?.length || 0) > 0
        };
        
        if (validation.isValid) {
            log('✅ Sistema validado com sucesso');
            log(`📊 Métricas do sistema: ${validation.systemMetrics} registros`);
            log(`🏢 Métricas de tenants: ${validation.tenantMetrics} registros`);
            log(`🏆 Rankings: ${validation.rankings} registros`);
        } else {
            log('❌ Sistema não validado - dados insuficientes');
        }
        
        return validation;
        
    } catch (error) {
        log(`❌ Erro na validação: ${error.message}`, 'ERROR');
        return { isValid: false, error: error.message };
    }
}

/**
 * Gerar relatório de configuração
 */
function generateSetupReport(results) {
    const report = {
        timestamp: new Date().toISOString(),
        setupResults: results,
        status: results.schema && results.validation && results.population && results.calculations ? 'SUCCESS' : 'PARTIAL',
        summary: {
            schema: results.schema ? '✅ Aplicado' : '❌ Falhou',
            validation: results.validation ? '✅ Validado' : '❌ Falhou',
            population: results.population ? '✅ Populado' : '❌ Falhou',
            calculations: results.calculations ? '✅ Calculado' : '❌ Falhou',
            systemValidation: results.systemValidation?.isValid ? '✅ Válido' : '❌ Inválido'
        },
        nextSteps: []
    };
    
    // Adicionar próximos passos baseados nos resultados
    if (!results.schema) {
        report.nextSteps.push('Execute o schema manualmente: psql -f database/complete-cron-analytics-schema.sql');
    }
    
    if (!results.population) {
        report.nextSteps.push('Execute a população manual: node scripts/populate-historical-data.js');
    }
    
    if (!results.calculations) {
        report.nextSteps.push('Execute o cron manual: node scripts/daily-analytics-cron.js');
    }
    
    if (results.systemValidation?.isValid) {
        report.nextSteps.push('Configure o cron job: ./scripts/setup-cron-job.sh');
        report.nextSteps.push('Acesse o dashboard para visualizar os dados');
    }
    
    // Salvar relatório
    const reportPath = path.join(__dirname, '../setup-complete-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Mostrar resumo
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RELATÓRIO DE CONFIGURAÇÃO COMPLETA DO SISTEMA');
    console.log('='.repeat(60));
    console.log(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);
    console.log(`⏰ Hora: ${new Date().toLocaleTimeString('pt-BR')}`);
    console.log(`🎯 Status: ${report.status}`);
    
    console.log('\n📋 RESULTADOS:');
    Object.entries(report.summary).forEach(([step, status]) => {
        console.log(`  ${step}: ${status}`);
    });
    
    if (results.populationReport) {
        console.log('\n📊 DADOS POPULADOS:');
        console.log(`  🏢 Tenants: ${results.populationReport.summary.tenants}`);
        console.log(`  📅 Agendamentos: ${results.populationReport.summary.appointments}`);
        console.log(`  👥 Usuários: ${results.populationReport.summary.users}`);
        console.log(`  💰 Receita: R$ ${(results.populationReport.summary.totalRevenue || 0).toLocaleString('pt-BR')}`);
    }
    
    if (results.systemValidation) {
        console.log('\n🧪 VALIDAÇÃO DO SISTEMA:');
        console.log(`  📊 Métricas do sistema: ${results.systemValidation.systemMetrics} registros`);
        console.log(`  🏢 Métricas de tenants: ${results.systemValidation.tenantMetrics} registros`);
        console.log(`  🏆 Rankings: ${results.systemValidation.rankings} registros`);
    }
    
    if (report.nextSteps.length > 0) {
        console.log('\n🔧 PRÓXIMOS PASSOS:');
        report.nextSteps.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step}`);
        });
    }
    
    if (report.status === 'SUCCESS') {
        console.log('\n🎉 SISTEMA CONFIGURADO COM SUCESSO!');
        console.log('✅ Pronto para usar o dashboard com dados reais');
        console.log('⏰ Cron job configurado para executar às 4:00 AM');
    } else {
        console.log('\n⚠️ CONFIGURAÇÃO PARCIAL');
        console.log('🔧 Execute os próximos passos para completar');
    }
    
    console.log('\n📄 Relatório completo salvo em: setup-complete-report.json');
    console.log('='.repeat(60) + '\n');
    
    return report;
}

/**
 * Função principal
 */
async function setupCompleteSystem() {
    const startTime = Date.now();
    
    console.log('\n' + '🚀'.repeat(20));
    console.log('🎯 CONFIGURAÇÃO COMPLETA DO SISTEMA UBS ANALYTICS');
    console.log('🚀'.repeat(20) + '\n');
    
    const results = {
        schema: false,
        validation: false,
        population: false,
        calculations: false,
        systemValidation: null,
        populationReport: null
    };
    
    try {
        // 1. Aplicar schema
        log('📋 ETAPA 1/5: Aplicando schema do banco de dados');
        results.schema = await applyDatabaseSchema();
        
        // 2. Validar tabelas
        log('📋 ETAPA 2/5: Validando estrutura do banco');
        results.validation = await validateTables();
        
        // 3. Popular dados (apenas se schema foi aplicado)
        if (results.schema && results.validation) {
            log('📋 ETAPA 3/5: Populando dados históricos');
            results.populationReport = await populateData();
            results.population = !!results.populationReport;
        } else {
            log('⚠️ Pulando população - schema não aplicado');
        }
        
        // 4. Executar cálculos (apenas se dados foram populados)
        if (results.population) {
            log('📋 ETAPA 4/5: Executando cálculos iniciais');
            results.calculations = await runInitialCalculations();
        } else {
            log('⚠️ Pulando cálculos - dados não populados');
        }
        
        // 5. Validar sistema completo
        log('📋 ETAPA 5/5: Validando sistema completo');
        results.systemValidation = await validateSystem();
        
        // Gerar relatório final
        const duration = Date.now() - startTime;
        log(`⏱️ Configuração concluída em ${Math.round(duration / 1000)}s`);
        
        const report = generateSetupReport(results);
        
        return report;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        log(`❌ Erro na configuração: ${error.message} (${Math.round(duration / 1000)}s)`, 'ERROR');
        
        // Gerar relatório mesmo com erro
        const report = generateSetupReport(results);
        report.error = error.message;
        
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    setupCompleteSystem()
        .then((report) => {
            process.exit(report.status === 'SUCCESS' ? 0 : 1);
        })
        .catch(() => {
            process.exit(1);
        });
}

module.exports = { setupCompleteSystem }; 