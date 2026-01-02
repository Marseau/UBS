/**
 * SEED SUGGESTER SERVICE v3
 *
 * Sugere seeds para campanhas AIC baseado em:
 * 1. BUSCA SEMÂNTICA com embeddings (pgvector + RPC tipada)
 * 2. Filtro por frequência mínima (default >= 20)
 * 3. Filtro por similaridade mínima (default >= 0.70)
 * 4. Score: similaridade * ln(frequência + 1)
 * 5. Auto-adjust: reduz para max 50 seeds aumentando similarity
 * 6. 100% DETERMINÍSTICO - sem GPT na seleção
 *
 * SEGURANÇA:
 * - Usa RPC tipada get_semantic_hashtags
 * - Embedding passado como float8[] (não string)
 * - Parâmetros validados no Postgres
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Constante usada em múltiplas funções
const EMBEDDING_DIMENSIONS = 1536;

// Cache para normalização GPT (garante determinismo)

interface NormalizationCache {
  hashtags: string[];
  timestamp: number;
}

const normalizationCache = new Map<string, NormalizationCache>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function getCacheKey(description: string): string {
  return crypto.createHash('md5').update(description.trim().toLowerCase()).digest('hex');
}

function getFromCache(description: string): string[] | null {
  const key = getCacheKey(description);
  const cached = normalizationCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[CACHE] Hit para: "${description.substring(0, 30)}..."`);
    return cached.hashtags;
  }

  return null;
}

function setInCache(description: string, hashtags: string[]): void {
  const key = getCacheKey(description);
  normalizationCache.set(key, {
    hashtags,
    timestamp: Date.now()
  });
  console.log(`[CACHE] Armazenado: "${description.substring(0, 30)}..." → ${hashtags.length} hashtags`);
}

// ============================================
// NORMALIZAÇÃO DE QUERY VIA GPT
// ============================================

// Prompt para GPT sugerir novas hashtags para scraping
const HASHTAG_SUGGESTION_PROMPT = `Analise a descrição da campanha abaixo e sugira exatamente 20 hashtags do Instagram Brasil que ainda NÃO existem na nossa base mas seriam altamente relevantes para scraping.

REGRAS OBRIGATÓRIAS:
1. Gere exatamente 20 hashtags
2. Ordene da MAIS específica para a MAIS geral
3. NÃO inclua variações nem sinônimos
4. Use APENAS termos diretamente relacionados à campanha
5. SOMENTE português brasileiro (zero inglês)
6. Sem acentos, sem espaços, tudo minúsculo
7. Hashtags que profissionais do nicho REALMENTE usam no Instagram

FORMATO DE SAÍDA (apenas as 20 hashtags, uma por linha):
hashtag1
hashtag2
...
hashtag20

CAMPANHA:
`;

/**
 * Gera embedding para a descrição da campanha via OpenAI
 */
async function generateCampaignEmbedding(description: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: description,
      dimensions: EMBEDDING_DIMENSIONS
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error('[EMBEDDING] Dimensão inválida:', embedding?.length);
      return null;
    }

    console.log(`[EMBEDDING] Gerado embedding para: "${description.substring(0, 50)}..."`);
    return embedding;
  } catch (error: any) {
    console.error('[EMBEDDING] Erro OpenAI:', error.message);
    return null;
  }
}

/**
 * Prompt para normalizar descrição em hashtags (temp=0 para determinismo)
 */
const HASHTAG_NORMALIZE_PROMPT = `Converta o texto abaixo em hashtags do Instagram Brasil.

REGRAS:
1. Gere exatamente 30 hashtags
2. Ordene da MAIS específica para a MAIS geral
3. NÃO inclua variações nem sinônimos
4. SOMENTE português brasileiro (zero inglês)
5. Sem acentos, sem espaços, tudo minúsculo
6. Termos que profissionais do nicho REALMENTE usam

FORMATO (apenas hashtags, uma por linha):
hashtag1
hashtag2
...
hashtag30

TEXTO:
`;

/**
 * Normaliza descrição da campanha em hashtags via GPT (temp=0)
 * USA CACHE para garantir determinismo
 */
async function normalizeDescriptionToHashtags(description: string): Promise<string[]> {
  // Verificar cache primeiro
  const cached = getFromCache(description);
  if (cached) {
    return cached;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: HASHTAG_NORMALIZE_PROMPT + `"${description}"`
        }
      ],
      max_tokens: 400,
      temperature: 0
    });

    const result = response.choices[0]?.message?.content?.trim() || '';

    const hashtags = result
      .split('\n')
      .map(line => line.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]/g, ''))
      .filter(h => h.length >= 3)
      .slice(0, 30);

    console.log(`[NORMALIZE] GPT gerou ${hashtags.length} hashtags: ${hashtags.slice(0, 5).join(', ')}...`);

    // Armazenar no cache
    if (hashtags.length > 0) {
      setInCache(description, hashtags);
    }

    return hashtags;
  } catch (error: any) {
    console.error('[NORMALIZE] Erro GPT:', error.message);
    return [];
  }
}

/**
 * Busca embeddings das hashtags normalizadas no banco
 * Retorna média dos embeddings encontrados
 */
async function getAverageEmbeddingFromDB(hashtags: string[]): Promise<{
  embedding: number[] | null;
  found: string[];
  notFound: string[];
}> {
  if (hashtags.length === 0) {
    return { embedding: null, found: [], notFound: [] };
  }

  const { data, error } = await supabase
    .from('hashtag_embeddings')
    .select('hashtag_normalized, embedding')
    .in('hashtag_normalized', hashtags)
    .not('embedding', 'is', null)
    .eq('is_active', true)
    .gte('occurrence_count', 20);

  if (error || !data || data.length === 0) {
    console.log(`[DB] Nenhum embedding encontrado`);
    return { embedding: null, found: [], notFound: hashtags };
  }

  const foundHashtags = data.map((row: any) => row.hashtag_normalized);
  const notFoundHashtags = hashtags.filter(h => !foundHashtags.includes(h));

  console.log(`[DB] ${data.length}/${hashtags.length} hashtags encontradas`);

  // Parse e calcular média dos embeddings
  const embeddings = data
    .map((row: any) => {
      const emb = row.embedding;
      if (Array.isArray(emb)) return emb;
      if (typeof emb === 'string') {
        try {
          const parsed = JSON.parse(emb);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          const clean = emb.replace(/^\[|\]$/g, '');
          return clean.split(',').map(Number);
        }
      }
      return null;
    })
    .filter((e: any) => Array.isArray(e) && e.length === EMBEDDING_DIMENSIONS);

  if (embeddings.length === 0) {
    return { embedding: null, found: [], notFound: hashtags };
  }

  const avgEmbedding: number[] = new Array(EMBEDDING_DIMENSIONS).fill(0);
  for (const emb of embeddings) {
    if (!emb) continue;
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      avgEmbedding[i] = (avgEmbedding[i] || 0) + (emb[i] || 0);
    }
  }
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    avgEmbedding[i] = (avgEmbedding[i] || 0) / embeddings.length;
  }

  return { embedding: avgEmbedding, found: foundHashtags, notFound: notFoundHashtags };
}

/**
 * Usa GPT para sugerir 20 novas hashtags para scraping
 * Estas são hashtags que NÃO existem no banco mas seriam relevantes
 */
async function suggestNewHashtagsForScraping(
  description: string,
  existingHashtags: string[]
): Promise<string[]> {
  try {
    const existingList = existingHashtags.slice(0, 50).join(', ');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: HASHTAG_SUGGESTION_PROMPT + `"${description}"\n\nHASHTAGS JÁ EXISTENTES (não repita estas):\n${existingList}`
        }
      ],
      max_tokens: 300,
      temperature: 0
    });

    const result = response.choices[0]?.message?.content?.trim() || '';

    // Parse: uma hashtag por linha
    const suggestions = result
      .split('\n')
      .map(line => line.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]/g, ''))
      .filter(h => h.length >= 3 && !existingHashtags.includes(h))
      .slice(0, 20);

    console.log(`[SUGGESTIONS] GPT sugeriu ${suggestions.length} novas hashtags para scraping`);
    return suggestions;
  } catch (error: any) {
    console.error('[SUGGESTIONS] Erro GPT:', error.message);
    return [];
  }
}

// Constantes de configuração
const DEFAULT_MIN_FREQ = 20;
const DEFAULT_MIN_SIMILARITY = 0.70;
const DEFAULT_MAX_RESULTS = 500;
const MAX_RESULTS_HARD_LIMIT = 2000;
const MAX_SEEDS_TARGET = 50;
const EMBEDDING_CACHE_MAX_ENTRIES = 200;

// Thresholds de similaridade para auto-adjust
const SIMILARITY_THRESHOLDS = {
  recall: 0.70,    // mais amplo, mais resultados
  focused: 0.75,   // foco médio
  strict: 0.80,    // mais restritivo
  semantic: 0.85   // quase sinônimo semântico
};

export interface HashtagSemantic {
  hashtag: string;
  hashtag_normalized: string;
  occurrence_count: number;
  similarity: number;
  score: number;
}

export interface AutoAdjustInfo {
  enabled: boolean;
  applied: boolean;
  original_similarity: number;
  final_similarity: number;
  original_count: number;
  final_count: number;
  steps: Array<{ similarity: number; count: number }>;
}

export interface SeedSuggestionResult {
  campaign_description: string;
  hashtag_style_query: string;  // query transformada para formato hashtag
  total_seeds: number;
  seeds: string[];  // sempre hashtag_normalized (sem #)
  seeds_detalhadas: HashtagSemantic[];
  suggested_for_scraping: string[];  // hashtags GPT que não existem no banco
  metodologia: {
    busca: string;
    freq_minima: number;
    similarity_minima: number;
    formula_score: string;
    deterministic: boolean;
    hashtag_transform: boolean;
  };
  auto_adjust: AutoAdjustInfo;
}

export interface ValidateSeedsResult {
  valid: string[];
  invalid: string[];
  frequencies: Record<string, number>;
}

/**
 * Gera embedding para texto usando OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Texto para embedding não pode ser vazio');
  }

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.trim(),
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding inválido: esperado ${EMBEDDING_DIMENSIONS} dimensões, ` +
      `recebido ${embedding?.length || 0}. Input length: ${text.length}`
    );
  }

  return embedding;
}

/**
 * Cache LRU simples para embeddings
 * Limite de entradas para evitar memory leak em serverless
 */
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();

function getEmbeddingFromCache(key: string): number[] | null {
  const cached = embeddingCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding;
  }
  if (cached) {
    embeddingCache.delete(key); // expirado
  }
  return null;
}

function setEmbeddingInCache(key: string, embedding: number[]): void {
  // Limpar entradas antigas se atingir limite
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const keysToDelete: string[] = [];
    const now = Date.now();

    // Primeiro, remover expirados
    embeddingCache.forEach((value, k) => {
      if (now - value.timestamp > CACHE_TTL_MS) {
        keysToDelete.push(k);
      }
    });
    keysToDelete.forEach(k => embeddingCache.delete(k));

    // Se ainda acima do limite, remover os mais antigos
    if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
      const entries = Array.from(embeddingCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.ceil(EMBEDDING_CACHE_MAX_ENTRIES * 0.2));
      toRemove.forEach(([k]) => embeddingCache.delete(k));
    }
  }

  embeddingCache.set(key, { embedding, timestamp: Date.now() });
}

async function generateEmbeddingWithCache(text: string): Promise<number[]> {
  const cacheKey = text.trim().toLowerCase();
  const cached = getEmbeddingFromCache(cacheKey);

  if (cached) {
    console.log('[SEED SUGGESTER] Cache hit para embedding');
    return cached;
  }

  const embedding = await generateEmbedding(text);
  setEmbeddingInCache(cacheKey, embedding);
  return embedding;
}

/**
 * Busca hashtags semanticamente similares usando RPC tipada
 * Passa embedding como float8[] nativo (não string)
 */
async function fetchSemanticHashtags(
  queryEmbedding: number[],
  minOccurrence: number = DEFAULT_MIN_FREQ,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<HashtagSemantic[]> {
  if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding deve ter ${EMBEDDING_DIMENSIONS} dimensões`);
  }

  if (minOccurrence < 1) minOccurrence = 1;
  if (minSimilarity < 0 || minSimilarity > 1) {
    throw new Error('minSimilarity deve estar entre 0 e 1');
  }
  if (maxResults < 1) maxResults = DEFAULT_MAX_RESULTS;
  if (maxResults > MAX_RESULTS_HARD_LIMIT) maxResults = MAX_RESULTS_HARD_LIMIT;

  // Passar embedding como array nativo (RPC aceita float8[])
  const { data, error } = await supabase.rpc('get_semantic_hashtags', {
    query_embedding: queryEmbedding,
    min_occurrence: minOccurrence,
    min_similarity: minSimilarity,
    max_results: maxResults
  });

  if (error) {
    console.error('Erro na RPC get_semantic_hashtags:', error);
    throw new Error(`Falha na busca semântica: ${error.message}`);
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => ({
    hashtag: row.hashtag,
    hashtag_normalized: row.hashtag_normalized,
    occurrence_count: parseInt(row.occurrence_count) || 0,
    similarity: parseFloat(row.similarity) || 0,
    score: parseFloat(row.score) || 0
  }));
}

/**
 * Função principal: sugere seeds DETERMINISTICAMENTE
 *
 * NOVA ABORDAGEM v4:
 * 1. Gera embedding da descrição da campanha (OpenAI)
 * 2. Busca hashtags no banco por similaridade >= threshold (100% determinístico)
 * 3. GPT sugere 20 novas hashtags para scraping (que não existem no banco)
 *
 * AUTO-ADJUST: Se > 50 seeds, aumenta minSimilarity progressivamente
 */
export async function suggestSeeds(
  campaignDescription: string,
  options: {
    minFreq?: number;
    minSimilarity?: number;
    maxResults?: number;
    autoAdjust?: boolean;
  } = {}
): Promise<SeedSuggestionResult> {
  const minFreq = options.minFreq ?? DEFAULT_MIN_FREQ;
  const initialSimilarity = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  let minSimilarity = initialSimilarity;
  const maxResults = Math.min(
    options.maxResults ?? DEFAULT_MAX_RESULTS,
    MAX_RESULTS_HARD_LIMIT
  );
  const autoAdjust = options.autoAdjust !== false;

  console.log('\n[SEED SUGGESTER v4] 100% DETERMINÍSTICO');
  console.log(`   Descrição: ${campaignDescription.substring(0, 80)}...`);
  console.log(`   Params: minFreq=${minFreq}, minSim=${minSimilarity}, autoAdjust=${autoAdjust}`);

  // Validar input
  if (!campaignDescription || campaignDescription.trim().length < 10) {
    throw new Error('Descrição da campanha deve ter pelo menos 10 caracteres');
  }

  // 1. NORMALIZAR DESCRIÇÃO → HASHTAGS via GPT (temp=0)
  console.log('   Normalizando descrição → hashtags via GPT...');
  const normalizedHashtags = await normalizeDescriptionToHashtags(campaignDescription);

  if (normalizedHashtags.length === 0) {
    throw new Error('Falha ao normalizar descrição em hashtags');
  }

  // 2. BUSCAR EMBEDDINGS DAS HASHTAGS NO BANCO
  console.log('   Buscando embeddings das hashtags no banco...');
  const lookupResult = await getAverageEmbeddingFromDB(normalizedHashtags);

  let queryEmbedding = lookupResult.embedding;

  // Fallback: gerar embedding direto se não encontrar no banco
  if (!queryEmbedding) {
    console.log('   Fallback: gerando embedding direto...');
    queryEmbedding = await generateCampaignEmbedding(normalizedHashtags.join(' '));
  }

  if (!queryEmbedding) {
    throw new Error('Falha ao gerar embedding');
  }

  // 3. BUSCAR HASHTAGS POR SIMILARIDADE (100% determinístico)
  console.log('   Buscando hashtags por similaridade...');
  let seeds = await fetchSemanticHashtags(
    queryEmbedding,
    minFreq,
    minSimilarity,
    maxResults
  );

  // Tracking do auto-adjust
  const autoAdjustInfo: AutoAdjustInfo = {
    enabled: autoAdjust,
    applied: false,
    original_similarity: initialSimilarity,
    final_similarity: minSimilarity,
    original_count: seeds.length,
    final_count: seeds.length,
    steps: [{ similarity: minSimilarity, count: seeds.length }]
  };

  // AUTO-ADJUST: reduzir para <= 50 seeds
  if (autoAdjust && seeds.length > MAX_SEEDS_TARGET) {
    autoAdjustInfo.applied = true;
    const thresholds = [
      SIMILARITY_THRESHOLDS.focused,
      SIMILARITY_THRESHOLDS.strict,
      SIMILARITY_THRESHOLDS.semantic
    ];

    for (const threshold of thresholds) {
      if (threshold <= minSimilarity) continue;

      minSimilarity = threshold;
      seeds = await fetchSemanticHashtags(
        queryEmbedding,
        minFreq,
        minSimilarity,
        maxResults
      );

      autoAdjustInfo.steps.push({ similarity: minSimilarity, count: seeds.length });
      console.log(`   Auto-adjust: sim=${minSimilarity} → ${seeds.length} seeds`);

      if (seeds.length <= MAX_SEEDS_TARGET) break;
    }

    // Hard cut se ainda > 50
    if (seeds.length > MAX_SEEDS_TARGET) {
      console.log(`   Hard cut: ${seeds.length} → ${MAX_SEEDS_TARGET}`);
      seeds = seeds.slice(0, MAX_SEEDS_TARGET);
    }

    autoAdjustInfo.final_similarity = minSimilarity;
    autoAdjustInfo.final_count = seeds.length;
  }

  // Log top 10
  console.log(`   ${seeds.length} seeds encontradas (determinístico)`);
  seeds.slice(0, 10).forEach((h, i) => {
    console.log(
      `      ${i + 1}. ${h.hashtag_normalized} ` +
      `(sim=${(h.similarity * 100).toFixed(1)}%, freq=${h.occurrence_count})`
    );
  });

  // 4. GPT SUGERE 20 NOVAS HASHTAGS PARA SCRAPING
  console.log('   GPT sugerindo novas hashtags para scraping...');
  const existingHashtags = seeds.map(s => s.hashtag_normalized);
  const suggestedForScraping = await suggestNewHashtagsForScraping(
    campaignDescription,
    existingHashtags
  );

  return {
    campaign_description: campaignDescription,
    hashtag_style_query: normalizedHashtags.join(' '), // hashtags normalizadas via GPT
    total_seeds: seeds.length,
    seeds: seeds.map(s => s.hashtag_normalized),
    seeds_detalhadas: seeds,
    suggested_for_scraping: suggestedForScraping,
    metodologia: {
      busca: 'pgvector cosine distance (via hashtags normalizadas)',
      freq_minima: minFreq,
      similarity_minima: autoAdjustInfo.final_similarity,
      formula_score: 'similarity * ln(frequency + 1)',
      deterministic: true,
      hashtag_transform: true // GPT normaliza, mas NÃO seleciona
    },
    auto_adjust: autoAdjustInfo
  };
}

/**
 * Valida se seeds existem no banco com frequência adequada
 */
export async function validateSeeds(
  seeds: string[],
  minFreq: number = DEFAULT_MIN_FREQ
): Promise<ValidateSeedsResult> {
  if (!seeds || seeds.length === 0) {
    return { valid: [], invalid: [], frequencies: {} };
  }

  const normalizedSeeds = seeds.map(s =>
    s.toLowerCase().trim().replace(/^#/, '')
  );

  const { data, error } = await supabase.rpc('validate_seed_hashtags', {
    seed_list: normalizedSeeds,
    min_occurrence: minFreq
  });

  if (error) {
    console.error('Erro na RPC validate_seed_hashtags:', error);
    throw new Error(`Falha na validação: ${error.message}`);
  }

  const frequencies: Record<string, number> = {};
  const valid: string[] = [];

  for (const row of (data || [])) {
    frequencies[row.hashtag_normalized] = parseInt(row.occurrence_count);
    if (row.is_valid) {
      valid.push(row.hashtag_normalized);
    }
  }

  const foundSet = new Set(Object.keys(frequencies));
  const invalid = normalizedSeeds.filter(s => !foundSet.has(s) || !valid.includes(s));

  return { valid, invalid, frequencies };
}

/**
 * @deprecated Use suggestSeeds diretamente - cache é automático por padrão
 */
export async function suggestSeedsWithCache(
  campaignDescription: string,
  options: {
    minFreq?: number;
    minSimilarity?: number;
    maxResults?: number;
    autoAdjust?: boolean;
  } = {}
): Promise<SeedSuggestionResult> {
  // v4: cache não é mais necessário - embedding é determinístico
  return suggestSeeds(campaignDescription, options);
}
