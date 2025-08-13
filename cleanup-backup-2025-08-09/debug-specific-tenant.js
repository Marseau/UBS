/**
 * Debug Specific Tenant - Bella Vista Spa
 */

require('dotenv').config();
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/services/metrics-analysis.service.js');

async function debugSpecificTenant() {
    console.log('🔍 DEBUG TENANT ESPECÍFICO - Bella Vista Spa');
    console.log('=' .repeat(60));

    try {
        const analysisService = MetricsAnalysisService.getInstance();
        
        // ID do Bella Vista Spa
        const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
        
        console.log(`🏪 Analisando tenant: ${tenantId}`);
        
        // Testar período de 7 dias
        const metrics = await analysisService.analyzeAppointments(tenantId, MetricsPeriod.SEVEN_DAYS);
        
        console.log('\n📊 RESULTADO METRICS ANALYSIS:');
        console.log(`   Total Appointments: ${metrics.total_appointments}`);
        console.log(`   Total Revenue: R$ ${metrics.total_revenue}`);
        console.log(`   Completed: ${metrics.completed_appointments}`);
        console.log(`   Internos: ${metrics.internal_appointments.total} (Revenue: R$ ${metrics.internal_appointments.revenue})`);
        console.log(`   Externos: ${metrics.external_appointments.total} (Revenue: R$ ${metrics.external_appointments.revenue})`);
        console.log(`   WhatsApp/IA: ${metrics.whatsapp_ai_appointments.total} (Revenue: R$ ${metrics.whatsapp_ai_appointments.revenue})`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }
}

debugSpecificTenant();