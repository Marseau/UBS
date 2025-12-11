-- Migration 064: Tabela separada para embeddings de leads
-- Evita race conditions com outros processos de UPDATE no instagram_leads

-- Criar tabela separada para embeddings
CREATE TABLE IF NOT EXISTS lead_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_text text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(lead_id)
);

-- Criar índice HNSW para busca por similaridade
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_hnsw
ON lead_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índice para lookup por lead_id
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_lead_id
ON lead_embeddings(lead_id);

-- Migrar embeddings existentes da tabela instagram_leads
INSERT INTO lead_embeddings (lead_id, embedding, embedding_text, created_at, updated_at)
SELECT
  id as lead_id,
  embedding,
  embedding_text,
  COALESCE(embedding_at, NOW()) as created_at,
  COALESCE(embedding_at, NOW()) as updated_at
FROM instagram_leads
WHERE embedding IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;

-- Função atualizada para buscar leads similares usando nova tabela
DROP FUNCTION IF EXISTS find_similar_leads(uuid, integer, float);

CREATE OR REPLACE FUNCTION find_similar_leads(
  reference_lead_id uuid,
  match_count integer DEFAULT 50,
  min_similarity float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  profession text,
  city text,
  similarity float,
  embedding_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reference_embedding vector(1536);
BEGIN
  -- Get the reference lead's embedding from the new table
  SELECT le.embedding INTO reference_embedding
  FROM lead_embeddings le
  WHERE le.lead_id = reference_lead_id;

  -- If no embedding found, return empty
  IF reference_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Return similar leads ordered by cosine similarity
  RETURN QUERY
  SELECT
    il.id,
    il.username,
    il.full_name,
    il.profession,
    il.city,
    (1 - (le.embedding <=> reference_embedding))::float as similarity,
    le.embedding_text
  FROM instagram_leads il
  INNER JOIN lead_embeddings le ON le.lead_id = il.id
  WHERE le.embedding IS NOT NULL
    AND il.id != reference_lead_id
    AND (1 - (le.embedding <=> reference_embedding)) >= min_similarity
  ORDER BY le.embedding <=> reference_embedding
  LIMIT match_count;
END;
$$;

-- Grant access
GRANT SELECT, INSERT, UPDATE ON lead_embeddings TO service_role;
GRANT SELECT ON lead_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_leads(uuid, integer, float) TO service_role;
GRANT EXECUTE ON FUNCTION find_similar_leads(uuid, integer, float) TO authenticated;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_lead_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lead_embeddings_updated_at ON lead_embeddings;
CREATE TRIGGER trigger_lead_embeddings_updated_at
  BEFORE UPDATE ON lead_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_embeddings_updated_at();

-- Comment
COMMENT ON TABLE lead_embeddings IS 'Tabela separada para embeddings de leads. Evita race conditions com updates no instagram_leads.';

-- CORREÇÃO: Restaurar updated_at dos leads afetados pelo embedding anterior
-- Para leads que foram embedados, restaurar updated_at = created_at
UPDATE instagram_leads
SET updated_at = created_at
WHERE embedding IS NOT NULL
  AND embedding_at IS NOT NULL
  AND updated_at >= embedding_at - INTERVAL '1 minute'
  AND updated_at <= embedding_at + INTERVAL '1 minute';

-- Limpar colunas de embedding da tabela original (opcional, após migração confirmada)
-- ALTER TABLE instagram_leads DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE instagram_leads DROP COLUMN IF EXISTS embedding_text;
-- ALTER TABLE instagram_leads DROP COLUMN IF EXISTS embedding_at;
