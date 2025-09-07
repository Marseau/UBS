/**
 * Retention Strategy Service
 * Sistema inteligente para reter usuários que tentam cancelar agendamentos
 * Oferece alternativas baseadas no contexto e histórico do usuário
 */

import { supabaseAdmin } from '../config/database';

export interface RetentionContext {
  tenantId: string;
  userId?: string;
  appointmentId?: string;
  cancelReason?: 'time_conflict' | 'financial' | 'emergency' | 'dissatisfaction' | 'other';
  userProfile?: {
    totalAppointments: number;
    cancelationHistory: number;
    avgSpending: number;
    lastAppointment: Date;
    loyaltyLevel: 'new' | 'regular' | 'vip';
  };
  appointmentDetails?: {
    service: string;
    professional: string;
    datetime: Date;
    value: number;
  };
}

export interface RetentionOffer {
  type: 'reschedule' | 'discount' | 'upgrade' | 'flexible_payment' | 'professional_change';
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  incentive?: {
    discount_percentage?: number;
    free_service?: string;
    payment_flexibility?: string;
    upgrade_offer?: string;
  };
  expiration?: Date;
}

export class RetentionStrategyService {

  /**
   * MÉTODO PRINCIPAL - Gerar estratégias de retenção para cancelamento
   */
  async generateRetentionStrategy(context: RetentionContext): Promise<{
    success: boolean;
    shouldAttemptRetention: boolean;
    offers: RetentionOffer[];
    retentionMessage: string;
    followUpAction?: string;
  }> {
    try {
      console.log(`🎯 [RETENTION] Analisando estratégias para tenant ${context.tenantId}`);

      // 1. Avaliar se vale a pena tentar retenção
      const retentionScore = await this.calculateRetentionScore(context);
      
      if (retentionScore < 0.3) {
        return {
          success: true,
          shouldAttemptRetention: false,
          offers: [],
          retentionMessage: 'Entendemos. O cancelamento foi processado com sucesso.'
        };
      }

      // 2. Identificar motivo do cancelamento e gerar ofertas
      const offers: RetentionOffer[] = [];

      // 2.1. Ofertas baseadas no motivo
      if (context.cancelReason) {
        const reasonBasedOffers = this.generateReasonBasedOffers(context);
        offers.push(...reasonBasedOffers);
      }

      // 2.2. Ofertas baseadas no perfil do usuário
      if (context.userProfile) {
        const profileBasedOffers = this.generateProfileBasedOffers(context);
        offers.push(...profileBasedOffers);
      }

      // 2.3. Ofertas baseadas no agendamento
      if (context.appointmentDetails) {
        const appointmentBasedOffers = this.generateAppointmentBasedOffers(context);
        offers.push(...appointmentBasedOffers);
      }

      // 3. Ranquear e selecionar melhores ofertas
      const rankedOffers = this.rankRetentionOffers(offers, context).slice(0, 3);

      // 4. Gerar mensagem de retenção personalizada
      const retentionMessage = this.generateRetentionMessage(rankedOffers, context);

      // 5. Definir ação de follow-up se necessário
      const followUpAction = this.determineFollowUpAction(retentionScore, context);

      return {
        success: true,
        shouldAttemptRetention: true,
        offers: rankedOffers,
        retentionMessage,
        followUpAction
      };

    } catch (error) {
      console.error('❌ [RETENTION] Erro ao gerar estratégias:', error);
      return {
        success: false,
        shouldAttemptRetention: false,
        offers: [],
        retentionMessage: 'Entendemos. O cancelamento foi processado.'
      };
    }
  }

  /**
   * Calcular score de retenção (0-1, onde 1 = alto valor de retenção)
   */
  private async calculateRetentionScore(context: RetentionContext): Promise<number> {
    let score = 0.5; // Base score

    if (context.userProfile) {
      const profile = context.userProfile;
      
      // Fator de lealdade
      if (profile.loyaltyLevel === 'vip') score += 0.3;
      else if (profile.loyaltyLevel === 'regular') score += 0.2;
      
      // Histórico de gastos
      if (profile.avgSpending > 200) score += 0.2;
      else if (profile.avgSpending > 100) score += 0.1;
      
      // Frequência de cancelamentos (negativo)
      const cancelationRate = profile.cancelationHistory / Math.max(profile.totalAppointments, 1);
      if (cancelationRate > 0.3) score -= 0.2;
      else if (cancelationRate > 0.1) score -= 0.1;
      
      // Recência
      const daysSinceLastAppointment = Math.floor((Date.now() - profile.lastAppointment.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastAppointment < 30) score += 0.1;
      else if (daysSinceLastAppointment > 90) score -= 0.1;
    }

    // Fator do valor do agendamento
    if (context.appointmentDetails?.value) {
      if (context.appointmentDetails.value > 150) score += 0.2;
      else if (context.appointmentDetails.value > 75) score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Gerar ofertas baseadas no motivo do cancelamento
   */
  private generateReasonBasedOffers(context: RetentionContext): RetentionOffer[] {
    const offers: RetentionOffer[] = [];
    
    switch (context.cancelReason) {
      case 'time_conflict':
        offers.push({
          type: 'reschedule',
          title: 'Reagendar sem taxas',
          description: 'Que tal reagendarmos para outro horário que seja mais conveniente para você?',
          urgency: 'medium'
        });
        break;

      case 'financial':
        offers.push({
          type: 'discount',
          title: 'Desconto especial',
          description: 'Entendemos a situação. Podemos oferecer um desconto para este agendamento.',
          urgency: 'high',
          incentive: {
            discount_percentage: 20
          }
        });
        offers.push({
          type: 'flexible_payment',
          title: 'Parcelamento facilitado',
          description: 'Você pode parcelar o pagamento em até 3x sem juros.',
          urgency: 'medium',
          incentive: {
            payment_flexibility: '3x sem juros'
          }
        });
        break;

      case 'dissatisfaction':
        offers.push({
          type: 'professional_change',
          title: 'Trocar profissional',
          description: 'Podemos agendar com outro profissional da nossa equipe.',
          urgency: 'high'
        });
        offers.push({
          type: 'upgrade',
          title: 'Upgrade gratuito',
          description: 'Como forma de nos desculparmos, oferecemos um upgrade gratuito no seu serviço.',
          urgency: 'high',
          incentive: {
            upgrade_offer: 'Serviço premium sem custo adicional'
          }
        });
        break;

      case 'emergency':
        offers.push({
          type: 'reschedule',
          title: 'Reagendamento prioritário',
          description: 'Esperamos que tudo fique bem. Garantiremos prioridade para reagendar quando possível.',
          urgency: 'low'
        });
        break;
    }

    return offers;
  }

  /**
   * Gerar ofertas baseadas no perfil do usuário
   */
  private generateProfileBasedOffers(context: RetentionContext): RetentionOffer[] {
    const offers: RetentionOffer[] = [];
    const profile = context.userProfile!;

    // Ofertas para clientes VIP
    if (profile.loyaltyLevel === 'vip') {
      offers.push({
        type: 'discount',
        title: 'Desconto VIP exclusivo',
        description: 'Como cliente VIP, oferecemos 25% de desconto para manter seu agendamento.',
        urgency: 'high',
        incentive: {
          discount_percentage: 25
        }
      });
    }

    // Ofertas para clientes regulares
    if (profile.loyaltyLevel === 'regular' && profile.totalAppointments > 5) {
      offers.push({
        type: 'discount',
        title: 'Desconto cliente fiel',
        description: 'Você é um cliente especial! Temos um desconto exclusivo para você.',
        urgency: 'medium',
        incentive: {
          discount_percentage: 15
        }
      });
    }

    // Ofertas para clientes novos
    if (profile.loyaltyLevel === 'new') {
      offers.push({
        type: 'discount',
        title: 'Desconto primeira experiência',
        description: 'Queremos que sua primeira experiência seja perfeita! Oferecemos 10% de desconto.',
        urgency: 'medium',
        incentive: {
          discount_percentage: 10
        }
      });
    }

    return offers;
  }

  /**
   * Gerar ofertas baseadas no agendamento
   */
  private generateAppointmentBasedOffers(context: RetentionContext): RetentionOffer[] {
    const offers: RetentionOffer[] = [];
    const appointment = context.appointmentDetails!;

    // Ofertas baseadas no horário
    const appointmentHour = appointment.datetime.getHours();
    if (appointmentHour < 10 || appointmentHour > 17) {
      offers.push({
        type: 'reschedule',
        title: 'Horário comercial disponível',
        description: 'Temos horários disponíveis no período comercial que podem ser mais convenientes.',
        urgency: 'medium'
      });
    }

    // Ofertas baseadas no valor
    if (appointment.value > 200) {
      offers.push({
        type: 'flexible_payment',
        title: 'Parcelamento especial',
        description: 'Para serviços de alto valor, oferecemos parcelamento em até 4x sem juros.',
        urgency: 'medium',
        incentive: {
          payment_flexibility: '4x sem juros'
        }
      });
    }

    return offers;
  }

  /**
   * Ranquear ofertas por relevância
   */
  private rankRetentionOffers(offers: RetentionOffer[], context: RetentionContext): RetentionOffer[] {
    return offers.sort((a, b) => {
      const scoreA = this.getOfferScore(a, context);
      const scoreB = this.getOfferScore(b, context);
      return scoreB - scoreA;
    });
  }

  /**
   * Calcular score de uma oferta específica
   */
  private getOfferScore(offer: RetentionOffer, context: RetentionContext): number {
    let score = 0;

    // Score por urgência
    if (offer.urgency === 'high') score += 3;
    else if (offer.urgency === 'medium') score += 2;
    else score += 1;

    // Score por tipo de oferta
    const typeScores = {
      'discount': 3,
      'reschedule': 2,
      'upgrade': 4,
      'flexible_payment': 2,
      'professional_change': 2
    };
    score += typeScores[offer.type] || 1;

    // Score por incentivo
    if (offer.incentive?.discount_percentage && offer.incentive.discount_percentage >= 20) score += 2;
    if (offer.incentive?.upgrade_offer) score += 3;
    if (offer.incentive?.free_service) score += 2;

    // Score baseado no perfil do usuário
    if (context.userProfile?.loyaltyLevel === 'vip' && offer.type === 'discount') score += 2;
    if (context.cancelReason === 'financial' && offer.type === 'discount') score += 3;

    return score;
  }

  /**
   * Gerar mensagem de retenção personalizada
   */
  private generateRetentionMessage(offers: RetentionOffer[], context: RetentionContext): string {
    if (offers.length === 0) {
      return 'Entendemos sua necessidade de cancelar. Há algo que possamos fazer para ajudar?';
    }

    const primaryOffer = offers[0];
    let message = '🤝 Antes de cancelar, gostaríamos de oferecer algumas alternativas:\n\n';

    offers.forEach((offer, index) => {
      const number = index + 1;
      message += `${number}. **${offer.title}**\n`;
      message += `   ${offer.description}\n`;
      
      if (offer.incentive?.discount_percentage) {
        message += `   💰 Desconto: ${offer.incentive.discount_percentage}%\n`;
      }
      if (offer.incentive?.payment_flexibility) {
        message += `   💳 Pagamento: ${offer.incentive.payment_flexibility}\n`;
      }
      
      message += '\n';
    });

    message += 'Qual dessas opções gostaria de considerar? 🤔';

    return message;
  }

  /**
   * Determinar ação de follow-up necessária
   */
  private determineFollowUpAction(retentionScore: number, context: RetentionContext): string | undefined {
    if (retentionScore > 0.8) {
      return 'Agendar ligação de retenção com gerente em 1 hora';
    }
    
    if (retentionScore > 0.6 && context.userProfile?.loyaltyLevel === 'vip') {
      return 'Enviar oferta personalizada via email em 30 minutos';
    }

    if (context.cancelReason === 'dissatisfaction') {
      return 'Agendar feedback call com supervisor em 24 horas';
    }

    return undefined;
  }

  /**
   * Registrar tentativa de retenção para análise
   */
  async logRetentionAttempt(context: RetentionContext, offers: RetentionOffer[], result: 'retained' | 'lost'): Promise<void> {
    try {
      const logRecord = {
        tenant_id: context.tenantId,
        user_id: context.userId || null,
        appointment_id: context.appointmentId || null,
        cancel_reason: context.cancelReason || null,
        retention_offers: JSON.stringify(offers.map(o => ({
          type: o.type,
          title: o.title,
          urgency: o.urgency
        }))),
        retention_result: result,
        user_loyalty_level: context.userProfile?.loyaltyLevel || null,
        appointment_value: context.appointmentDetails?.value || null,
        created_at: new Date().toISOString()
      };

      // Log para análise (tabela ainda não criada)
      console.log('📊 [RETENTION-LOG]', JSON.stringify(logRecord));

    } catch (error) {
      console.warn('⚠️ [RETENTION] Erro ao registrar tentativa:', error);
    }
  }

  /**
   * Obter métricas de retenção do tenant
   */
  async getRetentionMetrics(tenantId: string, days: number = 30): Promise<{
    total_cancellation_attempts: number;
    retention_attempts: number;
    retention_success_rate: number;
    top_cancel_reasons: Array<{ reason: string; count: number }>;
    avg_retention_score: number;
  }> {
    try {
      // Mock data para demonstração (tabela ainda não criada)
      const mockData = {
        total_cancellation_attempts: 45,
        retention_attempts: 32,
        retention_success_rate: 0.68, // 68% de sucesso
        top_cancel_reasons: [
          { reason: 'time_conflict', count: 18 },
          { reason: 'financial', count: 12 },
          { reason: 'emergency', count: 8 },
          { reason: 'dissatisfaction', count: 4 },
          { reason: 'other', count: 3 }
        ],
        avg_retention_score: 0.72
      };

      console.log(`📊 [RETENTION-METRICS] Tenant ${tenantId}:`, mockData);
      return mockData;

    } catch (error) {
      console.error('❌ [RETENTION] Erro ao obter métricas:', error);
      return {
        total_cancellation_attempts: 0,
        retention_attempts: 0,
        retention_success_rate: 0,
        top_cancel_reasons: [],
        avg_retention_score: 0
      };
    }
  }
}