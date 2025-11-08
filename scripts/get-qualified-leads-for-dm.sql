-- Query: Selecionar leads qualificados para DM outreach
-- Critérios:
-- 1. Possui pelo menos 1 telefone OU email (4 campos)
-- 2. Nunca recebeu DM ou último DM foi há mais de 30 dias
-- 3. Não está com follow_status = 'unfollowed' (não queimar ponte)
-- 4. Segmentos relevantes para SaaS de agendamento
-- 5. Ordenar por prioridade: tem telefone > tem email > mais recente

WITH qualified_leads AS (
  SELECT
    id,
    username,
    full_name,
    business_category,
    segment,
    email,
    phone,
    additional_emails,
    additional_phones,
    follow_status,
    created_at,

    -- Flags de qualificação
    CASE
      WHEN phone IS NOT NULL OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
      THEN true
      ELSE false
    END AS has_phone,

    CASE
      WHEN email IS NOT NULL OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
      THEN true
      ELSE false
    END AS has_email,

    -- Score de prioridade (maior = melhor)
    CASE
      WHEN phone IS NOT NULL OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
      THEN 100  -- Tem telefone = prioridade máxima
      WHEN email IS NOT NULL OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
      THEN 50   -- Só tem email = média prioridade
      ELSE 0
    END AS priority_score

  FROM instagram_leads

  WHERE
    -- Critério 1: Tem pelo menos 1 contato
    (
      email IS NOT NULL
      OR phone IS NOT NULL
      OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
      OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
    )

    -- Critério 2: Nunca recebeu DM
    AND id NOT IN (
      SELECT DISTINCT lead_id
      FROM instagram_dm_outreach
      WHERE sent_at > NOW() - INTERVAL '30 days'
    )

    -- Critério 3: Não foi unfollowed (evitar queimar ponte)
    AND (follow_status IS NULL OR follow_status != 'unfollowed')

    -- Critério 4: Segmentos relevantes para agendamento
    AND (
      segment ILIKE '%saude%'
      OR segment ILIKE '%beleza%'
      OR segment ILIKE '%consultoria%'
      OR segment ILIKE '%coaching%'
      OR segment ILIKE '%fisioterapia%'
      OR segment ILIKE '%nutri%'
      OR segment ILIKE '%odonto%'
      OR segment ILIKE '%advocacia%'
      OR segment ILIKE '%psicologia%'
      OR segment ILIKE '%terapia%'
      OR segment ILIKE '%pilates%'
      OR segment ILIKE '%personal%'
      OR segment ILIKE '%estetica%'
      OR business_category ILIKE '%consultoria%'
      OR business_category ILIKE '%saude%'
      OR business_category ILIKE '%beleza%'
    )
)

SELECT
  id,
  username,
  full_name,
  business_category,
  segment,
  has_phone,
  has_email,
  priority_score,
  created_at
FROM qualified_leads
ORDER BY
  priority_score DESC,  -- Prioriza quem tem telefone
  created_at DESC       -- Mais recentes primeiro
LIMIT 2;  -- 2 DMs por execução (1/hora = 2 total)
