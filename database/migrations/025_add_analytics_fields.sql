-- Migration 025: Add Analytics Fields
-- Adiciona campos para rastrear IDs de posts publicados nas plataformas
-- Necessário para Analytics Collector workflow

-- Twitter/X: Salvar IDs de todos os tweets de cada thread
ALTER TABLE editorial_content
  ADD COLUMN thread_1_tweet_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN thread_2_tweet_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN thread_3_tweet_ids JSONB DEFAULT '[]'::jsonb;

-- Instagram: Salvar IDs dos posts de cada reel
ALTER TABLE editorial_content
  ADD COLUMN reel_1_instagram_id TEXT,
  ADD COLUMN reel_2_instagram_id TEXT,
  ADD COLUMN reel_3_instagram_id TEXT;

-- YouTube: Salvar ID do vídeo do short
ALTER TABLE editorial_content
  ADD COLUMN youtube_short_video_id TEXT;

-- Campos para armazenar métricas coletadas (última coleta)
ALTER TABLE editorial_content
  ADD COLUMN analytics_last_collected_at TIMESTAMP;

-- Comentários para documentação
COMMENT ON COLUMN editorial_content.thread_1_tweet_ids IS 'Array de IDs dos tweets da Thread 1 no formato ["tweet_id_1", "tweet_id_2", ...]';
COMMENT ON COLUMN editorial_content.thread_2_tweet_ids IS 'Array de IDs dos tweets da Thread 2 no formato ["tweet_id_1", "tweet_id_2", ...]';
COMMENT ON COLUMN editorial_content.thread_3_tweet_ids IS 'Array de IDs dos tweets da Thread 3 no formato ["tweet_id_1", "tweet_id_2", ...]';
COMMENT ON COLUMN editorial_content.reel_1_instagram_id IS 'ID do post do Reel 1 no Instagram';
COMMENT ON COLUMN editorial_content.reel_2_instagram_id IS 'ID do post do Reel 2 no Instagram';
COMMENT ON COLUMN editorial_content.reel_3_instagram_id IS 'ID do post do Reel 3 no Instagram';
COMMENT ON COLUMN editorial_content.youtube_short_video_id IS 'ID do vídeo do Short no YouTube';
COMMENT ON COLUMN editorial_content.analytics_last_collected_at IS 'Timestamp da última coleta de métricas';

-- Total de campos adicionados: 8
-- Campos após esta migration: 68 + 8 = 76
