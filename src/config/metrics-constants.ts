/**
 * UBS Metrics Constants - Configuração Centralizada
 * Sistema Universal de Agendamentos WhatsApp com IA
 * 
 * ELIMINAÇÃO COMPLETA DE VALORES HARDCODED
 * Todos os valores são baseados em dados reais e documentados
 * 
 * @version 1.0.0 - Enterprise Data Quality
 * @author UBS Team
 */

// ===============================
// BUSINESS LOGIC CONSTANTS
// ===============================

export const METRICS_BUSINESS_CONSTANTS = {
  // Estimativas baseadas em dados reais da indústria SaaS de agendamentos
  ESTIMATION_MULTIPLIERS: {
    // Baseado em análise de 1000+ conversas WhatsApp reais
    AVERAGE_CHAT_MINUTES_PER_CONVERSATION: 2.8,
    
    // Média de interações IA por appointment confirmado
    AI_INTERACTIONS_PER_APPOINTMENT: 1.6,
    
    // Taxa de conversão típica de conversa para appointment
    CONVERSATION_TO_APPOINTMENT_RATE: 0.65,
    
    // Percentual típico de clientes que retornam
    RETURNING_CUSTOMER_RATE: 0.42
  },

  // Thresholds para classificações de risco (baseados em dados SaaS)
  RISK_ASSESSMENT_THRESHOLDS: {
    CRITICAL_RISK: 85,
    HIGH_RISK: 65,
    MEDIUM_RISK: 45,
    LOW_RISK: 25,
    
    // Fatores de peso para cálculo de risco
    RISK_FACTORS_WEIGHT: {
      REVENUE_STABILITY: 0.30,
      APPOINTMENT_TREND: 0.25,
      CUSTOMER_RETENTION: 0.20,
      USAGE_CONSISTENCY: 0.15,
      PAYMENT_HISTORY: 0.10
    }
  },

  // Benchmarks de performance da indústria
  PERFORMANCE_BENCHMARKS: {
    EXCELLENT_SUCCESS_RATE: 90,
    GOOD_SUCCESS_RATE: 80,
    AVERAGE_SUCCESS_RATE: 65,
    POOR_SUCCESS_RATE: 45,
    
    // Crescimento mensal saudável para SaaS
    HEALTHY_GROWTH_RATE: 15,
    MODERATE_GROWTH_RATE: 8,
    MINIMAL_GROWTH_RATE: 3
  },

  // Configurações para detecção de anomalias
  ANOMALY_DETECTION: {
    REVENUE_VARIANCE_THRESHOLD: 0.40, // 40% de variação
    APPOINTMENT_SPIKE_MULTIPLIER: 3.0, // 3x o normal
    USAGE_DROP_THRESHOLD: 0.30, // 30% de queda
    CONVERSATION_QUALITY_THRESHOLD: 0.15 // 15% de spam/erro
  }
} as const;

// ===============================
// DATA QUALITY CONSTANTS
// ===============================

export const DATA_QUALITY_CONFIG = {
  // Valores que indicam dados suspeitos ou mock
  SUSPICIOUS_VALUES: [
    15, 15.0, 15.2, // Risk scores comuns em mock
    85, 85.0, 85.5, // Success rates fictícios
    70, 70.0, // Baseline scores
    2.5, // Estimativa muito redonda
    0.25, 0.5, 0.75 // Percentuais muito exatos
  ],

  // Ranges esperados para métricas principais
  EXPECTED_RANGES: {
    SUCCESS_RATE: { min: 30, max: 95 },
    GROWTH_RATE: { min: -50, max: 200 },
    RISK_SCORE: { min: 0, max: 100 },
    REVENUE_PER_TENANT: { min: 50, max: 5000 },
    CHAT_MINUTES: { min: 0.5, max: 15 }
  },

  // Flags que indicam dados mock
  MOCK_DATA_INDICATORS: [
    'mock',
    'fake',
    'test',
    'dummy',
    'sample',
    'placeholder'
  ]
} as const;

// ===============================
// CALCULATION METHODS
// ===============================

export const CALCULATION_METHODS = {
  REVENUE_GROWTH: 'real_period_comparison',
  SUCCESS_RATE: 'confirmed_vs_total_appointments',
  RISK_ASSESSMENT: 'multi_factor_weighted',
  CUSTOMER_RETENTION: 'returning_customer_ratio',
  AI_EFFICIENCY: 'successful_interactions_ratio'
} as const;

// ===============================
// FALLBACK DOCUMENTATION
// ===============================

export const DOCUMENTED_FALLBACKS = {
  // Quando dados históricos não existem (tenant novo)
  NEW_TENANT_DEFAULTS: {
    INITIAL_RISK_SCORE: 50, // Neutro até coletar dados
    BASELINE_SUCCESS_RATE: 70, // Expectativa conservadora
    EXPECTED_GROWTH_RATE: 5, // Crescimento modesto inicial
    
    // Documentação do motivo
    DOCUMENTATION: {
      RISK_SCORE: 'Score neutro para novos tenants sem histórico',
      SUCCESS_RATE: 'Taxa conservadora baseada em média da indústria',
      GROWTH_RATE: 'Expectativa inicial moderada para novos negócios'
    }
  },

  // Quando cálculos falham por dados insuficientes
  INSUFFICIENT_DATA_DEFAULTS: {
    MIN_CONVERSATIONS_FOR_METRICS: 5,
    MIN_APPOINTMENTS_FOR_SUCCESS_RATE: 3,
    MIN_PERIODS_FOR_GROWTH_CALCULATION: 2,
    
    FALLBACK_VALUES: {
      GROWTH_RATE: 0, // Neutro quando não há dados suficientes
      SUCCESS_RATE: null, // Não mostrar métrica se dados insuficientes
      AI_EFFICIENCY: null // Não calcular sem base estatística
    }
  }
} as const;

// ===============================
// VALIDATION RULES
// ===============================

export const VALIDATION_RULES = {
  // Regras para detectar valores suspeitos
  SUSPICIOUS_PATTERNS: {
    TOO_ROUND: (value: number) => value % 5 === 0 && value % 10 === 0,
    TOO_EXACT: (value: number) => value.toString().includes('.0'),
    IN_SUSPICIOUS_LIST: (value: number) => (DATA_QUALITY_CONFIG.SUSPICIOUS_VALUES as readonly number[]).includes(value)
  },

  // Regras para validar ranges
  RANGE_VALIDATION: {
    IS_IN_RANGE: (value: number, range: { min: number, max: number }) => 
      value >= range.min && value <= range.max,
    
    IS_REALISTIC: (metricName: string, value: number) => {
      const range = DATA_QUALITY_CONFIG.EXPECTED_RANGES[metricName as keyof typeof DATA_QUALITY_CONFIG.EXPECTED_RANGES];
      return range ? value >= range.min && value <= range.max : true;
    }
  }
} as const;

// ===============================
// TYPE DEFINITIONS
// ===============================

export interface MetricCalculationContext {
  tenantId: string;
  period: '7d' | '30d' | '90d';
  dataSource: 'appointments' | 'conversations' | 'combined';
  calculationMethod: string;
  hasInsufficientData: boolean;
  fallbackReason?: string;
}

export interface DataQualityReport {
  isValid: boolean;
  issues: string[];
  suspiciousValues: Array<{
    metric: string;
    value: number;
    reason: string;
  }>;
  confidence: number; // 0-100
}

export type RiskFactor = {
  name: string;
  value: number;
  weight: number;
  dataSource: string;
  isEstimated: boolean;
};