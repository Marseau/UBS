// src/services/deterministic-intent-detector.service.ts
// Sistema de detecção de intents - Camada 1: Regex determinístico

// ===== IMPORTANDO TIPOS UNIFICADOS =====
import { UserIntent, isValidIntent } from '../types/intent.types';

// ===== TIPOS PADRONIZADOS =====
export type IntentKey = UserIntent; // Using unified system
export type DecisionMethod = 'regex' | 'llm';

export interface IntentDetectionResult {
  intent: IntentKey | null;           // null quando regex não bater
  confidence: number;                 // 0.0 a 1.0
  decision_method: DecisionMethod;    // 'regex' aqui
}

// ✅ INTENT_KEYS - alinhado com BusinessIntent enum (fonte da verdade)
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
  'wrong_number',
  'booking_abandoned',
  'appointment_inquiry'
] as const;

// Ordem de prioridade para resolver sobreposições (primeiro vence)
const PRIORITY: IntentKey[] = [
  'greeting',
  'appointment_inquiry',
  'confirm',
  'cancel',
  'reschedule',
  'my_appointments',
  'availability',
  'pricing', 
  'services',
  'business_hours',
  'address',
  'payments',
  'modify_appointment',
  'policies',
  'booking_abandoned',
  'wrong_number'
];

// Normalizador simples: minúsculas e sem acentos
function norm(input: string): string {
  return (input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// /** Padrões por intenção (PT-BR) */
// const PATTERNS: Record<IntentKey, RegExp[]> = {
//   greeting: [
//     /^(oi|ola|bom dia|boa tarde|boa noite|eai|tudo bem)/i,
//     /(oi|ola)[!.,\s]/i
//   ],
//   services: [
//     /\b(servicos?|lista de servicos?|catalogo|quais (sao )?os servicos?)\b/i
//   ],
//   pricing: [
//     /\b(precos?|preco|valores?|quanto custa|tabela de preco|orcamento)\b/i
//   ],
//   availability: [
//     /\b(horarios?|agenda|disponivel|tem horario|quando (pode|tem)|amanha|hoje tem horario)\b/i
//   ],
//   my_appointments: [
//     /\b(meus? agendamentos?|minha agenda|minhas? consultas?|ver agendamento|consultar agendamento)\b/i
//   ],
//   address: [
//     /\b(endereco|localizacao|onde fica|como chegar|mapa)\b/i
//   ],
//   payments: [
//     /\b(pagamentos?|pagar|pix|cartao|dinheiro|formas? de pagamento|aceitam (pix|cartao|dinheiro))\b/i
//   ],
//   business_hours: [
//     /\b(horario de funcionamento|funcionam que horas|abrem|fecham|atendem de que horario?)\b/i
//   ],
//   cancel: [
//     /\b(cancelar|cancele|quero cancelar|desmarcar|remover agendamento)\b/i
//   ],
//   reschedule: [
//     /\b(reagendar|remarcar|trocar horario|mudar agendamento|adiar|antecipar)\b/i
//   ],
//   confirm: [
//     /\b(confirmo|confirmar|pode confirmar|esta confirmado)\b/i,
//     /(^|\s)(ok|ok\.|ok!|ok,|ok\s+confirmo|sim,?\s*confirmo)(\s|$)/i,
//     /[👍✅]/
//   ],
//   modify_appointment: [
//     /\b(alterar|mudar|editar)\s+(servico|profissional|preco|observacoes?)\b/i
//   ],
//   policies: [
//     /\b(politicas?|politica|cancelamento|reembolso|no[-\s]?show|termos?|condicoes?)\b/i
//   ],
//   handoff: [
//     /\b(atendente humano|falar com humano|pessoa de verdade|humano)\b/i
//   ],
//   wrong_number: [
//     /\b(numero errado|mensagem errada|nao sou cliente|engano)\b/i
//   ],
//   test_message: [
//     /\b(teste|apenas testando|mensagem de teste)\b/i
//   ],
//   booking_abandoned: [
//     // geralmente derivado por timeout; aqui só pegamos declarações explícitas
//     /\b(desisti|deixa pra la|nao quero mais)\b/i
//   ],
//   noshow_followup: [
//     /\b(nao (compareci|fui)|faltei|perdi o horario)\b/i
//   ]
// };

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
  confirma: ['confirmo','confirmado','ok','sim','ciente','de acordo','fechado','blz','beleza'] as const,
  mod: ['alterar agendamento','mudar agendamento','trocar servico','trocar profissional','alterar servico','alterar data','alterar hora'] as const,
  addr: ['endereco','onde fica','localizacao','como chegar','maps','google maps','local'] as const,
  pay: ['pagamento','formas de pagamento','pix','cartao','credito','debito','dinheiro','transferencia'] as const,
  hours: ['horario de funcionamento','horarios de funcionamento','horario de atendimento','abre','fecha','funciona','funcionamento'] as const,
  pol: ['politica','politicas','no show','noshow','cancelamento','remarcacao','regras','termos'] as const,
  wrong: ['nao sou cliente','mensagem por engano','numero errado','contato errado','mensagem errada'] as const,
  abad: ['deixa pra la','nao quero mais','depois eu vejo','fica pra outra','agora nao','desisti','deixa'] as const,
  noshow: ['nao compareci','no show','fiquei sem ir','faltei','nao pude ir'] as const,
  // --- VOCABULÁRIO ADICIONAL (NOVO) ---
  defer: ['entendi, vou verificar','vou conversar em casa','vou discutir','vou pensar','depois eu vejo','deixa eu ver','retorno depois'] as const,
  thanks: ['obrigad','pela flexibilidade','pela paciencia','valeu','agradecid'] as const,
  procedures: ['vou enviar','vou mandar','que documentos','quais documentos','quanto tempo demora'] as const,
  requirements: ['preciso de','e necessario','experiencia previa','pre-requisito','prerequisito','requisitos'] as const,
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
    /(qual (o )?valor (do|da)|quanto (sai|fica))/i,
    /preco (do|da) (corte|unha|barba|massagem|limpeza|depilacao)/i,
  ],

  availability: [
    any(W.disp),
    /\b(hoje|amanha|depois de amanha|semana que vem|mes que vem)\b/i,
    /\b(na|pela|de) (manha|tarde|noite)\b/i,
    /(quando voces? atendem|quando tem|qual (o )?melhor horario)/i,
    /(\bagenda\b).*(amanh[ãa]|hoje|semana|mes)/i,
    /tem (horario|vaga) (amanh[ãa]|hoje|na (manha|tarde|noite))/i,
  ],

  my_appointments: [
    any(W.meusAg),
    has(['tenho .* agendamento','marquei .* quando','qual meu horario']),
  ],

  address: [any(W.addr)],
  
  payments: [any(W.pay)],
  
  business_hours: [
    any(W.hours),
    /(que horas (abre|fecha)|horario de atendimento)/i,
    /funcionam (ate|das .* as)/i,
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
  
  policies: [any(W.pol)],
  
  wrong_number: [any(W.wrong)],
  
  booking_abandoned: [any(W.abad)],
  
  appointment_inquiry: [any(W.disp)] // Booking patterns
};

// ===== FUNÇÃO PRINCIPAL DE DETECÇÃO (NOVA API) =====
export function detectIntentByRegex(text: string): IntentDetectionResult {
  const t = (text || '').toLowerCase().trim();

  // atalhos numéricos do menu
  if (/^\s*1\s*$/.test(t)) return { intent: 'availability', confidence: 0.95, decision_method: 'regex' };
  if (/^\s*2\s*$/.test(t)) return { intent: 'my_appointments', confidence: 0.95, decision_method: 'regex' };
  if (/^\s*3\s*$/.test(t)) return { intent: 'cancel', confidence: 0.95, decision_method: 'regex' };
  if (/^\s*4\s*$/.test(t)) return { intent: 'reschedule', confidence: 0.95, decision_method: 'regex' };
  if (/^\s*5\s*$/.test(t)) return { intent: null, confidence: 0.0, decision_method: 'regex' };

  // greeting: incluir agradecimentos/elogios
  if (/(oi|ol[áa]|bom dia|boa tarde|boa noite)\b/i.test(t) || any(W.thanks).test(t) || /[👍✅]/.test(t)) {
    return { intent: 'greeting', confidence: 0.9, decision_method: 'regex' };
  }

  // services: requisitos e procedimentos frequentes
  if (/\bservi[cç]os?\b/i.test(t) || any(W.requirements).test(t) || any(W.procedures).test(t)) {
    return { intent: 'services', confidence: t.endsWith('?') ? 0.9 : 0.85, decision_method: 'regex' };
  }

  const map: Record<IntentKey, RegExp> = {
    ['greeting']: /(oi|ol[áa]|bom dia|boa tarde|boa noite)\b/i,
    ['services']: /\b(servi[cç]os?)\b/i,
    ['pricing']: /\b(pre[çc]o|valor|quanto\s+(custa|sai|fica))\b/i,
    ['availability']: /\b(disponibilidade|quando posso|hor[áa]rio|datas|agenda|tem.*vaga|amanh[ãa]|hoje|depois de amanh[ãa]|semana que vem)\b/i,
    ['my_appointments']: /\b(meus? agendamentos|tenho.*agendamento|o que marquei|ver agendamentos)\b/i,
    ['address']: /\b(endere[cç]o|onde fica|localiza[çc][ãa]o|como chegar|maps|google\s*maps|local)\b/i,
    ['payments']: /\b(pagamento|formas de pagamento|pix|cartao|credito|debito|dinheiro)\b/i,
    ['business_hours']: /\b(hor[áa]rio(s)? de (funcion|atend)|abre|fecha|funciona)\b/i,
    ['cancel']: /\b(cancelar|desmarcar)\b/i,
    ['reschedule']: /\b(remarcar|trocar hor[áa]rio|mudar hor[áa]rio)\b/i,
    ['confirm']: /\b(confirm(o|ado)?|ciente|de acordo|ok|sim)\b|[👍✅]/i,
    ['modify_appointment']: /\b(alterar|mudar|editar)\s+(servico|profissional|preco|observacoes?)\b/i,
    ['policies']: /\b(politicas?|politica|cancelamento|reembolso|no[-\s]?show|termos?|condicoes?)\b/i,
    ['wrong_number']: /\b(numero errado|mensagem errada|nao sou cliente|engano)\b/i,
    ['booking_abandoned']: /\b(desisti|deixa pra la|nao quero mais)\b/i,
    ['appointment_inquiry']: /\b(agendar|marcar|reserva|quero.*agendamento)\b/i
  };

  for (const [intent, re] of Object.entries(map)) {
    if (re.test(t)) {
      // pontuação simples: frases curtas e diretas recebem >0.9
      const confidence = t.length < 40 ? 0.92 : 0.85;
      return { intent: intent as IntentKey, confidence, decision_method: 'regex' };
    }
  }
  return { intent: null, confidence: 0.0, decision_method: 'regex' };
}

/** Retorna TODAS as intents que casam, ordenadas por prioridade (mais importante primeiro) */
export function detectIntents(text: string): IntentKey[] {
  const t = norm(text);
  const found: IntentKey[] = [];

  for (const key of PRIORITY) {
    const arr = RULES[key];
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
  return hits[0] ?? null;
}

// --- Adapter para compatibilidade com o orchestrator ---
// O orchestrator importa { DeterministicIntentDetectorService } e instancia a classe.
// Mantemos a API como métodos de instância que delegam para as funções acima.
// --- Adapter para o orchestrator ---
export class DeterministicIntentDetectorService {
  public detectIntents(textRaw: string): IntentKey[] {
    return detectIntents(textRaw);
  }
  public detectPrimaryIntent(textRaw: string): IntentKey | null {
    return detectPrimaryIntent(textRaw);
  }
  public detect(text: string): string | null {
    const intents = detectIntents(text);
    return intents.length ? intents[0] as string : null;
  }
}