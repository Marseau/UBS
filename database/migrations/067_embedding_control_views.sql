-- Migration 067: Views e funções de controle de embeddings
-- Arquitetura 3-in-1: embedding_bio + embedding_website + embedding_hashtags = embedding_final
-- TTL: Leads = 45 dias, Hashtags = 90 dias

-- ============================================
-- 1. VIEW: v_leads_embedding_queue
-- Leads que precisam de (re)embedding
-- TTL: 45 dias
-- ============================================
CREATE OR REPLACE VIEW v_leads_embedding_queue AS
SELECT
  il.id,
  il.username,
  il.full_name,
  il.bio,
  il.website,
  il.website_text,
  il.dado_enriquecido,
  il.url_enriched,
  il.created_at,
  il.updated_at,
  le.embedding_bio IS NOT NULL as has_embedding_bio,
  le.embedding_website IS NOT NULL as has_embedding_website,
  le.embedding_hashtags IS NOT NULL as has_embedding_hashtags,
  le.embedding_final IS NOT NULL as has_embedding_final,
  le.updated_at as last_embedded_at,
  CASE
    WHEN le.id IS NULL THEN 'never_embedded'
    WHEN le.updated_at < NOW() - INTERVAL '45 days' THEN 'expired'
    WHEN le.embedding_final IS NULL THEN 'incomplete'
    ELSE 'current'
  END as embedding_status,
  CASE
    WHEN le.id IS NULL THEN 1  -- Nunca embedado = alta prioridade
    WHEN le.updated_at < NOW() - INTERVAL '45 days' THEN 2  -- Expirado
    WHEN le.embedding_final IS NULL THEN 3  -- Incompleto
    ELSE 4  -- Atual
  END as priority
FROM instagram_leads il
LEFT JOIN lead_embeddings le ON le.lead_id = il.id
WHERE il.dado_enriquecido = true  -- Só leads enriquecidos
  AND il.bio IS NOT NULL  -- Precisa ter bio
  AND (
    le.id IS NULL  -- Nunca foi embedado
    OR le.updated_at < NOW() - INTERVAL '45 days'  -- Expirado (TTL 45 dias)
    OR le.embedding_final IS NULL  -- Embedding incompleto
  )
ORDER BY priority, il.updated_at DESC;

COMMENT ON VIEW v_leads_embedding_queue IS 'Fila de leads que precisam de embedding ou re-embedding (TTL 45 dias)';

-- ============================================
-- 2. VIEW: v_hashtags_embedding_queue
-- Hashtags que precisam de (re)embedding
-- TTL: 90 dias
-- ============================================
CREATE OR REPLACE VIEW v_hashtags_embedding_queue AS
SELECT
  he.id,
  he.hashtag,
  he.hashtag_normalized,
  he.occurrence_count,
  he.source,
  he.cluster_id,
  he.created_at,
  he.updated_at,
  he.embedded_at,
  he.embedding IS NOT NULL as has_embedding,
  CASE
    WHEN he.embedding IS NULL THEN 'never_embedded'
    WHEN he.embedded_at < NOW() - INTERVAL '90 days' THEN 'expired'
    ELSE 'current'
  END as embedding_status,
  CASE
    WHEN he.embedding IS NULL THEN 1  -- Nunca embedado
    WHEN he.embedded_at < NOW() - INTERVAL '90 days' THEN 2  -- Expirado
    ELSE 3  -- Atual
  END as priority
FROM hashtag_embeddings he
WHERE he.embedding IS NULL  -- Nunca foi embedada
   OR he.embedded_at < NOW() - INTERVAL '90 days'  -- Expirada (TTL 90 dias)
ORDER BY priority, he.occurrence_count DESC;

COMMENT ON VIEW v_hashtags_embedding_queue IS 'Fila de hashtags que precisam de embedding ou re-embedding (TTL 90 dias)';

-- ============================================
-- 3. VIEW: v_embedding_stats
-- Estatísticas gerais do sistema de embeddings
-- ============================================
CREATE OR REPLACE VIEW v_embedding_stats AS
SELECT
  -- Leads stats
  (SELECT COUNT(*) FROM instagram_leads WHERE dado_enriquecido = true) as total_enriched_leads,
  (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_final IS NOT NULL) as leads_with_final_embedding,
  (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_bio IS NOT NULL) as leads_with_bio_embedding,
  (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_website IS NOT NULL) as leads_with_website_embedding,
  (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_hashtags IS NOT NULL) as leads_with_hashtags_embedding,
  (SELECT COUNT(*) FROM v_leads_embedding_queue WHERE embedding_status = 'never_embedded') as leads_pending_first_embed,
  (SELECT COUNT(*) FROM v_leads_embedding_queue WHERE embedding_status = 'expired') as leads_pending_reembed,

  -- Hashtags stats
  (SELECT COUNT(*) FROM hashtag_embeddings) as total_hashtags,
  (SELECT COUNT(*) FROM hashtag_embeddings WHERE embedding IS NOT NULL) as hashtags_with_embedding,
  (SELECT COUNT(*) FROM v_hashtags_embedding_queue WHERE embedding_status = 'never_embedded') as hashtags_pending_first_embed,
  (SELECT COUNT(*) FROM v_hashtags_embedding_queue WHERE embedding_status = 'expired') as hashtags_pending_reembed,

  -- Coverage
  ROUND(
    (SELECT COUNT(*)::numeric FROM lead_embeddings WHERE embedding_final IS NOT NULL) * 100.0 /
    NULLIF((SELECT COUNT(*) FROM instagram_leads WHERE dado_enriquecido = true), 0),
    2
  ) as leads_embedding_coverage_pct,
  ROUND(
    (SELECT COUNT(*)::numeric FROM hashtag_embeddings WHERE embedding IS NOT NULL) * 100.0 /
    NULLIF((SELECT COUNT(*) FROM hashtag_embeddings), 0),
    2
  ) as hashtags_embedding_coverage_pct,

  -- Timestamps
  NOW() as calculated_at;

COMMENT ON VIEW v_embedding_stats IS 'Estatísticas consolidadas do sistema de embeddings';

-- ============================================
-- 4. FUNÇÃO: vector_mean
-- Calcula a média de um array de vectors
-- ============================================
CREATE OR REPLACE FUNCTION vector_mean(vectors vector(1536)[])
RETURNS vector(1536)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
DECLARE
  result float8[1536];
  v vector(1536);
  count_vectors int := 0;
  i int;
BEGIN
  -- Inicializar array de resultado com zeros
  FOR i IN 1..1536 LOOP
    result[i] := 0.0;
  END LOOP;

  -- Somar todos os vetores
  FOREACH v IN ARRAY vectors
  LOOP
    IF v IS NOT NULL THEN
      FOR i IN 1..1536 LOOP
        result[i] := result[i] + v[i];
      END LOOP;
      count_vectors := count_vectors + 1;
    END IF;
  END LOOP;

  -- Se não há vetores, retornar NULL
  IF count_vectors = 0 THEN
    RETURN NULL;
  END IF;

  -- Calcular média
  FOR i IN 1..1536 LOOP
    result[i] := result[i] / count_vectors;
  END LOOP;

  RETURN result::vector(1536);
END;
$$;

COMMENT ON FUNCTION vector_mean(vector(1536)[]) IS 'Calcula a média de um array de vectors 1536-dim';

-- ============================================
-- 5. FUNÇÃO: get_lead_hashtags_embedding
-- Obtém o embedding médio das hashtags de um lead
-- ============================================
CREATE OR REPLACE FUNCTION get_lead_hashtags_embedding(p_lead_id uuid)
RETURNS TABLE (
  embedding vector(1536),
  hashtags_used text[],
  hashtags_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hashtags text[];
  v_embeddings vector(1536)[];
  v_result vector(1536);
BEGIN
  -- Extrair todas as hashtags do lead (posts + bio)
  SELECT ARRAY(
    SELECT DISTINCT LOWER(REGEXP_REPLACE(h::text, '^#', ''))
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(il.hashtags_posts, '[]'::jsonb)) as h
      FROM instagram_leads il WHERE il.id = p_lead_id
      UNION ALL
      SELECT jsonb_array_elements_text(COALESCE(il.hashtags_bio, '[]'::jsonb)) as h
      FROM instagram_leads il WHERE il.id = p_lead_id
    ) all_hashtags
  ) INTO v_hashtags;

  -- Se não há hashtags, retornar NULL
  IF v_hashtags IS NULL OR array_length(v_hashtags, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::vector(1536), ARRAY[]::text[], 0;
    RETURN;
  END IF;

  -- Buscar embeddings das hashtags
  SELECT ARRAY_AGG(he.embedding)
  INTO v_embeddings
  FROM hashtag_embeddings he
  WHERE he.hashtag_normalized = ANY(v_hashtags)
    AND he.embedding IS NOT NULL;

  -- Se não há embeddings, retornar NULL
  IF v_embeddings IS NULL OR array_length(v_embeddings, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::vector(1536), v_hashtags, 0;
    RETURN;
  END IF;

  -- Calcular média dos embeddings
  v_result := vector_mean(v_embeddings);

  RETURN QUERY SELECT v_result, v_hashtags, array_length(v_embeddings, 1);
END;
$$;

COMMENT ON FUNCTION get_lead_hashtags_embedding(uuid) IS 'Obtém o embedding médio das hashtags de um lead';

-- ============================================
-- 6. FUNÇÃO: calculate_lead_final_embedding
-- Calcula o embedding final de um lead (3-in-1)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_lead_final_embedding(p_lead_id uuid)
RETURNS TABLE (
  embedding_final vector(1536),
  components_used text[],
  components_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_embeddings vector(1536)[];
  v_components text[] := ARRAY[]::text[];
  v_bio_embedding vector(1536);
  v_website_embedding vector(1536);
  v_hashtags_embedding vector(1536);
  v_final vector(1536);
BEGIN
  -- 1. Buscar embedding da bio
  SELECT le.embedding_bio INTO v_bio_embedding
  FROM lead_embeddings le
  WHERE le.lead_id = p_lead_id;

  IF v_bio_embedding IS NOT NULL THEN
    v_embeddings := array_append(v_embeddings, v_bio_embedding);
    v_components := array_append(v_components, 'bio');
  END IF;

  -- 2. Buscar embedding do website
  SELECT le.embedding_website INTO v_website_embedding
  FROM lead_embeddings le
  WHERE le.lead_id = p_lead_id;

  IF v_website_embedding IS NOT NULL THEN
    v_embeddings := array_append(v_embeddings, v_website_embedding);
    v_components := array_append(v_components, 'website');
  END IF;

  -- 3. Buscar embedding das hashtags
  SELECT le.embedding_hashtags INTO v_hashtags_embedding
  FROM lead_embeddings le
  WHERE le.lead_id = p_lead_id;

  IF v_hashtags_embedding IS NOT NULL THEN
    v_embeddings := array_append(v_embeddings, v_hashtags_embedding);
    v_components := array_append(v_components, 'hashtags');
  END IF;

  -- Se não há embeddings, retornar NULL
  IF v_embeddings IS NULL OR array_length(v_embeddings, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::vector(1536), ARRAY[]::text[], 0;
    RETURN;
  END IF;

  -- Calcular média dos embeddings
  v_final := vector_mean(v_embeddings);

  RETURN QUERY SELECT v_final, v_components, array_length(v_components, 1);
END;
$$;

COMMENT ON FUNCTION calculate_lead_final_embedding(uuid) IS 'Calcula o embedding final de um lead usando arquitetura 3-in-1';

-- ============================================
-- 7. FUNÇÃO: get_embedding_queue_batch
-- Retorna um batch de leads ou hashtags para embedding
-- ============================================
CREATE OR REPLACE FUNCTION get_embedding_queue_batch(
  p_type text,  -- 'leads' ou 'hashtags'
  p_batch_size integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  identifier text,
  text_to_embed text,
  priority integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_type = 'leads' THEN
    RETURN QUERY
    SELECT
      q.id,
      q.username as identifier,
      CONCAT_WS(' | ',
        'Nome: ' || COALESCE(q.full_name, q.username),
        'Bio: ' || COALESCE(q.bio, ''),
        'Website: ' || COALESCE(LEFT(q.website_text, 2000), '')
      ) as text_to_embed,
      q.priority::integer
    FROM v_leads_embedding_queue q
    LIMIT p_batch_size;

  ELSIF p_type = 'hashtags' THEN
    RETURN QUERY
    SELECT
      q.id,
      q.hashtag as identifier,
      q.hashtag as text_to_embed,
      q.priority::integer
    FROM v_hashtags_embedding_queue q
    LIMIT p_batch_size;

  ELSE
    RAISE EXCEPTION 'Tipo inválido: %. Use "leads" ou "hashtags".', p_type;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_embedding_queue_batch(text, integer) IS 'Retorna batch de items para embedding';

-- ============================================
-- 8. GRANTS
-- ============================================
GRANT SELECT ON v_leads_embedding_queue TO service_role;
GRANT SELECT ON v_leads_embedding_queue TO authenticated;

GRANT SELECT ON v_hashtags_embedding_queue TO service_role;
GRANT SELECT ON v_hashtags_embedding_queue TO authenticated;

GRANT SELECT ON v_embedding_stats TO service_role;
GRANT SELECT ON v_embedding_stats TO authenticated;

GRANT EXECUTE ON FUNCTION vector_mean(vector(1536)[]) TO service_role;
GRANT EXECUTE ON FUNCTION get_lead_hashtags_embedding(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_lead_final_embedding(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_embedding_queue_batch(text, integer) TO service_role;
