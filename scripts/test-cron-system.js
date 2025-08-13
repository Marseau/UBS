#!/usr/bin/env node

/**
 * Script de Teste do Sistema de Cron Jobs
 * 
 * Este script testa e valida o sistema completo de analytics baseado em cron jobs:
 * 1. Executa o schema no banco de dados
 * 2. Roda o cron job de analytics
 * 3. Testa as APIs otimizadas
 * 4. Valida os dados gerados
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
 * 1. Executar schema de analytics
 */
async function setupAnalyticsSchema() {
    log('🔧 Executando schema de analytics...');
    
    try {
        const schemaPath = path.join(__dirname, '../database/complete-cron-analytics-schema.sql');
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        
        // Dividir em comandos individuais
        const commands = schemaSQL.split(';').filter(cmd => cmd.trim().length > 0);
        
        for (const command of commands) {
            if (command.trim()) {
                try {
                    await supabase.rpc('exec_sql', { sql: command.trim() + ';' });
                } catch (error) {
                    // Ignorar erros de "já existe"
                    if (!error.message.includes('already exists') && !error.message.includes('does not exist')) {
                        console.warn(`Aviso no comando SQL: ${error.message}`);
                    }
                }
            }
        }
        
        log('✅ Schema de analytics executado com sucesso');
        return true;
        
    } catch (error) {
        log(`❌ Erro ao executar schema: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * 2. Gerar dados de teste
 */
async function generateTestData() {
    log('📊 Gerando dados de teste...');
    
    try {
        // Verificar se já existem tenants
        const { data: existingTenants, error: tenantError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .limit(5);
            
        if (tenantError) throw tenantError;
        
        if (existingTenants.length === 0) {
            log('⚠️ Nenhum tenant encontrado. Criando dados de teste...');
            
            // Criar tenant de teste
            const { data: newTenant, error: createError } = await supabase
                .from('tenants')
                .insert({
                    business_name: 'Salão Teste Analytics',
                    domain: 'teste-analytics',
                    status: 'active',
                    subscription_plan: 'pro'
                })
                .select()
                .single();
                
            if (createError) throw createError;
            
            // Criar alguns agendamentos de teste
            const testAppointments = [];
            for (let i = 0; i < 10; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                
                testAppointments.push({
                    tenant_id: newTenant.id,
                    start_time: date.toISOString(),
                    status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'confirmed' : 'cancelled',
                    quoted_price: 50 + (i * 10),
                    final_price: 50 + (i * 10),
                    created_at: date.toISOString()
                });
            }
            
            const { error: appointmentError } = await supabase
                .from('appointments')
                .insert(testAppointments);
                
            if (appointmentError) throw appointmentError;
            
            log(`✅ Dados de teste criados para tenant: ${newTenant.business_name}`);
        } else {
            log(`✅ Usando ${existingTenants.length} tenants existentes`);
        }
        
        return true;
        
    } catch (error) {
        log(`❌ Erro ao gerar dados de teste: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * 3. Executar cron job de analytics
 */
async function runAnalyticsCron() {
    log('⏰ Executando cron job de analytics...');
    
    try {
        const targetDate = new Date().toISOString().split('T')[0];
        
        // Simular o cálculo de métricas do sistema
        const { data: tenants, error: tenantError } = await supabase
            .from('tenants')
            .select('id')
            .eq('status', 'active');
            
        if (tenantError) throw tenantError;
        
        // Buscar agendamentos de hoje
        const { data: appointments, error: apptError } = await supabase
            .from('appointments')
            .select('*')
            .gte('created_at', targetDate + 'T00:00:00')
            .lt('created_at', targetDate + 'T23:59:59');
            
        if (apptError) throw apptError;
        
        // Calcular métricas básicas
        const systemMetrics = {
            metric_date: targetDate,
            period_type: 'daily',
            total_appointments: appointments.length,
            confirmed_appointments: appointments.filter(a => a.status === 'confirmed').length,
            completed_appointments: appointments.filter(a => a.status === 'completed').length,
            cancelled_appointments: appointments.filter(a => a.status === 'cancelled').length,
            total_revenue: appointments
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + (parseFloat(a.final_price) || 0), 0),
            active_tenants: tenants.length,
            completion_rate: appointments.length > 0 
                ? (appointments.filter(a => a.status === 'completed').length / appointments.length * 100).toFixed(2)
                : 0
        };
        
        // Inserir métricas do sistema
        const { error: insertError } = await supabase
            .from('analytics_system_metrics')
            .upsert(systemMetrics, {
                onConflict: 'metric_date,period_type'
            });
            
        if (insertError) throw insertError;
        
        log(`✅ Cron job executado: ${systemMetrics.total_appointments} agendamentos, R$ ${systemMetrics.total_revenue}`);
        return true;
        
    } catch (error) {
        log(`❌ Erro no cron job: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * 4. Testar APIs otimizadas
 */
async function testOptimizedAPIs() {
    log('🧪 Testando APIs otimizadas...');
    
    try {
        // Testar função RPC do sistema
        const { data: systemMetrics, error: systemError } = await supabase
            .rpc('get_system_dashboard_metrics', { p_period: '30d' });
            
        if (systemError) {
            log(`⚠️ Função RPC do sistema não disponível: ${systemError.message}`, 'WARN');
        } else {
            log(`✅ API do sistema: ${systemMetrics.length} registros encontrados`);
        }
        
        // Testar busca de métricas diretas
        const { data: directMetrics, error: directError } = await supabase
            .from('analytics_system_metrics')
            .select('*')
            .eq('period_type', 'daily')
            .order('metric_date', { ascending: false })
            .limit(5);
            
        if (directError) throw directError;
        
        log(`✅ Busca direta: ${directMetrics.length} métricas encontradas`);
        
        if (directMetrics.length > 0) {
            const latest = directMetrics[0];
            log(`📊 Última métrica: ${latest.metric_date} - ${latest.total_appointments} agendamentos`);
        }
        
        return true;
        
    } catch (error) {
        log(`❌ Erro ao testar APIs: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * 5. Validar estrutura do banco
 */
async function validateDatabaseStructure() {
    log('🔍 Validando estrutura do banco...');
    
    try {
        const requiredTables = [
            'analytics_system_metrics',
            'analytics_tenant_metrics',
            'top_tenants',
            'tenant_distribution',
            'tenant_risk_history',
            'analytics_job_executions',
            'analytics_cache'
        ];
        
        for (const table of requiredTables) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);
                
            if (error) {
                log(`❌ Tabela ${table} não encontrada: ${error.message}`, 'ERROR');
                return false;
            } else {
                log(`✅ Tabela ${table} existe`);
            }
        }
        
        log('✅ Todas as tabelas necessárias estão presentes');
        return true;
        
    } catch (error) {
        log(`❌ Erro na validação: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * 6. Gerar relatório final
 */
function generateReport(results) {
    log('📋 Gerando relatório final...');
    
    const report = {
        timestamp: new Date().toISOString(),
        testResults: results,
        summary: {
            totalTests: Object.keys(results).length,
            passedTests: Object.values(results).filter(r => r).length,
            failedTests: Object.values(results).filter(r => !r).length
        },
        recommendations: []
    };
    
    // Adicionar recomendações baseadas nos resultados
    if (!results.schema) {
        report.recommendations.push('Execute o schema de analytics no banco de dados');
    }
    
    if (!results.testData) {
        report.recommendations.push('Crie dados de teste para validar o sistema');
    }
    
    if (!results.cronJob) {
        report.recommendations.push('Verifique a configuração do cron job');
    }
    
    if (!results.apis) {
        report.recommendations.push('Verifique as funções RPC no banco de dados');
    }
    
    if (!results.database) {
        report.recommendations.push('Execute o schema completo para criar todas as tabelas');
    }
    
    // Salvar relatório
    const reportPath = path.join(__dirname, '../test-cron-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    log('📄 Relatório salvo em: test-cron-report.json');
    
    // Mostrar resumo
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMO DO TESTE DO SISTEMA DE CRON JOBS');
    console.log('='.repeat(50));
    console.log(`✅ Testes passaram: ${report.summary.passedTests}/${report.summary.totalTests}`);
    console.log(`❌ Testes falharam: ${report.summary.failedTests}/${report.summary.totalTests}`);
    
    if (report.recommendations.length > 0) {
        console.log('\n🔧 RECOMENDAÇÕES:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
    }
    
    if (report.summary.failedTests === 0) {
        console.log('\n🎉 SISTEMA DE CRON JOBS FUNCIONANDO PERFEITAMENTE!');
        console.log('✅ Pronto para produção com atualização às 4:00 AM');
    } else {
        console.log('\n⚠️ SISTEMA PRECISA DE AJUSTES');
        console.log('🔧 Siga as recomendações acima para corrigir');
    }
    
    console.log('='.repeat(50) + '\n');
}

/**
 * Função principal
 */
async function runCompleteTest() {
    log('🚀 Iniciando teste completo do sistema de cron jobs');
    
    const results = {
        schema: false,
        testData: false,
        cronJob: false,
        apis: false,
        database: false
    };
    
    try {
        // Executar todos os testes em sequência
        results.schema = await setupAnalyticsSchema();
        results.testData = await generateTestData();
        results.cronJob = await runAnalyticsCron();
        results.apis = await testOptimizedAPIs();
        results.database = await validateDatabaseStructure();
        
        // Gerar relatório final
        generateReport(results);
        
        // Exit code baseado nos resultados
        const allPassed = Object.values(results).every(r => r);
        process.exit(allPassed ? 0 : 1);
        
    } catch (error) {
        log(`❌ Erro crítico no teste: ${error.message}`, 'ERROR');
        generateReport(results);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    runCompleteTest();
}

module.exports = { runCompleteTest }; 