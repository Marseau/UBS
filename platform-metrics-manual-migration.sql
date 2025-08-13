-- MIGRAÇÃO MANUAL PLATFORM_METRICS ENHANCED
-- Execute este SQL no Supabase SQL Editor

-- 1. Adicionar campo CLV médio da plataforma
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS platform_avg_clv NUMERIC(12,2) DEFAULT NULL;

-- 2. Adicionar campo taxa de conversão média
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS platform_avg_conversion_rate NUMERIC(5,2) DEFAULT NULL;

-- 3. Adicionar campo tenants de alto risco
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS platform_high_risk_tenants INTEGER DEFAULT NULL;

-- 4. Adicionar campo breakdown por domínio (JSON)
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS platform_domain_breakdown JSONB DEFAULT NULL;

-- 5. Adicionar campo score de qualidade WhatsApp
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS platform_quality_score NUMERIC(5,2) DEFAULT NULL;

-- Verificar estrutura atualizada
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'platform_metrics' 
ORDER BY ordinal_position;