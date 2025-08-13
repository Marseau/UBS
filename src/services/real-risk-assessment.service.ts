/**
 * Real Risk Assessment Service - Sistema Dinâmico de Avaliação de Risco
 * Universal Booking System (UBS) - WhatsAppSalon-N8N
 * 
 * SUBSTITUIÇÃO COMPLETA DE ALGORITMOS ARBITRÁRIOS
 * Cálculos baseados em dados reais de appointments e conversations
 * 
 * @version 1.0.0 - Real Data Driven
 * @author UBS Team
 */

import { getAdminClient } from '../config/database';
import { 
  METRICS_BUSINESS_CONSTANTS, 
  DOCUMENTED_FALLBACKS,
  type RiskFactor
} from '../config/metrics-constants';

export interface RiskAssessmentResult {
  totalRiskScore: number;
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico' | 'Saudável';
  factors: RiskFactor[];
  recommendations: string[];
  confidence: number;
}

export class RealRiskAssessmentService {
  
  /**
   * Calcula risco real baseado em dados históricos do tenant
   * SUBSTITUIÇÃO COMPLETA dos scores fixos (15, 85, 70)
   */
  async calculateTenantRisk(tenantId: string, period: '7d' | '30d' | '90d'): Promise<RiskAssessmentResult> {
    const factors = await Promise.all([
      this.calculateRevenueStabilityRisk(tenantId, period),
      this.calculateAppointmentTrendRisk(tenantId, period),
      this.calculateCustomerRetentionRisk(tenantId, period),
      this.calculateUsageConsistencyRisk(tenantId, period),
      this.calculatePaymentHistoryRisk(tenantId, period)
    ]);

    // Cálculo ponderado real baseado em importance
    const totalRiskScore = factors.reduce((total, factor) => {
      return total + (factor.value * factor.weight);
    }, 0);

    const riskLevel = this.classifyRiskLevel(totalRiskScore);
    const recommendations = this.generateRecommendations(factors, riskLevel);
    const confidence = this.calculateConfidence(factors);

    return {
      totalRiskScore: Math.round(totalRiskScore * 10) / 10,
      riskLevel,
      factors,
      recommendations,
      confidence
    };
  }

  /**
   * Fator 1: Estabilidade de Receita (30% do peso)
   * Baseado na variância real da receita nos últimos períodos
   */
  private async calculateRevenueStabilityRisk(tenantId: string, period: string): Promise<RiskFactor> {
    try {
      const periodDays = this.getPeriodDays(period);
      const segments = 4; // Dividir período em 4 segmentos
      const segmentDays = Math.floor(periodDays / segments);
      
      const revenues: number[] = [];
      
      for (let i = 0; i < segments; i++) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (periodDays - (i * segmentDays)));
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - (periodDays - ((i + 1) * segmentDays)));

        const { data } = await getAdminClient()
          .from('appointments')
          .select('final_price, quoted_price')
          .eq('tenant_id', tenantId)
          .eq('status', 'confirmed')
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString());

        const segmentRevenue = data?.reduce((sum, a) => sum + (parseFloat((a.final_price || a.quoted_price || 0).toString()) || 0), 0) || 0;
        revenues.push(segmentRevenue);
      }

      // Calcular variância da receita
      const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
      const variance = revenues.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / revenues.length;
      const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0;

      // Converter para score de risco (0-100)
      let riskScore = Math.min(100, coefficientOfVariation * 100);
      
      // Se não há receita, risco máximo
      if (mean === 0) riskScore = 100;

      return {
        name: 'Revenue Stability',
        value: riskScore,
        weight: METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS.RISK_FACTORS_WEIGHT.REVENUE_STABILITY,
        dataSource: 'appointments_revenue_analysis',
        isEstimated: false
      };
    } catch (error) {
      console.error('Error calculating revenue stability risk:', error);
      return this.createFallbackRiskFactor('Revenue Stability', 50, 'Error in calculation');
    }
  }

  /**
   * Fator 2: Tendência de Appointments (25% do peso)
   * Baseado na tendência real de agendamentos
   */
  private async calculateAppointmentTrendRisk(tenantId: string, period: string): Promise<RiskFactor> {
    try {
      const periodDays = this.getPeriodDays(period);
      const halfPeriod = Math.floor(periodDays / 2);
      
      const currentHalfStart = new Date();
      currentHalfStart.setDate(currentHalfStart.getDate() - halfPeriod);
      
      const previousHalfStart = new Date();
      previousHalfStart.setDate(previousHalfStart.getDate() - periodDays);
      const previousHalfEnd = new Date();
      previousHalfEnd.setDate(previousHalfEnd.getDate() - halfPeriod);

      const { data: currentAppointments } = await getAdminClient()
        .from('appointments')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', currentHalfStart.toISOString());

      const { data: previousAppointments } = await getAdminClient()
        .from('appointments')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', previousHalfStart.toISOString())
        .lt('created_at', previousHalfEnd.toISOString());

      const currentCount = currentAppointments?.length || 0;
      const previousCount = previousAppointments?.length || 0;

      let trendRisk = 0;
      
      if (previousCount === 0) {
        // Novo tenant: risco neutro
        trendRisk = 50;
      } else {
        const growthRate = (currentCount - previousCount) / previousCount * 100;
        
        // Converter growth rate para risk score (invertido)
        if (growthRate >= 20) trendRisk = 10; // Crescimento excelente = baixo risco
        else if (growthRate >= 10) trendRisk = 20; // Crescimento bom = baixo risco
        else if (growthRate >= 0) trendRisk = 40; // Estagnação = risco moderado
        else if (growthRate >= -20) trendRisk = 70; // Declínio = alto risco
        else trendRisk = 90; // Declínio severo = risco crítico
      }

      return {
        name: 'Appointment Trend',
        value: trendRisk,
        weight: METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS.RISK_FACTORS_WEIGHT.APPOINTMENT_TREND,
        dataSource: 'appointments_trend_analysis',
        isEstimated: false
      };
    } catch (error) {
      console.error('Error calculating appointment trend risk:', error);
      return this.createFallbackRiskFactor('Appointment Trend', 50, 'Error in calculation');
    }
  }

  /**
   * Fator 3: Retenção de Clientes (20% do peso)
   * Baseado na taxa real de clientes retornando
   */
  private async calculateCustomerRetentionRisk(tenantId: string, period: string): Promise<RiskFactor> {
    try {
      const periodDays = this.getPeriodDays(period);
      const currentStart = new Date();
      currentStart.setDate(currentStart.getDate() - periodDays);
      
      // Clientes do período atual
      const { data: currentAppointments } = await getAdminClient()
        .from('appointments')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', currentStart.toISOString());

      if (!currentAppointments?.length) {
        return this.createFallbackRiskFactor('Customer Retention', 50, 'No appointments data');
      }

      const currentCustomers = new Set(currentAppointments.map(a => a.user_id));

      // Clientes históricos (antes do período atual)
      const { data: historicalAppointments } = await getAdminClient()
        .from('appointments')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .lt('created_at', currentStart.toISOString());

      const historicalCustomers = new Set(historicalAppointments?.map(a => a.user_id) || []);

      // Calcular taxa de retenção
      let returningCustomers = 0;
      currentCustomers.forEach(customer => {
        if (historicalCustomers.has(customer)) {
          returningCustomers++;
        }
      });

      const retentionRate = (returningCustomers / currentCustomers.size) * 100;
      
      // Converter retention rate para risk score (invertido)
      let retentionRisk = 0;
      if (retentionRate >= 60) retentionRisk = 15; // Excelente retenção = baixo risco
      else if (retentionRate >= 40) retentionRisk = 30; // Boa retenção = baixo risco  
      else if (retentionRate >= 25) retentionRisk = 50; // Retenção moderada = risco médio
      else if (retentionRate >= 10) retentionRisk = 75; // Baixa retenção = alto risco
      else retentionRisk = 90; // Péssima retenção = risco crítico

      return {
        name: 'Customer Retention',
        value: retentionRisk,
        weight: METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS.RISK_FACTORS_WEIGHT.CUSTOMER_RETENTION,
        dataSource: 'customer_retention_analysis',
        isEstimated: false
      };
    } catch (error) {
      console.error('Error calculating customer retention risk:', error);
      return this.createFallbackRiskFactor('Customer Retention', 50, 'Error in calculation');
    }
  }

  /**
   * Fator 4: Consistência de Uso (15% do peso)
   * Baseado na regularidade de uso da plataforma
   */
  private async calculateUsageConsistencyRisk(tenantId: string, period: string): Promise<RiskFactor> {
    try {
      const periodDays = this.getPeriodDays(period);
      const dailyUsage: number[] = [];

      for (let i = 0; i < periodDays; i++) {
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const { data } = await getAdminClient()
          .from('conversation_history')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString());

        dailyUsage.push(data?.length || 0);
      }

      // Calcular consistência (dias com uso vs dias totais)
      const daysWithUsage = dailyUsage.filter(count => count > 0).length;
      const consistencyRate = (daysWithUsage / periodDays) * 100;

      // Converter para risk score (invertido)
      let consistencyRisk = 0;
      if (consistencyRate >= 80) consistencyRisk = 10; // Muito consistente = baixo risco
      else if (consistencyRate >= 60) consistencyRisk = 25; // Consistente = baixo risco
      else if (consistencyRate >= 40) consistencyRisk = 45; // Moderadamente consistente = risco médio
      else if (consistencyRate >= 20) consistencyRisk = 70; // Inconsistente = alto risco
      else consistencyRisk = 90; // Muito inconsistente = risco crítico

      return {
        name: 'Usage Consistency',
        value: consistencyRisk,
        weight: METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS.RISK_FACTORS_WEIGHT.USAGE_CONSISTENCY,
        dataSource: 'conversation_history_analysis',
        isEstimated: false
      };
    } catch (error) {
      console.error('Error calculating usage consistency risk:', error);
      return this.createFallbackRiskFactor('Usage Consistency', 50, 'Error in calculation');
    }
  }

  /**
   * Fator 5: Histórico de Pagamento (10% do peso)
   * Baseado no status do tenant e plano
   */
  private async calculatePaymentHistoryRisk(tenantId: string, period: string): Promise<RiskFactor> {
    try {
      const { data } = await getAdminClient()
        .from('tenants')
        .select('status, created_at')
        .eq('id', tenantId)
        .single();

      if (!data) {
        return this.createFallbackRiskFactor('Payment History', 100, 'Tenant not found');
      }

      let paymentRisk = 50; // Default neutro

      // Análise do status da assinatura
      switch (data.status) {
        case 'active':
          paymentRisk = 10; // Pagamento em dia = baixo risco
          break;
        case 'trial':
          paymentRisk = 30; // Trial = risco baixo-médio
          break;
        case 'past_due':
          paymentRisk = 75; // Atrasado = alto risco
          break;
        case 'canceled':
          paymentRisk = 95; // Cancelado = risco crítico
          break;
        default:
          paymentRisk = 50; // Status desconhecido = risco neutro
      }

      // Ajustar baseado no tempo de conta
      const accountAge = Date.now() - new Date(data.created_at || new Date()).getTime();
      const daysOld = accountAge / (1000 * 60 * 60 * 24);
      
      if (daysOld > 90) {
        paymentRisk *= 0.9; // Conta antiga = reduz risco
      } else if (daysOld < 7) {
        paymentRisk *= 1.2; // Conta muito nova = aumenta risco
      }

      return {
        name: 'Payment History',
        value: Math.min(100, paymentRisk),
        weight: METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS.RISK_FACTORS_WEIGHT.PAYMENT_HISTORY,
        dataSource: 'tenants_subscription_status',
        isEstimated: false
      };
    } catch (error) {
      console.error('Error calculating payment history risk:', error);
      return this.createFallbackRiskFactor('Payment History', 50, 'Error in calculation');
    }
  }

  /**
   * Classifica nível de risco baseado no score total
   */
  private classifyRiskLevel(score: number): 'Baixo' | 'Médio' | 'Alto' | 'Crítico' | 'Saudável' {
    const thresholds = METRICS_BUSINESS_CONSTANTS.RISK_ASSESSMENT_THRESHOLDS;
    
    if (score >= thresholds.CRITICAL_RISK) return 'Crítico';
    if (score >= thresholds.HIGH_RISK) return 'Alto';
    if (score >= thresholds.MEDIUM_RISK) return 'Médio';
    if (score >= thresholds.LOW_RISK) return 'Baixo';
    return 'Saudável';
  }

  /**
   * Gera recomendações baseadas nos fatores de risco
   */
  private generateRecommendations(factors: RiskFactor[], riskLevel: string): string[] {
    const recommendations: string[] = [];

    // Recomendações baseadas nos fatores mais críticos
    const criticalFactors = factors
      .filter(f => f.value > 70)
      .sort((a, b) => b.value - a.value);

    for (const factor of criticalFactors) {
      switch (factor.name) {
        case 'Revenue Stability':
          recommendations.push('Diversificar serviços para estabilizar receita');
          break;
        case 'Appointment Trend':
          recommendations.push('Implementar campanhas para aumentar agendamentos');
          break;
        case 'Customer Retention':
          recommendations.push('Criar programa de fidelidade para reter clientes');
          break;
        case 'Usage Consistency':
          recommendations.push('Aumentar engajamento com funcionalidades da plataforma');
          break;
        case 'Payment History':
          recommendations.push('Verificar status da assinatura e histórico de pagamento');
          break;
      }
    }

    // Recomendações gerais por nível de risco
    if (riskLevel === 'Crítico') {
      recommendations.push('Ação imediata necessária: contato direto com tenant');
    } else if (riskLevel === 'Alto') {
      recommendations.push('Monitoramento próximo e intervenção proativa');
    }

    return recommendations.slice(0, 3); // Máximo 3 recomendações
  }

  /**
   * Calcula confiança baseada na disponibilidade de dados
   */
  private calculateConfidence(factors: RiskFactor[]): number {
    const dataAvailability = factors.filter(f => !f.isEstimated).length / factors.length;
    return Math.round(dataAvailability * 100);
  }

  /**
   * Cria fator de risco fallback quando dados não estão disponíveis
   */
  private createFallbackRiskFactor(name: string, defaultValue: number, reason: string): RiskFactor {
    return {
      name,
      value: defaultValue,
      weight: 0.2, // Peso padrão
      dataSource: `fallback_${reason}`,
      isEstimated: true
    };
  }

  /**
   * Converte string de período para número de dias
   */
  private getPeriodDays(period: string): number {
    switch (period) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      default: return 30;
    }
  }
}