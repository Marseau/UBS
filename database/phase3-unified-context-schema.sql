-- =====================================================
-- 🎯 FASE 3: Sistema Unificado de Contexto - Schema
-- =====================================================
-- Criação da tabela unificada que substitui conversation_states
-- e centraliza todo o contexto conversacional do sistema
--
-- Autor: Claude Code (Fase 3 Implementation)
-- Data: 2025-01-15
-- =====================================================

-- ✅ PASSO 1: Criar tabela unified_conversation_contexts
CREATE TABLE IF NOT EXISTS unified_conversation_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ✅ IDENTIFICADORES ÚNICOS
    session_id_uuid UUID UNIQUE NOT NULL, -- Chave única de sessão
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ✅ CONTEXTO UNIFICADO EM JSONB ÚNICO
    context_data JSONB NOT NULL DEFAULT '{}'::JSONB, -- Absorve TUDO (flow_lock, appointment_state, etc.)

    -- ✅ METADADOS DE GESTÃO
    active_flows TEXT[] DEFAULT '{}', -- FlowTypes ativos: ['appointment_booking', 'user_onboarding']
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- TTL unificado (substitui conversation_states.expires_at)
    version INTEGER DEFAULT 1, -- Controle de versão para optimistic locking

    -- ✅ STATUS E PRIORIDADE
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'idle', 'expired', 'completed')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- ✅ AUDITORIA
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- ✅ CONSTRAINTS
    UNIQUE(tenant_id, user_id), -- Um contexto ativo por usuário por tenant
    CONSTRAINT valid_context_data CHECK (jsonb_typeof(context_data) = 'object'),
    CONSTRAINT valid_session_format CHECK (session_id_uuid::text ~ '^[0-9a-f-]{36}$' OR session_id_uuid::text ~ '^session_[0-9]+_[a-z0-9]+$')
);

-- ✅ ÍNDICES OTIMIZADOS
CREATE INDEX IF NOT EXISTS idx_unified_contexts_session ON unified_conversation_contexts(session_id_uuid);
CREATE INDEX IF NOT EXISTS idx_unified_contexts_tenant_user ON unified_conversation_contexts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_unified_contexts_activity ON unified_conversation_contexts(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_contexts_expires ON unified_conversation_contexts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_contexts_status ON unified_conversation_contexts(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_unified_contexts_flows ON unified_conversation_contexts USING GIN(active_flows);

-- ✅ PASSO 2: Adicionar coluna de referência em conversation_history
ALTER TABLE conversation_history
ADD COLUMN IF NOT EXISTS unified_context_id UUID REFERENCES unified_conversation_contexts(id);

-- ✅ ÍNDICE PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_conversation_history_unified_context
ON conversation_history(unified_context_id);

-- ✅ PASSO 3: Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_unified_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_unified_contexts_updated_at
    BEFORE UPDATE ON unified_conversation_contexts
    FOR EACH ROW EXECUTE FUNCTION update_unified_context_updated_at();

-- ✅ PASSO 4: Função helper para limpeza de contextos expirados
CREATE OR REPLACE FUNCTION cleanup_expired_unified_contexts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM unified_conversation_contexts
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ✅ PASSO 5: Função para migração de dados existentes
CREATE OR REPLACE FUNCTION migrate_conversation_states_to_unified()
RETURNS TABLE(migrated_count INTEGER, errors_count INTEGER) AS $$
DECLARE
    migrated_count INTEGER := 0;
    errors_count INTEGER := 0;
    rec RECORD;
BEGIN
    -- Migrar dados de conversation_states para unified_conversation_contexts
    FOR rec IN
        SELECT
            cs.tenant_id,
            cs.user_id,
            cs.current_state,
            cs.context,
            cs.expires_at,
            cs.created_at,
            cs.updated_at,
            -- Gerar session_id baseado nos dados existentes
            COALESCE(
                (cs.context->>'session_id')::UUID,
                gen_random_uuid()
            ) as session_id_uuid
        FROM conversation_states cs
        WHERE NOT EXISTS (
            SELECT 1 FROM unified_conversation_contexts uc
            WHERE uc.tenant_id = cs.tenant_id AND uc.user_id = cs.user_id
        )
    LOOP
        BEGIN
            INSERT INTO unified_conversation_contexts (
                session_id_uuid,
                tenant_id,
                user_id,
                context_data,
                active_flows,
                expires_at,
                status,
                created_at,
                updated_at
            ) VALUES (
                rec.session_id_uuid,
                rec.tenant_id,
                rec.user_id,
                COALESCE(rec.context, '{}'::JSONB),
                CASE
                    WHEN rec.current_state = 'awaiting_response' THEN ARRAY['appointment_booking']
                    WHEN rec.current_state = 'collecting_info' THEN ARRAY['user_onboarding']
                    ELSE ARRAY[]::TEXT[]
                END,
                rec.expires_at,
                CASE
                    WHEN rec.expires_at IS NOT NULL AND rec.expires_at < NOW() THEN 'expired'
                    WHEN rec.current_state = 'idle' THEN 'idle'
                    ELSE 'active'
                END,
                rec.created_at,
                rec.updated_at
            );
            migrated_count := migrated_count + 1;
        EXCEPTION WHEN OTHERS THEN
            errors_count := errors_count + 1;
            RAISE NOTICE 'Error migrating tenant_id=%, user_id=%: %', rec.tenant_id, rec.user_id, SQLERRM;
        END;
    END LOOP;

    RETURN QUERY SELECT migrated_count, errors_count;
END;
$$ LANGUAGE plpgsql;

-- ✅ COMENTÁRIOS PARA DOCUMENTAÇÃO
COMMENT ON TABLE unified_conversation_contexts IS 'FASE 3: Tabela unificada que centraliza todo o contexto conversacional, substituindo conversation_states e fragmentação de contexto';
COMMENT ON COLUMN unified_conversation_contexts.context_data IS 'JSONB unificado contendo flow_lock, appointment_flow_state, session_metadata, intent_history e todos os contextos';
COMMENT ON COLUMN unified_conversation_contexts.active_flows IS 'Array de flows ativos: appointment_booking, user_onboarding, contextual_upsell, etc.';
COMMENT ON COLUMN unified_conversation_contexts.version IS 'Controle de versão para optimistic locking e detecção de race conditions';
COMMENT ON FUNCTION migrate_conversation_states_to_unified() IS 'Função de migração que consolida dados de conversation_states para a nova tabela unificada';
COMMENT ON FUNCTION cleanup_expired_unified_contexts() IS 'Limpeza automática de contextos expirados - executar via cron job';

-- ✅ MENSAGEM DE SUCESSO
DO $$
BEGIN
    RAISE NOTICE '🎯 FASE 3: Schema do Sistema Unificado de Contexto criado com sucesso!';
    RAISE NOTICE '✅ Tabela unified_conversation_contexts: PRONTA';
    RAISE NOTICE '✅ Coluna unified_context_id em conversation_history: ADICIONADA';
    RAISE NOTICE '✅ Índices otimizados: CRIADOS';
    RAISE NOTICE '✅ Funções de migração: PRONTAS';
    RAISE NOTICE '🔄 Próximo passo: Executar migração com migrate_conversation_states_to_unified()';
END $$;