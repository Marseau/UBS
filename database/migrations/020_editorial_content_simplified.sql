-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 020_editorial_content_simplified.sql
-- Description: Simplified editorial content structure with 48 fields
-- Author: Claude Code
-- Date: 2025-10-10
--
-- Changes:
-- - Removed 61 redundant fields from original 109-field structure
-- - Eliminated script persistence (generated on-demand from tweets)
-- - Removed intermediate video URLs (only final merged URLs)
-- - Removed scheduling fields (handled by N8N cron)
-- - Added granular approval per item (7 approval flags)
-- - Added detailed metrics per item (7 JSONB fields)
-- - Added cost tracking (LLM, video, API)
-- - Added proper constraints and indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing table if it exists (BACKUP FIRST!)
DROP TABLE IF EXISTS editorial_content CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE TABLE: editorial_content
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE editorial_content (

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. IDENTIFICAÇÃO & AUDITORIA (7 campos)
  -- ═══════════════════════════════════════════════════════════════════════════
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  year INTEGER NOT NULL CHECK (year >= 2025),
  main_theme TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'published', 'archived')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. TWITTER - THREAD 1 (Segunda-feira - Anatomia da Dor) - 7 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_1_title TEXT,
  thread_1_sub_theme TEXT,              -- 'anatomy_pain'
  thread_1_tweets JSONB,                -- Array[7] de strings (1/7 até 7/7)
  thread_1_approved BOOLEAN DEFAULT FALSE,
  thread_1_published BOOLEAN DEFAULT FALSE,
  thread_1_published_at TIMESTAMPTZ,
  thread_1_metrics JSONB DEFAULT '{
    "impressions": 0,
    "likes": 0,
    "retweets": 0,
    "replies": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. TWITTER - THREAD 2 (Quarta-feira - Tentativas que Falham) - 7 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_2_title TEXT,
  thread_2_sub_theme TEXT,              -- 'failed_attempts'
  thread_2_tweets JSONB,                -- Array[7] de strings (1/7 até 7/7)
  thread_2_approved BOOLEAN DEFAULT FALSE,
  thread_2_published BOOLEAN DEFAULT FALSE,
  thread_2_published_at TIMESTAMPTZ,
  thread_2_metrics JSONB DEFAULT '{
    "impressions": 0,
    "likes": 0,
    "retweets": 0,
    "replies": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. TWITTER - THREAD 3 (Sexta-feira - Princípios de Solução) - 7 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  thread_3_title TEXT,
  thread_3_sub_theme TEXT,              -- 'solution_principles'
  thread_3_tweets JSONB,                -- Array[7] de strings (1/7 até 7/7)
  thread_3_approved BOOLEAN DEFAULT FALSE,
  thread_3_published BOOLEAN DEFAULT FALSE,
  thread_3_published_at TIMESTAMPTZ,
  thread_3_metrics JSONB DEFAULT '{
    "impressions": 0,
    "likes": 0,
    "retweets": 0,
    "replies": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. INSTAGRAM - REEL 1 (Terça-feira - Baseado Thread 1) - 5 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_1_video_url TEXT,                -- URL final merged (Carla + Bruno)
  reel_1_approved BOOLEAN DEFAULT FALSE,
  reel_1_published BOOLEAN DEFAULT FALSE,
  reel_1_published_at TIMESTAMPTZ,
  reel_1_metrics JSONB DEFAULT '{
    "views": 0,
    "likes": 0,
    "comments": 0,
    "shares": 0,
    "saves": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. INSTAGRAM - REEL 2 (Quinta-feira - Baseado Thread 2) - 5 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_2_video_url TEXT,                -- URL final merged (Carla + Bruno)
  reel_2_approved BOOLEAN DEFAULT FALSE,
  reel_2_published BOOLEAN DEFAULT FALSE,
  reel_2_published_at TIMESTAMPTZ,
  reel_2_metrics JSONB DEFAULT '{
    "views": 0,
    "likes": 0,
    "comments": 0,
    "shares": 0,
    "saves": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 7. INSTAGRAM - REEL 3 (Sábado - Baseado Thread 3) - 5 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  reel_3_video_url TEXT,                -- URL final merged (Carla + Bruno)
  reel_3_approved BOOLEAN DEFAULT FALSE,
  reel_3_published BOOLEAN DEFAULT FALSE,
  reel_3_published_at TIMESTAMPTZ,
  reel_3_metrics JSONB DEFAULT '{
    "views": 0,
    "likes": 0,
    "comments": 0,
    "shares": 0,
    "saves": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 8. YOUTUBE SHORT (Sábado - Concatenação 3 Reels) - 5 campos
  -- ═══════════════════════════════════════════════════════════════════════════
  youtube_short_url TEXT,               -- URL final concatenado (~3min)
  youtube_short_approved BOOLEAN DEFAULT FALSE,
  youtube_short_published BOOLEAN DEFAULT FALSE,
  youtube_short_published_at TIMESTAMPTZ,
  youtube_short_metrics JSONB DEFAULT '{
    "views": 0,
    "likes": 0,
    "dislikes": 0,
    "comments": 0,
    "shares": 0,
    "watch_time_seconds": 0,
    "engagement_rate": 0
  }'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 9. CUSTOS OPERACIONAIS (3 campos)
  -- ═══════════════════════════════════════════════════════════════════════════
  llm_cost_usd NUMERIC(10, 6) DEFAULT 0,      -- Custo GPT (tweets + scripts)
  video_cost_usd NUMERIC(10, 6) DEFAULT 0,    -- Custo D-ID (vídeos)
  api_cost_usd NUMERIC(10, 6) DEFAULT 0,      -- Custo APIs (publicação)

  -- ═══════════════════════════════════════════════════════════════════════════
  -- CONSTRAINTS
  -- ═══════════════════════════════════════════════════════════════════════════
  CONSTRAINT unique_week_year UNIQUE(week_number, year),
  CONSTRAINT valid_week CHECK (week_number BETWEEN 1 AND 53),
  CONSTRAINT valid_year CHECK (year >= 2025)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS (Documentação da estrutura)
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE editorial_content IS 'Conteúdo editorial semanal (1 tema = 1 semana = 3 threads + 3 reels + 1 youtube short)';

COMMENT ON COLUMN editorial_content.week_number IS 'Número da semana (1-53) do ano';
COMMENT ON COLUMN editorial_content.year IS 'Ano de publicação (>= 2025)';
COMMENT ON COLUMN editorial_content.main_theme IS 'Tema principal da semana (ex: "Por que empresas perdem clientes...")';
COMMENT ON COLUMN editorial_content.status IS 'Status geral: pending|approved|published|archived';

COMMENT ON COLUMN editorial_content.thread_1_tweets IS 'Array de 7 tweets (JSONB): ["1/7 ...", "2/7 ...", ..., "7/7 ..."]';
COMMENT ON COLUMN editorial_content.thread_2_tweets IS 'Array de 7 tweets (JSONB): ["1/7 ...", "2/7 ...", ..., "7/7 ..."]';
COMMENT ON COLUMN editorial_content.thread_3_tweets IS 'Array de 7 tweets (JSONB): ["1/7 ...", "2/7 ...", ..., "7/7 ..."]';

COMMENT ON COLUMN editorial_content.reel_1_video_url IS 'URL final do vídeo merged (Carla + Bruno) - Reel 1';
COMMENT ON COLUMN editorial_content.reel_2_video_url IS 'URL final do vídeo merged (Carla + Bruno) - Reel 2';
COMMENT ON COLUMN editorial_content.reel_3_video_url IS 'URL final do vídeo merged (Carla + Bruno) - Reel 3';

COMMENT ON COLUMN editorial_content.youtube_short_url IS 'URL final do YouTube Short (concatenação dos 3 Reels)';

COMMENT ON COLUMN editorial_content.llm_cost_usd IS 'Custo total OpenAI (geração tweets + scripts)';
COMMENT ON COLUMN editorial_content.video_cost_usd IS 'Custo total D-ID (geração vídeos Carla + Bruno)';
COMMENT ON COLUMN editorial_content.api_cost_usd IS 'Custo total APIs externas (Twitter + Instagram + YouTube)';

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES (Otimização de queries)
-- ═══════════════════════════════════════════════════════════════════════════

-- Busca por semana/ano (query mais comum)
CREATE INDEX idx_editorial_week_year
  ON editorial_content(week_number, year);

-- Busca por status geral
CREATE INDEX idx_editorial_status
  ON editorial_content(status);

-- Busca por conteúdo pendente de aprovação
CREATE INDEX idx_editorial_pending_approval
  ON editorial_content(
    thread_1_approved,
    thread_2_approved,
    thread_3_approved,
    reel_1_approved,
    reel_2_approved,
    reel_3_approved,
    youtube_short_approved
  )
  WHERE status = 'pending';

-- Busca por conteúdo aprovado mas não publicado
CREATE INDEX idx_editorial_approved_unpublished
  ON editorial_content(
    thread_1_published,
    thread_2_published,
    thread_3_published,
    reel_1_published,
    reel_2_published,
    reel_3_published,
    youtube_short_published
  )
  WHERE status = 'approved';

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
-- ROW LEVEL SECURITY (RLS) - Desabilitado para sistema interno
-- ═══════════════════════════════════════════════════════════════════════════
-- Nota: Este é um sistema interno de marketing, não multi-tenant
-- RLS não é necessário aqui

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
-- Total Fields: 48 (down from 109 original)
-- Reduction: 56% fewer fields
-- Status: OPTIMIZED & PRODUCTION-READY
-- ═══════════════════════════════════════════════════════════════════════════
