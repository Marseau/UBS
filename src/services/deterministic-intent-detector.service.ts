// src/services/deterministic-intent-detector.service.ts
// 100% determinístico (sem LLM). Se nada casar, retorna null (para persistir NULL).

/** Conjunto fechado de intents permitidas no sistema */
export type IntentKey =
  | 'greeting'
  | 'services'
  | 'pricing'
  | 'availability'
  | 'my_appointments'
  | 'cancel'
  | 'reschedule'
  | 'confirm'
  | 'modify_appointment'
  | 'address'
  | 'payments'
  | 'business_hours'
  | 'policies'
  | 'handoff'
  | 'wrong_number'
  | 'test_message'
  | 'booking_abandoned'
  | 'noshow_followup';

/** Normaliza: minúsculo + sem acento (evita falhas de regex) */
export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Utilitários para montar regex com segurança */
const any = (xs: readonly string[]) => new RegExp(`\\b(?:${xs.join('|')})\\b`, 'i');
const has = (xs: readonly string[]) => new RegExp(`(?:${xs.join('|')})`, 'i');

/** Padrões úteis (ids e datas simples) */
const RX_UUID = /\b[0-9a-f]{8,}(?:-[0-9a-f]{4}){0,3}\b/i;
const RX_DATETIME_BR = /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s+\d{1,2}:\d{2})\b/i;

/** Léxico base (sem acento, então escreva sem acento mesmo) */
const W = {
  oi: ['oi','ola','opa','bom dia','boa tarde','boa noite','eae','fala'] as const,
  serv: ['servico','servicos','procedimento','procedimentos','catalogo','menu','lista de servicos'] as const,
  preco: ['preco','precos','valor','valores','quanto custa','quanto sai','quanto fica','tabela de preco'] as const,
  disp: ['disponibilidade','agenda','agendar','marcar','quando posso','tem horario','tem vaga','datas','horario','horarios','agendamento'] as const,
  meusAg: ['meu agendamento','meus agendamentos','o que marquei','ver agendamento','ver agendamentos'] as const,
  cancel: ['cancelar','cancela','desmarcar','anular'] as const,
  remarcar: ['remarcar','remarca','trocar horario','mudar horario','trocar data','mudar data','adiar','reagendar','reagenda'] as const,
  confirma: ['confirmo','confirmado','ok','ciente','de acordo','fechado','blz','beleza'] as const,
  mod: ['alterar agendamento','mudar agendamento','trocar servico','trocar profissional','alterar servico','alterar data','alterar hora'] as const,
  addr: ['endereco','onde fica','localizacao','como chegar','maps','google maps','local'] as const,
  pay: ['pagamento','formas de pagamento','pix','cartao','credito','debito','dinheiro','transferencia'] as const,
  hours: ['horario de funcionamento','horarios de funcionamento','horario de atendimento','abre','fecha','funciona','funcionamento'] as const,
  pol: ['politica','politicas','no show','noshow','cancelamento','remarcacao','regras','termos'] as const,
  hand: ['atendente','humano','falar com pessoa','pessoa','suporte humano','atendimento humano'] as const,
  wrong: ['nao sou cliente','mensagem por engano','numero errado','contato errado','mensagem errada'] as const,
  test: ['teste','ping','health check','healthcheck'] as const,
  abad: ['deixa pra la','nao quero mais','depois eu vejo','fica pra outra','agora nao','desisti','deixa'] as const,
  noshow: ['nao compareci','no show','fiquei sem ir','faltei','nao pude ir'] as const,
} as const;

/** Regras determinísticas (em texto já normalizado) */
const RULES: Record<IntentKey, RegExp[]> = {
  greeting: [any(W.oi)],

  services: [
    any(W.serv),
    has(['fazer as unhas','corte','cabelo','barba','sobrancelha','massagem','limpeza de pele','depilacao','progressiva','mecha','escova']),
  ],

  pricing: [
    any(W.preco),
    has(['preco do','valor do','quanto .* (custa|sai|fica)']),
  ],

  availability: [
    any(W.disp),
    /\b(hoje|amanha|depois de amanha|semana que vem|mes que vem|manha|tarde|noite)\b/i,
  ],

  my_appointments: [
    any(W.meusAg),
    has(['tenho .* agendamento','marquei .* quando','qual meu horario']),
  ],

  cancel: [
    new RegExp(`\\b(?:${W.cancel.join('|')})\\b.*${RX_UUID.source}`, 'i'), // comando completo com ID
    any(W.cancel), // intenção genérica (sem ID) → ainda é cancel intent
  ],

  reschedule: [
    new RegExp(`\\b(?:${W.remarcar.join('|')})\\b.*${RX_UUID.source}.*\\b(?:para|em|->)\\b.*${RX_DATETIME_BR.source}`, 'i'),
    any(W.remarcar),
  ],

  confirm: [
    any(W.confirma),
    /[👍✅]/,
  ],

  modify_appointment: [any(W.mod)],
  address: [any(W.addr)],
  payments: [any(W.pay)],
  business_hours: [any(W.hours)],
  policies: [any(W.pol)],
  handoff: [any(W.hand)],
  wrong_number: [any(W.wrong)],
  test_message: [any(W.test)],
  booking_abandoned: [any(W.abad)],
  noshow_followup: [any(W.noshow)],
};

/** Prioridade (decide a intent primária quando houver múltiplos matches) */
const PRIORITY: readonly IntentKey[] = [
  'cancel','reschedule','confirm','modify_appointment','my_appointments',
  'availability','pricing','services',
  'address','payments','business_hours','policies',
  'handoff','wrong_number','test_message','booking_abandoned','noshow_followup','greeting',
] as const;

/** Retorna TODAS as intents que casam, ordenadas por prioridade (mais importante primeiro) */
export function detectIntents(textRaw: string): IntentKey[] {
  const t = normalize(textRaw);
  const hits: IntentKey[] = [];
  (Object.keys(RULES) as IntentKey[]).forEach((k) => {
    const regs = RULES[k];
    if (regs.some((re) => re.test(t))) hits.push(k);
  });
  return hits.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
}

/** Intenção primária (para persistir em `intent_detected`); retorna null se nada casar */
export function detectPrimaryIntent(textRaw: string): IntentKey | null {
  const hits = detectIntents(textRaw);
  return hits.length ? (hits[0] as IntentKey) : null;
}

/** Interface para resultados de detecção de intent */
export interface IntentDetectionResult {
  intent: string;
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
    
    // Normalizações para satisfazer os tipos do IntentDetectionResult
    const safeIntent: string = intent ?? 'unknown';
    const safeDecisionMethod: 'command' | 'dictionary' | 'regex' | 'llm' = intent ? 'regex' : 'llm';
    
    return {
      intent: safeIntent,
      decision_method: safeDecisionMethod,
      allowed_by_flow_lock: true, // Deterministic intents are always allowed
      confidence: intent ? 1.0 : 0.0, // 100% confidence if matched, 0% if unknown
    };
  }
}