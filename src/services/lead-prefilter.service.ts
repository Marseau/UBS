/**
 * Lead Pre-Filter Service
 *
 * Serviço de pré-filtragem de leads usando IA (GPT-4o-mini).
 * Analisa a bio de cada lead e classifica se é POTENCIAL ou NÃO POTENCIAL
 * baseado no contexto específico da campanha.
 *
 * Uso: Após seleção de nicho por hashtags, antes da clusterização semântica.
 *
 * Exemplo:
 * - Campanha AIC: "Vender para agências de marketing" → Filtra só agências
 * - Campanha UBS: "Vender agendamento para clínicas" → Filtra só profissionais de saúde
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tipos
export interface LeadToFilter {
  id: string;
  username: string;
  bio: string | null;
  business_category: string | null;
  followers_count?: number;
  whatsapp_number?: string | null;
}

export interface FilteredLead extends LeadToFilter {
  is_potential: boolean;
  filter_reason: string;
  confidence: number; // 0-100
}

export interface PreFilterContext {
  campaign_target: string;        // "Agências de marketing digital"
  campaign_description?: string;  // "Vender plataforma AIC de prospecção"
  ideal_customer?: string;        // "Agências que fazem tráfego pago para clientes"
  exclude_types?: string[];       // ["dentistas", "restaurantes", "lojas"]
}

export interface PreFilterResult {
  total_leads: number;
  potential_leads: number;
  filtered_out_leads: number;
  filter_rate: number;
  leads: FilteredLead[];
  processing_time_ms: number;
  tokens_used: number;
  estimated_cost_usd: number;
}

// Configurações
const BATCH_SIZE = 50; // Leads por chamada de API
const MODEL = 'gpt-4o-mini';
const MAX_RETRIES = 3;

/**
 * Classe principal do serviço de pré-filtro
 */
class LeadPreFilterService {

  /**
   * Filtra leads baseado no contexto da campanha
   */
  async filterLeads(
    leads: LeadToFilter[],
    context: PreFilterContext
  ): Promise<PreFilterResult> {
    const startTime = Date.now();
    console.log(`\n🎯 [PRE-FILTER] Iniciando pré-filtro de ${leads.length} leads`);
    console.log(`📌 Target: ${context.campaign_target}`);

    // Filtrar leads sem bio (não há o que analisar)
    const leadsWithBio = leads.filter(l => l.bio && l.bio.trim().length > 10);
    const leadsWithoutBio = leads.filter(l => !l.bio || l.bio.trim().length <= 10);

    console.log(`📊 Leads com bio: ${leadsWithBio.length} | Sem bio: ${leadsWithoutBio.length}`);

    // Processar em batches
    const batches = this.createBatches(leadsWithBio, BATCH_SIZE);
    console.log(`📦 Processando em ${batches.length} batches de até ${BATCH_SIZE} leads`);

    const allFilteredLeads: FilteredLead[] = [];
    let totalTokens = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      console.log(`\n⏳ Processando batch ${i + 1}/${batches.length} (${batch.length} leads)...`);

      try {
        const { filteredLeads, tokens } = await this.processBatch(batch, context);
        allFilteredLeads.push(...filteredLeads);
        totalTokens += tokens;

        const potentialCount = filteredLeads.filter(l => l.is_potential).length;
        console.log(`✅ Batch ${i + 1}: ${potentialCount}/${batch.length} potenciais`);

        // Rate limiting - aguardar entre batches
        if (i < batches.length - 1) {
          await this.sleep(500);
        }
      } catch (error) {
        console.error(`❌ Erro no batch ${i + 1}:`, error);
        // Marcar leads do batch como não processados
        const errorLeads = batch.map(lead => ({
          ...lead,
          is_potential: false,
          filter_reason: 'Erro no processamento',
          confidence: 0
        }));
        allFilteredLeads.push(...errorLeads);
      }
    }

    // Adicionar leads sem bio como não potenciais
    const leadsWithoutBioFiltered: FilteredLead[] = leadsWithoutBio.map(lead => ({
      ...lead,
      is_potential: false,
      filter_reason: 'Bio ausente ou muito curta',
      confidence: 100
    }));
    allFilteredLeads.push(...leadsWithoutBioFiltered);

    // Calcular métricas
    const processingTime = Date.now() - startTime;
    const potentialLeads = allFilteredLeads.filter(l => l.is_potential);
    const estimatedCost = this.calculateCost(totalTokens);

    console.log(`\n✨ [PRE-FILTER] Concluído em ${(processingTime / 1000).toFixed(1)}s`);
    console.log(`📊 Resultado: ${potentialLeads.length}/${leads.length} potenciais (${((potentialLeads.length / leads.length) * 100).toFixed(1)}%)`);
    console.log(`💰 Custo estimado: $${estimatedCost.toFixed(4)}`);

    return {
      total_leads: leads.length,
      potential_leads: potentialLeads.length,
      filtered_out_leads: leads.length - potentialLeads.length,
      filter_rate: (potentialLeads.length / leads.length) * 100,
      leads: allFilteredLeads,
      processing_time_ms: processingTime,
      tokens_used: totalTokens,
      estimated_cost_usd: estimatedCost
    };
  }

  /**
   * Processa um batch de leads com a IA
   */
  private async processBatch(
    leads: LeadToFilter[],
    context: PreFilterContext,
    retryCount = 0
  ): Promise<{ filteredLeads: FilteredLead[], tokens: number }> {

    const prompt = this.buildPrompt(leads, context);

    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(context)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Baixa temperatura para consistência
        max_tokens: 4000
      });

      const firstChoice = response.choices[0];
      if (!firstChoice) {
        throw new Error('Nenhuma escolha retornada pela IA');
      }
      const content = firstChoice.message.content;
      const tokens = response.usage?.total_tokens || 0;

      if (!content) {
        throw new Error('Resposta vazia da IA');
      }

      // Parse da resposta JSON
      const parsed = JSON.parse(content);
      const classifications = parsed.leads || parsed.classifications || [];

      // Mapear classificações para leads
      const filteredLeads: FilteredLead[] = leads.map((lead, index) => {
        const classification = classifications[index] || {
          is_potential: false,
          reason: 'Não classificado',
          confidence: 0
        };

        return {
          ...lead,
          is_potential: classification.is_potential || classification.potential || false,
          filter_reason: classification.reason || classification.motivo || 'Sem motivo',
          confidence: classification.confidence || classification.confianca || 50
        };
      });

      return { filteredLeads, tokens };

    } catch (error: any) {
      if (retryCount < MAX_RETRIES) {
        console.log(`⚠️ Retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await this.sleep(1000 * (retryCount + 1));
        return this.processBatch(leads, context, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Constrói o system prompt
   */
  private getSystemPrompt(context: PreFilterContext): string {
    return `Você é um classificador de leads B2B especializado.

CONTEXTO DA CAMPANHA:
- Target: ${context.campaign_target}
${context.campaign_description ? `- Descrição: ${context.campaign_description}` : ''}
${context.ideal_customer ? `- Cliente ideal: ${context.ideal_customer}` : ''}
${context.exclude_types?.length ? `- Excluir: ${context.exclude_types.join(', ')}` : ''}

SUA TAREFA:
Analisar a bio de cada lead e determinar se é um POTENCIAL cliente para esta campanha.

REGRAS:
1. Analise a bio buscando sinais de que o lead FAZ/VENDE o que buscamos, não USA/PRECISA
2. Um dentista NÃO é potencial para vender "serviços de marketing" - ele PRECISA de marketing
3. Uma agência de marketing É potencial para vender "plataforma para agências"
4. Seja rigoroso - só marque como potencial se tiver CERTEZA
5. Forneça um motivo claro e objetivo para cada classificação

RESPONDA SEMPRE EM JSON com a estrutura:
{
  "leads": [
    {
      "is_potential": true/false,
      "reason": "motivo claro e objetivo",
      "confidence": 0-100
    }
  ]
}`;
  }

  /**
   * Constrói o prompt com os leads
   */
  private buildPrompt(leads: LeadToFilter[], context: PreFilterContext): string {
    const leadsText = leads.map((lead, i) => {
      return `[${i}] @${lead.username}
Bio: ${lead.bio || 'N/A'}
Categoria: ${lead.business_category || 'N/A'}`;
    }).join('\n\n');

    return `Classifique os ${leads.length} leads abaixo como POTENCIAL ou NÃO POTENCIAL para a campanha "${context.campaign_target}":

${leadsText}

Responda com um JSON contendo "leads" com ${leads.length} classificações na mesma ordem.`;
  }

  /**
   * Divide array em batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Calcula custo estimado (GPT-4o-mini pricing)
   */
  private calculateCost(tokens: number): number {
    // GPT-4o-mini: $0.15/1M input, $0.60/1M output (estimando 50/50)
    const avgPricePerMillion = (0.15 + 0.60) / 2;
    return (tokens / 1_000_000) * avgPricePerMillion;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Busca leads de um nicho no banco de dados
   */
  async getLeadsFromNiche(
    hashtagIds: string[],
    limit?: number
  ): Promise<LeadToFilter[]> {
    console.log(`\n📥 Buscando leads para ${hashtagIds.length} hashtags...`);

    // Buscar leads que têm as hashtags selecionadas
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH selected_hashtags AS (
          SELECT UNNEST($1::text[]) as hashtag
        ),
        leads_with_hashtags AS (
          SELECT DISTINCT
            il.id,
            il.username,
            il.bio,
            il.business_category,
            il.followers_count,
            il.whatsapp_number
          FROM instagram_leads il
          CROSS JOIN LATERAL (
            SELECT jsonb_array_elements_text(il.hashtags_bio) as hashtag
            WHERE il.hashtags_bio IS NOT NULL
            UNION
            SELECT jsonb_array_elements_text(il.hashtags_posts) as hashtag
            WHERE il.hashtags_posts IS NOT NULL
          ) h
          WHERE LOWER(h.hashtag) IN (SELECT LOWER(hashtag) FROM selected_hashtags)
            AND (il.captured_at >= CURRENT_DATE - INTERVAL '45 days'
                 OR il.updated_at >= CURRENT_DATE - INTERVAL '45 days')
        )
        SELECT *
        FROM leads_with_hashtags
        ${limit ? `LIMIT ${limit}` : ''}
      `,
      params: [hashtagIds]
    });

    if (error) {
      console.error('❌ Erro ao buscar leads:', error);
      throw error;
    }

    console.log(`✅ Encontrados ${data?.length || 0} leads`);
    return data || [];
  }

  /**
   * Salva resultado do pré-filtro no banco
   */
  async savePreFilterResult(
    campaignId: string,
    result: PreFilterResult,
    context: PreFilterContext
  ): Promise<void> {
    console.log(`\n💾 Salvando resultado do pré-filtro para campanha ${campaignId}...`);

    // Salvar metadados do filtro na campanha
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        prefilter_applied: true,
        prefilter_context: context,
        prefilter_stats: {
          total_leads: result.total_leads,
          potential_leads: result.potential_leads,
          filtered_out_leads: result.filtered_out_leads,
          filter_rate: result.filter_rate,
          processing_time_ms: result.processing_time_ms,
          tokens_used: result.tokens_used,
          estimated_cost_usd: result.estimated_cost_usd,
          executed_at: new Date().toISOString()
        }
      })
      .eq('id', campaignId);

    if (updateError) {
      console.error('❌ Erro ao atualizar campanha:', updateError);
    }

    // Salvar classificações individuais (opcional - para análise posterior)
    const potentialLeadIds = result.leads
      .filter(l => l.is_potential)
      .map(l => l.id);

    console.log(`✅ Pré-filtro salvo: ${potentialLeadIds.length} leads potenciais`);
  }
}

// Exportar instância singleton
export const leadPreFilterService = new LeadPreFilterService();

// Export default
export default leadPreFilterService;
