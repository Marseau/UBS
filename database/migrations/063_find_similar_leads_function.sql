-- Migration 063: Função find_similar_leads para busca por cosine similarity
-- Esta função usa pgvector para encontrar leads similares a um lead de referência

-- Drop function if exists
DROP FUNCTION IF EXISTS find_similar_leads(uuid, integer, float);

-- Create function for finding similar leads using cosine similarity
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
  -- Get the reference lead's embedding
  SELECT embedding INTO reference_embedding
  FROM instagram_leads
  WHERE instagram_leads.id = reference_lead_id;

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
    (1 - (il.embedding <=> reference_embedding))::float as similarity,
    il.embedding_text
  FROM instagram_leads il
  WHERE il.embedding IS NOT NULL
    AND il.id != reference_lead_id
    AND (1 - (il.embedding <=> reference_embedding)) >= min_similarity
  ORDER BY il.embedding <=> reference_embedding
  LIMIT match_count;
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION find_similar_leads(uuid, integer, float) TO service_role;
GRANT EXECUTE ON FUNCTION find_similar_leads(uuid, integer, float) TO authenticated;

-- Create index for faster similarity search if not exists
CREATE INDEX IF NOT EXISTS idx_instagram_leads_embedding_hnsw
ON instagram_leads
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add comment
COMMENT ON FUNCTION find_similar_leads IS 'Finds leads similar to a reference lead using cosine similarity via pgvector. Returns leads with similarity >= min_similarity, ordered by similarity descending.';
