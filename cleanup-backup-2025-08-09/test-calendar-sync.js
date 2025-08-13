/**
 * TESTE DE SINCRONIZAÇÃO GOOGLE CALENDAR
 * 
 * Testa a sincronização bidirecional implementada
 */

const { CalendarSyncBidirectionalService } = require('./src/services/calendar-sync-bidirectional.service');
const { supabaseAdmin } = require('./src/config/database');

async function testarSincronizacaoCalendar() {
    try {
        console.log('🧪 Testando sincronização bidirecional Google Calendar...');
        
        const syncService = new CalendarSyncBidirectionalService();

        // 1. Buscar tenant e profissional real para teste
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name')
            .limit(1)
            .single();

        if (tenantError || !tenant) {
            console.error('❌ Nenhum tenant encontrado para teste');
            return;
        }

        const { data: professional, error: profError } = await supabaseAdmin
            .from('professionals')
            .select('id, name, google_calendar_credentials')
            .eq('tenant_id', tenant.id)
            .not('google_calendar_credentials', 'is', null)
            .limit(1)
            .single();

        if (profError || !professional) {
            console.log('⚠️ Nenhum profissional com Google Calendar configurado encontrado');
            console.log('📋 Para testar, configure as credenciais do Google Calendar para um profissional');
            return;
        }

        console.log(`🏢 Tenant: ${tenant.business_name} (${tenant.id})`);
        console.log(`👤 Profissional: ${professional.name} (${professional.id})`);

        // 2. Testar importação de eventos
        console.log('\n📥 Testando importação de eventos externos...');
        
        const importResult = await syncService.importExternalEvents(tenant.id, professional.id);
        
        if (importResult.success) {
            console.log(`✅ Importação bem-sucedida:`);
            console.log(`   Eventos importados: ${importResult.imported}`);
            console.log(`   Eventos pulados: ${importResult.skipped}`);
            console.log(`   Total processados: ${importResult.total}`);
        } else {
            console.log(`❌ Erro na importação: ${importResult.error}`);
        }

        // 3. Testar sincronização de mudanças
        console.log('\n🔄 Testando sincronização de mudanças...');
        
        const syncResult = await syncService.syncCalendarChanges(tenant.id, professional.id);
        
        if (syncResult.success) {
            console.log(`✅ Sincronização bem-sucedida:`);
            console.log(`   Appointments atualizados: ${syncResult.updated}`);
            console.log(`   Total verificados: ${syncResult.total}`);
        } else {
            console.log(`❌ Erro na sincronização: ${syncResult.error}`);
        }

        // 4. Testar sincronização completa
        console.log('\n🚀 Testando sincronização completa...');
        
        const fullSyncResult = await syncService.fullSync(tenant.id, professional.id);
        
        if (fullSyncResult.success) {
            console.log(`✅ Sincronização completa bem-sucedida:`);
            console.log(`   Resumo: ${JSON.stringify(fullSyncResult.summary, null, 2)}`);
        } else {
            console.log(`❌ Erro na sincronização completa: ${fullSyncResult.error}`);
        }

        // 5. Verificar estado final dos appointments
        console.log('\n📊 Estado final dos appointments externos...');
        
        const { data: externalAppointments, error: apptError } = await supabaseAdmin
            .from('appointments')
            .select(`
                id,
                external_event_id,
                start_time,
                end_time,
                status,
                appointment_data
            `)
            .eq('tenant_id', tenant.id)
            .not('external_event_id', 'is', null);

        if (apptError) {
            console.error('❌ Erro ao buscar appointments externos:', apptError);
        } else {
            console.log(`📋 Appointments externos encontrados: ${externalAppointments?.length || 0}`);
            
            if (externalAppointments && externalAppointments.length > 0) {
                console.log('\n📅 Detalhes dos appointments externos:');
                externalAppointments.forEach((apt, index) => {
                    console.log(`   ${index + 1}. ID: ${apt.id}`);
                    console.log(`      External Event ID: ${apt.external_event_id}`);
                    console.log(`      Horário: ${apt.start_time} → ${apt.end_time}`);
                    console.log(`      Status: ${apt.status}`);
                    console.log(`      Source: ${apt.appointment_data?.source || 'N/A'}`);
                    console.log('');
                });
            }
        }

        // 6. Verificar estatísticas gerais
        console.log('📈 Estatísticas gerais do tenant:');
        
        const { data: stats } = await supabaseAdmin
            .from('appointments')
            .select('id, external_event_id, appointment_data')
            .eq('tenant_id', tenant.id);

        if (stats) {
            const totalAppointments = stats.length;
            const externalCount = stats.filter(a => a.external_event_id).length;
            const internalCount = totalAppointments - externalCount;
            
            console.log(`   Total appointments: ${totalAppointments}`);
            console.log(`   Appointments internos (WhatsApp): ${internalCount}`);
            console.log(`   Appointments externos (Calendar): ${externalCount}`);
            console.log(`   Taxa de eventos externos: ${((externalCount / totalAppointments) * 100).toFixed(1)}%`);
        }

        console.log('\n🎉 Teste de sincronização concluído!');

    } catch (error) {
        console.error('❌ Erro no teste de sincronização:', error);
    }
}

// Executar teste
if (require.main === module) {
    testarSincronizacaoCalendar()
        .then(() => {
            console.log('✅ Teste finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal no teste:', error);
            process.exit(1);
        });
}

module.exports = { testarSincronizacaoCalendar };