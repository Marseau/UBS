-- Migration 026: Lead Generation System
-- Sistema de geração de leads via Instagram Reels + buscaLeads workflow
-- Rodízio de 7 segmentos de mercado com 100 termos cada

-- Tabela principal: Termos de busca gerados por Reel
CREATE TABLE lead_search_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Vinculação com conteúdo editorial
  content_id UUID REFERENCES editorial_content(id) ON DELETE CASCADE,
  reel_number INTEGER NOT NULL CHECK (reel_number IN (1, 2, 3)),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,

  -- Segmento em rodízio (7 segmentos totais)
  target_segment TEXT NOT NULL CHECK (target_segment IN (
    'saloes_beleza',
    'clinicas_estetica',
    'psicologos_terapeutas',
    'profissionais_saude',
    'personal_trainers',
    'agencias_marketing',
    'profissionais_liberais'
  )),

  -- Categoria geral e área específica usadas na geração
  categoria_geral TEXT NOT NULL,
  area_especifica TEXT NOT NULL,

  -- Termos gerados (100 termos por execução)
  search_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(search_terms)) STORED,

  -- Metadata de geração
  generated_at TIMESTAMP DEFAULT NOW(),
  generated_by_model TEXT DEFAULT 'gpt-4',
  generation_cost_usd NUMERIC(10, 6) DEFAULT 0,
  generation_prompt TEXT,

  -- Tracking de uso e performance
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  leads_generated INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5, 2),
  quality_score NUMERIC(3, 2), -- 0-5 score de qualidade dos termos

  -- Constraints
  UNIQUE(content_id, reel_number),
  CONSTRAINT valid_conversion_rate CHECK (conversion_rate >= 0 AND conversion_rate <= 100)
);

-- Índices para performance
CREATE INDEX idx_lead_terms_segment ON lead_search_terms(target_segment);
CREATE INDEX idx_lead_terms_week ON lead_search_terms(week_number, year);
CREATE INDEX idx_lead_terms_content ON lead_search_terms(content_id);
CREATE INDEX idx_lead_terms_generated_at ON lead_search_terms(generated_at DESC);
CREATE INDEX idx_lead_terms_performance ON lead_search_terms(leads_generated DESC, conversion_rate DESC);

-- Tabela auxiliar: Configuração de rodízio de segmentos
CREATE TABLE lead_segment_rotation (
  id SERIAL PRIMARY KEY,
  segment_key TEXT UNIQUE NOT NULL,
  segment_name TEXT NOT NULL,
  categoria_geral TEXT NOT NULL,
  area_especifica TEXT NOT NULL,
  rotation_order INTEGER UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  total_uses INTEGER DEFAULT 0
);

-- Popular configuração inicial dos 7 segmentos
INSERT INTO lead_segment_rotation (segment_key, segment_name, categoria_geral, area_especifica, rotation_order) VALUES
('saloes_beleza', 'Salões de Beleza', 'profissional estetica e beleza', 'salão de beleza', 1),
('clinicas_estetica', 'Clínicas de Estética', 'profissional estetica e beleza', 'clínica de estética', 2),
('psicologos_terapeutas', 'Psicólogos e Terapeutas', 'profissional saude mental', 'psicólogo', 3),
('profissionais_saude', 'Profissionais de Saúde', 'profissional saude', 'médico', 4),
('personal_trainers', 'Personal Trainers', 'profissional fitness', 'personal trainer', 5),
('agencias_marketing', 'Agências de Marketing Digital', 'empresa marketing', 'agência de marketing digital', 6),
('profissionais_liberais', 'Profissionais Liberais', 'profissional liberal', 'advogado', 7);

-- Função para obter próximo segmento no rodízio
CREATE OR REPLACE FUNCTION get_next_lead_segment()
RETURNS TABLE (
  segment_key TEXT,
  segment_name TEXT,
  categoria_geral TEXT,
  area_especifica TEXT,
  rotation_order INTEGER
) AS $$
DECLARE
  last_segment_order INTEGER;
  next_order INTEGER;
BEGIN
  -- Pegar último segmento usado
  SELECT COALESCE(MAX(rotation_order), 0) INTO last_segment_order
  FROM lead_segment_rotation
  WHERE last_used_at = (SELECT MAX(last_used_at) FROM lead_segment_rotation);

  -- Calcular próximo (rodízio circular)
  next_order := (last_segment_order % 7) + 1;

  -- Retornar próximo segmento
  RETURN QUERY
  SELECT
    lsr.segment_key,
    lsr.segment_name,
    lsr.categoria_geral,
    lsr.area_especifica,
    lsr.rotation_order
  FROM lead_segment_rotation lsr
  WHERE lsr.rotation_order = next_order
    AND lsr.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Função para marcar segmento como usado
CREATE OR REPLACE FUNCTION mark_segment_as_used(p_segment_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE lead_segment_rotation
  SET
    last_used_at = NOW(),
    total_uses = total_uses + 1
  WHERE segment_key = p_segment_key;
END;
$$ LANGUAGE plpgsql;

-- Comentários para documentação
COMMENT ON TABLE lead_search_terms IS 'Armazena termos de busca gerados para lead generation via Instagram';
COMMENT ON COLUMN lead_search_terms.content_id IS 'Referência ao conteúdo editorial (semana)';
COMMENT ON COLUMN lead_search_terms.reel_number IS 'Número do Reel que disparou a geração (1, 2 ou 3)';
COMMENT ON COLUMN lead_search_terms.target_segment IS 'Segmento de mercado alvo no rodízio';
COMMENT ON COLUMN lead_search_terms.search_terms IS 'Array JSON com 100 termos gerados pelo GPT-4';
COMMENT ON COLUMN lead_search_terms.terms_count IS 'Quantidade de termos no array (gerado automaticamente)';
COMMENT ON COLUMN lead_search_terms.leads_generated IS 'Quantidade de leads obtidos usando estes termos';
COMMENT ON COLUMN lead_search_terms.conversion_rate IS 'Taxa de conversão (%) dos termos';
COMMENT ON COLUMN lead_search_terms.quality_score IS 'Score de qualidade dos termos (0-5)';

COMMENT ON TABLE lead_segment_rotation IS 'Configuração de rodízio de segmentos para lead generation';
COMMENT ON FUNCTION get_next_lead_segment() IS 'Retorna próximo segmento no rodízio circular (7 segmentos)';
COMMENT ON FUNCTION mark_segment_as_used(TEXT) IS 'Marca segmento como usado e atualiza contadores';

-- Adicionar campos no editorial_content para tracking de leads
ALTER TABLE editorial_content
  ADD COLUMN reel_1_lead_terms_generated BOOLEAN DEFAULT false,
  ADD COLUMN reel_2_lead_terms_generated BOOLEAN DEFAULT false,
  ADD COLUMN reel_3_lead_terms_generated BOOLEAN DEFAULT false,
  ADD COLUMN total_lead_terms_count INTEGER DEFAULT 0,
  ADD COLUMN total_leads_from_reels INTEGER DEFAULT 0;

COMMENT ON COLUMN editorial_content.reel_1_lead_terms_generated IS 'Se termos de lead foram gerados para Reel 1';
COMMENT ON COLUMN editorial_content.reel_2_lead_terms_generated IS 'Se termos de lead foram gerados para Reel 2';
COMMENT ON COLUMN editorial_content.reel_3_lead_terms_generated IS 'Se termos de lead foram gerados para Reel 3';
COMMENT ON COLUMN editorial_content.total_lead_terms_count IS 'Total de termos gerados (soma dos 3 Reels)';
COMMENT ON COLUMN editorial_content.total_leads_from_reels IS 'Total de leads capturados via Reels desta semana';

-- Total de objetos criados:
-- - 2 tabelas (lead_search_terms, lead_segment_rotation)
-- - 2 funções (get_next_lead_segment, mark_segment_as_used)
-- - 5 índices
-- - 5 campos adicionados em editorial_content
-- - 7 registros iniciais de segmentos
