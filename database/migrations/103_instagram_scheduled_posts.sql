-- =====================================================
-- MIGRATION: Sistema de Agendamento de Publicações Instagram
-- Descrição: Tabela para agendamento de posts Instagram vinculados a campanhas
--            usando credenciais Meta Graph API já configuradas em instagram_accounts
-- Data: 2026-02-06
-- =====================================================

-- =====================================================
-- TABELA: instagram_scheduled_posts
-- Armazena posts agendados para publicação no Instagram
-- =====================================================
CREATE TABLE IF NOT EXISTS instagram_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculo com campanha (herda credenciais via instagram_accounts)
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- Identificação do conteúdo Canva
  canva_design_id TEXT,              -- ID do design no Canva (opcional)
  canva_design_name TEXT NOT NULL,   -- Nome do design (usado para busca)

  -- Tipo e conteúdo
  content_type TEXT NOT NULL DEFAULT 'post'
    CHECK (content_type IN ('post', 'carousel', 'reel')),
  caption TEXT,                       -- Legenda do post
  hashtags TEXT[],                    -- Array de hashtags (sem #)

  -- Agendamento
  scheduled_at TIMESTAMPTZ NOT NULL,  -- Data/hora para publicar (UTC)

  -- Status e resultado
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'failed', 'cancelled')),
  published_at TIMESTAMPTZ,           -- Quando foi efetivamente publicado
  instagram_media_id TEXT,            -- ID retornado pelo IG após publicação
  instagram_permalink TEXT,           -- URL permanente do post
  error_message TEXT,                 -- Mensagem de erro se falhou
  retry_count INTEGER DEFAULT 0,      -- Número de tentativas
  last_retry_at TIMESTAMPTZ,          -- Última tentativa

  -- URLs do conteúdo (preenchidas após export do Canva)
  media_url TEXT,                     -- URL da imagem/vídeo exportada (Supabase Storage)
  thumbnail_url TEXT,                 -- Thumbnail do Canva (preview)

  -- Metadados adicionais
  metadata JSONB DEFAULT '{}',        -- Dados extras (ex: week_number, theme)

  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Índices para queries comuns
CREATE INDEX idx_isp_campaign ON instagram_scheduled_posts(campaign_id);
CREATE INDEX idx_isp_scheduled ON instagram_scheduled_posts(scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_isp_status ON instagram_scheduled_posts(status);
CREATE INDEX idx_isp_canva ON instagram_scheduled_posts(canva_design_id)
  WHERE canva_design_id IS NOT NULL;

-- Índice composto para buscar próximos posts a publicar
CREATE INDEX idx_isp_pending_scheduled ON instagram_scheduled_posts(scheduled_at, campaign_id)
  WHERE status = 'pending';

-- =====================================================
-- TRIGGER: Atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_instagram_scheduled_posts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_instagram_scheduled_posts_timestamp
  BEFORE UPDATE ON instagram_scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_scheduled_posts_timestamp();

-- =====================================================
-- FUNÇÃO: get_pending_scheduled_posts
-- Retorna posts prontos para publicação (scheduled_at <= NOW())
-- =====================================================
CREATE OR REPLACE FUNCTION get_pending_scheduled_posts(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  post_id UUID,
  campaign_id UUID,
  campaign_name TEXT,
  canva_design_id TEXT,
  canva_design_name TEXT,
  content_type TEXT,
  caption TEXT,
  hashtags TEXT[],
  scheduled_at TIMESTAMPTZ,
  media_url TEXT,
  -- Credenciais da conta Instagram da campanha
  instagram_account_id UUID,
  instagram_business_account_id TEXT,
  access_token_encrypted TEXT,
  instagram_username TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id AS post_id,
    sp.campaign_id,
    cc.campaign_name,
    sp.canva_design_id,
    sp.canva_design_name,
    sp.content_type,
    sp.caption,
    sp.hashtags,
    sp.scheduled_at,
    sp.media_url,
    ia.id AS instagram_account_id,
    ia.instagram_business_account_id,
    ia.access_token_encrypted,
    ia.instagram_username
  FROM instagram_scheduled_posts sp
  JOIN cluster_campaigns cc ON cc.id = sp.campaign_id
  LEFT JOIN instagram_accounts ia ON ia.campaign_id = sp.campaign_id
    AND ia.status = 'active'
    AND ia.instagram_business_account_id IS NOT NULL
    AND ia.access_token_encrypted IS NOT NULL
  WHERE sp.status = 'pending'
    AND sp.scheduled_at <= NOW()
  ORDER BY sp.scheduled_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: mark_post_as_processing
-- Marca post como em processamento (evita duplicação)
-- =====================================================
CREATE OR REPLACE FUNCTION mark_post_as_processing(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE instagram_scheduled_posts
  SET
    status = 'processing',
    updated_at = NOW()
  WHERE id = p_post_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: mark_post_as_published
-- Marca post como publicado com sucesso
-- =====================================================
CREATE OR REPLACE FUNCTION mark_post_as_published(
  p_post_id UUID,
  p_media_id TEXT,
  p_permalink TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE instagram_scheduled_posts
  SET
    status = 'published',
    published_at = NOW(),
    instagram_media_id = p_media_id,
    instagram_permalink = p_permalink,
    error_message = NULL,
    updated_at = NOW()
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: mark_post_as_failed
-- Marca post como falhou
-- =====================================================
CREATE OR REPLACE FUNCTION mark_post_as_failed(
  p_post_id UUID,
  p_error_message TEXT,
  p_max_retries INTEGER DEFAULT 3
)
RETURNS VOID AS $$
DECLARE
  v_retry_count INTEGER;
BEGIN
  SELECT retry_count INTO v_retry_count
  FROM instagram_scheduled_posts
  WHERE id = p_post_id;

  IF v_retry_count >= p_max_retries THEN
    -- Máximo de retries atingido, marcar como failed definitivo
    UPDATE instagram_scheduled_posts
    SET
      status = 'failed',
      error_message = p_error_message,
      retry_count = v_retry_count + 1,
      last_retry_at = NOW(),
      updated_at = NOW()
    WHERE id = p_post_id;
  ELSE
    -- Ainda pode tentar novamente, voltar para pending
    UPDATE instagram_scheduled_posts
    SET
      status = 'pending',
      error_message = p_error_message,
      retry_count = v_retry_count + 1,
      last_retry_at = NOW(),
      -- Agendar retry para 5 minutos depois
      scheduled_at = NOW() + INTERVAL '5 minutes',
      updated_at = NOW()
    WHERE id = p_post_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: v_campaign_scheduled_posts
-- Posts agendados com informações da campanha
-- =====================================================
CREATE OR REPLACE VIEW v_campaign_scheduled_posts AS
SELECT
  sp.id,
  sp.campaign_id,
  cc.campaign_name,
  cc.slug AS campaign_slug,
  sp.canva_design_id,
  sp.canva_design_name,
  sp.content_type,
  sp.caption,
  sp.hashtags,
  sp.scheduled_at,
  sp.status,
  sp.published_at,
  sp.instagram_media_id,
  sp.instagram_permalink,
  sp.error_message,
  sp.retry_count,
  sp.media_url,
  sp.thumbnail_url,
  sp.metadata,
  sp.created_at,
  sp.updated_at,
  ia.instagram_username,
  ia.instagram_business_account_id IS NOT NULL AS has_publishing_credentials
FROM instagram_scheduled_posts sp
JOIN cluster_campaigns cc ON cc.id = sp.campaign_id
LEFT JOIN instagram_accounts ia ON ia.campaign_id = sp.campaign_id
  AND ia.status = 'active';

-- =====================================================
-- RLS: Políticas de segurança
-- =====================================================
ALTER TABLE instagram_scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total
CREATE POLICY instagram_scheduled_posts_service_role ON instagram_scheduled_posts
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE instagram_scheduled_posts IS 'Posts agendados para publicação no Instagram, vinculados a campanhas AIC';
COMMENT ON COLUMN instagram_scheduled_posts.canva_design_id IS 'ID do design no Canva (preenchido após busca por nome)';
COMMENT ON COLUMN instagram_scheduled_posts.canva_design_name IS 'Nome do design usado para buscar no Canva';
COMMENT ON COLUMN instagram_scheduled_posts.content_type IS 'Tipo de conteúdo: post (imagem), carousel (múltiplas imagens), reel (vídeo)';
COMMENT ON COLUMN instagram_scheduled_posts.scheduled_at IS 'Data/hora agendada para publicação (UTC). Workflow processa quando NOW() >= scheduled_at';
COMMENT ON COLUMN instagram_scheduled_posts.media_url IS 'URL pública da mídia após export do Canva (Supabase Storage)';
COMMENT ON COLUMN instagram_scheduled_posts.retry_count IS 'Número de tentativas de publicação. Max 3 antes de marcar como failed';

COMMENT ON FUNCTION get_pending_scheduled_posts IS 'Retorna posts prontos para publicação com credenciais da conta IG';
COMMENT ON FUNCTION mark_post_as_processing IS 'Marca post como processing (atomic, evita race condition)';
COMMENT ON FUNCTION mark_post_as_published IS 'Atualiza post após publicação bem-sucedida';
COMMENT ON FUNCTION mark_post_as_failed IS 'Marca post como falhou, agenda retry se ainda não atingiu limite';
