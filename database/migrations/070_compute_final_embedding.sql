-- Migration 070: Função compute_final_embedding + Trigger automático
--
-- Fórmula do embedding_final (com normalização L2):
-- 1. E_raw = (bio × 0.5) + (website × 0.3) + (hashtags × 0.2)
-- 2. ||E_raw|| = sqrt(sum(E_raw[i]^2))
-- 3. E_final = E_raw / ||E_raw||
--
-- Resultado: vetor unitário (magnitude = 1) otimizado para cosine similarity

-- ============================================
-- 1. FUNÇÃO: compute_final_embedding (calcula e SALVA)
-- ============================================
CREATE OR REPLACE FUNCTION compute_final_embedding(
  p_lead_id uuid,
  p_weights jsonb DEFAULT '{"bio": 0.5, "website": 0.3, "hashtags": 0.2}'::jsonb
)
RETURNS TABLE (
  success boolean,
  lead_id uuid,
  components_used text[],
  magnitude float
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

  -- Se não existe registro, retornar falso
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_lead_id, ARRAY[]::text[], 0::float;
    RETURN;
  END IF;

  -- Inicializar resultado com zeros
  FOR i IN 1..1536 LOOP
    v_result[i] := 0.0;
  END LOOP;

  -- =============================================
  -- PASSO 1: Soma ponderada (E_raw)
  -- =============================================
  IF v_bio IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_bio[i] * v_bio_weight);
    END LOOP;
    v_components := array_append(v_components, 'bio');
  END IF;

  IF v_website IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_website[i] * v_website_weight);
    END LOOP;
    v_components := array_append(v_components, 'website');
  END IF;

  IF v_hashtags IS NOT NULL THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] + (v_hashtags[i] * v_hashtags_weight);
    END LOOP;
    v_components := array_append(v_components, 'hashtags');
  END IF;

  -- Se não há componentes, retornar
  IF array_length(v_components, 1) IS NULL THEN
    RETURN QUERY SELECT false, p_lead_id, ARRAY[]::text[], 0::float;
    RETURN;
  END IF;

  -- =============================================
  -- PASSO 2: Calcular magnitude (norma L2)
  -- ||E_raw|| = sqrt(sum(E_raw[i]^2))
  -- =============================================
  FOR i IN 1..1536 LOOP
    v_magnitude := v_magnitude + (v_result[i] * v_result[i]);
  END LOOP;
  v_magnitude := sqrt(v_magnitude);

  -- =============================================
  -- PASSO 3: Normalizar (E_final = E_raw / ||E_raw||)
  -- =============================================
  IF v_magnitude > 0 THEN
    FOR i IN 1..1536 LOOP
      v_result[i] := v_result[i] / v_magnitude;
    END LOOP;
  END IF;

  -- =============================================
  -- PASSO 4: SALVAR no banco
  -- =============================================
  UPDATE lead_embeddings
  SET
    embedding_final = v_result::vector(1536),
    components_used = v_components,
    final_weights = p_weights,
    embedded_at = NOW(),
    updated_at = NOW()
  WHERE lead_embeddings.lead_id = p_lead_id;

  RETURN QUERY SELECT true, p_lead_id, v_components, v_magnitude;
END;
$$;

COMMENT ON FUNCTION compute_final_embedding(uuid, jsonb) IS
'Calcula o embedding_final com pesos + normalização L2 e SALVA no banco.

Fórmula:
1. E_raw = (bio × 0.5) + (website × 0.3) + (hashtags × 0.2)
2. ||E_raw|| = sqrt(sum(E_raw[i]^2))
3. E_final = E_raw / ||E_raw||

Uso:
  SELECT * FROM compute_final_embedding(''lead-uuid'');
  SELECT * FROM compute_final_embedding(''lead-uuid'', ''{"bio":0.6,"website":0.2,"hashtags":0.2}'');

Retorna: success, lead_id, components_used, magnitude';

-- ============================================
-- 2. TRIGGER: Recalcular embedding_final automaticamente
-- ============================================
CREATE OR REPLACE FUNCTION trigger_recompute_final_embedding()
RETURNS TRIGGER AS $$
DECLARE
  v_bio vector(1536);
  v_website vector(1536);
  v_hashtags vector(1536);
  v_result float8[1536];
  v_components text[] := ARRAY[]::text[];
  v_magnitude float := 0;
  v_bio_weight float := 0.5;
  v_website_weight float := 0.3;
  v_hashtags_weight float := 0.2;
  i int;
BEGIN
  -- Verificar se algum componente mudou
  IF (OLD.embedding_bio IS DISTINCT FROM NEW.embedding_bio) OR
     (OLD.embedding_website IS DISTINCT FROM NEW.embedding_website) OR
     (OLD.embedding_hashtags IS DISTINCT FROM NEW.embedding_hashtags) THEN

    -- Usar os novos valores
    v_bio := NEW.embedding_bio;
    v_website := NEW.embedding_website;
    v_hashtags := NEW.embedding_hashtags;

    -- Inicializar resultado
    FOR i IN 1..1536 LOOP
      v_result[i] := 0.0;
    END LOOP;

    -- PASSO 1: Soma ponderada
    IF v_bio IS NOT NULL THEN
      FOR i IN 1..1536 LOOP
        v_result[i] := v_result[i] + (v_bio[i] * v_bio_weight);
      END LOOP;
      v_components := array_append(v_components, 'bio');
    END IF;

    IF v_website IS NOT NULL THEN
      FOR i IN 1..1536 LOOP
        v_result[i] := v_result[i] + (v_website[i] * v_website_weight);
      END LOOP;
      v_components := array_append(v_components, 'website');
    END IF;

    IF v_hashtags IS NOT NULL THEN
      FOR i IN 1..1536 LOOP
        v_result[i] := v_result[i] + (v_hashtags[i] * v_hashtags_weight);
      END LOOP;
      v_components := array_append(v_components, 'hashtags');
    END IF;

    -- Se há componentes, calcular
    IF array_length(v_components, 1) IS NOT NULL THEN
      -- PASSO 2: Magnitude
      FOR i IN 1..1536 LOOP
        v_magnitude := v_magnitude + (v_result[i] * v_result[i]);
      END LOOP;
      v_magnitude := sqrt(v_magnitude);

      -- PASSO 3: Normalizar
      IF v_magnitude > 0 THEN
        FOR i IN 1..1536 LOOP
          v_result[i] := v_result[i] / v_magnitude;
        END LOOP;
      END IF;

      -- Atualizar campos no NEW
      NEW.embedding_final := v_result::vector(1536);
      NEW.components_used := v_components;
      NEW.embedded_at := NOW();
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_recompute_final_embedding ON lead_embeddings;
CREATE TRIGGER trg_recompute_final_embedding
  BEFORE UPDATE ON lead_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_final_embedding();

COMMENT ON FUNCTION trigger_recompute_final_embedding() IS
'Trigger que recalcula embedding_final automaticamente quando bio/website/hashtags mudam.
Aplica pesos (0.5/0.3/0.2) e normalização L2.';

-- ============================================
-- 3. FUNÇÃO: Batch compute para múltiplos leads
-- ============================================
CREATE OR REPLACE FUNCTION compute_final_embedding_batch(
  p_lead_ids uuid[],
  p_weights jsonb DEFAULT '{"bio": 0.5, "website": 0.3, "hashtags": 0.2}'::jsonb
)
RETURNS TABLE (
  success_count int,
  failed_count int,
  processed_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id uuid;
  v_success boolean;
  v_success_count int := 0;
  v_failed_count int := 0;
  v_processed uuid[] := ARRAY[]::uuid[];
BEGIN
  FOREACH v_lead_id IN ARRAY p_lead_ids
  LOOP
    SELECT (compute_final_embedding(v_lead_id, p_weights)).success INTO v_success;

    IF v_success THEN
      v_success_count := v_success_count + 1;
      v_processed := array_append(v_processed, v_lead_id);
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_success_count, v_failed_count, v_processed;
END;
$$;

COMMENT ON FUNCTION compute_final_embedding_batch(uuid[], jsonb) IS
'Processa batch de leads para calcular embedding_final.
Uso: SELECT * FROM compute_final_embedding_batch(ARRAY[uuid1, uuid2, ...]);';

-- ============================================
-- 4. VIEW: Leads que precisam de recálculo
-- ============================================
CREATE OR REPLACE VIEW v_leads_needing_final_embedding AS
SELECT
  le.lead_id,
  le.embedding_bio IS NOT NULL as has_bio,
  le.embedding_website IS NOT NULL as has_website,
  le.embedding_hashtags IS NOT NULL as has_hashtags,
  le.embedding_final IS NULL as needs_compute,
  le.embedded_at,
  le.updated_at
FROM lead_embeddings le
WHERE le.embedding_final IS NULL
  AND (le.embedding_bio IS NOT NULL
       OR le.embedding_website IS NOT NULL
       OR le.embedding_hashtags IS NOT NULL)
ORDER BY le.updated_at DESC;

COMMENT ON VIEW v_leads_needing_final_embedding IS
'Leads com componentes mas sem embedding_final calculado';

-- ============================================
-- 5. GRANTS
-- ============================================
GRANT EXECUTE ON FUNCTION compute_final_embedding(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION compute_final_embedding_batch(uuid[], jsonb) TO service_role;
GRANT SELECT ON v_leads_needing_final_embedding TO service_role;
GRANT SELECT ON v_leads_needing_final_embedding TO authenticated;
