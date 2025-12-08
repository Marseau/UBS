-- Migration 071: Flag hashtags_ready_for_embedding
-- Garante que leads só são embedados quando TODAS suas hashtags já têm embedding

-- 1. Adicionar coluna na tabela instagram_leads
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS hashtags_ready_for_embedding BOOLEAN DEFAULT false;

-- 2. Criar índice para queries eficientes
CREATE INDEX IF NOT EXISTS idx_leads_hashtags_ready
ON instagram_leads (hashtags_ready_for_embedding)
WHERE hashtags_ready_for_embedding = false AND hashtags_extracted = true;

-- 3. Função para verificar se TODAS hashtags de um lead estão embedadas
CREATE OR REPLACE FUNCTION check_lead_hashtags_ready(p_lead_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_total_hashtags INT;
  v_embedded_hashtags INT;
BEGIN
  -- Contar hashtags do lead (posts + bio)
  WITH lead_hashtags AS (
    SELECT DISTINCT jsonb_array_elements_text(
      COALESCE(hashtags_posts, '[]'::jsonb) || COALESCE(hashtags_bio, '[]'::jsonb)
    ) as hashtag
    FROM instagram_leads
    WHERE id = p_lead_id
  )
  SELECT COUNT(*) INTO v_total_hashtags FROM lead_hashtags;

  -- Se não tem hashtags, está pronto
  IF v_total_hashtags = 0 THEN
    RETURN true;
  END IF;

  -- Contar quantas hashtags já têm embedding
  WITH lead_hashtags AS (
    SELECT DISTINCT jsonb_array_elements_text(
      COALESCE(hashtags_posts, '[]'::jsonb) || COALESCE(hashtags_bio, '[]'::jsonb)
    ) as hashtag
    FROM instagram_leads
    WHERE id = p_lead_id
  )
  SELECT COUNT(*) INTO v_embedded_hashtags
  FROM lead_hashtags lh
  JOIN hashtag_embeddings he ON LOWER(he.hashtag) = LOWER(lh.hashtag)
  WHERE he.embedding IS NOT NULL;

  -- Retorna true se todas hashtags estão embedadas
  RETURN v_embedded_hashtags >= v_total_hashtags;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para atualizar flag de múltiplos leads em batch
CREATE OR REPLACE FUNCTION update_hashtags_ready_batch(p_limit INT DEFAULT 1000)
RETURNS TABLE(updated_count INT, ready_count INT, not_ready_count INT) AS $$
DECLARE
  v_updated INT := 0;
  v_ready INT := 0;
  v_not_ready INT := 0;
BEGIN
  -- Atualizar leads que têm hashtags extraídas mas flag não verificada
  WITH leads_to_check AS (
    SELECT id
    FROM instagram_leads
    WHERE hashtags_extracted = true
      AND hashtags_ready_for_embedding = false
    LIMIT p_limit
  ),
  updates AS (
    UPDATE instagram_leads il
    SET hashtags_ready_for_embedding = check_lead_hashtags_ready(il.id),
        updated_at = NOW()
    WHERE il.id IN (SELECT id FROM leads_to_check)
    RETURNING il.id, il.hashtags_ready_for_embedding
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE hashtags_ready_for_embedding = true),
    COUNT(*) FILTER (WHERE hashtags_ready_for_embedding = false)
  INTO v_updated, v_ready, v_not_ready
  FROM updates;

  updated_count := v_updated;
  ready_count := v_ready;
  not_ready_count := v_not_ready;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 5. Função OTIMIZADA para marcar leads prontos após embedding de hashtags
-- Usa batch processing para evitar timeout
CREATE OR REPLACE FUNCTION mark_leads_ready_after_hashtag_embedding()
RETURNS TABLE(leads_marked_ready INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Versão otimizada: processa em batch de 500 leads
  WITH leads_to_check AS (
    SELECT id FROM instagram_leads
    WHERE hashtags_extracted = true
      AND hashtags_ready_for_embedding = false
    LIMIT 500
  ),
  lead_hashtag_status AS (
    SELECT
      il.id as lead_id,
      COUNT(DISTINCT h.value) as total_hashtags,
      COUNT(DISTINCT CASE WHEN he.embedding IS NOT NULL THEN h.value END) as embedded_hashtags
    FROM leads_to_check ltc
    JOIN instagram_leads il ON il.id = ltc.id
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(
        COALESCE(il.hashtags_posts, '[]'::jsonb) || COALESCE(il.hashtags_bio, '[]'::jsonb)
      ) as value
    ) h
    LEFT JOIN hashtag_embeddings he ON LOWER(he.hashtag) = LOWER(h.value)
    GROUP BY il.id
  ),
  ready_leads AS (
    SELECT lead_id FROM lead_hashtag_status
    WHERE embedded_hashtags >= total_hashtags
  ),
  updated AS (
    UPDATE instagram_leads
    SET hashtags_ready_for_embedding = true
    WHERE id IN (SELECT lead_id FROM ready_leads)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  leads_marked_ready := v_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 6. View para leads prontos para embedding completo
CREATE OR REPLACE VIEW v_leads_ready_for_embedding AS
SELECT
  il.id,
  il.username,
  il.dado_enriquecido,
  il.hashtags_extracted,
  il.url_enriched,
  il.hashtags_ready_for_embedding,
  (il.bio IS NOT NULL AND il.bio != '') as has_bio,
  (il.website_text IS NOT NULL AND il.website_text != '') as has_website
FROM instagram_leads il
WHERE il.dado_enriquecido = true
  AND il.hashtags_extracted = true
  AND il.url_enriched = true
  AND il.hashtags_ready_for_embedding = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_embeddings le
    WHERE le.lead_id = il.id AND le.embedding_final IS NOT NULL
  )
  AND (
    (il.bio IS NOT NULL AND il.bio != '')
    OR (il.website_text IS NOT NULL AND il.website_text != '')
    OR jsonb_array_length(COALESCE(il.hashtags_posts, '[]'::jsonb)) > 0
    OR jsonb_array_length(COALESCE(il.hashtags_bio, '[]'::jsonb)) > 0
  );

-- 7. Comentários
COMMENT ON COLUMN instagram_leads.hashtags_ready_for_embedding IS
  'Flag indicando que TODAS as hashtags do lead já foram embedadas na tabela hashtag_embeddings';

COMMENT ON FUNCTION check_lead_hashtags_ready(UUID) IS
  'Verifica se todas as hashtags de um lead têm embedding';

COMMENT ON FUNCTION update_hashtags_ready_batch(INT) IS
  'Atualiza flag hashtags_ready_for_embedding em batch';

COMMENT ON FUNCTION mark_leads_ready_after_hashtag_embedding() IS
  'Marca leads como prontos após workflow de embedding de hashtags';
