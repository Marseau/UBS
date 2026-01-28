-- =============================================================================
-- Migration 097: D2P Professional Embedding
-- Adds embedding_d2p column for clean professional-only embeddings
-- Creates search RPC and helper functions for D2P pipeline
-- =============================================================================

-- =============================================================================
-- 1. Add embedding_d2p column to lead_embeddings
-- =============================================================================
ALTER TABLE lead_embeddings
  ADD COLUMN IF NOT EXISTS embedding_d2p VECTOR(1536),
  ADD COLUMN IF NOT EXISTS embedding_d2p_text TEXT;

-- =============================================================================
-- 2. HNSW index for fast cosine similarity search
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_d2p_hnsw
  ON lead_embeddings
  USING hnsw (embedding_d2p vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 3. Function: build_d2p_text
-- Builds clean professional text from lead data (no CTAs, emojis, URLs)
-- =============================================================================
CREATE OR REPLACE FUNCTION build_d2p_text(p_lead_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_profession TEXT;
  v_category TEXT;
  v_bio TEXT;
  v_clean_bio TEXT;
  v_result TEXT := '';
BEGIN
  SELECT
    il.profession,
    il.business_category,
    il.bio
  INTO v_profession, v_category, v_bio
  FROM instagram_leads il
  WHERE il.id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Start with profession
  IF v_profession IS NOT NULL AND v_profession != '' THEN
    v_result := v_profession;
  END IF;

  -- Add business_category if meaningful
  IF v_category IS NOT NULL AND v_category != '' AND LOWER(v_category) != 'outros' AND LOWER(v_category) != 'other' THEN
    IF v_result != '' THEN
      v_result := v_result || '. ' || v_category;
    ELSE
      v_result := v_category;
    END IF;
  END IF;

  -- Extract clean first sentence from bio
  IF v_bio IS NOT NULL AND v_bio != '' THEN
    v_clean_bio := v_bio;

    -- Remove URLs
    v_clean_bio := regexp_replace(v_clean_bio, 'https?://\S+', '', 'gi');
    v_clean_bio := regexp_replace(v_clean_bio, 'www\.\S+', '', 'gi');

    -- Remove phone numbers (BR format)
    v_clean_bio := regexp_replace(v_clean_bio, '\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}', '', 'g');

    -- Remove CEPs
    v_clean_bio := regexp_replace(v_clean_bio, '\d{5}[-]?\d{3}', '', 'g');

    -- Remove CTA phrases
    v_clean_bio := regexp_replace(v_clean_bio, '(clique|link|acesse|saiba mais|fale conosco|agende|whatsapp|dm|direct|inbox|entre em contato|envie|mande)\s*(na|no|aqui|pelo|pela|mensagem)?\s*\S*', '', 'gi');

    -- Remove pipe separator
    v_clean_bio := regexp_replace(v_clean_bio, '\|', ' ', 'g');

    -- Take first relevant sentence (split on . ! ? or newline)
    v_clean_bio := (regexp_split_to_array(v_clean_bio, E'[.!?\\n]+'))[1];

    -- Clean up whitespace
    v_clean_bio := regexp_replace(TRIM(v_clean_bio), '\s+', ' ', 'g');

    -- Only add if meaningful (more than 5 chars)
    IF v_clean_bio IS NOT NULL AND LENGTH(v_clean_bio) > 5 THEN
      IF v_result != '' THEN
        v_result := v_result || '. ' || v_clean_bio;
      ELSE
        v_result := v_clean_bio;
      END IF;
    END IF;
  END IF;

  -- Limit to 200 characters
  IF LENGTH(v_result) > 200 THEN
    v_result := LEFT(v_result, 200);
  END IF;

  -- Return NULL if empty
  IF v_result = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 4. RPC: search_leads_for_d2p
-- Searches embedding_d2p using cosine similarity via pgvector
-- Returns leads with professional metadata
-- =============================================================================
CREATE OR REPLACE FUNCTION search_leads_for_d2p(
  query_embedding VECTOR(1536),
  min_similarity FLOAT DEFAULT 0.65,
  max_results INT DEFAULT 2000
)
RETURNS TABLE (
  lead_id UUID,
  username TEXT,
  bio TEXT,
  profession TEXT,
  business_category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il.id AS lead_id,
    il.username::TEXT,
    il.bio::TEXT,
    il.profession::TEXT,
    il.business_category::TEXT,
    (1 - (le.embedding_d2p <=> query_embedding))::FLOAT AS similarity
  FROM lead_embeddings le
  JOIN instagram_leads il ON il.id = le.lead_id
  WHERE le.embedding_d2p IS NOT NULL
    AND (1 - (le.embedding_d2p <=> query_embedding)) >= min_similarity
  ORDER BY le.embedding_d2p <=> query_embedding ASC
  LIMIT max_results;
END;
$$;

-- =============================================================================
-- 5. View: v_leads_d2p_embedding_queue
-- Leads that need D2P embedding generation
-- =============================================================================
CREATE OR REPLACE VIEW v_leads_d2p_embedding_queue AS
SELECT
  il.id AS lead_id,
  il.username,
  il.profession,
  il.business_category,
  il.bio,
  build_d2p_text(il.id) AS d2p_text
FROM instagram_leads il
LEFT JOIN lead_embeddings le ON le.lead_id = il.id
WHERE (il.profession IS NOT NULL OR il.business_category IS NOT NULL)
  AND (le.embedding_d2p IS NULL OR le.id IS NULL)
  AND build_d2p_text(il.id) IS NOT NULL;

-- =============================================================================
-- 6. Add min_similarity and avg_similarity to d2p_analyses
-- =============================================================================
ALTER TABLE d2p_analyses
  ADD COLUMN IF NOT EXISTS min_similarity NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS avg_similarity NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS leads_selected INTEGER DEFAULT 0;
