-- ===================================================================
-- SCRIPT: Adicionar colunas account_type para isolamento test/real
-- PROPÓSITO: Permitir demo massiva sem afetar dados de produção
-- DATA: 2025-08-12
-- ===================================================================

-- 1. TENANTS: Adicionar account_type
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' CHECK (account_type IN ('test', 'real'));

-- Comentário na coluna
COMMENT ON COLUMN tenants.account_type IS 'Tipo de conta: test (demo/teste) ou real (produção)';

-- 2. ADMIN_USERS: Adicionar account_type  
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN admin_users.account_type IS 'Tipo de conta: test (demo/teste) ou real (produção)';

-- 3. USERS: Adicionar account_type
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN users.account_type IS 'Tipo de conta: test (demo/teste) ou real (produção)';

-- 4. SERVICES: Adicionar account_type
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN services.account_type IS 'Tipo de conta: test (demo/teste) ou real (produção)';

-- 5. PROFESSIONALS: Adicionar account_type (se existir)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'professionals') THEN
        ALTER TABLE professionals 
        ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' CHECK (account_type IN ('test', 'real'));
        
        COMMENT ON COLUMN professionals.account_type IS 'Tipo de conta: test (demo/teste) ou real (produção)';
    END IF;
END $$;

-- 6. CONVERSATION_HISTORY: Modificar source para incluir 'test'
-- Remover constraint existente se houver
DO $$
BEGIN
    -- Tentar alterar a constraint do source
    BEGIN
        ALTER TABLE conversation_history 
        DROP CONSTRAINT IF EXISTS conversation_history_source_check;
    EXCEPTION WHEN OTHERS THEN
        -- Ignorar erro se constraint não existir
        NULL;
    END;
END $$;

-- Adicionar nova constraint para source incluindo 'test'
ALTER TABLE conversation_history 
ADD CONSTRAINT conversation_history_source_check 
CHECK (source IN ('whatsapp', 'test', 'demo', 'api', 'web'));

COMMENT ON COLUMN conversation_history.source IS 'Fonte da conversa: whatsapp (real), test (demo), demo, api, web';

-- ===================================================================
-- ÍNDICES PARA PERFORMANCE EM QUERIES FILTRADAS POR ACCOUNT_TYPE
-- ===================================================================

-- Índice para tenants por account_type
CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON tenants(account_type);

-- Índice para admin_users por account_type
CREATE INDEX IF NOT EXISTS idx_admin_users_account_type ON admin_users(account_type);

-- Índice para users por account_type  
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);

-- Índice para services por account_type
CREATE INDEX IF NOT EXISTS idx_services_account_type ON services(account_type);

-- Índice para professionals por account_type (se existir)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'professionals') THEN
        CREATE INDEX IF NOT EXISTS idx_professionals_account_type ON professionals(account_type);
    END IF;
END $$;

-- Índice para conversation_history por source
CREATE INDEX IF NOT EXISTS idx_conversation_history_source ON conversation_history(source);

-- ===================================================================
-- FUNÇÕES UTILITÁRIAS PARA LIMPEZA DE DADOS DE TESTE
-- ===================================================================

-- Função para limpar todos os dados de teste
CREATE OR REPLACE FUNCTION clean_test_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Limpar conversation_history de teste
    DELETE FROM conversation_history WHERE source IN ('test', 'demo');
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpar services de teste
    DELETE FROM services WHERE account_type = 'test';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpar professionals de teste (se existir)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'professionals') THEN
        DELETE FROM professionals WHERE account_type = 'test';
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        deleted_count := deleted_count + temp_count;
    END IF;
    
    -- Limpar users de teste
    DELETE FROM users WHERE account_type = 'test';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpar admin_users de teste
    DELETE FROM admin_users WHERE account_type = 'test';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpar tenants de teste
    DELETE FROM tenants WHERE account_type = 'test';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clean_test_data() IS 'Remove todos os dados de teste/demo do sistema';

-- Função para contar dados de teste
CREATE OR REPLACE FUNCTION count_test_data()
RETURNS TABLE(
    table_name TEXT,
    test_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'tenants'::TEXT, COUNT(*)::BIGINT FROM tenants WHERE account_type = 'test'
    UNION ALL
    SELECT 'admin_users'::TEXT, COUNT(*)::BIGINT FROM admin_users WHERE account_type = 'test'
    UNION ALL
    SELECT 'users'::TEXT, COUNT(*)::BIGINT FROM users WHERE account_type = 'test'
    UNION ALL
    SELECT 'services'::TEXT, COUNT(*)::BIGINT FROM services WHERE account_type = 'test'
    UNION ALL
    SELECT 'conversation_history'::TEXT, COUNT(*)::BIGINT FROM conversation_history WHERE source IN ('test', 'demo');
    
    -- Adicionar professionals se existir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'professionals') THEN
        RETURN QUERY
        SELECT 'professionals'::TEXT, COUNT(*)::BIGINT FROM professionals WHERE account_type = 'test';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION count_test_data() IS 'Conta registros de teste/demo em todas as tabelas';

-- ===================================================================
-- VIEWS PARA FACILITAR CONSULTAS ISOLADAS
-- ===================================================================

-- View apenas para dados reais (produção)
CREATE OR REPLACE VIEW real_tenants AS
SELECT * FROM tenants WHERE account_type = 'real';

-- View apenas para dados de teste
CREATE OR REPLACE VIEW test_tenants AS
SELECT * FROM tenants WHERE account_type = 'test';

-- View para conversation_history real
CREATE OR REPLACE VIEW real_conversations AS
SELECT * FROM conversation_history WHERE source = 'whatsapp';

-- View para conversation_history de teste
CREATE OR REPLACE VIEW test_conversations AS
SELECT * FROM conversation_history WHERE source IN ('test', 'demo');

-- ===================================================================
-- LOG DE EXECUÇÃO
-- ===================================================================

DO $$
BEGIN
    RAISE NOTICE 'SCRIPT EXECUTADO COM SUCESSO!';
    RAISE NOTICE 'Colunas account_type adicionadas nas tabelas principais';
    RAISE NOTICE 'Índices de performance criados';
    RAISE NOTICE 'Funções utilitárias criadas: clean_test_data(), count_test_data()';
    RAISE NOTICE 'Views criadas: real_tenants, test_tenants, real_conversations, test_conversations';
    RAISE NOTICE '';
    RAISE NOTICE 'PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Testar criação de tenant demo';
    RAISE NOTICE '2. Verificar isolamento com: SELECT * FROM count_test_data();';
    RAISE NOTICE '3. Limpar dados teste com: SELECT clean_test_data();';
END $$;