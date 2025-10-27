-- Migration 024: Fix content_type default value
-- O default 'instagram_reel' é incorreto pois o conteúdo editorial inclui:
-- - 21 tweets (Twitter)
-- - 3 Reels (Instagram)
-- - 1 Short (YouTube)

ALTER TABLE editorial_content
  ALTER COLUMN content_type DROP DEFAULT;

-- Comentário: Default removido pois cada linha contém conteúdo de múltiplas plataformas
-- O campo pode ser usado para filtros/categorização futura, mas não deve ter default fixo
-- Se necessário no futuro, pode-se adicionar um novo valor ao enum como 'editorial_week'
