-- =====================================================
-- Migration: 094_campaign_leads_noig
-- Descrição: Tabela para leads da LP sem Instagram
-- Data: 2026-01-20
-- =====================================================

-- Leads que chegam pela Landing Page sem informar Instagram
-- Recebem tratamento "frio" inicialmente, mas podem ser qualificados
-- via conversa com o Agente IA

CREATE TABLE IF NOT EXISTS campaign_leads_noig (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vínculo com campanha
    campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

    -- Dados do formulário LP
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    whatsapp VARCHAR(20) NOT NULL,

    -- Tracking de origem
    utm_params JSONB,
    landing_page_url TEXT,

    -- Status do lead
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN (
        'new',           -- Recém chegou
        'contacted',     -- Primeira mensagem enviada
        'engaged',       -- Respondeu
        'qualifying',    -- Em qualificação pelo Agente
        'qualified',     -- Qualificado (lead quente)
        'converted',     -- Converteu para lead com IG
        'lost'           -- Perdido/desistiu
    )),

    -- Contexto da conversa (para Agente IA)
    conversation_context JSONB DEFAULT '{}'::jsonb,
    -- Estrutura esperada:
    -- {
    --   "ramo": "salão de beleza",
    --   "objetivo": "captar mais clientes",
    --   "dor_principal": "agenda vazia",
    --   "orcamento": "até 2k/mês",
    --   "notas": ["interessado em automação", "já usa whatsapp business"]
    -- }

    -- Qualificação
    qualification_score INTEGER DEFAULT 0,  -- 0-100
    qualification_notes TEXT,
    qualified_at TIMESTAMPTZ,
    qualified_by VARCHAR(50),  -- 'agent' ou 'human'

    -- Conversão para lead com Instagram
    instagram_acquired BOOLEAN DEFAULT FALSE,
    instagram_username VARCHAR(100),
    converted_to_lead_id UUID REFERENCES instagram_leads(id),
    converted_at TIMESTAMPTZ,

    -- Referência à conversa (quando existir)
    conversation_id UUID,  -- FK para aic_conversations quando criada

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    first_contact_at TIMESTAMPTZ,
    last_contact_at TIMESTAMPTZ
);

-- =====================================================
-- ÍNDICES
-- =====================================================

-- Busca por campanha
CREATE INDEX idx_campaign_leads_noig_campaign
ON campaign_leads_noig(campaign_id);

-- Busca por status
CREATE INDEX idx_campaign_leads_noig_status
ON campaign_leads_noig(status);

-- Busca por WhatsApp (para encontrar conversa)
CREATE INDEX idx_campaign_leads_noig_whatsapp
ON campaign_leads_noig(whatsapp);

-- Busca por email
CREATE INDEX idx_campaign_leads_noig_email
ON campaign_leads_noig(email) WHERE email IS NOT NULL;

-- Leads não convertidos por campanha
CREATE INDEX idx_campaign_leads_noig_pending
ON campaign_leads_noig(campaign_id, status)
WHERE instagram_acquired = FALSE;

-- =====================================================
-- TRIGGER: Atualizar updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_campaign_leads_noig_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaign_leads_noig_updated_at
    BEFORE UPDATE ON campaign_leads_noig
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_leads_noig_updated_at();

-- =====================================================
-- FUNÇÃO: Converter lead noig para lead com Instagram
-- =====================================================

CREATE OR REPLACE FUNCTION convert_noig_to_instagram_lead(
    p_noig_id UUID,
    p_instagram_username VARCHAR(100)
)
RETURNS UUID AS $$
DECLARE
    v_noig RECORD;
    v_new_lead_id UUID;
    v_campaign_lead_id UUID;
BEGIN
    -- Buscar lead noig
    SELECT * INTO v_noig
    FROM campaign_leads_noig
    WHERE id = p_noig_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lead noig não encontrado: %', p_noig_id;
    END IF;

    -- Verificar se já foi convertido
    IF v_noig.instagram_acquired THEN
        RETURN v_noig.converted_to_lead_id;
    END IF;

    -- Verificar se já existe lead com esse username
    SELECT id INTO v_new_lead_id
    FROM instagram_leads
    WHERE username = p_instagram_username;

    IF NOT FOUND THEN
        -- Criar novo lead em instagram_leads
        INSERT INTO instagram_leads (
            username,
            full_name,
            email,
            whatsapp_number,
            lead_source,
            captured_at
        ) VALUES (
            p_instagram_username,
            v_noig.name,
            v_noig.email,
            v_noig.whatsapp,
            'landing_converted',
            NOW()
        ) RETURNING id INTO v_new_lead_id;
    END IF;

    -- Criar vínculo em campaign_leads
    INSERT INTO campaign_leads (
        campaign_id,
        lead_id,
        status,
        match_source,
        visited_landing,
        visited_landing_at,
        utm_params,
        created_at
    ) VALUES (
        v_noig.campaign_id,
        v_new_lead_id,
        'new',
        'landing_converted',
        TRUE,
        v_noig.created_at,
        v_noig.utm_params,
        NOW()
    ) RETURNING id INTO v_campaign_lead_id;

    -- Atualizar lead noig
    UPDATE campaign_leads_noig SET
        instagram_acquired = TRUE,
        instagram_username = p_instagram_username,
        converted_to_lead_id = v_new_lead_id,
        converted_at = NOW(),
        status = 'converted'
    WHERE id = p_noig_id;

    RETURN v_new_lead_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON TABLE campaign_leads_noig IS
'Leads da Landing Page que não informaram Instagram. Tratamento inicial frio, qualificação via conversa.';

COMMENT ON COLUMN campaign_leads_noig.conversation_context IS
'Contexto coletado pelo Agente IA durante conversa. JSON com ramo, objetivo, dor, etc.';

COMMENT ON COLUMN campaign_leads_noig.instagram_acquired IS
'TRUE quando o lead informou seu Instagram durante a conversa.';

COMMENT ON COLUMN campaign_leads_noig.converted_to_lead_id IS
'FK para instagram_leads após conversão. Lead passa a ter tratamento completo.';

COMMENT ON FUNCTION convert_noig_to_instagram_lead IS
'Converte lead sem IG para lead completo quando informar username. Cria em instagram_leads e campaign_leads.';
