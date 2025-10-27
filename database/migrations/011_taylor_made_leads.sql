-- Migration: Taylor Made Leads Table
-- Data: 30/01/2025
-- Descrição: Tabela para capturar leads da landing page UBS Taylor Made

-- 1. Criar tabela taylor_made_leads
CREATE TABLE IF NOT EXISTS taylor_made_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Informações de Contato
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,

  -- Perfil do Negócio
  user_type TEXT NOT NULL CHECK (user_type IN ('agency', 'local_business', 'consultant', 'other')),
  business_segment TEXT NOT NULL CHECK (business_segment IN ('beauty', 'healthcare', 'education', 'legal', 'sports', 'consulting', 'other')),

  -- Necessidades do Negócio
  main_challenge TEXT NOT NULL CHECK (main_challenge IN ('lost_leads', 'disorganized', 'no_shows', 'no_roi', 'automation')),
  lead_volume TEXT NOT NULL CHECK (lead_volume IN ('less_50', '50_200', '200_500', 'more_500')),

  -- Interesse em Produto
  modules_interest TEXT[] NOT NULL, -- ['lead_capture', 'scheduling', 'followup', 'all']

  -- Atribuição de Marketing
  source TEXT, -- 'instagram', 'youtube', 'google', 'referral', 'other'

  -- Gestão de Leads
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'proposal_sent', 'converted', 'lost')),

  -- Notas e Follow-up
  notes TEXT,
  contacted_at TIMESTAMP WITH TIME ZONE,
  proposal_sent_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  timestamp TEXT NOT NULL, -- ISO8601 do frontend
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_email ON taylor_made_leads(email);
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_status ON taylor_made_leads(status);
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_user_type ON taylor_made_leads(user_type);
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_business_segment ON taylor_made_leads(business_segment);
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_created_at ON taylor_made_leads(created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE taylor_made_leads ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Super admins podem ler/escrever
CREATE POLICY "Super admins can manage Taylor Made leads"
  ON taylor_made_leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 5. Policy pública para INSERT (submissões de formulário)
CREATE POLICY "Anyone can submit Taylor Made leads"
  ON taylor_made_leads
  FOR INSERT
  WITH CHECK (true);

-- 6. Function para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_taylor_made_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger para atualizar updated_at
CREATE TRIGGER update_taylor_made_leads_updated_at_trigger
  BEFORE UPDATE ON taylor_made_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_taylor_made_leads_updated_at();

-- 8. Comentários para documentação
COMMENT ON TABLE taylor_made_leads IS 'Armazena leads da landing page UBS Taylor Made';
COMMENT ON COLUMN taylor_made_leads.user_type IS 'Tipo de usuário: agency, local_business, consultant, other';
COMMENT ON COLUMN taylor_made_leads.business_segment IS 'Segmento: beauty, healthcare, education, legal, sports, consulting, other';
COMMENT ON COLUMN taylor_made_leads.main_challenge IS 'Principal desafio do negócio';
COMMENT ON COLUMN taylor_made_leads.lead_volume IS 'Volume aproximado de leads/agendamentos por mês';
COMMENT ON COLUMN taylor_made_leads.modules_interest IS 'Array de módulos de interesse';
COMMENT ON COLUMN taylor_made_leads.status IS 'Status no funil: new, contacted, proposal_sent, converted, lost';
