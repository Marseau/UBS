-- Migration: Add last_check_notified_at to instagram_leads
-- Purpose: Track when we last sent Telegram notification about check status
-- This prevents spam notifications for the same status

-- Add column to track last notification timestamp
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS last_check_notified_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the field
COMMENT ON COLUMN instagram_leads.last_check_notified_at IS
  'Timestamp of last Telegram notification sent for check status.
   Updated only when status changes or first check happens.
   Prevents duplicate notifications for same status.';

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_instagram_leads_last_check_notified
ON instagram_leads(last_check_notified_at)
WHERE follow_status = 'following';

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 039: Added last_check_notified_at column to instagram_leads';
END $$;
