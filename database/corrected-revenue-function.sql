
            CREATE OR REPLACE FUNCTION calculate_tenant_platform_metrics_complete(
                p_tenant_id UUID DEFAULT NULL,
                p_calculation_date DATE DEFAULT CURRENT_DATE,
                p_period_days INTEGER DEFAULT 30
            ) RETURNS BOOLEAN
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            DECLARE
                period_start DATE;
                total_platform_revenue DECIMAL(12,2) := 0;
                total_platform_appointments INTEGER := 0;
                total_platform_customers INTEGER := 0;
                total_platform_ai_interactions INTEGER := 0;
                total_platform_cancellations INTEGER := 0;
                total_platform_reschedules INTEGER := 0;
            BEGIN
                period_start := p_calculation_date - INTERVAL '1 day' * p_period_days;
                
                -- RECEITA CORRIGIDA: usar subscription_payments em vez de appointments
                SELECT COALESCE(SUM(sp.amount), 0)
                INTO total_platform_revenue
                FROM subscription_payments sp
                WHERE sp.payment_status = 'completed'
                    AND sp.payment_date >= period_start::date
                    AND sp.payment_date <= p_calculation_date::date;
                
                -- Calcular totais dos appointments (sem receita)
                SELECT 
                    COUNT(DISTINCT a.id),
                    COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END),
                    COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END)
                INTO total_platform_appointments, total_platform_cancellations, total_platform_reschedules
                FROM appointments a
                WHERE a.created_at >= period_start::timestamp
                    AND a.created_at <= p_calculation_date::timestamp + INTERVAL '1 day';
                
                -- Calcular total de customers únicos na plataforma
                SELECT COUNT(DISTINCT u.id)
                INTO total_platform_customers
                FROM users u
                INNER JOIN appointments a ON u.phone = a.customer_phone
                WHERE a.created_at >= period_start::timestamp
                    AND a.created_at <= p_calculation_date::timestamp + INTERVAL '1 day';
                
                -- Calcular total de interações AI (se existir tabela)
                SELECT COALESCE(COUNT(*), 0)
                INTO total_platform_ai_interactions
                FROM conversation_history ch
                WHERE ch.created_at >= period_start::timestamp
                    AND ch.created_at <= p_calculation_date::timestamp + INTERVAL '1 day'
                    AND ch.is_ai_response = true;
                
                -- Inserir/atualizar métricas CORRIGIDAS para todos os tenants
                INSERT INTO tenant_platform_metrics (
                    tenant_id, metric_date, calculation_period_days,
                    
                    -- Revenue Metrics (CORRIGIDAS)
                    revenue_participation_pct, revenue_participation_value, platform_total_revenue,
                    
                    -- Appointments Metrics  
                    appointments_participation_pct, tenant_appointments_count, platform_total_appointments,
                    
                    -- Customers Metrics
                    customers_participation_pct, tenant_customers_count, platform_total_customers,
                    
                    -- AI Metrics
                    ai_participation_pct, tenant_ai_interactions, platform_total_ai_interactions,
                    
                    -- Operational Metrics
                    cancellation_rate_pct, cancelled_appointments_count,
                    rescheduling_rate_pct, rescheduled_appointments_count,
                    
                    -- Business Intelligence (calculados)
                    efficiency_score, conversion_rate_pct
                )
                SELECT 
                    t.id as tenant_id,
                    p_calculation_date,
                    p_period_days,
                    
                    -- Revenue Metrics (CORRIGIDAS - usar subscription_payments do tenant)
                    CASE WHEN total_platform_revenue > 0 
                         THEN (COALESCE(tenant_payments.tenant_revenue, 0) / total_platform_revenue * 100)
                         ELSE 0 END as revenue_participation_pct,
                    COALESCE(tenant_payments.tenant_revenue, 0) as revenue_participation_value,
                    total_platform_revenue,
                    
                    -- Appointments Metrics
                    CASE WHEN total_platform_appointments > 0 
                         THEN (COUNT(DISTINCT a.id)::decimal / total_platform_appointments * 100)
                         ELSE 0 END as appointments_participation_pct,
                    COUNT(DISTINCT a.id) as tenant_appointments_count,
                    total_platform_appointments,
                    
                    -- Customers Metrics  
                    CASE WHEN total_platform_customers > 0 
                         THEN (COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.customer_phone END)::decimal / total_platform_customers * 100)
                         ELSE 0 END as customers_participation_pct,
                    COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.customer_phone END) as tenant_customers_count,
                    total_platform_customers,
                    
                    -- AI Metrics
                    CASE WHEN total_platform_ai_interactions > 0 
                         THEN (COALESCE(ai_stats.ai_count, 0)::decimal / total_platform_ai_interactions * 100)
                         ELSE 0 END as ai_participation_pct,
                    COALESCE(ai_stats.ai_count, 0) as tenant_ai_interactions,
                    total_platform_ai_interactions,
                    
                    -- Operational Metrics
                    CASE WHEN COUNT(DISTINCT a.id) > 0 
                         THEN (COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)
                         ELSE 0 END as cancellation_rate_pct,
                    COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END) as cancelled_appointments_count,
                    CASE WHEN COUNT(DISTINCT a.id) > 0 
                         THEN (COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)
                         ELSE 0 END as rescheduling_rate_pct,
                    COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END) as rescheduled_appointments_count,
                    
                    -- Business Intelligence
                    CASE 
                        WHEN COUNT(DISTINCT a.id) > 0 AND COALESCE(tenant_payments.tenant_revenue, 0) > 0 
                        THEN (COALESCE(tenant_payments.tenant_revenue, 0) / COUNT(DISTINCT a.id))
                        ELSE 0 
                    END as efficiency_score,
                    CASE 
                        WHEN COALESCE(ai_stats.ai_count, 0) > 0 
                        THEN (COUNT(DISTINCT a.id)::decimal / ai_stats.ai_count * 100)
                        ELSE 0 
                    END as conversion_rate_pct
                    
                FROM tenants t
                LEFT JOIN appointments a ON t.id = a.tenant_id 
                    AND a.created_at >= period_start::timestamp
                    AND a.created_at <= p_calculation_date::timestamp + INTERVAL '1 day'
                -- JOIN corrigido para pegar receita real do tenant
                LEFT JOIN (
                    SELECT 
                        sp.tenant_id,
                        SUM(sp.amount) as tenant_revenue
                    FROM subscription_payments sp
                    WHERE sp.payment_status = 'completed'
                        AND sp.payment_date >= period_start::date
                        AND sp.payment_date <= p_calculation_date::date
                    GROUP BY sp.tenant_id
                ) tenant_payments ON t.id = tenant_payments.tenant_id
                LEFT JOIN (
                    SELECT 
                        ch.tenant_id,
                        COUNT(*) as ai_count
                    FROM conversation_history ch
                    WHERE ch.created_at >= period_start::timestamp
                        AND ch.created_at <= p_calculation_date::timestamp + INTERVAL '1 day'
                        AND ch.is_ai_response = true
                    GROUP BY ch.tenant_id
                ) ai_stats ON t.id = ai_stats.tenant_id
                WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
                GROUP BY t.id, ai_stats.ai_count, tenant_payments.tenant_revenue
                
                ON CONFLICT (tenant_id, metric_date, calculation_period_days) 
                DO UPDATE SET
                    -- Revenue Metrics (CORRIGIDAS)
                    revenue_participation_pct = EXCLUDED.revenue_participation_pct,
                    revenue_participation_value = EXCLUDED.revenue_participation_value,
                    platform_total_revenue = EXCLUDED.platform_total_revenue,
                    
                    -- Appointments Metrics
                    appointments_participation_pct = EXCLUDED.appointments_participation_pct,
                    tenant_appointments_count = EXCLUDED.tenant_appointments_count,
                    platform_total_appointments = EXCLUDED.platform_total_appointments,
                    
                    -- Customers Metrics
                    customers_participation_pct = EXCLUDED.customers_participation_pct,
                    tenant_customers_count = EXCLUDED.tenant_customers_count,
                    platform_total_customers = EXCLUDED.platform_total_customers,
                    
                    -- AI Metrics
                    ai_participation_pct = EXCLUDED.ai_participation_pct,
                    tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
                    platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
                    
                    -- Operational Metrics
                    cancellation_rate_pct = EXCLUDED.cancellation_rate_pct,
                    cancelled_appointments_count = EXCLUDED.cancelled_appointments_count,
                    rescheduling_rate_pct = EXCLUDED.rescheduling_rate_pct,
                    rescheduled_appointments_count = EXCLUDED.rescheduled_appointments_count,
                    
                    -- Business Intelligence
                    efficiency_score = EXCLUDED.efficiency_score,
                    conversion_rate_pct = EXCLUDED.conversion_rate_pct,
                    
                    updated_at = NOW();
                
                -- Calcular rankings após inserir métricas
                PERFORM update_tenant_rankings();
                
                RETURN TRUE;
            END;
            $$;
        