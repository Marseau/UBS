-- Migration 022: Remove redundant approval fields
-- Remove campos redundantes que não são utilizados pelos workflows
-- Os workflows usam thread_X_approved, reel_X_approved e youtube_short_approved

ALTER TABLE editorial_content
  DROP COLUMN IF EXISTS approved_for_x,
  DROP COLUMN IF EXISTS approved_for_instagram,
  DROP COLUMN IF EXISTS approved_for_youtube;

-- Comentário: Campos removidos pois não eram utilizados pelos workflows N8N
-- Os workflows verificam aprovação através de:
--   - thread_1_approved, thread_2_approved, thread_3_approved (Twitter)
--   - reel_1_approved, reel_2_approved, reel_3_approved (Instagram)
--   - youtube_short_approved (YouTube)
