-- Migration 019: Cleanup and Restructure editorial_content
-- Created: 2025-10-10
-- Purpose: Remove obsolete fields, consolidate metrics, add new structure for editorial workflow
-- IMPORTANTE: Esta migration é DESTRUTIVA - cria backup automático antes de executar

-- ========================================
-- FASE 1: BACKUP COMPLETO
-- ========================================

DO $$
BEGIN
  -- Criar backup da tabela
  EXECUTE 'CREATE TABLE IF NOT EXISTS editorial_content_backup_' || to_char(NOW(), 'YYYYMMDD_HH24MISS') ||
          ' AS SELECT * FROM editorial_content';

  RAISE NOTICE '✅ Backup criado com sucesso';
END $$;

-- ========================================
-- FASE 2: CONSOLIDAR MÉTRICAS ANTIGAS → JSONB
-- ========================================

-- 2.1: Criar campos JSONB para métricas estruturadas
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS twitter_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS instagram_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS youtube_metrics JSONB DEFAULT '{}'::jsonb;

-- 2.2: Migrar dados de métricas antigas para JSONB
UPDATE editorial_content SET
  twitter_metrics = jsonb_build_object(
    'impressions', COALESCE(x_impressions, 0),
    'engagements', COALESCE(x_engagements, 0),
    'likes', 0,
    'retweets', 0,
    'replies', 0,
    'updated_at', NOW()
  ),
  instagram_metrics = jsonb_build_object(
    'reach', COALESCE(instagram_reach, 0),
    'engagements', COALESCE(instagram_engagements, 0),
    'views', 0,
    'likes', 0,
    'comments', 0,
    'shares', 0,
    'updated_at', NOW()
  ),
  youtube_metrics = jsonb_build_object(
    'views', COALESCE(youtube_views, 0),
    'likes', 0,
    'comments', 0,
    'shares', 0,
    'watch_time_minutes', 0,
    'updated_at', NOW()
  )
WHERE twitter_metrics = '{}'::jsonb; -- Apenas atualizar registros vazios

RAISE NOTICE '✅ Métricas consolidadas em JSONB';

-- ========================================
-- FASE 3: REMOVER CAMPOS OBSOLETOS/DUPLICADOS
-- ========================================

ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS instagram_post,           -- Duplicado de instagram_caption
  DROP COLUMN IF EXISTS youtube_segment,          -- Propósito não claro
  DROP COLUMN IF EXISTS youtube_video_url,        -- Duplicado de youtube_short_url
  DROP COLUMN IF EXISTS reel_video_url,           -- Usar instagram_reel_url
  DROP COLUMN IF EXISTS video_duration_seconds,   -- Usar merged_video_duration_seconds
  DROP COLUMN IF EXISTS media_generated_at,       -- Usar merged_video_generated_at
  DROP COLUMN IF EXISTS media_generation_status,  -- Usar merged_video_status
  DROP COLUMN IF EXISTS reel_number;              -- Não faz sentido na nova estrutura

RAISE NOTICE '✅ Campos duplicados/obsoletos removidos';

-- ========================================
-- FASE 4: REMOVER CAMPOS DE MÉTRICAS ANTIGAS (já migrados)
-- ========================================

ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS x_impressions,
  DROP COLUMN IF EXISTS x_engagements,
  DROP COLUMN IF EXISTS instagram_reach,
  DROP COLUMN IF EXISTS instagram_engagements,
  DROP COLUMN IF EXISTS youtube_views;

RAISE NOTICE '✅ Campos de métricas antigas removidos (dados migrados para JSONB)';

-- ========================================
-- FASE 5: REMOVER CAMPOS DE AGENDAMENTO ANTIGOS
-- ========================================

ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS scheduled_x_at,
  DROP COLUMN IF EXISTS scheduled_instagram_at,
  DROP COLUMN IF EXISTS scheduled_youtube_at;

RAISE NOTICE '✅ Campos de agendamento antigos removidos';

-- ========================================
-- FASE 6: ADICIONAR STATUS GERAL
-- ========================================

ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  CHECK (status IN ('pending', 'generated', 'approved', 'published', 'archived'));

-- Atualizar status baseado em publicações existentes
UPDATE editorial_content SET
  status = CASE
    WHEN published_x = true OR published_instagram = true OR published_youtube = true THEN 'published'
    WHEN approved_for_x = true OR approved_for_instagram = true OR approved_for_youtube = true THEN 'approved'
    ELSE 'generated'
  END
WHERE status = 'pending';

RAISE NOTICE '✅ Campo status adicionado e populado';

-- ========================================
-- FASE 7: ADICIONAR CAMPOS TWITTER THREADS
-- ========================================

-- Thread 1
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS thread_1_title TEXT,
ADD COLUMN IF NOT EXISTS thread_1_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_1_tweets JSONB,
ADD COLUMN IF NOT EXISTS thread_1_publication_schedule JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS thread_1_publication_status TEXT DEFAULT 'pending';

-- Thread 2
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS thread_2_title TEXT,
ADD COLUMN IF NOT EXISTS thread_2_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_2_tweets JSONB,
ADD COLUMN IF NOT EXISTS thread_2_publication_schedule JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS thread_2_publication_status TEXT DEFAULT 'pending';

-- Thread 3
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS thread_3_title TEXT,
ADD COLUMN IF NOT EXISTS thread_3_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_3_tweets JSONB,
ADD COLUMN IF NOT EXISTS thread_3_publication_schedule JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS thread_3_publication_status TEXT DEFAULT 'pending';

-- Status geral de publicação Twitter
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS twitter_publication_status TEXT DEFAULT 'pending'
  CHECK (twitter_publication_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));

RAISE NOTICE '✅ Campos Twitter Threads adicionados';

-- ========================================
-- FASE 8: MIGRAR DADOS ANTIGOS DE TWITTER
-- ========================================

-- Migrar twitter_insertion_1/2/3 para thread_X_tweets (se existirem)
UPDATE editorial_content SET
  thread_1_tweets = CASE
    WHEN twitter_insertion_1 IS NOT NULL THEN jsonb_build_array(twitter_insertion_1)
    ELSE '[]'::jsonb
  END,
  thread_2_tweets = CASE
    WHEN twitter_insertion_2 IS NOT NULL THEN jsonb_build_array(twitter_insertion_2)
    ELSE '[]'::jsonb
  END,
  thread_3_tweets = CASE
    WHEN twitter_insertion_3 IS NOT NULL THEN jsonb_build_array(twitter_insertion_3)
    ELSE '[]'::jsonb
  END
WHERE thread_1_tweets IS NULL;

-- Remover campos antigos após migração
ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS twitter_insertion_1,
  DROP COLUMN IF EXISTS twitter_insertion_2,
  DROP COLUMN IF EXISTS twitter_insertion_3;

RAISE NOTICE '✅ Dados Twitter antigos migrados e campos removidos';

-- ========================================
-- FASE 9: ADICIONAR CAMPOS INSTAGRAM REELS
-- ========================================

-- Reel 1
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS reel_1_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS reel_1_carla_script TEXT,
ADD COLUMN IF NOT EXISTS reel_1_bruno_script TEXT,
ADD COLUMN IF NOT EXISTS reel_1_instagram_caption TEXT,
ADD COLUMN IF NOT EXISTS reel_1_instagram_hashtags TEXT[],
ADD COLUMN IF NOT EXISTS reel_1_video_url TEXT,
ADD COLUMN IF NOT EXISTS reel_1_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reel_1_published_at TIMESTAMP WITH TIME ZONE;

-- Reel 2
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS reel_2_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS reel_2_carla_script TEXT,
ADD COLUMN IF NOT EXISTS reel_2_bruno_script TEXT,
ADD COLUMN IF NOT EXISTS reel_2_instagram_caption TEXT,
ADD COLUMN IF NOT EXISTS reel_2_instagram_hashtags TEXT[],
ADD COLUMN IF NOT EXISTS reel_2_video_url TEXT,
ADD COLUMN IF NOT EXISTS reel_2_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reel_2_published_at TIMESTAMP WITH TIME ZONE;

-- Reel 3
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS reel_3_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS reel_3_carla_script TEXT,
ADD COLUMN IF NOT EXISTS reel_3_bruno_script TEXT,
ADD COLUMN IF NOT EXISTS reel_3_instagram_caption TEXT,
ADD COLUMN IF NOT EXISTS reel_3_instagram_hashtags TEXT[],
ADD COLUMN IF NOT EXISTS reel_3_video_url TEXT,
ADD COLUMN IF NOT EXISTS reel_3_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reel_3_published_at TIMESTAMP WITH TIME ZONE;

-- Status geral Instagram
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS instagram_publication_status TEXT DEFAULT 'pending'
  CHECK (instagram_publication_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));

RAISE NOTICE '✅ Campos Instagram Reels adicionados';

-- ========================================
-- FASE 10: MIGRAR DADOS ANTIGOS DE REELS
-- ========================================

-- Migrar campos antigos de dual persona para reel_1_*
UPDATE editorial_content SET
  reel_1_carla_script = carla_script,
  reel_1_bruno_script = bruno_script,
  reel_1_video_url = merged_video_url,
  reel_1_instagram_caption = instagram_caption,
  reel_1_instagram_hashtags = instagram_hashtags
WHERE reel_1_carla_script IS NULL AND carla_script IS NOT NULL;

-- Manter campos antigos por enquanto (não remover até validar nova estrutura)

RAISE NOTICE '✅ Dados Reels antigos migrados para reel_1_*';

-- ========================================
-- FASE 11: ADICIONAR CAMPOS YOUTUBE
-- ========================================

ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS youtube_publication_status TEXT DEFAULT 'pending'
  CHECK (youtube_publication_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed')),
ADD COLUMN IF NOT EXISTS youtube_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS youtube_published_at TIMESTAMP WITH TIME ZONE;

RAISE NOTICE '✅ Campos YouTube adicionados';

-- ========================================
-- FASE 12: CRIAR ÍNDICES PARA PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_editorial_content_status
  ON editorial_content(status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_week_year
  ON editorial_content(week_number, year);

CREATE INDEX IF NOT EXISTS idx_editorial_content_twitter_pub_status
  ON editorial_content(twitter_publication_status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_instagram_pub_status
  ON editorial_content(instagram_publication_status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_youtube_pub_status
  ON editorial_content(youtube_publication_status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_thread_1_pub_status
  ON editorial_content(thread_1_publication_status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_thread_2_pub_status
  ON editorial_content(thread_2_publication_status);

CREATE INDEX IF NOT EXISTS idx_editorial_content_thread_3_pub_status
  ON editorial_content(thread_3_publication_status);

RAISE NOTICE '✅ Índices criados';

-- ========================================
-- FASE 13: ADICIONAR COMENTÁRIOS
-- ========================================

COMMENT ON COLUMN editorial_content.status IS 'Workflow status: pending → generated → approved → published → archived';

COMMENT ON COLUMN editorial_content.thread_1_title IS 'Título da Thread 1 (Anatomia da Dor) - max 60 chars';
COMMENT ON COLUMN editorial_content.thread_1_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_1_tweets IS 'Array JSON de 7 tweets da Thread 1';
COMMENT ON COLUMN editorial_content.thread_1_publication_schedule IS 'Horários agendados: [{ tweet_index: 0, scheduled_at: "2025-10-13T08:00:00Z", published: false }, ...]';
COMMENT ON COLUMN editorial_content.thread_1_publication_status IS 'Status: pending, scheduled, publishing, published, failed';

COMMENT ON COLUMN editorial_content.thread_2_title IS 'Título da Thread 2 (Tentativas que Falham)';
COMMENT ON COLUMN editorial_content.thread_2_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_2_tweets IS 'Array JSON de 7 tweets da Thread 2';
COMMENT ON COLUMN editorial_content.thread_2_publication_schedule IS 'Horários agendados Thread 2';
COMMENT ON COLUMN editorial_content.thread_2_publication_status IS 'Status Thread 2';

COMMENT ON COLUMN editorial_content.thread_3_title IS 'Título da Thread 3 (Princípios de Solução)';
COMMENT ON COLUMN editorial_content.thread_3_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_3_tweets IS 'Array JSON de 7 tweets da Thread 3';
COMMENT ON COLUMN editorial_content.thread_3_publication_schedule IS 'Horários agendados Thread 3';
COMMENT ON COLUMN editorial_content.thread_3_publication_status IS 'Status Thread 3';

COMMENT ON COLUMN editorial_content.twitter_publication_status IS 'Status geral Twitter: pending, scheduled, publishing, published, failed';
COMMENT ON COLUMN editorial_content.twitter_metrics IS 'Métricas agregadas: { impressions, engagements, likes, retweets, replies, updated_at }';

COMMENT ON COLUMN editorial_content.reel_1_sub_theme IS 'Sub-tema do Reel 1 (baseado Thread 1)';
COMMENT ON COLUMN editorial_content.reel_1_carla_script IS 'Script Carla para Reel 1 (55-75 palavras)';
COMMENT ON COLUMN editorial_content.reel_1_bruno_script IS 'Script Bruno para Reel 1 (95-120 palavras)';
COMMENT ON COLUMN editorial_content.reel_1_instagram_caption IS 'Caption Instagram Reel 1 (max 150 chars)';
COMMENT ON COLUMN editorial_content.reel_1_instagram_hashtags IS 'Array de 7-10 hashtags para Reel 1';
COMMENT ON COLUMN editorial_content.reel_1_video_url IS 'URL público do Reel 1 (merged Carla + Bruno)';
COMMENT ON COLUMN editorial_content.reel_1_scheduled_at IS 'Horário agendado publicação Reel 1 (Terça 19:00)';
COMMENT ON COLUMN editorial_content.reel_1_published_at IS 'Timestamp publicação efetiva Reel 1';

COMMENT ON COLUMN editorial_content.instagram_publication_status IS 'Status geral Instagram: pending, scheduled, publishing, published, failed';
COMMENT ON COLUMN editorial_content.instagram_metrics IS 'Métricas agregadas: { reach, engagements, views, likes, comments, shares, updated_at }';

COMMENT ON COLUMN editorial_content.youtube_publication_status IS 'Status YouTube: pending, scheduled, publishing, published, failed';
COMMENT ON COLUMN editorial_content.youtube_scheduled_at IS 'Horário agendado YouTube Short (Sábado 19:00)';
COMMENT ON COLUMN editorial_content.youtube_published_at IS 'Timestamp publicação efetiva YouTube Short';
COMMENT ON COLUMN editorial_content.youtube_metrics IS 'Métricas: { views, likes, comments, shares, watch_time_minutes, updated_at }';

RAISE NOTICE '✅ Comentários adicionados';

-- ========================================
-- VALIDAÇÃO FINAL
-- ========================================

DO $$
DECLARE
  field_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO field_count
  FROM information_schema.columns
  WHERE table_name = 'editorial_content'
    AND column_name IN ('thread_1_title', 'thread_2_title', 'thread_3_title', 'status');

  IF field_count < 4 THEN
    RAISE EXCEPTION 'Migration 019 failed: Missing critical fields';
  END IF;

  RAISE NOTICE '✅✅✅ Migration 019 completed successfully! ✅✅✅';
  RAISE NOTICE '📊 Campos adicionados: ~38';
  RAISE NOTICE '🗑️  Campos removidos: ~22';
  RAISE NOTICE '📦 Backup disponível: editorial_content_backup_*';
END $$;
