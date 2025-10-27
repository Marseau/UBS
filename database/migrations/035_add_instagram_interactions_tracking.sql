-- Migration: Add Instagram Interactions Tracking
-- Rastreia interações dos leads com nossa conta (likes, comments, DMs, etc)

CREATE TABLE IF NOT EXISTS instagram_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Lead que interagiu
  lead_id UUID REFERENCES instagram_leads(id) ON DELETE CASCADE,
  instagram_user_id VARCHAR(50),
  username VARCHAR(100) NOT NULL,

  -- Tipo de interação
  interaction_type VARCHAR(30) NOT NULL CHECK (interaction_type IN (
    'comment',
    'like',
    'dm',
    'story_mention',
    'story_reply',
    'post_mention',
    'share',
    'save'
  )),

  -- Detalhes da interação
  post_id VARCHAR(100),
  media_id VARCHAR(100),
  comment_text TEXT,
  message_text TEXT,

  -- Metadata
  interaction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ação tomada
  auto_followed BOOLEAN DEFAULT FALSE,
  followed_at TIMESTAMP WITH TIME ZONE,
  auto_replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_instagram_interactions_lead_id ON instagram_interactions(lead_id);
CREATE INDEX idx_instagram_interactions_username ON instagram_interactions(username);
CREATE INDEX idx_instagram_interactions_type ON instagram_interactions(interaction_type);
CREATE INDEX idx_instagram_interactions_timestamp ON instagram_interactions(interaction_timestamp DESC);
CREATE INDEX idx_instagram_interactions_auto_followed ON instagram_interactions(auto_followed) WHERE auto_followed = FALSE;

-- Adicionar campos de interação na tabela instagram_leads
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS last_interaction_type VARCHAR(30),
ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_commented BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_dm BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;

-- Índice para buscar leads com interações
CREATE INDEX IF NOT EXISTS idx_instagram_leads_interaction_count ON instagram_leads(interaction_count DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_engagement_score ON instagram_leads(engagement_score DESC);

-- Comentários
COMMENT ON TABLE instagram_interactions IS 'Rastreia todas as interações de leads com nossa conta Instagram';
COMMENT ON COLUMN instagram_interactions.interaction_type IS 'Tipo: comment, like, dm, story_mention, story_reply, post_mention, share, save';
COMMENT ON COLUMN instagram_interactions.auto_followed IS 'Se foi feito follow automático após a interação';
COMMENT ON COLUMN instagram_leads.engagement_score IS 'Score calculado baseado em interações (comment=10, dm=15, like=5, etc)';
