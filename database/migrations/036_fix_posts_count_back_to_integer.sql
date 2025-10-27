-- Migration: Fix posts_count back to INTEGER
-- O problema não era o tipo de dado, era a extração incorreta de números do DOM
-- Revertendo posts_count de BIGINT para INTEGER (limite: 2.1 bilhões)

ALTER TABLE instagram_leads
ALTER COLUMN posts_count TYPE INTEGER;

COMMENT ON COLUMN instagram_leads.posts_count IS 'Número total de posts do perfil (INTEGER suficiente - max 2.1B)';
