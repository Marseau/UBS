/**
 * CancelAppointmentManagerService
 * 
 * Sistema inteligente para cancelamento de agendamentos com:
 * - Identificação automática de agendamentos
 * - Validação de políticas de cancelamento
 * - Flow de confirmação antes do cancelamento
 * - Notificações de confirmação
 * - Integração com Flow Lock para multi-step
 */

import { createClient } from '@supabase/supabase-js';
import { format, addHours, parseISO, differenceInHours, isBefore } from 'date-fns';

// Configuração Supabase
const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

interface AppointmentDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  tenant_id: string;
  user_id: string;
  services?: { name: string } | { name: string }[];
  professionals?: { full_name: string } | { full_name: string }[];
}

interface CancelResult {
  success: boolean;
  message: string;
  appointmentFound: boolean;
  canCancel: boolean;
  requiresConfirmation?: boolean;
  originalAppointment?: AppointmentDetails;
  reason?: string;
}

interface CancelMenuResult {
  success: boolean;
  message: string;
  cancelled: boolean;
  reason?: string;
}

interface CancellationPolicy {
  minimumHoursAdvance: number;
  allowSameDayCancel: boolean;
  businessHoursOnly: boolean;
}

export class CancelAppointmentManagerService {
  
  /**
   * Processa solicitação de cancelamento
   */
  async processCancelRequest(tenantId: string, appointmentId: string, userQuery?: string): Promise<CancelResult> {
    try {
      console.log(`🔍 [CANCEL] Processando cancelamento - Tenant: ${tenantId}, Appointment: ${appointmentId}`);

      // 1. Buscar agendamento
      const appointment = await this.findAppointment(tenantId, appointmentId);
      
      if (!appointment) {
        console.log(`❌ [CANCEL] Agendamento não encontrado: ${appointmentId}`);
        return {
          success: false,
          message: '❌ **Agendamento não encontrado**\n\n🔍 Verifique se o código de confirmação está correto.\n\n💡 O código tem formato similar a: `abc12def-3456-789a-bcde-f0123456789a`',
          appointmentFound: false,
          canCancel: false
        };
      }

      const serviceName = Array.isArray(appointment.services) 
        ? (appointment.services[0]?.name || 'Serviço')
        : (appointment.services?.name || 'Serviço');
      console.log(`✅ [CANCEL] Agendamento encontrado: ${serviceName} - ${format(parseISO(appointment.start_time), 'dd/MM/yyyy HH:mm')}`);

      // 2. Verificar se pode ser cancelado
      const canCancel = this.canBeCancelled(appointment);
      if (!canCancel.allowed) {
        console.log(`❌ [CANCEL] Cancelamento não permitido: ${canCancel.reason}`);
        return {
          success: false,
          message: `❌ **Não é possível cancelar este agendamento**\n\n${canCancel.reason}`,
          appointmentFound: true,
          canCancel: false,
          originalAppointment: appointment,
          reason: canCancel.reason
        };
      }

      // 3. Gerar mensagem de confirmação
      const confirmationMessage = this.generateCancelConfirmationMessage(appointment);

      return {
        success: true,
        message: confirmationMessage,
        appointmentFound: true,
        canCancel: true,
        requiresConfirmation: true,
        originalAppointment: appointment
      };

    } catch (error) {
      console.error('❌ [CANCEL] Erro ao processar cancelamento:', error);
      return {
        success: false,
        message: 'Erro interno ao processar cancelamento. Tente novamente.',
        appointmentFound: false,
        canCancel: false
      };
    }
  }

  /**
   * Processa confirmação do cancelamento
   */
  async processConfirmation(tenantId: string, appointmentId: string, confirmation: string): Promise<CancelMenuResult> {
    try {
      console.log(`🔍 [CANCEL] Processando confirmação - Response: ${confirmation}`);

      // Verificar se é confirmação positiva
      const isConfirmed = this.isPositiveConfirmation(confirmation);
      
      if (!isConfirmed) {
        return {
          success: true,
          message: '✅ **Cancelamento abortado**\n\n📅 Seu agendamento continua confirmado.\n\n💬 Se precisar de ajuda, estou aqui!',
          cancelled: false
        };
      }

      // Executar cancelamento
      const cancelSuccess = await this.executeCancellation(tenantId, appointmentId);
      
      if (cancelSuccess) {
        const appointment = await this.findAppointment(tenantId, appointmentId);
        const successMessage = this.generateCancelSuccessMessage(appointment);
        
        console.log(`✅ [CANCEL] Agendamento cancelado com sucesso: ${appointmentId}`);
        
        return {
          success: true,
          message: successMessage,
          cancelled: true
        };
      } else {
        return {
          success: false,
          message: '❌ **Erro ao cancelar agendamento**\n\nOcorreu um problema técnico. Tente novamente ou entre em contato conosco.',
          cancelled: false,
          reason: 'database_error'
        };
      }

    } catch (error) {
      console.error('❌ [CANCEL] Erro ao processar confirmação:', error);
      return {
        success: false,
        message: 'Erro interno ao confirmar cancelamento. Tente novamente.',
        cancelled: false,
        reason: 'internal_error'
      };
    }
  }

  /**
   * Busca agendamento por ID
   */
  private async findAppointment(tenantId: string, appointmentId: string): Promise<AppointmentDetails | null> {
    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        start_time,
        end_time,
        status,
        tenant_id,
        user_id,
        services!inner(name),
        professionals!inner(full_name)
      `)
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId)
      .neq('status', 'cancelled')
      .single();

    if (error) {
      console.log(`🔍 [CANCEL] Query error:`, error);
      return null;
    }

    return data;
  }

  /**
   * Verifica se agendamento pode ser cancelado
   */
  private canBeCancelled(appointment: AppointmentDetails): { allowed: boolean; reason?: string } {
    const now = new Date();
    const appointmentTime = parseISO(appointment.start_time);
    
    // Verificar se já passou
    if (isBefore(appointmentTime, now)) {
      return {
        allowed: false,
        reason: '⏰ Este agendamento já ocorreu e não pode ser cancelado.'
      };
    }

    // Verificar se já está cancelado
    if (appointment.status === 'cancelled') {
      return {
        allowed: false,
        reason: '❌ Este agendamento já foi cancelado anteriormente.'
      };
    }

    // Política de cancelamento: pelo menos 2 horas de antecedência
    const hoursUntilAppointment = differenceInHours(appointmentTime, now);
    const minimumHours = this.getCancellationPolicy(appointment.tenant_id).minimumHoursAdvance;
    
    if (hoursUntilAppointment < minimumHours) {
      return {
        allowed: false,
        reason: `⏰ Cancelamento deve ser feito com pelo menos ${minimumHours} horas de antecedência.\n\n📞 Para emergências, entre em contato diretamente.`
      };
    }

    return { allowed: true };
  }

  /**
   * Política de cancelamento por tenant
   */
  private getCancellationPolicy(tenantId: string): CancellationPolicy {
    // Por enquanto, política padrão. Futuramente pode ser configurável por tenant
    return {
      minimumHoursAdvance: 2,
      allowSameDayCancel: true,
      businessHoursOnly: false
    };
  }

  /**
   * Gera mensagem de confirmação de cancelamento
   */
  private generateCancelConfirmationMessage(appointment: AppointmentDetails): string {
    const serviceName = Array.isArray(appointment.services) 
      ? (appointment.services[0]?.name || 'Serviço')
      : (appointment.services?.name || 'Serviço');
    const professionalName = Array.isArray(appointment.professionals)
      ? (appointment.professionals[0]?.full_name || 'Profissional')
      : (appointment.professionals?.full_name || 'Profissional');
    const dateTime = format(parseISO(appointment.start_time), "dd/MM/yyyy 'às' HH:mm");
    
    return `⚠️ **Confirmação de Cancelamento**

📅 **Agendamento a ser cancelado:**
• ${serviceName}
• ${professionalName}
• ${dateTime}

❓ **Tem certeza que deseja cancelar?**

Responda:
✅ **SIM** - para confirmar o cancelamento
❌ **NÃO** - para manter o agendamento

⚠️ Esta ação não pode ser desfeita.`;
  }

  /**
   * Verifica se resposta é confirmação positiva
   */
  private isPositiveConfirmation(response: string): boolean {
    const normalizedResponse = response.toLowerCase().trim();
    
    const positiveWords = [
      'sim', 'yes', 's', 'confirmo', 'confirmar', 'ok', 
      'cancelar', 'cancela', 'pode cancelar', 'quero cancelar',
      'certo', 'correto', 'isso mesmo', 'exato'
    ];

    return positiveWords.some(word => 
      normalizedResponse.includes(word) || 
      normalizedResponse === word
    );
  }

  /**
   * Executa o cancelamento no banco de dados
   */
  private async executeCancellation(tenantId: string, appointmentId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId);

    return !error;
  }

  /**
   * Gera mensagem de sucesso do cancelamento
   */
  private generateCancelSuccessMessage(appointment: AppointmentDetails | null): string {
    if (!appointment) {
      return '✅ **Agendamento cancelado com sucesso!**\n\n💬 Se precisar agendar novamente, estou aqui para ajudar!';
    }

    const serviceName = Array.isArray(appointment.services) 
      ? (appointment.services[0]?.name || 'Serviço')
      : (appointment.services?.name || 'Serviço');
    const dateTime = format(parseISO(appointment.start_time), "dd/MM/yyyy 'às' HH:mm");

    return `✅ **Agendamento cancelado com sucesso!**

📅 **Agendamento cancelado:**
• ${serviceName}
• ${dateTime}

💡 **Próximos passos:**
• Você pode agendar novamente quando desejar
• Não há cobrança por este cancelamento

💬 **Precisa de ajuda?**
Estou aqui para qualquer dúvida ou novo agendamento!`;
  }

  /**
   * Extrai ID de agendamento da mensagem do usuário
   */
  static extractAppointmentId(message: string): string | null {
    // Regex para UUID no formato padrão
    const uuidRegex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
    const match = message.match(uuidRegex);
    return match ? (match[1] || null) : null;
  }
}