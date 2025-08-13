-- ================================================================================
-- VERIFICAR SCHEMA E CONSTRAINTS DA TABELA ubs_metric_system
-- ================================================================================

-- 1. Verificar estrutura da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'ubs_metric_system' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Verificar constraints únicas e chaves primárias
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'ubs_metric_system'
  AND tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE');

-- 3. Verificar índices únicos
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'ubs_metric_system'
  AND schemaname = 'public';