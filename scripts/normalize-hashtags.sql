-- =====================================================
-- SCRIPT DE NORMALIZAÇÃO DE HASHTAGS
-- =====================================================
-- Este script normaliza todas as hashtags existentes no banco:
-- 1. Remove acentos (tráfego → trafego)
-- 2. Converte para minúsculas
-- 3. Remove caracteres inválidos
-- 4. Elimina duplicatas resultantes da normalização
--
-- IMPORTANTE: Execute com cuidado em produção!
-- Recomenda-se fazer backup antes de executar.
-- =====================================================

-- Função para normalizar hashtag (mesma lógica do TypeScript)
CREATE OR REPLACE FUNCTION normalize_hashtag(hashtag TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            TRANSLATE(
                hashtag,
                'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
            ),
            '[^a-zA-Z0-9_]', '', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- PARTE 1: Normalizar hashtags_bio
-- =====================================================

-- Verificar quantidade de registros afetados (dry run)
SELECT COUNT(*) as leads_com_hashtags_bio
FROM instagram_leads
WHERE hashtags_bio IS NOT NULL
  AND jsonb_array_length(hashtags_bio) > 0;

-- Ver exemplos de hashtags que serão normalizadas
SELECT
    id,
    username,
    hashtags_bio as antes,
    (
        SELECT jsonb_agg(DISTINCT normalize_hashtag(h))
        FROM jsonb_array_elements_text(hashtags_bio) as h
        WHERE normalize_hashtag(h) != ''
    ) as depois
FROM instagram_leads
WHERE hashtags_bio IS NOT NULL
  AND jsonb_array_length(hashtags_bio) > 0
  AND hashtags_bio::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]'
LIMIT 10;

-- ATUALIZAR hashtags_bio (DESCOMENTE PARA EXECUTAR)
/*
UPDATE instagram_leads
SET hashtags_bio = (
    SELECT jsonb_agg(DISTINCT normalize_hashtag(h))
    FROM jsonb_array_elements_text(hashtags_bio) as h
    WHERE normalize_hashtag(h) != ''
)
WHERE hashtags_bio IS NOT NULL
  AND jsonb_array_length(hashtags_bio) > 0;
*/

-- =====================================================
-- PARTE 2: Normalizar hashtags_posts
-- =====================================================

-- Verificar quantidade de registros afetados (dry run)
SELECT COUNT(*) as leads_com_hashtags_posts
FROM instagram_leads
WHERE hashtags_posts IS NOT NULL
  AND jsonb_array_length(hashtags_posts) > 0;

-- Ver exemplos de hashtags que serão normalizadas
SELECT
    id,
    username,
    hashtags_posts as antes,
    (
        SELECT jsonb_agg(DISTINCT normalize_hashtag(h))
        FROM jsonb_array_elements_text(hashtags_posts) as h
        WHERE normalize_hashtag(h) != ''
    ) as depois
FROM instagram_leads
WHERE hashtags_posts IS NOT NULL
  AND jsonb_array_length(hashtags_posts) > 0
  AND hashtags_posts::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]'
LIMIT 10;

-- ATUALIZAR hashtags_posts (DESCOMENTE PARA EXECUTAR)
/*
UPDATE instagram_leads
SET hashtags_posts = (
    SELECT jsonb_agg(DISTINCT normalize_hashtag(h))
    FROM jsonb_array_elements_text(hashtags_posts) as h
    WHERE normalize_hashtag(h) != ''
)
WHERE hashtags_posts IS NOT NULL
  AND jsonb_array_length(hashtags_posts) > 0;
*/

-- =====================================================
-- PARTE 3: Verificação pós-normalização
-- =====================================================

-- Verificar se ainda existem hashtags com acentos
SELECT 'hashtags_bio' as campo, COUNT(*) as registros_com_acentos
FROM instagram_leads
WHERE hashtags_bio IS NOT NULL
  AND hashtags_bio::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]'
UNION ALL
SELECT 'hashtags_posts' as campo, COUNT(*) as registros_com_acentos
FROM instagram_leads
WHERE hashtags_posts IS NOT NULL
  AND hashtags_posts::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]';

-- =====================================================
-- PARTE 4: Normalizar tabela instagram_hashtag_variations
-- =====================================================

-- Ver variações com acentos
SELECT hashtag, search_term, frequency
FROM instagram_hashtag_variations
WHERE hashtag ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]'
LIMIT 20;

-- ATUALIZAR instagram_hashtag_variations (DESCOMENTE PARA EXECUTAR)
/*
UPDATE instagram_hashtag_variations
SET hashtag = normalize_hashtag(hashtag)
WHERE hashtag ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]';
*/

-- =====================================================
-- RESUMO FINAL
-- =====================================================
SELECT
    'instagram_leads.hashtags_bio' as tabela_campo,
    COUNT(*) as total_registros,
    SUM(CASE WHEN hashtags_bio::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]' THEN 1 ELSE 0 END) as com_acentos
FROM instagram_leads
WHERE hashtags_bio IS NOT NULL

UNION ALL

SELECT
    'instagram_leads.hashtags_posts' as tabela_campo,
    COUNT(*) as total_registros,
    SUM(CASE WHEN hashtags_posts::text ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]' THEN 1 ELSE 0 END) as com_acentos
FROM instagram_leads
WHERE hashtags_posts IS NOT NULL

UNION ALL

SELECT
    'instagram_hashtag_variations' as tabela_campo,
    COUNT(*) as total_registros,
    SUM(CASE WHEN hashtag ~ '[áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]' THEN 1 ELSE 0 END) as com_acentos
FROM instagram_hashtag_variations;
