-- Migration 018: Add Twitter Threads with Titles and Publication Schedule
-- Created: 2025-10-10
-- Purpose: Persist Twitter threads with titles for editorial workflow and publication automation

-- 1. Add status field (missing from table)
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'approved', 'published', 'archived'));

-- 2. Add Twitter Thread fields with titles
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS thread_1_title TEXT,
ADD COLUMN IF NOT EXISTS thread_1_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_1_tweets JSONB,

ADD COLUMN IF NOT EXISTS thread_2_title TEXT,
ADD COLUMN IF NOT EXISTS thread_2_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_2_tweets JSONB,

ADD COLUMN IF NOT EXISTS thread_3_title TEXT,
ADD COLUMN IF NOT EXISTS thread_3_sub_theme TEXT,
ADD COLUMN IF NOT EXISTS thread_3_tweets JSONB;

-- 3. Add Twitter publication scheduling and tracking
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS twitter_publication_schedule JSONB,
ADD COLUMN IF NOT EXISTS twitter_publication_status TEXT DEFAULT 'pending' CHECK (twitter_publication_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));

-- 4. Add Twitter metrics tracking
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS twitter_metrics JSONB;

-- 5. Add Thread → Reel mapping
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS thread_to_reel_mapping JSONB;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_editorial_content_status ON editorial_content(status);
CREATE INDEX IF NOT EXISTS idx_editorial_content_twitter_publication_status ON editorial_content(twitter_publication_status);
CREATE INDEX IF NOT EXISTS idx_editorial_content_week_year ON editorial_content(week_number, year);

-- 7. Add column comments
COMMENT ON COLUMN editorial_content.status IS 'Workflow status: pending → generated → approved → published → archived';

COMMENT ON COLUMN editorial_content.thread_1_title IS 'Título da Thread 1 (Anatomia da Dor)';
COMMENT ON COLUMN editorial_content.thread_1_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_1_tweets IS 'Array JSON de 7 tweets da Thread 1';

COMMENT ON COLUMN editorial_content.thread_2_title IS 'Título da Thread 2 (Tentativas que Falham)';
COMMENT ON COLUMN editorial_content.thread_2_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_2_tweets IS 'Array JSON de 7 tweets da Thread 2';

COMMENT ON COLUMN editorial_content.thread_3_title IS 'Título da Thread 3 (Princípios de Solução)';
COMMENT ON COLUMN editorial_content.thread_3_sub_theme IS 'Sub-tema: anatomy_pain, failed_attempts, solution_principles';
COMMENT ON COLUMN editorial_content.thread_3_tweets IS 'Array JSON de 7 tweets da Thread 3';

COMMENT ON COLUMN editorial_content.twitter_publication_schedule IS 'JSON com horários agendados para cada tweet: { "thread_1": [{ "tweet_index": 0, "scheduled_at": "2025-10-10T09:00:00Z" }, ...], ... }';
COMMENT ON COLUMN editorial_content.twitter_publication_status IS 'Status da publicação: pending, scheduled, publishing, published, failed';
COMMENT ON COLUMN editorial_content.twitter_metrics IS 'Métricas agregadas: { "total_impressions": 0, "total_likes": 0, "total_retweets": 0, ... }';
COMMENT ON COLUMN editorial_content.thread_to_reel_mapping IS 'Mapeamento Thread → Reel: { "thread_1": "reel_id_1", "thread_2": "reel_id_2", "thread_3": "reel_id_3" }';

-- 8. Migration validation query
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'editorial_content'
    AND column_name = 'thread_1_title'
  ) THEN
    RAISE EXCEPTION 'Migration 018 failed: thread_1_title column not created';
  END IF;

  RAISE NOTICE 'Migration 018 completed successfully';
END $$;
