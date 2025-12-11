-- Migration: Adicionar colunas faltantes em cluster_campaigns
-- Criado em: 2025-12-09
-- Objetivo: Adicionar colunas usadas pelo sistema de clustering KMeans

-- Adicionar coluna 'name' como alias de campaign_name para compatibilidade
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Atualizar name com campaign_name onde estiver vazio
UPDATE cluster_campaigns
SET name = campaign_name
WHERE name IS NULL;

-- Adicionar coluna 'nicho' como alias de nicho_principal
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS nicho VARCHAR(255);

-- Atualizar nicho com nicho_principal onde estiver vazio
UPDATE cluster_campaigns
SET nicho = nicho_principal
WHERE nicho IS NULL;

-- Adicionar related_clusters para armazenar subnichos estruturados
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS related_clusters JSONB DEFAULT '[]'::jsonb;

-- Adicionar clustering_result para resultado completo do KMeans
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS clustering_result JSONB;

-- Adicionar last_clustering_at para timestamp do último clustering
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS last_clustering_at TIMESTAMP WITH TIME ZONE;

-- Criar índice para busca por status de clustering
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_clustering_status
ON cluster_campaigns(cluster_status, last_clustering_at DESC);

-- Criar índice GIN para busca em related_clusters
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_related_clusters
ON cluster_campaigns USING GIN (related_clusters);

COMMENT ON COLUMN cluster_campaigns.name IS 'Alias de campaign_name para compatibilidade com código legado';
COMMENT ON COLUMN cluster_campaigns.nicho IS 'Alias de nicho_principal para compatibilidade';
COMMENT ON COLUMN cluster_campaigns.related_clusters IS 'Array JSONB de subnichos/clusters estruturados do KMeans';
COMMENT ON COLUMN cluster_campaigns.clustering_result IS 'Resultado completo do clustering KMeans';
COMMENT ON COLUMN cluster_campaigns.last_clustering_at IS 'Timestamp do último clustering executado';
