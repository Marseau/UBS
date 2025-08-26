/**
 * Intent Disambiguation Service - Camada 3
 * Quando determinístico E LLM retornam null, faz desambiguação com usuário
 * Marca awaiting_intent = true e processa resposta na próxima mensagem
 */

import { INTENT_KEYS, detectIntents } from './deterministic-intent-detector.service';

export interface DisambiguationResult {
  needsDisambiguation: boolean;
  disambiguationQuestion?: string;
  resolvedIntent?: string | null;
  shouldMarkAwaiting?: boolean;
}

export class IntentDisambiguationService {
  
  /**
   * Gera pergunta de desambiguação quando não conseguimos detectar intent
   */
  generateDisambiguationQuestion(): DisambiguationResult {
    const question = `Não consegui entender sua intenção. Poderia me dizer se você quer:

🔹 **Serviços** - Ver lista de serviços disponíveis
🔹 **Preços** - Consultar valores e tabela de preços  
🔹 **Horários** - Ver disponibilidade e agendar
🔹 **Meus Agendamentos** - Consultar ou alterar seus agendamentos
🔹 **Outros** - Endereço, pagamentos, políticas, etc.

Digite uma das opções ou me explique melhor o que precisa.`;

    return {
      needsDisambiguation: true,
      disambiguationQuestion: question,
      shouldMarkAwaiting: true
    };
  }

  /**
   * Processa resposta de desambiguação com padrões simples
   */
  processDisambiguationResponse(text: string): DisambiguationResult {
    const normalized = text.toLowerCase().trim();
    
    // Padrões simples para as opções oferecidas
    const patterns = {
      services: /\b(servicos?|lista|catalogo|procedimentos?)\b/i,
      pricing: /\b(preco|precos|valores?|tabela|orcamento)\b/i,
      availability: /\b(horarios?|disponibilidade|agendar|marcar)\b/i,
      my_appointments: /\b(meus?\s+agendamentos?|consultar\s+agendamento|ver\s+agendamento)\b/i,
      address: /\b(endereco|localizacao|onde\s+fica)\b/i,
      payments: /\b(pagamentos?|formas?\s+de\s+pagamento|pix|cartao)\b/i,
      business_hours: /\b(horario\s+de\s+funcionamento|funcionam|abrem|fecham)\b/i,
      policies: /\b(politicas?|cancelamento|termos)\b/i
    };

    // Testar cada padrão
    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(normalized)) {
        console.log(`🎯 [DISAMBIGUATION] Resolvido via padrão: "${text}" → ${intent}`);
        return {
          needsDisambiguation: false,
          resolvedIntent: intent
        };
      }
    }

    // Se não casou com padrões simples, tentar detector determinístico completo
    const deterministic = detectIntents(text);
    if (deterministic.length > 0) {
      console.log(`🎯 [DISAMBIGUATION] Resolvido via determinístico: "${text}" → ${deterministic[0]}`);
      return {
        needsDisambiguation: false,
        resolvedIntent: deterministic[0]
      };
    }

    // Ainda não conseguiu resolver - perguntar novamente
    console.log(`❓ [DISAMBIGUATION] Não conseguiu resolver: "${text}"`);
    return {
      needsDisambiguation: true,
      disambiguationQuestion: `Ainda não consegui entender. Poderia ser mais específico?

Por exemplo:
• "Quero ver os serviços"
• "Preciso saber os preços"  
• "Quero agendar um horário"
• "Ver meus agendamentos"

O que você gostaria de fazer?`
    };
  }

  /**
   * Retropreenchimento de mensagens NULL de uma sessão
   * Quando resolve intent via desambiguação, atualiza mensagens anteriores da sessão
   */
  async backfillSessionIntents(
    sessionId: string, 
    resolvedIntent: string,
    supabase: any
  ): Promise<void> {
    try {
      console.log(`🔄 [DISAMBIGUATION] Retropreenchendo sessão ${sessionId} com intent: ${resolvedIntent}`);

      // Buscar mensagens NULL da mesma sessão
      const { data: nullMessages, error } = await supabase
        .from('conversation_history')
        .select('id')
        .contains('conversation_context', { session_id: sessionId })
        .is('intent_detected', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('🚨 [DISAMBIGUATION] Erro ao buscar mensagens NULL:', error);
        return;
      }

      if (!nullMessages || nullMessages.length === 0) {
        console.log('🔄 [DISAMBIGUATION] Nenhuma mensagem NULL encontrada para retropreenchimento');
        return;
      }

      // Atualizar todas as mensagens NULL com o intent resolvido
      const messageIds = nullMessages.map((m: any) => m.id);
      const { error: updateError } = await supabase
        .from('conversation_history')
        .update({ 
          intent_detected: resolvedIntent,
          updated_at: new Date().toISOString()
        })
        .in('id', messageIds);

      if (updateError) {
        console.error('🚨 [DISAMBIGUATION] Erro ao atualizar mensagens:', updateError);
      } else {
        console.log(`✅ [DISAMBIGUATION] ${messageIds.length} mensagens retropreenchidas com intent: ${resolvedIntent}`);
      }

    } catch (error) {
      console.error('🚨 [DISAMBIGUATION] Erro no retropreenchimento:', error);
    }
  }

  /**
   * Verifica se contexto está em estado de aguardando intent
   */
  isAwaitingIntent(context: any): boolean {
    return context?.awaiting_intent === true;
  }

  /**
   * Marca contexto como aguardando intent
   */
  markAwaitingIntent(context: any): any {
    return {
      ...context,
      awaiting_intent: true,
      awaiting_intent_since: new Date().toISOString()
    };
  }

  /**
   * Remove marca de aguardando intent
   */
  clearAwaitingIntent(context: any): any {
    const updated = { ...context };
    delete updated.awaiting_intent;
    delete updated.awaiting_intent_since;
    return updated;
  }
}