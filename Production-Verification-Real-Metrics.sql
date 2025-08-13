-- Production-Verification-Real-Metrics.sql
-- Verificações para Simulação de App em Produção
-- Usando tabelas reais: conversation_history, usage_costs, tenant_metrics
-- Framework enterprise para validação de WhatsApp Booking System
-- Data: 2025-08-11

-- Parameter: test_execution_id passado via variável
-- Usage: psql -v test_exec_id="'TEST_20250811_123456_abc12345'" -f Production-Verification-Real-Metrics.sql

-- ========================================
-- PRÉ-VALIDAÇÕES DO SISTEMA
-- ========================================

-- 1. Verificar se simulação foi configurada corretamente
SELECT 
    'PRE_VALIDATION' as check_type,
    'production_simulation_setup' as check_name,
    CASE 
        WHEN (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :test_exec_id) = 6 THEN 'PASS'
        ELSE 'FAIL' 
    END as status,
    (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :test_exec_id) as tenants_found,
    6 as expected_tenants,
    'Tenants simulados por domínio de negócio' as description;

-- 2. Verificar domínios de negócio reais
SELECT 
    'PRE_VALIDATION' as check_type,
    'business_domains_coverage' as check_name,
    t.domain::text,
    t.name,
    t.subscription_plan,
    CASE 
        WHEN t.domain IN ('beauty', 'healthcare', 'legal', 'education', 'sports', 'consulting') THEN 'PASS'
        ELSE 'FAIL'
    END as domain_status
FROM tenants t
WHERE t.test_execution_id = :test_exec_id
ORDER BY t.domain;

-- 3. Verificar disponibilidade de profissionais por tenant
SELECT 
    'PRE_VALIDATION' as check_type,
    'professionals_availability' as check_name,
    t.name as tenant_name,
    t.domain::text,
    COUNT(p.id) as professionals_count,
    CASE 
        WHEN COUNT(p.id) >= 2 THEN 'PASS'
        ELSE 'FAIL'
    END as availability_status
FROM tenants t
LEFT JOIN professionals p ON t.id = p.tenant_id AND p.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.id, t.name, t.domain
ORDER BY t.domain;

-- 4. Verificar catálogo de serviços por domínio
SELECT 
    'PRE_VALIDATION' as check_type,
    'services_catalog_completeness' as check_name,
    t.domain::text,
    COUNT(s.id) as services_count,
    ROUND(AVG(s.base_price), 2) as avg_service_price,
    CASE 
        WHEN COUNT(s.id) >= 3 THEN 'PASS'
        ELSE 'FAIL'
    END as catalog_status
FROM tenants t
LEFT JOIN services s ON t.id = s.tenant_id AND s.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.domain
ORDER BY t.domain;

-- ========================================
-- VALIDAÇÕES PRINCIPAIS - SIMULAÇÃO WHATSAPP
-- ========================================

-- 5. Verificar criação de appointments via simulação WhatsApp
SELECT 
    'POST_VALIDATION' as check_type,
    'whatsapp_appointments_created' as check_name,
    t.domain::text as business_domain,
    t.name as tenant_name,
    COUNT(a.id) as appointments_created,
    CASE 
        WHEN COUNT(a.id) > 0 THEN 'PASS'
        ELSE 'PENDING_EXECUTION'
    END as status,
    ROUND(AVG(EXTRACT(EPOCH FROM (a.start_time - a.created_at))), 2) as avg_booking_lead_time_seconds
FROM tenants t
LEFT JOIN appointments a ON t.id = a.tenant_id AND a.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.id, t.domain, t.name
ORDER BY t.domain;

-- 6. Validar logs de conversação WhatsApp (tabela real: conversation_history)
SELECT 
    'POST_VALIDATION' as check_type,
    'whatsapp_conversation_logs' as check_name,
    t.domain::text as business_domain,
    COUNT(ch.id) as conversation_interactions,
    COUNT(DISTINCT ch.user_id) as unique_users,
    ROUND(AVG(ch.tokens_used), 0) as avg_tokens_per_interaction,
    ROUND(SUM(ch.api_cost_usd), 4) as total_ai_cost_usd,
    COUNT(CASE WHEN ch.intent_detected IS NOT NULL THEN 1 END) as interactions_with_intent,
    CASE 
        WHEN COUNT(ch.id) > 0 THEN 'PASS'
        ELSE 'PENDING_EXECUTION'
    END as status
FROM tenants t
LEFT JOIN conversation_history ch ON t.id = ch.tenant_id AND ch.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.domain
ORDER BY t.domain;

-- 7. Verificar integridade WhatsApp → Appointment pipeline
SELECT 
    'POST_VALIDATION' as check_type,
    'whatsapp_to_appointment_pipeline' as check_name,
    COUNT(DISTINCT ch.id) as total_conversations,
    COUNT(DISTINCT a.id) as successful_appointments,
    CASE 
        WHEN COUNT(DISTINCT a.id) > 0 AND COUNT(DISTINCT ch.id) > 0 THEN
            ROUND(COUNT(DISTINCT a.id) * 100.0 / COUNT(DISTINCT ch.id), 2)
        ELSE 0
    END as conversion_rate_percent,
    CASE 
        WHEN COUNT(DISTINCT a.id) * 100.0 / NULLIF(COUNT(DISTINCT ch.id), 0) >= 60 THEN 'PASS'
        WHEN COUNT(DISTINCT ch.id) = 0 THEN 'PENDING_EXECUTION'
        ELSE 'FAIL'
    END as pipeline_status
FROM conversation_history ch
FULL OUTER JOIN appointments a ON ch.user_id = a.user_id 
    AND ch.tenant_id = a.tenant_id 
    AND ch.test_execution_id = a.test_execution_id
WHERE ch.test_execution_id = :test_exec_id OR a.test_execution_id = :test_exec_id;

-- ========================================
-- VALIDAÇÕES DE QUALIDADE CONVERSACIONAL  
-- ========================================

-- 8. Análise de intent detection por domínio
SELECT 
    'QUALITY_VALIDATION' as check_type,
    'intent_detection_accuracy' as check_name,
    t.domain::text as business_domain,
    ch.intent_detected,
    COUNT(*) as occurrences,
    ROUND(AVG(ch.confidence_score), 3) as avg_confidence,
    CASE 
        WHEN AVG(ch.confidence_score) >= 0.8 THEN 'PASS'
        WHEN AVG(ch.confidence_score) >= 0.6 THEN 'ACCEPTABLE'
        ELSE 'NEEDS_IMPROVEMENT'
    END as intent_quality
FROM tenants t
JOIN conversation_history ch ON t.id = ch.tenant_id 
WHERE t.test_execution_id = :test_exec_id
    AND ch.test_execution_id = :test_exec_id
    AND ch.intent_detected IS NOT NULL
GROUP BY t.domain, ch.intent_detected
ORDER BY t.domain, occurrences DESC;

-- 9. Análise de context extraction (dados JSONB)
SELECT 
    'QUALITY_VALIDATION' as check_type,
    'context_extraction_analysis' as check_name,
    t.domain::text as business_domain,
    COUNT(*) as total_interactions,
    COUNT(CASE WHEN ch.conversation_context ? 'service_requested' THEN 1 END) as service_extractions,
    COUNT(CASE WHEN ch.conversation_context ? 'preferred_date' THEN 1 END) as date_extractions,
    COUNT(CASE WHEN ch.conversation_context ? 'preferred_time' THEN 1 END) as time_extractions,
    ROUND(
        (COUNT(CASE WHEN ch.conversation_context ? 'service_requested' THEN 1 END) +
         COUNT(CASE WHEN ch.conversation_context ? 'preferred_date' THEN 1 END) +
         COUNT(CASE WHEN ch.conversation_context ? 'preferred_time' THEN 1 END)) * 100.0 / 
        (COUNT(*) * 3), 2
    ) as context_extraction_rate,
    CASE 
        WHEN (COUNT(CASE WHEN ch.conversation_context ? 'service_requested' THEN 1 END) +
              COUNT(CASE WHEN ch.conversation_context ? 'preferred_date' THEN 1 END) +
              COUNT(CASE WHEN ch.conversation_context ? 'preferred_time' THEN 1 END)) * 100.0 / 
             NULLIF(COUNT(*) * 3, 0) >= 70 THEN 'PASS'
        ELSE 'NEEDS_IMPROVEMENT'
    END as extraction_status
FROM tenants t
LEFT JOIN conversation_history ch ON t.id = ch.tenant_id AND ch.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.domain
ORDER BY context_extraction_rate DESC;

-- ========================================
-- VALIDAÇÕES DE CUSTOS E PERFORMANCE
-- ========================================

-- 10. Análise de custos AI por domínio (tabela real: usage_costs)
SELECT 
    'COST_VALIDATION' as check_type,
    'ai_cost_analysis_by_domain' as check_name,
    t.domain::text as business_domain,
    COALESCE(uc.conversations_count, 0) as conversations_processed,
    COALESCE(uc.ai_requests_count, 0) as ai_requests_made,
    COALESCE(uc.ai_tokens_used, 0) as total_tokens_consumed,
    ROUND(COALESCE(uc.ai_cost_usd, 0), 4) as total_ai_cost_usd,
    ROUND(COALESCE(uc.cost_per_conversation, 0), 4) as cost_per_conversation,
    CASE 
        WHEN COALESCE(uc.cost_per_conversation, 0) <= 0.15 THEN 'EXCELLENT'
        WHEN COALESCE(uc.cost_per_conversation, 0) <= 0.25 THEN 'GOOD'
        WHEN COALESCE(uc.cost_per_conversation, 0) <= 0.40 THEN 'ACCEPTABLE'
        ELSE 'HIGH_COST'
    END as cost_efficiency_status
FROM tenants t
LEFT JOIN usage_costs uc ON t.id = uc.tenant_id AND uc.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
ORDER BY uc.cost_per_conversation DESC NULLS LAST;

-- 11. Verificação de appointment timing e timezone (America/Sao_Paulo)
SELECT 
    'TIMEZONE_VALIDATION' as check_type,
    'appointment_timezone_consistency' as check_name,
    t.domain::text as business_domain,
    COUNT(a.id) as total_appointments,
    COUNT(CASE WHEN EXTRACT(timezone FROM a.start_time) = -10800 OR EXTRACT(timezone FROM a.start_time) = -7200 THEN 1 END) as correct_timezone_count,
    CASE 
        WHEN COUNT(CASE WHEN EXTRACT(timezone FROM a.start_time) = -10800 OR EXTRACT(timezone FROM a.start_time) = -7200 THEN 1 END) = COUNT(a.id) THEN 'PASS'
        WHEN COUNT(a.id) = 0 THEN 'PENDING_EXECUTION'
        ELSE 'FAIL'
    END as timezone_status,
    MIN(a.start_time) as earliest_appointment,
    MAX(a.start_time) as latest_appointment
FROM tenants t
LEFT JOIN appointments a ON t.id = a.tenant_id AND a.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.domain
ORDER BY t.domain;

-- ========================================
-- VALIDAÇÕES DE BUSINESS RULES
-- ========================================

-- 12. Verificar conformidade com horários de funcionamento (business_rules JSONB)
SELECT 
    'BUSINESS_VALIDATION' as check_type,
    'working_hours_compliance' as check_name,
    t.domain::text as business_domain,
    t.name as tenant_name,
    COUNT(a.id) as appointments_scheduled,
    -- Extrair horários de funcionamento do JSONB
    t.business_rules->'working_hours' as configured_working_hours,
    COUNT(CASE 
        WHEN EXTRACT(hour FROM a.start_time) BETWEEN 8 AND 18 THEN 1 
    END) as appointments_in_business_hours,
    CASE 
        WHEN COUNT(a.id) = 0 THEN 'PENDING_EXECUTION'
        WHEN COUNT(CASE WHEN EXTRACT(hour FROM a.start_time) BETWEEN 8 AND 18 THEN 1 END) = COUNT(a.id) THEN 'PASS'
        ELSE 'REVIEW_NEEDED'
    END as compliance_status
FROM tenants t
LEFT JOIN appointments a ON t.id = a.tenant_id AND a.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.id, t.domain, t.name, t.business_rules
ORDER BY t.domain;

-- 13. Validar subscription plans vs usage patterns
SELECT 
    'BUSINESS_VALIDATION' as check_type,
    'subscription_vs_usage_analysis' as check_name,
    t.subscription_plan,
    t.monthly_subscription_fee,
    COUNT(DISTINCT t.id) as tenants_count,
    COALESCE(SUM(uc.conversations_count), 0) as total_conversations,
    COALESCE(ROUND(AVG(uc.ai_cost_usd), 4), 0) as avg_ai_cost_per_tenant,
    CASE 
        WHEN t.subscription_plan = 'enterprise' AND AVG(uc.conversations_count) >= 100 THEN 'OPTIMAL_USAGE'
        WHEN t.subscription_plan = 'profissional' AND AVG(uc.conversations_count) >= 50 THEN 'OPTIMAL_USAGE'
        WHEN t.subscription_plan = 'standard' AND AVG(uc.conversations_count) >= 20 THEN 'OPTIMAL_USAGE'
        ELSE 'UNDERUTILIZED'
    END as usage_efficiency
FROM tenants t
LEFT JOIN usage_costs uc ON t.id = uc.tenant_id AND uc.test_execution_id = :test_exec_id
WHERE t.test_execution_id = :test_exec_id
GROUP BY t.subscription_plan, t.monthly_subscription_fee
ORDER BY t.monthly_subscription_fee DESC;

-- ========================================
-- MÉTRICAS DE SISTEMA E PERFORMANCE
-- ========================================

-- 14. Análise de appointment status distribution
SELECT 
    'SYSTEM_METRICS' as check_type,
    'appointment_status_distribution' as check_name,
    a.status::text as appointment_status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage,
    CASE 
        WHEN a.status IN ('confirmed', 'completed') THEN 'POSITIVE'
        WHEN a.status IN ('pending') THEN 'NEUTRAL'
        WHEN a.status IN ('cancelled', 'no_show') THEN 'NEGATIVE'
        ELSE 'OTHER'
    END as status_category
FROM appointments a
WHERE a.test_execution_id = :test_exec_id
GROUP BY a.status
ORDER BY count DESC;

-- 15. Performance de resposta por modelo AI (conversation_history)
SELECT 
    'SYSTEM_METRICS' as check_type,
    'ai_model_performance' as check_name,
    ch.model_used,
    COUNT(*) as interactions_count,
    ROUND(AVG(ch.tokens_used), 0) as avg_tokens_per_interaction,
    ROUND(AVG(ch.api_cost_usd), 6) as avg_cost_per_interaction,
    ROUND(SUM(ch.api_cost_usd), 4) as total_cost_usd,
    CASE 
        WHEN AVG(ch.api_cost_usd) <= 0.01 THEN 'COST_EFFICIENT'
        WHEN AVG(ch.api_cost_usd) <= 0.03 THEN 'MODERATE_COST'
        ELSE 'HIGH_COST'
    END as cost_efficiency_rating
FROM conversation_history ch
WHERE ch.test_execution_id = :test_exec_id
    AND ch.model_used IS NOT NULL
GROUP BY ch.model_used
ORDER BY total_cost_usd DESC;

-- ========================================
-- RESUMO EXECUTIVO DA SIMULAÇÃO
-- ========================================

-- 16. Dashboard executivo - resumo geral da simulação
SELECT 
    'EXECUTIVE_SUMMARY' as check_type,
    'production_simulation_summary' as check_name,
    :test_exec_id as test_execution_id,
    NOW() as report_generated_at,
    
    -- Tenants metrics
    (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :test_exec_id) as tenants_simulated,
    (SELECT COUNT(DISTINCT domain) FROM tenants WHERE test_execution_id = :test_exec_id) as business_domains_covered,
    
    -- Appointments metrics  
    (SELECT COUNT(*) FROM appointments WHERE test_execution_id = :test_exec_id) as total_appointments_created,
    (SELECT COUNT(DISTINCT user_id) FROM appointments WHERE test_execution_id = :test_exec_id) as unique_customers_served,
    
    -- Conversations metrics
    (SELECT COUNT(*) FROM conversation_history WHERE test_execution_id = :test_exec_id) as total_whatsapp_interactions,
    (SELECT COUNT(DISTINCT user_id) FROM conversation_history WHERE test_execution_id = :test_exec_id) as unique_whatsapp_users,
    
    -- Cost metrics
    (SELECT ROUND(SUM(api_cost_usd), 4) FROM conversation_history WHERE test_execution_id = :test_exec_id) as total_ai_cost_simulation,
    (SELECT ROUND(AVG(api_cost_usd), 6) FROM conversation_history WHERE test_execution_id = :test_exec_id) as avg_cost_per_whatsapp_interaction,
    
    -- Success metrics
    CASE 
        WHEN (SELECT COUNT(*) FROM appointments WHERE test_execution_id = :test_exec_id) > 0 
        AND (SELECT COUNT(*) FROM conversation_history WHERE test_execution_id = :test_exec_id) > 0
        THEN 'SIMULATION_SUCCESSFUL'
        ELSE 'SIMULATION_INCOMPLETE'
    END as overall_simulation_status;

-- ========================================
-- LIMPEZA CONTROLADA (OPCIONAL)  
-- ========================================

-- Query para limpeza dos dados de teste (comentada por segurança)
/*
-- CUIDADO: Execute apenas após validação completa dos resultados
DELETE FROM appointments WHERE test_execution_id = :test_exec_id;
DELETE FROM conversation_history WHERE test_execution_id = :test_exec_id;  
DELETE FROM usage_costs WHERE test_execution_id = :test_exec_id;
DELETE FROM user_tenants WHERE test_execution_id = :test_exec_id;
DELETE FROM services WHERE test_execution_id = :test_exec_id;
DELETE FROM professionals WHERE test_execution_id = :test_exec_id;
DELETE FROM service_categories WHERE test_execution_id = :test_exec_id;
DELETE FROM users WHERE test_execution_id = :test_exec_id;
DELETE FROM tenants WHERE test_execution_id = :test_exec_id;

SELECT 'TEST_DATA_CLEANED' as status, :test_exec_id as test_execution_id;
*/