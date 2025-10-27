-- =====================================================
-- 🎯 FASE 3: Script de Migração para Sistema Unificado
-- =====================================================
-- Migração completa de conversation_states para unified_conversation_contexts
-- Enriquecimento de conversation_history com referências unificadas
-- Consolidação de contextos fragmentados
--
-- Autor: Claude Code (Fase 3 Implementation)
-- Data: 2025-01-15
-- =====================================================

-- ✅ PASSO 1: Verificação de Pré-requisitos
DO $$
DECLARE
    unified_table_exists BOOLEAN;
    conversation_history_has_column BOOLEAN;
BEGIN
    -- Verificar se tabela unified_conversation_contexts existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'unified_conversation_contexts'
    ) INTO unified_table_exists;

    -- Verificar se coluna unified_context_id existe em conversation_history
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_history'
        AND column_name = 'unified_context_id'
    ) INTO conversation_history_has_column;

    IF NOT unified_table_exists THEN
        RAISE EXCEPTION 'Tabela unified_conversation_contexts não existe. Execute phase3-unified-context-schema.sql primeiro.';
    END IF;

    IF NOT conversation_history_has_column THEN
        RAISE EXCEPTION 'Coluna unified_context_id não existe em conversation_history. Execute phase3-unified-context-schema.sql primeiro.';
    END IF;

    RAISE NOTICE '✅ Pré-requisitos verificados. Iniciando migração...';
END $$;

-- ✅ PASSO 2: Função de Backup de Segurança
CREATE OR REPLACE FUNCTION create_phase3_backup()
RETURNS VOID AS $$
BEGIN
    -- Backup conversation_states
    DROP TABLE IF EXISTS conversation_states_backup_phase3;
    CREATE TABLE conversation_states_backup_phase3 AS
    SELECT * FROM conversation_states;

    -- Backup conversation_history (apenas estrutura + sample)
    DROP TABLE IF EXISTS conversation_history_backup_phase3;
    CREATE TABLE conversation_history_backup_phase3 AS
    SELECT * FROM conversation_history LIMIT 1000;

    RAISE NOTICE '✅ Backup de segurança criado: conversation_states_backup_phase3, conversation_history_backup_phase3';
END;
$$ LANGUAGE plpgsql;

-- ✅ PASSO 3: Função para Migração de conversation_states
CREATE OR REPLACE FUNCTION migrate_conversation_states_data()
RETURNS TABLE(
    migrated_sessions INTEGER,
    errors_count INTEGER,
    details JSONB
) AS $$
DECLARE
    migrated_sessions INTEGER := 0;
    errors_count INTEGER := 0;
    details JSONB := '{"migrated_tenants": [], "errors": []}'::JSONB;
    rec RECORD;
    session_id_generated UUID;
    tenant_list UUID[] := '{}';
BEGIN
    RAISE NOTICE '🔄 Iniciando migração de conversation_states...';

    FOR rec IN
        SELECT DISTINCT
            cs.tenant_id,
            cs.user_id,
            cs.current_state,
            cs.context,
            cs.expires_at,
            cs.created_at,
            cs.updated_at,
            -- Extrair session_id do context JSONB se existir
            CASE
                WHEN cs.context ? 'session_id' THEN
                    CASE
                        WHEN cs.context->>'session_id' ~ '^[0-9a-f-]{36}$' THEN
                            (cs.context->>'session_id')::UUID
                        ELSE gen_random_uuid()
                    END
                ELSE gen_random_uuid()
            END as session_id_uuid
        FROM conversation_states cs
        WHERE NOT EXISTS (
            SELECT 1 FROM unified_conversation_contexts uc
            WHERE uc.tenant_id = cs.tenant_id
            AND uc.user_id = cs.user_id
        )
    LOOP
        BEGIN
            session_id_generated := rec.session_id_uuid;

            -- Inserir na tabela unificada
            INSERT INTO unified_conversation_contexts (
                session_id_uuid,
                tenant_id,
                user_id,
                context_data,
                active_flows,
                last_activity_at,
                expires_at,
                status,
                priority,
                created_at,
                updated_at
            ) VALUES (
                session_id_generated,
                rec.tenant_id,
                rec.user_id,
                -- ✅ Migrar context para context_data com estrutura unificada
                COALESCE(rec.context, '{}'::JSONB) || jsonb_build_object(
                    'session_metadata', jsonb_build_object(
                        'session_started_at', rec.created_at,
                        'message_count', 0,
                        'duration_minutes', 0,
                        'last_message_at', rec.updated_at
                    ),
                    'intent_history', '[]'::JSONB,
                    'unified_context_ref', jsonb_build_object(
                        'context_id', '', -- Será atualizado após inserção
                        'sync_version', 1,
                        'last_sync_at', NOW(),
                        'source_system', 'migrated'
                    ),
                    'context_snapshot', jsonb_build_object(
                        'active_flows', CASE
                            WHEN rec.current_state = 'awaiting_response' THEN '["appointment_booking"]'::JSONB
                            WHEN rec.current_state = 'collecting_info' THEN '["user_onboarding"]'::JSONB
                            ELSE '[]'::JSONB
                        END,
                        'message_sequence', 0,
                        'conversation_phase', rec.current_state
                    )
                ),
                -- ✅ Mapear current_state para active_flows
                CASE
                    WHEN rec.current_state = 'awaiting_response' THEN ARRAY['appointment_booking']
                    WHEN rec.current_state = 'collecting_info' THEN ARRAY['user_onboarding']
                    WHEN rec.current_state = 'idle' THEN ARRAY[]::TEXT[]
                    ELSE ARRAY['general']
                END,
                COALESCE(rec.updated_at, rec.created_at, NOW()),
                rec.expires_at,
                -- ✅ Mapear status
                CASE
                    WHEN rec.expires_at IS NOT NULL AND rec.expires_at < NOW() THEN 'expired'
                    WHEN rec.current_state = 'idle' THEN 'idle'
                    WHEN rec.current_state = 'awaiting_response' THEN 'active'
                    ELSE 'active'
                END,
                'normal', -- priority default
                rec.created_at,
                COALESCE(rec.updated_at, rec.created_at, NOW())
            );

            -- Atualizar context_id na referência
            UPDATE unified_conversation_contexts
            SET context_data = context_data || jsonb_build_object(
                'unified_context_ref',
                (context_data->'unified_context_ref') || jsonb_build_object('context_id', id::text)
            )
            WHERE session_id_uuid = session_id_generated;

            migrated_sessions := migrated_sessions + 1;

            -- Adicionar tenant à lista se não existir
            IF NOT (rec.tenant_id = ANY(tenant_list)) THEN
                tenant_list := tenant_list || rec.tenant_id;
            END IF;

            IF migrated_sessions % 100 = 0 THEN
                RAISE NOTICE 'Migradas % sessões...', migrated_sessions;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            errors_count := errors_count + 1;
            details := jsonb_set(
                details,
                '{errors}',
                (details->'errors') || jsonb_build_object(
                    'tenant_id', rec.tenant_id,
                    'user_id', rec.user_id,
                    'error', SQLERRM
                )
            );
            RAISE NOTICE 'Erro migrando tenant_id=%, user_id=%: %', rec.tenant_id, rec.user_id, SQLERRM;
        END;
    END LOOP;

    -- Atualizar details com tenants migrados
    details := jsonb_set(details, '{migrated_tenants}', to_jsonb(tenant_list));

    RAISE NOTICE '✅ Migração de conversation_states concluída: % sessões, % erros', migrated_sessions, errors_count;

    RETURN QUERY SELECT migrated_sessions, errors_count, details;
END;
$$ LANGUAGE plpgsql;

-- ✅ PASSO 4: Função para Enriquecer conversation_history
CREATE OR REPLACE FUNCTION enrich_conversation_history_with_unified_refs()
RETURNS TABLE(
    updated_records INTEGER,
    errors_count INTEGER
) AS $$
DECLARE
    updated_records INTEGER := 0;
    errors_count INTEGER := 0;
    batch_size INTEGER := 1000;
    offset_val INTEGER := 0;
    batch_updated INTEGER;
BEGIN
    RAISE NOTICE '🔄 Iniciando enriquecimento de conversation_history...';

    LOOP
        -- Processar em batches para performance
        WITH batch_update AS (
            UPDATE conversation_history ch
            SET
                unified_context_id = uc.id,
                conversation_context = CASE
                    WHEN ch.conversation_context ? 'unified_context_ref' THEN ch.conversation_context
                    ELSE ch.conversation_context || jsonb_build_object(
                        'unified_context_ref', jsonb_build_object(
                            'context_id', uc.id::text,
                            'sync_version', 1,
                            'last_sync_at', NOW(),
                            'source_system', 'migrated'
                        ),
                        'context_snapshot', jsonb_build_object(
                            'active_flows', uc.active_flows,
                            'message_sequence',
                                ROW_NUMBER() OVER (
                                    PARTITION BY ch.session_id_uuid
                                    ORDER BY ch.created_at
                                ),
                            'conversation_phase', 'migrated'
                        )
                    )
                END
            FROM unified_conversation_contexts uc
            WHERE ch.session_id_uuid = uc.session_id_uuid
                AND ch.unified_context_id IS NULL
                AND ch.id IN (
                    SELECT id FROM conversation_history
                    WHERE unified_context_id IS NULL
                    ORDER BY created_at DESC
                    LIMIT batch_size OFFSET offset_val
                )
            RETURNING ch.id
        )
        SELECT COUNT(*) INTO batch_updated FROM batch_update;

        updated_records := updated_records + batch_updated;
        offset_val := offset_val + batch_size;

        RAISE NOTICE 'Batch processado: % registros atualizados (total: %)', batch_updated, updated_records;

        -- Sair do loop se não há mais registros para processar
        EXIT WHEN batch_updated = 0;

        -- Evitar loops infinitos
        IF offset_val > 1000000 THEN
            RAISE NOTICE 'Limite de segurança atingido (1M registros). Parando processamento.';
            EXIT;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ Enriquecimento de conversation_history concluído: % registros atualizados', updated_records;

    RETURN QUERY SELECT updated_records, errors_count;
END;
$$ LANGUAGE plpgsql;

-- ✅ PASSO 5: Função Principal de Migração
CREATE OR REPLACE FUNCTION execute_phase3_migration()
RETURNS TABLE(
    step TEXT,
    success BOOLEAN,
    message TEXT,
    details JSONB
) AS $$
DECLARE
    migration_result RECORD;
    enrichment_result RECORD;
    cleanup_count INTEGER;
BEGIN
    RETURN QUERY SELECT 'backup'::TEXT, true, 'Criando backup de segurança...', '{}'::JSONB;

    -- Passo 1: Backup
    BEGIN
        PERFORM create_phase3_backup();
        RETURN QUERY SELECT 'backup'::TEXT, true, 'Backup criado com sucesso', '{}'::JSONB;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'backup'::TEXT, false, 'Erro no backup: ' || SQLERRM, '{}'::JSONB;
        RETURN;
    END;

    -- Passo 2: Migração de conversation_states
    BEGIN
        SELECT * INTO migration_result FROM migrate_conversation_states_data();
        RETURN QUERY SELECT
            'migration'::TEXT,
            true,
            format('Migradas %s sessões com %s erros', migration_result.migrated_sessions, migration_result.errors_count),
            migration_result.details;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'migration'::TEXT, false, 'Erro na migração: ' || SQLERRM, '{}'::JSONB;
        RETURN;
    END;

    -- Passo 3: Enriquecimento de conversation_history
    BEGIN
        SELECT * INTO enrichment_result FROM enrich_conversation_history_with_unified_refs();
        RETURN QUERY SELECT
            'enrichment'::TEXT,
            true,
            format('Enriquecidos %s registros de conversation_history', enrichment_result.updated_records),
            jsonb_build_object('updated_records', enrichment_result.updated_records);
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'enrichment'::TEXT, false, 'Erro no enriquecimento: ' || SQLERRM, '{}'::JSONB;
        RETURN;
    END;

    -- Passo 4: Cleanup de contextos expirados
    BEGIN
        SELECT cleanup_expired_unified_contexts() INTO cleanup_count;
        RETURN QUERY SELECT
            'cleanup'::TEXT,
            true,
            format('Limpeza: %s contextos expirados removidos', cleanup_count),
            jsonb_build_object('cleaned_contexts', cleanup_count);
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'cleanup'::TEXT, false, 'Erro na limpeza: ' || SQLERRM, '{}'::JSONB;
    END;

    -- Passo 5: Estatísticas finais
    BEGIN
        RETURN QUERY SELECT
            'statistics'::TEXT,
            true,
            'Migração Fase 3 concluída com sucesso!',
            jsonb_build_object(
                'unified_contexts_total', (SELECT COUNT(*) FROM unified_conversation_contexts),
                'conversation_history_with_refs', (SELECT COUNT(*) FROM conversation_history WHERE unified_context_id IS NOT NULL),
                'conversation_states_remaining', (SELECT COUNT(*) FROM conversation_states),
                'migration_timestamp', NOW()
            );
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'statistics'::TEXT, false, 'Erro nas estatísticas: ' || SQLERRM, '{}'::JSONB;
    END;
END;
$$ LANGUAGE plpgsql;

-- ✅ PASSO 6: Função para Rollback (Em caso de emergência)
CREATE OR REPLACE FUNCTION rollback_phase3_migration()
RETURNS TABLE(
    step TEXT,
    success BOOLEAN,
    message TEXT
) AS $$
BEGIN
    RETURN QUERY SELECT 'warning'::TEXT, true, '⚠️ INICIANDO ROLLBACK DA FASE 3 - Esta operação é irreversível!';

    -- Restaurar conversation_states se backup existir
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_states_backup_phase3') THEN
            DELETE FROM conversation_states;
            INSERT INTO conversation_states SELECT * FROM conversation_states_backup_phase3;
            RETURN QUERY SELECT 'restore_states'::TEXT, true, 'conversation_states restaurada do backup';
        ELSE
            RETURN QUERY SELECT 'restore_states'::TEXT, false, 'Backup conversation_states_backup_phase3 não encontrado';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'restore_states'::TEXT, false, 'Erro restaurando conversation_states: ' || SQLERRM;
    END;

    -- Limpar unified_context_id de conversation_history
    BEGIN
        UPDATE conversation_history SET unified_context_id = NULL;
        RETURN QUERY SELECT 'cleanup_refs'::TEXT, true, 'Referencias unified_context_id removidas de conversation_history';
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'cleanup_refs'::TEXT, false, 'Erro limpando referências: ' || SQLERRM;
    END;

    -- Limpar unified_conversation_contexts
    BEGIN
        DELETE FROM unified_conversation_contexts;
        RETURN QUERY SELECT 'cleanup_unified'::TEXT, true, 'Tabela unified_conversation_contexts limpa';
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'cleanup_unified'::TEXT, false, 'Erro limpando unified_conversation_contexts: ' || SQLERRM;
    END;

    RETURN QUERY SELECT 'completed'::TEXT, true, '✅ Rollback da Fase 3 concluído';
END;
$$ LANGUAGE plpgsql;

-- ✅ MENSAGEM FINAL
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 FASE 3: Script de migração carregado com sucesso!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 COMANDOS DISPONÍVEIS:';
    RAISE NOTICE '   SELECT * FROM execute_phase3_migration();           -- Executar migração completa';
    RAISE NOTICE '   SELECT * FROM migrate_conversation_states_data();    -- Apenas migrar conversation_states';
    RAISE NOTICE '   SELECT * FROM enrich_conversation_history_with_unified_refs(); -- Apenas enriquecer conversation_history';
    RAISE NOTICE '   SELECT cleanup_expired_unified_contexts();          -- Limpeza de contextos expirados';
    RAISE NOTICE '   SELECT * FROM rollback_phase3_migration();          -- ⚠️ ROLLBACK (emergência)';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Para executar a migração completa, execute:';
    RAISE NOTICE '   SELECT * FROM execute_phase3_migration();';
    RAISE NOTICE '';
END $$;