
-- ===================================================================
-- SCRIPT SEGURO: Adicionar colunas account_type 
-- EXECUÇÃO: Copie e cole no SQL Editor do Supabase Dashboard
-- GARANTIA: Não afeta dados existentes nem free trial
-- ===================================================================

-- 1. TENANTS: Adicionar account_type
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN tenants.account_type IS 'Tipo de conta: test (demo) ou real (produção)';

-- 2. ADMIN_USERS: Adicionar account_type  
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN admin_users.account_type IS 'Tipo de conta: test (demo) ou real (produção)';

-- 3. USERS: Adicionar account_type
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN users.account_type IS 'Tipo de conta: test (demo) ou real (produção)';

-- 4. SERVICES: Adicionar account_type
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
CHECK (account_type IN ('test', 'real'));

COMMENT ON COLUMN services.account_type IS 'Tipo de conta: test (demo) ou real (produção)';

-- 5. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON tenants(account_type);
CREATE INDEX IF NOT EXISTS idx_admin_users_account_type ON admin_users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_services_account_type ON services(account_type);

-- Índices para isolamento test vs real  
-- conversation_history usa message_source (índice B-tree normal para texto)
CREATE INDEX IF NOT EXISTS idx_conversation_history_message_source ON conversation_history(message_source);

-- appointments usa appointment_data.source (índice B-tree para texto extraído do JSONB)
CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments ((appointment_data->>'source'));

-- 6. VERIFICAÇÃO DE SUCESSO
SELECT 'SUCESSO: Schema atualizado com segurança!' as status;
