-- ============================================================================
-- MIGRATION 054: Sistema Unificado de Outreach Multi-Canal
-- ============================================================================
-- Descrição: Sistema inteligente de DM/WhatsApp baseado em campanhas e clusters
--
-- Modelo:
--   1. campaign_outreach_queue - Fila unificada de leads por campanha
--   2. outreach_messages - Histórico de mensagens enviadas
--   3. outreach_templates - Templates base para personalização IA
--
-- Regras:
--   - Um lead só pode receber outreach por UM canal por campanha (Instagram OU WhatsApp)
--   - Prioridade: WhatsApp (se tem telefone) > Instagram DM
--   - IA personaliza mensagem baseado no perfil do lead + contexto da campanha
-- ============================================================================

-- ============================================================================
-- 1. TABELA: campaign_outreach_queue
-- Fila unificada de outreach por campanha
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_outreach_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Referências
    campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,

    -- Canal de outreach (EXCLUSIVO - um ou outro)
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('instagram_dm', 'whatsapp')),

    -- Dados do lead (snapshot para evitar JOINs pesados no N8N)
    lead_username VARCHAR(100),
    lead_full_name VARCHAR(255),
    lead_phone VARCHAR(50),
    lead_email VARCHAR(255),
    lead_bio TEXT,
    lead_business_category VARCHAR(255),
    lead_segment VARCHAR(255),
    lead_hashtags_bio JSONB,
    lead_hashtags_posts JSONB,

    -- Scoring e priorização
    priority_score INTEGER DEFAULT 0,  -- Baseado no cluster/hashtags
    fit_score DECIMAL(5,2),            -- Fit com a campanha (0-100)

    -- Status do outreach
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Aguardando envio
        'scheduled',    -- Agendado para horário específico
        'processing',   -- Em processamento (evita duplicidade)
        'sent',         -- Enviado com sucesso
        'failed',       -- Falha no envio
        'replied',      -- Lead respondeu
        'converted',    -- Lead converteu (agendou/comprou)
        'blocked',      -- Conta bloqueada/não aceita DM
        'skipped'       -- Pulado (já contatado por outro canal)
    )),

    -- Agendamento
    scheduled_at TIMESTAMP WITH TIME ZONE,

    -- Execução
    processing_started_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    converted_at TIMESTAMP WITH TIME ZONE,

    -- Mensagem gerada pela IA
    message_text TEXT,
    message_generated_by VARCHAR(50),  -- 'gpt-4o', 'gpt-4o-mini', 'template'
    generation_prompt TEXT,
    personalization_data JSONB,        -- Dados usados para personalizar

    -- Resultado
    delivery_status VARCHAR(50),       -- 'delivered', 'read', 'failed', etc.
    error_message TEXT,
    response_text TEXT,                -- Se lead respondeu

    -- Controle de tentativas
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,

    -- CONSTRAINT: Um lead só pode ter 1 registro por campanha (exclusividade de canal)
    CONSTRAINT unique_lead_campaign UNIQUE (lead_id, campaign_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_outreach_queue_campaign ON campaign_outreach_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_lead ON campaign_outreach_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_status ON campaign_outreach_queue(status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_channel ON campaign_outreach_queue(channel);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_scheduled ON campaign_outreach_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_outreach_queue_pending ON campaign_outreach_queue(status, priority_score DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outreach_queue_processing ON campaign_outreach_queue(processing_started_at) WHERE status = 'processing';

-- ============================================================================
-- 2. TABELA: outreach_messages
-- Histórico completo de mensagens (para analytics e auditoria)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Referências
    queue_id UUID NOT NULL REFERENCES campaign_outreach_queue(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,

    -- Canal e direção
    channel VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'inbound')),

    -- Conteúdo
    message_text TEXT NOT NULL,
    message_type VARCHAR(30) DEFAULT 'text' CHECK (message_type IN (
        'text', 'image', 'video', 'audio', 'document', 'template'
    )),
    media_url TEXT,

    -- Geração IA (se outbound)
    generated_by VARCHAR(50),
    generation_prompt TEXT,
    generation_tokens INTEGER,
    generation_cost DECIMAL(10,6),

    -- Status de entrega
    external_id VARCHAR(255),          -- ID no Instagram/WhatsApp
    delivery_status VARCHAR(30),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_outreach_messages_queue ON outreach_messages(queue_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_campaign ON outreach_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead ON outreach_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_created ON outreach_messages(created_at DESC);

-- ============================================================================
-- 3. TABELA: outreach_templates
-- Templates base para personalização (IA usa como inspiração)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificação
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Categorização
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('instagram_dm', 'whatsapp', 'both')),
    category VARCHAR(50),              -- 'introduction', 'follow_up', 'offer', etc.
    industry VARCHAR(100),             -- 'saude', 'beleza', 'consultoria', etc.

    -- Template
    template_text TEXT NOT NULL,       -- Texto com placeholders {{nome}}, {{negocio}}, etc.
    placeholders JSONB,                -- Lista de placeholders disponíveis

    -- Instruções para IA
    ai_instructions TEXT,              -- Como a IA deve personalizar
    tone VARCHAR(50),                  -- 'formal', 'casual', 'friendly', 'professional'
    max_length INTEGER DEFAULT 500,    -- Limite de caracteres

    -- Performance
    times_used INTEGER DEFAULT 0,
    avg_response_rate DECIMAL(5,2),
    avg_conversion_rate DECIMAL(5,2),

    -- Status
    active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_outreach_templates_channel ON outreach_templates(channel) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_outreach_templates_category ON outreach_templates(category) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_outreach_templates_industry ON outreach_templates(industry) WHERE active = true;

-- ============================================================================
-- 4. TABELA: outreach_daily_stats
-- Estatísticas diárias por campanha/canal (para dashboards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Dimensões
    campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    stat_date DATE NOT NULL,

    -- Métricas
    messages_sent INTEGER DEFAULT 0,
    messages_delivered INTEGER DEFAULT 0,
    messages_read INTEGER DEFAULT 0,
    messages_replied INTEGER DEFAULT 0,
    messages_converted INTEGER DEFAULT 0,
    messages_failed INTEGER DEFAULT 0,

    -- Taxas
    delivery_rate DECIMAL(5,2),
    read_rate DECIMAL(5,2),
    response_rate DECIMAL(5,2),
    conversion_rate DECIMAL(5,2),

    -- Custos IA
    total_tokens INTEGER DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,

    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_campaign_channel_date UNIQUE (campaign_id, channel, stat_date)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_outreach_stats_date ON outreach_daily_stats(stat_date DESC);

-- ============================================================================
-- 5. FUNÇÃO: Selecionar canal automaticamente
-- Retorna 'whatsapp' se lead tem telefone, senão 'instagram_dm'
-- ============================================================================
CREATE OR REPLACE FUNCTION select_outreach_channel(
    p_lead_id UUID,
    p_campaign_preferred_channel VARCHAR DEFAULT 'auto'
)
RETURNS VARCHAR AS $$
DECLARE
    v_has_phone BOOLEAN;
    v_has_instagram BOOLEAN;
BEGIN
    -- Verificar se lead tem telefone
    SELECT
        (phone IS NOT NULL OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)),
        (username IS NOT NULL AND username != '')
    INTO v_has_phone, v_has_instagram
    FROM instagram_leads
    WHERE id = p_lead_id;

    -- Se campanha especificou canal, respeitar (se possível)
    IF p_campaign_preferred_channel = 'whatsapp' AND v_has_phone THEN
        RETURN 'whatsapp';
    ELSIF p_campaign_preferred_channel = 'instagram_dm' AND v_has_instagram THEN
        RETURN 'instagram_dm';
    END IF;

    -- Auto: Priorizar WhatsApp se tem telefone
    IF v_has_phone THEN
        RETURN 'whatsapp';
    ELSIF v_has_instagram THEN
        RETURN 'instagram_dm';
    ELSE
        RETURN NULL;  -- Sem canal disponível
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNÇÃO: Popular fila de outreach para uma campanha
-- Adiciona leads qualificados à fila baseado no cluster
-- ============================================================================
CREATE OR REPLACE FUNCTION populate_outreach_queue(
    p_campaign_id UUID,
    p_limit INTEGER DEFAULT 100,
    p_min_fit_score DECIMAL DEFAULT 50.0
)
RETURNS TABLE (
    leads_added INTEGER,
    channel_instagram INTEGER,
    channel_whatsapp INTEGER
) AS $$
DECLARE
    v_campaign RECORD;
    v_leads_added INTEGER := 0;
    v_channel_instagram INTEGER := 0;
    v_channel_whatsapp INTEGER := 0;
    v_lead RECORD;
    v_channel VARCHAR(20);
    v_fit_score DECIMAL;
BEGIN
    -- Buscar dados da campanha
    SELECT * INTO v_campaign
    FROM cluster_campaigns
    WHERE id = p_campaign_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id;
    END IF;

    -- Iterar sobre leads qualificados que ainda não estão na fila
    FOR v_lead IN (
        SELECT
            il.*,
            -- Calcular fit score baseado em hashtags que batem com keywords da campanha
            COALESCE(
                (
                    SELECT COUNT(*)::DECIMAL * 10
                    FROM (
                        SELECT jsonb_array_elements_text(il.hashtags_bio) AS ht
                        UNION ALL
                        SELECT jsonb_array_elements_text(il.hashtags_posts) AS ht
                    ) hashtags
                    WHERE hashtags.ht = ANY(v_campaign.keywords)
                ),
                0
            ) +
            -- Bonus por ter contato
            CASE WHEN il.phone IS NOT NULL THEN 20 ELSE 0 END +
            CASE WHEN il.email IS NOT NULL THEN 10 ELSE 0 END
            AS calculated_fit_score
        FROM instagram_leads il
        WHERE
            -- Não está na fila desta campanha
            NOT EXISTS (
                SELECT 1 FROM campaign_outreach_queue coq
                WHERE coq.lead_id = il.id AND coq.campaign_id = p_campaign_id
            )
            -- Não foi contatado recentemente (30 dias)
            AND NOT EXISTS (
                SELECT 1 FROM campaign_outreach_queue coq
                WHERE coq.lead_id = il.id
                AND coq.sent_at > NOW() - INTERVAL '30 days'
            )
            -- Tem algum meio de contato
            AND (
                il.username IS NOT NULL
                OR il.phone IS NOT NULL
                OR il.email IS NOT NULL
            )
            -- Não está bloqueado
            AND (il.follow_status IS NULL OR il.follow_status != 'blocked')
        ORDER BY calculated_fit_score DESC
        LIMIT p_limit
    )
    LOOP
        -- Calcular fit score
        v_fit_score := v_lead.calculated_fit_score;

        -- Pular se fit score muito baixo
        IF v_fit_score < p_min_fit_score THEN
            CONTINUE;
        END IF;

        -- Selecionar canal
        v_channel := select_outreach_channel(v_lead.id, v_campaign.preferred_channel);

        -- Pular se não tem canal disponível
        IF v_channel IS NULL THEN
            CONTINUE;
        END IF;

        -- Inserir na fila
        INSERT INTO campaign_outreach_queue (
            campaign_id,
            lead_id,
            channel,
            lead_username,
            lead_full_name,
            lead_phone,
            lead_email,
            lead_bio,
            lead_business_category,
            lead_segment,
            lead_hashtags_bio,
            lead_hashtags_posts,
            priority_score,
            fit_score,
            status
        ) VALUES (
            p_campaign_id,
            v_lead.id,
            v_channel,
            v_lead.username,
            v_lead.full_name,
            COALESCE(v_lead.phone, (v_lead.additional_phones->>0)),
            COALESCE(v_lead.email, (v_lead.additional_emails->>0)),
            v_lead.bio,
            v_lead.business_category,
            v_lead.segment,
            v_lead.hashtags_bio,
            v_lead.hashtags_posts,
            v_fit_score::INTEGER,
            v_fit_score,
            'pending'
        );

        v_leads_added := v_leads_added + 1;

        IF v_channel = 'instagram_dm' THEN
            v_channel_instagram := v_channel_instagram + 1;
        ELSE
            v_channel_whatsapp := v_channel_whatsapp + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_leads_added, v_channel_instagram, v_channel_whatsapp;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEW: Próximos outreach pendentes (para N8N)
-- ============================================================================
CREATE OR REPLACE VIEW v_pending_outreach AS
SELECT
    coq.*,
    cc.campaign_name,
    cc.nicho_principal,
    cc.nicho_secundario,
    cc.keywords AS campaign_keywords,
    cc.service_description,
    cc.target_audience,
    cp.client_name,
    cp.project_name
FROM campaign_outreach_queue coq
JOIN cluster_campaigns cc ON coq.campaign_id = cc.id
JOIN cluster_projects cp ON cc.project_id = cp.id
WHERE coq.status = 'pending'
AND (coq.scheduled_at IS NULL OR coq.scheduled_at <= NOW())
ORDER BY coq.priority_score DESC, coq.created_at ASC;

-- ============================================================================
-- 8. FUNÇÃO: Marcar como processing (evita duplicidade)
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_outreach_item(
    p_queue_id UUID,
    p_processor_id VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE campaign_outreach_queue
    SET
        status = 'processing',
        processing_started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_queue_id
    AND status = 'pending';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. TRIGGER: Atualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_outreach_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_outreach_queue_updated ON campaign_outreach_queue;
CREATE TRIGGER trg_outreach_queue_updated
    BEFORE UPDATE ON campaign_outreach_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_outreach_timestamp();

DROP TRIGGER IF EXISTS trg_outreach_templates_updated ON outreach_templates;
CREATE TRIGGER trg_outreach_templates_updated
    BEFORE UPDATE ON outreach_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_outreach_timestamp();

-- ============================================================================
-- 10. INSERIR TEMPLATES INICIAIS
-- ============================================================================
INSERT INTO outreach_templates (name, description, channel, category, industry, template_text, ai_instructions, tone) VALUES
(
    'Introdução Profissional - Saúde',
    'Template para primeiro contato com profissionais de saúde',
    'both',
    'introduction',
    'saude',
    'Oi {{nome}}! Vi que você trabalha com {{especialidade}} e achei muito interessante seu trabalho. Tenho uma proposta que pode te ajudar a {{beneficio}}. Posso te contar mais?',
    'Personalize baseado na bio do lead. Mencione algo específico do perfil. Seja breve e direto. Não seja invasivo.',
    'professional'
),
(
    'Introdução Casual - Beleza',
    'Template para primeiro contato com profissionais de beleza',
    'both',
    'introduction',
    'beleza',
    'Oi {{nome}}! 💫 Amei seu trabalho com {{especialidade}}! Tô desenvolvendo algo que pode te ajudar a {{beneficio}}. Bora trocar uma ideia?',
    'Use tom mais descontraído. Pode usar 1-2 emojis. Elogie algo específico do trabalho. Seja breve.',
    'casual'
),
(
    'Introdução Consultoria/Coaching',
    'Template para consultores e coaches',
    'both',
    'introduction',
    'consultoria',
    'Olá {{nome}}, tudo bem? Acompanho seu trabalho com {{especialidade}} e admiro sua abordagem. Tenho uma oportunidade que pode complementar o que você já faz. Podemos conversar?',
    'Seja respeitoso e profissional. Demonstre que conhece o trabalho da pessoa. Não prometa demais.',
    'formal'
),
(
    'Follow-up Gentil',
    'Template para segundo contato após não resposta',
    'both',
    'follow_up',
    NULL,
    'Oi {{nome}}! Mandei uma mensagem há alguns dias sobre {{assunto}}. Sei que a rotina é corrida, mas queria saber se conseguiu dar uma olhada. Qualquer coisa, tô por aqui!',
    'Seja gentil e não pressione. Relembre brevemente o contexto. Deixe porta aberta.',
    'friendly'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. ADICIONAR COLUNA preferred_channel NA TABELA cluster_campaigns
-- ============================================================================
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(20) DEFAULT 'auto'
CHECK (preferred_channel IN ('auto', 'instagram_dm', 'whatsapp'));

-- ============================================================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ============================================================================
COMMENT ON TABLE campaign_outreach_queue IS 'Fila unificada de outreach multi-canal por campanha. Um lead só pode ter 1 canal por campanha.';
COMMENT ON TABLE outreach_messages IS 'Histórico completo de mensagens enviadas e recebidas para analytics.';
COMMENT ON TABLE outreach_templates IS 'Templates base que a IA usa como inspiração para personalizar mensagens.';
COMMENT ON TABLE outreach_daily_stats IS 'Estatísticas diárias agregadas por campanha/canal.';
COMMENT ON FUNCTION select_outreach_channel IS 'Seleciona automaticamente o melhor canal (WhatsApp > Instagram DM).';
COMMENT ON FUNCTION populate_outreach_queue IS 'Popula a fila de outreach com leads qualificados de uma campanha.';
COMMENT ON FUNCTION claim_outreach_item IS 'Marca um item como processing para evitar processamento duplicado.';
