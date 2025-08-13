
        CREATE OR REPLACE FUNCTION estimate_variable_costs_approximation(
            p_calculation_date DATE DEFAULT CURRENT_DATE,
            p_period_days INTEGER DEFAULT 30
        )
        RETURNS TABLE (
            tenant_id UUID,
            tenant_name TEXT,
            estimated_ai_cost_usd DECIMAL(10,6),
            estimated_whatsapp_cost_usd DECIMAL(10,6),
            estimated_total_cost_usd DECIMAL(10,6),
            estimated_revenue_usd DECIMAL(10,2),
            estimated_margin_usd DECIMAL(10,2),
            estimated_margin_pct DECIMAL(5,2),
            ai_messages_count INTEGER,
            whatsapp_messages_count INTEGER,
            total_conversations INTEGER,
            cost_per_conversation DECIMAL(10,6),
            risk_level VARCHAR(10)
        ) 
        LANGUAGE plpgsql AS $$
        DECLARE
            v_start_date TIMESTAMP;
            v_end_date TIMESTAMP;
            v_ai_cost_per_char DECIMAL(10,8) := 0.0000005; -- ~$0.002 per 1K tokens, 4 chars per token
            v_whatsapp_cost_per_message DECIMAL(6,3) := 0.007; -- $0.007 per message
            v_monthly_revenue_usd DECIMAL(10,2) := 14.53; -- R$ 79.90 / 5.5
        BEGIN
            v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
            v_end_date := p_calculation_date;
            
            RETURN QUERY
            SELECT 
                t.id as tenant_id,
                t.business_name as tenant_name,
                
                -- Custo estimado de IA (baseado em tamanho do conteúdo)
                COALESCE(SUM(
                    CASE 
                        WHEN ch.message_type IN ('assistant', 'ai') THEN 
                            LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                        ELSE 0 
                    END
                ), 0) as estimated_ai_cost_usd,
                
                -- Custo estimado de WhatsApp (por mensagem)
                COALESCE(COUNT(
                    CASE 
                        WHEN ch.message_type IN ('user', 'text') THEN 1 
                        ELSE NULL 
                    END
                ) * v_whatsapp_cost_per_message, 0) as estimated_whatsapp_cost_usd,
                
                -- Custo total estimado
                (COALESCE(SUM(
                    CASE 
                        WHEN ch.message_type IN ('assistant', 'ai') THEN 
                            LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                        ELSE 0 
                    END
                ), 0) + 
                COALESCE(COUNT(
                    CASE 
                        WHEN ch.message_type IN ('user', 'text') THEN 1 
                        ELSE NULL 
                    END
                ) * v_whatsapp_cost_per_message, 0)) as estimated_total_cost_usd,
                
                -- Receita estimada (proporcional ao período)
                (v_monthly_revenue_usd * p_period_days / 30.0) as estimated_revenue_usd,
                
                -- Margem estimada
                ((v_monthly_revenue_usd * p_period_days / 30.0) - 
                (COALESCE(SUM(
                    CASE 
                        WHEN ch.message_type IN ('assistant', 'ai') THEN 
                            LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                        ELSE 0 
                    END
                ), 0) + 
                COALESCE(COUNT(
                    CASE 
                        WHEN ch.message_type IN ('user', 'text') THEN 1 
                        ELSE NULL 
                    END
                ) * v_whatsapp_cost_per_message, 0))) as estimated_margin_usd,
                
                -- Margem percentual estimada
                CASE 
                    WHEN (v_monthly_revenue_usd * p_period_days / 30.0) > 0 THEN
                        (((v_monthly_revenue_usd * p_period_days / 30.0) - 
                        (COALESCE(SUM(
                            CASE 
                                WHEN ch.message_type IN ('assistant', 'ai') THEN 
                                    LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                                ELSE 0 
                            END
                        ), 0) + 
                        COALESCE(COUNT(
                            CASE 
                                WHEN ch.message_type IN ('user', 'text') THEN 1 
                                ELSE NULL 
                            END
                        ) * v_whatsapp_cost_per_message, 0))) / (v_monthly_revenue_usd * p_period_days / 30.0) * 100)
                    ELSE 0
                END as estimated_margin_pct,
                
                -- Contadores
                COUNT(CASE WHEN ch.message_type IN ('assistant', 'ai') THEN 1 ELSE NULL END)::INTEGER as ai_messages_count,
                COUNT(CASE WHEN ch.message_type IN ('user', 'text') THEN 1 ELSE NULL END)::INTEGER as whatsapp_messages_count,
                COUNT(ch.id)::INTEGER as total_conversations,
                
                -- Custo por conversa
                CASE 
                    WHEN COUNT(ch.id) > 0 THEN
                        (COALESCE(SUM(
                            CASE 
                                WHEN ch.message_type IN ('assistant', 'ai') THEN 
                                    LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                                ELSE 0 
                            END
                        ), 0) + 
                        COALESCE(COUNT(
                            CASE 
                                WHEN ch.message_type IN ('user', 'text') THEN 1 
                                ELSE NULL 
                            END
                        ) * v_whatsapp_cost_per_message, 0)) / COUNT(ch.id)
                    ELSE 0
                END as cost_per_conversation,
                
                -- Nível de risco
                CASE 
                    WHEN ((v_monthly_revenue_usd * p_period_days / 30.0) - 
                        (COALESCE(SUM(
                            CASE 
                                WHEN ch.message_type IN ('assistant', 'ai') THEN 
                                    LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                                ELSE 0 
                            END
                        ), 0) + 
                        COALESCE(COUNT(
                            CASE 
                                WHEN ch.message_type IN ('user', 'text') THEN 1 
                                ELSE NULL 
                            END
                        ) * v_whatsapp_cost_per_message, 0))) / (v_monthly_revenue_usd * p_period_days / 30.0) > 0.5 THEN 'Baixo'
                    WHEN ((v_monthly_revenue_usd * p_period_days / 30.0) - 
                        (COALESCE(SUM(
                            CASE 
                                WHEN ch.message_type IN ('assistant', 'ai') THEN 
                                    LENGTH(COALESCE(ch.content, '')) * v_ai_cost_per_char
                                ELSE 0 
                            END
                        ), 0) + 
                        COALESCE(COUNT(
                            CASE 
                                WHEN ch.message_type IN ('user', 'text') THEN 1 
                                ELSE NULL 
                            END
                        ) * v_whatsapp_cost_per_message, 0))) / (v_monthly_revenue_usd * p_period_days / 30.0) > 0.2 THEN 'Médio'
                    ELSE 'Alto'
                END as risk_level
                
            FROM tenants t
            LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
                AND ch.created_at >= v_start_date
                AND ch.created_at <= v_end_date
            WHERE t.status = 'active'
            GROUP BY t.id, t.business_name
            ORDER BY estimated_margin_pct ASC; -- Piores margens primeiro
        END;
        $$;
        