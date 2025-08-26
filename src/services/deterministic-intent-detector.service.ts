// src/services/deterministic-intent-detector.service.ts
// 100% determinístico (sem LLM). Se nada casar, retorna null (para persistir NULL).

// ===== INTENT ENUM (alinhado ao orquestrador/rota) =====
export const INTENT_KEYS = [
  'greeting',
  'services',
  'pricing',
  'availability',
  'my_appointments',
  'address',
  'payments',
  'business_hours',
  'cancel',
  'reschedule',
  'confirm',
  'modify_appointment',
  'policies',
  'handoff',
  'wrong_number',
  'test_message',
  'booking_abandoned',
  'noshow_followup'
] as const;
export type IntentKey = typeof INTENT_KEYS[number];

// Ordem de prioridade para resolver sobreposições (primeiro vence)
const PRIORITY: IntentKey[] = [
  'confirm',
  'cancel',
  'reschedule',
  'modify_appointment',
  'my_appointments',
  'availability',
  'pricing',
  'services',
  'business_hours',
  'address',
  'payments',
  'policies',
  'wrong_number',
  'test_message',
  'noshow_followup',
  'booking_abandoned',
  'handoff',
  'greeting'
];

// Normalizador simples: minúsculas e sem acentos
function norm(input: string): string {
  return (input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Padrões por intenção (PT-BR)
const PATTERNS: Record<IntentKey, RegExp[]> = {
  greeting: [
    /^(oi|ola|bom dia|boa tarde|boa noite|eai|tudo bem)/i,
    /(oi|ola)[!.,\s]/i
  ],
  services: [
    /\b(servicos?|lista de servicos?|catalogo|quais (sao )?os servicos?)\b/i
  ],
  pricing: [
    /\b(precos?|preco|valores?|quanto custa|tabela de preco|orcamento)\b/i
  ],
  availability: [
    /\b(horarios?|agenda|disponivel|tem horario|quando (pode|tem)|amanha|hoje tem horario)\b/i
  ],
  my_appointments: [
    /\b(meus? agendamentos?|minha agenda|minhas? consultas?|ver agendamento|consultar agendamento)\b/i
  ],
  address: [
    /\b(endereco|localizacao|onde fica|como chegar|mapa)\b/i
  ],
  payments: [
    /\b(pagamentos?|pagar|pix|cartao|dinheiro|formas? de pagamento|aceitam (pix|cartao|dinheiro))\b/i
  ],
  business_hours: [
    /\b(horario de funcionamento|funcionam que horas|abrem|fecham|atendem de que horario?)\b/i
  ],
  cancel: [
    /\b(cancelar|cancele|quero cancelar|desmarcar|remover agendamento)\b/i
  ],
  reschedule: [
    /\b(reagendar|remarcar|trocar horario|mudar agendamento|adiar|antecipar)\b/i
  ],
  confirm: [
    /\b(confirmo|confirmar|pode confirmar|esta confirmado)\b/i,
    /(^|\s)(ok|ok\.|ok!|ok,|ok\s+confirmo|sim,?\s*confirmo)(\s|$)/i,
    /[👍✅]/
  ],
  modify_appointment: [
    /\b(alterar|mudar|editar)\s+(servico|profissional|preco|observacoes?)\b/i
  ],
  policies: [
    /\b(politicas?|politica|cancelamento|reembolso|no[-\s]?show|termos?|condicoes?)\b/i
  ],
  handoff: [
    /\b(atendente humano|falar com humano|pessoa de verdade|humano)\b/i
  ],
  wrong_number: [
    /\b(numero errado|mensagem errada|nao sou cliente|engano)\b/i
  ],
  test_message: [
    /\b(teste|apenas testando|mensagem de teste)\b/i
  ],
  booking_abandoned: [
    // geralmente derivado por timeout; aqui só pegamos declarações explícitas
    /\b(desisti|deixa pra la|nao quero mais)\b/i
  ],
  noshow_followup: [
    /\b(nao (compareci|fui)|faltei|perdi o horario)\b/i
  ]
};


export function detectIntents(text: string): IntentKey[] {
  const t = norm(text);
  const found: IntentKey[] = [];

  for (const key of PRIORITY) {
    const arr = PATTERNS[key];
    if (!arr) continue;
    for (const rx of arr) {
      if (rx.test(t)) {
        found.push(key);
        break; // evita duplicar a mesma intent
      }
    }
  }

  // Sem fallback: se nada casou, retorna []
  return found;
}

/** Intenção primária (para persistir em `intent_detected`); retorna null se nada casar */
export function detectPrimaryIntent(textRaw: string): IntentKey | null {
  const hits = detectIntents(textRaw);
  return hits.length ? (hits[0] as IntentKey) : null;
}

/** Interface para resultados de detecção de intent */
export interface IntentDetectionResult {
  intent: string | null;
  decision_method: 'command' | 'dictionary' | 'regex' | 'llm';
  allowed_by_flow_lock: boolean;
  confidence: number;
}

/** Service class wrapper para compatibilidade com código existente */
export class DeterministicIntentDetectorService {
  async detectIntent(
    messageText: string, 
    context: any, 
    options: any = {}
  ): Promise<IntentDetectionResult> {
    const intent = detectPrimaryIntent(messageText);
    
    // ✅ CORREÇÃO: Retornar null quando não detecta, sem fallback
    return {
      intent: intent, // null se nada foi detectado
      decision_method: intent ? 'regex' : 'llm',
      allowed_by_flow_lock: true, // Deterministic intents are always allowed
      confidence: intent ? 1.0 : 0.0, // 100% confidence if matched, 0% if unknown
    };
  }

  public detectIntents(textRaw: string): IntentKey[] {
    return detectIntents(textRaw);
  }
  
  public detectPrimaryIntent(textRaw: string): IntentKey | null {
    return detectPrimaryIntent(textRaw);
  }
  
  detect(text: string): string | null {
    const intents = detectIntents(text);
    return intents.length ? intents[0] as string : null;
  }
}