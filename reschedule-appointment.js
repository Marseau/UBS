#!/usr/bin/env node

/**
 * Script para remarcar agendamento das 10h para 14h (tarde)
 */

const { supabaseAdmin } = require('./src/config/database');
const { CalendarService } = require('./src/services/calendar.service');

async function rescheduleAppointment() {
  console.log('🔄 Remarcando agendamento das 10h para 14h...');

  try {
    const appointmentId = '54e2f514-c7e4-4265-955b-7a80c08c34fc';

    // 1. Buscar agendamento atual
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select(`
        *,
        professional:professionals!inner(name, google_calendar_credentials)
      `)
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appointment) {
      console.error('❌ Agendamento não encontrado:', fetchError);
      return;
    }

    console.log('✅ Agendamento atual encontrado:');
    console.log(`📅 Data atual: ${new Date(appointment.start_time).toLocaleString('pt-BR')}`);
    console.log(`🆔 Google Event ID: ${appointment.external_event_id}`);

    // 2. Calcular novo horário (14h no mesmo dia)
    const newStartTime = new Date(appointment.start_time);
    newStartTime.setHours(14, 0, 0, 0); // 14:00
    const newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000); // +1 hora

    console.log(`🕐 Novo horário: ${newStartTime.toLocaleString('pt-BR')}`);

    // 3. Atualizar no banco de dados
    const { error: updateError } = await supabaseAdmin
      .from('appointments')
      .update({
        start_time: newStartTime.toISOString(),
        end_time: newEndTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);

    if (updateError) {
      console.error('❌ Erro ao atualizar no banco:', updateError);
      return;
    }

    console.log('✅ Agendamento atualizado no banco de dados');

    // 4. Atualizar no Google Calendar
    if (appointment.external_event_id && appointment.professional.google_calendar_credentials) {
      console.log('🔄 Atualizando evento no Google Calendar...');

      const calendarService = new CalendarService();

      // Buscar agendamento atualizado com todas as relações
      const { data: updatedAppointment, error: refetchError } = await supabaseAdmin
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

      if (refetchError || !updatedAppointment) {
        console.error('❌ Erro ao buscar agendamento atualizado:', refetchError);
        return;
      }

      // Atualizar evento no Google Calendar
      const updateResult = await calendarService.updateCalendarEvent(
        updatedAppointment,
        appointment.external_event_id
      );

      if (updateResult.success) {
        console.log('✅ Evento atualizado no Google Calendar!');
      } else {
        console.error('❌ Erro ao atualizar Google Calendar:', updateResult.error);
      }
    }

    console.log('\n🎉 Remarcação concluída!');
    console.log(`📋 Agendamento ID: ${appointmentId}`);
    console.log(`⏰ Horário antigo: 10:00`);
    console.log(`🕐 Horário novo: 14:00`);
    console.log(`📅 Data: ${newStartTime.toLocaleDateString('pt-BR')}`);

  } catch (error) {
    console.error('💥 Erro inesperado:', error);
  }
}

// Executar
if (require.main === module) {
  rescheduleAppointment()
    .then(() => {
      console.log('\n🧪 Agora teste novamente criar agendamento às 10h - deve estar livre!');
      console.log('🧪 E teste criar às 14h - deve detectar conflito!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Remarcação falhou:', error);
      process.exit(1);
    });
}

module.exports = { rescheduleAppointment };