/**
 * Data Quality Service - Sistema de Validação de Integridade de Dados
 * Universal Booking System (UBS) - WhatsAppSalon-N8N
 * 
 * ELIMINAÇÃO COMPLETA DE MOCK DATA E VALIDAÇÃO CIENTÍFICA
 * 
 * @version 1.0.0 - Enterprise Data Quality
 * @author UBS Team
 */

import { 
  METRICS_BUSINESS_CONSTANTS, 
  DATA_QUALITY_CONFIG,
  DOCUMENTED_FALLBACKS,
  VALIDATION_RULES,
  type DataQualityReport,
  type MetricCalculationContext
} from '../config/metrics-constants';

export class DataQualityService {
  
  /**
   * Valida integridade completa de métricas
   * Detecta mock data, valores suspeitos e inconsistências
   */
  validateMetricIntegrity(metrics: any, context: MetricCalculationContext): DataQualityReport {
    const issues: string[] = [];
    const suspiciousValues: Array<{ metric: string; value: number; reason: string; }> = [];
    let confidence = 100;

    // 1. DETECTAR MOCK DATA FLAGS
    if (this.hasMockDataFlags(metrics)) {
      issues.push('Mock data flags detected');
      confidence -= 50;
    }

    // 2. VALIDAR VALORES SUSPEITOS
    for (const [metricName, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        const suspiciousCheck = this.checkSuspiciousValue(metricName, value);
        if (suspiciousCheck.isSuspicious) {
          suspiciousValues.push({
            metric: metricName,
            value,
            reason: suspiciousCheck.reason
          });
          confidence -= 10;
        }
      }
    }

    // 3. VALIDAR RANGES ESPERADOS
    const rangeValidation = this.validateRanges(metrics);
    if (rangeValidation.hasIssues) {
      issues.push(...rangeValidation.issues);
      confidence -= rangeValidation.severity;
    }

    // 4. VALIDAR CONSISTÊNCIA LÓGICA
    const consistencyCheck = this.validateLogicalConsistency(metrics);
    if (!consistencyCheck.isConsistent) {
      issues.push(...consistencyCheck.issues);
      confidence -= 20;
    }

    // 5. VALIDAR MÉTODO DE CÁLCULO
    if (!this.isValidCalculationMethod(context.calculationMethod)) {
      issues.push(`Invalid calculation method: ${context.calculationMethod}`);
      confidence -= 15;
    }

    return {
      isValid: issues.length === 0,
      issues,
      suspiciousValues,
      confidence: Math.max(0, confidence)
    };
  }

  /**
   * Detecta flags de mock data em objetos
   */
  private hasMockDataFlags(metrics: any): boolean {
    const jsonString = JSON.stringify(metrics).toLowerCase();
    
    return DATA_QUALITY_CONFIG.MOCK_DATA_INDICATORS.some(indicator => 
      jsonString.includes(indicator)
    );
  }

  /**
   * Verifica se um valor é suspeito
   */
  private checkSuspiciousValue(metricName: string, value: number): { isSuspicious: boolean; reason: string } {
    // Valores na lista de suspeitos
    if (DATA_QUALITY_CONFIG.SUSPICIOUS_VALUES.includes(value as any)) {
      return { isSuspicious: true, reason: 'Value in suspicious list' };
    }

    // Valores muito redondos (múltiplos de 5 e 10)
    if (VALIDATION_RULES.SUSPICIOUS_PATTERNS.TOO_ROUND(value)) {
      return { isSuspicious: true, reason: 'Too round (multiple of 10)' };
    }

    // Valores muito exatos (.0)
    if (VALIDATION_RULES.SUSPICIOUS_PATTERNS.TOO_EXACT(value) && value > 10) {
      return { isSuspicious: true, reason: 'Too exact (ends in .0)' };
    }

    // Valores típicos de mock (15, 85, 70, etc.)
    const commonMockValues = [15, 85, 70, 2.5, 1.5];
    if (commonMockValues.includes(value)) {
      return { isSuspicious: true, reason: 'Common mock value' };
    }

    return { isSuspicious: false, reason: '' };
  }

  /**
   * Valida se métricas estão em ranges esperados
   */
  private validateRanges(metrics: any): { hasIssues: boolean; issues: string[]; severity: number } {
    const issues: string[] = [];
    let severity = 0;

    for (const [metricName, range] of Object.entries(DATA_QUALITY_CONFIG.EXPECTED_RANGES)) {
      const value = metrics[metricName];
      
      if (typeof value === 'number') {
        if (!VALIDATION_RULES.RANGE_VALIDATION.IS_IN_RANGE(value, range)) {
          issues.push(`${metricName} (${value}) outside expected range [${range.min}-${range.max}]`);
          severity += 15;
        }
      }
    }

    return { hasIssues: issues.length > 0, issues, severity };
  }

  /**
   * Valida consistência lógica entre métricas
   */
  private validateLogicalConsistency(metrics: any): { isConsistent: boolean; issues: string[] } {
    const issues: string[] = [];

    // Regra 1: Success rate não pode ser maior que 100%
    if (metrics.success_rate > 100) {
      issues.push('Success rate cannot exceed 100%');
    }

    // Regra 2: Novos + Retornando = Total de clientes
    if (metrics.new_customers && metrics.returning_customers && metrics.total_customers) {
      const calculated = metrics.new_customers + metrics.returning_customers;
      if (Math.abs(calculated - metrics.total_customers) > 1) {
        issues.push('New + returning customers does not match total');
      }
    }

    // Regra 3: Revenue deve ser proporcional a appointments confirmados
    if (metrics.total_revenue && metrics.confirmed_appointments) {
      const avgPrice = metrics.total_revenue / metrics.confirmed_appointments;
      if (avgPrice < 10 || avgPrice > 1000) {
        issues.push(`Average appointment price (${avgPrice.toFixed(2)}) seems unrealistic`);
      }
    }

    // Regra 4: Growth rate não pode ser maior que 1000% (crescimento impossível)
    const growthMetrics = ['revenue_growth_rate', 'appointment_growth_rate', 'customer_growth_rate'];
    for (const metric of growthMetrics) {
      if (metrics[metric] && Math.abs(metrics[metric]) > 1000) {
        issues.push(`${metric} (${metrics[metric]}%) seems unrealistic`);
      }
    }

    // Regra 5: Risk score deve ter justificativa
    if (metrics.risk_score === 15 || metrics.risk_score === 85 || metrics.risk_score === 70) {
      issues.push('Risk score appears to be a fixed default value');
    }

    return { isConsistent: issues.length === 0, issues };
  }

  /**
   * Valida método de cálculo
   */
  private isValidCalculationMethod(method: string): boolean {
    const validMethods = [
      'real_period_comparison',
      'confirmed_vs_total_appointments', 
      'multi_factor_weighted',
      'returning_customer_ratio',
      'successful_interactions_ratio'
    ];
    return validMethods.includes(method);
  }

  /**
   * Gera score de confiança para um conjunto de métricas
   */
  calculateConfidenceScore(metrics: any, context: MetricCalculationContext): number {
    const report = this.validateMetricIntegrity(metrics, context);
    
    // Ajustar confiança baseado em contexto
    let adjustedConfidence = report.confidence;

    // Penalizar se dados insuficientes
    if (context.hasInsufficientData) {
      adjustedConfidence *= 0.7;
    }

    // Recompensar se método de cálculo é robusto
    if (context.calculationMethod.includes('real') || context.calculationMethod.includes('historical')) {
      adjustedConfidence = Math.min(100, adjustedConfidence * 1.1);
    }

    return Math.round(adjustedConfidence);
  }

  /**
   * Sugere melhorias baseadas na qualidade dos dados
   */
  suggestImprovements(report: DataQualityReport, context: MetricCalculationContext): string[] {
    const suggestions: string[] = [];

    if (report.confidence < 70) {
      suggestions.push('Increase data collection period for more reliable metrics');
    }

    if (report.suspiciousValues.length > 0) {
      suggestions.push('Review calculation algorithms to avoid hardcoded values');
    }

    if (context.hasInsufficientData) {
      suggestions.push('Wait for more data before calculating growth rates');
    }

    if (report.issues.some(issue => issue.includes('mock'))) {
      suggestions.push('Replace mock data with real calculation methods');
    }

    return suggestions;
  }

  /**
   * Aplica fallbacks documentados quando dados são insuficientes
   */
  applyDocumentedFallbacks(metrics: any, context: MetricCalculationContext): any {
    const enhanced = { ...metrics };

    // Aplicar fallbacks para novos tenants
    if (context.hasInsufficientData) {
      const defaults = DOCUMENTED_FALLBACKS.NEW_TENANT_DEFAULTS;
      
      if (!enhanced.risk_score || enhanced.risk_score === 15) {
        enhanced.risk_score = defaults.INITIAL_RISK_SCORE;
        enhanced.fallback_applied = 'risk_score_new_tenant';
      }

      if (!enhanced.success_rate || enhanced.success_rate === 85) {
        enhanced.success_rate = defaults.BASELINE_SUCCESS_RATE;
        enhanced.fallback_applied = 'success_rate_baseline';
      }
    }

    // Adicionar metadata de qualidade
    enhanced.data_quality = {
      confidence: this.calculateConfidenceScore(metrics, context),
      has_fallbacks: !!enhanced.fallback_applied,
      calculation_method: context.calculationMethod,
      data_source: context.dataSource
    };

    return enhanced;
  }

  /**
   * Monitora qualidade em tempo real
   */
  monitorDataQuality(metrics: any, context: MetricCalculationContext): void {
    const report = this.validateMetricIntegrity(metrics, context);
    
    // Log problemas críticos
    if (report.confidence < 50) {
      console.warn('🚨 LOW DATA QUALITY DETECTED', {
        tenant: context.tenantId,
        confidence: report.confidence,
        issues: report.issues,
        suspiciousValues: report.suspiciousValues
      });
    }

    // Log valores suspeitos
    if (report.suspiciousValues.length > 0) {
      console.info('⚠️ SUSPICIOUS VALUES DETECTED', {
        tenant: context.tenantId,
        values: report.suspiciousValues
      });
    }

    // Log uso de fallbacks
    if (context.hasInsufficientData) {
      console.info('ℹ️ FALLBACK APPLIED', {
        tenant: context.tenantId,
        reason: context.fallbackReason,
        method: context.calculationMethod
      });
    }
  }
}