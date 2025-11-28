/**
 * CLUSTERING ENGINE SERVICE
 *
 * Implementa KMeans clustering para hashtags de um nicho.
 * Após validação de viabilidade, executa clustering real para:
 * - Agrupar hashtags semanticamente similares
 * - Identificar sub-nichos dentro do nicho principal
 * - Associar leads aos clusters
 * - Gerar personas e scores por cluster
 *
 * Pipeline: Validação → Clustering → Lead Association → Persona → Score
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface HashtagFeatures {
  hashtag: string;
  freq_total: number;
  freq_bio: number;
  freq_posts: number;
  unique_leads: number;
  contact_rate: number;
  // Features normalizadas
  log_freq: number;
  log_leads: number;
  z_freq?: number;
  z_leads?: number;
  z_contact?: number;
}

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
  // Métricas do cluster
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
}

// ============================================
// KMEANS IMPLEMENTATION (Pure TypeScript)
// ============================================

class KMeans {
  private k: number;
  private maxIterations: number;
  private centroids: number[][] = [];
  private assignments: number[] = [];

  constructor(k: number, maxIterations: number = 100) {
    this.k = k;
    this.maxIterations = maxIterations;
  }

  /**
   * Inicializa centroids usando K-Means++ para melhor convergência
   */
  private initializeCentroids(data: number[][]): void {
    const n = data.length;
    this.centroids = [];

    // Primeiro centroid aleatório
    const firstIdx = Math.floor(Math.random() * n);
    const firstPoint = data[firstIdx];
    if (firstPoint) {
      this.centroids.push([...firstPoint]);
    }

    // Demais centroids com probabilidade proporcional à distância
    for (let c = 1; c < this.k; c++) {
      const distances: number[] = [];
      let totalDist = 0;

      for (let i = 0; i < n; i++) {
        const point = data[i];
        if (!point) continue;
        let minDist = Infinity;
        for (const centroid of this.centroids) {
          const dist = this.euclideanDistance(point, centroid);
          if (dist < minDist) minDist = dist;
        }
        distances.push(minDist * minDist);
        totalDist += minDist * minDist;
      }

      // Seleciona próximo centroid com probabilidade proporcional
      let r = Math.random() * totalDist;
      for (let i = 0; i < n; i++) {
        const dist = distances[i] ?? 0;
        r -= dist;
        if (r <= 0) {
          const point = data[i];
          if (point) {
            this.centroids.push([...point]);
          }
          break;
        }
      }

      // Fallback se não selecionou
      if (this.centroids.length === c) {
        const idx = Math.floor(Math.random() * n);
        const fallbackPoint = data[idx];
        if (fallbackPoint) {
          this.centroids.push([...fallbackPoint]);
        }
      }
    }
  }

  /**
   * Calcula distância euclidiana entre dois pontos
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      sum += (ai - bi) ** 2;
    }
    return Math.sqrt(sum);
  }

  /**
   * Atribui cada ponto ao centroid mais próximo
   */
  private assignClusters(data: number[][]): boolean {
    let changed = false;
    const newAssignments: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      if (!point) continue;

      let minDist = Infinity;
      let minCluster = 0;

      for (let c = 0; c < this.k; c++) {
        const centroid = this.centroids[c];
        if (!centroid) continue;
        const dist = this.euclideanDistance(point, centroid);
        if (dist < minDist) {
          minDist = dist;
          minCluster = c;
        }
      }

      newAssignments.push(minCluster);
      if (this.assignments[i] !== minCluster) {
        changed = true;
      }
    }

    this.assignments = newAssignments;
    return changed;
  }

  /**
   * Recalcula centroids como média dos pontos do cluster
   */
  private updateCentroids(data: number[][]): void {
    const firstPoint = data[0];
    if (!firstPoint) return;
    const dims = firstPoint.length;
    const newCentroids: number[][] = [];
    const counts: number[] = new Array(this.k).fill(0);
    const sums: number[][] = Array.from({ length: this.k }, () => new Array(dims).fill(0));

    for (let i = 0; i < data.length; i++) {
      const cluster = this.assignments[i];
      if (cluster === undefined) continue;
      const point = data[i];
      if (!point) continue;
      const sumArr = sums[cluster];
      if (!sumArr) continue;

      counts[cluster] = (counts[cluster] ?? 0) + 1;
      for (let d = 0; d < dims; d++) {
        sumArr[d] = (sumArr[d] ?? 0) + (point[d] ?? 0);
      }
    }

    for (let c = 0; c < this.k; c++) {
      const count = counts[c] ?? 0;
      const sumArr = sums[c];
      if (count > 0 && sumArr) {
        newCentroids.push(sumArr.map(s => s / count));
      } else {
        // Cluster vazio - mantém centroid anterior
        const prevCentroid = this.centroids[c];
        if (prevCentroid) {
          newCentroids.push([...prevCentroid]);
        }
      }
    }

    this.centroids = newCentroids;
  }

  /**
   * Executa o algoritmo KMeans
   */
  fit(data: number[][]): { assignments: number[]; centroids: number[][] } {
    if (data.length < this.k) {
      throw new Error(`Dados insuficientes: ${data.length} pontos para ${this.k} clusters`);
    }

    this.initializeCentroids(data);
    this.assignments = new Array(data.length).fill(0);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const changed = this.assignClusters(data);
      if (!changed) {
        console.log(`   KMeans convergiu em ${iter + 1} iterações`);
        break;
      }
      this.updateCentroids(data);
    }

    return {
      assignments: this.assignments,
      centroids: this.centroids
    };
  }

  /**
   * Calcula silhouette score para avaliar qualidade do clustering
   */
  static silhouetteScore(data: number[][], assignments: number[], k: number): number {
    const n = data.length;
    if (n < 2) return 0;

    const euclidean = (a: number[], b: number[]): number => {
      let sum = 0;
      for (let idx = 0; idx < a.length; idx++) {
        const ai = a[idx] ?? 0;
        const bi = b[idx] ?? 0;
        sum += (ai - bi) ** 2;
      }
      return Math.sqrt(sum);
    };

    let totalSilhouette = 0;

    for (let i = 0; i < n; i++) {
      const myCluster = assignments[i];
      const pointI = data[i];
      if (pointI === undefined) continue;

      // a(i) = média da distância aos pontos do mesmo cluster
      let aSum = 0;
      let aCount = 0;
      for (let j = 0; j < n; j++) {
        const pointJ = data[j];
        if (i !== j && assignments[j] === myCluster && pointJ) {
          aSum += euclidean(pointI, pointJ);
          aCount++;
        }
      }
      const a = aCount > 0 ? aSum / aCount : 0;

      // b(i) = mínima média de distância a pontos de outros clusters
      let minB = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === myCluster) continue;

        let bSum = 0;
        let bCount = 0;
        for (let j = 0; j < n; j++) {
          const pointJ = data[j];
          if (assignments[j] === c && pointJ) {
            bSum += euclidean(pointI, pointJ);
            bCount++;
          }
        }
        if (bCount > 0) {
          const avgB = bSum / bCount;
          if (avgB < minB) minB = avgB;
        }
      }
      const b = minB === Infinity ? 0 : minB;

      // Silhouette para ponto i
      const maxAB = Math.max(a, b);
      const silhouette = maxAB > 0 ? (b - a) / maxAB : 0;
      totalSilhouette += silhouette;
    }

    return totalSilhouette / n;
  }
}

// ============================================
// FUNÇÕES DE NORMALIZAÇÃO
// ============================================

function normalizeString(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Aplica log1p e z-score nas features
 */
function normalizeFeatures(hashtags: HashtagFeatures[]): number[][] {
  // Calcular médias e desvios padrão
  const logFreqs = hashtags.map(h => h.log_freq);
  const logLeads = hashtags.map(h => h.log_leads);
  const contactRates = hashtags.map(h => h.contact_rate);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) || 1;

  const meanLogFreq = mean(logFreqs);
  const stdLogFreq = std(logFreqs, meanLogFreq);
  const meanLogLeads = mean(logLeads);
  const stdLogLeads = std(logLeads, meanLogLeads);
  const meanContact = mean(contactRates);
  const stdContact = std(contactRates, meanContact);

  // Normalizar com z-score
  return hashtags.map(h => [
    (h.log_freq - meanLogFreq) / stdLogFreq,
    (h.log_leads - meanLogLeads) / stdLogLeads,
    (h.contact_rate - meanContact) / stdContact
  ]);
}

/**
 * Determina o número ideal de clusters usando elbow method simplificado
 */
function findOptimalK(data: number[][], minK: number = 3, maxK: number = 10): number {
  if (data.length < maxK) {
    maxK = Math.max(minK, Math.floor(data.length / 3));
  }

  let bestK = minK;
  let bestScore = -1;

  for (let k = minK; k <= maxK; k++) {
    try {
      const kmeans = new KMeans(k);
      const { assignments } = kmeans.fit(data);
      const score = KMeans.silhouetteScore(data, assignments, k);

      console.log(`   K=${k}: silhouette=${score.toFixed(3)}`);

      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }
    } catch (e) {
      break;
    }
  }

  return bestK;
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Busca hashtags do nicho com todas as features necessárias
 */
async function fetchNicheHashtags(seeds: string[]): Promise<HashtagFeatures[]> {
  const normalizedSeeds = seeds.map(normalizeString).filter(s => s.length > 0);
  const seedConditions = normalizedSeeds
    .map(seed => `hashtag_normalized LIKE '%${seed}%'`)
    .join(' OR ');

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_occurrences AS (
        SELECT
          LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_normalized,
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
      niche_occurrences AS (
        SELECT * FROM hashtag_occurrences
        WHERE ${seedConditions}
      ),
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
        HAVING COUNT(*) >= 3  -- Mínimo de ocorrências para entrar no clustering
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

  if (error) throw error;

  return (data || []).map((row: any) => ({
    hashtag: row.hashtag,
    freq_total: parseInt(row.freq_total) || 0,
    freq_bio: parseInt(row.freq_bio) || 0,
    freq_posts: parseInt(row.freq_posts) || 0,
    unique_leads: parseInt(row.unique_leads) || 0,
    contact_rate: parseFloat(row.contact_rate) || 0,
    log_freq: Math.log1p(parseInt(row.freq_total) || 0),
    log_leads: Math.log1p(parseInt(row.unique_leads) || 0)
  }));
}

/**
 * Busca associação lead → hashtags para o nicho
 */
async function fetchLeadHashtagAssociations(seeds: string[]): Promise<Map<string, { hashtags: string[]; has_contact: boolean }>> {
  const normalizedSeeds = seeds.map(normalizeString).filter(s => s.length > 0);
  const seedConditions = normalizedSeeds
    .map(seed => `hashtag_normalized LIKE '%${seed}%'`)
    .join(' OR ');

  const { data, error } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_occurrences AS (
        SELECT
          LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_normalized,
          lead_id,
          has_contact
        FROM (
          SELECT
            jsonb_array_elements_text(hashtags_bio) as hashtag,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_bio IS NOT NULL

          UNION ALL

          SELECT
            jsonb_array_elements_text(hashtags_posts) as hashtag,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_posts IS NOT NULL
        ) raw
        WHERE hashtag IS NOT NULL AND hashtag != ''
      )
      SELECT
        lead_id,
        ARRAY_AGG(DISTINCT hashtag_normalized) as hashtags,
        BOOL_OR(has_contact) as has_contact
      FROM hashtag_occurrences
      WHERE ${seedConditions}
      GROUP BY lead_id
    `
  });

  if (error) throw error;

  const leadMap = new Map<string, { hashtags: string[]; has_contact: boolean }>();
  for (const row of data || []) {
    leadMap.set(row.lead_id, {
      hashtags: row.hashtags || [],
      has_contact: row.has_contact || false
    });
  }

  return leadMap;
}

/**
 * Extrai palavras-chave temáticas de um conjunto de hashtags
 */
function extractThemeKeywords(hashtags: string[]): string[] {
  const wordFreq: Record<string, number> = {};

  for (const hashtag of hashtags) {
    // Extrai palavras com 4+ caracteres
    const words = hashtag.match(/[a-z]{4,}/g) || [];
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Executa clustering completo no nicho
 */
export async function executeClustering(
  seeds: string[],
  nichoName: string,
  kOverride?: number
): Promise<ClusteringResult> {
  const startTime = Date.now();
  console.log(`\n🔬 [CLUSTERING ENGINE] Iniciando clustering para: ${nichoName}`);
  console.log(`   Seeds: [${seeds.join(', ')}]`);

  // 1. Buscar hashtags do nicho
  console.log(`\n📊 Buscando hashtags do nicho...`);
  const hashtags = await fetchNicheHashtags(seeds);
  console.log(`   ✅ ${hashtags.length} hashtags encontradas`);

  if (hashtags.length < 10) {
    return {
      success: false,
      error: `Dados insuficientes para clustering. Encontradas apenas ${hashtags.length} hashtags (mínimo: 10). Execute a validação de nicho primeiro.`,
      nicho: nichoName,
      seeds,
      k: 0,
      total_hashtags: hashtags.length,
      total_leads: 0,
      clusters: [],
      lead_associations: [],
      silhouette_avg: 0,
      execution_time_ms: Date.now() - startTime
    };
  }

  // 2. Normalizar features
  console.log(`\n🔄 Normalizando features (log1p + z-score)...`);
  const features = normalizeFeatures(hashtags);

  // 3. Determinar K ótimo ou usar override
  let k = kOverride || 5;
  if (!kOverride) {
    console.log(`\n🎯 Buscando K ótimo (silhouette method)...`);
    k = findOptimalK(features, 3, Math.min(10, Math.floor(hashtags.length / 5)));
  }
  console.log(`   K escolhido: ${k}`);

  // 4. Executar KMeans
  console.log(`\n⚙️ Executando KMeans...`);
  const kmeans = new KMeans(k);
  const { assignments, centroids } = kmeans.fit(features);
  const silhouetteAvg = KMeans.silhouetteScore(features, assignments, k);
  console.log(`   ✅ Clustering concluído (silhouette avg: ${silhouetteAvg.toFixed(3)})`);

  // 5. Agrupar hashtags por cluster
  const clusterHashtags: Map<number, HashtagFeatures[]> = new Map();
  for (let i = 0; i < hashtags.length; i++) {
    const clusterId = assignments[i] ?? 0;
    const hashtagData = hashtags[i];
    if (!hashtagData) continue;
    if (!clusterHashtags.has(clusterId)) {
      clusterHashtags.set(clusterId, []);
    }
    clusterHashtags.get(clusterId)!.push(hashtagData);
  }

  // 6. Criar mapa hashtag → cluster
  const hashtagClusterMap = new Map<string, number>();
  for (let i = 0; i < hashtags.length; i++) {
    const hashtagData = hashtags[i];
    if (!hashtagData) continue;
    hashtagClusterMap.set(hashtagData.hashtag, assignments[i] ?? 0);
  }

  // 7. Buscar associações lead → hashtags
  console.log(`\n👥 Buscando associações lead → hashtags...`);
  const leadAssociations = await fetchLeadHashtagAssociations(seeds);
  console.log(`   ✅ ${leadAssociations.size} leads encontrados`);

  // 8. Calcular peso de cada cluster (baseado em freq_total)
  const clusterWeights: number[] = [];
  for (let c = 0; c < k; c++) {
    const clusterData = clusterHashtags.get(c) || [];
    clusterWeights.push(clusterData.reduce((sum, h) => sum + h.freq_total, 0));
  }
  const totalWeight = clusterWeights.reduce((a, b) => a + b, 0);

  // 9. Associar leads aos clusters e calcular score
  const leadClusterAssociations: LeadClusterAssociation[] = [];

  for (const [leadId, leadData] of leadAssociations) {
    const clusterCounts: Map<number, number> = new Map();

    for (const hashtag of leadData.hashtags) {
      const clusterId = hashtagClusterMap.get(hashtag);
      if (clusterId !== undefined) {
        clusterCounts.set(clusterId, (clusterCounts.get(clusterId) || 0) + 1);
      }
    }

    if (clusterCounts.size === 0) continue;

    const clusters = Array.from(clusterCounts.entries()).map(([cluster_id, hashtag_count]) => ({
      cluster_id,
      hashtag_count,
      weight: ((clusterWeights[cluster_id] ?? 0) / totalWeight) * hashtag_count
    }));

    // Cluster primário = maior peso
    clusters.sort((a, b) => b.weight - a.weight);
    const firstCluster = clusters[0];
    if (!firstCluster) continue;
    const primaryCluster = firstCluster.cluster_id;

    // Score = soma ponderada dos pesos + bonus por contato
    let score = clusters.reduce((sum, c) => sum + c.weight, 0);
    if (leadData.has_contact) score += 5; // Bonus significativo por ter contato

    leadClusterAssociations.push({
      lead_id: leadId,
      clusters,
      primary_cluster: primaryCluster,
      score,
      has_contact: leadData.has_contact
    });
  }

  // Ordenar leads por score
  leadClusterAssociations.sort((a, b) => b.score - a.score);

  // 10. Montar resultado dos clusters
  const clusterResults: ClusterResult[] = [];

  for (let c = 0; c < k; c++) {
    const clusterData = clusterHashtags.get(c) || [];
    if (clusterData.length === 0) continue;

    // Top 10 hashtags por frequência
    const topHashtags = clusterData
      .sort((a, b) => b.freq_total - a.freq_total)
      .slice(0, 10)
      .map(h => ({
        hashtag: h.hashtag,
        freq_total: h.freq_total,
        unique_leads: h.unique_leads,
        contact_rate: h.contact_rate
      }));

    // Leads no cluster
    const leadsInCluster = leadClusterAssociations.filter(l => l.primary_cluster === c);

    // Métricas agregadas
    const totalLeads = leadsInCluster.length;
    const avgContactRate = clusterData.length > 0
      ? clusterData.reduce((sum, h) => sum + h.contact_rate, 0) / clusterData.length
      : 0;

    // Nome do cluster baseado nas top hashtags
    const themeKeywords = extractThemeKeywords(clusterData.map(h => h.hashtag));
    const clusterName = themeKeywords.slice(0, 2).join(' + ') || `Cluster ${c + 1}`;

    clusterResults.push({
      cluster_id: c,
      cluster_name: clusterName,
      hashtag_count: clusterData.length,
      total_leads: totalLeads,
      avg_contact_rate: parseFloat(avgContactRate.toFixed(1)),
      top_hashtags: topHashtags,
      theme_keywords: themeKeywords,
      centroid: centroids[c] ?? []
    });
  }

  // Ordenar clusters por total de leads
  clusterResults.sort((a, b) => b.total_leads - a.total_leads);

  const executionTime = Date.now() - startTime;
  console.log(`\n✅ [CLUSTERING ENGINE] Concluído em ${executionTime}ms`);
  console.log(`   ${clusterResults.length} clusters gerados`);
  console.log(`   ${leadClusterAssociations.length} leads associados`);

  return {
    success: true,
    nicho: nichoName,
    seeds,
    k,
    total_hashtags: hashtags.length,
    total_leads: leadClusterAssociations.length,
    clusters: clusterResults,
    lead_associations: leadClusterAssociations.slice(0, 100), // Top 100 leads
    silhouette_avg: parseFloat(silhouetteAvg.toFixed(3)),
    execution_time_ms: executionTime
  };
}

export const clusteringEngineService = {
  executeClustering
};
