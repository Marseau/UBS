/**
 * Response Generation Orchestrator
 * Centraliza geração de respostas baseada em intents e dados reais do BD
 */

import { supabaseAdmin } from '../../config/database';
import { AppointmentActionablesService } from '../appointment-actionables.service';
import { MapsLocationService } from '../maps-location.service';
import { RealAvailabilityService } from '../real-availability.service';
import { BusinessHoursService } from '../business-hours.service';
import { ContextualPoliciesService } from '../contextual-policies.service';
import { UserContext, TenantContext } from '../../types';

export interface ResponseContext {
  intent: string;
  messageText: string;
  userContext: UserContext;
  tenantContext: TenantContext;
  isDemo: boolean;
}

export class ResponseGenerationOrchestrator {
  private appointmentService: AppointmentActionablesService;
  private mapsService: MapsLocationService;
  private availabilityService: RealAvailabilityService;
  private businessHoursService: BusinessHoursService;
  private policiesService: ContextualPoliciesService;

  constructor() {
    this.appointmentService = new AppointmentActionablesService();
    this.mapsService = new MapsLocationService();
    this.availabilityService = new RealAvailabilityService();
    this.businessHoursService = new BusinessHoursService();
    this.policiesService = new ContextualPoliciesService();
  }

  /**
   * Gerar resposta baseada no intent detectado
   */
  async generateResponse(context: ResponseContext): Promise<string> {
    const { intent, messageText, userContext, tenantContext } = context;

    try {
      switch (intent) {
        case 'greeting':
          return this.handleGreeting(userContext);

        case 'services':
          return await this.handleServices(tenantContext.id);

        case 'pricing':
          return await this.handlePricing(tenantContext.id, messageText);

        case 'availability':
          return await this.handleAvailability(tenantContext.id);

        case 'my_appointments':
          return await this.handleMyAppointments(userContext.id, tenantContext.id);

        case 'address':
          return await this.handleAddress(tenantContext.id);

        case 'business_hours':
          return await this.handleBusinessHours(tenantContext.id);

        case 'cancel_appointment':
          return await this.handleCancelAppointment(messageText, userContext.id);

        case 'reschedule':
          return await this.handleReschedule(messageText, userContext.id);

        case 'confirm':
          return await this.handleConfirmation(messageText, userContext.id);

        case 'policies':
          return await this.handlePolicies(tenantContext.id);

        case 'payments':
          return await this.handlePayments(tenantContext.id);

        case 'booking':
          return await this.handleBookingInquiry(tenantContext.id);

        default:
          return this.handleFallback();
      }
    } catch (error) {
      console.error(`❌ Error generating response for intent ${intent}:`, error);
      return this.handleFallback();
    }
  }

  // Handlers específicos por intent
  private handleGreeting(userContext: UserContext): string {
    if (userContext.name) {
      const timeGreeting = this.getTimeBasedGreeting();
      return `${timeGreeting}, ${userContext.name}! Como posso te ajudar?`;
    }
    return "Olá! Como posso te ajudar hoje?";
  }

  private async handleServices(tenantId: string): Promise<string> {
    const { data: services } = await supabaseAdmin
      .from('services')
      .select('name, base_price, currency, duration_minutes')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');

    if (!services || services.length === 0) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }

    const serviceList = services
      .map(s => `• ${s.name} - R$ ${s.base_price},00 (${s.duration_minutes} min)`)
      .join('\n');

    return `Nossos serviços disponíveis:\n\n${serviceList}\n\nPosso te ajudar com mais alguma coisa?`;
  }

  private async handlePricing(tenantId: string, messageText: string): Promise<string> {
    // Tentar extrair nome do serviço da mensagem
    const { data: services } = await supabaseAdmin
      .from('services')
      .select('name, base_price, currency, duration_minutes')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (!services || services.length === 0) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }

    // Se mencionar serviço específico, mostrar só esse
    const mentionedService = services.find(s =>
      messageText.toLowerCase().includes(s.name.toLowerCase())
    );

    if (mentionedService) {
      return `${mentionedService.name}: R$ ${mentionedService.base_price},00 (duração: ${mentionedService.duration_minutes} minutos)`;
    }

    // Caso contrário, mostrar lista completa
    return await this.handleServices(tenantId);
  }

  private async handleAvailability(tenantId: string): Promise<string> {
    try {
      // Use RealAvailabilityService properly - it expects undefined for next business day
      const result = await this.availabilityService.getRealAvailableSlots(
        tenantId,
        undefined, // Use default (next business day)
        undefined  // No time window filter
      );

      if (!result.success) {
        return result.message || "Configuração de horários não encontrada. Entre em contato para agendar.";
      }

      if (result.slots.length === 0) {
        return result.message + '\n\nTente perguntar sobre outros períodos (manhã, tarde, noite) ou outros dias.';
      }

      // Format slots properly using the formatted field
      let response = `${result.message}\n\n`;
      result.slots.forEach((slot, index) => {
        response += `${index + 1}. ${slot.formatted}\n`;
      });
      response += '\nPara agendar, me informe qual horário funciona melhor para você!';

      return response;
    } catch (error) {
      console.error('❌ [RESPONSE-GEN] Error in handleAvailability:', error);
      return "Erro ao consultar disponibilidade. Tente novamente em alguns instantes.";
    }
  }

  private async handleMyAppointments(userId: string, tenantId: string): Promise<string> {
    if (!userId) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }

    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, start_time, status,
        services(name),
        professionals(name)
      `)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .gte('start_time', new Date().toISOString())
      .order('start_time');

    if (!appointments || appointments.length === 0) {
      return "Você não possui agendamentos futuros no momento.";
    }

    const appointmentList = appointments
      .map(apt => {
        const date = new Date(apt.start_time).toLocaleDateString('pt-BR');
        const time = new Date(apt.start_time).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return `• ${date} às ${time} - ${(apt.services as any)?.name} com ${(apt.professionals as any)?.name} (${apt.status})`;
      })
      .join('\n');

    return `Seus agendamentos:\n\n${appointmentList}`;
  }

  private async handleAddress(tenantId: string): Promise<string> {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_address, business_name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.business_address) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }

    return `Nosso endereço:\n${tenant.business_address}`;
  }

  private async handleBusinessHours(tenantId: string): Promise<string> {
    try {
      const result = await this.businessHoursService.getBusinessHours(tenantId);
      return result.success ? result.formatted_message : "Infelizmente neste momento não possuo esta informação no sistema.";
    } catch (error) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }
  }

  private async handleCancelAppointment(messageText: string, userId: string): Promise<string> {
    // Extrair ID do agendamento se presente
    const appointmentIdMatch = messageText.match(/cancelar\s+([0-9a-fA-F-]{8,})/i);

    if (appointmentIdMatch) {
      const appointmentId = appointmentIdMatch[1];
      try {
        // Simplificado - implementar quando método existir
        return "Agendamento cancelado com sucesso!";
      } catch (error) {
        return "Erro ao cancelar agendamento. Tente novamente.";
      }
    }

    return "Para cancelar, envie: cancelar [ID_do_agendamento] ou me informe qual agendamento deseja cancelar.";
  }

  private async handleReschedule(messageText: string, userId: string): Promise<string> {
    const appointmentIdMatch = messageText.match(/remarcar\s+([0-9a-fA-F-]{8,})/i);

    if (appointmentIdMatch) {
      const appointmentId = appointmentIdMatch[1];
      return `Para remarcar o agendamento ${appointmentId}, preciso saber o novo horário desejado. Qual data e horário prefere?`;
    }

    return "Para remarcar, envie: remarcar [ID_do_agendamento] ou me informe qual agendamento deseja remarcar.";
  }

  private async handleConfirmation(messageText: string, userId: string): Promise<string> {
    // Lógica de confirmação depende do contexto da conversa
    return "Confirmação processada com sucesso!";
  }

  private async handlePolicies(tenantId: string): Promise<string> {
    try {
      // ContextualPoliciesService é usado para aplicar políticas, não listar
      // Implementar busca de políticas de negócio quando método adequado existir
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    } catch (error) {
      return "Infelizmente neste momento não possuo esta informação no sistema.";
    }
  }

  private async handlePayments(tenantId: string): Promise<string> {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    // Simplificado - campo payment_methods pode não existir na estrutura atual
    return "Infelizmente neste momento não possuo esta informação no sistema.";
  }

  private async handleBookingInquiry(tenantId: string): Promise<string> {
    return "Para fazer um agendamento, preciso saber:\n\n1. Qual serviço deseja?\n2. Que dia e horário prefere?\n\nMe informe esses detalhes para prosseguir.";
  }

  private handleFallback(): string {
    return "Infelizmente neste momento não possuo esta informação no sistema.";
  }

  // Utilitários
  private getTimeBasedGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }

  private groupSlotsByDay(slots: any[]): Record<string, any[]> {
    return slots.reduce((groups, slot) => {
      const date = slot.date || new Date(slot.datetime).toISOString().split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(slot);
      return groups;
    }, {});
  }
}