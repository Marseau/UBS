/**
 * Contextual Upsell Service
 * Sistema inteligente para detectar oportunidades de upsell contextual
 * baseado no perfil do usuário, histórico e serviços disponíveis
 */

import { supabaseAdmin } from '../config/database';

export interface UpsellOpportunity {
  serviceId: string;
  serviceName: string;
  reason: 'complementary' | 'upgrade' | 'bundle' | 'seasonal' | 'profile_based';
  confidence: number;
  suggestedMessage: string;
  priceImpact?: {
    original: number;
    bundled: number;
    savings: number;
  };
}

export interface UpsellContext {
  tenantId: string;
  userId?: string;
  currentService?: string;
  userProfile?: {
    gender?: string;
    age?: number;
    previousServices?: string[];
    spendingPattern?: 'budget' | 'standard' | 'premium';
  };
  sessionContext?: {
    mentionedServices?: string[];
    timeWindow?: 'manha' | 'tarde' | 'noite';
    dateRequested?: string;
  };
}

export class ContextualUpsellService {

  /**
   * MÉTODO PRINCIPAL - Detectar oportunidades de upsell contextual
   */
  async detectUpsellOpportunities(context: UpsellContext): Promise<{
    success: boolean;
    opportunities: UpsellOpportunity[];
    contextualMessage: string;
    totalPotentialValue?: number;
  }> {
    try {
      console.log(`🎯 [UPSELL] Analisando oportunidades para tenant ${context.tenantId}`);

      // 1. Buscar serviços do tenant
      const services = await this.getAvailableServices(context.tenantId);
      if (services.length === 0) {
        return {
          success: false,
          opportunities: [],
          contextualMessage: ''
        };
      }

      // 2. Detectar oportunidades baseado no contexto
      const opportunities: UpsellOpportunity[] = [];

      // 2.1. Upsell por complementaridade
      if (context.currentService) {
        const complementary = await this.findComplementaryServices(
          context.tenantId, 
          context.currentService, 
          services
        );
        opportunities.push(...complementary);
      }

      // 2.2. Upsell por perfil do usuário
      if (context.userProfile) {
        const profileBased = await this.findProfileBasedUpsell(
          context.tenantId,
          context.userProfile,
          services
        );
        opportunities.push(...profileBased);
      }

      // 2.3. Upsell sazonal/temporal
      const seasonal = await this.findSeasonalUpsell(context.tenantId, services);
      opportunities.push(...seasonal);

      // 3. Filtrar e ranquear oportunidades
      const rankedOpportunities = this.rankOpportunities(opportunities).slice(0, 3);

      // 4. Gerar mensagem contextual
      const contextualMessage = this.generateUpsellMessage(rankedOpportunities, context);

      // 5. Calcular valor potencial
      const totalPotentialValue = rankedOpportunities.reduce(
        (sum, opp) => sum + (opp.priceImpact?.bundled || 0), 0
      );

      return {
        success: true,
        opportunities: rankedOpportunities,
        contextualMessage,
        totalPotentialValue
      };

    } catch (error) {
      console.error('❌ [UPSELL] Erro ao detectar oportunidades:', error);
      return {
        success: false,
        opportunities: [],
        contextualMessage: ''
      };
    }
  }

  /**
   * Buscar serviços disponíveis do tenant
   */
  private async getAvailableServices(tenantId: string): Promise<any[]> {
    try {
      const { data: services, error } = await supabaseAdmin
        .from('services')
        .select('id, name, base_price, duration_minutes, description')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('❌ [UPSELL] Erro ao buscar serviços:', error);
        return [];
      }

      return services || [];
    } catch (error) {
      console.error('❌ [UPSELL] Erro na consulta de serviços:', error);
      return [];
    }
  }

  /**
   * Encontrar serviços complementares
   */
  private async findComplementaryServices(
    tenantId: string, 
    currentService: string, 
    services: any[]
  ): Promise<UpsellOpportunity[]> {
    const opportunities: UpsellOpportunity[] = [];

    // Regras de complementaridade por domínio
    const complementaryRules = {
      // Beleza
      'corte': ['coloracao', 'tratamento', 'escova', 'hidratacao'],
      'manicure': ['pedicure', 'esmaltacao', 'decoracao'],
      'depilacao': ['hidratacao', 'esfoliacao'],
      
      // Saúde
      'consulta': ['exames', 'retorno', 'procedimento'],
      'fisioterapia': ['massagem', 'pilates', 'avaliacao'],
      
      // Estética
      'limpeza de pele': ['peeling', 'hidratacao', 'drenagem'],
      'massagem': ['reflexologia', 'drenagem', 'relaxante'],

      // Geral - patterns
      'basico': ['premium', 'completo', 'deluxe'],
      'simples': ['avancado', 'profissional']
    };

    const currentServiceLower = currentService.toLowerCase();
    
    // Buscar complementares por regras exatas
    for (const [baseService, complements] of Object.entries(complementaryRules)) {
      if (currentServiceLower.includes(baseService)) {
        const complementaryServices = services.filter(service =>
          complements.some(comp => service.name.toLowerCase().includes(comp))
        );

        complementaryServices.forEach(service => {
          opportunities.push({
            serviceId: service.id,
            serviceName: service.name,
            reason: 'complementary',
            confidence: 0.8,
            suggestedMessage: `O ${service.name} combina perfeitamente com ${currentService}. Quer aproveitar?`,
            priceImpact: service.base_price ? {
              original: parseFloat(service.base_price),
              bundled: Math.round(parseFloat(service.base_price) * 0.85), // 15% desconto
              savings: Math.round(parseFloat(service.base_price) * 0.15)
            } : undefined
          });
        });
      }
    }

    return opportunities;
  }

  /**
   * Encontrar upsell baseado no perfil
   */
  private async findProfileBasedUpsell(
    tenantId: string,
    profile: NonNullable<UpsellContext['userProfile']>,
    services: any[]
  ): Promise<UpsellOpportunity[]> {
    const opportunities: UpsellOpportunity[] = [];

    // Upsell por gênero
    if (profile.gender === 'female') {
      const femaleServices = services.filter(service =>
        /(?:manicure|pedicure|depila|sobrancelha|cílios|maquiagem)/i.test(service.name)
      );
      
      femaleServices.forEach(service => {
        opportunities.push({
          serviceId: service.id,
          serviceName: service.name,
          reason: 'profile_based',
          confidence: 0.6,
          suggestedMessage: `${service.name} é um dos nossos serviços mais procurados. Te interessaria?`
        });
      });
    }

    // Upsell por padrão de gasto
    if (profile.spendingPattern === 'premium') {
      const premiumServices = services.filter(service =>
        /(?:premium|deluxe|vip|avançad|completo)/i.test(service.name) ||
        (service.base_price && parseFloat(service.base_price) > 100)
      );

      premiumServices.forEach(service => {
        opportunities.push({
          serviceId: service.id,
          serviceName: service.name,
          reason: 'upgrade',
          confidence: 0.7,
          suggestedMessage: `Para um resultado ainda melhor, temos o ${service.name}. Vale a pena!`
        });
      });
    }

    return opportunities;
  }

  /**
   * Encontrar upsell sazonal
   */
  private async findSeasonalUpsell(tenantId: string, services: any[]): Promise<UpsellOpportunity[]> {
    const opportunities: UpsellOpportunity[] = [];
    const currentMonth = new Date().getMonth() + 1;

    // Sazonalidades por período
    const seasonalServices = {
      // Verão (dez-mar): 12, 1, 2, 3
      summer: [12, 1, 2, 3],
      summerKeywords: /(?:depila|bronzea|hidrata|verao|solar)/i,
      
      // Inverno (jun-ago): 6, 7, 8  
      winter: [6, 7, 8],
      winterKeywords: /(?:hidrata|nutri|reconstru|inverno|seco)/i,
      
      // Fim de ano (nov-dez): 11, 12
      endYear: [11, 12],
      endYearKeywords: /(?:festa|evento|formatura|ano novo|natal)/i
    };

    // Aplicar sazonalidade de verão
    if (seasonalServices.summer.includes(currentMonth)) {
      const summerServices = services.filter(service =>
        seasonalServices.summerKeywords.test(service.name)
      );

      summerServices.forEach(service => {
        opportunities.push({
          serviceId: service.id,
          serviceName: service.name,
          reason: 'seasonal',
          confidence: 0.65,
          suggestedMessage: `${service.name} é perfeito para esta época do ano. Que tal aproveitar?`
        });
      });
    }

    return opportunities;
  }

  /**
   * Ranquear oportunidades por relevância
   */
  private rankOpportunities(opportunities: UpsellOpportunity[]): UpsellOpportunity[] {
    return opportunities.sort((a, b) => {
      // Ordenar por confidence * peso da razão
      const weightA = this.getReasonWeight(a.reason) * a.confidence;
      const weightB = this.getReasonWeight(b.reason) * b.confidence;
      return weightB - weightA;
    });
  }

  /**
   * Peso das razões de upsell
   */
  private getReasonWeight(reason: UpsellOpportunity['reason']): number {
    const weights = {
      'complementary': 1.0,
      'upgrade': 0.9,
      'bundle': 0.8,
      'profile_based': 0.7,
      'seasonal': 0.6
    };
    return weights[reason] || 0.5;
  }

  /**
   * Gerar mensagem contextual de upsell
   */
  private generateUpsellMessage(opportunities: UpsellOpportunity[], context: UpsellContext): string {
    if (opportunities.length === 0) {
      return '';
    }

    const topOpportunity = opportunities[0];
    if (!topOpportunity) {
      return '';
    }
    
    // Mensagem baseada no tipo de oportunidade
    let baseMessage = topOpportunity.suggestedMessage;
    
    // Adicionar incentivo se houver desconto
    if (topOpportunity.priceImpact?.savings) {
      baseMessage += ` E ainda economiza R$ ${topOpportunity.priceImpact.savings}!`;
    }

    // Se houver múltiplas oportunidades, mencionar
    if (opportunities.length > 1) {
      baseMessage += ` Temos outras opções que também podem te interessar.`;
    }

    return baseMessage;
  }

  /**
   * Verificar elegibilidade do usuário para upsell
   */
  async isEligibleForUpsell(tenantId: string, userId: string): Promise<boolean> {
    try {
      // Evitar upsell muito frequente para o mesmo usuário
      const { data: recentInteractions } = await supabaseAdmin
        .from('conversation_history')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .ilike('ai_response', '%aproveitar%')
        .limit(3);

      // Se teve muitos upsells recentes, não é elegível
      return (recentInteractions?.length || 0) < 2;
    } catch (error) {
      console.error('❌ [UPSELL] Erro verificar elegibilidade:', error);
      return true; // Default: elegível
    }
  }
}