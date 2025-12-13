-- =====================================================
-- Migration 080: 3-Layer Conversation Memory System
-- Arquitetura: Window + RAG Chunks + Summary Index
-- =====================================================

-- =====================================================
-- CAMADA 3: CHUNKS SEMÂNTICOS
-- Agrupa mensagens por tópico (5-10 msgs)
-- =====================================================

CREATE TABLE IF NOT EXISTS aic_conversation_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES aic_conversations(id) ON DELETE CASCADE,

    -- Ordenação e identificação
    chunk_order INTEGER NOT NULL,
    topic_id VARCHAR(100),
    topic_label VARCHAR(200),

    -- Range de mensagens cobertas
    message_start INTEGER NOT NULL,
    message_end INTEGER NOT NULL,
    message_count INTEGER NOT NULL,

    -- Conteúdo
    content TEXT NOT NULL,
    embedding VECTOR(1536),

    -- Metadados enriquecidos
    participants JSONB DEFAULT '{}',
    detected_intents TEXT[] DEFAULT '{}',
    detected_entities JSONB DEFAULT '{}',
    sentiment_avg NUMERIC(3,2),

    -- Timestamps
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_message_range CHECK (message_end > message_start),
    CONSTRAINT unique_chunk_per_conversation UNIQUE (conversation_id, chunk_order)
);

-- Índices para chunks
CREATE INDEX IF NOT EXISTS idx_chunks_conversation ON aic_conversation_chunks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chunks_topic ON aic_conversation_chunks(topic_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON aic_conversation_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================
-- CAMADA 2: SUMMARIES (ÍNDICE DE ALTO NÍVEL)
-- "Mapa de navegação" para buscar no lugar certo
-- =====================================================

CREATE TABLE IF NOT EXISTS aic_conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES aic_conversations(id) ON DELETE CASCADE,

    -- Ordenação
    summary_order INTEGER NOT NULL,

    -- Conteúdo do resumo
    summary_text TEXT NOT NULL,
    embedding VECTOR(1536),

    -- Relacionamento com chunks
    chunk_ids UUID[] DEFAULT '{}',
    message_start INTEGER,
    message_end INTEGER,

    -- Metadados agregados
    main_topics TEXT[] DEFAULT '{}',
    lead_sentiment VARCHAR(20),
    qualification_status VARCHAR(50),
    key_facts JSONB DEFAULT '{}',

    -- Timestamps
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_summary_per_conversation UNIQUE (conversation_id, summary_order)
);

-- Índices para summaries
CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON aic_conversation_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_summaries_embedding ON aic_conversation_summaries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- =====================================================
-- FUNÇÃO: get_window_messages
-- Retorna as últimas N mensagens (Camada 1)
-- =====================================================

CREATE OR REPLACE FUNCTION get_window_messages(
    p_conversation_id UUID,
    p_window_size INTEGER DEFAULT 20
)
RETURNS TABLE (
    message_order INTEGER,
    direction VARCHAR,
    sender_type VARCHAR,
    content TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.message_order,
        m.direction,
        m.sender_type,
        m.content,
        m.created_at
    FROM aic_conversation_messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.message_order DESC
    LIMIT p_window_size;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: get_unchunked_messages
-- Retorna mensagens que ainda não estão em chunks
-- =====================================================

CREATE OR REPLACE FUNCTION get_unchunked_messages(
    p_conversation_id UUID
)
RETURNS TABLE (
    message_order INTEGER,
    direction VARCHAR,
    sender_type VARCHAR,
    content TEXT,
    detected_intent VARCHAR,
    detected_sentiment VARCHAR,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_last_chunked_message INTEGER;
BEGIN
    -- Encontrar última mensagem já chunkeada
    SELECT COALESCE(MAX(message_end), 0) INTO v_last_chunked_message
    FROM aic_conversation_chunks
    WHERE conversation_id = p_conversation_id;

    RETURN QUERY
    SELECT
        m.message_order,
        m.direction,
        m.sender_type,
        m.content,
        m.detected_intent,
        m.detected_sentiment,
        m.created_at
    FROM aic_conversation_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.message_order > v_last_chunked_message
    ORDER BY m.message_order ASC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: create_conversation_chunk
-- Cria um chunk a partir de um range de mensagens
-- =====================================================

CREATE OR REPLACE FUNCTION create_conversation_chunk(
    p_conversation_id UUID,
    p_message_start INTEGER,
    p_message_end INTEGER,
    p_topic_id VARCHAR DEFAULT NULL,
    p_topic_label VARCHAR DEFAULT NULL,
    p_detected_intents TEXT[] DEFAULT '{}',
    p_detected_entities JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_chunk_id UUID;
    v_chunk_order INTEGER;
    v_content TEXT;
    v_message_count INTEGER;
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    v_sentiment_avg NUMERIC;
    v_participants JSONB;
BEGIN
    -- Calcular próximo chunk_order
    SELECT COALESCE(MAX(chunk_order), 0) + 1 INTO v_chunk_order
    FROM aic_conversation_chunks
    WHERE conversation_id = p_conversation_id;

    -- Agregar conteúdo das mensagens
    SELECT
        string_agg(
            CASE
                WHEN sender_type = 'lead' THEN 'Lead: ' || content
                ELSE 'AI: ' || content
            END,
            E'\n'
            ORDER BY message_order
        ),
        COUNT(*),
        MIN(created_at),
        MAX(created_at),
        AVG(CASE
            WHEN detected_sentiment = 'positive' THEN 1
            WHEN detected_sentiment = 'negative' THEN -1
            ELSE 0
        END),
        jsonb_build_object(
            'lead_messages', COUNT(*) FILTER (WHERE sender_type = 'lead'),
            'ai_messages', COUNT(*) FILTER (WHERE sender_type != 'lead')
        )
    INTO v_content, v_message_count, v_started_at, v_ended_at, v_sentiment_avg, v_participants
    FROM aic_conversation_messages
    WHERE conversation_id = p_conversation_id
      AND message_order >= p_message_start
      AND message_order <= p_message_end;

    -- Inserir chunk
    INSERT INTO aic_conversation_chunks (
        conversation_id,
        chunk_order,
        topic_id,
        topic_label,
        message_start,
        message_end,
        message_count,
        content,
        participants,
        detected_intents,
        detected_entities,
        sentiment_avg,
        started_at,
        ended_at
    ) VALUES (
        p_conversation_id,
        v_chunk_order,
        COALESCE(p_topic_id, 'topic_' || v_chunk_order),
        p_topic_label,
        p_message_start,
        p_message_end,
        v_message_count,
        v_content,
        v_participants,
        p_detected_intents,
        p_detected_entities,
        v_sentiment_avg,
        v_started_at,
        v_ended_at
    )
    RETURNING id INTO v_chunk_id;

    RETURN v_chunk_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: create_conversation_summary
-- Cria um summary cobrindo múltiplos chunks
-- =====================================================

CREATE OR REPLACE FUNCTION create_conversation_summary(
    p_conversation_id UUID,
    p_summary_text TEXT,
    p_chunk_ids UUID[],
    p_main_topics TEXT[] DEFAULT '{}',
    p_lead_sentiment VARCHAR DEFAULT NULL,
    p_qualification_status VARCHAR DEFAULT NULL,
    p_key_facts JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_summary_id UUID;
    v_summary_order INTEGER;
    v_message_start INTEGER;
    v_message_end INTEGER;
BEGIN
    -- Calcular próximo summary_order
    SELECT COALESCE(MAX(summary_order), 0) + 1 INTO v_summary_order
    FROM aic_conversation_summaries
    WHERE conversation_id = p_conversation_id;

    -- Calcular range de mensagens coberto pelos chunks
    SELECT MIN(message_start), MAX(message_end)
    INTO v_message_start, v_message_end
    FROM aic_conversation_chunks
    WHERE id = ANY(p_chunk_ids);

    -- Inserir summary
    INSERT INTO aic_conversation_summaries (
        conversation_id,
        summary_order,
        summary_text,
        chunk_ids,
        message_start,
        message_end,
        main_topics,
        lead_sentiment,
        qualification_status,
        key_facts
    ) VALUES (
        p_conversation_id,
        v_summary_order,
        p_summary_text,
        p_chunk_ids,
        v_message_start,
        v_message_end,
        p_main_topics,
        p_lead_sentiment,
        p_qualification_status,
        p_key_facts
    )
    RETURNING id INTO v_summary_id;

    RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: search_summaries
-- Busca semântica nos summaries (top K)
-- =====================================================

CREATE OR REPLACE FUNCTION search_summaries(
    p_conversation_id UUID,
    p_query_embedding VECTOR(1536),
    p_top_k INTEGER DEFAULT 3
)
RETURNS TABLE (
    summary_id UUID,
    summary_text TEXT,
    chunk_ids UUID[],
    main_topics TEXT[],
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.summary_text,
        s.chunk_ids,
        s.main_topics,
        1 - (s.embedding <=> p_query_embedding) as similarity
    FROM aic_conversation_summaries s
    WHERE s.conversation_id = p_conversation_id
      AND s.embedding IS NOT NULL
    ORDER BY s.embedding <=> p_query_embedding
    LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: search_chunks_by_ids
-- Busca chunks específicos com ranking por similaridade
-- =====================================================

CREATE OR REPLACE FUNCTION search_chunks_by_ids(
    p_chunk_ids UUID[],
    p_query_embedding VECTOR(1536),
    p_top_k INTEGER DEFAULT 8
)
RETURNS TABLE (
    chunk_id UUID,
    topic_label VARCHAR,
    content TEXT,
    detected_intents TEXT[],
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.topic_label,
        c.content,
        c.detected_intents,
        1 - (c.embedding <=> p_query_embedding) as similarity
    FROM aic_conversation_chunks c
    WHERE c.id = ANY(p_chunk_ids)
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: retrieve_3layer_context
-- Recuperação completa: Window + Summary Search + Chunk Search
-- =====================================================

CREATE OR REPLACE FUNCTION retrieve_3layer_context(
    p_conversation_id UUID,
    p_query_embedding VECTOR(1536),
    p_window_size INTEGER DEFAULT 20,
    p_summary_top_k INTEGER DEFAULT 3,
    p_chunk_top_k INTEGER DEFAULT 5
)
RETURNS JSONB AS $$
DECLARE
    v_window JSONB;
    v_summaries JSONB;
    v_chunks JSONB;
    v_all_chunk_ids UUID[];
    v_result JSONB;
BEGIN
    -- CAMADA 1: Window (últimas N mensagens)
    SELECT jsonb_agg(
        jsonb_build_object(
            'order', message_order,
            'direction', direction,
            'sender', sender_type,
            'content', content
        ) ORDER BY message_order DESC
    )
    INTO v_window
    FROM get_window_messages(p_conversation_id, p_window_size);

    -- CAMADA 2: Search Summaries
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'id', summary_id,
                'text', summary_text,
                'topics', main_topics,
                'similarity', ROUND(similarity::numeric, 4)
            )
        ),
        array_agg(unnested_chunk_id)
    INTO v_summaries, v_all_chunk_ids
    FROM (
        SELECT summary_id, summary_text, main_topics, similarity, unnest(chunk_ids) as unnested_chunk_id
        FROM search_summaries(p_conversation_id, p_query_embedding, p_summary_top_k)
    ) sub;

    -- CAMADA 3: Search Chunks (dos summaries vencedores)
    IF v_all_chunk_ids IS NOT NULL AND array_length(v_all_chunk_ids, 1) > 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', chunk_id,
                'topic', topic_label,
                'content', content,
                'intents', detected_intents,
                'similarity', ROUND(similarity::numeric, 4)
            )
        )
        INTO v_chunks
        FROM search_chunks_by_ids(v_all_chunk_ids, p_query_embedding, p_chunk_top_k);
    END IF;

    -- Montar resultado final
    v_result := jsonb_build_object(
        'window', COALESCE(v_window, '[]'::jsonb),
        'window_count', COALESCE(jsonb_array_length(v_window), 0),
        'summaries', COALESCE(v_summaries, '[]'::jsonb),
        'summaries_count', COALESCE(jsonb_array_length(v_summaries), 0),
        'chunks', COALESCE(v_chunks, '[]'::jsonb),
        'chunks_count', COALESCE(jsonb_array_length(v_chunks), 0)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: get_conversations_needing_chunking
-- Lista conversas que precisam de novos chunks
-- =====================================================

CREATE OR REPLACE FUNCTION get_conversations_needing_chunking(
    p_min_unchunked_messages INTEGER DEFAULT 5
)
RETURNS TABLE (
    conversation_id UUID,
    lead_phone VARCHAR,
    total_messages INTEGER,
    last_chunked_message INTEGER,
    unchunked_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.lead_phone,
        c.total_messages,
        COALESCE(MAX(ch.message_end), 0)::INTEGER as last_chunked_message,
        (c.total_messages - COALESCE(MAX(ch.message_end), 0))::INTEGER as unchunked_count
    FROM aic_conversations c
    LEFT JOIN aic_conversation_chunks ch ON ch.conversation_id = c.id
    WHERE c.total_messages > 0
    GROUP BY c.id, c.lead_phone, c.total_messages
    HAVING (c.total_messages - COALESCE(MAX(ch.message_end), 0)) >= p_min_unchunked_messages
    ORDER BY unchunked_count DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: update_chunk_embedding
-- Atualiza embedding de um chunk
-- =====================================================

CREATE OR REPLACE FUNCTION update_chunk_embedding(
    p_chunk_id UUID,
    p_embedding VECTOR(1536)
)
RETURNS VOID AS $$
BEGIN
    UPDATE aic_conversation_chunks
    SET embedding = p_embedding,
        embedded_at = NOW()
    WHERE id = p_chunk_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: update_summary_embedding
-- Atualiza embedding de um summary
-- =====================================================

CREATE OR REPLACE FUNCTION update_summary_embedding(
    p_summary_id UUID,
    p_embedding VECTOR(1536)
)
RETURNS VOID AS $$
BEGIN
    UPDATE aic_conversation_summaries
    SET embedding = p_embedding,
        embedded_at = NOW()
    WHERE id = p_summary_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON TABLE aic_conversation_chunks IS 'Camada 3: Chunks semânticos agrupando 5-10 mensagens por tópico';
COMMENT ON TABLE aic_conversation_summaries IS 'Camada 2: Summaries como índice de alto nível para navegação';
COMMENT ON FUNCTION retrieve_3layer_context IS 'Recuperação completa: Window + Summary Search + Chunk Search';
COMMENT ON FUNCTION get_conversations_needing_chunking IS 'Lista conversas com mensagens não chunkeadas para processamento batch';
