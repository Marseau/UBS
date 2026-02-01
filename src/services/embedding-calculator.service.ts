/**
 * Embedding Calculator Service
 *
 * Calcula embedding_final com pesos + normalização L2
 *
 * Fórmula (4 componentes):
 * 1. E_raw = (d2p × 0.40) + (bio × 0.25) + (website × 0.20) + (hashtags × 0.15)
 *    Pesos normalizados quando componentes são NULL
 * 2. E_final = E_raw / ||E_raw||
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Pesos padrão (4 componentes, soma = 1.00)
export const DEFAULT_WEIGHTS = {
  d2p: 0.40,
  bio: 0.25,
  website: 0.20,
  hashtags: 0.15
};

export interface EmbeddingWeights {
  d2p: number;
  bio: number;
  website: number;
  hashtags: number;
}

export interface EmbeddingComponents {
  d2p?: number[];
  bio?: number[];
  website?: number[];
  hashtags?: number[];
}

export interface ComputeResult {
  success: boolean;
  leadId: string;
  componentsUsed: string[];
  magnitude: number;
  embedding?: number[];
}

/**
 * Calcula o embedding final com pesos e normalização L2
 *
 * @param components - Embeddings individuais (bio, website, hashtags)
 * @param weights - Pesos para cada componente
 * @returns Embedding final normalizado (magnitude = 1)
 */
export function computeFinalEmbedding(
  components: EmbeddingComponents,
  weights: EmbeddingWeights = DEFAULT_WEIGHTS
): { embedding: number[]; componentsUsed: string[]; magnitude: number } | null {
  const VECTOR_SIZE = 1536;
  const result = new Array(VECTOR_SIZE).fill(0);
  const componentsUsed: string[] = [];

  // Calcular total de pesos dos componentes presentes (para normalização)
  let totalWeight = 0;
  const entries: { vec: number[]; weight: number; name: string }[] = [];

  if (components.d2p && components.d2p.length === VECTOR_SIZE) {
    entries.push({ vec: components.d2p, weight: weights.d2p, name: 'd2p' });
    totalWeight += weights.d2p;
  }
  if (components.bio && components.bio.length === VECTOR_SIZE) {
    entries.push({ vec: components.bio, weight: weights.bio, name: 'bio' });
    totalWeight += weights.bio;
  }
  if (components.website && components.website.length === VECTOR_SIZE) {
    entries.push({ vec: components.website, weight: weights.website, name: 'website' });
    totalWeight += weights.website;
  }
  if (components.hashtags && components.hashtags.length === VECTOR_SIZE) {
    entries.push({ vec: components.hashtags, weight: weights.hashtags, name: 'hashtags' });
    totalWeight += weights.hashtags;
  }

  // PASSO 1: Soma ponderada com pesos normalizados (E_raw)
  for (const entry of entries) {
    const normalizedWeight = entry.weight / totalWeight;
    for (let i = 0; i < VECTOR_SIZE; i++) {
      result[i] += (entry.vec[i] ?? 0) * normalizedWeight;
    }
    componentsUsed.push(entry.name);
  }

  // Se não há componentes, retornar null
  if (componentsUsed.length === 0) {
    return null;
  }

  // PASSO 2: Calcular magnitude (norma L2)
  // ||E_raw|| = sqrt(sum(E_raw[i]^2))
  let magnitude = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) {
    magnitude += result[i] * result[i];
  }
  magnitude = Math.sqrt(magnitude);

  // PASSO 3: Normalizar (E_final = E_raw / ||E_raw||)
  if (magnitude > 0) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      result[i] = result[i] / magnitude;
    }
  }

  return {
    embedding: result,
    componentsUsed,
    magnitude
  };
}

/**
 * Converte array de números para string de vetor PostgreSQL
 */
export function vectorToPostgresString(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Converte string de vetor PostgreSQL para array de números
 */
export function postgresStringToVector(str: string): number[] {
  const cleaned = str.replace(/[\[\]]/g, '');
  return cleaned.split(',').map(Number);
}

/**
 * Classe principal do serviço de cálculo de embeddings
 */
export class EmbeddingCalculatorService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabase = createClient(
      supabaseUrl || process.env.SUPABASE_URL!,
      supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Busca embeddings de um lead e calcula o final
   */
  async computeForLead(
    leadId: string,
    weights: EmbeddingWeights = DEFAULT_WEIGHTS
  ): Promise<ComputeResult> {
    // Buscar embeddings de components
    const { data: compData, error: compError } = await this.supabase
      .from('lead_embedding_components')
      .select('embedding_bio, embedding_website, embedding_hashtags')
      .eq('lead_id', leadId)
      .single();

    // Buscar embedding D2P
    const { data: d2pData } = await this.supabase
      .from('lead_embedding_d2p')
      .select('embedding_d2p')
      .eq('lead_id', leadId)
      .single();

    if ((compError || !compData) && !d2pData) {
      return {
        success: false,
        leadId,
        componentsUsed: [],
        magnitude: 0
      };
    }

    // Converter strings para arrays
    const components: EmbeddingComponents = {};

    if (d2pData?.embedding_d2p) {
      components.d2p = typeof d2pData.embedding_d2p === 'string'
        ? postgresStringToVector(d2pData.embedding_d2p)
        : d2pData.embedding_d2p;
    }

    if (compData?.embedding_bio) {
      components.bio = typeof compData.embedding_bio === 'string'
        ? postgresStringToVector(compData.embedding_bio)
        : compData.embedding_bio;
    }

    if (compData?.embedding_website) {
      components.website = typeof compData.embedding_website === 'string'
        ? postgresStringToVector(compData.embedding_website)
        : compData.embedding_website;
    }

    if (compData?.embedding_hashtags) {
      components.hashtags = typeof compData.embedding_hashtags === 'string'
        ? postgresStringToVector(compData.embedding_hashtags)
        : compData.embedding_hashtags;
    }

    // Calcular embedding final
    const result = computeFinalEmbedding(components, weights);

    if (!result) {
      return {
        success: false,
        leadId,
        componentsUsed: [],
        magnitude: 0
      };
    }

    return {
      success: true,
      leadId,
      componentsUsed: result.componentsUsed,
      magnitude: result.magnitude,
      embedding: result.embedding
    };
  }

  /**
   * Calcula e SALVA o embedding final no banco
   * Usa a função SQL compute_final_embedding para garantir consistência
   */
  async computeAndSave(
    leadId: string,
    weights: EmbeddingWeights = DEFAULT_WEIGHTS
  ): Promise<ComputeResult> {
    const { data, error } = await this.supabase.rpc('compute_final_embedding', {
      p_lead_id: leadId,
      p_weights: weights
    });

    if (error) {
      console.error('Erro ao computar embedding:', error);
      return {
        success: false,
        leadId,
        componentsUsed: [],
        magnitude: 0
      };
    }

    const row = data?.[0];
    return {
      success: row?.success || false,
      leadId: row?.lead_id || leadId,
      componentsUsed: row?.components_used || [],
      magnitude: row?.magnitude || 0
    };
  }

  /**
   * Processa batch de leads
   */
  async computeBatch(
    leadIds: string[],
    weights: EmbeddingWeights = DEFAULT_WEIGHTS
  ): Promise<ComputeResult[]> {
    const results: ComputeResult[] = [];

    for (const leadId of leadIds) {
      const result = await this.computeAndSave(leadId, weights);
      results.push(result);
    }

    return results;
  }

  /**
   * Busca leads que precisam de recálculo
   * (embedding_final é NULL ou componentes mudaram)
   */
  async getLeadsNeedingRecompute(limit = 100): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('lead_embedding_components')
      .select('lead_id')
      .eq('needs_final_recompute', true)
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map(row => row.lead_id);
  }

  /**
   * Calcula similaridade coseno entre dois vetores
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vetores devem ter mesmo tamanho');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
}

// Export singleton
export const embeddingCalculator = new EmbeddingCalculatorService();
