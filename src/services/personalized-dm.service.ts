/**
 * PERSONALIZED DM SERVICE
 *
 * Gera mensagens DM/WhatsApp ultra-personalizadas usando IA.
 * Analisa o perfil do lead + contexto da campanha para criar
 * mensagens únicas e relevantes.
 *
 * Fluxo:
 * 1. Recebe dados do lead + campanha
 * 2. Busca template relevante (opcional)
 * 3. Monta prompt com contexto completo
 * 4. GPT-4 gera mensagem personalizada
 * 5. Valida e retorna mensagem
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

export interface LeadProfile {
  id: string;
  username: string;
  full_name?: string;
  bio?: string;
  business_category?: string;
  segment?: string;
  hashtags_bio?: string[];
  hashtags_posts?: string[];
  follower_count?: number;
  following_count?: number;
  post_count?: number;
  has_phone: boolean;
  has_email: boolean;
  external_url?: string;
  recent_posts?: string[];  // Descrições dos posts recentes
}

export interface CampaignContext {
  id: string;
  campaign_name: string;
  nicho_principal: string;
  nicho_secundario?: string;
  keywords: string[];
  service_description: string;
  target_audience: string;
  client_name: string;
  project_name: string;
  preferred_channel: 'auto' | 'instagram_dm' | 'whatsapp';
}

export interface DMGenerationInput {
  lead: LeadProfile;
  campaign: CampaignContext;
  channel: 'instagram_dm' | 'whatsapp';
  template_id?: string;        // Template base opcional
  custom_instructions?: string; // Instruções adicionais
  max_length?: number;          // Limite de caracteres
  tone?: 'formal' | 'casual' | 'friendly' | 'professional';
}

export interface GeneratedDM {
  message_text: string;
  message_generated_by: string;
  generation_prompt: string;
  personalization_data: {
    lead_name: string;
    lead_specialty: string;
    campaign_benefit: string;
    hook_used: string;
    tone: string;
  };
  tokens_used: number;
  estimated_cost: number;
  confidence_score: number;  // 0-100 - quão confiante a IA está na mensagem
}

// ============================================================================
// PROMPTS
// ============================================================================

const SYSTEM_PROMPT = `Você é um especialista em copywriting para mensagens diretas (DM) no Instagram e WhatsApp.
Sua missão é criar mensagens ULTRA-PERSONALIZADAS que:

1. **Conectam genuinamente** - Mostram que você realmente olhou o perfil da pessoa
2. **São relevantes** - Falam algo específico sobre o trabalho/negócio do lead
3. **São breves** - Máximo 3-4 frases para primeira mensagem
4. **Não parecem spam** - Evite linguagem genérica de vendas
5. **Têm um hook** - Algo que desperte curiosidade sem ser clickbait
6. **Terminam com pergunta** - Convite suave para continuar conversa

REGRAS IMPORTANTES:
- NUNCA mencione preços ou ofertas na primeira mensagem
- NUNCA use "Olá! Tudo bem?" genérico - seja específico
- NUNCA copie templates literalmente - personalize SEMPRE
- Use o nome da pessoa se disponível
- Mencione algo ESPECÍFICO do perfil (hashtag, bio, trabalho)
- Para Instagram: pode usar 1-2 emojis estratégicos
- Para WhatsApp: seja ligeiramente mais formal
- Adapte o tom conforme o segmento (saúde = mais profissional, beleza = mais descontraído)

FORMATO DE RESPOSTA:
Retorne APENAS um JSON válido com a estrutura:
{
  "message": "texto da mensagem aqui",
  "hook_used": "descrição do gancho usado",
  "personalization_points": ["ponto 1", "ponto 2"],
  "confidence": 85
}`;

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function extractSpecialty(lead: LeadProfile): string {
  // Tenta extrair especialidade da bio ou categoria
  if (lead.business_category) {
    return lead.business_category;
  }

  if (lead.bio) {
    // Padrões comuns em bios profissionais
    const patterns = [
      /especialista em ([^|•\n]+)/i,
      /profissional de ([^|•\n]+)/i,
      /(@\w+\s+)?([^|•\n]+(?:ista|logo|terapeuta|coach))/i,
      /📍?\s*([^|•\n]+)/,  // Localização ou especialidade após emoji
    ];

    for (const pattern of patterns) {
      const match = lead.bio.match(pattern);
      if (match) {
        return match[1]?.trim() || match[2]?.trim() || '';
      }
    }

    // Retorna primeira linha da bio como fallback
    const firstLine = lead.bio.split(/[|\n•]/)[0];
    return firstLine ? firstLine.trim().substring(0, 50) : lead.segment || 'sua área';
  }

  return lead.segment || 'sua área';
}

function buildLeadContext(lead: LeadProfile): string {
  const parts: string[] = [];

  parts.push(`**Username:** @${lead.username}`);

  if (lead.full_name) {
    parts.push(`**Nome:** ${lead.full_name}`);
  }

  if (lead.bio) {
    parts.push(`**Bio:** "${lead.bio}"`);
  }

  if (lead.business_category) {
    parts.push(`**Categoria:** ${lead.business_category}`);
  }

  if (lead.segment) {
    parts.push(`**Segmento:** ${lead.segment}`);
  }

  if (lead.hashtags_bio && lead.hashtags_bio.length > 0) {
    parts.push(`**Hashtags na Bio:** ${lead.hashtags_bio.slice(0, 10).join(', ')}`);
  }

  if (lead.hashtags_posts && lead.hashtags_posts.length > 0) {
    parts.push(`**Hashtags em Posts:** ${lead.hashtags_posts.slice(0, 10).join(', ')}`);
  }

  if (lead.follower_count) {
    parts.push(`**Seguidores:** ${lead.follower_count.toLocaleString()}`);
  }

  if (lead.external_url) {
    parts.push(`**Website:** ${lead.external_url}`);
  }

  parts.push(`**Tem telefone:** ${lead.has_phone ? 'Sim' : 'Não'}`);
  parts.push(`**Tem email:** ${lead.has_email ? 'Sim' : 'Não'}`);

  return parts.join('\n');
}

function buildCampaignContext(campaign: CampaignContext): string {
  return `**Nome da Campanha:** ${campaign.campaign_name}
**Cliente:** ${campaign.client_name}
**Projeto:** ${campaign.project_name}
**Nicho Principal:** ${campaign.nicho_principal}
**Nicho Secundário:** ${campaign.nicho_secundario || 'N/A'}
**Keywords:** ${campaign.keywords.join(', ')}
**Serviço/Produto:** ${campaign.service_description}
**Público-Alvo:** ${campaign.target_audience}`;
}

async function getTemplate(templateId?: string, industry?: string, channel?: string): Promise<string | null> {
  if (templateId) {
    const { data } = await supabase
      .from('outreach_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (data) {
      return `TEMPLATE BASE (use como inspiração, NÃO copie literalmente):
"${data.template_text}"

INSTRUÇÕES DO TEMPLATE: ${data.ai_instructions || 'Personalize conforme o perfil do lead.'}`;
    }
  }

  // Buscar template por indústria se não tiver ID específico
  if (industry) {
    const { data } = await supabase
      .from('outreach_templates')
      .select('*')
      .eq('industry', industry)
      .eq('category', 'introduction')
      .eq('active', true)
      .or(`channel.eq.${channel},channel.eq.both`)
      .limit(1)
      .single();

    if (data) {
      return `TEMPLATE SUGERIDO (use como inspiração):
"${data.template_text}"

TOM SUGERIDO: ${data.tone}`;
    }
  }

  return null;
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

export async function generatePersonalizedDM(input: DMGenerationInput): Promise<GeneratedDM> {
  const { lead, campaign, channel, template_id, custom_instructions, max_length = 500, tone = 'professional' } = input;

  console.log(`\n🎯 [DM GENERATOR] Gerando mensagem personalizada`);
  console.log(`   Lead: @${lead.username}`);
  console.log(`   Campanha: ${campaign.campaign_name}`);
  console.log(`   Canal: ${channel}`);

  // Buscar template se aplicável
  const templateContext = await getTemplate(template_id, lead.segment, channel);

  // Extrair especialidade do lead
  const specialty = extractSpecialty(lead);

  // Montar prompt completo
  const userPrompt = `Gere uma mensagem de primeiro contato para o seguinte lead:

## PERFIL DO LEAD
${buildLeadContext(lead)}

## CONTEXTO DA CAMPANHA
${buildCampaignContext(campaign)}

## CONFIGURAÇÕES
- **Canal:** ${channel === 'instagram_dm' ? 'Instagram DM' : 'WhatsApp'}
- **Tom desejado:** ${tone}
- **Limite de caracteres:** ${max_length}
- **Especialidade detectada:** ${specialty}

${templateContext ? `\n## TEMPLATE BASE\n${templateContext}` : ''}

${custom_instructions ? `\n## INSTRUÇÕES ADICIONAIS\n${custom_instructions}` : ''}

## TAREFA
Crie uma mensagem ÚNICA e PERSONALIZADA que:
1. Mencione algo específico do perfil de @${lead.username}
2. Conecte com o serviço/produto: ${campaign.service_description.substring(0, 100)}
3. Use tom ${tone}
4. Seja adequada para ${channel === 'instagram_dm' ? 'Instagram DM' : 'WhatsApp'}
5. Termine com uma pergunta suave

Retorne APENAS o JSON no formato especificado.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,  // Criatividade moderada
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da OpenAI');
    }

    const parsed = JSON.parse(content);

    // Validar tamanho
    let finalMessage = parsed.message || '';
    if (finalMessage.length > max_length) {
      console.warn(`⚠️ Mensagem excede limite (${finalMessage.length}/${max_length}), truncando...`);
      finalMessage = finalMessage.substring(0, max_length - 3) + '...';
    }

    // Calcular custo estimado
    const tokensUsed = response.usage?.total_tokens || 0;
    const costPer1kTokens = process.env.OPENAI_MODEL?.includes('gpt-4o-mini') ? 0.00015 : 0.005;
    const estimatedCost = (tokensUsed / 1000) * costPer1kTokens;

    const result: GeneratedDM = {
      message_text: finalMessage,
      message_generated_by: response.model,
      generation_prompt: userPrompt.substring(0, 2000),  // Limitar para storage
      personalization_data: {
        lead_name: lead.full_name || lead.username,
        lead_specialty: specialty,
        campaign_benefit: campaign.service_description.substring(0, 100),
        hook_used: parsed.hook_used || 'Não especificado',
        tone: tone
      },
      tokens_used: tokensUsed,
      estimated_cost: estimatedCost,
      confidence_score: parsed.confidence || 75
    };

    console.log(`✅ [DM GENERATOR] Mensagem gerada com sucesso`);
    console.log(`   Tokens: ${tokensUsed} | Custo: $${estimatedCost.toFixed(4)}`);
    console.log(`   Confiança: ${result.confidence_score}%`);
    console.log(`   Preview: "${finalMessage.substring(0, 80)}..."`);

    return result;

  } catch (error: any) {
    console.error('❌ [DM GENERATOR] Erro ao gerar mensagem:', error.message);
    throw error;
  }
}

// ============================================================================
// FUNÇÕES DE FILA
// ============================================================================

export interface OutreachQueueItem {
  id: string;
  campaign_id: string;
  lead_id: string;
  channel: 'instagram_dm' | 'whatsapp';
  lead_username: string;
  lead_full_name: string;
  lead_phone: string;
  lead_email: string;
  lead_bio: string;
  lead_business_category: string;
  lead_segment: string;
  lead_hashtags_bio: string[];
  lead_hashtags_posts: string[];
  priority_score: number;
  fit_score: number;
  campaign_name: string;
  nicho_principal: string;
  nicho_secundario: string;
  campaign_keywords: string[];
  service_description: string;
  target_audience: string;
  client_name: string;
  project_name: string;
}

/**
 * Busca próximo item da fila de outreach
 * Marca como 'processing' para evitar duplicidade
 */
export async function getNextOutreachItem(
  channel?: 'instagram_dm' | 'whatsapp',
  campaignId?: string
): Promise<OutreachQueueItem | null> {
  let query = supabase
    .from('v_pending_outreach')
    .select('*')
    .order('priority_score', { ascending: false })
    .limit(1);

  if (channel) {
    query = query.eq('channel', channel);
  }

  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    console.log('📭 [OUTREACH] Nenhum item pendente na fila');
    return null;
  }

  // Tentar fazer claim (marcar como processing)
  const { data: claimed } = await supabase.rpc('claim_outreach_item', {
    p_queue_id: data.id
  });

  if (!claimed) {
    console.log('⚠️ [OUTREACH] Item já foi processado por outro worker');
    return null;
  }

  console.log(`📬 [OUTREACH] Item claimed: @${data.lead_username} via ${data.channel}`);

  return data as OutreachQueueItem;
}

/**
 * Atualiza status do item após envio
 */
export async function updateOutreachStatus(
  queueId: string,
  status: 'sent' | 'failed' | 'blocked',
  messageText?: string,
  errorMessage?: string
): Promise<void> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'sent') {
    updateData.sent_at = new Date().toISOString();
    updateData.message_text = messageText;
  } else if (status === 'failed') {
    updateData.error_message = errorMessage;
    updateData.last_attempt_at = new Date().toISOString();
  }

  // Incrementar attempt_count via RPC separado
  await supabase.rpc('execute_sql', {
    query_text: `UPDATE campaign_outreach_queue SET attempt_count = attempt_count + 1 WHERE id = '${queueId}'`
  });

  await supabase
    .from('campaign_outreach_queue')
    .update(updateData)
    .eq('id', queueId);

  console.log(`📝 [OUTREACH] Status atualizado: ${queueId} → ${status}`);
}

/**
 * Salva mensagem no histórico
 */
export async function saveOutreachMessage(
  queueId: string,
  campaignId: string,
  leadId: string,
  channel: string,
  generatedDM: GeneratedDM
): Promise<void> {
  await supabase
    .from('outreach_messages')
    .insert({
      queue_id: queueId,
      campaign_id: campaignId,
      lead_id: leadId,
      channel,
      direction: 'outbound',
      message_text: generatedDM.message_text,
      message_type: 'text',
      generated_by: generatedDM.message_generated_by,
      generation_prompt: generatedDM.generation_prompt,
      generation_tokens: generatedDM.tokens_used,
      generation_cost: generatedDM.estimated_cost,
      metadata: generatedDM.personalization_data
    });

  console.log(`💾 [OUTREACH] Mensagem salva no histórico`);
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const personalizedDMService = {
  generatePersonalizedDM,
  getNextOutreachItem,
  updateOutreachStatus,
  saveOutreachMessage
};
