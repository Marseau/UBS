-- Migration 017: Add YouTube Short Fields
-- Data: 2025-10-09
-- Descrição: Adiciona campos para YouTube Shorts no sistema de Content Seeder

-- Adicionar campos para YouTube Short na tabela editorial_content
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS youtube_short_url TEXT,
ADD COLUMN IF NOT EXISTS youtube_caption TEXT,
ADD COLUMN IF NOT EXISTS youtube_short_duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS related_reel_ids JSONB;

-- Comentários para documentação
COMMENT ON COLUMN editorial_content.youtube_short_url IS 'URL do YouTube Short gerado (concatenação de 3 Reels)';
COMMENT ON COLUMN editorial_content.youtube_caption IS 'Caption do YouTube Short (diferente do Instagram caption)';
COMMENT ON COLUMN editorial_content.youtube_short_duration_seconds IS 'Duração total do YouTube Short em segundos (~180s = 3 Reels)';
COMMENT ON COLUMN editorial_content.related_reel_ids IS 'Array de IDs dos 3 Reels que foram concatenados (JSONB array)';

-- Índice para buscar YouTube Shorts por semana
CREATE INDEX IF NOT EXISTS idx_editorial_content_youtube_shorts
ON editorial_content(week_of_year)
WHERE content_type = 'youtube_short' AND youtube_short_url IS NOT NULL;

-- Índice para buscar Reels relacionados a YouTube Shorts
CREATE INDEX IF NOT EXISTS idx_editorial_content_related_reels
ON editorial_content USING gin(related_reel_ids);

-- Validação: Garantir que YouTube Shorts tenham os campos obrigatórios
ALTER TABLE editorial_content
ADD CONSTRAINT check_youtube_short_fields
CHECK (
  (content_type != 'youtube_short') OR
  (content_type = 'youtube_short' AND youtube_short_url IS NOT NULL AND youtube_caption IS NOT NULL)
);

-- Log de migração
INSERT INTO schema_migrations (version, description, executed_at)
VALUES (
  '017',
  'Add YouTube Short fields to editorial_content table',
  NOW()
) ON CONFLICT (version) DO NOTHING;

-- Verificação
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'editorial_content'
  AND column_name IN (
    'youtube_short_url',
    'youtube_caption',
    'youtube_short_duration_seconds',
    'related_reel_ids'
  );
