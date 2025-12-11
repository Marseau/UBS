-- Migration 069: Completar lead_embeddings com campos faltantes
-- final_weights = pesos usados na composição do embedding final
-- embedded_at = quando o embedding final foi gerado
--
-- Fórmula do embedding_final (com normalização L2):
-- 1. E_raw = (bio × 0.5) + (website × 0.3) + (hashtags × 0.2)
-- 2. E_final = E_raw / ||E_raw||  (normalização para magnitude = 1)
--
-- Os pesos podem ser ajustados por campanha/contexto

-- ============================================
-- 1. ADICIONAR CAMPOS FALTANTES
-- ============================================
ALTER TABLE lead_embeddings
ADD COLUMN IF NOT EXISTS final_weights jsonb DEFAULT '{"bio": 0.5, "website": 0.3, "hashtags": 0.2}'::jsonb;

ALTER TABLE lead_embeddings
ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- ============================================
-- 2. ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_embedded_at
ON lead_embeddings(embedded_at)
WHERE embedded_at IS NOT NULL;

-- Índice para leads que precisam re-embedding (TTL 45 dias)
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_needs_reembed
ON lead_embeddings(embedded_at)
WHERE embedded_at < NOW() - INTERVAL '45 days' OR embedded_at IS NULL;

-- ============================================
-- 3. FUNÇÃO: Calcular embedding final com pesos + normalização L2
-- ============================================
CREATE OR REPLACE FUNCTION calculate_weighted_embedding(
  p_lead_id uuid,
  p_weights jsonb DEFAULT '{"bio": 0.5, "website": 0.3, "hashtags": 0.2}'::jsonb
)
RETURNS TABLE (
  embedding_final vector(1536),
  components_used text[],
  final_weights jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bio vector(1536);
  v_website vector(1536);
  v_hashtags vector(1536);
  v_result float8[1536];
  v_components text[] := ARRAY[]::text[];
  v_bio_weight float;
  v_website_weight float;
  v_hashtags_weight float;
  v_magnitude float := 0;
  i int;
BEGIN
  -- Extrair pesos
  v_bio_weight := COALESCE((p_weights->>'bio')::float, 0.5);
  v_website_weight := COALESCE((p_weights->>'website')::float, 0.3);
  v_hashtags_weight := COALESCE((p_weights->>'hashtags')::float, 0.2);

  -- Buscar embeddings existentes
  SELECT le.embedding_bio, le.embedding_website, le.embedding_hashtags
  INTO v_bio, v_website, v_hashtags
  FROM lead_embeddings le
  WHERE le.lead_id = p_lead_id;

  -- Inicializar resultado com zeros
  FOR i IN 1..1536 LOOP
    v_result[i] := 0.0;
  END LOOP;

  -- =============================================
  -- PASSO 1: Soma ponderada (E_raw)
  -- E_raw = (bio × w1) + (website × w2) + (hashtags × w3)
  -- =============================================

  -- Adicionar bio com peso
  IF v_bio IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_bio[i] * v_bio_weight);
    END LOOP;
    v_components := array_append(v_components, 'bio');
  END IF;

  -- Adicionar website com peso
  IF v_website IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_website[i] * v_website_weight);
    END LOOP;
    v_components := array_append(v_components, 'website');
  END IF;

  -- Adicionar hashtags com peso
  IF v_hashtags IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_hashtags[i] * v_hashtags_weight);
    END LOOP;
    v_components := array_append(v_components, 'hashtags');
  END IF;

  -- Se não há componentes, retornar NULL
  IF array_length(v_components, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::vector(1536), ARRAY[]::text[], p_weights;
    RETURN;
  END IF;

  -- =============================================
  -- PASSO 2: Calcular magnitude (norma L2)
  -- ||E_raw|| = sqrt(sum(E_raw[i]^2))
  -- =============================================
  v_magnitude := 0;
  FOR i IN 1..1536 LOOP
    v_magnitude := v_magnitude + (v_result[i] * v_result[i]);
  END LOOP;
  v_magnitude := sqrt(v_magnitude);

  -- =============================================
  -- PASSO 3: Normalizar (E_final = E_raw / ||E_raw||)
  -- Resultado: vetor unitário (magnitude = 1)
  -- =============================================
  IF v_magnitude > 0 THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] / v_magnitude;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_result::vector(1536), v_components, p_weights;
END;
$$;

COMMENT ON FUNCTION calculate_weighted_embedding(uuid, jsonb) IS
'Calcula embedding_final com pesos e normalização L2.

Fórmula:
1. E_raw = (bio × 0.5) + (website × 0.3) + (hashtags × 0.2)
2. ||E_raw|| = sqrt(sum(E_raw[i]^2))
3. E_final = E_raw / ||E_raw||

Resultado: vetor unitário (magnitude = 1) otimizado para cosine similarity e clustering.';

-- ============================================
-- 4. GRANTS
-- ============================================
GRANT EXECUTE ON FUNCTION calculate_weighted_embedding(uuid, jsonb) TO service_role;

-- ============================================
-- 5. COMENTÁRIOS
-- ============================================
COMMENT ON COLUMN lead_embeddings.final_weights IS 'Pesos usados na composição do embedding_final. Ex: {"bio": 0.5, "website": 0.3, "hashtags": 0.2}';
COMMENT ON COLUMN lead_embeddings.embedded_at IS 'Quando o embedding_final foi gerado/atualizado. Usado para controle de TTL (45 dias).';
