-- Migration 073: Adicionar coluna de nichos sugeridos nas campanhas
-- Criado em: 2025-12-11
-- Objetivo: Armazenar nichos sugeridos/validados por campanha (elimina hardcoded no frontend)

-- =====================================================
-- COLUNA: suggested_niches
-- Armazena nichos gerados/validados para a campanha
-- Estrutura: [{name, seeds[], is_validated, validation_result, created_at}]
-- =====================================================
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS suggested_niches JSONB DEFAULT '[]'::jsonb;

-- =====================================================
-- COLUNA: active_niche_index
-- Índice do nicho ativo dentro de suggested_niches
-- =====================================================
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS active_niche_index INTEGER DEFAULT 0;

-- =====================================================
-- ÍNDICE GIN para busca em suggested_niches
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_suggested_niches
ON cluster_campaigns USING GIN (suggested_niches);

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON COLUMN cluster_campaigns.suggested_niches IS 'Array JSONB de nichos sugeridos: [{name, seeds[], is_validated, validation_result, clustering_result, created_at}]';
COMMENT ON COLUMN cluster_campaigns.active_niche_index IS 'Índice do nicho atualmente ativo dentro de suggested_niches';

-- =====================================================
-- FUNÇÃO: Adicionar nicho sugerido a uma campanha
-- =====================================================
CREATE OR REPLACE FUNCTION add_suggested_niche(
    p_campaign_id UUID,
    p_niche_name VARCHAR,
    p_seeds TEXT[]
) RETURNS JSONB AS $$
DECLARE
    v_new_niche JSONB;
    v_result JSONB;
BEGIN
    -- Criar objeto do novo nicho
    v_new_niche := jsonb_build_object(
        'name', p_niche_name,
        'seeds', to_jsonb(p_seeds),
        'is_validated', false,
        'validation_result', null,
        'clustering_result', null,
        'created_at', NOW()
    );

    -- Adicionar ao array de nichos sugeridos
    UPDATE cluster_campaigns
    SET suggested_niches = COALESCE(suggested_niches, '[]'::jsonb) || v_new_niche,
        updated_at = NOW()
    WHERE id = p_campaign_id
    RETURNING suggested_niches INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Atualizar validação de um nicho
-- =====================================================
CREATE OR REPLACE FUNCTION update_niche_validation(
    p_campaign_id UUID,
    p_niche_index INTEGER,
    p_is_validated BOOLEAN,
    p_validation_result JSONB
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    UPDATE cluster_campaigns
    SET suggested_niches = jsonb_set(
        jsonb_set(
            suggested_niches,
            ARRAY[p_niche_index::text, 'is_validated'],
            to_jsonb(p_is_validated)
        ),
        ARRAY[p_niche_index::text, 'validation_result'],
        p_validation_result
    ),
    updated_at = NOW()
    WHERE id = p_campaign_id
    RETURNING suggested_niches INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Atualizar clustering de um nicho
-- =====================================================
CREATE OR REPLACE FUNCTION update_niche_clustering(
    p_campaign_id UUID,
    p_niche_index INTEGER,
    p_clustering_result JSONB
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    UPDATE cluster_campaigns
    SET suggested_niches = jsonb_set(
        suggested_niches,
        ARRAY[p_niche_index::text, 'clustering_result'],
        p_clustering_result
    ),
    updated_at = NOW()
    WHERE id = p_campaign_id
    RETURNING suggested_niches INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Definir nicho ativo
-- =====================================================
CREATE OR REPLACE FUNCTION set_active_niche(
    p_campaign_id UUID,
    p_niche_index INTEGER
) RETURNS VOID AS $$
BEGIN
    UPDATE cluster_campaigns
    SET active_niche_index = p_niche_index,
        -- Também atualiza os campos principais com os dados do nicho ativo
        nicho_principal = (suggested_niches->p_niche_index->>'name'),
        nicho = (suggested_niches->p_niche_index->>'name'),
        keywords = ARRAY(SELECT jsonb_array_elements_text(suggested_niches->p_niche_index->'seeds')),
        updated_at = NOW()
    WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;
