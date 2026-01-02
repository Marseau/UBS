-- ============================================
-- Migration 088: RPC tipada para busca semântica de hashtags
-- ============================================
-- Resolve:
-- 1. SQL Injection via execute_sql genérico
-- 2. Performance sem índice vetorial
-- 3. Embedding passado como float8[] nativo (não string)
-- 4. Métrica de similaridade: cosine distance
-- ============================================

-- 1. View materializada com hashtags elegíveis (freq >= 20)
CREATE MATERIALIZED VIEW IF NOT EXISTS hashtag_seeds_eligible AS
SELECT
  id,
  hashtag,
  hashtag_normalized,
  embedding,
  occurrence_count,
  is_active
FROM hashtag_embeddings
WHERE is_active = true
  AND occurrence_count >= 20
  AND embedding IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hashtag_seeds_eligible_id
ON hashtag_seeds_eligible (id);

-- 2. Índice HNSW na view (1.7k registros - rápido)
CREATE INDEX IF NOT EXISTS idx_hashtag_seeds_eligible_hnsw
ON hashtag_seeds_eligible
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. Índice composto para filtros na tabela principal (fallback)
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_active_freq
ON hashtag_embeddings (is_active, occurrence_count DESC)
WHERE is_active = true AND occurrence_count >= 10;

-- 4. Função auxiliar: converter vector para float8[]
CREATE OR REPLACE FUNCTION vector_to_float8_array(v vector)
RETURNS float8[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_to_array(
    trim(both '[]' from v::text),
    ','
  )::float8[]
$$;

-- 5. RPC tipada para busca semântica
-- Aceita float8[] (array JS nativo), converte para vector internamente
-- Usa view materializada com índice HNSW se freq >= 20
CREATE OR REPLACE FUNCTION get_semantic_hashtags(
  query_embedding float8[],
  min_occurrence integer DEFAULT 20,
  min_similarity float DEFAULT 0.70,
  max_results integer DEFAULT 500
)
RETURNS TABLE (
  hashtag text,
  hashtag_normalized text,
  occurrence_count integer,
  similarity float,
  score float
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  vec vector(1536);
BEGIN
  -- Validação
  IF query_embedding IS NULL OR array_length(query_embedding, 1) != 1536 THEN
    RAISE EXCEPTION 'query_embedding deve ter 1536 dimensões, recebeu %',
      COALESCE(array_length(query_embedding, 1), 0);
  END IF;

  IF min_occurrence < 1 THEN min_occurrence := 1; END IF;
  IF min_similarity < 0 OR min_similarity > 1 THEN
    RAISE EXCEPTION 'min_similarity deve estar entre 0 e 1';
  END IF;
  IF max_results < 1 OR max_results > 2000 THEN max_results := 500; END IF;

  -- Converter float8[] para vector(1536)
  vec := query_embedding::vector(1536);

  -- Se freq >= 20, usar view materializada (com índice HNSW)
  IF min_occurrence >= 20 THEN
    RETURN QUERY
    SELECT
      he.hashtag,
      he.hashtag_normalized,
      he.occurrence_count,
      -- <=> com vector_cosine_ops = cosine distance
      (1 - (he.embedding <=> vec))::float AS similarity,
      ((1 - (he.embedding <=> vec)) * LN(he.occurrence_count + 1))::float AS score
    FROM hashtag_seeds_eligible he
    WHERE he.occurrence_count >= min_occurrence
      AND (1 - (he.embedding <=> vec)) >= min_similarity
    ORDER BY score DESC
    LIMIT max_results;
  ELSE
    -- Fallback para tabela completa
    RETURN QUERY
    SELECT
      he.hashtag,
      he.hashtag_normalized,
      he.occurrence_count,
      (1 - (he.embedding <=> vec))::float AS similarity,
      ((1 - (he.embedding <=> vec)) * LN(he.occurrence_count + 1))::float AS score
    FROM hashtag_embeddings he
    WHERE he.is_active = true
      AND he.occurrence_count >= min_occurrence
      AND he.embedding IS NOT NULL
      AND (1 - (he.embedding <=> vec)) >= min_similarity
    ORDER BY score DESC
    LIMIT max_results;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_semantic_hashtags IS
'Busca hashtags semanticamente similares usando pgvector cosine distance.
- query_embedding: float8[] com 1536 dimensões (OpenAI text-embedding-3-small)
- min_occurrence: frequência mínima (default 20)
- min_similarity: 0-1 (default 0.70)
- max_results: limite (default 500, max 2000)
- Score = similarity * ln(frequency + 1)';

-- 6. Função para validar seeds
CREATE OR REPLACE FUNCTION validate_seed_hashtags(
  seed_list text[],
  min_occurrence integer DEFAULT 20
)
RETURNS TABLE (
  hashtag text,
  hashtag_normalized text,
  occurrence_count integer,
  is_valid boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    he.hashtag,
    he.hashtag_normalized,
    he.occurrence_count,
    (he.occurrence_count >= min_occurrence AND he.is_active = true) AS is_valid
  FROM hashtag_embeddings he
  WHERE he.hashtag_normalized = ANY(
    SELECT LOWER(TRIM(BOTH '#' FROM unnest(seed_list)))
  );
END;
$$;

-- 7. Permissões
GRANT EXECUTE ON FUNCTION get_semantic_hashtags TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION validate_seed_hashtags TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION vector_to_float8_array TO authenticated, anon, service_role;

-- 8. Refresh da view (executar periodicamente)
-- REFRESH MATERIALIZED VIEW hashtag_seeds_eligible;
