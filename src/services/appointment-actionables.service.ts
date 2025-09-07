/**
 * Appointment Actionables Service
 * Sistema de ações estruturadas para agendamentos com compliance/auditoria
 * Utiliza menus estruturados para horários e ações críticas
 */

import { supabaseAdmin } from '../config/database';

export interface AppointmentActionable {
  appointmentId: string;
  appointmentDisplay: string;
  availableActions: AppointmentAction[];
  requiresConfirmation: boolean;
}

export interface AppointmentAction {
  action: 'cancel' | 'reschedule' | 'modify_service' | 'confirm' | 'view_details';
  label: string;
  requiresMenu: boolean;
  complianceLevel: 'low' | 'medium' | 'high';
  description?: string;
}

export interface RescheduleOptions {
  currentAppointment: {
    id: string;
    service: string;
    datetime: string;
    professional: string;
  };
  availableSlots: Array<{
    id: string;
    datetime: string;
    formatted: string;
    professional?: string;
  }>;
  requiresConfirmation: boolean;
}

export class AppointmentActionablesService {

  /**
   * MÉTODO PRINCIPAL - Obter agendamentos com actionables estruturados
   */
  async getAppointmentsWithActionables(tenantId: string, userId: string): Promise<{
    success: boolean;
    appointments: AppointmentActionable[];
    message: string;
    hasUpcoming: boolean;
  }> {
    try {
      console.log(`📅 [ACTIONABLES] Buscando agendamentos com ações para tenant ${tenantId}, user ${userId}`);

      // 1. Buscar agendamentos futuros
      const { data: appointments, error } = await supabaseAdmin
        .from('appointments')
        .select(`
          id,
          start_time,
          status,
          services(name, duration_minutes, base_price),
          professionals(name),
          users(name)
        `)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (error) {
        console.error('❌ [ACTIONABLES] Erro ao buscar agendamentos:', error);
        return {
          success: false,
          appointments: [],
          message: 'Erro ao consultar seus agendamentos. Tente novamente.',
          hasUpcoming: false
        };
      }

      if (!appointments?.length) {
        return {
          success: true,
          appointments: [],
          message: '📅 Você não tem agendamentos futuros no momento.\n\nGostaria de fazer um novo agendamento?',
          hasUpcoming: false
        };
      }

      // 2. Transformar em actionables estruturados
      const appointmentActionables: AppointmentActionable[] = [];

      for (const apt of appointments) {
        const appointmentDisplay = this.formatAppointmentForDisplay(apt);
        const availableActions = this.determineAvailableActions(apt);
        
        appointmentActionables.push({
          appointmentId: apt.id,
          appointmentDisplay,
          availableActions,
          requiresConfirmation: this.requiresConfirmation(apt)
        });
      }

      // 3. Gerar mensagem estruturada
      const message = this.generateActionablesMessage(appointmentActionables);

      return {
        success: true,
        appointments: appointmentActionables,
        message,
        hasUpcoming: true
      };

    } catch (error) {
      console.error('❌ [ACTIONABLES] Erro inesperado:', error);
      return {
        success: false,
        appointments: [],
        message: 'Erro interno. Tente novamente em alguns instantes.',
        hasUpcoming: false
      };
    }
  }

  /**
   * Processar ação selecionada pelo usuário
   */
  async processSelectedAction(
    tenantId: string, 
    userId: string, 
    appointmentId: string, 
    action: string,
    selectedOption?: string
  ): Promise<{
    success: boolean;
    message: string;
    requiresMenuResponse?: boolean;
    menuOptions?: string[];
    pendingConfirmation?: any;
  }> {
    try {
      console.log(`⚡ [ACTIONABLES] Processando ação: ${action} para agendamento ${appointmentId}`);

      switch (action) {
        case 'cancel':
          return await this.processCancelAction(tenantId, userId, appointmentId);
          
        case 'reschedule':
          return await this.processRescheduleAction(tenantId, userId, appointmentId, selectedOption);
          
        case 'view_details':
          return await this.processViewDetailsAction(tenantId, appointmentId);
          
        case 'confirm':
          return await this.processConfirmAction(tenantId, appointmentId);
          
        default:
          return {
            success: false,
            message: 'Ação não reconhecida. Use o menu de opções disponível.'
          };
      }

    } catch (error) {
      console.error('❌ [ACTIONABLES] Erro ao processar ação:', error);
      return {
        success: false,
        message: 'Erro ao processar sua solicitação. Tente novamente.'
      };
    }
  }

  /**
   * Obter opções de reagendamento (com menu estruturado para compliance)
   */
  async getRescheduleOptions(tenantId: string, appointmentId: string): Promise<RescheduleOptions | null> {
    try {
      // 1. Buscar detalhes do agendamento atual
      const { data: appointment } = await supabaseAdmin
        .from('appointments')
        .select(`
          id,
          start_time,
          services(name, duration),
          professionals(name, id)
        `)
        .eq('tenant_id', tenantId)
        .eq('id', appointmentId)
        .single();

      if (!appointment) return null;

      // 2. Buscar slots disponíveis para reagendamento
      // Simular disponibilidade (integrar com serviço real de disponibilidade)
      const availableSlots = await this.getAvailableSlotsForReschedule(
        tenantId, 
        (appointment.professionals as any)?.id,
        (appointment.services as any)?.duration_minutes
      );

      return {
        currentAppointment: {
          id: appointment.id,
          service: (appointment.services as any)?.name || 'Serviço',
          datetime: appointment.start_time,
          professional: (appointment.professionals as any)?.name || 'Profissional'
        },
        availableSlots,
        requiresConfirmation: true
      };

    } catch (error) {
      console.error('❌ [ACTIONABLES] Erro ao obter opções de reagendamento:', error);
      return null;
    }
  }

  /**
   * Formatar agendamento para exibição
   */
  private formatAppointmentForDisplay(appointment: any): string {
    const service = (appointment.services as any)?.name || 'Serviço';
    const professional = (appointment.professionals as any)?.name || '';
    const datetime = new Date(appointment.start_time);
    
    const dateStr = datetime.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit' 
    });
    const timeStr = datetime.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const professionalStr = professional ? ` com ${professional}` : '';
    return `${service}${professionalStr} - ${dateStr} às ${timeStr}`;
  }

  /**
   * Determinar ações disponíveis para um agendamento
   */
  private determineAvailableActions(appointment: any): AppointmentAction[] {
    const actions: AppointmentAction[] = [];
    const appointmentDate = new Date(appointment.start_time);
    const now = new Date();
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Visualizar detalhes (sempre disponível)
    actions.push({
      action: 'view_details',
      label: '📋 Ver detalhes',
      requiresMenu: false,
      complianceLevel: 'low',
      description: 'Ver informações completas do agendamento'
    });

    // Reagendar (disponível até 2 horas antes)
    if (hoursUntilAppointment > 2) {
      actions.push({
        action: 'reschedule',
        label: '🔄 Reagendar',
        requiresMenu: true,
        complianceLevel: 'high',
        description: 'Escolher novo horário disponível'
      });
    }

    // Cancelar (disponível até 4 horas antes para compliance)
    if (hoursUntilAppointment > 4) {
      actions.push({
        action: 'cancel',
        label: '❌ Cancelar',
        requiresMenu: false,
        complianceLevel: 'high',
        description: 'Cancelar este agendamento'
      });
    }

    // Confirmar presença (últimas 24 horas)
    if (hoursUntilAppointment <= 24 && hoursUntilAppointment > 0) {
      actions.push({
        action: 'confirm',
        label: '✅ Confirmar presença',
        requiresMenu: false,
        complianceLevel: 'medium',
        description: 'Confirmar que comparecerá ao agendamento'
      });
    }

    return actions;
  }

  /**
   * Verificar se agendamento requer confirmação adicional
   */
  private requiresConfirmation(appointment: any): boolean {
    const appointmentValue = (appointment.services as any)?.base_price || 0;
    
    // Requer confirmação para agendamentos de alto valor ou próximos
    const appointmentDate = new Date(appointment.start_time);
    const hoursUntilAppointment = (appointmentDate.getTime() - Date.now()) / (1000 * 60 * 60);
    
    return appointmentValue > 100 || hoursUntilAppointment <= 24;
  }

  /**
   * Gerar mensagem estruturada com actionables
   */
  private generateActionablesMessage(actionables: AppointmentActionable[]): string {
    if (!actionables.length) {
      return '📅 Você não tem agendamentos futuros.';
    }

    let message = `📅 **Seus próximos agendamentos:**\n\n`;

    actionables.forEach((actionable, index) => {
      const number = index + 1;
      message += `**${number}.** ${actionable.appointmentDisplay}\n`;
      message += `   ID: \`${actionable.appointmentId}\`\n\n`;
      
      // Adicionar ações disponíveis
      if (actionable.availableActions.length > 0) {
        message += `   **Ações disponíveis:**\n`;
        actionable.availableActions.forEach(action => {
          message += `   • ${action.label}`;
          if (action.description) {
            message += ` - ${action.description}`;
          }
          message += '\n';
        });
        message += '\n';
      }
    });

    message += `💬 **Como usar:** Digite a ação desejada + ID do agendamento\n`;
    message += `📝 **Exemplos:**\n`;
    if (actionables[0]) {
      message += `   • "Reagendar ${actionables[0].appointmentId}"\n`;
      message += `   • "Cancelar ${actionables[0].appointmentId}"\n`;
      message += `   • "Ver detalhes ${actionables[0].appointmentId}"\n\n`;
    }
    message += `⚠️ **Importante:** Todas as alterações requerem confirmação para sua segurança.`;

    return message;
  }

  /**
   * Processar cancelamento com retenção
   */
  private async processCancelAction(tenantId: string, userId: string, appointmentId: string) {
    // Integrar com sistema de retenção já implementado
    return {
      success: true,
      message: `🔄 Processando cancelamento do agendamento ${appointmentId}...\n\nNosso sistema de retenção será ativado para oferecer alternativas.`,
      pendingConfirmation: {
        action: 'cancel_confirmed',
        appointmentId,
        requiresDoubleConfirmation: true
      }
    };
  }

  /**
   * Processar reagendamento com menu de horários
   */
  private async processRescheduleAction(tenantId: string, userId: string, appointmentId: string, selectedOption?: string) {
    if (!selectedOption) {
      // Primeira etapa: mostrar menu de horários disponíveis
      const rescheduleOptions = await this.getRescheduleOptions(tenantId, appointmentId);
      
      if (!rescheduleOptions?.availableSlots.length) {
        return {
          success: false,
          message: '😔 Não encontrei horários disponíveis para reagendamento no momento.\n\nEntre em contato conosco para mais opções.'
        };
      }

      let menuMessage = `🔄 **Reagendamento:** ${rescheduleOptions.currentAppointment.service}\n\n`;
      menuMessage += `📅 **Horários disponíveis:**\n\n`;
      
      rescheduleOptions.availableSlots.forEach((slot, index) => {
        const optionNumber = index + 1;
        menuMessage += `**${optionNumber}.** ${slot.formatted}`;
        if (slot.professional) {
          menuMessage += ` (${slot.professional})`;
        }
        menuMessage += `\n`;
      });

      menuMessage += `\n💬 **Responda com o número da opção desejada (1-${rescheduleOptions.availableSlots.length})**`;
      menuMessage += `\n⚠️ **Confirmaremos a alteração antes de efetivar.**`;

      return {
        success: true,
        message: menuMessage,
        requiresMenuResponse: true,
        menuOptions: rescheduleOptions.availableSlots.map((_, i) => String(i + 1)),
        pendingConfirmation: {
          action: 'reschedule_slot_selected',
          appointmentId,
          availableSlots: rescheduleOptions.availableSlots
        }
      };
    }

    // Segunda etapa: processar seleção de horário
    return {
      success: true,
      message: `✅ Horário selecionado! Confirme para efetivar o reagendamento.\n\n⚠️ **Compliance:** Esta alteração será registrada para auditoria.`
    };
  }

  /**
   * Processar visualização de detalhes
   */
  private async processViewDetailsAction(tenantId: string, appointmentId: string) {
    const { data: appointment } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        start_time,
        status,
        services(name, duration, base_price, description),
        professionals(name, phone, email),
        created_at
      `)
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId)
      .single();

    if (!appointment) {
      return {
        success: false,
        message: 'Agendamento não encontrado.'
      };
    }

    const service = appointment.services as any;
    const professional = appointment.professionals as any;
    const datetime = new Date(appointment.start_time);

    let detailsMessage = `📋 **Detalhes do Agendamento**\n\n`;
    detailsMessage += `🆔 **ID:** ${appointment.id}\n`;
    detailsMessage += `📅 **Data:** ${datetime.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    detailsMessage += `🕐 **Horário:** ${datetime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    detailsMessage += `💼 **Serviço:** ${service?.name || 'N/A'}\n`;
    
    if (service?.duration_minutes) {
      detailsMessage += `⏱️ **Duração:** ${service.duration_minutes} minutos\n`;
    }
    
    if (service?.base_price) {
      detailsMessage += `💰 **Valor:** R$ ${service.base_price}\n`;
    }
    
    if (professional?.name) {
      detailsMessage += `👤 **Profissional:** ${professional.name}\n`;
    }
    
    detailsMessage += `📊 **Status:** ${appointment.status || 'Agendado'}\n`;
    detailsMessage += `📝 **Agendado em:** ${appointment.created_at ? new Date(appointment.created_at).toLocaleDateString('pt-BR') : 'N/D'}`;

    return {
      success: true,
      message: detailsMessage
    };
  }

  /**
   * Processar confirmação de presença
   */
  private async processConfirmAction(tenantId: string, appointmentId: string) {
    const { error } = await supabaseAdmin
      .from('appointments')
      .update({ 
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId);

    if (error) {
      return {
        success: false,
        message: 'Erro ao confirmar presença. Tente novamente.'
      };
    }

    return {
      success: true,
      message: `✅ **Presença confirmada!**\n\nObrigado por confirmar. Estaremos te esperando! 😊\n\n📋 **Lembrete:** Chegue 10 minutos antes do horário agendado.`
    };
  }

  /**
   * Obter slots disponíveis para reagendamento (mock - integrar com serviço real)
   */
  private async getAvailableSlotsForReschedule(tenantId: string, professionalId?: string, duration?: number) {
    // Mock data - integrar com RealAvailabilityService
    const mockSlots = [
      {
        id: 'slot-1',
        datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        formatted: 'Amanhã às 14:00',
        professional: 'Dr. Silva'
      },
      {
        id: 'slot-2', 
        datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        formatted: 'Quinta-feira às 10:30',
        professional: 'Dr. Silva'
      },
      {
        id: 'slot-3',
        datetime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        formatted: 'Sexta-feira às 16:00', 
        professional: 'Dra. Santos'
      }
    ];

    return mockSlots;
  }
}