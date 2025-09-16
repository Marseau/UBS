import { supabaseAdmin } from '../config/database';

export interface ConversationMessage {
  tenant_id: string;
  user_id: string;
  is_from_user: boolean;
  content: string;
  message_type: 'text' | 'media' | 'system';
  conversation_context: {
    session_id: string;
    duration_minutes?: number;
  }; // JSONB field - session_id_uuid is auto-generated from session_id
  intent_detected: string | null;
  confidence_score: number | null;
  tokens_used: number;
  api_cost_usd: number;
  processing_cost_usd: number;
  model_used: string | null;
  decision_method: 'flow_lock' | 'regex' | 'llm' | null;
  message_source?: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api'; // Origem da mensagem
  created_at: Date;
}

export class ConversationRepository {
  /**
   * Insere uma nova mensagem na tabela conversation_history
   */
  async insertMessage(message: ConversationMessage): Promise<void> {
    // Remover campos que não devem ser inseridos:
    // - decision_method: temporariamente até coluna ser adicionada ao banco
    // session_id_uuid é auto-gerado pelo banco a partir de conversation_context->session_id
    const { decision_method, ...messageToInsert } = message;
    
    // Validate conversation_context has session_id
    if (!messageToInsert.conversation_context?.session_id) {
      throw new Error('conversation_context.session_id is required for auto-generation of session_id_uuid');
    }
    
    const insertPayload = {
      ...messageToInsert,
      created_at: message.created_at.toISOString()
    };

    console.log('🔍 [REPO] Payload sendo inserido:', {
      tenant_id: insertPayload.tenant_id,
      user_id: insertPayload.user_id,
      content_length: insertPayload.content?.length,
      is_from_user: insertPayload.is_from_user,
      message_type: insertPayload.message_type,
      has_conversation_context: !!insertPayload.conversation_context,
      session_id_from_context: insertPayload.conversation_context?.session_id,
      message_source: insertPayload.message_source
    });

    const { error } = await supabaseAdmin
      .from('conversation_history')
      .insert(insertPayload);

    if (error) {
      console.error('❌ [REPO] Erro ao inserir mensagem:', error);
      console.error('❌ [REPO] Payload completo:', insertPayload);
      throw error;
    }

    console.log(`✅ [REPO] Mensagem inserida: user=${message.user_id}, method=${decision_method}, session=${messageToInsert.conversation_context.session_id}`);
  }

  /**
   * Verifica se existe uma mensagem com o mesmo conteúdo na janela de tempo especificada
   * (idempotência básica usando o session_id extraído do conversation_context)
   */
  async existsSamePayloadWithinWindow(
    sessionId: string,
    content: string,
    windowMs: number
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id')
      .eq('conversation_context->>session_id', sessionId) // Usar extração JSONB em tempo real
      .eq('content', content)
      .gte('created_at', windowStart)
      .limit(1);

    if (error) {
      console.error('❌ [REPO] Erro ao verificar duplicação:', error);
      // Em caso de erro, retorna false para não bloquear a inserção
      return false;
    }

    const exists = (data?.length || 0) > 0;
    if (exists) {
      console.log(`🔄 [REPO] Mensagem duplicada detectada: session=${sessionId}, content_len=${content.length}`);
    }

    return exists;
  }
}
