-- =============================================================================
-- Migration 096: D2P Unified Versioned System
-- Creates d2p_analyses table with versioning, indexes, and search RPC
-- =============================================================================

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Main versioned table for D2P analyses
-- =============================================================================
CREATE TABLE IF NOT EXISTS d2p_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_name VARCHAR(255) NOT NULL,
  market_slug VARCHAR(255) NOT NULL,
  market_embedding VECTOR(1536),

  -- Versionamento
  version_id VARCHAR(100) NOT NULL UNIQUE,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_version_id VARCHAR(100),
  is_latest BOOLEAN DEFAULT TRUE,

  -- Parametros de busca
  search_params JSONB DEFAULT '{}',
  leads_searched INTEGER NOT NULL DEFAULT 0,
  leads_with_embedding INTEGER NOT NULL DEFAULT 0,
  embedding_coverage NUMERIC(5,2),

  -- BERTopic results
  topics_discovered INTEGER DEFAULT 0,
  topics_detail JSONB DEFAULT '[]',
  coverage_percentage NUMERIC(5,2),
  friction_units JSONB DEFAULT '[]',

  -- Metricas de friccao
  friction_count INTEGER DEFAULT 0,
  total_friction_score NUMERIC(5,3) DEFAULT 0,
  avg_friction_score NUMERIC(5,3) DEFAULT 0,
  friction_density NUMERIC(5,3) DEFAULT 0,

  -- Definicao de produto
  dominant_pain TEXT,
  product_type VARCHAR(50),
  product_definition TEXT,
  product_tagline VARCHAR(255),
  mvp_does JSONB DEFAULT '[]',
  mvp_does_not JSONB DEFAULT '[]',
  d2p_score JSONB DEFAULT '{}',
  product_potential_score NUMERIC(5,1) DEFAULT 0,

  -- Sinais detectados
  workarounds JSONB DEFAULT '[]',
  pain_signals JSONB DEFAULT '[]',
  workaround_tools TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Meta
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  analysis_duration_ms INTEGER,
  python_version VARCHAR(20),
  bertopic_params JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_d2p_market_slug ON d2p_analyses(market_slug);
CREATE INDEX IF NOT EXISTS idx_d2p_latest ON d2p_analyses(market_slug, is_latest) WHERE is_latest;
CREATE INDEX IF NOT EXISTS idx_d2p_version_id ON d2p_analyses(version_id);
CREATE INDEX IF NOT EXISTS idx_d2p_created_at ON d2p_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_d2p_status ON d2p_analyses(status);

-- HNSW index for vector similarity search on market embeddings
CREATE INDEX IF NOT EXISTS idx_d2p_embedding_hnsw ON d2p_analyses
  USING hnsw (market_embedding vector_cosine_ops);

-- =============================================================================
-- Trigger: Mark previous versions as not latest
-- =============================================================================
CREATE OR REPLACE FUNCTION mark_previous_d2p_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest THEN
    UPDATE d2p_analyses
    SET is_latest = FALSE, updated_at = NOW()
    WHERE market_slug = NEW.market_slug
      AND id != NEW.id
      AND is_latest;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_d2p_version ON d2p_analyses;
CREATE TRIGGER trg_d2p_version
  AFTER INSERT ON d2p_analyses
  FOR EACH ROW EXECUTE FUNCTION mark_previous_d2p_not_latest();

-- =============================================================================
-- Trigger: Auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_d2p_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_d2p_updated_at ON d2p_analyses;
CREATE TRIGGER trg_d2p_updated_at
  BEFORE UPDATE ON d2p_analyses
  FOR EACH ROW EXECUTE FUNCTION update_d2p_updated_at();

-- =============================================================================
-- RPC: Search leads by embedding similarity (pgvector)
-- =============================================================================
CREATE OR REPLACE FUNCTION search_leads_by_embedding(
  query_embedding FLOAT8[],
  min_similarity FLOAT DEFAULT 0.65,
  max_results INTEGER DEFAULT 5000
) RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  bio TEXT,
  profession TEXT,
  business_category TEXT,
  embedding FLOAT8[],
  similarity FLOAT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  vec VECTOR(1536);
BEGIN
  -- Convert float8 array to vector type
  vec := query_embedding::vector(1536);

  RETURN QUERY
  SELECT
    il.id,
    il.username::TEXT,
    il.full_name::TEXT,
    il.bio::TEXT,
    il.profession::TEXT,
    il.business_category::TEXT,
    il.embedding::float8[],
    (1 - (il.embedding <=> vec))::float AS similarity
  FROM instagram_leads il
  WHERE il.embedding IS NOT NULL
    AND il.bio IS NOT NULL
    AND LENGTH(il.bio) > 20
    AND (1 - (il.embedding <=> vec)) >= min_similarity
  ORDER BY il.embedding <=> vec
  LIMIT max_results;
END;
$$;

-- =============================================================================
-- RPC: Get latest analysis for a market
-- =============================================================================
CREATE OR REPLACE FUNCTION get_latest_d2p_analysis(p_market_slug VARCHAR)
RETURNS SETOF d2p_analyses LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM d2p_analyses
  WHERE market_slug = p_market_slug
    AND is_latest = TRUE
  LIMIT 1;
END;
$$;

-- =============================================================================
-- RPC: Get analysis history for a market
-- =============================================================================
CREATE OR REPLACE FUNCTION get_d2p_analysis_history(
  p_market_slug VARCHAR,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF d2p_analyses LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM d2p_analyses
  WHERE market_slug = p_market_slug
  ORDER BY version_number DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- RPC: Get next version number for a market
-- =============================================================================
CREATE OR REPLACE FUNCTION get_next_d2p_version_number(p_market_slug VARCHAR)
RETURNS INTEGER LANGUAGE plpgsql STABLE AS $$
DECLARE
  max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO max_version
  FROM d2p_analyses
  WHERE market_slug = p_market_slug;

  RETURN max_version;
END;
$$;

-- =============================================================================
-- RPC: List all analyzed markets with summary
-- =============================================================================
CREATE OR REPLACE FUNCTION list_d2p_markets()
RETURNS TABLE (
  market_slug VARCHAR,
  market_name VARCHAR,
  latest_version_id VARCHAR,
  version_count BIGINT,
  latest_leads_searched INTEGER,
  latest_topics_discovered INTEGER,
  latest_product_potential NUMERIC,
  latest_analysis_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    da.market_slug,
    da.market_name,
    da.version_id AS latest_version_id,
    COUNT(*) OVER (PARTITION BY da.market_slug) AS version_count,
    da.leads_searched AS latest_leads_searched,
    da.topics_discovered AS latest_topics_discovered,
    da.product_potential_score AS latest_product_potential,
    da.created_at AS latest_analysis_at
  FROM d2p_analyses da
  WHERE da.is_latest = TRUE
  ORDER BY da.created_at DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE d2p_analyses IS 'D2P (Decision-to-Product) market analyses with BERTopic results and versioning';
COMMENT ON COLUMN d2p_analyses.version_id IS 'Unique version identifier: {market_slug}_v{version}_{timestamp}';
COMMENT ON COLUMN d2p_analyses.friction_units IS 'JSON array of detected friction patterns from BERTopic analysis';
COMMENT ON COLUMN d2p_analyses.product_potential_score IS 'Final D2P score (0-100) indicating product viability';
COMMENT ON FUNCTION search_leads_by_embedding IS 'Search instagram_leads by embedding similarity using pgvector cosine distance';
