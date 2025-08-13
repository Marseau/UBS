-- Production-Sanity-Check-Queries.sql
-- Verificações rápidas para validar integridade da simulação
-- Usage: psql $DATABASE_URL -v TEST_ID="'TEST_20250811_143022_abc12345'" -f Production-Sanity-Check-Queries.sql

\echo '🔍 SANITY CHECK - SIMULAÇÃO DE PRODUÇÃO'
\echo '======================================'

-- 1) Integridade geral
\echo '1️⃣  INTEGRIDADE GERAL'
SELECT
  COUNT(*) FILTER (WHERE test_execution_id = :TEST_ID) AS tenants,
  (SELECT COUNT(*) FROM services WHERE test_execution_id = :TEST_ID) AS services,
  (SELECT COUNT(*) FROM professionals WHERE test_execution_id = :TEST_ID) AS pros,
  (SELECT COUNT(*) FROM users WHERE test_execution_id = :TEST_ID) AS users,
  (SELECT COUNT(*) FROM conversation_history WHERE test_execution_id = :TEST_ID) AS msgs,
  (SELECT COUNT(*) FROM appointments WHERE test_execution_id = :TEST_ID) AS appts
FROM tenants;

-- 2) Sem overlaps (double-booking)
\echo '2️⃣  VERIFICAÇÃO DE DOUBLE-BOOKING'
SELECT 
    tenant_id, 
    professional_id, 
    COUNT(*) AS overlaps,
    'FAIL - Double booking detectado!' as status
FROM (
  SELECT a1.tenant_id, a1.professional_id, a1.id
  FROM appointments a1
  JOIN appointments a2
    ON a1.professional_id=a2.professional_id
   AND a1.id<>a2.id
   AND a1.start_time < a2.end_time
   AND a2.start_time < a1.end_time
  WHERE a1.test_execution_id=:TEST_ID AND a2.test_execution_id=:TEST_ID
) q
GROUP BY 1,2
HAVING COUNT(*)>0
UNION ALL
SELECT NULL, NULL, 0, 'PASS - Nenhum double-booking encontrado' as status
WHERE NOT EXISTS (
  SELECT 1 FROM appointments a1
  JOIN appointments a2
    ON a1.professional_id=a2.professional_id
   AND a1.id<>a2.id
   AND a1.start_time < a2.end_time
   AND a2.start_time < a1.end_time
  WHERE a1.test_execution_id=:TEST_ID AND a2.test_execution_id=:TEST_ID
);

-- 3) End > start e timezone correto
\echo '3️⃣  VALIDAÇÃO DE HORÁRIOS E TIMEZONE'
SELECT 
    COUNT(*) AS invalid_appointments,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - Todos os horários válidos'
        ELSE 'FAIL - Appointments com horários inválidos encontrados'
    END as status
FROM appointments
WHERE test_execution_id=:TEST_ID
  AND (end_time <= start_time
       OR (start_time AT TIME ZONE 'America/Sao_Paulo') IS NULL);

-- Detalhar problemas se houver
SELECT 
    id,
    tenant_id,
    start_time,
    end_time,
    CASE 
        WHEN end_time <= start_time THEN 'End time <= Start time'
        WHEN (start_time AT TIME ZONE 'America/Sao_Paulo') IS NULL THEN 'Timezone inválido'
        ELSE 'OK'
    END as issue
FROM appointments
WHERE test_execution_id=:TEST_ID
  AND (end_time <= start_time
       OR (start_time AT TIME ZONE 'America/Sao_Paulo') IS NULL)
ORDER BY start_time;

-- 4) Conversão ponta-a-ponta por domínio
\echo '4️⃣  CONVERSÃO WHATSAPP → APPOINTMENT POR DOMÍNIO'
SELECT 
    t.domain::text,
    COUNT(DISTINCT ch.id) AS conversas,
    COUNT(DISTINCT a.id)  AS appts,
    ROUND(COUNT(DISTINCT a.id)::numeric / NULLIF(COUNT(DISTINCT ch.id),0),3) AS conv_rate,
    CASE 
        WHEN COUNT(DISTINCT ch.id) = 0 THEN 'PENDING - Sem conversas'
        WHEN COUNT(DISTINCT a.id)::numeric / NULLIF(COUNT(DISTINCT ch.id),0) >= 0.6 THEN 'PASS'
        ELSE 'WARN - Taxa conversão baixa'
    END as status
FROM tenants t
LEFT JOIN conversation_history ch ON ch.tenant_id=t.id AND ch.test_execution_id=:TEST_ID
LEFT JOIN appointments a ON a.tenant_id=t.id AND a.test_execution_id=:TEST_ID
WHERE t.test_execution_id=:TEST_ID
GROUP BY 1 
ORDER BY 3 DESC NULLS LAST;

-- 5) Custos de IA e custo por conversa
\echo '5️⃣  ANÁLISE DE CUSTOS DE IA'
SELECT 
    t.domain::text,
    COALESCE(SUM(ch.api_cost_usd),0) AS custo_total_usd,
    ROUND(AVG(ch.api_cost_usd),6)    AS custo_medio_usd,
    ROUND(COALESCE(SUM(ch.api_cost_usd),0) / NULLIF(COUNT(ch.id),0),6) AS custo_por_conversa,
    CASE 
        WHEN COUNT(ch.id) = 0 THEN 'PENDING - Sem conversas'
        WHEN COALESCE(SUM(ch.api_cost_usd),0) / NULLIF(COUNT(ch.id),0) <= 0.15 THEN 'EXCELLENT'
        WHEN COALESCE(SUM(ch.api_cost_usd),0) / NULLIF(COUNT(ch.id),0) <= 0.25 THEN 'GOOD'
        WHEN COALESCE(SUM(ch.api_cost_usd),0) / NULLIF(COUNT(ch.id),0) <= 0.40 THEN 'ACCEPTABLE'
        ELSE 'HIGH_COST'
    END as cost_efficiency
FROM tenants t
LEFT JOIN conversation_history ch ON ch.tenant_id=t.id AND ch.test_execution_id=:TEST_ID
WHERE t.test_execution_id=:TEST_ID
GROUP BY 1 
ORDER BY 2 DESC;

-- 6) Lead time médio (positivo)
\echo '6️⃣  LEAD TIME DE AGENDAMENTOS'
SELECT 
    ROUND(AVG(EXTRACT(EPOCH FROM (a.start_time - a.created_at)))/3600,2) AS lead_time_hours,
    MIN(EXTRACT(EPOCH FROM (a.start_time - a.created_at))/3600) AS min_lead_time_h,
    MAX(EXTRACT(EPOCH FROM (a.start_time - a.created_at))/3600) AS max_lead_time_h,
    COUNT(*) as total_appointments,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PENDING - Sem appointments'
        WHEN AVG(EXTRACT(EPOCH FROM (a.start_time - a.created_at))) > 0 THEN 'PASS - Lead times positivos'
        ELSE 'FAIL - Lead times negativos encontrados'
    END as status
FROM appointments a
WHERE a.test_execution_id=:TEST_ID;

-- 7) Janela de funcionamento (violadores)
\echo '7️⃣  CONFORMIDADE COM HORÁRIOS DE FUNCIONAMENTO'
WITH business_hours_expanded AS (
    SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        t.domain,
        dow_key as day_of_week,
        -- Extrair horários do array JSONB 
        jsonb_array_elements_text(dow_value) as time_slot
    FROM tenants t,
    LATERAL jsonb_each(t.business_rules->'working_hours') AS wh(dow_key, dow_value)
    WHERE t.test_execution_id = :TEST_ID
      AND jsonb_typeof(dow_value) = 'array'
      AND jsonb_array_length(dow_value) > 0
),
working_hours AS (
    SELECT 
        tenant_id,
        tenant_name,
        domain,
        day_of_week,
        split_part(time_slot, '-', 1)::time as opening_time,
        split_part(time_slot, '-', 2)::time as closing_time
    FROM business_hours_expanded
    WHERE time_slot ~ '^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$'
),
violations AS (
    SELECT 
        a.id as appointment_id,
        a.tenant_id,
        wh.tenant_name,
        wh.domain,
        a.start_time,
        a.end_time,
        wh.opening_time,
        wh.closing_time,
        to_char(a.start_time AT TIME ZONE 'America/Sao_Paulo', 'day') as appointment_dow
    FROM appointments a
    JOIN working_hours wh ON wh.tenant_id = a.tenant_id
    WHERE a.test_execution_id = :TEST_ID
      AND TRIM(to_char(a.start_time AT TIME ZONE 'America/Sao_Paulo', 'day')) = wh.day_of_week
      AND (
          (a.start_time AT TIME ZONE 'America/Sao_Paulo')::time < wh.opening_time 
          OR 
          (a.end_time AT TIME ZONE 'America/Sao_Paulo')::time > wh.closing_time
      )
)
SELECT 
    COUNT(*) as violations_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - Todos appointments dentro horário funcionamento'
        ELSE 'WARN - Appointments fora horário encontrados'
    END as status
FROM violations

UNION ALL

SELECT 
    -1 as violations_count, 
    'INFO - Detalhes das violações:' as status
FROM violations 
WHERE EXISTS (SELECT 1 FROM violations)

UNION ALL

SELECT 
    NULL as violations_count,
    CONCAT(tenant_name, ' (', domain, '): ', appointment_id, ' - ', 
           start_time::time, '-', end_time::time, ' fora de ', 
           opening_time, '-', closing_time) as status
FROM violations;

-- 8) RLS (teste negativo: nenhum dado cruzado)  
\echo '8️⃣  TESTE DE VAZAMENTO RLS (Cross-tenant data leak)'
WITH cross_tenant_check AS (
    -- Tentar encontrar appointments que pertencem a tenant diferente do esperado
    SELECT 
        a.id,
        a.tenant_id as appointment_tenant,
        t.id as actual_tenant,
        t.domain as appointment_domain,
        t2.domain as expected_domain
    FROM appointments a
    JOIN tenants t ON t.id = a.tenant_id AND t.test_execution_id = :TEST_ID
    JOIN tenants t2 ON t2.test_execution_id = :TEST_ID AND t2.domain != t.domain
    WHERE a.test_execution_id = :TEST_ID
      -- Verificar se appointment "vaza" para outro domínio
      AND EXISTS (
          SELECT 1 FROM services s 
          WHERE s.id = a.service_id 
            AND s.tenant_id = t2.id  -- Service de tenant diferente
      )
)
SELECT 
    COUNT(*) as cross_tenant_leaks,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - Nenhum vazamento cross-tenant detectado'
        ELSE 'FAIL - Vazamento de dados entre tenants detectado!'
    END as status
FROM cross_tenant_check;

-- 9) Distribuição de cenários por domínio
\echo '9️⃣  DISTRIBUIÇÃO DE CENÁRIOS DE TESTE'
SELECT 
    t.domain::text,
    COUNT(DISTINCT ch.conversation_context->>'scenario_id') as unique_scenarios,
    COUNT(ch.id) as total_messages,
    ARRAY_AGG(DISTINCT ch.intent_detected) FILTER (WHERE ch.intent_detected IS NOT NULL) as intents_detected
FROM tenants t
LEFT JOIN conversation_history ch ON ch.tenant_id = t.id AND ch.test_execution_id = :TEST_ID
WHERE t.test_execution_id = :TEST_ID
GROUP BY t.domain
ORDER BY unique_scenarios DESC NULLS LAST;

-- 10) Resumo de saúde geral
\echo '🎯 RESUMO DE SAÚDE GERAL DA SIMULAÇÃO'
SELECT 
    :TEST_ID as test_execution_id,
    NOW() as check_time,
    (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :TEST_ID) as tenants_count,
    (SELECT COUNT(*) FROM appointments WHERE test_execution_id = :TEST_ID) as appointments_count,
    (SELECT COUNT(*) FROM conversation_history WHERE test_execution_id = :TEST_ID) as conversations_count,
    (SELECT ROUND(SUM(api_cost_usd), 4) FROM conversation_history WHERE test_execution_id = :TEST_ID) as total_ai_cost,
    CASE 
        WHEN (SELECT COUNT(*) FROM appointments WHERE test_execution_id = :TEST_ID) > 0 
         AND (SELECT COUNT(*) FROM conversation_history WHERE test_execution_id = :TEST_ID) > 0
         AND (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :TEST_ID) = 6
        THEN '✅ SIMULAÇÃO HEALTHY'
        ELSE '⚠️  SIMULAÇÃO INCOMPLETA'
    END as overall_health;

\echo ''
\echo '✅ SANITY CHECK CONCLUÍDO'
\echo 'Verifique os resultados acima para validar a integridade da simulação.'
\echo ''