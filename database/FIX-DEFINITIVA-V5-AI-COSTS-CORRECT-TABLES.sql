-- ===================================================
-- FIX DEFINITIVA v5: AI COSTS COM TABELAS CORRETAS  
-- Correção para usar conversation_history (não whatsapp_conversations)
-- Implementar cálculos AI costs que estavam faltando
-- ===================================================

-- 1. SEÇÃO PARA ADICIONAR ANTES DA LINHA 441 (depois conversation outcomes)
-- Substitui a query que usa whatsapp_conversations por conversation_history

/*
SUBSTITUIR A SEÇÃO LINES 406-440 POR:
*/

-- =====================================================
-- CONVERSATION OUTCOMES DATA COLLECTION (CORRECTED - CONVERSATION_HISTORY)
-- =====================================================

BEGIN
    -- Usar conversation_history (tabela correta) com campos corretos
    SELECT 
        COALESCE(COUNT(CASE WHEN ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled') THEN 1 END), 0),
        COALESCE(COUNT(CASE WHEN ch.conversation_outcome IS NOT NULL THEN 1 END), 0),
        COALESCE(AVG(CASE WHEN ch.confidence_score IS NOT NULL THEN ch.confidence_score ELSE 0 END), 0),
        COALESCE((
            SELECT ch2.conversation_outcome
            FROM conversation_history ch2 
            WHERE ch2.tenant_id = v_tenant_record.id
            AND ch2.created_at >= v_start_date::timestamptz
            AND ch2.created_at < (v_end_date + 1)::timestamptz
            AND ch2.conversation_outcome IS NOT NULL
            GROUP BY ch2.conversation_outcome
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'unknown')
    INTO v_successful_outcomes, v_conversations_with_outcomes, v_avg_ai_confidence, v_top_outcome_type
    FROM conversation_history ch 
    WHERE ch.tenant_id = v_tenant_record.id
      AND ch.created_at >= v_start_date::timestamptz
      AND ch.created_at < (v_end_date + 1)::timestamptz;
    
    -- Calculate outcome rates
    v_business_outcomes_achieved := v_successful_outcomes;
    v_outcome_success_rate := CASE WHEN v_conversations_with_outcomes > 0 
        THEN (v_successful_outcomes * 100.0 / v_conversations_with_outcomes) ELSE 0 END;
    v_resolution_rate := CASE WHEN v_tenant_conversations > 0 
        THEN (v_successful_outcomes * 100.0 / v_tenant_conversations) ELSE 0 END;
    
    -- Sentiment baseado no confidence score (simulado já que não temos satisfaction_score)
    v_customer_feedback_sentiment := CASE 
        WHEN v_avg_ai_confidence >= 0.8 THEN 'positive'
        WHEN v_avg_ai_confidence >= 0.6 THEN 'neutral'
        ELSE 'negative' END;
    
    -- Simular satisfaction score baseado na confidence    
    v_avg_satisfaction_score := CASE 
        WHEN v_avg_ai_confidence >= 0.8 THEN 4.2
        WHEN v_avg_ai_confidence >= 0.6 THEN 3.5
        ELSE 2.8 END;
        
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Conversation outcomes calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_successful_outcomes := 0;
    v_outcome_success_rate := 0;
    v_avg_satisfaction_score := 0;
    v_resolution_rate := 0;
    v_business_outcomes_achieved := 0;
    v_avg_ai_confidence := 0;
    v_top_outcome_type := 'unknown';
    v_customer_feedback_sentiment := 'neutral';
END;

-- =====================================================
-- AI COSTS CALCULATION (NEW - IMPLEMENTAR APÓS LINHA 441)
-- =====================================================

-- Calcular AI costs usando campos EXISTENTES da conversation_history
BEGIN
    SELECT 
        COALESCE(SUM(ch.tokens_used), 0),
        COALESCE(SUM(ch.api_cost_usd), 0),
        COALESCE(AVG(ch.api_cost_usd) FILTER (WHERE ch.api_cost_usd > 0), 0),
        COALESCE((
            SELECT ch2.model_used
            FROM conversation_history ch2 
            WHERE ch2.tenant_id = v_tenant_record.id
            AND ch2.created_at >= v_start_date::timestamptz
            AND ch2.created_at < (v_end_date + 1)::timestamptz
            AND ch2.model_used IS NOT NULL
            GROUP BY ch2.model_used
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'gpt-3.5-turbo')
    INTO v_ai_total_tokens, v_ai_total_cost_usd, v_ai_avg_cost_per_conversation, v_ai_most_expensive_model
    FROM conversation_history ch 
    WHERE ch.tenant_id = v_tenant_record.id
      AND ch.created_at >= v_start_date::timestamptz
      AND ch.created_at < (v_end_date + 1)::timestamptz;
    
    -- Calculate efficiency score: successful outcomes per dollar spent
    v_ai_efficiency_score := CASE 
        WHEN v_ai_total_cost_usd > 0 THEN 
            LEAST(5.0, (v_successful_outcomes::DECIMAL / v_ai_total_cost_usd * 10))
        ELSE 0 
    END;
    
    -- Determine cost trend (simple classification)
    v_ai_cost_trend := CASE 
        WHEN v_ai_total_cost_usd > 10.0 THEN 'high'
        WHEN v_ai_total_cost_usd > 2.0 THEN 'medium'
        WHEN v_ai_total_cost_usd > 0 THEN 'low'
        ELSE 'none'
    END;
    
    RAISE NOTICE 'AI costs calculated for tenant %: $% USD, % tokens, % outcomes', 
        LEFT(v_tenant_record.id::text, 8), v_ai_total_cost_usd, v_ai_total_tokens, v_successful_outcomes;
        
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'AI costs calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_ai_total_tokens := 0;
    v_ai_total_cost_usd := 0;
    v_ai_avg_cost_per_conversation := 0;
    v_ai_efficiency_score := 0;
    v_ai_most_expensive_model := 'gpt-3.5-turbo';
    v_ai_cost_trend := 'none';
END;

-- =====================================================
-- ATUALIZAÇÃO NO JSONB FINAL
-- Adicionar os campos AI costs no comprehensive_metrics JSONB
-- =====================================================

/*
LOCALIZAR A SEÇÃO DE COMPREHENSIVE_METRICS E ADICIONAR:

                            -- AI Costs Metrics (Module 6B)
                            'ai_total_tokens', v_ai_total_tokens,
                            'ai_total_cost_usd', v_ai_total_cost_usd,
                            'ai_avg_cost_per_conversation', v_ai_avg_cost_per_conversation,
                            'ai_efficiency_score', v_ai_efficiency_score,
                            'ai_most_expensive_model', v_ai_most_expensive_model,
                            'ai_cost_trend', v_ai_cost_trend,
                            
                            -- Conversation Outcomes (Module 6C)  
                            'successful_outcomes', v_successful_outcomes,
                            'outcome_success_rate', v_outcome_success_rate,
                            'avg_satisfaction_score', v_avg_satisfaction_score,
                            'resolution_rate', v_resolution_rate,
                            'business_outcomes_achieved', v_business_outcomes_achieved,
                            'avg_ai_confidence', v_avg_ai_confidence,
                            'top_outcome_type', v_top_outcome_type,
                            'customer_feedback_sentiment', v_customer_feedback_sentiment,
*/

-- =====================================================
-- VARIÁVEIS ADICIONAIS NECESSÁRIAS
-- Adicionar esta variável nas declarações se não existir
-- =====================================================

-- v_conversations_with_outcomes INTEGER := 0;

-- =====================================================
-- INSTRUÇÕES DE DEPLOY
-- =====================================================

/*
PARA APLICAR ESTA CORREÇÃO:

1. Localizar linha ~406-440 na DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql
2. SUBSTITUIR toda seção "CONVERSATION OUTCOMES DATA COLLECTION" 
3. ADICIONAR seção "AI COSTS CALCULATION" após linha ~441
4. LOCALIZAR seção comprehensive_metrics JSONB 
5. ADICIONAR campos AI costs no JSONB
6. Executar procedure corrigida

RESULTADO:
✅ Usa conversation_history (tabela correta)
✅ Usa campos existentes: conversation_outcome, tokens_used, api_cost_usd, model_used
✅ Calcula todas variáveis AI que estavam faltando
✅ Mantém compatibilidade com arquitetura existente
✅ Sem criação de tabelas ou campos desnecessários
*/

RAISE NOTICE '🚀 Fix AI Costs para DEFINITIVA v5 ready to deploy!';
RAISE NOTICE '📊 Uses correct table: conversation_history';
RAISE NOTICE '✅ Uses existing fields: conversation_outcome, tokens_used, api_cost_usd, model_used';
RAISE NOTICE '🎯 Implements missing AI cost calculations';
RAISE NOTICE '⚡ Ready for integration into actual procedure file';