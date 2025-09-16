import { supabaseAdmin } from '../config/database';

export type TurnEvent = {
  tenant_id: string;
  session_id: string;
  user_phone: string;
  decision_method: 'flow_lock' | 'regex' | 'llm';
  intent_detected: string | null;
  confidence: number | null;
  tokens_used: number;
  api_cost_usd: number;
  model_used: string | null;
  response_time_ms: number;
  reply_size_chars: number;
  timestamp: Date;
};

export type OutcomeEvent = {
  tenant_id: string;
  session_id: string;
  outcome: string;
  reason: string | null;
  timestamp: Date;
};

export class TelemetryService {
  constructor() {}

  /**
   * Registra evento de turn (cada interação do usuário)
   */
  async recordTurn(ev: TurnEvent): Promise<void> {
    try {
      // Para MVP, vamos logar estruturadamente
      // Em produção, pode ir para tabela própria, Kafka, ou analytics service
      console.log('📊 [TELEMETRY-TURN]', {
        tenant_id: ev.tenant_id,
        session_id: ev.session_id,
        decision_method: ev.decision_method,
        intent: ev.intent_detected,
        confidence: ev.confidence,
        tokens: ev.tokens_used,
        cost: ev.api_cost_usd,
        response_time: ev.response_time_ms,
        reply_size: ev.reply_size_chars,
        timestamp: ev.timestamp.toISOString()
      });

      // Opcional: inserir em tabela de telemetria se existir
      // await this.insertTurnTelemetry(ev);
    } catch (error) {
      console.error('❌ [TELEMETRY] Erro ao registrar turn:', error);
      // Não re-lança erro para não quebrar o fluxo principal
    }
  }

  /**
   * Registra evento de outcome (finalização de conversa)
   */
  async recordOutcome(ev: OutcomeEvent): Promise<void> {
    try {
      console.log('🎯 [TELEMETRY-OUTCOME]', {
        tenant_id: ev.tenant_id,
        session_id: ev.session_id,
        outcome: ev.outcome,
        reason: ev.reason,
        timestamp: ev.timestamp.toISOString()
      });

      // Opcional: inserir em tabela de outcomes se existir
      // await this.insertOutcomeTelemetry(ev);
    } catch (error) {
      console.error('❌ [TELEMETRY] Erro ao registrar outcome:', error);
      // Não re-lança erro para não quebrar o fluxo principal
    }
  }

  /**
   * Cria métricas agregadas para dashboard (opcional)
   */
  async recordMetrics(metrics: {
    tenant_id: string;
    period: '1h' | '1d' | '7d';
    total_turns: number;
    total_llm_calls: number;
    total_cost_usd: number;
    avg_response_time_ms: number;
    top_intents: Array<{ intent: string; count: number }>;
    timestamp: Date;
  }): Promise<void> {
    try {
      console.log('📈 [TELEMETRY-METRICS]', {
        tenant_id: metrics.tenant_id,
        period: metrics.period,
        summary: {
          turns: metrics.total_turns,
          llm_calls: metrics.total_llm_calls,
          cost: metrics.total_cost_usd,
          avg_response_time: metrics.avg_response_time_ms
        },
        top_intents: metrics.top_intents,
        timestamp: metrics.timestamp.toISOString()
      });
    } catch (error) {
      console.error('❌ [TELEMETRY] Erro ao registrar métricas:', error);
    }
  }

  /**
   * Insere dados de turn em tabela de telemetria (se existir)
   * TODO: Implementar quando tabelas de telemetria forem criadas
   */
  private async insertTurnTelemetry(ev: TurnEvent): Promise<void> {
    // Por enquanto, apenas log estruturado
    // Quando as tabelas turn_telemetry e outcome_telemetry forem criadas,
    // descomentar o código abaixo:
    
    /*
    const { error } = await supabaseAdmin
      .from('turn_telemetry')
      .insert({
        tenant_id: ev.tenant_id,
        session_id: ev.session_id,
        user_phone: ev.user_phone,
        decision_method: ev.decision_method,
        intent_detected: ev.intent_detected,
        confidence: ev.confidence,
        tokens_used: ev.tokens_used,
        api_cost_usd: ev.api_cost_usd,
        model_used: ev.model_used,
        response_time_ms: ev.response_time_ms,
        reply_size_chars: ev.reply_size_chars,
        created_at: ev.timestamp.toISOString()
      });

    if (error) {
      console.error('❌ [TELEMETRY-DB] Erro ao inserir turn:', error);
    }
    */
  }

  /**
   * Insere dados de outcome em tabela de telemetria (se existir)
   * TODO: Implementar quando tabelas de telemetria forem criadas
   */
  private async insertOutcomeTelemetry(ev: OutcomeEvent): Promise<void> {
    // Por enquanto, apenas log estruturado
    // Quando a tabela outcome_telemetry for criada, descomentar:
    
    /*
    const { error } = await supabaseAdmin
      .from('outcome_telemetry')
      .insert({
        tenant_id: ev.tenant_id,
        session_id: ev.session_id,
        outcome: ev.outcome,
        reason: ev.reason,
        created_at: ev.timestamp.toISOString()
      });

    if (error) {
      console.error('❌ [TELEMETRY-DB] Erro ao inserir outcome:', error);
    }
    */
  }
}