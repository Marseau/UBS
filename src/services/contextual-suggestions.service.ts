/**
 * Contextual Suggestions Service
 * Gera sugestões inteligentes baseadas no contexto após onboarding completo
 */

import { supabaseAdmin } from '../config/database';

export interface SuggestionContext {
  tenantId: string;
  userId?: string;
  userName: string;
  userGender?: string;
  tenantDomain: string;
  isBusinessHours: boolean;
  currentHour: number;
  dayOfWeek: number;
  userHistory?: {
    totalAppointments: number;
    lastAppointment?: Date;
    favoriteServices?: string[];
    loyaltyLevel: 'new' | 'regular' | 'vip';
  };
  tenantServices: Array<{
    id: string;
    name: string;
    base_price: number;
  }>;
  activePromotions?: Array<{
    title: string;
    description: string;
    discount_percentage?: number;
  }>;
}

export interface ContextualSuggestion {
  greeting: string;
  primarySuggestion?: string;
  secondarySuggestions?: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
  shouldShowAvailability?: boolean;
}

export class ContextualSuggestionsService {

  /**
   * MÉTODO PRINCIPAL - Gerar sugestões contextuais pós-onboarding
   */
  async generateContextualSuggestions(context: SuggestionContext): Promise<ContextualSuggestion> {
    try {
      console.log(`🎯 [SUGGESTIONS] Gerando sugestões para ${context.userName} - tenant ${context.tenantId}`);

      // 1. Construir greeting personalizado
      const greeting = this.buildPersonalizedGreeting(context);

      // 2. Analisar contexto temporal
      const timeContext = this.analyzeTimeContext(context);

      // 3. Gerar sugestão primária baseada no perfil
      const primarySuggestion = this.generatePrimarySuggestion(context, timeContext);

      // 4. Gerar sugestões secundárias
      const secondarySuggestions = this.generateSecondarySuggestions(context, timeContext);

      // 5. Determinar urgência
      const urgencyLevel = this.calculateUrgencyLevel(context, timeContext);

      // 6. Decidir se deve mostrar disponibilidade
      const shouldShowAvailability = this.shouldShowAvailabilityHint(context, timeContext);

      return {
        greeting,
        primarySuggestion,
        secondarySuggestions,
        urgencyLevel,
        shouldShowAvailability
      };

    } catch (error) {
      console.error('❌ [SUGGESTIONS] Erro ao gerar sugestões:', error);
      
      // Fallback para sugestão básica
      return {
        greeting: `🌟 Olá ${context.userName}! Como posso ajudar hoje?`,
        urgencyLevel: 'low'
      };
    }
  }

  /**
   * Construir greeting personalizado baseado no contexto
   */
  private buildPersonalizedGreeting(context: SuggestionContext): string {
    const { userName, userHistory, tenantDomain, currentHour } = context;
    
    // Saudação baseada no horário
    let timeGreeting = '';
    if (currentHour >= 6 && currentHour < 12) timeGreeting = 'Bom dia';
    else if (currentHour >= 12 && currentHour < 18) timeGreeting = 'Boa tarde';
    else timeGreeting = 'Boa noite';

    // Personalização baseada no histórico
    if (userHistory?.loyaltyLevel === 'vip') {
      return `✨ ${timeGreeting} ${userName}! Que bom ter você aqui novamente!`;
    }
    
    if (userHistory?.loyaltyLevel === 'regular') {
      return `🌟 ${timeGreeting} ${userName}! Como está?`;
    }

    // Cliente novo
    const domainEmojis = {
      'health': '🏥',
      'beauty': '💇',
      'legal': '⚖️',
      'education': '🎓',
      'sports': '🏃',
      'consulting': '💼'
    };

    const emoji = domainEmojis[context.tenantDomain as keyof typeof domainEmojis] || '🌟';
    return `${emoji} ${timeGreeting} ${userName}! Bem-vindo(a)!`;
  }

  /**
   * Analisar contexto temporal
   */
  private analyzeTimeContext(context: SuggestionContext): {
    period: 'morning' | 'afternoon' | 'evening' | 'night';
    isWeekend: boolean;
    isLateInDay: boolean;
    shouldSuggestToday: boolean;
  } {
    const { currentHour, dayOfWeek, isBusinessHours } = context;
    
    let period: 'morning' | 'afternoon' | 'evening' | 'night';
    if (currentHour >= 6 && currentHour < 12) period = 'morning';
    else if (currentHour >= 12 && currentHour < 18) period = 'afternoon';
    else if (currentHour >= 18 && currentHour < 22) period = 'evening';
    else period = 'night';

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Domingo = 0, Sábado = 6
    const isLateInDay = currentHour >= 16; // Após 16h
    const shouldSuggestToday = isBusinessHours && !isLateInDay;

    return { period, isWeekend, isLateInDay, shouldSuggestToday };
  }

  /**
   * Gerar sugestão primária baseada no perfil e contexto
   */
  private generatePrimarySuggestion(context: SuggestionContext, timeContext: any): string | undefined {
    const { tenantDomain, userHistory, activePromotions, tenantServices, isBusinessHours } = context;

    // 1. Promoções ativas (alta prioridade)
    if (activePromotions?.length && userHistory?.loyaltyLevel !== 'new') {
      const promo = activePromotions[0];
      if (promo) {
        return `🎉 Temos uma promoção especial: ${promo.title}! ${promo.discount_percentage ? `${promo.discount_percentage}% de desconto` : ''}`;
      }
    }

    // 2. Sugestões baseadas no horário e disponibilidade
    if (timeContext.shouldSuggestToday && tenantServices.length > 0) {
      const popularService = this.getPopularServiceByDomain(tenantDomain, tenantServices);
      if (popularService) {
        return `💡 Temos horários disponíveis ainda hoje para ${popularService.name.toLowerCase()}!`;
      }
    }

    // 3. Sugestões baseadas no histórico do usuário
    if (userHistory?.favoriteServices?.length) {
      const favoriteService = userHistory.favoriteServices[0];
      if (favoriteService) {
        return `✨ Que tal agendar seu ${favoriteService.toLowerCase()} de sempre?`;
      }
    }

    // 4. Sugestões baseadas no domínio
    return this.getDomainSpecificSuggestion(tenantDomain, timeContext, isBusinessHours);
  }

  /**
   * Gerar sugestões secundárias
   */
  private generateSecondarySuggestions(context: SuggestionContext, timeContext: any): string[] {
    const suggestions: string[] = [];
    const { tenantDomain, isBusinessHours, userHistory } = context;

    // Sugestão de agendamento futuro se fora do horário
    if (!isBusinessHours) {
      suggestions.push('Posso te ajudar a agendar para amanhã! 📅');
    }

    // Sugestão de informações
    if (tenantDomain === 'health') {
      suggestions.push('Ou me conte seus sintomas que te oriento sobre a especialidade ideal! 🩺');
    } else if (tenantDomain === 'beauty') {
      suggestions.push('Também posso te mostrar nossos tratamentos e promoções! 💄');
    } else if (tenantDomain === 'legal') {
      suggestions.push('Posso te explicar nossos serviços jurídicos sem compromisso! ⚖️');
    }

    // Para clientes regulares/VIP
    if (userHistory?.loyaltyLevel === 'vip') {
      suggestions.push('Como cliente VIP, você tem desconto especial em novos tratamentos! ⭐');
    }

    return suggestions;
  }

  /**
   * Calcular nível de urgência da sugestão
   */
  private calculateUrgencyLevel(context: SuggestionContext, timeContext: any): 'low' | 'medium' | 'high' {
    // Alta urgência: promoções ativas + cliente VIP
    if (context.activePromotions?.length && context.userHistory?.loyaltyLevel === 'vip') {
      return 'high';
    }

    // Média urgência: horários disponíveis hoje + cliente regular
    if (timeContext.shouldSuggestToday && context.userHistory?.loyaltyLevel === 'regular') {
      return 'medium';
    }

    // Baixa urgência: padrão
    return 'low';
  }

  /**
   * Decidir se deve mostrar hint de disponibilidade
   */
  private shouldShowAvailabilityHint(context: SuggestionContext, timeContext: any): boolean {
    // Mostrar se: dentro do horário + não é muito tarde + tem serviços
    return context.isBusinessHours && 
           !timeContext.isLateInDay && 
           context.tenantServices.length > 0;
  }

  /**
   * Obter serviço popular por domínio
   */
  private getPopularServiceByDomain(domain: string, services: any[]): any {
    const popularServiceNames = {
      'beauty': ['corte', 'cabelo', 'barba', 'manicure', 'pedicure'],
      'health': ['consulta', 'exame', 'checkup'],
      'legal': ['consultoria', 'consulta', 'orientação'],
      'education': ['aula', 'curso', 'treinamento'],
      'sports': ['treino', 'personal', 'avaliação'],
      'consulting': ['consultoria', 'reunião', 'análise']
    };

    const keywords = popularServiceNames[domain as keyof typeof popularServiceNames] || [];
    
    for (const keyword of keywords) {
      const service = services.find(s => 
        s.name.toLowerCase().includes(keyword)
      );
      if (service) return service;
    }

    // Fallback: primeiro serviço
    return services[0];
  }

  /**
   * Obter sugestão específica do domínio
   */
  private getDomainSpecificSuggestion(domain: string, timeContext: any, isBusinessHours: boolean): string | undefined {
    if (!isBusinessHours) {
      return 'Me conte o que você precisa - posso te ajudar a agendar para quando estivermos abertos! 🕐';
    }

    const suggestions = {
      'beauty': 'Que tal cuidar da sua beleza hoje? Posso te mostrar nossos tratamentos! 💅',
      'health': 'Como posso cuidar da sua saúde hoje? Me conte como está se sentindo! 🩺',
      'legal': 'Precisa de orientação jurídica? Estou aqui para te ajudar! ⚖️',
      'education': 'Pronto para aprender algo novo? Vamos ver nossos cursos disponíveis! 🎓',
      'sports': 'Hora de se exercitar! Que tal um treino personalizado? 🏃',
      'consulting': 'Em que posso ajudar seu negócio hoje? 💼'
    };

    return suggestions[domain as keyof typeof suggestions] || 
           'Me conte como posso te ajudar hoje! 😊';
  }

  /**
   * Formatar sugestão final para envio
   */
  formatSuggestionForMessage(suggestion: ContextualSuggestion): string {
    let message = suggestion.greeting + '\n\n';

    if (suggestion.primarySuggestion) {
      message += suggestion.primarySuggestion + '\n\n';
    }

    if (suggestion.secondarySuggestions?.length) {
      message += suggestion.secondarySuggestions.join('\n\n') + '\n\n';
    }

    message += 'Me conte o que você precisa - estou aqui para ajudar! 😊';

    return message;
  }

  /**
   * Buscar histórico do usuário para contexto
   */
  async getUserHistory(tenantId: string, userId: string): Promise<SuggestionContext['userHistory']> {
    try {
      // Buscar agendamentos do usuário
      const { data: appointments } = await supabaseAdmin
        .from('appointments')
        .select('id, service_id, created_at, services(name)')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!appointments?.length) {
        return { totalAppointments: 0, loyaltyLevel: 'new' };
      }

      // Calcular métricas
      const totalAppointments = appointments.length;
      const lastAppointment = appointments[0]?.created_at ? new Date(appointments[0].created_at) : new Date();
      
      // Serviços favoritos (mais frequentes)
      const serviceCount: Record<string, number> = {};
      appointments.forEach(apt => {
        const serviceName = (apt.services as any)?.name;
        if (serviceName) {
          serviceCount[serviceName] = (serviceCount[serviceName] || 0) + 1;
        }
      });

      const favoriteServices = Object.entries(serviceCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([service]) => service);

      // Nível de lealdade
      let loyaltyLevel: 'new' | 'regular' | 'vip';
      if (totalAppointments >= 15) loyaltyLevel = 'vip';
      else if (totalAppointments >= 3) loyaltyLevel = 'regular';
      else loyaltyLevel = 'new';

      return {
        totalAppointments,
        lastAppointment,
        favoriteServices,
        loyaltyLevel
      };

    } catch (error) {
      console.warn('⚠️ [SUGGESTIONS] Erro ao buscar histórico:', error);
      return { totalAppointments: 0, loyaltyLevel: 'new' };
    }
  }

  /**
   * Buscar promoções ativas do tenant
   */
  async getActivePromotions(tenantId: string): Promise<SuggestionContext['activePromotions']> {
    try {
      // Mock data - tabela de promoções ainda não existe
      const mockPromotions = [
        {
          title: 'Desconto de inverno',
          description: 'Todos os tratamentos com desconto especial',
          discount_percentage: 20
        }
      ];

      // Simular que nem sempre há promoções
      return Math.random() > 0.7 ? mockPromotions : [];

    } catch (error) {
      console.warn('⚠️ [SUGGESTIONS] Erro ao buscar promoções:', error);
      return [];
    }
  }
}