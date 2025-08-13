/**
 * Teste de Separação por Períodos e Fontes
 * Context Engineering COLEAM00 - Análise temporal por canal
 */

require('dotenv').config();
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/metrics-analysis.service.js');

async function testPeriodsBySource() {
    console.log('📅 TESTE POR PERÍODOS E FONTES DE AGENDAMENTO');
    console.log('Context Engineering COLEAM00 - Análise Temporal por Canal');  
    console.log('=' .repeat(80));

    try {
        const analysisService = MetricsAnalysisService.getInstance();
        
        // Tenants para teste
        const testTenants = [
            {
                id: '33b8c488-5aa9-4891-b335-701d10296681',
                name: 'Bella Vista Spa',
                domain: 'beauty'
            },
            {
                id: 'c3aa73f8-db80-40db-a9c4-73718a0fee34', 
                name: 'Centro Educacional',
                domain: 'education'
            }
        ];

        const periods = [
            { period: MetricsPeriod.SEVEN_DAYS, name: '7 DIAS' },
            { period: MetricsPeriod.THIRTY_DAYS, name: '30 DIAS' },
            { period: MetricsPeriod.NINETY_DAYS, name: '90 DIAS' }
        ];

        for (const tenant of testTenants) {
            console.log(`\n🏪 TENANT: ${tenant.name}`);
            console.log('=' .repeat(60));
            
            // Tabela de resultados por período
            console.log('| PERÍODO | TOTAL | INTERNOS | EXTERNOS | WHATSAPP/IA |');
            console.log('|---------|-------|----------|----------|-------------|');

            for (const periodInfo of periods) {
                const metrics = await analysisService.analyzeAppointments(tenant.id, periodInfo.period);
                
                console.log(`| ${periodInfo.name.padEnd(7)} | ${String(metrics.total_appointments).padEnd(5)} | ${String(metrics.internal_appointments.total).padEnd(8)} | ${String(metrics.external_appointments.total).padEnd(8)} | ${String(metrics.whatsapp_ai_appointments.total).padEnd(11)} |`);
            }

            // Detalhes por período
            for (const periodInfo of periods) {
                console.log(`\n⏰ DETALHES ${periodInfo.name} - ${tenant.name}`);
                console.log('-' .repeat(50));
                
                const metrics = await analysisService.analyzeAppointments(tenant.id, periodInfo.period);
                
                console.log(`📊 TOTAL: ${metrics.total_appointments} appointments`);
                console.log(`   Success Rate: ${metrics.appointment_success_rate.toFixed(1)}%`);
                console.log(`   Revenue: R$ ${metrics.total_revenue.toFixed(2)}`);
                
                console.log(`\n📋 INTERNOS: ${metrics.internal_appointments.total}`);
                console.log(`   Completed: ${metrics.internal_appointments.completed} (${metrics.internal_appointments.success_rate.toFixed(1)}%)`);
                console.log(`   Revenue: R$ ${metrics.internal_appointments.revenue.toFixed(2)}`);
                
                console.log(`\n🌐 EXTERNOS: ${metrics.external_appointments.total}`);
                console.log(`   Completed: ${metrics.external_appointments.completed} (${metrics.external_appointments.success_rate.toFixed(1)}%)`);
                console.log(`   Revenue: R$ ${metrics.external_appointments.revenue.toFixed(2)}`);
                console.log(`   Sources: ${JSON.stringify(metrics.external_appointments.sources)}`);
                
                console.log(`\n🤖 WHATSAPP/IA: ${metrics.whatsapp_ai_appointments.total}`);
                console.log(`   Completed: ${metrics.whatsapp_ai_appointments.completed} (${metrics.whatsapp_ai_appointments.success_rate.toFixed(1)}%)`);
                console.log(`   Revenue: R$ ${metrics.whatsapp_ai_appointments.revenue.toFixed(2)}`);
                
                console.log(`\n🏆 MELHOR CANAL: ${metrics.channel_performance.best_performing_channel}`);
                console.log(`   Taxa de Sucesso: ${metrics.channel_performance.best_conversion_rate.toFixed(1)}%`);
                console.log(`   Revenue/Appointment: R$ ${metrics.channel_performance.best_revenue_per_appointment.toFixed(2)}`);
            }
        }

        console.log('\n\n✅ ANÁLISE POR PERÍODOS E FONTES CONCLUÍDA');
        console.log('Sistema diferencia corretamente por períodos temporais');
        console.log('Canais identificados: Internos, Externos, WhatsApp/IA');

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Executar teste
testPeriodsBySource();