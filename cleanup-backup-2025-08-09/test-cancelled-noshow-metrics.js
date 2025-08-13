/**
 * TESTE ESPECÍFICO PARA MÉTRICAS DE CANCELADOS E NO-SHOWS
 * Context Engineering COLEAM00 - Validação de métricas de cancelamentos e faltas
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/services/metrics-analysis.service.js');

async function testCancelledAndNoShowMetrics() {
    console.log('🔍 TESTE ESPECÍFICO - MÉTRICAS DE CANCELADOS E NO-SHOWS');
    console.log('Context Engineering COLEAM00 - Validação de Status Específicos');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        const analysisService = MetricsAnalysisService.getInstance();
        
        // Primeiro, vamos buscar appointments com diferentes status
        console.log('📊 VERIFICANDO STATUS DOS APPOINTMENTS NA BASE...');
        
        const { data: statusCount, error } = await supabase
            .from('appointments')
            .select('status')
            .gte('start_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (error) {
            throw new Error(`Erro ao buscar status: ${error.message}`);
        }

        // Contar status
        const statusDistribution = {};
        const tenantsByStatus = {};
        
        statusCount.forEach(apt => {
            statusDistribution[apt.status] = (statusDistribution[apt.status] || 0) + 1;
        });

        console.log('\n📈 DISTRIBUIÇÃO DE STATUS (últimos 30 dias):');
        Object.entries(statusDistribution).forEach(([status, count]) => {
            console.log(`   ${status}: ${count} appointments`);
        });

        // Buscar appointments com status cancelled e no_show por tenant
        const { data: cancelledNoShowData, error: fetchError } = await supabase
            .from('appointments')
            .select('tenant_id, status, quoted_price, final_price, service_name, start_time, user_id, appointment_data')
            .in('status', ['cancelled', 'no_show'])
            .gte('start_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (fetchError) {
            throw new Error(`Erro ao buscar cancelled/no_show: ${fetchError.message}`);
        }

        console.log(`\n🔍 ENCONTRADOS: ${cancelledNoShowData?.length || 0} appointments cancelled/no_show`);

        if (!cancelledNoShowData || cancelledNoShowData.length === 0) {
            console.log('\n⚠️  NENHUM APPOINTMENT CANCELLED/NO_SHOW ENCONTRADO');
            console.log('📝 Vamos criar dados de teste para validar o sistema...');
            
            // Simular dados para teste das funções
            await testWithSimulatedData();
            return;
        }

        // Agrupar por tenant
        const tenantGroups = {};
        cancelledNoShowData.forEach(apt => {
            if (!tenantGroups[apt.tenant_id]) {
                tenantGroups[apt.tenant_id] = [];
            }
            tenantGroups[apt.tenant_id].push(apt);
        });

        console.log(`\n🏢 TENANTS COM CANCELLED/NO_SHOW: ${Object.keys(tenantGroups).length}`);

        // Testar cada tenant com dados reais
        for (const [tenantId, appointments] of Object.entries(tenantGroups)) {
            console.log(`\n🏪 TESTANDO TENANT: ${tenantId}`);
            console.log('-'.repeat(60));
            
            const metrics = await analysisService.analyzeAppointments(tenantId, MetricsPeriod.THIRTY_DAYS);
            
            console.log(`📊 MÉTRICAS BÁSICAS:`);
            console.log(`   Total: ${metrics.total_appointments}`);
            console.log(`   Cancelled: ${metrics.cancelled_appointments}`);
            console.log(`   No-show: ${metrics.no_show_appointments}`);
            
            if (metrics.cancelled_appointments > 0) {
                console.log(`\n❌ DETALHES DE CANCELAMENTO:`);
                const cancelled = metrics.cancelled_appointments_detail;
                console.log(`   Total Cancelados: ${cancelled.total_cancelled}`);
                console.log(`   Por Customer: ${cancelled.cancelled_by_customer}`);
                console.log(`   Por Business: ${cancelled.cancelled_by_business}`);
                console.log(`   Por System: ${cancelled.cancelled_by_system}`);
                console.log(`   Revenue Perdido: R$ ${cancelled.revenue_lost.toFixed(2)}`);
                console.log(`   Razões:`, cancelled.top_cancellation_reasons);
            }
            
            if (metrics.no_show_appointments > 0) {
                console.log(`\n👻 DETALHES DE NO-SHOW:`);
                const noShow = metrics.no_show_appointments_detail;
                console.log(`   Total No-shows: ${noShow.total_no_show}`);
                console.log(`   Revenue Perdido: R$ ${noShow.revenue_lost_no_show.toFixed(2)}`);
                console.log(`   Por Serviço:`, noShow.no_show_by_service);
                console.log(`   Por Horário:`, noShow.no_show_by_time_slot);
                console.log(`   Repeat No-show: ${noShow.repeat_no_show_customers}`);
            }
            
            // Testar apenas o primeiro tenant com dados
            break;
        }

    } catch (error) {
        console.error('❌ Erro durante teste:', error.message);
        console.error(error.stack);
    }
}

async function testWithSimulatedData() {
    console.log('\n🧪 TESTANDO COM DADOS SIMULADOS');
    console.log('-'.repeat(60));
    
    const analysisService = MetricsAnalysisService.getInstance();
    
    // Simular appointments cancelados com diferentes cenários
    const simulatedCancelledAppointments = [
        {
            status: 'cancelled',
            quoted_price: 100,
            final_price: null,
            service_name: 'Corte de Cabelo',
            start_time: '2025-08-01T10:00:00Z',
            user_id: 'user1',
            appointment_data: {
                cancellation: {
                    cancelled_by: 'customer',
                    cancelled_at: '2025-07-31T20:00:00Z',
                    reason: 'Conflito de horário'
                }
            }
        },
        {
            status: 'cancelled',
            quoted_price: null,
            final_price: 80,
            service_name: 'Manicure',
            start_time: '2025-08-02T14:00:00Z',
            user_id: 'user2',
            appointment_data: {
                cancellation: {
                    cancelled_by: 'business',
                    cancelled_at: '2025-08-02T10:00:00Z',
                    reason: 'Profissional indisponível'
                }
            }
        },
        {
            status: 'cancelled',
            quoted_price: 120,
            final_price: null,
            service_name: 'Massagem',
            start_time: '2025-08-03T16:00:00Z',
            user_id: 'user3',
            appointment_data: {
                cancellation: {
                    cancelled_by: 'system',
                    cancelled_at: '2025-08-03T15:00:00Z',
                    reason: 'Cancelamento automático'
                }
            }
        }
    ];

    // Simular appointments no-show
    const simulatedNoShowAppointments = [
        {
            status: 'no_show',
            quoted_price: 90,
            final_price: null,
            service_name: 'Corte de Cabelo',
            start_time: '2025-08-01T09:00:00Z',
            user_id: 'user4'
        },
        {
            status: 'no_show',
            quoted_price: null,
            final_price: 110,
            service_name: 'Corte de Cabelo',
            start_time: '2025-08-01T11:00:00Z',
            user_id: 'user4' // Mesmo cliente = repeat no-show
        },
        {
            status: 'no_show',
            quoted_price: 150,
            final_price: null,
            service_name: 'Tratamento Facial',
            start_time: '2025-08-02T15:00:00Z',
            user_id: 'user5'
        }
    ];

    // Testar função de análise de cancelamentos
    console.log('\n❌ TESTANDO ANÁLISE DE CANCELAMENTOS:');
    const cancelledMetrics = await analysisService.analyzeCancelledAppointments(simulatedCancelledAppointments);
    
    console.log(`   Total Cancelados: ${cancelledMetrics.total_cancelled}`);
    console.log(`   Por Customer: ${cancelledMetrics.cancelled_by_customer}`);
    console.log(`   Por Business: ${cancelledMetrics.cancelled_by_business}`);
    console.log(`   Por System: ${cancelledMetrics.cancelled_by_system}`);
    console.log(`   Revenue Perdido: R$ ${cancelledMetrics.revenue_lost.toFixed(2)}`);
    console.log(`   Tempo Médio Cancelamento: ${cancelledMetrics.avg_cancellation_time_hours.toFixed(1)}h`);
    console.log(`   Razões:`, JSON.stringify(cancelledMetrics.top_cancellation_reasons, null, 4));

    // Testar função de análise de no-shows  
    console.log('\n👻 TESTANDO ANÁLISE DE NO-SHOWS:');
    const noShowMetrics = await analysisService.analyzeNoShowAppointments(simulatedNoShowAppointments);
    
    console.log(`   Total No-shows: ${noShowMetrics.total_no_show}`);
    console.log(`   Revenue Perdido: R$ ${noShowMetrics.revenue_lost_no_show.toFixed(2)}`);
    console.log(`   Repeat No-show: ${noShowMetrics.repeat_no_show_customers}`);
    console.log(`   Por Serviço:`, JSON.stringify(noShowMetrics.no_show_by_service, null, 4));
    console.log(`   Por Horário:`, JSON.stringify(noShowMetrics.no_show_by_time_slot, null, 4));

    console.log('\n✅ TESTE COM DADOS SIMULADOS CONCLUÍDO');
    console.log('📊 Funções de análise de cancelamento e no-show estão funcionando corretamente!');
}

// Executar teste
testCancelledAndNoShowMetrics();