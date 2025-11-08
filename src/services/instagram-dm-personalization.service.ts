/**
 * Instagram DM Personalization Service
 *
 * Gera mensagens DM personalizadas com GPT-4o para outreach de leads
 * Tom amistoso, contexto do negócio, call-to-action sutil
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface LeadProfile {
  username: string;
  full_name?: string;
  business_category?: string;
  segment?: string;
  bio?: string;
  has_phone: boolean;
  has_email: boolean;
}

interface PersonalizedDM {
  message: string;
  prompt_used: string;
  model: string;
  tokens_used: number;
}

/**
 * Gera mensagem DM personalizada usando GPT-4o
 *
 * Estratégia:
 * - Tom amistoso e não vendedor
 * - Chama pelo nome
 * - Referencia o negócio/segmento
 * - Convida para ver perfil (conteúdo sobre agendamento/gestão)
 * - Sem mencionar produto/venda direta
 *
 * @param lead Perfil do lead
 * @returns Mensagem personalizada + metadados
 */
export async function generatePersonalizedDM(lead: LeadProfile): Promise<PersonalizedDM> {
  const firstName = extractFirstName(lead.full_name || lead.username);
  const businessContext = buildBusinessContext(lead);

  const systemPrompt = `Você é um especialista em comunicação digital para Instagram.

Sua missão: Criar mensagens DM amistosas e personalizadas para profissionais de diferentes áreas.

REGRAS OBRIGATÓRIAS:
1. Tom amistoso, como se fosse um colega da área
2. SEMPRE chamar pelo primeiro nome
3. Fazer referência sutil ao negócio/área de atuação
4. Convidar para ver o perfil onde compartilha "reflexões" sobre gestão/posicionamento
5. NÃO mencionar venda, produto ou SaaS diretamente
6. NÃO usar palavras como: "ferramenta", "sistema", "plataforma", "solução"
7. Máximo de 280 caracteres (2-3 linhas curtas)
8. Usar 1 emoji sutil (máximo)
9. Tom natural, como se escrevesse manualmente

EXEMPLOS DE BOM TOM:
- "Oi Ana! Vi que você também trabalha com consultoria de imagem. Tenho compartilhado umas reflexões parecidas sobre posicionamento e estilo lá no meu perfil — acho que você vai se identificar 🙂"
- "E aí, Carlos! Notei que você atua com fisioterapia. Curto trocar ideias sobre gestão de agenda e captação de pacientes — tenho postado uns insights no perfil que podem te interessar 💪"
- "Oi Marina! Vi seu perfil de nutrição. Tenho refletido muito sobre organização de atendimentos e crescimento profissional — passa lá no perfil, acho que vai curtir! 🌟"

EVITAR:
- Textos longos ou formais
- Múltiplos emojis
- Promessas ou benefícios diretos
- Linguagem de vendas`;

  const userPrompt = `Crie uma mensagem DM personalizada para:

Nome: ${firstName}
Negócio/Área: ${businessContext}
Username: @${lead.username}

A mensagem deve ser amistosa, fazer referência ao negócio dela, e convidar para ver reflexões sobre gestão/agendamento no seu perfil.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9, // Mais criativo
      max_tokens: 150,
      presence_penalty: 0.6, // Evita repetições
      frequency_penalty: 0.6
    });

    const message = completion.choices[0]?.message?.content?.trim() || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Validação: garantir que não ultrapassou 280 caracteres
    const finalMessage = message.length > 280 ? message.substring(0, 277) + '...' : message;

    return {
      message: finalMessage,
      prompt_used: userPrompt,
      model: 'gpt-4o',
      tokens_used: tokensUsed
    };

  } catch (error) {
    console.error('❌ Erro ao gerar DM personalizado:', error);

    // Fallback: mensagem genérica se GPT-4 falhar
    return {
      message: `Oi ${firstName}! Vi seu perfil e achei interessante. Tenho compartilhado umas reflexões sobre gestão e posicionamento profissional lá no meu perfil — acho que você vai curtir! 🙂`,
      prompt_used: userPrompt,
      model: 'fallback',
      tokens_used: 0
    };
  }
}

/**
 * Extrai primeiro nome de um nome completo
 * Ex: "Ana Paula Silva" -> "Ana"
 */
function extractFirstName(fullNameOrUsername: string): string {
  if (!fullNameOrUsername) return 'amigo(a)';

  const cleaned = fullNameOrUsername
    .replace(/[^\w\sÀ-ÿ]/g, '') // Remove caracteres especiais
    .trim();

  const parts = cleaned.split(/\s+/);
  const firstName = parts[0] || 'amigo(a)';

  // Capitalizar primeira letra
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

/**
 * Constrói contexto do negócio baseado em categoria e segmento
 */
function buildBusinessContext(lead: LeadProfile): string {
  const category = lead.business_category || '';
  const segment = lead.segment || '';

  // Prioriza business_category, depois segment
  if (category && category !== 'null') {
    return category;
  }

  if (segment && segment !== 'null') {
    return segment;
  }

  // Fallback genérico
  return 'empreendedorismo';
}

/**
 * Valida se mensagem está dentro dos padrões
 */
export function validateDMMessage(message: string): { valid: boolean; reason?: string } {
  if (message.length > 280) {
    return { valid: false, reason: 'Mensagem muito longa (>280 caracteres)' };
  }

  if (message.length < 50) {
    return { valid: false, reason: 'Mensagem muito curta (<50 caracteres)' };
  }

  // Verificar palavras proibidas (tom de vendas)
  const forbiddenWords = ['comprar', 'vender', 'sistema', 'plataforma', 'ferramenta', 'solução', 'produto'];
  const lowerMessage = message.toLowerCase();

  for (const word of forbiddenWords) {
    if (lowerMessage.includes(word)) {
      return { valid: false, reason: `Palavra proibida detectada: "${word}"` };
    }
  }

  return { valid: true };
}
