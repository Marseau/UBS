-- ============================================================================
-- MIGRATION 057: Restaurar campos em account_actions para Sistema AIC
-- ============================================================================
-- A migration 040 simplificou demais a tabela, removendo campos essenciais
-- para o sistema AIC (Agente de Inteligência de Captação).
--
-- Esta migration restaura os campos necessários para:
-- 1. Rastrear interações por campanha (campaign_id)
-- 2. Identificar plataforma de origem (source_platform)
-- 3. Registrar interações bidirecionais (Nós → Lead e Lead → Nós)
-- ============================================================================

-- 1. Adicionar campo campaign_id
ALTER TABLE account_actions
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE SET NULL;

-- 2. Adicionar campo source_platform (restaurar)
ALTER TABLE account_actions
ADD COLUMN IF NOT EXISTS source_platform VARCHAR(20) DEFAULT 'instagram';

-- 3. Atualizar constraint de action_type para incluir interações bidirecionais
ALTER TABLE account_actions
DROP CONSTRAINT IF EXISTS account_actions_action_type_check;

ALTER TABLE account_actions
ADD CONSTRAINT account_actions_action_type_check
CHECK (action_type IN (
    -- Ações que NÓS fazemos (Nós → Lead)
    'follow',           -- Seguimos o lead
    'unfollow',         -- Deixamos de seguir
    'like',             -- Curtimos post do lead
    'comment',          -- Comentamos no post do lead
    'dm',               -- Enviamos DM no Instagram
    'whatsapp_sent',    -- Enviamos WhatsApp
    'story_view',       -- Vimos story do lead

    -- Ações que o LEAD faz conosco (Lead → Nós)
    'like_received',       -- Lead curtiu nosso post/reel
    'comment_received',    -- Lead comentou em nosso post
    'follow_received',     -- Lead nos seguiu
    'dm_received',         -- Lead respondeu DM
    'whatsapp_received',   -- Lead respondeu WhatsApp
    'mention_received'     -- Lead nos mencionou
));

-- 4. Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_account_actions_campaign_id ON account_actions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_account_actions_source_platform ON account_actions(source_platform);
CREATE INDEX IF NOT EXISTS idx_account_actions_username_created ON account_actions(username, created_at DESC);

-- Índice composto para buscar interações recentes de um lead
CREATE INDEX IF NOT EXISTS idx_account_actions_lead_history
ON account_actions(username, created_at DESC)
WHERE success = TRUE;

-- 5. Adicionar constraint de source_platform
ALTER TABLE account_actions
DROP CONSTRAINT IF EXISTS account_actions_source_platform_check;

ALTER TABLE account_actions
ADD CONSTRAINT account_actions_source_platform_check
CHECK (source_platform IN ('instagram', 'whatsapp', 'twitter', 'facebook', 'tiktok', 'linkedin'));

-- 6. Atualizar comentários
COMMENT ON TABLE account_actions IS 'Tabela central de interações do sistema AIC. Registra TODAS as ações bidirecionais (Nós → Lead e Lead → Nós) em todas as plataformas.';
COMMENT ON COLUMN account_actions.campaign_id IS 'ID da campanha associada à ação (sistema AIC é baseado em campaign_id, não tenant_id)';
COMMENT ON COLUMN account_actions.source_platform IS 'Plataforma onde a interação ocorreu: instagram, whatsapp, twitter, etc.';
COMMENT ON COLUMN account_actions.action_type IS 'Tipo de ação: follow, like, comment, dm (nós→lead) ou *_received (lead→nós)';
COMMENT ON COLUMN account_actions.username IS 'Username do lead envolvido na interação';
COMMENT ON COLUMN account_actions.success IS 'TRUE se a ação foi executada com sucesso';
COMMENT ON COLUMN account_actions.error_message IS 'Mensagem de erro caso success = FALSE';
COMMENT ON COLUMN account_actions.created_at IS 'Timestamp de quando a ação foi registrada';

-- ============================================================================
-- 7. Criar função RPC para incrementar engagement do lead
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_lead_engagement(
    p_username VARCHAR,
    p_interaction_type VARCHAR,
    p_score_increment INTEGER DEFAULT 10
)
RETURNS VOID AS $$
BEGIN
    -- Atualizar instagram_leads com a interação
    UPDATE instagram_leads
    SET
        last_interaction_at = NOW(),
        last_interaction_type = p_interaction_type,
        interaction_count = COALESCE(interaction_count, 0) + 1,
        engagement_score = LEAST(COALESCE(engagement_score, 0) + p_score_increment, 100)
    WHERE username = p_username;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_lead_engagement IS 'Incrementa engagement de forma atômica quando recebemos interação de um lead';

-- ============================================================================
-- 8. Criar tabela de controle de verificação de engajamento
-- ============================================================================
CREATE TABLE IF NOT EXISTS instagram_engagement_last_check (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_interactions_found INTEGER DEFAULT 0,
    total_interactions_processed INTEGER DEFAULT 0,

    CONSTRAINT single_row CHECK (id = 1)
);

-- Inserir registro único se não existir
INSERT INTO instagram_engagement_last_check (id, last_check_at)
VALUES (1, NOW() - INTERVAL '24 hours')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE instagram_engagement_last_check IS 'Controle de última verificação de engajamento do Instagram (single row)';

-- ============================================================================
-- 9. View para estatísticas de interações por lead
-- ============================================================================
CREATE OR REPLACE VIEW v_lead_interaction_stats AS
SELECT
    username,
    campaign_id,
    source_platform,
    COUNT(*) FILTER (WHERE action_type LIKE '%_received') as interactions_received,
    COUNT(*) FILTER (WHERE action_type NOT LIKE '%_received') as interactions_sent,
    COUNT(*) as total_interactions,
    MAX(created_at) as last_interaction_at,
    MAX(CASE WHEN action_type LIKE '%_received' THEN created_at END) as last_received_at,
    MAX(CASE WHEN action_type = 'follow_received' THEN created_at END) as followed_us_at
FROM account_actions
WHERE success = TRUE
GROUP BY username, campaign_id, source_platform;

COMMENT ON VIEW v_lead_interaction_stats IS 'Estatísticas de interações por lead (para dashboard e IA)';

-- ============================================================================
-- Resumo da estrutura final
-- ============================================================================
-- account_actions
--   ├── id (UUID, PK)
--   ├── lead_id (UUID, FK → instagram_leads)
--   ├── campaign_id (UUID, FK → cluster_campaigns) ← ADICIONADO
--   ├── username (VARCHAR)
--   ├── action_type (VARCHAR) - inclui *_received ← EXPANDIDO
--   ├── source_platform (VARCHAR) ← RESTAURADO
--   ├── success (BOOLEAN)
--   ├── error_message (TEXT)
--   └── created_at (TIMESTAMPTZ)
