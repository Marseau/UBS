-- Função temporária para resetar updated_at para created_at
CREATE OR REPLACE FUNCTION reset_updated_at_to_created_at_batch(p_limit INT DEFAULT 1000)
RETURNS TABLE(updated_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  WITH updated AS (
    UPDATE instagram_leads
    SET updated_at = created_at
    WHERE id IN (
      SELECT id FROM instagram_leads
      WHERE hashtags_ready_for_embedding = true
        AND updated_at != created_at
      LIMIT p_limit
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  updated_count := v_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
