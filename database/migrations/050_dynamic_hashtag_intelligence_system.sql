-- Migration 050: Dynamic Hashtag Intelligence System 2.0
-- Sistema inteligente, dinâmico e retroalimentado para análise de hashtags
-- Substitui clusters hardcoded por sistema auto-evolutivo com análise comportamental

-- =====================================================================
-- 1. TABELA: Clusters Dinâmicos Auto-gerados
-- =====================================================================
CREATE TABLE hashtag_clusters_dynamic (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificação do cluster
  cluster_key TEXT UNIQUE NOT NULL,
  cluster_name TEXT NOT NULL,
  cluster_description TEXT,

  -- Hashtags pertencentes ao cluster
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashtag_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(hashtags)) STORED,

  -- Métricas de qualidade do cluster
  cohesion_score NUMERIC(4, 3) CHECK (cohesion_score >= 0 AND cohesion_score <= 1),  -- Coesão interna
  separation_score NUMERIC(4, 3) CHECK (separation_score >= 0 AND separation_score <= 1),  -- Separação de outros clusters
  silhouette_score NUMERIC(4, 3) CHECK (silhouette_score >= -1 AND silhouette_score <= 1),  -- Score do algoritmo

  -- Performance do cluster
  total_leads INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5, 2) DEFAULT 0,
  avg_contact_rate NUMERIC(4, 3) DEFAULT 0,
  priority_score INTEGER CHECK (priority_score >= 0 AND priority_score <= 100),

  -- Metadata de geração
  algorithm_used TEXT NOT NULL,  -- 'kmeans', 'dbscan', 'hierarchical', 'gpt4-semantic'
  generated_at TIMESTAMP DEFAULT NOW(),
  last_analyzed_at TIMESTAMP,
  data_points_analyzed INTEGER,

  -- Status do cluster
  is_active BOOLEAN DEFAULT true,
  is_validated BOOLEAN DEFAULT false,  -- Aprovado manualmente
  validation_date TIMESTAMP,

  -- Versioning
  version INTEGER DEFAULT 1,
  supersedes_cluster_id UUID REFERENCES hashtag_clusters_dynamic(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_clusters_active ON hashtag_clusters_dynamic(is_active, priority_score DESC);
CREATE INDEX idx_clusters_performance ON hashtag_clusters_dynamic(conversion_rate DESC, total_leads DESC);
CREATE INDEX idx_clusters_generated_at ON hashtag_clusters_dynamic(generated_at DESC);
CREATE INDEX idx_clusters_hashtags ON hashtag_clusters_dynamic USING GIN(hashtags);

-- =====================================================================
-- 2. TABELA: Análise Comportamental por Cluster (GPT-4)
-- =====================================================================
CREATE TABLE cluster_behavioral_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES hashtag_clusters_dynamic(id) ON DELETE CASCADE,

  -- 🔥 Pain Points Identificados
  pain_points JSONB DEFAULT '[]'::jsonb,  -- Array de strings com dores
  pain_intensity TEXT CHECK (pain_intensity IN ('baixa', 'média', 'alta', 'crítica')),

  -- 📈 Tendências Emergentes
  emerging_trends JSONB DEFAULT '[]'::jsonb,  -- Array de tendências detectadas
  trend_direction TEXT CHECK (trend_direction IN ('crescente', 'estável', 'decrescente')),
  trend_velocity NUMERIC(5, 2),  -- % crescimento mensal

  -- 🧠 Perfil Psicográfico
  audience_awareness_level TEXT CHECK (audience_awareness_level IN (
    'inconsciente',  -- Não sabe que tem o problema
    'consciente_problema',  -- Sabe do problema mas não da solução
    'consciente_solucao',  -- Conhece soluções disponíveis
    'pronto_compra'  -- Pronto para tomar decisão
  )),
  buying_stage TEXT CHECK (buying_stage IN ('descoberta', 'consideração', 'decisão', 'pós-compra')),
  communication_tone TEXT,  -- 'aspiracional', 'técnico', 'emocional', 'educacional'

  -- 💡 Recomendações de Abordagem
  approach_recommendations JSONB DEFAULT '[]'::jsonb,
  mental_triggers JSONB DEFAULT '[]'::jsonb,  -- ['escassez', 'autoridade', 'prova social']
  common_objections JSONB DEFAULT '[]'::jsonb,  -- ['preço', 'tempo', 'complexidade']

  -- 🎯 Oportunidades de Mercado
  market_gaps JSONB DEFAULT '[]'::jsonb,  -- Necessidades não atendidas
  underserved_niches JSONB DEFAULT '[]'::jsonb,  -- Sub-nichos promissores
  opportunity_score INTEGER CHECK (opportunity_score >= 0 AND opportunity_score <= 100),

  -- 📊 Metadata de Análise
  analyzed_by_model TEXT DEFAULT 'gpt-4',
  analysis_prompt TEXT,
  analysis_cost_usd NUMERIC(10, 6) DEFAULT 0,
  confidence_score NUMERIC(4, 3) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  analyzed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(cluster_id)  -- Um insight por cluster
);

-- Índices
CREATE INDEX idx_insights_cluster ON cluster_behavioral_insights(cluster_id);
CREATE INDEX idx_insights_opportunity ON cluster_behavioral_insights(opportunity_score DESC);
CREATE INDEX idx_insights_awareness ON cluster_behavioral_insights(audience_awareness_level);

-- =====================================================================
-- 3. TABELA: Métricas de Performance por Cluster
-- =====================================================================
CREATE TABLE cluster_performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES hashtag_clusters_dynamic(id) ON DELETE CASCADE,

  -- Período de medição
  measurement_period TEXT NOT NULL CHECK (measurement_period IN ('7d', '30d', '90d', 'all_time')),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,

  -- Métricas de leads
  leads_generated INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5, 2) DEFAULT 0,

  -- Métricas de engajamento
  avg_engagement_rate NUMERIC(5, 2) DEFAULT 0,
  avg_contact_quality NUMERIC(4, 3) DEFAULT 0,

  -- ROI estimado
  estimated_revenue_brl NUMERIC(12, 2) DEFAULT 0,
  cost_per_lead_brl NUMERIC(8, 2) DEFAULT 0,
  roi_percentage NUMERIC(6, 2) DEFAULT 0,

  -- Performance relativa
  percentile_rank INTEGER CHECK (percentile_rank >= 0 AND percentile_rank <= 100),  -- Ranking entre clusters
  trend_vs_previous_period TEXT CHECK (trend_vs_previous_period IN ('improving', 'stable', 'declining')),

  calculated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(cluster_id, measurement_period, period_start)
);

-- Índices
CREATE INDEX idx_perf_cluster_period ON cluster_performance_metrics(cluster_id, measurement_period);
CREATE INDEX idx_perf_conversion ON cluster_performance_metrics(conversion_rate DESC);
CREATE INDEX idx_perf_roi ON cluster_performance_metrics(roi_percentage DESC);

-- =====================================================================
-- 4. TABELA: Tendências de Hashtags (Detecção de Crescimento)
-- =====================================================================
CREATE TABLE hashtag_trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hashtag
  hashtag TEXT NOT NULL,
  cluster_id UUID REFERENCES hashtag_clusters_dynamic(id) ON DELETE SET NULL,

  -- Métricas de tendência
  current_frequency INTEGER NOT NULL,
  previous_frequency INTEGER NOT NULL,
  growth_rate NUMERIC(6, 2) NOT NULL,  -- % de crescimento

  -- Classificação da tendência
  trend_type TEXT CHECK (trend_type IN ('emergente', 'crescente', 'viral', 'estável', 'decrescente', 'morta')),
  velocity TEXT CHECK (velocity IN ('muito_rapida', 'rapida', 'moderada', 'lenta')),

  -- Metadata
  detected_at TIMESTAMP DEFAULT NOW(),
  period_analyzed TEXT NOT NULL,  -- '7d', '30d', '90d'

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(hashtag, period_analyzed, detected_at)
);

-- Índices
CREATE INDEX idx_trends_growth ON hashtag_trends(growth_rate DESC);
CREATE INDEX idx_trends_type ON hashtag_trends(trend_type);
CREATE INDEX idx_trends_hashtag ON hashtag_trends(hashtag);
CREATE INDEX idx_trends_cluster ON hashtag_trends(cluster_id);

-- =====================================================================
-- 5. FUNÇÕES AUXILIARES
-- =====================================================================

-- Função: Calcular score de oportunidade de um cluster
CREATE OR REPLACE FUNCTION calculate_cluster_opportunity_score(
  p_cluster_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_conversion_rate NUMERIC;
  v_trend_velocity NUMERIC;
  v_pain_intensity TEXT;
  v_awareness_level TEXT;
BEGIN
  -- Buscar métricas
  SELECT
    hcd.conversion_rate,
    cbi.trend_velocity,
    cbi.pain_intensity,
    cbi.audience_awareness_level
  INTO
    v_conversion_rate,
    v_trend_velocity,
    v_pain_intensity,
    v_awareness_level
  FROM hashtag_clusters_dynamic hcd
  LEFT JOIN cluster_behavioral_insights cbi ON cbi.cluster_id = hcd.id
  WHERE hcd.id = p_cluster_id;

  -- Calcular score (0-100)

  -- 1. Taxa de conversão (30 pontos)
  v_score := v_score + LEAST(30, ROUND(v_conversion_rate * 0.3));

  -- 2. Velocidade de tendência (25 pontos)
  IF v_trend_velocity IS NOT NULL THEN
    v_score := v_score + LEAST(25, ROUND(v_trend_velocity * 0.5));
  END IF;

  -- 3. Intensidade da dor (25 pontos)
  CASE v_pain_intensity
    WHEN 'crítica' THEN v_score := v_score + 25;
    WHEN 'alta' THEN v_score := v_score + 20;
    WHEN 'média' THEN v_score := v_score + 12;
    WHEN 'baixa' THEN v_score := v_score + 5;
    ELSE NULL;
  END CASE;

  -- 4. Nível de consciência (20 pontos)
  CASE v_awareness_level
    WHEN 'pronto_compra' THEN v_score := v_score + 20;
    WHEN 'consciente_solucao' THEN v_score := v_score + 15;
    WHEN 'consciente_problema' THEN v_score := v_score + 10;
    WHEN 'inconsciente' THEN v_score := v_score + 3;
    ELSE NULL;
  END CASE;

  -- Limitar entre 0-100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Função: Atualizar score de oportunidade para todos os clusters ativos
CREATE OR REPLACE FUNCTION update_all_cluster_opportunity_scores()
RETURNS INTEGER AS $$
DECLARE
  v_cluster RECORD;
  v_new_score INTEGER;
  v_updated_count INTEGER := 0;
BEGIN
  FOR v_cluster IN
    SELECT id FROM hashtag_clusters_dynamic WHERE is_active = true
  LOOP
    v_new_score := calculate_cluster_opportunity_score(v_cluster.id);

    UPDATE cluster_behavioral_insights
    SET
      opportunity_score = v_new_score,
      updated_at = NOW()
    WHERE cluster_id = v_cluster.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clusters_updated_at
  BEFORE UPDATE ON hashtag_clusters_dynamic
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insights_updated_at
  BEFORE UPDATE ON cluster_behavioral_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 6. VIEWS PARA FACILITAR QUERIES
-- =====================================================================

-- View: Clusters com insights completos
CREATE VIEW v_clusters_with_insights AS
SELECT
  hcd.id,
  hcd.cluster_key,
  hcd.cluster_name,
  hcd.cluster_description,
  hcd.hashtags,
  hcd.hashtag_count,
  hcd.priority_score,
  hcd.conversion_rate,
  hcd.total_leads,

  -- Insights comportamentais
  cbi.pain_points,
  cbi.pain_intensity,
  cbi.emerging_trends,
  cbi.trend_direction,
  cbi.audience_awareness_level,
  cbi.opportunity_score,
  cbi.approach_recommendations,
  cbi.mental_triggers,

  -- Performance recente (30d)
  cpm30.conversion_rate as conversion_rate_30d,
  cpm30.roi_percentage as roi_30d,
  cpm30.trend_vs_previous_period,

  hcd.is_active,
  hcd.generated_at,
  cbi.analyzed_at
FROM hashtag_clusters_dynamic hcd
LEFT JOIN cluster_behavioral_insights cbi ON cbi.cluster_id = hcd.id
LEFT JOIN LATERAL (
  SELECT * FROM cluster_performance_metrics
  WHERE cluster_id = hcd.id AND measurement_period = '30d'
  ORDER BY calculated_at DESC LIMIT 1
) cpm30 ON true
WHERE hcd.is_active = true
ORDER BY hcd.priority_score DESC;

-- View: Top tendências emergentes
CREATE VIEW v_emerging_trends AS
SELECT
  ht.hashtag,
  ht.growth_rate,
  ht.trend_type,
  ht.velocity,
  hcd.cluster_name,
  hcd.opportunity_score,
  ht.detected_at
FROM hashtag_trends ht
LEFT JOIN hashtag_clusters_dynamic hcd ON hcd.id = ht.cluster_id
WHERE ht.trend_type IN ('emergente', 'viral', 'crescente')
  AND ht.growth_rate > 50
ORDER BY ht.growth_rate DESC, ht.detected_at DESC;

-- =====================================================================
-- 7. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================================

COMMENT ON TABLE hashtag_clusters_dynamic IS 'Sistema de clustering dinâmico - substitui clusters hardcoded por análise automática';
COMMENT ON TABLE cluster_behavioral_insights IS 'Análise comportamental profunda por GPT-4 - dores, tendências, oportunidades';
COMMENT ON TABLE cluster_performance_metrics IS 'Métricas de performance para feedback loop e auto-evolução';
COMMENT ON TABLE hashtag_trends IS 'Detecção de tendências emergentes e mudanças de comportamento';

COMMENT ON COLUMN cluster_behavioral_insights.pain_points IS 'Dores identificadas via análise semântica das hashtags';
COMMENT ON COLUMN cluster_behavioral_insights.opportunity_score IS 'Score 0-100 calculado por função que combina múltiplas métricas';
COMMENT ON COLUMN cluster_behavioral_insights.audience_awareness_level IS 'Nível de consciência segundo Eugene Schwartz';

COMMENT ON FUNCTION calculate_cluster_opportunity_score IS 'Calcula score de oportunidade baseado em conversão, tendência, dor e consciência';
COMMENT ON FUNCTION update_all_cluster_opportunity_scores IS 'Atualiza scores de todos clusters ativos - usar em cron semanal';

COMMENT ON VIEW v_clusters_with_insights IS 'View consolidada com clusters, insights e performance para dashboard';
COMMENT ON VIEW v_emerging_trends IS 'Top tendências emergentes com crescimento >50% para alertas no dashboard';
