-- ============================================
-- DASHBOARD DE ANÁLISE DE HASHTAGS
-- 26.210 hashtags únicas | 49.669 ocorrências
-- ============================================

-- 📊 QUERY 1: Overview Geral
-- Total de leads, cobertura de hashtags, distribuição
SELECT
  COUNT(*) as total_leads,
  COUNT(CASE WHEN hashtags_bio IS NOT NULL THEN 1 END) as leads_com_hashtags_bio,
  COUNT(CASE WHEN hashtags_posts IS NOT NULL THEN 1 END) as leads_com_hashtags_posts,
  COUNT(CASE WHEN hashtags_bio IS NOT NULL OR hashtags_posts IS NOT NULL THEN 1 END) as leads_com_alguma_hashtag,
  ROUND(
    COUNT(CASE WHEN hashtags_bio IS NOT NULL OR hashtags_posts IS NOT NULL THEN 1 END)::numeric /
    COUNT(*)::numeric * 100,
    2
  ) as percentual_cobertura
FROM instagram_leads;

-- 📈 QUERY 2: Top 50 Hashtags por Frequência (Posts)
-- Mostra quais hashtags são mais usadas
WITH post_hashtags AS (
  SELECT jsonb_array_elements_text(hashtags_posts) as hashtag
  FROM instagram_leads
  WHERE hashtags_posts IS NOT NULL
)
SELECT
  hashtag,
  COUNT(*) as frequencia,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM post_hashtags)::numeric * 100, 2) as percentual
FROM post_hashtags
GROUP BY hashtag
ORDER BY frequencia DESC
LIMIT 50;

-- 💎 QUERY 3: Hashtags Premium (Melhor Taxa de Contato)
-- Identifica hashtags com maior % de leads com email/telefone
WITH post_hashtags AS (
  SELECT
    il.id,
    il.username,
    il.followers_count,
    il.email,
    il.phone,
    il.is_business_account,
    il.is_verified,
    jsonb_array_elements_text(il.hashtags_posts) as hashtag
  FROM instagram_leads il
  WHERE il.hashtags_posts IS NOT NULL
)
SELECT
  hashtag,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 1 END) as leads_com_contato,
  ROUND(AVG(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 100 ELSE 0 END), 1) as perc_com_contato,
  ROUND(AVG(CASE WHEN is_business_account THEN 100 ELSE 0 END), 1) as perc_business,
  ROUND(AVG(CASE WHEN is_verified THEN 100 ELSE 0 END), 1) as perc_verificado,
  ROUND(AVG(followers_count), 0) as media_seguidores,
  MIN(followers_count) as min_seguidores,
  MAX(followers_count) as max_seguidores
FROM post_hashtags
GROUP BY hashtag
HAVING COUNT(*) >= 20  -- Mínimo 20 leads para ser estatisticamente relevante
ORDER BY perc_com_contato DESC, total_leads DESC
LIMIT 50;

-- 🔗 QUERY 4: Co-ocorrência de Hashtags (Pares que aparecem juntos)
-- Identifica quais hashtags costumam aparecer juntas
WITH hashtag_pairs AS (
  SELECT
    h1.value::text as hashtag1,
    h2.value::text as hashtag2
  FROM instagram_leads il,
       jsonb_array_elements(il.hashtags_posts) h1,
       jsonb_array_elements(il.hashtags_posts) h2
  WHERE il.hashtags_posts IS NOT NULL
    AND h1.value::text < h2.value::text  -- Evita duplicatas (A,B) e (B,A)
)
SELECT
  hashtag1,
  hashtag2,
  COUNT(*) as coocorrencia,
  ROUND(COUNT(*)::numeric / (
    SELECT COUNT(*) FROM instagram_leads WHERE hashtags_posts IS NOT NULL
  )::numeric * 100, 2) as percentual_leads
FROM hashtag_pairs
GROUP BY hashtag1, hashtag2
HAVING COUNT(*) >= 10  -- Mínimo 10 co-ocorrências
ORDER BY coocorrencia DESC
LIMIT 100;

-- 🎯 QUERY 5: Análise por Cluster de Negócio
-- Agrupa hashtags em clusters e analisa performance
WITH clustered_hashtags AS (
  SELECT
    il.*,
    jsonb_array_elements_text(il.hashtags_posts) as hashtag,
    CASE
      WHEN jsonb_array_elements_text(il.hashtags_posts) IN (
        '"empreendedorismo"', '"marketingdigital"', '"vendas"', '"negócios"',
        '"negocios"', '"gestaoempresarial"', '"gestãoempresarial"', '"inovação"',
        '"inovacao"', '"tecnologia"', '"produtividade"'
      ) THEN 'Empreendedorismo & Negócios'

      WHEN jsonb_array_elements_text(il.hashtags_posts) IN (
        '"autoconhecimento"', '"autocuidado"', '"bemestar"', '"saudemental"',
        '"saúdemental"', '"psicologia"', '"terapia"', '"desenvolvimentopessoal"',
        '"espiritualidade"', '"meditacao"', '"qualidadedevida"'
      ) THEN 'Saúde & Bem-estar'

      WHEN jsonb_array_elements_text(il.hashtags_posts) IN (
        '"treino"', '"academia"', '"fitness"', '"emagrecimento"', '"hipertrofia"',
        '"vidasaudavel"', '"nutrição"', '"nutricao"', '"estetica"', '"perderpeso"'
      ) THEN 'Fitness & Estética'

      WHEN jsonb_array_elements_text(il.hashtags_posts) IN (
        '"advocacia"', '"direito"', '"advogado"', '"justiça"', '"inss"',
        '"contabilidade"', '"contador"', '"mei"', '"planejamentofinanceiro"',
        '"gestaofinanceira"', '"gestãofinanceira"'
      ) THEN 'Jurídico & Contábil'

      WHEN jsonb_array_elements_text(il.hashtags_posts) IN (
        '"odontologia"', '"arquitetura"', '"fisioterapia"', '"engenharia"',
        '"medicina"', '"enfermagem"', '"farmacia"', '"veterinaria"'
      ) THEN 'Serviços Especializados'

      ELSE 'Outros'
    END as cluster
  FROM instagram_leads il
  WHERE il.hashtags_posts IS NOT NULL
)
SELECT
  cluster,
  COUNT(DISTINCT id) as total_leads_unicos,
  COUNT(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 1 END) as leads_com_contato,
  ROUND(AVG(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 100 ELSE 0 END), 1) as perc_com_contato,
  ROUND(AVG(CASE WHEN is_business_account THEN 100 ELSE 0 END), 1) as perc_business,
  ROUND(AVG(followers_count), 0) as media_seguidores,
  ROUND(AVG(posts_count), 0) as media_posts
FROM clustered_hashtags
WHERE cluster != 'Outros'
GROUP BY cluster
ORDER BY perc_com_contato DESC;

-- 📍 QUERY 6: Origem dos Leads por Search Term
-- Analisa quais termos de busca geraram leads com mais hashtags
SELECT
  search_term_used,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN hashtags_bio IS NOT NULL THEN 1 END) as com_hashtags_bio,
  COUNT(CASE WHEN hashtags_posts IS NOT NULL THEN 1 END) as com_hashtags_posts,
  ROUND(
    COUNT(CASE WHEN hashtags_posts IS NOT NULL THEN 1 END)::numeric /
    COUNT(*)::numeric * 100,
    1
  ) as perc_com_hashtags_posts,
  ROUND(AVG(followers_count), 0) as media_seguidores
FROM instagram_leads
WHERE search_term_used IS NOT NULL
GROUP BY search_term_used
ORDER BY total_leads DESC
LIMIT 30;

-- 🔍 QUERY 7: Hashtags Inexploradas (Alto Potencial)
-- Hashtags com boa frequência mas que não são usadas como search_term
WITH hashtags_freq AS (
  SELECT
    jsonb_array_elements_text(hashtags_posts) as hashtag,
    COUNT(*) as freq
  FROM instagram_leads
  WHERE hashtags_posts IS NOT NULL
  GROUP BY jsonb_array_elements_text(hashtags_posts)
  HAVING COUNT(*) >= 20
),
used_search_terms AS (
  SELECT DISTINCT LOWER(search_term_used) as term
  FROM instagram_leads
  WHERE search_term_used IS NOT NULL
)
SELECT
  hf.hashtag,
  hf.freq as frequencia,
  CASE
    WHEN ust.term IS NULL THEN '❌ NÃO USADO'
    ELSE '✅ JÁ USADO'
  END as status_scraping
FROM hashtags_freq hf
LEFT JOIN used_search_terms ust ON LOWER(REPLACE(hf.hashtag, '"', '')) = ust.term
ORDER BY
  CASE WHEN ust.term IS NULL THEN 0 ELSE 1 END,  -- Prioriza não usados
  hf.freq DESC
LIMIT 100;

-- 📊 QUERY 8: Estatísticas por Faixa de Seguidores
-- Analisa hashtags por tamanho de audiência
WITH post_hashtags AS (
  SELECT
    il.*,
    jsonb_array_elements_text(il.hashtags_posts) as hashtag,
    CASE
      WHEN il.followers_count < 1000 THEN 'Nano (0-1k)'
      WHEN il.followers_count < 10000 THEN 'Micro (1k-10k)'
      WHEN il.followers_count < 100000 THEN 'Mid (10k-100k)'
      WHEN il.followers_count < 1000000 THEN 'Macro (100k-1M)'
      ELSE 'Mega (1M+)'
    END as faixa_seguidores
  FROM instagram_leads il
  WHERE il.hashtags_posts IS NOT NULL
)
SELECT
  faixa_seguidores,
  COUNT(DISTINCT hashtag) as hashtags_unicas,
  COUNT(*) as total_ocorrencias,
  COUNT(DISTINCT id) as leads_unicos,
  ROUND(AVG(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 100 ELSE 0 END), 1) as perc_com_contato
FROM post_hashtags
GROUP BY faixa_seguidores
ORDER BY
  CASE faixa_seguidores
    WHEN 'Nano (0-1k)' THEN 1
    WHEN 'Micro (1k-10k)' THEN 2
    WHEN 'Mid (10k-100k)' THEN 3
    WHEN 'Macro (100k-1M)' THEN 4
    WHEN 'Mega (1M+)' THEN 5
  END;

-- 🎯 QUERY 9: Hashtags por Mês (Tendências Temporais)
-- Mostra evolução de uso de hashtags ao longo do tempo
WITH monthly_hashtags AS (
  SELECT
    DATE_TRUNC('month', il.created_at) as mes,
    jsonb_array_elements_text(il.hashtags_posts) as hashtag
  FROM instagram_leads il
  WHERE il.hashtags_posts IS NOT NULL
    AND il.created_at >= NOW() - INTERVAL '6 months'
)
SELECT
  mes,
  COUNT(DISTINCT hashtag) as hashtags_unicas,
  COUNT(*) as total_ocorrencias
FROM monthly_hashtags
GROUP BY mes
ORDER BY mes DESC;

-- 💡 QUERY 10: Sugestões de Expansão (Baseado em Co-ocorrência)
-- Para cada hashtag scrapeada, sugere hashtags relacionadas não scrapeadas
WITH scraped_hashtags AS (
  SELECT DISTINCT LOWER(REPLACE(search_term_used, ' ', '')) as term
  FROM instagram_leads
  WHERE search_term_used IS NOT NULL
),
hashtag_pairs AS (
  SELECT
    LOWER(REPLACE(h1.value::text, '"', '')) as hashtag1,
    LOWER(REPLACE(h2.value::text, '"', '')) as hashtag2,
    COUNT(*) as coocorrencia
  FROM instagram_leads il,
       jsonb_array_elements(il.hashtags_posts) h1,
       jsonb_array_elements(il.hashtags_posts) h2
  WHERE il.hashtags_posts IS NOT NULL
    AND h1.value::text < h2.value::text
  GROUP BY h1.value::text, h2.value::text
  HAVING COUNT(*) >= 10
)
SELECT
  hp.hashtag1 as hashtag_scrapeada,
  hp.hashtag2 as sugestao_expansao,
  hp.coocorrencia as aparecem_juntas,
  CASE
    WHEN sh2.term IS NULL THEN '🔥 NOVO'
    ELSE '✅ JÁ SCRAPEADO'
  END as status
FROM hashtag_pairs hp
INNER JOIN scraped_hashtags sh1 ON hp.hashtag1 = sh1.term
LEFT JOIN scraped_hashtags sh2 ON hp.hashtag2 = sh2.term
WHERE sh2.term IS NULL  -- Apenas sugestões que NÃO foram scrapeadas ainda
ORDER BY hp.coocorrencia DESC
LIMIT 100;
