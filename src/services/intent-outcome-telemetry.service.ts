/**
 * Intent vs Outcome Telemetry Service
 * Captura métricas estruturadas sobre a separação Intent vs Outcome
 * Foco: conversão, tempo de resolução, abandono e padrões de comportamento
 */

import { supabaseAdmin } from '../config/database';
import { RedisCacheService } from './redis-cache.service';

export interface IntentOutcomeTelemetry {
  tenant_id: string;
  session_id_uuid: string;
  user_phone?: string;
  user_id?: string;
  conversation_id?: string;
  intent_detected: string;
  intent_timestamp: string;
  outcome_finalized?: string;
  outcome_timestamp?: string;
  conversion_time_seconds?: number;
  abandoned: boolean;
  abandonment_stage: 'intent_only' | 'outcome_reached' | 'timeout' | 'booking_flow' | null;
  conversation_duration_seconds: number;
  source?: string;
}

export interface OutcomePayload {
  session_id: string;
  tenant_id: string;
  user_id?: string;
  conversation_id?: string;
  outcome_new: string;
  source?: string;
}

export interface AbandonmentPayload {
  session_id: string;
  tenant_id: string;
  user_id?: string;
  conversation_id?: string;
  reason: 'intent_only' | 'outcome_reached' | 'timeout' | 'booking_flow' | 'unknown';
  outcome?: string;
  source?: string;
}

export interface ConversionMetrics {
  total_intents: number;
  total_outcomes: number;
  conversion_rate: number;
  avg_conversion_time_seconds: number;
  abandonment_rate: number;
  top_intents: Array<{ intent: string; count: number; conversion_rate: number }>;
  top_outcomes: Array<{ outcome: string; count: number; avg_time: number }>;
}

export class IntentOutcomeTelemetryService {
  private redisCacheService: RedisCacheService;
  
  constructor() {
    this.redisCacheService = RedisCacheService.getInstance();
  }

  /**
   * Registra detecção de intent (sempre chamado)
   */
  async recordIntentDetected(
    tenantId: string,
    sessionId: string,
    userPhone: string,
    intent: string
  ): Promise<void> {
    try {
      const telemetryKey = `intent_telemetry:${sessionId}`;
      const intentData = {
        tenant_id: tenantId,
        session_id_uuid: sessionId,
        user_phone: userPhone,
        intent_detected: intent,
        intent_timestamp: new Date().toISOString(),
        abandoned: false,
        abandonment_stage: null,
        conversation_start: Date.now()
      };

      // Cache no Redis por 1 hora para tracking
      await this.redisCacheService.set(telemetryKey, JSON.stringify(intentData), 3600);
      
      console.log(`📊 [INTENT-TELEMETRY] Intent registrado: ${intent} para sessão ${sessionId}`);
    } catch (error) {
      console.error(`❌ [INTENT-TELEMETRY] Erro ao registrar intent:`, error);
    }
  }

  /**
   * Registra finalização de outcome (nem sempre chamado)
   * OVERLOAD: Aceita tanto string quanto objeto enriquecido
   */
  async recordOutcomeFinalized(
    sessionIdOrPayload: string | OutcomePayload,
    outcome?: string
  ): Promise<void> {
    // Normalizar entrada para payload estruturado
    const payload: OutcomePayload = typeof sessionIdOrPayload === 'string' 
      ? { session_id: sessionIdOrPayload, outcome_new: outcome!, tenant_id: '', source: 'legacy' }
      : sessionIdOrPayload;
    try {
      const telemetryKey = `intent_telemetry:${payload.session_id}`;
      const cachedData = await this.redisCacheService.get(telemetryKey);
      
      if (!cachedData) {
        console.warn(`⚠️ [OUTCOME-TELEMETRY] Intent não encontrado para sessão ${payload.session_id}`);
        return;
      }

      const intentData = JSON.parse(cachedData);
      const now = new Date();
      const outcomeTimestamp = now.toISOString();
      const conversionTimeSeconds = Math.round(
        (now.getTime() - new Date(intentData.intent_timestamp).getTime()) / 1000
      );

      const completeTelemetry: IntentOutcomeTelemetry = {
        ...intentData,
        tenant_id: payload.tenant_id || intentData.tenant_id,
        user_id: payload.user_id,
        conversation_id: payload.conversation_id,
        outcome_finalized: payload.outcome_new,
        outcome_timestamp: outcomeTimestamp,
        conversion_time_seconds: conversionTimeSeconds,
        abandoned: false,
        abandonment_stage: 'outcome_reached',
        conversation_duration_seconds: Math.round((Date.now() - intentData.conversation_start) / 1000),
        source: payload.source
      };

      // Persiste telemetria completa no banco
      await this.persistTelemetry(completeTelemetry);
      
      // Remove do cache - conversa finalizada
      await this.redisCacheService.del(telemetryKey);
      
      console.log(`✅ [OUTCOME-TELEMETRY] Conversão completa: ${intentData.intent_detected} → ${payload.outcome_new} em ${conversionTimeSeconds}s [tenant: ${payload.tenant_id}, source: ${payload.source}]`);
    } catch (error) {
      console.error(`❌ [OUTCOME-TELEMETRY] Erro ao registrar outcome:`, error);
    }
  }

  /**
   * Marca conversa como abandonada (timeout, erro, etc)
   * OVERLOAD: Aceita tanto string quanto objeto enriquecido
   */
  async recordConversationAbandoned(
    sessionIdOrPayload: string | AbandonmentPayload,
    stage?: 'intent_only' | 'outcome_reached' | 'timeout' | 'booking_flow' | 'unknown'
  ): Promise<void> {
    // Normalizar entrada para payload estruturado
    const payload: AbandonmentPayload = typeof sessionIdOrPayload === 'string'
      ? { session_id: sessionIdOrPayload, reason: stage || 'intent_only', tenant_id: '', source: 'legacy' }
      : sessionIdOrPayload;
    try {
      const telemetryKey = `intent_telemetry:${payload.session_id}`;
      const cachedData = await this.redisCacheService.get(telemetryKey);
      
      if (!cachedData) {
        console.warn(`⚠️ [ABANDONMENT-TELEMETRY] Intent não encontrado para sessão ${payload.session_id}`);
        return; // Sessão já processada ou não existe
      }

      const intentData = JSON.parse(cachedData);
      const abandonedTelemetry: IntentOutcomeTelemetry = {
        ...intentData,
        tenant_id: payload.tenant_id || intentData.tenant_id,
        user_id: payload.user_id,
        conversation_id: payload.conversation_id,
        outcome_finalized: payload.outcome, // opcional
        abandoned: true,
        abandonment_stage: payload.reason,
        conversation_duration_seconds: Math.round((Date.now() - intentData.conversation_start) / 1000),
        source: payload.source
      };

      // Persiste abandono no banco
      await this.persistTelemetry(abandonedTelemetry);
      
      // Remove do cache
      await this.redisCacheService.del(telemetryKey);
      
      console.log(`⚠️ [ABANDONMENT-TELEMETRY] Conversa abandonada: ${intentData.intent_detected} na etapa ${payload.reason} [tenant: ${payload.tenant_id}, outcome: ${payload.outcome || 'none'}, source: ${payload.source}]`);
    } catch (error) {
      console.error(`❌ [ABANDONMENT-TELEMETRY] Erro ao registrar abandono:`, error);
    }
  }

  /**
   * Persiste telemetria no banco de dados
   */
  private async persistTelemetry(telemetry: IntentOutcomeTelemetry): Promise<void> {
    try {
      const { error } = await (supabaseAdmin as any)
        .from('intent_outcome_telemetry')
        .insert({
          tenant_id: telemetry.tenant_id,
          session_id_uuid: telemetry.session_id_uuid,
          user_phone: telemetry.user_phone,
          user_id: telemetry.user_id,
          conversation_id: telemetry.conversation_id,
          intent_detected: telemetry.intent_detected,
          intent_timestamp: telemetry.intent_timestamp,
          outcome_finalized: telemetry.outcome_finalized,
          outcome_timestamp: telemetry.outcome_timestamp,
          conversion_time_seconds: telemetry.conversion_time_seconds,
          abandoned: telemetry.abandoned,
          abandonment_stage: telemetry.abandonment_stage,
          conversation_duration_seconds: telemetry.conversation_duration_seconds,
          source: telemetry.source,
          created_at: new Date().toISOString()
        } as any);

      if (error) {
        console.error(`❌ [TELEMETRY-PERSIST] Erro ao salvar telemetria:`, error);
      }
    } catch (error) {
      console.error(`❌ [TELEMETRY-PERSIST] Erro crítico:`, error);
    }
  }

  /**
   * Calcula métricas de conversão para um tenant
   */
  async getConversionMetrics(
    tenantId: string,
    periodDays: number = 30
  ): Promise<ConversionMetrics> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // Query principal para métricas
      const { data: telemetryData, error } = await (supabaseAdmin as any)
        .from('intent_outcome_telemetry')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString());

      if (error) {
        throw error;
      }

      if (!telemetryData || telemetryData.length === 0) {
        return {
          total_intents: 0,
          total_outcomes: 0,
          conversion_rate: 0,
          avg_conversion_time_seconds: 0,
          abandonment_rate: 0,
          top_intents: [],
          top_outcomes: []
        };
      }

      // Calcular métricas
      const totalIntents = telemetryData.length;
      const completedConversations = telemetryData.filter((t: any) => !t.abandoned && t.outcome_finalized);
      const totalOutcomes = completedConversations.length;
      const conversionRate = totalIntents > 0 ? (totalOutcomes / totalIntents) * 100 : 0;
      const abandonmentRate = totalIntents > 0 ? ((totalIntents - totalOutcomes) / totalIntents) * 100 : 0;
      
      const avgConversionTime = completedConversations.length > 0 
        ? completedConversations.reduce((sum: any, t: any) => sum + (t.conversion_time_seconds || 0), 0) / completedConversations.length
        : 0;

      // Top intents com taxa de conversão
      const intentStats = new Map<string, { count: number; conversions: number }>();
      telemetryData.forEach((t: any) => {
        const existing = intentStats.get(t.intent_detected) || { count: 0, conversions: 0 };
        existing.count++;
        if (!t.abandoned && t.outcome_finalized) {
          existing.conversions++;
        }
        intentStats.set(t.intent_detected, existing);
      });

      const topIntents = Array.from(intentStats.entries())
        .map(([intent, stats]) => ({
          intent,
          count: stats.count,
          conversion_rate: stats.count > 0 ? (stats.conversions / stats.count) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top outcomes com tempo médio
      const outcomeStats = new Map<string, { count: number; totalTime: number }>();
      completedConversations.forEach((t: any) => {
        if (!t.outcome_finalized) return;
        const existing = outcomeStats.get(t.outcome_finalized) || { count: 0, totalTime: 0 };
        existing.count++;
        existing.totalTime += t.conversion_time_seconds || 0;
        outcomeStats.set(t.outcome_finalized, existing);
      });

      const topOutcomes = Array.from(outcomeStats.entries())
        .map(([outcome, stats]) => ({
          outcome,
          count: stats.count,
          avg_time: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        total_intents: totalIntents,
        total_outcomes: totalOutcomes,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        avg_conversion_time_seconds: Math.round(avgConversionTime),
        abandonment_rate: Math.round(abandonmentRate * 100) / 100,
        top_intents: topIntents,
        top_outcomes: topOutcomes
      };

    } catch (error) {
      console.error(`❌ [CONVERSION-METRICS] Erro ao calcular métricas:`, error);
      throw error;
    }
  }

  /**
   * Processa abandonos de sessões específicas (chamado manualmente)
   */
  async markSessionAbandoned(sessionId: string): Promise<boolean> {
    try {
      await this.recordConversationAbandoned(sessionId, 'intent_only');
      console.log(`🧹 [SESSION-CLEANUP] Sessão ${sessionId} marcada como abandonada`);
      return true;
    } catch (error) {
      console.error(`❌ [SESSION-CLEANUP] Erro ao processar sessão ${sessionId}:`, error);
      return false;
    }
  }
}