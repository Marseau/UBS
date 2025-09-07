-- Migration: Add session tracking to policy audit
-- Date: 2025-09-06
-- Description: Adds session_id_uuid to policy_applications for conversation tracing

-- Add session_id_uuid field to policy applications audit
ALTER TABLE policy_applications 
ADD COLUMN session_id_uuid UUID;

-- Add index for session-based queries
CREATE INDEX idx_policy_applications_session 
ON policy_applications (session_id_uuid) 
WHERE session_id_uuid IS NOT NULL;

-- Update comment
COMMENT ON TABLE policy_applications IS 'Audit log of all contextual policy applications with session tracking for conversation tracing';