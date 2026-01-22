-- LP processada = 50% do briefing completo
-- LP é obrigatória e contém a maioria do contexto necessário

CREATE OR REPLACE FUNCTION calculate_briefing_completion_by_campaign(p_campaign_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_fields INTEGER := 22;
  filled_fields INTEGER := 0;
  rec RECORD;
  has_lp_docs BOOLEAN := FALSE;
BEGIN
  SELECT * INTO rec FROM campaign_briefing WHERE campaign_id = p_campaign_id;

  -- LP processada = 50% (11 pontos)
  SELECT EXISTS (
    SELECT 1 FROM campaign_documents
    WHERE campaign_id = p_campaign_id AND doc_type = 'knowledge' AND is_active = true LIMIT 1
  ) INTO has_lp_docs;
  IF has_lp_docs THEN filled_fields := filled_fields + 11; END IF;

  -- Se não tem briefing, retorna só LP (50%)
  IF rec IS NULL THEN
    RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
  END IF;

  -- Campos do briefing = 50% (11 pontos)
  -- Empresa - 2 pontos
  IF rec.company_name IS NOT NULL AND rec.company_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.company_history IS NOT NULL AND rec.company_history != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Diferencial - 4 pontos (mais importante)
  IF rec.main_differentiator IS NOT NULL AND rec.main_differentiator != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.why_choose_us IS NOT NULL AND rec.why_choose_us != '' THEN filled_fields := filled_fields + 2; END IF;

  -- Cliente Ideal - 3 pontos
  IF rec.icp_description IS NOT NULL AND rec.icp_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_main_pain IS NOT NULL AND rec.icp_main_pain != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- CTA - 2 pontos
  IF rec.call_to_action IS NOT NULL AND rec.call_to_action != '' THEN filled_fields := filled_fields + 2; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_briefing_completion(p_briefing_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_fields INTEGER := 22;
  filled_fields INTEGER := 0;
  rec RECORD;
  v_campaign_id UUID;
  has_lp_docs BOOLEAN := FALSE;
BEGIN
  SELECT * INTO rec FROM campaign_briefing WHERE id = p_briefing_id;
  IF rec IS NULL THEN RETURN 0; END IF;

  v_campaign_id := rec.campaign_id;

  -- LP processada = 50% (11 pontos)
  SELECT EXISTS (
    SELECT 1 FROM campaign_documents
    WHERE campaign_id = v_campaign_id AND doc_type = 'knowledge' AND is_active = true LIMIT 1
  ) INTO has_lp_docs;
  IF has_lp_docs THEN filled_fields := filled_fields + 11; END IF;

  -- Campos do briefing = 50% (11 pontos)
  -- Empresa - 2 pontos
  IF rec.company_name IS NOT NULL AND rec.company_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.company_history IS NOT NULL AND rec.company_history != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Diferencial - 4 pontos
  IF rec.main_differentiator IS NOT NULL AND rec.main_differentiator != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.why_choose_us IS NOT NULL AND rec.why_choose_us != '' THEN filled_fields := filled_fields + 2; END IF;

  -- Cliente Ideal - 3 pontos
  IF rec.icp_description IS NOT NULL AND rec.icp_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_main_pain IS NOT NULL AND rec.icp_main_pain != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- CTA - 2 pontos
  IF rec.call_to_action IS NOT NULL AND rec.call_to_action != '' THEN filled_fields := filled_fields + 2; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;
