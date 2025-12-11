/**
 * Embedding Calculator Service
 *
 * Calcula embedding_final com pesos + normalização L2
 *
 * Fórmula:
 * 1. E_raw = (bio × 0.5) + (website × 0.3) + (hashtags × 0.2)
 * 2. E_final = E_raw / ||E_raw||
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Pesos padrão
export const DEFAULT_WEIGHTS = {
  bio: 0.5,
  website: 0.3,
  hashtags: 0.2
};

export interface EmbeddingWeights {
  bio: number;
  website: number;
  hashtags: number;
}

export interface EmbeddingComponents {
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

  // PASSO 1: Soma ponderada (E_raw)
  const bioVec = components.bio;
  if (bioVec && bioVec.length === VECTOR_SIZE) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      result[i] += (bioVec[i] ?? 0) * weights.bio;
    }
    componentsUsed.push('bio');
  }

  const websiteVec = components.website;
  if (websiteVec && websiteVec.length === VECTOR_SIZE) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      result[i] += (websiteVec[i] ?? 0) * weights.website;
    }
    componentsUsed.push('website');
  }

  const hashtagsVec = components.hashtags;
  if (hashtagsVec && hashtagsVec.length === VECTOR_SIZE) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      result[i] += (hashtagsVec[i] ?? 0) * weights.hashtags;
    }
    componentsUsed.push('hashtags');
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
    // Buscar embeddings existentes
    const { data, error } = await this.supabase
      .from('lead_embeddings')
      .select('embedding_bio, embedding_website, embedding_hashtags')
      .eq('lead_id', leadId)
      .single();

    if (error || !data) {
      return {
        success: false,
        leadId,
        componentsUsed: [],
        magnitude: 0
      };
    }

    // Converter strings para arrays
    const components: EmbeddingComponents = {};

    if (data.embedding_bio) {
      components.bio = typeof data.embedding_bio === 'string'
        ? postgresStringToVector(data.embedding_bio)
        : data.embedding_bio;
    }

    if (data.embedding_website) {
      components.website = typeof data.embedding_website === 'string'
        ? postgresStringToVector(data.embedding_website)
        : data.embedding_website;
    }

    if (data.embedding_hashtags) {
      components.hashtags = typeof data.embedding_hashtags === 'string'
        ? postgresStringToVector(data.embedding_hashtags)
        : data.embedding_hashtags;
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
      .from('lead_embeddings')
      .select('lead_id')
      .or('embedding_final.is.null,embedded_at.is.null')
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
