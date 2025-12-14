-- =====================================================
-- MIGRATION: Instagram DM Inbound Leads
-- Descrição: Função para registrar leads que enviam DM orgânico
-- Data: 2025-12-14
-- =====================================================

-- =====================================================
-- FUNÇÃO: register_instagram_dm_lead
-- Registra ou atualiza lead que enviou DM no Instagram
-- =====================================================

CREATE OR REPLACE FUNCTION register_instagram_dm_lead(
  p_campaign_id UUID,
  p_username VARCHAR,
  p_user_id VARCHAR,
  p_source VARCHAR,
  p_message_text TEXT
)
RETURNS TABLE (
  id UUID,
  is_new BOOLEAN,
  source VARCHAR
) AS $$
DECLARE
  v_lead_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_existing_lead RECORD;
BEGIN
  -- Buscar lead existente
  SELECT * INTO v_existing_lead
  FROM aic_campaign_leads
  WHERE campaign_id = p_campaign_id
    AND instagram_username = p_username;

  IF v_existing_lead.id IS NULL THEN
    -- Lead não existe - criar novo (orgânico)
    INSERT INTO aic_campaign_leads (
      campaign_id,
      instagram_username,
      instagram_user_id,
      source,
      inbound_source,
      dm_status,
      instagram_dm_status,
      contact_attempts,
      created_at,
      updated_at
    ) VALUES (
      p_campaign_id,
      p_username,
      p_user_id,
      p_source,
      'instagram_dm_organic',
      'replied', -- Lead já respondeu
      'received',
      0,
      NOW(),
      NOW()
    )
    RETURNING aic_campaign_leads.id INTO v_lead_id;

    v_is_new := TRUE;

    -- Log de lead orgânico
    RAISE NOTICE 'ORGANIC LEAD: @% enviou DM para campanha %', p_username, p_campaign_id;

  ELSE
    -- Lead existe - atualizar
    v_lead_id := v_existing_lead.id;

    UPDATE aic_campaign_leads
    SET
      instagram_user_id = COALESCE(instagram_user_id, p_user_id),
      dm_status = 'replied',
      instagram_dm_status = 'received',
      updated_at = NOW(),
      -- Se era 'not_contacted', atualizar source para inbound
      source = CASE
        WHEN dm_status = 'not_contacted' THEN 'instagram_dm_inbound'
        ELSE source
      END,
      inbound_source = CASE
        WHEN inbound_source IS NULL THEN 'instagram_dm_reply'
        ELSE inbound_source
      END
    WHERE id = v_lead_id;

    RAISE NOTICE 'EXISTING LEAD: @% replied to campanha %', p_username, p_campaign_id;
  END IF;

  -- Retornar informações do lead
  RETURN QUERY
  SELECT
    v_lead_id,
    v_is_new,
    p_source;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON FUNCTION register_instagram_dm_lead IS
'Registra lead que enviou DM orgânico no Instagram.
Se lead não existe = cria como orgânico (source: instagram_dm_inbound).
Se lead existe = atualiza status para replied.
Retorna: id do lead, se é novo, e source usado.';

-- =====================================================
-- PERMISSÕES
-- =====================================================

GRANT EXECUTE ON FUNCTION register_instagram_dm_lead TO service_role;
