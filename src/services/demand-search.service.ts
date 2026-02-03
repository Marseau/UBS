/**
 * DEMAND SEARCH SERVICE
 *
 * Busca semântica por demandas de mercado usando embeddings.
 * Permite descobrir quais leads estão relacionados a determinadas
 * necessidades/desejos baseado em texto em linguagem natural.
 *
 * Exemplo de uso:
 * - "quero emagrecer rápido" → encontra leads do nicho de emagrecimento
 * - "preciso de mais clientes" → encontra leads de consultoria/vendas
 * - "ansiedade e estresse" → encontra leads de saúde mental
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const EMBEDDING_DIMENSIONS = 1536;

// Cache simples para embeddings de queries
const queryCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export interface DemandSearchResult {
  lead_id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  profession: string | null;
  city: string | null;
  business_category: string | null;
  whatsapp_number: string | null;
  similarity: number;
  hashtags_bio: string[];
}

export interface DemandSearchOptions {
  limit?: number;
  minSimilarity?: number;
  businessCategory?: string;
  requireWhatsapp?: boolean;
  campaignId?: string;
}

export interface DemandAnalysis {
  query: string;
  total_results: number;
  demand_validated: boolean;
  validation_level: 'high' | 'medium' | 'low' | 'insufficient';
  top_categories: { category: string; count: number; avg_similarity: number }[];
  top_hashtags: { hashtag: string; count: number }[];
  insights: string[];
}

/**
 * Gera embedding para texto de demanda
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = queryCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding;
  }

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query.trim(),
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding inválido: esperado ${EMBEDDING_DIMENSIONS} dimensões`);
  }

  queryCache.set(cacheKey, { embedding, timestamp: Date.now() });
  return embedding;
}

/**
 * Busca leads por demanda usando similaridade semântica
 */
export async function searchByDemand(
  demandQuery: string,
  options: DemandSearchOptions = {}
): Promise<DemandSearchResult[]> {
  const {
    limit = 50,
    minSimilarity = 0.3,
    businessCategory,
    requireWhatsapp = false,
    campaignId,
  } = options;

  // Gerar embedding da query de demanda
  const queryEmbedding = await generateQueryEmbedding(demandQuery);

  // Usar a função SQL existente como base, mas com filtros adicionais
  const { data, error } = await supabase.rpc('search_similar_leads', {
    p_query_embedding: queryEmbedding,
    p_campaign_id: campaignId || null,
    p_limit: limit * 2, // Buscar mais para filtrar depois
  });

  if (error) {
    throw new Error(`Erro na busca semântica: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Buscar dados adicionais dos leads (categoria, whatsapp, hashtags)
  const leadIds = data.map((d: any) => d.lead_id);

  const { data: enrichedLeads, error: enrichError } = await supabase
    .from('instagram_leads')
    .select('id, business_category, whatsapp_number, hashtags_bio')
    .in('id', leadIds);

  if (enrichError) {
    console.error('Erro ao enriquecer leads:', enrichError);
  }

  const enrichmentMap = new Map(
    (enrichedLeads || []).map((l: any) => [l.id, l])
  );

  // Combinar e filtrar resultados
  let results: DemandSearchResult[] = data
    .map((d: any) => {
      const enrichment = enrichmentMap.get(d.lead_id) || {};
      return {
        lead_id: d.lead_id,
        username: d.username,
        full_name: d.full_name,
        bio: d.bio,
        profession: d.profession,
        city: d.city,
        business_category: enrichment.business_category || null,
        whatsapp_number: enrichment.whatsapp_number || null,
        similarity: d.similarity,
        hashtags_bio: enrichment.hashtags_bio || [],
      };
    })
    .filter((r: DemandSearchResult) => r.similarity >= minSimilarity);

  // Aplicar filtros opcionais
  if (businessCategory) {
    results = results.filter(r =>
      r.business_category?.toLowerCase() === businessCategory.toLowerCase()
    );
  }

  if (requireWhatsapp) {
    results = results.filter(r => r.whatsapp_number);
  }

  return results.slice(0, limit);
}

/**
 * Analisa demanda e retorna insights agregados
 */
export async function analyzeDemand(
  demandQuery: string,
  options: DemandSearchOptions = {}
): Promise<DemandAnalysis> {
  // Buscar mais leads para análise estatística (mínimo 500 para validação)
  const results = await searchByDemand(demandQuery, { ...options, limit: 1000, minSimilarity: 0.4 });

  // Agregar por categoria
  const categoryStats = new Map<string, { count: number; totalSimilarity: number }>();
  const hashtagCounts = new Map<string, number>();

  for (const result of results) {
    // Categorias
    const cat = result.business_category || 'outros';
    const catStats = categoryStats.get(cat) || { count: 0, totalSimilarity: 0 };
    catStats.count++;
    catStats.totalSimilarity += result.similarity;
    categoryStats.set(cat, catStats);

    // Hashtags
    for (const hashtag of result.hashtags_bio) {
      hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) || 0) + 1);
    }
  }

  const top_categories = Array.from(categoryStats.entries())
    .map(([category, stats]) => ({
      category,
      count: stats.count,
      avg_similarity: stats.totalSimilarity / stats.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const top_hashtags = Array.from(hashtagCounts.entries())
    .map(([hashtag, count]) => ({ hashtag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Gerar insights
  const insights: string[] = [];

  const topCategory = top_categories[0];
  if (topCategory) {
    insights.push(
      `Demanda "${demandQuery}" mais forte no nicho: ${topCategory.category} ` +
      `(${topCategory.count} leads, similaridade média: ${(topCategory.avg_similarity * 100).toFixed(1)}%)`
    );
  }

  if (top_hashtags.length > 0) {
    const topHashtags = top_hashtags.slice(0, 3).map(h => `#${h.hashtag}`).join(', ');
    insights.push(`Hashtags mais associadas: ${topHashtags}`);
  }

  const withWhatsapp = results.filter(r => r.whatsapp_number).length;
  const whatsappRate = results.length > 0 ? (withWhatsapp / results.length * 100).toFixed(1) : '0';
  insights.push(`${withWhatsapp} leads (${whatsappRate}%) têm WhatsApp para outreach`);

  // Calcular validação de demanda
  // Critérios: quantidade de leads com alta similaridade (>=0.5)
  const highSimilarityLeads = results.filter(r => r.similarity >= 0.5).length;
  const avgSimilarity = results.length > 0
    ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
    : 0;

  let validation_level: 'high' | 'medium' | 'low' | 'insufficient';
  let demand_validated: boolean;

  if (highSimilarityLeads >= 500 && avgSimilarity >= 0.55) {
    validation_level = 'high';
    demand_validated = true;
    insights.unshift(`✅ DEMANDA VALIDADA (Alta): ${highSimilarityLeads} leads com alta relevância`);
  } else if (highSimilarityLeads >= 100 && avgSimilarity >= 0.5) {
    validation_level = 'medium';
    demand_validated = true;
    insights.unshift(`✅ DEMANDA VALIDADA (Média): ${highSimilarityLeads} leads relevantes`);
  } else if (highSimilarityLeads >= 30) {
    validation_level = 'low';
    demand_validated = false;
    insights.unshift(`⚠️ Demanda fraca: apenas ${highSimilarityLeads} leads relevantes (mínimo: 100)`);
  } else {
    validation_level = 'insufficient';
    demand_validated = false;
    insights.unshift(`❌ Dados insuficientes: ${highSimilarityLeads} leads (precisa de mais dados)`);
  }

  return {
    query: demandQuery,
    total_results: results.length,
    demand_validated,
    validation_level,
    top_categories,
    top_hashtags,
    insights,
  };
}

/**
 * Busca demandas pré-definidas por nicho
 */
export const DEMAND_QUERIES = {
  // Saúde
  emagrecimento: 'quero emagrecer perder peso dieta',
  ansiedade: 'ansiedade estresse saúde mental terapia',
  dor: 'dor crônica tratamento fisioterapia',

  // Negócios
  vendas: 'aumentar vendas mais clientes faturamento',
  marketing: 'marketing digital redes sociais crescer',
  produtividade: 'produtividade gestão tempo organização',

  // Beleza
  autoestima: 'autoestima confiança aparência beleza',
  cabelo: 'cabelo tratamento capilar queda',

  // Fitness
  hipertrofia: 'ganhar massa muscular treino academia',
  performance: 'performance atlética desempenho esporte',
};

export async function searchPredefinedDemand(
  demandKey: keyof typeof DEMAND_QUERIES,
  options: DemandSearchOptions = {}
): Promise<DemandSearchResult[]> {
  const query = DEMAND_QUERIES[demandKey];
  if (!query) {
    throw new Error(`Demanda não encontrada: ${demandKey}`);
  }
  return searchByDemand(query, options);
}

export const demandSearchService = {
  searchByDemand,
  analyzeDemand,
  searchPredefinedDemand,
  DEMAND_QUERIES,
};

export default demandSearchService;
