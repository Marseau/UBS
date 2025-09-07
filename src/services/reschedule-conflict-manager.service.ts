/**
 * Reschedule Conflict Manager Service
 * Sistema inteligente de reagendamento com validação de conflitos e menus de horários
 * Previne conflitos duplos e oferece alternativas otimizadas
 */

import { supabaseAdmin } from '../config/database';
import { format, addDays, startOfDay, isBefore, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AppointmentDetails {
  id: string;
  start_time: string; // TIMESTAMPTZ
  end_time: string;   // TIMESTAMPTZ
  service_name: string;
  professional_name: string;
  status: string;
  tenant_id: string;
  user_id: string;
}

interface TimeSlot {
  date: string;
  time: string;
  displayTime: string;
  professional: string;
  available: boolean;
  conflictReason?: string;
}

interface RescheduleResult {
  success: boolean;
  message: string;
  hasConflicts: boolean;
  appointmentFound: boolean;
  availableSlots?: TimeSlot[];
  originalAppointment?: AppointmentDetails;
  menuOptions?: string[];
}

interface RescheduleMenuResult {
  success: boolean;
  message: string;
  isCompleted: boolean;
  newAppointmentDetails?: {
    date: string;
    time: string;
    professional: string;
  };
}

export class RescheduleConflictManagerService {

  /**
   * Processa solicitação de reagendamento com validação de conflitos
   */
  async processRescheduleRequest(
    tenantId: string, 
    appointmentId: string, 
    userQuery?: string
  ): Promise<RescheduleResult> {
    try {
      console.log(`🔄 [RESCHEDULE] Processando reagendamento: ${appointmentId}`);

      // 1. Buscar agendamento original
      const originalAppointment = await this.findAppointment(tenantId, appointmentId);
      
      if (!originalAppointment) {
        return {
          success: false,
          message: `❌ Agendamento ${appointmentId} não encontrado. Verifique o ID e tente novamente.`,
          hasConflicts: false,
          appointmentFound: false
        };
      }

      // 2. Verificar se pode ser reagendado (não cancelado, não passado, etc.)
      if (!this.canBeRescheduled(originalAppointment)) {
        return {
          success: false,
          message: `❌ Este agendamento não pode ser reagendado (Status: ${originalAppointment.status}).`,
          hasConflicts: false,
          appointmentFound: true,
          originalAppointment
        };
      }

      // 3. Gerar slots disponíveis inteligentes
      const availableSlots = await this.generateSmartTimeSlots(tenantId, originalAppointment);

      if (availableSlots.length === 0) {
        return {
          success: true,
          message: `😔 Não há horários disponíveis nos próximos dias para reagendar seu **${originalAppointment.service_name}** com **${originalAppointment.professional_name}**.\n\n📞 Entre em contato conosco para mais opções.`,
          hasConflicts: true,
          appointmentFound: true,
          originalAppointment,
          availableSlots: []
        };
      }

      // 4. Criar menu de opções
      const menuOptions = this.createTimeSlotMenu(availableSlots);

      return {
        success: true,
        message: this.generateRescheduleMenuMessage(originalAppointment, availableSlots),
        hasConflicts: false,
        appointmentFound: true,
        originalAppointment,
        availableSlots,
        menuOptions
      };

    } catch (error) {
      console.error('❌ [RESCHEDULE] Erro ao processar reagendamento:', error);
      return {
        success: false,
        message: 'Erro interno ao processar reagendamento. Tente novamente.',
        hasConflicts: false,
        appointmentFound: false
      };
    }
  }

  /**
   * Processa seleção de horário do menu de reagendamento
   */
  async processTimeSlotSelection(
    tenantId: string,
    appointmentId: string,
    selection: string
  ): Promise<RescheduleMenuResult> {
    try {
      console.log(`⏰ [RESCHEDULE] Processando seleção: ${selection} para agendamento ${appointmentId}`);

      // 1. Parse da seleção (pode ser número do menu ou texto)
      const selectedSlot = await this.parseTimeSlotSelection(tenantId, appointmentId, selection);
      
      if (!selectedSlot) {
        return {
          success: false,
          message: '❌ Opção inválida. Por favor, escolha um número do menu ou digite uma data/horário válidos.',
          isCompleted: false
        };
      }

      // 2. Validar disponibilidade final (double-check por segurança)
      const isStillAvailable = await this.validateSlotAvailability(tenantId, selectedSlot);
      
      if (!isStillAvailable) {
        return {
          success: false,
          message: '😔 Este horário foi reservado por outro cliente. Por favor, escolha outra opção.',
          isCompleted: false
        };
      }

      // 3. Executar o reagendamento na base de dados
      const rescheduleSuccess = await this.executeReschedule(tenantId, appointmentId, selectedSlot);

      if (!rescheduleSuccess) {
        return {
          success: false,
          message: 'Erro ao confirmar o reagendamento. Tente novamente.',
          isCompleted: false
        };
      }

      // 4. Gerar mensagem de confirmação
      const confirmationMessage = this.generateConfirmationMessage(selectedSlot);

      return {
        success: true,
        message: confirmationMessage,
        isCompleted: true,
        newAppointmentDetails: {
          date: selectedSlot.date,
          time: selectedSlot.time,
          professional: selectedSlot.professional
        }
      };

    } catch (error) {
      console.error('❌ [RESCHEDULE] Erro ao processar seleção:', error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente.',
        isCompleted: false
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
      .single();

    if (error || !data) {
      console.error('❌ [RESCHEDULE] Erro ao buscar agendamento:', error);
      return null;
    }

    return {
      id: data.id,
      start_time: data.start_time,
      end_time: data.end_time,
      service_name: (data.services as any)?.name || 'Serviço',
      professional_name: (data.professionals as any)?.full_name || 'Profissional',
      status: data.status || 'pending',
      tenant_id: data.tenant_id,
      user_id: data.user_id
    };
  }

  /**
   * Verifica se agendamento pode ser reagendado
   */
  private canBeRescheduled(appointment: AppointmentDetails): boolean {
    if (appointment.status === 'cancelled' || appointment.status === 'no_show') {
      return false;
    }

    // Verificar se não está no passado
    const appointmentDateTime = parseISO(appointment.start_time);
    const now = new Date();
    
    return isAfter(appointmentDateTime, now);
  }

  /**
   * Gera slots inteligentes baseados no agendamento original
   */
  private async generateSmartTimeSlots(tenantId: string, originalAppointment: AppointmentDetails): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const today = new Date();
    const maxDays = 14; // Próximos 14 dias

    // Buscar horários de funcionamento e agendamentos existentes
    const [businessHours, existingAppointments] = await Promise.all([
      this.getBusinessHours(tenantId),
      this.getExistingAppointments(tenantId, maxDays)
    ]);

    // Gerar slots para os próximos dias
    for (let day = 0; day < maxDays; day++) {
      const currentDate = addDays(today, day);
      const dateString = format(currentDate, 'yyyy-MM-dd');
      
      // Pular se for um dia sem funcionamento
      if (!this.isBusinessDay(currentDate, businessHours)) {
        continue;
      }

      // Gerar horários para este dia
      const daySlots = this.generateDayTimeSlots(
        dateString,
        originalAppointment,
        businessHours,
        existingAppointments
      );

      slots.push(...daySlots);
    }

    // Limitar a 6 opções e priorizar horários similares ao original
    return this.prioritizeAndLimitSlots(slots, originalAppointment, 6);
  }

  /**
   * Gera slots para um dia específico
   */
  private generateDayTimeSlots(
    dateString: string,
    originalAppointment: AppointmentDetails,
    businessHours: any[],
    existingAppointments: any[]
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const dayAppointments = existingAppointments.filter(apt => apt.appointment_date === dateString);

    // Horários comuns de funcionamento (9h às 18h, intervalos de 1h)
    const commonHours = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

    for (const time of commonHours) {
      const slot: TimeSlot = {
        date: dateString,
        time: time,
        displayTime: this.formatTimeForDisplay(time, dateString),
        professional: originalAppointment.professional_name,
        available: true
      };

      // Verificar conflitos
      const hasConflict = this.checkTimeSlotConflict(slot, dayAppointments);
      if (hasConflict) {
        slot.available = false;
        slot.conflictReason = 'Horário ocupado';
        continue; // Pular slots não disponíveis
      }

      slots.push(slot);
    }

    return slots;
  }

  /**
   * Prioriza slots similares ao horário original e limita quantidade
   */
  private prioritizeAndLimitSlots(
    slots: TimeSlot[],
    originalAppointment: AppointmentDetails,
    limit: number
  ): TimeSlot[] {
    const originalTime = originalAppointment.start_time;
    
    // Ordenar por proximidade com horário original
    slots.sort((a, b) => {
      const diffA = Math.abs(this.timeToMinutes(a.time) - this.timeToMinutes(originalTime));
      const diffB = Math.abs(this.timeToMinutes(b.time) - this.timeToMinutes(originalTime));
      return diffA - diffB;
    });

    return slots.slice(0, limit);
  }

  /**
   * Verifica conflito em um slot específico
   */
  private checkTimeSlotConflict(slot: TimeSlot, dayAppointments: any[]): boolean {
    return dayAppointments.some(apt => {
      // Considerando serviço de 1h de duração padrão
      const slotStart = this.timeToMinutes(slot.time);
      const slotEnd = slotStart + 60; // 1 hora
      const aptStart = this.timeToMinutes(apt.start_time);
      const aptEnd = this.timeToMinutes(apt.end_time);

      // Verificar sobreposição
      return !(slotEnd <= aptStart || slotStart >= aptEnd);
    });
  }

  /**
   * Cria menu numerado de opções de horário
   */
  private createTimeSlotMenu(slots: TimeSlot[]): string[] {
    return slots.map((slot, index) => 
      `${index + 1}. ${slot.displayTime} com ${slot.professional}`
    );
  }

  /**
   * Gera mensagem de menu de reagendamento
   */
  private generateRescheduleMenuMessage(
    originalAppointment: AppointmentDetails,
    availableSlots: TimeSlot[]
  ): string {
    const original = format(parseISO(originalAppointment.start_time), 
      "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });

    let message = `🔄 **Reagendar Agendamento**\n\n`;
    message += `📅 **Agendamento atual:**\n${original}\n`;
    message += `💅 ${originalAppointment.service_name}\n`;
    message += `👩‍💼 ${originalAppointment.professional_name}\n\n`;
    
    message += `⏰ **Horários disponíveis:**\n`;
    availableSlots.forEach((slot, index) => {
      message += `${index + 1}. ${slot.displayTime}\n`;
    });
    
    message += `\n💬 **Digite o número da opção escolhida ou escreva sua preferência.**`;

    return message;
  }

  /**
   * Formatar horário para exibição amigável
   */
  private formatTimeForDisplay(time: string, dateString: string): string {
    const date = parseISO(`${dateString}T${time}`);
    return format(date, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });
  }

  /**
   * Converte horário para minutos para cálculos
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  // Métodos auxiliares (implementação básica para funcionamento)
  private async getBusinessHours(tenantId: string): Promise<any[]> {
    // Implementação simplificada - horários padrão
    return [{ day: 'all', start: '09:00', end: '18:00' }];
  }

  private async getExistingAppointments(tenantId: string, maxDays: number): Promise<any[]> {
    const endDate = format(addDays(new Date(), maxDays), 'yyyy-MM-dd');
    
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('appointment_date, start_time, end_time')
      .eq('tenant_id', tenantId)
      .gte('appointment_date', format(new Date(), 'yyyy-MM-dd'))
      .lte('appointment_date', endDate)
      .neq('status', 'cancelled');

    return data || [];
  }

  private isBusinessDay(date: Date, businessHours: any[]): boolean {
    // Implementação simplificada - todos os dias úteis
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
  }

  private async parseTimeSlotSelection(tenantId: string, appointmentId: string, selection: string): Promise<TimeSlot | null> {
    // Implementação básica - assumir seleção por número
    const menuIndex = parseInt(selection.trim()) - 1;
    
    // Recriar slots para validação (em implementação real, cachear)
    const originalAppointment = await this.findAppointment(tenantId, appointmentId);
    if (!originalAppointment) return null;
    
    const availableSlots = await this.generateSmartTimeSlots(tenantId, originalAppointment);
    
    if (menuIndex >= 0 && menuIndex < availableSlots.length) {
      return availableSlots[menuIndex] || null;
    }
    
    return null;
  }

  private async validateSlotAvailability(tenantId: string, slot: TimeSlot): Promise<boolean> {
    // Criar timestamp completo para comparação
    const slotDateTime = `${slot.date}T${slot.time}:00`;
    
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('start_time', slotDateTime)
      .neq('status', 'cancelled')
      .limit(1);

    return !data || data.length === 0;
  }

  private async executeReschedule(tenantId: string, appointmentId: string, newSlot: TimeSlot): Promise<boolean> {
    // Criar timestamps completos
    const startDateTime = `${newSlot.date}T${newSlot.time}:00`;
    const endDateTime = `${newSlot.date}T${this.calculateEndTime(newSlot.time, 60)}:00`;
    
    const { error } = await supabaseAdmin
      .from('appointments')
      .update({
        start_time: startDateTime,
        end_time: endDateTime,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId);

    return !error;
  }

  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;
    const hours = Math.floor(endMinutes / 60);
    const minutes = endMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private generateConfirmationMessage(slot: TimeSlot): string {
    return `✅ **Reagendamento confirmado!**\n\n` +
           `📅 **Novo horário:**\n${slot.displayTime}\n` +
           `👩‍💼 ${slot.professional}\n\n` +
           `📧 Você receberá uma confirmação por e-mail em breve.\n\n` +
           `❓ Precisa de mais alguma coisa?`;
  }
}