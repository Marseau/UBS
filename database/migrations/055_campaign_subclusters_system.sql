-- Migration 055: Sistema de Subclusters Filho da Campanha
-- Data: 2025-11-27
-- Objetivo: Criar subclusters que nascem da campanha, cada um com sua persona, DMs e copies

-- =====================================================
-- TABELA: campaign_subclusters
-- Subclusters gerados a partir da análise de viabilidade da campanha
-- IMPORTANTE: Subclusters são FILHOS da campanha, gerados pelo clustering
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_subclusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

    -- Identificação do Subcluster
    cluster_index INTEGER NOT NULL,  -- Índice numérico do cluster (0, 1, 2, ...)
    cluster_name VARCHAR(255) NOT NULL,  -- Nome descritivo gerado

    -- Métricas do Subcluster
    total_leads INTEGER NOT NULL DEFAULT 0,
    avg_contact_rate NUMERIC(5,4) DEFAULT 0,
    hashtag_count INTEGER DEFAULT 0,
    relevance_score NUMERIC(5,4) DEFAULT 0.5,
    priority_score INTEGER DEFAULT 50,

    -- Hashtags e Keywords
    top_hashtags JSONB DEFAULT '[]'::jsonb,  -- [{hashtag, count, freq}]
    theme_keywords JSONB DEFAULT '[]'::jsonb,  -- ['keyword1', 'keyword2']

    -- Persona Gerada (GPT-4 ou regras)
    persona JSONB,  -- Estrutura completa da persona
    persona_generated_at TIMESTAMP WITH TIME ZONE,
    persona_generation_method VARCHAR(50) DEFAULT 'rules',  -- 'gpt4' ou 'rules'

    -- DM Scripts (por canal)
    dm_scripts JSONB DEFAULT '{}'::jsonb,  -- {instagram: [...], whatsapp: [...], email: [...]}
    dm_scripts_generated_at TIMESTAMP WITH TIME ZONE,

    -- Copies para Marketing
    copies JSONB DEFAULT '{}'::jsonb,  -- {hooks: [...], hashtags_recomendadas: [...]}
    copies_generated_at TIMESTAMP WITH TIME ZONE,

    -- Insights Comportamentais (sem GPT)
    behavioral_insights JSONB DEFAULT '{}'::jsonb,

    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (
        status IN ('pending', 'persona_generated', 'dm_generated', 'ready', 'in_outreach', 'completed')
    ),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: Um índice único por campanha
    CONSTRAINT unique_campaign_cluster_index UNIQUE(campaign_id, cluster_index)
);

-- =====================================================
-- AJUSTAR CAMPOS NA cluster_campaigns
-- Converter TEXT para JSONB e adicionar campos de controle
-- =====================================================

-- Converter generated_persona de TEXT para JSONB (se ainda for TEXT)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cluster_campaigns'
        AND column_name = 'generated_persona'
        AND data_type = 'text'
    ) THEN
        -- Primeiro limpar valores inválidos
        UPDATE cluster_campaigns SET generated_persona = NULL WHERE generated_persona = '';

        -- Criar coluna temporária
        ALTER TABLE cluster_campaigns ADD COLUMN IF NOT EXISTS generated_persona_jsonb JSONB;

        -- Migrar dados válidos
        UPDATE cluster_campaigns
        SET generated_persona_jsonb = generated_persona::jsonb
        WHERE generated_persona IS NOT NULL
        AND generated_persona ~ '^\s*[\{\[]';

        -- Dropar coluna antiga e renomear
        ALTER TABLE cluster_campaigns DROP COLUMN generated_persona;
        ALTER TABLE cluster_campaigns RENAME COLUMN generated_persona_jsonb TO generated_persona;
    END IF;
END $$;

-- Converter generated_dm_scripts de TEXT para JSONB
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cluster_campaigns'
        AND column_name = 'generated_dm_scripts'
        AND data_type = 'text'
    ) THEN
        UPDATE cluster_campaigns SET generated_dm_scripts = NULL WHERE generated_dm_scripts = '';
        ALTER TABLE cluster_campaigns ADD COLUMN IF NOT EXISTS generated_dm_scripts_jsonb JSONB;
        UPDATE cluster_campaigns
        SET generated_dm_scripts_jsonb = generated_dm_scripts::jsonb
        WHERE generated_dm_scripts IS NOT NULL
        AND generated_dm_scripts ~ '^\s*[\{\[]';
        ALTER TABLE cluster_campaigns DROP COLUMN generated_dm_scripts;
        ALTER TABLE cluster_campaigns RENAME COLUMN generated_dm_scripts_jsonb TO generated_dm_scripts;
    END IF;
END $$;

-- Converter generated_copies de TEXT para JSONB
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cluster_campaigns'
        AND column_name = 'generated_copies'
        AND data_type = 'text'
    ) THEN
        UPDATE cluster_campaigns SET generated_copies = NULL WHERE generated_copies = '';
        ALTER TABLE cluster_campaigns ADD COLUMN IF NOT EXISTS generated_copies_jsonb JSONB;
        UPDATE cluster_campaigns
        SET generated_copies_jsonb = generated_copies::jsonb
        WHERE generated_copies IS NOT NULL
        AND generated_copies ~ '^\s*[\{\[]';
        ALTER TABLE cluster_campaigns DROP COLUMN generated_copies;
        ALTER TABLE cluster_campaigns RENAME COLUMN generated_copies_jsonb TO generated_copies;
    END IF;
END $$;

-- Adicionar campos de controle do pipeline
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(50) DEFAULT 'draft'
    CHECK (pipeline_status IN (
        'draft',               -- Campanha criada, sem análise
        'viability_analyzed',  -- Análise de viabilidade executada
        'viability_approved',  -- Viabilidade aprovada, pronto para clustering
        'clustering_done',     -- Subclusters gerados
        'personas_generated',  -- Personas geradas para todos subclusters
        'dms_generated',       -- DM scripts gerados
        'copies_generated',    -- Copies geradas
        'ready_for_outreach',  -- Tudo pronto, aguardando execução n8n
        'in_outreach',         -- Outreach em andamento
        'completed'            -- Campanha finalizada
    ));

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS total_subclusters INTEGER DEFAULT 0;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS total_leads_in_campaign INTEGER DEFAULT 0;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS pipeline_started_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS pipeline_completed_at TIMESTAMP WITH TIME ZONE;

-- =====================================================
-- AJUSTAR campaign_leads PARA REFERENCIAR SUBCLUSTER
-- =====================================================
ALTER TABLE campaign_leads
ADD COLUMN IF NOT EXISTS subcluster_id UUID REFERENCES campaign_subclusters(id);

-- Criar índice para subcluster_id
CREATE INDEX IF NOT EXISTS idx_campaign_leads_subcluster ON campaign_leads(subcluster_id);

-- =====================================================
-- AJUSTAR campaign_outreach_queue
-- Adicionar campos para subcluster e scripts específicos
-- =====================================================
ALTER TABLE campaign_outreach_queue
ADD COLUMN IF NOT EXISTS subcluster_id UUID REFERENCES campaign_subclusters(id);

ALTER TABLE campaign_outreach_queue
ADD COLUMN IF NOT EXISTS subcluster_name VARCHAR(255);

ALTER TABLE campaign_outreach_queue
ADD COLUMN IF NOT EXISTS persona_snapshot JSONB;  -- Snapshot da persona no momento do enqueue

ALTER TABLE campaign_outreach_queue
ADD COLUMN IF NOT EXISTS dm_script_used JSONB;  -- Script específico usado

ALTER TABLE campaign_outreach_queue
ADD COLUMN IF NOT EXISTS dm_variant INTEGER DEFAULT 0;  -- Variante do script (para A/B testing)

-- Criar índice para subcluster
CREATE INDEX IF NOT EXISTS idx_outreach_queue_subcluster ON campaign_outreach_queue(subcluster_id);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_campaign_subclusters_campaign ON campaign_subclusters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_subclusters_status ON campaign_subclusters(status);
CREATE INDEX IF NOT EXISTS idx_campaign_subclusters_priority ON campaign_subclusters(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_pipeline ON cluster_campaigns(pipeline_status);

-- =====================================================
-- TRIGGER: Atualizar updated_at nos subclusters
-- =====================================================
CREATE TRIGGER IF NOT EXISTS trigger_campaign_subclusters_updated_at
    BEFORE UPDATE ON campaign_subclusters
    FOR EACH ROW
    EXECUTE FUNCTION update_cluster_updated_at();

-- =====================================================
-- VIEW: Subclusters com métricas de outreach
-- =====================================================
CREATE OR REPLACE VIEW v_campaign_subclusters_outreach AS
SELECT
    s.id as subcluster_id,
    s.campaign_id,
    s.cluster_index,
    s.cluster_name,
    s.total_leads,
    s.priority_score,
    s.status as subcluster_status,
    c.campaign_name,
    c.nicho_principal,
    c.pipeline_status,
    COUNT(cl.id) as leads_assigned,
    COUNT(cl.id) FILTER (WHERE cl.status = 'contacted') as leads_contacted,
    COUNT(cl.id) FILTER (WHERE cl.status = 'replied') as leads_replied,
    COUNT(cl.id) FILTER (WHERE cl.status = 'converted') as leads_converted,
    COUNT(oq.id) as outreach_queued,
    COUNT(oq.id) FILTER (WHERE oq.status = 'sent') as outreach_sent,
    COUNT(oq.id) FILTER (WHERE oq.status = 'pending') as outreach_pending
FROM campaign_subclusters s
INNER JOIN cluster_campaigns c ON c.id = s.campaign_id
LEFT JOIN campaign_leads cl ON cl.subcluster_id = s.id
LEFT JOIN campaign_outreach_queue oq ON oq.subcluster_id = s.id
GROUP BY s.id, s.campaign_id, s.cluster_index, s.cluster_name, s.total_leads,
         s.priority_score, s.status, c.campaign_name, c.nicho_principal, c.pipeline_status;

-- =====================================================
-- VIEW: Campanhas prontas para n8n processar
-- =====================================================
CREATE OR REPLACE VIEW v_campaigns_ready_for_outreach AS
SELECT
    c.id as campaign_id,
    c.campaign_name,
    c.nicho_principal,
    c.pipeline_status,
    c.total_subclusters,
    c.total_leads_in_campaign,
    p.client_name,
    p.project_name,
    c.preferred_channel,
    c.service_description,
    c.target_audience,
    (
        SELECT json_agg(json_build_object(
            'subcluster_id', s.id,
            'cluster_name', s.cluster_name,
            'total_leads', s.total_leads,
            'priority_score', s.priority_score,
            'persona', s.persona,
            'dm_scripts', s.dm_scripts
        ) ORDER BY s.priority_score DESC)
        FROM campaign_subclusters s
        WHERE s.campaign_id = c.id AND s.status = 'ready'
    ) as subclusters
FROM cluster_campaigns c
INNER JOIN cluster_projects p ON p.id = c.project_id
WHERE c.pipeline_status = 'ready_for_outreach';

-- =====================================================
-- FUNÇÃO: Obter próximos leads para outreach (para n8n)
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_outreach_batch(
    p_campaign_id UUID,
    p_channel VARCHAR DEFAULT 'instagram',
    p_batch_size INTEGER DEFAULT 50
) RETURNS TABLE (
    outreach_id UUID,
    lead_id UUID,
    lead_username VARCHAR,
    lead_full_name VARCHAR,
    lead_bio TEXT,
    subcluster_name VARCHAR,
    dm_script JSONB,
    persona_name VARCHAR,
    priority_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        oq.id as outreach_id,
        oq.lead_id,
        oq.lead_username,
        oq.lead_full_name,
        oq.lead_bio,
        oq.subcluster_name,
        oq.dm_script_used as dm_script,
        (oq.persona_snapshot->>'name')::VARCHAR as persona_name,
        oq.priority_score
    FROM campaign_outreach_queue oq
    WHERE oq.campaign_id = p_campaign_id
    AND oq.channel = p_channel
    AND oq.status = 'pending'
    AND (oq.scheduled_at IS NULL OR oq.scheduled_at <= NOW())
    ORDER BY oq.priority_score DESC, oq.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE campaign_subclusters IS 'Subclusters gerados a partir da análise de viabilidade de uma campanha - cada subcluster tem sua própria persona, DMs e copies';
COMMENT ON COLUMN campaign_subclusters.persona IS 'Persona completa do subcluster: {name, age_range, profession, pain_points, desires, communication_tone, awareness_level, buying_stage}';
COMMENT ON COLUMN campaign_subclusters.dm_scripts IS 'Scripts de DM por canal: {instagram: [{opener, followup1, followup2}], whatsapp: [...], email: [...]}';
COMMENT ON COLUMN campaign_subclusters.copies IS 'Copies de marketing: {hooks: [...], hashtags_recomendadas: [...], ctas: [...]}';
COMMENT ON COLUMN cluster_campaigns.pipeline_status IS 'Status do pipeline de execução da campanha';
COMMENT ON VIEW v_campaigns_ready_for_outreach IS 'Campanhas prontas para serem processadas pelo n8n';
