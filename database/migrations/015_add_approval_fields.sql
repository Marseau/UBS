-- Migration 015: Add approval fields to editorial_content
-- Purpose: Enable content review and approval before publishing

ALTER TABLE editorial_content
  ADD COLUMN IF NOT EXISTS approved_for_x BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_for_instagram BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_for_youtube BOOLEAN DEFAULT false,

  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,

  ADD COLUMN IF NOT EXISTS rejected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Indexes for filtering approved content
CREATE INDEX IF NOT EXISTS idx_editorial_approved_x ON editorial_content(approved_for_x, published_x);
CREATE INDEX IF NOT EXISTS idx_editorial_approved_instagram ON editorial_content(approved_for_instagram, published_instagram);
CREATE INDEX IF NOT EXISTS idx_editorial_approved_youtube ON editorial_content(approved_for_youtube, published_youtube);

COMMENT ON COLUMN editorial_content.approved_for_x IS 'Content approved for Twitter/X publication';
COMMENT ON COLUMN editorial_content.approved_for_instagram IS 'Content approved for Instagram publication';
COMMENT ON COLUMN editorial_content.approved_for_youtube IS 'Content approved for YouTube publication';
COMMENT ON COLUMN editorial_content.approved_by IS 'User who approved the content';
COMMENT ON COLUMN editorial_content.approved_at IS 'Timestamp when content was approved';
COMMENT ON COLUMN editorial_content.rejected IS 'Content was rejected';
COMMENT ON COLUMN editorial_content.rejection_reason IS 'Reason for rejection';
