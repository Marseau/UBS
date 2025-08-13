/**
 * VERIFICAR ESTADO COMPLETO
 * 
 * Verificar estado completo dos appointments antes/depois das operações
 */

const { supabaseAdmin } = require('./src/config/database');

async function verificarEstadoCompleto() {
    try {
        console.log('🔍 Verificando estado completo dos appointments...');

        // 1. Contar todos os appointments
        const { data: todosAppointments, error: allError } = await supabaseAdmin
            .from('appointments')
            .select('id, external_event_id, appointment_data, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (allError) {
            console.error('❌ Erro ao buscar appointments:', allError);
            return;
        }

        const total = todosAppointments.length;
        const comExternalId = todosAppointments.filter(a => a.external_event_id).length;
        const semExternalId = total - comExternalId;

        console.log(`\n📊 TOTAIS:`);
        console.log(`   📝 Total appointments: ${total}`);
        console.log(`   📱 Com external_event_id: ${comExternalId}`);
        console.log(`   📅 Sem external_event_id: ${semExternalId}`);

        // 2. Por source
        const whatsappSource = todosAppointments.filter(a => 
            a.appointment_data?.source === 'whatsapp'
        ).length;

        const calendarSource = todosAppointments.filter(a => 
            a.appointment_data?.source === 'google_calendar'
        ).length;

        const semSource = todosAppointments.filter(a => 
            !a.appointment_data?.source
        ).length;

        console.log(`\n📋 POR SOURCE:`);
        console.log(`   🔸 'whatsapp': ${whatsappSource}`);
        console.log(`   🔸 'google_calendar': ${calendarSource}`);
        console.log(`   🔸 Sem source: ${semSource}`);

        // 3. Verificar datas de criação
        const agora = new Date();
        const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
        const umDiaAtras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

        const criadosUltimaHora = todosAppointments.filter(a => 
            new Date(a.created_at) > umaHoraAtras
        ).length;

        const criadosUltimoDia = todosAppointments.filter(a => 
            new Date(a.created_at) > umDiaAtras
        ).length;

        const atualizadosUltimaHora = todosAppointments.filter(a => 
            a.updated_at && new Date(a.updated_at) > umaHoraAtras
        ).length;

        console.log(`\n⏰ TEMPORAIS:`);
        console.log(`   🆕 Criados na última hora: ${criadosUltimaHora}`);
        console.log(`   📅 Criados no último dia: ${criadosUltimoDia}`);
        console.log(`   ✏️ Atualizados na última hora: ${atualizadosUltimaHora}`);

        // 4. Verificar duplicatas de external_event_id
        const externalIds = todosAppointments
            .filter(a => a.external_event_id)
            .map(a => a.external_event_id);
        
        const uniqueExternalIds = [...new Set(externalIds)];
        const duplicatas = externalIds.length - uniqueExternalIds.length;

        console.log(`\n🔍 VALIDAÇÃO:`);
        console.log(`   📊 External IDs únicos: ${uniqueExternalIds.length}`);
        console.log(`   ⚠️ Duplicatas: ${duplicatas}`);

        // 5. Amostras de dados
        const exemploInterno = todosAppointments.find(a => 
            !a.external_event_id && a.appointment_data?.source === 'whatsapp'
        );
        
        const exemploExterno = todosAppointments.find(a => 
            a.external_event_id && a.appointment_data?.source === 'google_calendar'
        );

        console.log(`\n📋 EXEMPLOS:`);
        if (exemploInterno) {
            console.log(`   🔸 INTERNO:`);
            console.log(`      ID: ${exemploInterno.id}`);
            console.log(`      External ID: ${exemploInterno.external_event_id || 'NULL'}`);
            console.log(`      Source: ${exemploInterno.appointment_data?.source || 'N/A'}`);
            console.log(`      Criado: ${exemploInterno.created_at}`);
        }

        if (exemploExterno) {
            console.log(`   🔸 EXTERNO:`);
            console.log(`      ID: ${exemploExterno.id}`);
            console.log(`      External ID: ${exemploExterno.external_event_id}`);
            console.log(`      Source: ${exemploExterno.appointment_data?.source}`);
            console.log(`      Criado: ${exemploExterno.created_at}`);
        }

        // 6. Análise de appointment_data
        const comAppointmentData = todosAppointments.filter(a => a.appointment_data).length;
        const semAppointmentData = total - comAppointmentData;

        console.log(`\n💾 APPOINTMENT_DATA:`);
        console.log(`   ✅ Com appointment_data: ${comAppointmentData}`);
        console.log(`   ❌ Sem appointment_data: ${semAppointmentData}`);

        // 7. Resumo final
        console.log(`\n🎯 RESUMO FINAL:`);
        console.log(`   📊 Total: ${total} appointments`);
        console.log(`   📱 Internos (WhatsApp): ${semExternalId} (${((semExternalId/total)*100).toFixed(1)}%)`);
        console.log(`   📅 Externos (Google Calendar): ${comExternalId} (${((comExternalId/total)*100).toFixed(1)}%)`);
        console.log(`   ✅ Diferenciação por source: ${whatsappSource + calendarSource}/${total}`);

        return {
            total,
            internos: semExternalId,
            externos: comExternalId,
            whatsappSource,
            calendarSource,
            criadosUltimaHora,
            atualizadosUltimaHora
        };

    } catch (error) {
        console.error('❌ Erro na verificação completa:', error);
    }
}

// Executar
if (require.main === module) {
    verificarEstadoCompleto()
        .then((stats) => {
            if (stats) {
                console.log('\n🏁 Estado completo verificado!');
                console.log(`🎉 Diferenciação concluída: ${stats.internos} internos + ${stats.externos} externos`);
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { verificarEstadoCompleto };