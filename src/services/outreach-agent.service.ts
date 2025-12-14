/**
 * OUTREACH AGENT SERVICE
 *
 * Agente IA para gerenciamento inteligente de outreach via WhatsApp.
 * Este serviço:
 * 1. Carrega contexto do negócio da CAMPANHA (cluster_campaigns)
 * 2. Gera respostas personalizadas considerando histórico
 * 3. Classifica respostas para detectar interesse
 * 4. Gerencia handoff para humanos
 * 5. Controla rate limiting
 *
 * IMPORTANTE: O contexto é baseado em CAMPANHA (campaign_id), não projeto.
 * Cada campanha pode ter produtos, ofertas e tom de comunicação diferentes.
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Contexto do negócio extraído da campanha (cluster_campaigns)
 */
export interface CampaignBusinessContext {
  campaign_id: string;
  campaign_name: string;
  project_id: string;
  project_name: string;
  client_name: string;
  business_name: string;
  business_type: string;
  value_proposition: string;
  main_products_services: string[];
  differentials: string[];
  communication_tone: string;
  brand_personality: string;
  first_contact_script: string;
  follow_up_script: string;
  closing_phrases: string[];
  prohibited_phrases: string[];
  active_offers: any[];
  agent_name: string;
  max_ai_responses_before_handoff: number;
  interest_keywords: string[];
  rejection_keywords: string[];
  outreach_hourly_limit: number;
  outreach_daily_limit: number;
  outreach_enabled: boolean;
}

export interface ConversationContext {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_username: string;
  lead_bio: string;
  status: string;
  ai_messages_count: number;
  lead_messages_count: number;
  interest_score: number;
  interest_signals: string[];
  rejection_signals: string[];
  conversation_summary: string;
  last_topic: string;
  lead_questions: string[];
  lead_objections: string[];
  whatsapp_phone?: string;
  has_scheduled_meeting?: boolean;
  scheduled_meeting_at?: string;
}

export interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'ai' | 'human' | 'lead' | 'system';
  content: string;
  created_at: string;
  detected_intent?: string;
  detected_sentiment?: string;
}

export interface ClassificationResult {
  classification: 'interested' | 'not_interested' | 'neutral' | 'needs_info' | 'objection' | 'spam' | 'opt_out';
  confidence: number;
  interest_score: number;
  signals: string[];
  suggested_action: 'continue_ai' | 'handoff_now' | 'schedule_followup' | 'blacklist' | 'close_conversation';
  reasoning: string;
}

export interface GeneratedResponse {
  message_text: string;
  detected_intent: string;
  detected_sentiment: string;
  interest_indicators: string[];
  should_handoff: boolean;
  handoff_reason?: string;
  tokens_used: number;
}

export interface RateLimitStatus {
  can_send: boolean;
  reason: string;
  hourly_count: number;
  hourly_limit: number;
  hourly_remaining: number;
  daily_count: number;
  daily_limit: number;
  daily_remaining: number;
  is_business_hours: boolean;
  next_available_slot?: string;
}

// ============================================================================
// PROMPTS
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `Você é um especialista em análise de conversas de vendas.
Sua tarefa é classificar as respostas de leads para determinar seu nível de interesse.

CLASSIFICAÇÕES POSSÍVEIS:
- "interested": Lead demonstrou interesse claro (quer saber mais, perguntou preço, agendamento)
- "not_interested": Lead indicou que não tem interesse (não preciso, não quero, não é pra mim)
- "neutral": Resposta neutra que não indica interesse nem desinteresse
- "needs_info": Lead precisa de mais informações antes de decidir
- "objection": Lead levantou objeção específica (preço, tempo, dúvida)
- "spam": Resposta parece ser spam ou bot
- "opt_out": Lead pediu para parar de receber mensagens

AÇÕES SUGERIDAS:
- "continue_ai": IA pode continuar respondendo
- "handoff_now": Passar imediatamente para humano (lead muito interessado)
- "schedule_followup": Agendar follow-up para depois
- "blacklist": Adicionar à blacklist (opt-out ou spam)
- "close_conversation": Encerrar conversa (sem interesse claro)

Responda APENAS em JSON com a estrutura:
{
  "classification": "string",
  "confidence": 0-100,
  "interest_score": 0.0-1.0,
  "signals": ["sinal1", "sinal2"],
  "suggested_action": "string",
  "reasoning": "explicação curta"
}`;

const RESPONSE_SYSTEM_PROMPT = `Você é um assistente de vendas conversacional representando um negócio.
Sua função é manter uma conversa natural e identificar oportunidades de venda.

REGRAS:
1. Seja cordial e profissional
2. Responda às perguntas de forma direta
3. Não seja insistente ou agressivo
4. Identifique sinais de interesse
5. Se o lead demonstrar interesse forte, indique que um especialista entrará em contato
6. Respeite pedidos para parar o contato
7. Mantenha mensagens curtas (máximo 3-4 linhas)
8. Use o tom de comunicação especificado pelo cliente
9. NUNCA invente informações que não estejam no contexto
10. Se não souber responder, indique que um especialista pode ajudar

Responda APENAS em JSON:
{
  "message_text": "sua resposta aqui",
  "detected_intent": "intenção do lead",
  "detected_sentiment": "positive/neutral/negative",
  "interest_indicators": ["indicador1"],
  "should_handoff": true/false,
  "handoff_reason": "motivo se should_handoff=true"
}`;

// ============================================================================
// FUNÇÕES DE CONTEXTO
// ============================================================================

/**
 * Carrega o contexto do negócio da CAMPANHA (cluster_campaigns)
 * O contexto agora vem diretamente da campanha, não de uma tabela separada.
 */
export async function getCampaignBusinessContext(campaignId: string): Promise<CampaignBusinessContext | null> {
  // Usar a função SQL que já faz o JOIN com cluster_projects
  const { data, error } = await supabase.rpc('get_campaign_business_context', {
    p_campaign_id: campaignId
  });

  if (error || !data) {
    console.warn(`⚠️ [OUTREACH AGENT] Contexto de negócio não encontrado para campanha ${campaignId}`);
    return null;
  }

  return data as CampaignBusinessContext;
}

/**
 * Carrega ou cria conversa para um lead
 */
export async function getOrCreateConversation(
  campaignId: string,
  leadId: string,
  leadData: { username: string; full_name?: string; bio?: string; phone?: string }
): Promise<ConversationContext> {
  // Buscar conversa existente para esta campanha + lead
  const { data: existing } = await supabase
    .from('outreach_conversations')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('lead_id', leadId)
    .single();

  if (existing) {
    return {
      id: existing.id,
      lead_id: existing.lead_id,
      lead_name: leadData.full_name || leadData.username,
      lead_username: leadData.username,
      lead_bio: leadData.bio || '',
      status: existing.status,
      ai_messages_count: existing.ai_messages_count,
      lead_messages_count: existing.lead_messages_count,
      interest_score: parseFloat(existing.interest_score) || 0,
      interest_signals: existing.interest_signals || [],
      rejection_signals: existing.rejection_signals || [],
      conversation_summary: existing.conversation_summary || '',
      last_topic: existing.last_topic || '',
      lead_questions: existing.lead_questions || [],
      lead_objections: existing.lead_objections || []
    };
  }

  // Criar nova conversa
  const { data: newConv, error } = await supabase
    .from('outreach_conversations')
    .insert({
      campaign_id: campaignId,
      lead_id: leadId,
      whatsapp_phone: leadData.phone,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao criar conversa: ${error.message}`);
  }

  return {
    id: newConv.id,
    lead_id: leadId,
    lead_name: leadData.full_name || leadData.username,
    lead_username: leadData.username,
    lead_bio: leadData.bio || '',
    status: 'active',
    ai_messages_count: 0,
    lead_messages_count: 0,
    interest_score: 0,
    interest_signals: [],
    rejection_signals: [],
    conversation_summary: '',
    last_topic: '',
    lead_questions: [],
    lead_objections: []
  };
}

/**
 * Carrega histórico de mensagens de uma conversa
 */
export async function getConversationHistory(
  conversationId: string,
  limit: number = 20
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('outreach_conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar histórico:', error);
    return [];
  }

  return (data || []).map(msg => ({
    id: msg.id,
    direction: msg.direction,
    sender_type: msg.sender_type,
    content: msg.content,
    created_at: msg.created_at,
    detected_intent: msg.detected_intent,
    detected_sentiment: msg.detected_sentiment
  }));
}

/**
 * Carrega histórico de interações do lead (Instagram + WhatsApp)
 * da tabela account_actions para enriquecer contexto da IA
 */
export async function getLeadInteractionHistory(
  username: string,
  limit: number = 10
): Promise<{ action_type: string; source_platform: string; created_at: string; success: boolean }[]> {
  const { data, error } = await supabase
    .from('account_actions')
    .select('action_type, source_platform, created_at, success')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar histórico de interações:', error);
    return [];
  }

  return data || [];
}

/**
 * Formata histórico de interações para incluir no prompt da IA
 */
export function formatInteractionHistory(
  interactions: { action_type: string; source_platform: string; created_at: string; success: boolean }[]
): string {
  if (!interactions || interactions.length === 0) {
    return 'Nenhuma interação anterior registrada.';
  }

  const actionLabels: Record<string, string> = {
    'follow': 'Seguimos o lead',
    'unfollow': 'Deixamos de seguir',
    'like': 'Curtimos post do lead',
    'comment': 'Comentamos no post',
    'dm': 'Enviamos DM',
    'like_received': 'Lead curtiu nosso post/reel',
    'comment_received': 'Lead comentou em nosso post',
    'follow_received': 'Lead nos seguiu',
    'dm_received': 'Lead respondeu DM',
    'whatsapp_sent': 'Enviamos WhatsApp',
    'whatsapp_received': 'Lead respondeu WhatsApp'
  };

  return interactions.map(i => {
    const date = new Date(i.created_at);
    const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const label = actionLabels[i.action_type] || i.action_type;
    const platform = i.source_platform || 'instagram';
    const status = i.success ? '' : ' (falhou)';
    return `- ${formattedDate}: ${label} [${platform}]${status}`;
  }).join('\n');
}

/**
 * Salva mensagem na conversa
 */
export async function saveMessage(
  conversationId: string,
  direction: 'inbound' | 'outbound',
  senderType: 'ai' | 'human' | 'lead' | 'system',
  content: string,
  metadata?: {
    whatsapp_message_id?: string;
    detected_intent?: string;
    detected_sentiment?: string;
    interest_indicators?: string[];
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('outreach_conversation_messages')
    .insert({
      conversation_id: conversationId,
      direction,
      sender_type: senderType,
      content,
      whatsapp_message_id: metadata?.whatsapp_message_id,
      detected_intent: metadata?.detected_intent,
      detected_sentiment: metadata?.detected_sentiment,
      interest_indicators: metadata?.interest_indicators
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Erro ao salvar mensagem: ${error.message}`);
  }

  return data.id;
}

// ============================================================================
// FUNÇÕES DE CLASSIFICAÇÃO
// ============================================================================

/**
 * Classifica a resposta do lead para determinar interesse
 * Agora inclui histórico de interações da tabela account_actions
 */
export async function classifyResponse(
  leadMessage: string,
  conversationHistory: ConversationMessage[],
  businessContext: CampaignBusinessContext,
  leadUsername?: string
): Promise<ClassificationResult> {
  console.log(`\n🔍 [OUTREACH AGENT] Classificando resposta do lead`);

  const historyText = conversationHistory
    .slice(-10)
    .map(m => `[${m.sender_type.toUpperCase()}]: ${m.content}`)
    .join('\n');

  // Carregar histórico de interações do lead (Instagram + WhatsApp)
  let interactionHistoryText = '';
  if (leadUsername) {
    const interactions = await getLeadInteractionHistory(leadUsername);
    interactionHistoryText = formatInteractionHistory(interactions);
  }

  const userPrompt = `## CONTEXTO DO NEGÓCIO
Nome: ${businessContext.business_name}
Tipo: ${businessContext.business_type}
Proposta: ${businessContext.value_proposition}

## KEYWORDS DE INTERESSE
${businessContext.interest_keywords.join(', ')}

## KEYWORDS DE REJEIÇÃO
${businessContext.rejection_keywords.join(', ')}

## HISTÓRICO DE INTERAÇÕES COM O LEAD (Instagram + WhatsApp)
${interactionHistoryText}

## HISTÓRICO DA CONVERSA
${historyText || 'Nenhum histórico'}

## NOVA MENSAGEM DO LEAD
"${leadMessage}"

Classifique esta mensagem considerando também o histórico de interações.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da OpenAI');
    }

    const result = JSON.parse(content) as ClassificationResult;

    console.log(`✅ Classificação: ${result.classification} (${result.confidence}%)`);
    console.log(`   Interest Score: ${result.interest_score}`);
    console.log(`   Ação: ${result.suggested_action}`);

    return result;
  } catch (error: any) {
    console.error('❌ Erro na classificação:', error.message);
    return {
      classification: 'neutral',
      confidence: 50,
      interest_score: 0.5,
      signals: [],
      suggested_action: 'continue_ai',
      reasoning: 'Erro na classificação, mantendo como neutro'
    };
  }
}

// ============================================================================
// FUNÇÕES DE RESPOSTA
// ============================================================================

/**
 * Gera resposta automatizada para o lead
 * Agora inclui histórico de interações da tabela account_actions
 */
export async function generateResponse(
  leadMessage: string,
  conversationHistory: ConversationMessage[],
  businessContext: CampaignBusinessContext,
  classification: ClassificationResult,
  leadUsername?: string
): Promise<GeneratedResponse> {
  console.log(`\n💬 [OUTREACH AGENT] Gerando resposta`);

  const historyText = conversationHistory
    .slice(-10)
    .map(m => `[${m.sender_type.toUpperCase()}]: ${m.content}`)
    .join('\n');

  // Carregar histórico de interações do lead (Instagram + WhatsApp)
  let interactionHistoryText = '';
  if (leadUsername) {
    const interactions = await getLeadInteractionHistory(leadUsername);
    interactionHistoryText = formatInteractionHistory(interactions);
  }

  const userPrompt = `## CONTEXTO DO NEGÓCIO
Nome: ${businessContext.business_name}
Tipo: ${businessContext.business_type}
Campanha: ${businessContext.campaign_name}
Proposta de Valor: ${businessContext.value_proposition}
Produtos/Serviços: ${businessContext.main_products_services?.join(', ') || 'N/A'}
Diferenciais: ${businessContext.differentials?.join(', ') || 'N/A'}
Tom de Comunicação: ${businessContext.communication_tone}
Nome do Agente: ${businessContext.agent_name}

## OFERTAS ATIVAS
${JSON.stringify(businessContext.active_offers || [], null, 2)}

## FRASES PROIBIDAS (NÃO USE)
${businessContext.prohibited_phrases?.join(', ') || 'Nenhuma'}

## HISTÓRICO DE INTERAÇÕES COM O LEAD (Instagram + WhatsApp)
${interactionHistoryText}
Use estas informações para personalizar sua resposta. Por exemplo:
- Se o lead curtiu nosso post recentemente, você pode mencionar isso
- Se já enviamos mensagem antes, não repita a mesma abordagem

## HISTÓRICO DA CONVERSA
${historyText || 'Primeiro contato'}

## MENSAGEM DO LEAD
"${leadMessage}"

## CLASSIFICAÇÃO DA MENSAGEM
- Tipo: ${classification.classification}
- Score de Interesse: ${classification.interest_score}
- Sinais: ${classification.signals.join(', ')}

## TAREFA
Gere uma resposta apropriada considerando:
1. O tom de comunicação ${businessContext.communication_tone}
2. O interesse detectado (${classification.classification})
3. O histórico de interações (se houver algo relevante para mencionar)
4. Se interesse for alto (score > 0.7), indique que um especialista entrará em contato
5. Se for opt-out, confirme a remoção educadamente
6. Mantenha a resposta curta e objetiva`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESPONSE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da OpenAI');
    }

    const result = JSON.parse(content);
    const tokensUsed = response.usage?.total_tokens || 0;

    console.log(`✅ Resposta gerada (${tokensUsed} tokens)`);
    console.log(`   Preview: "${result.message_text?.substring(0, 60)}..."`);

    return {
      message_text: result.message_text,
      detected_intent: result.detected_intent || classification.classification,
      detected_sentiment: result.detected_sentiment || 'neutral',
      interest_indicators: result.interest_indicators || classification.signals,
      should_handoff: result.should_handoff || classification.suggested_action === 'handoff_now',
      handoff_reason: result.handoff_reason,
      tokens_used: tokensUsed
    };
  } catch (error: any) {
    console.error('❌ Erro ao gerar resposta:', error.message);
    throw error;
  }
}

// ============================================================================
// FUNÇÕES DE RATE LIMITING
// ============================================================================

/**
 * Verifica se pode enviar mensagem (rate limit + horário comercial)
 */
export async function checkRateLimit(
  campaignId: string,
  hourlyLimit: number = 15,
  dailyLimit: number = 120  // 15/hora × 8 horas = 120/dia
): Promise<RateLimitStatus> {
  // Verificar horário comercial
  const { data: businessHoursResult } = await supabase.rpc('is_business_hours');
  const isBusinessHours = businessHoursResult || false;

  // Verificar rate limit usando a nova função com campaign_id
  const { data: rateLimitResult } = await supabase.rpc('can_send_outreach_message', {
    p_campaign_id: campaignId,
    p_hourly_limit: hourlyLimit,
    p_daily_limit: dailyLimit
  });

  const canSend = rateLimitResult?.can_send || false;
  let reason = 'ok';

  if (!rateLimitResult?.is_business_hours) {
    reason = 'outside_business_hours';
  } else if (!canSend) {
    reason = rateLimitResult?.hourly_remaining === 0 ? 'hourly_limit_reached' : 'daily_limit_reached';
  }

  return {
    can_send: canSend,
    reason,
    hourly_count: rateLimitResult?.hourly_count || 0,
    hourly_limit: hourlyLimit,
    hourly_remaining: rateLimitResult?.hourly_remaining || hourlyLimit,
    daily_count: rateLimitResult?.daily_count || 0,
    daily_limit: dailyLimit,
    daily_remaining: rateLimitResult?.daily_remaining || dailyLimit,
    is_business_hours: rateLimitResult?.is_business_hours || false,
    next_available_slot: !canSend ? calculateNextSlot({ reason }, rateLimitResult) : undefined
  };
}

/**
 * Incrementa contador de rate limit
 */
export async function incrementRateLimit(campaignId: string): Promise<void> {
  await supabase.rpc('increment_outreach_rate', {
    p_campaign_id: campaignId
  });
}

function calculateNextSlot(businessHours: any, rateLimit: any): string {
  const now = new Date();

  // Se for fim de semana, próximo slot é segunda
  if (businessHours?.reason === 'weekend') {
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + daysUntilMonday);
    monday.setHours(8, 0, 0, 0);
    return monday.toISOString();
  }

  // Se for fora do horário, próximo slot é próximo horário comercial
  if (businessHours?.reason === 'outside_business_hours') {
    const nextSlot = new Date(now);
    const hour = now.getHours();

    if (hour < 8) {
      nextSlot.setHours(8, 0, 0, 0);
    } else if (hour >= 12 && hour < 14) {
      nextSlot.setHours(14, 0, 0, 0);
    } else {
      // Próximo dia útil às 8h
      nextSlot.setDate(nextSlot.getDate() + 1);
      nextSlot.setHours(8, 0, 0, 0);
    }

    return nextSlot.toISOString();
  }

  // Se for rate limit horário, próximo slot é próxima hora
  if (rateLimit?.reason === 'hourly_limit_reached') {
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return nextHour.toISOString();
  }

  // Se for rate limit diário, próximo slot é amanhã
  if (rateLimit?.reason === 'daily_limit_reached') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    return tomorrow.toISOString();
  }

  return now.toISOString();
}

// ============================================================================
// FUNÇÕES DE HANDOFF
// ============================================================================

/**
 * Executa handoff para humano
 * AGORA COM: Envio WhatsApp ao cliente + Tracking para billing
 */
export async function executeHandoff(
  conversationId: string,
  reason: string,
  notes?: string
): Promise<{ success: boolean; handoff_id?: string }> {
  console.log(`\n🔄 [OUTREACH AGENT] Executando handoff`);
  console.log(`   Conversa: ${conversationId}`);
  console.log(`   Motivo: ${reason}`);

  try {
    // 1. Buscar dados da conversa (incluindo dados de reunião agendada)
    const { data: conversation, error: convError } = await supabase
      .from('outreach_conversations')
      .select(`
        campaign_id,
        lead_id,
        interest_score,
        interest_signals,
        conversation_summary,
        last_topic,
        has_scheduled_meeting,
        scheduled_meeting_at,
        meet_link,
        meeting_status
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('❌ Conversa não encontrada:', convError);
      return { success: false };
    }

    // 2. Buscar dados da campanha (incluindo client_whatsapp_number)
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, client_whatsapp_number, client_contact_name')
      .eq('id', conversation.campaign_id)
      .single();

    if (campaignError || !campaign) {
      console.error('❌ Campanha não encontrada:', campaignError);
      return { success: false };
    }

    if (!campaign.client_whatsapp_number) {
      console.error('❌ Número de WhatsApp do cliente não configurado na campanha');
      return { success: false };
    }

    // 3. Buscar dados do lead
    const { data: lead, error: leadError } = await supabase
      .from('instagram_leads')
      .select('username, full_name, bio, email, phone, followers_count, profile_pic_url')
      .eq('id', conversation.lead_id)
      .single();

    if (leadError || !lead) {
      console.error('❌ Lead não encontrado:', leadError);
      return { success: false };
    }

    // 4. Buscar histórico da conversa para extrair perguntas/objeções
    const { data: messages } = await supabase
      .from('outreach_conversation_messages')
      .select('content, sender_type, detected_intent')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const leadQuestions = messages
      ?.filter(m => m.sender_type === 'lead')
      .map(m => m.content)
      .slice(-5) || []; // Últimas 5 mensagens do lead

    const leadObjections = messages
      ?.filter(m => m.detected_intent?.includes('objection') || m.detected_intent?.includes('concern'))
      .map(m => m.content) || [];

    // 5. Criar registro de handoff para billing
    const { data: handoff, error: handoffError } = await supabase
      .from('lead_handoffs')
      .insert({
        campaign_id: conversation.campaign_id,
        conversation_id: conversationId,
        lead_id: conversation.lead_id,

        // Dados do lead
        lead_username: lead.username,
        lead_full_name: lead.full_name,
        lead_bio: lead.bio,
        lead_email: lead.email,
        lead_phone: lead.phone,
        lead_followers_count: lead.followers_count,

        // Dados do cliente (destino)
        client_contact_name: campaign.client_contact_name || 'Cliente',
        client_whatsapp_number: campaign.client_whatsapp_number,

        // Contexto da transferência
        handoff_reason: reason,
        interest_score: conversation.interest_score,
        interest_signals: conversation.interest_signals || [],
        conversation_summary: conversation.conversation_summary || notes || '',
        lead_questions: leadQuestions,
        lead_objections: leadObjections,

        // Status inicial
        handoff_status: 'pending',

        // Billing (configurável por campanha - aqui usando valor padrão)
        billable: true,
        billing_amount_cents: 1500, // R$ 15,00 por lead quente (configurável)
        billing_status: 'pending'
      })
      .select()
      .single();

    if (handoffError) {
      console.error('❌ Erro ao criar registro de handoff:', handoffError);
      return { success: false };
    }

    console.log(`✅ Registro de handoff criado: ${handoff.id}`);

    // 6. Enviar mensagem WhatsApp para o cliente
    const { getWhapiClient } = await import('./whapi-client.service');
    const whapiClient = getWhapiClient();

    // Formatar data/hora da reunião (se houver)
    let meetingSection = '';
    if ((conversation as any).has_scheduled_meeting && (conversation as any).scheduled_meeting_at) {
      const meetingDate = new Date((conversation as any).scheduled_meeting_at);
      const formatted = meetingDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      meetingSection = `
⏰ *REUNIÃO JÁ AGENDADA:*
📅 *Data/Hora:* ${formatted}
⏱️ *Duração:* 15 minutos
${(conversation as any).meet_link ? `🔗 *Link:* ${(conversation as any).meet_link}` : ''}

✅ *O LEAD JÁ CONFIRMOU PRESENÇA!*
Você só precisa comparecer no horário marcado.

`;
    }

    const notificationMessage = `🔥 *NOVO LEAD QUENTE - ${campaign.campaign_name}*

👤 *Lead:* ${lead.full_name || lead.username}
📸 *Instagram:* @${lead.username}
${lead.followers_count ? `👥 *Seguidores:* ${lead.followers_count.toLocaleString('pt-BR')}` : ''}
${lead.phone ? `📞 *WhatsApp/Telefone:* ${lead.phone}` : ''}
${lead.email ? `📧 *Email:* ${lead.email}` : ''}

${meetingSection}${lead.bio ? `📝 *Bio do Lead:*\n${lead.bio.substring(0, 150)}${lead.bio.length > 150 ? '...' : ''}\n\n` : ''}🎯 *Score de Interesse:* ${(conversation.interest_score * 100).toFixed(0)}%

💬 *Sinais de Interesse:*
${conversation.interest_signals?.slice(0, 3).map(s => `  • ${s}`).join('\n') || '  • Lead muito interessado'}

${leadQuestions.length > 0 ? `❓ *Últimas perguntas do lead:*\n${leadQuestions.slice(-3).map(q => `  • "${q.substring(0, 70)}${q.length > 70 ? '...' : ''}"`).join('\n')}\n\n` : ''}🔗 *Link do perfil:* https://instagram.com/${lead.username}

⚡ *AÇÃO NECESSÁRIA:*
${(conversation as any).has_scheduled_meeting
  ? 'Compareça na reunião marcada. O lead já confirmou presença!'
  : 'Entre em contato o mais rápido possível para agendar reunião e fechar a venda!'}

_Lead transferido em ${new Date().toLocaleString('pt-BR')}_`;

    try {
      const sendResult = await whapiClient.sendText({
        to: campaign.client_whatsapp_number,
        body: notificationMessage,
        previewUrl: false
      });

      // 7. Atualizar status da notificação
      await supabase
        .from('lead_handoffs')
        .update({
          notification_sent_at: new Date().toISOString(),
          notification_message_id: sendResult.message_id,
          notification_status: sendResult.sent ? 'sent' : 'failed',
          notification_error: sendResult.error,
          handoff_status: sendResult.sent ? 'sent' : 'pending'
        })
        .eq('id', handoff.id);

      if (sendResult.sent) {
        console.log(`✅ Notificação enviada para ${campaign.client_whatsapp_number}`);
      } else {
        console.error(`❌ Falha ao enviar notificação: ${sendResult.error}`);
      }
    } catch (notifError: any) {
      console.error('❌ Erro ao enviar notificação WhatsApp:', notifError.message);

      // Registrar erro mas não falhar o handoff
      await supabase
        .from('lead_handoffs')
        .update({
          notification_status: 'failed',
          notification_error: notifError.message
        })
        .eq('id', handoff.id);
    }

    // 8. Atualizar status da conversa
    await supabase
      .from('outreach_conversations')
      .update({
        status: 'handoff_completed',
        handoff_reason: reason,
        handoff_at: new Date().toISOString(),
        handoff_notes: notes
      })
      .eq('id', conversationId);

    // 9. Adicionar mensagem de sistema
    await saveMessage(
      conversationId,
      'outbound',
      'system',
      `[HANDOFF] Lead transferido para ${campaign.client_contact_name || 'cliente'}. Motivo: ${reason}`
    );

    console.log(`✅ Handoff executado com sucesso - Lead ID: ${handoff.id}`);

    return { success: true, handoff_id: handoff.id };
  } catch (error: any) {
    console.error('❌ Erro no handoff:', error.message);
    return { success: false };
  }
}

/**
 * Verifica se deve fazer handoff baseado nas regras
 */
export async function shouldHandoff(
  conversation: ConversationContext,
  classification: ClassificationResult,
  businessContext: CampaignBusinessContext
): Promise<{ should_handoff: boolean; reason: string }> {
  // Regra 1: Ação sugerida é handoff_now
  if (classification.suggested_action === 'handoff_now') {
    return { should_handoff: true, reason: 'Lead muito interessado' };
  }

  // Regra 2: Score de interesse alto
  if (classification.interest_score >= 0.8) {
    return { should_handoff: true, reason: `Score de interesse alto: ${classification.interest_score}` };
  }

  // Regra 3: Máximo de respostas IA atingido
  if (conversation.ai_messages_count >= businessContext.max_ai_responses_before_handoff) {
    return {
      should_handoff: true,
      reason: `Limite de ${businessContext.max_ai_responses_before_handoff} mensagens IA atingido`
    };
  }

  // Regra 4: Lead fez pergunta específica sobre preço/agendamento
  const urgentKeywords = ['preço', 'quanto custa', 'agendar', 'marcar horário', 'disponibilidade'];
  const messageHasUrgentKeyword = urgentKeywords.some(kw =>
    classification.signals.some(s => s.toLowerCase().includes(kw))
  );

  if (messageHasUrgentKeyword && classification.interest_score >= 0.6) {
    return { should_handoff: true, reason: 'Lead perguntou sobre preço/agendamento' };
  }

  return { should_handoff: false, reason: '' };
}

// ============================================================================
// FUNÇÕES DE BLACKLIST
// ============================================================================

/**
 * Verifica se lead está na blacklist
 */
export async function isBlacklisted(
  campaignId: string,
  phone?: string,
  username?: string
): Promise<boolean> {
  const { data } = await supabase.rpc('is_blacklisted', {
    p_campaign_id: campaignId,
    p_phone: phone,
    p_instagram_username: username
  });

  return data || false;
}

/**
 * Adiciona lead à blacklist
 */
export async function addToBlacklist(
  campaignId: string,
  reason: string,
  phone?: string,
  username?: string,
  leadId?: string,
  details?: string
): Promise<void> {
  await supabase.rpc('add_to_blacklist', {
    p_campaign_id: campaignId,
    p_lead_id: leadId,
    p_phone: phone,
    p_instagram_username: username,
    p_reason: reason,
    p_reason_details: details,
    p_blocked_by: 'ai'
  });

  console.log(`🚫 [OUTREACH AGENT] Lead adicionado à blacklist: ${reason}`);
}

// ============================================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM DO LEAD
// ============================================================================

export interface ProcessMessageResult {
  success: boolean;
  action: 'responded' | 'handoff' | 'blacklisted' | 'error' | 'scheduling_offered' | 'scheduling_confirmed' | 'scheduling_error';
  response_message?: string;
  classification?: ClassificationResult;
  conversation_id?: string;
  should_send_response: boolean;
  error_message?: string;
}

/**
 * Processa mensagem recebida do lead e gera resposta apropriada
 * IMPORTANTE: Agora recebe campaignId como parâmetro principal
 */
export async function processLeadMessage(
  campaignId: string,
  leadId: string,
  leadData: { username: string; full_name?: string; bio?: string; phone?: string },
  incomingMessage: string
): Promise<ProcessMessageResult> {
  console.log(`\n📨 [OUTREACH AGENT] Processando mensagem do lead`);
  console.log(`   Campanha: ${campaignId}`);
  console.log(`   Lead: @${leadData.username}`);
  console.log(`   Mensagem: "${incomingMessage.substring(0, 50)}..."`);

  try {
    // 1. Verificar blacklist
    const blacklisted = await isBlacklisted(campaignId, leadData.phone, leadData.username);
    if (blacklisted) {
      console.log('⛔ Lead está na blacklist, ignorando');
      return {
        success: true,
        action: 'blacklisted',
        should_send_response: false
      };
    }

    // 2. Carregar contexto do negócio DA CAMPANHA
    const businessContext = await getCampaignBusinessContext(campaignId);
    if (!businessContext) {
      return {
        success: false,
        action: 'error',
        should_send_response: false,
        error_message: 'Contexto de negócio não configurado para esta campanha'
      };
    }

    // 3. Carregar/criar conversa
    const conversation = await getOrCreateConversation(campaignId, leadId, leadData);

    // 4. Carregar histórico
    const history = await getConversationHistory(conversation.id);

    // 5. Salvar mensagem do lead
    await saveMessage(conversation.id, 'inbound', 'lead', incomingMessage);

    // 6. Classificar resposta (inclui histórico de interações do account_actions)
    const classification = await classifyResponse(incomingMessage, history, businessContext, leadData.username);

    // 7. Verificar opt-out
    if (classification.classification === 'opt_out') {
      await addToBlacklist(
        campaignId,
        'user_requested',
        leadData.phone,
        leadData.username,
        leadId,
        'Lead pediu para parar de receber mensagens'
      );

      // Enviar confirmação de remoção
      const optOutMessage = 'Entendido! Você não receberá mais mensagens nossas. Se mudar de ideia, pode nos chamar a qualquer momento. Até mais! 👋';

      await saveMessage(conversation.id, 'outbound', 'ai', optOutMessage, {
        detected_intent: 'opt_out_confirmation'
      });

      return {
        success: true,
        action: 'blacklisted',
        response_message: optOutMessage,
        classification,
        conversation_id: conversation.id,
        should_send_response: true
      };
    }

    // 8. Verificar se deve fazer handoff
    const handoffCheck = await shouldHandoff(conversation, classification, businessContext);
    if (handoffCheck.should_handoff) {
      await executeHandoff(conversation.id, handoffCheck.reason);

      return {
        success: true,
        action: 'handoff',
        classification,
        conversation_id: conversation.id,
        should_send_response: false
      };
    }

    // 8.5. AGENDAMENTO: Processar escolha de slot OU oferecer agendamento
    // Se lead já recebeu oferta de slots, processar escolha
    if (conversation.last_topic === 'scheduling_offered') {
      console.log('📅 [SCHEDULING] Lead respondeu à oferta de agendamento');

      const slotChoice = parseSlotChoice(incomingMessage);

      if (slotChoice !== null) {
        console.log(`📅 [SCHEDULING] Lead escolheu slot ${slotChoice + 1}`);

        // Confirmar agendamento
        const confirmResult = await confirmScheduling(
          campaignId,
          conversation.id,
          {
            id: leadId,
            username: leadData.username,
            full_name: leadData.full_name || leadData.username,
            phone: leadData.phone || conversation.whatsapp_phone,
            email: undefined // Email não disponível por WhatsApp
          },
          slotChoice,
          businessContext
        );

        if (confirmResult.success) {
          // Salvar mensagem de confirmação
          await saveMessage(conversation.id, 'outbound', 'ai', confirmResult.message!, {
            detected_intent: 'scheduling_confirmed'
          });

          // Atualizar conversa
          await supabase
            .from('outreach_conversations')
            .update({
              last_topic: 'scheduling_confirmed',
              interest_score: Math.min(classification.interest_score + 0.1, 1.0) // Boost no score
            })
            .eq('id', conversation.id);

          return {
            success: true,
            action: 'scheduling_confirmed',
            response_message: confirmResult.message!,
            classification,
            conversation_id: conversation.id,
            should_send_response: true
          };
        } else {
          console.error('❌ [SCHEDULING] Erro ao confirmar agendamento:', confirmResult.error);

          const errorMessage = 'Desculpe, tive um problema ao confirmar o agendamento. Pode tentar novamente ou me dizer outro horário que prefere?';

          await saveMessage(conversation.id, 'outbound', 'ai', errorMessage, {
            detected_intent: 'scheduling_error'
          });

          return {
            success: true,
            action: 'scheduling_error',
            response_message: errorMessage,
            classification,
            conversation_id: conversation.id,
            should_send_response: true
          };
        }
      } else {
        console.log('📅 [SCHEDULING] Lead não escolheu slot válido, continuando conversa normal');
        // Continua para gerar resposta normal
      }
    }

    // Se ainda não ofereceu agendamento, verificar se deve oferecer
    const schedulingCheck = await shouldOfferScheduling(conversation, classification);
    if (schedulingCheck.should_offer) {
      console.log(`📅 [SCHEDULING] Oferecendo agendamento: ${schedulingCheck.reason}`);

      const offerResult = await offerSchedulingSlots(campaignId, conversation.id);

      if (offerResult.success && offerResult.message) {
        // Salvar mensagem com slots
        await saveMessage(conversation.id, 'outbound', 'ai', offerResult.message, {
          detected_intent: 'scheduling_offered'
        });

        return {
          success: true,
          action: 'scheduling_offered',
          response_message: offerResult.message,
          classification,
          conversation_id: conversation.id,
          should_send_response: true
        };
      } else {
        console.warn('⚠️ [SCHEDULING] Erro ao oferecer slots, continuando conversa normal');
        // Continua para gerar resposta normal
      }
    }

    // 9. Gerar resposta (inclui histórico de interações do account_actions)
    const response = await generateResponse(incomingMessage, history, businessContext, classification, leadData.username);

    // 10. Salvar resposta
    await saveMessage(conversation.id, 'outbound', 'ai', response.message_text, {
      detected_intent: response.detected_intent,
      detected_sentiment: response.detected_sentiment,
      interest_indicators: response.interest_indicators
    });

    // 11. Atualizar conversa com análise
    await supabase
      .from('outreach_conversations')
      .update({
        interest_score: classification.interest_score,
        interest_signals: [...(conversation.interest_signals || []), ...classification.signals],
        last_topic: response.detected_intent
      })
      .eq('id', conversation.id);

    // 12. Verificar handoff após resposta
    if (response.should_handoff) {
      await executeHandoff(conversation.id, response.handoff_reason || 'IA detectou necessidade de handoff');

      return {
        success: true,
        action: 'handoff',
        response_message: response.message_text,
        classification,
        conversation_id: conversation.id,
        should_send_response: true
      };
    }

    return {
      success: true,
      action: 'responded',
      response_message: response.message_text,
      classification,
      conversation_id: conversation.id,
      should_send_response: true
    };

  } catch (error: any) {
    console.error('❌ [OUTREACH AGENT] Erro ao processar mensagem:', error.message);
    return {
      success: false,
      action: 'error',
      should_send_response: false,
      error_message: error.message
    };
  }
}

// ============================================================================
// FUNÇÕES DE AGENDAMENTO (NOVO)
// ============================================================================

import { createCalendarService, TimeSlot } from './google-calendar.service';

/**
 * Verifica se deve oferecer agendamento ao lead
 * Oferece quando interesse é alto mas ainda não tem reunião
 */
export async function shouldOfferScheduling(
  conversation: ConversationContext,
  classification: ClassificationResult
): Promise<{ should_offer: boolean; reason: string }> {

  // Já tem reunião agendada? Não oferece de novo
  if (conversation.status === 'scheduled' || (conversation as any).has_scheduled_meeting) {
    return { should_offer: false, reason: 'Reunião já agendada' };
  }

  // Score de interesse alto (≥ 0.6) mas não tão alto para handoff imediato
  if (classification.interest_score >= 0.6 && classification.interest_score < 0.8) {
    return {
      should_offer: true,
      reason: `Interest score ${classification.interest_score} - ideal para agendamento`
    };
  }

  // Lead perguntou sobre preço, agendamento ou horários
  const schedulingKeywords = [
    'preço', 'quanto custa', 'valor', 'horário', 'horarios',
    'agendar', 'marcar', 'consulta', 'atendimento', 'conversar',
    'disponibilidade', 'quando', 'dia', 'hora'
  ];

  const hasSchedulingIntent = classification.signals.some(signal =>
    schedulingKeywords.some(keyword => signal.toLowerCase().includes(keyword))
  );

  if (hasSchedulingIntent && classification.interest_score >= 0.5) {
    return {
      should_offer: true,
      reason: 'Lead demonstrou interesse em agendar ou conhecer mais'
    };
  }

  return { should_offer: false, reason: '' };
}

/**
 * Oferece slots de agendamento ao lead
 */
export async function offerSchedulingSlots(
  campaignId: string,
  conversationId: string
): Promise<{ success: boolean; slots?: TimeSlot[]; message?: string; error?: string }> {
  try {
    console.log(`\n📅 [SCHEDULING] Oferecendo agendamento para conversa ${conversationId}`);

    // Criar serviço de calendar
    const calendarService = await createCalendarService(campaignId);

    // Buscar slots disponíveis (próximos 7 dias)
    const availableSlots = await calendarService.getAvailableSlots(7);

    if (availableSlots.length === 0) {
      return {
        success: false,
        error: 'Nenhum horário disponível encontrado'
      };
    }

    // Pegar os 3 primeiros slots
    const topSlots = availableSlots.slice(0, 3);

    // Formatar mensagem para o lead
    const message = `Ótimo! Que tal agendarmos uma consultoria rápida de 15 minutos para eu te explicar melhor tudo o que você precisa saber? 😊

Tenho os seguintes horários disponíveis:

${topSlots.map((slot, i) => `${i + 1}. ${slot.formatted}`).join('\n')}

Qual funciona melhor para você? É só responder com o número (1, 2 ou 3)! 📲`;

    // Salvar slots oferecidos na conversa (para processar escolha depois)
    await supabase
      .from('outreach_conversations')
      .update({
        last_topic: 'scheduling_offered',
        conversation_summary: JSON.stringify({
          offered_slots: topSlots,
          offered_at: new Date().toISOString()
        })
      })
      .eq('id', conversationId);

    console.log(`✅ [SCHEDULING] ${topSlots.length} slots oferecidos`);

    return {
      success: true,
      slots: topSlots,
      message
    };
  } catch (error: any) {
    console.error('❌ [SCHEDULING] Erro ao oferecer slots:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Processa escolha de slot do lead (ex: "1", "2", "3" ou "primeiro", "segunda")
 */
export function parseSlotChoice(message: string): number | null {
  const normalized = message.toLowerCase().trim();

  // Números diretos
  if (normalized === '1' || normalized.includes('primeiro') || normalized.includes('primeira')) {
    return 0;
  }
  if (normalized === '2' || normalized.includes('segundo') || normalized.includes('segunda')) {
    return 1;
  }
  if (normalized === '3' || normalized.includes('terceiro') || normalized.includes('terceira')) {
    return 2;
  }

  return null;
}

/**
 * Confirma agendamento escolhido pelo lead
 */
export async function confirmScheduling(
  campaignId: string,
  conversationId: string,
  leadData: {
    id: string;
    username: string;
    full_name?: string;
    phone?: string;
    email?: string;
  },
  slotIndex: number,
  businessContext: CampaignBusinessContext
): Promise<{ success: boolean; meetLink?: string; message?: string; error?: string }> {
  try {
    console.log(`\n✅ [SCHEDULING] Confirmando agendamento - slot ${slotIndex}`);

    // Buscar slots oferecidos anteriormente
    const { data: conversation } = await supabase
      .from('outreach_conversations')
      .select('conversation_summary, interest_score, interest_signals')
      .eq('id', conversationId)
      .single();

    if (!conversation?.conversation_summary) {
      return {
        success: false,
        error: 'Slots não encontrados. Por favor, solicite novos horários.'
      };
    }

    const summary = typeof conversation.conversation_summary === 'string'
      ? JSON.parse(conversation.conversation_summary)
      : conversation.conversation_summary;

    const offeredSlots = summary.offered_slots as TimeSlot[];

    if (!offeredSlots || slotIndex >= offeredSlots.length) {
      return {
        success: false,
        error: 'Slot inválido'
      };
    }

    const selectedSlot = offeredSlots[slotIndex];

    if (!selectedSlot) {
      return {
        success: false,
        error: 'Slot não encontrado'
      };
    }

    // Reconstruir objeto TimeSlot com Date objects
    const slot: TimeSlot = {
      start: new Date(selectedSlot.start),
      end: new Date(selectedSlot.end),
      formatted: selectedSlot.formatted
    };

    // Buscar perguntas do lead para contexto
    const { data: messages } = await supabase
      .from('outreach_conversation_messages')
      .select('content')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'lead')
      .order('created_at', { ascending: false })
      .limit(5);

    const leadQuestions = messages?.map(m => m.content) || [];

    // Criar serviço de calendar e agendar
    const calendarService = await createCalendarService(campaignId);
    const scheduleResult = await calendarService.scheduleAppointment(
      {
        name: leadData.full_name || leadData.username,
        phone: leadData.phone || '',
        email: leadData.email,
        username: leadData.username
      },
      slot,
      {
        campaignName: businessContext.campaign_name,
        interestScore: conversation.interest_score || 0,
        questions: leadQuestions,
        signals: conversation.interest_signals || []
      }
    );

    if (!scheduleResult.success) {
      return {
        success: false,
        error: scheduleResult.error || 'Erro ao criar evento no calendário'
      };
    }

    // Atualizar conversa com dados da reunião
    await supabase
      .from('outreach_conversations')
      .update({
        has_scheduled_meeting: true,
        scheduled_meeting_at: slot.start.toISOString(),
        meeting_duration_minutes: 15,
        google_event_id: scheduleResult.eventId,
        meet_link: scheduleResult.meetLink,
        meeting_status: 'confirmed',
        meeting_confirmed_by_lead: true,
        meeting_notes: `Agendado via IA. Perguntas: ${leadQuestions.slice(0, 3).join('; ')}`
      })
      .eq('id', conversationId);

    // Mensagem de confirmação para o lead
    const confirmationMessage = `Perfeito! ✅

Sua consultoria está confirmada:
📅 ${slot.formatted}
⏱️ Duração: 15 minutos

${scheduleResult.meetLink ? `🔗 Link da reunião: ${scheduleResult.meetLink}\n\n` : ''}Vou te enviar lembretes:
🔔 1 dia antes
🔔 1 hora antes

Prepare suas dúvidas! Estou ansioso para nossa conversa! 😊`;

    console.log(`✅ [SCHEDULING] Reunião confirmada para ${slot.formatted}`);

    return {
      success: true,
      meetLink: scheduleResult.meetLink,
      message: confirmationMessage
    };
  } catch (error: any) {
    console.error('❌ [SCHEDULING] Erro ao confirmar agendamento:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const outreachAgentService = {
  // Contexto (agora baseado em campanha)
  getCampaignBusinessContext,
  getOrCreateConversation,
  getConversationHistory,
  getLeadInteractionHistory,
  formatInteractionHistory,
  saveMessage,

  // Classificação e Resposta
  classifyResponse,
  generateResponse,
  processLeadMessage,

  // Rate Limiting
  checkRateLimit,
  incrementRateLimit,

  // Handoff
  executeHandoff,
  shouldHandoff,

  // Blacklist
  isBlacklisted,
  addToBlacklist,

  // Agendamento (NOVO)
  shouldOfferScheduling,
  offerSchedulingSlots,
  parseSlotChoice,
  confirmScheduling
};
