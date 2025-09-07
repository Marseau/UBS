-- Migration: Create optimized user appointment stats function
-- Date: 2025-09-06
-- Description: Creates optimized PostgreSQL function for user appointment statistics

-- Função otimizada para estatísticas de agendamentos do usuário
CREATE OR REPLACE FUNCTION get_user_appointment_stats(
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  total BIGINT,
  cancelled BIGINT,
  noshow BIGINT,
  last_start TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
    COUNT(*) FILTER (WHERE status = 'no_show') as noshow,
    MAX(start_time) as last_start
  FROM appointments
  WHERE tenant_id = p_tenant_id 
    AND user_id = p_user_id;
END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION get_user_appointment_stats(UUID, UUID) IS 'Retorna estatísticas agregadas de agendamentos para um usuário específico - otimizado para performance';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_appointment_stats(UUID, UUID) TO service_role;