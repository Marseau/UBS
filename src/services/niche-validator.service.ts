/**
 * NICHE VALIDATOR SERVICE V8
 *
 * Valida se um nicho tem massa crítica suficiente para clusterização.
 *
 * ATUALIZADO: Agora usa PostgreSQL pgvector para busca semântica,
 * consistente com o seed-suggester.service.ts
 *
 * Critérios de viabilidade:
 * - Mínimo 20-30 hashtags com freq >= 5
 * - Soma de unique_leads >= 100-200
 * - Pelo menos 5-10 hashtags com unique_leads >= 3
 * - Contact rate médio > 20-30%
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
 * Enriquece hashtags com freq_bio, freq_posts e whatsapp_rate
 * Busca dados em tempo real de instagram_leads
 */
async function enrichHashtagsWithStats(hashtags: string[]): Promise<Map<string, { freq_bio: number; freq_posts: number; whatsapp_rate: number }>> {
  if (hashtags.length === 0) return new Map();

  // Normalizar hashtags para busca
  const normalizedHashtags = hashtags.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const hashtagsArray = normalizedHashtags.map(h => `'${h}'`).join(',');

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_normalized AS (
        SELECT
          LOWER(REPLACE(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'), ' ', '_')) as hashtag_clean,
          id as lead_id,
          'bio' as source,
          (whatsapp_number IS NOT NULL) as has_whatsapp
        FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
        WHERE hashtags_bio IS NOT NULL
        UNION ALL
        SELECT
          LOWER(REPLACE(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'), ' ', '_')) as hashtag_clean,
          id as lead_id,
          'posts' as source,
          (whatsapp_number IS NOT NULL) as has_whatsapp
        FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
        WHERE hashtags_posts IS NOT NULL
      )
      SELECT
        hashtag_clean as hashtag,
        COUNT(*) FILTER (WHERE source = 'bio') as freq_bio,
        COUNT(*) FILTER (WHERE source = 'posts') as freq_posts,
        COUNT(DISTINCT lead_id) as unique_leads,
        COUNT(DISTINCT lead_id) FILTER (WHERE has_whatsapp) as leads_with_whatsapp,
        ROUND(COUNT(DISTINCT lead_id) FILTER (WHERE has_whatsapp)::numeric / NULLIF(COUNT(DISTINCT lead_id), 0)::numeric * 100, 1) as whatsapp_rate
      FROM hashtag_normalized
      WHERE hashtag_clean IN (${hashtagsArray})
      GROUP BY hashtag_clean
    `
  });

  if (error) {
    console.error('⚠️ Erro ao enriquecer hashtags:', error.message);
    return new Map();
  }

  const result = new Map<string, { freq_bio: number; freq_posts: number; whatsapp_rate: number }>();
  for (const row of (data || [])) {
    result.set(row.hashtag, {
      freq_bio: parseInt(row.freq_bio) || 0,
      freq_posts: parseInt(row.freq_posts) || 0,
      whatsapp_rate: parseFloat(row.whatsapp_rate) || 0
    });
  }

  return result;
}

/**
 * Gera embedding para um texto usando OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  });
  return response.data[0]?.embedding || [];
}

/**
 * Busca hashtags similares usando pgvector no PostgreSQL
 * Mesmo método usado no seed-suggester para consistência
 */
async function searchHashtagsByEmbedding(
  embedding: number[],
  limit: number = 150,
  minFreq: number = 5
): Promise<HashtagMetrics[]> {
  console.log(`   🔍 Buscando ${limit} hashtags similares via pgvector (freq >= ${minFreq})...`);

  const embeddingStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_similar_hashtags_with_metrics', {
    query_embedding: embeddingStr,
    match_count: limit,
    min_frequency: minFreq
  });

  if (error) {
    console.error('❌ Erro na busca pgvector:', error.message);

    // Fallback: busca direta sem RPC
    console.log('   🔄 Tentando busca direta...');
    return await searchHashtagsDirectSQL(embedding, limit, minFreq);
  }

  if (!data || data.length === 0) {
    console.log('   ⚠️ Nenhuma hashtag encontrada via RPC, tentando SQL direto...');
    return await searchHashtagsDirectSQL(embedding, limit, minFreq);
  }

  console.log(`   ✅ ${data.length} hashtags encontradas via pgvector`);

  return data.map((row: any) => ({
    hashtag: row.hashtag,
    freq_total: row.occurrence_count || 0,
    freq_bio: 0, // Não temos essa info na hashtag_embeddings
    freq_posts: 0,
    unique_leads: row.unique_leads || 0,
    leads_with_contact: row.leads_with_contact || 0,
    contact_rate: row.contact_rate || 0
  }));
}

/**
 * Busca direta via SQL quando RPC não está disponível
 * SIMPLIFICADO: Apenas busca hashtags similares, sem contar leads (muito lento)
 */
async function searchHashtagsDirectSQL(
  embedding: number[],
  limit: number,
  minFreq: number
): Promise<HashtagMetrics[]> {
  const embeddingStr = `[${embedding.join(',')}]`;

  // Query simples e rápida - apenas busca por similaridade
  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      SELECT
        hashtag,
        occurrence_count,
        1 - (embedding <=> '${embeddingStr}'::vector) as similarity
      FROM hashtag_embeddings
      WHERE embedding IS NOT NULL
        AND occurrence_count >= ${minFreq}
        AND is_active = true
      ORDER BY embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
    `
  });

  if (error) {
    console.error('❌ Erro na busca SQL direta:', error.message);
    return [];
  }

  console.log(`   ✅ ${(data || []).length} hashtags encontradas via SQL direto`);

  return (data || []).map((row: any) => ({
    hashtag: row.hashtag,
    freq_total: parseInt(row.occurrence_count) || 0,
    freq_bio: 0,
    freq_posts: 0,
    unique_leads: parseInt(row.occurrence_count) || 0, // Usa occurrence_count como proxy
    leads_with_contact: 0,
    contact_rate: 0
  }));
}

/**
 * Valida se um nicho tem massa crítica para clusterização
 * V8: Usa PostgreSQL pgvector para busca semântica (consistente com seed-suggester)
 */
export async function validateNiche(
  seeds: string[],
  criteria: ViabilityCriteria = DEFAULT_CRITERIA
): Promise<NicheValidationResult> {
  console.log(`\n🔍 [NICHE VALIDATOR V8] Validando nicho com seeds: [${seeds.join(', ')}]`);

  // Normalizar seeds
  const normalizedSeeds = seeds.map(normalizeString).filter(s => s.length > 0);

  if (normalizedSeeds.length === 0) {
    throw new Error('Nenhuma seed válida fornecida');
  }

  console.log(`   Seeds normalizadas: [${normalizedSeeds.join(', ')}] (${normalizedSeeds.length} seeds)`);

  // V8: BUSCA VIA POSTGRESQL PGVECTOR
  // 1. Primeiro, tentar encontrar embeddings das seeds no banco
  // 2. Se não encontrar, gerar embedding médio das seeds
  // 3. Buscar hashtags similares via pgvector

  console.log('   🔍 Buscando embeddings das seeds no PostgreSQL...');

  // Buscar embeddings existentes para as seeds (mesmo padrão do seed-suggester)
  const { data: seedEmbeddings, error: seedError } = await supabase
    .from('hashtag_embeddings')
    .select('hashtag_normalized, embedding, occurrence_count')
    .in('hashtag_normalized', normalizedSeeds)
    .not('embedding', 'is', null)
    .eq('is_active', true);

  let searchEmbedding: number[];
  const EMBEDDING_DIMENSIONS = 1536;

  if (seedEmbeddings && seedEmbeddings.length > 0) {
    console.log(`   ✅ ${seedEmbeddings.length}/${normalizedSeeds.length} seeds encontradas no banco`);

    // Parse embeddings (mesmo padrão do seed-suggester)
    const embeddings = seedEmbeddings
      .map((row: any) => {
        const emb = row.embedding;
        if (Array.isArray(emb)) return emb;
        if (typeof emb === 'string') {
          try {
            const parsed = JSON.parse(emb);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            // Fallback: parse string "[0.1,0.2,...]"
            const clean = emb.replace(/^\[|\]$/g, '');
            return clean.split(',').map(Number);
          }
        }
        return null;
      })
      .filter((e: any) => Array.isArray(e) && e.length === EMBEDDING_DIMENSIONS);

    if (embeddings.length > 0) {
      // Calcular média dos embeddings
      searchEmbedding = new Array(EMBEDDING_DIMENSIONS).fill(0);

      for (const emb of embeddings) {
        if (!emb) continue;
        for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
          searchEmbedding[i] = (searchEmbedding[i] || 0) + (emb[i] || 0);
        }
      }
      // Dividir pela quantidade para obter a média
      for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
        searchEmbedding[i] = (searchEmbedding[i] || 0) / embeddings.length;
      }
      console.log(`   📊 Embedding médio calculado de ${embeddings.length} seeds`);
    } else {
      // Fallback: gerar embedding do texto das seeds
      console.log('   🔄 Embeddings inválidos, gerando do texto...');
      const seedsText = normalizedSeeds.join(' ');
      searchEmbedding = await generateEmbedding(seedsText);
    }
  } else {
    // Nenhuma seed encontrada no banco, gerar embedding
    console.log('   ⚠️ Nenhuma seed no banco, gerando embedding do texto...');
    const seedsText = normalizedSeeds.join(' ');
    searchEmbedding = await generateEmbedding(seedsText);
  }

  // Buscar hashtags similares via pgvector
  const hashtags = await searchHashtagsByEmbedding(searchEmbedding, 150, 5);

  if (hashtags.length === 0) {
    console.log('   ⚠️ Nenhuma hashtag encontrada via pgvector');
    return {
      seeds: normalizedSeeds,
      criteria,
      totalHashtagsInNiche: 0,
      hashtagsWithFreq5: 0,
      hashtagsWithLeads3: 0,
      totalUniqueLeads: 0,
      totalLeadsWithContact: 0,
      averageContactRate: 0,
      isViable: false,
      passedCriteria: {
        hashtagsWithFreq5: false,
        uniqueLeads: false,
        hashtagsWithLeads3: false,
        contactRate: false
      },
      recommendations: ['Nenhuma hashtag encontrada para as seeds fornecidas. Tente seeds mais específicas.'],
      topHashtags: []
    };
  }

  console.log(`   📊 ${hashtags.length} hashtags encontradas via pgvector`);

  // Log das primeiras e últimas hashtags
  if (hashtags.length > 0) {
    const first = hashtags[0]!;
    const last = hashtags[hashtags.length - 1]!;
    console.log(`   📊 Primeira: "${first.hashtag}" (freq=${first.freq_total}, leads=${first.unique_leads})`);
    console.log(`   📊 Última: "${last.hashtag}" (freq=${last.freq_total}, leads=${last.unique_leads})`);
  }

  // Calcular WhatsApp rate real (baseado em whatsapp_number IS NOT NULL)
  console.log('   📱 Calculando WhatsApp rate...');

  const hashtagList = hashtags.map(h => h.hashtag);
  const hashtagsArray = `ARRAY['${hashtagList.join("','")}']::text[]`;

  const { data: contactRateData } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH leads_with_hashtags AS (
        SELECT DISTINCT id, whatsapp_number
        FROM (
          SELECT il.id, il.whatsapp_number,
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_norm
          FROM instagram_leads il, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT il.id, il.whatsapp_number,
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_norm
          FROM instagram_leads il, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
        ) expanded
        WHERE hashtag_norm = ANY(${hashtagsArray})
      )
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE whatsapp_number IS NOT NULL) as leads_with_whatsapp,
        ROUND(
          COUNT(*) FILTER (WHERE whatsapp_number IS NOT NULL)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as whatsapp_rate
      FROM leads_with_hashtags
    `
  });

  const realContactRate = parseFloat(contactRateData?.[0]?.whatsapp_rate) || 0;
  const realLeadsWithContact = parseInt(contactRateData?.[0]?.leads_with_whatsapp) || 0;
  const totalLeadsInNiche = parseInt(contactRateData?.[0]?.total_leads) || 0;
  console.log(`   📱 WhatsApp rate: ${realContactRate}% (${realLeadsWithContact}/${totalLeadsInNiche} leads)`);

  // Calcular métricas
  const hashtagsWithFreq5 = hashtags.filter(h => h.freq_total >= 5).length;
  const hashtagsWithLeads3 = hashtags.filter(h => h.unique_leads >= 3).length;
  const totalUniqueLeads = hashtags.reduce((sum, h) => sum + h.unique_leads, 0);
  const totalLeadsWithContact = realLeadsWithContact;
  const averageContactRate = realContactRate;

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

  // Enriquecer top 20 hashtags com freq_bio, freq_posts e whatsapp_rate
  const top20Hashtags = hashtags.slice(0, 20);
  const hashtagNames = top20Hashtags.map(h => h.hashtag);
  const enrichedStats = await enrichHashtagsWithStats(hashtagNames);

  // Atualizar hashtags com dados enriquecidos
  const enrichedHashtags = top20Hashtags.map(h => {
    const stats = enrichedStats.get(h.hashtag.toLowerCase());
    if (stats) {
      return {
        ...h,
        freq_bio: stats.freq_bio,
        freq_posts: stats.freq_posts,
        contact_rate: stats.whatsapp_rate // Usar whatsapp_rate como contact_rate
      };
    }
    return h;
  });

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
    topHashtags: enrichedHashtags,
    clusteringFeatures
  };

  // Log resumo
  console.log(`\n📊 [NICHE VALIDATOR V8] Resultado da validação:`);
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
