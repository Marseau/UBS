/**
 * VERIFICAR APPOINTMENTS FINAIS
 * 
 * Verificar o estado final dos appointments após correção
 */

const { supabaseAdmin } = require('./src/config/database');

async function verificarAppointmentsFinais() {
    try {
        console.log('🔍 Verificando estado final dos appointments...');

        // Buscar todas as estatísticas
        const { data: allAppointments, error } = await supabaseAdmin
            .from('appointments')
            .select('id, external_event_id, appointment_data, created_at');

        if (error) {
            console.error('❌ Erro ao buscar appointments:', error);
            return;
        }

        if (!allAppointments) {
            console.log('❌ Nenhum appointment encontrado');
            return;
        }

        // Calcular estatísticas
        const total = allAppointments.length;
        const externos = allAppointments.filter(a => a.external_event_id).length;
        const internos = total - externos;

        const whatsappSource = allAppointments.filter(a => 
            a.appointment_data?.source === 'whatsapp'
        ).length;

        const calendarSource = allAppointments.filter(a => 
            a.appointment_data?.source === 'google_calendar'
        ).length;

        console.log('\n📊 ESTATÍSTICAS FINAIS:');
        console.log(`   📝 Total appointments: ${total}`);
        console.log(`   📱 Internos (sem external_event_id): ${internos} - ${((internos/total)*100).toFixed(1)}%`);
        console.log(`   📅 Externos (com external_event_id): ${externos} - ${((externos/total)*100).toFixed(1)}%`);
        console.log(`   🔍 Source 'whatsapp': ${whatsappSource}`);
        console.log(`   🔍 Source 'google_calendar': ${calendarSource}`);

        // Exemplos
        const exemploInterno = allAppointments.find(a => !a.external_event_id);
        const exemploExterno = allAppointments.find(a => a.external_event_id);

        console.log('\n📋 EXEMPLOS:');
        if (exemploInterno) {
            console.log(`   🔸 INTERNO: ID ${exemploInterno.id}, external_event_id = NULL`);
            console.log(`      Source: ${exemploInterno.appointment_data?.source || 'N/A'}`);
        }
        if (exemploExterno) {
            console.log(`   🔸 EXTERNO: ID ${exemploExterno.id}, external_event_id = ${exemploExterno.external_event_id}`);
            console.log(`      Source: ${exemploExterno.appointment_data?.source || 'N/A'}`);
        }

        // Verificar criação recente
        const agora = new Date();
        const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
        
        const recentesExternos = allAppointments.filter(a => 
            a.external_event_id && 
            new Date(a.created_at) > umaHoraAtras
        ).length;

        console.log(`\n⏰ Appointments externos criados na última hora: ${recentesExternos}`);

        // Verificar se existem duplicatas de external_event_id
        const externalIds = allAppointments
            .filter(a => a.external_event_id)
            .map(a => a.external_event_id);
        
        const uniqueExternalIds = [...new Set(externalIds)];
        
        if (externalIds.length !== uniqueExternalIds.length) {
            console.log(`⚠️ ATENÇÃO: ${externalIds.length - uniqueExternalIds.length} external_event_id duplicados encontrados`);
        } else {
            console.log('✅ Todos external_event_id são únicos');
        }

        return {
            total,
            internos,
            externos,
            whatsappSource,
            calendarSource,
            recentesExternos
        };

    } catch (error) {
        console.error('❌ Erro na verificação:', error);
    }
}

// Executar
if (require.main === module) {
    verificarAppointmentsFinais()
        .then((stats) => {
            if (stats) {
                console.log('\n🎉 Verificação concluída!');
                console.log(`📊 Resultado: ${stats.internos} internos + ${stats.externos} externos = ${stats.total} total`);
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { verificarAppointmentsFinais };