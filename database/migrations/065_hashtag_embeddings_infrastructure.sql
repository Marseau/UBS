-- Migration 065: Infraestrutura de Embeddings de Hashtags
-- Arquitetura: Hashtags = COMPORTAMENTO (clusterização) | Perfil = PERSONALIZAÇÃO (DM)
--
-- Estrutura:
--   hashtag_embeddings: embedding individual de cada hashtag
--   lead_cluster_mapping: mapeia leads para clusters via suas hashtags
--   hashtag_clusters_dynamic: adiciona centroid vector
--   campaign_leads: garante existência com FK para subclusters

-- ============================================
-- 1. TABELA: hashtag_embeddings
-- Embedding individual de cada hashtag único
-- ============================================
CREATE TABLE IF NOT EXISTS hashtag_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag text NOT NULL,
  hashtag_normalized text NOT NULL,
  embedding vector(1536),
  occurrence_count integer DEFAULT 1,
  source text DEFAULT 'posts' CHECK (source IN ('posts', 'bio', 'both')),
  cluster_id uuid REFERENCES hashtag_clusters_dynamic(id) ON DELETE SET NULL,
  cluster_distance float,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  embedded_at timestamptz,
  UNIQUE(hashtag_normalized)
);

-- Índice HNSW para busca por similaridade entre hashtags
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_hnsw
ON hashtag_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_cluster ON hashtag_embeddings(cluster_id);
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_occurrence ON hashtag_embeddings(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_embeddings_not_embedded ON hashtag_embeddings(id) WHERE embedding IS NULL;

-- ============================================
-- 2. TABELA: lead_cluster_mapping
-- Mapeia leads para clusters baseado nas hashtags que usam
-- ============================================
CREATE TABLE IF NOT EXISTS lead_cluster_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES hashtag_clusters_dynamic(id) ON DELETE CASCADE,
  weight float DEFAULT 1.0,
  hashtag_count integer DEFAULT 1,
  is_primary boolean DEFAULT false,
  campaign_id uuid REFERENCES cluster_campaigns(id) ON DELETE SET NULL,
  subcluster_id uuid REFERENCES campaign_subclusters(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(lead_id, cluster_id, campaign_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lead_cluster_mapping_lead ON lead_cluster_mapping(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_cluster_mapping_cluster ON lead_cluster_mapping(cluster_id);
CREATE INDEX IF NOT EXISTS idx_lead_cluster_mapping_campaign ON lead_cluster_mapping(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_cluster_mapping_primary ON lead_cluster_mapping(lead_id) WHERE is_primary = true;

-- ============================================
-- 3. ADICIONAR centroid vector em hashtag_clusters_dynamic
-- ============================================
ALTER TABLE hashtag_clusters_dynamic
ADD COLUMN IF NOT EXISTS centroid vector(1536);

ALTER TABLE hashtag_clusters_dynamic
ADD COLUMN IF NOT EXISTS centroid_hashtag_id uuid REFERENCES hashtag_embeddings(id);

-- Índice para busca por similaridade de centroids
CREATE INDEX IF NOT EXISTS idx_hashtag_clusters_centroid_hnsw
ON hashtag_clusters_dynamic
USING hnsw (centroid vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================
-- 4. TABELA: campaign_leads
-- Garante existência com FK para subclusters
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,
  subcluster_id uuid REFERENCES campaign_subclusters(id) ON DELETE SET NULL,

  -- Status do lead na campanha
  status text DEFAULT 'pending' CHECK (status IN (
    'pending', 'qualified', 'contacted', 'replied',
    'converted', 'rejected', 'removed'
  )),

  -- Scores
  fit_score float,
  priority_score integer DEFAULT 0,

  -- Clustering info
  cluster_assignment jsonb,
  similarity_to_centroid float,

  -- Timestamps
  added_at timestamptz DEFAULT NOW(),
  qualified_at timestamptz,
  contacted_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),

  UNIQUE(campaign_id, lead_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead ON campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_subcluster ON campaign_leads(subcluster_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_priority ON campaign_leads(priority_score DESC);

-- ============================================
-- 5. FUNÇÕES AUXILIARES
-- ============================================

-- Função: Encontrar hashtags similares
CREATE OR REPLACE FUNCTION find_similar_hashtags(
  p_hashtag text,
  p_limit integer DEFAULT 20,
  p_min_similarity float DEFAULT 0.7
)
RETURNS TABLE (
  hashtag text,
  similarity float,
  cluster_id uuid,
  occurrence_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_embedding vector(1536);
BEGIN
  -- Get embedding do hashtag de referência
  SELECT he.embedding INTO v_embedding
  FROM hashtag_embeddings he
  WHERE he.hashtag_normalized = LOWER(REGEXP_REPLACE(p_hashtag, '^#', ''));

  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    he.hashtag,
    (1 - (he.embedding <=> v_embedding))::float as similarity,
    he.cluster_id,
    he.occurrence_count
  FROM hashtag_embeddings he
  WHERE he.embedding IS NOT NULL
    AND he.hashtag_normalized != LOWER(REGEXP_REPLACE(p_hashtag, '^#', ''))
    AND (1 - (he.embedding <=> v_embedding)) >= p_min_similarity
  ORDER BY he.embedding <=> v_embedding
  LIMIT p_limit;
END;
$$;

-- Função: Obter leads por cluster
CREATE OR REPLACE FUNCTION get_leads_by_hashtag_cluster(
  p_cluster_id uuid,
  p_limit integer DEFAULT 100,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  lead_id uuid,
  username text,
  full_name text,
  profession text,
  city text,
  cluster_weight float,
  hashtag_count integer,
  is_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il.id as lead_id,
    il.username,
    il.full_name,
    il.profession,
    il.city,
    lcm.weight as cluster_weight,
    lcm.hashtag_count,
    lcm.is_primary
  FROM lead_cluster_mapping lcm
  INNER JOIN instagram_leads il ON il.id = lcm.lead_id
  WHERE lcm.cluster_id = p_cluster_id
    AND (p_campaign_id IS NULL OR lcm.campaign_id = p_campaign_id)
  ORDER BY lcm.weight DESC, lcm.hashtag_count DESC
  LIMIT p_limit;
END;
$$;

-- Função: Mapear lead para clusters baseado nas hashtags
CREATE OR REPLACE FUNCTION map_lead_to_clusters(
  p_lead_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hashtag text;
  v_cluster_id uuid;
  v_count integer := 0;
  v_cluster_counts jsonb := '{}'::jsonb;
  v_max_weight float := 0;
  v_primary_cluster_id uuid;
BEGIN
  -- Iterar sobre hashtags do lead (posts + bio)
  FOR v_hashtag IN (
    SELECT DISTINCT hashtag
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(hashtags_posts, '[]'::jsonb)) as hashtag
      FROM instagram_leads WHERE id = p_lead_id
      UNION ALL
      SELECT jsonb_array_elements_text(COALESCE(hashtags_bio, '[]'::jsonb)) as hashtag
      FROM instagram_leads WHERE id = p_lead_id
    ) all_hashtags
  )
  LOOP
    -- Buscar cluster da hashtag
    SELECT he.cluster_id INTO v_cluster_id
    FROM hashtag_embeddings he
    WHERE he.hashtag_normalized = LOWER(REGEXP_REPLACE(v_hashtag, '^#', ''))
      AND he.cluster_id IS NOT NULL;

    IF v_cluster_id IS NOT NULL THEN
      -- Incrementar contador para este cluster
      v_cluster_counts := jsonb_set(
        v_cluster_counts,
        ARRAY[v_cluster_id::text],
        to_jsonb(COALESCE((v_cluster_counts->>v_cluster_id::text)::int, 0) + 1)
      );
    END IF;
  END LOOP;

  -- Inserir mapeamentos
  FOR v_cluster_id IN (SELECT jsonb_object_keys(v_cluster_counts)::uuid)
  LOOP
    DECLARE
      v_weight float;
      v_hashtag_count integer;
    BEGIN
      v_hashtag_count := (v_cluster_counts->>v_cluster_id::text)::integer;
      v_weight := v_hashtag_count::float; -- Pode ser normalizado depois

      IF v_weight > v_max_weight THEN
        v_max_weight := v_weight;
        v_primary_cluster_id := v_cluster_id;
      END IF;

      INSERT INTO lead_cluster_mapping (
        lead_id, cluster_id, weight, hashtag_count, campaign_id, is_primary
      ) VALUES (
        p_lead_id, v_cluster_id, v_weight, v_hashtag_count, p_campaign_id, false
      )
      ON CONFLICT (lead_id, cluster_id, campaign_id)
      DO UPDATE SET
        weight = EXCLUDED.weight,
        hashtag_count = EXCLUDED.hashtag_count,
        updated_at = NOW();

      v_count := v_count + 1;
    END;
  END LOOP;

  -- Marcar cluster primário
  IF v_primary_cluster_id IS NOT NULL THEN
    UPDATE lead_cluster_mapping
    SET is_primary = true
    WHERE lead_id = p_lead_id
      AND cluster_id = v_primary_cluster_id
      AND (campaign_id = p_campaign_id OR (campaign_id IS NULL AND p_campaign_id IS NULL));
  END IF;

  RETURN v_count;
END;
$$;

-- ============================================
-- 6. TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_hashtag_embeddings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hashtag_embeddings_updated ON hashtag_embeddings;
CREATE TRIGGER trg_hashtag_embeddings_updated
  BEFORE UPDATE ON hashtag_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_hashtag_embeddings_timestamp();

CREATE OR REPLACE FUNCTION update_lead_cluster_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_cluster_mapping_updated ON lead_cluster_mapping;
CREATE TRIGGER trg_lead_cluster_mapping_updated
  BEFORE UPDATE ON lead_cluster_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_cluster_mapping_timestamp();

CREATE OR REPLACE FUNCTION update_campaign_leads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_leads_updated ON campaign_leads;
CREATE TRIGGER trg_campaign_leads_updated
  BEFORE UPDATE ON campaign_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_leads_timestamp();

-- ============================================
-- 7. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON hashtag_embeddings TO service_role;
GRANT SELECT ON hashtag_embeddings TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON lead_cluster_mapping TO service_role;
GRANT SELECT ON lead_cluster_mapping TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_leads TO service_role;
GRANT SELECT ON campaign_leads TO authenticated;

GRANT EXECUTE ON FUNCTION find_similar_hashtags(text, integer, float) TO service_role;
GRANT EXECUTE ON FUNCTION find_similar_hashtags(text, integer, float) TO authenticated;

GRANT EXECUTE ON FUNCTION get_leads_by_hashtag_cluster(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_leads_by_hashtag_cluster(uuid, integer, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION map_lead_to_clusters(uuid, uuid) TO service_role;

-- ============================================
-- 8. COMMENTS
-- ============================================

COMMENT ON TABLE hashtag_embeddings IS 'Embedding individual de cada hashtag único. Base para clusterização por COMPORTAMENTO.';
COMMENT ON TABLE lead_cluster_mapping IS 'Mapeamento de leads para clusters baseado nas hashtags que usam.';
COMMENT ON TABLE campaign_leads IS 'Leads associados a uma campanha específica com status e scores.';

COMMENT ON COLUMN hashtag_embeddings.embedding IS 'Vector 1536 dims (OpenAI ada-002/text-embedding-3-small)';
COMMENT ON COLUMN hashtag_embeddings.cluster_id IS 'FK para hashtag_clusters_dynamic - cluster ao qual pertence';
COMMENT ON COLUMN hashtag_clusters_dynamic.centroid IS 'Vector centroid do cluster (média dos embeddings)';

COMMENT ON FUNCTION find_similar_hashtags IS 'Encontra hashtags semanticamente similares usando cosine similarity';
COMMENT ON FUNCTION get_leads_by_hashtag_cluster IS 'Retorna leads mapeados para um cluster específico';
COMMENT ON FUNCTION map_lead_to_clusters IS 'Mapeia um lead para clusters baseado nas hashtags que usa';
