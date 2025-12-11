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

function normalizeCity(value?: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
  email: string | null;
  phone: string | null;
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
  method: 'kmeans_vector' | 'hdbscan_approx' | 'similarity_groups';
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
 */
async function findSimilarLeadsInline(
  referenceLeadId: string,
  limit: number,
  minSimilarity: number
): Promise<SimilarLeadResult[]> {
  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH reference AS (
        SELECT COALESCE(embedding_final, embedding_bio) AS embedding
        FROM lead_embeddings
        WHERE lead_id = '${referenceLeadId}'::uuid
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
        AND il.id != '${referenceLeadId}'::uuid
        AND 1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> ref.embedding) >= ${minSimilarity}
      ORDER BY COALESCE(le.embedding_final, le.embedding_bio) <=> ref.embedding
      LIMIT ${limit}
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
 */
export async function findLeadsByQuery(
  queryEmbedding: number[],
  limit: number = 50,
  minSimilarity: number = 0.6
): Promise<SimilarLeadResult[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

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
        AND 1 - (COALESCE(le.embedding_final, le.embedding_bio) <=> '${embeddingStr}'::vector) >= ${minSimilarity}
      ORDER BY COALESCE(le.embedding_final, le.embedding_bio) <=> '${embeddingStr}'::vector
      LIMIT ${limit}
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
  const leadMaxAgeDays = filters.lead_max_age_days ?? DEFAULT_LEAD_MAX_AGE_DAYS;
  const hashtagMaxAgeDays = filters.hashtag_max_age_days ?? DEFAULT_HASHTAG_MAX_AGE_DAYS;
  const targetStates = filters.target_states;
  const normalizedSeeds = seeds.map(s => normalizeSeedString(s)).filter(s => s.length > 0);
  const hasSeeds = normalizedSeeds.length > 0;

  // Log dos filtros aplicados
  console.log(`   📍 Filtros de recência: leads ≤${leadMaxAgeDays}d, hashtags ≤${hashtagMaxAgeDays}d`);
  if (targetStates && targetStates.length > 0) {
    console.log(`   🗺️  Filtro de estados: [${targetStates.join(', ')}]`);
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

  // Filtro de estados (se especificado)
  if (targetStates && targetStates.length > 0) {
    const statesArray = targetStates.map(s => `'${s.toUpperCase()}'`).join(', ');
    whereConditions.push(`(il.state IN (${statesArray}))`);
  }

  // Filtro por seeds em hashtags (bio/posts) para aderência ao nicho
  if (hasSeeds) {
    const seedArraySQL = normalizedSeeds.map(seed => `'${seed}'`).join(', ');
    // Usa ?| em JSONB para aproveitar índice GIN nas colunas de hashtags (sem varrer todo o array com LIKE)
    // Fallback normalizado (removendo acentos/espacos) para capturar variações
    whereConditions.push(`(
      (il.hashtags_bio ?| ARRAY[${seedArraySQL}])
      OR
      (il.hashtags_posts ?| ARRAY[${seedArraySQL}])
      OR EXISTS (
        SELECT 1 FROM (
          SELECT jsonb_array_elements_text(il.hashtags_bio) AS tag
          UNION ALL
          SELECT jsonb_array_elements_text(il.hashtags_posts) AS tag
        ) tags
        WHERE (
          -- Igualdade exata (normalizada)
          regexp_replace(
            LOWER(TRANSLATE(tags.tag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
            '[^a-z0-9]+',
            '_',
            'g'
          ) = ANY(ARRAY[${seedArraySQL}]::text[])
          -- OU contém a seed (permissivo)
          OR (${normalizedSeeds.map(seed => `regexp_replace(
                LOWER(TRANSLATE(tags.tag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
                '[^a-z0-9]+',
                '_',
                'g'
              ) LIKE '%${seed}%'`).join(' OR ')})
        )
      )
    )`);
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
        COUNT(*) FILTER (WHERE (il.email IS NOT NULL OR il.phone IS NOT NULL)) AS total_with_contact,
        COUNT(*) FILTER (WHERE il.email IS NULL AND il.phone IS NULL) AS total_without_contact
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
      method: 'similarity_groups'
    };
  }

  // Estratégia: UNION ALL para priorizar leads com contato sem CASE WHEN (mais rápido)
  const { data: leads, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH leads_com_contato AS (
        SELECT
          il.id, il.username, il.full_name, il.profession, il.city, il.state,
          il.bio, il.email, il.phone, il.followers_count,
          le.embedding_bio_text as embedding_text,
          COALESCE(le.embedding_final, le.embedding_bio)::text as embedding_str
        FROM instagram_leads il
        INNER JOIN lead_embeddings le ON le.lead_id = il.id
        WHERE ${whereClause} AND (il.email IS NOT NULL OR il.phone IS NOT NULL)
        ORDER BY il.followers_count DESC NULLS LAST
        LIMIT 3000
      ),
      leads_sem_contato AS (
        SELECT
          il.id, il.username, il.full_name, il.profession, il.city, il.state,
          il.bio, il.email, il.phone, il.followers_count,
          le.embedding_bio_text as embedding_text,
          COALESCE(le.embedding_final, le.embedding_bio)::text as embedding_str
        FROM instagram_leads il
        INNER JOIN lead_embeddings le ON le.lead_id = il.id
        WHERE ${whereClause} AND il.email IS NULL AND il.phone IS NULL
        ORDER BY il.followers_count DESC NULLS LAST
        LIMIT 3000
      )
      SELECT * FROM (
        SELECT * FROM leads_com_contato
        UNION ALL
        SELECT * FROM leads_sem_contato
      ) combined
      LIMIT 3000
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
      method: 'similarity_groups'
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

  // Inicializar centróides como embeddings
  let centroidEmbeddings: number[][] = initialCentroids
    .map(c => parseEmbedding(c.embedding_str))
    .filter((e): e is number[] => e !== null);

  // 3. KMeans Iterativo - 5 iterações de refinamento
  const MAX_ITERATIONS = 5;
  let assignments: Map<number, { lead: any; embedding: number[]; similarity: number }[]> = new Map();
  let previousAssignments: string[] = [];
  let silhouetteScore = 0;

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
    const currentAssignments = Array.from(assignments.entries())
      .flatMap(([clusterId, items]) => items.map(item => `${clusterId}:${item.lead.id}`))
      .sort()
      .join(',');

    if (currentAssignments === previousAssignments.join(',')) {
      console.log(`   ✅ Convergiu na iteração ${iteration + 1}`);
      break;
    }
    previousAssignments = currentAssignments.split(',');

    // Recalcular centróides como média dos embeddings do cluster
    const newCentroidEmbeddings: number[][] = [];
    for (let i = 0; i < k; i++) {
      const clusterItems = assignments.get(i) || [];
      if (clusterItems.length > 0) {
        const clusterEmbeddings = clusterItems.map(item => item.embedding);
        newCentroidEmbeddings.push(computeCentroidEmbedding(clusterEmbeddings));
      } else {
        // Manter centróide anterior se cluster vazio
        newCentroidEmbeddings.push(centroidEmbeddings[i] || []);
      }
    }
    centroidEmbeddings = newCentroidEmbeddings;

    console.log(`   📍 Iteração ${iteration + 1}: ${Array.from(assignments.values()).map(a => a.length).join(', ')} leads/cluster`);
  }

  // 4. Calcular Silhouette Score
  const silhouetteAssignments: Map<number, { embedding: number[]; leadId: string }[]> = new Map();
  for (const [clusterId, items] of assignments.entries()) {
    silhouetteAssignments.set(clusterId, items.map(item => ({
      embedding: item.embedding,
      leadId: item.lead.id
    })));
  }
  silhouetteScore = computeSilhouetteScore(silhouetteAssignments, centroidEmbeddings);
  console.log(`   📊 Silhouette Score: ${silhouetteScore.toFixed(3)}`);

  // 5. Converter assignments para formato final
  const clusters: Map<number, VectorClusteredLead[]> = new Map();
  for (let i = 0; i < k; i++) {
    clusters.set(i, []);
  }

  for (const [clusterId, items] of assignments.entries()) {
    for (const item of items) {
      if (item.similarity >= similarityThreshold || clusters.get(clusterId)!.length < minLeadsPerCluster) {
        clusters.get(clusterId)!.push({
          id: item.lead.id,
          username: item.lead.username,
          full_name: item.lead.full_name,
          profession: item.lead.profession,
          city: item.lead.city,
          state: item.lead.state,
          bio: item.lead.bio,
          email: item.lead.email,
          phone: item.lead.phone,
          followers_count: item.lead.followers_count || 0,
          similarity_to_centroid: item.similarity,
          embedding_text: item.lead.embedding_text
        });
      }
    }
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

    const leadsWithContact = clusterLeads.filter(l => l.email || l.phone).length;
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

  const executionTime = Date.now() - startTime;
  console.log(`\n✅ [VECTOR CLUSTERING - KMeans Iterativo] Concluído em ${executionTime}ms`);
  console.log(`   ${clusterResults.length} clusters gerados`);
  console.log(`   ${clusterResults.reduce((sum, c) => sum + c.total_leads, 0)} leads clusterizados`);
  console.log(`   Silhouette Score: ${silhouetteScore.toFixed(3)}`);

  return {
    success: true,
    campaign_id: campaignId,
    total_leads_analyzed: leadsWithEmbedding.length,
    total_leads_embedded: leadsWithEmbedding.length,
    clusters: clusterResults,
    execution_time_ms: executionTime,
    method: 'kmeans_vector',
    silhouette_avg: parseFloat(silhouetteScore.toFixed(3))
  } as VectorClusteringResult & { silhouette_avg: number };
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

  // Demais centróides: maximizar distância mínima aos existentes
  while (centroids.length < numCentroids) {
    let bestLead: any = null;
    let bestMinDist = -1;

    for (const lead of leads) {
      if (used.has(lead.id)) continue;

      const leadEmbedding = parseEmbedding(lead.embedding_str);
      if (!leadEmbedding) continue;

      // Calcular distância mínima aos centróides existentes
      let minDist = Infinity;
      for (const centroid of centroids) {
        const centroidEmbedding = parseEmbedding(centroid.embedding_str);
        if (!centroidEmbedding) continue;

        const dist = 1 - cosineSimilarity(leadEmbedding, centroidEmbedding);
        if (dist < minDist) minDist = dist;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestLead = lead;
      }
    }

    if (bestLead) {
      centroids.push(bestLead);
      used.add(bestLead.id);
    } else {
      break;
    }
  }

  return centroids;
}

/**
 * Parse embedding string para array de números
 */
function parseEmbedding(embeddingStr: string | null): number[] | null {
  if (!embeddingStr) return null;
  try {
    // Remove colchetes e espaços
    const cleaned = embeddingStr.replace(/[\[\]]/g, '').trim();
    return cleaned.split(',').map(s => parseFloat(s.trim()));
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
 * Calcula o Silhouette Score para avaliar qualidade dos clusters
 * Retorna valor entre -1 e 1 (maior = melhor separação)
 */
function computeSilhouetteScore(
  assignments: Map<number, { embedding: number[]; leadId: string }[]>,
  centroidEmbeddings: number[][]
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

  for (const clusterId of clusterIds) {
    const clusterPoints = sampledAssignments.get(clusterId) || [];
    if (clusterPoints.length < 2) continue;

    // Limitar pontos para comparação intra-cluster
    const comparePoints = clusterPoints.length <= MAX_COMPARE_POINTS
      ? clusterPoints
      : clusterPoints.slice(0, MAX_COMPARE_POINTS);

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
    }
  }

  return totalPoints > 0 ? totalScore / totalPoints : 0;
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
  silhouette_score?: number;
}

export interface LeadClusterAssociation {
  lead_id: string;
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
  silhouette_avg: number;
  execution_time_ms: number;
  method: 'kmeans_hashtag' | 'kmeans_vector' | 'similarity_groups' | 'hashtag_vector';
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
      silhouette_avg: 0,
      execution_time_ms: Date.now() - startTime,
      method: 'similarity_groups'
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
    silhouette_score: vc.avg_similarity
  }));

  // Converter lead associations
  const lead_associations: LeadClusterAssociation[] = [];

  for (const cluster of result.clusters) {
    for (const lead of cluster.leads) {
      lead_associations.push({
        lead_id: lead.id,
        clusters: [{
          cluster_id: cluster.cluster_id,
          hashtag_count: 0,
          weight: lead.similarity_to_centroid
        }],
        primary_cluster: cluster.cluster_id,
        score: lead.similarity_to_centroid,
        has_contact: !!(lead.email || lead.phone)
      });
    }
  }

  // Calcular média de similaridade (equivalente a silhouette)
  const avgSimilarity = result.clusters.length > 0
    ? result.clusters.reduce((sum, c) => sum + c.avg_similarity, 0) / result.clusters.length
    : 0;

  console.log(`✅ [VECTOR CLUSTERING] Pipeline-ready: ${clusters.length} clusters, ${lead_associations.length} leads`);

  return {
    success: true,
    nicho,
    seeds,
    k: numClusters,
    total_hashtags: 0,
    total_leads: result.total_leads_analyzed,
    clusters,
    lead_associations,
    silhouette_avg: avgSimilarity,
    execution_time_ms: Date.now() - startTime,
    method: 'similarity_groups'
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
  similarityThreshold: number = 0.65,
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
      silhouette_avg: 0,
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
    // Construir condições de filtro
    const leadFilterConditions: string[] = [
      `lcm.cluster_id = '${hc.id}'::uuid`,
      // Filtro de recência para leads
      `(il.created_at >= NOW() - INTERVAL '${leadMaxAgeDays} days' OR il.updated_at >= NOW() - INTERVAL '${leadMaxAgeDays} days')`
    ];

    // Filtro de campanha
    if (campaignId) {
      leadFilterConditions.push(`(lcm.campaign_id IS NULL OR lcm.campaign_id = '${campaignId}'::uuid)`);
    }

    // Filtro de estados
    if (targetStates && targetStates.length > 0) {
      const statesArray = targetStates.map(s => `'${s.toUpperCase()}'`).join(', ');
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
        il.email,
        il.phone,
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
    const leadsWithContact = leadsList.filter((l: any) => l.email || l.phone).length;
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
      silhouette_score: typeof hc.cohesion_score === 'number' ? hc.cohesion_score : (hc.silhouette_score || avgWeight)
    });

    leadsList.forEach((lead: any) => {
      leadAssociations.push({
        lead_id: lead.lead_id,
        clusters: [{
          cluster_id: clusterIndex,
          hashtag_count: lead.hashtag_count || hc.hashtag_count || 0,
          weight: lead.weight || 0
        }],
        primary_cluster: clusterIndex,
        score: lead.weight || 0,
        has_contact: !!(lead.email || lead.phone)
      });
    });
  }

  const silhouette = clusters.length > 0
    ? clusters.reduce((sum, c) => sum + (c.silhouette_score || 0), 0) / clusters.length
    : 0;

  console.log(`✅ [VECTOR HASHTAG] ${clusters.length} clusters montados, ${leadAssociations.length} leads associados`);

  return {
    success: true,
    nicho,
    seeds,
    k: numClusters,
    total_hashtags: clusters.reduce((sum, c) => sum + (c.hashtag_count || 0), 0),
    total_leads: leadAssociations.length,
    clusters,
    lead_associations: leadAssociations,
    silhouette_avg: silhouette,
    execution_time_ms: Date.now() - startTime,
    method: 'hashtag_vector'
  };
}

// ============================================
// EXPORTAÇÃO
// ============================================

export const vectorClusteringService = {
  findSimilarLeads,
  findLeadsByQuery,
  clusterBySimilarity,
  executeVectorClustering,
  executeHashtagVectorClustering,
  // Constantes de filtro
  DEFAULT_LEAD_MAX_AGE_DAYS,
  DEFAULT_HASHTAG_MAX_AGE_DAYS
};
