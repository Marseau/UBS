-- Simplificar estrutura de account_actions
-- Remove views desnecessárias e campos over-engineered

-- 1. DROP VIEWS desnecessárias
DROP VIEW IF EXISTS account_actions_daily_stats;
DROP VIEW IF EXISTS account_actions_today_count;

-- 2. DROP TRIGGER e FUNCTION (updated_at não é necessário)
DROP TRIGGER IF EXISTS trigger_update_account_actions_updated_at ON account_actions;
DROP FUNCTION IF EXISTS update_account_actions_updated_at();

-- 3. DROP índices que referenciam campos que vamos remover
DROP INDEX IF EXISTS idx_account_actions_daily_limit;
DROP INDEX IF EXISTS idx_account_actions_source_platform;

-- 4. REMOVER campos desnecessários (incluindo executed_at - usamos created_at)
ALTER TABLE account_actions
  DROP COLUMN IF EXISTS post_id,
  DROP COLUMN IF EXISTS media_id,
  DROP COLUMN IF EXISTS comment_text,
  DROP COLUMN IF EXISTS dm_text,
  DROP COLUMN IF EXISTS execution_method,
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS daily_action_count,
  DROP COLUMN IF EXISTS source_platform,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS executed_at;

-- 5. Atualizar índice de executed_at para created_at
DROP INDEX IF EXISTS idx_account_actions_executed_at;
CREATE INDEX IF NOT EXISTS idx_account_actions_created_at ON account_actions(created_at DESC);

-- 7. Atualizar comentários da tabela
COMMENT ON TABLE account_actions IS 'Registro simples de ações executadas pela conta @ubs.sistemas para prospecção de leads';
COMMENT ON COLUMN account_actions.lead_id IS 'Referência ao lead da tabela instagram_leads';
COMMENT ON COLUMN account_actions.action_type IS 'Tipo de ação: follow, like, comment';
COMMENT ON COLUMN account_actions.success IS 'TRUE se ação foi executada com sucesso';
COMMENT ON COLUMN account_actions.error_message IS 'Mensagem de erro caso success = FALSE';
COMMENT ON COLUMN account_actions.created_at IS 'Quando a ação foi executada';

-- 8. Atualizar CHECK constraint do action_type (remover opções desnecessárias)
ALTER TABLE account_actions
  DROP CONSTRAINT IF EXISTS account_actions_action_type_check;

ALTER TABLE account_actions
  ADD CONSTRAINT account_actions_action_type_check
  CHECK (action_type IN ('follow', 'unfollow', 'like', 'comment'));

-- Resultado final:
-- account_actions
--   ├── id (UUID)
--   ├── lead_id (UUID)
--   ├── username (VARCHAR)
--   ├── action_type (VARCHAR) - follow/unfollow/like/comment
--   ├── success (BOOLEAN)
--   ├── error_message (TEXT)
--   └── created_at (TIMESTAMP)
