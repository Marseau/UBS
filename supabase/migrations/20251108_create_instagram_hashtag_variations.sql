-- Migration: Tabela para variações de hashtags descobertas automaticamente
-- Criado: 2025-11-08
-- Objetivo: Armazenar variações de hashtags com volume de posts e score de priorização

CREATE TABLE IF NOT EXISTS instagram_hashtag_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hashtag principal que gerou as variações
  parent_hashtag VARCHAR(255) NOT NULL,

  -- Variação descoberta
  hashtag VARCHAR(255) NOT NULL UNIQUE,

  -- Métricas do Instagram
  post_count BIGINT NOT NULL, -- Volume de posts (ex: 46300000 para 46,3 mi)
  post_count_formatted VARCHAR(50), -- Formatado (ex: "46,3 mi posts")

  -- Score de priorização (0-100)
  priority_score INTEGER NOT NULL DEFAULT 0,

  -- Status de scraping
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  scrape_count INTEGER DEFAULT 0, -- Quantas vezes foi scrapada
  leads_found INTEGER DEFAULT 0, -- Total de leads encontrados

  -- Classificação de volume
  volume_category VARCHAR(20), -- tiny, small, medium, large, huge

  -- Metadados
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_hashtag_variations_parent ON instagram_hashtag_variations(parent_hashtag);
CREATE INDEX IF NOT EXISTS idx_hashtag_variations_score ON instagram_hashtag_variations(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_variations_last_scraped ON instagram_hashtag_variations(last_scraped_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_hashtag_variations_volume ON instagram_hashtag_variations(post_count DESC);

-- Índice composto para query otimizada (score > 80 + não scrapadas recentemente)
CREATE INDEX IF NOT EXISTS idx_hashtag_variations_scrape_priority
  ON instagram_hashtag_variations(priority_score DESC, last_scraped_at NULLS FIRST)
  WHERE priority_score >= 80;

-- RLS Policies
ALTER TABLE instagram_hashtag_variations ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ler
CREATE POLICY "Users can read hashtag variations"
  ON instagram_hashtag_variations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: Service role pode fazer tudo
CREATE POLICY "Service role can do everything on hashtag variations"
  ON instagram_hashtag_variations
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_instagram_hashtag_variations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hashtag_variations_updated_at
  BEFORE UPDATE ON instagram_hashtag_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_hashtag_variations_updated_at();

-- Comentários
COMMENT ON TABLE instagram_hashtag_variations IS 'Variações de hashtags descobertas automaticamente pelo scraper com score de priorização';
COMMENT ON COLUMN instagram_hashtag_variations.parent_hashtag IS 'Hashtag original que gerou as variações (ex: empreendedorismo)';
COMMENT ON COLUMN instagram_hashtag_variations.priority_score IS 'Score 0-100 baseado em volume ideal (500k-5mi = score 100)';
COMMENT ON COLUMN instagram_hashtag_variations.volume_category IS 'tiny (<100k), small (100k-500k), medium (500k-5mi), large (5mi-20mi), huge (>20mi)';
COMMENT ON COLUMN instagram_hashtag_variations.last_scraped_at IS 'Última vez que esta hashtag foi scrapada completamente';
COMMENT ON COLUMN instagram_hashtag_variations.scrape_count IS 'Contador de quantas vezes foi scrapada (para histórico)';
COMMENT ON COLUMN instagram_hashtag_variations.leads_found IS 'Total acumulado de leads únicos encontrados nesta hashtag';
