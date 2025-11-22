-- Migration: Adicionar colunas para sistema de scraping de seguidores
-- Data: 2025-11-11
-- Descrição: Adiciona colunas para rastrear perfis com audiência relevante e seus seguidores

-- Adicionar colunas para rastreamento de audiência e seguidores
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS has_relevant_audience BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS followers_scraped_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discovered_from_profile VARCHAR(255);

-- Comentários para documentação
COMMENT ON COLUMN instagram_leads.has_relevant_audience IS 'Se o perfil tem audiência relevante (10k-300k seguidores) e teve seguidores scrapados';
COMMENT ON COLUMN instagram_leads.followers_scraped_count IS 'Número de seguidores que foram scrapados deste perfil';
COMMENT ON COLUMN instagram_leads.discovered_from_profile IS 'Username do perfil concorrente de onde este lead foi descoberto como seguidor';

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_instagram_leads_has_relevant_audience
ON instagram_leads(has_relevant_audience)
WHERE has_relevant_audience = true;

CREATE INDEX IF NOT EXISTS idx_instagram_leads_discovered_from
ON instagram_leads(discovered_from_profile)
WHERE discovered_from_profile IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_leads_lead_source_audience
ON instagram_leads(lead_source, has_relevant_audience);

-- Atualizar leads existentes com lead_source específico
UPDATE instagram_leads
SET has_relevant_audience = true
WHERE followers_count >= 10000
  AND followers_count <= 300000
  AND lead_source IN ('profile_with_audience', 'competitor_follower_scrape');
