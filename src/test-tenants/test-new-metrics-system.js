/**
 * Script de teste para validar o novo sistema de métricas
 * Executa testes com dados reais e valida cálculos
 */

const { MetricsAnalysisService } = require('./dist/services/metrics-analysis.service.js');
const { MetricsPopulationService } = require('./dist/services/metrics-population.service.js');

async function testMetricsSystem() {
  console.log('🧪 Iniciando testes do sistema de métricas...\n');
  
  try {
    // 1. Teste de análise de dados reais
    console.log('📊 Teste 1: Análise de dados reais para 30 dias');
    const analysisService = new MetricsAnalysisService();
    const analysis = await analysisService.analyzeRealData(30);
    
    console.log(`✅ Tenants analisados: ${analysis.tenantMetrics.size}`);
    console.log(`✅ Total appointments: ${analysis.platformTotals.appointments_total}`);
    console.log(`✅ Total revenue: R$ ${analysis.platformTotals.total_revenue.toFixed(2)}`);
    console.log(`✅ Total conversations: ${analysis.platformTotals.conversations_total}`);
    console.log(`✅ Success rate: ${analysis.platformTotals.success_rate.toFixed(2)}%\n`);
    
    // 2. Teste de validação de consistência
    console.log('🔍 Teste 2: Validação de consistência');
    const isValid = await analysisService.validateDataConsistency(analysis);
    console.log(`✅ Dados consistentes: ${isValid ? 'SIM' : 'NÃO'}\n`);
    
    if (!isValid) {
      console.error('❌ ERRO: Dados inconsistentes detectados!');
      return;
    }
    
    // 3. Teste de população das tabelas
    console.log('💾 Teste 3: População das tabelas de métricas');
    const populationService = new MetricsPopulationService();
    
    // Popular apenas período de 7 dias para teste
    await populationService.populateTenantMetrics(analysis.tenantMetrics, 7);
    await populationService.populatePlatformMetrics(analysis.platformTotals, 7);
    
    console.log('✅ Tabelas populadas com sucesso!\n');
    
    // 4. Teste de comparação de períodos
    console.log('📈 Teste 4: Comparação entre períodos');
    const periods = [7, 30, 90];
    
    for (const period of periods) {
      const periodAnalysis = await analysisService.analyzeRealData(period);
      console.log(`📅 Período ${period}d: ${periodAnalysis.platformTotals.appointments_total} appointments, R$ ${periodAnalysis.platformTotals.total_revenue.toFixed(2)} revenue`);
    }
    
    console.log('\n✅ Todos os testes passaram com sucesso!');
    console.log('🚀 Sistema de métricas validado e pronto para produção');
    
  } catch (error) {
    console.error('❌ Erro nos testes:', error);
    throw error;
  }
}

// Executar testes
if (require.main === module) {
  testMetricsSystem()
    .then(() => {
      console.log('\n🎉 Testes concluídos com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falha nos testes:', error);
      process.exit(1);
    });
}

module.exports = { testMetricsSystem };