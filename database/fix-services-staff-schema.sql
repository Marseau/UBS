-- =====================================================
-- CORRIGIR SCHEMA DAS TABELAS SERVICES E STAFF
-- =====================================================
-- Adiciona colunas necessárias para serviços reais
-- Cria tabela staff para colaboradores
-- =====================================================

-- 1. CORRIGIR TABELA SERVICES
-- Adicionar colunas que faltam

-- Verificar se colunas existem e adicionar se necessário
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS duration INTEGER,
ADD COLUMN IF NOT EXISTS price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Comentários para documentação
COMMENT ON COLUMN services.duration IS 'Duração do serviço em minutos';
COMMENT ON COLUMN services.price IS 'Preço do serviço em reais (R$)';
COMMENT ON COLUMN services.description IS 'Descrição detalhada do serviço';
COMMENT ON COLUMN services.is_active IS 'Se o serviço está ativo/disponível';

-- 2. CRIAR TABELA STAFF (se não existir)
CREATE TABLE IF NOT EXISTS staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    schedule TEXT,
    specialties TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários para tabela staff
COMMENT ON TABLE staff IS 'Colaboradores/funcionários dos tenants';
COMMENT ON COLUMN staff.tenant_id IS 'ID do tenant proprietário';
COMMENT ON COLUMN staff.name IS 'Nome completo do colaborador';
COMMENT ON COLUMN staff.role IS 'Função/cargo do colaborador';
COMMENT ON COLUMN staff.schedule IS 'Horário de trabalho';
COMMENT ON COLUMN staff.specialties IS 'Especialidades do colaborador';
COMMENT ON COLUMN staff.phone IS 'Telefone de contato';
COMMENT ON COLUMN staff.email IS 'Email de contato';
COMMENT ON COLUMN staff.is_active IS 'Se o colaborador está ativo';

-- 3. CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_staff_tenant_id ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active) WHERE is_active = true;

-- 4. CRIAR TABELA APPOINTMENTS (se não existir) para agendamentos reais
CREATE TABLE IF NOT EXISTS appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration INTEGER DEFAULT 60,
    price DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários para appointments
COMMENT ON TABLE appointments IS 'Agendamentos dos clientes';
COMMENT ON COLUMN appointments.status IS 'Status: scheduled, confirmed, completed, cancelled, rescheduled';
COMMENT ON COLUMN appointments.duration IS 'Duração em minutos';
COMMENT ON COLUMN appointments.price IS 'Preço cobrado pelo serviço';

-- Índices para appointments
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_phone ON appointments(customer_phone);

-- 5. CRIAR TRIGGERS PARA UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar triggers
DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at 
    BEFORE UPDATE ON services 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_updated_at ON staff;
CREATE TRIGGER update_staff_updated_at 
    BEFORE UPDATE ON staff 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at 
    BEFORE UPDATE ON appointments 
    FOR EACH ROW EXECUTE FUNCTION update_appointments_updated_at_column();

-- 6. VERIFICAR ESTRUTURA CRIADA
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN ('services', 'staff', 'appointments')
  AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- =====================================================
-- RESULTADO ESPERADO:
-- =====================================================
-- ✅ Tabela services com colunas: duration, price, description
-- ✅ Tabela staff criada com colaboradores
-- ✅ Tabela appointments criada para agendamentos reais
-- ✅ Índices criados para performance
-- ✅ Triggers para updated_at funcionando
-- =====================================================