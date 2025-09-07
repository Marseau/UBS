/**
 * Business Hours Service
 * Sistema determinístico para exibir horários de funcionamento reais
 * baseado nos dados de availability_templates (mesma fonte da agenda)
 */

import { supabaseAdmin } from '../config/database';

export interface BusinessHours {
  monday: string[];
  tuesday: string[];
  wednesday: string[];
  thursday: string[];
  friday: string[];
  saturday: string[];
  sunday: string[];
  special_dates?: Record<string, string[]>; // '2025-12-25': ['closed']
}

export interface BusinessHoursResponse {
  success: boolean;
  hours: BusinessHours;
  formatted_message: string;
  has_special_dates: boolean;
}

export class BusinessHoursService {

  /**
   * MÉTODO PRINCIPAL - Obter horários de funcionamento reais do tenant
   */
  async getBusinessHours(tenantId: string): Promise<BusinessHoursResponse> {
    try {
      console.log(`🕐 [BUSINESS-HOURS] Consultando horários para tenant ${tenantId}`);

      // 1. Buscar template de availability (mesma fonte da agenda)
      const { data: template, error } = await supabaseAdmin
        .from('availability_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .single();

      if (error && error.code === 'PGRST116') {
        // Não tem template, retornar horários padrão
        return this.getDefaultBusinessHours();
      }

      if (error) {
        console.error('❌ [BUSINESS-HOURS] Erro ao buscar template:', error);
        return this.getDefaultBusinessHours();
      }

      // 2. Converter template para business hours
      const businessHours: BusinessHours = {
        monday: this.extractHoursFromSlots(template.monday_slots as string[] || []),
        tuesday: this.extractHoursFromSlots(template.tuesday_slots as string[] || []),
        wednesday: this.extractHoursFromSlots(template.wednesday_slots as string[] || []),
        thursday: this.extractHoursFromSlots(template.thursday_slots as string[] || []),
        friday: this.extractHoursFromSlots(template.friday_slots as string[] || []),
        saturday: this.extractHoursFromSlots(template.saturday_slots as string[] || []),
        sunday: this.extractHoursFromSlots(template.sunday_slots as string[] || []),
        special_dates: (template.special_dates as Record<string, string[]>) || {}
      };

      // 3. Gerar mensagem formatada
      const formattedMessage = this.formatBusinessHoursMessage(businessHours);

      return {
        success: true,
        hours: businessHours,
        formatted_message: formattedMessage,
        has_special_dates: Object.keys(businessHours.special_dates || {}).length > 0
      };

    } catch (error) {
      console.error('❌ [BUSINESS-HOURS] Erro geral:', error);
      return this.getDefaultBusinessHours();
    }
  }

  /**
   * Extrair horário de funcionamento de slots (primeiro e último slot)
   */
  private extractHoursFromSlots(slots: string[]): string[] {
    if (!slots || slots.length === 0) return [];

    // Ordenar slots para garantir ordem cronológica
    const sortedSlots = [...slots].sort();
    const firstSlot = sortedSlots[0];
    const lastSlot = sortedSlots[sortedSlots.length - 1];

    if (!firstSlot || !lastSlot) return [];

    // Calcular horário de fechamento (último slot + 1 hora)
    const [hour, minute] = lastSlot.split(':').map(Number);
    if (hour === undefined || minute === undefined) return [];
    
    const closingHour = hour + 1;
    const closingTime = `${closingHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    return [firstSlot, closingTime];
  }

  /**
   * Formatar horários em mensagem legível para usuário
   */
  private formatBusinessHoursMessage(hours: BusinessHours): string {
    const days = [
      { name: 'Segunda-feira', key: 'monday' as keyof BusinessHours },
      { name: 'Terça-feira', key: 'tuesday' as keyof BusinessHours },
      { name: 'Quarta-feira', key: 'wednesday' as keyof BusinessHours },
      { name: 'Quinta-feira', key: 'thursday' as keyof BusinessHours },
      { name: 'Sexta-feira', key: 'friday' as keyof BusinessHours },
      { name: 'Sábado', key: 'saturday' as keyof BusinessHours },
      { name: 'Domingo', key: 'sunday' as keyof BusinessHours }
    ];

    let message = '🕐 **Horários de Funcionamento:**\n\n';

    // Agrupar dias com mesmo horário
    const scheduleGroups: Record<string, string[]> = {};
    
    days.forEach(day => {
      const dayHours = hours[day.key] as string[];
      const schedule = this.formatDaySchedule(dayHours);
      
      if (!scheduleGroups[schedule]) {
        scheduleGroups[schedule] = [];
      }
      scheduleGroups[schedule].push(day.name);
    });

    // Formato otimizado por grupos
    Object.entries(scheduleGroups).forEach(([schedule, dayNames]) => {
      if (schedule === 'Fechado') {
        message += `${dayNames.join(', ')}: **${schedule}**\n`;
      } else {
        message += `${dayNames.join(', ')}: **${schedule}**\n`;
      }
    });

    // Adicionar datas especiais se houver
    if (hours.special_dates && Object.keys(hours.special_dates).length > 0) {
      message += '\n📅 **Datas Especiais:**\n';
      Object.entries(hours.special_dates).forEach(([date, slots]) => {
        const formattedDate = this.formatDate(date);
        if (slots.includes('closed')) {
          message += `${formattedDate}: **Fechado**\n`;
        } else {
          const specialHours = this.extractHoursFromSlots(slots);
          message += `${formattedDate}: **${this.formatDaySchedule(specialHours)}**\n`;
        }
      });
    }

    return message;
  }

  /**
   * Formatar horário de um dia específico
   */
  private formatDaySchedule(dayHours: string[]): string {
    if (!dayHours || dayHours.length === 0) return 'Fechado';
    if (dayHours.length !== 2) return 'Fechado';

    const [opening, closing] = dayHours;
    return `${opening} às ${closing}`;
  }

  /**
   * Formatar data para exibição (ISO para PT-BR)
   */
  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return isoDate;
    }
  }

  /**
   * Horários padrão quando não há configuração
   */
  private getDefaultBusinessHours(): BusinessHoursResponse {
    const defaultHours: BusinessHours = {
      monday: ['09:00', '18:00'],
      tuesday: ['09:00', '18:00'],
      wednesday: ['09:00', '18:00'],
      thursday: ['09:00', '18:00'],
      friday: ['09:00', '18:00'],
      saturday: ['09:00', '13:00'],
      sunday: []
    };

    return {
      success: true,
      hours: defaultHours,
      formatted_message: this.formatBusinessHoursMessage(defaultHours),
      has_special_dates: false
    };
  }

  /**
   * Verificar se está aberto no momento atual
   */
  async isCurrentlyOpen(tenantId: string): Promise<{
    is_open: boolean;
    status_message: string;
    next_opening?: string;
  }> {
    const businessHours = await this.getBusinessHours(tenantId);
    
    if (!businessHours.success) {
      return {
        is_open: false,
        status_message: 'Não foi possível verificar o status de funcionamento.'
      };
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = domingo, 1 = segunda, etc.
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
    const currentDate = now.toISOString().split('T')[0];

    // 1. Verificar se é data especial
    const specialSlots = businessHours.hours.special_dates && currentDate ? businessHours.hours.special_dates[currentDate] : undefined;
    if (specialSlots) {
      if (specialSlots.includes('closed')) {
        return {
          is_open: false,
          status_message: 'Fechado hoje (data especial).'
        };
      }
      // TODO: Implementar verificação de horário especial
    }

    // 2. Verificar horário normal
    const dayNames: (keyof BusinessHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = dayNames[currentDay];
    if (!todayKey) {
      return {
        is_open: false,
        status_message: 'Erro ao verificar status de funcionamento.'
      };
    }
    const todaySchedule = businessHours.hours[todayKey] as string[];

    if (!todaySchedule || todaySchedule.length === 0) {
      return {
        is_open: false,
        status_message: 'Fechado hoje.'
      };
    }

    const opening = todaySchedule[0];
    const closing = todaySchedule[1];
    
    if (!opening || !closing) {
      return {
        is_open: false,
        status_message: 'Horário não configurado para hoje.'
      };
    }
    
    if (currentTime >= opening && currentTime <= closing) {
      return {
        is_open: true,
        status_message: `Estamos abertos! Funcionamos até as ${closing}.`
      };
    } else {
      return {
        is_open: false,
        status_message: `Fechado no momento. Abrimos às ${opening}.`,
        next_opening: opening
      };
    }
  }
}