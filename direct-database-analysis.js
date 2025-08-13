/**
 * ANÁLISE DIRETA DA BASE DE DADOS - SEM TABELAS MÉTRICAS
 * Busca informações diretamente nas tabelas originais
 */

const { supabaseAdmin } = require('./dist/config/database.js');

async function analyzeDirectDatabase() {
    console.log('🔍 ANÁLISE DIRETA DA BASE DE DADOS');
    console.log('📅 Períodos: 7 e 30 dias');
    console.log('🎯 Consultando tabelas originais (tenants, conversation_history, appointments)');
    console.log('='.repeat(80));

    const results = {};

    // Definir períodos
    const periods = [7, 30];
    
    for (const days of periods) {
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - days);
        
        console.log(`\n📊 ANÁLISE PARA ÚLTIMOS ${days} DIAS`);
        console.log(`📅 De: ${periodStart.toISOString().split('T')[0]} até hoje`);
        console.log('─'.repeat(50));

        // ===== 1. TENANTS ATIVOS =====
        console.log('🔄 Consultando tenants...');
        const { data: tenants, error: tenantsError } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');

        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            continue;
        }

        const activeTenants = tenants.length;
        console.log(`🏢 TENANTS ATIVOS: ${activeTenants}`);

        // ===== 2. MRR DA PLATAFORMA (todos tenants no plano básico) =====
        const mrrPlatform = activeTenants * 44.48; // Plano básico R$ 44,48
        console.log(`💰 MRR PLATAFORMA: R$ ${mrrPlatform.toFixed(2)}`);

        // ===== 3. CONVERSAS NO PERÍODO =====
        console.log('🔄 Consultando conversation_history...');
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversation_history')
            .select('id, tenant_id, user_id, is_from_user, conversation_outcome, created_at')
            .gte('created_at', periodStart.toISOString());

        if (convError) {
            console.error('❌ Erro ao buscar conversas:', convError);
            continue;
        }

        const totalConversations = conversations.length;
        const totalInteractionsIA = totalConversations; // Cada mensagem é uma interação
        console.log(`💬 QUANTAS CONVERSAS: ${totalConversations}`);
        console.log(`🤖 TOTAL INTERAÇÕES IA: ${totalInteractionsIA}`);

        // ===== 4. ANÁLISE DE OUTCOMES DAS CONVERSAS =====
        console.log('🔄 Analisando outcomes...');
        
        // Contar outcomes específicos
        const appointmentCreated = conversations.filter(c => c.conversation_outcome === 'appointment_created').length;
        const appointmentCancelled = conversations.filter(c => c.conversation_outcome === 'appointment_cancelled').length;
        const appointmentRescheduled = conversations.filter(c => c.conversation_outcome === 'appointment_rescheduled').length;
        const appointmentConfirmed = conversations.filter(c => c.conversation_outcome === 'appointment_confirmed').length;
        const priceInquiry = conversations.filter(c => c.conversation_outcome === 'price_inquiry').length;
        const infoRequest = conversations.filter(c => c.conversation_outcome === 'info_request_fulfilled').length;
        const bookingAbandoned = conversations.filter(c => c.conversation_outcome === 'booking_abandoned').length;
        const wrongNumber = conversations.filter(c => c.conversation_outcome === 'wrong_number').length;
        const spamDetected = conversations.filter(c => c.conversation_outcome === 'spam_detected').length;

        console.log('📋 CONVERSAS POR OUTCOME:');
        console.log(`   📅 Conversas com agendamentos criados: ${appointmentCreated}`);
        console.log(`   ❌ Conversas com agendamentos cancelados: ${appointmentCancelled}`);
        console.log(`   📝 Conversas com agendamentos remarcados: ${appointmentRescheduled}`);
        console.log(`   ✅ Conversas com agendamentos confirmados: ${appointmentConfirmed}`);
        console.log(`   💰 Conversas de preço: ${priceInquiry}`);
        console.log(`   ℹ️  Conversas de informações: ${infoRequest}`);
        console.log(`   🔄 Conversas abandonadas: ${bookingAbandoned}`);
        console.log(`   ❌ Conversas de números errados: ${wrongNumber}`);
        console.log(`   🚫 Conversas de spam: ${spamDetected}`);

        // ===== 5. AGENDAMENTOS NO PERÍODO =====
        console.log('🔄 Consultando appointments...');
        const { data: appointments, error: aptError } = await supabaseAdmin
            .from('appointments')
            .select('id, status, created_at')
            .gte('created_at', periodStart.toISOString());

        if (aptError) {
            console.error('❌ Erro ao buscar appointments:', aptError);
            continue;
        }

        const totalAppointments = appointments.length;
        console.log(`📅 QUANTOS AGENDAMENTOS: ${totalAppointments}`);

        // Contar agendamentos por status
        const appointmentsConfirmed = appointments.filter(a => a.status === 'confirmed').length;
        const appointmentsCancelled = appointments.filter(a => a.status === 'cancelled').length;
        const appointmentsRescheduled = appointments.filter(a => a.status === 'rescheduled').length;
        const appointmentsPending = appointments.filter(a => a.status === 'pending').length;
        const appointmentsNoShow = appointments.filter(a => a.status === 'no_show').length;

        console.log('📅 AGENDAMENTOS POR STATUS:');
        console.log(`   ✅ Quantos agendamentos confirmados: ${appointmentsConfirmed}`);
        console.log(`   ❌ Quantos agendamentos cancelados: ${appointmentsCancelled}`);
        console.log(`   📝 Quantos agendamentos remarcados: ${appointmentsRescheduled}`);
        console.log(`   ⏳ Agendamentos pendentes: ${appointmentsPending}`);
        console.log(`   🚫 Agendamentos no-show: ${appointmentsNoShow}`);

        // Salvar resultados
        results[`${days}days`] = {
            period: days,
            activeTenants,
            mrrPlatform,
            totalConversations,
            totalInteractionsIA,
            outcomes: {
                appointmentCreated,
                appointmentCancelled,
                appointmentRescheduled,
                appointmentConfirmed,
                priceInquiry,
                infoRequest,
                bookingAbandoned,
                wrongNumber,
                spamDetected
            },
            totalAppointments,
            appointmentsByStatus: {
                confirmed: appointmentsConfirmed,
                cancelled: appointmentsCancelled,
                rescheduled: appointmentsRescheduled,
                pending: appointmentsPending,
                no_show: appointmentsNoShow
            }
        };
    }

    // ===== RESUMO COMPARATIVO =====
    console.log('\n📊 RESUMO COMPARATIVO FINAL');
    console.log('='.repeat(80));
    
    const data7 = results['7days'];
    const data30 = results['30days'];

    console.log(`MÉTRICA                              |  7 DIAS   |  30 DIAS`);
    console.log('─'.repeat(80));
    console.log(`🏢 Quantos tenants ativos            |   ${data7.activeTenants.toString().padStart(6)}  |   ${data30.activeTenants.toString().padStart(6)}`);
    console.log(`💰 Qual o MRR da Plataforma          | R$${data7.mrrPlatform.toFixed(2).padStart(6)} | R$${data30.mrrPlatform.toFixed(2).padStart(6)}`);
    console.log(`💬 Quantas Conversas                 |   ${data7.totalConversations.toString().padStart(6)}  |   ${data30.totalConversations.toString().padStart(6)}`);
    console.log(`📅 Quantos Agendamentos              |   ${data7.totalAppointments.toString().padStart(6)}  |   ${data30.totalAppointments.toString().padStart(6)}`);
    console.log(`🤖 Total interações IA               |   ${data7.totalInteractionsIA.toString().padStart(6)}  |   ${data30.totalInteractionsIA.toString().padStart(6)}`);

    console.log('\n📋 CONVERSAS POR TIPO (Outcomes):');
    console.log(`📅 Conversas → agendamentos criados  |   ${data7.outcomes.appointmentCreated.toString().padStart(6)}  |   ${data30.outcomes.appointmentCreated.toString().padStart(6)}`);
    console.log(`❌ Conversas → agendamentos cancelad. |   ${data7.outcomes.appointmentCancelled.toString().padStart(6)}  |   ${data30.outcomes.appointmentCancelled.toString().padStart(6)}`);
    console.log(`📝 Conversas → agendamentos remarc.   |   ${data7.outcomes.appointmentRescheduled.toString().padStart(6)}  |   ${data30.outcomes.appointmentRescheduled.toString().padStart(6)}`);
    console.log(`✅ Conversas → agendamentos confirm.  |   ${data7.outcomes.appointmentConfirmed.toString().padStart(6)}  |   ${data30.outcomes.appointmentConfirmed.toString().padStart(6)}`);
    console.log(`💰 Conversas de preço                |   ${data7.outcomes.priceInquiry.toString().padStart(6)}  |   ${data30.outcomes.priceInquiry.toString().padStart(6)}`);
    console.log(`ℹ️  Conversas de informações          |   ${data7.outcomes.infoRequest.toString().padStart(6)}  |   ${data30.outcomes.infoRequest.toString().padStart(6)}`);
    console.log(`🔄 Conversas abandonadas             |   ${data7.outcomes.bookingAbandoned.toString().padStart(6)}  |   ${data30.outcomes.bookingAbandoned.toString().padStart(6)}`);
    console.log(`❌ Conversas números errados         |   ${data7.outcomes.wrongNumber.toString().padStart(6)}  |   ${data30.outcomes.wrongNumber.toString().padStart(6)}`);
    console.log(`🚫 Conversas spam                    |   ${data7.outcomes.spamDetected.toString().padStart(6)}  |   ${data30.outcomes.spamDetected.toString().padStart(6)}`);

    console.log('\n📅 AGENDAMENTOS POR STATUS:');
    console.log(`✅ Agendamentos confirmados          |   ${data7.appointmentsByStatus.confirmed.toString().padStart(6)}  |   ${data30.appointmentsByStatus.confirmed.toString().padStart(6)}`);
    console.log(`❌ Agendamentos cancelados           |   ${data7.appointmentsByStatus.cancelled.toString().padStart(6)}  |   ${data30.appointmentsByStatus.cancelled.toString().padStart(6)}`);
    console.log(`📝 Agendamentos remarcados           |   ${data7.appointmentsByStatus.rescheduled.toString().padStart(6)}  |   ${data30.appointmentsByStatus.rescheduled.toString().padStart(6)}`);

    console.log('\n✅ ANÁLISE DIRETA CONCLUÍDA!');
    console.log('🎯 Todas as informações obtidas diretamente das tabelas originais');
    
    return results;
}

// Executar análise
if (require.main === module) {
    analyzeDirectDatabase()
        .then(results => {
            console.log('\n🚀 Script executado com sucesso!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro na execução:', error);
            process.exit(1);
        });
}

module.exports = { analyzeDirectDatabase };