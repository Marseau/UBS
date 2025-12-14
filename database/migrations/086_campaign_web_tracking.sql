-- =====================================================
-- MIGRATION: Campaign Web Tracking & Analytics
-- Descrição: Sistema de tracking de sessões web, eventos (CTAs),
--            atribuição de leads e análise de funil por campanha
-- Data: 2025-12-14
-- =====================================================

-- =====================================================
-- TABELA: campaign_web_sessions
-- Guarda sessões web com UTM parameters e origem
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_web_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  source TEXT,          -- ex: seo, paid, social, direct, referral
  medium TEXT,          -- ex: organic, cpc, email, banner
  utm_campaign TEXT,    -- nome da campanha de marketing
  utm_content TEXT,     -- variação de conteúdo/CTA
  utm_term TEXT,        -- termo de pesquisa (SEO/SEM)
  landing_url TEXT,     -- URL completa de entrada
  referrer TEXT,        -- referrer HTTP
  user_agent TEXT,      -- user agent do browser
  ip_address INET,      -- IP do visitante (opcional, LGPD)
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_web_sessions_campaign ON campaign_web_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_source ON campaign_web_sessions(source);
CREATE INDEX IF NOT EXISTS idx_web_sessions_started_at ON campaign_web_sessions(started_at);

COMMENT ON TABLE campaign_web_sessions IS
'Sessões web de visitantes nas landing pages das campanhas. Captura UTM parameters e origem do tráfego.';

-- =====================================================
-- TABELA: campaign_web_events
-- Eventos de interação (CTA click, form submit, scroll, etc)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_web_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES campaign_web_sessions(session_id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,      -- cta_click | form_submit | whatsapp_open | scroll | pageview
  event_label TEXT,               -- CTA_ID/button_id (estável para análise)
  event_value NUMERIC,            -- valor opcional do evento
  url TEXT,                       -- URL onde ocorreu o evento
  element_text TEXT,              -- texto do elemento clicado
  element_class TEXT,             -- classe CSS do elemento
  element_id TEXT,                -- ID do elemento
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_web_events_session ON campaign_web_events(session_id);
CREATE INDEX IF NOT EXISTS idx_web_events_campaign ON campaign_web_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_web_events_type ON campaign_web_events(event_type);
CREATE INDEX IF NOT EXISTS idx_web_events_label ON campaign_web_events(event_label);
CREATE INDEX IF NOT EXISTS idx_web_events_occurred_at ON campaign_web_events(occurred_at);

COMMENT ON TABLE campaign_web_events IS
'Eventos de interação dos visitantes nas landing pages. Captura cliques em CTAs, submissões de form, aberturas de WhatsApp, etc.';

-- =====================================================
-- TABELA: campaign_lead_attribution
-- Amarração lead ↔ sessão (quando o lead se identifica)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_lead_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES aic_campaign_leads(id) ON DELETE CASCADE,
  session_id UUID REFERENCES campaign_web_sessions(session_id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  contact_channel TEXT,     -- wa | form | phone | dm | calendar
  lead_status TEXT,         -- qualified | disqualified | pending | contacted
  attribution_type TEXT,    -- first_touch | last_touch | multi_touch
  conversion_value NUMERIC, -- valor da conversão (opcional)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint para evitar duplicatas
  UNIQUE(lead_id, session_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lead_attribution_lead ON campaign_lead_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_session ON campaign_lead_attribution(session_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_campaign ON campaign_lead_attribution(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_status ON campaign_lead_attribution(lead_status);

COMMENT ON TABLE campaign_lead_attribution IS
'Atribuição de leads às sessões web. Conecta visitantes anônimos aos leads identificados.';

-- =====================================================
-- TABELA: campaign_costs
-- Custos por origem (opcional, para CPL/ROI)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  source TEXT NOT NULL,   -- seo | paid | social | direct | referral
  medium TEXT,            -- organic | cpc | email | banner
  cost_value NUMERIC NOT NULL DEFAULT 0,
  cost_currency TEXT DEFAULT 'BRL',
  cost_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,             -- notas sobre o custo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint para evitar duplicatas por dia/origem
  UNIQUE(campaign_id, source, medium, cost_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_campaign_costs_campaign ON campaign_costs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_costs_source ON campaign_costs(source);
CREATE INDEX IF NOT EXISTS idx_campaign_costs_date ON campaign_costs(cost_date);

COMMENT ON TABLE campaign_costs IS
'Custos de marketing por origem e data. Usado para calcular CPL (Custo por Lead) e ROI.';

-- =====================================================
-- VIEW: vw_funnel_seo
-- Funil SEO → CTA → Lead
-- =====================================================

CREATE OR REPLACE VIEW vw_funnel_seo AS
SELECT
  s.campaign_id,
  COUNT(DISTINCT s.session_id) FILTER (WHERE s.source = 'seo') AS seo_sessions,
  COUNT(DISTINCT e.event_id) FILTER (WHERE s.source = 'seo' AND e.event_type = 'cta_click') AS seo_cta_clicks,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE s.source = 'seo') AS seo_leads,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE s.source = 'seo' AND la.lead_status = 'qualified') AS seo_qualified_leads,

  -- Taxas de conversão
  ROUND(
    (COUNT(DISTINCT e.event_id) FILTER (WHERE s.source = 'seo' AND e.event_type = 'cta_click')::DECIMAL
    / NULLIF(COUNT(DISTINCT s.session_id) FILTER (WHERE s.source = 'seo'), 0) * 100),
  2) AS session_to_cta_rate,

  ROUND(
    (COUNT(DISTINCT la.lead_id) FILTER (WHERE s.source = 'seo')::DECIMAL
    / NULLIF(COUNT(DISTINCT e.event_id) FILTER (WHERE s.source = 'seo' AND e.event_type = 'cta_click'), 0) * 100),
  2) AS cta_to_lead_rate,

  ROUND(
    (COUNT(DISTINCT la.lead_id) FILTER (WHERE s.source = 'seo' AND la.lead_status = 'qualified')::DECIMAL
    / NULLIF(COUNT(DISTINCT la.lead_id) FILTER (WHERE s.source = 'seo'), 0) * 100),
  2) AS lead_to_qualified_rate

FROM campaign_web_sessions s
LEFT JOIN campaign_web_events e
  ON e.session_id = s.session_id AND e.campaign_id = s.campaign_id
LEFT JOIN campaign_lead_attribution la
  ON la.session_id = s.session_id AND la.campaign_id = s.campaign_id
GROUP BY s.campaign_id;

COMMENT ON VIEW vw_funnel_seo IS
'Funil de conversão SEO: Sessões → Cliques em CTA → Leads → Leads Qualificados. Apenas tráfego orgânico (source = seo).';

-- =====================================================
-- VIEW: vw_leads_by_source
-- Leads por origem de tráfego
-- =====================================================

CREATE OR REPLACE VIEW vw_leads_by_source AS
SELECT
  s.campaign_id,
  COALESCE(s.source, 'unknown') AS source,
  COUNT(DISTINCT s.session_id) AS sessions,
  COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click') AS cta_clicks,
  COUNT(DISTINCT la.lead_id) AS leads,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified') AS qualified_leads,

  -- Taxas de conversão
  ROUND(
    (COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click')::DECIMAL
    / NULLIF(COUNT(DISTINCT s.session_id), 0) * 100),
  2) AS session_to_cta_rate,

  ROUND(
    (COUNT(DISTINCT la.lead_id)::DECIMAL
    / NULLIF(COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click'), 0) * 100),
  2) AS cta_to_lead_rate,

  ROUND(
    (COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified')::DECIMAL
    / NULLIF(COUNT(DISTINCT la.lead_id), 0) * 100),
  2) AS lead_to_qualified_rate

FROM campaign_web_sessions s
LEFT JOIN campaign_web_events e
  ON e.session_id = s.session_id AND e.campaign_id = s.campaign_id
LEFT JOIN campaign_lead_attribution la
  ON la.session_id = s.session_id AND la.campaign_id = s.campaign_id
GROUP BY s.campaign_id, COALESCE(s.source, 'unknown');

COMMENT ON VIEW vw_leads_by_source IS
'Análise de leads por origem de tráfego (SEO, Paid, Social, Direct, etc) com taxas de conversão.';

-- =====================================================
-- VIEW: vw_cta_performance
-- Ranking de performance de CTAs
-- =====================================================

CREATE OR REPLACE VIEW vw_cta_performance AS
SELECT
  e.campaign_id,
  e.event_label AS cta_id,
  MIN(e.url) AS sample_url,
  MIN(e.element_text) AS cta_text,
  COUNT(*) FILTER (WHERE e.event_type = 'cta_click') AS cta_clicks,
  COUNT(DISTINCT e.session_id) AS unique_sessions,
  COUNT(DISTINCT la.lead_id) AS leads,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified') AS qualified_leads,

  -- Conversões
  ROUND(
    (COUNT(DISTINCT la.lead_id)::DECIMAL
    / NULLIF(COUNT(*) FILTER (WHERE e.event_type = 'cta_click'), 0) * 100),
  2) AS conv_lead_per_click,

  ROUND(
    (COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified')::DECIMAL
    / NULLIF(COUNT(*) FILTER (WHERE e.event_type = 'cta_click'), 0) * 100),
  2) AS conv_qualified_per_click,

  -- Origem principal deste CTA
  MODE() WITHIN GROUP (ORDER BY s.source) AS top_source

FROM campaign_web_events e
LEFT JOIN campaign_web_sessions s
  ON s.session_id = e.session_id AND s.campaign_id = e.campaign_id
LEFT JOIN campaign_lead_attribution la
  ON la.session_id = e.session_id AND la.campaign_id = e.campaign_id
WHERE e.event_type = 'cta_click'
GROUP BY e.campaign_id, e.event_label;

COMMENT ON VIEW vw_cta_performance IS
'Performance de cada CTA: cliques, leads gerados, conversões e origem principal do tráfego.';

-- =====================================================
-- VIEW: vw_cost_per_source
-- Custo e CPL por origem
-- =====================================================

CREATE OR REPLACE VIEW vw_cost_per_source AS
SELECT
  c.campaign_id,
  c.source,
  c.medium,
  SUM(c.cost_value) AS cost_total,
  COUNT(DISTINCT la.lead_id) AS leads,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified') AS qualified_leads,

  -- CPL (Custo por Lead)
  ROUND(
    (SUM(c.cost_value) / NULLIF(COUNT(DISTINCT la.lead_id), 0)),
  2) AS cpl,

  -- CPL Qualificado
  ROUND(
    (SUM(c.cost_value) / NULLIF(COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified'), 0)),
  2) AS cpl_qualified,

  -- Custo médio diário
  ROUND(
    (SUM(c.cost_value) / NULLIF(COUNT(DISTINCT c.cost_date), 0)),
  2) AS avg_daily_cost

FROM campaign_costs c
LEFT JOIN campaign_web_sessions s
  ON s.campaign_id = c.campaign_id
  AND s.source = c.source
  AND (c.medium IS NULL OR s.medium = c.medium)
LEFT JOIN campaign_lead_attribution la
  ON la.session_id = s.session_id AND la.campaign_id = s.campaign_id
GROUP BY c.campaign_id, c.source, c.medium;

COMMENT ON VIEW vw_cost_per_source IS
'Custo total, CPL (Custo por Lead) e CPL Qualificado por origem de tráfego.';

-- =====================================================
-- VIEW: vw_campaign_overview
-- Overview completo da campanha
-- =====================================================

CREATE OR REPLACE VIEW vw_campaign_overview AS
SELECT
  c.id AS campaign_id,
  c.campaign_name,
  c.status AS campaign_status,

  -- Métricas de sessão
  COUNT(DISTINCT s.session_id) AS total_sessions,
  COUNT(DISTINCT s.session_id) FILTER (WHERE s.started_at >= NOW() - INTERVAL '7 days') AS sessions_7d,
  COUNT(DISTINCT s.session_id) FILTER (WHERE s.started_at >= NOW() - INTERVAL '30 days') AS sessions_30d,

  -- Métricas de eventos
  COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click') AS total_cta_clicks,
  COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click' AND e.occurred_at >= NOW() - INTERVAL '7 days') AS cta_clicks_7d,

  -- Métricas de leads
  COUNT(DISTINCT la.lead_id) AS total_leads,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE la.created_at >= NOW() - INTERVAL '7 days') AS leads_7d,
  COUNT(DISTINCT la.lead_id) FILTER (WHERE la.lead_status = 'qualified') AS qualified_leads,

  -- Taxas de conversão globais
  ROUND(
    (COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click')::DECIMAL
    / NULLIF(COUNT(DISTINCT s.session_id), 0) * 100),
  2) AS session_to_cta_rate,

  ROUND(
    (COUNT(DISTINCT la.lead_id)::DECIMAL
    / NULLIF(COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'cta_click'), 0) * 100),
  2) AS cta_to_lead_rate,

  -- Top source
  MODE() WITHIN GROUP (ORDER BY s.source) AS top_traffic_source,

  -- Datas
  MIN(s.started_at) AS first_session_at,
  MAX(s.started_at) AS last_session_at

FROM cluster_campaigns c
LEFT JOIN campaign_web_sessions s ON s.campaign_id = c.id
LEFT JOIN campaign_web_events e ON e.campaign_id = c.id
LEFT JOIN campaign_lead_attribution la ON la.campaign_id = c.id
GROUP BY c.id, c.campaign_name, c.status;

COMMENT ON VIEW vw_campaign_overview IS
'Overview executivo de cada campanha com métricas de sessão, eventos, leads e conversões.';

-- =====================================================
-- PERMISSÕES
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_web_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_web_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_lead_attribution TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_costs TO service_role;

GRANT SELECT ON vw_funnel_seo TO service_role;
GRANT SELECT ON vw_leads_by_source TO service_role;
GRANT SELECT ON vw_cta_performance TO service_role;
GRANT SELECT ON vw_cost_per_source TO service_role;
GRANT SELECT ON vw_campaign_overview TO service_role;

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_web_sessions_updated_at
  BEFORE UPDATE ON campaign_web_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_lead_attribution_updated_at
  BEFORE UPDATE ON campaign_lead_attribution
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_costs_updated_at
  BEFORE UPDATE ON campaign_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMENTÁRIOS FINAIS
-- =====================================================

COMMENT ON SCHEMA public IS
'Migration 086: Sistema completo de tracking web, eventos, atribuição de leads e analytics por campanha.';
