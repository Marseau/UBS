-- Schema_Fixes.sql
-- Correções de schema para testes funcionarem
-- Executar ANTES dos Seeds_DB.sql

-- 1. Garantir coluna is_test em test_runs
ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT true;

-- 2. Padronizar appointments para starts_at TIMESTAMPTZ
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

-- Migrar dados existentes se houver
UPDATE appointments 
SET starts_at = (appointment_date + appointment_time::time) AT TIME ZONE 'America/Sao_Paulo'
WHERE starts_at IS NULL AND appointment_date IS NOT NULL AND appointment_time IS NOT NULL;

-- 3. Garantir estrutura de ai_logs para métricas
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS turn_number INTEGER DEFAULT 1;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS fallback_to_human BOOLEAN DEFAULT false;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS tokens_input INTEGER DEFAULT 0;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS tokens_output INTEGER DEFAULT 0;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(8,6) DEFAULT 0.00;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS scenario_id TEXT;
ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS entities_extracted JSONB DEFAULT '{}';

-- 4. Garantir estrutura de messages para tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS test_run_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS turn INTEGER DEFAULT 1;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS urgency_detected BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS first_time_client BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS student_level TEXT;

-- 5. Estrutura para holidays se não existir
CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    name TEXT NOT NULL,
    is_national BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    is_test BOOLEAN DEFAULT false,
    test_run_id TEXT
);

-- 6. Estrutura para business_hours se não existir  
CREATE TABLE IF NOT EXISTS business_hours (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    day_of_week TEXT NOT NULL, -- monday, tuesday, etc
    opening_time TIME NOT NULL,
    closing_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    is_test BOOLEAN DEFAULT false,
    test_run_id TEXT
);

-- 7. Estrutura para tenant_policies se não existir
CREATE TABLE IF NOT EXISTS tenant_policies (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    policy_type TEXT NOT NULL, -- cancellation, rescheduling, deposit, etc
    policy_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    is_test BOOLEAN DEFAULT false,
    test_run_id TEXT
);

-- 8. Estrutura para calendar_events se referenciada
CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    appointment_id TEXT REFERENCES appointments(id),
    external_event_id TEXT,
    provider TEXT DEFAULT 'google_calendar',
    created_at TIMESTAMP DEFAULT NOW(),
    is_test BOOLEAN DEFAULT false,
    test_run_id TEXT
);

-- 9. Garantir RLS está ativo nas tabelas principais
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;  
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- 10. Política RLS básica para testes (exemplo)
DROP POLICY IF EXISTS test_tenant_isolation ON appointments;
CREATE POLICY test_tenant_isolation ON appointments
FOR ALL TO public
USING (tenant_id = current_setting('app.tenant_id', true));

-- Índices para performance de testes
CREATE INDEX IF NOT EXISTS idx_appointments_test_run ON appointments(test_run_id) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_ai_logs_test_run ON ai_logs(test_run_id) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_messages_test_run ON messages(test_run_id) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_professional ON appointments(tenant_id, professional_id, starts_at);

COMMIT;