-- =====================================================
-- AI COSTS TRACKING SCHEMA - CRITICAL PRIORITY
-- Tracking OpenAI usage, tokens, and costs per conversation
-- =====================================================

-- 1. AI Usage Tracking Table
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference fields
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    conversation_id UUID REFERENCES whatsapp_conversations(id),
    
    -- OpenAI API details
    model VARCHAR(50) NOT NULL DEFAULT 'gpt-4',
    request_type VARCHAR(30) NOT NULL, -- 'chat_completion', 'function_call', 'image_analysis'
    
    -- Token usage
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    
    -- Cost calculation (USD)
    prompt_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
    completion_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
    total_cost_usd DECIMAL(10,6) GENERATED ALWAYS AS (prompt_cost_usd + completion_cost_usd) STORED,
    
    -- Additional metadata
    request_duration_ms INTEGER,
    response_quality_score DECIMAL(3,2), -- 0.00 to 5.00
    error_occurred BOOLEAN DEFAULT false,
    error_message TEXT,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    api_request_id VARCHAR(100), -- OpenAI request ID for debugging
    
    UNIQUE(api_request_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_date ON ai_usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_conversation ON ai_usage_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_type ON ai_usage_logs(model, request_type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_cost ON ai_usage_logs(total_cost_usd, created_at);

-- =====================================================
-- 2. Enhanced Conversation Outcomes Tracking
-- =====================================================

-- Add columns to existing whatsapp_conversations table for better outcome tracking
DO $$
BEGIN
    -- Add outcome tracking fields if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'outcome_type') THEN
        ALTER TABLE whatsapp_conversations 
        ADD COLUMN outcome_type VARCHAR(50), -- 'booking_successful', 'information_provided', 'escalated', 'unresolved'
        ADD COLUMN satisfaction_score DECIMAL(3,2), -- 1.00 to 5.00
        ADD COLUMN resolution_achieved BOOLEAN DEFAULT false,
        ADD COLUMN ai_confidence_score DECIMAL(3,2), -- AI confidence in its responses
        ADD COLUMN conversation_quality_rating VARCHAR(20), -- 'excellent', 'good', 'fair', 'poor'
        ADD COLUMN total_ai_cost_usd DECIMAL(10,6) DEFAULT 0,
        ADD COLUMN tokens_used INTEGER DEFAULT 0,
        ADD COLUMN response_time_avg_ms INTEGER,
        ADD COLUMN customer_feedback TEXT,
        ADD COLUMN business_outcome_achieved BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Index for outcome queries
CREATE INDEX IF NOT EXISTS idx_conversations_outcome ON whatsapp_conversations(outcome_type, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_satisfaction ON whatsapp_conversations(satisfaction_score, resolution_achieved);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_cost ON whatsapp_conversations(total_ai_cost_usd, tenant_id);

-- =====================================================
-- 3. AI Cost Aggregation Function
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_ai_costs_per_tenant(
    p_tenant_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    tenant_id UUID,
    business_name VARCHAR,
    total_conversations INTEGER,
    total_tokens INTEGER,
    total_cost_usd DECIMAL(10,6),
    avg_cost_per_conversation DECIMAL(10,6),
    avg_tokens_per_conversation DECIMAL(10,2),
    most_expensive_model VARCHAR(50),
    cost_trend VARCHAR(20), -- 'increasing', 'stable', 'decreasing'
    efficiency_score DECIMAL(3,2) -- cost effectiveness
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name,
        COUNT(DISTINCT aul.conversation_id)::INTEGER as total_conversations,
        COALESCE(SUM(aul.total_tokens), 0)::INTEGER as total_tokens,
        COALESCE(SUM(aul.total_cost_usd), 0)::DECIMAL(10,6) as total_cost_usd,
        CASE 
            WHEN COUNT(DISTINCT aul.conversation_id) > 0 
            THEN (COALESCE(SUM(aul.total_cost_usd), 0) / COUNT(DISTINCT aul.conversation_id))::DECIMAL(10,6)
            ELSE 0::DECIMAL(10,6)
        END as avg_cost_per_conversation,
        CASE 
            WHEN COUNT(DISTINCT aul.conversation_id) > 0 
            THEN (COALESCE(SUM(aul.total_tokens), 0)::DECIMAL / COUNT(DISTINCT aul.conversation_id))::DECIMAL(10,2)
            ELSE 0::DECIMAL(10,2)
        END as avg_tokens_per_conversation,
        COALESCE(
            (SELECT model FROM ai_usage_logs aul2 
             WHERE aul2.tenant_id = t.id 
             AND aul2.created_at BETWEEN p_start_date AND p_end_date
             GROUP BY model 
             ORDER BY SUM(total_cost_usd) DESC 
             LIMIT 1), 
            'gpt-4'
        )::VARCHAR(50) as most_expensive_model,
        -- Simple cost trend calculation
        CASE 
            WHEN COALESCE(SUM(aul.total_cost_usd), 0) > 100 THEN 'high'::VARCHAR(20)
            WHEN COALESCE(SUM(aul.total_cost_usd), 0) > 20 THEN 'medium'::VARCHAR(20)
            ELSE 'low'::VARCHAR(20)
        END as cost_trend,
        -- Efficiency score: outcomes achieved per dollar spent
        CASE 
            WHEN COALESCE(SUM(aul.total_cost_usd), 0) > 0 
            THEN LEAST(5.0, (COUNT(DISTINCT CASE WHEN wc.resolution_achieved THEN aul.conversation_id END)::DECIMAL / SUM(aul.total_cost_usd) * 10))::DECIMAL(3,2)
            ELSE 0::DECIMAL(3,2)
        END as efficiency_score
    FROM tenants t
    LEFT JOIN ai_usage_logs aul ON t.id = aul.tenant_id 
        AND aul.created_at BETWEEN p_start_date AND p_end_date
    LEFT JOIN whatsapp_conversations wc ON aul.conversation_id = wc.id
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
    AND t.status = 'active'
    GROUP BY t.id, t.business_name
    ORDER BY total_cost_usd DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. Conversation Outcomes Analysis Function
-- =====================================================

CREATE OR REPLACE FUNCTION analyze_conversation_outcomes(
    p_tenant_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    tenant_id UUID,
    business_name VARCHAR,
    total_conversations INTEGER,
    successful_outcomes INTEGER,
    success_rate DECIMAL(5,2),
    avg_satisfaction_score DECIMAL(3,2),
    resolution_rate DECIMAL(5,2),
    avg_response_time_ms INTEGER,
    top_outcome_type VARCHAR(50),
    ai_confidence_avg DECIMAL(3,2),
    business_outcomes_achieved INTEGER,
    customer_feedback_sentiment VARCHAR(20) -- 'positive', 'neutral', 'negative'
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name,
        COUNT(wc.id)::INTEGER as total_conversations,
        COUNT(CASE WHEN wc.business_outcome_achieved THEN 1 END)::INTEGER as successful_outcomes,
        CASE 
            WHEN COUNT(wc.id) > 0 
            THEN (COUNT(CASE WHEN wc.business_outcome_achieved THEN 1 END) * 100.0 / COUNT(wc.id))::DECIMAL(5,2)
            ELSE 0::DECIMAL(5,2)
        END as success_rate,
        COALESCE(AVG(wc.satisfaction_score), 0)::DECIMAL(3,2) as avg_satisfaction_score,
        CASE 
            WHEN COUNT(wc.id) > 0 
            THEN (COUNT(CASE WHEN wc.resolution_achieved THEN 1 END) * 100.0 / COUNT(wc.id))::DECIMAL(5,2)
            ELSE 0::DECIMAL(5,2)
        END as resolution_rate,
        COALESCE(AVG(wc.response_time_avg_ms), 0)::INTEGER as avg_response_time_ms,
        COALESCE(
            (SELECT outcome_type FROM whatsapp_conversations wc2 
             WHERE wc2.tenant_id = t.id 
             AND wc2.created_at BETWEEN p_start_date AND p_end_date
             AND outcome_type IS NOT NULL
             GROUP BY outcome_type 
             ORDER BY COUNT(*) DESC 
             LIMIT 1), 
            'unknown'
        )::VARCHAR(50) as top_outcome_type,
        COALESCE(AVG(wc.ai_confidence_score), 0)::DECIMAL(3,2) as ai_confidence_avg,
        COUNT(CASE WHEN wc.business_outcome_achieved THEN 1 END)::INTEGER as business_outcomes_achieved,
        -- Simple sentiment analysis based on satisfaction score
        CASE 
            WHEN AVG(wc.satisfaction_score) >= 4.0 THEN 'positive'::VARCHAR(20)
            WHEN AVG(wc.satisfaction_score) >= 3.0 THEN 'neutral'::VARCHAR(20)
            ELSE 'negative'::VARCHAR(20)
        END as customer_feedback_sentiment
    FROM tenants t
    LEFT JOIN whatsapp_conversations wc ON t.id = wc.tenant_id 
        AND wc.created_at BETWEEN p_start_date AND p_end_date
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
    AND t.status = 'active'
    GROUP BY t.id, t.business_name
    ORDER BY success_rate DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. Grant Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION calculate_ai_costs_per_tenant(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_conversation_outcomes(UUID, DATE, DATE) TO authenticated;

-- =====================================================
-- 6. Sample Data Insert Function (for testing)
-- =====================================================

CREATE OR REPLACE FUNCTION insert_sample_ai_usage() RETURNS void AS $$
DECLARE
    v_tenant_record RECORD;
    v_conversation_id UUID;
    v_cost_multiplier DECIMAL;
BEGIN
    -- Insert sample AI usage data for testing
    FOR v_tenant_record IN 
        SELECT id, business_name FROM tenants WHERE status = 'active' LIMIT 5
    LOOP
        -- Create sample conversation if needed
        INSERT INTO whatsapp_conversations (
            tenant_id, 
            customer_phone_number, 
            status,
            outcome_type,
            satisfaction_score,
            resolution_achieved,
            business_outcome_achieved,
            ai_confidence_score,
            conversation_quality_rating
        ) VALUES (
            v_tenant_record.id,
            '+5511999999999',
            'completed',
            CASE (random() * 4)::INT 
                WHEN 0 THEN 'booking_successful'
                WHEN 1 THEN 'information_provided'
                WHEN 2 THEN 'escalated'
                ELSE 'unresolved'
            END,
            (random() * 4 + 1)::DECIMAL(3,2), -- 1.0 to 5.0
            random() < 0.7, -- 70% resolution rate
            random() < 0.6, -- 60% business outcome rate
            (random() * 2 + 3)::DECIMAL(3,2), -- 3.0 to 5.0 AI confidence
            CASE (random() * 4)::INT
                WHEN 0 THEN 'excellent'
                WHEN 1 THEN 'good' 
                WHEN 2 THEN 'fair'
                ELSE 'poor'
            END
        ) RETURNING id INTO v_conversation_id;
        
        -- Calculate cost based on tenant business (healthcare more expensive)
        SELECT CASE 
            WHEN business_name ILIKE '%clínica%' OR business_name ILIKE '%hospital%' 
            THEN 1.5 ELSE 1.0 
        END INTO v_cost_multiplier
        FROM tenants WHERE id = v_tenant_record.id;
        
        -- Insert AI usage logs
        FOR i IN 1..((random() * 10 + 5)::INT) LOOP -- 5-15 AI requests per conversation
            INSERT INTO ai_usage_logs (
                tenant_id,
                conversation_id,
                model,
                request_type,
                prompt_tokens,
                completion_tokens,
                prompt_cost_usd,
                completion_cost_usd,
                request_duration_ms,
                response_quality_score,
                created_at
            ) VALUES (
                v_tenant_record.id,
                v_conversation_id,
                CASE (random() * 3)::INT 
                    WHEN 0 THEN 'gpt-4' 
                    WHEN 1 THEN 'gpt-3.5-turbo'
                    ELSE 'gpt-4-vision'
                END,
                CASE (random() * 3)::INT
                    WHEN 0 THEN 'chat_completion'
                    WHEN 1 THEN 'function_call'
                    ELSE 'image_analysis'
                END,
                ((random() * 2000 + 500)::INT), -- 500-2500 prompt tokens
                ((random() * 1000 + 200)::INT), -- 200-1200 completion tokens
                ((random() * 0.05 + 0.01) * v_cost_multiplier)::DECIMAL(10,6), -- $0.01-0.06
                ((random() * 0.03 + 0.005) * v_cost_multiplier)::DECIMAL(10,6), -- $0.005-0.035
                ((random() * 3000 + 500)::INT), -- 500-3500ms response time
                (random() * 2 + 3)::DECIMAL(3,2), -- 3.0-5.0 quality score
                NOW() - (random() * INTERVAL '30 days') -- Random date within last 30 days
            );
        END LOOP;
        
        -- Update conversation with AI cost summary
        UPDATE whatsapp_conversations 
        SET 
            total_ai_cost_usd = (
                SELECT COALESCE(SUM(total_cost_usd), 0) 
                FROM ai_usage_logs 
                WHERE conversation_id = v_conversation_id
            ),
            tokens_used = (
                SELECT COALESCE(SUM(total_tokens), 0) 
                FROM ai_usage_logs 
                WHERE conversation_id = v_conversation_id
            ),
            response_time_avg_ms = (
                SELECT COALESCE(AVG(request_duration_ms), 0) 
                FROM ai_usage_logs 
                WHERE conversation_id = v_conversation_id
            )
        WHERE id = v_conversation_id;
    END LOOP;
    
    RAISE NOTICE 'Sample AI usage data inserted successfully for % tenants', 
        (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND id IN (SELECT DISTINCT tenant_id FROM ai_usage_logs));
END;
$$ LANGUAGE plpgsql;

-- Execute sample data insertion
-- SELECT insert_sample_ai_usage();

DO $$
BEGIN
    RAISE NOTICE '🤖 AI Costs Tracking Schema deployed successfully!';
    RAISE NOTICE '📊 Enhanced Conversation Outcomes tracking ready!';
    RAISE NOTICE '💰 Functions: calculate_ai_costs_per_tenant(), analyze_conversation_outcomes()';
    RAISE NOTICE '🧪 Test with: SELECT insert_sample_ai_usage();';
END $$;