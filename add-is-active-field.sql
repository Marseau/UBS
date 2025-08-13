-- Adicionar campo is_active na tabela tenants
-- Execute este SQL no Supabase SQL Editor se quiser ter controle de tenants ativos/inativos

DO $$ 
BEGIN
    -- Verificar se a coluna já existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'is_active'
    ) THEN
        -- Adicionar a coluna
        ALTER TABLE tenants 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        -- Atualizar todos os registros existentes como ativos
        UPDATE tenants SET is_active = true WHERE is_active IS NULL;
        
        -- Adicionar índice para performance
        CREATE INDEX idx_tenants_is_active ON tenants(is_active);
        
        RAISE NOTICE 'Coluna is_active adicionada com sucesso à tabela tenants';
    ELSE
        RAISE NOTICE 'Coluna is_active já existe na tabela tenants';
    END IF;
END $$;