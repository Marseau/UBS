// src/services/telemetry/llm-telemetry.service.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function recordLLMMetrics(input: {
  messageId: string; // SOLUÇÃO DEFINITIVA: message_id obrigatório
  tenantId: string;
  sessionId?: string;
  modelUsed?: string;
  tokensUsed?: number;
  apiCostUsd?: number;
  intent?: string;
  outcome?: string;
}) {
  // Gravar em ml_model_runs usando Supabase client
  const { error } = await supabase
    .from('ml_model_runs')
    .insert({
      message_id: input.messageId, // CONSTRAINT RESOLVIDA: message_id agora obrigatório
      tenant_id: input.tenantId,
      session_id: input.sessionId ?? null,
      model_name: input.modelUsed ?? null,
      model_version: 'n/a',
      prompt_hash: 'n/a',
      run_at: new Date().toISOString(),
      latency_ms: 0,
      cost_usd: input.apiCostUsd ?? 0,
      token_input: input.tokensUsed ?? 0,
      token_output: 0,
      metadata: {
        intent: input.intent ?? null,
        outcome: input.outcome ?? null,
      }
    });

  if (error) {
    throw error;
  }
}