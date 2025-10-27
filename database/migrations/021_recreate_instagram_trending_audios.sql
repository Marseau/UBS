-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 021_recreate_instagram_trending_audios.sql
-- Description: Recreate instagram_trending_audios table
-- Author: Claude Code
-- Date: 2025-10-11
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop if exists (já foi deletada, mas para garantir)
DROP TABLE IF EXISTS instagram_trending_audios CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE TABLE: instagram_trending_audios
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE instagram_trending_audios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audio_id TEXT NOT NULL UNIQUE,
  audio_name TEXT NOT NULL,
  artist_name TEXT,
  audio_url TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'corporate', 'energetic', 'calm', 'trending', 'viral')),
  trending_score INTEGER DEFAULT 50 CHECK (trending_score BETWEEN 0 AND 100),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE instagram_trending_audios IS 'Trending audio tracks for Instagram Reels';
COMMENT ON COLUMN instagram_trending_audios.audio_id IS 'Unique audio ID from Instagram';
COMMENT ON COLUMN instagram_trending_audios.audio_name IS 'Name of the audio track';
COMMENT ON COLUMN instagram_trending_audios.trending_score IS 'Trending score (0-100)';
COMMENT ON COLUMN instagram_trending_audios.usage_count IS 'Number of times this audio was used in our Reels';

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_trending_audios_category ON instagram_trending_audios(category);
CREATE INDEX idx_trending_audios_trending_score ON instagram_trending_audios(trending_score DESC);
CREATE INDEX idx_trending_audios_active ON instagram_trending_audios(is_active) WHERE is_active = true;
CREATE INDEX idx_trending_audios_last_used ON instagram_trending_audios(last_used_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-update updated_at
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_instagram_trending_audios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_instagram_trending_audios_updated_at
  BEFORE UPDATE ON instagram_trending_audios
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_trending_audios_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE instagram_trending_audios ENABLE ROW LEVEL SECURITY;

-- Policy: Read access for authenticated users
CREATE POLICY "Allow read for authenticated users"
  ON instagram_trending_audios
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Full access for service role
CREATE POLICY "Allow all for service role"
  ON instagram_trending_audios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: get_random_trending_audio
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_random_trending_audio(
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  audio_id TEXT,
  audio_name TEXT,
  artist_name TEXT,
  audio_url TEXT,
  category TEXT,
  trending_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.audio_id,
    a.audio_name,
    a.artist_name,
    a.audio_url,
    a.category,
    a.trending_score
  FROM instagram_trending_audios a
  WHERE a.is_active = true
    AND (p_category IS NULL OR a.category = p_category)
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_random_trending_audio(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_random_trending_audio(TEXT) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA (Exemplo de áudios trending)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO instagram_trending_audios (audio_id, audio_name, artist_name, category, trending_score, is_active) VALUES
  ('audio_001', 'Good Vibes', 'Unknown Artist', 'general', 85, true),
  ('audio_002', 'Corporate Energy', 'Business Beats', 'corporate', 78, true),
  ('audio_003', 'Aesthetic', 'Lofi Dreams', 'calm', 92, true),
  ('audio_004', 'High Energy', 'EDM Mix', 'energetic', 88, true),
  ('audio_005', 'Viral Sound', 'Trending Now', 'viral', 95, true),
  ('audio_006', 'Professional Vibe', 'Corporate Sound', 'corporate', 82, true),
  ('audio_007', 'Chill Beats', 'Relaxing Music', 'calm', 76, true),
  ('audio_008', 'Upbeat Corporate', 'Business Vibes', 'corporate', 80, true),
  ('audio_009', 'Trending Beat', 'Viral Mix', 'trending', 90, true),
  ('audio_010', 'Focus Music', 'Productivity Sounds', 'corporate', 75, true)
ON CONFLICT (audio_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'instagram_trending_audios' as table_name,
  COUNT(*) as total_audios,
  COUNT(*) FILTER (WHERE is_active = true) as active_audios,
  AVG(trending_score) as avg_trending_score
FROM instagram_trending_audios;

-- Test random audio function
SELECT * FROM get_random_trending_audio();
SELECT * FROM get_random_trending_audio('corporate');

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- Table: instagram_trending_audios
-- Status: RECREATED & SEEDED
-- ═══════════════════════════════════════════════════════════════════════════
