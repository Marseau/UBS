/**
 * Intent Cascade Monitor Service
 * 
 * Sistema de monitoramento de falhas em cascata nas camadas de detecção de intent:
 * - Layer 1: REGEX detection
 * - Layer 2: LLM classification  
 * - Layer 3: Deterministic fallback
 * 
 * Detecta padrões de falha e gera alertas automáticos para degradação do sistema
 */

import { createClient } from '@supabase/supabase-js';
import { redisCacheService } from './redis-cache.service';
import { UnifiedIntent } from '../types/intent.types';

// Lazy initialization to prevent environment variable issues during module loading
let supabaseClient: any = null;
function getSupabaseClient() {
  if (!supabaseClient) {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string;
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('⚠️ [CASCADE-MONITOR] Supabase credentials not available');
      return null;
    }
    
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

interface LayerFailure {
  layer: 'regex' | 'llm' | 'fallback';
  timestamp: number;
  tenantId: string;
  messageText: string;
  reason: string;
  confidence?: number;
}

interface CascadeFailurePattern {
  tenantId: string;
  window: number; // tempo em ms
  regexFailures: number;
  llmFailures: number;
  fallbackUsage: number;
  totalMessages: number;
  failureRate: number;
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface AlertThreshold {
  regexFailureRate: number;
  llmFailureRate: number; 
  fallbackUsageRate: number;
  timeWindowMinutes: number;
  minimumMessages: number;
}

export class IntentCascadeMonitorService {
  private static instance: IntentCascadeMonitorService;
  private failures: Map<string, LayerFailure[]> = new Map();
  private readonly CACHE_PREFIX = 'intent_monitor';
  private readonly WINDOW_SIZE = 5 * 60 * 1000; // 5 minutos
  
  // Thresholds de alerta escalonados
  private readonly ALERT_THRESHOLDS: Record<string, AlertThreshold> = {
    low: {
      regexFailureRate: 0.3,   // 30% falhas regex
      llmFailureRate: 0.4,     // 40% falhas LLM  
      fallbackUsageRate: 0.5,  // 50% usando fallback
      timeWindowMinutes: 5,
      minimumMessages: 10
    },
    medium: {
      regexFailureRate: 0.5,   // 50% falhas regex
      llmFailureRate: 0.6,     // 60% falhas LLM
      fallbackUsageRate: 0.7,  // 70% usando fallback 
      timeWindowMinutes: 3,
      minimumMessages: 8
    },
    high: {
      regexFailureRate: 0.7,   // 70% falhas regex
      llmFailureRate: 0.8,     // 80% falhas LLM
      fallbackUsageRate: 0.85, // 85% usando fallback
      timeWindowMinutes: 2,
      minimumMessages: 5
    },
    critical: {
      regexFailureRate: 0.85,  // 85% falhas regex
      llmFailureRate: 0.9,     // 90% falhas LLM
      fallbackUsageRate: 0.95, // 95% usando fallback
      timeWindowMinutes: 1,
      minimumMessages: 3
    }
  };

  static getInstance(): IntentCascadeMonitorService {
    if (!IntentCascadeMonitorService.instance) {
      IntentCascadeMonitorService.instance = new IntentCascadeMonitorService();
    }
    return IntentCascadeMonitorService.instance;
  }

  /**
   * Registra falha na camada de REGEX
   */
  async recordRegexFailure(tenantId: string, messageText: string, reason: string): Promise<void> {
    await this.recordFailure({
      layer: 'regex',
      timestamp: Date.now(),
      tenantId,
      messageText: messageText.substring(0, 100), // Truncar para privacidade
      reason
    });
  }

  /**
   * Registra falha na camada de LLM
   */
  async recordLlmFailure(tenantId: string, messageText: string, reason: string, confidence?: number): Promise<void> {
    await this.recordFailure({
      layer: 'llm',
      timestamp: Date.now(),
      tenantId,
      messageText: messageText.substring(0, 100),
      reason,
      confidence
    });
  }

  /**
   * Registra uso de fallback (não é falha, mas indica degradação)
   */
  async recordFallbackUsage(tenantId: string, messageText: string, intent: UnifiedIntent): Promise<void> {
    await this.recordFailure({
      layer: 'fallback',
      timestamp: Date.now(),
      tenantId,
      messageText: messageText.substring(0, 100),
      reason: `Fallback usado: ${intent}`
    });
  }

  /**
   * Registra falha em qualquer camada
   */
  private async recordFailure(failure: LayerFailure): Promise<void> {
    try {
      const key = `${this.CACHE_PREFIX}:failures:${failure.tenantId}`;
      
      // Recuperar falhas existentes do cache
      let failures = this.failures.get(failure.tenantId) || [];
      
      // Tentar recuperar do Redis se não estiver em memória
      if (failures.length === 0) {
        const cached = await redisCacheService.get(key);
        if (cached) {
          failures = JSON.parse(cached);
        }
      }

      // Adicionar nova falha
      failures.push(failure);

      // Limpar falhas antigas (fora da janela de tempo)
      const cutoff = Date.now() - this.WINDOW_SIZE;
      failures = failures.filter(f => f.timestamp > cutoff);

      // Atualizar cache
      this.failures.set(failure.tenantId, failures);
      await redisCacheService.set(key, JSON.stringify(failures), 600); // 10 min TTL

      // Analisar padrão de falhas e gerar alertas se necessário
      await this.analyzeFailurePattern(failure.tenantId, failures);

      console.log(`🔍 [CASCADE-MONITOR] ${failure.layer} failure recorded: ${failure.reason} (tenant: ${failure.tenantId})`);

    } catch (error) {
      console.error('❌ [CASCADE-MONITOR] Erro ao registrar falha:', error);
    }
  }

  /**
   * Analisa padrão de falhas e gera alertas se necessário
   */
  private async analyzeFailurePattern(tenantId: string, failures: LayerFailure[]): Promise<void> {
    if (failures.length === 0) return;

    const pattern = this.calculateFailurePattern(tenantId, failures);
    const severity = this.determineSeverityLevel(pattern);

    if (severity !== 'low') {
      await this.generateAlert(pattern, severity);
    }

    // Log para monitoramento contínuo
    if (pattern.totalMessages >= 5) {
      console.log(`📊 [CASCADE-MONITOR] Pattern analysis for ${tenantId}:`, {
        totalMessages: pattern.totalMessages,
        regexFailures: pattern.regexFailures,
        llmFailures: pattern.llmFailures,
        fallbackUsage: pattern.fallbackUsage,
        failureRate: `${(pattern.failureRate * 100).toFixed(1)}%`,
        severity
      });
    }
  }

  /**
   * Calcula padrão de falhas na janela de tempo
   */
  private calculateFailurePattern(tenantId: string, failures: LayerFailure[]): CascadeFailurePattern {
    const cutoff = Date.now() - this.WINDOW_SIZE;
    const recentFailures = failures.filter(f => f.timestamp > cutoff);

    const regexFailures = recentFailures.filter(f => f.layer === 'regex').length;
    const llmFailures = recentFailures.filter(f => f.layer === 'llm').length;
    const fallbackUsage = recentFailures.filter(f => f.layer === 'fallback').length;
    const totalMessages = recentFailures.length;
    const failureRate = totalMessages > 0 ? (regexFailures + llmFailures) / totalMessages : 0;

    return {
      tenantId,
      window: this.WINDOW_SIZE,
      regexFailures,
      llmFailures,
      fallbackUsage,
      totalMessages,
      failureRate,
      severityLevel: 'low' // será calculado separadamente
    };
  }

  /**
   * Determina nível de severidade baseado nas métricas
   */
  private determineSeverityLevel(pattern: CascadeFailurePattern): 'low' | 'medium' | 'high' | 'critical' {
    if (pattern.totalMessages < 10) {
      return 'low';
    }

    const regexFailureRate = pattern.regexFailures / pattern.totalMessages;
    const llmFailureRate = pattern.llmFailures / pattern.totalMessages;
    const fallbackUsageRate = pattern.fallbackUsage / pattern.totalMessages;

    // Critical: Sistema quase inoperante (85%+ falhas)
    if (regexFailureRate >= 0.85 || llmFailureRate >= 0.9 || fallbackUsageRate >= 0.95) {
      return 'critical';
    }

    // High: Degradação severa (70%+ falhas)
    if (regexFailureRate >= 0.7 || llmFailureRate >= 0.8 || fallbackUsageRate >= 0.85) {
      return 'high';
    }

    // Medium: Degradação moderada (50%+ falhas)
    if (regexFailureRate >= 0.5 || llmFailureRate >= 0.6 || fallbackUsageRate >= 0.7) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Gera alerta e persiste no banco
   */
  private async generateAlert(pattern: CascadeFailurePattern, severity: 'low' | 'medium' | 'high' | 'critical'): Promise<void> {
    try {
      const alert = {
        tenant_id: pattern.tenantId,
        alert_type: 'intent_cascade_failure',
        severity_level: severity,
        title: `Intent Detection Cascade Failure - ${severity.toUpperCase()}`,
        description: this.generateAlertDescription(pattern, severity),
        metrics: {
          timeWindow: '5 minutes',
          totalMessages: pattern.totalMessages,
          regexFailures: pattern.regexFailures,
          llmFailures: pattern.llmFailures,
          fallbackUsage: pattern.fallbackUsage,
          overallFailureRate: `${(pattern.failureRate * 100).toFixed(1)}%`
        },
        created_at: new Date().toISOString(),
        resolved_at: null,
        status: 'active'
      };

      // Verificar se já existe alerta similar recente (evitar spam)
      const recentAlert = await this.checkRecentAlert(pattern.tenantId, severity);
      if (recentAlert) {
        console.log(`⚠️ [CASCADE-MONITOR] Skipping duplicate alert for ${pattern.tenantId} (${severity})`);
        return;
      }

      // Persistir alerta no banco
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.error('❌ [CASCADE-MONITOR] Supabase client not available');
        return;
      }

      const { error } = await supabase
        .from('system_alerts')
        .insert([alert]);

      if (error) {
        console.error('❌ [CASCADE-MONITOR] Erro ao persistir alerta:', error);
        return;
      }

      // Alertas críticos precisam de ação imediata
      if (severity === 'critical') {
        console.error(`🚨 [CASCADE-MONITOR] CRITICAL ALERT: Intent detection system failing for tenant ${pattern.tenantId}`);
        console.error(`📊 Metrics:`, alert.metrics);
      } else {
        console.warn(`⚠️ [CASCADE-MONITOR] ${severity.toUpperCase()} Alert: ${alert.title} (tenant: ${pattern.tenantId})`);
      }

    } catch (error) {
      console.error('❌ [CASCADE-MONITOR] Erro ao gerar alerta:', error);
    }
  }

  /**
   * Gera descrição detalhada do alerta
   */
  private generateAlertDescription(pattern: CascadeFailurePattern, severity: string): string {
    const regexRate = (pattern.regexFailures / pattern.totalMessages * 100).toFixed(1);
    const llmRate = (pattern.llmFailures / pattern.totalMessages * 100).toFixed(1);
    const fallbackRate = (pattern.fallbackUsage / pattern.totalMessages * 100).toFixed(1);

    let description = `Intent detection system showing ${severity} degradation:\n\n`;
    description += `📊 Performance Metrics (last 5 minutes):\n`;
    description += `- Total messages processed: ${pattern.totalMessages}\n`;
    description += `- REGEX layer failures: ${pattern.regexFailures} (${regexRate}%)\n`;
    description += `- LLM layer failures: ${pattern.llmFailures} (${llmRate}%)\n`;
    description += `- Fallback usage: ${pattern.fallbackUsage} (${fallbackRate}%)\n`;
    description += `- Overall failure rate: ${(pattern.failureRate * 100).toFixed(1)}%\n\n`;

    if (severity === 'critical') {
      description += `🚨 CRITICAL: System is heavily degraded and may impact user experience significantly.`;
    } else if (severity === 'high') {
      description += `⚠️ HIGH: Significant degradation detected. Monitor closely and consider intervention.`;
    } else if (severity === 'medium') {
      description += `⚠️ MEDIUM: Moderate degradation detected. Keep monitoring for trends.`;
    }

    return description;
  }

  /**
   * Verifica se já existe alerta similar recente
   */
  private async checkRecentAlert(tenantId: string, severity: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.warn('⚠️ [CASCADE-MONITOR] Supabase client not available for alert check');
        return false;
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('alert_type', 'intent_cascade_failure')
        .eq('severity_level', severity)
        .eq('status', 'active')
        .gte('created_at', fiveMinutesAgo)
        .limit(1);

      if (error) {
        console.error('❌ [CASCADE-MONITOR] Erro ao verificar alerta recente:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('❌ [CASCADE-MONITOR] Erro ao verificar alerta recente:', error);
      return false;
    }
  }

  /**
   * Obtém estatísticas de monitoramento para dashboard
   */
  async getMonitoringStats(tenantId: string): Promise<CascadeFailurePattern | null> {
    try {
      const key = `${this.CACHE_PREFIX}:failures:${tenantId}`;
      const failures = this.failures.get(tenantId) || [];
      
      if (failures.length === 0) {
        const cached = await redisCacheService.get(key);
        if (cached) {
          const cachedFailures = JSON.parse(cached);
          return this.calculateFailurePattern(tenantId, cachedFailures);
        }
        return null;
      }

      return this.calculateFailurePattern(tenantId, failures);
    } catch (error) {
      console.error('❌ [CASCADE-MONITOR] Erro ao obter estatísticas:', error);
      return null;
    }
  }

  /**
   * Health check do sistema de monitoramento
   */
  async healthCheck(): Promise<{ healthy: boolean; stats: any }> {
    try {
      const totalTenants = this.failures.size;
      let totalFailures = 0;
      let criticalTenants = 0;

      for (const [tenantId, failures] of this.failures.entries()) {
        totalFailures += failures.length;
        const pattern = this.calculateFailurePattern(tenantId, failures);
        const severity = this.determineSeverityLevel(pattern);
        if (severity === 'critical' || severity === 'high') {
          criticalTenants++;
        }
      }

      const healthy = criticalTenants === 0;

      return {
        healthy,
        stats: {
          monitoredTenants: totalTenants,
          totalFailures,
          criticalTenants,
          memoryUsage: `${(JSON.stringify(Object.fromEntries(this.failures)).length / 1024).toFixed(2)} KB`
        }
      };
    } catch (error) {
      console.error('❌ [CASCADE-MONITOR] Erro no health check:', error);
      return { healthy: false, stats: {} };
    }
  }
}

// Export singleton instance
export const intentCascadeMonitor = IntentCascadeMonitorService.getInstance();