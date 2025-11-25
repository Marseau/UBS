-- Migration: Sistema de Projetos e Campanhas para Cluster Analysis
-- Criado em: 2025-11-25
-- Objetivo: Gerenciar projetos de clientes com análise de clusters personalizados

-- =====================================================
-- TABELA: cluster_projects
-- Armazena projetos de análise de clusters por cliente
-- =====================================================
CREATE TABLE IF NOT EXISTS cluster_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificação do Cliente
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),

    -- Identificação do Projeto
    project_name VARCHAR(255) NOT NULL,
    project_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Status do Projeto
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),

    -- Metadados
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Indexes
    CONSTRAINT unique_client_project UNIQUE(client_name, project_name)
);

-- =====================================================
-- TABELA: cluster_campaigns
-- Campanhas individuais dentro de projetos
-- =====================================================
CREATE TABLE IF NOT EXISTS cluster_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES cluster_projects(id) ON DELETE CASCADE,

    -- Identificação da Campanha
    campaign_name VARCHAR(255) NOT NULL,
    campaign_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Nichos e Segmentação
    nicho_principal VARCHAR(255) NOT NULL,
    nicho_secundario VARCHAR(255),
    keywords TEXT[] NOT NULL,

    -- Descrição do Serviço/Produto
    service_description TEXT NOT NULL,

    -- Público Alvo
    target_audience TEXT NOT NULL,
    target_age_range VARCHAR(50),
    target_gender VARCHAR(20),
    target_location VARCHAR(255),
    target_income_class VARCHAR(20),

    -- Regras AIC Customizadas (Override dos defaults)
    rules_min_freq_raiz INTEGER DEFAULT 70,
    rules_min_hashtags_forte INTEGER DEFAULT 10,
    rules_min_total_forte INTEGER DEFAULT 100,
    rules_min_hashtags_medio_min INTEGER DEFAULT 5,
    rules_min_hashtags_medio_max INTEGER DEFAULT 9,
    rules_min_total_medio INTEGER DEFAULT 50,
    rules_min_hashtags_fraco INTEGER DEFAULT 2,
    rules_max_hashtags_fraco INTEGER DEFAULT 4,
    rules_min_perfis_campanha INTEGER DEFAULT 1000,
    rules_min_hashtags_campanha INTEGER DEFAULT 300,
    rules_min_hashtags_raiz_campanha INTEGER DEFAULT 3,

    -- Objetivo da Campanha
    campaign_goal VARCHAR(100) DEFAULT 'lead_generation' CHECK (
        campaign_goal IN ('lead_generation', 'brand_awareness', 'engagement', 'sales', 'other')
    ),
    campaign_budget DECIMAL(10, 2),
    campaign_target_dms INTEGER DEFAULT 2000,

    -- Resultado da Análise (armazenado após execução)
    analysis_result JSONB,
    cluster_status VARCHAR(50),
    last_analysis_at TIMESTAMP WITH TIME ZONE,

    -- Status da Campanha
    status VARCHAR(50) DEFAULT 'draft' CHECK (
        status IN ('draft', 'analyzing', 'approved', 'in_progress', 'completed', 'cancelled')
    ),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    CONSTRAINT unique_project_campaign UNIQUE(project_id, campaign_name)
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================
CREATE INDEX idx_cluster_projects_client ON cluster_projects(client_name);
CREATE INDEX idx_cluster_projects_status ON cluster_projects(status);
CREATE INDEX idx_cluster_projects_created ON cluster_projects(created_at DESC);

CREATE INDEX idx_cluster_campaigns_project ON cluster_campaigns(project_id);
CREATE INDEX idx_cluster_campaigns_status ON cluster_campaigns(status);
CREATE INDEX idx_cluster_campaigns_cluster_status ON cluster_campaigns(cluster_status);
CREATE INDEX idx_cluster_campaigns_nicho ON cluster_campaigns(nicho_principal);
CREATE INDEX idx_cluster_campaigns_created ON cluster_campaigns(created_at DESC);
CREATE INDEX idx_cluster_campaigns_date ON cluster_campaigns(campaign_date DESC);

-- =====================================================
-- TRIGGER PARA ATUALIZAR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_cluster_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cluster_projects_updated_at
    BEFORE UPDATE ON cluster_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_cluster_updated_at();

CREATE TRIGGER trigger_cluster_campaigns_updated_at
    BEFORE UPDATE ON cluster_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_cluster_updated_at();

-- =====================================================
-- VIEWS PARA CONSULTAS RÁPIDAS
-- =====================================================

-- View: Projetos com contagem de campanhas
CREATE OR REPLACE VIEW cluster_projects_summary AS
SELECT
    p.id,
    p.client_name,
    p.project_name,
    p.status,
    p.created_at,
    COUNT(c.id) as total_campaigns,
    COUNT(c.id) FILTER (WHERE c.status = 'approved') as approved_campaigns,
    COUNT(c.id) FILTER (WHERE c.status = 'in_progress') as active_campaigns,
    COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_campaigns,
    MAX(c.campaign_date) as last_campaign_date
FROM cluster_projects p
LEFT JOIN cluster_campaigns c ON c.project_id = p.id
GROUP BY p.id, p.client_name, p.project_name, p.status, p.created_at;

-- View: Campanhas com informações do projeto
CREATE OR REPLACE VIEW cluster_campaigns_full AS
SELECT
    c.id as campaign_id,
    c.campaign_name,
    c.campaign_date,
    c.nicho_principal,
    c.nicho_secundario,
    c.service_description,
    c.target_audience,
    c.cluster_status,
    c.status as campaign_status,
    c.analysis_result,
    p.id as project_id,
    p.project_name,
    p.client_name,
    p.client_email,
    c.created_at,
    c.last_analysis_at
FROM cluster_campaigns c
INNER JOIN cluster_projects p ON p.id = c.project_id;

-- =====================================================
-- FUNÇÃO: Criar projeto com primeira campanha
-- =====================================================
CREATE OR REPLACE FUNCTION create_project_with_campaign(
    p_client_name VARCHAR,
    p_client_email VARCHAR,
    p_project_name VARCHAR,
    p_campaign_name VARCHAR,
    p_nicho_principal VARCHAR,
    p_keywords TEXT[],
    p_service_description TEXT,
    p_target_audience TEXT
) RETURNS UUID AS $$
DECLARE
    v_project_id UUID;
    v_campaign_id UUID;
BEGIN
    -- Criar projeto
    INSERT INTO cluster_projects (client_name, client_email, project_name)
    VALUES (p_client_name, p_client_email, p_project_name)
    RETURNING id INTO v_project_id;

    -- Criar campanha
    INSERT INTO cluster_campaigns (
        project_id, campaign_name, nicho_principal,
        keywords, service_description, target_audience
    )
    VALUES (
        v_project_id, p_campaign_name, p_nicho_principal,
        p_keywords, p_service_description, p_target_audience
    )
    RETURNING id INTO v_campaign_id;

    RETURN v_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE cluster_projects IS 'Projetos de clientes para análise de clusters';
COMMENT ON TABLE cluster_campaigns IS 'Campanhas individuais dentro de projetos com regras AIC customizadas';
COMMENT ON COLUMN cluster_campaigns.rules_min_freq_raiz IS 'Frequência mínima para hashtag ser considerada raiz (padrão: 70)';
COMMENT ON COLUMN cluster_campaigns.analysis_result IS 'Resultado JSON completo da última análise de cluster executada';
