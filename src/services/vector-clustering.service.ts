/**
 * VECTOR CLUSTERING SERVICE
 *
 * Clustering de leads usando embeddings e cosine similarity via pgvector.
 * Substitui o clustering por hashtags com clustering semântico mais preciso.
 *
 * Benefícios:
 * - 10x mais rápido que GPT-4 para classificação
 * - Clustering semântico real (não apenas Jaccard de hashtags)
 * - Busca por similaridade via HNSW index
 * - Custo: ~$0.00002 por lead (vs $0.01+ com GPT-4)
 *
 * Operadores pgvector:
 * - <=> : cosine distance (1 - similarity)
 * - <-> : L2 distance (euclidean)
 * - <#> : inner product (negative)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeSeedString(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_') // manter underscores para alinhar com hashtags salvas
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .trim();
}

// ============================================
// SEGURANÇA: Validação de inputs para SQL
// ============================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_REGEX = /^[A-Z]{2}$/;
const EXPECTED_EMBEDDING_DIM = 1536; // text-embedding-3-small

/**
 * Valida e sanitiza UUID para uso em SQL
 * Previne SQL injection
 */
function validateUUID(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid UUID: must be a non-empty string');
  }
  const trimmed = id.trim();
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`Invalid UUID format: ${trimmed.substring(0, 50)}`);
  }
  return trimmed;
}

/**
 * Valida número para uso em SQL
 */
function validateNumber(value: number, min: number, max: number, name: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

/**
 * Valida estado brasileiro (2 letras maiúsculas)
 */
function validateState(state: string): string {
  const upper = state.toUpperCase().trim();
  if (!STATE_REGEX.test(upper)) {
    throw new Error(`Invalid state code: ${state}`);
  }
  return upper;
}

/**
 * Valida array de estados
 */
function validateStates(states: string[]): string[] {
  if (!Array.isArray(states)) return [];
  return states.map(validateState);
}

/**
 * Valida embedding: deve ser array de números com dimensão correta
 */
function validateEmbedding(embedding: number[]): number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }
  if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
    throw new Error(`Embedding must have ${EXPECTED_EMBEDDING_DIM} dimensions, got ${embedding.length}`);
  }
  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== 'number' || isNaN(embedding[i]!)) {
      throw new Error(`Embedding contains invalid value at index ${i}`);
    }
  }
  return embedding;
}

/**
 * Normaliza valor jsonb para array, cobrindo todos os formatos possíveis:
 * - null/undefined → []
 * - array → array
 * - string JSON → parsed array
 * - object (jsonb raro) → Object.values()
 */
function normalizeArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value) ?? []; } catch { return []; }
  }
  // jsonb pode virar objeto {0: "...", 1: "..."} raramente
  if (typeof value === 'object') return Object.values(value);
  return [];
}

/**
 * Verifica se lead tem contato válido (WhatsApp, email ou phone)
 * Usa normalizeArray para tratar todos os formatos jsonb possíveis
 */
function hasValidContact(lead: any): boolean {
  // WhatsApp é string direta
  if (typeof lead?.whatsapp_number === 'string' && lead.whatsapp_number.length > 5) {
    return true;
  }

  // Emails (filtra strings válidas para evitar falsos positivos de jsonb estranho)
  const emails = normalizeArray(lead?.emails_normalized)
    .filter(v => typeof v === 'string' && v.length > 3);
  if (emails.length > 0) return true;

  // Phones (filtra strings válidas para evitar falsos positivos de jsonb estranho)
  const phones = normalizeArray(lead?.phones_normalized)
    .filter(v => typeof v === 'string' && v.length > 3);
  if (phones.length > 0) return true;

  return false;
}

// ============================================
// TIPOS E INTERFACES
// ============================================

/**
 * Filtros para clustering
 * - target_states: Filtrar por estados brasileiros (ex: ["SP", "RJ", "MG"])
 * - lead_max_age_days: Idade máxima dos leads em dias (default: 45)
 * - hashtag_max_age_days: Idade máxima das hashtags em dias (default: 90)
 */
export interface ClusteringFilters {
  target_states?: string[];      // Estados brasileiros para filtrar
  lead_max_age_days?: number;    // Máximo 45 dias para leads
  hashtag_max_age_days?: number; // Máximo 90 dias para hashtags
  max_leads?: number;            // Limite de leads desejados (default: 2000)
}

// Valores padrão para filtros de recência
export const DEFAULT_LEAD_MAX_AGE_DAYS = 45;
export const DEFAULT_HASHTAG_MAX_AGE_DAYS = 90;

export interface VectorClusterResult {
  cluster_id: number;
  cluster_name: string;
  centroid_lead: {
    id: string;
    username: string;
    embedding_text: string;
  };
  leads: VectorClusteredLead[];
  avg_similarity: number;
  total_leads: number;
  leads_with_contact: number;
  contact_rate: number;
  top_professions: string[];
  top_cities: string[];
}

export interface VectorClusteredLead {
  id: string;
  username: string;
  full_name: string | null;
  profession: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  whatsapp_number?: string | null;
  // Pode ser array (do Supabase client) ou string JSON (do execute_sql)
  emails_normalized: string[] | string | null;
  phones_normalized: string[] | string | null;
  followers_count: number;
  similarity_to_centroid: number;
  embedding_text: string | null;
}

export interface VectorClusteringResult {
  success: boolean;
  error?: string;
  campaign_id?: string;
  total_leads_analyzed: number;
  total_leads_embedded: number;
  clusters: VectorClusterResult[];
  execution_time_ms: number;
  method: 'kmeans_vector' | 'hdbscan_approx' | 'graph_hnsw';
  // Métricas de qualidade (nomes semânticos corretos)
  cohesion_centroid: number;      // KPI PRINCIPAL: avg(sim(lead, centroid)) - o que otimizamos
  silhouette_approx?: number;     // DIAGNÓSTICO: (b-a)/max(a,b) amostrado - instável
  avg_intra_similarity?: number;  // @deprecated - usar cohesion_centroid
}

export interface SimilarLeadResult {
  id: string;
  username: string;
  full_name: string | null;
  profession: string | null;
  city: string | null;
  similarity: number;
  embedding_text: string | null;
}

// ============================================
// FUNÇÕES DE BUSCA POR SIMILARIDADE
// ============================================

/**
 * Busca leads mais similares a um lead de referência usando cosine similarity
 */
export async function findSimilarLeads(
  referenceLeadId: string,
  limit: number = 50,
  minSimilarity: number = 0.7
): Promise<SimilarLeadResult[]> {
  const { data, error } = await supabase.rpc('find_similar_leads', {
    reference_lead_id: referenceLeadId,
    match_count: limit,
    min_similarity: minSimilarity
  });

  if (error) {
    // Se a função não existir, criar inline query
    console.log('   ⚠️ RPC find_similar_leads não existe, usando query direta');
    return findSimilarLeadsInline(referenceLeadId, limit, minSimilarity);
  }

  return data || [];
}

/**
 * Query inline para busca de similaridade (fallback)
 * Usa tabela separada lead_embeddings
 * SEGURANÇA: Inputs validados antes de uso em SQL
 */
async function findSimilarLeadsInline(
  referenceLeadId: string,
  limit: number,
  minSimilarity: number
): Promise<SimilarLeadResult[]> {
  // Validar inputs para prevenir SQL injection
  const safeLeadId = validateUUID(referenceLeadId);
  const safeLimit = validateNumber(limit, 1, 1000, 'limit');
  const safeSimilarity = validateNumber(minSimilarity, 0, 1, 'minSimilarity');

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH reference AS (
        SELECT COALESCE(embedding_final, embedding_bio) AS embedding
        FROM lead_embeddings
        WHERE lead_id = '${safeLeadId}'::uuid
      )
      SELECT
        il.id,
        il.username,
        il.full_name,
        il.profession,
        il.city,
        1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> ref.embedding) as similarity,
        le.embedding_bio_text as embedding_text
      FROM instagram_leads il
      INNER JOIN lead_embeddings le ON le.lead_id = il.id, reference ref
      WHERE COALESCE(le.embedding_final, le.embedding_bio) IS NOT NULL
        AND il.id != '${safeLeadId}'::uuid
        AND 1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> ref.embedding) >= ${safeSimilarity}
      ORDER BY COALESCE(le.embedding_final, le.embedding_bio) <=> ref.embedding
      LIMIT ${safeLimit}
    `
  });

  if (error) throw error;
  // Verificar se resultado é erro da função SQL
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    throw new Error(`SQL Error: ${data.error}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Busca leads similares a um texto/query usando embedding
 * Usa tabela separada lead_embeddings
 * SEGURANÇA: Embedding validado antes de uso em SQL
 */
export async function findLeadsByQuery(
  queryEmbedding: number[],
  limit: number = 50,
  minSimilarity: number = 0.6
): Promise<SimilarLeadResult[]> {
  // Validar inputs
  const safeEmbedding = validateEmbedding(queryEmbedding);
  const safeLimit = validateNumber(limit, 1, 1000, 'limit');
  const safeSimilarity = validateNumber(minSimilarity, 0, 1, 'minSimilarity');

  // Embedding já validado - apenas números, seguro para SQL
  const embeddingStr = `[${safeEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      SELECT
        il.id,
        il.username,
        il.full_name,
        il.profession,
        il.city,
        1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> '${embeddingStr}'::vector) as similarity,
        le.embedding_bio_text as embedding_text
      FROM instagram_leads il
      INNER JOIN lead_embeddings le ON le.lead_id = il.id
      WHERE COALESCE(le.embedding_final, le.embedding_bio) IS NOT NULL
        AND 1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> '${embeddingStr}'::vector) >= ${safeSimilarity}
      ORDER BY COALESCE(le.embedding_final, le.embedding_bio) <=> '${embeddingStr}'::vector
      LIMIT ${safeLimit}
    `
  });

  if (error) throw error;
  // Verificar se resultado é erro da função SQL
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    throw new Error(`SQL Error: ${data.error}`);
  }
  return Array.isArray(data) ? data : [];
}

// ============================================
// CLUSTERING VIA SIMILARIDADE
// ============================================

/**
 * Agrupa leads por similaridade usando centróides selecionados
 * Algoritmo: Greedy centroid selection + assignment
 *
 * @param campaignId - ID da campanha (opcional)
 * @param numClusters - Número de clusters desejados
 * @param minLeadsPerCluster - Mínimo de leads por cluster
 * @param similarityThreshold - Threshold de similaridade
 * @param filters - Filtros de localização e recência
 */
export async function clusterBySimilarity(
  campaignId?: string,
  requestedK: number = 5,
  similarityThreshold: number = 0.65,
  filters: ClusteringFilters = {},
  seeds: string[] = [],
  minLeadsPerCluster: number = 1
): Promise<VectorClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [VECTOR CLUSTERING] Iniciando clustering por similaridade`);

  // Aplicar valores padrão para filtros de recência
  // Validar parâmetros numéricos (limites rígidos conforme CLAUDE.md: leads 45d, hashtags 90d)
  const leadMaxAgeDays = validateNumber(
    filters.lead_max_age_days ?? DEFAULT_LEAD_MAX_AGE_DAYS,
    1, 45, 'lead_max_age_days'
  );
  const hashtagMaxAgeDays = validateNumber(
    filters.hashtag_max_age_days ?? DEFAULT_HASHTAG_MAX_AGE_DAYS,
    1, 90, 'hashtag_max_age_days'
  );
  // Limite de leads desejados (default: 2000)
  const maxLeads = validateNumber(
    filters.max_leads ?? 2000,
    100, 10000, 'max_leads'
  );

  // Validar estados (previne SQL injection)
  const safeStates = filters.target_states ? validateStates(filters.target_states) : [];
  const normalizedSeeds = seeds.map(s => normalizeSeedString(s)).filter(s => s.length > 0);
  const hasSeeds = normalizedSeeds.length > 0;

  // Log dos filtros aplicados
  console.log(`   📍 Filtros de recência: leads ≤${leadMaxAgeDays}d, hashtags ≤${hashtagMaxAgeDays}d`);
  console.log(`   📊 Limite de leads: ${maxLeads}`);
  if (safeStates.length > 0) {
    console.log(`   🗺️  Filtro de estados: [${safeStates.join(', ')}]`);
  }
  if (hasSeeds) {
    console.log(`   🎯 Filtro de seeds (hashtags): [${normalizedSeeds.join(', ')}]`);
  }

  // 1. Construir cláusula WHERE com filtros
  const whereConditions: string[] = [
    'COALESCE(le.embedding_final, le.embedding_bio) IS NOT NULL',
    'il.bio IS NOT NULL',
    // Filtro de recência: leads criados/atualizados nos últimos N dias
    `(il.created_at >= NOW() - INTERVAL '${leadMaxAgeDays} days' OR il.updated_at >= NOW() - INTERVAL '${leadMaxAgeDays} days')`,
    // Filtro de recência para embeddings/hashtags
    `(le.created_at >= NOW() - INTERVAL '${hashtagMaxAgeDays} days' OR le.updated_at >= NOW() - INTERVAL '${hashtagMaxAgeDays} days')`
  ];

  // Filtro de estados (já validados)
  if (safeStates.length > 0) {
    const statesArray = safeStates.map(s => `'${s}'`).join(', ');
    whereConditions.push(`(il.state IN (${statesArray}))`);
  }

  // REMOVIDO: Filtro exato de seeds em hashtags
  // A clusterização agora usa APENAS semântica (embeddings de perfil)
  // Seeds são usados apenas para logging/contexto, não para filtrar leads
  // Isso permite que o clustering encontre TODOS os leads semanticamente similares
  // ao invés de apenas os que têm hashtags exatas
  if (hasSeeds) {
    console.log(`   📝 Seeds fornecidas (apenas contexto, sem filtro): [${seeds.join(', ')}]`);
  }

  // NOTA: Não filtrar por campaign_leads aqui.
  // O campaignId é usado apenas para SALVAR o resultado, não para filtrar.
  // O filtro de leads associados deve ser feito no pipeline de captura, não no clustering.

  const whereClause = whereConditions.join(' AND ');

  // Primeiro: contar quantos leads passam pelos filtros (para diagnósticos)
  const { data: countsData, error: countsError } = await supabase.rpc('execute_sql', {
    query_text: `
      
      SELECT
        COUNT(*) AS total_after_filters,
        COUNT(*) FILTER (WHERE (
          il.whatsapp_number IS NOT NULL
          OR COALESCE(il.emails_normalized, '[]'::jsonb) != '[]'::jsonb
          OR COALESCE(il.phones_normalized, '[]'::jsonb) != '[]'::jsonb
        )) AS total_with_contact,
        COUNT(*) FILTER (WHERE (
          il.whatsapp_number IS NULL
          AND COALESCE(il.emails_normalized, '[]'::jsonb) = '[]'::jsonb
          AND COALESCE(il.phones_normalized, '[]'::jsonb) = '[]'::jsonb
        )) AS total_without_contact
      FROM instagram_leads il
      INNER JOIN lead_embeddings le ON le.lead_id = il.id
      WHERE ${whereClause}
    `
  });

  if (countsError) {
    console.error('⚠️ [VECTOR CLUSTERING] Erro Supabase (counts):', countsError);
    throw countsError;
  }

  const countsRow = Array.isArray(countsData) && countsData.length > 0 ? countsData[0] : { total_after_filters: 0, total_with_contact: 0, total_without_contact: 0 };
  console.log(`   📊 Debug filtros -> total=${countsRow.total_after_filters} | contato=${countsRow.total_with_contact} | sem_contato=${countsRow.total_without_contact}`);

  if ((countsRow.total_after_filters || 0) === 0) {
    return {
      success: false,
      error: `Leads insuficientes após filtros (total=${countsRow.total_after_filters})`,
      campaign_id: campaignId,
      total_leads_analyzed: 0,
      total_leads_embedded: 0,
      clusters: [],
      execution_time_ms: Date.now() - startTime,
      method: 'kmeans_vector',
      cohesion_centroid: 0,
      silhouette_approx: 0
    };
  }

  // Busca leads com embedding (prioriza quem tem contato - incluindo WhatsApp)
  const { data: leads, error } = await supabase.rpc('execute_sql', {
    query_text: `
      SELECT
        il.id, il.username, il.full_name, il.profession, il.city, il.state,
        il.bio, il.emails_normalized, il.phones_normalized, il.whatsapp_number, il.followers_count,
        le.embedding_bio_text as embedding_text,
        COALESCE(le.embedding_final, le.embedding_bio)::text as embedding_str
      FROM instagram_leads il
      INNER JOIN lead_embeddings le ON le.lead_id = il.id
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN (
          il.whatsapp_number IS NOT NULL
          OR COALESCE(il.emails_normalized, '[]'::jsonb) != '[]'::jsonb
          OR COALESCE(il.phones_normalized, '[]'::jsonb) != '[]'::jsonb
        ) THEN 0 ELSE 1 END,
        il.followers_count DESC NULLS LAST
      LIMIT ${maxLeads}
    `
  });

  if (error) {
    console.error('⚠️ [VECTOR CLUSTERING] Erro Supabase:', error);
    throw error;
  }

  // Verificar se resultado é erro da função SQL
  if (leads && typeof leads === 'object' && !Array.isArray(leads) && leads.error) {
    throw new Error(`SQL Error: ${leads.error}`);
  }

  const leadsWithEmbedding = Array.isArray(leads) ? leads : [];
  console.log(`   📊 ${leadsWithEmbedding.length} leads com embedding`);

  // Ajustar K de forma dinâmica se o volume for menor que K * minLeadsPerCluster
  let k = requestedK || 1;
  if (k < 1) k = 1;
  const minRequired = k * Math.max(1, minLeadsPerCluster);
  if (leadsWithEmbedding.length < minRequired) {
    k = Math.max(1, Math.floor(leadsWithEmbedding.length / Math.max(1, minLeadsPerCluster)));
    if (k < 1 && leadsWithEmbedding.length > 0) {
      k = 1;
    }
    console.log(`   ⚠️ Ajustando K automático por volume: K=${k} (requested=${requestedK}, leads=${leadsWithEmbedding.length})`);
  }

  if (leadsWithEmbedding.length === 0) {
    return {
      success: false,
      error: `Leads insuficientes: 0`,
      campaign_id: campaignId,
      total_leads_analyzed: 0,
      total_leads_embedded: 0,
      clusters: [],
      execution_time_ms: Date.now() - startTime,
      method: 'kmeans_vector',
      cohesion_centroid: 0,
      silhouette_approx: 0
    };
  }

  // 2. Selecionar centróides iniciais (leads mais diversos)
  console.log(`   🎯 Selecionando ${k} centróides iniciais...`);
  const initialCentroids = await selectDiverseCentroids(leadsWithEmbedding, k);
  console.log(`   ✅ Centróides iniciais: ${initialCentroids.map(c => '@' + c.username).join(', ')}`);

  // Preparar embeddings parseados para todos os leads
  const leadsWithParsedEmbedding = leadsWithEmbedding
    .map(lead => ({
      ...lead,
      parsedEmbedding: parseEmbedding(lead.embedding_str)
    }))
    .filter(lead => lead.parsedEmbedding !== null);

  // Diagnóstico de embeddings: quantos parseados com sucesso vs descartados
  const embeddingsDiscarded = leadsWithEmbedding.length - leadsWithParsedEmbedding.length;
  const discardRate = leadsWithEmbedding.length > 0
    ? ((embeddingsDiscarded / leadsWithEmbedding.length) * 100).toFixed(1)
    : '0';
  console.log(`   📊 Embeddings: ${leadsWithParsedEmbedding.length} OK, ${embeddingsDiscarded} descartados (${discardRate}%)`);
  if (embeddingsDiscarded > leadsWithEmbedding.length * 0.1) {
    console.warn(`   ⚠️ Alta taxa de descarte de embeddings (>10%) - verificar formato do embedding_str`);
  }

  // Inicializar centróides como embeddings
  let centroidEmbeddings: number[][] = initialCentroids
    .map(c => parseEmbedding(c.embedding_str))
    .filter((e): e is number[] => e !== null);

  // 3. KMeans Iterativo - 5 iterações de refinamento
  const MAX_ITERATIONS = 5;
  let assignments: Map<number, { lead: any; embedding: number[]; similarity: number }[]> = new Map();
  let previousAssignmentsStr = ''; // String direta para comparação eficiente
  let cohesionCentroid = 0;    // KPI PRINCIPAL: avg(sim(lead, centroid))
  let silhouetteApprox = 0;    // DIAGNÓSTICO: (b-a)/max(a,b) amostrado

  console.log(`   🔄 Iniciando KMeans iterativo (máx ${MAX_ITERATIONS} iterações)...`);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Reset assignments
    assignments = new Map();
    for (let i = 0; i < k; i++) {
      assignments.set(i, []);
    }

    // Atribuir cada lead ao centróide mais similar
    for (const lead of leadsWithParsedEmbedding) {
      const leadEmbedding = lead.parsedEmbedding!;
      let bestCluster = 0;
      let bestSimilarity = -1;

    for (let i = 0; i < centroidEmbeddings.length; i++) {
      const centroidEmb = centroidEmbeddings[i];
      if (!centroidEmb) continue;

        const similarity = cosineSimilarity(leadEmbedding, centroidEmb);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCluster = i;
        }
      }

      assignments.get(bestCluster)!.push({
        lead,
        embedding: leadEmbedding,
        similarity: bestSimilarity
      });
    }

    // Verificar convergência (mesmas atribuições)
    const currentAssignmentsStr = Array.from(assignments.entries())
      .flatMap(([clusterId, items]) => items.map(item => `${clusterId}:${item.lead.id}`))
      .sort()
      .join(',');

    if (currentAssignmentsStr === previousAssignmentsStr) {
      console.log(`   ✅ Convergiu na iteração ${iteration + 1}`);
      break;
    }
    previousAssignmentsStr = currentAssignmentsStr;

    // Recalcular centróides como média dos embeddings do cluster
    const newCentroidEmbeddings: number[][] = [];
    for (let i = 0; i < k; i++) {
      const clusterItems = assignments.get(i) || [];
      if (clusterItems.length > 0) {
        const clusterEmbeddings = clusterItems.map(item => item.embedding);
        newCentroidEmbeddings.push(computeCentroidEmbedding(clusterEmbeddings));
      } else {
        // Cluster vazio: reseed com o lead mais distante de todos os centróides atuais
        // Isso evita centróides vazios que causam similarity 0
        let maxMinDistance = -1;
        let bestReseedEmbedding: number[] | null = null;

        for (const lead of leadsWithParsedEmbedding) {
          const leadEmb = lead.parsedEmbedding!;
          // Calcular distância mínima a qualquer centróide existente
          let minDist = Infinity;
          for (const ce of centroidEmbeddings) {
            if (ce && ce.length > 0) {
              const dist = 1 - cosineSimilarity(leadEmb, ce);
              if (dist < minDist) minDist = dist;
            }
          }
          // Escolher o lead com maior distância mínima (mais isolado)
          if (minDist > maxMinDistance && minDist !== Infinity) {
            maxMinDistance = minDist;
            bestReseedEmbedding = leadEmb;
          }
        }

        if (bestReseedEmbedding) {
          console.log(`   ⚠️ Cluster ${i} vazio - reseed com lead mais distante (dist=${maxMinDistance.toFixed(3)})`);
          newCentroidEmbeddings.push(bestReseedEmbedding);
        } else {
          // Fallback: manter anterior se nenhum candidato encontrado
          newCentroidEmbeddings.push(centroidEmbeddings[i] || []);
        }
      }
    }
    centroidEmbeddings = newCentroidEmbeddings;

    console.log(`   📍 Iteração ${iteration + 1}: ${Array.from(assignments.values()).map(a => a.length).join(', ')} leads/cluster`);
  }

  // 4. Calcular métricas de qualidade
  // 4a. COHESION CENTROID (KPI PRINCIPAL): avg(sim(lead, centroid)) - determinístico
  const cohesionAssignments: Map<number, { embedding: number[]; similarity: number }[]> = new Map();
  for (const [clusterId, items] of assignments.entries()) {
    cohesionAssignments.set(clusterId, items.map(item => ({
      embedding: item.embedding,
      similarity: item.similarity
    })));
  }
  const cohesionResult = computeCohesionCentroid(cohesionAssignments, centroidEmbeddings);
  cohesionCentroid = cohesionResult.global;

  // Log cohesion por cluster
  console.log(`   📊 Cohesion (centroid) - KPI PRINCIPAL:`);
  for (const stat of cohesionResult.perCluster) {
    console.log(`      Cluster ${stat.clusterId}: ${(stat.cohesion * 100).toFixed(1)}% (n=${stat.count})`);
  }
  console.log(`      → Global: ${(cohesionCentroid * 100).toFixed(1)}%`);

  // 4b. SILHOUETTE APPROX (DIAGNÓSTICO): instável, apenas para referência
  const silhouetteAssignments: Map<number, { embedding: number[]; leadId: string }[]> = new Map();
  for (const [clusterId, items] of assignments.entries()) {
    silhouetteAssignments.set(clusterId, items.map(item => ({
      embedding: item.embedding,
      leadId: item.lead.id
    })));
  }
  silhouetteApprox = computeSilhouetteScore(silhouetteAssignments, centroidEmbeddings);
  console.log(`   📊 Silhouette approx (diagnóstico): ${silhouetteApprox.toFixed(3)}`);

  // 5. Converter assignments para formato final
  const clusters: Map<number, VectorClusteredLead[]> = new Map();
  for (let i = 0; i < k; i++) {
    clusters.set(i, []);
  }

  let leadsFilteredByThreshold = 0;
  for (const [clusterId, items] of assignments.entries()) {
    for (const item of items) {
      // Filtrar leads cuja similaridade ao centróide seja menor que o threshold
      if (item.similarity < similarityThreshold) {
        leadsFilteredByThreshold++;
        continue;
      }
      clusters.get(clusterId)!.push({
        id: item.lead.id,
        username: item.lead.username,
        full_name: item.lead.full_name,
        profession: item.lead.profession,
        city: item.lead.city,
        state: item.lead.state,
        bio: item.lead.bio,
        whatsapp_number: item.lead.whatsapp_number ?? null,
        emails_normalized: item.lead.emails_normalized,
        phones_normalized: item.lead.phones_normalized,
        followers_count: item.lead.followers_count || 0,
        similarity_to_centroid: item.similarity,
        embedding_text: item.lead.embedding_text
      });
    }
  }

  if (leadsFilteredByThreshold > 0) {
    console.log(`   🔻 ${leadsFilteredByThreshold} leads filtrados por similaridade < ${similarityThreshold}`);
  }

  // Encontrar lead mais próximo ao centróide calculado para representar cada cluster
  const representativeLeads: any[] = [];
  for (let i = 0; i < k; i++) {
    const clusterItems = assignments.get(i) || [];
    if (clusterItems.length === 0) {
      representativeLeads.push(initialCentroids[i]);
      continue;
    }

    // Lead com maior similaridade ao centróide médio
    const firstItem = clusterItems[0];
    if (!firstItem) {
      representativeLeads.push(initialCentroids[i]);
      continue;
    }
    let bestLead = firstItem.lead;
    let bestSim = -1;
    const centroidEmb = centroidEmbeddings[i];
    if (centroidEmb) {
      for (const item of clusterItems) {
        const sim = cosineSimilarity(item.embedding, centroidEmb);
        if (sim > bestSim) {
          bestSim = sim;
          bestLead = item.lead;
        }
      }
    }
    representativeLeads.push(bestLead);
  }

  // 6. Montar resultado dos clusters
  console.log(`   📊 Gerando estatísticas dos clusters...`);
  const clusterResults: VectorClusterResult[] = [];

  for (let i = 0; i < k; i++) {
    const clusterLeads = clusters.get(i) || [];
    const representativeLead = representativeLeads[i];
    if (!representativeLead || clusterLeads.length === 0) continue;
    // Respeitar mínimo de leads por cluster antes de incluir no resultado
    if (clusterLeads.length < minLeadsPerCluster) continue;

    // Debug: ver raw data do primeiro lead
    if (i === 0 && clusterLeads.length > 0) {
      const sample = clusterLeads[0]!;
      console.log(`   🔍 [DEBUG] Sample lead emails_normalized:`, typeof sample.emails_normalized, sample.emails_normalized);
      console.log(`   🔍 [DEBUG] Sample lead phones_normalized:`, typeof sample.phones_normalized, sample.phones_normalized);
    }
    // Usar hasValidContact() para consistência (inclui WhatsApp)
    const leadsWithContact = clusterLeads.filter(l => hasValidContact(l)).length;
    const contactRate = clusterLeads.length > 0 ? (leadsWithContact / clusterLeads.length * 100) : 0;
    console.log(`   📧 [DEBUG] Cluster ${i}: ${leadsWithContact}/${clusterLeads.length} = ${contactRate.toFixed(1)}% contact`);
    const avgSimilarity = clusterLeads.reduce((sum, l) => sum + l.similarity_to_centroid, 0) / clusterLeads.length;

    // Top profissões e cidades
    const professions = countOccurrences(clusterLeads.map(l => l.profession).filter(Boolean) as string[]);
    const cities = countOccurrences(clusterLeads.map(l => l.city).filter(Boolean) as string[]);

    // Nome do cluster baseado no lead representativo
    const clusterName = generateClusterName(representativeLead, professions, cities);

    clusterResults.push({
      cluster_id: i,
      cluster_name: clusterName,
      centroid_lead: {
        id: representativeLead.id,
        username: representativeLead.username,
        embedding_text: representativeLead.embedding_text || ''
      },
      leads: clusterLeads.sort((a, b) => b.similarity_to_centroid - a.similarity_to_centroid),
      avg_similarity: parseFloat(avgSimilarity.toFixed(3)),
      total_leads: clusterLeads.length,
      leads_with_contact: leadsWithContact,
      contact_rate: parseFloat((leadsWithContact / clusterLeads.length * 100).toFixed(1)),
      top_professions: professions.slice(0, 5),
      top_cities: cities.slice(0, 5)
    });
  }

  // Ordenar por total de leads
  clusterResults.sort((a, b) => b.total_leads - a.total_leads);

  // IMPORTANTE: Reindexar cluster_id para ser sequencial (0, 1, 2...)
  // Isso evita gaps quando clusters são filtrados por minLeadsPerCluster
  // e garante que lead_associations.primary_cluster corresponda ao cluster_index nos subclusters
  clusterResults.forEach((cluster, idx) => {
    cluster.cluster_id = idx;
  });

  const executionTime = Date.now() - startTime;
  console.log(`\n✅ [VECTOR CLUSTERING - KMeans Iterativo] Concluído em ${executionTime}ms`);
  console.log(`   ${clusterResults.length} clusters gerados`);
  console.log(`   ${clusterResults.reduce((sum, c) => sum + c.total_leads, 0)} leads clusterizados`);
  console.log(`   📊 Cohesion (centroid): ${(cohesionCentroid * 100).toFixed(1)}% ← KPI PRINCIPAL`);
  console.log(`   📊 Silhouette approx: ${silhouetteApprox.toFixed(3)} (diagnóstico)`);

  return {
    success: true,
    campaign_id: campaignId,
    total_leads_analyzed: leadsWithEmbedding.length,
    total_leads_embedded: leadsWithParsedEmbedding.length,
    clusters: clusterResults,
    execution_time_ms: executionTime,
    method: 'kmeans_vector',
    cohesion_centroid: parseFloat(cohesionCentroid.toFixed(4)),      // KPI PRINCIPAL
    silhouette_approx: parseFloat(silhouetteApprox.toFixed(4)),      // DIAGNÓSTICO
    avg_intra_similarity: parseFloat(cohesionCentroid.toFixed(4))    // @deprecated - mantido para compatibilidade
  };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Seleciona centróides diversos usando max-min distance
 * Primeiro centróide: mais central (maior similaridade média com todos)
 * Demais: maximizar distância mínima aos existentes
 */
async function selectDiverseCentroids(
  leads: any[],
  numCentroids: number
): Promise<any[]> {
  if (leads.length <= numCentroids) return leads;

  const centroids: any[] = [];
  const used = new Set<string>();

  // Parsear todos os embeddings uma vez
  const leadsWithEmbeddings = leads
    .map(lead => ({
      lead,
      embedding: parseEmbedding(lead.embedding_str)
    }))
    .filter(item => item.embedding !== null);

  // Primeiro centróide: lead mais central (maior similaridade média)
  let bestFirst = leadsWithEmbeddings[0];
  let bestAvgSim = -1;

  // Amostragem para performance (máx 500 leads para cálculo de centralidade)
  const sampleSize = Math.min(leadsWithEmbeddings.length, 500);
  const sample = leadsWithEmbeddings.slice(0, sampleSize);

  for (const candidate of sample) {
    let totalSim = 0;
    for (const other of sample) {
      if (candidate.lead.id !== other.lead.id) {
        totalSim += cosineSimilarity(candidate.embedding!, other.embedding!);
      }
    }
    const avgSim = totalSim / (sample.length - 1);
    if (avgSim > bestAvgSim) {
      bestAvgSim = avgSim;
      bestFirst = candidate;
    }
  }

  if (bestFirst) {
    centroids.push(bestFirst.lead);
    used.add(bestFirst.lead.id);
  }

  // Criar mapa de id -> embedding para evitar re-parsing (performance)
  const embeddingCache = new Map<string, number[]>();
  for (const item of leadsWithEmbeddings) {
    if (item.embedding) {
      embeddingCache.set(item.lead.id, item.embedding);
    }
  }

  // Cache de embeddings dos centróides selecionados
  const centroidEmbeddingsCache: number[][] = [];
  if (bestFirst?.embedding) {
    centroidEmbeddingsCache.push(bestFirst.embedding);
  }

  // Demais centróides: maximizar distância mínima aos existentes
  while (centroids.length < numCentroids) {
    let bestLead: any = null;
    let bestMinDist = -1;
    let bestLeadEmbedding: number[] | null = null;

    for (const lead of leads) {
      if (used.has(lead.id)) continue;

      // Usar cache ao invés de re-parsear
      const leadEmbedding = embeddingCache.get(lead.id);
      if (!leadEmbedding) continue;

      // Calcular distância mínima aos centróides existentes (usando cache)
      let minDist = Infinity;
      for (const centroidEmb of centroidEmbeddingsCache) {
        const dist = 1 - cosineSimilarity(leadEmbedding, centroidEmb);
        if (dist < minDist) minDist = dist;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestLead = lead;
        bestLeadEmbedding = leadEmbedding;
      }
    }

    if (bestLead && bestLeadEmbedding) {
      centroids.push(bestLead);
      used.add(bestLead.id);
      centroidEmbeddingsCache.push(bestLeadEmbedding); // Cachear embedding do novo centróide
    } else {
      break;
    }
  }

  return centroids;
}

/**
 * Parse embedding string para array de números
 * Valida dimensão (1536 para OpenAI text-embedding-ada-002/3-small)
 */
function parseEmbedding(embeddingStr: string | null): number[] | null {
  if (!embeddingStr) return null;
  try {
    // Remove colchetes e espaços
    const cleaned = embeddingStr.replace(/[\[\]]/g, '').trim();
    const embedding = cleaned.split(',').map(s => parseFloat(s.trim()));

    // Validar dimensão (OpenAI embeddings são 1536 dimensões)
    if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
      console.warn(`⚠️ Embedding com dimensão inválida: ${embedding.length} (esperado: ${EXPECTED_EMBEDDING_DIM})`);
      return null;
    }

    // Validar que não há NaN
    if (embedding.some(v => isNaN(v))) {
      console.warn('⚠️ Embedding contém valores NaN');
      return null;
    }

    return embedding;
  } catch {
    return null;
  }
}

/**
 * Calcula cosine similarity entre dois vetores
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Calcula o centróide médio de um conjunto de embeddings
 * Retorna o embedding médio normalizado (L2)
 */
function computeCentroidEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const firstEmbedding = embeddings[0];
  if (!firstEmbedding) return [];

  const dim = firstEmbedding.length;
  const centroid = new Array(dim).fill(0);

  // Soma todos os embeddings
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i] ?? 0;
    }
  }

  // Média
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalização L2
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += centroid[i] * centroid[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

/**
 * Calcula uma aproximação do Silhouette Score (avg_intra_similarity)
 * para avaliar qualidade dos clusters.
 * Retorna valor entre -1 e 1 (maior = melhor separação)
 *
 * NOTA: Esta é uma aproximação simplificada com amostragem para performance.
 * O resultado é usado internamente como "silhouette approx" nos logs.
 */
function computeSilhouetteScore(
  assignments: Map<number, { embedding: number[]; leadId: string }[]>,
  _centroidEmbeddings: number[][]
): number {
  const clusterIds = Array.from(assignments.keys());
  if (clusterIds.length < 2) return 0;

  // OTIMIZAÇÃO: Usar amostragem para evitar O(n²) com milhares de leads
  const MAX_SAMPLE_PER_CLUSTER = 100; // Máximo de pontos para amostrar por cluster
  const MAX_COMPARE_POINTS = 50; // Máximo de pontos para comparar em cada cálculo

  // Criar amostras de cada cluster
  const sampledAssignments: Map<number, { embedding: number[]; leadId: string }[]> = new Map();
  for (const [clusterId, points] of assignments.entries()) {
    if (points.length <= MAX_SAMPLE_PER_CLUSTER) {
      sampledAssignments.set(clusterId, points);
    } else {
      // Amostragem aleatória
      const shuffled = [...points].sort(() => Math.random() - 0.5);
      sampledAssignments.set(clusterId, shuffled.slice(0, MAX_SAMPLE_PER_CLUSTER));
    }
  }

  let totalScore = 0;
  let totalPoints = 0;
  const debugStats: { clusterId: number; avgA: number; avgB: number; avgS: number; count: number }[] = [];

  for (const clusterId of clusterIds) {
    const clusterPoints = sampledAssignments.get(clusterId) || [];
    if (clusterPoints.length < 2) continue;

    // Limitar pontos para comparação intra-cluster
    const comparePoints = clusterPoints.length <= MAX_COMPARE_POINTS
      ? clusterPoints
      : clusterPoints.slice(0, MAX_COMPARE_POINTS);

    let clusterSumA = 0, clusterSumB = 0, clusterSumS = 0, clusterCount = 0;

    for (const point of comparePoints) {
      // a(i) = distância média intra-cluster (amostragem)
      let intraSum = 0;
      let intraCount = 0;
      const intraCompare = clusterPoints.length <= MAX_COMPARE_POINTS
        ? clusterPoints
        : clusterPoints.slice(0, MAX_COMPARE_POINTS);

      for (const other of intraCompare) {
        if (other.leadId !== point.leadId) {
          intraSum += 1 - cosineSimilarity(point.embedding, other.embedding);
          intraCount++;
        }
      }
      const a = intraCount > 0 ? intraSum / intraCount : 0;

      // b(i) = menor distância média inter-cluster (amostragem)
      let minInterDist = Infinity;
      for (const otherClusterId of clusterIds) {
        if (otherClusterId === clusterId) continue;
        const otherPoints = sampledAssignments.get(otherClusterId) || [];
        if (otherPoints.length === 0) continue;

        // Limitar pontos para comparação inter-cluster
        const interCompare = otherPoints.length <= MAX_COMPARE_POINTS
          ? otherPoints
          : otherPoints.slice(0, MAX_COMPARE_POINTS);

        let interSum = 0;
        for (const other of interCompare) {
          interSum += 1 - cosineSimilarity(point.embedding, other.embedding);
        }
        const avgDist = interSum / interCompare.length;
        if (avgDist < minInterDist) minInterDist = avgDist;
      }
      const b = minInterDist === Infinity ? 0 : minInterDist;

      // Silhouette para este ponto
      const s = b === 0 && a === 0 ? 0 : (b - a) / Math.max(a, b);
      totalScore += s;
      totalPoints++;
      clusterSumA += a;
      clusterSumB += b;
      clusterSumS += s;
      clusterCount++;
    }

    if (clusterCount > 0) {
      debugStats.push({
        clusterId,
        avgA: clusterSumA / clusterCount,
        avgB: clusterSumB / clusterCount,
        avgS: clusterSumS / clusterCount,
        count: clusterCount
      });
    }
  }

  // Log debug stats
  console.log('   📊 [SILHOUETTE DEBUG] Stats por cluster:');
  for (const stat of debugStats) {
    console.log(`      Cluster ${stat.clusterId}: a=${stat.avgA.toFixed(3)} (intra), b=${stat.avgB.toFixed(3)} (inter), s=${stat.avgS.toFixed(3)}, n=${stat.count}`);
  }

  return totalPoints > 0 ? totalScore / totalPoints : 0;
}

/**
 * Calcula Cohesion Centroid: média de similaridade de cada lead ao centróide do seu cluster
 *
 * Esta é a métrica KPI PRINCIPAL - mede o que queremos otimizar:
 * "Quão similar cada lead é ao perfil representativo (centróide) do cluster?"
 *
 * Retorna valor entre 0 e 1 (maior = clusters mais coesos)
 *
 * Vantagens sobre silhouette:
 * - 100% determinístico (sem amostragem aleatória)
 * - O(n) por cluster, não O(n²)
 * - Semântica clara: "leads parecidos com o centróide"
 */
function computeCohesionCentroid(
  assignments: Map<number, { embedding: number[]; similarity: number }[]>,
  centroidEmbeddings: number[][]
): { global: number; perCluster: { clusterId: number; cohesion: number; count: number }[] } {
  const perCluster: { clusterId: number; cohesion: number; count: number }[] = [];
  let totalSimilarity = 0;
  let totalPoints = 0;

  for (const [clusterId, items] of assignments.entries()) {
    if (items.length === 0) continue;

    const centroid = centroidEmbeddings[clusterId];
    if (!centroid || centroid.length === 0) continue;

    let clusterSum = 0;
    for (const item of items) {
      // Usar similaridade já calculada durante atribuição (mais eficiente)
      // ou recalcular se necessário
      const similarity = item.similarity > 0
        ? item.similarity
        : cosineSimilarity(item.embedding, centroid);

      clusterSum += similarity;
      totalSimilarity += similarity;
      totalPoints++;
    }

    const clusterCohesion = clusterSum / items.length;
    perCluster.push({
      clusterId,
      cohesion: clusterCohesion,
      count: items.length
    });
  }

  // Média global ponderada por tamanho do cluster
  const globalCohesion = totalPoints > 0 ? totalSimilarity / totalPoints : 0;

  return {
    global: globalCohesion,
    perCluster
  };
}

/**
 * Conta ocorrências e retorna ordenado por frequência
 */
function countOccurrences(items: string[]): string[] {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    if (normalized) {
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([item]) => item);
}

/**
 * Gera nome do cluster baseado no centróide e características
 */
function generateClusterName(
  centroid: any,
  professions: string[],
  cities: string[]
): string {
  const profession = professions[0] || centroid.profession || 'Geral';
  const city = cities[0] || centroid.city || '';

  if (city) {
    return `${profession} - ${city}`;
  }
  return profession;
}

// ============================================
// INTEGRAÇÃO COM CAMPAIGN PIPELINE
// ============================================

/**
 * Interface compatível com clustering-engine.service.ts
 */
export interface ClusterResult {
  cluster_id: number;
  cluster_name: string;
  hashtag_count: number;
  total_leads: number;
  avg_contact_rate: number;
  top_hashtags: {
    hashtag: string;
    freq_total: number;
    unique_leads: number;
    contact_rate: number;
  }[];
  theme_keywords: string[];
  centroid: number[];
  cohesion_score?: number; // Média de similaridade ao centróide (não é silhouette real)
}

export interface LeadClusterAssociation {
  lead_id: string;
  username: string;
  full_name: string | null;
  clusters: {
    cluster_id: number;
    hashtag_count: number;
    weight: number;
  }[];
  primary_cluster: number;
  score: number;
  has_contact: boolean;
}

export interface ClusteringResult {
  success: boolean;
  error?: string;
  nicho: string;
  seeds: string[];
  k: number;
  total_hashtags: number;
  total_leads: number;
  clusters: ClusterResult[];
  lead_associations: LeadClusterAssociation[];
  // Métricas de qualidade (nomes semânticos corretos)
  cohesion_centroid?: number;        // KPI PRINCIPAL: avg(sim(lead, centroid))
  silhouette_approx?: number;        // DIAGNÓSTICO: (b-a)/max(a,b) amostrado
  avg_intra_similarity: number;      // @deprecated - usar cohesion_centroid
  execution_time_ms: number;
  method: 'kmeans_hashtag' | 'kmeans_vector' | 'graph_hnsw' | 'hashtag_vector';
}

/**
 * Executa vector clustering e retorna no formato compatível com campaign-pipeline
 * Substitui executeClustering do clustering-engine.service.ts
 *
 * @param campaignId - ID da campanha (opcional)
 * @param nicho - Nicho principal
 * @param seeds - Keywords seed
 * @param numClusters - Número de clusters
 * @param similarityThreshold - Threshold de similaridade
 * @param filters - Filtros de localização e recência
 */
export async function executeVectorClustering(
  campaignId: string | undefined,
  nicho: string,
  seeds: string[],
  numClusters: number = 5,
  similarityThreshold: number = 0.65,
  filters: ClusteringFilters = {},
  minLeadsPerCluster: number = 1
): Promise<ClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [VECTOR CLUSTERING] Executando para campanha ${campaignId}`);

  // Executar clustering por similaridade de embeddings com filtros
  const result = await clusterBySimilarity(
    campaignId,
    numClusters,
    similarityThreshold,
    filters,
    seeds,
    minLeadsPerCluster
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      nicho,
      seeds,
      k: numClusters,
      total_hashtags: 0,
      total_leads: result.total_leads_analyzed,
      clusters: [],
      lead_associations: [],
      cohesion_centroid: 0,
      silhouette_approx: 0,
      avg_intra_similarity: 0,
      execution_time_ms: Date.now() - startTime,
      method: 'kmeans_vector'
    };
  }

  // Converter clusters para formato compatível
  const clusters: ClusterResult[] = result.clusters.map((vc, index) => ({
    cluster_id: index,
    cluster_name: vc.cluster_name,
    hashtag_count: 0, // Vector clustering não usa hashtags
    total_leads: vc.total_leads,
    avg_contact_rate: vc.contact_rate,
    top_hashtags: [], // Não aplicável para vector clustering
    theme_keywords: vc.top_professions.slice(0, 5),
    centroid: [], // Centróide é o lead, não vetor numérico
    cohesion_score: vc.avg_similarity
  }));

  // Converter lead associations
  const lead_associations: LeadClusterAssociation[] = [];

  for (const cluster of result.clusters) {
    for (const lead of cluster.leads) {
      lead_associations.push({
        lead_id: lead.id,
        username: lead.username || '',
        full_name: lead.full_name || null,
        clusters: [{
          cluster_id: cluster.cluster_id,
          hashtag_count: 0,
          weight: lead.similarity_to_centroid
        }],
        primary_cluster: cluster.cluster_id,
        score: lead.similarity_to_centroid,
        has_contact: hasValidContact(lead)
      });
    }
  }

  // Usar métricas calculadas pelo clusterBySimilarity (não recalcular)
  const cohesionCentroid = result.cohesion_centroid || 0;
  const silhouetteApprox = result.silhouette_approx || 0;

  console.log(`✅ [VECTOR CLUSTERING] Pipeline-ready: ${clusters.length} clusters, ${lead_associations.length} leads`);
  console.log(`   📊 Cohesion (centroid): ${(cohesionCentroid * 100).toFixed(1)}% ← KPI PRINCIPAL`);
  console.log(`   📊 Silhouette approx: ${silhouetteApprox.toFixed(3)} (diagnóstico)`);

  return {
    success: true,
    nicho,
    seeds,
    k: numClusters,
    total_hashtags: 0,
    total_leads: result.total_leads_analyzed,
    clusters,
    lead_associations,
    cohesion_centroid: cohesionCentroid,          // KPI PRINCIPAL
    silhouette_approx: silhouetteApprox,          // DIAGNÓSTICO
    avg_intra_similarity: cohesionCentroid,       // @deprecated - mantido para compatibilidade
    execution_time_ms: Date.now() - startTime,
    method: 'kmeans_vector'
  };
}

/**
 * Clusterização baseada em embeddings de HASHTAG + mapping lead->cluster
 * Usa hashtag_clusters_dynamic (centroid vector) + lead_cluster_mapping
 *
 * @param campaignId - ID da campanha (opcional)
 * @param nicho - Nicho principal
 * @param seeds - Keywords seed
 * @param numClusters - Número de clusters
 * @param similarityThreshold - Threshold de similaridade
 * @param filters - Filtros de localização e recência
 */
export async function executeHashtagVectorClustering(
  campaignId: string | undefined,
  nicho: string,
  seeds: string[],
  numClusters: number = 5,
  _similarityThreshold: number = 0.65,
  filters: ClusteringFilters = {}
): Promise<ClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [VECTOR HASHTAG] Executando para campanha ${campaignId || 'global'}`);

  // Aplicar valores padrão para filtros de recência
  const leadMaxAgeDays = filters.lead_max_age_days ?? DEFAULT_LEAD_MAX_AGE_DAYS;
  const hashtagMaxAgeDays = filters.hashtag_max_age_days ?? DEFAULT_HASHTAG_MAX_AGE_DAYS;
  const targetStates = filters.target_states;

  // Log dos filtros aplicados
  console.log(`   📍 Filtros de recência: leads ≤${leadMaxAgeDays}d, hashtags ≤${hashtagMaxAgeDays}d`);
  if (targetStates && targetStates.length > 0) {
    console.log(`   🗺️  Filtro de estados: [${targetStates.join(', ')}]`);
  }

  // 1) Selecionar clusters de hashtag (priorizar coesão/score)
  // Filtrar por clusters atualizados recentemente
  const { data: hashtagClusters, error: clusterError } = await supabase
    .from('hashtag_clusters_dynamic')
    .select('id, cluster_name, hashtags, centroid, cohesion_score, silhouette_score, hashtag_count, total_leads, avg_contact_rate')
    .gte('updated_at', new Date(Date.now() - hashtagMaxAgeDays * 24 * 60 * 60 * 1000).toISOString())
    .order('cohesion_score', { ascending: false })
    .limit(numClusters || 5);

  if (clusterError) {
    return {
      success: false,
      error: clusterError.message,
      nicho,
      seeds,
      k: numClusters,
      total_hashtags: 0,
      total_leads: 0,
      clusters: [],
      lead_associations: [],
      cohesion_centroid: 0,
      silhouette_approx: 0,
      avg_intra_similarity: 0,
      execution_time_ms: Date.now() - startTime,
      method: 'hashtag_vector'
    };
  }

  const clusters: ClusterResult[] = [];
  const leadAssociations: LeadClusterAssociation[] = [];

  for (let idx = 0; idx < (hashtagClusters || []).length; idx++) {
    const hc = hashtagClusters[idx];
    if (!hc) continue;
    const clusterIndex = idx;

    // Buscar leads associados via lead_cluster_mapping (top N por weight/hashtag_count)
    // Nota: weight representa a força da associação lead->cluster via hashtags
    // Construir condições de filtro (com validação de inputs)
    const safeClusterId = validateUUID(hc.id);
    const safeLeadMaxAgeDays = validateNumber(leadMaxAgeDays, 1, 45, 'leadMaxAgeDays');

    const leadFilterConditions: string[] = [
      `lcm.cluster_id = '${safeClusterId}'::uuid`,
      // Filtro de recência para leads
      `(il.created_at >= NOW() - INTERVAL '${safeLeadMaxAgeDays} days' OR il.updated_at >= NOW() - INTERVAL '${safeLeadMaxAgeDays} days')`
    ];

    // Filtro de campanha
    if (campaignId) {
      const safeCampaignId = validateUUID(campaignId);
      leadFilterConditions.push(`(lcm.campaign_id IS NULL OR lcm.campaign_id = '${safeCampaignId}'::uuid)`);
    }

    // Filtro de estados
    if (targetStates && targetStates.length > 0) {
      const safeStates = validateStates(targetStates);
      const statesArray = safeStates.map(s => `'${s}'`).join(', ');
      leadFilterConditions.push(`il.state IN (${statesArray})`);
    }

    const query = `
      SELECT
        lcm.lead_id,
        lcm.weight,
        lcm.hashtag_count,
        lcm.is_primary,
        il.username,
        il.full_name,
        il.emails_normalized,
        il.phones_normalized,
        il.city,
        il.state,
        il.profession
      FROM lead_cluster_mapping lcm
      INNER JOIN instagram_leads il ON il.id = lcm.lead_id
      WHERE ${leadFilterConditions.join(' AND ')}
      ORDER BY lcm.weight DESC NULLS LAST, lcm.hashtag_count DESC NULLS LAST
      LIMIT 400
    `;

    const { data: leadsData, error: leadsError } = await supabase.rpc('execute_sql', { query_text: query });
    if (leadsError) {
      console.error('⚠️ Erro ao buscar leads do cluster', hc.id, leadsError.message);
      continue;
    }

    // Verificar se resultado é erro da função SQL
    if (leadsData && typeof leadsData === 'object' && !Array.isArray(leadsData) && leadsData.error) {
      console.error('⚠️ SQL Error no cluster', hc.id, leadsData.error);
      continue;
    }

    const leadsList = Array.isArray(leadsData) ? leadsData : [];
    // Usar hasValidContact() para consistência (inclui WhatsApp)
    const leadsWithContact = leadsList.filter((l: any) => hasValidContact(l)).length;
    const contactRate = leadsList.length > 0 ? (leadsWithContact / leadsList.length) * 100 : 0;
    // Usar weight como proxy de similaridade (representa força da associação via hashtags)
    const avgWeight = leadsList.length > 0
      ? leadsList.reduce((sum: number, l: any) => sum + (l.weight || 0), 0) / leadsList.length
      : 0;

    clusters.push({
      cluster_id: clusterIndex,
      cluster_name: hc.cluster_name || `Cluster ${clusterIndex + 1}`,
      hashtag_count: hc.hashtag_count || (hc.hashtags?.length || 0),
      total_leads: leadsList.length,
      avg_contact_rate: parseFloat(contactRate.toFixed(1)),
      top_hashtags: (hc.hashtags || []).slice(0, 10).map((h: string) => ({
        hashtag: h,
        freq_total: 0,
        unique_leads: 0,
        contact_rate: 0
      })),
      theme_keywords: (hc.hashtags || []).slice(0, 5),
      centroid: hc.centroid || [],
      cohesion_score: typeof hc.cohesion_score === 'number' ? hc.cohesion_score : (hc.silhouette_score || avgWeight)
    });

    leadsList.forEach((lead: any) => {
      leadAssociations.push({
        lead_id: lead.lead_id,
        username: lead.username || '',
        full_name: lead.full_name || null,
        clusters: [{
          cluster_id: clusterIndex,
          hashtag_count: lead.hashtag_count || hc.hashtag_count || 0,
          weight: lead.weight || 0
        }],
        primary_cluster: clusterIndex,
        score: lead.weight || 0,
        has_contact: hasValidContact(lead)
      });
    });
  }

  const avgCohesion = clusters.length > 0
    ? clusters.reduce((sum, c) => sum + (c.cohesion_score || 0), 0) / clusters.length
    : 0;

  console.log(`✅ [VECTOR HASHTAG] ${clusters.length} clusters montados, ${leadAssociations.length} leads associados`);
  console.log(`   📊 Cohesion (centroid): ${(avgCohesion * 100).toFixed(1)}% ← KPI PRINCIPAL`);

  return {
    success: true,
    nicho,
    seeds,
    k: numClusters,
    total_hashtags: clusters.reduce((sum, c) => sum + (c.hashtag_count || 0), 0),
    total_leads: leadAssociations.length,
    clusters,
    lead_associations: leadAssociations,
    cohesion_centroid: avgCohesion,           // KPI PRINCIPAL (média dos cohesion_score dos clusters)
    silhouette_approx: 0,                      // Não calculado no hashtag clustering
    avg_intra_similarity: avgCohesion,         // @deprecated
    execution_time_ms: Date.now() - startTime,
    method: 'hashtag_vector'
  };
}

// ============================================
// CLUSTERING POR GRAFO DE SIMILARIDADE (HNSW)
// ============================================

/**
 * Union-Find (Disjoint Set Union) para componentes conectados
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!)); // Path compression
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getComponents(): Map<string, string[]> {
    const components = new Map<string, string[]>();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root)!.push(node);
    }
    return components;
  }
}

/**
 * Clustering por Grafo de Similaridade usando HNSW do pgvector
 *
 * Algoritmo:
 * 1. Para cada lead, busca k vizinhos mais próximos via HNSW (kNN)
 * 2. Cria arestas apenas onde similarity >= threshold
 * 3. Agrupa por componentes conectados (Union-Find)
 * 4. Clusters pequenos viram "noise" ou são mesclados
 *
 * Vantagens:
 * - Usa HNSW index (O(log n) por busca, não O(n²))
 * - Clusters naturais por densidade (não força K)
 * - Outliers/noise são identificados naturalmente
 * - Escala para milhões de leads
 *
 * @param filters - Filtros de localização e recência
 * @param kNeighbors - Número de vizinhos a buscar por lead (default: 30)
 * @param similarityThreshold - Mínimo de similaridade para criar aresta (default: 0.72)
 * @param minClusterSize - Tamanho mínimo de cluster (menores viram noise) (default: 10)
 */
export async function clusterByGraph(
  filters: ClusteringFilters = {},
  kNeighbors: number = 30,
  similarityThreshold: number = 0.72,
  minClusterSize: number = 10
): Promise<VectorClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [GRAPH CLUSTERING] Iniciando clustering por grafo de similaridade`);
  console.log(`   📊 Parâmetros: k=${kNeighbors}, threshold=${similarityThreshold}, minSize=${minClusterSize}`);

  // Aplicar filtros de recência
  const leadMaxAgeDays = filters.lead_max_age_days ?? DEFAULT_LEAD_MAX_AGE_DAYS;
  const hashtagMaxAgeDays = filters.hashtag_max_age_days ?? DEFAULT_HASHTAG_MAX_AGE_DAYS;
  const targetStates = filters.target_states;

  console.log(`   📅 Filtros: leads ≤${leadMaxAgeDays}d, embeddings ≤${hashtagMaxAgeDays}d`);
  if (targetStates?.length) {
    console.log(`   🗺️  Estados: [${targetStates.join(', ')}]`);
  }

  // 1. Construir WHERE clause
  const whereConditions: string[] = [
    'COALESCE(le.embedding_final, le.embedding_bio) IS NOT NULL',
    'il.bio IS NOT NULL',
    `(il.created_at >= NOW() - INTERVAL '${leadMaxAgeDays} days' OR il.updated_at >= NOW() - INTERVAL '${leadMaxAgeDays} days')`,
    `(le.created_at >= NOW() - INTERVAL '${hashtagMaxAgeDays} days' OR le.updated_at >= NOW() - INTERVAL '${hashtagMaxAgeDays} days')`
  ];

  if (targetStates && targetStates.length > 0) {
    // Validar estados para evitar SQL injection
    const safeStates = validateStates(targetStates);
    const statesArray = safeStates.map(s => `'${s}'`).join(', ');
    whereConditions.push(`il.state IN (${statesArray})`);
  }

  const whereClause = whereConditions.join(' AND ');

  // 2. Buscar todos os leads elegíveis com seus embeddings
  console.log(`\n   📥 Buscando leads com embeddings...`);
  const { data: leads, error: leadsError } = await supabase.rpc('execute_sql', {
    query_text: `
      SELECT
        il.id,
        il.username,
        il.full_name,
        il.profession,
        il.city,
        il.state,
        il.bio,
        il.emails_normalized,
        il.phones_normalized,
        il.whatsapp_number,
        il.followers_count,
        le.embedding_bio_text as embedding_text
      FROM instagram_leads il
      INNER JOIN lead_embeddings le ON le.lead_id = il.id
      WHERE ${whereClause}
      ORDER BY il.followers_count DESC NULLS LAST
    `
  });

  if (leadsError) {
    console.error('❌ Erro ao buscar leads:', leadsError);
    throw leadsError;
  }

  const leadsList = Array.isArray(leads) ? leads : [];
  console.log(`   ✅ ${leadsList.length} leads encontrados`);

  if (leadsList.length < minClusterSize) {
    return {
      success: false,
      error: `Leads insuficientes: ${leadsList.length} (mínimo: ${minClusterSize})`,
      total_leads_analyzed: leadsList.length,
      total_leads_embedded: leadsList.length,
      clusters: [],
      execution_time_ms: Date.now() - startTime,
      method: 'graph_hnsw',
      cohesion_centroid: 0,
      silhouette_approx: 0
    };
  }

  // Criar mapa id -> lead para lookup rápido
  const leadMap = new Map<string, any>();
  for (const lead of leadsList) {
    leadMap.set(lead.id, lead);
  }

  // 3. Criar tabela temporária com índice HNSW para kNN eficiente
  console.log(`\n   🔗 Criando tabela temporária com índice HNSW...`);
  const uf = new UnionFind();
  let totalEdges = 0;
  let processedLeads = 0;
  const edgeSimilarities = new Map<string, number>(); // Armazena similaridades para cálculo de avg_similarity

  const leadIds = leadsList.map(l => l.id);

  // Criar tabela temporária com embeddings filtrados usando JOIN (sem ARRAY gigante)
  // Number() garante que o nome seja sempre numérico (evita injeção)
  const tempTableName = `temp_clustering_${Number(Date.now())}`;

  // Statement 1: Criar tabela temporária via JOIN com whereClause
  // Usa execute_admin_sql (DDL com allowlist restrita)
  const { error: createTableError } = await supabase.rpc('execute_admin_sql', {
    query_text: `
      CREATE TEMP TABLE ${tempTableName} AS
      SELECT
        le.lead_id,
        COALESCE(le.embedding_final, le.embedding_bio) as embedding
      FROM lead_embeddings le
      INNER JOIN instagram_leads il ON il.id = le.lead_id
      WHERE ${whereClause}
    `
  });

  if (createTableError) {
    console.error('❌ Erro ao criar tabela temporária:', createTableError.message);
    throw createTableError;
  }

  // Statement 2: Criar índice HNSW (separado para garantir compatibilidade)
  // Usa execute_admin_sql (DDL com allowlist restrita)
  const { error: createIndexError } = await supabase.rpc('execute_admin_sql', {
    query_text: `
      CREATE INDEX ON ${tempTableName} USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `
  });

  if (createIndexError) {
    console.error('❌ Erro ao criar índice HNSW:', createIndexError.message);
    // Limpar tabela temporária antes de falhar
    try {
      await supabase.rpc('execute_admin_sql', { query_text: `DROP TABLE IF EXISTS ${tempTableName}` });
    } catch (_) { /* ignore cleanup error */ }
    throw createIndexError;
  }

  console.log(`   ✅ Tabela ${tempTableName} criada com ${leadIds.length} embeddings e índice HNSW`);
  console.log(`\n   🔗 Construindo grafo de similaridade...`);

  // Processar em batches usando a tabela temporária indexada
  const BATCH_SIZE = 100;
  const safeKNeighbors = validateNumber(kNeighbors, 1, 100, 'kNeighbors');
  const safeSimilarityThreshold = validateNumber(similarityThreshold, 0, 1, 'similarityThreshold');

  for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
    const batchIds = leadIds.slice(i, i + BATCH_SIZE);
    const validatedBatchIds = batchIds.map(id => validateUUID(id));
    const batchIdsArray = validatedBatchIds.map(id => `'${id}'::uuid`).join(',');

    // Buscar vizinhos usando tabela temporária com HNSW
    const { data: neighbors, error: neighborsError } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          bl.lead_id as source_id,
          nn.lead_id as neighbor_id,
          1 - (bl.embedding <=> nn.embedding) as similarity
        FROM ${tempTableName} bl
        CROSS JOIN LATERAL (
          SELECT t.lead_id, t.embedding
          FROM ${tempTableName} t
          WHERE t.lead_id != bl.lead_id
          ORDER BY t.embedding <=> bl.embedding
          LIMIT ${safeKNeighbors}
        ) nn
        WHERE bl.lead_id = ANY(ARRAY[${batchIdsArray}])
          AND 1 - (bl.embedding <=> nn.embedding) >= ${safeSimilarityThreshold}
      `
    });

    if (neighborsError) {
      console.error('⚠️ Erro em batch de vizinhos:', neighborsError.message);
      continue;
    }

    // Criar arestas no grafo (Union-Find) e armazenar similaridades
    const neighborsList = Array.isArray(neighbors) ? neighbors : [];
    for (const edge of neighborsList) {
      // Só criar aresta se ambos os leads estão no nosso conjunto filtrado
      if (leadMap.has(edge.source_id) && leadMap.has(edge.neighbor_id)) {
        uf.union(edge.source_id, edge.neighbor_id);
        // Armazenar similaridade da aresta para cálculo posterior
        const edgeKey = [edge.source_id, edge.neighbor_id].sort().join('|');
        if (!edgeSimilarities.has(edgeKey)) {
          edgeSimilarities.set(edgeKey, edge.similarity);
        }
        totalEdges++;
      }
    }

    processedLeads += batchIds.length;
    if (processedLeads % 500 === 0) {
      console.log(`   📊 Processados ${processedLeads}/${leadIds.length} leads, ${totalEdges} arestas`);
    }
  }

  console.log(`   ✅ Grafo construído: ${totalEdges} arestas, ${edgeSimilarities.size} pares únicos`);

  // Registrar todos os leads no UnionFind (mesmo os isolados)
  // Isso garante que getComponents() capture todos, evitando acesso a propriedade private
  for (const leadId of leadIds) {
    uf.find(leadId);
  }

  // 4. Extrair componentes conectados
  console.log(`\n   🧩 Extraindo componentes conectados...`);
  const components = uf.getComponents();

  // Separar clusters válidos (>= minClusterSize) de noise
  const validClusters: string[][] = [];
  const noiseLeads: string[] = [];

  for (const [_root, members] of components) {
    if (members.length >= minClusterSize) {
      validClusters.push(members);
    } else {
      noiseLeads.push(...members);
    }
  }

  console.log(`   ✅ ${validClusters.length} clusters válidos, ${noiseLeads.length} leads em noise`);

  // Ordenar clusters por tamanho (maior primeiro)
  validClusters.sort((a, b) => b.length - a.length);

  // 5. Montar resultado dos clusters
  console.log(`\n   📊 Gerando estatísticas dos clusters...`);
  const clusterResults: VectorClusterResult[] = [];

  for (let i = 0; i < validClusters.length; i++) {
    const memberIds = validClusters[i]!;
    const clusterLeads: VectorClusteredLead[] = [];

    for (const leadId of memberIds) {
      const lead = leadMap.get(leadId);
      if (!lead) continue;

      clusterLeads.push({
        id: lead.id,
        username: lead.username,
        full_name: lead.full_name,
        profession: lead.profession,
        city: lead.city,
        state: lead.state,
        bio: lead.bio,
        emails_normalized: lead.emails_normalized,
        phones_normalized: lead.phones_normalized,
        followers_count: lead.followers_count || 0,
        similarity_to_centroid: 1.0, // Será recalculado abaixo
        embedding_text: lead.embedding_text
      });
    }

    // Calcular estatísticas usando hasValidContact() para consistência
    // Usa leadMap para ter acesso ao objeto completo (inclui whatsapp_number)
    const leadsWithContact = clusterLeads.filter(l => {
      const fullLead = leadMap.get(l.id);
      return fullLead ? hasValidContact(fullLead) : false;
    }).length;

    const contactRate = clusterLeads.length > 0
      ? (leadsWithContact / clusterLeads.length * 100)
      : 0;

    // Top profissões e cidades
    const professions = countOccurrences(clusterLeads.map(l => l.profession).filter(Boolean) as string[]);
    const cities = countOccurrences(clusterLeads.map(l => l.city).filter(Boolean) as string[]);

    // Lead representativo: maior followers ou primeiro
    const representativeLead = clusterLeads.sort((a, b) => b.followers_count - a.followers_count)[0];
    const clusterName = generateClusterName(representativeLead, professions, cities);

    // Calcular avg_similarity REAL usando as similaridades armazenadas
    let clusterSimilaritySum = 0;
    let clusterEdgeCount = 0;
    for (let m = 0; m < memberIds.length; m++) {
      for (let n = m + 1; n < memberIds.length; n++) {
        const edgeKey = [memberIds[m], memberIds[n]].sort().join('|');
        const sim = edgeSimilarities.get(edgeKey);
        if (sim !== undefined) {
          clusterSimilaritySum += sim;
          clusterEdgeCount++;
        }
      }
    }
    const computedAvgSimilarity = clusterEdgeCount > 0
      ? clusterSimilaritySum / clusterEdgeCount
      : similarityThreshold; // Fallback se não houver arestas

    clusterResults.push({
      cluster_id: i,
      cluster_name: clusterName,
      centroid_lead: {
        id: representativeLead?.id || '',
        username: representativeLead?.username || '',
        embedding_text: representativeLead?.embedding_text || ''
      },
      leads: clusterLeads,
      avg_similarity: parseFloat(computedAvgSimilarity.toFixed(4)),
      total_leads: clusterLeads.length,
      leads_with_contact: leadsWithContact,
      contact_rate: parseFloat(contactRate.toFixed(1)),
      top_professions: professions.slice(0, 5),
      top_cities: cities.slice(0, 5)
    });
  }

  // Limpar tabela temporária (usa execute_admin_sql)
  try {
    await supabase.rpc('execute_admin_sql', {
      query_text: `DROP TABLE IF EXISTS ${tempTableName}`
    });
  } catch (cleanupErr: any) {
    console.warn('⚠️ Falha ao limpar tabela temporária:', cleanupErr?.message);
  }

  const executionTime = Date.now() - startTime;
  const totalClustered = clusterResults.reduce((sum, c) => sum + c.total_leads, 0);

  // Calcular cohesion como média ponderada de avg_similarity dos clusters
  const cohesionCentroid = totalClustered > 0
    ? clusterResults.reduce((sum, c) => sum + c.avg_similarity * c.total_leads, 0) / totalClustered
    : 0;

  console.log(`\n✅ [GRAPH CLUSTERING] Concluído em ${executionTime}ms`);
  console.log(`   📊 ${clusterResults.length} clusters, ${totalClustered} leads clusterizados, ${noiseLeads.length} noise`);
  console.log(`   📊 Cohesion (centroid): ${(cohesionCentroid * 100).toFixed(1)}% ← KPI PRINCIPAL`);

  return {
    success: true,
    total_leads_analyzed: leadsList.length,
    total_leads_embedded: leadsList.length,
    clusters: clusterResults,
    execution_time_ms: executionTime,
    method: 'graph_hnsw',
    cohesion_centroid: parseFloat(cohesionCentroid.toFixed(4)),
    silhouette_approx: 0  // Não calculado no graph clustering
  };
}

/**
 * Executa graph clustering e retorna no formato compatível com campaign-pipeline
 */
export async function executeGraphClustering(
  campaignId: string | undefined,
  nicho: string,
  seeds: string[],
  filters: ClusteringFilters = {},
  kNeighbors: number = 30,
  similarityThreshold: number = 0.72,
  minClusterSize: number = 10
): Promise<ClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [GRAPH CLUSTERING] Executando para campanha ${campaignId || 'global'}`);
  console.log(`   🎯 Nicho: ${nicho}, Seeds: [${seeds.join(', ')}]`);

  const result = await clusterByGraph(filters, kNeighbors, similarityThreshold, minClusterSize);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      nicho,
      seeds,
      k: 0,
      total_hashtags: 0,
      total_leads: result.total_leads_analyzed,
      clusters: [],
      lead_associations: [],
      cohesion_centroid: 0,
      silhouette_approx: 0,
      avg_intra_similarity: 0,
      execution_time_ms: Date.now() - startTime,
      method: 'graph_hnsw'
    };
  }

  // Converter para formato compatível
  const clusters: ClusterResult[] = result.clusters.map((vc, index) => ({
    cluster_id: index,
    cluster_name: vc.cluster_name,
    hashtag_count: 0,
    total_leads: vc.total_leads,
    avg_contact_rate: vc.contact_rate,
    top_hashtags: [],
    theme_keywords: vc.top_professions.slice(0, 5),
    centroid: [],
    cohesion_score: vc.avg_similarity
  }));

  // Converter lead associations
  const lead_associations: LeadClusterAssociation[] = [];
  for (const cluster of result.clusters) {
    for (const lead of cluster.leads) {
      lead_associations.push({
        lead_id: lead.id,
        username: lead.username || '',
        full_name: lead.full_name || null,
        clusters: [{
          cluster_id: cluster.cluster_id,
          hashtag_count: 0,
          weight: lead.similarity_to_centroid
        }],
        primary_cluster: cluster.cluster_id,
        score: lead.similarity_to_centroid,
        has_contact: hasValidContact(lead)
      });
    }
  }

  // Calcular weighted average de avg_similarity (cohesion centroid)
  const totalLeadsInClusters = result.clusters.reduce((sum, c) => sum + c.total_leads, 0);
  const cohesionCentroid = totalLeadsInClusters > 0
    ? result.clusters.reduce((sum, c) => sum + c.avg_similarity * c.total_leads, 0) / totalLeadsInClusters
    : 0;

  console.log(`✅ [GRAPH CLUSTERING] Pipeline-ready: ${clusters.length} clusters, ${lead_associations.length} leads`);
  console.log(`   📊 Cohesion (centroid): ${(cohesionCentroid * 100).toFixed(1)}% ← KPI PRINCIPAL`);

  return {
    success: true,
    nicho,
    seeds,
    k: clusters.length, // K natural descoberto
    total_hashtags: 0,
    total_leads: result.total_leads_analyzed,
    clusters,
    lead_associations,
    cohesion_centroid: parseFloat(cohesionCentroid.toFixed(4)),  // KPI PRINCIPAL
    silhouette_approx: 0,                                         // Não calculado no graph clustering
    avg_intra_similarity: parseFloat(cohesionCentroid.toFixed(4)), // @deprecated
    execution_time_ms: Date.now() - startTime,
    method: 'graph_hnsw'
  };
}

// ============================================
// EXPORTAÇÃO
// ============================================

export const vectorClusteringService = {
  findSimilarLeads,
  findLeadsByQuery,
  clusterBySimilarity,
  clusterByGraph,
  executeVectorClustering,
  executeGraphClustering,
  executeHashtagVectorClustering,
  // Constantes de filtro
  DEFAULT_LEAD_MAX_AGE_DAYS,
  DEFAULT_HASHTAG_MAX_AGE_DAYS
};
