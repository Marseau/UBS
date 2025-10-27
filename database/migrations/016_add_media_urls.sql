-- Migration: Add media URLs for generated videos/images
-- Instagram Reels and YouTube videos will be generated once and stored

ALTER TABLE editorial_content
  ADD COLUMN IF NOT EXISTS instagram_reel_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_video_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS media_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS media_generation_status VARCHAR(50) DEFAULT 'pending';

-- Update old instagram_image_url column name for consistency
ALTER TABLE editorial_content
  RENAME COLUMN instagram_image_url TO instagram_post_image_url_deprecated;

-- Add index for media generation status
CREATE INDEX IF NOT EXISTS idx_editorial_media_status
  ON editorial_content(media_generation_status, week_number, year);

-- Add comments for documentation
COMMENT ON COLUMN editorial_content.instagram_reel_url IS 'URL do vídeo Instagram Reel gerado (15-30s, com música de fundo)';
COMMENT ON COLUMN editorial_content.youtube_video_url IS 'URL do vídeo YouTube gerado (60-90s, com música de fundo)';
COMMENT ON COLUMN editorial_content.instagram_thumbnail_url IS 'URL da thumbnail do Instagram Reel';
COMMENT ON COLUMN editorial_content.youtube_thumbnail_url IS 'URL da thumbnail do YouTube video';
COMMENT ON COLUMN editorial_content.media_generation_status IS 'Status: pending, generating, completed, failed';
