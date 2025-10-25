-- Tabela para rastrear ações executadas pela nossa conta do Instagram
-- (follows, unfollows, likes, comentários, DMs)

CREATE TABLE IF NOT EXISTS account_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Referência ao lead
  lead_id UUID REFERENCES instagram_leads(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,

  -- Tipo de ação executada
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN (
    'follow',
    'unfollow',
    'like',
    'comment',
    'dm',
    'story_view'
  )),

  -- Detalhes da ação
  post_id VARCHAR(100),           -- Para likes/comments
  media_id VARCHAR(100),          -- ID do media (Graph API)
  comment_text TEXT,              -- Texto do comentário enviado
  dm_text TEXT,                   -- Texto da DM enviada

  -- Metadata de execução
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_method VARCHAR(20) CHECK (execution_method IN ('puppeteer', 'graph_api', 'manual')),

  -- Status de execução
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Rate limiting tracking
  daily_action_count INTEGER DEFAULT 1,  -- Contador para rate limiting

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_account_actions_username ON account_actions(username);
CREATE INDEX idx_account_actions_lead_id ON account_actions(lead_id);
CREATE INDEX idx_account_actions_action_type ON account_actions(action_type);
CREATE INDEX idx_account_actions_executed_at ON account_actions(executed_at DESC);
CREATE INDEX idx_account_actions_success ON account_actions(success);

-- Índice composto para rate limiting (verificar ações do dia)
CREATE INDEX idx_account_actions_daily_limit ON account_actions(action_type, executed_at DESC)
WHERE success = TRUE;

-- Comentários
COMMENT ON TABLE account_actions IS 'Rastreia todas as ações executadas pela nossa conta do Instagram (follows, likes, comments, DMs)';
COMMENT ON COLUMN account_actions.lead_id IS 'Referência ao lead da tabela instagram_leads';
COMMENT ON COLUMN account_actions.action_type IS 'Tipo de ação: follow, unfollow, like, comment, dm, story_view';
COMMENT ON COLUMN account_actions.execution_method IS 'Método usado: puppeteer (automação), graph_api (API oficial), manual';
COMMENT ON COLUMN account_actions.daily_action_count IS 'Contador incremental para rate limiting diário';
COMMENT ON COLUMN account_actions.retry_count IS 'Número de tentativas em caso de falha';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_account_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_account_actions_updated_at
  BEFORE UPDATE ON account_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_actions_updated_at();

-- View para estatísticas diárias
CREATE OR REPLACE VIEW account_actions_daily_stats AS
SELECT
  DATE(executed_at) as action_date,
  action_type,
  execution_method,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE success = TRUE) as successful_actions,
  COUNT(*) FILTER (WHERE success = FALSE) as failed_actions,
  ROUND(AVG(retry_count), 2) as avg_retries
FROM account_actions
WHERE executed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(executed_at), action_type, execution_method
ORDER BY action_date DESC, action_type;

COMMENT ON VIEW account_actions_daily_stats IS 'Estatísticas diárias de ações executadas (últimos 30 dias)';

-- View para verificar limite diário
CREATE OR REPLACE VIEW account_actions_today_count AS
SELECT
  action_type,
  COUNT(*) as count_today,
  MAX(executed_at) as last_action_at
FROM account_actions
WHERE executed_at >= CURRENT_DATE
  AND success = TRUE
GROUP BY action_type;

COMMENT ON VIEW account_actions_today_count IS 'Contador de ações executadas hoje (para rate limiting)';
