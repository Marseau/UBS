-- Migration 068: Campos de recência em hashtag_embeddings
-- last_seen_at = quando a hashtag foi vista pela última vez (recência)
-- is_active = flag para otimizar queries (evita cálculos de validade)
--
-- IMPORTANTE:
-- - last_seen_at: atualizar SEMPRE que a hashtag reaparece em um lead
-- - updated_at: só muda quando dados da linha mudam (embedding, cluster, etc)
-- - is_active: setar false quando NOW() - last_seen_at > 90 dias

-- ============================================
-- 1. ADICIONAR CAMPOS
-- ============================================
ALTER TABLE hashtag_embeddings
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT NOW();

ALTER TABLE hashtag_embeddings
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ============================================
-- 2. ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_last_seen
ON hashtag_embeddings(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_active
ON hashtag_embeddings(is_active) WHERE is_active = true;

-- Índice composto para queries de recência + atividade
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_active_recent
ON hashtag_embeddings(is_active, last_seen_at DESC)
WHERE is_active = true;

-- ============================================
-- 3. FUNÇÃO: Marcar hashtags expiradas
-- ============================================
CREATE OR REPLACE FUNCTION mark_expired_hashtags(p_ttl_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE hashtag_embeddings
  SET is_active = false,
      updated_at = NOW()
  WHERE is_active = true
    AND last_seen_at < NOW() - (p_ttl_days || ' days')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION mark_expired_hashtags(integer) IS 'Marca hashtags como inativas quando last_seen_at > TTL dias';

-- ============================================
-- 4. FUNÇÃO: Reativar hashtag quando vista novamente
-- ============================================
CREATE OR REPLACE FUNCTION touch_hashtag(p_hashtag_normalized text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE hashtag_embeddings
  SET last_seen_at = NOW(),
      is_active = true,
      occurrence_count = occurrence_count + 1
  WHERE hashtag_normalized = p_hashtag_normalized;
END;
$$;

COMMENT ON FUNCTION touch_hashtag(text) IS 'Atualiza last_seen_at e incrementa occurrence_count quando hashtag é vista novamente';

-- ============================================
-- 5. VIEW: Hashtags ativas para embedding
-- ============================================
CREATE OR REPLACE VIEW v_active_hashtags AS
SELECT
  id,
  hashtag,
  hashtag_normalized,
  embedding,
  occurrence_count,
  cluster_id,
  last_seen_at,
  embedded_at,
  EXTRACT(DAY FROM NOW() - last_seen_at) as days_since_seen
FROM hashtag_embeddings
WHERE is_active = true
ORDER BY occurrence_count DESC;

COMMENT ON VIEW v_active_hashtags IS 'Hashtags ativas (vistas nos últimos 90 dias)';

-- ============================================
-- 6. GRANTS
-- ============================================
GRANT EXECUTE ON FUNCTION mark_expired_hashtags(integer) TO service_role;
GRANT EXECUTE ON FUNCTION touch_hashtag(text) TO service_role;
GRANT SELECT ON v_active_hashtags TO service_role;
GRANT SELECT ON v_active_hashtags TO authenticated;

-- ============================================
-- 7. COMENTÁRIOS
-- ============================================
COMMENT ON COLUMN hashtag_embeddings.last_seen_at IS 'Última vez que a hashtag foi encontrada em um lead. Usado para calcular recência e validade. Atualizar SEMPRE que reaparece.';
COMMENT ON COLUMN hashtag_embeddings.is_active IS 'Flag de otimização: false quando NOW() - last_seen_at > TTL (90 dias). Evita cálculos pesados em queries de clusterização.';
