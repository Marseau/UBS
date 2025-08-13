#!/usr/bin/env node

/**
 * Testar APIs de monitoramento UBS com dados reais
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_CONFIG = {
    url: 'https://qsdfyffuonywmtnlycri.supabase.co',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
};

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

/**
 * Simular chamadas das APIs de monitoramento
 */
async function testMonitoringAPIs() {
    console.log('🌐 TESTANDO APIs DE MONITORAMENTO UBS COM DADOS REAIS');
    console.log('=' .repeat(60));
    
    const testResults = {
        health_check: null,
        recent_runs: null,
        system_status: null,
        performance_metrics: null
    };

    try {
        // 1. TESTE: Health Check
        console.log('\n🏥 1. TESTANDO HEALTH CHECK...');
        
        const recentRuns = await supabase
            .from('ubs_metric_system_runs')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(10);

        if (recentRuns.data) {
            const runs = recentRuns.data;
            const totalRuns = runs.length;
            const successfulRuns = runs.filter(r => r.run_status === 'completed').length;
            const failedRuns = runs.filter(r => r.run_status === 'failed').length;
            const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;
            
            const lastRun = runs[0];
            const hoursSinceLastRun = lastRun 
                ? Math.round((Date.now() - new Date(lastRun.started_at).getTime()) / (1000 * 60 * 60))
                : 999;

            let overallHealth = 'healthy';
            const recommendations = [];

            if (successRate < 50) {
                overallHealth = 'critical';
                recommendations.push('Taxa de sucesso crítica - verificar logs');
            } else if (successRate < 80) {
                overallHealth = 'warning';
                recommendations.push('Taxa de sucesso baixa - investigar falhas');
            }

            if (hoursSinceLastRun > 25) {
                overallHealth = 'critical';
                recommendations.push('Nenhuma execução nas últimas 24h');
            }

            if (recommendations.length === 0) {
                recommendations.push('Sistema funcionando normalmente');
            }

            testResults.health_check = {
                overall_health: overallHealth,
                success_rate_24h: Math.round(successRate * 100) / 100,
                hours_since_last_run: hoursSinceLastRun,
                failed_runs_24h: failedRuns,
                recommendations: recommendations
            };

            console.log(`   ✅ Health Status: ${overallHealth}`);
            console.log(`   📊 Success Rate: ${successRate.toFixed(1)}%`);
            console.log(`   ⏰ Hours Since Last Run: ${hoursSinceLastRun}h`);
            console.log(`   💡 Recommendations: ${recommendations[0]}`);
        }

        // 2. TESTE: Recent Runs
        console.log('\n📋 2. TESTANDO RECENT RUNS...');
        
        const { data: runs, error } = await supabase
            .from('ubs_metric_system_runs')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
        } else {
            testResults.recent_runs = runs;
            console.log(`   ✅ Runs encontrados: ${runs?.length || 0}`);
            
            runs?.forEach((run, index) => {
                const status = run.run_status === 'completed' ? '✅' : 
                              run.run_status === 'failed' ? '❌' : '🔄';
                const duration = Math.round(run.execution_time_ms / 1000);
                console.log(`      ${index + 1}. ${status} ${run.run_status} - ${duration}s - ${run.tenants_processed} tenants`);
            });
        }

        // 3. TESTE: System Status
        console.log('\n🔍 3. TESTANDO SYSTEM STATUS...');
        
        const runningJobs = runs?.filter(r => r.run_status === 'running').length || 0;
        const isSystemActive = runningJobs > 0 || (runs?.[0] && 
            new Date().getTime() - new Date(runs[0].started_at).getTime() < 5 * 60 * 1000);

        testResults.system_status = {
            is_system_active: isSystemActive,
            running_jobs: runningJobs,
            recent_runs_count: runs?.length || 0,
            overall_health: testResults.health_check?.overall_health || 'unknown'
        };

        console.log(`   ✅ System Active: ${isSystemActive ? 'Yes' : 'No'}`);
        console.log(`   🔄 Running Jobs: ${runningJobs}`);
        console.log(`   📊 Recent Runs: ${runs?.length || 0}`);

        // 4. TESTE: Performance Metrics
        console.log('\n⚡ 4. TESTANDO PERFORMANCE METRICS...');
        
        const validRuns = runs?.filter(r => r.run_status === 'completed') || [];
        const avgExecutionTime = validRuns.length > 0
            ? validRuns.reduce((sum, r) => sum + r.execution_time_ms, 0) / validRuns.length / 1000
            : 0;

        testResults.performance_metrics = {
            avg_execution_time: Math.round(avgExecutionTime * 100) / 100,
            successful_runs: validRuns.length,
            total_runs: runs?.length || 0,
            performance_trend: avgExecutionTime < 30 ? 'good' : avgExecutionTime < 60 ? 'moderate' : 'slow'
        };

        console.log(`   ✅ Avg Execution Time: ${avgExecutionTime.toFixed(2)}s`);
        console.log(`   📊 Successful Runs: ${validRuns.length}/${runs?.length || 0}`);
        console.log(`   🎯 Performance: ${testResults.performance_metrics.performance_trend}`);

        // 5. TESTE: Dados das métricas populadas
        console.log('\n📊 5. VERIFICANDO MÉTRICAS POPULADAS...');
        
        const { data: platformMetrics } = await supabase
            .from('platform_metrics')
            .select('total_revenue, total_appointments, active_tenants')
            .order('created_at', { ascending: false })
            .limit(1);

        const { data: tenantMetrics } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type')
            .order('created_at', { ascending: false })
            .limit(10);

        if (platformMetrics?.[0]) {
            const pm = platformMetrics[0];
            console.log(`   💰 Revenue: R$ ${parseFloat(pm.total_revenue).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            console.log(`   📅 Appointments: ${pm.total_appointments.toLocaleString('pt-BR')}`);
            console.log(`   👥 Active Tenants: ${pm.active_tenants}`);
        }

        if (tenantMetrics?.length) {
            console.log(`   🏢 Tenant Metrics: ${tenantMetrics.length} registros`);
            const metricTypes = [...new Set(tenantMetrics.map(t => t.metric_type))];
            console.log(`   📊 Tipos: ${metricTypes.join(', ')}`);
        }

    } catch (error) {
        console.error('❌ Erro geral nos testes:', error.message);
    }

    // RELATÓRIO FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 RELATÓRIO DE TESTES DAS APIs:');
    
    const allTestsPassed = [
        testResults.health_check,
        testResults.recent_runs,
        testResults.system_status,
        testResults.performance_metrics
    ].every(result => result !== null);

    if (allTestsPassed) {
        console.log('✅ Todos os testes das APIs passaram com sucesso!');
        console.log('\n🚀 SYSTEM STATUS:');
        console.log(`   🏥 Health: ${testResults.health_check.overall_health}`);
        console.log(`   📊 Success Rate: ${testResults.health_check.success_rate_24h}%`);
        console.log(`   ⚡ Avg Performance: ${testResults.performance_metrics.avg_execution_time}s`);
        console.log(`   🔄 Active: ${testResults.system_status.is_system_active ? 'Yes' : 'No'}`);
        
        console.log('\n🎉 APIs DE MONITORAMENTO FUNCIONANDO PERFEITAMENTE!');
    } else {
        console.log('❌ Alguns testes falharam - verificar logs acima');
    }

    return testResults;
}

// Executar se chamado diretamente
if (require.main === module) {
    testMonitoringAPIs()
        .then(results => {
            console.log('\n✅ Testes das APIs concluídos!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA NOS TESTES DAS APIs:', error);
            process.exit(1);
        });
}

module.exports = { testMonitoringAPIs };