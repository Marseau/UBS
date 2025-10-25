-- Adicionar campo source_platform à tabela account_actions

ALTER TABLE account_actions
ADD COLUMN source_platform VARCHAR(20) DEFAULT 'instagram'
CHECK (source_platform IN ('instagram', 'twitter', 'facebook', 'tiktok', 'linkedin', 'youtube'));

CREATE INDEX idx_account_actions_source_platform ON account_actions(source_platform);

COMMENT ON COLUMN account_actions.source_platform IS 'Plataforma de origem: instagram, twitter, facebook, tiktok, linkedin, youtube';
