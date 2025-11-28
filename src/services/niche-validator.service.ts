/**
 * NICHE VALIDATOR SERVICE
 *
 * Valida se um nicho tem massa crítica suficiente para clusterização.
 * Trabalha com ocorrências (não hashtags agregadas) para preservar
 * a relação hashtag→lead e calcular métricas reais.
 *
 * Critérios de viabilidade:
 * - Mínimo 20-30 hashtags com freq >= 5
 * - Soma de unique_leads >= 100-200
 * - Pelo menos 5-10 hashtags com unique_leads >= 3
 * - Contact rate médio > 20-30%
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Critérios de viabilidade (configuráveis)
export interface ViabilityCriteria {
  minHashtagsWithFreq5: number;      // Mínimo de hashtags com freq >= 5
  minUniqueLeads: number;            // Mínimo de unique_leads no nicho
  minHashtagsWithLeads3: number;     // Mínimo de hashtags com unique_leads >= 3
  minContactRate: number;            // Contact rate mínimo (%)
}

export const DEFAULT_CRITERIA: ViabilityCriteria = {
  minHashtagsWithFreq5: 20,
  minUniqueLeads: 100,
  minHashtagsWithLeads3: 5,
  minContactRate: 20
};

export interface HashtagMetrics {
  hashtag: string;
  freq_total: number;
  freq_bio: number;
  freq_posts: number;
  unique_leads: number;
  leads_with_contact: number;
  contact_rate: number;
}

export interface NicheValidationResult {
  // Inputs
  seeds: string[];
  criteria: ViabilityCriteria;

  // Métricas do nicho
  totalHashtagsInNiche: number;
  hashtagsWithFreq5: number;
  hashtagsWithLeads3: number;
  totalUniqueLeads: number;
  totalLeadsWithContact: number;
  averageContactRate: number;

  // Validação
  isViable: boolean;
  passedCriteria: {
    hashtagsWithFreq5: boolean;
    uniqueLeads: boolean;
    hashtagsWithLeads3: boolean;
    contactRate: boolean;
  };

  // Recomendações
  recommendations: string[];

  // Top hashtags do nicho
  topHashtags: HashtagMetrics[];

  // Features para clustering (se viável)
  clusteringFeatures?: {
    hashtag: string;
    log_freq: number;
    log_leads: number;
    contact_rate: number;
  }[];
}

/**
 * Normaliza string removendo acentos e convertendo para lowercase
 */
function normalizeString(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Valida se um nicho tem massa crítica para clusterização
 */
export async function validateNiche(
  seeds: string[],
  criteria: ViabilityCriteria = DEFAULT_CRITERIA
): Promise<NicheValidationResult> {
  console.log(`\n🔍 [NICHE VALIDATOR] Validando nicho com seeds: [${seeds.join(', ')}]`);

  // Normalizar seeds
  const normalizedSeeds = seeds.map(normalizeString).filter(s => s.length > 0);

  if (normalizedSeeds.length === 0) {
    throw new Error('Nenhuma seed válida fornecida');
  }

  console.log(`   Seeds normalizadas: [${normalizedSeeds.join(', ')}]`);

  // Construir condição LIKE para cada seed
  const seedConditions = normalizedSeeds
    .map(seed => `hashtag_normalized LIKE '%${seed}%'`)
    .join(' OR ');

  // Query para buscar ocorrências e agregar por hashtag
  const { data: hashtagData, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_occurrences AS (
        -- Todas as ocorrências de hashtags com info do lead
        SELECT
          LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_normalized,
          hashtag as hashtag_original,
          source,
          lead_id,
          has_contact
        FROM (
          SELECT
            jsonb_array_elements_text(hashtags_bio) as hashtag,
            'bio' as source,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0

          UNION ALL

          SELECT
            jsonb_array_elements_text(hashtags_posts) as hashtag,
            'posts' as source,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
        ) raw
        WHERE hashtag IS NOT NULL AND hashtag != ''
      ),
      -- Filtrar por seeds do nicho
      niche_occurrences AS (
        SELECT * FROM hashtag_occurrences
        WHERE ${seedConditions}
      ),
      -- Agregar por hashtag normalizada
      niche_aggregated AS (
        SELECT
          hashtag_normalized as hashtag,
          COUNT(*) as freq_total,
          COUNT(*) FILTER (WHERE source = 'bio') as freq_bio,
          COUNT(*) FILTER (WHERE source = 'posts') as freq_posts,
          COUNT(DISTINCT lead_id) as unique_leads,
          COUNT(DISTINCT lead_id) FILTER (WHERE has_contact) as leads_with_contact
        FROM niche_occurrences
        GROUP BY hashtag_normalized
      )
      SELECT
        hashtag,
        freq_total,
        freq_bio,
        freq_posts,
        unique_leads,
        leads_with_contact,
        ROUND((leads_with_contact::numeric / NULLIF(unique_leads, 0)::numeric * 100)::numeric, 1) as contact_rate
      FROM niche_aggregated
      ORDER BY freq_total DESC
    `
  });

  if (error) {
    console.error('❌ Erro ao buscar dados do nicho:', error);
    throw error;
  }

  const hashtags: HashtagMetrics[] = (hashtagData || []).map((row: any) => ({
    hashtag: row.hashtag,
    freq_total: parseInt(row.freq_total) || 0,
    freq_bio: parseInt(row.freq_bio) || 0,
    freq_posts: parseInt(row.freq_posts) || 0,
    unique_leads: parseInt(row.unique_leads) || 0,
    leads_with_contact: parseInt(row.leads_with_contact) || 0,
    contact_rate: parseFloat(row.contact_rate) || 0
  }));

  console.log(`   📊 Total de hashtags no nicho: ${hashtags.length}`);

  // Calcular métricas
  const hashtagsWithFreq5 = hashtags.filter(h => h.freq_total >= 5).length;
  const hashtagsWithLeads3 = hashtags.filter(h => h.unique_leads >= 3).length;
  const totalUniqueLeads = hashtags.reduce((sum, h) => sum + h.unique_leads, 0);
  const totalLeadsWithContact = hashtags.reduce((sum, h) => sum + h.leads_with_contact, 0);
  const averageContactRate = totalUniqueLeads > 0
    ? (totalLeadsWithContact / totalUniqueLeads) * 100
    : 0;

  // Validar critérios
  const passedCriteria = {
    hashtagsWithFreq5: hashtagsWithFreq5 >= criteria.minHashtagsWithFreq5,
    uniqueLeads: totalUniqueLeads >= criteria.minUniqueLeads,
    hashtagsWithLeads3: hashtagsWithLeads3 >= criteria.minHashtagsWithLeads3,
    contactRate: averageContactRate >= criteria.minContactRate
  };

  const isViable = Object.values(passedCriteria).every(v => v);

  // Gerar recomendações
  const recommendations: string[] = [];

  if (!passedCriteria.hashtagsWithFreq5) {
    recommendations.push(
      `Apenas ${hashtagsWithFreq5} hashtags com freq >= 5 (mínimo: ${criteria.minHashtagsWithFreq5}). ` +
      `Expanda as seeds com sinônimos, plurais, gírias ou variantes.`
    );
  }

  if (!passedCriteria.uniqueLeads) {
    recommendations.push(
      `Apenas ${totalUniqueLeads} leads únicos no nicho (mínimo: ${criteria.minUniqueLeads}). ` +
      `Colete mais dados via scraping de hashtags relacionadas.`
    );
  }

  if (!passedCriteria.hashtagsWithLeads3) {
    recommendations.push(
      `Apenas ${hashtagsWithLeads3} hashtags com >= 3 leads (mínimo: ${criteria.minHashtagsWithLeads3}). ` +
      `Falta densidade para formar clusters significativos.`
    );
  }

  if (!passedCriteria.contactRate) {
    recommendations.push(
      `Contact rate médio de ${averageContactRate.toFixed(1)}% (mínimo: ${criteria.minContactRate}%). ` +
      `Nicho com baixa qualidade de leads para outreach.`
    );
  }

  if (isViable) {
    recommendations.push('✅ Nicho viável para clusterização!');
  }

  // Preparar features para clustering (se viável)
  let clusteringFeatures;
  if (isViable) {
    clusteringFeatures = hashtags
      .filter(h => h.freq_total >= 5 && h.unique_leads >= 2)
      .map(h => ({
        hashtag: h.hashtag,
        log_freq: Math.log1p(h.freq_total),
        log_leads: Math.log1p(h.unique_leads),
        contact_rate: h.contact_rate
      }));
  }

  const result: NicheValidationResult = {
    seeds: normalizedSeeds,
    criteria,
    totalHashtagsInNiche: hashtags.length,
    hashtagsWithFreq5,
    hashtagsWithLeads3,
    totalUniqueLeads,
    totalLeadsWithContact,
    averageContactRate: parseFloat(averageContactRate.toFixed(1)),
    isViable,
    passedCriteria,
    recommendations,
    topHashtags: hashtags.slice(0, 20),
    clusteringFeatures
  };

  // Log resumo
  console.log(`\n📊 [NICHE VALIDATOR] Resultado da validação:`);
  console.log(`   🏷️  Hashtags no nicho: ${hashtags.length}`);
  console.log(`   📈 Hashtags com freq >= 5: ${hashtagsWithFreq5} (min: ${criteria.minHashtagsWithFreq5}) ${passedCriteria.hashtagsWithFreq5 ? '✅' : '❌'}`);
  console.log(`   👥 Unique leads: ${totalUniqueLeads} (min: ${criteria.minUniqueLeads}) ${passedCriteria.uniqueLeads ? '✅' : '❌'}`);
  console.log(`   🔗 Hashtags com >= 3 leads: ${hashtagsWithLeads3} (min: ${criteria.minHashtagsWithLeads3}) ${passedCriteria.hashtagsWithLeads3 ? '✅' : '❌'}`);
  console.log(`   📧 Contact rate médio: ${averageContactRate.toFixed(1)}% (min: ${criteria.minContactRate}%) ${passedCriteria.contactRate ? '✅' : '❌'}`);
  console.log(`   ${isViable ? '✅ NICHO VIÁVEL' : '❌ NICHO NÃO VIÁVEL'}`);

  return result;
}

/**
 * Lista seeds sugeridas para expandir um nicho
 */
export async function suggestSeedExpansion(currentSeeds: string[]): Promise<string[]> {
  const normalizedSeeds = currentSeeds.map(normalizeString);

  // Buscar hashtags que contêm as seeds atuais e extrair padrões
  const seedConditions = normalizedSeeds
    .map(seed => `hashtag_normalized LIKE '%${seed}%'`)
    .join(' OR ');

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_occurrences AS (
        SELECT
          LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_normalized
        FROM (
          SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM instagram_leads WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM instagram_leads WHERE hashtags_posts IS NOT NULL
        ) raw
        WHERE hashtag IS NOT NULL AND hashtag != ''
      ),
      niche_hashtags AS (
        SELECT hashtag_normalized, COUNT(*) as freq
        FROM hashtag_occurrences
        WHERE ${seedConditions}
        GROUP BY hashtag_normalized
        HAVING COUNT(*) >= 3
        ORDER BY freq DESC
        LIMIT 100
      )
      SELECT hashtag_normalized FROM niche_hashtags
    `
  });

  if (error) {
    console.error('Erro ao buscar sugestões:', error);
    return [];
  }

  // Extrair palavras-chave comuns das hashtags encontradas
  const wordFreq: Record<string, number> = {};

  for (const row of data || []) {
    const hashtag = row.hashtag_normalized;
    // Quebrar hashtag em possíveis palavras (heurística simples)
    const words = hashtag.match(/[a-z]{4,}/g) || [];
    for (const word of words) {
      if (!normalizedSeeds.includes(word) && word.length >= 4) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
  }

  // Retornar top palavras como sugestões
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export const nicheValidatorService = {
  validateNiche,
  suggestSeedExpansion,
  DEFAULT_CRITERIA
};
