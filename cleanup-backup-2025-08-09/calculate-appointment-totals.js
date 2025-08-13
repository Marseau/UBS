/**
 * FUNÇÃO DE TOTALIZAÇÃO - APPOINTMENTS
 * 
 * Calcula todas as 27 totalizações identificadas da tabela appointments
 * Para inserir como metric_type específico em tenant_metrics
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcula todas as totalizações de appointments para um tenant/período
 */
async function calculateAppointmentTotals(tenantId, periodDays) {
  console.log(`📅 Calculando totalizações de appointments - tenant ${tenantId} (${periodDays}d)`);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  try {
    // Buscar todos os appointments do período
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        tenant_id,
        user_id,
        professional_id,
        service_id,
        start_time,
        end_time,
        status,
        quoted_price,
        final_price,
        appointment_data,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .gte('start_time', startDate.toISOString());

    if (error) {
      throw new Error(`Erro ao buscar appointments: ${error.message}`);
    }

    if (!appointments || appointments.length === 0) {
      return getEmptyAppointmentTotals(periodDays);
    }

    // 1. TOTAIS BÁSICOS
    const totalAppointments = appointments.length;
    const uniqueCustomers = new Set(appointments.map(a => a.user_id)).size;
    const uniqueProfessionals = new Set(appointments.filter(a => a.professional_id).map(a => a.professional_id)).size;
    const uniqueServices = new Set(appointments.filter(a => a.service_id).map(a => a.service_id)).size;

    // 2. STATUS (3 tipos)
    const completedAppointments = appointments.filter(a => a.status === 'completed').length;
    const confirmedAppointments = appointments.filter(a => a.status === 'confirmed').length;
    const successfulAppointments = completedAppointments + confirmedAppointments;
    const cancelledAppointments = appointments.filter(a => a.status === 'cancelled').length;
    const noShowAppointments = appointments.filter(a => a.status === 'no_show').length;

    // 3. RECEITA (sempre usar quoted_price como solicitado)
    const totalRevenue = appointments.reduce((sum, app) => {
      return sum + (parseFloat(app.quoted_price) || 0);
    }, 0);

    // 4. SOURCE/BOOKING_METHOD
    const googleCalendarAppointments = appointments.filter(a => 
      a.appointment_data?.source === 'google_calendar'
    ).length;
    
    const externalSyncBookings = appointments.filter(a => 
      a.appointment_data?.booking_method === 'external_sync'
    ).length;

    // 5. DOMAIN (6 tipos)
    const domainCounts = {
      beauty: appointments.filter(a => a.appointment_data?.tenant_domain === 'beauty').length,
      education: appointments.filter(a => a.appointment_data?.tenant_domain === 'education').length,
      healthcare: appointments.filter(a => a.appointment_data?.tenant_domain === 'healthcare').length,
      legal: appointments.filter(a => a.appointment_data?.tenant_domain === 'legal').length,
      sports: appointments.filter(a => a.appointment_data?.tenant_domain === 'sports').length,
      consulting: appointments.filter(a => a.appointment_data?.tenant_domain === 'consulting').length
    };

    // 6. DURAÇÃO
    const appointmentDurations = [];
    appointments.forEach(app => {
      if (app.start_time && app.end_time) {
        const startTime = new Date(app.start_time);
        const endTime = new Date(app.end_time);
        const durationMinutes = (endTime - startTime) / (1000 * 60); // Converter para minutos
        appointmentDurations.push(durationMinutes);
      }
    });

    const avgAppointmentDuration = appointmentDurations.length > 0 ?
      appointmentDurations.reduce((sum, dur) => sum + dur, 0) / appointmentDurations.length : 0;
    const maxAppointmentDuration = appointmentDurations.length > 0 ? Math.max(...appointmentDurations) : 0;
    const minAppointmentDuration = appointmentDurations.length > 0 ? Math.min(...appointmentDurations) : 0;
    const shortAppointments = appointmentDurations.filter(dur => dur < 45).length;
    const longAppointments = appointmentDurations.filter(dur => dur > 90).length;

    // 7. INTEGRAÇÃO
    const automatedAppointments = appointments.filter(a => 
      a.appointment_data?.automated_creation === true
    ).length;
    
    const calendarSyncedAppointments = appointments.filter(a => 
      a.appointment_data?.calendar_event != null
    ).length;
    
    const conversationLinkedAppointments = appointments.filter(a => 
      a.appointment_data?.session_id != null
    ).length;

    // 8. MÉTRICAS DERIVADAS
    const successRate = totalAppointments > 0 ? (successfulAppointments / totalAppointments) * 100 : 0;
    const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0;
    const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;

    // CONSOLIDAR RESULTADO
    const result = {
      period_days: periodDays,
      calculated_at: new Date().toISOString(),
      
      // 1. Totais básicos
      total_appointments: totalAppointments,
      unique_customers: uniqueCustomers,
      unique_professionals: uniqueProfessionals,
      unique_services: uniqueServices,
      
      // 2. Status
      successful_appointments: successfulAppointments,
      completed_appointments: completedAppointments,
      confirmed_appointments: confirmedAppointments,
      cancelled_appointments: cancelledAppointments,
      no_show_appointments: noShowAppointments,
      
      // 3. Receita
      total_revenue: Math.round(totalRevenue * 100) / 100,
      
      // 4. Source/Booking Method
      google_calendar_appointments: googleCalendarAppointments,
      external_sync_bookings: externalSyncBookings,
      
      // 5. Domain (6 tipos)
      domain_appointments: domainCounts,
      
      // 6. Duração
      avg_appointment_duration: Math.round(avgAppointmentDuration * 100) / 100,
      max_appointment_duration: maxAppointmentDuration,
      min_appointment_duration: minAppointmentDuration,
      short_appointments: shortAppointments,
      long_appointments: longAppointments,
      
      // 7. Integração
      automated_appointments: automatedAppointments,
      calendar_synced_appointments: calendarSyncedAppointments,
      conversation_linked_appointments: conversationLinkedAppointments,
      
      // 8. Métricas derivadas
      success_rate: Math.round(successRate * 100) / 100,
      cancellation_rate: Math.round(cancellationRate * 100) / 100,
      no_show_rate: Math.round(noShowRate * 100) / 100
    };

    console.log(`   ✅ Appointments: ${totalAppointments}, Revenue: R$ ${totalRevenue.toFixed(2)}, Success: ${successRate.toFixed(1)}%`);
    return result;

  } catch (error) {
    console.error(`❌ Erro ao calcular appointment totals: ${error.message}`);
    return getEmptyAppointmentTotals(periodDays);
  }
}

/**
 * Retorna estrutura vazia quando não há dados
 */
function getEmptyAppointmentTotals(periodDays) {
  return {
    period_days: periodDays,
    calculated_at: new Date().toISOString(),
    total_appointments: 0,
    unique_customers: 0,
    unique_professionals: 0,
    unique_services: 0,
    successful_appointments: 0,
    completed_appointments: 0,
    confirmed_appointments: 0,
    cancelled_appointments: 0,
    no_show_appointments: 0,
    total_revenue: 0,
    google_calendar_appointments: 0,
    external_sync_bookings: 0,
    domain_appointments: {
      beauty: 0,
      education: 0,
      healthcare: 0,
      legal: 0,
      sports: 0,
      consulting: 0
    },
    avg_appointment_duration: 0,
    max_appointment_duration: 0,
    min_appointment_duration: 0,
    short_appointments: 0,
    long_appointments: 0,
    automated_appointments: 0,
    calendar_synced_appointments: 0,
    conversation_linked_appointments: 0,
    success_rate: 0,
    cancellation_rate: 0,
    no_show_rate: 0
  };
}

module.exports = {
  calculateAppointmentTotals
};