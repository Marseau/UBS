-- =====================================================
-- MIGRATION 052: Sistema de Personas Dinâmicas
-- Para análise profissional com 10k+ leads
-- =====================================================

-- Tabela principal de personas geradas por IA
CREATE TABLE IF NOT EXISTS dynamic_personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificação
    persona_key VARCHAR(100) UNIQUE NOT NULL,
    persona_name VARCHAR(255) NOT NULL,
    persona_avatar_emoji VARCHAR(10) DEFAULT '👤',

    -- Dados demográficos (inferidos)
    age_range VARCHAR(50),                    -- Ex: "25-35"
    gender_distribution JSONB,                -- Ex: {"feminino": 70, "masculino": 30}
    location_focus TEXT[],                    -- Ex: ["São Paulo", "Rio de Janeiro"]
    income_level VARCHAR(50),                 -- Ex: "classe_media_alta"

    -- Perfil profissional
    primary_occupation VARCHAR(255),          -- Ex: "Profissional de Estética"
    secondary_occupations TEXT[],             -- Ex: ["Esteticista", "Nail Designer"]
    experience_level VARCHAR(50),             -- Ex: "intermediario", "avancado"
    business_stage VARCHAR(50),               -- Ex: "crescimento", "consolidado"

    -- Comportamento digital
    instagram_behavior JSONB,                 -- Padrões de uso do Instagram
    content_preferences TEXT[],               -- Ex: ["tutoriais", "antes_depois"]
    engagement_patterns JSONB,                -- Horários, frequência, tipo de interação
    hashtag_affinity TEXT[],                  -- Hashtags mais usadas

    -- Psicografia (GPT-4/5 generated)
    primary_motivations TEXT[],               -- Ex: ["crescimento_profissional", "reconhecimento"]
    core_pain_points TEXT[],                  -- Dores principais
    aspirations TEXT[],                       -- Objetivos e sonhos
    fears_and_objections TEXT[],              -- Medos e objeções
    values_and_beliefs TEXT[],                -- Valores centrais

    -- Jornada de compra
    awareness_level VARCHAR(50),              -- Ex: "consciente_do_problema"
    decision_factors TEXT[],                  -- Fatores de decisão
    preferred_communication_style VARCHAR(100), -- Ex: "direto_e_pratico"
    trust_triggers TEXT[],                    -- O que gera confiança

    -- Métricas calculadas
    total_leads INTEGER DEFAULT 0,
    percentage_of_base DECIMAL(5,2) DEFAULT 0,
    avg_conversion_rate DECIMAL(5,2) DEFAULT 0,
    avg_quality_score DECIMAL(3,2) DEFAULT 0,
    engagement_score DECIMAL(5,2) DEFAULT 0,
    monetization_potential DECIMAL(5,2) DEFAULT 0,

    -- Recomendações de abordagem (GPT generated)
    ideal_first_contact TEXT,                 -- Como abordar inicialmente
    content_strategy TEXT,                    -- Estratégia de conteúdo
    offer_positioning TEXT,                   -- Como posicionar oferta
    objection_handling JSONB,                 -- Respostas para objeções comuns

    -- Clusters associados
    primary_cluster_id UUID REFERENCES hashtag_clusters_dynamic(id),
    secondary_cluster_ids UUID[],
    cluster_overlap_score DECIMAL(5,2) DEFAULT 0,

    -- Metadados
    generated_by_model VARCHAR(100) DEFAULT 'gpt-4',
    generation_prompt TEXT,
    confidence_score DECIMAL(3,2) DEFAULT 0,  -- 0-1, confiança na persona
    last_recalculated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de associação lead-persona (many-to-many com scores)
CREATE TABLE IF NOT EXISTS lead_persona_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    lead_id UUID NOT NULL,                    -- FK para instagram_leads
    persona_id UUID NOT NULL REFERENCES dynamic_personas(id) ON DELETE CASCADE,

    -- Scores de match
    match_score DECIMAL(5,2) NOT NULL,        -- 0-100, quão bem o lead se encaixa
    confidence DECIMAL(3,2) DEFAULT 0.5,      -- 0-1, confiança no match

    -- Fatores que determinaram o match
    match_factors JSONB,                      -- Ex: {"hashtags": 0.8, "behavior": 0.7}

    -- Metadados
    assigned_at TIMESTAMP DEFAULT NOW(),
    last_validated_at TIMESTAMP DEFAULT NOW(),
    is_primary BOOLEAN DEFAULT false          -- Se é a persona principal do lead
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_personas_active ON dynamic_personas(is_active);
CREATE INDEX IF NOT EXISTS idx_personas_cluster ON dynamic_personas(primary_cluster_id);
CREATE INDEX IF NOT EXISTS idx_personas_monetization ON dynamic_personas(monetization_potential DESC);
CREATE INDEX IF NOT EXISTS idx_lead_persona_lead ON lead_persona_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_persona_persona ON lead_persona_assignments(persona_id);
CREATE INDEX IF NOT EXISTS idx_lead_persona_primary ON lead_persona_assignments(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_lead_persona_score ON lead_persona_assignments(match_score DESC);

-- Tabela de evolução histórica das personas
CREATE TABLE IF NOT EXISTS persona_evolution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    persona_id UUID NOT NULL REFERENCES dynamic_personas(id) ON DELETE CASCADE,

    snapshot_date DATE NOT NULL,
    total_leads INTEGER,
    avg_conversion_rate DECIMAL(5,2),
    engagement_score DECIMAL(5,2),
    monetization_potential DECIMAL(5,2),

    -- Mudanças detectadas
    pain_points_changed BOOLEAN DEFAULT false,
    motivations_changed BOOLEAN DEFAULT false,
    behavior_changed BOOLEAN DEFAULT false,

    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_evolution ON persona_evolution_history(persona_id, snapshot_date DESC);

-- View consolidada para dashboard
CREATE OR REPLACE VIEW v_personas_dashboard AS
SELECT
    dp.id,
    dp.persona_key,
    dp.persona_name,
    dp.persona_avatar_emoji,
    dp.age_range,
    dp.primary_occupation,
    dp.business_stage,
    dp.awareness_level,
    dp.total_leads,
    dp.percentage_of_base,
    dp.avg_conversion_rate,
    dp.engagement_score,
    dp.monetization_potential,
    dp.confidence_score,
    dp.primary_motivations,
    dp.core_pain_points,
    dp.ideal_first_contact,
    dp.content_strategy,
    hcd.cluster_name as primary_cluster_name,
    dp.last_recalculated_at,
    dp.created_at
FROM dynamic_personas dp
LEFT JOIN hashtag_clusters_dynamic hcd ON hcd.id = dp.primary_cluster_id
WHERE dp.is_active = true
ORDER BY dp.monetization_potential DESC, dp.total_leads DESC;

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_persona_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-update
DROP TRIGGER IF EXISTS trigger_persona_updated ON dynamic_personas;
CREATE TRIGGER trigger_persona_updated
    BEFORE UPDATE ON dynamic_personas
    FOR EACH ROW
    EXECUTE FUNCTION update_persona_timestamp();

-- Comentários
COMMENT ON TABLE dynamic_personas IS 'Personas dinâmicas geradas por IA baseadas em análise de clusters e comportamento';
COMMENT ON TABLE lead_persona_assignments IS 'Associação de leads a personas com score de match';
COMMENT ON TABLE persona_evolution_history IS 'Histórico de evolução das personas ao longo do tempo';
COMMENT ON COLUMN dynamic_personas.monetization_potential IS 'Score 0-100 indicando potencial de monetização da persona';
COMMENT ON COLUMN dynamic_personas.confidence_score IS 'Score 0-1 indicando confiança na definição da persona';
