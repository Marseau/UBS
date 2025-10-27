-- Migration 016: Add video URLs and generation tracking to editorial_content
-- Date: 2025-10-06
-- Purpose: Support video generation for Instagram Reels and YouTube videos

-- Add video URL columns
ALTER TABLE editorial_content
  ADD COLUMN IF NOT EXISTS instagram_reel_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_video_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS media_generated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS media_generation_status VARCHAR(50) DEFAULT 'pending';

-- Add comments for documentation
COMMENT ON COLUMN editorial_content.instagram_reel_url IS 'Public URL of the generated Instagram Reel video';
COMMENT ON COLUMN editorial_content.youtube_video_url IS 'Public URL of the generated YouTube video';
COMMENT ON COLUMN editorial_content.instagram_thumbnail_url IS 'Public URL of the Instagram Reel thumbnail';
COMMENT ON COLUMN editorial_content.youtube_thumbnail_url IS 'Public URL of the YouTube video thumbnail';
COMMENT ON COLUMN editorial_content.media_generated_at IS 'Timestamp when video generation completed';
COMMENT ON COLUMN editorial_content.media_generation_status IS 'Status: pending, generating, completed, failed';

-- Add index for querying by generation status
CREATE INDEX IF NOT EXISTS idx_editorial_content_media_status
  ON editorial_content(media_generation_status);

-- Add index for querying content with generated media
CREATE INDEX IF NOT EXISTS idx_editorial_content_has_instagram_reel
  ON editorial_content(week_number, year)
  WHERE instagram_reel_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editorial_content_has_youtube_video
  ON editorial_content(week_number, year)
  WHERE youtube_video_url IS NOT NULL;
