-- Migration: Create required RPCs for contextual policies system
-- Date: 2025-09-06  
-- Description: Creates get_user_context_complete and get_tenant_timezone RPCs

-- RPC 1: Complete user context for policy evaluation
CREATE OR REPLACE FUNCTION get_user_context_complete(
  p_tenant_id UUID,
  p_phone TEXT
)
RETURNS TABLE (
  user_id UUID,
  phone TEXT,
  total_appointments BIGINT,
  cancelled_count BIGINT,
  noshow_count BIGINT,
  last_appointment_start TIMESTAMPTZ,
  last_interaction_time TIMESTAMPTZ,
  is_new_user BOOLEAN,
  vip_status BOOLEAN
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.phone,
    COALESCE(stats.total, 0) as total_appointments,
    COALESCE(stats.cancelled, 0) as cancelled_count,
    COALESCE(stats.noshow, 0) as noshow_count,
    stats.last_start as last_appointment_start,
    ch.last_interaction as last_interaction_time,
    (COALESCE(stats.total, 0) = 0) as is_new_user,
    COALESCE(u.vip_status, false) as vip_status
  FROM users u
  LEFT JOIN (
    SELECT 
      user_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE status = 'no_show') as noshow,
      MAX(start_time) as last_start
    FROM appointments
    WHERE tenant_id = p_tenant_id
    GROUP BY user_id
  ) stats ON u.id = stats.user_id
  LEFT JOIN (
    SELECT 
      user_phone,
      MAX(created_at) as last_interaction
    FROM conversation_history  
    WHERE tenant_id = p_tenant_id
    GROUP BY user_phone
  ) ch ON u.phone = ch.user_phone
  WHERE u.tenant_id = p_tenant_id 
    AND u.phone = p_phone;
END;
$$;

-- RPC 2: Get tenant timezone 
CREATE OR REPLACE FUNCTION get_tenant_timezone(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_tz TEXT;
BEGIN
  SELECT timezone INTO tenant_tz 
  FROM tenants 
  WHERE id = p_tenant_id;
  
  RETURN COALESCE(tenant_tz, 'America/Sao_Paulo');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_context_complete(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_tenant_timezone(UUID) TO service_role;

-- Add comments
COMMENT ON FUNCTION get_user_context_complete(UUID, TEXT) IS 'Returns complete user context for contextual policies evaluation';
COMMENT ON FUNCTION get_tenant_timezone(UUID) IS 'Returns tenant timezone for accurate time policy evaluation';