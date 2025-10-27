-- Migration: Add activity_score and is_active fields to instagram_leads
-- Created: 2025-10-23
-- Description: Adds activity_score (0-100) and is_active (validation status) for lead qualification

-- Add activity_score column (0-100 score based on follower/following ratio, post count, etc.)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS activity_score INTEGER DEFAULT 0;

-- Add is_active column (whether the profile passed validation thresholds)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_instagram_leads_activity_score
ON instagram_leads(activity_score);

CREATE INDEX IF NOT EXISTS idx_instagram_leads_is_active
ON instagram_leads(is_active);

-- Add composite index for common queries (active leads with high scores)
CREATE INDEX IF NOT EXISTS idx_instagram_leads_active_score
ON instagram_leads(is_active, activity_score DESC) WHERE is_active = true;

-- Add check constraint to ensure activity_score is between 0 and 100
ALTER TABLE instagram_leads
ADD CONSTRAINT chk_activity_score_range CHECK (activity_score >= 0 AND activity_score <= 100);

-- Add comments to document the fields
COMMENT ON COLUMN instagram_leads.activity_score IS 'Activity score (0-100) calculated from follower/following ratio, post count, and engagement metrics. Used for lead qualification. Threshold: 50+';
COMMENT ON COLUMN instagram_leads.is_active IS 'Validation status - true if profile passed activity_score >= 50 threshold and other validation rules';
