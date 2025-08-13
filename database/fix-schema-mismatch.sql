-- =====================================================
-- CORRIGIR SCHEMA MISMATCH - ADICIONAR MONTHLY_REVENUE
-- =====================================================
-- Resolve o erro: column t.monthly_revenue does not exist
-- Adiciona coluna necessária para calculate_enhanced_platform_metrics()
-- =====================================================

-- 1. ADICIONAR COLUNA MONTHLY_REVENUE NA TABELA TENANTS
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS monthly_revenue DECIMAL(10,2) DEFAULT 79.90;

-- 2. ATUALIZAR TENANTS EXISTENTES COM VALOR PADRÃO
UPDATE tenants 
SET monthly_revenue = 79.90 
WHERE monthly_revenue IS NULL;

-- 3. ADICIONAR COMENTÁRIO PARA DOCUMENTAÇÃO
COMMENT ON COLUMN tenants.monthly_revenue IS 'Receita mensal do tenant em reais (R$)';

-- 4. CRIAR ÍNDICE PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tenants_monthly_revenue 
ON tenants(monthly_revenue) WHERE monthly_revenue IS NOT NULL;

-- 5. VERIFICAR SE A COLUNA FOI CRIADA
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'tenants' 
AND column_name = 'monthly_revenue';

-- 6. TESTAR A FUNÇÃO APÓS CORREÇÃO
SELECT calculate_enhanced_platform_metrics(CURRENT_DATE, 30);

-- =====================================================
-- RESULTADO ESPERADO:
-- =====================================================
-- ✅ Coluna monthly_revenue adicionada à tabela tenants
-- ✅ Valor padrão R$ 79.90 aplicado
-- ✅ Função calculate_enhanced_platform_metrics() funcionando
-- ✅ Schema mismatch resolvido
-- =====================================================