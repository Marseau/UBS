/**
 * Testes de Qualidade de Dados - Detecção de Mock Data
 * Universal Booking System (UBS) - WhatsAppSalon-N8N
 * 
 * TESTES PARA GARANTIR ELIMINAÇÃO COMPLETA DE MOCK DATA
 * 
 * @version 1.0.0 - Enterprise Data Quality Testing
 * @author UBS Team
 */

import { DataQualityService } from '../services/data-quality.service';
import { RealRiskAssessmentService } from '../services/real-risk-assessment.service';
import { 
  DATA_QUALITY_CONFIG, 
  DOCUMENTED_FALLBACKS,
  type MetricCalculationContext 
} from '../config/metrics-constants';

describe('UBS Data Quality - Mock Data Detection', () => {
  let dataQualityService: DataQualityService;
  let riskAssessmentService: RealRiskAssessmentService;

  beforeEach(() => {
    dataQualityService = new DataQualityService();
    riskAssessmentService = new RealRiskAssessmentService();
  });

  describe('Mock Data Flags Detection', () => {
    it('should detect is_mock_data flags', () => {
      const mockMetrics = {
        revenue: 1000,
        success_rate: 85,
        is_mock_data: true
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(mockMetrics, context);

      expect(report.isValid).toBe(false);
      expect(report.issues).toContain('Mock data flags detected');
      expect(report.confidence).toBeLessThan(60);
    });

    it('should detect mock indicators in strings', () => {
      const mockMetrics = {
        calculation_method: 'mock_calculation',
        data_source: 'fake_data'
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'mock_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(mockMetrics, context);

      expect(report.isValid).toBe(false);
      expect(report.issues).toContain('Mock data flags detected');
    });
  });

  describe('Suspicious Values Detection', () => {
    it('should detect common mock values', () => {
      const suspiciousMetrics = {
        success_rate: 85.0, // Valor muito comum em mock
        risk_score: 15,     // Valor arbitrário típico
        growth_rate: 70,    // Valor muito redondo
        ai_interactions: 2.5 // Estimativa muito exata
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(suspiciousMetrics, context);

      expect(report.suspiciousValues.length).toBeGreaterThan(0);
      expect(report.suspiciousValues.some(v => v.value === 85.0)).toBe(true);
      expect(report.suspiciousValues.some(v => v.value === 15)).toBe(true);
    });

    it('should flag values that are too round', () => {
      const roundMetrics = {
        appointments: 100, // Muito redondo para ser real
        customers: 50,     // Múltiplo exato de 10
        revenue: 1000      // Muito exato
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(roundMetrics, context);

      const roundValues = report.suspiciousValues.filter(v => 
        v.reason.includes('Too round') || v.reason.includes('Too exact')
      );
      expect(roundValues.length).toBeGreaterThan(0);
    });
  });

  describe('Range Validation', () => {
    it('should detect values outside expected ranges', () => {
      const outOfRangeMetrics = {
        success_rate: 150,    // > 100% impossível
        growth_rate: -80,     // Crescimento muito negativo
        revenue_per_tenant: 10000 // Muito alto para ser realista
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(outOfRangeMetrics, context);

      expect(report.issues.some(issue => issue.includes('outside expected range'))).toBe(true);
    });
  });

  describe('Logical Consistency', () => {
    it('should detect inconsistent customer counts', () => {
      const inconsistentMetrics = {
        new_customers: 30,
        returning_customers: 20,
        total_customers: 60 // Deveria ser 50
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(inconsistentMetrics, context);

      expect(report.issues.some(issue => 
        issue.includes('New + returning customers does not match total')
      )).toBe(true);
    });

    it('should detect unrealistic average prices', () => {
      const unrealisticMetrics = {
        total_revenue: 1000,
        confirmed_appointments: 1000,
        // Preço médio de R$ 1,00 é irrealista
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const report = dataQualityService.validateMetricIntegrity(unrealisticMetrics, context);

      expect(report.issues.some(issue => 
        issue.includes('Average appointment price') && issue.includes('unrealistic')
      )).toBe(true);
    });
  });

  describe('Real vs Mock Risk Assessment', () => {
    it('should NOT return fixed risk scores', async () => {
      // Teste com dados que anteriormente retornariam scores fixos
      const tenantId = 'test-tenant-123';
      
      // Mock database responses para simular dados reais
      jest.spyOn(require('../config/database'), 'getAdminClient').mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                data: [
                  { price: '120.00' },
                  { price: '85.50' },
                  { price: '200.00' }
                ]
              })
            })
          })
        })
      });

      const riskResult = await riskAssessmentService.calculateTenantRisk(tenantId, '30d');

      // Risk score NÃO deve ser um valor fixo comum (15, 85, 70)
      expect(riskResult.totalRiskScore).not.toBe(15);
      expect(riskResult.totalRiskScore).not.toBe(85);
      expect(riskResult.totalRiskScore).not.toBe(70);
      
      // Deve ter fatores de risco calculados
      expect(riskResult.factors.length).toBeGreaterThan(0);
      
      // Deve ter recomendações baseadas em dados
      expect(riskResult.recommendations.length).toBeGreaterThan(0);
      
      // Deve ter confidence score
      expect(riskResult.confidence).toBeGreaterThan(0);
      expect(riskResult.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Fallback Documentation', () => {
    it('should use documented fallbacks for new tenants', () => {
      const newTenantMetrics = {
        risk_score: null,
        success_rate: null
      };

      const context: MetricCalculationContext = {
        tenantId: 'new-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: true,
        fallbackReason: 'new_tenant_insufficient_data'
      };

      const enhanced = dataQualityService.applyDocumentedFallbacks(newTenantMetrics, context);

      expect(enhanced.risk_score).toBe(DOCUMENTED_FALLBACKS.NEW_TENANT_DEFAULTS.INITIAL_RISK_SCORE);
      expect(enhanced.success_rate).toBe(DOCUMENTED_FALLBACKS.NEW_TENANT_DEFAULTS.BASELINE_SUCCESS_RATE);
      expect(enhanced.fallback_applied).toBeDefined();
      expect(enhanced.data_quality.has_fallbacks).toBe(true);
    });

    it('should NOT use hardcoded fallback values', () => {
      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: true
      };

      const enhanced = dataQualityService.applyDocumentedFallbacks({}, context);

      // Valores de fallback NÃO devem ser os antigos hardcoded
      if (enhanced.risk_score) {
        expect(enhanced.risk_score).not.toBe(15); // Antigo valor fixo
      }
      if (enhanced.success_rate) {
        expect(enhanced.success_rate).not.toBe(85); // Antigo valor fixo
      }
    });
  });

  describe('Confidence Score Calculation', () => {
    it('should penalize mock data with low confidence', () => {
      const mockMetrics = {
        revenue: 1000,
        is_mock_data: true,
        calculation_method: 'fake'
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'conversations',
        calculationMethod: 'fake_calculation',
        hasInsufficientData: false
      };

      const confidence = dataQualityService.calculateConfidenceScore(mockMetrics, context);

      expect(confidence).toBeLessThan(70);
    });

    it('should reward real data with high confidence', () => {
      const realMetrics = {
        revenue: 1247.83, // Valor não redondo
        success_rate: 72.3, // Não é 85 ou outro valor comum
        growth_rate: 8.7   // Valor realista calculado
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_historical_calculation',
        hasInsufficientData: false
      };

      const confidence = dataQualityService.calculateConfidenceScore(realMetrics, context);

      expect(confidence).toBeGreaterThan(80);
    });
  });

  describe('Improvement Suggestions', () => {
    it('should suggest replacing mock data', () => {
      const mockReport = {
        isValid: false,
        issues: ['Mock data flags detected'],
        suspiciousValues: [],
        confidence: 30
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: false
      };

      const suggestions = dataQualityService.suggestImprovements(mockReport, context);

      expect(suggestions.some(s => s.includes('Replace mock data'))).toBe(true);
    });

    it('should suggest waiting for more data when insufficient', () => {
      const insufficientReport = {
        isValid: true,
        issues: [],
        suspiciousValues: [],
        confidence: 60
      };

      const context: MetricCalculationContext = {
        tenantId: 'test-tenant',
        period: '30d',
        dataSource: 'appointments',
        calculationMethod: 'real_calculation',
        hasInsufficientData: true
      };

      const suggestions = dataQualityService.suggestImprovements(insufficientReport, context);

      expect(suggestions.some(s => s.includes('Wait for more data'))).toBe(true);
    });
  });
});

describe('Integration Tests - Full System', () => {
  it('should produce clean metrics without any mock flags', async () => {
    // Teste de integração que simula o fluxo completo
    // Este teste deveria ser executado contra dados reais em staging

    const mockMetrics = {
      revenue: 1247.83,
      appointments: 23,
      success_rate: 78.2,
      growth_rate: 12.4,
      new_customers: 8,
      returning_customers: 15,
      total_customers: 23
    };

    const context: MetricCalculationContext = {
      tenantId: 'integration-test-tenant',
      period: '30d',
      dataSource: 'appointments',
      calculationMethod: 'real_historical_comparison',
      hasInsufficientData: false
    };

    const dataQualityService = new DataQualityService();
    const report = dataQualityService.validateMetricIntegrity(mockMetrics, context);

    // TODOS os testes devem passar para sistema livre de mock data
    expect(report.isValid).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.suspiciousValues).toHaveLength(0);
    expect(report.confidence).toBeGreaterThan(90);

    // Log para debugging em caso de falha
    if (!report.isValid) {
      console.error('MOCK DATA DETECTED:', {
        issues: report.issues,
        suspiciousValues: report.suspiciousValues,
        confidence: report.confidence
      });
    }
  });
});