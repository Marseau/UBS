/**
 * Test Integrated Risk Assessment - Test the updated tenant-metrics.service.ts
 * Validates that the new implementation works correctly
 */

require('dotenv').config();
const { TenantMetricsService } = require('../dist/services/tenant-metrics.service');

async function testIntegratedRiskAssessment() {
    try {
        console.log('🧪 TESTE DA MÉTRICA RISK ASSESSMENT INTEGRADA');
        console.log('═'.repeat(70));
        
        const metricsService = new TenantMetricsService();
        
        // Test with Bella Vista (known tenant with data)
        const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
        console.log(`🏢 Testando com Bella Vista: ${bellaVistaId}`);
        
        // Test for 30d period
        const period = '30d';
        console.log(`📅 Período: ${period}`);
        
        console.log('\n🔄 Executando calculateRiskAssessmentMetric...');
        await metricsService.calculateRiskAssessmentMetric(bellaVistaId, period);
        
        console.log('\n📊 Buscando métrica armazenada...');
        const storedMetric = await metricsService.getCachedMetric(bellaVistaId, 'risk_assessment', period);
        
        if (storedMetric) {
            console.log('✅ Métrica encontrada:');
            console.log(`   Risk Score: ${storedMetric.score}%`);
            console.log(`   Status: ${storedMetric.status}`);
            console.log(`   Level: ${storedMetric.level}`);
            console.log(`   Recomendações:`, storedMetric.recommendations);
            
            if (storedMetric.factors) {
                console.log('\n📈 Fatores de Risco:');
                Object.entries(storedMetric.factors).forEach(([factor, data]) => {
                    console.log(`   ${factor}: ${data.score} (${data.status})`);
                });
            }
        } else {
            console.log('❌ Métrica não encontrada no cache');
        }
        
        console.log('\n✅ Teste concluído com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        throw error;
    }
}

// Execute test
if (require.main === module) {
    testIntegratedRiskAssessment()
        .then(() => {
            console.log('\n🎉 Teste da métrica integrada concluído!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Teste falhou:', error);
            process.exit(1);
        });
}

module.exports = { testIntegratedRiskAssessment };