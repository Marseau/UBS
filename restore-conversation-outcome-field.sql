-- ===================================================
-- RESTAURAR CAMPO CONVERSATION_OUTCOME
-- Execute este SQL no Supabase SQL Editor
-- ===================================================

-- 1. Adicionar coluna conversation_outcome
ALTER TABLE conversation_history 
ADD COLUMN conversation_outcome TEXT;

-- 2. Criar constraint de validação
ALTER TABLE conversation_history 
ADD CONSTRAINT conversation_outcome_check 
CHECK (conversation_outcome IN (
    'appointment_created',        -- Criou novo agendamento ✅
    'info_request_fulfilled',     -- Só queria informação 📋
    'business_hours_inquiry',     -- Perguntou horário funcionamento 🕐
    'price_inquiry',             -- Perguntou preços 💰
    'location_inquiry',          -- Perguntou endereço 📍
    'booking_abandoned',         -- Começou agendar mas desistiu 🔄
    'timeout_abandoned',         -- Não respondeu em 60s ⏰
    'wrong_number',             -- Número errado ❌
    'spam_detected',            -- Spam/bot 🚫
    'test_message',             -- Mensagem de teste 🧪
    'appointment_rescheduled',   -- Remarcou agendamento existente 📅
    'appointment_cancelled',     -- Cancelou agendamento existente ❌
    'appointment_confirmed',     -- Confirmou agendamento existente ✅
    'appointment_inquiry',       -- Perguntou sobre agendamento existente ❓
    'appointment_modified',      -- Alterou detalhes do agendamento 🔧
    'appointment_noshow_followup' -- Justificou/seguiu após no_show 📞
));

-- 3. Criar índice para performance
CREATE INDEX idx_conversation_outcome Implemente a f
ON conversation_history(conversation_outcome) 
WHERE conversation_outcome IS NOT NULL;sim...

-- 4. Comentário na tabela
COMMENT ON COLUMN conversation_history.conversation_outcome IS 'Desfecho final da conversa para métricas de cobrança e rastreabilidade';1