-- Migration 023: Remove published_x, published_instagram, published_youtube
-- Remove campos redundantes globais de publicação
-- Os workflows N8N usam campos específicos: thread_X_published, reel_X_published, youtube_short_published

ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS published_x,
  DROP COLUMN IF EXISTS published_instagram,
  DROP COLUMN IF EXISTS published_youtube;

-- Comentário: Campos removidos pois não eram utilizados pelos workflows N8N
-- Os workflows verificam publicação através de:
--   - thread_1_published, thread_2_published, thread_3_published (Twitter)
--   - reel_1_published, reel_2_published, reel_3_published (Instagram)
--   - youtube_short_published (YouTube)

-- Total de campos removidos nesta migration: 3
-- Total de campos removidos com migration 022: 6 (approved_for_x, approved_for_instagram, approved_for_youtube, published_x, published_instagram, published_youtube)
-- Campos restantes na tabela editorial_content: 68
