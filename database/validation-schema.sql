-- ==========================================
-- SCHEMA PARA SISTEMA DE VALIDAÇÃO DE MÉTRICAS
-- WhatsAppSalon-N8N Validation Framework
-- ==========================================

-- 1. Tabela para armazenar resultados de validação
CREATE TABLE IF NOT EXISTS validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL CHECK (validation_type IN (
    'FIELD_SEMANTIC', 'CALCULATION_ACCURACY', 'CROSS_TABLE_CONSISTENCY', 
    'DATA_QUALITY', 'PERFORMANCE'
  )),
  metric_name TEXT NOT NULL,
  field_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'WARNING', 'SKIPPED')),
  score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  passed BOOLEAN NOT NULL,
  details JSONB DEFAULT '{}',
  recommendations TEXT[],
  execution_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indices para performance
  INDEX idx_validation_results_tenant_id (tenant_id),
  INDEX idx_validation_results_type (validation_type),
  INDEX idx_validation_results_status (status),
  INDEX idx_validation_results_created_at (created_at)
);

-- 2. Tabela de configuração de regras de validação
CREATE TABLE IF NOT EXISTS validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT UNIQUE NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'FIELD_SEMANTIC', 'CALCULATION', 'QUALITY_DIMENSION', 'BUSINESS_RULE'
  )),
  target_table TEXT NOT NULL,
  target_field TEXT,
  validation_logic JSONB NOT NULL,
  severity TEXT DEFAULT 'ERROR' CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  threshold DECIMAL(5,2),
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indices
  INDEX idx_validation_rules_type (rule_type),
  INDEX idx_validation_rules_table (target_table),
  INDEX idx_validation_rules_active (is_active)
);

-- 3. Histórico de métricas de qualidade
CREATE TABLE IF NOT EXISTS quality_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  quality_dimension TEXT NOT NULL CHECK (quality_dimension IN (
    'completeness', 'consistency', 'accuracy', 'validity', 'timeliness'
  )),
  score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  weight DECIMAL(3,2) DEFAULT 0.20,
  passed BOOLEAN NOT NULL,
  details JSONB DEFAULT '{}',
  recommendations TEXT[],
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indices
  INDEX idx_quality_history_tenant_id (tenant_id),
  INDEX idx_quality_history_dimension (quality_dimension),
  INDEX idx_quality_history_measured_at (measured_at)
);

-- 4. Snapshots de dados para rollback
CREATE TABLE IF NOT EXISTS data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_type TEXT DEFAULT 'VALIDATION_BACKUP',
  tables_data JSONB NOT NULL,
  checksums JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  size_bytes BIGINT DEFAULT 0,
  compression_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
  
  -- Indices
  INDEX idx_data_snapshots_tenant_id (tenant_id),
  INDEX idx_data_snapshots_created_at (created_at),
  INDEX idx_data_snapshots_expires_at (expires_at)
);

-- 5. Log de alertas do sistema de validação
CREATE TABLE IF NOT EXISTS validation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_name TEXT,
  current_value DECIMAL(12,2),
  threshold_value DECIMAL(12,2),
  details JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  auto_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indices
  INDEX idx_validation_alerts_tenant_id (tenant_id),
  INDEX idx_validation_alerts_severity (severity),
  INDEX idx_validation_alerts_acknowledged (acknowledged),
  INDEX idx_validation_alerts_created_at (created_at)
);

-- 6. Estatísticas de performance do sistema de validação
CREATE TABLE IF NOT EXISTS validation_performance_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_date DATE NOT NULL,
  total_validations INTEGER DEFAULT 0,
  successful_validations INTEGER DEFAULT 0,
  failed_validations INTEGER DEFAULT 0,
  avg_execution_time_ms DECIMAL(10,2) DEFAULT 0,
  max_execution_time_ms INTEGER DEFAULT 0,
  avg_memory_usage_mb DECIMAL(8,2) DEFAULT 0,
  throughput_per_hour DECIMAL(8,2) DEFAULT 0,
  quality_score_avg DECIMAL(5,2) DEFAULT 0,
  active_alerts_count INTEGER DEFAULT 0,
  system_status TEXT DEFAULT 'HEALTHY' CHECK (system_status IN ('HEALTHY', 'DEGRADED', 'CRITICAL')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: um registro por dia
  UNIQUE(measurement_date),
  
  -- Indices
  INDEX idx_validation_perf_stats_date (measurement_date),
  INDEX idx_validation_perf_stats_status (system_status)
);

-- 7. Configuração de qualidade por tenant
CREATE TABLE IF NOT EXISTS tenant_quality_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  completeness_threshold DECIMAL(5,2) DEFAULT 95.0,
  consistency_threshold DECIMAL(5,2) DEFAULT 90.0,
  accuracy_threshold DECIMAL(5,2) DEFAULT 99.0,
  validity_threshold DECIMAL(5,2) DEFAULT 95.0,
  timeliness_threshold DECIMAL(5,2) DEFAULT 85.0,
  overall_threshold DECIMAL(5,2) DEFAULT 90.0,
  auto_rollback_enabled BOOLEAN DEFAULT TRUE,
  alert_preferences JSONB DEFAULT '{"email": true, "dashboard": true, "webhook": false}',
  custom_rules JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indices
  INDEX idx_tenant_quality_config_tenant_id (tenant_id)
);

-- ==========================================
-- FUNÇÕES AUXILIARES PARA VALIDAÇÃO
-- ==========================================

-- Função para calcular score geral de qualidade
CREATE OR REPLACE FUNCTION calculate_overall_quality_score(
  p_tenant_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(5,2) AS $$
DECLARE
  result DECIMAL(5,2) := 0;
  completeness_score DECIMAL(5,2) := 0;
  consistency_score DECIMAL(5,2) := 0;
  accuracy_score DECIMAL(5,2) := 0;
  validity_score DECIMAL(5,2) := 0;
  timeliness_score DECIMAL(5,2) := 0;
BEGIN
  -- Buscar scores mais recentes de cada dimensão
  SELECT 
    COALESCE(MAX(CASE WHEN quality_dimension = 'completeness' THEN score END), 0),
    COALESCE(MAX(CASE WHEN quality_dimension = 'consistency' THEN score END), 0),
    COALESCE(MAX(CASE WHEN quality_dimension = 'accuracy' THEN score END), 0),
    COALESCE(MAX(CASE WHEN quality_dimension = 'validity' THEN score END), 0),
    COALESCE(MAX(CASE WHEN quality_dimension = 'timeliness' THEN score END), 0)
  INTO 
    completeness_score, consistency_score, accuracy_score, validity_score, timeliness_score
  FROM quality_metrics_history
  WHERE tenant_id = p_tenant_id
    AND DATE(measured_at) = p_date;

  -- Calcular média ponderada (pesos podem ser customizados)
  result := (
    completeness_score * 0.25 +
    consistency_score * 0.30 +
    accuracy_score * 0.25 +
    validity_score * 0.15 +
    timeliness_score * 0.05
  );

  RETURN ROUND(result, 2);
END;
$$ LANGUAGE plpgsql;

-- Função para limpar dados expirados
CREATE OR REPLACE FUNCTION cleanup_expired_validation_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Limpar snapshots expirados
  DELETE FROM data_snapshots 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Limpar resultados de validação antigos (> 90 dias)
  DELETE FROM validation_results 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Limpar histórico de qualidade antigo (> 180 dias)
  DELETE FROM quality_metrics_history 
  WHERE measured_at < NOW() - INTERVAL '180 days';
  
  -- Limpar alertas resolvidos antigos (> 30 dias)
  DELETE FROM validation_alerts 
  WHERE resolved_at IS NOT NULL 
    AND resolved_at < NOW() - INTERVAL '30 days';
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para obter health check do sistema
CREATE OR REPLACE FUNCTION get_validation_system_health()
RETURNS JSON AS $$
DECLARE
  result JSON;
  total_validations INTEGER := 0;
  successful_validations INTEGER := 0;
  avg_execution_time DECIMAL(10,2) := 0;
  active_alerts INTEGER := 0;
  avg_quality_score DECIMAL(5,2) := 0;
BEGIN
  -- Estatísticas das últimas 24 horas
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE passed = TRUE),
    AVG(execution_time_ms),
    AVG(score)
  INTO 
    total_validations, successful_validations, avg_execution_time, avg_quality_score
  FROM validation_results
  WHERE created_at >= NOW() - INTERVAL '24 hours';
  
  -- Alertas ativos
  SELECT COUNT(*) 
  INTO active_alerts
  FROM validation_alerts
  WHERE acknowledged = FALSE AND resolved_at IS NULL;
  
  -- Construir resultado JSON
  result := json_build_object(
    'timestamp', NOW(),
    'system_status', CASE 
      WHEN avg_quality_score >= 90 AND active_alerts = 0 THEN 'HEALTHY'
      WHEN avg_quality_score >= 75 OR active_alerts <= 5 THEN 'DEGRADED'
      ELSE 'CRITICAL'
    END,
    'total_validations_24h', total_validations,
    'success_rate_pct', CASE 
      WHEN total_validations > 0 THEN ROUND((successful_validations::DECIMAL / total_validations) * 100, 2)
      ELSE 0
    END,
    'avg_execution_time_ms', ROUND(avg_execution_time, 2),
    'avg_quality_score', ROUND(avg_quality_score, 2),
    'active_alerts', active_alerts
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGERS PARA MANUTENÇÃO AUTOMÁTICA
-- ==========================================

-- Trigger para atualizar updated_at em validation_rules
CREATE OR REPLACE FUNCTION update_validation_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validation_rules_timestamp
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_timestamp();

-- Trigger para atualizar updated_at em tenant_quality_config
CREATE OR REPLACE FUNCTION update_tenant_quality_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tenant_quality_config_timestamp
  BEFORE UPDATE ON tenant_quality_config
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_quality_config_timestamp();

-- ==========================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ==========================================

COMMENT ON TABLE validation_results IS 'Resultados de validações executadas no sistema de métricas';
COMMENT ON TABLE validation_rules IS 'Configuração de regras de validação personalizáveis';
COMMENT ON TABLE quality_metrics_history IS 'Histórico de scores de qualidade por dimensão';
COMMENT ON TABLE data_snapshots IS 'Snapshots de dados para rollback em caso de falhas de validação';
COMMENT ON TABLE validation_alerts IS 'Alertas gerados pelo sistema de validação';
COMMENT ON TABLE validation_performance_stats IS 'Estatísticas de performance do sistema de validação';
COMMENT ON TABLE tenant_quality_config IS 'Configurações de qualidade customizadas por tenant';

COMMENT ON FUNCTION calculate_overall_quality_score IS 'Calcula score geral de qualidade baseado em todas as dimensões';
COMMENT ON FUNCTION cleanup_expired_validation_data IS 'Remove dados expirados do sistema de validação';
COMMENT ON FUNCTION get_validation_system_health IS 'Retorna status de saúde do sistema de validação';

-- Executar função de limpeza inicial
SELECT cleanup_expired_validation_data();