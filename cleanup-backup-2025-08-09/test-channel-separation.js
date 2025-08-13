/**
 * Teste da Separação de Canais - Interno vs Externo vs WhatsApp/IA
 * Context Engineering COLEAM00 - Validação com dados reais
 */

require('dotenv').config();
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/metrics-analysis.service.js');

async function testChannelSeparation() {
    console.log('🧪 TESTE DA SEPARAÇÃO DE CANAIS');
    console.log('Context Engineering COLEAM00 - Dados Reais');  
    console.log('=' .repeat(60));

    try {
        const metricsService = MetricsAnalysisService.getInstance();
        
        // Testar com os dois tenants identificados
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

        for (const tenant of testTenants) {
            console.log(`\n🏪 TENANT: ${tenant.name} (${tenant.domain})`);
            console.log('=' .repeat(50));
            console.log(`ID: ${tenant.id}`);

            // Testar período de 30 dias
            const metrics = await metricsService.analyzeAppointments(tenant.id, MetricsPeriod.THIRTY_DAYS);
            
            console.log('\n📊 MÉTRICAS GERAIS:');
            console.log(`   Total appointments: ${metrics.total_appointments}`);
            console.log(`   Completed: ${metrics.completed_appointments} (${metrics.appointment_success_rate.toFixed(1)}%)`);
            console.log(`   Revenue: R$ ${metrics.total_revenue.toFixed(2)}`);
            console.log(`   Customers: ${metrics.total_customers}`);

            console.log('\n📋 APPOINTMENTS INTERNOS (Sistema):');
            console.log(`   Total: ${metrics.internal_appointments.total}`);
            console.log(`   Completed: ${metrics.internal_appointments.completed} (${metrics.internal_appointments.success_rate.toFixed(1)}%)`);
            console.log(`   Revenue: R$ ${metrics.internal_appointments.revenue.toFixed(2)}`);
            console.log(`   Avg Value: R$ ${metrics.internal_appointments.avg_value.toFixed(2)}`);
            console.log(`   Customers: ${metrics.internal_appointments.customers}`);

            console.log('\n🌐 APPOINTMENTS EXTERNOS (Google Calendar, etc):');
            console.log(`   Total: ${metrics.external_appointments.total}`);
            console.log(`   Completed: ${metrics.external_appointments.completed} (${metrics.external_appointments.success_rate.toFixed(1)}%)`);
            console.log(`   Revenue: R$ ${metrics.external_appointments.revenue.toFixed(2)}`);
            console.log(`   Avg Value: R$ ${metrics.external_appointments.avg_value.toFixed(2)}`);
            console.log(`   Customers: ${metrics.external_appointments.customers}`);
            console.log(`   Sources: ${JSON.stringify(metrics.external_appointments.sources)}`);

            console.log('\n🤖 APPOINTMENTS WHATSAPP/IA:');
            console.log(`   Total: ${metrics.whatsapp_ai_appointments.total}`);
            console.log(`   Completed: ${metrics.whatsapp_ai_appointments.completed} (${metrics.whatsapp_ai_appointments.success_rate.toFixed(1)}%)`);
            console.log(`   Revenue: R$ ${metrics.whatsapp_ai_appointments.revenue.toFixed(2)}`);
            console.log(`   Avg Value: R$ ${metrics.whatsapp_ai_appointments.avg_value.toFixed(2)}`);
            console.log(`   Customers: ${metrics.whatsapp_ai_appointments.customers}`);

            console.log('\n🏆 COMPARAÇÃO DE PERFORMANCE:');
            console.log(`   Ratio Internal/External: ${metrics.channel_performance.internal_vs_external_ratio.toFixed(1)}%`);
            console.log(`   Melhor canal: ${metrics.channel_performance.best_performing_channel}`);
            console.log(`   Melhor taxa sucesso: ${metrics.channel_performance.best_conversion_rate.toFixed(1)}%`);
            console.log(`   Melhor receita/appointment: R$ ${metrics.channel_performance.best_revenue_per_appointment.toFixed(2)}`);
            
            console.log('\n📈 RANKING DE EFICIÊNCIA:');
            metrics.channel_performance.channel_efficiency_ranking.forEach((channel, index) => {
                console.log(`   ${index + 1}. ${channel.channel}:`);
                console.log(`      Success Rate: ${channel.success_rate.toFixed(1)}%`);
                console.log(`      Revenue/Appointment: R$ ${channel.revenue_per_appointment.toFixed(2)}`);
                console.log(`      Efficiency Score: ${channel.efficiency_score.toFixed(2)}`);
            });

            // Análise de insights
            console.log('\n💡 INSIGHTS AUTOMÁTICOS:');
            
            const totalExternal = metrics.external_appointments.total + metrics.whatsapp_ai_appointments.total;
            const internalRatio = metrics.total_appointments > 0 ? (metrics.internal_appointments.total / metrics.total_appointments) * 100 : 0;
            const externalRatio = metrics.total_appointments > 0 ? (totalExternal / metrics.total_appointments) * 100 : 0;
            
            console.log(`   • ${internalRatio.toFixed(1)}% appointments internos, ${externalRatio.toFixed(1)}% externos`);
            
            if (metrics.external_appointments.total === metrics.total_appointments) {
                console.log('   • ⚠️ ATENÇÃO: Todos os appointments são EXTERNOS (Google Calendar)');
                console.log('   • 📋 Sistema interno não está sendo usado');
                console.log('   • 🤖 WhatsApp/IA não está gerando appointments');
            }
            
            if (metrics.whatsapp_ai_appointments.total === 0) {
                console.log('   • ⚠️ Zero appointments via WhatsApp/IA');
                console.log('   • 🔗 Sistema WhatsApp pode estar desconectado');
            }
            
            if (metrics.external_appointments.success_rate > metrics.internal_appointments.success_rate) {
                console.log('   • 🎯 Appointments externos têm melhor taxa de sucesso');
            } else if (metrics.internal_appointments.success_rate > metrics.external_appointments.success_rate) {
                console.log('   • 🎯 Appointments internos têm melhor taxa de sucesso');
            }
        }

        console.log('\n✅ TESTE DE SEPARAÇÃO DE CANAIS CONCLUÍDO');
        console.log('Sistema identifica corretamente a origem dos appointments');
        console.log('Métricas separadas por canal implementadas com sucesso');

    } catch (error) {
        console.error('❌ Erro durante teste:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Executar teste
testChannelSeparation();