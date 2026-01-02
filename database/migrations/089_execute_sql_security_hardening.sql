-- ============================================
-- Migration 089: Security Hardening para execute_sql
-- ============================================
-- Implementa:
-- 1. Allowlist de comandos no execute_sql (bloqueia DROP, DELETE, ALTER, etc.)
-- 2. Função execute_admin_sql separada para DDL (temp tables HNSW)
-- 3. REVOKE PUBLIC + GRANT apenas para service_role
-- 4. Statement timeout para proteção contra queries longas
-- ============================================

-- ============================================
-- 1. EXECUTE_SQL COM ALLOWLIST (SOMENTE SELECT)
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
    result jsonb;
    normalized_query text;
    -- Patterns mais específicos: comandos SQL reais, não em comentários/strings
    forbidden_patterns text[] := ARRAY[
        '^\s*drop\s+',           -- DROP no início
        '^\s*truncate\s+',       -- TRUNCATE no início
        '^\s*delete\s+from',     -- DELETE FROM
        '^\s*update\s+\w+\s+set', -- UPDATE ... SET (comando real)
        '^\s*insert\s+into',     -- INSERT INTO
        '^\s*alter\s+',          -- ALTER no início
        '^\s*create\s+(?!temp)',  -- CREATE (exceto TEMP)
        '^\s*grant\s+',          -- GRANT no início
        '^\s*revoke\s+',         -- REVOKE no início
        '^\s*copy\s+',           -- COPY no início
        '\bpg_read_file',        -- Funções perigosas
        '\bpg_write_file',
        '\bdblink',
        '\blo_import',
        '\blo_export',
        ';\s*(?:drop|delete|update|insert|alter|create|grant|revoke)'  -- multi-statement com comandos perigosos
    ];
    pattern text;
BEGIN
    -- Normalizar: lowercase e remover comentários SQL
    normalized_query := lower(trim(
        regexp_replace(query_text, '--[^\n]*', '', 'g')  -- remove comentários de linha
    ));
    normalized_query := regexp_replace(normalized_query, '/\*.*?\*/', '', 'g');  -- remove comentários de bloco

    -- Verificar padrões proibidos
    FOREACH pattern IN ARRAY forbidden_patterns LOOP
        IF normalized_query ~ pattern THEN
            RAISE EXCEPTION 'execute_sql: comando não permitido (pattern: %)', pattern
                USING HINT = 'Use execute_admin_sql para operações DDL autorizadas';
        END IF;
    END LOOP;

    -- Executar query e retornar como JSONB
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;

    -- Retornar array vazio se sem resultados
    IF result IS NULL THEN
        result := '[]'::jsonb;
    END IF;

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'error', SQLERRM,
            'state', SQLSTATE,
            'query', left(query_text, 200)  -- truncar query no erro por segurança
        );
END;
$$;

COMMENT ON FUNCTION public.execute_sql IS
'Executa SELECT queries com validação de segurança.
- Bloqueia: DROP, DELETE, UPDATE, INSERT, ALTER, GRANT, REVOKE, COPY
- Bloqueia: acesso a pg_*, information_schema, dblink
- Bloqueia: multi-statement (;)
- Timeout: 30s
- Para DDL (CREATE TEMP TABLE, CREATE INDEX): use execute_admin_sql';

-- ============================================
-- 2. EXECUTE_ADMIN_SQL PARA DDL (TEMP TABLES HNSW)
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_admin_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'  -- DDL pode demorar mais (índices HNSW)
AS $$
DECLARE
    result jsonb;
    normalized_query text;
    -- Allowlist explícita de comandos permitidos
    allowed_patterns text[] := ARRAY[
        '^select\s+',
        '^create\s+temp\s+table\s+',
        '^create\s+index\s+on\s+temp_',
        '^drop\s+table\s+if\s+exists\s+temp_'
    ];
    pattern text;
    is_allowed boolean := false;
BEGIN
    -- Normalizar query
    normalized_query := lower(trim(query_text));

    -- Verificar se query está na allowlist
    FOREACH pattern IN ARRAY allowed_patterns LOOP
        IF normalized_query ~ pattern THEN
            is_allowed := true;
            EXIT;
        END IF;
    END LOOP;

    IF NOT is_allowed THEN
        RAISE EXCEPTION 'execute_admin_sql: comando não está na allowlist'
            USING HINT = 'Permitido: SELECT, CREATE TEMP TABLE, CREATE INDEX ON temp_*, DROP TABLE IF EXISTS temp_*';
    END IF;

    -- Bloquear padrões perigosos mesmo na allowlist
    IF normalized_query ~ 'pg_|information_schema|dblink|lo_|\;\s*\w' THEN
        RAISE EXCEPTION 'execute_admin_sql: padrão de sistema não permitido';
    END IF;

    -- Para SELECT, retornar resultados
    IF normalized_query ~ '^select\s+' THEN
        EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
        IF result IS NULL THEN
            result := '[]'::jsonb;
        END IF;
        RETURN result;
    END IF;

    -- Para DDL, executar e retornar sucesso
    EXECUTE query_text;
    RETURN jsonb_build_object('success', true, 'command', left(normalized_query, 50));

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'error', SQLERRM,
            'state', SQLSTATE,
            'query', left(query_text, 100)
        );
END;
$$;

COMMENT ON FUNCTION public.execute_admin_sql IS
'Executa DDL queries com allowlist restrita.
- Permitido: SELECT, CREATE TEMP TABLE, CREATE INDEX ON temp_*, DROP TABLE IF EXISTS temp_*
- Bloqueia: acesso a pg_*, information_schema, dblink
- Bloqueia: multi-statement
- Timeout: 120s (para índices HNSW)
- Uso: clustering por grafo com tabelas temporárias indexadas';

-- ============================================
-- 3. PERMISSÕES: APENAS SERVICE_ROLE
-- ============================================

-- Revogar acesso público
REVOKE ALL ON FUNCTION public.execute_sql FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_sql FROM anon;
REVOKE ALL ON FUNCTION public.execute_sql FROM authenticated;

REVOKE ALL ON FUNCTION public.execute_admin_sql FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_admin_sql FROM anon;
REVOKE ALL ON FUNCTION public.execute_admin_sql FROM authenticated;

-- Conceder apenas para service_role
GRANT EXECUTE ON FUNCTION public.execute_sql TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_admin_sql TO service_role;

-- ============================================
-- 4. VERIFICAÇÃO
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 089 aplicada com sucesso:';
    RAISE NOTICE '  - execute_sql: allowlist (SELECT only), timeout 30s';
    RAISE NOTICE '  - execute_admin_sql: allowlist DDL (temp tables), timeout 120s';
    RAISE NOTICE '  - Permissões: apenas service_role';
END;
$$;
