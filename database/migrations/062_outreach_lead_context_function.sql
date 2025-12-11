-- =====================================================
-- MIGRATION 062: Função de Contexto Completo para Outreach
-- Busca todos os dados do lead para primeira mensagem personalizada
-- =====================================================

-- Função principal: Retorna contexto completo do lead para outreach
CREATE OR REPLACE FUNCTION get_outreach_lead_context(
    p_lead_id UUID DEFAULT NULL,
    p_username TEXT DEFAULT NULL,
    p_campaign_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_lead RECORD;
    v_persona RECORD;
    v_cluster RECORD;
    v_campaign RECORD;
    v_interactions JSONB;
    v_result JSONB;
BEGIN
    -- 1. Buscar dados do lead (por ID ou username)
    IF p_lead_id IS NOT NULL THEN
        SELECT * INTO v_lead FROM instagram_leads WHERE id = p_lead_id;
    ELSIF p_username IS NOT NULL THEN
        SELECT * INTO v_lead FROM instagram_leads WHERE username = p_username;
    ELSE
        RETURN jsonb_build_object('error', 'Forneça lead_id ou username');
    END IF;

    -- Se lead não encontrado
    IF v_lead IS NULL THEN
        RETURN jsonb_build_object(
            'has_profile', false,
            'lead', NULL,
            'persona', NULL,
            'cluster', NULL,
            'campaign', NULL,
            'interactions', '[]'::jsonb
        );
    END IF;

    -- 2. Buscar persona associada ao lead
    SELECT
        dp.*,
        lpa.match_score,
        lpa.confidence as match_confidence
    INTO v_persona
    FROM lead_persona_assignments lpa
    JOIN dynamic_personas dp ON dp.id = lpa.persona_id
    WHERE lpa.lead_id = v_lead.id
      AND lpa.is_primary = true
      AND dp.is_active = true
    LIMIT 1;

    -- 3. Buscar cluster associado à persona (se existir)
    IF v_persona.primary_cluster_id IS NOT NULL THEN
        SELECT * INTO v_cluster
        FROM hashtag_clusters_dynamic
        WHERE id = v_persona.primary_cluster_id;
    END IF;

    -- 4. Buscar dados da campanha (se fornecido)
    IF p_campaign_id IS NOT NULL THEN
        SELECT
            cc.*,
            cp.client_name,
            cp.project_name
        INTO v_campaign
        FROM cluster_campaigns cc
        JOIN cluster_projects cp ON cp.id = cc.project_id
        WHERE cc.id = p_campaign_id;
    END IF;

    -- 5. Buscar histórico de interações (últimas 10)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'action_type', action_type,
            'source_platform', source_platform,
            'created_at', created_at,
            'success', success,
            'notes', notes
        ) ORDER BY created_at DESC
    ), '[]'::jsonb)
    INTO v_interactions
    FROM (
        SELECT action_type, source_platform, created_at, success, notes
        FROM account_actions
        WHERE username = v_lead.username
        ORDER BY created_at DESC
        LIMIT 10
    ) sub;

    -- 6. Montar resultado final
    v_result := jsonb_build_object(
        'has_profile', true,

        -- Dados do Lead
        'lead', jsonb_build_object(
            'id', v_lead.id,
            'username', v_lead.username,
            'full_name', COALESCE(v_lead.full_name, ''),
            'bio', COALESCE(v_lead.bio, ''),
            'business_category', COALESCE(v_lead.business_category, ''),
            'segment', COALESCE(v_lead.segment, ''),
            'is_business', COALESCE(v_lead.is_business_account, false),
            'is_verified', COALESCE(v_lead.is_verified, false),
            'followers', COALESCE(v_lead.followers_count, 0),
            'following', COALESCE(v_lead.following_count, 0),
            'posts', COALESCE(v_lead.posts_count, 0),
            'website', COALESCE(v_lead.website, v_lead.external_url, ''),
            'city', COALESCE(v_lead.city, ''),
            'state', COALESCE(v_lead.state, ''),
            'profession', COALESCE(v_lead.profession, ''),
            'hashtags_bio', COALESCE(v_lead.hashtags_bio, ARRAY[]::TEXT[]),
            'hashtags_posts', COALESCE(v_lead.hashtags_posts, ARRAY[]::TEXT[]),
            'lead_score', COALESCE(v_lead.lead_score, 0),
            'contact_status', COALESCE(v_lead.contact_status, 'new'),
            'has_phone', (v_lead.phone IS NOT NULL AND v_lead.phone != ''),
            'has_email', (v_lead.email IS NOT NULL AND v_lead.email != '')
        ),

        -- Persona (se existir)
        'persona', CASE WHEN v_persona.id IS NOT NULL THEN jsonb_build_object(
            'id', v_persona.id,
            'name', v_persona.persona_name,
            'emoji', v_persona.persona_avatar_emoji,
            'age_range', COALESCE(v_persona.age_range, ''),
            'primary_occupation', COALESCE(v_persona.primary_occupation, ''),
            'business_stage', COALESCE(v_persona.business_stage, ''),
            'experience_level', COALESCE(v_persona.experience_level, ''),
            -- DORES (crucial para personalização)
            'pain_points', COALESCE(v_persona.core_pain_points, ARRAY[]::TEXT[]),
            -- MOTIVAÇÕES
            'motivations', COALESCE(v_persona.primary_motivations, ARRAY[]::TEXT[]),
            -- ASPIRAÇÕES
            'aspirations', COALESCE(v_persona.aspirations, ARRAY[]::TEXT[]),
            -- MEDOS E OBJEÇÕES
            'fears_objections', COALESCE(v_persona.fears_and_objections, ARRAY[]::TEXT[]),
            -- ESTILO DE COMUNICAÇÃO
            'communication_style', COALESCE(v_persona.preferred_communication_style, 'direto_e_pratico'),
            -- GATILHOS DE CONFIANÇA
            'trust_triggers', COALESCE(v_persona.trust_triggers, ARRAY[]::TEXT[]),
            -- FATORES DE DECISÃO
            'decision_factors', COALESCE(v_persona.decision_factors, ARRAY[]::TEXT[]),
            -- ABORDAGEM IDEAL (gerada por IA)
            'ideal_first_contact', COALESCE(v_persona.ideal_first_contact, ''),
            -- COMO LIDAR COM OBJEÇÕES
            'objection_handling', COALESCE(v_persona.objection_handling, '{}'::jsonb),
            -- SCORES
            'match_score', COALESCE(v_persona.match_score, 0),
            'monetization_potential', COALESCE(v_persona.monetization_potential, 0),
            'confidence', COALESCE(v_persona.confidence_score, 0)
        ) ELSE NULL END,

        -- Cluster (se existir)
        'cluster', CASE WHEN v_cluster.id IS NOT NULL THEN jsonb_build_object(
            'id', v_cluster.id,
            'name', v_cluster.cluster_name,
            'hashtags', COALESCE(v_cluster.hashtags, ARRAY[]::TEXT[]),
            'lead_count', COALESCE(v_cluster.lead_count, 0)
        ) ELSE NULL END,

        -- Campanha (se fornecida)
        'campaign', CASE WHEN v_campaign.id IS NOT NULL THEN jsonb_build_object(
            'id', v_campaign.id,
            'name', v_campaign.campaign_name,
            'client_name', v_campaign.client_name,
            'project_name', v_campaign.project_name,
            'nicho_principal', COALESCE(v_campaign.nicho_principal, ''),
            'nicho_secundario', COALESCE(v_campaign.nicho_secundario, ''),
            'service_description', COALESCE(v_campaign.service_description, ''),
            'target_audience', COALESCE(v_campaign.target_audience, ''),
            'value_proposition', COALESCE(v_campaign.value_proposition, ''),
            'communication_tone', COALESCE(v_campaign.communication_tone, 'profissional_amigavel'),
            'keywords', COALESCE(v_campaign.keywords, ARRAY[]::TEXT[])
        ) ELSE NULL END,

        -- Histórico de interações
        'interactions', v_interactions,
        'interactions_count', jsonb_array_length(v_interactions),

        -- Metadados
        'context_generated_at', NOW()
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Função auxiliar: Formatar interações para prompt de IA
CREATE OR REPLACE FUNCTION format_lead_interactions_for_ai(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_interaction RECORD;
    v_action_label TEXT;
BEGIN
    FOR v_interaction IN
        SELECT
            action_type,
            source_platform,
            created_at,
            success
        FROM account_actions
        WHERE username = p_username
        ORDER BY created_at DESC
        LIMIT 10
    LOOP
        -- Traduzir action_type para português
        v_action_label := CASE v_interaction.action_type
            WHEN 'follow' THEN 'Seguimos o lead'
            WHEN 'unfollow' THEN 'Deixamos de seguir'
            WHEN 'like' THEN 'Curtimos post'
            WHEN 'comment' THEN 'Comentamos'
            WHEN 'dm' THEN 'Enviamos DM'
            WHEN 'like_received' THEN 'Lead curtiu nosso post'
            WHEN 'comment_received' THEN 'Lead comentou'
            WHEN 'follow_received' THEN 'Lead nos seguiu'
            WHEN 'dm_received' THEN 'Lead respondeu DM'
            WHEN 'whatsapp_sent' THEN 'Enviamos WhatsApp'
            WHEN 'whatsapp_received' THEN 'Lead respondeu WhatsApp'
            ELSE v_interaction.action_type
        END;

        v_result := v_result || '- ' ||
            TO_CHAR(v_interaction.created_at, 'DD/MM') || ': ' ||
            v_action_label ||
            ' [' || COALESCE(v_interaction.source_platform, 'instagram') || ']' ||
            CASE WHEN NOT v_interaction.success THEN ' (falhou)' ELSE '' END ||
            E'\n';
    END LOOP;

    IF v_result = '' THEN
        RETURN 'Nenhuma interação anterior registrada.';
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- View para fila de outreach com contexto enriquecido
CREATE OR REPLACE VIEW v_outreach_queue_enriched AS
SELECT
    coq.id as queue_id,
    coq.campaign_id,
    coq.lead_id,
    coq.channel,
    coq.status,
    coq.priority_score,
    coq.created_at as queued_at,

    -- Dados do Lead
    il.username,
    il.full_name,
    il.bio,
    il.business_category,
    il.segment,
    il.city,
    il.state,
    il.profession,
    il.followers_count,
    il.hashtags_bio,
    il.hashtags_posts,
    il.phone AS lead_phone,
    il.email AS lead_email,
    il.lead_score,

    -- Dados da Campanha
    cc.campaign_name,
    cc.nicho_principal,
    cc.nicho_secundario,
    cc.service_description,
    cc.target_audience,
    cc.value_proposition,
    cc.communication_tone,
    cc.keywords as campaign_keywords,

    -- Dados do Projeto/Cliente
    cp.client_name,
    cp.project_name,

    -- Persona (se existir)
    dp.persona_name,
    dp.core_pain_points as persona_pain_points,
    dp.primary_motivations as persona_motivations,
    dp.fears_and_objections as persona_objections,
    dp.preferred_communication_style as persona_comm_style,
    dp.ideal_first_contact as persona_ideal_approach,
    dp.trust_triggers as persona_trust_triggers,
    lpa.match_score as persona_match_score

FROM campaign_outreach_queue coq
JOIN instagram_leads il ON il.id = coq.lead_id
JOIN cluster_campaigns cc ON cc.id = coq.campaign_id
JOIN cluster_projects cp ON cp.id = cc.project_id
LEFT JOIN lead_persona_assignments lpa ON lpa.lead_id = il.id AND lpa.is_primary = true
LEFT JOIN dynamic_personas dp ON dp.id = lpa.persona_id AND dp.is_active = true
WHERE coq.status = 'pending'
ORDER BY coq.priority_score DESC, coq.created_at ASC;

-- Comentários
COMMENT ON FUNCTION get_outreach_lead_context IS 'Retorna contexto completo do lead para geração de mensagem personalizada de outreach';
COMMENT ON FUNCTION format_lead_interactions_for_ai IS 'Formata histórico de interações em texto legível para prompt de IA';
COMMENT ON VIEW v_outreach_queue_enriched IS 'View enriquecida da fila de outreach com dados de lead, campanha e persona';

-- Índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_account_actions_username ON account_actions(username);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_city ON instagram_leads(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_leads_profession ON instagram_leads(profession) WHERE profession IS NOT NULL;
