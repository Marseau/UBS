/**
 * Response Composer - Humanização de respostas sem perder controle do fluxo
 * Aplica tom consistente: emoji, warmth, brevity
 */

type Tone = { 
  emoji?: boolean; 
  warmth?: 'baixa' | 'média' | 'alta'; 
  brevity?: 'curta' | 'média' | 'detalhada' 
};

export function composeReply(text: string, opts?: Tone): string {
  const t = { emoji: true, warmth: 'média', brevity: 'curta', ...(opts || {}) };
  let out = text.trim();

  // Aquecimento rápido (só se não começar com saudação)
  if (t.warmth !== 'baixa' && !/^(olá|oi|hey|boa)/i.test(out)) {
    if (t.warmth === 'alta') {
      out = `Oi! ` + out;
    } else {
      out = `Olá! ` + out;
    }
  }

  // Enxugar para brevidade
  if (t.brevity === 'curta') {
    out = out.replace(/\s{2,}/g, ' ').replace(/(.{220,})[\s\S]*/, '$1...'); // corta exageros
  }

  // Emoji opcional no final
  if (t.emoji && !/(🙂|😊|✅|🤖|✨|📱|📧|👤)/.test(out)) {
    out += ' 🙂';
  }

  return out;
}

/**
 * Mensagens modelo prontas para usar
 */
export const REPLY_TEMPLATES = {
  // Identidade do bot
  identity: (botName: string, businessName: string) => 
    `${botName} aqui 🤖✨ — sou a assistente virtual da ${businessName}. Posso te ajudar com orçamentos e agendamentos.`,
  
  // Small talk essencial
  thanks: "De nada! Se precisar, estou por aqui",
  howAreYou: "Tudo certo e pronta pra te ajudar! E você, tudo bem?",
  hello: "Tudo bem por aí! Posso ajudar com um horário?",
  
  // Onboarding amigável
  needName: "Como posso te chamar? Me diga seu nome completo.",
  nameReceived: (name: string) => `Perfeito, ${name}! Agora me diga seu e-mail para finalizarmos.`,
  emailReceived: (name: string) => `Obrigada, ${name}! Seus dados foram salvos com sucesso. Agora posso ajudá-lo com agendamentos, informações sobre serviços e muito mais. Como posso ajudar?`,
  
  // Validação educada
  emailInvalid: "Acho que seu e-mail veio com um formato diferente. Me manda no estilo nome@exemplo.com?",
  nameInvalid: "Não consegui entender seu nome. Pode me dizer seu nome completo novamente?"
} as const;