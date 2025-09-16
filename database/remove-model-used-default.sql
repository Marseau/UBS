-- =====================================================
-- REMOVER DEFAULT INDEVIDO EM model_used
-- =====================================================
-- Remove DEFAULT 'gpt-3.5-turbo' da coluna model_used para evitar
-- contaminação de dados com modelo fake quando o método usado
-- foi regex ('deterministic') ou flow_lock ('flowlock')
-- =====================================================

-- Verificar estado atual antes da mudança
DO $$
DECLARE
    v_current_default TEXT;
    v_count_default INTEGER;
BEGIN
    -- Verificar DEFAULT atual
    SELECT column_default INTO v_current_default
    FROM information_schema.columns 
    WHERE table_name = 'conversation_history' 
    AND column_name = 'model_used';
    
    -- Contar quantos registros usaram o DEFAULT
    SELECT COUNT(*) INTO v_count_default
    FROM conversation_history 
    WHERE model_used = 'gpt-3.5-turbo' 
    AND (tokens_used = 0 OR tokens_used IS NULL);
    
    RAISE NOTICE '🔍 ANÁLISE ANTES DA MIGRAÇÃO:';
    RAISE NOTICE '   📊 DEFAULT atual: %', COALESCE(v_current_default, 'NENHUM');
    RAISE NOTICE '   ⚠️  Registros potencialmente contaminados: %', v_count_default;
END $$;

-- =====================================================
-- 1. REMOVER O DEFAULT PROBLEMÁTICO
-- =====================================================

-- Alterar coluna para remover DEFAULT
ALTER TABLE conversation_history 
    ALTER COLUMN model_used DROP DEFAULT;

-- =====================================================
-- 2. LIMPAR DADOS CONTAMINADOS (OPCIONAL)
-- =====================================================

-- ATENÇÃO: Este UPDATE só deve ser executado se você tem certeza
-- que registros com 'gpt-3.5-turbo' + tokens_used=0 são contaminados
-- Descomente apenas se necessário:

/*
UPDATE conversation_history 
SET model_used = CASE 
    WHEN tokens_used = 0 OR tokens_used IS NULL THEN NULL
    ELSE model_used 
END
WHERE model_used = 'gpt-3.5-turbo' 
AND (tokens_used = 0 OR tokens_used IS NULL);
*/

-- =====================================================
-- 3. VERIFICAR RESULTADO
-- =====================================================

DO $$
DECLARE
    v_new_default TEXT;
    v_null_count INTEGER;
    v_deterministic_count INTEGER;
    v_flowlock_count INTEGER;
    v_llm_count INTEGER;
BEGIN
    -- Verificar se DEFAULT foi removido
    SELECT column_default INTO v_new_default
    FROM information_schema.columns 
    WHERE table_name = 'conversation_history' 
    AND column_name = 'model_used';
    
    -- Contar distribuição de model_used
    SELECT COUNT(*) INTO v_null_count
    FROM conversation_history WHERE model_used IS NULL;
    
    SELECT COUNT(*) INTO v_deterministic_count
    FROM conversation_history WHERE model_used = 'deterministic';
    
    SELECT COUNT(*) INTO v_flowlock_count
    FROM conversation_history WHERE model_used = 'flowlock';
    
    SELECT COUNT(*) INTO v_llm_count
    FROM conversation_history WHERE model_used LIKE 'gpt%' OR model_used LIKE 'claude%';
    
    RAISE NOTICE '✅ RESULTADO DA MIGRAÇÃO:';
    RAISE NOTICE '   📊 Novo DEFAULT: %', COALESCE(v_new_default, 'NENHUM (correto!)');
    RAISE NOTICE '   🔍 Distribuição model_used:';
    RAISE NOTICE '      - NULL: %', v_null_count;
    RAISE NOTICE '      - deterministic: %', v_deterministic_count;
    RAISE NOTICE '      - flowlock: %', v_flowlock_count;
    RAISE NOTICE '      - LLM models: %', v_llm_count;
    
    IF v_new_default IS NULL THEN
        RAISE NOTICE '🎯 SUCESSO: model_used agora terá controle total via código!';
    ELSE
        RAISE NOTICE '❌ FALHA: DEFAULT ainda existe - verifique permissões';
    END IF;
END $$;

-- =====================================================
-- 4. ATUALIZAR COMENTÁRIO DA COLUNA
-- =====================================================

COMMENT ON COLUMN conversation_history.model_used IS 
'Método de decisão usado: "deterministic" (regex), "flowlock" (flow lock), ou nome do modelo LLM (ex: gpt-4o-mini). NULL para mensagens do sistema.';

-- =====================================================
-- 5. CRIAR CONSTRAINT DE VALIDAÇÃO (OPCIONAL)
-- =====================================================

-- Constraint para garantir que apenas valores válidos sejam inseridos
-- Descomente se quiser validação estrita:

/*
ALTER TABLE conversation_history 
ADD CONSTRAINT chk_model_used_valid 
CHECK (
    model_used IS NULL 
    OR model_used = 'deterministic'
    OR model_used = 'flowlock' 
    OR model_used = 'system'
    OR model_used LIKE 'gpt-%'
    OR model_used LIKE 'claude-%'
    OR model_used LIKE 'dall-e%'
);

COMMENT ON CONSTRAINT chk_model_used_valid ON conversation_history IS 
'Garante que model_used contenha apenas valores válidos para rastreamento de fonte de decisão';
*/

RAISE NOTICE '🚀 MIGRAÇÃO COMPLETA: model_used agora tem controle total!';