/**
 * CALENDAR SYNC BIDIRECTIONAL SERVICE
 * 
 * Implementa sincronização completa entre Google Calendar e Sistema:
 * - Importa eventos externos → appointments
 * - Detecta mudanças no calendar → atualiza sistema
 * - Mantém consistência bidirecional
 */

const { google } = require('googleapis');
const { supabaseAdmin } = require('../config/database');
const { CalendarService } = require('./calendar.service');
const EncryptionService = require('../utils/encryption.service');

class CalendarSyncBidirectionalService {
    constructor() {
        this.calendarService = new CalendarService();
        this.encryptionService = new EncryptionService();
    }

    /**
     * CRIAR EVENTO DE TESTE no Google Calendar
     * Para validar se a integração está funcionando
     */
    async createTestEvent(professionalId) {
        try {
            console.log(`🧪 Criando evento de teste para profissional: ${professionalId}`);

            // 1. Obter cliente autenticado
            const authClient = await this.calendarService.getAuthClientForProfessional(professionalId);
            if (!authClient) {
                console.log('❌ Credenciais Google não encontradas para o profissional');
                return null;
            }

            // 2. Buscar dados do profissional
            const { data: professional, error: profError } = await supabaseAdmin
                .from('professionals')
                .select('name, google_calendar_id')
                .eq('id', professionalId)
                .single();

            if (profError || !professional) {
                console.error('❌ Profissional não encontrado:', profError);
                return null;
            }

            // 3. Criar evento de teste
            const calendar = google.calendar({ version: 'v3', auth: authClient });
            const calendarId = professional.google_calendar_id || 'primary';

            const now = new Date();
            const endTime = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutos

            const event = {
                summary: 'Demo UBS - Teste Sync',
                description: 'Evento de teste criado automaticamente pela Demo UBS para validar integração Google Calendar. Será removido automaticamente.',
                start: {
                    dateTime: now.toISOString(),
                    timeZone: 'America/Sao_Paulo'
                },
                end: {
                    dateTime: endTime.toISOString(), 
                    timeZone: 'America/Sao_Paulo'
                },
                colorId: '3' // Cor roxo para identificar como teste
            };

            const response = await calendar.events.insert({
                calendarId: calendarId,
                resource: event
            });

            console.log(`✅ Evento de teste criado: ${response.data.id}`);
            return response.data.id;

        } catch (error) {
            console.error('❌ Erro ao criar evento de teste:', error);
            return null;
        }
    }

    /**
     * REMOVER EVENTO DE TESTE do Google Calendar
     */
    async deleteTestEvent(professionalId, eventId) {
        try {
            console.log(`🗑️ Removendo evento de teste: ${eventId}`);

            // 1. Obter cliente autenticado
            const authClient = await this.calendarService.getAuthClientForProfessional(professionalId);
            if (!authClient) {
                console.log('❌ Credenciais Google não encontradas');
                return false;
            }

            // 2. Buscar dados do profissional
            const { data: professional, error: profError } = await supabaseAdmin
                .from('professionals')
                .select('google_calendar_id')
                .eq('id', professionalId)
                .single();

            if (profError || !professional) {
                console.error('❌ Profissional não encontrado:', profError);
                return false;
            }

            // 3. Remover evento
            const calendar = google.calendar({ version: 'v3', auth: authClient });
            const calendarId = professional.google_calendar_id || 'primary';

            await calendar.events.delete({
                calendarId: calendarId,
                eventId: eventId
            });

            console.log(`✅ Evento de teste removido: ${eventId}`);
            return true;

        } catch (error) {
            console.error('❌ Erro ao remover evento de teste:', error);
            return false;
        }
    }

    /**
     * IMPORTAR EVENTOS EXTERNOS para o sistema
     * Cria appointments para eventos criados manualmente no Google Calendar
     */
    async importExternalEvents(tenantId, professionalId) {
        try {
            console.log(`📥 Importando eventos externos para tenant ${tenantId}, professional ${professionalId}`);

            // 1. Obter cliente autenticado
            const authClient = await this.calendarService.getAuthClientForProfessional(professionalId);
            if (!authClient) {
                console.log('❌ Credenciais Google não encontradas para o profissional');
                return { success: false, error: 'Credenciais não configuradas' };
            }

            // 2. Buscar dados do profissional e tenant
            const { data: professional, error: profError } = await supabaseAdmin
                .from('professionals')
                .select('name, tenant_id, google_calendar_id')
                .eq('id', professionalId)
                .single();

            if (profError || !professional) {
                console.error('❌ Profissional não encontrado:', profError);
                return { success: false, error: 'Profissional não encontrado' };
            }

            const { data: tenant, error: tenantError } = await supabaseAdmin
                .from('tenants')
                .select('business_name')
                .eq('id', tenantId)
                .single();

            if (tenantError || !tenant) {
                console.error('❌ Tenant não encontrado:', tenantError);
                return { success: false, error: 'Tenant não encontrado' };
            }

            // 3. Criar instância do Calendar API
            const calendar = google.calendar({ version: 'v3', auth: authClient });
            const calendarId = professional.google_calendar_id || 'primary';

            // 4. Buscar eventos das próximas 30 dias
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

            const response = await calendar.events.list({
                calendarId: calendarId,
                timeMin: now.toISOString(),
                timeMax: thirtyDaysFromNow.toISOString(),
                maxResults: 100,
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.data.items || [];
            console.log(`📅 Encontrados ${events.length} eventos no calendário`);

            // 5. Buscar appointments existentes para evitar duplicatas
            const { data: existingAppointments } = await supabaseAdmin
                .from('appointments')
                .select('external_event_id')
                .eq('tenant_id', tenantId)
                .not('external_event_id', 'is', null);

            const existingEventIds = new Set(
                (existingAppointments || []).map(a => a.external_event_id)
            );

            let importedCount = 0;
            let skippedCount = 0;

            // 6. Processar cada evento
            for (const event of events) {
                // Pular eventos já importados
                if (existingEventIds.has(event.id)) {
                    skippedCount++;
                    continue;
                }

                // Pular eventos criados pelo próprio sistema (para evitar loop)
                if (event.extendedProperties?.private?.source === 'whatsapp-booking-system') {
                    skippedCount++;
                    continue;
                }

                // Pular eventos sem horário definido (eventos de dia inteiro)
                if (!event.start?.dateTime || !event.end?.dateTime) {
                    skippedCount++;
                    continue;
                }

                // 7. Criar appointment para evento externo
                const appointmentData = {
                    tenant_id: tenantId,
                    professional_id: professionalId,
                    external_event_id: event.id,
                    start_time: event.start.dateTime,
                    end_time: event.end.dateTime,
                    status: 'confirmed', // Eventos do calendar são confirmados
                    appointment_data: {
                        source: 'google_calendar',
                        booking_method: 'external_sync',
                        calendar_event: {
                            calendar_id: calendarId,
                            event_url: event.htmlLink,
                            sync_status: 'imported',
                            imported_at: new Date().toISOString(),
                            original_event: {
                                summary: event.summary,
                                description: event.description,
                                location: event.location,
                                creator: event.creator?.email
                            }
                        }
                    },
                    customer_notes: this.extractNotesFromEvent(event),
                    // Tentar mapear para um serviço padrão ou criar genérico
                    service_id: await this.getOrCreateDefaultService(tenantId),
                    // Criar usuário genérico se não existir
                    user_id: await this.getOrCreateExternalUser(tenantId, event)
                };

                const { data: newAppointment, error: insertError } = await supabaseAdmin
                    .from('appointments')
                    .insert(appointmentData)
                    .select()
                    .single();

                if (insertError) {
                    console.error(`❌ Erro ao importar evento ${event.id}:`, insertError);
                } else {
                    console.log(`✅ Evento importado: ${event.summary} → Appointment ${newAppointment.id}`);
                    importedCount++;
                }
            }

            console.log(`🎉 Importação concluída: ${importedCount} eventos importados, ${skippedCount} pulados`);

            return {
                success: true,
                imported: importedCount,
                skipped: skippedCount,
                total: events.length
            };

        } catch (error) {
            console.error('❌ Erro na importação de eventos externos:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * SINCRONIZAR MUDANÇAS do Google Calendar
     * Atualiza appointments baseado em mudanças no calendar
     */
    async syncCalendarChanges(tenantId, professionalId) {
        try {
            console.log(`🔄 Sincronizando mudanças do calendar para tenant ${tenantId}`);

            const authClient = await this.calendarService.getAuthClientForProfessional(professionalId);
            if (!authClient) return { success: false, error: 'Credenciais não configuradas' };

            const calendar = google.calendar({ version: 'v3', auth: authClient });
            const calendarId = 'primary';

            // Buscar appointments com external_event_id
            const { data: appointmentsWithEvents } = await supabaseAdmin
                .from('appointments')
                .select('id, external_event_id, start_time, end_time, status, appointment_data')
                .eq('tenant_id', tenantId)
                .not('external_event_id', 'is', null);

            if (!appointmentsWithEvents || appointmentsWithEvents.length === 0) {
                console.log('📋 Nenhum appointment com evento externo encontrado');
                return { success: true, updated: 0 };
            }

            let updatedCount = 0;

            // Verificar cada appointment
            for (const appointment of appointmentsWithEvents) {
                try {
                    // Buscar evento atual no Google Calendar
                    const eventResponse = await calendar.events.get({
                        calendarId: calendarId,
                        eventId: appointment.external_event_id
                    });

                    const event = eventResponse.data;
                    let needsUpdate = false;
                    const updates = {};

                    // Verificar mudanças de horário
                    if (event.start?.dateTime !== appointment.start_time) {
                        updates.start_time = event.start.dateTime;
                        needsUpdate = true;
                    }

                    if (event.end?.dateTime !== appointment.end_time) {
                        updates.end_time = event.end.dateTime;
                        needsUpdate = true;
                    }

                    // Verificar status (cancelado)
                    if (event.status === 'cancelled' && appointment.status !== 'cancelled') {
                        updates.status = 'cancelled';
                        updates.cancelled_at = new Date().toISOString();
                        updates.cancellation_reason = 'Cancelado via Google Calendar';
                        needsUpdate = true;
                    }

                    // Aplicar atualizações se necessário
                    if (needsUpdate) {
                        updates.appointment_data = {
                            ...appointment.appointment_data,
                            calendar_event: {
                                ...appointment.appointment_data?.calendar_event,
                                sync_status: 'synced',
                                last_sync: new Date().toISOString()
                            }
                        };

                        const { error: updateError } = await supabaseAdmin
                            .from('appointments')
                            .update(updates)
                            .eq('id', appointment.id);

                        if (updateError) {
                            console.error(`❌ Erro ao atualizar appointment ${appointment.id}:`, updateError);
                        } else {
                            console.log(`✅ Appointment ${appointment.id} sincronizado com mudanças do calendar`);
                            updatedCount++;
                        }
                    }

                } catch (eventError) {
                    if (eventError.code === 404) {
                        // Evento foi deletado no calendar - cancelar appointment
                        const { error: cancelError } = await supabaseAdmin
                            .from('appointments')
                            .update({
                                status: 'cancelled',
                                cancelled_at: new Date().toISOString(),
                                cancellation_reason: 'Evento deletado do Google Calendar'
                            })
                            .eq('id', appointment.id);

                        if (!cancelError) {
                            console.log(`✅ Appointment ${appointment.id} cancelado (evento deletado do calendar)`);
                            updatedCount++;
                        }
                    } else {
                        console.error(`❌ Erro ao verificar evento ${appointment.external_event_id}:`, eventError);
                    }
                }
            }

            console.log(`🎉 Sincronização concluída: ${updatedCount} appointments atualizados`);

            return {
                success: true,
                updated: updatedCount,
                total: appointmentsWithEvents.length
            };

        } catch (error) {
            console.error('❌ Erro na sincronização de mudanças:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * EXECUTAR SINCRONIZAÇÃO COMPLETA
     * Combina importação + sincronização de mudanças
     */
    async fullSync(tenantId, professionalId) {
        try {
            console.log(`🔄 Executando sincronização completa para tenant ${tenantId}`);

            // 1. Importar novos eventos
            const importResult = await this.importExternalEvents(tenantId, professionalId);
            
            // 2. Sincronizar mudanças em eventos existentes
            const syncResult = await this.syncCalendarChanges(tenantId, professionalId);

            return {
                success: importResult.success && syncResult.success,
                import: importResult,
                sync: syncResult,
                summary: {
                    imported: importResult.imported || 0,
                    updated: syncResult.updated || 0,
                    total_processed: (importResult.imported || 0) + (syncResult.updated || 0)
                }
            };

        } catch (error) {
            console.error('❌ Erro na sincronização completa:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * UTILITÁRIOS
     */

    extractNotesFromEvent(event) {
        const parts = [];
        if (event.summary) parts.push(`Título: ${event.summary}`);
        if (event.description) parts.push(`Descrição: ${event.description}`);
        if (event.location) parts.push(`Local: ${event.location}`);
        return parts.join('\n') || 'Evento importado do Google Calendar';
    }

    async getOrCreateDefaultService(tenantId) {
        // Buscar serviço padrão ou criar um genérico
        const { data: service } = await supabaseAdmin
            .from('services')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', 'Serviço Externo (Google Calendar)')
            .single();

        if (service) return service.id;

        // Criar serviço padrão para eventos externos
        const { data: newService } = await supabaseAdmin
            .from('services')
            .insert({
                tenant_id: tenantId,
                name: 'Serviço Externo (Google Calendar)',
                description: 'Serviço genérico para eventos importados do Google Calendar',
                duration_minutes: 60,
                base_price: 0,
                service_config: {
                    category: 'external',
                    source: 'google_calendar',
                    auto_created: true
                }
            })
            .select('id')
            .single();

        return newService?.id;
    }

    async getOrCreateExternalUser(tenantId, event) {
        const guestEmail = event.creator?.email || event.attendees?.[0]?.email || 'external@calendar.event';
        
        // Buscar usuário existente
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', guestEmail)
            .single();

        if (user) return user.id;

        // Criar usuário externo
        const { data: newUser } = await supabaseAdmin
            .from('users')
            .insert({
                name: event.creator?.displayName || 'Cliente Externo',
                email: guestEmail,
                phone: '+5500000000000', // Placeholder
                user_data: {
                    source: 'google_calendar_import',
                    original_event_id: event.id,
                    auto_created: true
                }
            })
            .select('id')
            .single();

        return newUser?.id;
    }
}

module.exports = { CalendarSyncBidirectionalService };