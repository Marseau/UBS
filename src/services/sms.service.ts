/**
 * SMS Service
 * 
 * Serviço para envio de SMS usando Twilio
 * Integrado ao sistema de notificações de agendamentos
 */

import { Twilio } from 'twilio';
import { supabase } from '../config/database';

interface SMSLogData {
  appointmentId?: string;
  tenantId: string;
  userId?: string;
  type: string;
  recipient: string;
  messageId: string;
  status: 'sent' | 'delivered' | 'failed';
  content: string;
}

export class SMSService {
  private client: Twilio | null = null;
  private isConfigured: boolean = false;
  private fromNumber: string;

  constructor() {
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.initializeTwilio();
  }

  private async initializeTwilio(): Promise<void> {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (!accountSid || !authToken || !this.fromNumber) {
        console.log('⚠️ Twilio SMS não configurado - variables missing');
        this.isConfigured = false;
        return;
      }

      this.client = new Twilio(accountSid, authToken);
      
      // Test connection
      await this.client.api.accounts(accountSid).fetch();
      
      this.isConfigured = true;
      console.log('✅ Twilio SMS connection established');
    } catch (error) {
      console.error('❌ Failed to initialize Twilio SMS:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Enviar SMS de confirmação de agendamento
   */
  async sendAppointmentConfirmation(appointmentId: string): Promise<{ success: boolean; messageId?: string; message: string }> {
    try {
      if (!this.isConfigured || !this.client) {
        return {
          success: false,
          message: 'SMS service not configured'
        };
      }

      const appointmentData = await this.getAppointmentData(appointmentId);
      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      const { appointment, tenant, user, service } = appointmentData;
      
      // Format phone number for SMS
      const toNumber = this.formatPhoneNumber(user.phone);
      if (!toNumber) {
        return {
          success: false,
          message: 'Invalid phone number'
        };
      }

      const message = this.buildConfirmationMessage(appointment, tenant, service, user);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      await this.logSMSSent({
        appointmentId,
        tenantId: appointment.tenant_id,
        userId: appointment.user_id,
        type: 'confirmation',
        recipient: toNumber,
        messageId: result.sid,
        status: 'sent',
        content: message
      });

      return {
        success: true,
        messageId: result.sid,
        message: 'Confirmation SMS sent successfully'
      };

    } catch (error) {
      console.error('Failed to send confirmation SMS:', error);
      return {
        success: false,
        message: `Failed to send confirmation SMS: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Enviar SMS de lembrete
   */
  async sendAppointmentReminder(appointmentId: string, reminderType: 'day_before' | 'hour_before'): Promise<{ success: boolean; messageId?: string; message: string }> {
    try {
      if (!this.isConfigured || !this.client) {
        return {
          success: false,
          message: 'SMS service not configured'
        };
      }

      const appointmentData = await this.getAppointmentData(appointmentId);
      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      const { appointment, tenant, user, service } = appointmentData;
      
      const toNumber = this.formatPhoneNumber(user.phone);
      if (!toNumber) {
        return {
          success: false,
          message: 'Invalid phone number'
        };
      }

      const message = this.buildReminderMessage(appointment, tenant, service, user, reminderType);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      await this.logSMSSent({
        appointmentId,
        tenantId: appointment.tenant_id,
        userId: appointment.user_id,
        type: `reminder_${reminderType}`,
        recipient: toNumber,
        messageId: result.sid,
        status: 'sent',
        content: message
      });

      return {
        success: true,
        messageId: result.sid,
        message: 'Reminder SMS sent successfully'
      };

    } catch (error) {
      console.error('Failed to send reminder SMS:', error);
      return {
        success: false,
        message: `Failed to send reminder SMS: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Enviar SMS de cancelamento
   */
  async sendAppointmentCancellation(appointmentId: string, reason?: string): Promise<{ success: boolean; messageId?: string; message: string }> {
    try {
      if (!this.isConfigured || !this.client) {
        return {
          success: false,
          message: 'SMS service not configured'
        };
      }

      const appointmentData = await this.getAppointmentData(appointmentId);
      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      const { appointment, tenant, user, service } = appointmentData;
      
      const toNumber = this.formatPhoneNumber(user.phone);
      if (!toNumber) {
        return {
          success: false,
          message: 'Invalid phone number'
        };
      }

      const message = this.buildCancellationMessage(appointment, tenant, service, user, reason);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      await this.logSMSSent({
        appointmentId,
        tenantId: appointment.tenant_id,
        userId: appointment.user_id,
        type: 'cancellation',
        recipient: toNumber,
        messageId: result.sid,
        status: 'sent',
        content: message
      });

      return {
        success: true,
        messageId: result.sid,
        message: 'Cancellation SMS sent successfully'
      };

    } catch (error) {
      console.error('Failed to send cancellation SMS:', error);
      return {
        success: false,
        message: `Failed to send cancellation SMS: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Enviar SMS de remarcação
   */
  async sendAppointmentReschedule(appointmentId: string): Promise<{ success: boolean; messageId?: string; message: string }> {
    try {
      if (!this.isConfigured || !this.client) {
        return {
          success: false,
          message: 'SMS service not configured'
        };
      }

      const appointmentData = await this.getAppointmentData(appointmentId);
      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      const { appointment, tenant, user, service } = appointmentData;
      
      const toNumber = this.formatPhoneNumber(user.phone);
      if (!toNumber) {
        return {
          success: false,
          message: 'Invalid phone number'
        };
      }

      const message = this.buildRescheduleMessage(appointment, tenant, service, user);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      await this.logSMSSent({
        appointmentId,
        tenantId: appointment.tenant_id,
        userId: appointment.user_id,
        type: 'reschedule',
        recipient: toNumber,
        messageId: result.sid,
        status: 'sent',
        content: message
      });

      return {
        success: true,
        messageId: result.sid,
        message: 'Reschedule SMS sent successfully'
      };

    } catch (error) {
      console.error('Failed to send reschedule SMS:', error);
      return {
        success: false,
        message: `Failed to send reschedule SMS: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Formatar número de telefone para formato internacional (+5511999999999)
   */
  private formatPhoneNumber(phone: string): string | null {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('55')) {
      // Already has country code
      return `+${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('11')) {
      // São Paulo with area code
      return `+55${cleaned}`;
    } else if (cleaned.length === 10) {
      // Add 9 to mobile number and country code
      return `+5511${cleaned}`;
    }
    
    // Invalid format
    return null;
  }

  /**
   * Templates de mensagem SMS
   */
  private buildConfirmationMessage(appointment: any, tenant: any, service: any, user: any): string {
    const date = new Date(appointment.start_time).toLocaleDateString('pt-BR');
    const time = new Date(appointment.start_time).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    return `✅ AGENDAMENTO CONFIRMADO

${tenant.business_name}
🗓️ ${date} às ${time}
💼 ${service.name}
👤 ${user.name || 'Cliente'}

📍 Chegue 10min antes
📞 Dúvidas: ${tenant.phone}

Obrigado!`;
  }

  private buildReminderMessage(appointment: any, tenant: any, service: any, user: any, reminderType: 'day_before' | 'hour_before'): string {
    const date = new Date(appointment.start_time).toLocaleDateString('pt-BR');
    const time = new Date(appointment.start_time).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const reminderText = reminderType === 'day_before' 
      ? '🔔 LEMBRETE: Seu agendamento é AMANHÃ!' 
      : '⏰ LEMBRETE: Seu agendamento é em 1 HORA!';

    return `${reminderText}

${tenant.business_name}
🗓️ ${date} às ${time}
💼 ${service.name}

📍 Não esqueça!
📞 ${tenant.phone}`;
  }

  private buildCancellationMessage(appointment: any, tenant: any, service: any, user: any, reason?: string): string {
    const date = new Date(appointment.start_time).toLocaleDateString('pt-BR');
    const time = new Date(appointment.start_time).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    let message = `❌ AGENDAMENTO CANCELADO

${tenant.business_name}
🗓️ ${date} às ${time}
💼 ${service.name}`;

    if (reason) {
      message += `\n\n📝 Motivo: ${reason}`;
    }

    message += `\n\n📞 Para reagendar: ${tenant.phone}`;

    return message;
  }

  private buildRescheduleMessage(appointment: any, tenant: any, service: any, user: any): string {
    const date = new Date(appointment.start_time).toLocaleDateString('pt-BR');
    const time = new Date(appointment.start_time).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    return `📅 AGENDAMENTO REMARCADO

${tenant.business_name}
🗓️ NOVA DATA: ${date} às ${time}
💼 ${service.name}

✅ Confirmado!
📞 Dúvidas: ${tenant.phone}`;
  }

  /**
   * Buscar dados do agendamento
   */
  private async getAppointmentData(appointmentId: string) {
    const { data: appointment } = await supabase
      .from('appointments')
      .select(`
        *,
        tenants (*),
        users (*),
        services (*)
      `)
      .eq('id', appointmentId)
      .single();

    if (!appointment) return null;

    return {
      appointment,
      tenant: appointment.tenants,
      user: appointment.users,
      service: appointment.services
    };
  }

  /**
   * Log do SMS enviado
   */
  private async logSMSSent(logData: SMSLogData): Promise<void> {
    try {
      console.log('SMS sent:', {
        type: logData.type,
        recipient: logData.recipient,
        messageId: logData.messageId,
        tenantId: logData.tenantId
      });
      
      // Aqui poderia salvar em uma tabela sms_logs se necessário
      // Por enquanto só logamos no console
    } catch (error) {
      console.error('Failed to log SMS:', error);
    }
  }

  /**
   * Verificar se o serviço está configurado
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Testar configuração
   */
  async testConfiguration(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.client) {
        return {
          success: false,
          message: 'SMS service not configured'
        };
      }

      // Test with account info
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
      
      return {
        success: true,
        message: `SMS configuration working correctly. Account: ${account.friendlyName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `SMS configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default SMSService;