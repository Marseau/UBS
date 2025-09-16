#!/usr/bin/env node

/**
 * Script para sincronizar agendamento existente com Google Calendar
 */

const { supabaseAdmin } = require('./src/config/database');
const { CalendarService } = require('./src/services/calendar.service');

async function syncAppointmentToGoogle() {
  console.log('🔗 Sincronizando agendamento com Google Calendar...');

  try {
    const appointmentId = '54e2f514-c7e4-4265-955b-7a80c08c34fc';

    // 1. Buscar agendamento completo com relações
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select(`
        *,
        tenant:tenants!inner(business_name, business_address, domain),
        service:services!inner(name, duration_minutes, base_price),
        user:users!inner(name, phone),
        professional:professionals!inner(name, google_calendar_credentials)
      `)
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appointment) {
      console.error('❌ Agendamento não encontrado:', fetchError);
      return;
    }

    console.log('✅ Agendamento encontrado:', {
      id: appointment.id,
      cliente: appointment.user.name,
      profissional: appointment.professional.name,
      servico: appointment.service.name,
      start: appointment.start_time,
      end: appointment.end_time
    });

    // 2. Verificar se profissional tem credenciais Google Calendar
    if (!appointment.professional.google_calendar_credentials) {
      console.error('❌ Profissional não tem credenciais Google Calendar');
      return;
    }

    console.log('✅ Profissional tem credenciais Google Calendar');

    // 3. Usar CalendarService para criar evento
    const calendarService = new CalendarService();

    console.log('📅 Criando evento no Google Calendar...');
    console.log('Dados do agendamento:', {
      id: appointment.id,
      professional_id: appointment.professional_id,
      service_id: appointment.service_id,
      tenant_id: appointment.tenant_id
    });

    // Criar evento passando o objeto appointment completo
    const createResult = await calendarService.createCalendarEvent(appointment);

    if (createResult.success && createResult.eventId) {
      console.log('✅ Evento criado no Google Calendar!');
      console.log('🆔 Event ID:', createResult.eventId);

      // 4. Atualizar agendamento com external_event_id
      const { error: updateError } = await supabaseAdmin
        .from('appointments')
        .update({
          external_event_id: createResult.eventId,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.error('❌ Erro ao atualizar agendamento com event_id:', updateError);
      } else {
        console.log('✅ Agendamento atualizado com external_event_id');
      }

    } else {
      console.error('❌ Falha ao criar evento:', createResult);
    }

  } catch (error) {
    console.error('💥 Erro inesperado:', error);
  }
}

// Executar
if (require.main === module) {
  syncAppointmentToGoogle()
    .then(() => {
      console.log('\n🎉 Sincronização concluída!');
      console.log('🧪 Agora teste criar outro agendamento no mesmo horário para validar conflito');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Sincronização falhou:', error);
      process.exit(1);
    });
}

module.exports = { syncAppointmentToGoogle };