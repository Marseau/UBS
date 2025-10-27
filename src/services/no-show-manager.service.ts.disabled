/**
 * No-Show Manager Service
 * 
 * Gerencia o processo de marcação de no-show pelos tenants
 * e dispara notificações automáticas
 */

import { supabase } from '../config/database';
import { AppointmentNotificationsService } from './appointment-notifications.service';

export interface NoShowResult {
  success: boolean;
  appointmentId: string;
  message: string;
  notificationSent?: boolean;
}

export class NoShowManagerService {
  private appointmentNotifications: AppointmentNotificationsService;

  constructor() {
    this.appointmentNotifications = new AppointmentNotificationsService();
  }

  /**
   * Marca um agendamento como no-show (chamado pelo tenant)
   */
  async markAsNoShow(appointmentId: string, tenantId: string, reason?: string): Promise<NoShowResult> {
    try {
      // 1. Verificar se appointment existe e pertence ao tenant
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .eq('tenant_id', tenantId)
        .eq('status', 'confirmed') // Só pode marcar no-show se estava confirmado
        .single();

      if (fetchError || !appointment) {
        return {
          success: false,
          appointmentId,
          message: 'Appointment not found or not eligible for no-show'
        };
      }

      // 2. Verificar se o horário já passou (só pode marcar no-show depois do horário)
      const now = new Date();
      const appointmentTime = new Date(appointment.start_time);
      
      if (now < appointmentTime) {
        return {
          success: false,
          appointmentId,
          message: 'Cannot mark no-show before appointment time'
        };
      }

      // 3. Atualizar status para no-show
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'no_show',
          no_show_reason: reason || 'Cliente não compareceu',
          no_show_marked_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.error('Error updating appointment to no-show:', updateError);
        return {
          success: false,
          appointmentId,
          message: 'Failed to update appointment status'
        };
      }

      // 4. Disparar notificação de no-show
      let notificationSent = false;
      try {
        await this.appointmentNotifications.sendNoShow(appointmentId);
        notificationSent = true;
        console.log(`✅ No-show notification sent for appointment ${appointmentId}`);
      } catch (notificationError) {
        console.error('Error sending no-show notification:', notificationError);
        // Continue - não falhar se notificação der erro
      }

      return {
        success: true,
        appointmentId,
        message: 'Appointment marked as no-show successfully',
        notificationSent
      };

    } catch (error) {
      console.error('Error in markAsNoShow:', error);
      return {
        success: false,
        appointmentId,
        message: `Failed to mark no-show: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Obter estatísticas de no-show para um tenant
   */
  async getNoShowStats(tenantId: string, periodDays: number = 30): Promise<{
    totalAppointments: number;
    noShows: number;
    noShowRate: number;
    recentNoShows: any[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    try {
      // Total de appointments no período
      const { data: allAppts, error: totalError } = await supabase
        .from('appointments')
        .select('id, status, start_time')
        .eq('tenant_id', tenantId)
        .gte('start_time', startDate.toISOString());

      if (totalError) throw totalError;

      // No-shows no período
      const { data: noShowAppts, error: noShowError } = await supabase
        .from('appointments')
        .select(`
          id, 
          start_time, 
          no_show_reason,
          no_show_marked_at,
          users (name, phone),
          services (name)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'no_show')
        .gte('start_time', startDate.toISOString())
        .order('no_show_marked_at', { ascending: false });

      if (noShowError) throw noShowError;

      const totalAppointments = allAppts?.length || 0;
      const noShows = noShowAppts?.length || 0;
      const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;

      return {
        totalAppointments,
        noShows,
        noShowRate: Math.round(noShowRate * 100) / 100, // 2 decimal places
        recentNoShows: noShowAppts || []
      };

    } catch (error) {
      console.error('Error getting no-show stats:', error);
      return {
        totalAppointments: 0,
        noShows: 0,
        noShowRate: 0,
        recentNoShows: []
      };
    }
  }
}

export default NoShowManagerService;