const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Script para testar e validar todos os sistemas existentes de métricas
async function testExistingMetricsSystems() {
  console.log('🔍 TESTANDO SISTEMAS EXISTENTES DE MÉTRICAS');
  console.log('=' .repeat(60));
  
  const testResults = {
    systems_tested: 0,
    successful_tests: 0,
    failed_tests: 0,
    issues_found: [],
    performance_metrics: [],
    recommendations: []
  };
  
  try {
    // === TESTE 1: VERIFICAR TABELAS DE MÉTRICAS ===
    console.log('\n📊 1. VERIFICANDO TABELAS DE MÉTRICAS...');
    await testMetricsTables(testResults);
    
    // === TESTE 2: TESTAR FUNÇÕES DE CÁLCULO ===
    console.log('\n🔧 2. TESTANDO FUNÇÕES DE CÁLCULO...');
    await testCalculationFunctions(testResults);
    
    // === TESTE 3: VERIFICAR CONSISTÊNCIA DOS DADOS ===
    console.log('\n📈 3. VERIFICANDO CONSISTÊNCIA DOS DADOS...');
    await testDataConsistency(testResults);
    
    // === TESTE 4: TESTAR PERFORMANCE ===
    console.log('\n⚡ 4. TESTANDO PERFORMANCE...');
    await testPerformance(testResults);
    
    // === TESTE 5: VERIFICAR INTEGRIDADE CROSS-SYSTEM ===
    console.log('\n🔗 5. VERIFICANDO INTEGRIDADE CROSS-SYSTEM...');
    await testCrossSystemIntegrity(testResults);
    
    // === TESTE 6: VALIDAR AUTOMATED JOBS ===
    console.log('\n🤖 6. VALIDANDO AUTOMATED JOBS...');
    await testAutomatedJobs(testResults);
    
    // Relatório final
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RESUMO DOS TESTES:');
    console.log(`✅ ${testResults.successful_tests} testes bem-sucedidos`);
    console.log(`❌ ${testResults.failed_tests} testes falharam`);
    console.log(`⚠️ ${testResults.issues_found.length} problemas identificados`);
    
    return testResults;
    
  } catch (error) {
    console.error('❌ Erro nos testes:', error);
    throw error;
  }
}

// Testar estrutura das tabelas de métricas
async function testMetricsTables(results) {
  const metricsTableTests = [
    { table: 'tenant_metrics', expected_columns: ['id', 'tenant_id', 'metric_type', 'metric_data', 'period', 'calculated_at'] },
    { table: 'platform_metrics', expected_columns: ['id', 'calculation_date', 'total_revenue', 'active_tenants', 'platform_mrr'] },
    { table: 'ubs_metric_system_runs', expected_columns: ['id', 'run_date', 'run_status', 'tenants_processed'] }
  ];
  
  for (const test of metricsTableTests) {
    try {
      results.systems_tested++;
      
      // Verificar se a tabela existe e tem dados
      const { data, error, count } = await supabase
        .from(test.table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`   ❌ Tabela ${test.table}: ${error.message}`);
        results.failed_tests++;
        results.issues_found.push(`${test.table}: ${error.message}`);
      } else {
        console.log(`   ✅ Tabela ${test.table}: ${count || 0} registros encontrados`);
        results.successful_tests++;
        
        if ((count || 0) === 0) {
          results.issues_found.push(`${test.table}: Tabela vazia`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Erro ao testar ${test.table}: ${error.message}`);
      results.failed_tests++;
    }
  }
}

// Testar funções de cálculo do banco
async function testCalculationFunctions(results) {
  const functions = [
    'calculate_enhanced_platform_metrics',
    'get_latest_UBS_metrics_tenant',
    'calculate_ubs_metrics',
    'update_platform_metrics'
  ];
  
  for (const funcName of functions) {
    try {
      results.systems_tested++;
      
      console.log(`   🔧 Testando função: ${funcName}`);
      
      let testResult;
      switch (funcName) {
        case 'calculate_enhanced_platform_metrics':
          testResult = await supabase.rpc(funcName, {
            p_calculation_date: new Date().toISOString().split('T')[0],
            p_period_days: 30
          });
          break;
          
        case 'get_latest_UBS_metrics_tenant':
          // Pegar primeiro tenant para teste
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('id')
            .eq('status', 'active')
            .limit(1)
            .single();
          
          if (tenantData) {
            testResult = await supabase.rpc(funcName, {
              tenant_id: tenantData.id,
              period_days: 30,
              start_date: '2025-07-01',
              end_date: '2025-07-31'
            });
          }
          break;
          
        case 'calculate_ubs_metrics':
          testResult = await supabase.rpc(funcName);
          break;
          
        case 'update_platform_metrics':
          testResult = await supabase.rpc(funcName);
          break;
      }
      
      if (testResult && testResult.error) {
        console.log(`   ❌ Função ${funcName}: ${testResult.error.message}`);
        results.failed_tests++;
        results.issues_found.push(`${funcName}: ${testResult.error.message}`);
      } else {
        console.log(`   ✅ Função ${funcName}: Executou com sucesso`);
        results.successful_tests++;
      }
      
    } catch (error) {
      console.log(`   ❌ Erro ao testar ${funcName}: ${error.message}`);
      results.failed_tests++;
      results.issues_found.push(`${funcName}: ${error.message}`);
    }
  }
}

// Testar consistência dos dados
async function testDataConsistency(results) {
  try {
    results.systems_tested++;
    
    // Verificar consistência entre tenant_metrics e dados reais
    const { data: tenantMetrics } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_type, metric_data')
      .eq('metric_type', 'revenue_per_customer')
      .limit(5);
    
    if (tenantMetrics && tenantMetrics.length > 0) {
      console.log(`   📊 Verificando consistência de ${tenantMetrics.length} registros...`);
      
      let consistentRecords = 0;
      for (const metric of tenantMetrics) {
        // Verificar se o tenant existe
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, business_name')
          .eq('id', metric.tenant_id)
          .single();
        
        if (tenant) {
          consistentRecords++;
        }
      }
      
      const consistencyRate = (consistentRecords / tenantMetrics.length) * 100;
      console.log(`   ✅ Taxa de consistência: ${consistencyRate.toFixed(2)}%`);
      
      if (consistencyRate < 95) {
        results.issues_found.push(`Baixa consistência nos dados: ${consistencyRate.toFixed(2)}%`);
      }
      
      results.successful_tests++;
    } else {
      console.log(`   ⚠️ Nenhuma métrica de receita por cliente encontrada`);
      results.issues_found.push('Sem dados de receita por cliente para validar');
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na verificação de consistência: ${error.message}`);
    results.failed_tests++;
  }
}

// Testar performance das consultas
async function testPerformance(results) {
  const performanceTests = [
    {
      name: 'Query tenant_metrics básica',
      query: () => supabase.from('tenant_metrics').select('*').limit(100)
    },
    {
      name: 'Query platform_metrics recente',
      query: () => supabase.from('platform_metrics').select('*').order('calculation_date', { ascending: false }).limit(10)
    },
    {
      name: 'Agregação de appointments',
      query: () => supabase.from('appointments').select('tenant_id, final_price').eq('status', 'completed').limit(1000)
    }
  ];
  
  for (const test of performanceTests) {
    try {
      results.systems_tested++;
      
      const startTime = Date.now();
      const result = await test.query();
      const duration = Date.now() - startTime;
      
      console.log(`   ⚡ ${test.name}: ${duration}ms`);
      
      results.performance_metrics.push({
        test: test.name,
        duration: duration,
        success: !result.error
      });
      
      if (result.error) {
        console.log(`   ❌ ${test.name}: ${result.error.message}`);
        results.failed_tests++;
      } else {
        results.successful_tests++;
        
        if (duration > 2000) {
          results.issues_found.push(`${test.name}: Performance lenta (${duration}ms)`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Erro no teste ${test.name}: ${error.message}`);
      results.failed_tests++;
    }
  }
}

// Testar integridade entre sistemas
async function testCrossSystemIntegrity(results) {
  try {
    results.systems_tested++;
    
    // Verificar se métricas de tenants são consistentes com platform_metrics
    const { data: platformMetrics } = await supabase
      .from('platform_metrics')
      .select('active_tenants, total_revenue')
      .order('calculation_date', { ascending: false })
      .limit(1)
      .single();
    
    const { data: tenantCount } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    
    if (platformMetrics && tenantCount !== null) {
      const platformActiveTenants = platformMetrics.active_tenants || 0;
      const actualActiveTenants = tenantCount || 0;
      
      const difference = Math.abs(platformActiveTenants - actualActiveTenants);
      const tolerancePercent = 10; // 10% de tolerância
      const maxDifference = Math.ceil(actualActiveTenants * (tolerancePercent / 100));
      
      if (difference <= maxDifference) {
        console.log(`   ✅ Integridade de tenants ativos: Platform(${platformActiveTenants}) vs Real(${actualActiveTenants})`);
        results.successful_tests++;
      } else {
        console.log(`   ⚠️ Divergência em tenants ativos: Platform(${platformActiveTenants}) vs Real(${actualActiveTenants})`);
        results.issues_found.push(`Divergência de ${difference} tenants entre platform_metrics e tenants reais`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na verificação de integridade: ${error.message}`);
    results.failed_tests++;
  }
}

// Testar jobs automatizados
async function testAutomatedJobs(results) {
  try {
    results.systems_tested++;
    
    // Verificar logs de execução dos jobs
    const { data: ubsRuns } = await supabase
      .from('ubs_metric_system_runs')
      .select('run_date, run_status, tenants_processed, execution_time_ms')
      .order('run_date', { ascending: false })
      .limit(5);
    
    if (ubsRuns && ubsRuns.length > 0) {
      console.log(`   🤖 Últimas ${ubsRuns.length} execuções de jobs:`);
      
      let successfulRuns = 0;
      ubsRuns.forEach((run, index) => {
        const status = run.run_status === 'success' ? '✅' : '❌';
        const time = run.execution_time_ms ? `${run.execution_time_ms}ms` : 'N/A';
        console.log(`      ${index + 1}. ${run.run_date}: ${status} (${run.tenants_processed} tenants, ${time})`);
        
        if (run.run_status === 'success') {
          successfulRuns++;
        }
      });
      
      const successRate = (successfulRuns / ubsRuns.length) * 100;
      console.log(`   📈 Taxa de sucesso dos jobs: ${successRate.toFixed(2)}%`);
      
      if (successRate >= 80) {
        results.successful_tests++;
      } else {
        results.failed_tests++;
        results.issues_found.push(`Taxa de sucesso dos jobs baixa: ${successRate.toFixed(2)}%`);
      }
      
      // Verificar se o último job foi recente (últimas 24h)
      const lastRun = new Date(ubsRuns[0].run_date);
      const now = new Date();
      const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
      
      if (hoursSinceLastRun > 24) {
        results.issues_found.push(`Último job executou há ${hoursSinceLastRun.toFixed(1)} horas`);
      }
      
    } else {
      console.log(`   ⚠️ Nenhum log de execução de job encontrado`);
      results.issues_found.push('Sem logs de execução de jobs automatizados');
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na verificação de jobs: ${error.message}`);
    results.failed_tests++;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  testExistingMetricsSystems()
    .then(results => {
      console.log('\n🎉 TESTES CONCLUÍDOS!');
      
      // Gerar recomendações baseadas nos resultados
      if (results.issues_found.length > 0) {
        console.log('\n🔧 RECOMENDAÇÕES:');
        
        // Analisar tipos de problemas e sugerir soluções
        const issueTypes = {
          performance: results.issues_found.filter(issue => issue.includes('Performance') || issue.includes('lenta')),
          consistency: results.issues_found.filter(issue => issue.includes('consistência') || issue.includes('Divergência')),
          data: results.issues_found.filter(issue => issue.includes('vazia') || issue.includes('Sem dados')),
          jobs: results.issues_found.filter(issue => issue.includes('job') || issue.includes('execuç'))
        };
        
        if (issueTypes.performance.length > 0) {
          console.log('   🏃 Performance: Implementar índices e otimizar queries');
        }
        if (issueTypes.consistency.length > 0) {
          console.log('   🔗 Consistência: Revisar lógica de cálculo e sincronização');
        }
        if (issueTypes.data.length > 0) {
          console.log('   📊 Dados: Popular tabelas e executar migrations');
        }
        if (issueTypes.jobs.length > 0) {
          console.log('   🤖 Jobs: Verificar cron jobs e executar manualmente');
        }
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 FALHA NOS TESTES:', error);
      process.exit(1);
    });
}

module.exports = { testExistingMetricsSystems };