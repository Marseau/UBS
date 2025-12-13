-- =====================================================
-- MIGRATION: Campaign Briefing - Contexto para IA
-- Descricao: Armazena o briefing do cliente para personalizar
--            mensagens do agente de IA (similar ao doc AIC)
-- Data: 2025-12-12
-- =====================================================

-- =====================================================
-- TABELA: campaign_briefing
-- Armazena briefing estruturado para cada campanha
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_briefing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- =====================================================
  -- SECAO 1: SOBRE A EMPRESA
  -- =====================================================
  company_name VARCHAR(255),
  company_history TEXT,
  company_mission TEXT,
  years_in_market INTEGER,
  team_size VARCHAR(100),
  location_city VARCHAR(100),
  location_state VARCHAR(50),

  -- =====================================================
  -- SECAO 2: PRODUTO/SERVICO
  -- =====================================================
  product_service_name VARCHAR(255),
  product_service_description TEXT,
  product_service_type VARCHAR(50) CHECK (product_service_type IN (
    'produto_fisico',
    'produto_digital',
    'servico_presencial',
    'servico_online',
    'servico_hibrido',
    'consultoria',
    'curso_formacao',
    'assinatura',
    'outro'
  )),
  price_range VARCHAR(100),
  price_model VARCHAR(100),
  delivery_method TEXT,
  delivery_time VARCHAR(100),

  -- =====================================================
  -- SECAO 3: DIFERENCIAL COMPETITIVO (FOCO PRINCIPAL)
  -- =====================================================
  main_differentiator TEXT NOT NULL,
  secondary_differentiators TEXT[],
  competitors_names TEXT[],
  competitor_weaknesses TEXT,
  why_choose_us TEXT,
  unique_methodology TEXT,
  exclusive_technology TEXT,
  certifications TEXT[],
  awards TEXT[],

  -- =====================================================
  -- SECAO 4: CLIENTE IDEAL (ICP)
  -- =====================================================
  icp_description TEXT,
  icp_demographics TEXT,
  icp_job_titles TEXT[],
  icp_industries TEXT[],
  icp_company_size VARCHAR(100),
  icp_main_pain TEXT,
  icp_secondary_pains TEXT[],
  icp_desires TEXT[],
  icp_objections TEXT[],
  icp_decision_factors TEXT[],

  -- =====================================================
  -- SECAO 5: PROVAS SOCIAIS
  -- =====================================================
  client_count VARCHAR(100),
  success_cases TEXT[],
  testimonials TEXT[],
  results_metrics TEXT[],
  media_mentions TEXT[],
  partnerships TEXT[],
  guarantees TEXT,

  -- =====================================================
  -- SECAO 6: TOM DE VOZ E COMUNICACAO
  -- =====================================================
  tone_of_voice VARCHAR(50) CHECK (tone_of_voice IN (
    'formal',
    'informal',
    'tecnico',
    'consultivo',
    'amigavel',
    'autoridade',
    'inspirador',
    'educativo'
  )),
  communication_style TEXT,
  words_to_use TEXT[],
  words_to_avoid TEXT[],
  key_messages TEXT[],
  call_to_action TEXT,

  -- =====================================================
  -- SECAO 7: RECURSOS EXTERNOS
  -- =====================================================
  landing_page_url TEXT,
  landing_page_content TEXT,
  website_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  youtube_url TEXT,
  portfolio_url TEXT,
  media_kit_url TEXT,

  -- =====================================================
  -- METADADOS
  -- =====================================================
  briefing_status VARCHAR(30) DEFAULT 'draft' CHECK (briefing_status IN (
    'draft',
    'in_progress',
    'completed',
    'approved'
  )),
  completion_percentage INTEGER DEFAULT 0,
  last_section_edited VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,

  -- Constraint de unicidade: uma campanha = um briefing
  CONSTRAINT unique_campaign_briefing UNIQUE (campaign_id)
);

-- =====================================================
-- INDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_campaign_briefing_campaign_id
  ON campaign_briefing(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_briefing_status
  ON campaign_briefing(briefing_status);

-- =====================================================
-- TRIGGER: Atualizar updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_campaign_briefing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_campaign_briefing_updated_at ON campaign_briefing;
CREATE TRIGGER trigger_campaign_briefing_updated_at
  BEFORE UPDATE ON campaign_briefing
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_briefing_updated_at();

-- =====================================================
-- FUNCAO: Calcular percentual de preenchimento
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_briefing_completion(p_briefing_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_fields INTEGER := 0;
  filled_fields INTEGER := 0;
  rec RECORD;
BEGIN
  SELECT * INTO rec FROM campaign_briefing WHERE id = p_briefing_id;

  IF rec IS NULL THEN
    RETURN 0;
  END IF;

  -- Campos obrigatorios (peso maior)
  -- Secao 1: Empresa
  total_fields := total_fields + 2;
  IF rec.company_name IS NOT NULL AND rec.company_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.company_history IS NOT NULL AND rec.company_history != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 2: Produto/Servico
  total_fields := total_fields + 3;
  IF rec.product_service_name IS NOT NULL AND rec.product_service_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.product_service_description IS NOT NULL AND rec.product_service_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.price_range IS NOT NULL AND rec.price_range != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 3: Diferencial (MAIS IMPORTANTE - peso dobrado)
  total_fields := total_fields + 6;
  IF rec.main_differentiator IS NOT NULL AND rec.main_differentiator != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.why_choose_us IS NOT NULL AND rec.why_choose_us != '' THEN filled_fields := filled_fields + 2; END IF;
  IF rec.competitors_names IS NOT NULL AND array_length(rec.competitors_names, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.competitor_weaknesses IS NOT NULL AND rec.competitor_weaknesses != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 4: Cliente Ideal
  total_fields := total_fields + 3;
  IF rec.icp_description IS NOT NULL AND rec.icp_description != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_main_pain IS NOT NULL AND rec.icp_main_pain != '' THEN filled_fields := filled_fields + 1; END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 5: Provas Sociais
  total_fields := total_fields + 2;
  IF rec.success_cases IS NOT NULL AND array_length(rec.success_cases, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF rec.results_metrics IS NOT NULL AND array_length(rec.results_metrics, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 6: Tom de Voz
  total_fields := total_fields + 2;
  IF rec.tone_of_voice IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF rec.call_to_action IS NOT NULL AND rec.call_to_action != '' THEN filled_fields := filled_fields + 1; END IF;

  -- Secao 7: URLs
  total_fields := total_fields + 1;
  IF rec.landing_page_url IS NOT NULL AND rec.landing_page_url != '' THEN filled_fields := filled_fields + 1; END IF;

  RETURN ROUND((filled_fields::DECIMAL / total_fields::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Gerar contexto para agente de IA
-- Retorna um texto formatado com todo o briefing
-- =====================================================
CREATE OR REPLACE FUNCTION get_briefing_context_for_ai(p_campaign_id UUID)
RETURNS TEXT AS $$
DECLARE
  rec RECORD;
  context TEXT := '';
BEGIN
  SELECT * INTO rec FROM campaign_briefing WHERE campaign_id = p_campaign_id;

  IF rec IS NULL THEN
    RETURN 'Briefing nao encontrado para esta campanha.';
  END IF;

  -- Construir contexto estruturado
  context := '=== BRIEFING DA CAMPANHA ===' || E'\n\n';

  -- Empresa
  context := context || '## SOBRE A EMPRESA' || E'\n';
  IF rec.company_name IS NOT NULL THEN
    context := context || 'Empresa: ' || rec.company_name || E'\n';
  END IF;
  IF rec.company_history IS NOT NULL THEN
    context := context || 'Historia: ' || rec.company_history || E'\n';
  END IF;
  IF rec.years_in_market IS NOT NULL THEN
    context := context || 'Anos no mercado: ' || rec.years_in_market || E'\n';
  END IF;
  IF rec.location_city IS NOT NULL THEN
    context := context || 'Localizacao: ' || rec.location_city || COALESCE('/' || rec.location_state, '') || E'\n';
  END IF;

  -- Produto/Servico
  context := context || E'\n' || '## PRODUTO/SERVICO' || E'\n';
  IF rec.product_service_name IS NOT NULL THEN
    context := context || 'Nome: ' || rec.product_service_name || E'\n';
  END IF;
  IF rec.product_service_description IS NOT NULL THEN
    context := context || 'Descricao: ' || rec.product_service_description || E'\n';
  END IF;
  IF rec.price_range IS NOT NULL THEN
    context := context || 'Faixa de preco: ' || rec.price_range || E'\n';
  END IF;
  IF rec.delivery_method IS NOT NULL THEN
    context := context || 'Entrega: ' || rec.delivery_method || E'\n';
  END IF;

  -- DIFERENCIAL (mais detalhado)
  context := context || E'\n' || '## DIFERENCIAL COMPETITIVO (IMPORTANTE!)' || E'\n';
  IF rec.main_differentiator IS NOT NULL THEN
    context := context || 'Principal diferencial: ' || rec.main_differentiator || E'\n';
  END IF;
  IF rec.why_choose_us IS NOT NULL THEN
    context := context || 'Por que nos escolher: ' || rec.why_choose_us || E'\n';
  END IF;
  IF rec.unique_methodology IS NOT NULL THEN
    context := context || 'Metodologia exclusiva: ' || rec.unique_methodology || E'\n';
  END IF;
  IF rec.competitors_names IS NOT NULL AND array_length(rec.competitors_names, 1) > 0 THEN
    context := context || 'Concorrentes conhecidos: ' || array_to_string(rec.competitors_names, ', ') || E'\n';
  END IF;
  IF rec.competitor_weaknesses IS NOT NULL THEN
    context := context || 'Pontos fracos dos concorrentes: ' || rec.competitor_weaknesses || E'\n';
  END IF;

  -- Cliente Ideal
  context := context || E'\n' || '## CLIENTE IDEAL' || E'\n';
  IF rec.icp_description IS NOT NULL THEN
    context := context || 'Descricao: ' || rec.icp_description || E'\n';
  END IF;
  IF rec.icp_main_pain IS NOT NULL THEN
    context := context || 'Principal dor: ' || rec.icp_main_pain || E'\n';
  END IF;
  IF rec.icp_objections IS NOT NULL AND array_length(rec.icp_objections, 1) > 0 THEN
    context := context || 'Objecoes comuns: ' || array_to_string(rec.icp_objections, '; ') || E'\n';
  END IF;

  -- Provas Sociais
  context := context || E'\n' || '## PROVAS SOCIAIS' || E'\n';
  IF rec.client_count IS NOT NULL THEN
    context := context || 'Numero de clientes: ' || rec.client_count || E'\n';
  END IF;
  IF rec.success_cases IS NOT NULL AND array_length(rec.success_cases, 1) > 0 THEN
    context := context || 'Cases de sucesso: ' || array_to_string(rec.success_cases, '; ') || E'\n';
  END IF;
  IF rec.results_metrics IS NOT NULL AND array_length(rec.results_metrics, 1) > 0 THEN
    context := context || 'Resultados: ' || array_to_string(rec.results_metrics, '; ') || E'\n';
  END IF;
  IF rec.guarantees IS NOT NULL THEN
    context := context || 'Garantias: ' || rec.guarantees || E'\n';
  END IF;

  -- Tom de Voz
  context := context || E'\n' || '## TOM DE VOZ' || E'\n';
  IF rec.tone_of_voice IS NOT NULL THEN
    context := context || 'Tom: ' || rec.tone_of_voice || E'\n';
  END IF;
  IF rec.communication_style IS NOT NULL THEN
    context := context || 'Estilo: ' || rec.communication_style || E'\n';
  END IF;
  IF rec.words_to_avoid IS NOT NULL AND array_length(rec.words_to_avoid, 1) > 0 THEN
    context := context || 'EVITAR palavras: ' || array_to_string(rec.words_to_avoid, ', ') || E'\n';
  END IF;
  IF rec.key_messages IS NOT NULL AND array_length(rec.key_messages, 1) > 0 THEN
    context := context || 'Mensagens-chave: ' || array_to_string(rec.key_messages, '; ') || E'\n';
  END IF;
  IF rec.call_to_action IS NOT NULL THEN
    context := context || 'CTA principal: ' || rec.call_to_action || E'\n';
  END IF;

  RETURN context;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE campaign_briefing IS 'Briefing estruturado do cliente para personalizar mensagens do agente de IA';
COMMENT ON COLUMN campaign_briefing.main_differentiator IS 'Principal diferencial competitivo - campo obrigatorio e mais importante';
COMMENT ON COLUMN campaign_briefing.why_choose_us IS 'Resposta direta para "Por que o cliente deve escolher voce?"';
COMMENT ON COLUMN campaign_briefing.competitor_weaknesses IS 'Pontos fracos dos concorrentes que podemos explorar';
COMMENT ON FUNCTION get_briefing_context_for_ai IS 'Gera texto formatado do briefing para uso pelo agente de IA';
