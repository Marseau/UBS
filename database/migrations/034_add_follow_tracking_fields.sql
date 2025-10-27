-- Migration: Add Instagram Follow Tracking Fields
-- Adiciona campos para rastrear follows/unfollows automatizados

ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS follow_status VARCHAR(20) DEFAULT 'not_followed' CHECK (follow_status IN ('not_followed', 'followed', 'unfollowed', 'failed')),
ADD COLUMN IF NOT EXISTS followed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS unfollowed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS follow_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_follow_attempt_at TIMESTAMP WITH TIME ZONE;

-- Índices para otimizar queries de follow
CREATE INDEX IF NOT EXISTS idx_instagram_leads_follow_status ON instagram_leads(follow_status);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_followed_at ON instagram_leads(followed_at);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_lead_score ON instagram_leads(lead_score DESC) WHERE follow_status = 'not_followed';

-- Comentários
COMMENT ON COLUMN instagram_leads.follow_status IS 'Status do follow: not_followed, followed, unfollowed, failed';
COMMENT ON COLUMN instagram_leads.followed_at IS 'Timestamp de quando foi feito o follow';
COMMENT ON COLUMN instagram_leads.unfollowed_at IS 'Timestamp de quando foi feito o unfollow';
COMMENT ON COLUMN instagram_leads.follow_attempts IS 'Número de tentativas de follow';
COMMENT ON COLUMN instagram_leads.last_follow_attempt_at IS 'Último timestamp de tentativa de follow';
