-- Add Google Calendar integration fields to professionals table
-- Migration: 004_add_google_calendar_to_professionals.sql
-- Date: 2025-07-27

-- Add Google Calendar credentials and calendar ID to professionals
ALTER TABLE professionals 
ADD COLUMN IF NOT EXISTS google_calendar_credentials JSONB,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_professionals_google_calendar 
ON professionals(google_calendar_id) 
WHERE google_calendar_credentials IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN professionals.google_calendar_credentials IS 'OAuth2 credentials for Google Calendar API access (access_token, refresh_token, etc.)';
COMMENT ON COLUMN professionals.google_calendar_id IS 'Google Calendar ID to use for events (default: primary)';