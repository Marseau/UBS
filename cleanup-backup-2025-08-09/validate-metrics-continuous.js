/**
 * Script de Validação Contínua de Métricas
 * 
 * Implementa o Framework Context Engineering para monitoramento
 * automático da qualidade dos dados de métricas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Executa validação usando as funções SQL independentes
 * criadas pelo Framework Context Engineering
 */
async function runIndependentSQLValidation() {
  console.log('🔍 EXECUTANDO VALIDAÇÕES SQL INDEPENDENTES');
  console.log('📋 Framework Context Engineering - Validação Automatizada\n');

  const validationResults = {
    revenue_consistency: [],
    field_semantics: [],
    ai_efficiency: [],
    data_quality_score: 0
  };

  try {
    // 1. Validação de Consistência de Receita
    console.log('💰 Validando consistência de receita...');
    const { data: revenueValidation, error: revenueError } = await supabase
      .rpc('validate_revenue_consistency');

    if (revenueError) {
      console.error('❌ Erro na validação de receita:', revenueError.message);
    } else {
      validationResults.revenue_consistency = revenueValidation || [];
      const inconsistentCount = revenueValidation?.filter(r => r.discrepancy_percent > 5)?.length || 0;
      console.log(`   ✅ ${revenueValidation?.length || 0} registros verificados`);
      console.log(`   ⚠️ ${inconsistentCount} inconsistências detectadas`);
    }

    // 2. Validação de Campos Semânticos
    console.log('\n🏷️ Validando semântica de campos...');
    const { data: fieldValidation, error: fieldError } = await supabase
      .rpc('validate_field_semantics');

    if (fieldError) {
      console.error('❌ Erro na validação de campos:', fieldError.message);
    } else {
      validationResults.field_semantics = fieldValidation || [];
      const semanticIssues = fieldValidation?.filter(f => !f.semantic_match)?.length || 0;
      console.log(`   ✅ ${fieldValidation?.length || 0} campos verificados`);
      console.log(`   ⚠️ ${semanticIssues} problemas semânticos detectados`);
    }

    // 3. Validação de AI Efficiency
    console.log('\n🤖 Validando AI efficiency ranges...');
    const { data: aiValidation, error: aiError } = await supabase
      .rpc('validate_ai_efficiency_ranges');

    if (aiError) {
      console.error('❌ Erro na validação de AI:', aiError.message);
    } else {
      validationResults.ai_efficiency = aiValidation || [];
      const aiIssues = aiValidation?.filter(a => !a.within_expected_range)?.length || 0;
      console.log(`   ✅ ${aiValidation?.length || 0} cálculos de IA verificados`);
      console.log(`   ℹ️ ${aiIssues} valores fora do range esperado`);
    }

    // 4. Calcular Score de Qualidade Geral
    const totalChecks = (validationResults.revenue_consistency.length || 0) + 
                       (validationResults.field_semantics.length || 0) + 
                       (validationResults.ai_efficiency.length || 0);
    
    const totalIssues = inconsistentCount + semanticIssues + aiIssues;
    
    validationResults.data_quality_score = totalChecks > 0 ? 
      Math.round(((totalChecks - totalIssues) / totalChecks) * 100) : 100;

    console.log(`\n📊 SCORE DE QUALIDADE DOS DADOS: ${validationResults.data_quality_score}%`);

    return validationResults;

  } catch (error) {
    console.error('❌ Erro geral na validação:', error.message);
    return validationResults;
  }
}

/**
 * Identifica tenants que precisam de atenção imediata
 */
async function identifyTenantsNeedingAttention() {
  console.log('\n🎯 IDENTIFICANDO TENANTS CRÍTICOS...');

  try {
    // Buscar tenants com métricas zeradas mas dados reais
    const { data: problematicTenants, error } = await supabase
      .rpc('identify_revenue_discrepancies');

    if (error) {
      console.error('❌ Erro ao identificar tenants problemáticos:', error.message);
      return [];
    }

    const criticalTenants = problematicTenants?.filter(t => 
      t.stored_revenue === 0 && t.actual_revenue > 1000
    ) || [];

    console.log(`⚠️ ${criticalTenants.length} tenants críticos identificados:`);
    
    criticalTenants.forEach(tenant => {
      console.log(`   📍 ${tenant.tenant_id}: R$ ${tenant.actual_revenue.toFixed(2)} não contabilizados (${tenant.appointments_count} agendamentos)`);
    });

    return criticalTenants;

  } catch (error) {
    console.error('❌ Erro ao identificar tenants:', error.message);
    return [];
  }
}

/**
 * Gera relatório de saúde do sistema de métricas
 */
async function generateMetricsHealthReport() {
  console.log('\n📋 GERANDO RELATÓRIO DE SAÚDE DO SISTEMA');
  console.log('=' .repeat(60));

  const report = {
    timestamp: new Date().toISOString(),
    validation_results: null,
    critical_tenants: [],
    recommendations: [],
    overall_health: 'UNKNOWN'
  };

  try {
    // Executar validações
    report.validation_results = await runIndependentSQLValidation();
    report.critical_tenants = await identifyTenantsNeedingAttention();

    // Gerar recomendações baseadas nos resultados
    const qualityScore = report.validation_results.data_quality_score;
    const criticalCount = report.critical_tenants.length;

    if (qualityScore >= 95 && criticalCount === 0) {
      report.overall_health = 'EXCELLENT';
      report.recommendations.push('✅ Sistema operando com excelência');
    } else if (qualityScore >= 85 && criticalCount <= 2) {
      report.overall_health = 'GOOD';
      report.recommendations.push('🟡 Sistema em boa condição, pequenos ajustes recomendados');
    } else if (qualityScore >= 70 || criticalCount <= 5) {
      report.overall_health = 'WARNING';
      report.recommendations.push('⚠️ Atenção necessária - executar correções');
      if (criticalCount > 0) {
        report.recommendations.push(`🔧 Corrigir ${criticalCount} tenants críticos imediatamente`);
      }
    } else {
      report.overall_health = 'CRITICAL';
      report.recommendations.push('🚨 Intervenção urgente necessária');
      report.recommendations.push('🔧 Executar script de correção crítica');
      report.recommendations.push('📞 Alertar equipe de desenvolvimento');
    }

    // Exibir relatório
    console.log(`\n🏥 SAÚDE GERAL: ${report.overall_health}`);
    console.log(`📊 Score de Qualidade: ${qualityScore}%`);
    console.log(`⚠️ Tenants Críticos: ${criticalCount}`);
    
    console.log('\n💡 RECOMENDAÇÕES:');
    report.recommendations.forEach(rec => console.log(`   ${rec}`));

    // Salvar relatório
    const reportPath = `./metrics-health-report-${new Date().toISOString().split('T')[0]}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Relatório salvo: ${reportPath}`);

    return report;

  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error.message);
    report.overall_health = 'ERROR';
    report.recommendations.push(`❌ Erro na validação: ${error.message}`);
    return report;
  }
}

// Função principal para execução via cron
async function runContinuousValidation() {
  console.log('🚀 FRAMEWORK CONTEXT ENGINEERING - VALIDAÇÃO CONTÍNUA');
  console.log(`⏰ Execução: ${new Date().toLocaleString('pt-BR')}`);
  console.log('=' .repeat(70));

  try {
    const healthReport = await generateMetricsHealthReport();
    
    // Se estado crítico, sugerir ações imediatas
    if (healthReport.overall_health === 'CRITICAL' || healthReport.critical_tenants.length > 3) {
      console.log('\n🚨 AÇÃO IMEDIATA NECESSÁRIA:');
      console.log('   Executar: node fix-revenue-discrepancies-critical.js');
    }

    console.log('\n✅ Validação contínua concluída!');
    return healthReport;

  } catch (error) {
    console.error('❌ Erro na validação contínua:', error.message);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runContinuousValidation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Erro crítico:', error);
      process.exit(1);
    });
}

module.exports = {
  runContinuousValidation,
  generateMetricsHealthReport,
  runIndependentSQLValidation,
  identifyTenantsNeedingAttention
};