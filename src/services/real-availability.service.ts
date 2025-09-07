/**
 * Real Availability Service
 * Elimina COMPLETAMENTE os hardcoded fictícios e implementa sistema real
 * baseado em dados reais do banco: appointments + availability_templates
 */

import { supabaseAdmin } from '../config/database';

export interface TimeSlot {
  datetime: string; // ISO string
  formatted: string; // formato PT-BR
  available: boolean;
  reason?: string; // motivo se não disponível
}

export interface AvailabilityTemplate {
  id: string;
  name: string;
  tenant_id: string | null;
  is_default: boolean | null;
  monday_slots?: any;
  tuesday_slots?: any;
  wednesday_slots?: any;
  thursday_slots?: any;
  friday_slots?: any;
  saturday_slots?: any;
  sunday_slots?: any;
  special_dates?: any; // JSON from database
}

export interface AppointmentConflict {
  start_time: string;
  end_time: string;
  service: any;
  status: string | null;
}

export class RealAvailabilityService {

  /**
   * MÉTODO PRINCIPAL - Obter slots reais disponíveis
   * Substitui completamente a função suggestSlots hardcoded
   */
  async getRealAvailableSlots(
    tenantId: string,
    dateISO?: string,
    window?: 'manha' | 'tarde' | 'noite',
    serviceId?: string
  ): Promise<{
    success: boolean;
    slots: TimeSlot[];
    message: string;
    date_analyzed: string;
  }> {
    try {
      // 1. Determinar data alvo (hoje +1 se não especificado)
      const targetDate = dateISO ? new Date(dateISO) : this.getNextBusinessDay();
      const dateStr = targetDate.toISOString().split('T')[0] as string;

      console.log(`🔍 [REAL-AVAILABILITY] Analisando ${dateStr} para tenant ${tenantId}`);

      // 2. Buscar template de availability do tenant
      const template = await this.getAvailabilityTemplate(tenantId);
      if (!template.success) {
        return {
          success: false,
          slots: [],
          message: 'Configuração de horários não encontrada. Entre em contato para agendar.',
          date_analyzed: dateStr
        };
      }

      // 3. Gerar slots base do template para o dia da semana
      const baseSlots = this.generateBaseSlotsFromTemplate(
        template.data!, 
        targetDate, 
        window
      );

      if (baseSlots.length === 0) {
        return {
          success: true,
          slots: [],
          message: this.getClosedMessage(targetDate, window),
          date_analyzed: dateStr
        };
      }

      // 4. Buscar agendamentos existentes para verificar conflitos
      const conflicts = await this.getAppointmentConflicts(tenantId, dateStr);

      // 5. Filtrar slots disponíveis (sem conflitos)
      const availableSlots = this.filterAvailableSlots(baseSlots, conflicts.data);

      // 6. Formatar resposta
      const message = availableSlots.length > 0 
        ? `Horários disponíveis para ${this.formatDate(targetDate)}:`
        : `Sem horários disponíveis para ${this.formatDate(targetDate)}. Tente outro dia.`;

      return {
        success: true,
        slots: availableSlots.slice(0, 5), // máximo 5 slots
        message,
        date_analyzed: dateStr
      };

    } catch (error) {
      console.error('❌ [REAL-AVAILABILITY] Erro:', error);
      return {
        success: false,
        slots: [],
        message: 'Erro ao consultar disponibilidade. Tente novamente.',
        date_analyzed: (dateISO ?? new Date().toISOString().split('T')[0]) as string
      };
    }
  }

  /**
   * Buscar template de availability do tenant
   */
  private async getAvailabilityTemplate(tenantId: string): Promise<{
    success: boolean;
    data?: AvailabilityTemplate;
  }> {
    try {
      // Buscar template específico do tenant ou default
      const { data: template, error } = await supabaseAdmin
        .from('availability_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .single();

      if (error && error.code === 'PGRST116') {
        // Não tem template, criar padrão
        console.log(`ℹ️  [REAL-AVAILABILITY] Criando template padrão para tenant ${tenantId}`);
        return await this.createDefaultTemplate(tenantId);
      }

      if (error) {
        console.error('❌ [REAL-AVAILABILITY] Erro ao buscar template:', error);
        return { success: false };
      }

      return { success: true, data: template };

    } catch (error) {
      console.error('❌ [REAL-AVAILABILITY] Erro template:', error);
      return { success: false };
    }
  }

  /**
   * Criar template padrão para tenant que não tem
   */
  private async createDefaultTemplate(tenantId: string): Promise<{
    success: boolean;
    data?: AvailabilityTemplate;
  }> {
    try {
      const defaultTemplate = {
        tenant_id: tenantId,
        name: 'Horário Padrão',
        is_default: true,
        monday_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        tuesday_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        wednesday_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        thursday_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        friday_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        saturday_slots: ['09:00', '10:00', '11:00'],
        sunday_slots: [] // Fechado domingo
      };

      const { data, error } = await supabaseAdmin
        .from('availability_templates')
        .insert(defaultTemplate)
        .select()
        .single();

      if (error) {
        console.error('❌ [REAL-AVAILABILITY] Erro ao criar template:', error);
        return { success: false };
      }

      console.log('✅ [REAL-AVAILABILITY] Template padrão criado');
      return { success: true, data };

    } catch (error) {
      console.error('❌ [REAL-AVAILABILITY] Erro criar template:', error);
      return { success: false };
    }
  }

  /**
   * Gerar slots base do template para data específica
   */
  private generateBaseSlotsFromTemplate(
    template: AvailabilityTemplate,
    targetDate: Date,
    window?: 'manha' | 'tarde' | 'noite'
  ): TimeSlot[] {
    const dayOfWeek = targetDate.getDay(); // 0 = domingo, 1 = segunda, etc.
    const dateStr = targetDate.toISOString().split('T')[0];

    // 1. Verificar se é data especial (feriado/fechado)
    const specialDates = (template.special_dates as Record<string, string[]>) || {};
    if (dateStr && specialDates[dateStr]) {
      const specialSlots = specialDates[dateStr];
      if (specialSlots && specialSlots.includes('closed')) {
        return [];
      }
      // Se tem slots especiais, usar eles
      if (specialSlots) {
        return this.createTimeSlotsFromStrings(specialSlots, targetDate);
      }
    }

    // 2. Buscar slots do dia da semana
    let daySlots: string[] = [];
    switch (dayOfWeek) {
      case 1: daySlots = (template.monday_slots as string[]) || []; break;
      case 2: daySlots = (template.tuesday_slots as string[]) || []; break;
      case 3: daySlots = (template.wednesday_slots as string[]) || []; break;
      case 4: daySlots = (template.thursday_slots as string[]) || []; break;
      case 5: daySlots = (template.friday_slots as string[]) || []; break;
      case 6: daySlots = (template.saturday_slots as string[]) || []; break;
      case 0: daySlots = (template.sunday_slots as string[]) || []; break;
    }

    // 3. Filtrar por período se especificado
    if (window) {
      daySlots = this.filterSlotsByWindow(daySlots, window);
    }

    // 4. Converter para TimeSlots
    return this.createTimeSlotsFromStrings(daySlots, targetDate);
  }

  /**
   * Converter strings de horário (ex: "09:00") em TimeSlot objects
   */
  private createTimeSlotsFromStrings(timeStrings: string[], targetDate: Date): TimeSlot[] {
    return timeStrings.map(timeStr => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const slotDate = new Date(targetDate);
      slotDate.setHours(hours || 0, minutes || 0, 0, 0);

      return {
        datetime: slotDate.toISOString(),
        formatted: slotDate.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        available: true // será verificado depois contra conflitos
      };
    });
  }

  /**
   * Filtrar slots por período (manhã, tarde, noite)
   */
  private filterSlotsByWindow(slots: string[], window: 'manha' | 'tarde' | 'noite'): string[] {
    return slots.filter(slot => {
      const timePart = slot.split(':')[0];
      const hour = parseInt(timePart || '0');
      switch (window) {
        case 'manha': return hour >= 6 && hour < 12;
        case 'tarde': return hour >= 12 && hour < 18;
        case 'noite': return hour >= 18 && hour < 24;
        default: return true;
      }
    });
  }

  /**
   * Buscar conflitos de agendamento para data específica
   */
  private async getAppointmentConflicts(tenantId: string, dateStr: string): Promise<{
    success: boolean;
    data: AppointmentConflict[];
  }> {
    try {
      const { data: appointments, error } = await supabaseAdmin
        .from('appointments')
        .select('start_time, end_time, appointment_data, status')
        .eq('tenant_id', tenantId)
        .gte('start_time', `${dateStr}T00:00:00`)
        .lt('start_time', `${dateStr}T23:59:59`)
        .in('status', ['confirmed', 'pending']); // apenas agendamentos ativos

      if (error) {
        console.error('❌ [REAL-AVAILABILITY] Erro buscar conflitos:', error);
        return { success: false, data: [] };
      }

      const conflicts: AppointmentConflict[] = (appointments || []).map(apt => ({
        start_time: apt.start_time,
        end_time: apt.end_time,
        service: (apt.appointment_data as any)?.service || 'Serviço',
        status: apt.status || 'pending'
      }));

      console.log(`📅 [REAL-AVAILABILITY] Encontrados ${conflicts.length} conflitos em ${dateStr}`);
      return { success: true, data: conflicts };

    } catch (error) {
      console.error('❌ [REAL-AVAILABILITY] Erro conflitos:', error);
      return { success: false, data: [] };
    }
  }

  /**
   * Filtrar slots disponíveis removendo conflitos
   */
  private filterAvailableSlots(baseSlots: TimeSlot[], conflicts: AppointmentConflict[]): TimeSlot[] {
    return baseSlots.map(slot => {
      // Assumir duração padrão de 1h por slot
      const slotStart = new Date(slot.datetime);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      // Verificar conflitos
      for (const conflict of conflicts) {
        const conflictStart = new Date(conflict.start_time);
        const conflictEnd = new Date(conflict.end_time);

        // Verificar sobreposição
        if (slotStart < conflictEnd && slotEnd > conflictStart) {
          return {
            ...slot,
            available: false,
            reason: `Ocupado - ${conflict.service}`
          };
        }
      }

      return slot; // disponível
    }).filter(slot => slot.available); // só retornar disponíveis
  }

  /**
   * Obter próximo dia útil
   */
  private getNextBusinessDay(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Se for domingo (0), pular para segunda (1)
    if (tomorrow.getDay() === 0) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }
    
    return tomorrow;
  }

  /**
   * Formatar data para português
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      weekday: 'long'
    });
  }

  /**
   * Mensagem quando não há horários (fechado)
   */
  private getClosedMessage(date: Date, window?: string): string {
    const dayName = this.formatDate(date);
    const period = window ? ` no período da ${window}` : '';
    return `Não atendemos ${dayName}${period}. Tente outro dia.`;
  }

  /**
   * Formatar slots para resposta do chatbot
   */
  formatSlotsForChat(slots: TimeSlot[]): string {
    if (slots.length === 0) {
      return 'Não há horários disponíveis.';
    }

    const formatted = slots.map(slot => slot.formatted).join(', ');
    return `${formatted}. Qual funciona melhor pra você?`;
  }
}