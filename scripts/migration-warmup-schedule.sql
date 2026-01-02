-- Migration: Create warmup_schedule and warmup_conversations tables
-- Date: 2025-12-04
-- Purpose: Sistema de warmup WhatsApp via Whapi + Agente IA

-- ============================================================================
-- TABELA: warmup_schedule - Agendamento de DMs
-- ============================================================================
CREATE TABLE IF NOT EXISTS warmup_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    queue_item_id UUID,
    lead_id UUID NOT NULL,
    phone VARCHAR(20) NOT NULL,
    dm_script TEXT NOT NULL,
    persona_name VARCHAR(100),
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    sent_at TIMESTAMPTZ,
    error TEXT,
    message_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para warmup_schedule
CREATE INDEX IF NOT EXISTS idx_warmup_schedule_status ON warmup_schedule(status);
CREATE INDEX IF NOT EXISTS idx_warmup_schedule_scheduled_at ON warmup_schedule(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_warmup_schedule_campaign ON warmup_schedule(campaign_id);
CREATE INDEX IF NOT EXISTS idx_warmup_schedule_phone ON warmup_schedule(phone);
CREATE INDEX IF NOT EXISTS idx_warmup_schedule_pending ON warmup_schedule(status, scheduled_at) WHERE status = 'pending';

-- ============================================================================
-- TABELA: warmup_conversations - Historico de conversas do Agente IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS warmup_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warmup_schedule_id UUID REFERENCES warmup_schedule(id),
    phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(200),
    message_received TEXT NOT NULL,
    message_sent TEXT NOT NULL,
    ai_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    tokens_used INTEGER,
    response_time_ms INTEGER,
    sentiment VARCHAR(20), -- positive, negative, neutral, interested
    intent VARCHAR(50), -- question, interest, rejection, scheduling, other
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para warmup_conversations
CREATE INDEX IF NOT EXISTS idx_warmup_conversations_phone ON warmup_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_warmup_conversations_schedule ON warmup_conversations(warmup_schedule_id);
CREATE INDEX IF NOT EXISTS idx_warmup_conversations_created ON warmup_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warmup_conversations_sentiment ON warmup_conversations(sentiment);

-- ============================================================================
-- TABELA: warmup_line_stats - Estatisticas por linha WhatsApp
-- ============================================================================
CREATE TABLE IF NOT EXISTS warmup_line_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_line VARCHAR(20) NOT NULL UNIQUE,
    total_sent INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    positive_responses INTEGER DEFAULT 0,
    meetings_scheduled INTEGER DEFAULT 0,
    sent_today INTEGER DEFAULT 0,
    sent_this_hour INTEGER DEFAULT 0,
    last_sent_at TIMESTAMPTZ,
    last_response_at TIMESTAMPTZ,
    warmup_week INTEGER DEFAULT 1,
    warmup_started_at DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para warmup_line_stats
CREATE INDEX IF NOT EXISTS idx_warmup_line_stats_phone ON warmup_line_stats(phone_line);

-- ============================================================================
-- COMENTARIOS
-- ============================================================================
COMMENT ON TABLE warmup_schedule IS 'Agendamento de DMs para warmup de linhas WhatsApp';
COMMENT ON TABLE warmup_conversations IS 'Historico de conversas do Agente IA com leads';
COMMENT ON TABLE warmup_line_stats IS 'Estatisticas de warmup e conversao por linha';

COMMENT ON COLUMN warmup_schedule.dm_script IS 'Script de DM personalizado para o lead';
COMMENT ON COLUMN warmup_schedule.persona_name IS 'Nome da persona do subcluster';
COMMENT ON COLUMN warmup_conversations.sentiment IS 'Analise de sentimento: positive, negative, neutral, interested';
COMMENT ON COLUMN warmup_conversations.intent IS 'Intencao detectada: question, interest, rejection, scheduling';
