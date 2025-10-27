-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 020_editorial_content_optimized.sql
-- Description: Conservative optimization removing only obsolete fields
-- Author: Claude Code
-- Date: 2025-10-10
--
-- Changes from 107 → 74 fields (reduction of 33 fields):
-- ✂️ Removed 15 D-ID video fields (not using D-ID avatars in MVP)
-- ✂️ Removed 10 scheduling fields (handled by N8N cron)
-- ✂️ Removed 8 legacy duplicate fields
--
-- ✅ KEPT: Scripts (reel_1_carla_script, reel_1_bruno_script, etc.)
--    Reason: Current endpoint reads from DB, can optimize later
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing table if it exists (BACKUP FIRST!)
DROP TABLE IF EXISTS editorial_content CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE TABLE: editorial_content (74 campos)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE editorial_content (

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. IDENTIFICAÇÃO & AUDITORIA (6 campos)
  -- ═══════════════════════════════════════════════════════════════════════════
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  year INTEGER NOT NULL CHECK (year >= 2025),
  main_theme TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. TWITTER - THREAD 1 (Segunda-feira - Anatomia da Dor) - 6 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_1_title TEXT,
  thread_1_sub_theme TEXT,              -- 'anatomy_pain'
  thread_1_tweets JSONB,                -- Array[7] de tweets (1/7 até 7/7)
  thread_1_approved BOOLEAN DEFAULT FALSE,
  thread_1_published BOOLEAN DEFAULT FALSE,
  thread_1_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. TWITTER - THREAD 2 (Quarta-feira - Tentativas que Falham) - 6 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_2_title TEXT,
  thread_2_sub_theme TEXT,              -- 'failed_attempts'
  thread_2_tweets JSONB,                -- Array[7] de tweets
  thread_2_approved BOOLEAN DEFAULT FALSE,
  thread_2_published BOOLEAN DEFAULT FALSE,
  thread_2_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. TWITTER - THREAD 3 (Sexta-feira - Princípios de Solução) - 6 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_3_title TEXT,
  thread_3_sub_theme TEXT,              -- 'solution_principles'
  thread_3_tweets JSONB,                -- Array[7] de tweets
  thread_3_approved BOOLEAN DEFAULT FALSE,
  thread_3_published BOOLEAN DEFAULT FALSE,
  thread_3_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. INSTAGRAM - REEL 1 (Terça-feira - Baseado Thread 1) - 8 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_1_sub_theme TEXT,
  reel_1_carla_script TEXT,             -- Gerado pela IA a partir de thread_1_tweets
  reel_1_bruno_script TEXT,             -- Gerado pela IA a partir de thread_1_tweets
  reel_1_instagram_caption TEXT,
  reel_1_instagram_hashtags TEXT[],     -- Array de hashtags (sem #)
  reel_1_video_url TEXT,                -- URL final merged (Canva + ElevenLabs)
  reel_1_approved BOOLEAN DEFAULT FALSE,
  reel_1_published BOOLEAN DEFAULT FALSE,
  reel_1_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. INSTAGRAM - REEL 2 (Quinta-feira - Baseado Thread 2) - 8 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_2_sub_theme TEXT,
  reel_2_carla_script TEXT,             -- Gerado pela IA a partir de thread_2_tweets
  reel_2_bruno_script TEXT,             -- Gerado pela IA a partir de thread_2_tweets
  reel_2_instagram_caption TEXT,
  reel_2_instagram_hashtags TEXT[],
  reel_2_video_url TEXT,                -- URL final merged
  reel_2_approved BOOLEAN DEFAULT FALSE,
  reel_2_published BOOLEAN DEFAULT FALSE,
  reel_2_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 7. INSTAGRAM - REEL 3 (Sábado - Baseado Thread 3) - 8 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_3_sub_theme TEXT,
  reel_3_carla_script TEXT,             -- Gerado pela IA a partir de thread_3_tweets
  reel_3_bruno_script TEXT,             -- Gerado pela IA a partir de thread_3_tweets
  reel_3_instagram_caption TEXT,
  reel_3_instagram_hashtags TEXT[],
  reel_3_video_url TEXT,                -- URL final merged
  reel_3_approved BOOLEAN DEFAULT FALSE,
  reel_3_published BOOLEAN DEFAULT FALSE,
  reel_3_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 8. YOUTUBE SHORT (Sábado - Concatenação 3 Reels) - 5 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  youtube_short_url TEXT,               -- URL concatenado (~3min)
  youtube_caption TEXT,                 -- "Teste 7 dias grátis → link na bio"
  youtube_short_duration_seconds INTEGER,
  youtube_short_approved BOOLEAN DEFAULT FALSE,
  youtube_short_published BOOLEAN DEFAULT FALSE,
  youtube_short_published_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 9. METADADOS & CUSTOS (13 campos)
  -- ═══════════════════════════════════════════════════════════════════════════
  instagram_audio_id VARCHAR,           -- ID do áudio trending selecionado
  instagram_audio_name VARCHAR,         -- Nome do áudio
  music_category TEXT,                  -- Categoria da música (corporate, etc.)

  related_reel_ids JSONB,               -- IDs dos 3 Reels (para YouTube Short)
  content_type TEXT DEFAULT 'instagram_reel', -- instagram_reel | youtube_short
  status TEXT DEFAULT 'pending',        -- pending | approved | published | archived

  -- LLM Metrics (geração tweets + scripts)
  llm_model VARCHAR,                    -- gpt-4 | gpt-4o
  llm_prompt_tokens INTEGER DEFAULT 0,
  llm_completion_tokens INTEGER DEFAULT 0,
  llm_total_tokens INTEGER DEFAULT 0,
  llm_cost_usd NUMERIC(10, 6) DEFAULT 0,
  llm_generation_time_ms INTEGER DEFAULT 0,
  llm_temperature NUMERIC(3, 2) DEFAULT 0.7,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 10. MÉTRICAS DE PERFORMANCE (3 campos JSONB)
  -- ═══════════════════════════════════════════════════════════════════════════
  twitter_metrics JSONB DEFAULT '{}'::jsonb,     -- {impressions, likes, retweets, replies, engagement_rate}
  instagram_metrics JSONB DEFAULT '{}'::jsonb,   -- {views, likes, comments, shares, saves, engagement_rate}
  youtube_metrics JSONB DEFAULT '{}'::jsonb,     -- {views, likes, dislikes, comments, shares, watch_time_seconds}

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 11. APROVAÇÕES & PUBLICAÇÕES (9 campos)
  -- ═══════════════════════════════════════════════════════════════════════════
  approved_for_x BOOLEAN DEFAULT FALSE,
  approved_for_instagram BOOLEAN DEFAULT FALSE,
  approved_for_youtube BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,

  published_x BOOLEAN DEFAULT FALSE,
  published_instagram BOOLEAN DEFAULT FALSE,
  published_youtube BOOLEAN DEFAULT FALSE,

  rejected BOOLEAN DEFAULT FALSE,
  rejection_reason TEXT,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 12. CUSTOS OPERACIONAIS (1 campo)
  -- ═══════════════════════════════════════════════════════════════════════════
  api_cost_usd NUMERIC(10, 6) DEFAULT 0,  -- Custo APIs (Twitter + Instagram + YouTube + ElevenLabs)

  -- ═══════════════════════════════════════════════════════════════════════════
  -- CONSTRAINTS
  -- ═══════════════════════════════════════════════════════════════════════════
  CONSTRAINT unique_week_year_reel UNIQUE(week_number, year, content_type),
  CONSTRAINT valid_week CHECK (week_number BETWEEN 1 AND 53),
  CONSTRAINT valid_year CHECK (year >= 2025),
  CONSTRAINT valid_content_type CHECK (content_type IN ('instagram_reel', 'youtube_short')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'published', 'archived'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS (Documentação da estrutura)
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE editorial_content IS
'Conteúdo editorial semanal para UBS Taylor Made
- 1 semana = 1 tema principal
- 3 Threads Twitter (Segunda/Quarta/Sexta - 7 tweets cada)
- 3 Reels Instagram (Terça/Quinta/Sábado - baseados nas threads)
- 1 YouTube Short (Sábado - concatenação dos 3 Reels)

MVP Architecture:
- Tweets gerados via GPT-4
- Scripts Carla + Bruno gerados via GPT-4o (baseados nos tweets)
- Vídeos: Canva PNG templates + ElevenLabs TTS + FFmpeg
- Música de fundo: instagram_trending_audios table
- Publicação automatizada via N8N workflows';

COMMENT ON COLUMN editorial_content.week_number IS 'Número da semana (1-53) do ano';
COMMENT ON COLUMN editorial_content.year IS 'Ano de publicação (>= 2025)';
COMMENT ON COLUMN editorial_content.main_theme IS 'Tema principal da semana (ex: "Por que empresas perdem clientes...")';

COMMENT ON COLUMN editorial_content.thread_1_tweets IS 'Array de 7 tweets JSONB (Anatomia da Dor - Segunda)';
COMMENT ON COLUMN editorial_content.thread_2_tweets IS 'Array de 7 tweets JSONB (Tentativas que Falham - Quarta)';
COMMENT ON COLUMN editorial_content.thread_3_tweets IS 'Array de 7 tweets JSONB (Princípios de Solução - Sexta)';

COMMENT ON COLUMN editorial_content.reel_1_carla_script IS 'Script Carla (20-25s, 55-75 palavras) - Gerado pela IA a partir de thread_1_tweets';
COMMENT ON COLUMN editorial_content.reel_1_bruno_script IS 'Script Bruno (35-40s, 95-120 palavras) - Gerado pela IA a partir de thread_1_tweets';
COMMENT ON COLUMN editorial_content.reel_1_video_url IS 'URL final do vídeo merged (Canva slides + ElevenLabs TTS + música)';

COMMENT ON COLUMN editorial_content.youtube_short_url IS 'URL final do YouTube Short (concatenação dos 3 Reels ~3min)';
COMMENT ON COLUMN editorial_content.related_reel_ids IS 'JSONB array com IDs dos 3 Reels concatenados';

COMMENT ON COLUMN editorial_content.llm_cost_usd IS 'Custo total OpenAI (geração tweets + scripts Carla/Bruno)';
COMMENT ON COLUMN editorial_content.api_cost_usd IS 'Custo total APIs externas (Twitter + Instagram + YouTube + ElevenLabs)';

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES (Otimização de queries)
-- ═══════════════════════════════════════════════════════════════════════════

-- Busca por semana/ano (query mais comum)
CREATE INDEX idx_editorial_week_year
  ON editorial_content(week_number, year);

-- Busca por status geral
CREATE INDEX idx_editorial_status
  ON editorial_content(status);

-- Busca por tipo de conteúdo
CREATE INDEX idx_editorial_content_type
  ON editorial_content(content_type);

-- Busca por conteúdo pendente de aprovação (Threads)
CREATE INDEX idx_editorial_pending_approval_threads
  ON editorial_content(
    thread_1_approved,
    thread_2_approved,
    thread_3_approved
  )
  WHERE status = 'pending' AND content_type = 'instagram_reel';

-- Busca por conteúdo pendente de aprovação (Reels)
CREATE INDEX idx_editorial_pending_approval_reels
  ON editorial_content(
    reel_1_approved,
    reel_2_approved,
    reel_3_approved
  )
  WHERE status = 'pending' AND content_type = 'instagram_reel';

-- Busca por conteúdo aprovado mas não publicado (Instagram)
CREATE INDEX idx_editorial_approved_unpublished_instagram
  ON editorial_content(
    reel_1_published,
    reel_2_published,
    reel_3_published,
    published_instagram
  )
  WHERE approved_for_instagram = true AND published_instagram = false;

-- Busca por conteúdo aprovado mas não publicado (Twitter)
CREATE INDEX idx_editorial_approved_unpublished_twitter
  ON editorial_content(
    thread_1_published,
    thread_2_published,
    thread_3_published,
    published_x
  )
  WHERE approved_for_x = true AND published_x = false;

-- Busca por data de criação (relatórios)
CREATE INDEX idx_editorial_created_at
  ON editorial_content(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-update updated_at
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_editorial_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_editorial_content_updated_at
  BEFORE UPDATE ON editorial_content
  FOR EACH ROW
  EXECUTE FUNCTION update_editorial_content_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Nota: Este é um sistema interno de marketing, não multi-tenant

ALTER TABLE editorial_content ENABLE ROW LEVEL SECURITY;

-- Policy: Acesso total para usuários autenticados
CREATE POLICY "Allow all operations for authenticated users"
  ON editorial_content
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA (Opcional - Exemplo da Semana 41/2025)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO editorial_content (
  week_number,
  year,
  main_theme,
  status,
  content_type,
  thread_1_title,
  thread_1_sub_theme,
  thread_2_title,
  thread_2_sub_theme,
  thread_3_title,
  thread_3_sub_theme
) VALUES (
  41,
  2025,
  'Por que empresas perdem clientes por falhas em agendamento e follow-up',
  'pending',
  'instagram_reel',
  'O Custo Invisível dos Agendamentos Manuais',
  'anatomy_pain',
  'Por que Planilhas e Chatbots Não Resolvem',
  'failed_attempts',
  'Arquitetura de Automação Inteligente que Funciona',
  'solution_principles'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Verificar estrutura da tabela
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'editorial_content'
ORDER BY ordinal_position;

-- Contar campos por categoria
SELECT
  'Total Fields' as category,
  COUNT(*) as count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'editorial_content'

UNION ALL

SELECT
  'Twitter Fields',
  COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'editorial_content'
  AND column_name LIKE '%thread%'

UNION ALL

SELECT
  'Instagram Fields',
  COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'editorial_content'
  AND column_name LIKE '%reel%'

UNION ALL

SELECT
  'YouTube Fields',
  COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'editorial_content'
  AND column_name LIKE '%youtube%';

-- Verificar registro de exemplo
SELECT * FROM editorial_content WHERE week_number = 41 AND year = 2025;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- Total Fields: 74 (down from 107 original)
-- Reduction: 33 fields removed (31% reduction)
--
-- REMOVED FIELDS (33 total):
-- ✂️ D-ID Avatar Fields (15): carla_video_url, bruno_video_url, merged_video_url,
--    carla/bruno/merged_video_status, carla/bruno/merged_video_generated_at,
--    carla/bruno/merged_video_duration_seconds, persona_format, video_generation_cost_usd
-- ✂️ Scheduling Fields (10): thread_1/2/3_publication_schedule, reel_1/2/3_scheduled_at,
--    youtube_scheduled_at, day_of_week, scheduled_instagram_at,
--    twitter/instagram/youtube_publication_status
-- ✂️ Legacy Duplicate Fields (8): carla_script, bruno_script, instagram_caption,
--    instagram_hashtags, instagram_image_url, instagram_reel_url,
--    instagram_thumbnail_url, youtube_thumbnail_url
--
-- KEPT FIELDS (Important):
-- ✅ Scripts (reel_1/2/3_carla_script, reel_1/2/3_bruno_script)
--    Reason: Current endpoint /api/canva-hybrid-video/generate/:id reads from DB
--    Can optimize later to generate on-demand from tweets
--
-- Status: OPTIMIZED & PRODUCTION-READY
-- ═══════════════════════════════════════════════════════════════════════════
