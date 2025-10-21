-- Migration 027: Instagram Leads Capture System
-- Armazena leads capturados via scraping híbrido (login manual + Puppeteer)

-- Tabela principal: Leads capturados do Instagram
CREATE TABLE instagram_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Dados do Instagram
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  bio TEXT,
  profile_pic_url TEXT,
  is_business_account BOOLEAN,
  is_verified BOOLEAN DEFAULT false,

  -- Métricas públicas
  followers_count INTEGER,
  following_count INTEGER,
  posts_count INTEGER,

  -- Informações de contato (se disponíveis)
  email TEXT,
  phone TEXT,
  website TEXT,

  -- Categorização
  business_category TEXT,
  segment TEXT, -- De qual segmento veio (saloes_beleza, clinicas_estetica, etc)

  -- Origem da captura
  search_term_id UUID REFERENCES lead_search_terms(id),
  search_term_used TEXT NOT NULL, -- Termo que encontrou este lead
  captured_at TIMESTAMP DEFAULT NOW(),

  -- Qualificação do lead
  lead_score NUMERIC(3, 2), -- 0-5 score automático
  is_qualified BOOLEAN DEFAULT false,
  qualification_notes TEXT,

  -- Status de prospecção
  contact_status TEXT CHECK (contact_status IN (
    'new',
    'contacted',
    'interested',
    'not_interested',
    'converted',
    'invalid'
  )) DEFAULT 'new',

  contacted_at TIMESTAMP,
  last_interaction_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_instagram_leads_username ON instagram_leads(username);
CREATE INDEX idx_instagram_leads_segment ON instagram_leads(segment);
CREATE INDEX idx_instagram_leads_status ON instagram_leads(contact_status);
CREATE INDEX idx_instagram_leads_score ON instagram_leads(lead_score DESC);
CREATE INDEX idx_instagram_leads_qualified ON instagram_leads(is_qualified);
CREATE INDEX idx_instagram_leads_search_term ON instagram_leads(search_term_id);
CREATE INDEX idx_instagram_leads_captured_at ON instagram_leads(captured_at DESC);

-- Tabela de histórico de interações com leads
CREATE TABLE instagram_lead_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES instagram_leads(id) ON DELETE CASCADE,

  interaction_type TEXT CHECK (interaction_type IN (
    'dm_sent',
    'comment',
    'email_sent',
    'phone_call',
    'meeting',
    'follow_up',
    'note'
  )) NOT NULL,

  interaction_content TEXT,
  interaction_result TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT -- User que fez a interação
);

CREATE INDEX idx_lead_interactions_lead ON instagram_lead_interactions(lead_id);
CREATE INDEX idx_lead_interactions_type ON instagram_lead_interactions(interaction_type);
CREATE INDEX idx_lead_interactions_date ON instagram_lead_interactions(created_at DESC);

-- Tabela de sessões de scraping
CREATE TABLE instagram_scraping_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  search_term_id UUID REFERENCES lead_search_terms(id),
  segment TEXT NOT NULL,

  -- Métricas da sessão
  terms_processed INTEGER DEFAULT 0,
  leads_found INTEGER DEFAULT 0,
  leads_new INTEGER DEFAULT 0, -- Leads únicos novos
  leads_duplicate INTEGER DEFAULT 0, -- Já existentes

  -- Status
  status TEXT CHECK (status IN (
    'running',
    'completed',
    'failed',
    'cancelled'
  )) DEFAULT 'running',

  error_message TEXT,

  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_seconds INTEGER
);

CREATE INDEX idx_scraping_sessions_status ON instagram_scraping_sessions(status);
CREATE INDEX idx_scraping_sessions_segment ON instagram_scraping_sessions(segment);
CREATE INDEX idx_scraping_sessions_date ON instagram_scraping_sessions(started_at DESC);

-- Função para calcular lead score automático
CREATE OR REPLACE FUNCTION calculate_lead_score(
  p_followers INTEGER,
  p_posts INTEGER,
  p_is_business BOOLEAN,
  p_has_contact BOOLEAN
) RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 0;
BEGIN
  -- Base score: Followers
  IF p_followers >= 10000 THEN v_score := v_score + 2.0;
  ELSIF p_followers >= 5000 THEN v_score := v_score + 1.5;
  ELSIF p_followers >= 1000 THEN v_score := v_score + 1.0;
  ELSIF p_followers >= 500 THEN v_score := v_score + 0.5;
  END IF;

  -- Engagement (posts count)
  IF p_posts >= 100 THEN v_score := v_score + 1.0;
  ELSIF p_posts >= 50 THEN v_score := v_score + 0.5;
  END IF;

  -- Business account
  IF p_is_business THEN v_score := v_score + 1.0; END IF;

  -- Has contact info
  IF p_has_contact THEN v_score := v_score + 1.0; END IF;

  -- Cap at 5.0
  IF v_score > 5.0 THEN v_score := 5.0; END IF;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_instagram_leads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_instagram_leads_timestamp
BEFORE UPDATE ON instagram_leads
FOR EACH ROW
EXECUTE FUNCTION update_instagram_leads_timestamp();

-- Atualizar lead_search_terms com tracking de uso
ALTER TABLE lead_search_terms
  ADD COLUMN scraping_session_id UUID REFERENCES instagram_scraping_sessions(id);

-- Comentários
COMMENT ON TABLE instagram_leads IS 'Leads capturados do Instagram via scraping híbrido';
COMMENT ON COLUMN instagram_leads.username IS 'Username do Instagram (@username)';
COMMENT ON COLUMN instagram_leads.lead_score IS 'Score automático 0-5 baseado em followers, posts, etc';
COMMENT ON COLUMN instagram_leads.segment IS 'Segmento de mercado (saloes_beleza, clinicas_estetica, etc)';
COMMENT ON COLUMN instagram_leads.contact_status IS 'Status de prospecção do lead';

COMMENT ON TABLE instagram_lead_interactions IS 'Histórico de interações com leads';
COMMENT ON TABLE instagram_scraping_sessions IS 'Sessões de scraping executadas';
COMMENT ON FUNCTION calculate_lead_score(INTEGER, INTEGER, BOOLEAN, BOOLEAN) IS 'Calcula score de qualidade do lead (0-5)';

-- Total de objetos criados:
-- - 3 tabelas (instagram_leads, instagram_lead_interactions, instagram_scraping_sessions)
-- - 1 função (calculate_lead_score)
-- - 1 trigger function (update_instagram_leads_timestamp)
-- - 1 trigger (trigger_update_instagram_leads_timestamp)
-- - 10 índices
-- - 1 campo adicional em lead_search_terms
