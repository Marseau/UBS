-- Migration: Create Business Policies Tables
-- Date: 2025-09-06
-- Description: Creates database tables for contextual policies system

-- Tabela principal de políticas de negócio
CREATE TABLE business_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  intent VARCHAR(100) NOT NULL, -- 'availability', 'services', 'all', etc.
  priority INTEGER NOT NULL DEFAULT 1, -- Menor número = maior prioridade
  enabled BOOLEAN NOT NULL DEFAULT true,
  tenant_scoped BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índices para performance
  CONSTRAINT business_policies_priority_positive CHECK (priority > 0)
);

-- Tabela de condições das políticas
CREATE TABLE business_policy_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES business_policies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'time', 'user_type', 'appointment_count', 'tenant_config', etc.
  operator VARCHAR(50) NOT NULL, -- 'equals', 'greater', 'in_range', 'exists', etc.
  field VARCHAR(100), -- Campo específico para avaliar (ex: 'cancelled_count', 'business_rules.working_hours.enabled')
  value_json JSONB, -- Valor da condição em formato JSON flexível
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de ações das políticas  
CREATE TABLE business_policy_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES business_policies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'block', 'redirect', 'enhance', 'modify_response', 'add_context'
  target VARCHAR(100), -- Intent de destino para redirects
  message TEXT, -- Mensagem da ação
  metadata_json JSONB, -- Metadados adicionais da ação
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de auditoria de aplicações de políticas
CREATE TABLE policy_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES business_policies(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_phone VARCHAR(20) NOT NULL,
  intent VARCHAR(100) NOT NULL,
  decision_action VARCHAR(50) NOT NULL, -- 'block', 'redirect', 'enhance', etc.
  reason_code VARCHAR(100) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índice para consultas por tenant/usuário
  INDEX idx_policy_applications_tenant_user (tenant_id, user_phone),
  INDEX idx_policy_applications_applied_at (applied_at)
);

-- Índices para performance
CREATE INDEX idx_business_policies_tenant_intent ON business_policies(tenant_id, intent, enabled);
CREATE INDEX idx_business_policies_priority ON business_policies(priority);
CREATE INDEX idx_business_policy_conditions_policy_id ON business_policy_conditions(policy_id);
CREATE INDEX idx_business_policy_actions_policy_id ON business_policy_actions(policy_id);

-- View otimizada para consultas de políticas com condições e ações
CREATE VIEW business_policies_view AS
SELECT 
  p.id,
  p.tenant_id,
  p.name,
  p.intent,
  p.priority,
  p.enabled,
  p.tenant_scoped,
  p.created_at,
  p.updated_at,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', c.id,
        'type', c.type,
        'operator', c.operator,
        'field', c.field,
        'value', c.value_json
      )
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::json
  ) as conditions,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', a.id,
        'type', a.type,
        'target', a.target,
        'message', a.message,
        'metadata', a.metadata_json
      )
    ) FILTER (WHERE a.id IS NOT NULL),
    '[]'::json
  ) as actions
FROM business_policies p
LEFT JOIN business_policy_conditions c ON p.id = c.policy_id
LEFT JOIN business_policy_actions a ON p.id = a.policy_id
GROUP BY p.id, p.tenant_id, p.name, p.intent, p.priority, p.enabled, p.tenant_scoped, p.created_at, p.updated_at;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_business_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE TRIGGER trigger_business_policies_updated_at
  BEFORE UPDATE ON business_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_business_policies_updated_at();

-- RLS (Row Level Security) para multi-tenancy
ALTER TABLE business_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_policy_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_policy_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_applications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para business_policies
CREATE POLICY "Users can view policies from their tenant" ON business_policies
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can manage policies" ON business_policies
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas RLS para tabelas relacionadas (condições e ações)
CREATE POLICY "Users can view policy conditions from their tenant" ON business_policy_conditions
  FOR SELECT USING (
    policy_id IN (
      SELECT id FROM business_policies
      WHERE tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Tenant admins can manage policy conditions" ON business_policy_conditions
  FOR ALL USING (
    policy_id IN (
      SELECT id FROM business_policies
      WHERE tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Users can view policy actions from their tenant" ON business_policy_actions
  FOR SELECT USING (
    policy_id IN (
      SELECT id FROM business_policies
      WHERE tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Tenant admins can manage policy actions" ON business_policy_actions
  FOR ALL USING (
    policy_id IN (
      SELECT id FROM business_policies
      WHERE tenant_id IN (
        SELECT tenant_id FROM user_tenants 
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- Política RLS para auditoria
CREATE POLICY "Users can view policy applications from their tenant" ON policy_applications
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

-- Comentários para documentação
COMMENT ON TABLE business_policies IS 'Políticas contextuais de negócio por tenant';
COMMENT ON TABLE business_policy_conditions IS 'Condições que determinam quando uma política se aplica';
COMMENT ON TABLE business_policy_actions IS 'Ações a serem executadas quando uma política é aplicada';
COMMENT ON TABLE policy_applications IS 'Log de auditoria das aplicações de políticas';
COMMENT ON VIEW business_policies_view IS 'View otimizada com políticas, condições e ações consolidadas';