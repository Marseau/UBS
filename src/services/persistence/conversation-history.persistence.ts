// src/services/persistence/conversation-history.persistence.ts
import { createClient } from '@supabase/supabase-js';
import { ConversationRowT } from "../../contracts/conversation";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function persistConversationMessage(row: ConversationRowT): Promise<string> {

  // DEBUG: Log específico para processing_cost_usd
  console.log('🔍 [PERSIST-DEBUG] processing_cost_usd antes de inserir:', {
    is_from_user: row.is_from_user,
    processing_cost_usd: row.processing_cost_usd,
    content_preview: row.content.substring(0, 30)
  });

  const { data, error } = await supabase
    .from('conversation_history')
    .insert({
      tenant_id: row.tenant_id,
      user_id: row.user_id ?? null,
      content: row.content,
      is_from_user: row.is_from_user,
      message_type: row.message_type ?? "text",
      intent_detected: row.intent_detected ?? null,
      confidence_score: row.confidence_score ?? null,
      conversation_context: row.conversation_context ?? {},
      model_used: row.model_used ?? null,
      tokens_used: row.tokens_used ?? null,
      api_cost_usd: row.api_cost_usd ?? null,
      processing_cost_usd: row.processing_cost_usd ?? null, // ADICIONADO: Custo de infraestrutura
      conversation_outcome: row.conversation_outcome ?? null,
      message_source: row.message_source ?? 'whatsapp', // ESSENCIAL: incluir message_source
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }
  
  return data.id;
}