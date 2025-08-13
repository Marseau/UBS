-- =====================================================
-- APLICAR CORREÇÃO DO TIMING BUG NA V5.0 COMPLETA
-- Pegar v5.0 completa e aplicar APENAS Fix 9: timing bug
-- =====================================================

-- Primeiro, vamos aplicar a v5.0 completa via Supabase SQL Editor
-- Depois aplicamos esta correção específica

-- Encontrar a linha problemática na v5.0 (aproximadamente linha 703-714):
/*
-- ❌ VERSÃO COM TIMING BUG (v5.0):
IF EXISTS (
    SELECT 1 FROM tenant_metrics 
    WHERE tenant_id = v_tenant_record.id 
    AND metric_type = 'comprehensive'
    AND period = v_period_days || 'd'
    AND created_at >= v_execution_start  -- TIMING BUG AQUI
) THEN
    v_store_result := true;
*/

-- ✅ SUBSTITUIR POR ESTA VERIFICAÇÃO ROBUSTA:
-- Adicionar estas variáveis no DECLARE inicial da v5.0:
-- v_record_count_before INTEGER := 0;
-- v_record_count_after INTEGER := 0; 
-- v_verification_attempts INTEGER := 0;

-- SUBSTITUIR o bloco de verificação por:
/*
-- Count records BEFORE storage
SELECT COUNT(*) INTO v_record_count_before
FROM tenant_metrics 
WHERE tenant_id = v_tenant_record.id 
AND metric_type = 'comprehensive'
AND period = v_period_days || 'd';

-- Execute store_tenant_metric
PERFORM store_tenant_metric(...);

-- ROBUST VERIFICATION with retry
v_verification_attempts := 0;
WHILE v_verification_attempts < 5 AND v_store_result = false LOOP
    IF v_verification_attempts > 0 THEN
        PERFORM pg_sleep(0.1);
    END IF;
    
    SELECT COUNT(*) INTO v_record_count_after
    FROM tenant_metrics 
    WHERE tenant_id = v_tenant_record.id 
    AND metric_type = 'comprehensive'
    AND period = v_period_days || 'd';
    
    IF v_record_count_after > v_record_count_before THEN
        v_store_result := true;
        RAISE NOTICE 'SUCCESS: Verified storage for tenant % period %d (attempt %)', 
            LEFT(v_tenant_record.id::text, 8), v_period_days, v_verification_attempts + 1;
        EXIT;
    END IF;
    
    v_verification_attempts := v_verification_attempts + 1;
    
    IF v_verification_attempts >= 5 THEN
        RAISE WARNING 'VERIFICATION FAILED: Tenant % period %d - Before: %, After: %', 
            LEFT(v_tenant_record.id::text, 8), v_period_days, 
            v_record_count_before, v_record_count_after;
    END IF;
END LOOP;
*/

-- INSTRUÇÕES DE APLICAÇÃO:
-- 1. Aplique primeiro a v5.0 completa do arquivo DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql
-- 2. Depois encontre a linha com "IF EXISTS" e "created_at >= v_execution_start"  
-- 3. Substitua por este bloco de verificação robusta
-- 4. Adicione as 3 variáveis no bloco DECLARE inicial

SELECT 'Ready to apply timing fix to complete v5.0!' as status;