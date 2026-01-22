-- Atualiza funções de cálculo de completion para considerar LP processada
-- LP processada em campaign_documents conta como "documentação recebida"

-- Função por briefing_id (quando já existe briefing)
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

  -- LP processada - peso 3
  SELECT EXISTS (
    SELECT 1 FROM campaign_documents
    WHERE campaign_id = v_campaign_id AND doc_type = 'knowledge' AND is_active = true LIMIT 1
  ) INTO has_lp_docs;
  IF has_lp_docs THEN filled_fields := filled_fields + 3; END IF;

  -- Empresa - peso 2
  IF rec.company_name IS NOT NULL AND rec.company_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.company_history IS NOT NULL AND rec.company_history != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Produto/Servico - peso 3
  IF rec.product_service_name IS NOT NULL AND rec.product_service_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.product_service_description IS NOT NULL AND rec.product_service_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.price_range IS NOT NULL AND rec.price_range != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Diferencial - peso 6
  IF rec.main_differentiator IS NOT NULL AND rec.main_differentiator != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.why_choose_us IS NOT NULL AND rec.why_choose_us != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.competitors_names IS NOT NULL AND array_length(rec.competitors_names, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.competitor_weaknesses IS NOT NULL AND rec.competitor_weaknesses != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Cliente Ideal - peso 3
  IF rec.icp_description IS NOT NULL AND rec.icp_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_main_pain IS NOT NULL AND rec.icp_main_pain != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Provas Sociais - peso 2
  IF rec.success_cases IS NOT NULL AND array_length(rec.success_cases, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.results_metrics IS NOT NULL AND array_length(rec.results_metrics, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Tom de Voz e CTA - peso 2
  IF rec.tone_of_voice IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF rec.call_to_action IS NOT NULL AND rec.call_to_action != '' THEN filled_fields := filled_fields + 1; END IF;

  -- URLs - peso 1
  IF rec.landing_page_url IS NOT NULL AND rec.landing_page_url != '' THEN filled_fields := filled_fields + 1; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;

-- Função por campaign_id (para quando não existe briefing ainda)
CREATE OR REPLACE FUNCTION calculate_briefing_completion_by_campaign(p_campaign_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_fields INTEGER := 22;
  filled_fields INTEGER := 0;
  rec RECORD;
  has_lp_docs BOOLEAN := FALSE;
BEGIN
  SELECT * INTO rec FROM campaign_briefing WHERE campaign_id = p_campaign_id;

  -- LP processada - peso 3
  SELECT EXISTS (
    SELECT 1 FROM campaign_documents
    WHERE campaign_id = p_campaign_id AND doc_type = 'knowledge' AND is_active = true LIMIT 1
  ) INTO has_lp_docs;
  IF has_lp_docs THEN filled_fields := filled_fields + 3; END IF;

  -- Se não tem briefing, retorna só LP
  IF rec IS NULL THEN
    RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
  END IF;

  -- Empresa - peso 2
  IF rec.company_name IS NOT NULL AND rec.company_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.company_history IS NOT NULL AND rec.company_history != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Produto/Servico - peso 3
  IF rec.product_service_name IS NOT NULL AND rec.product_service_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.product_service_description IS NOT NULL AND rec.product_service_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.price_range IS NOT NULL AND rec.price_range != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Diferencial - peso 6
  IF rec.main_differentiator IS NOT NULL AND rec.main_differentiator != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.why_choose_us IS NOT NULL AND rec.why_choose_us != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.competitors_names IS NOT NULL AND array_length(rec.competitors_names, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.competitor_weaknesses IS NOT NULL AND rec.competitor_weaknesses != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Cliente Ideal - peso 3
  IF rec.icp_description IS NOT NULL AND rec.icp_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_main_pain IS NOT NULL AND rec.icp_main_pain != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Provas Sociais - peso 2
  IF rec.success_cases IS NOT NULL AND array_length(rec.success_cases, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.results_metrics IS NOT NULL AND array_length(rec.results_metrics, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Tom de Voz e CTA - peso 2
  IF rec.tone_of_voice IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF rec.call_to_action IS NOT NULL AND rec.call_to_action != '' THEN filled_fields := filled_fields + 1; END IF;

  -- URLs - peso 1
  IF rec.landing_page_url IS NOT NULL AND rec.landing_page_url != '' THEN filled_fields := filled_fields + 1; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;
