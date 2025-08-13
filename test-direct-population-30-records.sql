-- =====================================================
-- TESTE DIRETO: POPULAR TABELA VIA PROCEDURE SQL 
-- Objetivo: Verificar se conseguimos 30/30 registros
-- (10 tenants × 3 períodos) sem usar o cron service
-- =====================================================

-- STEP 1: Limpar tabela tenant_metrics (apenas comprehensive)
DELETE FROM tenant_metrics WHERE metric_type = 'comprehensive';

-- STEP 2: Verificar limpeza
SELECT 
    'AFTER CLEANUP' as status,
    COUNT(*) as total_records
FROM tenant_metrics 
WHERE metric_type = 'comprehensive';

-- STEP 3: Verificar tenants ativos disponíveis
SELECT 
    'ACTIVE TENANTS' as status,
    COUNT(*) as total_active_tenants
FROM tenants 
WHERE status = 'active';

-- =====================================================
-- STEP 4: EXECUTAR PROCEDURE DIRETAMENTE
-- =====================================================

SELECT calculate_tenant_metrics_definitiva_total_fixed_v5() as execution_result;

-- STEP 5: Verificar resultados
SELECT 
    'FINAL RESULT' as status,
    COUNT(*) as total_records,
    COUNT(DISTINCT tenant_id) as unique_tenants,
    COUNT(DISTINCT period) as periods,
    CASE 
        WHEN COUNT(*) = 30 THEN '🎉 SUCCESS: 30/30 records!'
        ELSE '⚠️  Got ' || COUNT(*) || '/30 records'
    END as result
FROM tenant_metrics 
WHERE metric_type = 'comprehensive';

-- STEP 6: Breakdown por tenant (identificar quais falharam)
SELECT 
    t.business_name,
    t.domain,
    COUNT(tm.period) as periods_count,
    array_agg(tm.period ORDER BY tm.period) as periods_found,
    CASE 
        WHEN COUNT(tm.period) = 3 THEN '✅ COMPLETE'
        ELSE '❌ MISSING'
    END as status
FROM tenants t
LEFT JOIN tenant_metrics tm ON t.id = tm.tenant_id 
    AND tm.metric_type = 'comprehensive'
WHERE t.status = 'active'
GROUP BY t.id, t.business_name, t.domain
ORDER BY periods_count DESC, t.business_name;