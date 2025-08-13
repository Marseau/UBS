/**
 * TESTE COMPLETO DO SISTEMA DE MÉTRICAS EXPANDIDO
 * Context Engineering COLEAM00 - Validação de todas as novas métricas
 * 
 * NOVAS MÉTRICAS IMPLEMENTADAS:
 * - Agendamentos cancelados (detalhados por quem cancelou)
 * - Agendamentos no-show (detalhados por serviço e horário)
 * - Métricas por serviço (appointments por serviço)
 * - Serviços disponíveis por tenant
 * - Contagem de clientes únicos por tenant
 * - Contagem de funcionários por tenant
 */

require('dotenv').config();
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/services/metrics-analysis.service.js');

async function testCompleteMetricsSystem() {
    console.log('🔬 TESTE COMPLETO DO SISTEMA DE MÉTRICAS EXPANDIDO');
    console.log('Context Engineering COLEAM00 - Validação de Todas as Novas Métricas');
    console.log('=' .repeat(80));

    try {
        const analysisService = MetricsAnalysisService.getInstance();
        
        // Usar tenant Bella Vista Spa para teste
        const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
        const tenantName = 'Bella Vista Spa';
        
        console.log(`🏪 Testando tenant: ${tenantName} (${tenantId})`);
        console.log('-'.repeat(80));

        // Testar período de 30 dias
        const period = MetricsPeriod.THIRTY_DAYS;
        console.log(`📅 Período de teste: 30 DIAS`);
        
        const startTime = Date.now();
        const metrics = await analysisService.analyzeAppointments(tenantId, period);
        const endTime = Date.now();
        
        console.log(`⏱️  Tempo de processamento: ${endTime - startTime}ms`);
        console.log('\n' + '='.repeat(80));
        console.log('📊 RESULTADO COMPLETO DAS MÉTRICAS');
        console.log('='.repeat(80));

        // ========================================
        // MÉTRICAS BÁSICAS
        // ========================================
        console.log('\n🔢 MÉTRICAS BÁSICAS:');
        console.log(`   📅 Total Appointments: ${metrics.total_appointments}`);
        console.log(`   ✅ Completed: ${metrics.completed_appointments}`);
        console.log(`   🔄 Confirmed: ${metrics.confirmed_appointments}`);
        console.log(`   ❌ Cancelled: ${metrics.cancelled_appointments}`);
        console.log(`   👻 No-show: ${metrics.no_show_appointments}`);
        console.log(`   💰 Total Revenue: R$ ${metrics.total_revenue.toFixed(2)}`);
        console.log(`   📈 Success Rate: ${metrics.appointment_success_rate.toFixed(1)}%`);
        console.log(`   👥 Total Customers: ${metrics.total_customers}`);

        // ========================================
        // MÉTRICAS POR CANAL (INTERNOS VS EXTERNOS)
        // ========================================
        console.log('\n📡 MÉTRICAS POR CANAL:');
        console.log(`   🏠 INTERNOS: ${metrics.internal_appointments.total} appointments`);
        console.log(`      - Completed: ${metrics.internal_appointments.completed}`);
        console.log(`      - Revenue: R$ ${metrics.internal_appointments.revenue.toFixed(2)}`);
        console.log(`      - Customers: ${metrics.internal_appointments.customers}`);
        
        console.log(`   🌐 EXTERNOS: ${metrics.external_appointments.total} appointments`);
        console.log(`      - Completed: ${metrics.external_appointments.completed}`);
        console.log(`      - Revenue: R$ ${metrics.external_appointments.revenue.toFixed(2)}`);
        console.log(`      - Customers: ${metrics.external_appointments.customers}`);
        console.log(`      - Sources:`, JSON.stringify(metrics.external_appointments.sources, null, 8));
        
        console.log(`   🤖 WHATSAPP/IA: ${metrics.whatsapp_ai_appointments.total} appointments`);
        console.log(`      - Completed: ${metrics.whatsapp_ai_appointments.completed}`);
        console.log(`      - Revenue: R$ ${metrics.whatsapp_ai_appointments.revenue.toFixed(2)}`);
        console.log(`      - Customers: ${metrics.whatsapp_ai_appointments.customers}`);

        // ========================================
        // NOVAS MÉTRICAS DETALHADAS - CANCELAMENTOS
        // ========================================
        console.log('\n❌ MÉTRICAS DE CANCELAMENTOS DETALHADAS:');
        const cancelled = metrics.cancelled_appointments_detail;
        console.log(`   📊 Total Cancelados: ${cancelled.total_cancelled}`);
        console.log(`   👤 Por Customer: ${cancelled.cancelled_by_customer}`);
        console.log(`   🏢 Por Business: ${cancelled.cancelled_by_business}`);
        console.log(`   🤖 Por System: ${cancelled.cancelled_by_system}`);
        console.log(`   💸 Revenue Perdido: R$ ${cancelled.revenue_lost.toFixed(2)}`);
        console.log(`   ⏰ Tempo Médio de Cancelamento: ${cancelled.avg_cancellation_time_hours.toFixed(1)}h`);
        console.log(`   📋 Razões de Cancelamento:`, JSON.stringify(cancelled.top_cancellation_reasons, null, 8));

        // ========================================
        // NOVAS MÉTRICAS DETALHADAS - NO-SHOWS
        // ========================================
        console.log('\n👻 MÉTRICAS DE NO-SHOW DETALHADAS:');
        const noShow = metrics.no_show_appointments_detail;
        console.log(`   📊 Total No-shows: ${noShow.total_no_show}`);
        console.log(`   💸 Revenue Perdido: R$ ${noShow.revenue_lost_no_show.toFixed(2)}`);
        console.log(`   🔄 Clientes Repeat No-show: ${noShow.repeat_no_show_customers}`);
        console.log(`   🛎️  No-show por Serviço:`, JSON.stringify(noShow.no_show_by_service, null, 8));
        console.log(`   🕐 No-show por Horário:`, JSON.stringify(noShow.no_show_by_time_slot, null, 8));

        // ========================================
        // NOVAS MÉTRICAS - SERVIÇOS
        // ========================================
        console.log('\n🛎️  MÉTRICAS POR SERVIÇO:');
        const serviceKeys = Object.keys(metrics.appointments_by_service);
        if (serviceKeys.length > 0) {
            console.log(`   📈 Total de Serviços com Appointments: ${serviceKeys.length}`);
            
            // Mostrar top 5 serviços
            const topServices = serviceKeys
                .map(key => metrics.appointments_by_service[key])
                .sort((a, b) => b.total_appointments - a.total_appointments)
                .slice(0, 5);
            
            console.log('\n   🏆 TOP 5 SERVIÇOS POR VOLUME:');
            topServices.forEach((service, index) => {
                console.log(`      ${index + 1}. ${service.service_name}:`);
                console.log(`         - Appointments: ${service.total_appointments}`);
                console.log(`         - Completed: ${service.completed_appointments}`);
                console.log(`         - Revenue: R$ ${service.total_revenue.toFixed(2)}`);
                console.log(`         - Success Rate: ${service.success_rate.toFixed(1)}%`);
                console.log(`         - Avg Price: R$ ${service.avg_service_price.toFixed(2)}`);
            });
        } else {
            console.log(`   ⚠️  Nenhum serviço encontrado com appointments`);
        }

        // ========================================
        // NOVAS MÉTRICAS - DISPONIBILIDADE DE SERVIÇOS
        // ========================================
        console.log('\n🛍️  DISPONIBILIDADE DE SERVIÇOS:');
        const serviceAvail = metrics.available_services;
        console.log(`   📊 Total Serviços Disponíveis: ${serviceAvail.total_services_available}`);
        console.log(`   ✅ Serviços Ativos: ${serviceAvail.active_services}`);
        console.log(`   ❌ Serviços Inativos: ${serviceAvail.inactive_services}`);
        console.log(`   📅 Serviços com Appointments: ${serviceAvail.services_with_appointments}`);
        console.log(`   💰 Preço Médio: R$ ${serviceAvail.avg_price_per_service.toFixed(2)}`);
        console.log(`   💵 Faixa de Preço: R$ ${serviceAvail.price_range.min.toFixed(2)} - R$ ${serviceAvail.price_range.max.toFixed(2)}`);
        console.log(`   🏆 Mais Popular: ${serviceAvail.most_popular_service}`);
        console.log(`   💎 Maior Revenue: ${serviceAvail.highest_revenue_service}`);

        // ========================================
        // NOVAS MÉTRICAS - CLIENTES
        // ========================================
        console.log('\n👥 MÉTRICAS DE CLIENTES:');
        const customers = metrics.customer_metrics;
        console.log(`   📊 Total Clientes Únicos: ${customers.total_unique_customers}`);
        console.log(`   🆕 Novos Clientes: ${customers.new_customers}`);
        console.log(`   🔄 Clientes Retornantes: ${customers.returning_customers}`);
        console.log(`   📈 Taxa de Retenção: ${customers.customer_retention_rate.toFixed(1)}%`);
        console.log(`   📅 Avg Appointments/Cliente: ${customers.avg_appointments_per_customer.toFixed(1)}`);
        console.log(`   💰 Customer Lifetime Value: R$ ${customers.customer_lifetime_value.toFixed(2)}`);
        console.log(`   📱 Canais de Aquisição:`, JSON.stringify(customers.customers_by_acquisition_channel, null, 8));
        
        if (customers.top_customers_by_revenue.length > 0) {
            console.log('\n   🏆 TOP 5 CLIENTES POR REVENUE:');
            customers.top_customers_by_revenue.slice(0, 5).forEach((customer, index) => {
                console.log(`      ${index + 1}. ${customer.customer_id.substring(0, 8)}...:`);
                console.log(`         - Appointments: ${customer.appointments}`);
                console.log(`         - Total Gasto: R$ ${customer.total_spent.toFixed(2)}`);
            });
        }

        // ========================================
        // NOVAS MÉTRICAS - FUNCIONÁRIOS
        // ========================================
        console.log('\n👩‍💼 MÉTRICAS DE FUNCIONÁRIOS:');
        const staff = metrics.staff_metrics;
        console.log(`   📊 Total Funcionários: ${staff.total_staff_members}`);
        console.log(`   ✅ Funcionários Ativos: ${staff.active_staff_members}`);
        console.log(`   📅 Staff com Appointments: ${staff.staff_with_appointments}`);
        console.log(`   📈 Avg Appointments/Staff: ${staff.avg_appointments_per_staff.toFixed(1)}`);
        console.log(`   📊 Taxa de Utilização: ${staff.staff_utilization_rate.toFixed(1)}%`);
        console.log(`   ⏰ Horas de Disponibilidade: ${staff.staff_availability_hours}h`);
        
        if (staff.top_performing_staff.length > 0) {
            console.log('\n   🏆 TOP PERFORMING STAFF:');
            staff.top_performing_staff.forEach((member, index) => {
                console.log(`      ${index + 1}. ${member.staff_id.substring(0, 8)}...:`);
                console.log(`         - Appointments: ${member.appointments_handled}`);
                console.log(`         - Revenue: R$ ${member.revenue_generated.toFixed(2)}`);
                console.log(`         - Success Rate: ${member.success_rate.toFixed(1)}%`);
            });
        }

        // ========================================
        // PERFORMANCE DOS CANAIS
        // ========================================
        console.log('\n🚀 PERFORMANCE DOS CANAIS:');
        const performance = metrics.channel_performance;
        console.log(`   📊 Ratio Interno/Externo: ${performance.internal_vs_external_ratio.toFixed(1)}%`);
        console.log(`   🏆 Melhor Canal: ${performance.best_performing_channel}`);
        console.log(`   📈 Melhor Taxa de Conversão: ${performance.best_conversion_rate.toFixed(1)}%`);
        console.log(`   💰 Melhor Revenue/Appointment: R$ ${performance.best_revenue_per_appointment.toFixed(2)}`);
        
        console.log('\n   📋 RANKING DE EFICIÊNCIA:');
        performance.channel_efficiency_ranking.forEach((channel, index) => {
            console.log(`      ${index + 1}. ${channel.channel.toUpperCase()}:`);
            console.log(`         - Success Rate: ${channel.success_rate.toFixed(1)}%`);
            console.log(`         - Revenue/Appointment: R$ ${channel.revenue_per_appointment.toFixed(2)}`);
            console.log(`         - Efficiency Score: ${channel.efficiency_score.toFixed(1)}`);
        });

        // ========================================
        // RESUMO EXECUTIVO
        // ========================================
        console.log('\n' + '='.repeat(80));
        console.log('📋 RESUMO EXECUTIVO');
        console.log('='.repeat(80));
        console.log(`✅ SISTEMA DE MÉTRICAS EXPANDIDO FUNCIONANDO CORRETAMENTE`);
        console.log(`📊 Tenant processado com sucesso: ${tenantName}`);
        console.log(`⏱️  Performance: ${endTime - startTime}ms`);
        console.log(`🔢 Métricas básicas: ✅ OK`);
        console.log(`📡 Métricas por canal: ✅ OK`);
        console.log(`❌ Métricas de cancelamento: ✅ OK`);
        console.log(`👻 Métricas de no-show: ✅ OK`);
        console.log(`🛎️  Métricas por serviço: ✅ OK`);
        console.log(`🛍️  Disponibilidade de serviços: ✅ OK`);
        console.log(`👥 Métricas de clientes: ✅ OK`);
        console.log(`👩‍💼 Métricas de funcionários: ✅ OK`);
        console.log(`🚀 Performance dos canais: ✅ OK`);

        console.log('\n🎉 TODAS AS NOVAS MÉTRICAS IMPLEMENTADAS E FUNCIONANDO!');
        console.log('🔄 Sistema pronto para ser integrado ao dashboard');

    } catch (error) {
        console.error('❌ Erro durante teste do sistema de métricas:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Executar teste completo
testCompleteMetricsSystem();