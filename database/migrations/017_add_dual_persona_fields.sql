-- Migration 017: Add Dual Persona Video Fields
-- Adds support for Carla (problem) + Bruno (solution) dual persona Instagram Reels

BEGIN;

-- Add dual persona script fields
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS carla_script TEXT,
ADD COLUMN IF NOT EXISTS bruno_script TEXT;

-- Add dual persona video URL fields
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS carla_video_url TEXT,
ADD COLUMN IF NOT EXISTS bruno_video_url TEXT,
ADD COLUMN IF NOT EXISTS merged_video_url TEXT;

-- Add persona format tracking
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS persona_format VARCHAR(50) DEFAULT 'dual';

-- Add video generation status tracking
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS carla_video_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS bruno_video_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS merged_video_status VARCHAR(20) DEFAULT 'pending';

-- Add timestamps for video generation
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS carla_video_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bruno_video_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS merged_video_generated_at TIMESTAMPTZ;

-- Add video generation metadata
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS carla_video_duration_seconds NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS bruno_video_duration_seconds NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS merged_video_duration_seconds NUMERIC(5,2);

-- Add video generation cost tracking
ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS video_generation_cost_usd NUMERIC(10,4) DEFAULT 0;

-- Create index for video generation status queries
CREATE INDEX IF NOT EXISTS idx_editorial_content_video_status
ON editorial_content(carla_video_status, bruno_video_status, merged_video_status);

-- Create index for persona format queries
CREATE INDEX IF NOT EXISTS idx_editorial_content_persona_format
ON editorial_content(persona_format);

-- Add comments for documentation
COMMENT ON COLUMN editorial_content.carla_script IS 'Script para Carla (problema): 40-60 caracteres, 7-10 segundos';
COMMENT ON COLUMN editorial_content.bruno_script IS 'Script para Bruno (solução): 90-110 caracteres, 10-17 segundos';
COMMENT ON COLUMN editorial_content.carla_video_url IS 'URL do vídeo individual da Carla no D-ID';
COMMENT ON COLUMN editorial_content.bruno_video_url IS 'URL do vídeo individual do Bruno no D-ID';
COMMENT ON COLUMN editorial_content.merged_video_url IS 'URL do vídeo final merged (Carla + Bruno)';
COMMENT ON COLUMN editorial_content.persona_format IS 'Formato do Reel: "dual" (Carla+Bruno) ou "single" (legado)';
COMMENT ON COLUMN editorial_content.carla_video_status IS 'Status: pending, generating, done, error';
COMMENT ON COLUMN editorial_content.bruno_video_status IS 'Status: pending, generating, done, error';
COMMENT ON COLUMN editorial_content.merged_video_status IS 'Status: pending, generating, done, error';

COMMIT;

-- Success message
SELECT 'Migration 017 completed: Dual Persona fields added to editorial_content' AS status;
